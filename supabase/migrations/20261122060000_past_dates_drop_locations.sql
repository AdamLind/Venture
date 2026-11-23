-- =============================================================================
-- Past dates drop exact locations (#90)
--
-- A saved date keeps its plan inputs (itineraries.prefs_snapshot), and those
-- include where the plan started (often the phone's location at the time,
-- often home), the home area, and where each mid-date re-plan started. The
-- app needs them while the date is coming up or happening (travel to the
-- first stop, the trip home, re-planning). Once it's over, nothing uses
-- them: the date's page shows the saved stop times, not a rebuilt timeline.
-- So they're removed:
-- 1. as soon as a date is finished or cancelled (a trigger), and
-- 2. from any date that ended over two days ago without anyone marking it
--    finished (an hourly job; the app usually finishes them two hours
--    after they end).
-- Everything else in the snapshot (times, budget, vibes, ...) stays.
-- =============================================================================


-- The snapshot without its locations: currentLocation, homeLocation,
-- fixedHome, and each re-plan's location
create or replace function private.without_locations(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' then p_snapshot
    else (p_snapshot - 'currentLocation' - 'homeLocation' - 'fixedHome')
      || case
           when jsonb_typeof(p_snapshot -> 'replans') = 'array' then jsonb_build_object(
             'replans',
             coalesce(
               (select jsonb_agg(case when jsonb_typeof(r) = 'object' then r - 'location' else r end order by n)
                from jsonb_array_elements(p_snapshot -> 'replans') with ordinality as e(r, n)),
               '[]'::jsonb
             )
           )
           else '{}'::jsonb
         end
  end;
$$;

revoke execute on function private.without_locations(jsonb) from public, anon, authenticated;

-- Whether a snapshot still has any of them
create or replace function private.has_locations(p_snapshot jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_snapshot is not null and private.without_locations(p_snapshot) is distinct from p_snapshot;
$$;

revoke execute on function private.has_locations(jsonb) from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 1. Finished or cancelled: drop them now (and keep them out after)
-- -----------------------------------------------------------------------------
create or replace function private.drop_past_date_locations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('COMPLETED', 'CANCELLED') and private.has_locations(new.prefs_snapshot) then
    new.prefs_snapshot := private.without_locations(new.prefs_snapshot);
  end if;
  return new;
end;
$$;

revoke execute on function private.drop_past_date_locations() from public, anon, authenticated;

drop trigger if exists itineraries_drop_past_locations on public.itineraries;
create trigger itineraries_drop_past_locations
  before update of status, prefs_snapshot on public.itineraries
  for each row
  execute function private.drop_past_date_locations();


-- -----------------------------------------------------------------------------
-- 2. Ended over two days ago, never finished: an hourly job
-- -----------------------------------------------------------------------------
create or replace function private.drop_stale_date_locations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.itineraries
  set prefs_snapshot = private.without_locations(prefs_snapshot)
  where ends_at < now() - interval '2 days'
    and private.has_locations(prefs_snapshot);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function private.drop_stale_date_locations() from public, anon, authenticated;

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'past-dates-drop-locations';
select cron.schedule('past-dates-drop-locations', '17 * * * *', 'select private.drop_stale_date_locations()');


-- -----------------------------------------------------------------------------
-- 3. Dates that are already over
-- -----------------------------------------------------------------------------
update public.itineraries
set prefs_snapshot = private.without_locations(prefs_snapshot)
where status in ('COMPLETED', 'CANCELLED')
  and private.has_locations(prefs_snapshot);

select private.drop_stale_date_locations();
