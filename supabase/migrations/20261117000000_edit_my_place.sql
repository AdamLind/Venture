-- =============================================================================
-- Edit a place you added (#6)
--
-- Places are shared, so nobody edits them directly (there's no update
-- policy on venues). update_my_place() lets the person who added a place
-- change its name, how-to-get-there note and opening hours, while only
-- their own ideas use it. Once someone else's idea is there, changes go
-- through suggestions a moderator checks (#10).
--
--   p_opening_hours  OpenStreetMap format; empty = not sure
--                    (hours_checked_at is set to now when given)
--
-- Additive only (a new function).
-- =============================================================================

create or replace function public.update_my_place(
  p_venue_id      uuid,
  p_name          text,
  p_access_note   text,
  p_opening_hours text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name  text := nullif(trim(coalesce(p_name, '')), '');
  v_note  text := nullif(trim(coalesce(p_access_note, '')), '');
  v_hours text := nullif(trim(coalesce(p_opening_hours, '')), '');
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.venues
    where venue_id = p_venue_id and created_by = auth.uid()
  ) then
    raise exception 'Only the person who added this place can change it'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.activities
    where venue_id = p_venue_id and user_id is distinct from auth.uid()
  ) then
    raise exception 'Other people''s ideas use this place now, so it can''t be changed directly'
      using errcode = '42501';
  end if;

  if v_name is not null and char_length(v_name) > 120 then
    raise exception 'That name is too long' using errcode = 'check_violation';
  end if;

  -- (the note's and hours' own limits are checked by the table)
  update public.venues
  set name             = coalesce(v_name, name),
      access_note      = v_note,
      opening_hours    = v_hours,
      hours_checked_at = case when v_hours is null then null else now() end
  where venue_id = p_venue_id;
end;
$$;

revoke execute on function public.update_my_place(uuid, text, text, text) from public, anon;
grant execute on function public.update_my_place(uuid, text, text, text) to authenticated;
