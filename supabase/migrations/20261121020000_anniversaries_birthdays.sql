-- =============================================================================
-- Anniversaries and birthdays (#87): plan around the dates that matter most.
--
--   partners.anniversary .............. set once by either partner, on both
--                                        rows of the link (set_anniversary);
--                                        ending the link deletes the rows, so
--                                        it goes too
--   user_preferences.share_birthday ... off unless you turn it on: then your
--                                        partner sees your birthday's month
--                                        and day (never the year or your age)
--   partner_dates() ................... what you may know: your anniversary,
--                                        your partner's birthday (if shared),
--                                        and the vibes they pick most when
--                                        they plan (their favorites)
-- =============================================================================

alter table public.partners add column if not exists anniversary date;
comment on column public.partners.anniversary is
  'The couple''s anniversary (set on both rows of the link by set_anniversary)';

alter table public.user_preferences add column if not exists share_birthday boolean not null default false;
comment on column public.user_preferences.share_birthday is
  'Your partner may see your birthday''s month and day (partner_dates())';
grant update (share_birthday) on public.user_preferences to authenticated;

-- Set (or clear, with null) your anniversary on both sides of the link
create or replace function public.set_anniversary(p_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_partner uuid;
begin
  select partner_id into v_partner from public.partners where user_id = (select auth.uid());
  if v_partner is null then
    raise exception 'You don''t have a partner link' using errcode = 'P0002';
  end if;
  if p_date is not null and p_date > current_date then
    raise exception 'An anniversary can''t be in the future' using errcode = '22023';
  end if;
  update public.partners set anniversary = p_date where user_id in ((select auth.uid()), v_partner);
end;
$$;

revoke all on function public.set_anniversary(date) from public, anon;
grant execute on function public.set_anniversary(date) to authenticated;

-- Your anniversary, your partner's birthday (only if they share it: month
-- and day), and their favorite vibes: the three they pick most across the
-- dates they've planned (not surprises, which might be for you; only once
-- they've planned at least two with vibes)
create or replace function public.partner_dates()
returns table (anniversary date, partner_birth_month int, partner_birth_day int, partner_vibes text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.anniversary,
    case when up.share_birthday then extract(month from up.birthdate)::int end,
    case when up.share_birthday then extract(day from up.birthdate)::int end,
    (
      select array_agg(t.vibe order by t.uses desc, t.vibe)
      from (
        select v.vibe, count(*) as uses
        from public.itineraries i
        cross join lateral jsonb_array_elements_text(
          case when jsonb_typeof(i.prefs_snapshot -> 'vibes') = 'array' then i.prefs_snapshot -> 'vibes' else '[]'::jsonb end
        ) as v(vibe)
        where i.created_by = p.partner_id
          and not coalesce(i.is_surprise, false)
          and v.vibe <> 'in-season'
        group by v.vibe
        order by count(*) desc, v.vibe
        limit 3
      ) t
      where (
        select count(*) from public.itineraries i2
        where i2.created_by = p.partner_id
          and not coalesce(i2.is_surprise, false)
          and jsonb_typeof(i2.prefs_snapshot -> 'vibes') = 'array'
          and jsonb_array_length(i2.prefs_snapshot -> 'vibes') > 0
      ) >= 2
    )
  from public.partners p
  left join public.user_preferences up on up.user_id = p.partner_id
  where p.user_id = (select auth.uid());
$$;

revoke all on function public.partner_dates() from public, anon;
grant execute on function public.partner_dates() to authenticated;
