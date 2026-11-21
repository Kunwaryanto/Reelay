// One-off check: what links Streaming Availability gives for titles on each Swedish service, and how many titles
// one catalogue page returns. Runs on push when this file changes ("Probe app links" workflow). ~12 requests.
const key = process.env.STREAMING_AVAILABILITY_KEY;
if (!key) throw new Error('STREAMING_AVAILABILITY_KEY is not set');
const host = 'streaming-availability.p.rapidapi.com';
const get = async (path) => {
  const r = await fetch(`https://${host}${path}`, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host } });
  const text = await r.text();
  for (const h of ['x-ratelimit-requests-limit', 'x-ratelimit-requests-remaining']) if (r.headers.get(h)) console.log(`  ${h}: ${r.headers.get(h)}`);
  if (!r.ok) { console.log(`${path} -> ${r.status} ${text.slice(0, 300)}`); return null; }
  return JSON.parse(text);
};

const se = await get('/countries/se');
const services = (se?.services ?? []).filter((s) => s.streamingOptionTypes?.subscription || s.streamingOptionTypes?.free || s.streamingOptionTypes?.addon)
console.log(`Services in Sweden: ${services.map((s) => `${s.id} (${s.name})`).join(', ')}\n`);

for (const s of services) {
  const r = await get(`/shows/search/filters?${new URLSearchParams({ country: 'se', catalogs: s.id, order_by: 'popularity_1year', output_language: 'en' })}`);
  if (!r) continue;
  console.log(`== ${s.name} (${s.id}): ${r.shows?.length ?? 0} titles on one page, more pages: ${r.hasMore}`);
  for (const show of (r.shows ?? []).slice(0, 4)) {
    const opts = (show.streamingOptions?.se ?? []).filter((o) => o.service?.id === s.id);
    console.log(`  ${show.title} (${show.showType}, tmdb ${show.tmdbId})`);
    for (const o of opts.slice(0, 2)) console.log(`    ${o.type}  link: ${o.link}${o.videoLink ? `\n          videoLink: ${o.videoLink}` : ''}`);
  }
  console.log('');
}
