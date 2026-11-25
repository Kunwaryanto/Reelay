-- The generic part of Home, ready for a phone that has none saved (a first sign-in, a new phone). Home is built on
-- the phone from about 30 requests (home.ts), which took about 5 s the first time. The rows everybody gets
-- (trending, new on your services, leaving soon, new films and series) are built here once per set of services
-- and kept until the next sync or the next day: one request, and the phone fits them to the member (their hidden
-- tags, the films they have logged) and shows Home at once; the personal and rotating rows come with the next
-- Home it builds, out of sight. The nightly sync makes it ready for every member's set (refresh_home_bases).

create table public.home_base (
  services_key text primary key,       -- the services, sorted and joined with ','; '' for every service
  day          date not null,          -- Sweden's day it was built for (leaving soon and new arrivals count from it)
  stamp        timestamptz,            -- data_stamp.finished_at it was built from
  data         jsonb not null,
  built_at     timestamptz not null default now()
);
alter table public.home_base enable row level security; -- read only through home_base()

-- One title as Home's cards have it (home.ts `H`), with its availability on the given services, its tags (for the
-- member's hidden ones) and its popularity (to order arrivals within a day).
create or replace function public.home_card(p_id bigint, p_services text[])
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'year', t.year, 'poster_path', t.poster_path,
    'backdrop_path', t.backdrop_path, 'logo_path', t.logo_path, 'genres', t.genres, 'seasons', t.seasons,
    'runtime_min', t.runtime_min, 'tags', t.tags, 'popularity', t.popularity,
    'availability', coalesce((select jsonb_agg(jsonb_build_object('service_id', a.service_id, 'leaves_on', a.leaves_on))
      from public.availability a where a.title_id = t.id and (p_services is null or a.service_id = any (p_services))), '[]'::jsonb))
  from public.titles t where t.id = p_id
$$;

create or replace function public.build_home_base(p_services text[])
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  d date := (now() at time zone 'Europe/Stockholm')::date;
  y int := extract(year from d)::int;
  svc text[] := nullif(p_services, '{}');
  out jsonb;
begin
  with streams as (  -- titles on the services (every title that streams, without services)
    select distinct a.title_id as id from public.availability a where svc is null or a.service_id = any (svc)
  ), ranked as (
    select t.id, t.kind, t.trend_rank, t.popularity, t.year from public.titles t join streams s on s.id = t.id
  )
  select jsonb_build_object(
    'day', d,
    'trendF', (select coalesce(jsonb_agg(public.home_card(id, svc) order by trend_rank), '[]') from
      (select id, trend_rank from ranked where kind = 'film' and trend_rank is not null order by trend_rank limit 60) x),
    'trendS', (select coalesce(jsonb_agg(public.home_card(id, svc) order by trend_rank), '[]') from
      (select id, trend_rank from ranked where kind = 'series' and trend_rank is not null order by trend_rank limit 60) x),
    'newF', (select coalesce(jsonb_agg(public.home_card(id, svc) order by popularity desc), '[]') from
      (select id, popularity from ranked where kind = 'film' and year >= y - 1 order by popularity desc nulls last limit 40) x),
    'newS', (select coalesce(jsonb_agg(public.home_card(id, svc) order by popularity desc), '[]') from
      (select id, popularity from ranked where kind = 'series' and year >= y - 1 order by popularity desc nulls last limit 40) x),
    'arrivals', (select coalesce(jsonb_agg(jsonb_build_object('happened_on', e.happened_on, 'service_id', e.service_id,
        'title', public.home_card(e.title_id, svc)) order by e.happened_on desc), '[]') from
      (select e.title_id, e.service_id, e.happened_on from public.availability_events e join streams s on s.id = e.title_id
        where e.event = 'added' and e.happened_on >= d - 30 and (svc is null or e.service_id = any (svc))
        order by e.happened_on desc limit 200) e),
    'leaving', (select coalesce(jsonb_agg(jsonb_build_object('leaves_on', l.leaves_on, 'service_id', l.service_id,
        'title', public.home_card(l.title_id, svc)) order by l.leaves_on), '[]') from
      (select a.title_id, a.service_id, a.leaves_on from public.availability a
        where a.leaves_on between d and d + 30 and (svc is null or a.service_id = any (svc))
        order by a.leaves_on limit 80) l)
  ) into out;
  insert into public.home_base (services_key, day, stamp, data, built_at)
  values (coalesce(array_to_string(svc, ','), ''), d, (select finished_at from public.data_stamp where id = 1), out, now())
  on conflict (services_key) do update set day = excluded.day, stamp = excluded.stamp, data = excluded.data, built_at = now();
  return out;
end;
$$;

-- What the phone asks for: the ready one when it is from today's data, else built now (and kept for the next).
create or replace function public.home_base(p_services text[] default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  svc text[] := (select array_agg(s order by s) from unnest(coalesce(p_services, '{}')) s);
  key text := coalesce(array_to_string(svc, ','), '');
  got record;
begin
  if auth.uid() is null then return null; end if;
  select h.day, h.stamp, h.data into got from public.home_base h where h.services_key = key;
  if found and got.day = (now() at time zone 'Europe/Stockholm')::date
     and got.stamp is not distinct from (select finished_at from public.data_stamp where id = 1) then
    return got.data;
  end if;
  return public.build_home_base(svc);
end;
$$;

-- The nightly sync: ready for every member's set of services, and for every service.
create or replace function public.refresh_home_bases()
returns int
language plpgsql security definer
set search_path = ''
as $$
declare n int := 0; s text[];
begin
  perform public.build_home_base(null);
  n := 1;
  for s in select distinct array_agg(service_id order by service_id) from public.user_services group by user_id loop
    perform public.build_home_base(s);
    n := n + 1;
  end loop;
  delete from public.home_base where built_at < now() - interval '3 days';
  return n;
end;
$$;

revoke execute on function public.home_card(bigint, text[]) from public, anon, authenticated;
revoke execute on function public.build_home_base(text[]) from public, anon, authenticated;
revoke execute on function public.refresh_home_bases() from public, anon, authenticated;
revoke execute on function public.home_base(text[]) from public, anon;
grant execute on function public.home_base(text[]) to authenticated;
