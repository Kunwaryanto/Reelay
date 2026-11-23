// Temporary: the slow reads, timed after the faster-queries migration.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const time = async (label, sql, args = []) => {
  for (let i = 0; i < 2; i++) {
    const p = await db.query(`explain (analyze) ${sql}`, args);
    if (i === 1) console.log(label.padEnd(44), p.rows.at(-1)['QUERY PLAN'], p.rows.some((r) => /Index/.test(r['QUERY PLAN'])) ? '(index)' : '(no index)');
  }
};
for (const q of ['dune', 'the office', 'mi', 'severance', 'ofice']) await time(`search '${q}'`, 'select * from public.search_titles($1, 30)', [q]);
console.log('search "the ofice":', (await db.query('select title, round(score::numeric, 2) s from public.search_titles($1, 5)', ['the ofice'])).rows.map((r) => `${r.title} ${r.s}`).join(' | '));
const list = (where) => `select t.id, (select json_agg(a) from (select service_id, leaves_on from public.availability a where a.title_id = t.id) a) av
  from public.titles t where ${where} and exists (select 1 from public.availability a where a.title_id = t.id)
  order by t.imdb_rating desc nulls last, t.popularity desc limit 16`;
await time('top films (rated, 3000+ votes)', list(`t.kind = 'film' and t.imdb_votes >= 3000`));
await time('top series, classic (year < 2006)', list(`t.kind = 'series' and t.imdb_votes >= 3000 and t.year < 2006`));
await time('rated drama films (20000+ votes)', list(`t.kind = 'film' and t.imdb_votes >= 20000 and t.genres && '{Drama}'`));
await time('rated, a country (Sweden)', list(`t.kind = 'film' and t.imdb_votes >= 3000 and t.countries @> '{SE}'`));
await time('filter count: genre and years', `select count(*) from public.titles t where t.kind = 'film' and t.year between 1990 and 1999 and t.genres && '{Comedy}' and exists (select 1 from public.availability a where a.title_id = t.id)`);
await time('start wall', 'select * from public.start_wall()');
console.log('start wall posters:', (await db.query('select count(*) n from public.start_wall_posters')).rows[0].n);
console.log('titles with a rating copied:', (await db.query('select count(*) n from public.titles where imdb_rating is not null')).rows[0].n);
await db.end();
