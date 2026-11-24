// One-off, read only: a few real titles for a design mockup.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const r = (await db.query(`
  (select id, kind, title, year, runtime_min, seasons, poster_path from public.titles t where kind = 'film' and poster_path is not null and runtime_min is not null
     and exists (select 1 from public.availability a where a.title_id = t.id) order by popularity desc limit 14)
  union all
  (select id, kind, title, year, runtime_min, seasons, poster_path from public.titles t where kind = 'series' and poster_path is not null and seasons is not null
     and exists (select 1 from public.availability a where a.title_id = t.id) order by popularity desc limit 14)
  union all
  (select id, kind, title, year, runtime_min, seasons, poster_path from public.titles t where kind = 'film' and poster_path is not null and runtime_min > 160
     and exists (select 1 from public.availability a where a.title_id = t.id) order by popularity desc limit 3)`)).rows;
console.log('CARDS ' + JSON.stringify(r));
await db.end();
