-- =============================================================================
-- Phase 3: editing your own ideas
--
-- Editing replaces an idea's tags (delete the old rows, insert the new ones).
-- activity_tags had INSERT and SELECT policies but no DELETE, so the old tags
-- couldn't be removed. Additive only.
-- =============================================================================

create policy "Users can untag their own activities"
  on public.activity_tags
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.activities a
      where a.idea_id = activity_tags.idea_id
        and a.user_id = (select auth.uid())
    )
  );
