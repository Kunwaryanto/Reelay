-- Series on the walls: 90%+ from critics and IMDb 8.0+ still let in solid genre TV that critics like but nobody
-- would call a must-see (Clarkson's Farm, Bosch: Legacy, 1923, Dexter: Resurrection). A series now also needs an
-- Emmy or Golden Globe nomination (the awards table): Severance, Slow Horses, The Pitt, Hacks, Shrinking, Arcane.

create or replace function public.onboarding_wall(p_services text[], p_rows int default 8, p_cols int default 8)
returns table (pos int, title_id bigint, service_id text)
language plpgsql stable set search_path = '' as $$
declare
  y int := extract(year from (now() at time zone 'Europe/Stockholm'))::int;
  mix constant text[] := array['new', 'canon', 'old', 'series', 'new', 'canon', 'old', 'series'];
  n int := coalesce(array_length(p_services, 1), 0);
  lists jsonb;
  used bigint[] := '{}';
  series jsonb;
  used_series int[] := '{}';
  r int; c int; k int; s text; b text; got bigint; tries text[]; l jsonb; p text; v jsonb;
begin
  if n = 0 then return; end if;
  -- up to 40 candidates per service and part, best rated first
  select coalesce(jsonb_object_agg(key, ids), '{}') into lists from (
    select x.service_id || ':' || x.part as key, jsonb_agg(x.id order by x.n) as ids from (
      select z.service_id, z.part, z.id,
        row_number() over (partition by z.service_id, z.part order by z.score desc nulls last, z.fame desc) as n
      from (
        select a.service_id, t.id, t.fame, w.part, 'anime' = any(t.tags) as anime,
          case when w.part = 'series' then t.imdb_rating
            when w.part = 'canon' then sc.letterboxd - 0.15 * ln(1 + coalesce(t.imdb_votes, 0) / 25000.0)
            else sc.letterboxd end as score
        from public.availability a join public.titles t on t.id = a.title_id
          left join public.scores sc on sc.title_id = t.id
          cross join lateral (select public.wall_part(t.kind, t.year, t.imdb_votes, sc.letterboxd, t.imdb_rating, sc.rt_critics, y) as part) w
        where a.service_id = any(p_services) and t.poster_path is not null
          and (t.year >= y - 5 or t.year <= y - 20) and t.imdb_votes >= 20000
          and not t.tags && '{kids,standup}' and not (t.tags @> '{music}' and not t.tags && '{drama,comedy,romance,animation}')
          and (t.kind <> 'film' or coalesce(t.runtime_min, 90) >= 60)
          -- a series also needs an Emmy or Golden Globe nomination: critics' scores alone let in solid genre TV
          and (t.kind <> 'series' or exists (select 1 from public.awards aw where aw.title_id = t.id))
      ) z where z.part is not null
        -- anime rates very high with fans: only the 4 best-rated anime may be on the wall at all
        and (not z.anime or z.id in (select a2.id from (
          select distinct on (t2.id) t2.id, case when t2.kind = 'series' then t2.imdb_rating / 2 else sc2.letterboxd end as s
          from public.availability av join public.titles t2 on t2.id = av.title_id left join public.scores sc2 on sc2.title_id = t2.id
          where av.service_id = any(p_services) and 'anime' = any(t2.tags) and t2.imdb_votes >= 20000
            and public.wall_part(t2.kind, t2.year, t2.imdb_votes, sc2.letterboxd, t2.imdb_rating, sc2.rt_critics, y) is not null
        ) a2 order by a2.s desc nulls last limit 4))
    ) x where x.n <= 40 group by x.service_id, x.part
  ) q;
  -- one film per series: each film's series, for the ones that belong to one
  select coalesce(jsonb_object_agg(t.id::text, t.collection_id), '{}') into series from public.titles t
    where t.collection_id is not null and t.id in (select (jsonb_array_elements_text(e.ids))::bigint from jsonb_each(lists) e(key, ids));
  for r in 0 .. p_rows - 1 loop
    for c in 0 .. p_cols - 1 loop
      got := null;
      b := mix[(c + 3 * r) % 8 + 1];
      -- an empty part gives the nearest one: the two canons stand in for each other first
      tries := case b when 'new' then array['new', 'canon', 'old', 'series'] when 'canon' then array['canon', 'old', 'new', 'series']
        when 'old' then array['old', 'canon', 'new', 'series'] else array['series', 'new', 'canon', 'old'] end;
      <<services>>
      for k in 0 .. n - 1 loop
        s := p_services[(c + 3 * r + k) % n + 1];
        foreach p in array tries loop
          l := lists -> (s || ':' || p);
          continue when l is null;
          for v in select jsonb_array_elements(l) loop
            if not (v::text::bigint = any(used)) and not coalesce((series ->> v::text)::int = any(used_series), false) then
              got := v::text::bigint; exit services;
            end if;
          end loop;
        end loop;
      end loop;
      if got is not null then
        used := used || got;
        if series ? got::text then used_series := used_series || (series ->> got::text)::int; end if;
        pos := r * p_cols + c; title_id := got; service_id := s;
        return next;
      end if;
    end loop;
  end loop;
end
$$;
grant execute on function public.onboarding_wall(text[], int, int) to authenticated;

create or replace function public.refresh_start_wall() returns void
language sql security definer set search_path = '' as $$
  delete from public.start_wall_posters;
  insert into public.start_wall_posters (pos, poster_path)
  with y as (select extract(year from (now() at time zone 'Europe/Stockholm'))::int as now),
  mix(step, part) as (values (0, 'new'), (1, 'canon'), (2, 'old'), (3, 'series'), (4, 'new'), (5, 'canon'), (6, 'old'), (7, 'series')),
  slots as (select step, part, row_number() over (partition by part order by step) - 1 as k from mix),
  per as (select part, count(*)::int as per8 from mix group by part),   -- 2 of each in every 8
  titled as (
    select t.poster_path, t.fame, w.part, 'anime' = any(t.tags) as anime, t.collection_id,
      case when w.part = 'series' then t.imdb_rating
        when w.part = 'canon' then sc.letterboxd - 0.15 * ln(1 + coalesce(t.imdb_votes, 0) / 25000.0)
        else sc.letterboxd end as score
    from public.titles t cross join y left join public.scores sc on sc.title_id = t.id
      cross join lateral (select public.wall_part(t.kind, t.year, t.imdb_votes, sc.letterboxd, t.imdb_rating, sc.rt_critics, y.now) as part) w
    where t.poster_path is not null and t.imdb_votes >= 20000 and not t.tags && '{kids,standup}' and not (t.tags @> '{music}' and not t.tags && '{drama,comedy,romance,animation}')
          and (t.kind <> 'film' or coalesce(t.runtime_min, 90) >= 60)
      and exists (select 1 from public.availability a where a.title_id = t.id)
      and (t.kind <> 'series' or exists (select 1 from public.awards aw where aw.title_id = t.id))
  ),
  -- anime rates very high with fans: only the 3 best-rated anime may be on the wall
  anime_top as (select poster_path from titled where anime and part is not null
    order by case when part = 'series' then score / 2 else score end desc nulls last limit 3),
  -- one film per series: the best of each
  single as (select * from (select *, row_number() over (partition by coalesce(collection_id::text, poster_path) order by score desc nulls last) as k
    from titled where part is not null) z where k = 1),
  picked as (select poster_path, part, row_number() over (partition by part order by score desc nulls last, fame desc) - 1 as n
    from single where (not anime or poster_path in (select poster_path from anime_top)))
  select row_number() over (order by p.n / per.per8, s.step), p.poster_path
  from picked p join per using (part) join slots s on s.part = p.part and s.k = p.n % per.per8
  where p.n / per.per8 < 6;   -- 6 rounds of 8: 48 posters
$$;
revoke execute on function public.refresh_start_wall() from public, anon, authenticated;
select public.refresh_start_wall();
