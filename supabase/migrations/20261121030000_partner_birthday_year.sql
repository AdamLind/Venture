-- Your partner's birthday comes with the year now (#87): between partners
-- the year isn't a secret, and it makes milestone birthdays possible
-- ("@sam's 30th birthday"). Still only your partner, and only if they
-- share it. The return columns change, so the function is recreated (no
-- data is touched).

drop function if exists public.partner_dates();

create function public.partner_dates()
returns table (anniversary date, partner_birthday date, partner_vibes text[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.anniversary,
    case when up.share_birthday then up.birthdate end,
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

comment on column public.user_preferences.share_birthday is
  'Your partner may see your birthday (partner_dates())';
