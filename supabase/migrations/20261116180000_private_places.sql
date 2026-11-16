-- =============================================================================
-- Private ideas keep their places private (#77)
--
-- Until now every place (venue) could be read by anyone, even without
-- signing in ("Venues are viewable by everyone", using true), so the pin of
-- a private idea's hidden spot could be listed with the app's public key.
--
-- Now a place is visible to a signed-in person only when:
--   - they added it (created_by), or
--   - it has an idea they can see. That check runs under the ideas' own
--     rules (RLS applies inside the policy), so it follows them exactly:
--     your own ideas, plus published ones you're old enough for. When ideas
--     on a shared date become visible to the people on it (Phase 5), their
--     places follow automatically.
-- Not signed in: nothing.
--
-- Existing places have no created_by (they're visible through their ideas).
-- =============================================================================

-- Who added it (for seeing a place you just added, before its idea exists)
alter table public.venues
  add column if not exists created_by uuid default auth.uid()
    references public.users (user_id) on delete set null;

create index if not exists venues_created_by_idx on public.venues (created_by);
-- The policy looks up ideas by place
create index if not exists activities_venue_id_idx on public.activities (venue_id);

-- Replace "everyone sees every place"
drop policy if exists "Venues are viewable by everyone" on public.venues;

create policy "People see places they added or that have ideas they can see"
  on public.venues for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.activities a
      where a.venue_id = venues.venue_id
    )
  );

-- Adding a place records who added it (it can't be someone else)
drop policy if exists "Logged in users can create venues" on public.venues;

create policy "Signed-in people can add places"
  on public.venues for insert to authenticated
  with check (created_by = (select auth.uid()));

revoke all on public.venues from anon;
