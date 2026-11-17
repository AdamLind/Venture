-- =============================================================================
-- Moderator and admin roles (#26, groundwork for #76)
--
-- One account: staff are regular users with extra powers. The role lives in
-- its own table (public.staff), not on public.users, because people can
-- update their own users row. Nobody can write to staff from the app; only
-- set_staff_role() (admins) changes it.
--
-- Moderators: review ideas (approve, request changes, reject), read and
--   resolve reports.
-- Admins: everything moderators can do, plus add or remove staff and read
--   the whole log.
--
-- Privacy holds for staff too: moderators see ideas that were submitted for
-- review (anything but PRIVATE), never private ideas, and so never private
-- places (venue visibility follows the ideas you can see).
--
-- Every decision goes through a function here and is logged in
-- public.moderation_actions with who made it and why.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Staff
-- -----------------------------------------------------------------------------
create table public.staff (
  user_id    uuid primary key references public.users (user_id) on delete cascade,
  role       text not null check (role in ('MODERATOR', 'ADMIN')),
  added_by   uuid references public.users (user_id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;

revoke all on public.staff from anon, authenticated;
grant select on public.staff to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Role helpers (used by policies and functions)
-- -----------------------------------------------------------------------------
create or replace function private.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.role from public.staff s where s.user_id = (select auth.uid());
$$;

create or replace function private.is_moderator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.staff_role() in ('MODERATOR', 'ADMIN'), false);
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.staff_role() = 'ADMIN', false);
$$;

revoke execute on function private.staff_role(), private.is_moderator(), private.is_admin()
  from public, anon;
grant execute on function private.staff_role(), private.is_moderator(), private.is_admin()
  to authenticated;

-- You can see your own role (the app shows staff tools from it); admins see all
create policy "Staff can see their own role, admins see everyone's"
  on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));


-- -----------------------------------------------------------------------------
-- 3. The log
-- -----------------------------------------------------------------------------
create table public.moderation_actions (
  action_id    bigint generated always as identity primary key,
  moderator_id uuid references public.users (user_id) on delete set null
    default auth.uid(),
  action       text not null check (action in (
    'APPROVE', 'REQUEST_CHANGES', 'REJECT',
    'RESOLVE_REPORTS', 'DISMISS_REPORTS',
    'ADD_STAFF', 'CHANGE_STAFF', 'REMOVE_STAFF'
  )),
  idea_id      bigint references public.activities (idea_id) on delete set null,
  user_id      uuid references public.users (user_id) on delete set null,
  note         text check (char_length(note) <= 1000),
  -- Context at the time (e.g. the visibility before, the role before)
  detail       jsonb,
  created_at   timestamptz not null default now()
);

create index moderation_actions_created_idx on public.moderation_actions (created_at desc);
create index moderation_actions_idea_idx on public.moderation_actions (idea_id);

alter table public.moderation_actions enable row level security;

revoke all on public.moderation_actions from anon, authenticated;
grant select on public.moderation_actions to authenticated;
-- No client writes: rows come from the functions below

-- Moderators see the history of ideas they can review (earlier decisions
-- help); admins see everything, including staff changes
create policy "Moderators see idea history, admins see the whole log"
  on public.moderation_actions for select to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_moderator()) and idea_id is not null)
  );


-- -----------------------------------------------------------------------------
-- 4. What moderators can read
-- -----------------------------------------------------------------------------

-- Ideas submitted for review at some point: in review, published, sent back
-- or rejected. Never PRIVATE. All ages (staff are adults).
create policy "Moderators see ideas submitted for review"
  on public.activities for select to authenticated
  using ((select private.is_moderator()) and visibility <> 'PRIVATE');

-- The people who posted them (username, photo for review)
create policy "Moderators see creators of submitted ideas"
  on public.users for select to authenticated
  using (
    (select private.is_moderator())
    and exists (
      select 1 from public.activities a
      where a.user_id = users.user_id and a.visibility <> 'PRIVATE'
    )
  );

-- Reports stay write-only for everyone else
grant select on public.idea_reports to authenticated;
create policy "Moderators read reports"
  on public.idea_reports for select to authenticated
  using ((select private.is_moderator()));


-- -----------------------------------------------------------------------------
-- 5. Decisions
-- -----------------------------------------------------------------------------

-- Approve, request changes or reject an idea. The owner is notified by the
-- existing trigger (notify_idea_review). Moderators can't decide on their
-- own ideas; admins can (it's logged).
create or replace function public.review_idea(
  p_idea_id  bigint,
  p_decision text,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_idea   public.activities%rowtype;
  v_target text;
begin
  if not private.is_moderator() then
    raise exception 'Only moderators can review ideas' using errcode = '42501';
  end if;

  v_target := case p_decision
    when 'APPROVE' then 'PUBLISHED'
    when 'REQUEST_CHANGES' then 'NEEDS_REVISION'
    when 'REJECT' then 'REJECTED'
  end;
  if v_target is null then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;

  if p_decision <> 'APPROVE' and v_note is null then
    raise exception 'Add a note so they know what to change' using errcode = '22023';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'That note is too long' using errcode = '22023';
  end if;

  select * into v_idea from public.activities where idea_id = p_idea_id for update;
  if not found or v_idea.visibility = 'PRIVATE' then
    raise exception 'That idea isn''t up for review' using errcode = 'P0002';
  end if;

  if v_idea.user_id = auth.uid() and not private.is_admin() then
    raise exception 'Someone else needs to review your own ideas' using errcode = '42501';
  end if;

  if v_idea.visibility = v_target then
    raise exception 'That idea already has this decision' using errcode = '22023';
  end if;

  -- Note first (the notification trigger reads it on the visibility change)
  update public.activities
  set moderation_note = case when p_decision = 'APPROVE' then null else v_note end,
      visibility      = v_target
  where idea_id = p_idea_id;

  insert into public.moderation_actions (action, idea_id, user_id, note, detail)
  values (
    p_decision, p_idea_id, v_idea.user_id, v_note,
    jsonb_build_object('from', v_idea.visibility, 'to', v_target)
  );
end;
$$;

-- Close the open reports on an idea: RESOLVED (acted on) or DISMISSED
create or replace function public.resolve_reports(
  p_idea_id bigint,
  p_outcome text,
  p_note    text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note  text := nullif(btrim(coalesce(p_note, '')), '');
  v_count integer;
begin
  if not private.is_moderator() then
    raise exception 'Only moderators can handle reports' using errcode = '42501';
  end if;
  if p_outcome not in ('RESOLVED', 'DISMISSED') then
    raise exception 'Unknown outcome' using errcode = '22023';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'That note is too long' using errcode = '22023';
  end if;

  update public.idea_reports
  set status = case p_outcome when 'RESOLVED' then 'REVIEWED' else 'DISMISSED' end
  where idea_id = p_idea_id and status = 'OPEN';
  get diagnostics v_count = row_count;

  if v_count = 0 then
    raise exception 'No open reports on that idea' using errcode = 'P0002';
  end if;

  insert into public.moderation_actions (action, idea_id, user_id, note, detail)
  select
    case p_outcome when 'RESOLVED' then 'RESOLVE_REPORTS' else 'DISMISS_REPORTS' end,
    p_idea_id, a.user_id, v_note, jsonb_build_object('reports', v_count)
  from public.activities a where a.idea_id = p_idea_id;

  return v_count;
end;
$$;

-- Add, change or remove (null role) a staff member. Admins only. The last
-- admin can't step down or be removed, so there's always someone in charge.
create or replace function public.set_staff_role(
  p_user_id uuid,
  p_role    text,
  p_note    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before text;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.is_admin() then
    raise exception 'Only admins can change staff' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('MODERATOR', 'ADMIN') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.users where user_id = p_user_id) then
    raise exception 'No one with that account' using errcode = 'P0002';
  end if;

  -- Serialize staff changes so two admins can't remove each other at once
  lock table public.staff in share row exclusive mode;

  select role into v_before from public.staff where user_id = p_user_id;
  if v_before is not distinct from p_role then
    return;
  end if;

  if v_before = 'ADMIN'
     and (select count(*) from public.staff where role = 'ADMIN') = 1 then
    raise exception 'Add another admin first' using errcode = '42501';
  end if;

  if p_role is null then
    delete from public.staff where user_id = p_user_id;
  else
    insert into public.staff (user_id, role, added_by)
    values (p_user_id, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role;
  end if;

  insert into public.moderation_actions (action, user_id, note, detail)
  values (
    case when v_before is null then 'ADD_STAFF'
         when p_role is null then 'REMOVE_STAFF'
         else 'CHANGE_STAFF' end,
    p_user_id, v_note,
    jsonb_build_object('from', v_before, 'to', p_role)
  );
end;
$$;

revoke execute on function
  public.review_idea(bigint, text, text),
  public.resolve_reports(bigint, text, text),
  public.set_staff_role(uuid, text, text)
from public, anon;
grant execute on function
  public.review_idea(bigint, text, text),
  public.resolve_reports(bigint, text, text),
  public.set_staff_role(uuid, text, text)
to authenticated;
