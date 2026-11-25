-- "Kids", tuned against the catalogue: only animated family titles, and only the ones few grown-ups watch. The first
-- rule (any family film under IMDb 7.0) hid Home Alone 2, Narnia, Frozen II and Moana 2; this one keeps every family
-- film with 50,000+ votes, or 10,000+ votes and 7.0+, and still hides Paw Patrol, Barbie and Peppa Pig. Live-action
-- family films are never "kids".
create or replace function public.title_tags(
  p_kind text, p_genres text[], p_countries text[], p_language text, p_rating numeric, p_votes int, p_standup boolean)
returns text[] language sql immutable parallel safe set search_path = '' as $$
  select coalesce(array_agg(t order by t), '{}') from unnest(array[
    case when 'Kids' = any(p_genres)
           or ('Family' = any(p_genres) and 'Animation' = any(p_genres)
               and not (coalesce(p_votes, 0) >= 50000 or (coalesce(p_rating, 0) >= 7.0 and coalesce(p_votes, 0) >= 10000))) then 'kids' end,
    case when 'Animation' = any(p_genres) and ('JP' = any(p_countries) or p_language = 'ja') then 'anime' end,
    case when p_standup then 'standup' end,
    case when 'Horror' = any(p_genres) then 'horror' end,
    case when 'Reality' = any(p_genres) then 'reality' end,
    case when 'Documentary' = any(p_genres) then 'documentaries' end,
    case when p_genres && '{Action,"Action & Adventure"}' then 'action' end,
    case when p_genres && '{Adventure,"Action & Adventure"}' then 'adventure' end,
    case when 'Animation' = any(p_genres) then 'animation' end,
    case when 'Comedy' = any(p_genres) then 'comedy' end,
    case when 'Crime' = any(p_genres) then 'crime' end,
    case when 'Drama' = any(p_genres) then 'drama' end,
    case when 'Family' = any(p_genres) then 'family' end,
    case when p_genres && '{Fantasy,"Sci-Fi & Fantasy"}' then 'fantasy' end,
    case when 'History' = any(p_genres) then 'history' end,
    case when 'Music' = any(p_genres) then 'music' end,
    case when 'Mystery' = any(p_genres) then 'mystery' end,
    case when 'News' = any(p_genres) then 'news' end,
    case when 'Romance' = any(p_genres) then 'romance' end,
    case when p_genres && '{"Science Fiction","Sci-Fi & Fantasy"}' then 'scifi' end,
    case when 'Soap' = any(p_genres) then 'soaps' end,
    case when 'Talk' = any(p_genres) then 'talk' end,
    case when 'Thriller' = any(p_genres) then 'thriller' end,
    case when p_genres && '{War,"War & Politics"}' then 'war' end,
    case when 'Western' = any(p_genres) then 'western' end
  ]) t where t is not null
$$;

-- the column is stored: changing the function doesn't touch rows already written, so it is made again
alter table public.titles drop column tags;
alter table public.titles add column tags text[] not null
  generated always as (public.title_tags(kind, coalesce(genres, '{}'), coalesce(countries, '{}'), original_language, imdb_rating, imdb_votes, standup)) stored;
