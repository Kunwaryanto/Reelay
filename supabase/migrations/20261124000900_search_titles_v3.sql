-- Search, more accurate and faster (24 Nov):
--  · Nordic films and series show their own title: one first made in Swedish, Danish or Norwegian is called by its
--    original title ("Fanny och Alexander"), the English one is kept in title_en, still found and still matched to
--    Letterboxd. A trigger keeps this for every writer (the sync, the tmdb function).
--  · Other names a title goes by in Sweden (`aka`: its Swedish title and TMDB's Swedish alternative titles, written by
--    the sync) are searched too: "Sagan om ringen", "Gudfadern".
--  · "&" and "and" are the same word.
--  · Words are found by how they start through a word index, so one or two letters ("go") no longer read every
--    title: trigrams need three letters, below that the trigram index can't help.
--  · Only the best matches get their services looked up (a common word like "the" scored a thousand titles first).
--  · The order mixes TMDB's popularity (what's trending) with IMDb votes (how well known), so The Godfather comes
--    before this year's Godzilla for "god".

alter table public.titles
  add column title_en text,
  add column aka text[] not null default '{}';

-- ---- Nordic titles in their own language ---------------------------------------------------------------------
create or replace function public.titles_nordic_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.original_language in ('sv', 'da', 'no', 'nb', 'nn') and coalesce(new.original_title, '') <> '' then
    -- a writer sets title to TMDB's English one; keep that as title_en and show the original
    if new.title is distinct from new.original_title then
      new.title_en := new.title;
      new.title := new.original_title;
    end if;
  else
    new.title_en := null;
  end if;
  return new;
end;
$$;
create trigger titles_nordic_name before insert or update of title, original_title, original_language on public.titles
  for each row execute function public.titles_nordic_name();

update public.titles set title = title
where original_language in ('sv', 'da', 'no', 'nb', 'nn') and coalesce(original_title, '') <> '' and title <> original_title;

-- ---- What search reads ---------------------------------------------------------------------------------------
create or replace function public.title_search_text(p_title text, p_original text, p_en text, p_aka text[])
returns text language sql immutable parallel safe set search_path = '' as $$
  select public.f_unaccent(lower(regexp_replace(
    coalesce(p_title, '') || ' ' || coalesce(p_original, '') || ' ' || coalesce(p_en, '') || ' ' || coalesce(array_to_string(p_aka, ' '), ''),
    '\s*&\s*', ' and ', 'g')))
$$;

drop index if exists public.titles_search_trgm;
alter table public.titles drop column search_text;
alter table public.titles add column search_text text generated always as (public.title_search_text(title, original_title, title_en, aka)) stored;
create index titles_search_trgm on public.titles using gin (search_text extensions.gin_trgm_ops);
-- every word, for "starts with" (works from one letter)
create index titles_search_words on public.titles using gin (to_tsvector('simple'::regconfig, search_text));

-- ---- The search ---------------------------------------------------------------------------------------------
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
              public.letterboxd_key(public.f_unaccent(t.title)) = n.k
              or public.letterboxd_key(public.f_unaccent(coalesce(t.original_title, ''))) = n.k
              or public.letterboxd_key(public.f_unaccent(coalesce(t.title_en, ''))) = n.k
              or exists (select 1 from unnest(t.aka) a where public.letterboxd_key(public.f_unaccent(a)) = n.k))) as exact,
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

-- ---- Letterboxd matches the English title of a Nordic film too ------------------------------------------------
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
    select t.tmdb_id, t.year, t.popularity, lower(t.title) as title, lower(t.original_title) as original, lower(t.title_en) as en,
      public.letterboxd_key(t.title) as k, public.letterboxd_key(t.original_title) as ko, public.letterboxd_key(t.title_en) as ke
    from public.titles t
    where t.kind = 'film' and t.year between (select min(film_year) - 1 from pending) and (select max(film_year) + 1 from pending)
  ), hits as (
    select p.film_name, p.film_year, f.tmdb_id, f.year, f.popularity, (f.title = p.name or f.original = p.name or f.en = p.name) as exact
    from pending p join films f on (f.k = p.k or f.ko = p.k or f.ke = p.k) and f.year between p.film_year - 1 and p.film_year + 1
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

-- the apps' saved titles carry the old names: tell them there is new data
update public.data_stamp set finished_at = now() where id = 1;
