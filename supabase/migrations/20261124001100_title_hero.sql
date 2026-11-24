-- The title page's picture, chosen on purpose by the sync from every poster and backdrop TMDB has (not just the one
-- TMDB lists first): a textless poster first (it is the page's tall shape and the art made to sell the title), then
-- the best textless backdrop wide enough to crop sharply. hero_poster says which, so the page frames it right.
-- Empty: the page falls back to the backdrop, then the poster, as before.
alter table public.titles
  add column hero_path text,
  add column hero_poster boolean not null default false;
