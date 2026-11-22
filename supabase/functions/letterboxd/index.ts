// Connects the signed-in person's Letterboxd: checks that the member exists, reads their public diary feed and
// saves the films in it. Called again with no username it reads the feed afresh.
//
// POST { username? } with the person's own session in Authorization →
//   { status: 'connected', films }   read and saved
//   { status: 'pending' }            saved, but Letterboxd couldn't be read just now: the nightly sync will
//   { error: 'not_found' }           no such member
//   { error: 'invalid' }             not a Letterboxd username

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://usereelay.vercel.app';
const UA = 'Mozilla/5.0 (compatible; Reelay/1.0; +https://usereelay.vercel.app)';
const cors = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  Vary: 'Origin',
};

function reply(body: Record<string, unknown>, status = 200, origin = '') {
  // the live site, Vercel's preview links for this project, and local development
  const allow = origin.startsWith('http://localhost:') || /^https:\/\/reelay-[a-z0-9-]+\.vercel\.app$/.test(origin) ? origin : SITE;
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...cors, 'Access-Control-Allow-Origin': allow, 'Content-Type': 'application/json' },
  });
}

const text = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();

type Log = { entry_id: string; tmdb_id: number; film_name: string | null; film_year: number | null; watched_on: string | null; rating: number | null; rewatch: boolean };

/** The diary entries in a member's feed (films only: lists and anything without a TMDB film id are skipped). */
export function parseFeed(xml: string): { name: string | null; logs: Log[] } {
  const name = /<channel>[\s\S]*?<title>Letterboxd - ([^<]*)<\/title>/.exec(xml)?.[1];
  const logs: Log[] = [];
  for (const item of xml.split('<item>').slice(1)) {
    const tmdb = /<tmdb:movieId>(\d+)</.exec(item)?.[1];
    const guid = /<guid[^>]*>([^<]+)</.exec(item)?.[1]?.trim();
    if (!tmdb || !guid || guid.startsWith('letterboxd-list')) continue;
    const rating = Number(/<letterboxd:memberRating>([\d.]+)</.exec(item)?.[1]);
    logs.push({
      entry_id: guid.slice(0, 80),
      tmdb_id: Number(tmdb),
      film_name: text(/<letterboxd:filmTitle>([^<]*)</.exec(item)?.[1] ?? '').slice(0, 200) || null,
      film_year: Number(/<letterboxd:filmYear>(\d{4})</.exec(item)?.[1]) || null,
      watched_on: /<letterboxd:watchedDate>(\d{4}-\d\d-\d\d)</.exec(item)?.[1] ?? null,
      rating: rating >= 0.5 && rating <= 5 ? rating : null,
      rewatch: /<letterboxd:rewatch>Yes</.test(item),
    });
  }
  return { name: name ? text(name).slice(0, 80) : null, logs };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  if (req.method === 'OPTIONS') return reply({}, 204, origin);
  if (req.method !== 'POST') return reply({ error: 'method' }, 405, origin);

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return reply({ error: 'signed_out' }, 401, origin);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // who is asking: only ever the owner of the session that was sent
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return reply({ error: 'signed_out' }, 401, origin);
  const user_id = data.user.id;

  const body = await req.json().catch(() => ({}));
  const { data: had } = await admin.from('letterboxd_accounts').select('username').eq('user_id', user_id).maybeSingle();
  // typed as a name, an @name or a profile link
  const typed = String(body.username ?? '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?letterboxd\.com\//, '').replace(/^@/, '').replace(/\/.*$/, '');
  const username = typed || had?.username || '';
  if (!/^[a-z0-9_]{2,15}$/.test(username)) return reply({ error: 'invalid' }, 400, origin);

  let feed: { name: string | null; logs: Log[] } | null = null;
  let problem = '';
  try {
    const res = await fetch(`https://letterboxd.com/${username}/rss/`, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml' }, signal: AbortSignal.timeout(12_000) });
    if (res.status === 404) return reply({ error: 'not_found' }, 404, origin);
    if (res.ok) {
      const xml = await res.text();
      if (xml.includes('<rss')) feed = parseFeed(xml);
      else problem = 'not a feed';
    } else problem = `Letterboxd answered ${res.status}`;
  } catch (e) {
    problem = (e as Error).name === 'TimeoutError' ? 'Letterboxd took too long' : 'Letterboxd could not be reached';
  }

  // another member than before: their films go
  if (had && had.username !== username) await admin.from('letterboxd_accounts').delete().eq('user_id', user_id);
  const { error: saved } = await admin.from('letterboxd_accounts').upsert({
    user_id, username,
    ...(feed ? { display_name: feed.name, synced_at: new Date().toISOString(), sync_error: null } : { sync_error: problem }),
  });
  if (saved) return reply({ error: 'failed' }, 500, origin);
  if (!feed) return reply({ status: 'pending' }, 200, origin);

  if (feed.logs.length) {
    const rows = [...new Map(feed.logs.map((l) => [l.entry_id, { user_id, ...l }])).values()];
    const { error: failed } = await admin.from('letterboxd_logs').upsert(rows);
    if (failed) return reply({ error: 'failed' }, 500, origin);
  }
  const { data: me } = await admin.from('letterboxd_logs').select('tmdb_id').eq('user_id', user_id);
  return reply({ status: 'connected', films: new Set((me ?? []).map((r) => r.tmdb_id)).size }, 200, origin);
});
