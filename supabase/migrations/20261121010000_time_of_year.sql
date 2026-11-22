-- When in the year an idea works (#21), asked as "Time of year" next to the
-- best time of day:
--   months ..... the months it works in (1-12). All twelve: any time. Seasons
--                are saved as months for where the place is (winter is
--                June-August south of the equator). Null: not answered yet
--                (older ideas count as any time).
--   holidays ... ideas that only happen around a holiday (Christmas lights,
--                a haunted house): in season only in that holiday's window
--                (utils/holidays.ts). Months are left null then.
-- The planner leaves out-of-season ideas out of suggestions and flags one
-- you add yourself (utils/seasons.ts).

alter table public.activities
  add column if not exists months smallint[],
  add column if not exists holidays text[] not null default '{}';

alter table public.activities drop constraint if exists activities_months_check;
alter table public.activities add constraint activities_months_check
  check (months is null or (cardinality(months) > 0 and months <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]));

alter table public.activities drop constraint if exists activities_holidays_check;
alter table public.activities add constraint activities_holidays_check
  check (holidays <@ array['VALENTINES', 'INDEPENDENCE_DAY', 'HALLOWEEN', 'CHRISTMAS', 'NEW_YEARS_EVE']);

comment on column public.activities.months is
  'Months the idea works in (1-12; all 12 = any time); null = not answered (counts as any time)';
comment on column public.activities.holidays is
  'Holidays the idea only happens around (utils/holidays.ts ids); in season only in their windows';
