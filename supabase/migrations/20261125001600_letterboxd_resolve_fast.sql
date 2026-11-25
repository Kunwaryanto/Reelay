-- letterboxd_resolve hung the nightly sync for five hours (25 Nov): the films were matched with an OR of three name
-- keys, so Postgres compared every waiting row with every film of those years and worked out the keys again for each
-- pair. Rows that never match (a film we don't have) wait for ever, so the work grew with every import.
-- Now the films' keys are worked out once (materialized) and each key is an ordinary equality join. The sync also
-- gives the call a time limit, so it can't hold the night again.
create or replace function public.letterboxd_resolve(p_user uuid default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare matched int;
begin
  with pending as materialized (
    select distinct l.film_name, l.film_year, lower(l.film_name) as name, public.letterboxd_key(l.film_name) as k
    from public.letterboxd_logs l
    where l.tmdb_id is null and l.film_year is not null and (p_user is null or l.user_id = p_user)
  ), films as materialized (
    select t.tmdb_id, t.year, t.popularity, lower(t.title) as title, lower(t.original_title) as original, lower(t.title_en) as en,
      public.letterboxd_key(t.title) as k, public.letterboxd_key(t.original_title) as ko, public.letterboxd_key(t.title_en) as ke
    from public.titles t
    where t.kind = 'film' and t.year between (select min(film_year) - 1 from pending) and (select max(film_year) + 1 from pending)
  ), keyed as materialized (
    select tmdb_id, year, popularity, title, original, en, k as key from films where k <> ''
    union select tmdb_id, year, popularity, title, original, en, ko from films where ko <> ''
    union select tmdb_id, year, popularity, title, original, en, ke from films where ke <> ''
  ), hits as (
    select p.film_name, p.film_year, f.tmdb_id, f.year, f.popularity, (f.title = p.name or f.original = p.name or f.en = p.name) as exact
    from pending p join keyed f on f.key = p.k and f.year between p.film_year - 1 and p.film_year + 1
    where p.k <> ''
  ), found as (
    select distinct on (film_name, film_year) film_name, film_year, tmdb_id
    from hits order by film_name, film_year, exact desc, (year = film_year) desc, popularity desc
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
revoke execute on function public.letterboxd_resolve(uuid) from public, anon, authenticated;
