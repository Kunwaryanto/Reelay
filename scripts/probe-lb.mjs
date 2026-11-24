// One-off, read only: the JFK titles in the catalogue and the cached TMDB search for "jfk".
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const t = await db.query(`select id, tmdb_id, kind, title, year, keep_reason from titles where title ilike '%jfk%' order by year`);
for (const r of t.rows) console.log('TITLE', JSON.stringify(r));
const c = await db.query(`select query, fetched_at, jsonb_array_length(results) n, results from tmdb_search_cache where query like 'multi:jfk%'`);
for (const r of c.rows) console.log('CACHE', r.query, r.fetched_at, r.n, JSON.stringify(r.results.map((x) => [x.kind, x.tmdb_id, x.title, x.year])));
await db.end();
