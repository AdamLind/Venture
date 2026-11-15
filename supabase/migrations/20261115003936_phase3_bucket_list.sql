-- =============================================================================
-- Phase 3: Bucket List (saved ideas) and My Ideas
--
-- Additive only. Unpublishing, resubmitting, and deleting your own ideas are
-- already covered by the activities policies from Phase 0.
-- =============================================================================

-- You can only save ideas you can see (published and old enough, or your
-- own). RESTRICTIVE, so it's ANDed with the existing "Users can save
-- activities" policy. The subquery runs under the saver's RLS on activities.
create policy "Can only save ideas you can see"
  on public.saved_activities
  as restrictive
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.activities a
      where a.idea_id = saved_activities.activity_id
    )
  );

-- The Bucket List shows newest saves first
create index if not exists saved_activities_user_created_idx
  on public.saved_activities (user_id, created_at desc);

-- My Ideas lists your own ideas, newest first
create index if not exists activities_user_created_idx
  on public.activities (user_id, created_at desc);
