-- =============================================================================
-- Venture is 18+ (#91)
--
-- Was 16. A date-planning app with photos and connections isn't worth the
-- risk with minors: several US states have app store age laws, and the App
-- Store age rating points the same way. Nobody saved before this is under 18.
-- The app checks the same age (MIN_AGE, src/lib/profile.ts).
-- =============================================================================

create or replace function private.user_preferences_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.birthdate is not null
     and new.birthdate is distinct from old.birthdate then
    raise exception 'Birthdate cannot be changed once set'
      using errcode = 'check_violation';
  end if;

  if new.birthdate is not null
     and (tg_op = 'INSERT' or new.birthdate is distinct from old.birthdate) then
    if new.birthdate > current_date or new.birthdate < date '1900-01-01' then
      raise exception 'Birthdate is not valid' using errcode = 'check_violation';
    end if;
    if extract(year from age(current_date, new.birthdate)) < 18 then
      raise exception 'Venture requires users to be at least 18'
        using errcode = 'check_violation';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;
