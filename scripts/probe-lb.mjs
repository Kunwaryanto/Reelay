import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
for (const r of (await db.query(`select a.username, count(*) filter (where l.tmdb_id is null)::int unmatched,
  count(distinct t.id)::int watched_in_catalogue from public.letterboxd_accounts a join public.letterboxd_logs l using (user_id)
  left join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film' group by 1 order by 1`)).rows) console.log('MEMBER', JSON.stringify(r));
console.log('CHECK', JSON.stringify((await db.query(`select film_name, tmdb_id from public.letterboxd_logs l join public.letterboxd_accounts a using (user_id)
  where a.username = 'adamkunwaryanto' and (film_name ilike '%40 year%' or film_name ilike '%final reckoning%')`)).rows));
await db.end();
