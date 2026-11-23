-- =============================================================================
-- Live photos (#38, #39, #45)
--
-- Photos are taken in the app during a date, never picked from the camera
-- roll or added later. public.captures (unused until now, no rows) becomes:
--   - storage_path / thumb_path: the photo (1080 px) and its thumbnail in
--     the private `captures` bucket, at {user_id}/{itinerary_id}/...
--   - kind: STOP (taken at a stop: activity_id is that idea) or END (the
--     end-of-date photo, no stop)
--   - created_at: the server's time, never the app's
-- Adding one: only while the date is live (ACTIVE), by someone who's on it
-- (accepted), at most 50 per person per date.
-- Seeing them: everyone on the date, and your person on dates they made
-- (is_itinerary_member already covers both, as it does for the date).
-- Deleting: your own (the app removes the files first).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The table
-- -----------------------------------------------------------------------------
alter table public.captures rename column image_url to storage_path;
alter table public.captures
  add column if not exists thumb_path text,
  add column if not exists kind text not null default 'STOP';

alter table public.captures drop constraint if exists captures_kind_check;
alter table public.captures add constraint captures_kind_check check (kind in ('STOP', 'END'));
-- A stop photo is from a stop; the end-of-date photo isn't. (An idea deleted
-- later leaves its stop photos without one: activity_id goes null.)
alter table public.captures drop constraint if exists captures_end_has_no_stop;
alter table public.captures add constraint captures_end_has_no_stop check (kind = 'STOP' or activity_id is null);

alter table public.captures alter column itinerary_id set not null;
alter table public.captures alter column storage_path set not null;
alter table public.captures alter column created_at set default now();
alter table public.captures alter column created_at set not null;

alter table public.captures drop constraint if exists captures_caption_length;
alter table public.captures add constraint captures_caption_length check (char_length(caption) <= 300);

create index if not exists captures_user_id_idx on public.captures (user_id);
create index if not exists captures_activity_id_idx on public.captures (activity_id);

comment on table public.captures is
  'Live photos taken during a date (#38): STOP (at a stop) or END (end of the date). Files in the private captures bucket';


-- -----------------------------------------------------------------------------
-- 2. Adding one: live dates only, from the app's camera
-- -----------------------------------------------------------------------------
create or replace function private.can_add_capture(
  p_itinerary_id bigint,
  p_activity_id  bigint,
  p_kind         text,
  p_path         text,
  p_thumb        text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    -- On it (not just invited), and it's happening
    exists (
      select 1
      from public.itinerary_users iu
      join public.itineraries i on i.itinerary_id = iu.itinerary_id
      where iu.itinerary_id = p_itinerary_id
        and iu.user_id = (select auth.uid())
        and iu.invite_status = 'ACCEPTED'
        and i.status = 'ACTIVE'
    )
    -- A stop photo is from one of its stops
    and (p_kind = 'END' or exists (
      select 1 from public.itinerary_activities ia
      where ia.itinerary_id = p_itinerary_id and ia.activity_id = p_activity_id
    ))
    -- Its files are yours, in this date's folder
    and p_path like (select auth.uid())::text || '/' || p_itinerary_id || '/%'
    and (p_thumb is null or p_thumb like (select auth.uid())::text || '/' || p_itinerary_id || '/%');
$$;

revoke execute on function private.can_add_capture(bigint, bigint, text, text, text) from public, anon;
grant execute on function private.can_add_capture(bigint, bigint, text, text, text) to authenticated;

drop policy if exists "Users can add captures to their own dates" on public.captures;
create policy "People on a live date add photos"
  on public.captures for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.can_add_capture(itinerary_id, activity_id, kind, storage_path, thumb_path)
  );

-- Only these come from the app (the time is the server's)
revoke insert on public.captures from authenticated;
grant insert (itinerary_id, activity_id, kind, storage_path, thumb_path, caption) on public.captures to authenticated;

-- At most 50 each per date (they're photos of a date, not a camera roll)
create or replace function private.limit_captures()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.captures
      where itinerary_id = new.itinerary_id and user_id = new.user_id) >= 50 then
    raise exception 'That''s 50 photos on this date, the most there can be' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function private.limit_captures() from public, anon, authenticated;

drop trigger if exists captures_limit on public.captures;
create trigger captures_limit
  before insert on public.captures
  for each row
  execute function private.limit_captures();


-- -----------------------------------------------------------------------------
-- 3. Seeing and deleting (unchanged rules, restated)
-- -----------------------------------------------------------------------------
drop policy if exists "Owners and date members can view captures" on public.captures;
create policy "Owners and date members can view captures"
  on public.captures for select to authenticated
  using (user_id = (select auth.uid()) or private.is_itinerary_member(itinerary_id));


-- -----------------------------------------------------------------------------
-- 4. The files: uploaded into your own folder for a date you can add to
-- -----------------------------------------------------------------------------
drop policy if exists "Users can upload own captures" on storage.objects;
create policy "Users can upload own captures"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'captures'
    and owner = (select auth.uid())
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~ '^\d+$'
    and exists (
      select 1
      from public.itinerary_users iu
      join public.itineraries i on i.itinerary_id = iu.itinerary_id
      where iu.itinerary_id = ((storage.foldername(name))[2])::bigint
        and iu.user_id = (select auth.uid())
        and iu.invite_status = 'ACCEPTED'
        and i.status = 'ACTIVE'
    )
  );

-- JPEGs only, and not huge (they're 1080 px)
update storage.buckets
set file_size_limit = 5 * 1024 * 1024, allowed_mime_types = array['image/jpeg']
where id = 'captures';
