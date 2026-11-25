-- The walls, tuned after a look at the real ones: long-running series with a recent season (SpongeBob, Grey's Anatomy,
-- Law & Order) counted as new, so a series is new only if it started in the last 5 years. And onboarding's wall took
-- 5 s: the part of the mix is now worked out once per title from plain columns, after the cheap filters.

drop function if exists public.wall_bucket(public.titles, date);
create or replace function public.wall_part(p_kind text, p_year int, p_votes int, p_now int) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_kind = 'film' and p_year >= p_now - 5 then 'new'
    when p_kind = 'film' and p_year <= p_now - 15 and coalesce(p_votes, 0) >= 10000 then 'classic'
    when p_kind = 'series' and p_year >= p_now - 5 then 'series'
  end
$$;

create or replace function public.onboarding_wall(p_services text[], p_rows int default 8, p_cols int default 8)
returns table (pos int, title_id bigint, service_id text)
language plpgsql stable set search_path = '' as $$
declare
  y int := extract(year from (now() at time zone 'Europe/Stockholm'))::int;
  mix constant text[] := array['new', 'classic', 'new', 'series', 'classic', 'new', 'classic', 'series'];
  parts constant text[] := array['new', 'classic', 'series'];
  n int := coalesce(array_length(p_services, 1), 0);
  lists jsonb;
  used bigint[] := '{}';
  r int; c int; k int; s text; b text; got bigint; tries text[]; l jsonb; p text; v jsonb;
begin
  if n = 0 then return; end if;
  -- up to 40 candidates per service and part: 10,000+ votes first, then fame
  select coalesce(jsonb_object_agg(key, ids), '{}') into lists from (
    select x.service_id || ':' || x.part as key, jsonb_agg(x.id order by x.n) as ids from (
      select z.service_id, z.part, z.id,
        row_number() over (partition by z.service_id, z.part order by z.known desc, z.fame desc) as n
      from (
        select a.service_id, t.id, t.fame, coalesce(t.imdb_votes, 0) >= 10000 as known,
          public.wall_part(t.kind, t.year, t.imdb_votes, y) as part
        from public.availability a join public.titles t on t.id = a.title_id
        where a.service_id = any(p_services) and t.poster_path is not null
          and (t.year >= y - 5 or (t.kind = 'film' and t.year <= y - 15 and t.imdb_votes >= 10000))
          and not 'kids' = any(t.tags)
      ) z where z.part is not null
    ) x where x.n <= 40 group by x.service_id, x.part
  ) q;
  for r in 0 .. p_rows - 1 loop
    for c in 0 .. p_cols - 1 loop
      got := null;
      b := mix[(c + 3 * r) % 8 + 1];
      tries := array[b] || array(select pp from unnest(parts) pp where pp <> b);
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
  mix(step, part) as (values (0, 'new'), (1, 'classic'), (2, 'new'), (3, 'series'), (4, 'classic'), (5, 'new'), (6, 'classic'), (7, 'series')),
  slots as (select step, part, row_number() over (partition by part order by step) - 1 as k from mix),
  per as (select part, count(*)::int as per8 from mix group by part),   -- new 3, classic 3, series 2 in every 8
  titled as (
    select t.poster_path, t.fame, public.wall_part(t.kind, t.year, t.imdb_votes, y.now) as part
    from public.titles t, y
    where t.poster_path is not null and t.imdb_votes >= 10000 and t.imdb_rating >= 6.5 and not 'kids' = any(t.tags)
      and exists (select 1 from public.availability a where a.title_id = t.id)
  ),
  picked as (select poster_path, part, row_number() over (partition by part order by fame desc) - 1 as n from titled where part is not null)
  select row_number() over (order by p.n / per.per8, s.step), p.poster_path
  from picked p join per using (part) join slots s on s.part = p.part and s.k = p.n % per.per8
  where p.n / per.per8 < 6;   -- 6 rounds of 8: 48 posters
$$;
revoke execute on function public.refresh_start_wall() from public, anon, authenticated;
select public.refresh_start_wall();
