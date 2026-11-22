// Nightly catalogue sync for Reelay. Runs in GitHub Actions (see .github/workflows/nightly-sync.yml).
//
// 1. Services: map TMDB's Swedish providers to ours.
// 2. Where things stream: TMDB discover lists every title on each of our services in Sweden
//    (data from JustWatch). That list alone decides availability, every night.
// 3. Title details (text, images, cast and crew): fetched for titles we don't have yet, plus the
//    SYNC_REFRESH_PER_RUN titles whose details are oldest, so the whole catalogue is refreshed about
//    every two weeks. SYNC_REFRESH=all refetches every title (slow: hours).
// 4. Leaving dates: Streaming Availability's list of titles leaving in Sweden.
// 5. Scores: IMDb's daily ratings file, then MDBList for Rotten Tomatoes and Letterboxd.
// 6. Full runs only: offers that are gone lose their rows, "added"/"left" events are written by
//    comparing with the night before, and old rows are cleaned up.
//
// SYNC_LIMIT > 0 runs a test on that many titles (no deletions, no events).

import pg from 'pg';
import { sendNotifications } from './notify.mjs';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

const env = (k, required = true) => {
  const v = process.env[k];
  if (required && !v) throw new Error(`${k} is not set`);
  return v;
};
const LIMIT = Number(process.env.SYNC_LIMIT || 0);
const FULL = LIMIT === 0;
const MDBLIST_PER_RUN = Number(process.env.MDBLIST_PER_RUN || 900);
// Streaming Availability's free plan allows 100 requests a day. Leaving dates come first and read the whole list
// (up to SA_PAGES pages, 25 changes each); links to the services' apps get what is left of SA_BUDGET, at most
// SA_LINK_REQUESTS (80 since 22 Nov: the leaving list took 15 pages that night). The 5 spare are for a retry or a test run the same day.
const SA_PAGES = Number(process.env.SA_PAGES || 30);
const SA_BUDGET = Number(process.env.SA_BUDGET || 95);
const SA_LINK_REQUESTS = Number(process.env.SA_LINK_REQUESTS || 80);
const REFRESH_ALL = process.env.SYNC_REFRESH === 'all';
const REFRESH_PER_RUN = Number(process.env.SYNC_REFRESH_PER_RUN || 2500);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, headers = {}, tries = 4) {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && i < tries) {
      await sleep(1000 * 2 ** i);
      continue;
    }
    if (r.status === 404) return null;
    throw new Error(`${r.status} ${url.replace(/apikey=[^&]+/, 'apikey=…')}: ${(await r.text()).slice(0, 200)}`);
  }
}

const TMDB = 'https://api.themoviedb.org/3';
const tmdbHeaders = { Authorization: `Bearer ${env('TMDB_READ_TOKEN')}`, accept: 'application/json' };
const tmdb = (path, params = {}) => {
  const q = new URLSearchParams({ language: 'en-US', ...params });
  return getJson(`${TMDB}${path}?${q}`, tmdbHeaders);
};

// Run fn over items with a fixed number of workers.
async function pool(items, workers, fn) {
  let i = 0;
  const out = [];
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await fn(items[idx], idx);
        } catch (e) {
          log('  failed:', items[idx]?.key ?? idx, e.message);
          out[idx] = null;
        }
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------
function connectionString() {
  const base = env('POOLER_URL'); // postgresql://postgres.<ref>@host:5432/postgres
  const pw = encodeURIComponent(env('SUPABASE_DB_PASSWORD'));
  return base.replace('://', '://').replace(/^(postgres(?:ql)?:\/\/[^@:]+)@/, `$1:${pw}@`);
}
const db = new pg.Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false }, max: 10 });

// ---------------------------------------------------------------------------
// 1. Services
// ---------------------------------------------------------------------------
const PROVIDER_NAMES = {
  netflix: ['netflix'],
  'hbo-max': ['hbo max', 'max'],
  'svt-play': ['svt', 'svt play'],
  viaplay: ['viaplay'],
  'disney-plus': ['disney plus', 'disney+'],
  'prime-video': ['amazon prime video', 'prime video'],
  'apple-tv': ['apple tv+', 'apple tv plus', 'apple tv'],
  skyshowtime: ['skyshowtime'],
  'tv4-play': ['tv4 play'],
  mubi: ['mubi'],
  crunchyroll: ['crunchyroll'],
  curiosity: ['curiosity stream', 'curiositystream'],
  'pluto-tv': ['pluto tv'],
  cineasterna: ['cineasterna'],
  'draken-film': ['draken films', 'draken film'],
  'triart-play': ['triart play', 'tri art play'],
  hayu: ['hayu'],
  britbox: ['britbox', 'britbox international'],
};

async function syncServices() {
  const lists = await Promise.all(['movie', 'tv'].map((k) => tmdb(`/watch/providers/${k}`, { watch_region: 'SE' })));
  const byName = new Map();
  for (const l of lists) for (const p of l?.results ?? []) byName.set(p.provider_name.toLowerCase(), p.provider_id);
  const map = {};
  for (const [id, names] of Object.entries(PROVIDER_NAMES)) {
    const hit = names.map((n) => byName.get(n)).find((v) => v != null);
    if (hit != null) {
      map[id] = hit;
      await db.query('update public.services set tmdb_provider_id = $2 where id = $1', [id, hit]);
    } else log('  no TMDB provider found for', id);
  }
  log('services mapped:', Object.entries(map).map(([k, v]) => `${k}=${v}`).join(' '));
  return map; // our id -> tmdb provider id
}

// ---------------------------------------------------------------------------
// 2. Titles streaming in Sweden
// ---------------------------------------------------------------------------
const MONETIZATION = [['flatrate', 'subscription'], ['free', 'free'], ['ads', 'free']];

// Every title on our services in Sweden: key "movie:123" -> { pop, offers: Map(service -> type) }.
// Any failed request aborts the run: a gap here would look like titles leaving.
async function discover(providerMap) {
  const seen = new Map();
  const combos = [];
  for (const kind of ['movie', 'tv'])
    for (const [svc, pid] of Object.entries(providerMap))
      for (const [monet, type] of MONETIZATION) combos.push({ kind, svc, pid, monet, type });
  const errors = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < combos.length && !errors.length) {
      const { kind, svc, pid, monet, type } = combos[next++];
      try {
        for (let page = 1; page <= 500; page++) {
          const r = await tmdb(`/discover/${kind}`, {
            watch_region: 'SE',
            with_watch_providers: String(pid),
            with_watch_monetization_types: monet,
            sort_by: 'popularity.desc',
            include_adult: 'false',
            page: String(page),
          });
          if (!r) throw new Error('no result');
          for (const t of r.results ?? []) {
            const key = `${kind}:${t.id}`;
            let e = seen.get(key);
            if (!e) seen.set(key, (e = { pop: t.popularity ?? 0, offers: new Map() }));
            // a subscription offer wins over a free one on the same service
            if (!e.offers.has(svc) || type === 'subscription') e.offers.set(svc, type);
          }
          if (page >= r.total_pages) break;
          if (page === 500) log(`  ${kind} on ${svc} (${monet}) has more than 10,000 titles: the rest are missed`);
          if (!FULL) break; // test runs: first page per service is plenty
        }
      } catch (e) {
        errors.push(`${kind} ${svc} ${monet}: ${e.message}`);
      }
    }
  }));
  if (errors.length) throw new Error(`discover failed, nothing changed: ${errors.join('; ')}`);
  const perService = {};
  for (const e of seen.values()) for (const svc of e.offers.keys()) perService[svc] = (perService[svc] ?? 0) + 1;
  log(`discovered ${seen.size} titles; by service: ${JSON.stringify(perService)}`);
  return seen;
}

function seRating(kind, d) {
  if (kind === 'movie') {
    const se = d.release_dates?.results?.find((r) => r.iso_3166_1 === 'SE');
    return se?.release_dates?.map((x) => x.certification).find(Boolean) || null;
  }
  return d.content_ratings?.results?.find((r) => r.iso_3166_1 === 'SE')?.rating || null;
}

async function fetchTitle(key) {
  const [kind, id] = key.split(':');
  const append = ['external_ids', 'images', kind === 'movie' ? 'credits,release_dates' : 'aggregate_credits,content_ratings'].join(',');
  const d = await tmdb(`/${kind}/${id}`, { append_to_response: append, include_image_language: 'en,null' });
  return d ? { kind, d } : null;
}

// Saves one title with its cast and crew. Where it streams is saved separately, from discover.
// Parallel saves can deadlock on shared people, and TMDB sometimes gives two titles the same IMDb or
// Wikidata id: both are retried here.
async function saveTitle(t) {
  let dropIds = false;
  for (let attempt = 1; ; attempt++) {
    try {
      return await saveTitleOnce(t, dropIds);
    } catch (e) {
      if (attempt >= 4) throw e;
      if (e.code === '40P01') { await sleep(200 * attempt + Math.random() * 300); continue; } // deadlock
      if (e.code === '23505' && /imdb_id|wikidata_id/.test(e.constraint ?? '')) { dropIds = true; continue; }
      throw e;
    }
  }
}

async function saveTitleOnce({ kind, d }, dropIds) {
  const film = kind === 'movie';
  const first = film ? d.release_date : d.first_air_date;
  const lastSeason = film ? null : [...(d.seasons ?? [])].filter((s) => s.season_number > 0 && s.air_date).sort((a, b) => b.season_number - a.season_number)[0];
  const logo = d.images?.logos?.find((l) => l.iso_639_1 === 'en') ?? d.images?.logos?.[0];
  const row = [
    d.id, film ? 'film' : 'series',
    dropIds ? null : d.external_ids?.imdb_id || d.imdb_id || null,
    dropIds ? null : d.external_ids?.wikidata_id || null,
    film ? d.title : d.name,
    film ? d.original_title : d.original_name,
    first ? Number(first.slice(0, 4)) : null,
    film ? null : d.last_air_date ? Number(d.last_air_date.slice(0, 4)) : null,
    film ? d.runtime || null : d.episode_run_time?.[0] || null,
    film ? null : d.number_of_seasons ?? null,
    lastSeason?.air_date ?? null,
    d.overview || null,
    (d.genres ?? []).map((g) => g.name),
    d.original_language || null,
    film ? (d.production_countries ?? []).map((c) => c.iso_3166_1) : d.origin_country ?? [],
    seRating(kind, d),
    d.poster_path ?? null,
    d.backdrop_path ?? null,
    logo?.file_path ?? null,
    d.popularity ?? 0,
  ];
  // Top 10 cast, plus directors (films) or creators (series).
  const cast = film
    ? (d.credits?.cast ?? []).slice(0, 10).map((c) => ({ p: c, role: 'cast', character: c.character, order: c.order }))
    : (d.aggregate_credits?.cast ?? []).slice(0, 10).map((c, i) => ({ p: c, role: 'cast', character: c.roles?.[0]?.character, order: i }));
  const crew = film
    ? (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c, i) => ({ p: c, role: 'director', order: i }))
    : (d.created_by ?? []).map((c, i) => ({ p: { ...c, known_for_department: 'Writing' }, role: 'creator', order: i }));
  const credits = [...cast, ...crew].filter((cr) => cr.p?.id && cr.p.name);
  // People in one statement, always in the same order, so two saves rarely wait on each other.
  const people = [...new Map(credits.map((cr) => [cr.p.id, cr.p])).values()].sort((a, b) => a.id - b.id);

  const c = await db.connect();
  try {
    await c.query('begin');
    // An IMDb or Wikidata id another title already has is left empty here (the first title keeps it).
    const t = await c.query(
      `insert into public.titles (tmdb_id, kind, imdb_id, wikidata_id, title, original_title, year, end_year,
         runtime_min, seasons, last_season_on, overview, genres, original_language, countries, age_rating,
         poster_path, backdrop_path, logo_path, popularity, keep_reason, synced_at)
       values ($1,$2,
         case when exists (select 1 from public.titles o where o.imdb_id = $3 and not (o.tmdb_id = $1 and o.kind = $2)) then null else $3 end,
         case when exists (select 1 from public.titles o where o.wikidata_id = $4 and not (o.tmdb_id = $1 and o.kind = $2)) then null else $4 end,
         $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'streaming', now())
       on conflict (tmdb_id, kind) do update set
         imdb_id = excluded.imdb_id, wikidata_id = excluded.wikidata_id, title = excluded.title,
         original_title = excluded.original_title, year = excluded.year, end_year = excluded.end_year,
         runtime_min = excluded.runtime_min, seasons = excluded.seasons, last_season_on = excluded.last_season_on,
         overview = excluded.overview, genres = excluded.genres, original_language = excluded.original_language,
         countries = excluded.countries, age_rating = excluded.age_rating, poster_path = excluded.poster_path,
         backdrop_path = excluded.backdrop_path, logo_path = excluded.logo_path, popularity = excluded.popularity,
         synced_at = now()
       returning id`,
      row,
    );
    const titleId = t.rows[0].id;

    await c.query('delete from public.credits where title_id = $1', [titleId]);
    if (people.length) {
      const saved = await c.query(
        `insert into public.people (tmdb_id, name, profile_path, known_for)
         select * from unnest($1::int[], $2::text[], $3::text[], $4::text[])
         on conflict (tmdb_id) do update set name = excluded.name, profile_path = excluded.profile_path,
           known_for = coalesce(excluded.known_for, public.people.known_for)
         returning id, tmdb_id`,
        [people.map((p) => p.id), people.map((p) => p.name), people.map((p) => p.profile_path ?? null), people.map((p) => p.known_for_department ?? null)],
      );
      const idOf = new Map(saved.rows.map((r) => [r.tmdb_id, r.id]));
      await c.query(
        `insert into public.credits (title_id, person_id, role, character, sort_order)
         select $1, * from unnest($2::bigint[], $3::text[], $4::text[], $5::int[])
         on conflict do nothing`,
        [titleId, credits.map((cr) => idOf.get(cr.p.id)), credits.map((cr) => cr.role), credits.map((cr) => cr.character || null), credits.map((cr) => cr.order ?? 0)],
      );
    }
    await c.query('commit');
    return titleId;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Where things stream, straight from discover, for every title we have. Also keeps popularity fresh.
async function saveAvailability(found, keys) {
  const rows = [];
  for (const key of keys) {
    const [k, id] = key.split(':');
    const e = found.get(key);
    for (const [svc, type] of e.offers) rows.push([Number(id), k === 'movie' ? 'film' : 'series', svc, type, e.pop]);
  }
  let offers = 0;
  for (let i = 0; i < rows.length; i += 2000) {
    const chunk = rows.slice(i, i + 2000);
    const cols = [0, 1, 2, 3, 4].map((j) => chunk.map((r) => r[j]));
    const r = await db.query(
      `insert into public.availability (title_id, service_id, type, seen_at)
       select t.id, x.svc, x.type, now()
       from unnest($1::int[], $2::text[], $3::text[], $4::text[]) as x(tmdb_id, kind, svc, type)
       join public.titles t on t.tmdb_id = x.tmdb_id and t.kind = x.kind
       on conflict (title_id, service_id) do update set type = excluded.type, seen_at = now()`,
      cols.slice(0, 4),
    );
    offers += r.rowCount;
    await db.query(
      `update public.titles t set popularity = x.pop, keep_reason = 'streaming'
       from (select distinct on (tmdb_id, kind) * from unnest($1::int[], $2::text[], $3::real[]) as u(tmdb_id, kind, pop)) x
       where t.tmdb_id = x.tmdb_id and t.kind = x.kind and (t.popularity is distinct from x.pop or t.keep_reason <> 'streaming')`,
      [cols[0], cols[1], cols[4]],
    );
  }
  log(`availability: ${offers} offers saved`);
}

// ---------------------------------------------------------------------------
// Links into the services' apps (Streaming Availability)
// ---------------------------------------------------------------------------
// A title's link on a service doesn't change, so each is fetched once and kept (availability.link_path, after
// services.link_base). A title that
// leaves a service loses its row (and link); when it comes back, it's in the "new" list and gets a fresh one.
//  1. Filling: each service's catalogue is read page by page (20 titles a page), most popular first, over as many
//     nights as it takes; where it stopped is kept in sync_state. A finished service is read again only after 30
//     days, and only if some of its titles still have no link.
//  2. Keeping up: titles added to a service since the last run, a few pages a night.
// Any show object the API returns on the way (including the leaving-dates list) is harvested for links too.
const SA_HOST = 'streaming-availability.p.rapidapi.com';
const saLinks = new Map(); // "tv|123|netflix" -> link, from any response this run

function harvestLinks(show, svcBySa) {
  const [k, id] = String(show?.tmdbId ?? '').split('/');
  if (!id) return;
  const rank = { subscription: 0, free: 1, addon: 2 };
  const best = {};
  for (const o of show.streamingOptions?.se ?? []) {
    const ours = svcBySa[o.service?.id];
    if (!ours || !(o.type in rank) || !o.link) continue;
    if (!best[ours] || rank[o.type] < rank[best[ours].type]) best[ours] = o;
  }
  for (const [svc, o] of Object.entries(best)) saLinks.set(`${k === 'movie' ? 'film' : 'series'}|${id}|${svc}`, o.link);
}

// A link is stored as the part after its service's base (services.link_base); one that doesn't start with it, whole.
// Tracking and options after "?" are dropped, except where the title's ID is in them (Prime Video's gti=…).
let linkBases = null;
const linkPath = (svc, link) => {
  const base = linkBases[svc];
  const clean = base?.includes('?') ? link : link.split('?')[0];
  return base && clean.startsWith(base) ? clean.slice(base.length) : clean;
};

async function saveLinks() {
  if (!saLinks.size) return 0;
  linkBases ??= Object.fromEntries((await db.query('select id, link_base from public.services')).rows.map((r) => [r.id, r.link_base]));
  const rows = [...saLinks].map(([k, link]) => { const [kind, id, svc] = k.split('|'); return [kind, id, svc, linkPath(svc, link)] });
  const cols = [0, 1, 2, 3].map((j) => rows.map((r) => r[j]));
  const r = await db.query(
    `update public.availability a set link_path = x.path
     from unnest($1::text[], $2::int[], $3::text[], $4::text[]) as x(kind, tmdb_id, svc, path)
     join public.titles t on t.tmdb_id = x.tmdb_id and t.kind = x.kind
     where a.title_id = t.id and a.service_id = x.svc and a.link_path is distinct from x.path`,
    cols,
  );
  saLinks.clear();
  return r.rowCount;
}

const getState = async (key, fallback) => (await db.query('select value from public.sync_state where key = $1', [key])).rows[0]?.value ?? fallback;
const setState = (key, value) => db.query(
  `insert into public.sync_state (key, value, updated_at) values ($1, $2, now())
   on conflict (key) do update set value = excluded.value, updated_at = now()`, [key, JSON.stringify(value)]);

async function syncLinks(budget = SA_LINK_REQUESTS) {
  const key = env('STREAMING_AVAILABILITY_KEY', false);
  if (!key) return log('links: no key, skipped');
  const headers = { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': SA_HOST };
  const services = (await db.query('select id, sa_service_id from public.services where sa_service_id is not null order by sort_order')).rows;
  const svcBySa = Object.fromEntries(services.map((r) => [r.sa_service_id, r.id]));
  let left = budget;
  let stopped = false;
  // One request; null when the day's allowance is used up (then nothing more is asked tonight).
  const ask = async (path) => {
    if (left <= 0 || stopped) return null;
    left--;
    const r = await fetch(`https://${SA_HOST}${path}`, { headers });
    if (r.status === 429) { stopped = true; log('links: daily allowance used up'); return null; }
    if (!r.ok) { log(`links: ${r.status} ${path.slice(0, 80)}`); return null; }
    return r.json();
  };

  // 2. Keeping up: what was added since the last run (first run: the last day)
  const since = await getState('links:since', Math.floor(Date.now() / 1000) - 86400);
  const now = Math.floor(Date.now() / 1000);
  let cursor = '';
  let pages = 0;
  for (; pages < 10; pages++) {
    const q = new URLSearchParams({ country: 'se', change_type: 'new', item_type: 'show', from: String(since), output_language: 'en' });
    if (cursor) q.set('cursor', cursor);
    const r = await ask(`/changes?${q}`);
    if (!r) break;
    for (const show of Object.values(r.shows ?? {})) harvestLinks(show, svcBySa);
    if (!r.hasMore) { cursor = ''; break; }
    cursor = r.nextCursor;
  }
  if (!stopped && !cursor) await setState('links:since', now); // all of it read: next time from now
  const added = await saveLinks();

  // 1. Filling, service by service
  const fill = await getState('links:fill', {});
  let filled = 0;
  for (const { id: svc, sa_service_id: sa } of services) {
    const st = fill[svc] ?? { cursor: '', done: null };
    if (st.done) {
      const age = (Date.now() - Date.parse(st.done)) / 86400000;
      const missing = (await db.query('select count(*)::int n from public.availability where service_id = $1 and link_path is null', [svc])).rows[0].n;
      if (age < 30 || missing === 0) continue;
      st.done = null; st.cursor = '';
    }
    // rent and buy are left out: only what's included in a subscription (or free)
    const catalog = ['prime', 'apple'].includes(sa) ? `${sa}.subscription` : sa;
    while (left > 0 && !stopped) {
      const q = new URLSearchParams({ country: 'se', catalogs: catalog, order_by: 'popularity_alltime', output_language: 'en' });
      if (st.cursor) q.set('cursor', st.cursor);
      const r = await ask(`/shows/search/filters?${q}`);
      if (!r) break;
      for (const show of r.shows ?? []) harvestLinks(show, svcBySa);
      if (r.hasMore) st.cursor = r.nextCursor;
      else { st.cursor = ''; st.done = new Date().toISOString(); break; }
    }
    fill[svc] = st;
    filled += await saveLinks();
    if (left <= 0 || stopped) break;
  }
  await setState('links:fill', fill);
  const missing = (await db.query('select count(*)::int n from public.availability where link_path is null')).rows[0].n;
  log(`links: ${added} from new arrivals (${pages} pages), ${filled} from catalogues; ${budget - left} of ${budget} requests; ${missing} offers still without a link`);
}

// ---------------------------------------------------------------------------
// 4. Leaving dates (Streaming Availability)
// ---------------------------------------------------------------------------
async function syncLeavingDates() {
  const key = env('STREAMING_AVAILABILITY_KEY', false);
  if (!key) { log('leaving dates: no key, skipped'); return 0; }
  const host = 'streaming-availability.p.rapidapi.com';
  const headers = { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host };
  const svc = Object.fromEntries((await db.query('select id, sa_service_id from public.services where sa_service_id is not null')).rows.map((r) => [r.sa_service_id, r.id]));
  let cursor = '';
  let matched = 0, seen = 0, pages = 0, more = false;
  const found = new Map(); // "titleId|service" -> date
  for (let page = 0; page < SA_PAGES; page++) {
    const q = new URLSearchParams({ country: 'se', change_type: 'expiring', item_type: 'show', output_language: 'en' });
    if (cursor) q.set('cursor', cursor);
    const r = await getJson(`https://${host}/changes?${q}`, headers);
    if (!r) break;
    pages++;
    for (const show of Object.values(r.shows ?? {})) harvestLinks(show, svc);
    for (const c of r.changes ?? []) {
      seen++;
      const show = r.shows?.[c.showId];
      const ours = svc[c.service?.id];
      if (!show?.tmdbId || !ours || !c.timestamp) continue;
      const [k, id] = show.tmdbId.split('/');
      const kind = k === 'movie' ? 'film' : 'series';
      const t = await db.query('select id from public.titles where tmdb_id = $1 and kind = $2', [Number(id), kind]);
      if (!t.rows[0]) continue;
      const day = new Date(c.timestamp * 1000).toISOString().slice(0, 10);
      found.set(`${t.rows[0].id}|${ours}`, day);
    }
    more = !!r.hasMore;
    if (!more) break;
    cursor = r.nextCursor;
  }
  for (const [k, day] of found) {
    const [titleId, service] = k.split('|');
    const u = await db.query('update public.availability set leaves_on = $3 where title_id = $1 and service_id = $2', [titleId, service, day]);
    matched += u.rowCount;
  }
  // Dates that have passed are no longer "leaving".
  await db.query('update public.availability set leaves_on = null where leaves_on < current_date');
  log(`leaving dates: ${seen} changes read in ${pages} pages${more ? ' (more remained: raise SA_PAGES)' : ''}, ${matched} matched to our titles`);
  return pages;
}

// ---------------------------------------------------------------------------
// 5. Scores
// ---------------------------------------------------------------------------
async function syncImdbRatings() {
  const ids = new Map((await db.query('select id, imdb_id from public.titles where imdb_id is not null')).rows.map((r) => [r.imdb_id, r.id]));
  const res = await fetch('https://datasets.imdbws.com/title.ratings.tsv.gz');
  if (!res.ok) throw new Error(`IMDb ratings: ${res.status}`);
  const lines = createInterface({ input: Readable.fromWeb(res.body).pipe(createGunzip()) });
  const rows = [];
  for await (const line of lines) {
    const [tconst, rating, votes] = line.split('\t');
    const titleId = ids.get(tconst);
    if (titleId) rows.push([titleId, Number(rating), Number(votes)]);
  }
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const values = chunk.map((_, j) => `($${j * 3 + 1}::bigint,$${j * 3 + 2}::numeric,$${j * 3 + 3}::int, now())`).join(',');
    await db.query(
      `insert into public.scores (title_id, imdb_rating, imdb_votes, imdb_synced_at) values ${values}
       on conflict (title_id) do update set imdb_rating = excluded.imdb_rating, imdb_votes = excluded.imdb_votes, imdb_synced_at = now()`,
      chunk.flat(),
    );
  }
  log(`IMDb ratings: ${rows.length} of ${ids.size} titles`);
}

async function syncMdblist() {
  const key = env('MDBLIST_API_KEY', false);
  if (!key) return log('MDBList: no key, skipped');
  // Never-fetched first, then the oldest, most popular first within each group.
  const todo = (await db.query(
    `select t.id, t.kind, t.imdb_id from public.titles t left join public.scores s on s.title_id = t.id
     where t.imdb_id is not null
     order by s.mdblist_synced_at nulls first, t.popularity desc limit $1`,
    [MDBLIST_PER_RUN],
  )).rows;
  let ok = 0, sample = null, spent = false, slowed = 0, withAudience = 0;
  // Two at a time with a short pause: four at once got a quarter of the lookups refused as "too many requests"
  // (22 Nov). That refusal is about pace and is waited out; the daily limit is not, and ends the step.
  await pool(todo.map((t) => ({ ...t, key: t.imdb_id })), 2, async (t) => {
    // MDBList allows a fixed number of lookups a day: once it says no, stop asking (the rest come tomorrow).
    if (spent) return;
    const url = `https://api.mdblist.com/imdb/${t.kind === 'film' ? 'movie' : 'show'}/${t.imdb_id}?apikey=${key}`;
    let r = null;
    for (let i = 0; ; i++) {
      if (spent) return;
      await sleep(200);
      const res = await fetch(url);
      if (res.ok) { r = await res.json(); break; }
      if (res.status === 404) return;
      const body = (await res.text()).slice(0, 300);
      if (/Daily API limit/i.test(body)) { spent = true; return; }
      if ((res.status === 429 || res.status >= 500) && i < 3) { slowed++; await sleep(2000 * 2 ** i); continue; }
      throw new Error(`${res.status} mdblist ${t.imdb_id}: ${body.slice(0, 80)}`);
    }
    if (!r) return;
    if (!sample && (r.ratings ?? []).some((x) => x.source === 'tomatoes' && x.value != null)) sample = r.ratings;
    const by = Object.fromEntries((r.ratings ?? []).map((x) => [x.source, x.value]));
    const rt = by.tomatoes ?? null;
    // the audience score: MDBList calls it "popcorn" (other spellings accepted in case it is renamed)
    const aud = by.popcorn ?? by.tomatoesaudience ?? by.audience ?? null;
    const lb = t.kind === 'film' ? by.letterboxd ?? null : null;
    if (aud != null) withAudience++;
    await db.query(
      `insert into public.scores (title_id, rt_critics, rt_audience, letterboxd, mdblist_synced_at) values ($1,$2,$3,$4, now())
       on conflict (title_id) do update set rt_critics = excluded.rt_critics, rt_audience = excluded.rt_audience, letterboxd = excluded.letterboxd, mdblist_synced_at = now()`,
      [t.id, rt == null ? null : Math.round(rt), aud == null ? null : Math.round(aud), lb],
    );
    ok++;
  });
  log(`MDBList: ${ok} of ${todo.length} titles updated${spent ? ' (daily limit reached, the rest next run)' : ''}${slowed ? `, waited out ${slowed} “too many requests”` : ''}`);
  log(`  with an RT audience score: ${withAudience}`);
  // every source name with its value, from a title that has a Tomatometer
  if (sample) log('  sample ratings:', sample.map((x) => `${x.source}=${x.value}`).join(' '));
}

// ---------------------------------------------------------------------------
// 6. Full runs: drop what's gone, record added/left, clean up
// ---------------------------------------------------------------------------
async function reconcile(runStart) {
  // The very first full run sees everything for the first time: that isn't "new".
  const firstRun = (await db.query('select not exists (select 1 from public.availability where since < current_date) as first')).rows[0].first;
  const added = firstRun ? { rowCount: 0 } : await db.query(
    `insert into public.availability_events (title_id, service_id, event)
     select title_id, service_id, 'added' from public.availability where since = current_date
     on conflict do nothing`,
  );
  const left = await db.query(
    `with gone as (delete from public.availability where seen_at < $1 returning title_id, service_id)
     insert into public.availability_events (title_id, service_id, event)
     select title_id, service_id, 'left' from gone on conflict do nothing`,
    [runStart],
  );
  // Titles with nothing streaming: kept while someone has saved them or they have awards.
  await db.query(
    `update public.titles t set keep_reason = case
       when exists (select 1 from public.watchlist w where w.title_id = t.id) then 'saved' else 'award' end
     where not exists (select 1 from public.availability a where a.title_id = t.id)
       and (exists (select 1 from public.watchlist w where w.title_id = t.id) or exists (select 1 from public.awards a where a.title_id = t.id))`,
  );
  // The rest stay 90 days after their details were last fetched (old links still open them), then go.
  const dropped = await db.query(
    `delete from public.titles t
     where not exists (select 1 from public.availability a where a.title_id = t.id)
       and not exists (select 1 from public.watchlist w where w.title_id = t.id)
       and not exists (select 1 from public.awards a where a.title_id = t.id)
       and t.synced_at < now() - interval '90 days'`,
  );
  const idle = (await db.query('select count(*)::int n from public.titles t where not exists (select 1 from public.availability a where a.title_id = t.id)')).rows[0].n;
  await db.query(`delete from public.availability_events where happened_on < current_date - 90`);
  await db.query(`delete from public.tmdb_search_cache where fetched_at < now() - interval '1 day'`);
  // Invites: joined or expired ones leave the Sent list after 30 days.
  await db.query(`delete from public.invites where coalesce(joined_at, expires_at) < now() - interval '30 days'`);
  // Sign-in log (who signed in when, with IP address): 30 days, as the privacy policy says.
  try {
    const a = await db.query(`delete from auth.audit_log_entries where created_at < now() - interval '30 days'`);
    log(`sign-in log: ${a.rowCount} old entries removed`);
  } catch (e) {
    log('sign-in log: could not clean up:', e.message);
  }
  log(`events: ${added.rowCount} added, ${left.rowCount} left; ${idle} titles kept with nothing streaming, ${dropped.rowCount} old ones removed`);
}

// ---------------------------------------------------------------------------
async function main() {
  const runStart = (await db.query('select now() as t')).rows[0].t;
  log(FULL ? 'full sync' : `test sync, ${LIMIT} titles`);
  const providerMap = await syncServices();
  const found = await discover(providerMap);
  let keys = [...found.entries()].sort((a, b) => b[1].pop - a[1].pop).map(([k]) => k);
  if (!FULL) keys = keys.slice(0, LIMIT);

  const have = new Map((await db.query('select tmdb_id, kind, synced_at from public.titles')).rows
    .map((r) => [`${r.kind === 'film' ? 'movie' : 'tv'}:${r.tmdb_id}`, r.synced_at]));
  // Safety: if TMDB suddenly lists far fewer titles than we have streaming, don't trust it.
  const streaming = (await db.query('select count(distinct title_id)::int n from public.availability')).rows[0].n;
  if (FULL && streaming > 1000 && keys.length < streaming * 0.7) {
    throw new Error(`discover found ${keys.length} titles but ${streaming} are streaming in the database: stopped, nothing changed`);
  }

  const fresh = keys.filter((k) => !have.has(k));
  const known = keys.filter((k) => have.has(k));
  const stale = REFRESH_ALL ? known : [...known].sort((a, b) => have.get(a) - have.get(b)).slice(0, FULL ? REFRESH_PER_RUN : LIMIT);
  log(`titles: ${keys.length} streaming, ${fresh.length} new, ${stale.length} of ${known.length} known ones refreshed`);
  let done = 0;
  const todo = [...fresh, ...stale];
  const results = await pool(todo.map((key) => ({ key })), 8, async ({ key }) => {
    const t = await fetchTitle(key);
    if (!t) return null;
    const id = await saveTitle(t);
    if (++done % 500 === 0) log(`  ${done} titles saved`);
    return id;
  });
  log(`title details saved: ${results.filter(Boolean).length} of ${todo.length}`);
  await saveAvailability(found, keys);
  const saUsed = await syncLeavingDates();
  await saveLinks(); // what the leaving-dates list carried
  // a failure here never fails the sync: the app falls back to the service's search
  await syncLinks(Math.max(0, Math.min(SA_LINK_REQUESTS, SA_BUDGET - saUsed))).catch((e) => log('links failed:', e.message));
  await syncImdbRatings();
  await syncMdblist();
  if (FULL) await reconcile(runStart);
  // after reconcile, so today's arrivals are in the events; a failure here never fails the sync
  if (FULL) await sendNotifications(db, log).catch((e) => log('notifications failed:', e.message));
  const counts = (await db.query(
    `select (select count(*) from public.titles) titles, (select count(*) from public.people) people,
            (select count(*) from public.availability) availability,
            (select count(*) from public.availability where leaves_on is not null) leaving,
            (select count(*) from public.scores where imdb_rating is not null) imdb,
            (select count(*) from public.scores where rt_critics is not null) rt,
            (select count(*) from public.scores where rt_audience is not null) rt_audience,
            (select count(*) from public.scores where letterboxd is not null) letterboxd,
            pg_size_pretty(pg_database_size(current_database())) db_size`,
  )).rows[0];
  log('database now:', JSON.stringify(counts));
  await db.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await db.end(); } catch {}
  process.exit(1);
});
