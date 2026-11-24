// One-off, read only: why two of a member's watched films aren't hidden.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const q = async (label, sql, args = []) => console.log(label, JSON.stringify((await db.query(sql, args)).rows));
await q('LOGS', `select l.entry_id, l.tmdb_id, l.film_name, l.film_year, l.watched_on from public.letterboxd_logs l join public.letterboxd_accounts a using (user_id)
  where a.username = 'adamkunwaryanto' and (l.film_name ilike '%virgin%' or l.film_name ilike '%reckoning%' or l.tmdb_id in (6957, 575265))`);
await q('TITLES', `select id, tmdb_id, title, original_title, year, kind from public.titles where title ilike '%year%old virgin%' or title ilike '%final reckoning%'`);
await q('UNMATCHED', `select count(*)::int n, count(*) filter (where film_year is null)::int no_year from public.letterboxd_logs l join public.letterboxd_accounts a using (user_id)
  where a.username = 'adamkunwaryanto' and l.tmdb_id is null`);
await q('UNMATCHED SAMPLE', `select film_name, film_year from public.letterboxd_logs l join public.letterboxd_accounts a using (user_id)
  where a.username = 'adamkunwaryanto' and l.tmdb_id is null order by film_name limit 40`);
await q('ALMOST', `select l.film_name, l.film_year, t.title, t.year, t.tmdb_id from public.letterboxd_logs l join public.letterboxd_accounts a using (user_id)
  join public.titles t on t.kind = 'film' and t.year between l.film_year - 1 and l.film_year + 1
   and regexp_replace(lower(t.title), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(l.film_name), '[^a-z0-9]+', '', 'g')
  where a.username = 'adamkunwaryanto' and l.tmdb_id is null limit 40`);
await db.end();
