-- Posters for the moving wall on Start, the one thing someone sees before signing in.
-- Returns poster paths only (no titles), for the most popular streaming titles.
create function public.start_wall() returns setof text
language sql stable security definer set search_path = '' as $$
  select t.poster_path
  from public.titles t
  where t.poster_path is not null
    and exists (select 1 from public.availability a where a.title_id = t.id)
  order by t.popularity desc
  limit 48
$$;
revoke execute on function public.start_wall() from public;
grant execute on function public.start_wall() to anon, authenticated;
