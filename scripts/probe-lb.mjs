// One-off, read only: what each Suggestions tag would hide among streaming titles, and where the Kids line falls.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const streaming = `exists (select 1 from public.availability a where a.title_id = t.id)`;
console.log('TAG COUNTS (streaming titles)');
for (const r of (await db.query(`select tag, count(*)::int n from public.titles t, unnest(t.tags) tag where ${streaming} group by tag order by n desc`)).rows) console.log(`  ${r.tag.padEnd(14)} ${r.n}`);
const show = (title, rows) => { console.log(`\n${title}`); for (const r of rows) console.log(`  ${String(r.year ?? '').padEnd(5)} ${r.title.slice(0, 44).padEnd(45)} ${String(r.imdb_rating ?? '-').padEnd(4)} ${String(r.imdb_votes ?? '-').padStart(8)}  ${(r.genres ?? []).join(', ')}`) };
const sel = `select t.title, t.year, t.imdb_rating, t.imdb_votes, t.genres from public.titles t where ${streaming}`;
show('KIDS FILMS HIDDEN (most popular 40)', (await db.query(`${sel} and t.kind = 'film' and 'kids' = any(t.tags) order by t.popularity desc limit 40`)).rows);
show('FAMILY FILMS KEPT (most popular 30)', (await db.query(`${sel} and t.kind = 'film' and 'Family' = any(t.genres) and not 'kids' = any(t.tags) order by t.popularity desc limit 30`)).rows);
show('HIDDEN, NEAR THE LINE (rated 6.5+ or 15,000+ votes)', (await db.query(`${sel} and t.kind = 'film' and 'kids' = any(t.tags) and (t.imdb_rating >= 6.5 or t.imdb_votes >= 15000) order by t.popularity desc limit 30`)).rows);
show('KIDS SERIES (most popular 25)', (await db.query(`${sel} and t.kind = 'series' and 'kids' = any(t.tags) order by t.popularity desc limit 25`)).rows);
show('ANIMATED FAMILY SERIES NOT KIDS (most popular 15)', (await db.query(`${sel} and t.kind = 'series' and 'Family' = any(t.genres) and 'Animation' = any(t.genres) and not 'kids' = any(t.tags) order by t.popularity desc limit 15`)).rows);
show('ANIME (most popular 15)', (await db.query(`${sel} and 'anime' = any(t.tags) order by t.popularity desc limit 15`)).rows);
await db.end();
