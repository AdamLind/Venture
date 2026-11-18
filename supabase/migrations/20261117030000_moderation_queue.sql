-- =============================================================================
-- The moderation queue (#26)
--
-- 1. activities.submitted_at: when an idea last went into review, so the
--    queue is oldest-waiting first (created_at is wrong for resubmissions)
-- 2. Staff can see each other's profiles (names in the log)
-- 3. review_idea(): sending an idea back or rejecting it also closes its
--    open reports (it's been acted on)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. submitted_at
-- -----------------------------------------------------------------------------
alter table public.activities
  add column if not exists submitted_at timestamptz;

update public.activities
set submitted_at = created_at
where visibility = 'PENDING_REVIEW' and submitted_at is null;

create or replace function private.stamp_submitted_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.visibility = 'PENDING_REVIEW'
     and (tg_op = 'INSERT' or old.visibility is distinct from 'PENDING_REVIEW') then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.stamp_submitted_at() from public, anon, authenticated;

create trigger activities_stamp_submitted_at
  before insert or update of visibility on public.activities
  for each row
  execute function private.stamp_submitted_at();

create index if not exists activities_pending_idx
  on public.activities (submitted_at) where visibility = 'PENDING_REVIEW';


-- -----------------------------------------------------------------------------
-- 2. Staff see fellow staff
-- -----------------------------------------------------------------------------
create policy "Staff see fellow staff"
  on public.users for select to authenticated
  using (
    (select private.is_moderator())
    and exists (select 1 from public.staff s where s.user_id = users.user_id)
  );


-- -----------------------------------------------------------------------------
-- 3. review_idea(): taking an idea down closes its open reports
-- -----------------------------------------------------------------------------
create or replace function public.review_idea(
  p_idea_id  bigint,
  p_decision text,
  p_note     text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_idea    public.activities%rowtype;
  v_target  text;
  v_reports integer := 0;
begin
  if not private.is_moderator() then
    raise exception 'Only moderators can review ideas' using errcode = '42501';
  end if;

  v_target := case p_decision
    when 'APPROVE' then 'PUBLISHED'
    when 'REQUEST_CHANGES' then 'NEEDS_REVISION'
    when 'REJECT' then 'REJECTED'
  end;
  if v_target is null then
    raise exception 'Unknown decision' using errcode = '22023';
  end if;

  if p_decision <> 'APPROVE' and v_note is null then
    raise exception 'Add a note so they know what to change' using errcode = '22023';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'That note is too long' using errcode = '22023';
  end if;

  select * into v_idea from public.activities where idea_id = p_idea_id for update;
  if not found or v_idea.visibility = 'PRIVATE' then
    raise exception 'That idea isn''t up for review' using errcode = 'P0002';
  end if;

  if v_idea.user_id = auth.uid() and not private.is_admin() then
    raise exception 'Someone else needs to review your own ideas' using errcode = '42501';
  end if;

  if v_idea.visibility = v_target then
    raise exception 'That idea already has this decision' using errcode = '22023';
  end if;

  -- Note first (the notification trigger reads it on the visibility change)
  update public.activities
  set moderation_note = case when p_decision = 'APPROVE' then null else v_note end,
      visibility      = v_target
  where idea_id = p_idea_id;

  -- Taken down: its reports have been acted on
  if p_decision <> 'APPROVE' then
    update public.idea_reports
    set status = 'REVIEWED'
    where idea_id = p_idea_id and status = 'OPEN';
    get diagnostics v_reports = row_count;
  end if;

  insert into public.moderation_actions (action, idea_id, user_id, note, detail)
  values (
    p_decision, p_idea_id, v_idea.user_id, v_note,
    jsonb_build_object('from', v_idea.visibility, 'to', v_target)
      || case when v_reports > 0 then jsonb_build_object('reports', v_reports) else '{}'::jsonb end
  );
end;
$$;
