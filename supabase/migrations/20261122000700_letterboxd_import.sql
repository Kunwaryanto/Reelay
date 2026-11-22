-- Letterboxd: importing a member's whole history from their Letterboxd export (the diary feed only has
-- their latest entries). The export names films by title and year, not by TMDB id, so imported rows are kept
-- by name and matched to the catalogue: at once for the films Reelay has, and every night after for films
-- that arrive later. Rows that the feed also has (same film, same day) are dropped, so nothing counts twice.

alter table public.letterboxd_logs
  alter column tmdb_id drop not null,
  add column film_name text,          -- imported rows: the film as the export names it
  add column film_year int,
  add constraint letterboxd_logs_film_known check (tmdb_id is not null or film_name is not null);
create index letterboxd_logs_unmatched on public.letterboxd_logs (film_year) where tmdb_id is null;

alter table public.letterboxd_accounts
  add column imported_at    timestamptz,   -- the last import
  add column imported_films int;           -- how many films it had

-- Match imported rows to the catalogue (same title, year within one), then drop the ones the feed also has.
-- p_user null: everyone (the nightly sync). Server only.
create or replace function public.letterboxd_resolve(p_user uuid default null)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare matched int;
begin
  with pending as (
    select distinct l.film_name, l.film_year from public.letterboxd_logs l
    where l.tmdb_id is null and l.film_year is not null and (p_user is null or l.user_id = p_user)
  ), found as (
    select distinct on (p.film_name, p.film_year) p.film_name, p.film_year, t.tmdb_id
    from pending p
    join public.titles t on t.kind = 'film' and t.year between p.film_year - 1 and p.film_year + 1
      and (lower(t.title) = lower(p.film_name) or lower(t.original_title) = lower(p.film_name))
    order by p.film_name, p.film_year, (t.year = p.film_year) desc, t.popularity desc
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
grant execute on function public.letterboxd_resolve(uuid) to service_role;

-- My connection: now also the last import, and films counted whether or not they are matched yet.
drop function public.letterboxd_me();
create function public.letterboxd_me()
returns table (username text, display_name text, mark_watched boolean, synced_at timestamptz, sync_error text, films int, imported_at timestamptz, imported_films int)
language sql stable
set search_path = ''
as $$
  select a.username, a.display_name, a.mark_watched, a.synced_at, a.sync_error,
         (select count(distinct coalesce(l.tmdb_id::text, lower(l.film_name) || '|' || coalesce(l.film_year, 0)))::int
          from public.letterboxd_logs l where l.user_id = a.user_id),
         a.imported_at, a.imported_films
  from public.letterboxd_accounts a where a.user_id = (select auth.uid());
$$;
grant execute on function public.letterboxd_me() to authenticated;
revoke execute on function public.letterboxd_me() from anon, public;
