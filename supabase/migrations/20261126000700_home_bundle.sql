-- Home in two requests instead of about thirty-five. The app still builds Home (src/lib/home.ts: which rows, in
-- what order, the picks and their reasons); these only fetch what it builds from, in the same shapes the separate
-- lookups returned, so the building stays as it was.
--   home_bundle  everything the first step read: trending, arrivals, leaving, the watchlist, the personal lists
--                (home_because, home_friends, home_taste, home_saved, home_people, home_makers), new films and
--                series, the day's award row, hidden gems
--   home_more    the second step: the titles behind the personal lists, saved titles that just arrived, the day's
--                decade and genre rows
-- Cards carry `by_names` (directors or creators) so the picks need no lookup of their own. Titles on the member's
-- services (p_services; all when null), without the tags they hide (p_hidden).

create or replace function public.home_item(p_id bigint, p_services text[])
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select public.home_card(p_id, p_services) || jsonb_build_object('by_names',
    (select coalesce(jsonb_agg(pe.name order by c.sort_order), '[]'::jsonb) from public.credits c join public.people pe on pe.id = c.person_id
     where c.title_id = p_id and c.role in ('director', 'creator')))
$$;
revoke execute on function public.home_item(bigint, text[]) from public, anon, authenticated;

-- Whether a title can be on the member's Home: on their services, not a hidden tag.
create or replace function public.home_ok(t public.titles, p_services text[], p_hidden text[])
returns boolean
language sql stable
set search_path = ''
as $$
  select not (t.tags && coalesce(p_hidden, '{}'))
    and exists (select 1 from public.availability a where a.title_id = t.id and (p_services is null or a.service_id = any (p_services)))
$$;

create or replace function public.home_bundle(p_day int, p_services text[], p_hide boolean, p_hidden text[],
  p_award text, p_award_category text, p_award_kind text, p_gems boolean)
returns jsonb
language plpgsql stable security definer
set search_path = ''
set jit = off
as $$
declare
  today date := (now() at time zone 'Europe/Stockholm')::date;
  year0 int := extract(year from today)::int - 1;
begin
  return jsonb_build_object(
    'trendF', (select coalesce(jsonb_agg(public.home_item(x.id, p_services) order by x.trend_rank), '[]') from (
      select t.id, t.trend_rank from public.titles t where t.kind = 'film' and t.trend_rank is not null and public.home_ok(t, p_services, p_hidden)
      order by t.trend_rank limit 40) x),
    'trendS', (select coalesce(jsonb_agg(public.home_item(x.id, p_services) order by x.trend_rank), '[]') from (
      select t.id, t.trend_rank from public.titles t where t.kind = 'series' and t.trend_rank is not null and public.home_ok(t, p_services, p_hidden)
      order by t.trend_rank limit 40) x),
    'arrivals', (select coalesce(jsonb_agg(jsonb_build_object('happened_on', x.happened_on, 'service_id', x.service_id,
        'title', public.home_item(x.title_id, p_services)) order by x.happened_on desc, x.id), '[]') from (
      select e.id, e.happened_on, e.service_id, e.title_id from public.availability_events e join public.titles t on t.id = e.title_id
      where e.event = 'added' and e.happened_on >= today - 30 and (p_services is null or e.service_id = any (p_services))
        and public.home_ok(t, p_services, p_hidden)
      order by e.happened_on desc, e.id limit 200) x),
    'leaving', (select coalesce(jsonb_agg(jsonb_build_object('leaves_on', x.leaves_on, 'service_id', x.service_id,
        'title', public.home_item(x.title_id, p_services)) order by x.leaves_on, x.title_id), '[]') from (
      select a.leaves_on, a.service_id, a.title_id from public.availability a join public.titles t on t.id = a.title_id
      where a.leaves_on between today and today + 30 and (p_services is null or a.service_id = any (p_services))
        and not (t.tags && coalesce(p_hidden, '{}'))
      order by a.leaves_on, a.title_id limit 60) x),
    'saved', (select coalesce(jsonb_agg(jsonb_build_object('added_at', x.added_at, 'title', public.home_item(x.title_id, p_services))
        order by x.added_at desc), '[]') from (
      select w.added_at, w.title_id from public.watchlist w join public.titles t on t.id = w.title_id
      where w.user_id = (select auth.uid()) and exists (select 1 from public.availability a where a.title_id = t.id
        and (p_services is null or a.service_id = any (p_services)))
      order by w.added_at desc limit 60) x),
    'because', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.home_because(p_day, p_services, p_hide) b),
    'becauseAlt', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.home_because(p_day + 1, p_services, p_hide) b),
    'friends', (select coalesce(jsonb_agg(to_jsonb(f)), '[]') from public.home_friends(p_services, p_hide) f),
    'taste', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from public.home_taste() g),
    'newF', (select coalesce(jsonb_agg(public.home_item(x.id, p_services) order by x.popularity desc), '[]') from (
      select t.id, t.popularity from public.titles t where t.kind = 'film' and t.year >= year0 and public.home_ok(t, p_services, p_hidden)
      order by t.popularity desc nulls last limit 25) x),
    'newS', (select coalesce(jsonb_agg(public.home_item(x.id, p_services) order by x.popularity desc), '[]') from (
      select t.id, t.popularity from public.titles t where t.kind = 'series' and t.year >= year0 and public.home_ok(t, p_services, p_hidden)
      order by t.popularity desc nulls last limit 25) x),
    'awardWins', (select coalesce(jsonb_agg(jsonb_build_object('award', x.award, 'short_category', x.short_category, 'rank', x.rank,
        'year', x.year, 'title', public.home_item(x.title_id, p_services)) order by x.rank, x.year desc), '[]') from (
      select w.award, w.short_category, w.rank, w.year, w.title_id from public.awards w join public.titles t on t.id = w.title_id
      where w.won and w.award = p_award and (p_award_category is null or w.category = p_award_category)
        and (p_award_kind is null or t.kind = p_award_kind) and public.home_ok(t, p_services, p_hidden)
      order by w.rank, w.year desc limit 300) x),
    'theme', case when p_gems then (select coalesce(jsonb_agg(public.home_item(x.id, p_services) order by x.imdb_rating desc), '[]') from (
      select t.id, t.imdb_rating from public.titles t where t.imdb_rating >= 7.5 and t.imdb_votes between 2000 and 30000
        and public.home_ok(t, p_services, p_hidden)
      order by t.imdb_rating desc limit 40) x) else '[]'::jsonb end,
    'savedRecs', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.home_saved(p_day, p_services, p_hide) s),
    'people', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.home_people(p_day, p_services, p_hide) p),
    'makers', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.home_makers(p_day, p_services, p_hide) m)
  );
end
$$;
revoke execute on function public.home_bundle(int, text[], boolean, text[], text, text, text, boolean) from public, anon;
grant execute on function public.home_bundle(int, text[], boolean, text[], text, text, text, boolean) to authenticated;

-- The second step. p_lists: named lists of title ids ({"because": [...], ...}), each returned as cards;
-- p_saved: the saved titles, for which of them arrived lately; p_decade {from, to}; p_genres: genre lists
-- ([["Drama"], ["Crime"]]), each as [films, series].
create or replace function public.home_more(p_services text[], p_hidden text[], p_lists jsonb, p_saved bigint[], p_decade jsonb, p_genres jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = ''
set jit = off
as $$
declare
  today date := (now() at time zone 'Europe/Stockholm')::date;
begin
  return jsonb_build_object(
    'lists', (select coalesce(jsonb_object_agg(l.key, (
        select coalesce(jsonb_agg(public.home_item(t.id, p_services)), '[]') from public.titles t
        where t.id in (select jsonb_array_elements_text(l.value)::bigint) and public.home_ok(t, p_services, p_hidden))), '{}')
      from jsonb_each(p_lists) l),
    'savedArrivals', (select coalesce(jsonb_agg(jsonb_build_object('title_id', e.title_id, 'service_id', e.service_id, 'happened_on', e.happened_on)
        order by e.happened_on desc), '[]') from public.availability_events e
      where e.event = 'added' and e.happened_on >= today - 30 and e.title_id = any (p_saved)
        and (p_services is null or e.service_id = any (p_services))),
    'decade', (select jsonb_agg((select coalesce(jsonb_agg(public.home_item(x.id, p_services) order by x.popularity desc), '[]') from (
        select t.id, t.popularity from public.titles t where t.kind = k and t.year between (p_decade->>'from')::int and (p_decade->>'to')::int
          and public.home_ok(t, p_services, p_hidden) order by t.popularity desc nulls last limit 25) x) order by o)
      from unnest(array['film', 'series']) with ordinality u(k, o)),
    'genres', (select coalesce(jsonb_agg((select jsonb_agg((select coalesce(jsonb_agg(public.home_item(x.id, p_services) order by x.popularity desc), '[]') from (
        select t.id, t.popularity from public.titles t where t.kind = k and t.genres && array(select jsonb_array_elements_text(g.value))
          and public.home_ok(t, p_services, p_hidden) order by t.popularity desc nulls last limit 25) x) order by o)
      from unnest(array['film', 'series']) with ordinality u(k, o)) order by g.ordinality), '[]')
      from jsonb_array_elements(p_genres) with ordinality g)
  );
end
$$;
revoke execute on function public.home_more(text[], text[], jsonb, bigint[], jsonb, jsonb) from public, anon;
grant execute on function public.home_more(text[], text[], jsonb, bigint[], jsonb, jsonb) to authenticated;
