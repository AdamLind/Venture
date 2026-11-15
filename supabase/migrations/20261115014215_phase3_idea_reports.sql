-- =============================================================================
-- Phase 3: reporting ideas
--
-- Anyone signed in can report an idea they can see (not their own), once.
-- Reports are write-only for users: nobody can read them back through the
-- API, including the reporter. Review them in the dashboard / SQL editor.
-- Additive only.
-- =============================================================================

create table public.idea_reports (
  report_id bigint generated always as identity primary key,
  idea_id bigint not null references public.activities (idea_id) on delete cascade,
  reporter_id uuid not null default auth.uid()
    references public.users (user_id) on delete cascade,
  reason text not null check (
    reason in ('INAPPROPRIATE', 'SPAM', 'UNSAFE', 'AGE_RATING', 'OTHER')
  ),
  details text check (char_length(details) <= 500),
  status text not null default 'OPEN' check (status in ('OPEN', 'REVIEWED', 'DISMISSED')),
  created_at timestamptz not null default now(),
  unique (reporter_id, idea_id)
);

create index idea_reports_open_idx
  on public.idea_reports (created_at desc) where status = 'OPEN';
create index idea_reports_idea_idx on public.idea_reports (idea_id);

alter table public.idea_reports enable row level security;

-- Report ideas you can see, but not your own
create policy "Users can report ideas they can see"
  on public.idea_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and exists (
      select 1 from public.activities a
      where a.idea_id = idea_reports.idea_id
        and a.user_id is distinct from (select auth.uid())
    )
  );

-- Write-only: only the reason and details come from the app
revoke all on public.idea_reports from anon, authenticated;
grant insert (idea_id, reason, details) on public.idea_reports to authenticated;
