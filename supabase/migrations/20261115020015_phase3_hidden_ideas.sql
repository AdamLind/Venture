-- =============================================================================
-- Phase 3: "Not interested" (hidden ideas)
--
-- Ideas you've hidden stop showing in Discover and the builder. Private to
-- you: nobody else can see what you've hidden. Additive only.
-- =============================================================================

create table public.hidden_ideas (
  user_id uuid not null default auth.uid()
    references public.users (user_id) on delete cascade,
  idea_id bigint not null references public.activities (idea_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idea_id)
);

create index hidden_ideas_idea_idx on public.hidden_ideas (idea_id);

alter table public.hidden_ideas enable row level security;

create policy "Users can read their hidden ideas"
  on public.hidden_ideas for select to authenticated
  using (user_id = (select auth.uid()));

-- Hide ideas you can see, but not your own
create policy "Users can hide ideas they can see"
  on public.hidden_ideas for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.activities a
      where a.idea_id = hidden_ideas.idea_id
        and a.user_id is distinct from (select auth.uid())
    )
  );

-- Undo / unhide
create policy "Users can unhide their hidden ideas"
  on public.hidden_ideas for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on public.hidden_ideas to authenticated;
