-- A tenth guideline, "A real, reachable place" (#88: new places are
-- reviewed with their first idea), so a review can cite up to all of them.
-- Room for a couple more.

alter table public.activities
  drop constraint if exists activities_moderation_rules_check;
alter table public.activities
  add constraint activities_moderation_rules_check
  check (moderation_rules is null or cardinality(moderation_rules) <= 12);
