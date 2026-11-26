-- How many streaming titles fit a set of filters, films and series apart, in one request (Explore's and Search's
-- type pills and the filter drawer's button).
-- These counts were three requests through the API's embedding (titles with availability!inner), which builds each
-- title's list of services as JSON only to count rows: 1.1 to 1.4 s each, the slowest thing members waited for.
-- Here the services are only checked (exists), and the filters are the same as the list's (search.ts `narrow`).
-- f (jsonb, every key optional): services text[], service text, leaves_from date, leaves_to date, from int, to int,
-- genres text[], decades [[from|null, to], ...], country text, lang text, min_rating, min_votes, min_rt, min_lb,
-- length 'short'|'mid'|'long', hide bigint[], not_tags text[].
create or replace function public.title_totals(f jsonb)
returns table (kind text, n int)
language sql stable security invoker set search_path = '' as $$
  select t.kind, count(*)::int
  from public.titles t
  where exists (
      select 1 from public.availability a
      where a.title_id = t.id
        and (f->'services' is null or a.service_id = any (array(select jsonb_array_elements_text(f->'services'))))
        and (f->>'service' is null or a.service_id = f->>'service')
        and (f->>'leaves_from' is null or a.leaves_on >= (f->>'leaves_from')::date)
        and (f->>'leaves_to' is null or a.leaves_on <= (f->>'leaves_to')::date))
    and (f->'hide' is null or t.id <> all (array(select jsonb_array_elements_text(f->'hide')::bigint)))
    and (f->>'from' is null or t.year >= (f->>'from')::int)
    and (f->>'to' is null or t.year <= (f->>'to')::int)
    and (f->'genres' is null or t.genres && array(select jsonb_array_elements_text(f->'genres')))
    and (f->'decades' is null or exists (
      select 1 from jsonb_array_elements(f->'decades') d
      where (d->>0 is null or t.year >= (d->>0)::int) and t.year <= (d->>1)::int))
    and (f->>'country' is null or t.countries @> array[f->>'country'])
    and (f->>'lang' is null or t.original_language = f->>'lang')
    and (f->>'min_rating' is null or t.imdb_rating >= (f->>'min_rating')::numeric)
    and (f->>'min_votes' is null or t.imdb_votes >= (f->>'min_votes')::int)
    and (f->>'min_rt' is null or exists (select 1 from public.scores s where s.title_id = t.id and s.rt_critics >= (f->>'min_rt')::numeric))
    and (f->>'min_lb' is null or exists (select 1 from public.scores s where s.title_id = t.id and s.letterboxd >= (f->>'min_lb')::numeric))
    and (f->>'length' is null
      or (f->>'length' = 'short' and t.runtime_min < 90)
      or (f->>'length' = 'mid' and t.runtime_min <= 120)
      or (f->>'length' = 'long' and t.runtime_min > 120))
    and (f->'not_tags' is null or not (t.tags && array(select jsonb_array_elements_text(f->'not_tags'))))
  group by t.kind
$$;
revoke execute on function public.title_totals(jsonb) from public, anon;
grant execute on function public.title_totals(jsonb) to authenticated;
