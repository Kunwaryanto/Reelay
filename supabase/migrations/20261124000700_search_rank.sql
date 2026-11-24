-- Search by name ranks by how the name matches, then by popularity, so a few letters give the well-known titles first.
-- Before, the trigram score came before popularity: with little typed, many titles score about the same and tiny
-- differences put obscure titles above famous ones.
--
-- Order:
--   1. the exact title ("Her" finds Her, punctuation and accents aside: "spiderman" finds Spider-Man)
--   2. streaming, then not streaming (as before)
--   3. how the name matches: a word in it starts with what was typed ("god": The Godfather, Godzilla), contains it,
--      near miss (typos)
--   4. most popular first (near misses: closest first)
-- The member's own services are not put first: that ranked Gods of Egypt above The Godfather for "god".
-- load pg_trgm in this session first: setting its threshold on the function needs the library loaded
select extensions.similarity('a', 'a');

create or replace function public.search_titles(q text, max_results int default 30)
returns table (
  id bigint, kind text, title text, year int, poster_path text,
  services text[], streaming boolean, score real
)
language sql stable
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.4
as $$
  with needle as (
    select public.f_unaccent(lower(trim(q))) as n,
           public.letterboxd_key(public.f_unaccent(trim(q))) as k,
           -- the words as a regular expression, starting at a word boundary
           '(^|[^[:alnum:]])' || regexp_replace(public.f_unaccent(lower(trim(q))), '([^[:alnum:][:space:]])', '\\\1', 'g') as w
  ),
  hits as (
    select t.id from public.titles t, needle where length(needle.n) >= 2 and t.search_text like '%' || needle.n || '%'
    union
    select t.id from public.titles t, needle where length(needle.n) >= 2 and needle.n operator(extensions.<%) t.search_text
  ),
  ranked as (
    select t.id, t.kind, t.title, t.year, t.poster_path, t.popularity,
           coalesce(array_agg(a.service_id order by s.sort_order) filter (where a.service_id is not null), '{}') as services,
           bool_or(a.service_id is not null) as streaming,
           extensions.word_similarity(n.n, t.search_text) as sim,
           (n.k <> '' and (public.letterboxd_key(public.f_unaccent(t.title)) = n.k
                           or public.letterboxd_key(public.f_unaccent(coalesce(t.original_title, ''))) = n.k)) as exact,
           case
             when t.search_text ~ n.w then 1
             when t.search_text like '%' || n.n || '%' then 2
             else 3
           end as tier
    from hits h
    join public.titles t on t.id = h.id
    cross join needle n
    left join public.availability a on a.title_id = t.id
    left join public.services s on s.id = a.service_id
    group by t.id, t.kind, t.title, t.original_title, t.year, t.poster_path, t.popularity, t.search_text, n.n, n.k, n.w
  )
  select r.id, r.kind, r.title, r.year, r.poster_path, r.services, r.streaming, r.sim::real as score
  from ranked r
  order by r.exact desc,
           r.streaming desc,
           r.tier,
           case when r.tier = 3 then r.sim else 0 end desc,
           r.popularity desc nulls last,
           r.id
  limit max_results
$$;
revoke execute on function public.search_titles(text, int) from anon, public;
grant execute on function public.search_titles(text, int) to authenticated;
