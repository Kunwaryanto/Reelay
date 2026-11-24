// One-off, read only: try the Wikidata award queries (no database writes).
const UA = 'Reelay/1.0 (https://usereelay.vercel.app; personal non-commercial project)';
async function sparql(q) {
  const r = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { 'user-agent': UA, accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ query: q }) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  return (await r.json()).results.bindings;
}
const CEREMONIES = { Oscars: 'Q19020', Emmys: 'Q1044427', 'Golden Globes': 'Q1011547' };
for (const [name, q] of Object.entries(CEREMONIES)) {
  for (const how of ['wdt:P31', 'wdt:P279', 'wdt:P31/wdt:P279*']) {
    const t = Date.now();
    try {
      const rows = await sparql(`SELECT (COUNT(DISTINCT ?award) AS ?n) WHERE { ?award ${how} wd:${q} . }`);
      console.log(name, how, 'categories:', rows[0].n.value, `${Date.now() - t} ms`);
    } catch (e) { console.log(name, how, 'failed', e.message) }
  }
}
// wins and nominations for one ceremony, both directly on the work and on a person "for work"
for (const [name, q] of Object.entries(CEREMONIES)) {
  const t = Date.now();
  try {
    const rows = await sparql(`SELECT ?work ?forWork ?award ?awardLabel ?time ?kind WHERE {
      ?award wdt:P31 wd:${q} .
      { ?work p:P166 ?st . ?st ps:P166 ?award . BIND("won" AS ?kind) } UNION { ?work p:P1411 ?st . ?st ps:P1411 ?award . BIND("nom" AS ?kind) }
      OPTIONAL { ?st pq:P585 ?time }
      OPTIONAL { ?st pq:P1686 ?forWork }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`);
    const won = rows.filter((r) => r.kind.value === 'won').length;
    console.log(`${name}: ${rows.length} statements (${won} won), ${rows.filter((r) => r.forWork).length} on people for a work, ${rows.filter((r) => !r.time).length} without year, ${Date.now() - t} ms`);
    console.log('  sample', rows.slice(0, 4).map((r) => `${r.awardLabel?.value} | ${r.work.value.split('/').pop()} | ${r.forWork?.value.split('/').pop() ?? '-'} | ${r.time?.value?.slice(0, 4)} | ${r.kind.value}`).join('\n  '));
    console.log('  labels', [...new Set(rows.map((r) => r.awardLabel?.value))].slice(0, 40).join(' / '));
  } catch (e) { console.log(name, 'statements failed', e.message) }
}
