-- =============================================================================
-- Phase 3: in-app notifications (review outcomes for your ideas)
--
-- A row is created automatically when one of your ideas leaves review with a
-- decision: published, needs changes, or not approved. Owners can't set those
-- states themselves (activities RLS), so these always come from a reviewer.
--
-- The app shows unseen rows under "New" and marks them seen when you open the
-- panel; after that they're under "Earlier". Push notifications can later be
-- sent from this same table (database webhook / Edge Function on INSERT).
-- Additive only.
-- =============================================================================

create table public.notifications (
  notification_id bigint generated always as identity primary key,
  user_id uuid not null references public.users (user_id) on delete cascade,
  kind text not null check (
    kind in ('IDEA_PUBLISHED', 'IDEA_NEEDS_REVISION', 'IDEA_REJECTED')
  ),
  -- The idea it's about; the notification goes away if the idea is deleted
  idea_id bigint references public.activities (idea_id) on delete cascade,
  -- Snapshots at the time of the decision (the idea may change later)
  idea_title text,
  note text,
  created_at timestamptz not null default now(),
  -- null = new (unseen)
  seen_at timestamptz
);

create index notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Read your own; the only thing you can change is marking them seen
create policy "Users can read own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can mark own notifications seen"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (seen_at) on public.notifications to authenticated;
-- No client inserts or deletes: rows come from the trigger below

-- --- Trigger: a review decision on an idea notifies its owner ---------------
create or replace function private.notify_idea_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null
     or new.visibility is not distinct from old.visibility
     or new.visibility not in ('PUBLISHED', 'NEEDS_REVISION', 'REJECTED') then
    return new;
  end if;

  insert into public.notifications (user_id, kind, idea_id, idea_title, note)
  values (
    new.user_id,
    case new.visibility
      when 'PUBLISHED' then 'IDEA_PUBLISHED'
      when 'NEEDS_REVISION' then 'IDEA_NEEDS_REVISION'
      else 'IDEA_REJECTED'
    end,
    new.idea_id,
    new.title,
    nullif(btrim(new.moderation_note), '')
  );
  return new;
end;
$$;

revoke execute on function private.notify_idea_review() from public, anon, authenticated;

create trigger activities_notify_review
  after update of visibility on public.activities
  for each row
  execute function private.notify_idea_review();

-- --- Realtime: the bell updates as soon as a decision lands -----------------
alter publication supabase_realtime add table public.notifications;
