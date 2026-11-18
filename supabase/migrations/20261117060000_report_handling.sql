-- =============================================================================
-- Acting on reports (#76, App Review Guideline 1.2)
--
-- 1. Hold: a published idea with 3 open reports from different people, or 2
--    "unsafe" ones, is hidden from Discover automatically until a moderator
--    looks (activities.held_at). Fewer than that can't take anything down,
--    so one person can't hide an idea they don't like. People who saved it
--    or have it on a date still see it; its creator is told.
-- 2. Alerts: staff get an in-app notification when an idea is reported (one
--    per idea until they've seen it, updated as reports come in).
-- 3. Outcome: reporters hear back when their report is handled: taken down,
--    or looked at and within the guidelines.
-- A moderator's decision, or dismissing the reports, lifts the hold.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. The hold, and who still sees a held idea
-- -----------------------------------------------------------------------------
alter table public.activities
  add column if not exists held_at timestamptz;

comment on column public.activities.held_at is
  'Hidden from Discover after enough reports, until a moderator looks (#76)';

-- You saved it, or it's on a date you're on: keep showing it to you
create or replace function private.keeps_idea(p_idea_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.saved_activities s
    where s.activity_id = p_idea_id and s.user_id = (select auth.uid())
  ) or exists (
    select 1
    from public.itinerary_activities ia
    join public.itinerary_users iu on iu.itinerary_id = ia.itinerary_id
    where ia.activity_id = p_idea_id
      and iu.user_id = (select auth.uid())
      and iu.invite_status <> 'DECLINED'
  );
$$;

revoke execute on function private.keeps_idea(bigint) from public, anon;
grant execute on function private.keeps_idea(bigint) to authenticated;

drop policy if exists "Published activities visible to old-enough users" on public.activities;
create policy "Published activities visible to old-enough users"
  on public.activities for select to authenticated
  using (
    visibility = 'PUBLISHED'
    and min_age <= (select coalesce(private.current_user_age(), 16))
    and (held_at is null or private.keeps_idea(idea_id))
  );


-- -----------------------------------------------------------------------------
-- 2. New notification kinds, and the log's new action
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'IDEA_PUBLISHED', 'IDEA_NEEDS_REVISION', 'IDEA_REJECTED',
  -- Your idea is hidden while a moderator looks at reports
  'IDEA_HELD',
  -- Staff: an idea was reported
  'IDEA_REPORTED',
  -- Reporters: what happened to their report
  'REPORT_ACTIONED', 'REPORT_DISMISSED'
));

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'APPROVE', 'REQUEST_CHANGES', 'REJECT',
  'RESOLVE_REPORTS', 'DISMISS_REPORTS',
  'ADD_STAFF', 'CHANGE_STAFF', 'REMOVE_STAFF',
  -- Automatic: no moderator
  'AUTO_HOLD'
));


-- -----------------------------------------------------------------------------
-- 3. A new report: alert staff, and hold the idea once there are enough
-- -----------------------------------------------------------------------------
create or replace function private.on_idea_reported()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idea     public.activities%rowtype;
  v_people   integer;
  v_unsafe   integer;
  v_held     boolean := false;
  v_note     text;
begin
  select * into v_idea from public.activities where idea_id = new.idea_id;
  if not found then
    return new;
  end if;

  select count(distinct reporter_id),
         count(distinct reporter_id) filter (where reason = 'UNSAFE')
    into v_people, v_unsafe
  from public.idea_reports
  where idea_id = new.idea_id and status = 'OPEN';

  -- Enough people: hide it from Discover until a moderator looks
  if v_idea.visibility = 'PUBLISHED' and v_idea.held_at is null
     and (v_people >= 3 or v_unsafe >= 2) then
    update public.activities set held_at = now() where idea_id = new.idea_id;
    v_held := true;

    insert into public.moderation_actions (moderator_id, action, idea_id, user_id, detail)
    values (null, 'AUTO_HOLD', new.idea_id, v_idea.user_id,
            jsonb_build_object('people', v_people, 'unsafe', v_unsafe));

    if v_idea.user_id is not null then
      insert into public.notifications (user_id, kind, idea_id, idea_title, note)
      values (v_idea.user_id, 'IDEA_HELD', new.idea_id, v_idea.title, null);
    end if;
  end if;

  v_note := v_people || case when v_people = 1 then ' open report' else ' open reports' end
    || case when v_held or v_idea.held_at is not null then ' · Hidden from Discover until someone looks' else '' end;

  -- Staff (not the reporter, not the creator): one unseen alert per idea
  update public.notifications n
  set note = v_note, created_at = now()
  from public.staff s
  where n.user_id = s.user_id
    and n.kind = 'IDEA_REPORTED' and n.idea_id = new.idea_id and n.seen_at is null
    and s.user_id is distinct from new.reporter_id
    and s.user_id is distinct from v_idea.user_id;

  insert into public.notifications (user_id, kind, idea_id, idea_title, note)
  select s.user_id, 'IDEA_REPORTED', new.idea_id, v_idea.title, v_note
  from public.staff s
  where s.user_id is distinct from new.reporter_id
    and s.user_id is distinct from v_idea.user_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = s.user_id and n.kind = 'IDEA_REPORTED'
        and n.idea_id = new.idea_id and n.seen_at is null
    );

  return new;
end;
$$;

revoke execute on function private.on_idea_reported() from public, anon, authenticated;

drop trigger if exists idea_reports_on_insert on public.idea_reports;
create trigger idea_reports_on_insert
  after insert on public.idea_reports
  for each row
  execute function private.on_idea_reported();


-- -----------------------------------------------------------------------------
-- 4. A report handled: tell the reporter, and lift the hold once none are open
-- -----------------------------------------------------------------------------
create or replace function private.on_report_handled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if old.status <> 'OPEN' or new.status = 'OPEN' then
    return new;
  end if;

  select title into v_title from public.activities where idea_id = new.idea_id;

  if new.reporter_id is not null then
    insert into public.notifications (user_id, kind, idea_id, idea_title, note)
    values (
      new.reporter_id,
      case new.status when 'DISMISSED' then 'REPORT_DISMISSED' else 'REPORT_ACTIONED' end,
      new.idea_id, v_title, null
    );
  end if;

  if not exists (
    select 1 from public.idea_reports where idea_id = new.idea_id and status = 'OPEN'
  ) then
    update public.activities set held_at = null
    where idea_id = new.idea_id and held_at is not null;

    -- Nothing left to look at: staff alerts about it are done
    update public.notifications set seen_at = now()
    where kind = 'IDEA_REPORTED' and idea_id = new.idea_id and seen_at is null;
  end if;

  return new;
end;
$$;

revoke execute on function private.on_report_handled() from public, anon, authenticated;

drop trigger if exists idea_reports_on_handled on public.idea_reports;
create trigger idea_reports_on_handled
  after update of status on public.idea_reports
  for each row
  execute function private.on_report_handled();


-- -----------------------------------------------------------------------------
-- 5. Any moderator decision lifts the hold (a resubmitted, approved idea
--    shouldn't stay hidden)
-- -----------------------------------------------------------------------------
create or replace function private.lift_hold_on_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.visibility is distinct from old.visibility
     and new.visibility in ('PUBLISHED', 'NEEDS_REVISION', 'REJECTED') then
    new.held_at := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.lift_hold_on_review() from public, anon, authenticated;

drop trigger if exists activities_lift_hold on public.activities;
create trigger activities_lift_hold
  before update of visibility on public.activities
  for each row
  execute function private.lift_hold_on_review();
