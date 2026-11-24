-- The member's watched films as one list in one row. letterboxd_watched returns a row per film, and the API sends
-- at most 1,000 rows (max_rows): a member with more (1,141 on 24 Nov) got a list cut off at an arbitrary film, so
-- some watched films weren't hidden. One array has no such limit. letterboxd_watched stays for older app versions.
create or replace function public.letterboxd_watched_ids()
returns bigint[]
language sql stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct t.id), '{}') from public.letterboxd_logs l
  join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film'
  where l.user_id = (select auth.uid());
$$;
revoke execute on function public.letterboxd_watched_ids() from public, anon;
grant execute on function public.letterboxd_watched_ids() to authenticated;
