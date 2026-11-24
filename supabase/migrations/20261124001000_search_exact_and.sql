-- The whole name typed counts as exact with "and" for "&" too: "fast and furious" is Fast & Furious (2009), not
-- the film that happened to be more popular. The rest is search v3 (20261124000900) unchanged.
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
    select n, public.letterboxd_key(n) as k,
           -- every word as "starts with": 'star w' → star:* & w:*
           (select to_tsquery('simple', string_agg(w || ':*', ' & '))
              from regexp_split_to_table(n, '[^[:alnum:]]+') w where w <> '') as starts
    from (select public.f_unaccent(lower(regexp_replace(trim(q), '\s*&\s*', ' and ', 'g'))) as n) x
  ),
  -- 1: a word starts with each word typed; 2: contains it (three letters on); 3: near miss, a typo (four on)
  cand as (
    select t.id, 1 as tier, 0::real as sim from public.titles t, needle
      where length(needle.n) >= 2 and needle.starts is not null and to_tsvector('simple'::regconfig, t.search_text) @@ needle.starts
    union all
    select t.id, 2, 0 from public.titles t, needle
      where length(needle.n) >= 3 and t.search_text like '%' || needle.n || '%'
    union all
    select t.id, 3, extensions.word_similarity(needle.n, t.search_text) from public.titles t, needle
      where length(needle.n) >= 4 and needle.n operator(extensions.<%) t.search_text
  ),
  best as (select c.id, min(c.tier) as tier, max(c.sim) as sim from cand c group by c.id),
  ranked as (
    select t.id, t.kind, t.title, t.year, t.poster_path, b.tier, b.sim,
           exists (select 1 from public.availability a where a.title_id = t.id) as streaming,
           -- the whole name typed (punctuation and accents aside): its title, original, English or other name
           (length(t.search_text) <= length(n.n) * 6 + 40 and n.k <> '' and (
              public.letterboxd_key(public.f_unaccent(replace(t.title, '&', ' and '))) = n.k
              or public.letterboxd_key(public.f_unaccent(replace(coalesce(t.original_title, ''), '&', ' and '))) = n.k
              or public.letterboxd_key(public.f_unaccent(replace(coalesce(t.title_en, ''), '&', ' and '))) = n.k
              or exists (select 1 from unnest(t.aka) a where public.letterboxd_key(public.f_unaccent(replace(a, '&', ' and '))) = n.k))) as exact,
           -- trending and well known: TMDB's popularity and IMDb's votes, both softened
           ln(1 + greatest(t.popularity, 0)) + 0.4 * ln(1 + coalesce(t.imdb_votes, 0)) as fame
    from best b
    join public.titles t on t.id = b.id
    cross join needle n
    order by exact desc, streaming desc, b.tier, case when b.tier = 3 then b.sim else 0 end desc, fame desc, t.id
    limit max_results
  )
  -- only the titles shown get their services
  select r.id, r.kind, r.title, r.year, r.poster_path,
         coalesce((select array_agg(a.service_id order by s.sort_order) from public.availability a
                   join public.services s on s.id = a.service_id where a.title_id = r.id), '{}') as services,
         r.streaming, r.fame::real as score
  from ranked r
  order by r.exact desc, r.streaming desc, r.tier, case when r.tier = 3 then r.sim else 0 end desc, r.fame desc, r.id
$$;
revoke execute on function public.search_titles(text, int) from anon, public;
grant execute on function public.search_titles(text, int) to authenticated;
