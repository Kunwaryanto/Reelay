-- Well-known titles stay in the catalogue whether or not they stream: a film or series with 500 or more votes on
-- TMDB (2001: A Space Odyssey and Chinatown are only to rent in Sweden, and search couldn't find them). The sync adds
-- the ones we don't have (syncNotable) and marks them; the nightly clean-up never removes a notable title.
alter table public.titles add column notable boolean not null default false;
alter table public.titles drop constraint if exists titles_keep_reason_check;
alter table public.titles add constraint titles_keep_reason_check check (keep_reason in ('streaming', 'saved', 'award', 'notable'));
