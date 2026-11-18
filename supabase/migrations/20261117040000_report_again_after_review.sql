-- =============================================================================
-- Report an idea again after a moderator has looked at it (#76)
--
-- One report per person per idea was forever. Now it's one *open* report:
-- once a moderator resolves or dismisses it, the same person can report the
-- idea again (it may have changed, or kept happening). Duplicates while a
-- report is still open are still refused (23505, "already reported").
-- =============================================================================

alter table public.idea_reports
  drop constraint if exists idea_reports_reporter_id_idea_id_key;

create unique index if not exists idea_reports_one_open_per_person
  on public.idea_reports (reporter_id, idea_id)
  where status = 'OPEN';
