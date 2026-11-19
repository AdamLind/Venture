-- =============================================================================
-- Sharing a date (Phase 5, #36)
--
-- The owner invites connections, each with a role: EDITOR (rename, change the
-- time, start it and adjust it live), COMMENTER (the default) or VIEWER.
-- Invitees accept or decline; while it's pending they can see what they're
-- invited to. Everyone going sees the date, its stops and their places,
-- including the owner's private ideas, only because they're on the date
-- (#77: they can't save, publish or plan with them). Comments go on the
-- whole date or one stop; people hear about them once per date.
--
-- Changes to members go through functions (no more self-edits of your own
-- row, which could change your own role).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Ideas (and so their places) on dates you're on
-- -----------------------------------------------------------------------------
create or replace function private.on_my_date(p_idea_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.itinerary_activities ia
    join public.itinerary_users iu on iu.itinerary_id = ia.itinerary_id
    where ia.activity_id = p_idea_id
      and iu.user_id = (select auth.uid())
      and iu.invite_status <> 'DECLINED'
  );
$$;
revoke execute on function private.on_my_date(bigint) from public, anon;
grant execute on function private.on_my_date(bigint) to authenticated;

drop policy if exists "Ideas on dates you're on" on public.activities;
create policy "Ideas on dates you're on" on public.activities for select to authenticated
  using (private.on_my_date(idea_id));

-- Seeing an idea through a date doesn't make it yours to keep: only
-- published ideas (or your own) can be saved
drop policy if exists "Can only save ideas you can see" on public.saved_activities;
drop policy if exists "Can only save published or own ideas" on public.saved_activities;
create policy "Can only save published or own ideas" on public.saved_activities for insert to authenticated
  with check (exists (
    select 1 from public.activities a
    where a.idea_id = saved_activities.activity_id
      and (a.visibility = 'PUBLISHED' or a.user_id = (select auth.uid()))
  ));


-- -----------------------------------------------------------------------------
-- 2. Members: invite, answer, roles (through functions only)
-- -----------------------------------------------------------------------------
drop policy if exists "Users can respond to their own invite" on public.itinerary_users;

alter table public.notifications
  add column if not exists itinerary_id bigint references public.itineraries (itinerary_id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'IDEA_PUBLISHED', 'IDEA_NEEDS_REVISION', 'IDEA_REJECTED',
  'IDEA_HELD', 'IDEA_REPORTED', 'REPORT_ACTIONED', 'REPORT_DISMISSED',
  'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'PARTNER_REQUEST', 'PARTNER_ACCEPTED',
  -- Dates (#36)
  'DATE_INVITE', 'DATE_INVITE_ACCEPTED', 'DATE_COMMENT'
));

create or replace function private.notify_date(p_user uuid, p_kind text, p_actor uuid, p_itinerary bigint, p_note text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, actor_id, itinerary_id, idea_title, note)
  select p_user, p_kind, p_actor, p_itinerary, i.title, p_note
  from public.itineraries i where i.itinerary_id = p_itinerary;
$$;
revoke execute on function private.notify_date(uuid, text, uuid, bigint, text) from public, anon, authenticated;

-- Invite connections (owner only). p_role null: the date's default role.
-- Someone who declined before can be invited again. Returns how many invited.
create or replace function public.invite_to_date(p_itinerary_id bigint, p_user_ids uuid[], p_role text default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := auth.uid();
  v_user  uuid;
  v_count integer := 0;
begin
  if private.itinerary_role(p_itinerary_id) is distinct from 'OWNER' then
    raise exception 'Only the date''s owner can invite people' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('EDITOR', 'COMMENTER', 'VIEWER') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;

  foreach v_user in array coalesce(p_user_ids, '{}') loop
    if v_user = v_me then
      continue;
    end if;
    if not exists (select 1 from public.connections where user_id = v_me and other_id = v_user) then
      raise exception 'You can only invite your connections' using errcode = '22023';
    end if;

    insert into public.itinerary_users (itinerary_id, user_id, role, invite_status)
    values (p_itinerary_id, v_user, p_role, 'PENDING')
    on conflict (itinerary_id, user_id) do update
      set role = excluded.role, invite_status = 'PENDING'
      where public.itinerary_users.invite_status = 'DECLINED';
    if found then
      v_count := v_count + 1;
      perform private.notify_date(v_user, 'DATE_INVITE', v_me, p_itinerary_id);
    end if;
  end loop;
  return v_count;
end;
$$;

-- Accept or decline an invite to you
create or replace function public.respond_to_date_invite(p_itinerary_id bigint, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  update public.itinerary_users
  set invite_status = case when p_accept then 'ACCEPTED' else 'DECLINED' end
  where itinerary_id = p_itinerary_id and user_id = auth.uid()
    and role is distinct from 'OWNER' and invite_status = 'PENDING';
  if not found then
    raise exception 'That invite isn''t there anymore' using errcode = 'P0002';
  end if;

  if p_accept then
    select user_id into v_owner from public.itinerary_users
    where itinerary_id = p_itinerary_id and role = 'OWNER';
    if v_owner is not null then
      perform private.notify_date(v_owner, 'DATE_INVITE_ACCEPTED', auth.uid(), p_itinerary_id);
    end if;
  end if;
end;
$$;

-- Change someone's role (owner only; null: the date's default)
create or replace function public.set_date_role(p_itinerary_id bigint, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.itinerary_role(p_itinerary_id) is distinct from 'OWNER' then
    raise exception 'Only the date''s owner can change roles' using errcode = '42501';
  end if;
  if p_role is not null and p_role not in ('EDITOR', 'COMMENTER', 'VIEWER') then
    raise exception 'Unknown role' using errcode = '22023';
  end if;
  update public.itinerary_users set role = p_role
  where itinerary_id = p_itinerary_id and user_id = p_user_id and role is distinct from 'OWNER';
  if not found then
    raise exception 'They''re not on this date' using errcode = 'P0002';
  end if;
end;
$$;

-- Everyone on a date (members only), with names (people you plan with see
-- them). Someone either of you forgot shows as nobody: no name or photo.
create or replace function public.date_members(p_itinerary_id bigint)
returns table (
  user_id uuid,
  username text,
  first_name text,
  last_name text,
  profile_image_url text,
  role text,
  invite_status text,
  masked boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select iu.user_id,
         case when m.masked then null else u.username end,
         case when m.masked then null else u.first_name end,
         case when m.masked then null else u.last_name end,
         case when m.masked then null else u.profile_image_url end,
         coalesce(iu.role, i.default_role),
         iu.invite_status,
         m.masked
  from public.itinerary_users iu
  join public.itineraries i on i.itinerary_id = iu.itinerary_id
  join public.users u on u.user_id = iu.user_id
  cross join lateral (
    select iu.user_id <> (select auth.uid()) and exists (
      select 1 from public.forgotten_users f
      where (f.user_id = (select auth.uid()) and f.forgotten_id = iu.user_id)
         or (f.user_id = iu.user_id and f.forgotten_id = (select auth.uid()))
    ) as masked
  ) m
  where iu.itinerary_id = p_itinerary_id
    and private.is_itinerary_member(p_itinerary_id)
  order by (coalesce(iu.role, '') = 'OWNER') desc, iu.created_at;
$$;

revoke execute on function
  public.invite_to_date(bigint, uuid[], text),
  public.respond_to_date_invite(bigint, boolean),
  public.set_date_role(bigint, uuid, text),
  public.date_members(bigint)
from public, anon;
grant execute on function
  public.invite_to_date(bigint, uuid[], text),
  public.respond_to_date_invite(bigint, boolean),
  public.set_date_role(bigint, uuid, text),
  public.date_members(bigint)
to authenticated;


-- -----------------------------------------------------------------------------
-- 3. Comments: on the whole date, or one stop
-- -----------------------------------------------------------------------------
create table if not exists public.itinerary_comments (
  comment_id   bigint generated always as identity primary key,
  itinerary_id bigint not null references public.itineraries (itinerary_id) on delete cascade,
  stop_id      bigint references public.itinerary_activities (stop_id) on delete set null,
  user_id      uuid not null default auth.uid() references public.users (user_id) on delete cascade,
  body         text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index if not exists itinerary_comments_itinerary_idx on public.itinerary_comments (itinerary_id, created_at);

alter table public.itinerary_comments enable row level security;
revoke all on public.itinerary_comments from anon, authenticated;
grant select, insert, delete on public.itinerary_comments to authenticated;

-- Everyone going reads them (pending invitees don't yet)
drop policy if exists "People on the date read comments" on public.itinerary_comments;
create policy "People on the date read comments" on public.itinerary_comments for select to authenticated
  using (private.itinerary_role(itinerary_id) is not null);

drop policy if exists "Commenters comment" on public.itinerary_comments;
create policy "Commenters comment" on public.itinerary_comments for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.itinerary_role(itinerary_id) in ('OWNER', 'EDITOR', 'COMMENTER')
    and (stop_id is null or exists (
      select 1 from public.itinerary_activities ia
      where ia.stop_id = itinerary_comments.stop_id and ia.itinerary_id = itinerary_comments.itinerary_id
    ))
  );

drop policy if exists "Delete your own comments, owners any" on public.itinerary_comments;
create policy "Delete your own comments, owners any" on public.itinerary_comments for delete to authenticated
  using (user_id = (select auth.uid()) or private.itinerary_role(itinerary_id) = 'OWNER');

-- A new comment: one unseen alert per date for everyone else going
create or replace function private.on_date_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := left(btrim(new.body), 140);
begin
  update public.notifications n
  set note = v_note, actor_id = new.user_id, created_at = now()
  from public.itinerary_users iu
  where n.user_id = iu.user_id
    and iu.itinerary_id = new.itinerary_id and iu.invite_status = 'ACCEPTED'
    and iu.user_id <> new.user_id
    and n.kind = 'DATE_COMMENT' and n.itinerary_id = new.itinerary_id and n.seen_at is null;

  insert into public.notifications (user_id, kind, actor_id, itinerary_id, idea_title, note)
  select iu.user_id, 'DATE_COMMENT', new.user_id, new.itinerary_id, i.title, v_note
  from public.itinerary_users iu
  join public.itineraries i on i.itinerary_id = iu.itinerary_id
  where iu.itinerary_id = new.itinerary_id and iu.invite_status = 'ACCEPTED'
    and iu.user_id <> new.user_id
    and not exists (
      select 1 from public.notifications n
      where n.user_id = iu.user_id and n.kind = 'DATE_COMMENT'
        and n.itinerary_id = new.itinerary_id and n.seen_at is null
    );
  return new;
end;
$$;
revoke execute on function private.on_date_comment() from public, anon, authenticated;

drop trigger if exists itinerary_comments_notify on public.itinerary_comments;
create trigger itinerary_comments_notify
  after insert on public.itinerary_comments
  for each row execute function private.on_date_comment();

-- Comment authors: people on the same date already see each other
-- (users policy "Users can read people on their dates")
