-- =============================================================================
-- Finding and adding places when posting an idea (#78)
--
-- search_places(): places on Venture by name and / or near a point, for the
-- idea form's "Where is it?" and the "Is it one of these?" check before
-- adding a new place. Runs as the caller (security invoker), so it only
-- ever finds places the caller may see (#77: places they added, or with an
-- idea they can see). Nobody's private pins show up in anyone else's
-- search.
--
--   p_query     part of the name ("quarry"); empty = any name
--   p_lat/lng   near here (nearest first); empty = anywhere
--   p_radius_m  how far to look (capped at 200 km)
--   p_limit     how many (capped at 50)
--
-- venues.access_note: how to get there, for places that aren't on any map
-- ("park at the dirt pullout; the trail starts behind the green gate").
--
-- Additive only.
-- =============================================================================

alter table public.venues
  add column if not exists access_note text
    check (access_note is null or char_length(access_note) between 1 and 300);

create or replace function public.search_places(
  p_query    text default null,
  p_lat      double precision default null,
  p_lng      double precision default null,
  p_radius_m double precision default 80000,
  p_limit    integer default 20
)
returns table (
  venue_id    uuid,
  name        text,
  address     text,
  latitude    double precision,
  longitude   double precision,
  distance_m  double precision,
  ideas       bigint,
  added_by_me boolean,
  access_note text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select
      nullif(trim(coalesce(p_query, '')), '') as q,
      case
        when p_lat is null or p_lng is null then null
        else public.st_setsrid(public.st_makepoint(p_lng, p_lat), 4326)::public.geography
      end as here
  ),
  matched as (
    select
      v.*,
      i.q,
      case when i.here is null then null else public.st_distance(v.coordinates, i.here) end as dist,
      case when i.q is null then 0 else public.similarity(v.name, i.q) end as sim
    from public.venues v
    cross join input i
    where
      (i.here is null
        or public.st_dwithin(v.coordinates, i.here, least(greatest(coalesce(p_radius_m, 80000), 10), 200000)))
      and (i.q is null
        -- (the typed text is matched literally: % and _ aren't wildcards)
        or v.name ilike '%' || replace(replace(replace(i.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or public.similarity(v.name, i.q) > 0.3)
  )
  select
    m.venue_id,
    m.name,
    m.address,
    public.st_y(m.coordinates::public.geometry) as latitude,
    public.st_x(m.coordinates::public.geometry) as longitude,
    m.dist as distance_m,
    (select count(*) from public.activities a where a.venue_id = m.venue_id) as ideas,
    coalesce(m.created_by = (select auth.uid()), false) as added_by_me,
    m.access_note
  from matched m
  -- Best name match first, then nearest
  order by m.sim desc, m.dist asc nulls last, m.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke execute on function public.search_places(text, double precision, double precision, double precision, integer)
  from public, anon;
grant execute on function public.search_places(text, double precision, double precision, double precision, integer)
  to authenticated;
