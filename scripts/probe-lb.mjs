// One-off, read only: anime on the walls.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const t0 = Date.now();
const w = (await db.query(`select t.title, 'anime' = any(t.tags) as anime from public.onboarding_wall(array['netflix','hbo-max','svt-play','viaplay','disney-plus','prime-video','apple-tv','skyshowtime','tv4-play'], 8, 8) w join public.titles t on t.id = w.title_id`)).rows;
console.log(`ONBOARDING ${w.length} in ${Date.now() - t0} ms; anime: ${w.filter((x) => x.anime).map((x) => x.title).join(', ')}`);
const s = (await db.query(`select t.title from public.start_wall_posters p join lateral (select * from public.titles t where t.poster_path = p.poster_path limit 1) t on true where 'anime' = any(t.tags)`)).rows;
console.log(`START anime: ${s.map((x) => x.title).join(', ')}`);
await db.end();
