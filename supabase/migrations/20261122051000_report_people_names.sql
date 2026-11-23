-- =============================================================================
-- Reporting a person: their name (#76, follows 20261122050000)
--
-- First and last names aren't readable from the users table (only you, your
-- connections and people on your dates see them, through functions). But a
-- name can be what's reported ("offensive name"), so:
-- 1. person_for_review(): a moderator sees a reported person's name, photo
--    and username, only while there are reports about them.
-- 2. handle_person_reports() can remove their name (REMOVE_NAME); they're
--    told why and can add a new one.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. A reported person, for their review page
-- -----------------------------------------------------------------------------
create or replace function public.person_for_review(p_user_id uuid)
returns table (
  user_id           uuid,
  username          text,
  first_name        text,
  last_name         text,
  profile_image_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_moderator() then
    raise exception 'Only moderators can review people' using errcode = '42501';
  end if;
  return query
    select u.user_id, u.username, u.first_name, u.last_name, u.profile_image_url
    from public.users u
    where u.user_id = p_user_id
      and (private.has_person_reports(u.user_id) or private.is_suspended(u.user_id));
end;
$$;

revoke execute on function public.person_for_review(uuid) from public, anon;
grant execute on function public.person_for_review(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- 2. Removing a name
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'IDEA_PUBLISHED', 'IDEA_NEEDS_REVISION', 'IDEA_REJECTED',
  'IDEA_HELD', 'IDEA_REPORTED', 'REPORT_ACTIONED', 'REPORT_DISMISSED',
  'CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'PARTNER_REQUEST', 'PARTNER_ACCEPTED',
  'DATE_INVITE', 'DATE_INVITE_ACCEPTED', 'DATE_COMMENT',
  'PERSON_REPORTED', 'PERSON_REPORT_ACTIONED', 'PERSON_REPORT_DISMISSED',
  'PHOTO_REMOVED', 'USERNAME_RESET',
  -- A moderator removed your first and last name (note: why)
  'NAME_REMOVED'
));

alter table public.moderation_actions drop constraint if exists moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check check (action in (
  'APPROVE', 'REQUEST_CHANGES', 'REJECT',
  'RESOLVE_REPORTS', 'DISMISS_REPORTS',
  'ADD_STAFF', 'CHANGE_STAFF', 'REMOVE_STAFF',
  'AUTO_HOLD',
  'SUSPEND', 'UNSUSPEND',
  'REMOVE_PHOTO', 'RESET_USERNAME', 'REMOVE_NAME', 'RESOLVE_PERSON_REPORTS', 'DISMISS_PERSON_REPORTS'
));

drop policy if exists "Moderators see idea history, admins see the whole log" on public.moderation_actions;
create policy "Moderators see idea history, admins see the whole log"
  on public.moderation_actions for select to authenticated
  using (
    (select private.is_admin())
    or ((select private.is_moderator())
        and (idea_id is not null
             or action in ('SUSPEND', 'UNSUSPEND', 'REMOVE_PHOTO', 'RESET_USERNAME', 'REMOVE_NAME',
                           'RESOLVE_PERSON_REPORTS', 'DISMISS_PERSON_REPORTS')))
  );

-- As before (20261122050000), plus REMOVE_NAME
create or replace function public.handle_person_reports(
  p_user_id uuid,
  p_outcome text,
  p_note    text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_user     public.users%rowtype;
  v_count    integer;
  v_username text;
  v_tries    integer := 0;
begin
  if not private.is_moderator() then
    raise exception 'Only moderators can handle reports' using errcode = '42501';
  end if;
  if p_outcome not in ('REMOVE_PHOTO', 'REMOVE_NAME', 'RESET_USERNAME', 'SUSPEND', 'RESOLVED', 'DISMISSED') then
    raise exception 'Unknown outcome' using errcode = '22023';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'Someone else needs to handle reports about you' using errcode = '42501';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'That note is too long' using errcode = '22023';
  end if;
  -- They're told what was removed and why
  if p_outcome in ('REMOVE_PHOTO', 'REMOVE_NAME', 'RESET_USERNAME', 'SUSPEND') and v_note is null then
    raise exception 'Add a note so they know why' using errcode = '22023';
  end if;

  select * into v_user from public.users where user_id = p_user_id for update;
  if not found then
    raise exception 'That account doesn''t exist anymore' using errcode = 'P0002';
  end if;

  if p_outcome = 'REMOVE_PHOTO' then
    if v_user.profile_image_url is null then
      raise exception 'They don''t have a photo anymore' using errcode = '22023';
    end if;
    update public.users set profile_image_url = null where user_id = p_user_id;
    insert into public.notifications (user_id, kind, note) values (p_user_id, 'PHOTO_REMOVED', v_note);

  elsif p_outcome = 'REMOVE_NAME' then
    if v_user.first_name is null and v_user.last_name is null then
      raise exception 'They don''t have a name anymore' using errcode = '22023';
    end if;
    update public.users set first_name = null, last_name = null where user_id = p_user_id;
    insert into public.notifications (user_id, kind, note) values (p_user_id, 'NAME_REMOVED', v_note);

  elsif p_outcome = 'RESET_USERNAME' then
    -- "user" + 8 random letters and digits (the username format), unused
    loop
      v_username := 'user' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      exit when not exists (select 1 from public.users where username = v_username);
      v_tries := v_tries + 1;
      if v_tries > 20 then
        raise exception 'Couldn''t pick a new username. Try again' using errcode = 'P0001';
      end if;
    end loop;
    update public.users set username = v_username where user_id = p_user_id;
    insert into public.notifications (user_id, kind, note) values (p_user_id, 'USERNAME_RESET', v_note);

  elsif p_outcome = 'SUSPEND' then
    -- Its own checks (not staff) and log entry
    perform public.set_suspension(p_user_id, true, v_note, null);
  end if;

  update public.user_reports
  set status = case p_outcome when 'DISMISSED' then 'DISMISSED' else 'REVIEWED' end
  where reported_id = p_user_id and status = 'OPEN';
  get diagnostics v_count = row_count;

  if v_count = 0 and p_outcome in ('RESOLVED', 'DISMISSED') then
    raise exception 'No open reports about them' using errcode = 'P0002';
  end if;

  if p_outcome <> 'SUSPEND' then
    insert into public.moderation_actions (action, user_id, note, detail)
    values (
      case p_outcome
        when 'RESOLVED' then 'RESOLVE_PERSON_REPORTS'
        when 'DISMISSED' then 'DISMISS_PERSON_REPORTS'
        else p_outcome
      end,
      p_user_id, v_note,
      jsonb_build_object('reports', v_count)
        -- The old name, so staff recognise someone who does it again
        || case when p_outcome = 'RESET_USERNAME'
                then jsonb_build_object('from', v_user.username) else '{}'::jsonb end
    );
  end if;

  return v_count;
end;
$$;

revoke execute on function public.handle_person_reports(uuid, text, text) from public, anon;
grant execute on function public.handle_person_reports(uuid, text, text) to authenticated;
