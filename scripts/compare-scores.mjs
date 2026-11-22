// One-off, read-only: compares the Rotten Tomatoes critics' score we have from MDBList with OMDb's, for three groups
// of titles, and logs what OMDb would add or change. Writes nothing. Run with the "Compare scores" workflow.
import pg from 'pg';

const env = (k) => { const v = process.env[k]; if (!v) throw new Error(`${k} is not set`); return v; };
const pw = encodeURIComponent(env('SUPABASE_DB_PASSWORD'));
const db = new pg.Pool({ connectionString: env('POOLER_URL').replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`), ssl: { rejectUnauthorized: false }, max: 4 });
const key = env('OMDB_API_KEY');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const group = (cond, n) => db.query(
  `select t.title, t.year, t.kind, t.imdb_id, s.rt_critics, s.rt_audience from public.scores s join public.titles t on t.id = s.title_id
   where t.imdb_id is not null and ${cond} order by t.popularity desc nulls last limit ${n}`).then((r) => r.rows);

const omdb = async (imdb) => {
  const r = await fetch(`https://www.omdbapi.com/?i=${imdb}&apikey=${key}`);
  const j = await r.json().catch(() => null);
  if (!j || j.Response === 'False') return { error: j?.Error ?? `HTTP ${r.status}` };
  const rt = (j.Ratings ?? []).find((x) => x.Source === 'Rotten Tomatoes');
  return { rt: rt ? Number(String(rt.Value).replace('%', '')) : null };
};

// recent films (2025 on): where scores still move, so freshness shows
const groups = [
  ['recent films with a critics\' score', "t.kind = 'film' and t.year >= 2025 and rt_critics is not null", 70],
  ['recent films without one', "t.kind = 'film' and t.year >= 2025 and rt_critics is null", 30],
];

let used = 0;
for (const [name, cond, n] of groups) {
  const rows = await group(cond, n);
  let fills = 0, same = 0, near = 0, differ = 0, omdbMissing = 0, errors = 0;
  const examples = [], all = [];
  for (const t of rows) {
    await sleep(150);
    used++;
    const o = await omdb(t.imdb_id);
    if (o.error) {
      errors++;
      if (errors === 1) console.log(`  OMDb error for ${t.imdb_id}: ${o.error}`);
      if (/invalid api key|not activated|limit/i.test(o.error)) { console.log('Stopping: the key is not working.'); process.exit(1); }
      continue;
    }
    const label = `${t.title} (${t.year}, ${t.kind}) ours ${t.rt_critics ?? '–'}% / OMDb ${o.rt ?? '–'}%`;
    if (o.rt == null) { omdbMissing++; continue; }
    if (t.rt_critics == null) { fills++; if (examples.length < 40) examples.push(label); continue; }
    const d = Math.abs(o.rt - t.rt_critics);
    if (d === 0) same++; else if (d <= 3) near++; else { differ++; if (examples.length < 40) examples.push(label); }
    if (d <= 3 && all.length < 25) all.push(label);
  }
  console.log(`\n== ${name}: ${rows.length} titles`);
  console.log(`   OMDb fills a missing critics' score: ${fills}`);
  console.log(`   same score: ${same}, within 3 points: ${near}, differs by more: ${differ}`);
  console.log(`   OMDb has no Rotten Tomatoes score either: ${omdbMissing}${errors ? `, errors: ${errors}` : ''}`);
  if (examples.length) console.log('   filled or different:\n     ' + examples.join('\n     '));
  if (all.length) console.log('   same or close:\n     ' + all.join('\n     '));
}
console.log(`\nOMDb lookups used: ${used} of 1,000 today`);
await db.end();
