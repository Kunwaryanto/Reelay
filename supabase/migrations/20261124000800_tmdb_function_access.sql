-- The tmdb function works as the service role, which gets no access to tables by itself (as with letterboxd and
-- invites before it). Without these its reads and writes failed without a word: its search cache stayed empty (every
-- search went to TMDB again) and it couldn't see which titles the catalogue has, so Search listed them twice.
grant select on public.titles to service_role;
grant select, insert, update, delete on public.tmdb_search_cache to service_role;
