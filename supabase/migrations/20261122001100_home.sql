-- Home (22 Nov): what the page needs beyond the catalogue.
--  - trend_rank: this week's position in TMDB's trending lists (films and series ranked separately), nightly.
--  - title_recs: TMDB's "recommendations" for films members rated 4 or higher, for "Because you liked …".
--  - hide_watched: the member's switch for leaving watched films out of recommendation rows.
--  - three functions that answer for the signed-in member: because, friends, taste.

alter table public.titles add column trend_rank int;
create index titles_trend on public.titles (kind, trend_rank) where trend_rank is not null;

create table public.title_recs (
  source_tmdb_id int not null,
  rec_tmdb_id    int not null,
  rank           smallint not null,
  primary key (source_tmdb_id, rec_tmdb_id)
);
-- which films have been asked about, and when (server only)
create table public.rec_sources (
  tmdb_id    int primary key,
  fetched_at timestamptz not null default now()
);
alter table public.title_recs  enable row level security;
alter table public.rec_sources enable row level security;
grant select on public.title_recs to authenticated;
create policy "members read recommendations" on public.title_recs for select to authenticated using (true);

alter table public.letterboxd_accounts add column hide_watched boolean not null default true;
grant update (hide_watched) on public.letterboxd_accounts to authenticated;

drop function public.letterboxd_me();
create function public.letterboxd_me()
returns table (username text, display_name text, mark_watched boolean, hide_watched boolean, synced_at timestamptz, sync_error text, films int, imported_at timestamptz, imported_films int)
language sql stable
set search_path = ''
as $$
  select a.username, a.display_name, a.mark_watched, a.hide_watched, a.synced_at, a.sync_error,
         (select count(distinct coalesce(l.tmdb_id::text, lower(l.film_name) || '|' || coalesce(l.film_year, 0)))::int
          from public.letterboxd_logs l where l.user_id = a.user_id),
         a.imported_at, a.imported_films
  from public.letterboxd_accounts a where a.user_id = (select auth.uid());
$$;
grant execute on function public.letterboxd_me() to authenticated;
revoke execute on function public.letterboxd_me() from anon, public;

-- "Because you liked X": one film the member rated 4 or higher (a different one each day), and the films
-- TMDB recommends from it that stream on their services. p_hide leaves out films they have logged.
create or replace function public.home_because(p_day int, p_services text[] default null, p_hide boolean default true)
returns table (source text, title_id bigint, rank int)
language sql stable
set search_path = ''
as $$
  with liked as (
    select distinct on (l.tmdb_id) l.tmdb_id, coalesce(t.title, l.film_name) as name
    from public.letterboxd_logs l
    left join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film'
    where l.user_id = (select auth.uid()) and l.rating >= 4 and l.tmdb_id is not null
    order by l.tmdb_id, l.watched_on desc nulls last
  ), cand as (
    select k.tmdb_id as src, k.name, t.id as title_id, r.rank::int as rank
    from liked k
    join public.title_recs r on r.source_tmdb_id = k.tmdb_id
    join public.titles t on t.tmdb_id = r.rec_tmdb_id and t.kind = 'film'
    where k.name is not null
      and exists (select 1 from public.availability a where a.title_id = t.id and (p_services is null or a.service_id = any (p_services)))
      and (not p_hide or not exists (select 1 from public.letterboxd_logs m where m.user_id = (select auth.uid()) and m.tmdb_id = r.rec_tmdb_id))
  ), srcs as (
    select src, name, row_number() over (order by src) - 1 as i, count(*) over () as n
    from (select src, name from cand group by src, name having count(*) >= 4) s
  )
  select s.name, c.title_id, c.rank
  from srcs s join cand c on c.src = s.src
  where s.i = abs(p_day) % s.n
  order by c.rank
  limit 20;
$$;

-- "Friends liked": films the other members rated 4 or higher, on the member's services, best first.
create or replace function public.home_friends(p_services text[] default null, p_hide boolean default true)
returns table (title_id bigint, name text, rating numeric)
language sql stable
set search_path = ''
as $$
  select x.title_id, x.name, x.rating from (
    select distinct on (t.id) t.id as title_id, coalesce(nullif(a.display_name, ''), a.username) as name, l.rating, l.watched_on
    from public.letterboxd_logs l
    join public.letterboxd_accounts a on a.user_id = l.user_id
    join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film'
    where l.user_id <> (select auth.uid()) and l.rating >= 4
      and exists (select 1 from public.availability v where v.title_id = t.id and (p_services is null or v.service_id = any (p_services)))
      and (not p_hide or not exists (select 1 from public.letterboxd_logs m where m.user_id = (select auth.uid()) and m.tmdb_id = l.tmdb_id))
    order by t.id, l.rating desc, l.watched_on desc nulls last
  ) x
  order by x.rating desc, x.watched_on desc nulls last
  limit 20;
$$;

-- The member's taste: genres by their average rating (three rated films or more), best first.
create or replace function public.home_taste()
returns table (genre text, average numeric, films int)
language sql stable
set search_path = ''
as $$
  select g, round(avg(r.rating), 2), count(*)::int
  from (
    select distinct on (l.tmdb_id) l.tmdb_id, l.rating
    from public.letterboxd_logs l
    where l.user_id = (select auth.uid()) and l.rating is not null and l.tmdb_id is not null
    order by l.tmdb_id, l.watched_on desc nulls last
  ) r
  join public.titles t on t.tmdb_id = r.tmdb_id and t.kind = 'film'
  cross join lateral unnest(t.genres) g
  group by g having count(*) >= 3
  order by 2 desc, 3 desc;
$$;

grant execute on function public.home_because(int, text[], boolean), public.home_friends(text[], boolean), public.home_taste() to authenticated;
revoke execute on function public.home_because(int, text[], boolean), public.home_friends(text[], boolean), public.home_taste() from anon, public;
