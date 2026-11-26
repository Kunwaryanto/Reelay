-- Browse, built like Home: on the member's own services, without their logged films or the tags they hide, and
-- each page in one request.
--   title_moods      moods and themes ("Feel-good", "Heist"…), from TMDB keywords: written by the sync (syncMoods)
--   browse_ids       the titles of one row of a category, in its order: the one definition of every row
--   browse_page      a category page: its top titles, its picks (with why) and its rows, as cards
--   browse_list      one row as a whole list (View all, Browse's lists), as cards
--   browse_covers    the Browse cards' pictures: a few candidates per category, in one request
-- A category is a rule (jsonb, written in the app's browse.ts): genres, from, to, country, under (minutes), rating,
-- votes [min, max], mood, leaving, arrived (days), trending, awards. Nothing about categories is stored here.

create table if not exists public.title_moods (
  title_id bigint not null references public.titles(id) on delete cascade,
  mood     text not null,
  primary key (mood, title_id)
);
alter table public.title_moods enable row level security;
create policy "signed in read title_moods" on public.title_moods for select to authenticated using (true);
grant select on public.title_moods to authenticated;

-- Titles as Browse's cards read them (Home's card, with what the filter drawer looks at: language, scores), in the
-- order given, in one query. p_services: the services to show (null: all of them).
create or replace function public.browse_cards(p_ids bigint[], p_services text[])
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'kind', t.kind, 'title', t.title, 'year', t.year, 'poster_path', t.poster_path,
    'backdrop_path', t.backdrop_path, 'logo_path', t.logo_path, 'hero_path', t.hero_path, 'hero_poster', t.hero_poster,
    'genres', t.genres, 'seasons', t.seasons, 'runtime_min', t.runtime_min, 'tags', t.tags, 'popularity', t.popularity,
    'imdb_rating', t.imdb_rating, 'imdb_votes', t.imdb_votes, 'original_language', t.original_language,
    'scores', case when s.title_id is not null then jsonb_build_object('imdb_rating', s.imdb_rating, 'rt_critics', s.rt_critics, 'letterboxd', s.letterboxd) end,
    'availability', coalesce(a.offers, '[]'::jsonb)) order by x.n), '[]'::jsonb)
  from unnest(p_ids) with ordinality x(id, n)
  join public.titles t on t.id = x.id
  left join public.scores s on s.title_id = t.id
  left join lateral (
    select jsonb_agg(jsonb_build_object('service_id', o.service_id, 'leaves_on', o.leaves_on)) as offers
    from public.availability o where o.title_id = t.id and (p_services is null or o.service_id = any (p_services))
  ) a on true
$$;
revoke execute on function public.browse_cards(bigint[], text[]) from public, anon, authenticated;

-- Whether a title fits a category's rule (the rules that don't depend on the member).
create or replace function public.browse_fits(t public.titles, r jsonb)
returns boolean
language sql stable
set search_path = ''
as $$
  select (r->'genres' is null or t.genres && array(select jsonb_array_elements_text(r->'genres')))
    and (r->>'from' is null or t.year >= (r->>'from')::int)
    and (r->>'to' is null or t.year <= (r->>'to')::int)
    and (r->>'country' is null or t.countries @> array[r->>'country'])
    and (r->>'under' is null or (t.kind = 'film' and t.runtime_min > 40 and t.runtime_min < (r->>'under')::int))
    and (r->>'rating' is null or t.imdb_rating >= (r->>'rating')::numeric)
    and (r->'votes' is null or (t.imdb_votes >= (r->'votes'->>0)::int and (r->'votes'->>1 is null or t.imdb_votes <= (r->'votes'->>1)::int)))
    and (r->>'mood' is null or exists (select 1 from public.title_moods m where m.mood = r->>'mood' and m.title_id = t.id))
    and (not coalesce((r->>'trending')::boolean, false) or t.trend_rank is not null)
    and (not coalesce((r->>'awards')::boolean, false) or exists (select 1 from public.awards w where w.title_id = t.id and w.won))
$$;

-- One title of a category as the rows weigh it: worked out once per page (browse_pool), then every row picks
-- from it (browse_keep, browse_order), so a page with ten rows reads the catalogue once.
create type public.browse_item as (
  id bigint, kind text, year int, popularity real, fame real, imdb_rating numeric, imdb_votes int, trend_rank int,
  mine boolean, leaves_on date, art boolean, rt smallint, lb numeric, arrived date, awarded boolean
);

-- A category's titles for the member (auth.uid()): on any service, with whether they are on the member's own
-- (theirs; all when they have none), without the tags they hide and the films they logged (unless they show them).
create or replace function public.browse_pool(p_rule jsonb, p_kind text)
returns setof public.browse_item
language plpgsql stable security definer
set search_path = ''
set jit = off  -- compiling the plan took 0.6 s of a 0.1 s query
as $$
begin
  -- plpgsql, so each call is planned with its own rule (a plain SQL function was planned once for any rule: 30 s)
  return query
  with me as (
    select nullif(array(select s.service_id from public.user_services s where s.user_id = (select auth.uid())), '{}') as svc,
      coalesce((select p.hidden_tags from public.profiles p where p.user_id = (select auth.uid())), '{}') as hide,
      coalesce((select a.hide_watched from public.letterboxd_accounts a where a.user_id = (select auth.uid())), true) as hide_seen,
      (now() at time zone 'Europe/Stockholm')::date as today
  ), r as (
    -- the rule, read once
    select case when p_rule ? 'genres' then array(select jsonb_array_elements_text(p_rule->'genres')) end as genres,
      (p_rule->>'from')::int as y0, (p_rule->>'to')::int as y1, p_rule->>'country' as country, (p_rule->>'under')::int as under,
      (p_rule->>'rating')::numeric as rating, (p_rule->'votes'->>0)::int as v0, (p_rule->'votes'->>1)::int as v1,
      p_rule->>'mood' as mood, coalesce((p_rule->>'trending')::boolean, false) as trending, coalesce((p_rule->>'awards')::boolean, false) as awards
  ), seen as (
    select distinct l.tmdb_id from public.letterboxd_logs l, me
    where l.user_id = (select auth.uid()) and me.hide_seen and l.tmdb_id is not null
  ), base as materialized (
    select t.id, t.kind, t.year, t.popularity, t.fame, t.imdb_rating, t.imdb_votes, t.trend_rank, t.backdrop_path, t.logo_path
    from public.titles t, r, me
    where (p_kind is null or t.kind = p_kind)
      and (r.genres is null or t.genres && r.genres)
      and (r.y0 is null or t.year >= r.y0) and (r.y1 is null or t.year <= r.y1)
      and (r.country is null or t.countries @> array[r.country])
      and (r.under is null or (t.kind = 'film' and t.runtime_min > 40 and t.runtime_min < r.under))
      and (r.rating is null or t.imdb_rating >= r.rating)
      and (r.v0 is null or t.imdb_votes >= r.v0) and (r.v1 is null or t.imdb_votes <= r.v1)
      and (r.mood is null or exists (select 1 from public.title_moods m where m.mood = r.mood and m.title_id = t.id))
      and (not r.trending or t.trend_rank is not null)
      and (not r.awards or exists (select 1 from public.awards w where w.title_id = t.id and w.won))
      and not (t.tags && me.hide)
      and not (t.kind = 'film' and t.tmdb_id in (select tmdb_id from seen))
  ), offers as (
    select a.title_id, bool_or(me.svc is null or a.service_id = any (me.svc)) as mine,
      min(a.leaves_on) filter (where (me.svc is null or a.service_id = any (me.svc)) and a.leaves_on >= me.today) as leaves_on
    from public.availability a cross join me
    where a.title_id in (select id from base)
    group by a.title_id
  ), arrivals as (
    select e.title_id, max(e.happened_on) as arrived
    from public.availability_events e cross join me
    where e.event = 'added' and (me.svc is null or e.service_id = any (me.svc)) and e.title_id in (select id from base)
    group by e.title_id
  )
  select b.id, b.kind, b.year, b.popularity, b.fame, b.imdb_rating, b.imdb_votes, b.trend_rank,
    o.mine, o.leaves_on, b.backdrop_path is not null and b.logo_path is not null, s.rt_critics, s.letterboxd, ar.arrived,
    exists (select 1 from public.awards w where w.title_id = b.id and w.won)
  from base b
  join offers o on o.title_id = b.id
  left join public.scores s on s.title_id = b.id
  left join arrivals ar on ar.title_id = b.id;
end
$$;
revoke execute on function public.browse_pool(jsonb, text) from public, anon, authenticated;

-- Whether a title belongs in a row. Every row but "elsewhere" is on the member's services.
--   popular, new (arrived within 30 days), trending, critics (RT 90%+), top (highest rated), gems (7.3+ with 2,000
--   to 30,000 votes), classics (25+ years old, loved), awards (winners), leaving (within 30 days), elsewhere (not on
--   their services), hero (popular, with a backdrop and a logo). The category's own leaving/arrived rules too.
create or replace function public.browse_keep(i public.browse_item, p_row text, p_rule jsonb)
returns boolean
language sql stable
as $$
  select case when p_row = 'elsewhere' then not i.mine else i.mine end
    and case p_row
      when 'hero' then i.art
      when 'new' then i.arrived >= (now() at time zone 'Europe/Stockholm')::date - 30
      when 'trending' then i.trend_rank is not null
      when 'critics' then i.imdb_votes >= 5000 and i.rt >= 90
      when 'top' then i.imdb_votes >= case when p_rule ? 'genres' or p_rule ? 'mood' then 20000 else 3000 end
      when 'gems' then i.imdb_rating >= 7.3 and i.imdb_votes between 2000 and 30000
      when 'classics' then i.year <= extract(year from now())::int - 25 and i.imdb_votes >= 25000 and (i.imdb_rating >= 7.8 or i.lb >= 3.9)
      when 'awards' then i.awarded
      when 'leaving' then i.leaves_on <= (now() at time zone 'Europe/Stockholm')::date + 30
      else true end
    and (not coalesce((p_rule->>'leaving')::boolean, false) or i.leaves_on <= (now() at time zone 'Europe/Stockholm')::date + 30)
    and (p_rule->>'arrived' is null or i.arrived >= (now() at time zone 'Europe/Stockholm')::date - (p_rule->>'arrived')::int)
$$;

-- A row's order (smallest first), or another sort (a View all's: popular, rated, newest, leaving, trending).
create or replace function public.browse_order(i public.browse_item, p_row text, p_sort text)
returns double precision
language sql stable
as $$
  select case coalesce(p_sort, case p_row when 'leaving' then 'leaving' when 'trending' then 'trending' when 'critics' then 'critics'
      when 'top' then 'rated' when 'gems' then 'rated' when 'classics' then 'classics' when 'elsewhere' then 'fame' else 'popular' end)
    when 'leaving' then extract(epoch from i.leaves_on)
    when 'trending' then i.trend_rank
    when 'rated' then -i.imdb_rating
    when 'critics' then -(coalesce(i.rt, 0) * 10 + coalesce(i.imdb_rating, 0))
    when 'classics' then -coalesce(i.lb * 2, i.imdb_rating, 0)
    when 'fame' then -i.fame
    when 'newest' then -i.year
    else -i.popularity end
$$;

-- The titles of one row, in order (a whole list: View all, Browse's lists).
create or replace function public.browse_ids(p_rule jsonb, p_row text, p_kind text, p_limit int, p_sort text default null)
returns table (id bigint, n int)
language plpgsql stable security definer
set search_path = ''
set jit = off  -- compiling the plan took 0.6 s of a 0.1 s query
as $$
begin
  return query
  select x.id, (row_number() over ())::int from (
    select p.id from public.browse_pool(p_rule, p_kind) p
    where public.browse_keep(p, p_row, p_rule)
    order by public.browse_order(p, p_row, p_sort) nulls last, p.popularity desc nulls last, p.id
    limit p_limit
  ) x;
end
$$;
revoke execute on function public.browse_ids(jsonb, text, text, int, text) from public, anon, authenticated;

-- A row (or a category's own list) as cards.
create or replace function public.browse_list(p_rule jsonb, p_row text, p_kind text default null, p_limit int default 90, p_sort text default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
set jit = off  -- compiling the plan took 0.6 s of a 0.1 s query
as $$
declare svc text[] := nullif(array(select s.service_id from public.user_services s where s.user_id = (select auth.uid())), '{}');
begin
  return public.browse_cards(array(select b.id from public.browse_ids(p_rule, p_row, p_kind, p_limit, p_sort) b order by b.n),
    case when p_row = 'elsewhere' then null else svc end);
end
$$;
revoke execute on function public.browse_list(jsonb, text, text, int, text) from public, anon;
grant execute on function public.browse_list(jsonb, text, text, int, text) to authenticated;

-- A category page: its top titles, its picks and its rows, in one request. p_rows: the rows to fill (the app
-- decides their order); each comes back with up to p_shows + 1 cards (one more tells it has more than it shows).
-- Picks: up to five titles with why, one of each kind of reason, taking turns by day (p_day):
--   because (a film the member rated 4+), friend (another member rated it 4+), critics, award, new (just arrived).
create or replace function public.browse_page(p_rule jsonb, p_kind text, p_rows text[], p_day int, p_shows int default 15)
returns jsonb
language plpgsql stable security definer
set search_path = ''
set jit = off  -- compiling the plan took 0.6 s of a 0.1 s query
as $$
begin
  return (
  with me as (
    select nullif(array(select s.service_id from public.user_services s where s.user_id = (select auth.uid())), '{}') as svc
  ), pool as materialized (
    select * from public.browse_pool(p_rule, p_kind)
  ), ranked as materialized (
    -- every row's first titles (one more than it shows: that tells it has more)
    select r.row_id, r.i, x.id, x.n from (
      select u.row_id, min(u.i) as i from unnest(p_rows || array['hero', 'critics', 'awards', 'new']) with ordinality u(row_id, i) group by u.row_id
    ) r
    cross join lateral (
      select p.id, row_number() over (order by public.browse_order(p, r.row_id, null) nulls last, p.popularity desc nulls last, p.id) as n
      from pool p where public.browse_keep(p, r.row_id, p_rule)
      order by n limit case when r.row_id = 'hero' then 3 else p_shows + 1 end
    ) x
  ), pop as (
    select p.id from pool p where p.mine order by p.popularity desc nulls last limit 400
  ), loved as (
    select t.id, t.title, l.rating
    from public.letterboxd_logs l join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film'
    where l.user_id = (select auth.uid()) and l.rating >= 4
  ), because as (
    -- for each film they loved, the first title like it in this category
    select distinct on (lv.id) lv.title as source, p.id
    from loved lv
    join public.title_similar s on s.title_id = lv.id
    cross join lateral unnest(s.ids) with ordinality as x(id, pos)
    join pop p on p.id = x.id
    order by lv.id, x.pos
  ), friend as (
    select p.id, coalesce(nullif(split_part(a.display_name, ' ', 1), ''), a.username) as who, max(l.rating) as rating
    from pop p join public.titles t on t.id = p.id and t.kind = 'film'
    join public.letterboxd_logs l on l.tmdb_id = t.tmdb_id and l.user_id <> (select auth.uid()) and l.rating >= 4
    join public.letterboxd_accounts a on a.user_id = l.user_id
    group by p.id, a.display_name, a.username
  ), award as (
    select distinct on (r.id) r.id, w.short_category || ' · ' || w.award || ' ' || w.year as line
    from ranked r join public.awards w on w.title_id = r.id and w.won
    where r.row_id = 'awards' and r.n <= 10
    order by r.id, w.rank, w.year desc
  ), arrived as (
    select distinct on (r.id) r.id, e.service_id
    from ranked r cross join me
    join public.availability_events e on e.title_id = r.id and e.event = 'added' and (me.svc is null or e.service_id = any (me.svc))
    where r.row_id = 'new' and r.n <= 10
    order by r.id, e.happened_on desc
  ), reasons as (
    select 1 as kind, id, 'Because you liked ' || source as reason, null::text as via, row_number() over (order by source, id) as k, count(*) over () as of from because
    union all select 2, id, who || ' rated it ' || to_char(rating, 'FM0.0'), null, row_number() over (order by rating desc, id), count(*) over () from friend
    union all select 3, r.id, 'Critics’ favourite · RT ' || p.rt || '%', null, row_number() over (order by r.n), count(*) over ()
      from ranked r join pool p on p.id = r.id where r.row_id = 'critics' and r.n <= 10
    union all select 4, id, line, null, row_number() over (order by id), count(*) over () from award
    union all select 5, id, 'Just arrived', service_id, row_number() over (order by id), count(*) over () from arrived
  ), turn as (
    -- the day's turn among each kind's candidates (two of the films they loved); a title once
    select distinct on (id) * from (
      select * from reasons where (k - 1) = abs(p_day) % greatest(of, 1) or (kind = 1 and of > 1 and (k - 1) = (abs(p_day) + 1) % of)
    ) r order by id, kind
  ), picks as (
    select t.*, row_number() over (order by kind, k) as pos from turn t order by kind, k limit 5
  )
  select jsonb_build_object(
    'hero', public.browse_cards(array(select r.id from ranked r where r.row_id = 'hero' order by r.n), me.svc),
    'picks', (select coalesce(jsonb_agg(c || jsonb_build_object('reason', p.reason, 'via', p.via,
        'by', (select coalesce(jsonb_agg(pe.name order by cr.sort_order), '[]'::jsonb) from public.credits cr join public.people pe on pe.id = cr.person_id
               where cr.title_id = p.id and cr.role in ('director', 'creator')))
      order by p.pos), '[]'::jsonb)
      from picks p join jsonb_array_elements(public.browse_cards(array(select id from picks), me.svc)) c on (c->>'id')::bigint = p.id),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', q.row_id, 'items',
        public.browse_cards(q.ids, case when q.row_id = 'elsewhere' then null else me.svc end)) order by q.i) from (
        select r.row_id, min(r.i) as i, array_agg(r.id order by r.n) as ids
        from ranked r where r.row_id = any (p_rows) group by r.row_id) q), '[]'::jsonb)
  ) from me
  );
end
$$;
revoke execute on function public.browse_page(jsonb, text, text[], int, int) from public, anon;
grant execute on function public.browse_page(jsonb, text, text[], int, int) to authenticated;

-- The Browse cards' pictures: for each category ([{id, rule, kind}]), up to five candidates (the backdrops of its most
-- popular streaming titles); the app takes one per card, no title twice. The pictures are everyone's, not the
-- member's, so they are kept (browse_cover_cache) until the nightly sync's stamp moves: one member works them out
-- once a day, everyone else reads them.
create table if not exists public.browse_cover_cache (
  key   text primary key,       -- md5 of the categories asked for
  stamp timestamptz,            -- data_stamp.finished_at they were worked out from
  data  jsonb not null,
  built_at timestamptz not null default now()
);
alter table public.browse_cover_cache enable row level security;  -- only through browse_covers
revoke all on public.browse_cover_cache from anon, authenticated;

create or replace function public.browse_covers(p_cats jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
set jit = off
as $$
declare
  k text := md5(p_cats::text);
  now_stamp timestamptz := (select finished_at from public.data_stamp where id = 1);
  got jsonb;
  c jsonb;
  top bigint[];
  out jsonb := '{}';
  pick jsonb;
begin
  select x.data into got from public.browse_cover_cache x where x.key = k and x.stamp is not distinct from now_stamp;
  if got is not null then return got; end if;
  -- the most popular streaming titles with a backdrop: nearly every category finds its five among them
  top := array(select t.id from public.titles t where t.backdrop_path is not null
    and exists (select 1 from public.availability a where a.title_id = t.id) order by t.popularity desc nulls last limit 4000);
  for c in select * from jsonb_array_elements(p_cats) loop
    select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'path', x.path)), '[]'::jsonb) into pick from (
      select t.id, t.backdrop_path as path from public.titles t
      where t.id = any (top) and (c->>'kind' is null or t.kind = c->>'kind') and public.browse_fits(t, c->'rule')
      order by t.popularity desc nulls last limit 5) x;
    if pick = '[]'::jsonb then
      -- a small category (a country, a mood): look further
      select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'path', x.path)), '[]'::jsonb) into pick from (
        select t.id, coalesce(t.backdrop_path, t.poster_path) as path from public.titles t
        where (c->>'kind' is null or t.kind = c->>'kind') and public.browse_fits(t, c->'rule')
          and coalesce(t.backdrop_path, t.poster_path) is not null
          and exists (select 1 from public.availability a where a.title_id = t.id)
        order by t.popularity desc nulls last limit 5) x;
    end if;
    out := out || jsonb_build_object(c->>'id', pick);
  end loop;
  insert into public.browse_cover_cache (key, stamp, data) values (k, now_stamp, out)
  on conflict (key) do update set stamp = excluded.stamp, data = excluded.data, built_at = now();
  delete from public.browse_cover_cache where built_at < now() - interval '7 days';
  return out;
end
$$;
revoke execute on function public.browse_covers(jsonb) from public, anon;
grant execute on function public.browse_covers(jsonb) to authenticated;
