-- Scores and details are refreshed by how new a title is: new releases often (their scores move most in the first
-- weeks), older titles rarely. And "added" events only for titles that really arrived on a service.

-- The release day (films) or first air day (series), from TMDB; filled as titles are refreshed.
alter table public.titles add column released_on date;

-- The first full night the sync saw a service: everything on it that night was already there, not new.
alter table public.services add column first_synced_on date;
update public.services s set first_synced_on = (select min(a.since) from public.availability a where a.service_id = s.id);
-- the first services were first seen by a test run on 19 Nov; their first full night was 20 Nov
update public.services set first_synced_on = '2026-11-20' where first_synced_on = '2026-11-19';
-- so the "added" events of a service's first night were its whole catalogue (30,000 on 20 Nov, and 6,900 on
-- 23 Nov for the five services added that day): they made old titles look new in New on streaming
delete from public.availability_events e using public.services s
  where e.event = 'added' and e.service_id = s.id and e.happened_on <= s.first_synced_on;

-- How often each kind of refresh is due, per tier.
create function public.refresh_every(tier text, what text) returns interval
language sql immutable as $$
  select case what
    when 'scores'  then case tier when 'new' then interval '2 days' when 'recent' then interval '7 days'  else interval '90 days' end
    when 'omdb'    then case tier when 'new' then interval '3 days' when 'recent' then interval '14 days' else interval '90 days' end
    when 'details' then case tier when 'new' then interval '7 days' when 'recent' then interval '14 days' else interval '60 days' end
  end
$$;

-- Each title's tier. New: released, a new season, or arrived on a service in the last 30 days. Recent: the same
-- within a year, or on someone's watchlist, trending, or leaving within 30 days. Older: the rest.
-- Before a title's release day is known its year stands in (1 January), so this year's titles count as recent.
create view public.title_refresh with (security_invoker = true) as
select t.id as title_id,
  case
    when x.fresh >= current_date - 30 then 'new'
    when x.fresh >= current_date - 365
      or t.trend_rank is not null
      or exists (select 1 from public.watchlist w where w.title_id = t.id)
      or exists (select 1 from public.availability a where a.title_id = t.id and a.leaves_on between current_date and current_date + 30)
      then 'recent'
    else 'older'
  end as tier
from public.titles t
cross join lateral (
  select greatest(
    coalesce(t.released_on, make_date(t.year, 1, 1)),
    t.last_season_on,
    (select max(e.happened_on) from public.availability_events e where e.title_id = t.id and e.event = 'added')
  ) as fresh
) x;

-- for the sync only
revoke all on public.title_refresh from anon, authenticated;
revoke all on function public.refresh_every(text, text) from public, anon, authenticated;
