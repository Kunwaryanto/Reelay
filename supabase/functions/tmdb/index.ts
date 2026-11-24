// Everything on TMDB, for what the catalogue doesn't have.
//
// POST { q } with the person's own session in Authorization →
//   { results: [{ kind, tmdb_id, title, year, poster_path }] }   TMDB's films and series for the words, minus the
//                                                                ones the catalogue already has (search shows those)
// POST { add: { kind, tmdb_id } } → { id }   saves the title with its cast and crew (save_tmdb_title) and returns
//                                            its id, or the id it already had
// Searches are cached a day (tmdb_search_cache). The TMDB key stays here, never in the app.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SITE = 'https://usereelay.vercel.app';
const cors = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  Vary: 'Origin',
};
function reply(body: Record<string, unknown>, status = 200, origin = '') {
  const allow = origin.startsWith('http://localhost:') || /^https:\/\/reelay-[a-z0-9-]+\.vercel\.app$/.test(origin) ? origin : SITE;
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { ...cors, 'Access-Control-Allow-Origin': allow, 'Content-Type': 'application/json' },
  });
}

// deno-lint-ignore no-explicit-any
type Any = any;
async function tmdb(path: string, params: Record<string, string> = {}): Promise<Any> {
  const res = await fetch(`https://api.themoviedb.org/3${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${Deno.env.get('TMDB_READ_TOKEN')}`, accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
}

const yearOf = (d?: string | null) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/** The same title row, people and credits the nightly sync saves (scripts/sync/index.mjs, saveTitleOnce). */
function toSave(kind: 'film' | 'series', d: Any) {
  const film = kind === 'film';
  const first = film ? d.release_date : d.first_air_date;
  const lastSeason = film ? null : [...(d.seasons ?? [])].filter((s: Any) => s.season_number > 0 && s.air_date).sort((a: Any, b: Any) => b.season_number - a.season_number)[0];
  const logo = d.images?.logos?.find((l: Any) => l.iso_639_1 === 'en') ?? d.images?.logos?.[0];
  const se = film
    ? d.release_dates?.results?.find((r: Any) => r.iso_3166_1 === 'SE')?.release_dates?.map((x: Any) => x.certification).find(Boolean)
    : d.content_ratings?.results?.find((r: Any) => r.iso_3166_1 === 'SE')?.rating;
  const title = {
    tmdb_id: d.id, kind,
    imdb_id: d.external_ids?.imdb_id || d.imdb_id || null, wikidata_id: d.external_ids?.wikidata_id || null,
    title: film ? d.title : d.name, original_title: film ? d.original_title : d.original_name,
    year: yearOf(first), end_year: film ? null : yearOf(d.last_air_date),
    runtime_min: (film ? d.runtime : d.episode_run_time?.[0]) || null, seasons: film ? null : d.number_of_seasons ?? null,
    last_season_on: lastSeason?.air_date ?? null, overview: d.overview || null,
    genres: (d.genres ?? []).map((g: Any) => g.name), original_language: d.original_language || null,
    countries: film ? (d.production_countries ?? []).map((c: Any) => c.iso_3166_1) : d.origin_country ?? [],
    age_rating: se || null, poster_path: d.poster_path ?? null, backdrop_path: d.backdrop_path ?? null, logo_path: logo?.file_path ?? null,
    popularity: d.popularity ?? 0, released_on: /^\d{4}-\d{2}-\d{2}$/.test(first ?? '') ? first : null,
  };
  // top 10 cast, plus directors (films) or creators (series); one row per person and role
  const cast = film
    ? (d.credits?.cast ?? []).slice(0, 10).map((c: Any) => ({ p: c, role: 'cast', character: c.character, order: c.order }))
    : (d.aggregate_credits?.cast ?? []).slice(0, 10).map((c: Any, i: number) => ({ p: c, role: 'cast', character: c.roles?.[0]?.character, order: i }));
  const crew = film
    ? (d.credits?.crew ?? []).filter((c: Any) => c.job === 'Director').map((c: Any, i: number) => ({ p: c, role: 'director', order: i }))
    : (d.created_by ?? []).map((c: Any, i: number) => ({ p: { ...c, known_for_department: 'Writing' }, role: 'creator', order: i }));
  const seen = new Set<string>();
  const credits = [...cast, ...crew].filter((cr: Any) => {
    if (!cr.p?.id || !cr.p.name || seen.has(`${cr.p.id}:${cr.role}`)) return false;
    seen.add(`${cr.p.id}:${cr.role}`);
    return true;
  });
  const people = [...new Map(credits.map((cr: Any) => [cr.p.id, cr.p])).values()].map((p: Any) => ({
    tmdb_id: p.id, name: p.name, profile_path: p.profile_path ?? null, known_for: p.known_for_department ?? null,
  }));
  return {
    title, people,
    credits: credits.map((cr: Any) => ({ tmdb_id: cr.p.id, role: cr.role, character: cr.character || null, sort_order: cr.order ?? 0 })),
  };
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
  const { data: who, error: authError } = await admin.auth.getUser(token);
  if (authError || !who.user) return reply({ error: 'signed_out' }, 401, origin);
  const body = await req.json().catch(() => ({}));

  try {
    // ---- open one: save it first ----
    if (body.add) {
      const kind = body.add.kind === 'series' ? 'series' : body.add.kind === 'film' ? 'film' : null;
      const id = Number(body.add.tmdb_id);
      if (!kind || !Number.isInteger(id) || id <= 0) return reply({ error: 'invalid' }, 400, origin);
      const { data: had } = await admin.from('titles').select('id').eq('tmdb_id', id).eq('kind', kind).maybeSingle();
      if (had) return reply({ id: had.id }, 200, origin);
      const append = ['external_ids', 'images', kind === 'film' ? 'credits,release_dates' : 'aggregate_credits,content_ratings'].join(',');
      const d = await tmdb(`/${kind === 'film' ? 'movie' : 'tv'}/${id}`, { append_to_response: append, include_image_language: 'en,null' });
      if (!d) return reply({ error: 'not_found' }, 404, origin);
      const { data: saved, error } = await admin.rpc('save_tmdb_title', { p: toSave(kind, d) });
      if (error) throw new Error(error.message);
      return reply({ id: saved }, 200, origin);
    }

    // ---- search ----
    const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100);
    const q = clean(body.q), alt = clean(body.alt);
    if (q.length < 2) return reply({ results: [] }, 200, origin);
    // TMDB's films and series for some words, cached a day
    const lookup = async (words: string): Promise<Any[]> => {
      const key = `multi:${words}`;
      const { data: cached, error: cacheError } = await admin.from('tmdb_search_cache').select('results, fetched_at').eq('query', key).maybeSingle();
      if (cacheError) console.error('tmdb_search_cache', cacheError.message);
      if (cached && Date.now() - Date.parse(cached.fetched_at) < 24 * 3600 * 1000) return cached.results;
      const r = await tmdb('/search/multi', { query: words, include_adult: 'false', language: 'en-US', page: '1' });
      const list = (r?.results ?? [])
        .filter((x: Any) => (x.media_type === 'movie' || x.media_type === 'tv') && (x.title || x.name) && (x.poster_path || (x.vote_count ?? 0) >= 5))
        .map((x: Any) => ({
          kind: x.media_type === 'movie' ? 'film' : 'series', tmdb_id: x.id, title: x.title ?? x.name,
          year: yearOf(x.release_date ?? x.first_air_date), poster_path: x.poster_path ?? null, popularity: x.popularity ?? 0,
        }));
      const { error: saveError } = await admin.from('tmdb_search_cache').upsert({ query: key, results: list, fetched_at: new Date().toISOString() });
      if (saveError) console.error('tmdb_search_cache', saveError.message);
      return list;
    };
    // the whole text first ("2001 a space odyssey"), then only the name words if that finds nothing ("dune 2021" → "dune")
    let found = await lookup(q);
    if (!found.length && alt.length >= 2 && alt !== q) found = await lookup(alt);
    // the ones the catalogue has are in search already
    const ids = found.map((x) => x.tmdb_id);
    const { data: have, error: haveError } = ids.length ? await admin.from('titles').select('tmdb_id, kind').in('tmdb_id', ids) : { data: [], error: null };
    // without knowing what the catalogue has, every result could be a repeat: better none than doubles
    if (haveError) throw new Error(`titles: ${haveError.message}`);
    const known = new Set((have ?? []).map((h: Any) => `${h.kind}:${h.tmdb_id}`));
    const results = found.filter((x) => !known.has(`${x.kind}:${x.tmdb_id}`)).slice(0, 12)
      .map(({ kind, tmdb_id, title, year, poster_path }) => ({ kind, tmdb_id, title, year, poster_path }));
    return reply({ results }, 200, origin);
  } catch (e) {
    console.error(e);
    return reply({ error: 'tmdb' }, 502, origin);
  }
});
