-- =============================================================================
-- Where a date starts, to about 100 m (#90)
--
-- Everyone on a date can see its plan inputs (itineraries.prefs_snapshot),
-- and where it starts is often the phone's exact location at home. They
-- need it: their timeline (and the live view) lays out travel from it. But
-- not to the house: like re-plan locations (utils/replan.ts), it's kept to
-- 3 decimal places, about 100 m, which leaves travel times as they were
-- (they're rounded up to 15-minute blocks). The home area was already
-- rounded to about 1 km when it's saved.
-- Past dates drop these altogether (20261122060000).
-- =============================================================================

-- {latitude, longitude} to 3 decimal places; anything else as it is
create or replace function private.round_point(p_point jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_point) = 'object'
     and jsonb_typeof(p_point -> 'latitude') = 'number'
     and jsonb_typeof(p_point -> 'longitude') = 'number'
    then p_point || jsonb_build_object(
      'latitude', round((p_point ->> 'latitude')::numeric, 3),
      'longitude', round((p_point ->> 'longitude')::numeric, 3)
    )
    else p_point
  end;
$$;

revoke execute on function private.round_point(jsonb) from public, anon, authenticated;

-- The snapshot with its start, home and fixed home rounded
create or replace function private.with_rough_locations(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_snapshot) is distinct from 'object' then p_snapshot
    else p_snapshot || coalesce(
      (select jsonb_object_agg(k, private.round_point(p_snapshot -> k))
       from unnest(array['currentLocation', 'homeLocation', 'fixedHome']) as k
       where p_snapshot ? k),
      '{}'::jsonb
    )
  end;
$$;

revoke execute on function private.with_rough_locations(jsonb) from public, anon, authenticated;

create or replace function private.round_date_locations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.prefs_snapshot := private.with_rough_locations(new.prefs_snapshot);
  return new;
end;
$$;

revoke execute on function private.round_date_locations() from public, anon, authenticated;

drop trigger if exists itineraries_round_locations on public.itineraries;
create trigger itineraries_round_locations
  before insert or update of prefs_snapshot on public.itineraries
  for each row
  execute function private.round_date_locations();

-- Dates already saved
update public.itineraries
set prefs_snapshot = private.with_rough_locations(prefs_snapshot)
where prefs_snapshot is distinct from private.with_rough_locations(prefs_snapshot);
