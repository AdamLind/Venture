-- =============================================================================
-- Admins edit the app's own places in the app
--
-- Places the launch import adds have no owner (venues.created_by is null:
-- "listed" places), so nobody could change them: update_my_place() is only
-- for the person who added a place. Admins fix them in the app instead, from
-- the idea page: name, address, pin, how to get there, and hours.
--
-- 1. admin_update_place(): admins only, listed places only (people's own
--    places stay theirs: their pins can be private, #77). Hours typed here
--    are community hours (the hours-source trigger), like any typed in
-- 2. Each edit is logged (EDIT_PLACE, with the place's values before and
--    after), so it can be traced and undone. moderation_actions gains a
--    venue_id for it
--
-- (The import keeps an idea's place when the file's pin is still near it,
-- so a rename or a moved pin here isn't undone by the next import.)
-- =============================================================================

-- 1. The log: which place ------------------------------------------------------
alter table public.moderation_actions
  add column if not exists venue_id uuid references public.venues (venue_id) on delete set null;

create index if not exists moderation_actions_venue_idx on public.moderation_actions (venue_id);

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'APPROVE', 'REQUEST_CHANGES', 'REJECT',
  'RESOLVE_REPORTS', 'DISMISS_REPORTS',
  'ADD_STAFF', 'CHANGE_STAFF', 'REMOVE_STAFF',
  'AUTO_HOLD',
  'SUSPEND', 'UNSUSPEND',
  'REMOVE_PHOTO', 'RESET_USERNAME', 'REMOVE_NAME', 'RESOLVE_PERSON_REPORTS', 'DISMISS_PERSON_REPORTS',
  'EDIT_PLACE'
));

comment on column public.moderation_actions.venue_id is 'The place an EDIT_PLACE changed';

-- 2. Editing ---------------------------------------------------------------------
create or replace function public.admin_update_place(
  p_venue_id      uuid,
  p_name          text,
  p_address       text,
  p_access_note   text,
  p_opening_hours text,
  p_latitude      double precision,
  p_longitude     double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name    text := nullif(trim(coalesce(p_name, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_note    text := nullif(trim(coalesce(p_access_note, '')), '');
  v_hours   text := nullif(trim(coalesce(p_opening_hours, '')), '');
  v_before  jsonb;
  v_after   jsonb;
begin
  if not private.is_admin() then
    raise exception 'Only admins can change this place' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'name', v.name,
           'address', v.address,
           'access_note', v.access_note,
           'opening_hours', v.opening_hours,
           'latitude', round(public.st_y(v.coordinates::public.geometry)::numeric, 7),
           'longitude', round(public.st_x(v.coordinates::public.geometry)::numeric, 7)
         )
    into v_before
    from public.venues v
   where v.venue_id = p_venue_id and v.created_by is null;

  if v_before is null then
    raise exception 'Only the app''s own places (no one''s pin) can be changed here' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'The place needs a name' using errcode = 'check_violation';
  end if;
  if char_length(v_name) > 120 then
    raise exception 'That name is too long' using errcode = 'check_violation';
  end if;
  if v_address is not null and char_length(v_address) > 200 then
    raise exception 'That address is too long' using errcode = 'check_violation';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'That pin isn''t on the map' using errcode = 'check_violation';
  end if;

  -- (the note's and hours' own limits are checked by the table; changed
  -- hours count as checked now)
  update public.venues
     set name             = v_name,
         address          = v_address,
         access_note      = v_note,
         opening_hours    = v_hours,
         hours_checked_at = case
                              when v_hours is null then null
                              when v_hours is distinct from opening_hours then now()
                              else hours_checked_at
                            end,
         coordinates      = public.st_setsrid(public.st_makepoint(p_longitude, p_latitude), 4326)::public.geography
   where venue_id = p_venue_id;

  v_after := jsonb_build_object(
    'name', v_name, 'address', v_address, 'access_note', v_note, 'opening_hours', v_hours,
    'latitude', round(p_latitude::numeric, 7), 'longitude', round(p_longitude::numeric, 7)
  );

  if v_after is distinct from v_before then
    insert into public.moderation_actions (action, venue_id, detail)
    values ('EDIT_PLACE', p_venue_id, jsonb_build_object('before', v_before, 'after', v_after));
  end if;
end;
$$;

revoke execute on function public.admin_update_place(uuid, text, text, text, text, double precision, double precision)
  from public, anon;
grant execute on function public.admin_update_place(uuid, text, text, text, text, double precision, double precision)
  to authenticated;
