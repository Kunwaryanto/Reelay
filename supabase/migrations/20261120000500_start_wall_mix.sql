-- The Start wall was almost only series: popularity favours long-running shows.
-- Now it takes 12 from each of four groups (recent films, recent series, classic films, classic series)
-- and mixes them, so neighbouring posters differ. Recent = the last five years, classic = 15 years and older.
create or replace function public.start_wall() returns setof text
language sql stable security definer set search_path = '' as $$
  with y as (select extract(year from now())::int as now),
  picked as (
    select t.poster_path,
      case when t.year >= y.now - 4 then 0 else 2 end + case when t.kind = 'film' then 0 else 1 end as bucket,
      row_number() over (
        partition by t.kind, t.year >= y.now - 4
        order by t.popularity desc
      ) as n
    from public.titles t, y
    where t.poster_path is not null
      and t.year is not null
      and (t.year >= y.now - 4 or t.year <= y.now - 15)
      and exists (select 1 from public.availability a where a.title_id = t.id)
  )
  select poster_path from picked
  where n <= 12
  order by n, bucket
$$;
