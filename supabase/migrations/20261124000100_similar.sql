-- "More like this": for each streaming title, a short list of the titles most like it, in order, built by the nightly
-- sync (TMDB's recommendations that stream in Sweden first, then the closest by our own scoring below). One small
-- row per title: about 4 MB for the catalogue, and the title page reads it in one go. The member's own order (their
-- services first, films they've logged left out) is put on when it is shown.
create table public.title_similar (
  title_id  bigint primary key references public.titles (id) on delete cascade,
  ids       bigint[] not null,          -- up to 15 titles, most alike first (a removed title is skipped when read)
  tmdb_at   timestamptz,                -- when TMDB's recommendations were last asked for
  built_at  timestamptz not null default now()
);
alter table public.title_similar enable row level security;
create policy "members read similar titles" on public.title_similar for select to authenticated using (true);
grant select on public.title_similar to authenticated;

-- How often TMDB is asked again, by tier (see refresh_every): new titles collect recommendations quickly.
create or replace function public.refresh_every(tier text, what text) returns interval
language sql immutable set search_path = '' as $$
  select case what
    when 'scores'  then case tier when 'new' then interval '2 days' when 'recent' then interval '7 days'  else interval '90 days' end
    when 'omdb'    then case tier when 'new' then interval '3 days' when 'recent' then interval '14 days' else interval '90 days' end
    when 'details' then case tier when 'new' then interval '7 days' when 'recent' then interval '14 days' else interval '60 days' end
    when 'similar' then case tier when 'new' then interval '14 days' when 'recent' then interval '60 days' else interval '180 days' end
  end
$$;

-- Our own measure of "alike", for titles TMDB says little about: streaming titles of the same kind, scored by
-- the same director, creator or lead actors (strongest), every genre they share, the same original language
-- (more for non-English: Nordic crime finds Nordic crime), a close era and the rating. Animation and kids' titles
-- only match each other.
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
    where c.id <> p_id and c.kind = t.kind and (c.genres && t.genres or c.id in (select title_id from by_people))
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
revoke execute on function public.similar_titles(bigint) from public, anon;
grant execute on function public.similar_titles(bigint) to authenticated;
