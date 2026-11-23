// Temporary: the slowest app queries in full, with their plans.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('version', (await db.query('show server_version')).rows[0].server_version);
const slow = (await db.query(`select queryid, calls, round(mean_exec_time::numeric) ms, query from extensions.pg_stat_statements
  where query like '%pgrst%' and mean_exec_time > 200 order by total_exec_time desc limit 8`)).rows;
for (const r of slow) {
  console.log(`\n=== ${r.calls} calls, ${r.ms} ms avg ===`);
  console.log(r.query.replace(/\s+/g, ' ').slice(0, 3000));
  try {
    const p = await db.query(`explain (generic_plan) ${r.query}`);
    console.log('PLAN:\n' + p.rows.map((x) => x['QUERY PLAN']).slice(0, 45).join('\n'));
  } catch (e) { console.log('no plan:', e.message); }
}
// the search, measured
await db.query(`select set_config('role', 'authenticated', true)`).catch(() => {});
for (const q of ['dune', 'the office', 'mi']) {
  const p = await db.query(`explain (analyze, buffers) select * from public.search_titles($1, 30)`, [q]);
  console.log(`\nsearch_titles('${q}'):`, p.rows.slice(-2).map((x) => x['QUERY PLAN']).join(' | '));
}
const p = await db.query(`explain analyze select * from public.start_wall()`);
console.log('start_wall:', p.rows.slice(-2).map((x) => x['QUERY PLAN']).join(' | '));
await db.end();
