// Temporary: time Home's functions as the member, and the filter counts.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const uid = (await db.query('select user_id from public.letterboxd_accounts limit 1')).rows[0]?.user_id ?? (await db.query('select user_id from public.profiles limit 1')).rows[0].user_id;
const svc = (await db.query('select array_agg(service_id) s from public.user_services where user_id = $1', [uid])).rows[0].s;
await db.query('begin');
await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
const time = async (label, sql, args = []) => {
  const p = await db.query(`explain (analyze, buffers) ${sql}`, args);
  console.log(label.padEnd(36), p.rows.at(-1)['QUERY PLAN']);
};
for (let i = 0; i < 2; i++) {
  console.log(`-- round ${i + 1}`);
  await time('home_because', 'select * from public.home_because(20000, $1, true)', [svc]);
  await time('home_people', 'select * from public.home_people(20000, $1, true)', [svc]);
  await time('home_saved', 'select * from public.home_saved(20000, $1, true)', [svc]);
  await time('home_friends', 'select * from public.home_friends($1, true)', [svc]);
  await time('home_taste', 'select * from public.home_taste()');
  await time('filter count: years and length', `select count(*) from public.titles t where t.kind = 'film' and t.year between 1990 and 1999 and t.runtime_min < 100 and exists (select 1 from public.availability a where a.title_id = t.id)`);
  await time('filter count: language', `select count(*) from public.titles t where t.kind = 'film' and t.original_language = 'sv' and exists (select 1 from public.availability a where a.title_id = t.id)`);
  await time('leaving, a country', `select t.id from public.titles t where t.countries @> '{SE}' and exists (select 1 from public.availability a where a.title_id = t.id and a.leaves_on between current_date and current_date + 30) order by t.popularity desc limit 16`);
}
const lines = (await db.query(`explain (analyze) select * from public.home_people(20000, $1, true)`, [svc])).rows.map((r) => r['QUERY PLAN']);
console.log('\nhome_people plan:\n' + lines.filter((l) => /actual/.test(l)).slice(0, 40).join('\n'));
await db.query('rollback');
await db.end();
