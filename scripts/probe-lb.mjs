// One-off, read only: what search returns first for a few short words.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
for (const q of ['go', 'god', 'the', 'dun', 'her', 'star w', 'spiderman', 'interstel', 'bre', 'succ']) {
  const t0 = Date.now();
  const r = await db.query('select title, year, streaming from public.search_titles($1, 8)', [q]);
  console.log('SEARCH', q.padEnd(10), `${Date.now() - t0}ms`, r.rows.map((x) => `${x.title} (${x.year})${x.streaming ? '' : '*'}`).join(' | '));
}
await db.end();
