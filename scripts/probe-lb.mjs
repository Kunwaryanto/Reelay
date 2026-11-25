// One-off, read only: the walls after one film per series.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const t0 = Date.now();
const w = (await db.query(`select w.pos, t.kind, t.year, t.title from public.onboarding_wall(array['netflix','hbo-max','svt-play','viaplay','disney-plus','prime-video','apple-tv','skyshowtime','tv4-play'], 8, 8) w join public.titles t on t.id = w.title_id order by w.pos`)).rows;
console.log(`ONBOARDING (${w.length} in ${Date.now() - t0} ms)`);
for (let r = 0; r < 8; r++) console.log('  ' + w.slice(r * 8, r * 8 + 8).map((x) => `${x.kind === 'film' ? 'F' : 'S'}${x.year} ${x.title.slice(0, 18)}`).join(' | '));
const s = (await db.query(`select t.kind, t.year, t.title from public.start_wall_posters p join lateral (select * from public.titles t where t.poster_path = p.poster_path limit 1) t on true order by p.pos`)).rows;
console.log(`\nSTART (${s.length})`);
for (let r = 0; r < 6; r++) console.log('  ' + s.slice(r * 8, r * 8 + 8).map((x) => `${x.kind === 'film' ? 'F' : 'S'}${x.year} ${x.title.slice(0, 18)}`).join(' | '));
await db.end();
