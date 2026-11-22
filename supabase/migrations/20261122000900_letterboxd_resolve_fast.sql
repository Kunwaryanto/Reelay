-- Matching imported films to the catalogue took 9 s for a thousand films (every film compared with every
-- title), longer than the 8 s the API allows a statement, so the first real import failed after saving its
-- rows. Titles are now looked up by name through an index, once for the title and once for the original title.
create index titles_film_title_lower on public.titles (lower(title)) where kind = 'film';
create index titles_film_original_lower on public.titles (lower(original_title)) where kind = 'film' and original_title is not null;

create or replace function public.letterboxd_resolve(p_user uuid default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare matched int;
begin
  with pending as (
    select distinct l.film_name, l.film_year, lower(l.film_name) as name from public.letterboxd_logs l
    where l.tmdb_id is null and l.film_year is not null and (p_user is null or l.user_id = p_user)
  ), hits as (
    select p.film_name, p.film_year, t.tmdb_id, t.year, t.popularity
    from pending p join public.titles t on lower(t.title) = p.name and t.kind = 'film' and t.year between p.film_year - 1 and p.film_year + 1
    union all
    select p.film_name, p.film_year, t.tmdb_id, t.year, t.popularity
    from pending p join public.titles t on lower(t.original_title) = p.name and t.kind = 'film' and t.original_title is not null and t.year between p.film_year - 1 and p.film_year + 1
  ), found as (
    select distinct on (film_name, film_year) film_name, film_year, tmdb_id
    from hits order by film_name, film_year, (year = film_year) desc, popularity desc
  )
  update public.letterboxd_logs l set tmdb_id = f.tmdb_id
  from found f
  where l.tmdb_id is null and l.film_name = f.film_name and l.film_year = f.film_year and (p_user is null or l.user_id = p_user);
  get diagnostics matched = row_count;

  -- an imported row is the same watch as a feed row of that film on that day; one without a date
  -- (marked as seen, never logged) is covered by any feed row of the film
  delete from public.letterboxd_logs i using public.letterboxd_logs f
  where i.user_id = f.user_id and i.tmdb_id = f.tmdb_id
    and i.entry_id like 'import-%' and f.entry_id not like 'import-%'
    and (i.watched_on is null or i.watched_on = f.watched_on)
    and (p_user is null or i.user_id = p_user);
  return matched;
end;
$$;
