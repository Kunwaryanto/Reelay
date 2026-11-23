// One-off: how much smaller would the database be with 4-byte ids? Copies each table that holds a title or person
// id into temporary tables (as it is, with title ids as int, with title and person ids as int), builds the same
// indexes and compares sizes. Read only: everything is rolled back.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const kb = (b) => (Number(b) / 1048576).toFixed(2) + ' MB';
// columns holding a title or person id: the ids themselves, foreign keys to them, and the similar-titles arrays
const cols = (await db.query(`
  with fk as (
    select c.conrelid::regclass::text tbl, a.attname col, c.confrelid::regclass::text target
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid in ('public.titles'::regclass, 'public.people'::regclass))
  select tbl, col, target from fk
  union select 'public.titles', 'id', 'public.titles'
  union select 'public.people', 'id', 'public.people'
  union select 'public.title_similar', 'ids', 'public.titles'
  order by 1, 2`)).rows;
const byTable = new Map();
for (const c of cols) { if (!byTable.has(c.tbl)) byTable.set(c.tbl, []); byTable.get(c.tbl).push(c) }
const types = new Map((await db.query(`select (table_schema || '.' || table_name) t, column_name c, data_type d from information_schema.columns where table_schema = 'public'`)).rows.map((r) => [`${r.t}.${r.c}`, r.d]));

await db.query('begin');
const size = async (n) => Number((await db.query(`select pg_total_relation_size('${n}') b`)).rows[0].b);
let sum = [0, 0, 0], k = 0;
console.log('TABLE'.padEnd(34), 'NOW'.padStart(10), 'TITLE IDS INT'.padStart(15), 'BOTH INT'.padStart(10), ' columns');
for (const [tbl, cs] of byTable) {
  const name = tbl.replace(/^public\./, '');
  const out = [];
  for (const scen of [[], ['public.titles'], ['public.titles', 'public.people']]) {
    const t = `p_${k++}`;
    await db.query(`create temp table ${t} (like public.${name} including indexes including defaults)`);
    for (const c of cs) {
      if (!scen.includes(c.target)) continue;
      const d = types.get(`${tbl}.${c.col}`);
      if (d === 'bigint') await db.query(`alter table ${t} alter column ${c.col} type int`);
      else if (d === 'ARRAY') await db.query(`alter table ${t} alter column ${c.col} type int[]`);
    }
    await db.query(`insert into ${t} overriding system value select * from public.${name}`).catch(async () => db.query(`insert into ${t} select * from public.${name}`));
    out.push(await size(t));
  }
  out.forEach((v, i) => { sum[i] += v });
  console.log(name.padEnd(34), kb(out[0]).padStart(10), kb(out[1]).padStart(15), kb(out[2]).padStart(10), ' ', cs.map((c) => `${c.col} (${types.get(`${tbl}.${c.col}`)})`).join(', '));
}
console.log('\nTOTAL'.padEnd(35), kb(sum[0]).padStart(10), kb(sum[1]).padStart(15), kb(sum[2]).padStart(10));
console.log(`saving: title ids as int ${kb(sum[0] - sum[1])}, title and person ids as int ${kb(sum[0] - sum[2])}`);
const total = Number((await db.query('select pg_database_size(current_database()) b')).rows[0].b);
console.log(`database now ${kb(total)} of 500 MB`);
await db.query('rollback');
await db.end();
