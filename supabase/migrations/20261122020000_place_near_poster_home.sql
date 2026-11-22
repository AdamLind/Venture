-- Reviewing a new place (#88): is its pin near the poster's saved home?
-- The likeliest "someone's yard" case. Staff get only yes or no, never
-- where anyone lives. The same distance the poster is warned at when
-- pinning (components/places/PlacePicker.tsx: NEAR_HOME_MILES, 0.3 mi).

create or replace function public.place_near_poster_home(p_idea_id bigint)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_near boolean;
begin
  if not private.is_moderator() then
    raise exception 'Only staff can check this' using errcode = '42501';
  end if;

  select public.st_dwithin(
           ven.coordinates,
           public.st_setsrid(public.st_makepoint(up.home_lng, up.home_lat), 4326)::public.geography,
           483  -- 0.3 miles, in meters
         )
    into v_near
  from public.activities a
  join public.venues ven on ven.venue_id = a.venue_id
  join public.user_preferences up on up.user_id = a.user_id
  where a.idea_id = p_idea_id
    and ven.coordinates is not null
    and up.home_lat is not null
    and up.home_lng is not null;

  return coalesce(v_near, false);
end;
$$;

revoke all on function public.place_near_poster_home(bigint) from public, anon;
grant execute on function public.place_near_poster_home(bigint) to authenticated;
