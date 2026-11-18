-- =============================================================================
-- Fix: staff see fellow staff (#26)
--
-- "Staff see fellow staff" looked up public.staff inside the policy, but
-- moderators can only read their own staff row (RLS), so it never matched
-- anyone else and the log showed other moderators as "A moderator". Check
-- through a security definer helper instead.
-- =============================================================================

create or replace function private.is_staff(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff s where s.user_id = p_user_id);
$$;

revoke execute on function private.is_staff(uuid) from public, anon;
grant execute on function private.is_staff(uuid) to authenticated;

drop policy if exists "Staff see fellow staff" on public.users;
create policy "Staff see fellow staff"
  on public.users for select to authenticated
  using ((select private.is_moderator()) and private.is_staff(user_id));
