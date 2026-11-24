// One-off, read only: how many well-known films and series TMDB has, and how many of them we don't have yet.
import pg from 'pg';
const pw = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD);
const cs = process.env.POOLER_URL.replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
const db = new pg.Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await db.connect();
const H = { authorization: `Bearer ${process.env.TMDB_READ_TOKEN}`, accept: 'application/json' };
const tmdb = async (path, params) => (await fetch(`https://api.themoviedb.org/3${path}?${new URLSearchParams(params)}`, { headers: H })).json();
const have = new Set((await db.query(`select kind || ':' || tmdb_id k from public.titles`)).rows.map((r) => r.k));
for (const [kind, path] of [['film', '/discover/movie'], ['series', '/discover/tv']]) {
  for (const votes of [500, 1000, 2000, 5000]) {
    const first = await tmdb(path, { 'vote_count.gte': String(votes), sort_by: 'vote_count.desc', page: '1' });
    const total = first.total_results;
    // sample up to 20 pages (400 titles) evenly to estimate how many we lack
    const pages = Math.min(first.total_pages, 500); let seen = 0, missing = 0;
    for (let p = 1; p <= pages; p += Math.max(1, Math.floor(pages / 20))) {
      const r = p === 1 ? first : await tmdb(path, { 'vote_count.gte': String(votes), sort_by: 'vote_count.desc', page: String(p) });
      for (const t of r.results ?? []) { seen++; if (!have.has(`${kind}:${t.id}`)) missing++ }
    }
    console.log('NOTABLE', kind, `>=${votes} votes`, 'total', total, 'missing share', (missing / Math.max(1, seen)).toFixed(2), 'est missing', Math.round(total * missing / Math.max(1, seen)));
  }
}
for (const [kind, id, name] of [['film', 62, '2001: A Space Odyssey'], ['film', 829, 'Chinatown']]) {
  const r = await tmdb(`/movie/${id}`, { append_to_response: 'watch/providers' });
  const se = r['watch/providers']?.results?.SE ?? {};
  console.log('EXAMPLE', name, 'votes', r.vote_count, 'SE flatrate', (se.flatrate ?? []).map((x) => x.provider_name).join(', ') || '-', '| rent', (se.rent ?? []).map((x) => x.provider_name).join(', ') || '-', '| buy', (se.buy ?? []).map((x) => x.provider_name).join(', ') || '-');
}
const sz = (await db.query(`select pg_total_relation_size('public.titles') t, pg_total_relation_size('public.credits') c, pg_total_relation_size('public.people') p, (select count(*) from public.titles) n`)).rows[0];
console.log('SIZE per title now', ((Number(sz.t) + Number(sz.c) + Number(sz.p)) / Number(sz.n) / 1024).toFixed(1), 'KB (titles + cast + people)');
await db.end();
