-- =============================================================================
-- Weather needs on ideas (#65)
--
-- What weather an idea needs to be enjoyable. Null means "use the default for
-- its environment" (the app decides: indoor = ANY, outdoor = NICE, mixed = a
-- lighter NICE), so existing ideas need no backfill. Additive only.
--
--   ANY   never penalized for weather
--   NICE  about 50-90 F, no rain, not very windy
--   WARM  70 F or warmer (swimming, beach)
--   COLD  freezing or snow (sledding, outdoor skating)
-- =============================================================================

alter table public.activities
  add column if not exists weather_needs text
  check (weather_needs in ('ANY', 'NICE', 'WARM', 'COLD'));

comment on column public.activities.weather_needs is
  'ANY / NICE / WARM / COLD; null = default by environment (see src/lib/weatherRules.ts)';
