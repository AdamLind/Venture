-- =============================================================================
-- Imported ideas (#71)
--
-- The launch ideas are written as files (content/ideas/*.json) and loaded by
-- mobile-client/scripts/import-ideas.mjs, posted by the official @venture
-- account. Each has a stable key ("provo/rock-canyon-sunset-walk"), so the
-- import can run again: a changed idea is updated (and goes back to review),
-- an unchanged one is left alone, and one taken out of the files can be
-- retired. Ideas posted in the app have no key.
-- =============================================================================

alter table public.activities
  add column if not exists import_key text
    check (import_key is null or import_key ~ '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)+$');

-- (a full unique constraint: many ideas have no key, and nulls never clash)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activities_import_key_key') then
    alter table public.activities add constraint activities_import_key_key unique (import_key);
  end if;
end;
$$;

comment on column public.activities.import_key is
  'Imported ideas only (content/ideas/*.json, #71): the stable key the import matches on';

-- Only the server (the import, with the secret key) sets keys: an idea
-- posted in the app never gets one, and an edit in the app keeps whatever
-- it had (so nobody can take over an imported idea's key)
create or replace function private.guard_import_key()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    new.import_key := case when tg_op = 'INSERT' then null else old.import_key end;
  end if;
  return new;
end;
$$;

drop trigger if exists activities_guard_import_key on public.activities;
create trigger activities_guard_import_key
  before insert or update on public.activities
  for each row execute function private.guard_import_key();
