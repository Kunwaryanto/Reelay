// One-off, read only: what the two walls hold now.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const t0 = Date.now();
const w = (await db.query(`select w.pos, w.service_id, t.kind, t.year, t.title from public.onboarding_wall(array['netflix','hbo-max','svt-play','viaplay','disney-plus','prime-video','apple-tv','skyshowtime','tv4-play'], 8, 8) w join public.titles t on t.id = w.title_id order by w.pos`)).rows;
console.log(`ONBOARDING (${w.length} in ${Date.now() - t0} ms)`);
for (let r = 0; r < 8; r++) console.log('  ' + w.slice(r * 8, r * 8 + 8).map((x) => `${x.kind === 'film' ? 'F' : 'S'}${x.year} ${x.title.slice(0, 16)}`).join(' | '));
const s = (await db.query(`select p.pos, t.kind, t.year, t.title from public.start_wall_posters p join lateral (select * from public.titles t where t.poster_path = p.poster_path limit 1) t on true order by p.pos`)).rows;
console.log(`\nSTART (${s.length})`);
for (let r = 0; r < 6; r++) console.log('  ' + s.slice(r * 8, r * 8 + 8).map((x) => `${x.kind === 'film' ? 'F' : 'S'}${x.year} ${x.title.slice(0, 16)}`).join(' | '));
for (const r of (await db.query(`select w.part, count(*)::int n from public.titles t left join public.scores sc on sc.title_id = t.id
  cross join lateral (select public.wall_part(t.kind, t.year, t.imdb_votes, sc.letterboxd, t.imdb_rating, sc.rt_critics, 2026) as part) w
  where w.part is not null and t.imdb_votes >= 20000 and exists (select 1 from public.availability a where a.title_id = t.id) group by 1`)).rows) console.log('PART', r.part, r.n);
await db.end();
