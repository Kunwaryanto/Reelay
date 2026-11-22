// Temporary: why did a Letterboxd import fail?
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log('logs:', JSON.stringify((await db.query(`select count(*) filter (where entry_id like 'import-%') imported, count(*) filter (where entry_id not like 'import-%') feed,
  count(*) filter (where tmdb_id is null) unmatched from public.letterboxd_logs`)).rows[0]));
console.log('accounts:', JSON.stringify((await db.query(`select username, synced_at, sync_error, imported_at, imported_films from public.letterboxd_accounts`)).rows));
console.log('timeouts:', JSON.stringify((await db.query(`select rolname, rolconfig from pg_roles where rolname in ('authenticator','service_role','authenticated','anon')`)).rows));
let t = Date.now();
try { const r = await db.query('select public.letterboxd_resolve(null) n'); console.log('resolve ok, matched', r.rows[0].n, 'in', Date.now() - t, 'ms'); } catch (e) { console.log('resolve failed after', Date.now() - t, 'ms:', e.message); }
await db.end();
// the functions' own logs for the last hour
const ref = process.env.PROJECT_REF;
const sql = `select timestamp, event_message, metadata from function_logs order by timestamp desc limit 40`;
for (const q of [sql, `select timestamp, event_message from function_edge_logs order by timestamp desc limit 25`]) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all?sql=${encodeURIComponent(q)}&iso_timestamp_start=${new Date(Date.now() - 3600e3).toISOString()}`, { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } });
  const body = await res.json().catch(() => ({}));
  console.log('function logs', res.status, body.error ? JSON.stringify(body.error).slice(0, 300) : '');
  for (const r of body.result ?? []) console.log('  ', new Date(r.timestamp / 1000).toISOString().slice(11, 19), String(r.event_message).replace(/\s+/g, ' ').slice(0, 260), r.metadata ? JSON.stringify(r.metadata).replace(/"(execution_id|deployment_id|project_ref|region|served_by)":"[^"]*",?/g, '').slice(0, 160) : '');
}
