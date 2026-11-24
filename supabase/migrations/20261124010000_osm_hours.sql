-- =============================================================================
-- Opening hours from OpenStreetMap (#5)
--
-- A job (mobile-client/scripts/osm-hours.js, run daily by GitHub Actions)
-- matches each public place to its OpenStreetMap entry once (by distance
-- and name), then keeps its hours up to date from it. Private places are
-- never looked up: their pins don't leave Venture (#77).
--
--   osm_id          the matched entry, e.g. "node/123" or "way/456"
--   osm_checked_at  when the job last looked (matched or not), so places
--                   are looked up again about monthly, not every run
--   hours_source    where opening_hours came from:
--                     osm        OpenStreetMap (the app credits it)
--                     community  typed in Venture (the poster, later
--                                reviewed fixes, #10)
--                     owner      a verified business owner (#73): the job
--                                never replaces these
--                   null when there are no hours
--
-- Which wins (decided on #5): an owner, then OpenStreetMap, then community
-- hours; but community hours checked after the OpenStreetMap entry was last
-- edited win over it ("they changed their hours last month"). The job
-- applies that; this migration only records the source.
-- =============================================================================

alter table public.venues
  add column if not exists osm_id text
    check (osm_id is null or osm_id ~ '^(node|way|relation)/[0-9]+$'),
  add column if not exists osm_checked_at timestamptz,
  add column if not exists hours_source text
    check (hours_source is null or hours_source in ('osm', 'community', 'owner'));

comment on column public.venues.osm_id is 'Matched OpenStreetMap entry ("node/123"), for its hours (#5)';
comment on column public.venues.osm_checked_at is 'When the OpenStreetMap job last looked this place up';
comment on column public.venues.hours_source is 'Where opening_hours came from: osm, community or owner';

-- Hours already in Venture were typed in (by posters, or the seed data)
update public.venues
set hours_source = 'community'
where opening_hours is not null and hours_source is null;

-- Hours typed in the app are community hours, and only the server (the
-- job, with the secret key: no signed-in person) says otherwise or touches
-- the OpenStreetMap match. So someone adding or editing their own place
-- can't claim to be an owner or point it at another entry
create or replace function private.label_hours_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  person boolean := (select auth.uid()) is not null;
begin
  if person then
    if tg_op = 'INSERT' then
      new.osm_id := null;
      new.osm_checked_at := null;
      new.hours_source := case when new.opening_hours is null then null else 'community' end;
    else
      new.osm_id := old.osm_id;
      new.osm_checked_at := old.osm_checked_at;
      new.hours_source := case
        when new.opening_hours is null then null
        when new.opening_hours is distinct from old.opening_hours then 'community'
        else old.hours_source
      end;
    end if;
    return new;
  end if;

  -- The server: whatever it sets, but never a source without hours
  if new.opening_hours is null then
    new.hours_source := null;
  elsif tg_op = 'INSERT' then
    new.hours_source := coalesce(new.hours_source, 'community');
  elsif new.opening_hours is distinct from old.opening_hours
        and new.hours_source is not distinct from old.hours_source then
    new.hours_source := 'community';
  end if;
  return new;
end;
$$;

drop trigger if exists venues_label_hours_source on public.venues;
create trigger venues_label_hours_source
  before insert or update on public.venues
  for each row execute function private.label_hours_source();
