// One-off check of the requests the nightly link fill makes ("Probe app links" workflow, runs when this file changes).
// 3 requests.
const key = process.env.STREAMING_AVAILABILITY_KEY;
if (!key) throw new Error('STREAMING_AVAILABILITY_KEY is not set');
const host = 'streaming-availability.p.rapidapi.com';
const get = async (path) => {
  const r = await fetch(`https://${host}${path}`, { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host } });
  const text = await r.text();
  console.log(`${r.status} ${path}`);
  if (!r.ok) { console.log(`  ${text.slice(0, 300)}`); return null; }
  return JSON.parse(text);
};
const since = Math.floor(Date.now() / 1000) - 86400;
const ch = await get(`/changes?country=se&change_type=new&item_type=show&from=${since}&output_language=en`);
if (ch) console.log(`  new in the last day: ${ch.changes?.length} changes, ${Object.keys(ch.shows ?? {}).length} shows, more: ${ch.hasMore}; first: ${ch.changes?.slice(0, 3).map((c) => `${c.service?.id} ${ch.shows?.[c.showId]?.title} ${new Date(c.timestamp * 1000).toISOString().slice(0, 16)}`).join(' | ')}`);
for (const cat of ['prime.subscription', 'apple.subscription']) {
  const r = await get(`/shows/search/filters?country=se&catalogs=${cat}&order_by=popularity_alltime&output_language=en`);
  if (r) console.log(`  ${r.shows?.length} shows, more: ${r.hasMore}, cursor: ${r.nextCursor}; types: ${[...new Set(r.shows?.flatMap((s) => (s.streamingOptions?.se ?? []).filter((o) => o.service?.id === cat.split('.')[0]).map((o) => o.type)))].join(',')}; first: ${r.shows?.slice(0, 3).map((s) => s.title).join(' | ')}`);
}
