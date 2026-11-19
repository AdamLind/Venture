-- =============================================================================
-- Surprises are chosen per date, not with a mode (#35)
--
-- Surprise mode (a setting to remember to turn off) is gone. Instead you pick
-- "Surprise for @sam" while planning; the plan's choice comes with the date
-- (prefs_snapshot.surprise) and the date is created hidden from your partner,
-- so it's never visible in between. Private saves are a long-press on the
-- bookmark.
-- =============================================================================

create or replace function private.surprise_by_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.prefs_snapshot ->> 'surprise' = 'true' then
    new.is_surprise := true;
  end if;
  return new;
end;
$$;

-- The surprise_mode column is unused now; dropping it is a separate
-- migration (20261119021000), run with approval.
