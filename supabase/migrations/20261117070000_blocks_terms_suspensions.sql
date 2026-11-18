-- =============================================================================
-- Blocking, terms of use, and suspensions (#76, App Review Guideline 1.2)
--
-- 1. Blocks: hide every idea from a creator. Yours alone (nobody is told);
--    the app filters their ideas out of Discover and the builder, like
--    hidden ideas. Blocking someone from reaching you comes with
--    connections (Phase 4, #35).
-- 2. Terms: which version of the terms you accepted, and when (set by the
--    server, so the time can't be made up).
-- 3. Suspensions: moderators can suspend an account that keeps breaking the
--    guidelines (logged, and can be lifted). A suspended account can still
--    plan privately, but can't publish or report, and its published ideas
--    leave Discover (people who saved one keep it, like a held idea).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Blocks
-- -----------------------------------------------------------------------------
create table if not exists public.blocked_users (
  user_id    uuid not null default auth.uid() references public.users (user_id) on delete cascade,
  blocked_id uuid not null references public.users (user_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id),
  check (user_id <> blocked_id)
);

alter table public.blocked_users enable row level security;
revoke all on public.blocked_users from anon, authenticated;
grant select, insert, delete on public.blocked_users to authenticated;

drop policy if exists "Users see their own blocks" on public.blocked_users;
create policy "Users see their own blocks"
  on public.blocked_users for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users block others" on public.blocked_users;
create policy "Users block others"
  on public.blocked_users for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Users unblock others" on public.blocked_users;
create policy "Users unblock others"
  on public.blocked_users for delete to authenticated
  using (user_id = (select auth.uid()));

-- The list in Settings shows who you blocked, even once they've no
-- published ideas left
drop policy if exists "Users see people they blocked" on public.users;
create policy "Users see people they blocked"
  on public.users for select to authenticated
  using (exists (
    select 1 from public.blocked_users b
    where b.user_id = (select auth.uid()) and b.blocked_id = users.user_id
  ));


-- -----------------------------------------------------------------------------
-- 2. Terms of use
-- -----------------------------------------------------------------------------
alter table public.user_preferences
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz;

create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_version is null or char_length(p_version) not between 1 and 40 then
    raise exception 'Unknown terms version' using errcode = '22023';
  end if;
  update public.user_preferences
  set terms_version = p_version, terms_accepted_at = now()
  where user_id = auth.uid();
  if not found then
    raise exception 'Finish setting up your account first' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Suspensions
-- -----------------------------------------------------------------------------
create table if not exists public.account_suspensions (
  user_id      uuid primary key references public.users (user_id) on delete cascade,
  reason       text not null check (char_length(reason) between 1 and 1000),
  suspended_by uuid references public.users (user_id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.account_suspensions enable row level security;
revoke all on public.account_suspensions from anon, authenticated;
grant select on public.account_suspensions to authenticated;

-- You can see your own (the app says so); moderators see all of them
drop policy if exists "Users see their own suspension" on public.account_suspensions;
create policy "Users see their own suspension"
  on public.account_suspensions for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_moderator()));

create or replace function private.is_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.account_suspensions s where s.user_id = p_user_id);
$$;

revoke execute on function private.is_suspended(uuid) from public, anon;
grant execute on function private.is_suspended(uuid) to authenticated;

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'APPROVE', 'REQUEST_CHANGES', 'REJECT',
  'RESOLVE_REPORTS', 'DISMISS_REPORTS',
  'ADD_STAFF', 'CHANGE_STAFF', 'REMOVE_STAFF',
  'AUTO_HOLD',
  'SUSPEND', 'UNSUSPEND'
));

-- Suspend (p_suspend true, with a reason) or lift a suspension. Moderators
-- can't suspend staff (an admin removes the role first) or themselves.
-- p_idea_id: the idea it was decided on, so it shows in that idea's history.
create or replace function public.set_suspension(
  p_user_id uuid,
  p_suspend boolean,
  p_note    text default null,
  p_idea_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.is_moderator() then
    raise exception 'Only moderators can suspend accounts' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'You can''t suspend your own account' using errcode = '22023';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'That note is too long' using errcode = '22023';
  end if;

  if p_suspend then
    if private.is_staff(p_user_id) then
      raise exception 'Staff can''t be suspended. An admin can remove their role first' using errcode = '42501';
    end if;
    if v_note is null then
      raise exception 'Add a reason for the suspension' using errcode = '22023';
    end if;
    insert into public.account_suspensions (user_id, reason, suspended_by)
    values (p_user_id, v_note, auth.uid())
    on conflict (user_id) do nothing;
    if not found then
      raise exception 'That account is already suspended' using errcode = '22023';
    end if;
  else
    delete from public.account_suspensions where user_id = p_user_id;
    if not found then
      raise exception 'That account isn''t suspended' using errcode = 'P0002';
    end if;
  end if;

  insert into public.moderation_actions (action, idea_id, user_id, note)
  values (case when p_suspend then 'SUSPEND' else 'UNSUSPEND' end, p_idea_id, p_user_id, v_note);
end;
$$;

revoke execute on function public.set_suspension(uuid, boolean, text, bigint) from public, anon;
grant execute on function public.set_suspension(uuid, boolean, text, bigint) to authenticated;

-- What a suspension stops: publishing (submitting for review), reporting,
-- and showing their ideas in Discover
drop policy if exists "Users can create activities for review" on public.activities;
create policy "Users can create activities for review"
  on public.activities for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (visibility = 'PRIVATE'
         or (visibility = 'PENDING_REVIEW' and not private.is_suspended((select auth.uid()))))
  );

drop policy if exists "Users can update own activities" on public.activities;
create policy "Users can update own activities"
  on public.activities for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (visibility = 'PRIVATE'
         or (visibility = 'PENDING_REVIEW' and not private.is_suspended((select auth.uid()))))
  );

drop policy if exists "Users can report ideas they can see" on public.idea_reports;
create policy "Users can report ideas they can see"
  on public.idea_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and not private.is_suspended((select auth.uid()))
    and exists (
      select 1 from public.activities a
      where a.idea_id = idea_reports.idea_id
        and a.user_id is distinct from (select auth.uid())
    )
  );

drop policy if exists "Published activities visible to old-enough users" on public.activities;
create policy "Published activities visible to old-enough users"
  on public.activities for select to authenticated
  using (
    visibility = 'PUBLISHED'
    and min_age <= (select coalesce(private.current_user_age(), 16))
    and ((held_at is null and not private.is_suspended(user_id)) or private.keeps_idea(idea_id))
  );
