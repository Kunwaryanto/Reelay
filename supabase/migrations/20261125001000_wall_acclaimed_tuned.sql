-- The acclaimed walls, after a look: concert films (The Eras Tour) and half-hour TV specials (A Charlie Brown
-- Christmas) slipped in as films, and IMDb's series ratings let in shows rated up by fans more than critics. Now:
-- no concert films (music documentaries), no films under an hour, and a new series also needs 85%+ from critics on
-- Rotten Tomatoes (Severance, Slow Horses, The Pitt), with IMDb 7.8+.

drop function if exists public.wall_part(text, int, int, numeric, numeric, int);
create or replace function public.wall_part(p_kind text, p_year int, p_votes int, p_letterboxd numeric, p_imdb numeric, p_rt smallint, p_now int)
returns text language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_kind = 'film' and p_year >= p_now - 5 and coalesce(p_votes, 0) >= 20000 and coalesce(p_letterboxd, 0) >= 3.7 then 'new'
    when p_kind = 'film' and p_year <= p_now - 20 and coalesce(p_votes, 0) >= 25000 and coalesce(p_letterboxd, 0) >= 4.0 then 'canon'
    when p_kind = 'series' and p_year >= p_now - 5 and coalesce(p_votes, 0) >= 20000 and coalesce(p_imdb, 0) >= 7.8 and coalesce(p_rt, 0) >= 85 then 'series'
  end
$$;

create or replace function public.onboarding_wall(p_services text[], p_rows int default 8, p_cols int default 8)
returns table (pos int, title_id bigint, service_id text)
language plpgsql stable set search_path = '' as $$
declare
  y int := extract(year from (now() at time zone 'Europe/Stockholm'))::int;
  mix constant text[] := array['new', 'canon', 'new', 'series', 'canon', 'new', 'canon', 'series'];
  n int := coalesce(array_length(p_services, 1), 0);
  lists jsonb;
  used bigint[] := '{}';
  r int; c int; k int; s text; b text; got bigint; tries text[]; l jsonb; p text; v jsonb;
begin
  if n = 0 then return; end if;
  -- up to 40 candidates per service and part, best rated first
  select coalesce(jsonb_object_agg(key, ids), '{}') into lists from (
    select x.service_id || ':' || x.part as key, jsonb_agg(x.id order by x.n) as ids from (
      select z.service_id, z.part, z.id,
        row_number() over (partition by z.service_id, z.part order by z.score desc nulls last, z.fame desc) as n
      from (
        select a.service_id, t.id, t.fame, w.part,
          case when w.part = 'series' then t.imdb_rating else sc.letterboxd end as score
        from public.availability a join public.titles t on t.id = a.title_id
          left join public.scores sc on sc.title_id = t.id
          cross join lateral (select public.wall_part(t.kind, t.year, t.imdb_votes, sc.letterboxd, t.imdb_rating, sc.rt_critics, y) as part) w
        where a.service_id = any(p_services) and t.poster_path is not null
          and (t.year >= y - 5 or t.year <= y - 20) and t.imdb_votes >= 20000
          and not t.tags && '{kids,standup}' and not t.tags @> '{music,documentaries}'
          and (t.kind <> 'film' or coalesce(t.runtime_min, 90) >= 60)
      ) z where z.part is not null
    ) x where x.n <= 40 group by x.service_id, x.part
  ) q;
  for r in 0 .. p_rows - 1 loop
    for c in 0 .. p_cols - 1 loop
      got := null;
      b := mix[(c + 3 * r) % 8 + 1];
      -- an empty part gives the nearest one: new and canon films stand in for each other first
      tries := case b when 'new' then array['new', 'canon', 'series'] when 'canon' then array['canon', 'new', 'series']
        else array['series', 'new', 'canon'] end;
      <<services>>
      for k in 0 .. n - 1 loop
        s := p_services[(c + 3 * r + k) % n + 1];
        foreach p in array tries loop
          l := lists -> (s || ':' || p);
          continue when l is null;
          for v in select jsonb_array_elements(l) loop
            if not (v::text::bigint = any(used)) then got := v::text::bigint; exit services; end if;
          end loop;
        end loop;
      end loop;
      if got is not null then
        used := used || got;
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
  mix(step, part) as (values (0, 'new'), (1, 'canon'), (2, 'new'), (3, 'series'), (4, 'canon'), (5, 'new'), (6, 'canon'), (7, 'series')),
  slots as (select step, part, row_number() over (partition by part order by step) - 1 as k from mix),
  per as (select part, count(*)::int as per8 from mix group by part),   -- new 3, canon 3, series 2 in every 8
  titled as (
    select t.poster_path, t.fame, w.part, case when w.part = 'series' then t.imdb_rating else sc.letterboxd end as score
    from public.titles t cross join y left join public.scores sc on sc.title_id = t.id
      cross join lateral (select public.wall_part(t.kind, t.year, t.imdb_votes, sc.letterboxd, t.imdb_rating, sc.rt_critics, y.now) as part) w
    where t.poster_path is not null and t.imdb_votes >= 20000 and not t.tags && '{kids,standup}' and not t.tags @> '{music,documentaries}'
          and (t.kind <> 'film' or coalesce(t.runtime_min, 90) >= 60)
      and exists (select 1 from public.availability a where a.title_id = t.id)
  ),
  picked as (select poster_path, part, row_number() over (partition by part order by score desc nulls last, fame desc) - 1 as n from titled where part is not null)
  select row_number() over (order by p.n / per.per8, s.step), p.poster_path
  from picked p join per using (part) join slots s on s.part = p.part and s.k = p.n % per.per8
  where p.n / per.per8 < 6;   -- 6 rounds of 8: 48 posters
$$;
revoke execute on function public.refresh_start_wall() from public, anon, authenticated;
select public.refresh_start_wall();
