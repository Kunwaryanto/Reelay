-- Matching imported Letterboxd films to the catalogue ignores punctuation and spacing. Letterboxd and TMDB write
-- the same title differently ("Mission: Impossible – The Final Reckoning" with an en dash vs "-", "The 40 Year Old
-- Virgin" vs "The 40 Year-Old Virgin", "Die Hard With a Vengeance" vs "Die Hard: With a Vengeance"), and the exact
-- match left those films unmatched, so they weren't hidden as watched. Both names are reduced to their letters and
-- digits; the year still has to be within one. An exact match, then the same year, then the more popular film win.
create or replace function public.letterboxd_key(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(lower(p), '[^[:alnum:]]+', '', 'g')
$$;

create or replace function public.letterboxd_resolve(p_user uuid default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare matched int;
begin
  with pending as (
    select distinct l.film_name, l.film_year, lower(l.film_name) as name, public.letterboxd_key(l.film_name) as k
    from public.letterboxd_logs l
    where l.tmdb_id is null and l.film_year is not null and (p_user is null or l.user_id = p_user)
  ), films as (
    -- only films near the pending years, each name reduced once
    select t.tmdb_id, t.year, t.popularity, lower(t.title) as title, lower(t.original_title) as original,
      public.letterboxd_key(t.title) as k, public.letterboxd_key(t.original_title) as ko
    from public.titles t
    where t.kind = 'film' and t.year between (select min(film_year) - 1 from pending) and (select max(film_year) + 1 from pending)
  ), hits as (
    select p.film_name, p.film_year, f.tmdb_id, f.year, f.popularity, (f.title = p.name or f.original = p.name) as exact
    from pending p join films f on (f.k = p.k or f.ko = p.k) and f.year between p.film_year - 1 and p.film_year + 1
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

-- match everyone's imported films again now, and tell the apps there is new data (their saved lists reload)
select public.letterboxd_resolve();
update public.data_stamp set finished_at = now() where id = 1;
