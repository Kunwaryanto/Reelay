// Temporary: what scale are the stored Letterboxd averages on?
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
console.log((await db.query(`select count(*) n, min(letterboxd), max(letterboxd), round(avg(letterboxd),2) avg,
  count(*) filter (where letterboxd > 5) over5, percentile_cont(array[0.05,0.5,0.95]) within group (order by letterboxd) pct
  from public.scores where letterboxd is not null`)).rows[0]);
console.log((await db.query(`select t.title, t.year, s.letterboxd from public.scores s join public.titles t on t.id = s.title_id
  where s.letterboxd is not null order by t.popularity desc limit 12`)).rows.map((r) => `${r.title} (${r.year}) ${r.letterboxd}`).join(' · '));
await db.end();
