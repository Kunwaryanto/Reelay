// Temporary: what else could be better (read only).
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const show = async (label, sql) => { try { const r = await db.query(sql); console.log(`\n## ${label} (${r.rows.length})`); for (const x of r.rows) console.log(JSON.stringify(x)); } catch (e) { console.log(`\n## ${label}: failed: ${e.message}`); } };
await show('slow app queries (avg > 100 ms)', `select calls, round(mean_exec_time::numeric) ms, round(total_exec_time::numeric/1000) total_s,
  left(regexp_replace(query, '\\s+', ' ', 'g'), 400) q from extensions.pg_stat_statements
  where mean_exec_time > 100 and query not ilike '%pg_stat%' and query not ilike '%insert into public.%' and query not ilike '%explain%'
  order by total_exec_time desc limit 15`);
await show('most called app queries', `select calls, round(mean_exec_time::numeric, 1) ms, left(regexp_replace(query, '\\s+', ' ', 'g'), 300) q from extensions.pg_stat_statements
  where query ilike '%pgrst%' order by calls desc limit 10`);
await show('foreign keys without an index', `select c.conrelid::regclass t, a.attname col from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])`);
await show('policies calling auth.uid() per row', `select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public'
  and (coalesce(qual,'') ~ 'auth\\.uid\\(\\)' or coalesce(with_check,'') ~ 'auth\\.uid\\(\\)')
  and not (coalesce(qual,'') ~* 'select auth\\.uid' or coalesce(with_check,'') ~* 'select auth\\.uid')`);
await show('tables without row level security', `select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity`);
await show('functions without a fixed search_path', `select p.proname, p.prosecdef secdef from pg_proc p where p.pronamespace = 'public'::regnamespace
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
await show('security definer functions anyone signed out may call', `select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosecdef
  and has_function_privilege('anon', p.oid, 'execute')`);
await show('duplicate indexes', `select indrelid::regclass t, array_agg(indexrelid::regclass) idx from pg_index where indrelid::regclass::text like 'public.%'
  group by indrelid, indkey, indexprs::text, indpred::text having count(*) > 1`);
await show('table scans vs index scans (big tables)', `select relname, seq_scan, seq_tup_read, idx_scan, n_live_tup from pg_stat_user_tables where schemaname = 'public' and n_live_tup > 5000 order by seq_tup_read desc`);
await show('connections and settings', `select (select count(*) from pg_stat_activity) connections, current_setting('max_connections') max, current_setting('shared_buffers') shared_buffers, current_setting('statement_timeout') stmt_timeout`);
await show('cache hit rate', `select round(sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit + heap_blks_read), 0) * 100, 1) table_hit_pct,
  (select round(sum(idx_blks_hit)::numeric / nullif(sum(idx_blks_hit + idx_blks_read), 0) * 100, 1) from pg_statio_user_indexes) index_hit_pct from pg_statio_user_tables`);
await db.end();
