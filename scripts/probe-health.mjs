// Temporary: is the slow first call in a fresh connection JIT compilation?
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const fresh = async () => { const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } }); await db.connect(); return db; };
const q = `select count(*) from public.titles t where t.kind = 'film' and t.year between 1990 and 1999 and t.runtime_min < 100 and exists (select 1 from public.availability a where a.title_id = t.id)`;
{ const db = await fresh(); console.log('settings:', JSON.stringify((await db.query(`select name, setting from pg_settings where name like 'jit%'`)).rows)); 
  console.log('role settings:', JSON.stringify((await db.query(`select r.rolname, s.setconfig from pg_db_role_setting s join pg_roles r on r.oid = s.setrole`)).rows)); await db.end(); }
for (const jit of ['on', 'off', 'on', 'off']) {
  const db = await fresh();
  await db.query(`set jit = ${jit}`);
  const t = Date.now(); const p = await db.query(`explain (analyze) ${q}`);
  const jitLine = p.rows.map((r) => r['QUERY PLAN']).filter((l) => /JIT|Timing|Functions/.test(l)).join(' ').replace(/\s+/g, ' ');
  console.log(`fresh connection, jit ${jit}: ${Date.now() - t} ms  ${p.rows.at(-1)['QUERY PLAN']}  ${jitLine.slice(0, 200)}`);
  const t2 = Date.now(); await db.query(q); console.log(`   same connection again: ${Date.now() - t2} ms`);
  await db.end();
}
