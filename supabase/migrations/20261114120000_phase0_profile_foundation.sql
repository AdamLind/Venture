-- =============================================================================
-- Phase 0: profile foundation
--
-- 1. Signup function hardening (fixed search_path, not callable over the API)
-- 2. Private schema + helper functions used by RLS policies
-- 3. user_preferences: private per-user settings, birthdate, profile code
-- 4. users: locked down (no more "everyone can read everyone"), editable by owner
-- 5. activities: age-filtered reads, users can't self-publish past moderation
-- 6. itineraries / stops / members: shape for saved + shared dates, role-based RLS
-- 7. saved_activities, captures: policies (they had none, so the app was blocked)
-- 8. captures storage bucket made private, readable by date members only
-- 9. create_itinerary(): one call to save a finalized date atomically
--
-- All itinerary tables were empty when this was written (2026-11-14), so the
-- restructuring below drops nothing of value.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 0. Private schema (NOT exposed through the API) for policy helper functions
-- -----------------------------------------------------------------------------
create schema if not exists private;
grant usage on schema private to authenticated;


-- -----------------------------------------------------------------------------
-- 1. user_preferences (private: only the owner can read or write their row)
-- -----------------------------------------------------------------------------
create or replace function private.new_profile_code()
returns text
language sql
volatile
set search_path = ''
as $$
  -- 12 URL-safe characters; used in the profile QR code / share link (Phase 4)
  select translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_');
$$;

create table public.user_preferences (
  user_id               uuid primary key references public.users (user_id) on delete cascade,
  birthdate             date,
  profile_code          text not null unique default private.new_profile_code(),
  home_label            text check (char_length(home_label) <= 120),
  home_lat              double precision check (home_lat between -90 and 90),
  home_lng              double precision check (home_lng between -180 and 180),
  default_budget        integer not null default 50 check (default_budget >= 0),
  default_travel_miles  integer not null default 10 check (default_travel_miles > 0),
  default_modality      text not null default 'GO_OUT' check (default_modality in ('STAY_IN', 'GO_OUT')),
  default_head_count    integer not null default 2 check (default_head_count >= 1),
  vibes                 text[] not null default '{}',
  dietary               text[] not null default '{}',
  onboarded_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Birthdate rules: must be plausible, user must be 16+, and once set it can't be
-- changed from the app (stops a 17-year-old from editing their way to 21).
create or replace function private.user_preferences_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.birthdate is not null
     and new.birthdate is distinct from old.birthdate then
    raise exception 'Birthdate cannot be changed once set'
      using errcode = 'check_violation';
  end if;

  if new.birthdate is not null
     and (tg_op = 'INSERT' or new.birthdate is distinct from old.birthdate) then
    if new.birthdate > current_date or new.birthdate < date '1900-01-01' then
      raise exception 'Birthdate is not valid' using errcode = 'check_violation';
    end if;
    if extract(year from age(current_date, new.birthdate)) < 16 then
      raise exception 'Venture requires users to be at least 16'
        using errcode = 'check_violation';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger user_preferences_guard
  before insert or update on public.user_preferences
  for each row execute function private.user_preferences_guard();

alter table public.user_preferences enable row level security;

create policy "Users can read own preferences"
  on public.user_preferences for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can update own preferences"
  on public.user_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are created by the signup function only. profile_code is not client-writable
-- (rotation will be a dedicated function in Phase 4).
revoke all on public.user_preferences from anon, authenticated;
grant select on public.user_preferences to authenticated;
grant update (
  birthdate, home_label, home_lat, home_lng,
  default_budget, default_travel_miles, default_modality, default_head_count,
  vibes, dietary, onboarded_at
) on public.user_preferences to authenticated;

-- Backfill existing users
insert into public.user_preferences (user_id)
select user_id from public.users
on conflict (user_id) do nothing;


-- -----------------------------------------------------------------------------
-- 2. Signup function: fixed search_path, also creates the preferences row,
--    and is no longer callable via /rest/v1/rpc
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Temporary username like 'user_a1b2c3d4' until onboarding replaces it
  insert into public.users (user_id, username)
  values (new.id, 'user_' || substr(new.id::text, 1, 8));

  insert into public.user_preferences (user_id)
  values (new.id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- 3. Age helper
-- -----------------------------------------------------------------------------
create or replace function private.current_user_age()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select extract(year from age(current_date, p.birthdate))::integer
  from public.user_preferences p
  where p.user_id = (select auth.uid());
$$;


-- -----------------------------------------------------------------------------
-- 4. Itinerary tables: reshape for saved + shared dates
-- -----------------------------------------------------------------------------

-- itineraries
alter table public.itineraries
  drop column date_planned,
  add column created_by     uuid default auth.uid() references public.users (user_id) on delete set null,
  add column starts_at      timestamptz not null,
  add column ends_at        timestamptz not null,
  add column status         text not null default 'PLANNED'
    check (status in ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED')),
  add column prefs_snapshot jsonb,
  -- Role for members who have no per-person role set. The owner sets this to
  -- 'VIEWER' to restrict everyone, or overrides per person on itinerary_users.
  add column default_role   text not null default 'COMMENTER'
    check (default_role in ('EDITOR', 'COMMENTER', 'VIEWER')),
  add constraint itineraries_time_order check (ends_at > starts_at);

alter table public.itineraries alter column title set not null;

-- itinerary_users: OWNER / EDITOR / COMMENTER / VIEWER; NULL role = use default_role
alter table public.itinerary_users drop constraint itinerary_users_role_check;
alter table public.itinerary_users alter column role drop default;
alter table public.itinerary_users
  add constraint itinerary_users_role_check
    check (role is null or role in ('OWNER', 'EDITOR', 'COMMENTER', 'VIEWER'));
alter table public.itinerary_users alter column invite_status set not null;

create index itinerary_users_user_id_idx on public.itinerary_users (user_id);

-- itinerary_activities: give each stop its own id (so stop comments survive swaps)
-- and its own times
alter table public.itinerary_activities drop constraint itinerary_activities_pkey;
alter table public.itinerary_activities
  add column stop_id   bigint generated always as identity primary key,
  add column starts_at timestamptz,
  add column ends_at   timestamptz;
alter table public.itinerary_activities alter column sort_order set not null;
alter table public.itinerary_activities
  add constraint itinerary_activities_order_unique
    unique (itinerary_id, sort_order) deferrable initially deferred;

-- captures: photos belong to a person; deleting a date deletes its photos
alter table public.captures alter column user_id set not null;
alter table public.captures drop constraint captures_itinerary_id_fkey;
alter table public.captures
  add constraint captures_itinerary_id_fkey
    foreign key (itinerary_id) references public.itineraries (itinerary_id) on delete cascade;
create index captures_itinerary_id_idx on public.captures (itinerary_id);

-- users -> auth.users must cascade or account deletion fails
alter table public.users drop constraint users_user_id_fkey;
alter table public.users
  add constraint users_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

create index if not exists activities_user_id_idx on public.activities (user_id);


-- -----------------------------------------------------------------------------
-- 5. Membership helpers (SECURITY DEFINER so policies on itinerary_users don't
--    recurse into themselves)
-- -----------------------------------------------------------------------------
create or replace function private.is_itinerary_member(p_itinerary_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Pending invitees count as members for viewing, so they can decide to accept
  select exists (
    select 1
    from public.itinerary_users iu
    where iu.itinerary_id = p_itinerary_id
      and iu.user_id = (select auth.uid())
      and iu.invite_status <> 'DECLINED'
  );
$$;

create or replace function private.itinerary_role(p_itinerary_id bigint)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- Effective role for the current user; NULL unless they've accepted
  select coalesce(iu.role, i.default_role)
  from public.itinerary_users iu
  join public.itineraries i on i.itinerary_id = iu.itinerary_id
  where iu.itinerary_id = p_itinerary_id
    and iu.user_id = (select auth.uid())
    and iu.invite_status = 'ACCEPTED';
$$;

create or replace function private.can_edit_itinerary(p_itinerary_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.itinerary_role(p_itinerary_id) in ('OWNER', 'EDITOR'), false);
$$;

create or replace function private.shares_itinerary_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.itinerary_users mine
    join public.itinerary_users theirs on theirs.itinerary_id = mine.itinerary_id
    where mine.user_id = (select auth.uid())
      and mine.invite_status <> 'DECLINED'
      and theirs.user_id = p_user_id
      and theirs.invite_status <> 'DECLINED'
  );
$$;

-- Storage path convention for captures: {user_id}/{itinerary_id}/{filename}
create or replace function private.can_view_capture(p_object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := (storage.foldername(p_object_name))[2];
begin
  if v_folder is null or v_folder !~ '^\d+$' then
    return false;
  end if;
  return private.is_itinerary_member(v_folder::bigint);
end;
$$;

revoke execute on all functions in schema private from public;
grant execute on function
  private.current_user_age(),
  private.is_itinerary_member(bigint),
  private.itinerary_role(bigint),
  private.can_edit_itinerary(bigint),
  private.shares_itinerary_with(uuid),
  private.can_view_capture(text)
to authenticated;


-- -----------------------------------------------------------------------------
-- 6. users: no more global read. Visible to: yourself, people you share a date
--    with, and (username attribution in Explore) creators of published ideas.
--    Connections (Phase 4) will add one more policy here.
-- -----------------------------------------------------------------------------
drop policy "Allow public read access to users" on public.users;

create policy "Users can read own profile"
  on public.users for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can read people on their dates"
  on public.users for select to authenticated
  using (private.shares_itinerary_with(user_id));

create policy "Creators of published ideas are visible"
  on public.users for select to authenticated
  using (exists (
    select 1 from public.activities a
    where a.user_id = users.user_id and a.visibility = 'PUBLISHED'
  ));

create policy "Users can update own profile"
  on public.users for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.users from anon;
revoke insert, update, delete on public.users from authenticated;
grant update (username, first_name, last_name, profile_image_url) on public.users to authenticated;

alter table public.users
  add constraint users_username_format check (username ~ '^[a-z0-9_.]{3,30}$');


-- -----------------------------------------------------------------------------
-- 7. activities: age-filtered reads; no self-publishing past moderation
-- -----------------------------------------------------------------------------
drop policy "Published activities are public" on public.activities;
create policy "Published activities visible to old-enough users"
  on public.activities for select to authenticated
  using (
    visibility = 'PUBLISHED'
    -- Unknown age (not onboarded yet) is treated as the minimum, 16
    and min_age <= (select coalesce(private.current_user_age(), 16))
  );

drop policy "Users can create activities" on public.activities;
create policy "Users can create activities for review"
  on public.activities for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and visibility in ('PRIVATE', 'PENDING_REVIEW')
  );

-- Editing a published idea sends it back to review
drop policy "Users can update own activities" on public.activities;
create policy "Users can update own activities"
  on public.activities for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and visibility in ('PRIVATE', 'PENDING_REVIEW')
  );


-- -----------------------------------------------------------------------------
-- 8. Itinerary policies
-- -----------------------------------------------------------------------------

-- itineraries: created only through create_itinerary(); editors can change
-- details; only the owner can delete. Roles/default_role change via an
-- owner-only function in Phase 5.
create policy "Members can view itineraries"
  on public.itineraries for select to authenticated
  using (private.is_itinerary_member(itinerary_id));

create policy "Owners and editors can update itineraries"
  on public.itineraries for update to authenticated
  using (private.can_edit_itinerary(itinerary_id))
  with check (private.can_edit_itinerary(itinerary_id));

create policy "Owners can delete itineraries"
  on public.itineraries for delete to authenticated
  using (private.itinerary_role(itinerary_id) = 'OWNER');

revoke all on public.itineraries from anon;
revoke insert, update on public.itineraries from authenticated;
grant update (title, starts_at, ends_at, status) on public.itineraries to authenticated;

-- itinerary_activities (stops)
create policy "Members can view stops"
  on public.itinerary_activities for select to authenticated
  using (private.is_itinerary_member(itinerary_id));

create policy "Owners and editors can add stops"
  on public.itinerary_activities for insert to authenticated
  with check (private.can_edit_itinerary(itinerary_id));

create policy "Owners and editors can change stops"
  on public.itinerary_activities for update to authenticated
  using (private.can_edit_itinerary(itinerary_id))
  with check (private.can_edit_itinerary(itinerary_id));

create policy "Owners and editors can remove stops"
  on public.itinerary_activities for delete to authenticated
  using (private.can_edit_itinerary(itinerary_id));

revoke all on public.itinerary_activities from anon;

-- itinerary_users (members): invites are added by functions in Phase 5.
-- Members see each other; you can accept/decline your own invite; you can
-- leave (unless you're the owner); the owner can remove others.
create policy "Members can view fellow members"
  on public.itinerary_users for select to authenticated
  using (private.is_itinerary_member(itinerary_id));

create policy "Users can respond to their own invite"
  on public.itinerary_users for update to authenticated
  using (user_id = (select auth.uid()) and role is distinct from 'OWNER')
  with check (user_id = (select auth.uid()) and role is distinct from 'OWNER');

create policy "Members can leave, owners can remove"
  on public.itinerary_users for delete to authenticated
  using (
    (user_id = (select auth.uid()) and role is distinct from 'OWNER')
    or (private.itinerary_role(itinerary_id) = 'OWNER' and user_id <> (select auth.uid()))
  );

revoke all on public.itinerary_users from anon;
revoke insert, update on public.itinerary_users from authenticated;
grant update (invite_status) on public.itinerary_users to authenticated;


-- -----------------------------------------------------------------------------
-- 9. saved_activities (Bucket List) - own rows only for now.
--    Partner sharing arrives with connections in Phase 4.
-- -----------------------------------------------------------------------------
create policy "Users can view own saved activities"
  on public.saved_activities for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can save activities"
  on public.saved_activities for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Users can unsave activities"
  on public.saved_activities for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.saved_activities from anon;
revoke update on public.saved_activities from authenticated;


-- -----------------------------------------------------------------------------
-- 10. captures (date photos)
-- -----------------------------------------------------------------------------
create policy "Owners and date members can view captures"
  on public.captures for select to authenticated
  using (
    user_id = (select auth.uid())
    or (itinerary_id is not null and private.is_itinerary_member(itinerary_id))
  );

create policy "Users can add captures to their own dates"
  on public.captures for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (itinerary_id is null or private.is_itinerary_member(itinerary_id))
  );

create policy "Users can edit own capture captions"
  on public.captures for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Users can delete own captures"
  on public.captures for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.captures from anon;
revoke update on public.captures from authenticated;
grant update (caption) on public.captures to authenticated;

-- Storage: captures bucket becomes private (use signed URLs in the app)
update storage.buckets set public = false where id = 'captures';

drop policy "Captures are publicly accessible" on storage.objects;
create policy "Captures visible to owner and date members"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'captures'
    and (owner = (select auth.uid()) or private.can_view_capture(name))
  );


-- -----------------------------------------------------------------------------
-- 11. create_itinerary(): save a finalized date + owner membership + stops in
--     one transaction. Called from the builder's Finalize button (Phase 2).
--
--     p_stops: [{ "activity_id": 12, "starts_at": "...", "ends_at": "..." }, ...]
--     in timeline order.
-- -----------------------------------------------------------------------------
create or replace function public.create_itinerary(
  p_title          text,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_stops          jsonb,
  p_prefs_snapshot jsonb default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_age          integer := coalesce(private.current_user_age(), 16);
  v_itinerary_id bigint;
  v_activity_id  bigint;
  v_rec          record;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  if p_stops is null
     or jsonb_typeof(p_stops) <> 'array'
     or jsonb_array_length(p_stops) = 0 then
    raise exception 'An itinerary needs at least one stop'
      using errcode = 'check_violation';
  end if;

  insert into public.itineraries (title, starts_at, ends_at, status, prefs_snapshot, created_by)
  values (p_title, p_starts_at, p_ends_at, 'PLANNED', p_prefs_snapshot, v_uid)
  returning itinerary_id into v_itinerary_id;

  insert into public.itinerary_users (itinerary_id, user_id, role, invite_status)
  values (v_itinerary_id, v_uid, 'OWNER', 'ACCEPTED');

  for v_rec in
    select s.value as stop, s.ordinality as pos
    from jsonb_array_elements(p_stops) with ordinality as s(value, ordinality)
  loop
    v_activity_id := (v_rec.stop ->> 'activity_id')::bigint;

    -- This function bypasses RLS, so re-check that the caller may use the activity
    if not exists (
      select 1 from public.activities a
      where a.idea_id = v_activity_id
        and (a.user_id = v_uid
             or (a.visibility = 'PUBLISHED' and a.min_age <= v_age))
    ) then
      raise exception 'Activity % is not available', v_activity_id
        using errcode = '42501';
    end if;

    insert into public.itinerary_activities (itinerary_id, activity_id, sort_order, starts_at, ends_at)
    values (
      v_itinerary_id,
      v_activity_id,
      v_rec.pos,
      (v_rec.stop ->> 'starts_at')::timestamptz,
      (v_rec.stop ->> 'ends_at')::timestamptz
    );
  end loop;

  return v_itinerary_id;
end;
$$;

revoke execute on function public.create_itinerary(text, timestamptz, timestamptz, jsonb, jsonb)
  from public, anon;
grant execute on function public.create_itinerary(text, timestamptz, timestamptz, jsonb, jsonb)
  to authenticated;
