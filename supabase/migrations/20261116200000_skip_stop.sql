-- =============================================================================
-- Skip a stop on a live date (#9)
--
-- skip_stop(): removes one stop (it's closed, or you'd rather not) and saves
-- the rest of the date's new times, in one transaction, like
-- replan_itinerary() (#63):
--
--   p_stop_id  the stop to skip (removed from the date)
--   p_stops    every other stop, in order, with its new times:
--              [{ "stop_id": 41, "starts_at": "...", "ends_at": "..." }, ...]
--              (all of them, so a stale copy of the date can't save)
--   p_replans  where the date was re-planned from (prefs_snapshot.replans)
--   p_ends_at  when the date now ends
--
-- Owners and editors only (same rule as removing stops). A date keeps at
-- least one stop: skipping the last one means ending the date instead.
-- Additive only (a new function).
-- =============================================================================

create or replace function public.skip_stop(
  p_itinerary_id bigint,
  p_stop_id      bigint,
  p_stops        jsonb,
  p_replans      jsonb,
  p_ends_at      timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stored integer;
  v_given  integer;
  v_rec    record;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if not private.can_edit_itinerary(p_itinerary_id) then
    raise exception 'Only the date''s owner or editors can change it'
      using errcode = '42501';
  end if;

  if p_stops is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception 'Stops must be a list' using errcode = 'check_violation';
  end if;

  if p_replans is not null and jsonb_typeof(p_replans) <> 'array' then
    raise exception 'Re-plans must be a list' using errcode = 'check_violation';
  end if;

  if not exists (
    select 1 from public.itinerary_activities
    where itinerary_id = p_itinerary_id and stop_id = p_stop_id
  ) then
    raise exception 'This date changed since you opened it. Reopen it and try again.'
      using errcode = '40001';
  end if;

  -- The other stops, as stored: each once, all of them, none from elsewhere
  select count(*) into v_stored
  from public.itinerary_activities
  where itinerary_id = p_itinerary_id and stop_id <> p_stop_id;

  if v_stored = 0 then
    raise exception 'That''s the last stop. End the date instead.'
      using errcode = 'check_violation';
  end if;

  select count(distinct ia.stop_id) into v_given
  from jsonb_array_elements(p_stops) e
  join public.itinerary_activities ia
    on ia.stop_id = (e ->> 'stop_id')::bigint
   and ia.itinerary_id = p_itinerary_id
   and ia.stop_id <> p_stop_id;

  if v_given <> v_stored or jsonb_array_length(p_stops) <> v_stored then
    raise exception 'This date changed since you opened it. Reopen it and try again.'
      using errcode = '40001';
  end if;

  delete from public.itinerary_activities
  where itinerary_id = p_itinerary_id and stop_id = p_stop_id;

  -- (the order is unique per date at the end of the transaction)
  for v_rec in
    select s.value as stop, s.ordinality as pos
    from jsonb_array_elements(p_stops) with ordinality as s(value, ordinality)
  loop
    update public.itinerary_activities
    set sort_order = v_rec.pos,
        starts_at  = (v_rec.stop ->> 'starts_at')::timestamptz,
        ends_at    = (v_rec.stop ->> 'ends_at')::timestamptz
    where itinerary_id = p_itinerary_id
      and stop_id = (v_rec.stop ->> 'stop_id')::bigint;
  end loop;

  update public.itineraries
  set prefs_snapshot = jsonb_set(
        coalesce(prefs_snapshot, '{}'::jsonb),
        '{replans}',
        coalesce(p_replans, '[]'::jsonb)
      ),
      ends_at = coalesce(p_ends_at, ends_at)
  where itinerary_id = p_itinerary_id;
end;
$$;

revoke execute on function public.skip_stop(bigint, bigint, jsonb, jsonb, timestamptz)
  from public, anon;
grant execute on function public.skip_stop(bigint, bigint, jsonb, jsonb, timestamptz)
  to authenticated;
