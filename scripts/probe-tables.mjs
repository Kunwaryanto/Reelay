// One-off, read only: what fills titles, credits and people. Column widths, indexes and how they are used.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const mb = (b) => (Number(b) / 1048576).toFixed(2) + ' MB';
for (const t of ['titles', 'credits', 'people']) {
  await db.query(`analyze public.${t}`);
  const s = (await db.query(`select pg_relation_size('public.${t}') heap, pg_total_relation_size('public.${t}') total,
    pg_indexes_size('public.${t}') idx, coalesce(pg_relation_size(reltoastrelid), 0) toast from pg_class where oid = 'public.${t}'::regclass`)).rows[0];
  const n = (await db.query(`select count(*)::int n from public.${t}`)).rows[0].n;
  console.log(`\n=== ${t}: ${n} rows, total ${mb(s.total)} (data ${mb(s.heap)}, toast ${mb(s.toast)}, indexes ${mb(s.idx)}), ${(Number(s.heap) / Math.max(1, n)).toFixed(0)} bytes/row on disk`);
  const cols = (await db.query(`select a.attname c, format_type(a.atttypid, a.atttypmod) ty, s.avg_width w, s.null_frac nf, s.n_distinct nd
    from pg_attribute a left join pg_stats s on s.schemaname = 'public' and s.tablename = '${t}' and s.attname = a.attname
    where a.attrelid = 'public.${t}'::regclass and a.attnum > 0 and not a.attisdropped order by a.attnum`)).rows;
  for (const c of cols) {
    const sum = (await db.query(`select coalesce(sum(pg_column_size(${c.c})), 0) b from public.${t}`)).rows[0].b;
    console.log(`  ${c.c.padEnd(18)} ${c.ty.padEnd(26)} avg ${String(c.w ?? '?').padStart(5)} B  total ${mb(sum).padStart(9)}  nulls ${((c.nf ?? 0) * 100).toFixed(0).padStart(3)}%  distinct ${c.nd}`);
  }
  const idx = (await db.query(`select i.indexrelid::regclass::text name, pg_relation_size(i.indexrelid) b, coalesce(st.idx_scan, 0) scans, pg_get_indexdef(i.indexrelid) def
    from pg_index i left join pg_stat_user_indexes st on st.indexrelid = i.indexrelid where i.indrelid = 'public.${t}'::regclass order by 2 desc`)).rows;
  for (const i of idx) console.log(`  index ${i.name.padEnd(34)} ${mb(i.b).padStart(9)}  ${String(i.scans).padStart(8)} scans  ${i.def.replace(/^CREATE (UNIQUE )?INDEX \S+ ON public\.\S+ USING /, '')}`);
}
// credits: how many per title, by role, and character text
console.log('\ncredits by role:', (await db.query(`select role, count(*)::int n, round(avg(sort_order)) avg_order, max(sort_order) max_order from public.credits group by 1 order by 2 desc`)).rows);
console.log('cast per title (percentiles):', (await db.query(`select percentile_cont(array[0.5,0.9,0.99]) within group (order by n) p, max(n) from (select title_id, count(*) n from public.credits where role = 'cast' group by 1) x`)).rows[0]);
console.log('cast rows with sort_order >= 15 / 20 / 30:', (await db.query(`select count(*) filter (where sort_order >= 15)::int a, count(*) filter (where sort_order >= 20)::int b, count(*) filter (where sort_order >= 30)::int c from public.credits where role = 'cast'`)).rows[0]);
console.log('people in only one title:', (await db.query(`select count(*)::int n from (select person_id from public.credits group by 1 having count(*) = 1) x`)).rows[0].n);
console.log('people without picture:', (await db.query(`select count(*) filter (where profile_path is null)::int n from public.people`)).rows[0].n);
console.log('titles: overview total', (await db.query(`select pg_size_pretty(sum(pg_column_size(overview))) s from public.titles`)).rows[0].s,
  '| titles with nothing streaming', (await db.query(`select count(*)::int n from public.titles t where not exists (select 1 from public.availability a where a.title_id = t.id)`)).rows[0].n);
await db.end();
