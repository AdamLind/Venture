-- =============================================================================
-- Admins edit the official account's ideas in the app (#71)
--
-- The launch ideas are posted by an official account (@system for now) that
-- nobody signs in as. Admins fix them in the app instead: the same form as
-- posting, keeping their review status.
--
-- 1. users.official marks that account (the import sets it). Only the
--    server sets it, so nobody can make their own account official
-- 2. Admins can edit official ideas and their tags (not move them to
--    another owner)
-- 3. activities.import_hash: what the import last saved, so a re-run can
--    tell an idea was changed in the app and leave it alone. Only the
--    server sets it, like import_key
-- =============================================================================

-- 1. The official account ------------------------------------------------------
alter table public.users
  add column if not exists official boolean not null default false;

comment on column public.users.official is
  'The app''s own account (posts the launch ideas, #71); set by the server only';

-- Readable like the username (the app shows admins Edit on its ideas);
-- users' columns are granted one by one, and nobody may update this one
grant select (official) on public.users to authenticated;

create or replace function private.guard_official()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.official := case when tg_op = 'INSERT' then false else old.official end;
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_official on public.users;
create trigger users_guard_official
  before insert or update on public.users
  for each row execute function private.guard_official();

create or replace function private.is_official(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select u.official from public.users u where u.user_id = p_user_id), false);
$$;

revoke execute on function private.is_official(uuid) from public, anon;
grant execute on function private.is_official(uuid) to authenticated;

-- 2. Admins edit official ideas ---------------------------------------------------
-- (moderators already see ideas in review; admins also see private official
-- ones, like retired launch ideas)
drop policy if exists "Admins see official ideas" on public.activities;
create policy "Admins see official ideas"
  on public.activities for select to authenticated
  using ((select private.is_admin()) and private.is_official(user_id));

drop policy if exists "Admins edit official ideas" on public.activities;
create policy "Admins edit official ideas"
  on public.activities for update to authenticated
  using ((select private.is_admin()) and private.is_official(user_id))
  with check ((select private.is_admin()) and private.is_official(user_id));

drop policy if exists "Admins tag official ideas" on public.activity_tags;
create policy "Admins tag official ideas"
  on public.activity_tags for insert to authenticated
  with check (
    (select private.is_admin())
    and exists (select 1 from public.activities a where a.idea_id = activity_tags.idea_id and private.is_official(a.user_id))
  );

drop policy if exists "Admins untag official ideas" on public.activity_tags;
create policy "Admins untag official ideas"
  on public.activity_tags for delete to authenticated
  using (
    (select private.is_admin())
    and exists (select 1 from public.activities a where a.idea_id = activity_tags.idea_id and private.is_official(a.user_id))
  );

-- 3. What the import last saved -------------------------------------------------
alter table public.activities
  add column if not exists import_hash text;

comment on column public.activities.import_hash is
  'Imported ideas only: a fingerprint of what the import last saved, to spot edits made in the app';

-- Only the server sets the key and the fingerprint (replaces the key-only guard)
create or replace function private.guard_import_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    if tg_op = 'INSERT' then
      new.import_key := null;
      new.import_hash := null;
    else
      new.import_key := old.import_key;
      new.import_hash := old.import_hash;
    end if;
  end if;
  return new;
end;
$$;
