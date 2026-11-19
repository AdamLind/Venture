-- =============================================================================
-- Privacy cleanup (#27, #28)
--
-- 1. Tags (#27): activity_tags was readable by anyone, so the tags of private
--    ideas leaked. Now a tag is visible only with its idea (the idea's own
--    rules decide: yours, published, or staff reviewing it).
-- 2. Names (#28): anyone who could see a creator could read their first and
--    last name. Other people now see only the username and photo; your own
--    name comes from my_name(). When names are shown to people you plan
--    with (Phase 5), that goes through its own function too.
-- =============================================================================

-- 1. Tags go with their idea
drop policy if exists "Activity tags are viewable by everyone" on public.activity_tags;
drop policy if exists "Tags are visible with their idea" on public.activity_tags;
create policy "Tags are visible with their idea"
  on public.activity_tags for select to authenticated
  using (exists (select 1 from public.activities a where a.idea_id = activity_tags.idea_id));

-- 2. Names stay private: only these columns can be read by other people
revoke select on public.users from anon, authenticated;
grant select (user_id, username, profile_image_url, created_at) on public.users to authenticated;

create or replace function public.my_name()
returns table (first_name text, last_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.first_name, u.last_name from public.users u where u.user_id = auth.uid();
$$;

revoke execute on function public.my_name() from public, anon;
grant execute on function public.my_name() to authenticated;
