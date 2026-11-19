// One-off check: does Streaming Availability cover the Swedish services we show,
// and does it return leaving dates for them? Run from the "Probe leaving dates" workflow.
// Uses 3 requests of the free plan's 100 per day.
const key = process.env.STREAMING_AVAILABILITY_KEY;
if (!key) throw new Error('STREAMING_AVAILABILITY_KEY is not set');
const host = 'streaming-availability.p.rapidapi.com';
const get = async (path) => {
  const r = await fetch(`https://${host}${path}`, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host } });
  const text = await r.text();
  if (!r.ok) { console.log(`${path} -> ${r.status} ${text.slice(0, 300)}`); return null; }
  return JSON.parse(text);
};
const WANT = ['netflix', 'hbo', 'max', 'viaplay', 'svt', 'disney', 'prime', 'apple', 'skyshowtime', 'tv4'];

const se = await get('/countries/se');
if (se) {
  console.log('\nServices in Sweden:');
  for (const s of se.services ?? []) {
    const types = Object.entries(s.streamingOptionTypes ?? {}).filter(([, v]) => v).map(([k]) => k).join(', ');
    console.log(`- ${s.name} (${s.id}): ${types}`);
  }
  const ids = (se.services ?? []).map((s) => `${s.id} ${s.name}`.toLowerCase());
  console.log('\nOur services covered?');
  for (const w of WANT) console.log(`- ${w}: ${ids.some((i) => i.includes(w)) ? 'yes' : 'NO'}`);
}

for (const type of ['movie', 'show']) {
  const ch = await get(`/changes?country=se&change_type=expiring&item_type=${type}&output_language=en`);
  if (!ch) continue;
  const list = ch.changes ?? [];
  const per = {};
  for (const c of list) { const k = c.service?.id ?? '?'; per[k] = (per[k] ?? 0) + 1; }
  console.log(`\nExpiring ${type}s (first page): ${list.length}, by service: ${JSON.stringify(per)}`);
  for (const c of list.slice(0, 8)) {
    const show = ch.shows?.[c.showId];
    const when = c.timestamp ? new Date(c.timestamp * 1000).toISOString().slice(0, 10) : '?';
    console.log(`  ${when}  ${c.service?.id}  ${show?.title ?? c.showId}`);
  }
}
