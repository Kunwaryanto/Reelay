// One-off, read only: a member's Letterboxd data (public on Letterboxd), to see why a watched film isn't hidden.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const accts = (await db.query(`select a.user_id, a.username, a.display_name, a.mark_watched, a.synced_at, a.sync_error,
  count(l.*) filter (where l.entry_id not like 'import-%') feed, count(l.*) filter (where l.entry_id like 'import-%') imported,
  count(l.*) filter (where l.tmdb_id is null) unmatched
  from public.letterboxd_accounts a left join public.letterboxd_logs l using (user_id) group by a.user_id order by a.username`)).rows;
for (const a of accts) console.log('ACCOUNT', a.username, a.display_name, 'mark_watched', a.mark_watched, 'feed', a.feed, 'imported', a.imported, 'unmatched', a.unmatched, 'synced', a.synced_at?.toISOString?.(), a.sync_error ?? '');
const hob = (await db.query(`select a.username, l.entry_id, l.tmdb_id, l.film_name, l.film_year, l.watched_on, l.rating
  from public.letterboxd_logs l join public.letterboxd_accounts a using (user_id) where l.film_name ilike '%hobbit%' or l.tmdb_id in (select tmdb_id from public.titles where title ilike '%hobbit%' and kind = 'film')`)).rows;
console.log('HOBBIT LOGS', JSON.stringify(hob));
console.log('HOBBIT TITLES', JSON.stringify((await db.query(`select id, tmdb_id, title, original_title, year, kind from public.titles where title ilike 'the hobbit%'`)).rows));
await db.end();
