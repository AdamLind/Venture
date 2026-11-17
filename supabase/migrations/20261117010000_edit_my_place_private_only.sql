-- =============================================================================
-- Edit a place you added: only while it's private (#6)
--
-- Once any idea at a place is published, the place is public: changes go
-- through community suggestions, its owner, or a moderator (#10, #73), not
-- just the person who added it. update_my_place() now also refuses when
-- any idea there (yours included) is published. Same function otherwise.
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
    where venue_id = p_venue_id and visibility = 'PUBLISHED'
  ) then
    raise exception 'This place is public now, so changes are suggested and checked first'
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

  update public.venues
  set name             = coalesce(v_name, name),
      access_note      = v_note,
      opening_hours    = v_hours,
      hours_checked_at = case when v_hours is null then null else now() end
  where venue_id = p_venue_id;
end;
$$;
