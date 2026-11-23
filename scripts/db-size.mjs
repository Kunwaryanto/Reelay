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
await db.end();
