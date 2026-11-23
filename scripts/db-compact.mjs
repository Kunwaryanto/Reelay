// Database maintenance: rewrites the busiest catalogue tables and their indexes without the empty space that
// updates leave behind (VACUUM FULL), then refreshes the planner's statistics. Each table is locked for the few
// seconds its rewrite takes, so run it outside the nightly sync (the workflow waits for it). Run by hand when the
// Database size workflow shows a table with a lot of empty space.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
await db.query(`set statement_timeout = '10min'`);
const mb = (b) => (Number(b) / 1048576).toFixed(1) + ' MB';
const size = async (t) => (await db.query(`select pg_relation_size($1) d, pg_indexes_size($1) i from (select $1::regclass) x`, [t])).rows[0];
const total = async () => Number((await db.query('select pg_database_size(current_database()) b')).rows[0].b);
const before = await total();
for (const t of ['public.titles', 'public.credits', 'public.people', 'public.availability', 'public.scores', 'public.availability_events']) {
  const a = await size(t);
  const s = Date.now();
  await db.query(`vacuum (full, analyze) ${t}`);
  const b = await size(t);
  console.log(`${t.padEnd(20)} data ${mb(a.d)} -> ${mb(b.d)}, indexes ${mb(a.i)} -> ${mb(b.i)}  (${((Date.now() - s) / 1000).toFixed(1)} s)`);
}
const after = await total();
console.log(`\ndatabase ${mb(before)} -> ${mb(after)} (${mb(before - after)} won back)`);
await db.end();
