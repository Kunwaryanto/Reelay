// Saves the films from a member's Letterboxd export. The app opens the ZIP on the phone and sends only the
// rows; the file itself never leaves the phone. Rows are kept by film name and year and matched to the
// catalogue by the database (letterboxd_resolve), now and every night after.
//
// POST { rows: [{ n: name, y: year, d: 'YYYY-MM-DD' | null, r: rating | null, w: rewatch }] } with the
// person's own session in Authorization →
//   { status: 'imported', films, matched }   films in the export, and how many are in the catalogue now
//   { error: 'not_connected' | 'empty' | 'too_many' | 'failed' }

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://usereelay.vercel.app';
const MAX_ROWS = 30_000;
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

async function sha(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

  const { data: account } = await admin.from('letterboxd_accounts').select('user_id').eq('user_id', user_id).maybeSingle();
  if (!account) return reply({ error: 'not_connected' }, 400, origin);

  const body = await req.json().catch(() => null);
  const sent: unknown[] = Array.isArray(body?.rows) ? body.rows : [];
  if (sent.length > MAX_ROWS) return reply({ error: 'too_many' }, 400, origin);

  // only what a diary row can be; anything else in a row is dropped
  type Row = { user_id: string; entry_id: string; film_name: string; film_year: number | null; watched_on: string | null; rating: number | null; rewatch: boolean };
  const rows = new Map<string, Row>();
  const seen = new Map<string, number>();
  for (const x of sent as Record<string, unknown>[]) {
    const name = typeof x?.n === 'string' ? x.n.trim().slice(0, 200) : '';
    if (!name) continue;
    const year = Number.isInteger(x.y) && (x.y as number) > 1870 && (x.y as number) < 2100 ? (x.y as number) : null;
    const day = typeof x.d === 'string' && /^\d{4}-\d\d-\d\d$/.test(x.d) && !Number.isNaN(Date.parse(x.d)) ? x.d : null;
    const rating = typeof x.r === 'number' && x.r >= 0.5 && x.r <= 5 ? Math.round(x.r * 2) / 2 : null;
    // the same film twice on one day is two entries: number them, so importing again lands on the same rows
    const key = `${name.toLowerCase()}|${year ?? ''}|${day ?? 'seen'}`;
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    const entry_id = `import-${await sha(`${key}|${nth}`)}`;
    rows.set(entry_id, { user_id, entry_id, film_name: name, film_year: year, watched_on: day, rating, rewatch: x.w === true });
  }
  if (!rows.size) return reply({ error: 'empty' }, 400, origin);

  const all = [...rows.values()];
  for (let i = 0; i < all.length; i += 1000) {
    // ignoreDuplicates would keep an old rating: a second import updates
    const { error: failed } = await admin.from('letterboxd_logs').upsert(all.slice(i, i + 1000));
    if (failed) return reply({ error: 'failed' }, 500, origin);
  }
  // The rows are saved, so the import has worked even if matching them fails here: the nightly sync matches
  // whatever is left.
  await admin.rpc('letterboxd_resolve', { p_user: user_id });

  const films = new Set(all.map((r) => `${r.film_name.toLowerCase()}|${r.film_year ?? ''}`)).size;
  await admin.from('letterboxd_accounts').update({ imported_at: new Date().toISOString(), imported_films: films }).eq('user_id', user_id);
  const { data: mine } = await admin.from('letterboxd_logs').select('tmdb_id').eq('user_id', user_id).not('tmdb_id', 'is', null).limit(50_000);
  return reply({ status: 'imported', films, matched: new Set((mine ?? []).map((r) => r.tmdb_id)).size }, 200, origin);
});
