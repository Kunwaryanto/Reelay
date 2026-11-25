-- Fame: how well known a title is, not just how much it is looked at this week. TMDB's popularity follows the clicks
-- of the moment (a new kids' film with 2,000 votes can top it); IMDb votes follow how many people have seen it.
-- The same blend search orders by, kept on the title so any list can sort by it through an index.
alter table public.titles add column fame real not null
  generated always as ((ln(1 + greatest(popularity, 0)) + 0.4 * ln(1 + greatest(coalesce(imdb_votes, 0), 0)))::real) stored;
create index titles_fame on public.titles (fame desc);

-- The Start wall (seen before signing in): well-known, well-liked titles, never kids' titles. Same shape as before:
-- recent ones (last 4 years) and classics (15+ years old), films and series taking turns, 12 of each.
create or replace function public.refresh_start_wall() returns void
language sql security definer set search_path = '' as $$
  delete from public.start_wall_posters;
  insert into public.start_wall_posters (pos, poster_path)
  with y as (select extract(year from now())::int as now),
  picked as (
    select t.poster_path,
      case when t.year >= y.now - 4 then 0 else 2 end + case when t.kind = 'film' then 0 else 1 end as bucket,
      row_number() over (partition by t.kind, t.year >= y.now - 4 order by t.fame desc) as n
    from public.titles t, y
    where t.poster_path is not null and t.year is not null
      and (t.year >= y.now - 4 or t.year <= y.now - 15)
      and t.imdb_votes >= 10000 and t.imdb_rating >= 6.5 and not 'kids' = any(t.tags)
      and exists (select 1 from public.availability a where a.title_id = t.id)
  )
  select row_number() over (order by n, bucket), poster_path from picked where n <= 12;
$$;
revoke execute on function public.refresh_start_wall() from public, anon, authenticated;
select public.refresh_start_wall();
