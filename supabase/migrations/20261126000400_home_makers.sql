-- Tonight's picks, taste reasons: a director of a film the member loved ("From the director of Heat") and an actor
-- who is in at least two films they loved ("With Florence Pugh"), with that person's other titles that stream on
-- the member's services, most popular first. One director and one actor a day, in turn (p_day), so the reasons
-- change from day to day. Loved: rated 4 or more on Letterboxd. Films they logged are left out (p_hide).
create or replace function public.home_makers(p_day int, p_services text[] default null, p_hide boolean default true)
returns table (role text, person_id bigint, name text, source text, title_id bigint)
language sql stable
set search_path = ''
as $$
  with loved as (
    select t.id, t.title, max(l.rating) as rating
    from public.letterboxd_logs l join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film'
    where l.user_id = (select auth.uid()) and l.rating >= 4
    group by t.id, t.title
  ), makers as (
    -- directors of a loved film (named by their best-rated one), and actors billed top 5 in two or more
    select 'director' as role, c.person_id, (array_agg(lv.title order by lv.rating desc, lv.id))[1] as source
    from public.credits c join loved lv on lv.id = c.title_id
    where c.role = 'director'
    group by c.person_id
    union all
    select 'actor', c.person_id, null
    from public.credits c join loved lv on lv.id = c.title_id
    where c.role = 'cast' and c.sort_order < 5
    group by c.person_id having count(distinct lv.id) >= 2
  ), theirs as (
    select m.role, m.person_id, m.source, t.id as title_id, t.popularity
    from makers m
    join public.credits c on c.person_id = m.person_id
      and (case m.role when 'director' then c.role in ('director', 'creator') else c.role = 'cast' and c.sort_order < 5 end)
    join public.titles t on t.id = c.title_id
    where t.id not in (select id from loved)
      and exists (select 1 from public.availability a where a.title_id = t.id and (p_services is null or a.service_id = any (p_services)))
      and (not p_hide or t.kind <> 'film' or not exists (select 1 from public.letterboxd_logs x where x.user_id = (select auth.uid()) and x.tmdb_id = t.tmdb_id))
  ), ok as (
    select role, person_id, row_number() over (partition by role order by person_id) - 1 as i, count(*) over (partition by role) as n
    from (select distinct role, person_id from theirs) x
  )
  select th.role, th.person_id, p.name, th.source, th.title_id
  from ok join theirs th on th.role = ok.role and th.person_id = ok.person_id
  join public.people p on p.id = ok.person_id
  where ok.i = abs(p_day) % ok.n
  order by th.role, th.popularity desc, th.title_id
$$;
revoke execute on function public.home_makers(int, text[], boolean) from public, anon;
grant execute on function public.home_makers(int, text[], boolean) to authenticated;
