-- =============================================================================
-- What you've read on a shared date (#36)
--
-- Each date has a thread for the whole date and one per stop. This keeps the
-- newest comment you've seen in each (stop_id 0: the whole date), so a stop's
-- comment bubble can light up when there's something new. Yours only.
-- =============================================================================

create table if not exists public.comment_reads (
  user_id      uuid not null default auth.uid() references public.users (user_id) on delete cascade,
  itinerary_id bigint not null references public.itineraries (itinerary_id) on delete cascade,
  -- 0 for the whole-date thread, otherwise the stop
  stop_id      bigint not null default 0,
  last_seen_id bigint not null,
  updated_at   timestamptz not null default now(),
  primary key (user_id, itinerary_id, stop_id)
);

alter table public.comment_reads enable row level security;
revoke all on public.comment_reads from anon, authenticated;
grant select, insert, update on public.comment_reads to authenticated;

drop policy if exists "Your read markers" on public.comment_reads;
create policy "Your read markers" on public.comment_reads for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Mark what you've read" on public.comment_reads;
create policy "Mark what you've read" on public.comment_reads for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_itinerary_member(itinerary_id));

drop policy if exists "Update what you've read" on public.comment_reads;
create policy "Update what you've read" on public.comment_reads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
