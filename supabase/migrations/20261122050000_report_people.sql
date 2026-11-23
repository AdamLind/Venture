-- =============================================================================
-- Reporting a person (#76, App Review Guideline 1.2)
--
-- Ideas could be reported; people (their photo, their name, how they treat
-- you) couldn't. Now you can report someone you're connected to, or who's on
-- a date with you, from their connection sheet or the date's people list.
--
-- 1. user_reports: write-only from the app, like idea_reports. One open
--    report per person about someone; once it's handled you can report again.
-- 2. Staff get an in-app alert per reported person (updated as reports come
--    in) and can see that person's profile while they have reports.
-- 3. handle_person_reports(): a moderator removes their photo, resets their
--    username, suspends them, or closes the reports (handled, or nothing
--    wrong). The person is told what was removed and why; reporters are told
--    their report was looked at (never what happened to the person).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Reports
-- -----------------------------------------------------------------------------
create table if not exists public.user_reports (
  report_id    bigint generated always as identity primary key,
  reported_id  uuid not null references public.users (user_id) on delete cascade,
  reporter_id  uuid not null default auth.uid() references public.users (user_id) on delete cascade,
  reason       text not null check (reason in ('PHOTO', 'NAME', 'HARASSMENT', 'SPAM', 'UNDERAGE', 'OTHER')),
  details      text check (char_length(details) <= 500),
  -- Where it came from: their connection sheet, or a date you're both on
  context      text not null check (context in ('CONNECTION', 'DATE')),
  itinerary_id bigint references public.itineraries (itinerary_id) on delete set null,
  status       text not null default 'OPEN' check (status in ('OPEN', 'REVIEWED', 'DISMISSED')),
  created_at   timestamptz not null default now(),
  check (reported_id <> reporter_id)
);

comment on table public.user_reports is
  'Reports about a person (photo, name, behaviour), #76. Write-only from the app; moderators read them';

create unique index if not exists user_reports_one_open_per_person
  on public.user_reports (reporter_id, reported_id)
  where status = 'OPEN';
create index if not exists user_reports_open_idx
  on public.user_reports (created_at desc) where status = 'OPEN';
create index if not exists user_reports_reported_idx on public.user_reports (reported_id);
create index if not exists user_reports_reporter_idx on public.user_reports (reporter_id);
create index if not exists user_reports_itinerary_idx on public.user_reports (itinerary_id);

alter table public.user_reports enable row level security;

-- Someone you know through the app: a connection, or someone on a date with
-- you (that date, when it's from one). Not yourself, and not while suspended
drop policy if exists "Users report people they know" on public.user_reports;
create policy "Users report people they know"
  on public.user_reports for insert to authenticated
  with check (
    reporter_id = (select auth.uid())
    and reported_id <> (select auth.uid())
    and not private.is_suspended((select auth.uid()))
    and case context
      when 'CONNECTION' then itinerary_id is null and private.is_connected(reported_id)
      when 'DATE' then itinerary_id is not null
        and private.is_itinerary_member(itinerary_id)
        and exists (
          select 1 from public.itinerary_users iu
          where iu.itinerary_id = user_reports.itinerary_id
            and iu.user_id = user_reports.reported_id
        )
      else false
    end
  );

drop policy if exists "Moderators read person reports" on public.user_reports;
create policy "Moderators read person reports"
  on public.user_reports for select to authenticated
  using ((select private.is_moderator()));

-- Only these come from the app; status changes go through
-- handle_person_reports()
revoke all on public.user_reports from anon, authenticated;
grant insert (reported_id, reason, details, context, itinerary_id) on public.user_reports to authenticated;
grant select on public.user_reports to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Staff see a reported person (their name and photo are what's reported)
-- -----------------------------------------------------------------------------
create or replace function private.has_person_reports(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_reports r where r.reported_id = p_user_id);
$$;

revoke execute on function private.has_person_reports(uuid) from public, anon;
grant execute on function private.has_person_reports(uuid) to authenticated;

drop policy if exists "Moderators see reported people" on public.users;
create policy "Moderators see reported people"
  on public.users for select to authenticated
  using ((select private.is_moderator()) and private.has_person_reports(user_id));


-- -----------------------------------------------------------------------------
-- 3. New notification kinds and log actions
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'IDEA_PUBLISHED', 'IDEA_NEEDS_REVISION', 'IDEA_REJECTED',
  'IDEA_HELD', 'IDEA_REPORTED', 'REPORT_ACTIONED', 'REPORT_DISMISSED',
  'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'PARTNER_REQUEST', 'PARTNER_ACCEPTED',
  'DATE_INVITE', 'DATE_INVITE_ACCEPTED', 'DATE_COMMENT',
  -- Staff: someone was reported (actor: who)
  'PERSON_REPORTED',
  -- Reporters: their report about someone was looked at (actor: who)
  'PERSON_REPORT_ACTIONED', 'PERSON_REPORT_DISMISSED',
  -- The reported person: what a moderator removed, and why (note)
  'PHOTO_REMOVED', 'USERNAME_RESET'
));

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'APPROVE', 'REQUEST_CHANGES', 'REJECT',
  'RESOLVE_REPORTS', 'DISMISS_REPORTS',
  'ADD_STAFF', 'CHANGE_STAFF', 'REMOVE_STAFF',
  'AUTO_HOLD',
  'SUSPEND', 'UNSUSPEND',
  -- About a person (#76)
  'REMOVE_PHOTO', 'RESET_USERNAME', 'RESOLVE_PERSON_REPORTS', 'DISMISS_PERSON_REPORTS'
));

-- Moderators see what's been done to people too (suspensions, photos,
-- names), not only ideas. Staff changes stay admin-only
drop policy if exists "Moderators see idea history, admins see the whole log" on public.moderation_actions;
create policy "Moderators see idea history, admins see the whole log"
  on public.moderation_actions for select to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_moderator())
        and (idea_id is not null
             or action in ('SUSPEND', 'UNSUSPEND', 'REMOVE_PHOTO', 'RESET_USERNAME',
                           'RESOLVE_PERSON_REPORTS', 'DISMISS_PERSON_REPORTS')))
  );


-- -----------------------------------------------------------------------------
-- 4. A new report: one unseen alert per reported person for each staff member
--    (not the reporter, not the person)
-- -----------------------------------------------------------------------------
create or replace function private.on_person_reported()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_people integer;
  v_note   text;
begin
  select count(distinct reporter_id) into v_people
  from public.user_reports
  where reported_id = new.reported_id and status = 'OPEN';

  v_note := v_people || case when v_people = 1 then ' open report' else ' open reports' end;

  update public.notifications n
  set note = v_note, created_at = now()
  from public.staff s
  where n.user_id = s.user_id
    and n.kind = 'PERSON_REPORTED' and n.actor_id = new.reported_id and n.seen_at is null
    and s.user_id is distinct from new.reporter_id
    and s.user_id is distinct from new.reported_id;

  insert into public.notifications (user_id, kind, actor_id, note)
  select s.user_id, 'PERSON_REPORTED', new.reported_id, v_note
  from public.staff s
  where s.user_id is distinct from new.reporter_id
    and s.user_id is distinct from new.reported_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = s.user_id and n.kind = 'PERSON_REPORTED'
        and n.actor_id = new.reported_id and n.seen_at is null
    );

  return new;
end;
$$;

revoke execute on function private.on_person_reported() from public, anon, authenticated;

drop trigger if exists user_reports_on_insert on public.user_reports;
create trigger user_reports_on_insert
  after insert on public.user_reports
  for each row
  execute function private.on_person_reported();


-- -----------------------------------------------------------------------------
-- 5. A report handled: tell the reporter, and clear staff alerts once none
--    are open
-- -----------------------------------------------------------------------------
create or replace function private.on_person_report_handled()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'OPEN' or new.status = 'OPEN' then
    return new;
  end if;

  insert into public.notifications (user_id, kind, actor_id)
  values (
    new.reporter_id,
    case new.status when 'DISMISSED' then 'PERSON_REPORT_DISMISSED' else 'PERSON_REPORT_ACTIONED' end,
    new.reported_id
  );

  if not exists (
    select 1 from public.user_reports where reported_id = new.reported_id and status = 'OPEN'
  ) then
    update public.notifications set seen_at = now()
    where kind = 'PERSON_REPORTED' and actor_id = new.reported_id and seen_at is null;
  end if;

  return new;
end;
$$;

revoke execute on function private.on_person_report_handled() from public, anon, authenticated;

drop trigger if exists user_reports_on_handled on public.user_reports;
create trigger user_reports_on_handled
  after update of status on public.user_reports
  for each row
  execute function private.on_person_report_handled();


-- -----------------------------------------------------------------------------
-- 6. Acting on a person's reports
--
-- p_outcome:
--   REMOVE_PHOTO    clears their photo; they're told why (p_note, required)
--   RESET_USERNAME  gives them a placeholder username to change; told why
--   SUSPEND         suspends the account (set_suspension, p_note the reason)
--   RESOLVED        handled another way (e.g. nothing left to remove)
--   DISMISSED       nothing wrong
-- Every outcome closes their open reports (REVIEWED, or DISMISSED for
-- DISMISSED) and is logged. Returns how many reports it closed.
-- Nobody acts on reports about themselves.
-- -----------------------------------------------------------------------------
create or replace function public.handle_person_reports(
  p_user_id uuid,
  p_outcome text,
  p_note    text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_user     public.users%rowtype;
  v_count    integer;
  v_username text;
  v_tries    integer := 0;
begin
  if not private.is_moderator() then
    raise exception 'Only moderators can handle reports' using errcode = '42501';
  end if;
  if p_outcome not in ('REMOVE_PHOTO', 'RESET_USERNAME', 'SUSPEND', 'RESOLVED', 'DISMISSED') then
    raise exception 'Unknown outcome' using errcode = '22023';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Someone else needs to handle reports about you' using errcode = '42501';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'That note is too long' using errcode = '22023';
  end if;
  -- They're told what was removed and why
  if p_outcome in ('REMOVE_PHOTO', 'RESET_USERNAME', 'SUSPEND') and v_note is null then
    raise exception 'Add a note so they know why' using errcode = '22023';
  end if;

  select * into v_user from public.users where user_id = p_user_id for update;
  if not found then
    raise exception 'That account doesn''t exist anymore' using errcode = 'P0002';
  end if;

  if p_outcome = 'REMOVE_PHOTO' then
    if v_user.profile_image_url is null then
      raise exception 'They don''t have a photo anymore' using errcode = '22023';
    end if;
    update public.users set profile_image_url = null where user_id = p_user_id;
    insert into public.notifications (user_id, kind, note) values (p_user_id, 'PHOTO_REMOVED', v_note);

  elsif p_outcome = 'RESET_USERNAME' then
    -- "user" + 8 random letters and digits (the username format), unused
    loop
      v_username := 'user' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (select 1 from public.users where username = v_username);
      v_tries := v_tries + 1;
      if v_tries > 20 then
        raise exception 'Couldn''t pick a new username. Try again' using errcode = 'P0001';
      end if;
    end loop;
    update public.users set username = v_username where user_id = p_user_id;
    insert into public.notifications (user_id, kind, note) values (p_user_id, 'USERNAME_RESET', v_note);

  elsif p_outcome = 'SUSPEND' then
    -- Its own checks (not staff) and log entry
    perform public.set_suspension(p_user_id, true, v_note, null);
  end if;

  update public.user_reports
  set status = case p_outcome when 'DISMISSED' then 'DISMISSED' else 'REVIEWED' end
  where reported_id = p_user_id and status = 'OPEN';
  get diagnostics v_count = row_count;

  if v_count = 0 and p_outcome in ('RESOLVED', 'DISMISSED') then
    raise exception 'No open reports about them' using errcode = 'P0002';
  end if;

  if p_outcome <> 'SUSPEND' then
    insert into public.moderation_actions (action, user_id, note, detail)
    values (
      case p_outcome
        when 'RESOLVED' then 'RESOLVE_PERSON_REPORTS'
        when 'DISMISSED' then 'DISMISS_PERSON_REPORTS'
        else p_outcome
      end,
      p_user_id, v_note,
      jsonb_build_object('reports', v_count)
        -- The old name, so staff recognise someone who does it again
        || case when p_outcome = 'RESET_USERNAME'
                then jsonb_build_object('from', v_user.username) else '{}'::jsonb end
    );
  end if;

  return v_count;
end;
$$;

revoke execute on function public.handle_person_reports(uuid, text, text) from public, anon;
grant execute on function public.handle_person_reports(uuid, text, text) to authenticated;
