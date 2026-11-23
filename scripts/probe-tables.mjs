// One-off, read only: live data vs space on disk (left-over space from updates) for the three biggest tables.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const mb = (b) => (Number(b) / 1048576).toFixed(2) + ' MB';
for (const t of ['titles', 'credits', 'people', 'availability', 'scores']) {
  const r = (await db.query(`select (select sum(pg_column_size(x.*)) + count(*) * 4 from public.${t} x) live, pg_relation_size('public.${t}') heap,
    s.n_live_tup, s.n_dead_tup, s.n_tup_upd, s.n_tup_hot_upd, s.last_autovacuum, s.autovacuum_count
    from pg_stat_user_tables s where s.relid = 'public.${t}'::regclass`)).rows[0];
  console.log(`${t.padEnd(13)} on disk ${mb(r.heap).padStart(9)}  live rows ${mb(r.live).padStart(9)}  (${(100 - 100 * Number(r.live) / Number(r.heap)).toFixed(0)}% empty)  dead rows ${r.n_dead_tup}  updates ${r.n_tup_upd} (in place ${r.n_tup_hot_upd})  autovacuums ${r.autovacuum_count}, last ${r.last_autovacuum?.toISOString?.() ?? r.last_autovacuum}`);
}
for (const i of ['titles_pkey', 'titles_tmdb_id_kind_key', 'people_pkey', 'people_tmdb_id_key', 'credits_pkey', 'credits_person', 'titles_search_trgm', 'people_search_trgm']) {
  const r = (await db.query(`select pg_relation_size('public.${i}') b, (select reltuples from pg_class where oid = 'public.${i}'::regclass) n`)).rows[0];
  console.log(`index ${i.padEnd(26)} ${mb(r.b).padStart(9)}  ${(Number(r.b) / Math.max(1, r.n)).toFixed(0)} bytes per entry`);
}
console.log('people search used by:', (await db.query(`select count(*)::int n from pg_proc where prosrc ilike '%people%search_text%' or prosrc ilike '%search_text%people%'`)).rows[0].n, 'functions');
await db.end();
