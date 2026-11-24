// One-off, read only: how fast search_titles is, and where the time goes.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('SIZE', JSON.stringify((await db.query(`select count(*) n, count(*) filter (where exists (select 1 from availability a where a.title_id = t.id)) streaming from titles t`)).rows[0]));
for (const q of ['go', 'jf', 'god', 'jfk', 'the', 'dune', 'godfathr', 'star wars', 'interstellar', 'sagan om ringen', 'gudfadern']) {
  const runs = [];
  for (let i = 0; i < 3; i++) { const t0 = Date.now(); await db.query('select id from public.search_titles($1, 30)', [q]); runs.push(Date.now() - t0) }
  const top = (await db.query('select title, year from public.search_titles($1, 5)', [q])).rows.map((r) => `${r.title} (${r.year})`).join(' | ');
  console.log('TIME', q.padEnd(16), runs.join('/') + 'ms', top);
}
// the plan of the candidate step alone, for a short and a long word
await db.query(`set pg_trgm.word_similarity_threshold = 0.4`);
for (const q of ['go', 'god', 'interstellar']) {
  const p = await db.query(`explain (analyze, buffers, format text) select t.id from titles t where t.search_text like '%' || $1 || '%' union select t.id from titles t where $1 operator(extensions.<%) t.search_text`, [q]);
  console.log('PLAN', q, '\n' + p.rows.map((r) => r['QUERY PLAN']).join('\n'));
}
await db.end();
