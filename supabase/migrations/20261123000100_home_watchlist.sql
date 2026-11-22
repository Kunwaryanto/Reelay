-- Home recommendations from the watchlist (23 Nov):
--  - TMDB's recommendations now kept for series too, so a film and a series with the same TMDB id are told apart.
--  - home_saved: "Because you saved X", from a title on the member's watchlist (films and series).
--  - home_people: "More with X", a director or actor behind several titles the member saved or rated 4+.

alter table public.title_recs add column source_kind text not null default 'film' check (source_kind in ('film', 'series')),
                              add column rec_kind    text not null default 'film' check (rec_kind in ('film', 'series'));
alter table public.title_recs drop constraint title_recs_pkey, add primary key (source_kind, source_tmdb_id, rec_tmdb_id);
alter table public.rec_sources add column kind text not null default 'film' check (kind in ('film', 'series'));
alter table public.rec_sources drop constraint rec_sources_pkey, add primary key (kind, tmdb_id);

-- "Because you liked": the source and its recommendations are films
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
    join public.title_recs r on r.source_kind = 'film' and r.source_tmdb_id = k.tmdb_id and r.rec_kind = 'film'
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

-- "Because you saved X": one title on the member's watchlist (a different one each day) and what TMDB recommends
-- from it, of the same kind, on their services, not already saved, and (with p_hide) not a film they have logged.
create or replace function public.home_saved(p_day int, p_services text[] default null, p_hide boolean default true)
returns table (source text, source_id bigint, title_id bigint, rank int)
language sql stable
set search_path = ''
as $$
  with saved as (
    select t.id, t.tmdb_id, t.kind, t.title from public.watchlist w join public.titles t on t.id = w.title_id
    where w.user_id = (select auth.uid())
  ), cand as (
    select s.id as src, s.title as name, t.id as title_id, r.rank::int as rank
    from saved s
    join public.title_recs r on r.source_kind = s.kind and r.source_tmdb_id = s.tmdb_id
    join public.titles t on t.tmdb_id = r.rec_tmdb_id and t.kind = r.rec_kind
    where not exists (select 1 from public.watchlist w where w.user_id = (select auth.uid()) and w.title_id = t.id)
      and exists (select 1 from public.availability a where a.title_id = t.id and (p_services is null or a.service_id = any (p_services)))
      and (not p_hide or t.kind <> 'film' or not exists (select 1 from public.letterboxd_logs m where m.user_id = (select auth.uid()) and m.tmdb_id = t.tmdb_id))
  ), srcs as (
    select src, name, row_number() over (order by src) - 1 as i, count(*) over () as n
    from (select src, name from cand group by src, name having count(*) >= 4) x
  )
  select s.name, s.src, c.title_id, c.rank
  from srcs s join cand c on c.src = s.src
  where s.i = abs(p_day) % s.n
  order by c.rank
  limit 20;
$$;

-- "More with X": a director, creator or one of the first five billed actors behind three or more titles the member
-- saved or rated 4+ (a different person each day), and their other titles on the member's services.
create or replace function public.home_people(p_day int, p_services text[] default null, p_hide boolean default true)
returns table (person_id bigint, name text, title_id bigint)
language sql stable
set search_path = ''
as $$
  with mine as (
    select w.title_id as id from public.watchlist w where w.user_id = (select auth.uid())
    union
    select t.id from public.letterboxd_logs l join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film'
    where l.user_id = (select auth.uid()) and l.rating >= 4
  ), who as (
    select c.person_id, count(distinct c.title_id) as n
    from public.credits c join mine m on m.id = c.title_id
    where c.role in ('director', 'creator') or (c.role = 'cast' and c.sort_order < 5)
    group by c.person_id having count(distinct c.title_id) >= 3
  ), theirs as (
    select w.person_id, t.id as title_id, t.popularity
    from who w
    join public.credits c on c.person_id = w.person_id and (c.role in ('director', 'creator') or (c.role = 'cast' and c.sort_order < 5))
    join public.titles t on t.id = c.title_id
    where t.id not in (select id from mine)
      and exists (select 1 from public.availability a where a.title_id = t.id and (p_services is null or a.service_id = any (p_services)))
      and (not p_hide or t.kind <> 'film' or not exists (select 1 from public.letterboxd_logs m where m.user_id = (select auth.uid()) and m.tmdb_id = t.tmdb_id))
  ), ok as (
    select person_id, row_number() over (order by person_id) - 1 as i, count(*) over () as n
    from (select person_id from theirs group by person_id having count(distinct title_id) >= 3) x
  )
  select distinct on (th.title_id, th.popularity) ok.person_id, p.name, th.title_id
  from ok join theirs th on th.person_id = ok.person_id join public.people p on p.id = ok.person_id
  where ok.i = abs(p_day) % ok.n
  order by th.popularity desc, th.title_id
  limit 20;
$$;

grant execute on function public.home_saved(int, text[], boolean), public.home_people(int, text[], boolean) to authenticated;
revoke execute on function public.home_saved(int, text[], boolean), public.home_people(int, text[], boolean) from anon, public;
