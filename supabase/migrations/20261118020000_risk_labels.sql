-- =============================================================================
-- Risk labels and a safety note on ideas (#81)
--
-- Risky but legal is fine (hiking, kayaking, climbing), as long as people
-- know what they're getting into. The creator picks labels and can add a
-- short note ("the last half mile is a scramble; skip it after rain");
-- moderators ask for them when they're missing. Ids match src/lib/safety.ts.
-- =============================================================================

alter table public.activities
  add column if not exists risk_labels text[] not null default '{}',
  add column if not exists safety_note text;

alter table public.activities drop constraint if exists activities_risk_labels_check;
alter table public.activities add constraint activities_risk_labels_check
  check (risk_labels <@ array['STRENUOUS', 'HEIGHTS', 'WATER', 'REMOTE', 'PERMIT', 'GUIDE']);

alter table public.activities drop constraint if exists activities_safety_note_check;
alter table public.activities add constraint activities_safety_note_check
  check (safety_note is null or char_length(safety_note) <= 300);

comment on column public.activities.risk_labels is
  'What to know before going: STRENUOUS, HEIGHTS, WATER, REMOTE, PERMIT, GUIDE (#81)';
comment on column public.activities.safety_note is
  'A short heads-up from the creator, up to 300 characters (#81)';
