-- Home's cards carry the title page's picture (hero_path, hero_poster: the spotlight cards are tall now and show
-- it) and the IMDb rating (the spotlight's quality bar and "hidden gem" reason). The ready-made base gets them too.
create or replace function public.home_card(p_id bigint, p_services text[])
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'year', t.year, 'poster_path', t.poster_path,
    'backdrop_path', t.backdrop_path, 'logo_path', t.logo_path, 'hero_path', t.hero_path, 'hero_poster', t.hero_poster,
    'genres', t.genres, 'seasons', t.seasons, 'runtime_min', t.runtime_min, 'tags', t.tags, 'popularity', t.popularity,
    'imdb_rating', t.imdb_rating, 'imdb_votes', t.imdb_votes,
    'availability', coalesce((select jsonb_agg(jsonb_build_object('service_id', a.service_id, 'leaves_on', a.leaves_on))
      from public.availability a where a.title_id = t.id and (p_services is null or a.service_id = any (p_services))), '[]'::jsonb))
  from public.titles t where t.id = p_id
$$;
revoke execute on function public.home_card(bigint, text[]) from public, anon, authenticated;
-- the bases built before this have no pictures: build them again on the next request
delete from public.home_base;
