-- =============================================================================
-- You can switch Surprise mode on and off (#35)
--
-- user_preferences only allows updating listed columns; add surprise_mode.
-- =============================================================================

grant update (surprise_mode) on public.user_preferences to authenticated;
