-- =============================================================================
-- Explore, a page at a time
--
-- Explore loaded every idea it could show in one request and sorted it out on
-- the phone. These do that work here, so the app asks for one page:
--
-- 1. explore_ideas(): the list. What you may see (published ideas, plus your
--    own except rejected ones), minus ideas you hid ("Not interested") and
--    people you blocked; go-out ideas within reach (60 mi of you or your home
--    area, as utils/reach.ts: AREA_MILES), stay-in ideas and place-less ideas
--    anywhere, your own always. In a shuffled order fixed by a seed, so every
--    page of one shuffle follows on from the last (pull-to-refresh picks a
--    new seed). Returns activities rows, so the app still embeds venues,
--    tags and the creator.
-- 2. explore_reach(): whether there are places to go at all, and any within
--    reach ("Nothing near you yet").
-- 3. map_ideas(): the map's places inside the area on screen, nearest to its
--    middle first, at most p_limit (the map no longer needs every idea).
--
-- Invoker functions: the tables' own rules (RLS) apply as well.
-- =============================================================================

/** What you may see in Explore, minus what you hid and who you blocked */
create or replace function private.explore_visible(a public.activities)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    ((a.visibility = 'PUBLISHED' and a.held_at is null)
      or (a.user_id = (select auth.uid()) and a.visibility <> 'REJECTED'))
    and not exists (
      select 1 from public.hidden_ideas h
      where h.user_id = (select auth.uid()) and h.idea_id = a.idea_id
    )
    and not exists (
      select 1 from public.blocked_users b
      where b.user_id = (select auth.uid()) and b.blocked_id = a.user_id
    );
$$;

/** A point for distances (null without both numbers) */
create or replace function private.explore_point(p_lat double precision, p_lng double precision)
returns public.geography
language sql
immutable
set search_path = ''
as $$
  select case
    when p_lat is null or p_lng is null then null
    else public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography
  end;
$$;

/** Within reach of you or your home area (no center known: everything is) */
create or replace function private.explore_in_reach(
  p_place public.geography, p_here public.geography, p_home public.geography
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- 60 mi (utils/reach.ts: AREA_MILES) in meters
  select p_place is null
      or (p_here is null and p_home is null)
      or (p_here is not null and public.st_dwithin(p_place, p_here, 96560.64))
      or (p_home is not null and public.st_dwithin(p_place, p_home, 96560.64));
$$;

-- 1. The list -------------------------------------------------------------------
create or replace function public.explore_ideas(
  p_seed     bigint,
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_home_lat double precision default null,
  p_home_lng double precision default null,
  p_limit    integer default 20,
  p_offset   integer default 0
)
returns setof public.activities
language sql
stable
set search_path = ''
as $$
  select a.*
  from public.activities a
  left join public.venues v on v.venue_id = a.venue_id
  where private.explore_visible(a)
    and (
      a.user_id = (select auth.uid())
      or a.modality = 'STAY_IN'
      or private.explore_in_reach(
           v.coordinates,
           private.explore_point(p_lat, p_lng),
           private.explore_point(p_home_lat, p_home_lng))
    )
  order by md5(p_seed::text || ':' || a.idea_id::text), a.idea_id
  -- (200: coming back to the tab reloads every page you'd scrolled through)
  limit least(greatest(coalesce(p_limit, 20), 1), 200)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- 2. Places to go, near and anywhere ---------------------------------------------
create or replace function public.explore_reach(
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_home_lat double precision default null,
  p_home_lng double precision default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'anywhere', exists (
      select 1 from public.activities a
      where a.modality = 'GO_OUT' and private.explore_visible(a)
    ),
    'near', exists (
      select 1
      from public.activities a
      left join public.venues v on v.venue_id = a.venue_id
      where a.modality = 'GO_OUT'
        and private.explore_visible(a)
        and private.explore_in_reach(
              v.coordinates,
              private.explore_point(p_lat, p_lng),
              private.explore_point(p_home_lat, p_home_lng))
    )
  );
$$;

-- 3. The map's places --------------------------------------------------------------
create or replace function public.map_ideas(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_limit   integer default 300
)
returns setof public.activities
language sql
stable
set search_path = ''
as $$
  select a.*
  from public.activities a
  join public.venues v on v.venue_id = a.venue_id
  where a.modality = 'GO_OUT'
    and private.explore_visible(a)
    -- (named in full: these functions run with an empty search path)
    and public.st_intersects(
          v.coordinates::public.geometry,
          public.st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326))
  order by public.st_distance(
             v.coordinates,
             private.explore_point((p_min_lat + p_max_lat) / 2, (p_min_lng + p_max_lng) / 2)),
           a.idea_id
  limit least(greatest(coalesce(p_limit, 300), 1), 500);
$$;

revoke execute on function private.explore_visible(public.activities) from public, anon;
grant execute on function private.explore_visible(public.activities) to authenticated;
revoke execute on function private.explore_point(double precision, double precision) from public, anon;
grant execute on function private.explore_point(double precision, double precision) to authenticated;
revoke execute on function private.explore_in_reach(public.geography, public.geography, public.geography) from public, anon;
grant execute on function private.explore_in_reach(public.geography, public.geography, public.geography) to authenticated;

revoke execute on function public.explore_ideas(bigint, double precision, double precision, double precision, double precision, integer, integer) from public, anon;
grant execute on function public.explore_ideas(bigint, double precision, double precision, double precision, double precision, integer, integer) to authenticated;
revoke execute on function public.explore_reach(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public.explore_reach(double precision, double precision, double precision, double precision) to authenticated;
revoke execute on function public.map_ideas(double precision, double precision, double precision, double precision, integer) from public, anon;
grant execute on function public.map_ideas(double precision, double precision, double precision, double precision, integer) to authenticated;
