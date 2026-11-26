-- Fewer requests (26 Nov):
--   me_bundle    the member's own things at launch in one request: profile, services, watchlist (with what the
--                Watchlist shows of each title), Letterboxd connection, watched films, and the sync stamp
--   title_page   a title page in one request: the title, where it streams, scores, credits, awards and More like
--                this as cards (was three: the title, the list, the list's cards)
--   home_card    Home's cards carry what the long-press menu shows (end year, scores, who made it), so Home's
--                posters need no facts request, and the quick Home names Tonight's picks' makers too

create or replace function public.me_bundle()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then raise exception 'signed out'; end if;
  -- an account with no profile row (older than the rule that makes one) gets one, as loadProfile did
  if not exists (select 1 from public.profiles p where p.user_id = me) then perform public.ensure_profile(); end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = me),
    'services', (select coalesce(jsonb_agg(u.service_id), '[]') from public.user_services u where u.user_id = me),
    'watchlist', (select coalesce(jsonb_agg(jsonb_build_object('notify', w.notify, 'added_at', w.added_at, 'title', jsonb_build_object(
        'id', t.id, 'kind', t.kind, 'title', t.title, 'year', t.year, 'poster_path', t.poster_path, 'genres', t.genres,
        'original_language', t.original_language, 'runtime_min', t.runtime_min, 'seasons', t.seasons, 'end_year', t.end_year,
        -- who made it: with the scores, all the long-press menu shows, so the saved titles need no facts request
        'by_names', (select coalesce(jsonb_agg(pe.name order by c.sort_order), '[]'::jsonb) from public.credits c
                     join public.people pe on pe.id = c.person_id
                     where c.title_id = t.id and c.role = case when t.kind = 'film' then 'director' else 'creator' end),
        'availability', (select coalesce(jsonb_agg(jsonb_build_object('service_id', a.service_id, 'leaves_on', a.leaves_on)), '[]')
                         from public.availability a where a.title_id = t.id),
        'scores', (select jsonb_build_object('imdb_rating', s.imdb_rating, 'rt_critics', s.rt_critics, 'letterboxd', s.letterboxd)
                   from public.scores s where s.title_id = t.id)))
      order by w.added_at desc), '[]')
      from public.watchlist w join public.titles t on t.id = w.title_id where w.user_id = me),
    'letterboxd', (select to_jsonb(x) from public.letterboxd_me() x limit 1),
    'watched', to_jsonb(public.letterboxd_watched_ids()),
    'stamp', (select d.finished_at from public.data_stamp d where d.id = 1)
  );
end
$$;
revoke execute on function public.me_bundle() from public, anon;
grant execute on function public.me_bundle() to authenticated;

create or replace function public.title_page(p_id bigint)
returns jsonb
language plpgsql stable
set search_path = ''
set jit = off
as $$
declare
  t public.titles;
  more jsonb;
begin
  select * into t from public.titles x where x.id = p_id;
  if not found then return null; end if;
  -- More like this, in its order, streaming only (as the cards' availability!inner did)
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'kind', c.kind, 'title', c.title, 'year', c.year, 'runtime_min', c.runtime_min, 'seasons', c.seasons,
      'poster_path', c.poster_path, 'tags', c.tags, 'availability', o.offers) order by m.pos), '[]')
    into more
  from public.similar_titles(p_id) m
  join public.titles c on c.id = m.id
  join lateral (select jsonb_agg(jsonb_build_object('service_id', a.service_id, 'leaves_on', a.leaves_on)) as offers
                from public.availability a where a.title_id = c.id) o on o.offers is not null;
  return jsonb_build_object(
    'id', t.id, 'tmdb_id', t.tmdb_id, 'kind', t.kind, 'title', t.title, 'original_title', t.original_title, 'title_en', t.title_en,
    'hero_path', t.hero_path, 'hero_poster', t.hero_poster, 'year', t.year, 'end_year', t.end_year, 'runtime_min', t.runtime_min,
    'seasons', t.seasons, 'overview', t.overview, 'genres', t.genres, 'original_language', t.original_language,
    'poster_path', t.poster_path, 'backdrop_path', t.backdrop_path, 'logo_path', t.logo_path,
    'availability', (select coalesce(jsonb_agg(to_jsonb(a) || jsonb_build_object('service', to_jsonb(sv))), '[]')
                     from public.availability a left join public.services sv on sv.id = a.service_id where a.title_id = t.id),
    'scores', (select jsonb_build_object('imdb_rating', s.imdb_rating, 'rt_critics', s.rt_critics, 'rt_audience', s.rt_audience, 'letterboxd', s.letterboxd)
               from public.scores s where s.title_id = t.id),
    'credits', (select coalesce(jsonb_agg(jsonb_build_object('role', c.role, 'character', c.character, 'sort_order', c.sort_order,
                  'person', jsonb_build_object('id', pe.id, 'name', pe.name, 'profile_path', pe.profile_path)) order by c.sort_order), '[]')
                from public.credits c join public.people pe on pe.id = c.person_id where c.title_id = t.id),
    'awards', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'award', w.award, 'year', w.year, 'short_category', w.short_category,
                 'won', w.won, 'person_name', w.person_name, 'rank', w.rank)), '[]')
               from public.awards w where w.title_id = t.id),
    'more', more
  );
end
$$;
revoke execute on function public.title_page(bigint) from public, anon;
grant execute on function public.title_page(bigint) to authenticated;

create or replace function public.home_card(p_id bigint, p_services text[])
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'year', t.year, 'end_year', t.end_year, 'poster_path', t.poster_path,
    'backdrop_path', t.backdrop_path, 'logo_path', t.logo_path, 'hero_path', t.hero_path, 'hero_poster', t.hero_poster,
    'genres', t.genres, 'seasons', t.seasons, 'runtime_min', t.runtime_min, 'tags', t.tags, 'popularity', t.popularity,
    'imdb_rating', t.imdb_rating, 'imdb_votes', t.imdb_votes,
    'rt', (select s.rt_critics from public.scores s where s.title_id = t.id),
    'lb', (select s.letterboxd from public.scores s where s.title_id = t.id),
    'by_names', (select coalesce(jsonb_agg(pe.name order by c.sort_order), '[]'::jsonb) from public.credits c
                 join public.people pe on pe.id = c.person_id
                 where c.title_id = t.id and c.role = case when t.kind = 'film' then 'director' else 'creator' end),
    'availability', coalesce((select jsonb_agg(jsonb_build_object('service_id', a.service_id, 'leaves_on', a.leaves_on))
      from public.availability a where a.title_id = t.id and (p_services is null or a.service_id = any (p_services))), '[]'::jsonb))
  from public.titles t where t.id = p_id
$$;
revoke execute on function public.home_card(bigint, text[]) from public, anon, authenticated;

-- home_card has the makers now: home_item is the same card
create or replace function public.home_item(p_id bigint, p_services text[])
returns jsonb
language sql stable security definer
set search_path = ''
as $$ select public.home_card(p_id, p_services) $$;
revoke execute on function public.home_item(bigint, text[]) from public, anon, authenticated;

-- the ready-made bases have no facts yet: build them again on the next request
delete from public.home_base;
