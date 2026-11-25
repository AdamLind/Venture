-- =============================================================================
-- A title for an idea's link
--
-- An idea's link (activities.url) shows as a button on its page: a title
-- ("The 36 questions", "Menu", "Book a time") with the link under it, so
-- people know where it goes before they tap. Without a title the button
-- says "Website".
-- =============================================================================

alter table public.activities
  add column if not exists url_label text;

alter table public.activities drop constraint if exists activities_url_label_check;
alter table public.activities add constraint activities_url_label_check
  check (url_label is null or char_length(url_label) <= 60);

comment on column public.activities.url_label is
  'The title of the idea''s link button, up to 60 characters ("Menu", "The questions"). Null: "Website"';
