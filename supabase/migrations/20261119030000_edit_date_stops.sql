-- =============================================================================
-- Editing a planned date's stops (#36): replace one, or remove one
--
-- edit_itinerary_stops saves a planned date's stops as the app laid them out
-- again (the builder's timeline): each item is an existing stop (stop_id) or
-- a new one (activity_id), in order, with its times. Existing stops left out
-- are removed; their comments move to the whole date (stop_id set null).
-- Owner and editors only, before the date starts (a live date has its own
-- reorder and skip).
-- =============================================================================

create or replace function public.edit_itinerary_stops(
  p_itinerary_id bigint,
  p_stops        jsonb,
  p_ends_at      timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status   text;
  v_starts   timestamptz;
  v_rec      record;
  v_stop     bigint;
  v_activity bigint;
  v_kept     bigint[] := '{}';
  v_ideas    bigint[] := '{}';
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not private.can_edit_itinerary(p_itinerary_id) then
    raise exception 'Only the date''s owner or editors can change it' using errcode = '42501';
  end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' or jsonb_array_length(p_stops) = 0 then
    raise exception 'A date needs at least one stop' using errcode = 'check_violation';
  end if;

  select status, starts_at into v_status, v_starts
  from public.itineraries where itinerary_id = p_itinerary_id for update;
  if v_status <> 'PLANNED' then
    raise exception 'This date has started. Change it from the live date instead.' using errcode = '22023';
  end if;

  -- Check every item first: existing stops of this date, or ideas you can plan with
  for v_rec in
    select s.value as stop from jsonb_array_elements(p_stops) as s(value)
  loop
    v_stop := (v_rec.stop ->> 'stop_id')::bigint;
    v_activity := (v_rec.stop ->> 'activity_id')::bigint;
    if v_stop is not null then
      select activity_id into v_activity from public.itinerary_activities
      where stop_id = v_stop and itinerary_id = p_itinerary_id;
      if v_activity is null or v_stop = any(v_kept) then
        raise exception 'This date changed since you opened it. Reopen it and try again.' using errcode = '40001';
      end if;
      v_kept := v_kept || v_stop;
    elsif v_activity is not null then
      if not exists (
        select 1 from public.activities a
        where a.idea_id = v_activity
          and (a.visibility = 'PUBLISHED' or a.user_id = auth.uid())
      ) then
        raise exception 'That idea isn''t available' using errcode = 'P0002';
      end if;
    else
      raise exception 'Each stop needs a stop or an idea' using errcode = 'check_violation';
    end if;
    if v_activity = any(v_ideas) then
      raise exception 'That idea is already on this date' using errcode = '22023';
    end if;
    v_ideas := v_ideas || v_activity;
  end loop;

  -- Removed stops (their comments move to the whole date)
  delete from public.itinerary_activities
  where itinerary_id = p_itinerary_id and not (stop_id = any(v_kept));

  -- Kept and new stops, in their new order and times
  for v_rec in
    select s.value as stop, s.ordinality as pos
    from jsonb_array_elements(p_stops) with ordinality as s(value, ordinality)
  loop
    v_stop := (v_rec.stop ->> 'stop_id')::bigint;
    if v_stop is not null then
      update public.itinerary_activities
      set sort_order = v_rec.pos,
          starts_at  = (v_rec.stop ->> 'starts_at')::timestamptz,
          ends_at    = (v_rec.stop ->> 'ends_at')::timestamptz
      where stop_id = v_stop;
    else
      insert into public.itinerary_activities (itinerary_id, activity_id, sort_order, starts_at, ends_at)
      values (
        p_itinerary_id,
        (v_rec.stop ->> 'activity_id')::bigint,
        v_rec.pos,
        (v_rec.stop ->> 'starts_at')::timestamptz,
        (v_rec.stop ->> 'ends_at')::timestamptz
      );
    end if;
  end loop;

  -- The date ends when its last stop (and the trip home) does
  if p_ends_at is not null and p_ends_at > v_starts then
    update public.itineraries set ends_at = p_ends_at where itinerary_id = p_itinerary_id;
  end if;
end;
$$;

revoke execute on function public.edit_itinerary_stops(bigint, jsonb, timestamptz) from public, anon;
grant execute on function public.edit_itinerary_stops(bigint, jsonb, timestamptz) to authenticated;
