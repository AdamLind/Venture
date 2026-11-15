-- =============================================================================
-- Account deletion (App Store requirement: people must be able to delete their
-- account from inside the app)
--
-- 1. Published ideas outlive their creator. They can sit in other people's
--    dates and bucket lists, so deleting the creator detaches them (no name
--    shown) instead of cascading them away.
-- 2. public.delete_my_account(): deletes the caller's dates, unpublished ideas,
--    and auth user. Everything else (profile, preferences, saved ideas, date
--    memberships, capture rows) cascades from auth.users.
--
-- Storage files (avatars, captures) can't be deleted from SQL; the app removes
-- them through the Storage API before calling this.
-- =============================================================================

-- 1. Published ideas survive their creator --------------------------------------
alter table public.activities alter column user_id drop not null;

-- Same constraint name: the app embeds `users!activities_user_id_fkey`
alter table public.activities drop constraint activities_user_id_fkey;
alter table public.activities
  add constraint activities_user_id_fkey
  foreign key (user_id) references public.users (user_id) on delete set null;

-- 2. delete_my_account() ----------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;

  -- Dates they own go with them (stops, members, and captures cascade)
  delete from public.itineraries i
  where i.created_by = v_uid
     or exists (
       select 1
       from public.itinerary_users m
       where m.itinerary_id = i.itinerary_id
         and m.user_id = v_uid
         and m.role = 'OWNER'
     );

  -- Ideas nobody else can see (private, in review, rejected, needs revision)
  delete from public.activities
  where user_id = v_uid
    and visibility <> 'PUBLISHED';

  -- Cascades: public.users -> user_preferences, saved_activities,
  -- itinerary_users, captures; published activities -> user_id set null.
  -- Also removes their sessions and refresh tokens.
  delete from auth.users where id = v_uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
