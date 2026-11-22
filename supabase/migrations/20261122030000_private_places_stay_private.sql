-- Private places stay private (#77).
--
-- 1. Nobody can put an idea at someone else's private place. People on a
--    date see the private places on it (they're going there), but posting
--    their own idea there would keep it visible after they leave the date,
--    and publishing it would make someone else's hidden gem public.
--    Allowed: your own places, places with a published idea, and places
--    with no owner (seed data and listed places).
--
-- 2. place_goes_public(): whether publishing this idea would put the
--    caller's own place on the map for the first time (for the warning in
--    the publisher). Only answers for the caller's own places.

create or replace function private.check_idea_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  if new.venue_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.venue_id is not distinct from old.venue_id then
    return new;
  end if;
  -- The server itself (seeding, migrations): no signed-in person
  if (select auth.uid()) is null then
    return new;
  end if;

  select v.created_by into owner from public.venues v where v.venue_id = new.venue_id;
  if not found then
    return new; -- the foreign key reports it
  end if;

  if owner is null
     or owner = (select auth.uid())
     or exists (
       select 1 from public.activities a
       where a.venue_id = new.venue_id
         and a.visibility = 'PUBLISHED'
         and a.idea_id is distinct from new.idea_id
     ) then
    return new;
  end if;

  raise exception 'That place is private to the person who added it. Pick another place or add your own.'
    using errcode = '42501';
end;
$$;

drop trigger if exists activities_check_place on public.activities;
create trigger activities_check_place
  before insert or update of venue_id on public.activities
  for each row execute function private.check_idea_place();

create or replace function public.place_goes_public(p_venue_id uuid, p_except_idea_id bigint default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.venues v
    where v.venue_id = p_venue_id
      and v.created_by = (select auth.uid())
      and not exists (
        select 1 from public.activities a
        where a.venue_id = v.venue_id
          and a.visibility = 'PUBLISHED'
          and a.idea_id is distinct from p_except_idea_id
      )
  );
$$;

revoke execute on function public.place_goes_public(uuid, bigint) from public, anon;
grant execute on function public.place_goes_public(uuid, bigint) to authenticated;
