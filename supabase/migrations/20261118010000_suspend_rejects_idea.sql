-- =============================================================================
-- Suspending from an idea rejects it too; moderators see suspended accounts
-- (#76)
--
-- 1. set_suspension(..., p_idea_id): when a moderator suspends someone from
--    one of their ideas, that idea is rejected as well (the reason is the
--    note they see), and its open reports are closed. Already rejected or
--    private ideas are left alone. The idea must be theirs.
-- 2. Moderation › Suspended lists every suspended account, so a suspension
--    can be lifted even when none of their ideas are left to open (they can
--    still make their ideas private). Moderators can read those accounts'
--    usernames.
-- =============================================================================

create or replace function public.set_suspension(
  p_user_id uuid,
  p_suspend boolean,
  p_note    text default null,
  p_idea_id bigint default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note       text := nullif(btrim(coalesce(p_note, '')), '');
  v_idea_owner uuid;
  v_idea_vis   text;
begin
  if not private.is_moderator() then
    raise exception 'Only moderators can suspend accounts' using errcode = '42501';
  end if;
  if p_user_id is null or p_user_id = auth.uid() then
    raise exception 'You can''t suspend your own account' using errcode = '22023';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'That note is too long' using errcode = '22023';
  end if;

  if p_idea_id is not null then
    select user_id, visibility into v_idea_owner, v_idea_vis
    from public.activities where idea_id = p_idea_id;
    if v_idea_owner is distinct from p_user_id then
      raise exception 'That idea isn''t theirs' using errcode = '22023';
    end if;
  end if;

  if p_suspend then
    if private.is_staff(p_user_id) then
      raise exception 'Staff can''t be suspended. An admin can remove their role first' using errcode = '42501';
    end if;
    if v_note is null then
      raise exception 'Add a reason for the suspension' using errcode = '22023';
    end if;
    insert into public.account_suspensions (user_id, reason, suspended_by)
    values (p_user_id, v_note, auth.uid())
    on conflict (user_id) do nothing;
    if not found then
      raise exception 'That account is already suspended' using errcode = '22023';
    end if;
  else
    delete from public.account_suspensions where user_id = p_user_id;
    if not found then
      raise exception 'That account isn''t suspended' using errcode = 'P0002';
    end if;
  end if;

  insert into public.moderation_actions (action, idea_id, user_id, note)
  values (case when p_suspend then 'SUSPEND' else 'UNSUSPEND' end, p_idea_id, p_user_id, v_note);

  -- Suspended from this idea: it's rejected too (closes its reports, tells them)
  if p_suspend and p_idea_id is not null and v_idea_vis not in ('REJECTED', 'PRIVATE') then
    perform public.review_idea(p_idea_id, 'REJECT', v_note);
  end if;
end;
$$;

revoke execute on function public.set_suspension(uuid, boolean, text, bigint) from public, anon;
grant execute on function public.set_suspension(uuid, boolean, text, bigint) to authenticated;

drop policy if exists "Moderators see suspended accounts" on public.users;
create policy "Moderators see suspended accounts"
  on public.users for select to authenticated
  using ((select private.is_moderator()) and private.is_suspended(user_id));
