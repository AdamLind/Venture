-- =============================================================================
-- Opening hours on venues (#4)
--
--   opening_hours     OpenStreetMap's opening_hours format, e.g.
--                     "Mo-Fr 09:00-17:00; Sa 10:00-14:00; Su off"
--                     (the app reads the common part of it, see
--                     mobile-client/utils/openingHours.ts; anything it can't
--                     read counts as unknown, never as closed)
--   hours_checked_at  when someone last checked them (filled from
--                     OpenStreetMap #5, the idea form #6, or reports #10)
--
-- Null means we don't know the hours. Additive only.
-- =============================================================================

alter table public.venues
  add column if not exists opening_hours text
    check (opening_hours is null or char_length(opening_hours) between 1 and 255),
  add column if not exists hours_checked_at timestamptz;

comment on column public.venues.opening_hours is
  'OpenStreetMap opening_hours syntax (null = unknown)';
comment on column public.venues.hours_checked_at is
  'When the hours were last checked';
