-- Place search only finds places you could put an idea at (#77): your own,
-- public ones (a published idea there) and ones nobody owns. A private place
-- you can see because it's on a date you're on doesn't show up in search or
-- in "Is it one of these?".

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
  access_note text,
  public_ideas bigint
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
      case when i.q is null then 0 else public.word_similarity(i.q, v.name) end as sim
    from public.venues v
    cross join input i
    where
      (i.here is null
        or public.st_dwithin(v.coordinates, i.here, least(greatest(coalesce(p_radius_m, 80000), 10), 200000)))
      and (i.q is null
        -- (the typed text is matched literally: % and _ aren't wildcards)
        or v.name ilike '%' || replace(replace(replace(i.q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
        or public.word_similarity(i.q, v.name) > 0.4)
      -- Only places you could put an idea at (#77): yours, public ones, and
      -- ones nobody owns. Someone's private place you see on a shared date
      -- stays on that date, not in your search.
      and (v.created_by is null
        or v.created_by = (select auth.uid())
        or exists (select 1 from public.activities pa
                   where pa.venue_id = v.venue_id and pa.visibility = 'PUBLISHED'))
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
    m.access_note,
    -- Published ideas there: none means only you can see this place (#77)
    (select count(*) from public.activities a
      where a.venue_id = m.venue_id and a.visibility = 'PUBLISHED') as public_ideas
  from matched m
  -- Best name match first, then nearest
  order by m.sim desc, m.dist asc nulls last, m.name
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

revoke execute on function public.search_places(text, double precision, double precision, double precision, integer)
  from public, anon;
grant execute on function public.search_places(text, double precision, double precision, double precision, integer)
  to authenticated;
