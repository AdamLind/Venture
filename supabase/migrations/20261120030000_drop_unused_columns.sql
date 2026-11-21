-- =============================================================================
-- Drop two columns nothing uses anymore
--
-- user_preferences.surprise_mode (#35): replaced by choosing "Surprise for
--   @partner" per date while planning (20261119020000_surprise_per_date.sql).
-- activities.energy (#20): split into feel and exertion the same day it was
--   added (20261120020000_idea_feel_exertion.sql); never filled.
-- =============================================================================

alter table public.user_preferences drop column if exists surprise_mode;
alter table public.activities drop column if exists energy;
