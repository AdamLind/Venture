-- An idea's energy (#20): how lively it feels, for the date's arc (dates warm
-- up, then wind down: utils/planEvaluator.ts, WINDS_BACK_UP).
--   CALM ..... quiet, close: stargazing, a spa, a sunset view
--   UPBEAT ... engaging, playful: an escape room, karaoke, a comedy show
--   ACTIVE ... physical: climbing, a hike, a dance class
-- Null: not answered yet (older ideas); the planner falls back to a guess
-- from the tags. The publisher asks it of every new idea.

alter table public.activities
  add column if not exists energy text;

alter table public.activities drop constraint if exists activities_energy_check;
alter table public.activities add constraint activities_energy_check
  check (energy is null or energy in ('CALM', 'UPBEAT', 'ACTIVE'));

comment on column public.activities.energy is
  'How lively the idea feels (CALM, UPBEAT, ACTIVE), for the date''s arc; null = not answered (older ideas)';
