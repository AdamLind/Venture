-- =============================================================================
-- The titles you choose to show (#84)
--
-- Profile shows up to three titles earned from your dates. By default they're
-- the hardest three; once you pick (the titles menu), these are the ones, in
-- order: the first shows big in the middle. Empty means "pick for me". A
-- title you no longer have is skipped when it's shown.
-- =============================================================================

alter table public.user_preferences
  add column if not exists featured_titles text[] not null default '{}'
    check (
      cardinality(featured_titles) <= 3
      and array_to_string(featured_titles, ',') ~ '^([a-z]+(-[a-z]+)*(,[a-z]+(-[a-z]+)*)*)?$'
    );

comment on column public.user_preferences.featured_titles is
  'Title ids to show on Profile, in order (utils/titles.ts); empty = the hardest three';

-- Yours to read and change, like the rest of your preferences (granted
-- column by column)
grant select (featured_titles), update (featured_titles) on public.user_preferences to authenticated;
