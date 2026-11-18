-- =============================================================================
-- Idea guidelines: which rules a review cites (#85)
--
-- When a moderator sends an idea back or rejects it, they can cite the
-- guidelines it breaks. The creator's note then links to those rules.
-- Rule ids match src/lib/ideaGuidelines.ts; keep the two lists in step.
--
-- review_idea() gains p_rules, so the old three-argument version is dropped
-- (a new argument makes a separate function otherwise).
-- =============================================================================

alter table public.activities
  add column if not exists moderation_rules text[];

alter table public.activities
  drop constraint if exists activities_moderation_rules_check;
alter table public.activities
  add constraint activities_moderation_rules_check
  check (moderation_rules is null or cardinality(moderation_rules) <= 9);

drop function if exists public.review_idea(bigint, text, text);

create function public.review_idea(
  p_idea_id  bigint,
  p_decision text,
  p_note     text default null,
  p_rules    text[] default null
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
  v_rules   text[];
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

  -- The rules the note cites (src/lib/ideaGuidelines.ts); none for an approval
  if p_decision <> 'APPROVE' and p_rules is not null then
    select coalesce(array_agg(distinct r order by r), '{}') into v_rules
    from unnest(p_rules) as r;
    if not v_rules <@ array['together', 'one-activity', 'experience', 'doable', 'honest',
                            'safe', 'audience', 'new', 'no-spam'] then
      raise exception 'Unknown guideline' using errcode = '22023';
    end if;
    v_rules := nullif(v_rules, '{}');
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
  set moderation_note  = case when p_decision = 'APPROVE' then null else v_note end,
      moderation_rules = v_rules,
      visibility       = v_target
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
      || case when v_rules is not null then jsonb_build_object('rules', to_jsonb(v_rules)) else '{}'::jsonb end
  );
end;
$$;

revoke execute on function public.review_idea(bigint, text, text, text[]) from public, anon;
grant execute on function public.review_idea(bigint, text, text, text[]) to authenticated;
