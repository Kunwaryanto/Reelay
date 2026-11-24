// One-off, read only: how many catalogue films each connected member has logged (the watched list's length).
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const r = (await db.query(`select a.username, count(distinct t.id)::int films_in_catalogue, count(l.*)::int rows
  from public.letterboxd_accounts a left join public.letterboxd_logs l using (user_id)
  left join public.titles t on t.tmdb_id = l.tmdb_id and t.kind = 'film' group by a.username order by 1`)).rows;
for (const x of r) console.log('MEMBER', x.username, 'watched films in catalogue', x.films_in_catalogue, 'log rows', x.rows);
await db.end();
