// One-off, read only: is 2001: A Space Odyssey in the catalogue, and what does search find for it.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('TITLE', JSON.stringify((await db.query(`select t.id, t.tmdb_id, t.title, t.year, t.keep_reason, t.search_text,
  (select array_agg(service_id) from public.availability a where a.title_id = t.id) services from public.titles t where t.tmdb_id = 62 or t.title ilike '%space odyssey%'`)).rows));
await db.query(`set role authenticated`);
for (const q of ['2001 a space odyssey', '2001 a space oddesey', '2001', 'space odyssey', 'space oddesey', '2001: A Space Odyssey'])
  console.log('SEARCH', JSON.stringify(q), JSON.stringify((await db.query(`select s.id, t.title, t.year from public.search_titles($1, 10) s join public.titles t on t.id = s.id`, [q]).catch((e) => ({ rows: [e.message] }))).rows.slice(0, 5)));
await db.end();
