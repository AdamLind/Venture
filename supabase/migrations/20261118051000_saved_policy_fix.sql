-- =============================================================================
-- Fix: saving is limited to published ideas and your own (#36, #77)
--
-- saved_activities had two separate insert policies ("your own list" and
-- "ideas you can see"). Policies of the same kind add up, so the first one
-- alone let anyone save any idea id to their list, including private ideas
-- they see through a shared date. One policy now requires both.
-- =============================================================================

drop policy if exists "Users can save activities" on public.saved_activities;
drop policy if exists "Can only save published or own ideas" on public.saved_activities;
drop policy if exists "Save published ideas or your own" on public.saved_activities;

create policy "Save published ideas or your own" on public.saved_activities for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.activities a
      where a.idea_id = saved_activities.activity_id
        and (a.visibility = 'PUBLISHED' or a.user_id = (select auth.uid()))
    )
  );
