// One-off, read only: search speed and results after search v3.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const t0 = Date.now(); await db.query('select 1'); console.log('PING', Date.now() - t0, 'ms');
for (const q of ['go', 'jf', 'god', 'jfk', 'the', 'dune', 'godfathr', 'star wars', 'star w', 'interstellar', 'sagan om ringen', 'gudfadern', 'fanny och alexander', 'fanny and alexander', 'festen', 'fast and furious', 'borgen', 'the bridge', 'bron']) {
  const runs = [];
  for (let i = 0; i < 3; i++) { const t = Date.now(); await db.query('select id from public.search_titles($1, 30)', [q]); runs.push(Date.now() - t) }
  const top = (await db.query('select title, year from public.search_titles($1, 5)', [q])).rows.map((r) => `${r.title} (${r.year})`).join(' | ');
  console.log('TIME', q.padEnd(20), runs.join('/') + 'ms', top);
}
console.log('NORDIC', JSON.stringify((await db.query(`select count(*) filter (where title_en is not null) nordic, count(*) filter (where cardinality(aka) > 0) aka from titles`)).rows[0]));
console.log('SIZE', JSON.stringify((await db.query(`select pg_size_pretty(pg_relation_size('titles_search_trgm')) trgm, pg_size_pretty(pg_relation_size('titles_search_words')) words, pg_size_pretty(pg_total_relation_size('titles')) titles`)).rows[0]));
await db.end();
