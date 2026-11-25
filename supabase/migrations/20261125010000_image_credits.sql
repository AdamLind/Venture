-- =============================================================================
-- Credit for an idea's photos
--
-- Official ideas can use photos from Unsplash. They're shown straight from
-- Unsplash (its API rules), and the idea page credits the photographer under
-- "Curated by": "Photo by <name> on Unsplash", the name linking to their
-- Unsplash profile.
--
-- image_credits lines up with image_urls: one entry per photo, in the same
-- order, null for a photo that needs no credit (your own). Null when none
-- of them do. An Unsplash entry:
--   {"source": "unsplash", "photo_id": "…", "name": "Ana Ruiz", "username": "anaruiz"}
-- Changing the photo in the app clears it (the new one is yours).
-- =============================================================================

alter table public.activities
  add column if not exists image_credits jsonb;

alter table public.activities drop constraint if exists activities_image_credits_check;
alter table public.activities add constraint activities_image_credits_check
  check (image_credits is null or jsonb_typeof(image_credits) = 'array');

comment on column public.activities.image_credits is
  'Credit for each photo in image_urls, in the same order: {"source":"unsplash","photo_id","name","username"} or null. Null: no credits';
