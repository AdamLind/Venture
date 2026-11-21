-- Energy split in two (#20): how an idea feels and how physical it is vary
-- apart (stargazing: calm, a little physical; climbing: upbeat, a workout;
-- an escape room: upbeat, not physical). See utils/ideaTraits.ts.
--   feel ...... CALM, UPBEAT
--   exertion .. NONE, LIGHT, HARD (HARD is what the Strenuous label means)
-- Null: not answered yet (older ideas); the planner falls back to the old
-- fields. The publisher asks both of every new idea.
-- (activities.energy, added earlier today and never filled, is no longer
-- used; it's dropped separately.)

alter table public.activities
  add column if not exists feel text,
  add column if not exists exertion text;

alter table public.activities drop constraint if exists activities_feel_check;
alter table public.activities add constraint activities_feel_check
  check (feel is null or feel in ('CALM', 'UPBEAT'));

alter table public.activities drop constraint if exists activities_exertion_check;
alter table public.activities add constraint activities_exertion_check
  check (exertion is null or exertion in ('NONE', 'LIGHT', 'HARD'));

comment on column public.activities.feel is
  'How the idea feels (CALM, UPBEAT), for the date''s arc; null = not answered (older ideas)';
comment on column public.activities.exertion is
  'How physical it is (NONE, LIGHT, HARD = a workout, same as the Strenuous label); null = not answered';
