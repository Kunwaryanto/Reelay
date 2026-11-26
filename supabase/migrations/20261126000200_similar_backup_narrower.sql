-- "More like this", our own scoring (similar_backup): candidates now share people or at least two genres (one when
-- the title has only one). With any one shared genre, a title like a drama had some 15,000 candidates to score; it
-- was the database's heaviest work, about half a second a title. The lists change little: titles sharing one genre
-- only seldom reached the top 15.
create or replace function public.similar_backup(p_id bigint, p_limit int default 15)
returns table (id bigint, score real)
language sql stable set search_path = '' as $$
  with t as (select * from public.titles where id = p_id),
  kids as (select array['Animation', 'Kids', 'Family'] as g),
  people as (
    select c.person_id from public.credits c
    where c.title_id = p_id and (c.role in ('director', 'creator') or (c.role = 'cast' and c.sort_order < 5))
  ),
  by_people as (
    select c.title_id, count(distinct c.person_id) as n from public.credits c join people p using (person_id)
    where c.title_id <> p_id and (c.role in ('director', 'creator') or (c.role = 'cast' and c.sort_order < 5))
    group by c.title_id
  ),
  cand as (
    select c.* from public.titles c, t
    where c.id <> p_id and c.kind = t.kind
      -- sharing people, or at least two genres (one when the title has only one): a single shared genre ("Drama")
      -- made some 15,000 candidates to score for every title, half a second each night after night
      and (c.id in (select title_id from by_people)
        or (c.genres && t.genres and cardinality(array(select unnest(c.genres) intersect select unnest(t.genres))) >= least(2, cardinality(t.genres))))
      and exists (select 1 from public.availability a where a.title_id = c.id)
  )
  select c.id, (
      3.0 * coalesce(bp.n, 0)
    + 1.0 * cardinality(array(select unnest(c.genres) intersect select unnest(t.genres)))
    + case when c.original_language = t.original_language then case when t.original_language = 'en' then 0.5 else 2.0 end else 0 end
    + case when abs(coalesce(c.year, 0) - coalesce(t.year, 0)) <= 5 then 1.0 when abs(coalesce(c.year, 0) - coalesce(t.year, 0)) <= 15 then 0.4 else 0 end
    + coalesce(c.imdb_rating, 6) / 5.0
    + least(ln(1 + c.popularity) / 10.0, 0.5)
    - case when (c.genres && kids.g) <> (t.genres && kids.g) then 4.0 else 0 end
  )::real as score
  from cand c cross join t cross join kids left join by_people bp on bp.title_id = c.id
  order by 2 desc
  limit p_limit
$$;
revoke execute on function public.similar_backup(bigint, int) from public, anon, authenticated;

-- What the title page asks for: the stored list, or (until the sync has built it) the backup scoring, live.
create or replace function public.similar_titles(p_id bigint)
returns table (id bigint, pos int)
language sql stable security definer set search_path = '' as $$
  select x.id, x.n::int from public.title_similar s, unnest(s.ids) with ordinality x(id, n)
  where s.title_id = p_id
  union all
  select b.id, (row_number() over (order by b.score desc))::int from public.similar_backup(p_id, 15) b
  where not exists (select 1 from public.title_similar s where s.title_id = p_id)
$$;

revoke execute on function public.similar_backup(bigint, int) from public, anon, authenticated;
