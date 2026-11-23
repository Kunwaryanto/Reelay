-- Faster reads (measured 23 Nov: search 2.2 s, rated lists 1.3 s, filter counts 0.4 s, the Start wall 1.1 s).

-- 1. Search finds its candidates through the trigram index (the old "like ... or word_similarity(...) > 0.4" could
--    use no index, so every search read all titles). The two ways of matching are asked separately, each through
--    the index, and only the matches are scored and joined.
create or replace function public.search_titles(q text, max_results int default 30)
returns table (
  id bigint, kind text, title text, year int, poster_path text,
  services text[], streaming boolean, score real
)
language sql stable
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.4
as $$
  with needle as (select public.f_unaccent(lower(trim(q))) as n),
  hits as (
    select t.id from public.titles t, needle where length(needle.n) >= 2 and t.search_text like '%' || needle.n || '%'
    union
    select t.id from public.titles t, needle where length(needle.n) >= 2 and needle.n operator(extensions.<%) t.search_text
  )
  select t.id, t.kind, t.title, t.year, t.poster_path,
         coalesce(array_agg(a.service_id order by s.sort_order) filter (where a.service_id is not null), '{}') as services,
         bool_or(a.service_id is not null) as streaming,
         max(extensions.word_similarity(n.n, t.search_text)) as score
  from hits h
  join public.titles t on t.id = h.id
  cross join needle n
  left join public.availability a on a.title_id = t.id
  left join public.services s on s.id = a.service_id
  group by t.id, t.kind, t.title, t.year, t.poster_path, t.popularity
  order by bool_or(a.service_id is not null) desc,
           max(extensions.word_similarity(n.n, t.search_text)) desc,
           t.popularity desc
  limit max_results
$$;
revoke execute on function public.search_titles(text, int) from anon, public;
grant execute on function public.search_titles(text, int) to authenticated;

-- 2. The IMDb rating and votes on the title itself, so lists sorted or narrowed by rating read one table in rating
--    order and stop at the row they need, instead of joining every title's scores and sorting them all.
--    Kept in step with scores by a trigger (only when they change, so the nightly ratings file rewrites little).
alter table public.titles add column imdb_rating numeric(3,1), add column imdb_votes int;
update public.titles t set imdb_rating = s.imdb_rating, imdb_votes = s.imdb_votes
  from public.scores s where s.title_id = t.id and (s.imdb_rating is not null or s.imdb_votes is not null);
create function public.scores_to_title() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.titles set imdb_rating = new.imdb_rating, imdb_votes = new.imdb_votes
  where id = new.title_id and (imdb_rating is distinct from new.imdb_rating or imdb_votes is distinct from new.imdb_votes);
  return null;
end $$;
revoke execute on function public.scores_to_title() from public, anon, authenticated;
create trigger scores_to_title after insert or update of imdb_rating, imdb_votes on public.scores
  for each row execute function public.scores_to_title();
create index titles_rating on public.titles (imdb_rating desc nulls last, popularity desc) where imdb_rating is not null;

-- 3. Genre and country filters (Browse, the filter drawer's counts) through an index instead of reading every title.
create index titles_genres on public.titles using gin (genres);
create index titles_countries on public.titles using gin (countries);

-- 4. The Start wall is made once a night (refresh_start_wall, run by the sync) and read from a small table.
create table public.start_wall_posters (pos int primary key, poster_path text not null);
alter table public.start_wall_posters enable row level security;
create function public.refresh_start_wall() returns void
language sql security definer set search_path = '' as $$
  delete from public.start_wall_posters;
  insert into public.start_wall_posters (pos, poster_path)
  with y as (select extract(year from now())::int as now),
  picked as (
    select t.poster_path,
      case when t.year >= y.now - 4 then 0 else 2 end + case when t.kind = 'film' then 0 else 1 end as bucket,
      row_number() over (partition by t.kind, t.year >= y.now - 4 order by t.popularity desc) as n
    from public.titles t, y
    where t.poster_path is not null and t.year is not null
      and (t.year >= y.now - 4 or t.year <= y.now - 15)
      and exists (select 1 from public.availability a where a.title_id = t.id)
  )
  select row_number() over (order by n, bucket), poster_path from picked where n <= 12;
$$;
revoke execute on function public.refresh_start_wall() from public, anon, authenticated;
select public.refresh_start_wall();
create or replace function public.start_wall() returns setof text
language sql stable security definer set search_path = '' as $$
  select poster_path from public.start_wall_posters order by pos
$$;
