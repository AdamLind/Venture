-- =============================================================================
-- The tag rework (#20)
--
-- Four groups, each tag one word where possible, nothing a field already
-- says (feel, exertion, time of year), nothing too local to launch anywhere:
--   Food ..... casual, upscale, cafes, desserts, brunch, global
--   Active ... nature, views, walks, water, adventure, sports, games
--   Shows .... movies, music, comedy, theater, museums, festivals
--   Close .... board games, crafts, cooking, spa, romantic
-- (src/constants/tags.ts lists the same; display labels like "Cafés" live
-- there.)
--
-- Existing ideas keep what they meant: renames carry their links; a few
-- ideas move to the tag that fits them now (a board-game night to "board
-- games", a cookie bake-off to "cooking", climbing to "sports"). Dropped:
-- quiet (now "How does it feel?"), sweat (now "How physical?"), seasonal
-- (the time-of-year question, #21), soda (never used).
-- =============================================================================

-- New tags
insert into public.tags (name, category) values
  ('brunch', 'Food'),
  ('global', 'Food'),
  ('water', 'Active'),
  ('adventure', 'Active'),
  ('sports', 'Active'),
  ('festivals', 'Shows'),
  ('board games', 'Close'),
  ('cooking', 'Close')
on conflict (name) do nothing;

-- Ideas that move to a different tag than the rename gives them
-- (an idea can't hold the same tag twice: skip if it already has the target)
create temporary table tag_moves (idea_id bigint, from_tag text, to_tag text) on commit drop;
insert into tag_moves values
  (49, 'games', 'board games'),   -- Board game tournament
  (63, 'games', 'board games'),   -- Jigsaw puzzle night
  (53, 'create', 'cooking'),      -- Cookie bake-off
  (61, 'create', 'cooking'),      -- Tapas night
  (52, 'sweat', 'sports'),        -- Indoor rock climbing
  (55, 'sweat', 'sports');        -- Backyard obstacle course

insert into public.activity_tags (idea_id, tag_id)
select m.idea_id, t.tag_id
from tag_moves m
join public.tags t on t.name = m.to_tag
join public.activities a on a.idea_id = m.idea_id
on conflict do nothing;

delete from public.activity_tags at
using tag_moves m, public.tags t
where t.name = m.from_tag and at.tag_id = t.tag_id and at.idea_id = m.idea_id;

-- Watercolors were "arts" and "create": crafts covers it, and "arts" becomes museums
delete from public.activity_tags at
using public.tags t
where t.name = 'arts' and at.tag_id = t.tag_id and at.idea_id = 51;

-- Renames (links come along)
update public.tags set name = 'upscale' where name = 'fancy';
update public.tags set name = 'desserts' where name = 'sweets';
update public.tags set name = 'walks' where name = 'stroll';
update public.tags set name = 'movies' where name = 'film';
update public.tags set name = 'theater' where name = 'stage';
update public.tags set name = 'museums' where name = 'arts';
update public.tags set name = 'romantic' where name = 'intimate';
update public.tags set name = 'crafts' where name = 'create';

-- Views is about being out somewhere, not closeness
update public.tags set category = 'Active' where name = 'views';

-- Dropped (their links go with them)
delete from public.tags where name in ('quiet', 'sweat', 'seasonal', 'soda');
