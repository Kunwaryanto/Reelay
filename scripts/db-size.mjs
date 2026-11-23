// How much room the database takes and how fast it grows (read only). Run by the `Database size` workflow.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const mb = (b) => (Number(b) / 1048576).toFixed(1) + ' MB';

const total = (await db.query('select pg_database_size(current_database()) b')).rows[0].b;
console.log('DATABASE', mb(total), `(free plan: 500 MB, ${(Number(total) / 5242880).toFixed(0)}% used)`);

const tables = (await db.query(`
  select n.nspname s, c.relname t, pg_total_relation_size(c.oid) total, pg_relation_size(c.oid) heap,
         pg_indexes_size(c.oid) idx, greatest(c.reltuples, 0)::bigint est
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 25`)).rows;
console.log('\nBIGGEST TABLES (total = data + indexes)');
for (const r of tables) console.log(`${(r.s + '.' + r.t).padEnd(42)} ${mb(r.total).padStart(9)}  data ${mb(r.heap).padStart(8)}  indexes ${mb(r.idx).padStart(8)}  ~${r.est} rows`);

const bySchema = (await db.query(`select n.nspname s, sum(pg_total_relation_size(c.oid)) b from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r','m','t') group by 1 order by 2 desc limit 8`)).rows;
console.log('\nBY SCHEMA'); for (const r of bySchema) console.log(r.s.padEnd(20), mb(r.b));

// growth: public tables with a time column, rows per day over the last 14 days
const cols = (await db.query(`select table_name t, column_name c from information_schema.columns
  where table_schema = 'public' and data_type in ('timestamp with time zone','timestamp without time zone','date')
  and column_name in ('created_at','added_at','inserted_at','at','happened_at','synced_at','logged_at','seen_at','happened_on','updated_at')`)).rows;
console.log('\nGROWTH (rows added per day, last 14 days, by the first time column found)');
const seen = new Set();
let perDay = 0;
for (const { t, c } of cols) {
  if (seen.has(t)) continue;
  seen.add(t);
  const r = (await db.query(`select count(*) filter (where "${c}" >= now() - interval '14 days') n14, count(*) n,
    pg_total_relation_size('public."${t}"') b from public."${t}"`)).rows[0];
  if (!Number(r.n)) continue;
  const day = Number(r.n14) / 14, bytesDay = day * (Number(r.b) / Number(r.n));
  if (c !== 'updated_at' && c !== 'synced_at') perDay += bytesDay;
  console.log(`${t.padEnd(30)} by ${c.padEnd(12)} ${day.toFixed(0).padStart(7)} rows/day  ~${mb(bytesDay)}/day  (${r.n} rows)`);
}
console.log(`\nESTIMATED GROWTH ~${mb(perDay)}/day from tables with an insert time; left ${mb(524288000 - Number(total))}`);
if (perDay > 0) console.log(`at that rate the 500 MB limit is ~${Math.round((524288000 - Number(total)) / perDay)} days away`);

const daily = (await db.query(`select to_char(d, 'YYYY-MM-DD') d, count(e.*) n from generate_series(now()::date - 13, now()::date, '1 day') d
  left join public.availability_events e on e.happened_on = d::date group by d order by d`).catch(() => ({ rows: [] }))).rows;
if (daily.length) { console.log('\nAVAILABILITY EVENTS PER DAY'); for (const r of daily) console.log(r.d, r.n); }
const first = (await db.query('select min(happened_on) d from public.availability_events').catch(() => ({ rows: [{}] }))).rows[0].d;
if (first) {
  const days = Math.max(1, (Date.now() - new Date(first).getTime()) / 864e5);
  console.log(`\nWHOLE DATABASE since the first sync (${new Date(first).toISOString().slice(0, 10)}, ${days.toFixed(1)} days): ~${mb(Number(total) / days)}/day on average (includes the first big catalogue load)`);
}

// What could be smaller or faster
const idx = (await db.query(`select s.relname t, s.indexrelname i, pg_relation_size(s.indexrelid) b, s.idx_scan scans
  from pg_stat_user_indexes s where s.schemaname = 'public' order by pg_relation_size(s.indexrelid) desc limit 30`)).rows;
console.log('\nINDEXES (public, biggest first; scans since stats were last reset)');
for (const r of idx) console.log(`${r.t.padEnd(24)} ${r.i.padEnd(44)} ${mb(r.b).padStart(9)}  ${String(r.scans).padStart(9)} scans`);
const dead = (await db.query(`select relname t, n_live_tup live, n_dead_tup dead, last_autovacuum, last_autoanalyze from pg_stat_user_tables
  where schemaname = 'public' order by n_dead_tup desc limit 8`)).rows;
console.log('\nDEAD ROWS (left by updates and deletes, until vacuum reuses the space)');
for (const r of dead) console.log(`${r.t.padEnd(24)} live ${String(r.live).padStart(8)}  dead ${String(r.dead).padStart(8)}  vacuumed ${r.last_autovacuum ? new Date(r.last_autovacuum).toISOString().slice(0, 16) : 'never'}`);
const orphans = (await db.query(`select count(*) n from public.people p where not exists (select 1 from public.credits c where c.person_id = p.id)`)).rows[0].n;
console.log('\npeople with no credits:', orphans);
const kept = (await db.query(`select keep_reason, count(*) n, count(*) filter (where not exists (select 1 from public.availability a where a.title_id = t.id)) not_streaming from public.titles t group by 1`)).rows;
console.log('titles by why kept:', JSON.stringify(kept));
const colSizes = (await db.query(`select avg(pg_column_size(overview))::int overview, avg(pg_column_size(search_text))::int search_text, avg(pg_column_size(genres))::int genres,
  avg(pg_column_size(countries))::int countries, avg(pg_column_size(t.*))::int whole_row from public.titles t`)).rows[0];
console.log('titles, average bytes per column:', JSON.stringify(colSizes));
const ccols = (await db.query(`select avg(pg_column_size(c.*))::int row, avg(pg_column_size(c."character"))::int as role_name from public.credits c`)).rows[0];
console.log('credits, average bytes:', JSON.stringify(ccols));
const ext = (await db.query(`select extname from pg_extension order by 1`)).rows.map((r) => r.extname);
console.log('extensions:', ext.join(', '));
if (ext.includes('pg_stat_statements')) {
  const slow = (await db.query(`select calls, round(mean_exec_time::numeric, 1) ms, round(total_exec_time::numeric / 1000, 1) total_s, left(regexp_replace(query, '\\s+', ' ', 'g'), 140) q
    from extensions.pg_stat_statements where query not ilike '%pg_stat%' order by total_exec_time desc limit 12`).catch((e) => ({ rows: [{ q: 'not readable: ' + e.message }] }))).rows;
  console.log('\nSLOWEST QUERIES (by total time)');
  for (const r of slow) console.log(`${String(r.calls ?? '').padStart(7)} calls ${String(r.ms ?? '').padStart(8)} ms avg ${String(r.total_s ?? '').padStart(7)} s total  ${r.q}`);
}
await db.end();
