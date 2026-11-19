-- =============================================================================
-- Partner sharing (#35): a shared Bucket List, and seeing each other's dates
--
-- Bucket List: each save is shared with your partner or private
-- (saved_activities.shared). New saves are shared by default; saves from
-- before this are private (they may already hold a surprise). Your partner
-- sees your shared saves, including your own private ideas you chose to
-- share ("let Sam keep this spot", #77), but can't save, publish or plan
-- with those.
--
-- Dates: your partner sees the dates you made (view only) unless it's a
-- surprise (itineraries.is_surprise), until you invite them or it's over.
--
-- Surprise mode (user_preferences.surprise_mode): while it's on, new saves
-- stay private and new dates start as surprises (set here, as the date is
-- created, so it's never visible in between).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Columns
-- -----------------------------------------------------------------------------
alter table public.saved_activities
  add column if not exists shared boolean not null default false;
-- From now on the app says shared or private; a save that says nothing is shared
alter table public.saved_activities alter column shared set default true;

alter table public.user_preferences
  add column if not exists surprise_mode boolean not null default false;

alter table public.itineraries
  add column if not exists is_surprise boolean not null default false;


-- -----------------------------------------------------------------------------
-- 2. Your partner
-- -----------------------------------------------------------------------------
create or replace function private.my_partner()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select partner_id from public.partners where user_id = (select auth.uid());
$$;
revoke execute on function private.my_partner() from public, anon;
grant execute on function private.my_partner() to authenticated;


-- -----------------------------------------------------------------------------
-- 3. The shared Bucket List
-- -----------------------------------------------------------------------------
-- Change a save between shared and private (your own)
drop policy if exists "Users update own saves" on public.saved_activities;
create policy "Users update own saves" on public.saved_activities for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant update (shared) on public.saved_activities to authenticated;

drop policy if exists "Your partner's shared saves" on public.saved_activities;
create policy "Your partner's shared saves" on public.saved_activities for select to authenticated
  using (shared and user_id = private.my_partner());

-- Your partner shared one of their own private ideas: you can see it
create or replace function private.partner_shared_idea(p_idea_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.saved_activities s
    join public.activities a on a.idea_id = s.activity_id
    where s.activity_id = p_idea_id
      and s.shared
      and s.user_id = private.my_partner()
      and a.user_id = s.user_id
  );
$$;
revoke execute on function private.partner_shared_idea(bigint) from public, anon;
grant execute on function private.partner_shared_idea(bigint) to authenticated;

drop policy if exists "Ideas your partner shared" on public.activities;
create policy "Ideas your partner shared" on public.activities for select to authenticated
  using (private.partner_shared_idea(idea_id));


-- -----------------------------------------------------------------------------
-- 4. Your partner's dates (view only, not surprises)
-- -----------------------------------------------------------------------------
-- A date your partner made that isn't hidden from you
create or replace function private.partner_can_see(p_itinerary_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.itineraries i
    where i.itinerary_id = p_itinerary_id
      and i.created_by = private.my_partner()
      and (not i.is_surprise or i.status = 'COMPLETED')
  );
$$;
revoke execute on function private.partner_can_see(bigint) from public, anon;
grant execute on function private.partner_can_see(bigint) to authenticated;

-- Members (invited, not declined), and now your partner for their dates.
-- Seeing isn't a role: commenting and editing still need an accepted invite
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
  ) or private.partner_can_see(p_itinerary_id);
$$;

-- Ideas (and places) on those dates, like dates you're on
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
  ) or exists (
    select 1
    from public.itinerary_activities ia
    where ia.activity_id = p_idea_id
      and private.partner_can_see(ia.itinerary_id)
  );
$$;


-- -----------------------------------------------------------------------------
-- 5. Surprise mode: new dates start as surprises
-- -----------------------------------------------------------------------------
create or replace function private.surprise_by_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select up.surprise_mode from public.user_preferences up where up.user_id = new.created_by), false) then
    new.is_surprise := true;
  end if;
  return new;
end;
$$;
revoke execute on function private.surprise_by_default() from public, anon, authenticated;

drop trigger if exists itineraries_surprise_by_default on public.itineraries;
create trigger itineraries_surprise_by_default
  before insert on public.itineraries
  for each row execute function private.surprise_by_default();
