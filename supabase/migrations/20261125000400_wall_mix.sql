-- The walls people pick from and are greeted by: three films for every series. Series are new (started in the last
-- 3 years, or a new season in the last 2); films are half new (last 5 years) and half classics (15+ years old, 10,000+
-- IMDb votes). Never kids' titles. Both walls take turns through the same 8-step pattern, so the mix is even wherever
-- you look: new film, classic, new film, series, classic, new film, classic, series.

-- Which part of the mix a title belongs to: 'new' film, 'classic' film, 'series' (new), or null (not on a wall).
create or replace function public.wall_bucket(t public.titles, p_today date) returns text
language sql stable set search_path = '' as $$
  select case
    when t.kind = 'film' and t.year >= extract(year from p_today)::int - 5 then 'new'
    when t.kind = 'film' and t.year <= extract(year from p_today)::int - 15 and coalesce(t.imdb_votes, 0) >= 10000 then 'classic'
    when t.kind = 'series' and (t.year >= extract(year from p_today)::int - 3 or t.last_season_on >= p_today - interval '2 years') then 'series'
  end
$$;

-- Onboarding's wall: p_rows × p_cols slots, slot (row, col) for service (col + 3 × row) mod n and the mix's step
-- (col + 3 × row) mod 8, so neighbouring slots differ in both. Each service's titles in a part: 10,000+ votes first,
-- then fame. A service with none left of that part gives another part; one with none at all lends the slot on.
create or replace function public.onboarding_wall(p_services text[], p_rows int default 8, p_cols int default 8)
returns table (pos int, title_id bigint, service_id text)
language plpgsql stable set search_path = '' as $$
declare
  today date := (now() at time zone 'Europe/Stockholm')::date;
  mix constant text[] := array['new', 'classic', 'new', 'series', 'classic', 'new', 'classic', 'series'];
  parts constant text[] := array['new', 'classic', 'series'];
  n int := coalesce(array_length(p_services, 1), 0);
  lists jsonb;
  used bigint[] := '{}';
  r int; c int; k int; s text; b text; got bigint; tries text[];
begin
  if n = 0 then return; end if;
  -- up to 40 candidates per service and part
  select coalesce(jsonb_object_agg(key, ids), '{}') into lists from (
    select x.service_id || ':' || x.part as key, jsonb_agg(x.id order by x.n) as ids from (
      select a.service_id, public.wall_bucket(t, today) as part, t.id,
        row_number() over (partition by a.service_id, public.wall_bucket(t, today)
          order by (coalesce(t.imdb_votes, 0) >= 10000) desc, t.fame desc) as n
      from public.titles t join public.availability a on a.title_id = t.id
      where a.service_id = any(p_services) and t.poster_path is not null and not 'kids' = any(t.tags)
        and public.wall_bucket(t, today) is not null
    ) x where x.n <= 40 group by x.service_id, x.part
  ) y;
  for r in 0 .. p_rows - 1 loop
    for c in 0 .. p_cols - 1 loop
      got := null;
      b := mix[(c + 3 * r) % 8 + 1];
      tries := array[b] || array(select p from unnest(parts) p where p <> b);
      for k in 0 .. n - 1 loop
        s := p_services[(c + 3 * r + k) % n + 1];
        select (e.v)::bigint into got from unnest(tries) with ordinality as tp(part, o),
          jsonb_array_elements_text(coalesce(lists -> (s || ':' || tp.part), '[]')) with ordinality as e(v, i)
          where not (e.v)::bigint = any(used) order by tp.o, e.i limit 1;
        exit when got is not null;
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

-- The Start wall: well-known, well-liked titles (10,000+ votes, 6.5+) in the same mix, best known first in each part.
create or replace function public.refresh_start_wall() returns void
language sql security definer set search_path = '' as $$
  delete from public.start_wall_posters;
  insert into public.start_wall_posters (pos, poster_path)
  with today as (select (now() at time zone 'Europe/Stockholm')::date as d),
  mix(step, part) as (values (0, 'new'), (1, 'classic'), (2, 'new'), (3, 'series'), (4, 'classic'), (5, 'new'), (6, 'classic'), (7, 'series')),
  -- the k-th time a part comes up in the pattern takes that part's k-th title
  slots as (select step, part, row_number() over (partition by part order by step) - 1 as k from mix),
  picked as (
    select t.poster_path, public.wall_bucket(t, today.d) as part,
      row_number() over (partition by public.wall_bucket(t, today.d) order by t.fame desc) - 1 as n
    from public.titles t, today
    where t.poster_path is not null and t.imdb_votes >= 10000 and t.imdb_rating >= 6.5 and not 'kids' = any(t.tags)
      and public.wall_bucket(t, today.d) is not null
      and exists (select 1 from public.availability a where a.title_id = t.id)
  ),
  per as (select part, count(*)::int as per8 from mix group by part)   -- new 3, classic 3, series 2 in every 8
  select row_number() over (order by round, s.step), p.poster_path
  from picked p join per using (part)
  join slots s on s.part = p.part and s.k = p.n % per.per8
  cross join lateral (select p.n / per.per8 as round) rr
  where round < 6;   -- 6 rounds of 8: 48 posters
$$;
revoke execute on function public.refresh_start_wall() from public, anon, authenticated;
select public.refresh_start_wall();
