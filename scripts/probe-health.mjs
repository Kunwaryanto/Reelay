// Temporary: plans of the remaining slow reads.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const rows = (await db.query(`select calls, round(mean_exec_time::numeric) ms, query from extensions.pg_stat_statements
  where query like '%pgrst%' and mean_exec_time > 100 and query not like '%search_titles%' and query not like '%start_wall%'
    and query not like '%row_to_json("titles_scores_1"%' order by mean_exec_time desc limit 8`)).rows;
for (const r of rows) {
  console.log(`\n=== ${r.calls} calls, ${r.ms} ms ===`);
  const q = r.query.replace(/\s+/g, ' ');
  console.log('SELECT:', (q.match(/pgrst_source AS \((.*?)\) SELECT \$\d+::bigint/) ?? [, q.slice(0, 1500)])[1].slice(0, 2500));
  try { const p = await db.query(`explain (generic_plan) ${r.query}`); console.log(p.rows.map((x) => x['QUERY PLAN']).filter((l) => /Scan|Sort|Join|Loop|Filter|Cond|Function/.test(l)).slice(0, 30).join('\n')); }
  catch (e) { console.log('no plan:', e.message); }
}
for (const f of ['home_because', 'home_friends', 'home_taste', 'home_saved', 'home_people']) {
  const d = (await db.query(`select pg_get_function_identity_arguments(p.oid) a from pg_proc p where proname = $1`, [f])).rows[0];
  console.log(`\n${f}(${d?.a})`);
}
await db.end();
