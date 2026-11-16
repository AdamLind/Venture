-- =============================================================================
-- Reorder the rest of a live date (#63)
--
-- replan_itinerary(): save a date's stops in a new order with new times, in
-- one transaction (each stop's sort_order is unique per date, checked at the
-- end of the transaction, so a swap can't be saved one row at a time).
--
--   p_stops    every stop of the date, in the new order:
--              [{ "stop_id": 41, "starts_at": "...", "ends_at": "..." }, ...]
--              (all of them, so a stale copy of the date can't save: if the
--              stops don't match what's stored, nothing changes)
--   p_replans  where the date was re-planned from, kept in prefs_snapshot so
--              the timeline rebuilds the same way on any device:
--              [{ "kept": 2, "startDate": "...", "location": {lat, lng} }]
--   p_ends_at  when the date now ends (it only ever moves later)
--
-- Owners and editors only (same rule as editing stops). Additive only.
-- =============================================================================

create or replace function public.replan_itinerary(
  p_itinerary_id bigint,
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

  -- The same stops as stored: each once, all of them, none from elsewhere
  select count(*) into v_stored
  from public.itinerary_activities
  where itinerary_id = p_itinerary_id;

  select count(distinct ia.stop_id) into v_given
  from jsonb_array_elements(p_stops) e
  join public.itinerary_activities ia
    on ia.stop_id = (e ->> 'stop_id')::bigint
   and ia.itinerary_id = p_itinerary_id;

  if v_given <> v_stored or jsonb_array_length(p_stops) <> v_stored then
    raise exception 'This date changed since you opened it. Reopen it and try again.'
      using errcode = '40001';
  end if;

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
      ends_at = greatest(ends_at, coalesce(p_ends_at, ends_at))
  where itinerary_id = p_itinerary_id;
end;
$$;

revoke execute on function public.replan_itinerary(bigint, jsonb, jsonb, timestamptz)
  from public, anon;
grant execute on function public.replan_itinerary(bigint, jsonb, jsonb, timestamptz)
  to authenticated;
