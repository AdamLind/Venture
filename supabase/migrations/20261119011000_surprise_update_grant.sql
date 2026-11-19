-- =============================================================================
-- The owner (and editors) can mark a date as a surprise (#35)
--
-- itineraries only allows updating listed columns (title, times, status);
-- add is_surprise. Who can change it is still the update policy (owner and
-- editors).
-- =============================================================================

grant update (is_surprise) on public.itineraries to authenticated;
