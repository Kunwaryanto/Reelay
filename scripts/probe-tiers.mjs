// Temporary: how many titles would fall in each refresh tier, and what the added events look like.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (label, sql) => { const r = await db.query(sql); console.log(label, JSON.stringify(r.rows)); };
await q('by year:', `select case when year >= 2026 then '2026' when year = 2025 then '2025' when year >= 2020 then '2020-24' else 'older' end y, kind, count(*) n from public.titles group by 1,2 order by 1,2`);
await q('with imdb id:', `select count(*) n from public.titles where imdb_id is not null`);
await q('series with a season in the last 30/365 days:', `select count(*) filter (where last_season_on >= current_date - 30) d30, count(*) filter (where last_season_on >= current_date - 365) d365 from public.titles where kind = 'series'`);
await q('watchlisted / trending / leaving within 30 days:', `select (select count(distinct title_id) from public.watchlist) w, (select count(*) from public.titles where trend_rank is not null) t,
  (select count(distinct title_id) from public.availability where leaves_on between current_date and current_date + 30) l`);
await q('added events by day and service:', `select happened_on, service_id, count(*) n from public.availability_events where event = 'added' group by 1,2 having count(*) > 50 order by 1,2`);
await q('events by day and kind:', `select happened_on, event, count(*) n from public.availability_events group by 1,2 order by 1,2`);
await q('services first seen:', `select service_id, min(since) first, count(*) n from public.availability group by 1 order by 2`);
await q('mdblist done:', `select count(*) filter (where mdblist_synced_at is not null) done, count(*) filter (where mdblist_synced_at > now() - interval '1 day') today from public.scores`);
await q('tiers:', `select tier, count(*) n, count(*) filter (where t.imdb_id is not null) with_imdb from public.title_refresh r join public.titles t on t.id = r.title_id group by 1 order by 1`);
await q('scores due per night (MDBList):', `select round(sum(extract(epoch from interval '1 day') / extract(epoch from public.refresh_every(tier, 'scores')))) n from public.title_refresh r join public.titles t on t.id = r.title_id where t.imdb_id is not null`);
await q('details due per night:', `select round(sum(extract(epoch from interval '1 day') / extract(epoch from public.refresh_every(tier, 'details')))) n from public.title_refresh`);
await q('added events left:', `select happened_on, count(*) n from public.availability_events where event = 'added' group by 1 order by 1`);
await db.end();
