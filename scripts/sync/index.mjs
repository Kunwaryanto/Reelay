// Nightly catalogue sync for Reelay. Runs in GitHub Actions (see .github/workflows/nightly-sync.yml).
//
// 1. Services: map TMDB's Swedish providers to ours.
// 2. Where things stream: TMDB discover lists every title on each of our services in Sweden
//    (data from JustWatch). That list alone decides availability, every night.
// 3. Title details (text, images, cast and crew): fetched for titles we don't have yet, plus up to
//    SYNC_REFRESH_PER_RUN known titles that are due by their tier (public.title_refresh: new titles weekly,
//    recent ones every two weeks, older ones every 60 days). SYNC_REFRESH=all refetches every title (slow: hours).
// 4. Leaving dates: Streaming Availability's list of titles leaving in Sweden.
// 5. Scores: IMDb's daily ratings file (every title, every night), then MDBList for Rotten Tomatoes and Letterboxd
//    and OMDb for missing Tomatometers, each due by the title's tier (new every 2-3 days, recent weekly, older 90 days).
// 6. Letterboxd: the diary feeds of connected members (full runs only), then for Home: TMDB's weekly trending
//    lists and its recommendations for films members rated 4 or higher.
// 7. Full runs only: offers that are gone lose their rows, "added"/"left" events are written by
//    comparing with the night before, and old rows are cleaned up.
//
// SYNC_LIMIT > 0 runs a test on that many titles (no deletions, no events).

import pg from 'pg';
import { sendNotifications } from './notify.mjs';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { createInterface } from 'node:readline';

/** A moment as a plain date in Sweden ("2026-11-30"): dates the app shows are Swedish days, not UTC's. */
const sweDay = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date(ms));

const env = (k, required = true) => {
  const v = process.env[k];
  if (required && !v) throw new Error(`${k} is not set`);
  return v;
};
const LIMIT = Number(process.env.SYNC_LIMIT || 0);
const FULL = LIMIT === 0;
// only used when MDBList won't say how much of the day's allowance is left
const MDBLIST_PER_RUN = Number(process.env.MDBLIST_PER_RUN || 1000);
// SYNC_ONLY=scores: just the MDBList scores (the Scores workflow), nothing else is touched
const ONLY = process.env.SYNC_ONLY || '';
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

/** Other names a title goes by in Sweden, for search: its Swedish title (TMDB's translation) and the alternative
 *  titles listed for Sweden, minus any that only repeat its own names (punctuation and case aside). Nordic originals
 *  are shown by their original title (a trigger in the database); the English one is kept there as title_en. */
export function akaOf(kind, d) {
  const film = kind === 'movie';
  const key = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  const own = new Set([film ? d.title : d.name, film ? d.original_title : d.original_name].map(key));
  const sv = (d.translations?.translations ?? []).find((t) => t.iso_639_1 === 'sv')?.data;
  const alt = (film ? d.alternative_titles?.titles : d.alternative_titles?.results) ?? [];
  const names = [film ? sv?.title : sv?.name, ...alt.filter((a) => a.iso_3166_1 === 'SE').map((a) => a.title)];
  const out = [];
  for (const n of names) {
    const k = key(n);
    if (!k || own.has(k)) continue;
    own.add(k);
    out.push(String(n).trim());
  }
  return out.slice(0, 6);
}

/** The title page's picture, picked from all of TMDB's images (`images` with include_image_language en,null): a
 *  textless poster (no language: the key art without its title), else a textless backdrop at least 1920 wide (the
 *  page crops it tall, so a smaller one turns soft), best voted first. [path, isPoster], or [null, false]. */
export function heroOf(d) {
  const best = (list, minW) => (list ?? [])
    .filter((i) => !i.iso_639_1 && i.file_path && (i.width ?? 0) >= minW)
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0) || (b.vote_count ?? 0) - (a.vote_count ?? 0) || (b.width ?? 0) - (a.width ?? 0))[0];
  const poster = best(d.images?.posters, 1000);
  if (poster) return [poster.file_path, true];
  const backdrop = best(d.images?.backdrops, 1920);
  return backdrop ? [backdrop.file_path, false] : [null, false];
}

async function fetchTitle(key) {
  const [kind, id] = key.split(':');
  const append = ['external_ids', 'images', 'alternative_titles', 'translations', kind === 'movie' ? 'credits,release_dates' : 'aggregate_credits,content_ratings'].join(',');
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
    /^\d{4}-\d{2}-\d{2}$/.test(first ?? '') ? first : null,
    akaOf(kind, d),
    ...heroOf(d),
    film ? d.belongs_to_collection?.id ?? null : null, // the series of films it belongs to (one per series on the walls)
  ];
  // Top 10 cast, plus directors (films) or creators (series).
  const cast = film
    ? (d.credits?.cast ?? []).slice(0, 10).map((c) => ({ p: c, role: 'cast', character: c.character, order: c.order }))
    : (d.aggregate_credits?.cast ?? []).slice(0, 10).map((c, i) => ({ p: c, role: 'cast', character: c.roles?.[0]?.character, order: i }));
  const crew = film
    ? (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c, i) => ({ p: c, role: 'director', order: i }))
    : (d.created_by ?? []).map((c, i) => ({ p: { ...c, known_for_department: 'Writing' }, role: 'creator', order: i }));
  // one row per person and role (someone listed twice in the cast keeps their first part)
  const credits = [];
  const seen = new Set();
  for (const cr of [...cast, ...crew]) {
    if (!cr.p?.id || !cr.p.name || seen.has(`${cr.p.id}:${cr.role}`)) continue;
    seen.add(`${cr.p.id}:${cr.role}`);
    credits.push(cr);
  }
  // People in one statement, always in the same order, so two saves rarely wait on each other.
  const people = [...new Map(credits.map((cr) => [cr.p.id, cr.p])).values()].sort((a, b) => a.id - b.id);

  const c = await db.connect();
  try {
    await c.query('begin');
    // An IMDb or Wikidata id another title already has is left empty here (the first title keeps it).
    const t = await c.query(
      `insert into public.titles (tmdb_id, kind, imdb_id, wikidata_id, title, original_title, year, end_year,
         runtime_min, seasons, last_season_on, overview, genres, original_language, countries, age_rating,
         poster_path, backdrop_path, logo_path, popularity, released_on, aka, hero_path, hero_poster, collection_id, keep_reason, synced_at)
       values ($1,$2,
         case when exists (select 1 from public.titles o where o.imdb_id = $3 and not (o.tmdb_id = $1 and o.kind = $2)) then null else $3 end,
         case when exists (select 1 from public.titles o where o.wikidata_id = $4 and not (o.tmdb_id = $1 and o.kind = $2)) then null else $4 end,
         $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,'streaming', now())
       on conflict (tmdb_id, kind) do update set
         imdb_id = excluded.imdb_id, wikidata_id = excluded.wikidata_id, title = excluded.title,
         original_title = excluded.original_title, year = excluded.year, end_year = excluded.end_year,
         runtime_min = excluded.runtime_min, seasons = excluded.seasons, last_season_on = excluded.last_season_on,
         overview = excluded.overview, genres = excluded.genres, original_language = excluded.original_language,
         countries = excluded.countries, age_rating = excluded.age_rating, poster_path = excluded.poster_path,
         backdrop_path = excluded.backdrop_path, logo_path = excluded.logo_path, popularity = excluded.popularity,
         released_on = excluded.released_on, aka = excluded.aka, hero_path = excluded.hero_path,
         hero_poster = excluded.hero_poster, collection_id = excluded.collection_id, synced_at = now()
       returning id`,
      row,
    );
    const titleId = t.rows[0].id;

    // Cast and crew: only what changed is written (a refresh used to delete and re-add every row, which left
    // tens of thousands of dead rows a night). People are updated only when their name, picture or department
    // changed; credits that are gone are deleted, new ones added, changed ones updated.
    let personIds = [];
    if (people.length) {
      await c.query(
        `insert into public.people (tmdb_id, name, profile_path, known_for)
         select * from unnest($1::int[], $2::text[], $3::text[], $4::text[])
         on conflict (tmdb_id) do update set name = excluded.name, profile_path = excluded.profile_path,
           known_for = coalesce(excluded.known_for, public.people.known_for)
         where (public.people.name, public.people.profile_path, public.people.known_for)
           is distinct from (excluded.name, excluded.profile_path, coalesce(excluded.known_for, public.people.known_for))`,
        [people.map((p) => p.id), people.map((p) => p.name), people.map((p) => p.profile_path ?? null), people.map((p) => p.known_for_department ?? null)],
      );
      const ids = await c.query('select id, tmdb_id from public.people where tmdb_id = any($1::int[])', [people.map((p) => p.id)]);
      const idOf = new Map(ids.rows.map((r) => [r.tmdb_id, r.id]));
      personIds = credits.map((cr) => idOf.get(cr.p.id));
    }
    const roles = credits.map((cr) => cr.role);
    await c.query(
      `delete from public.credits c where c.title_id = $1
         and (c.person_id, c.role) not in (select * from unnest($2::bigint[], $3::text[]))`,
      [titleId, personIds, roles],
    );
    if (credits.length) {
      await c.query(
        `insert into public.credits (title_id, person_id, role, character, sort_order)
         select $1, * from unnest($2::bigint[], $3::text[], $4::text[], $5::int[])
         on conflict (title_id, person_id, role) do update set character = excluded.character, sort_order = excluded.sort_order
         where (public.credits.character, public.credits.sort_order) is distinct from (excluded.character, excluded.sort_order)`,
        [titleId, personIds, roles, credits.map((cr) => cr.character || null), credits.map((cr) => cr.order ?? 0)],
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
    // Popularity is written only when it has really moved (15%, and at least half a point): TMDB's number shifts a
    // little for almost every title every night, and each write copies the whole row (overview and all), which left
    // titles half empty. Sorting by popularity doesn't notice the difference.
    await db.query(
      `update public.titles t set popularity = x.pop, keep_reason = 'streaming'
       from (select distinct on (tmdb_id, kind) * from unnest($1::int[], $2::text[], $3::real[]) as u(tmdb_id, kind, pop)) x
       where t.tmdb_id = x.tmdb_id and t.kind = x.kind
         and (t.popularity is null or abs(t.popularity - x.pop) > greatest(0.15 * t.popularity, 0.5) or t.keep_reason <> 'streaming')`,
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
      // the day it leaves in Sweden: a title gone at midnight here is 23:00 UTC the day before
      const day = sweDay(c.timestamp * 1000);
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
  await db.query(`update public.availability set leaves_on = null where leaves_on < (now() at time zone 'Europe/Stockholm')::date`);
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

// MDBList: Rotten Tomatoes (critics and audience) and Letterboxd.
// Asked 200 titles at a time (its batch lookup) since 22 Nov. Whether a batch costs one request or one per title
// against the day's allowance isn't documented, so the first batch is measured: our usage is read before and after.
//   one request per batch  -> the whole queue is worked through tonight
//   one per title          -> as many titles as the day's allowance has left
//   batches don't work     -> one title per request, as before
const MDB = 'https://api.mdblist.com';
const MDB_BATCH = 200;
const saveMdbScores = async (t, ratings, missing = false) => {
  const by = Object.fromEntries((ratings ?? []).map((x) => [x.source, x.value]));
  const rt = by.tomatoes ?? null;
  // the audience score: MDBList calls it "popcorn" (other spellings accepted in case it is renamed)
  const aud = by.popcorn ?? by.tomatoesaudience ?? by.audience ?? null;
  // MDBList gives Letterboxd's average doubled (out of 10); Letterboxd itself, and Reelay, show it out of 5
  const lb = t.kind === 'film' && by.letterboxd != null ? Math.round(by.letterboxd * 5) / 10 : null;
  // A title that didn't come back is saved too (all empty), so it doesn't sit at the front of the queue every
  // night; it is dated so that it's asked for again in a week, not a month, in case it was only left out.
  const at = missing ? `now() - interval '23 days'` : 'now()';
  await db.query(
    `insert into public.scores (title_id, rt_critics, rt_audience, letterboxd, mdblist_synced_at) values ($1,$2,$3,$4, ${at})
     on conflict (title_id) do update set
       -- MDBList's critics' score wins; with none from it, a score OMDb filled in is kept
       rt_critics = coalesce(excluded.rt_critics, case when scores.omdb_synced_at is not null then scores.rt_critics end),
       rt_audience = excluded.rt_audience, letterboxd = excluded.letterboxd, mdblist_synced_at = ${at}`,
    [t.id, rt == null ? null : Math.round(rt), aud == null ? null : Math.round(aud), lb],
  );
  return { rt: rt != null, aud: aud != null };
};

async function syncMdblist() {
  const key = env('MDBLIST_API_KEY', false);
  if (!key) return log('MDBList: no key, skipped');
  // The queue: never fetched first, then what is due by its tier (public.title_refresh: new every 2 days, recent
  // weekly, older every 90 days; 3 hours' slack, as the sync doesn't start at the same minute every night); within
  // each, new before recent before older, titles on someone's Watchlist, then the most popular.
  const todo = (await db.query(
    `select t.id, t.kind, t.imdb_id from public.titles t join public.title_refresh r on r.title_id = t.id
       left join public.scores s on s.title_id = t.id
     where t.imdb_id is not null
       and (s.mdblist_synced_at is null or s.mdblist_synced_at < now() - public.refresh_every(r.tier, 'scores') + interval '3 hours')
     order by (s.mdblist_synced_at is null) desc,
              case r.tier when 'new' then 0 when 'recent' then 1 else 2 end,
              exists (select 1 from public.watchlist w where w.title_id = t.id) desc,
              t.popularity desc nulls last`,
  )).rows;
  if (!todo.length) return log('MDBList: nothing to fetch');

  // our usage today, as MDBList counts it: { used, limit } or null if it won't say
  const usage = async () => {
    try {
      const r = await fetch(`${MDB}/user?apikey=${key}`);
      if (!r.ok) return null;
      const u = await r.json();
      const used = u.api_requests_count ?? u.api_requests_used ?? null, limit = u.api_requests ?? u.api_requests_limit ?? null;
      return used == null || limit == null ? null : { used: Number(used), limit: Number(limit) };
    } catch { return null; }
  };

  let ok = 0, withRt = 0, withAud = 0, absent = 0, sample = null, spent = false, slowed = 0, requests = 0;
  // One batch: every title in it is saved (found or not). Returns false if batches can't be used.
  const batch = async (list) => {
    const kind = list[0].kind === 'film' ? 'movie' : 'show';
    let res, body;
    for (let i = 0; ; i++) {
      await sleep(400);
      requests++;
      res = await fetch(`${MDB}/imdb/${kind}?apikey=${key}`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ ids: list.map((t) => t.imdb_id) }) });
      if (res.ok) break;
      body = (await res.text()).slice(0, 300);
      if (/Daily API limit/i.test(body)) { spent = true; return true; }
      if ((res.status === 429 || res.status >= 500) && i < 3) { slowed++; await sleep(2000 * 2 ** i); continue; }
      log(`MDBList: batch refused (${res.status}): ${body.slice(0, 160)}`);
      return false;
    }
    const json = await res.json();
    const items = Array.isArray(json) ? json : json.items ?? json.results ?? json.data ?? json.medias ?? null;
    if (!Array.isArray(items)) { log('MDBList: batch answer not understood:', JSON.stringify(json).slice(0, 300)); return false; }
    const byImdb = new Map();
    for (const it of items) {
      const id = it?.ids?.imdb ?? it?.imdb_id ?? it?.imdbid ?? it?.imdb;
      if (id) byImdb.set(id, it);
    }
    // an answer with titles but none we can match to what we asked for is a shape we don't know: don't save empties over it
    if (items.length && !byImdb.size) { log('MDBList: batch items have no IMDb id:', JSON.stringify(items[0]).slice(0, 300)); return false; }
    for (const t of list) {
      const it = byImdb.get(t.imdb_id);
      const got = await saveMdbScores(t, it?.ratings, !it);
      ok++; if (!it) absent++; if (got.rt) withRt++; if (got.aud) withAud++;
      if (!sample && got.rt) sample = it.ratings;
    }
    return true;
  };

  // films and series are asked for separately (the route names the kind); keep the queue's order within each
  const chunks = [];
  for (const kind of ['film', 'series']) {
    const of = todo.filter((t) => (t.kind === 'film') === (kind === 'film'));
    for (let i = 0; i < of.length; i += MDB_BATCH) chunks.push(of.slice(i, i + MDB_BATCH));
  }
  // interleave, so neither kind waits for the whole of the other
  chunks.sort((a, b) => todo.indexOf(a[0]) - todo.indexOf(b[0]));

  const before = await usage();
  const worked = await batch(chunks[0]);
  const after = await usage();
  if (!worked) {
    // one title per request, as before 22 Nov
    log('MDBList: batches unavailable, asking one title at a time');
    const left = after ? Math.max(0, after.limit - after.used) : MDBLIST_PER_RUN;
    await pool(todo.slice(0, Math.min(left, MDBLIST_PER_RUN)).map((t) => ({ ...t, key: t.imdb_id })), 2, async (t) => {
      if (spent) return;
      const url = `${MDB}/imdb/${t.kind === 'film' ? 'movie' : 'show'}/${t.imdb_id}?apikey=${key}`;
      for (let i = 0; ; i++) {
        if (spent) return;
        await sleep(200);
        const res = await fetch(url);
        if (res.ok) { const r = await res.json(); const got = await saveMdbScores(t, r.ratings); ok++; if (got.rt) withRt++; if (got.aud) withAud++; if (!sample && got.rt) sample = r.ratings; return; }
        if (res.status === 404) { await saveMdbScores(t, [], true); ok++; absent++; return; }
        const body = (await res.text()).slice(0, 300);
        if (/Daily API limit/i.test(body)) { spent = true; return; }
        if ((res.status === 429 || res.status >= 500) && i < 3) { slowed++; await sleep(2000 * 2 ** i); continue; }
        throw new Error(`${res.status} mdblist ${t.imdb_id}: ${body.slice(0, 80)}`);
      }
    });
  } else {
    const cost = before && after ? after.used - before.used : null;
    log(`MDBList: first batch came back with ${chunks[0].length - absent} of ${chunks[0].length} titles`);
    log(`MDBList: first batch of ${chunks[0].length} titles cost ${cost == null ? 'an unknown number of' : cost} requests (usage ${before ? before.used : '?'} -> ${after ? after.used : '?'} of ${after ? after.limit : '?'})`);
    // how many more titles tonight: everything if a batch is cheap, otherwise what the allowance has left
    const perTitle = cost == null || cost > 5;
    let allowance = perTitle ? (after ? Math.max(0, after.limit - after.used) : Math.max(0, MDBLIST_PER_RUN - chunks[0].length)) : Infinity;
    if (perTitle) log(`MDBList: counted per title: ${allowance} more titles tonight`);
    for (const list of chunks.slice(1)) {
      if (spent || allowance <= 0) break;
      const part = list.slice(0, allowance);
      if (!(await batch(part))) break;
      allowance -= part.length;
      if (ok % 2000 < MDB_BATCH) log(`  ${ok} titles`);
    }
  }
  log(`MDBList: ${ok} of ${todo.length} waiting titles updated in ${requests} batch requests${spent ? ' (daily limit reached, the rest next run)' : ''}${slowed ? `, waited out ${slowed} “too many requests”` : ''}`);
  log(`  with a Tomatometer: ${withRt}, with an RT audience score: ${withAud}, not known to MDBList: ${absent}`);
  // every source name with its value, from a title that has a Tomatometer
  if (sample) log('  sample ratings:', sample.map((x) => `${x.source}=${x.value}`).join(' '));
}

// ---------------------------------------------------------------------------
// 6. Full runs: drop what's gone, record added/left, clean up
// ---------------------------------------------------------------------------
async function reconcile(runStart) {
  // The very first full run sees everything for the first time: that isn't "new".
  const firstRun = (await db.query('select not exists (select 1 from public.availability where since < current_date) as first')).rows[0].first;
  // Nor is a service's own first night (one added to Reelay later): its whole catalogue was already there.
  await db.query(`update public.services s set first_synced_on = current_date
    where s.first_synced_on is null and exists (select 1 from public.availability a where a.service_id = s.id)`);
  const added = firstRun ? { rowCount: 0 } : await db.query(
    `insert into public.availability_events (title_id, service_id, event)
     select a.title_id, a.service_id, 'added' from public.availability a join public.services s on s.id = a.service_id
     where a.since = current_date and s.first_synced_on < current_date
     on conflict do nothing`,
  );
  const left = await db.query(
    `with gone as (delete from public.availability where seen_at < $1 returning title_id, service_id)
     insert into public.availability_events (title_id, service_id, event)
     select title_id, service_id, 'left' from gone on conflict do nothing`,
    [runStart],
  );
  // Titles with nothing streaming: kept while someone has saved them, they're well known (notable) or have awards.
  await db.query(
    `update public.titles t set keep_reason = case
       when exists (select 1 from public.watchlist w where w.title_id = t.id) then 'saved' when t.notable then 'notable' else 'award' end
     where not exists (select 1 from public.availability a where a.title_id = t.id)
       and (t.notable or exists (select 1 from public.watchlist w where w.title_id = t.id) or exists (select 1 from public.awards a where a.title_id = t.id))`,
  );
  // The rest stay 90 days after their details were last fetched (old links still open them), then go.
  const dropped = await db.query(
    `delete from public.titles t
     where not exists (select 1 from public.availability a where a.title_id = t.id)
       and not t.notable
       and not exists (select 1 from public.watchlist w where w.title_id = t.id)
       and not exists (select 1 from public.awards a where a.title_id = t.id)
       and t.synced_at < now() - interval '90 days'`,
  );
  // People in no title we still keep (their titles were removed above, or their credits changed) go too.
  // Credits are the only thing that points at a person, and a person seen again is fetched again with the title.
  const unseen = await db.query(`delete from public.people p where not exists (select 1 from public.credits c where c.person_id = p.id)`);
  const idle = (await db.query('select count(*)::int n from public.titles t where not exists (select 1 from public.availability a where a.title_id = t.id)')).rows[0].n;
  await db.query(`delete from public.availability_events where happened_on < current_date - 90`);
  await db.query(`delete from public.tmdb_search_cache where fetched_at < now() - interval '1 day'`);
  // Invites: joined or expired ones leave the Sent list after 30 days.
  await db.query(`delete from public.invites where coalesce(joined_at, expires_at) < now() - interval '30 days'`);
  // error reports from the app are kept 30 days (privacy policy)
  await db.query(`delete from public.client_errors where at < now() - interval '30 days'`).catch(() => {});
  // Sign-in log (who signed in when, with IP address): 30 days, as the privacy policy says.
  try {
    const a = await db.query(`delete from auth.audit_log_entries where created_at < now() - interval '30 days'`);
    log(`sign-in log: ${a.rowCount} old entries removed`);
  } catch (e) {
    log('sign-in log: could not clean up:', e.message);
  }
  log(`events: ${added.rowCount} added, ${left.rowCount} left; ${idle} titles kept with nothing streaming, ${dropped.rowCount} old ones removed, ${unseen.rowCount} people in no title removed`);
}

// ---------------------------------------------------------------------------
// OMDb: a backup for the Rotten Tomatoes critics' score, for films only (it rarely has series) and only where MDBList
// has none. Compared 22 Nov: where both have a score they match, and OMDb had some big films MDBList missed.
// Free plan: 1,000 requests a day; each film is asked about at most once a month.
const OMDB_PER_RUN = Number(process.env.OMDB_PER_RUN || 950);
const OMDB_MIN_VOTES = Number(process.env.OMDB_MIN_VOTES || 5000);
async function syncOmdb() {
  const key = env('OMDB_API_KEY', false);
  if (!key) return log('OMDb: no key, skipped');
  const todo = (await db.query(
    `select t.id, t.imdb_id, t.title from public.titles t join public.scores s on s.title_id = t.id
       join public.title_refresh r on r.title_id = t.id
     where t.kind = 'film' and t.imdb_id is not null and s.rt_critics is null
       -- due by tier: a new film's reviews arrive within days (every 3 days), recent every 2 weeks, older every 90
       and (s.omdb_synced_at is null or s.omdb_synced_at < now() - public.refresh_every(r.tier, 'omdb') + interval '3 hours')
     -- Watchlist first; then films with enough IMDb votes that Rotten Tomatoes has likely reviewed them (most asks
     -- that came back empty were small films); the rest are still asked, last. Each group by popularity.
     order by case r.tier when 'new' then 0 when 'recent' then 1 else 2 end,
              exists (select 1 from public.watchlist w where w.title_id = t.id) desc,
              (coalesce(s.imdb_votes, 0) >= $2) desc, t.popularity desc nulls last
     limit $1`, [OMDB_PER_RUN, OMDB_MIN_VOTES])).rows;
  if (!todo.length) return log('OMDb: nothing to fetch');
  let asked = 0, filled = 0, spent = false;
  const sample = [];
  await pool(todo.map((t) => ({ ...t, key: t.imdb_id })), 2, async (t) => {
    if (spent) return;
    await sleep(150);
    let j = null;
    try { j = await (await fetch(`https://www.omdbapi.com/?i=${t.imdb_id}&apikey=${key}`)).json(); } catch { return; }
    if (j?.Response === 'False') {
      if (/limit|invalid api key|not activated/i.test(j.Error ?? '')) { if (!spent) log('OMDb: stopped:', j.Error); spent = true; return; }
    }
    asked++;
    const v = (j?.Ratings ?? []).find((x) => x.Source === 'Rotten Tomatoes')?.Value;
    const rt = v ? Number(String(v).replace('%', '')) : null;
    await db.query(
      `update public.scores set omdb_synced_at = now(), rt_critics = coalesce(rt_critics, $2) where title_id = $1`,
      [t.id, Number.isFinite(rt) ? rt : null]);
    if (Number.isFinite(rt)) { filled++; if (sample.length < 6) sample.push(`${t.title} ${rt}%`); }
  });
  log(`OMDb: ${asked} films asked, ${filled} got a critics' score${spent ? ' (daily limit reached, the rest next run)' : ''}${todo.length === OMDB_PER_RUN ? ', more waiting' : ''}`);
  if (sample.length) log('  e.g.', sample.join(' · '));
}

const COUNTS = `select (select count(*) from public.scores where rt_critics is not null) rt,
  (select count(*) from public.scores where rt_audience is not null) rt_audience,
  (select count(*) from public.scores where letterboxd is not null) letterboxd,
  (select count(*) from public.scores where mdblist_synced_at is not null) asked,
  (select count(*) from public.titles where imdb_id is not null) with_imdb_id`;

// Letterboxd: the public diary feed of every connected member (their latest entries; the app reads it once
// when they connect). Members are few, so one at a time with a pause. A member that fails keeps their films
// and is tried again the next night.
function parseLetterboxd(xml) {
  const name = /<channel>[\s\S]*?<title>Letterboxd - ([^<]*)<\/title>/.exec(xml)?.[1];
  const text = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
  const logs = [];
  for (const item of xml.split('<item>').slice(1)) {
    const tmdb = /<tmdb:movieId>(\d+)</.exec(item)?.[1];
    const guid = /<guid[^>]*>([^<]+)</.exec(item)?.[1]?.trim();
    if (!tmdb || !guid || guid.startsWith('letterboxd-list')) continue;
    const rating = Number(/<letterboxd:memberRating>([\d.]+)</.exec(item)?.[1]);
    logs.push({
      entry_id: guid.slice(0, 80), tmdb_id: Number(tmdb),
      film_name: text(/<letterboxd:filmTitle>([^<]*)</.exec(item)?.[1] ?? '').slice(0, 200) || null,
      film_year: Number(/<letterboxd:filmYear>(\d{4})</.exec(item)?.[1]) || null,
      watched_on: /<letterboxd:watchedDate>(\d{4}-\d\d-\d\d)</.exec(item)?.[1] ?? null,
      rating: rating >= 0.5 && rating <= 5 ? rating : null,
      rewatch: /<letterboxd:rewatch>Yes</.test(item),
    });
  }
  return { name: name ? text(name).slice(0, 80) : null, logs };
}

async function syncLetterboxd() {
  const members = (await db.query('select user_id, username from public.letterboxd_accounts order by synced_at nulls first')).rows;
  if (!members.length) return;
  let ok = 0, entries = 0;
  for (const m of members) {
    try {
      const res = await fetch(`https://letterboxd.com/${m.username}/rss/`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Reelay/1.0; +https://usereelay.vercel.app)', Accept: 'application/rss+xml, application/xml' },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(res.status === 404 ? 'no such member' : `Letterboxd answered ${res.status}`);
      const xml = await res.text();
      if (!xml.includes('<rss')) throw new Error('not a feed');
      const { name, logs } = parseLetterboxd(xml);
      const rows = [...new Map(logs.map((l) => [l.entry_id, l])).values()];
      if (rows.length) {
        await db.query(
          `insert into public.letterboxd_logs (user_id, entry_id, tmdb_id, film_name, film_year, watched_on, rating, rewatch)
           select $1, x.entry_id, x.tmdb_id, x.film_name, x.film_year, x.watched_on, x.rating, x.rewatch
           from jsonb_to_recordset($2::jsonb) as x(entry_id text, tmdb_id int, film_name text, film_year int, watched_on date, rating numeric, rewatch boolean)
           on conflict (user_id, entry_id) do update set tmdb_id = excluded.tmdb_id, film_name = excluded.film_name, film_year = excluded.film_year,
             watched_on = excluded.watched_on, rating = excluded.rating, rewatch = excluded.rewatch`,
          [m.user_id, JSON.stringify(rows)]);
      }
      await db.query('update public.letterboxd_accounts set synced_at = now(), sync_error = null, display_name = coalesce($2, display_name) where user_id = $1', [m.user_id, name]);
      ok++; entries += rows.length;
    } catch (e) {
      await db.query('update public.letterboxd_accounts set sync_error = $2 where user_id = $1', [m.user_id, String(e.message).slice(0, 200)]);
      log(`  Letterboxd: ${m.username} failed: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  log(`Letterboxd: ${ok} of ${members.length} members read, ${entries} entries in their feeds`);
  // imported history is kept by film name: match what has arrived in the catalogue, and drop what the feeds now cover
  // (with a time limit: on 25 Nov a slow match held the whole sync for five hours)
  await db.query("set statement_timeout = '3min'");
  try {
    const matched = (await db.query('select public.letterboxd_resolve(null) as n')).rows[0].n;
    if (matched) log(`Letterboxd: ${matched} imported entries matched to the catalogue`);
  } catch (e) { log('Letterboxd: matching imported entries failed:', e.message) }
  finally { await db.query('set statement_timeout = 0') }
}

// Home: this week's trending films and series (TMDB's lists, worldwide; Home shows the ones on a member's
// services, in this order). 100 of each; the rank is cleared for everything else.
async function syncTrending() {
  for (const [path, kind] of [['movie', 'film'], ['tv', 'series']]) {
    const ids = [];
    for (let page = 1; page <= 5; page++) {
      const r = await tmdb(`/trending/${path}/week`, { page });
      for (const x of r?.results ?? []) if (!ids.includes(x.id)) ids.push(x.id);
    }
    if (ids.length < 20) { log(`trending ${kind}: only ${ids.length} came back, kept last week's`); continue; }
    const done = await db.query(
      `with ranked as (select id::int as tmdb_id, ord::int as rank from unnest($1::int[]) with ordinality as u(id, ord)),
            cleared as (update public.titles set trend_rank = null where kind = $2 and trend_rank is not null and tmdb_id <> all ($1::int[]))
       update public.titles t set trend_rank = r.rank from ranked r where t.kind = $2 and t.tmdb_id = r.tmdb_id`,
      [ids, kind]);
    log(`trending ${kind}: ${ids.length} listed, ${done.rowCount} of them in the catalogue`);
  }
}

// Home: "Because you liked …" and "Because you saved …". TMDB's recommendations for films members rated 4 or
// higher and for everything on a watchlist (films and series): asked once per title, again after 60 days, the
// most recent first. One request each.
const RECS_PER_RUN = Number(process.env.RECS_PER_RUN || 400);
async function syncRecs() {
  const todo = (await db.query(
    `with wanted as (
       select 'film' as kind, l.tmdb_id, max(l.watched_on)::timestamptz as at from public.letterboxd_logs l
       where l.rating >= 4 and l.tmdb_id is not null group by l.tmdb_id
       union all
       select t.kind, t.tmdb_id, max(w.added_at) from public.watchlist w join public.titles t on t.id = w.title_id group by t.kind, t.tmdb_id
     )
     select w.kind, w.tmdb_id from wanted w
     left join public.rec_sources s on s.kind = w.kind and s.tmdb_id = w.tmdb_id
     where s.tmdb_id is null or s.fetched_at < now() - interval '60 days'
     group by w.kind, w.tmdb_id order by max(w.at) desc nulls last limit $1`, [RECS_PER_RUN])).rows;
  if (!todo.length) return;
  let saved = 0;
  await pool(todo, 6, async ({ kind, tmdb_id: id }) => {
    const r = await tmdb(`/${kind === 'film' ? 'movie' : 'tv'}/${id}/recommendations`, { page: 1 }).catch(() => undefined);
    if (r === undefined) return; // a failed request: asked again next night
    const recs = (r?.results ?? []).slice(0, 20).map((x, i) => ({ rec: x.id, rank: i + 1 }));
    await db.query('delete from public.title_recs where source_kind = $1 and source_tmdb_id = $2', [kind, id]);
    if (recs.length) {
      await db.query(
        `insert into public.title_recs (source_kind, source_tmdb_id, rec_kind, rec_tmdb_id, rank)
         select $1, $2, $1, x.rec, x.rank from jsonb_to_recordset($3::jsonb) as x(rec int, rank int) on conflict do nothing`, [kind, id, JSON.stringify(recs)]);
    }
    await db.query('insert into public.rec_sources (kind, tmdb_id) values ($1, $2) on conflict (kind, tmdb_id) do update set fetched_at = now()', [kind, id]);
    saved++;
  });
  log(`recommendations: ${saved} of ${todo.length} liked or saved titles asked about`);
}

// "More like this" (title_similar): for each streaming title, up to 15 alike titles in order. TMDB's
// recommendations that stream here come first (same kind), then our own scoring (public.similar_backup) fills the
// rest. Due by tier (refresh_every 'similar': new every 2 weeks, recent 2 months, older 6 months); titles without a
// list first. SIMILAR_PER_RUN caps a night (the first nights build the whole catalogue).
const SIMILAR_PER_RUN = Number(process.env.SIMILAR_PER_RUN || 6000);
// Awards (Oscars, Primetime Emmys, Golden Globes) from Wikidata: what our titles won or were nominated for, also
// when the award went to a person for the title (acting, directing). Asked for by our titles' Wikidata ids, 300 at a
// time, so it doesn't depend on how Wikidata groups the categories. The table is rebuilt whole (it is only written
// here). AWARDS_DRY=1 counts without writing. Weekly in the nightly sync (Sundays), or the Awards workflow.
const AWARDS = [['Oscars', 'Academy Award for '], ['Emmys', 'Primetime Emmy Award for '], ['Golden Globes', 'Golden Globe Award for ']];
const NOT_AWARDS = /Technical|Scientific|Honorary|Juvenile|Merit|Special Achievement|Medal|Humanitarian|Governors|Cecil B\. DeMille|Carol Burnett/i;
function awardRank(cat) {
  if (/Supporting/i.test(cat)) return 5;
  if (/^(Best Picture|Best Animated Feature|Best International Feature|Best Foreign Language Film|Best Non-English Language Film|Outstanding (Drama|Comedy) Series|Outstanding (Limited|Mini)[- ]?series|Outstanding Limited or Anthology Series|Outstanding Miniseries or (a )?Movie|Best (Motion Picture|Television Series|Miniseries|Limited Series|Television Limited Series))/i.test(cat)) return 1;
  if (/Lead Act|^Best Actor|^Best Actress|^Outstanding Actor|^Outstanding Actress/i.test(cat)) return 2;
  if (/Direct/i.test(cat)) return 3;
  if (/Screenplay|Writing/i.test(cat)) return 4;
  return 6;
}
async function wikidata(query) {
  for (let attempt = 0; ; attempt++) {
    // a dropped connection ("terminated") is retried like a busy server
    const r = await fetch('https://query.wikidata.org/sparql', {
      method: 'POST', body: new URLSearchParams({ query }),
      headers: { 'user-agent': 'Reelay/1.0 (https://usereelay.vercel.app; personal non-commercial project)', accept: 'application/sparql-results+json', 'content-type': 'application/x-www-form-urlencoded' },
    }).then(async (res) => (res.ok ? { ok: true, rows: (await res.json()).results.bindings } : { ok: false, status: res.status }))
      .catch((e) => ({ ok: false, status: 0, error: e.message }));
    if (r.ok) return r.rows;
    if (attempt >= 3 || ![0, 429, 500, 502, 503, 504].includes(r.status)) throw new Error(`Wikidata ${r.status || r.error}`);
    await new Promise((ok) => setTimeout(ok, 5000 * (attempt + 1)));
  }
}
async function syncAwards() {
  const titles = (await db.query('select id, wikidata_id from public.titles where wikidata_id is not null')).rows;
  const byQ = new Map(titles.map((t) => [t.wikidata_id, Number(t.id)]));
  // 1. The categories: items whose English name starts with one of the three awards' prefixes, found with
  //    Wikidata's label search (a SPARQL scan of every award statement times out).
  const api = async (params) => {
    const r = await fetch(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`, {
      headers: { 'user-agent': 'Reelay/1.0 (https://usereelay.vercel.app; personal non-commercial project)' } });
    if (!r.ok) throw new Error(`Wikidata API ${r.status}`);
    return r.json();
  };
  const cats = new Map();
  for (const [award, prefix] of AWARDS) {
    const ids = [];
    for (let offset = 0; offset !== undefined && ids.length < 2000;) {
      const r = await api({ action: 'query', list: 'search', srsearch: `inlabel:"${prefix.trim()}"@en`, srnamespace: '0', srlimit: '500', sroffset: String(offset) });
      ids.push(...(r.query?.search ?? []).map((x) => x.title));
      offset = r.continue?.sroffset;
    }
    for (let i = 0; i < ids.length; i += 50) {
      const r = await api({ action: 'wbgetentities', ids: ids.slice(i, i + 50).join('|'), props: 'labels', languages: 'en' });
      for (const [q, e] of Object.entries(r.entities ?? {})) {
        const label = e.labels?.en?.value ?? '';
        if (!label.startsWith(prefix)) continue;
        const category = label.slice(prefix.length);
        if (!NOT_AWARDS.test(category)) cats.set(q, { award, category });
      }
    }
  }
  log(`awards: ${cats.size} categories (${AWARDS.map(([a]) => `${a} ${[...cats.values()].filter((c) => c.award === a).length}`).join(', ')})`);
  // 2. Every win and nomination in those categories, given to a title or to a person for a title ("for work")
  const found = new Map(); // statement -> row
  let failed = 0;
  const keys = [...cats.keys()];
  const batches = [];
  // 10 categories a request: Best Picture-sized categories have thousands of statements, and big answers got cut
  for (let i = 0; i < keys.length; i += 10) batches.push(keys.slice(i, i + 10));
  await pool(batches, 2, async (batch) => {
    const rows = await wikidata(`SELECT ?st ?award ?who ?forWork ?time ?kind ?whoLabel WHERE {
      VALUES ?award { ${batch.map((q) => `wd:${q}`).join(' ')} }
      { ?who p:P166 ?st . ?st ps:P166 ?award . BIND("won" AS ?kind) } UNION { ?who p:P1411 ?st . ?st ps:P1411 ?award . BIND("nom" AS ?kind) }
      OPTIONAL { ?st pq:P585 ?time }
      OPTIONAL { ?st pq:P1686 ?forWork . ?who rdfs:label ?whoLabel . FILTER(LANG(?whoLabel) = "en") }
    }`).catch((e) => { failed++; log('  awards batch failed:', e.message); return []; });
    for (const r of rows) {
      const work = (r.forWork ?? r.who).value.split('/').pop();
      const title_id = byQ.get(work);
      const year = r.time ? Number(r.time.value.slice(0, 4)) : null;
      if (!title_id || !year) continue;
      const { award, category } = cats.get(r.award.value.split('/').pop());
      const st = r.st.value.split('/').pop();
      found.set(st, {
        title_id, award, year, category,
        short_category: category.replace(/^Outstanding /, 'Best '), rank: awardRank(category), won: r.kind.value === 'won',
        // a best film/series award belongs to the title (Wikidata credits it to the producers)
        person_name: r.forWork && awardRank(category) !== 1 ? r.whoLabel?.value ?? null : null, ref: st,
      });
    }
  });
  // one row per title, award, year, category and person: a win beats a nomination
  const rows = new Map();
  for (const a of found.values()) {
    const k = [a.title_id, a.award, a.year, a.category, a.person_name ?? ''].join('|');
    if (!rows.has(k) || (a.won && !rows.get(k).won)) rows.set(k, a);
  }
  const list = [...rows.values()];
  const by = (f) => Object.entries(list.reduce((m, a) => ((m[f(a)] = (m[f(a)] ?? 0) + 1), m), {})).map(([k, n]) => `${k} ${n}`).join(', ');
  log(`awards: ${list.length} from ${batches.length} batches (${failed} failed): ${by((a) => `${a.award} ${a.won ? 'won' : 'nominated'}`)}`);
  log(`  titles with a win: ${new Set(list.filter((a) => a.won).map((a) => a.title_id)).size}; by rank (won): ${by((a) => (a.won ? `rank ${a.rank}` : 'nom'))}`);
  if (process.env.AWARDS_DRY) {
    const top = list.filter((a) => a.won && a.rank <= 2).slice(0, 12);
    for (const a of top) log(`  e.g. ${a.award} ${a.year} ${a.short_category}${a.person_name ? ` (${a.person_name})` : ''} -> title ${a.title_id}`);
    return;
  }
  if (failed > batches.length / 10) return log('awards: too many failed batches, kept what we had');
  await db.query('begin');
  try {
    await db.query('delete from public.awards');
    for (let i = 0; i < list.length; i += 1000) {
      const c = list.slice(i, i + 1000);
      await db.query(
        `insert into public.awards (title_id, award, year, category, short_category, rank, won, person_name, wikidata_ref)
         select * from unnest($1::bigint[], $2::text[], $3::int[], $4::text[], $5::text[], $6::smallint[], $7::boolean[], $8::text[], $9::text[])
         on conflict do nothing`,
        [c.map((a) => a.title_id), c.map((a) => a.award), c.map((a) => a.year), c.map((a) => a.category), c.map((a) => a.short_category),
          c.map((a) => a.rank), c.map((a) => a.won), c.map((a) => a.person_name), c.map((a) => a.ref)],
      );
    }
    await db.query('commit');
  } catch (e) { await db.query('rollback'); throw e; }
  log(`awards: saved ${list.length}`);
}

// Well-known titles (500+ votes on TMDB) are kept whether or not they stream, so a big film that is only to rent in
// Sweden is still in search, on its people's pages and on watchlists. TMDB's discover lists them by vote count; the
// ones we know are marked notable, the ones we don't are fetched and saved like any title, and marked too.
// Weekly on Sundays (vote counts only grow), or the Notable titles workflow. NOTABLE_PER_RUN caps a run.
const NOTABLE_VOTES = 500;
const NOTABLE_PER_RUN = Number(process.env.NOTABLE_PER_RUN || 6000);
async function syncNotable() {
  const want = [];
  for (const [kind, path] of [['movie', '/discover/movie'], ['tv', '/discover/tv']]) {
    for (let page = 1; page <= 500; page++) {
      const r = await tmdb(path, { 'vote_count.gte': NOTABLE_VOTES, sort_by: 'vote_count.desc', include_adult: false, page });
      for (const t of r?.results ?? []) want.push({ kind, id: t.id });
      if (!r || page >= (r.total_pages ?? 0)) break;
    }
  }
  const ids = (k) => want.filter((w) => w.kind === k).map((w) => w.id);
  const mark = async () => db.query(
    `update public.titles t set notable = true
     where not t.notable and ((t.kind = 'film' and t.tmdb_id = any($1::int[])) or (t.kind = 'series' and t.tmdb_id = any($2::int[])))`,
    [ids('movie'), ids('tv')]);
  const marked = await mark();
  const have = new Set((await db.query(`select (case kind when 'film' then 'movie' else 'tv' end) || ':' || tmdb_id k from public.titles`)).rows.map((r) => r.k));
  const missing = want.map((w) => `${w.kind}:${w.id}`).filter((k) => !have.has(k)).slice(0, NOTABLE_PER_RUN);
  let saved = 0, failed = 0;
  await pool(missing, 8, async (key) => {
    try {
      const t = await fetchTitle(key);
      if (!t) { failed++; return; }
      await saveTitle(t);
      if (++saved % 500 === 0) log(`  notable: ${saved} added`);
    } catch (e) { failed++; if (failed <= 5) log(`  notable ${key} failed:`, e.message); }
  });
  await mark();
  // the new ones don't stream (or the offers step would have added them): say why they're kept
  await db.query(`update public.titles t set keep_reason = 'notable'
    where t.notable and keep_reason = 'streaming' and not exists (select 1 from public.availability a where a.title_id = t.id)`);
  log(`notable: ${want.length} titles with ${NOTABLE_VOTES}+ votes; ${marked.rowCount} known ones marked, ${saved} added${failed ? `, ${failed} failed` : ''}`);
}

// Stand-up (titles.standup, one of the tags members can hide in Settings › Suggestions): every film and series TMDB
// tags with its "stand-up comedy" keyword, found by name, then listed through discover. Only changes are written.
// Weekly in the nightly sync (Sundays), or the Stand-up workflow.
async function syncStandup() {
  const found = await tmdb('/search/keyword', { query: 'stand-up comedy' });
  const kw = (found?.results ?? []).find((k) => k.name?.toLowerCase() === 'stand-up comedy');
  if (!kw) return log('stand-up: keyword not found, skipped');
  const keys = new Set();
  for (const kind of ['movie', 'tv']) {
    for (let page = 1; page <= 100; page++) {
      const r = await tmdb(`/discover/${kind}`, { with_keywords: String(kw.id), sort_by: 'popularity.desc', page });
      for (const x of r?.results ?? []) keys.add(`${kind === 'movie' ? 'film' : 'series'}:${x.id}`);
      if (!r || page >= (r.total_pages ?? 0)) break;
    }
  }
  if (keys.size < 50) return log(`stand-up: only ${keys.size} found, nothing changed`); // a failed read shouldn't unmark them all
  const kinds = [...keys].map((k) => k.split(':')[0]), ids = [...keys].map((k) => Number(k.split(':')[1]));
  const on = await db.query(`update public.titles t set standup = true from unnest($1::text[], $2::int[]) k(kind, tmdb_id)
    where t.kind = k.kind and t.tmdb_id = k.tmdb_id and not t.standup`, [kinds, ids]);
  const off = await db.query(`update public.titles t set standup = false where t.standup
    and not exists (select 1 from unnest($1::text[], $2::int[]) k(kind, tmdb_id) where k.kind = t.kind and k.tmdb_id = t.tmdb_id)`, [kinds, ids]);
  const total = (await db.query('select count(*)::int n from public.titles where standup')).rows[0].n;
  log(`stand-up: ${keys.size} on TMDB (keyword ${kw.id}), ${total} of ours; ${on.rowCount} marked, ${off.rowCount} unmarked`);
}

async function syncSimilar() {
  const idOf = new Map((await db.query(
    'select t.id, t.kind, t.tmdb_id from public.titles t where exists (select 1 from public.availability a where a.title_id = t.id)',
  )).rows.map((r) => [`${r.kind}:${r.tmdb_id}`, Number(r.id)]));
  const todo = (await db.query(
    `select t.id, t.kind, t.tmdb_id from public.titles t
       join public.title_refresh r on r.title_id = t.id
       left join public.title_similar s on s.title_id = t.id
     where exists (select 1 from public.availability a where a.title_id = t.id)
       and (s.title_id is null or s.tmdb_at is null or s.tmdb_at < now() - public.refresh_every(r.tier, 'similar') + interval '3 hours')
     order by (s.title_id is null) desc, case r.tier when 'new' then 0 when 'recent' then 1 else 2 end, t.popularity desc
     limit $1`, [SIMILAR_PER_RUN])).rows;
  if (!todo.length) return log('similar: nothing due');
  let built = 0, fromTmdb = 0, failed = 0;
  await pool(todo, 8, async ({ id, kind, tmdb_id }) => {
    const r = await tmdb(`/${kind === 'film' ? 'movie' : 'tv'}/${tmdb_id}/recommendations`, { page: 1 }).catch(() => undefined);
    if (r === undefined) { failed++; return; } // asked again next night
    const ids = [];
    for (const x of r?.results ?? []) {
      const other = idOf.get(`${kind}:${x.id}`);
      if (other && other !== Number(id) && !ids.includes(other)) ids.push(other);
      if (ids.length === 15) break;
    }
    fromTmdb += ids.length;
    if (ids.length < 15) {
      const more = (await db.query('select id from public.similar_backup($1, 30)', [id])).rows.map((x) => Number(x.id));
      for (const other of more) { if (!ids.includes(other)) ids.push(other); if (ids.length === 15) break; }
    }
    await db.query(
      `insert into public.title_similar (title_id, ids, tmdb_at, built_at) values ($1, $2, now(), now())
       on conflict (title_id) do update set ids = excluded.ids, tmdb_at = now(), built_at = now()`, [id, ids]);
    if (++built % 1000 === 0) log(`  similar: ${built} built`);
  });
  log(`similar: ${built} of ${todo.length} built (${(fromTmdb / Math.max(1, built)).toFixed(1)} from TMDB on average)${failed ? `, ${failed} TMDB failures` : ''}`);
}

// The app keeps what it has loaded until this moves (see data_stamp): set at the end of every run that changes data.
async function stamp() {
  await db.query('update public.data_stamp set finished_at = now() where id = 1').catch((e) => log('stamp failed:', e.message));
}

async function main() {
  // SYNC_ONLY=home: just what Home needs beyond the catalogue (the Home data workflow)
  if (ONLY === 'home') {
    log('home data only');
    await syncTrending();
    await syncLetterboxd();
    await syncRecs();
    await syncSimilar();
    await stamp();
    await db.end();
    return;
  }
  // SYNC_ONLY=aka: once, every title's other names in Sweden (the Other titles workflow); the nightly sync keeps
  // them from then on as it refreshes titles. Only titles whose names changed are written.
  if (ONLY === 'aka') {
    log('other names only');
    const all = (await db.query(`select id, tmdb_id, kind, aka from public.titles order by popularity desc`)).rows;
    let done = 0, changed = 0, failed = 0;
    await pool(all, 8, async (t) => {
      const kind = t.kind === 'film' ? 'movie' : 'tv';
      try {
        const d = await tmdb(`/${kind}/${t.tmdb_id}`, { append_to_response: 'alternative_titles,translations' });
        if (!d) { failed++; return; }
        const aka = akaOf(kind, d);
        if (aka.join('|') !== (t.aka ?? []).join('|')) { await db.query('update public.titles set aka = $2 where id = $1', [t.id, aka]); changed++ }
      } catch (e) { failed++; if (failed <= 5) log(`  ${kind}:${t.tmdb_id} failed:`, e.message) }
      if (++done % 2000 === 0) log(`  ${done} of ${all.length} read, ${changed} with new names`);
    });
    log(`other names: ${all.length} titles read, ${changed} changed${failed ? `, ${failed} failed` : ''}`);
    await stamp();
    await db.end();
    return;
  }
  // SYNC_ONLY=hero: once, every title's page picture (the Title pictures workflow); the nightly sync keeps it from
  // then on as it refreshes titles. Only titles whose picture changed are written.
  if (ONLY === 'hero') {
    log('title pictures only');
    const all = (await db.query(`select id, tmdb_id, kind, hero_path from public.titles order by popularity desc`)).rows;
    let done = 0, changed = 0, failed = 0, posters = 0, backdrops = 0;
    await pool(all, 8, async (t) => {
      const kind = t.kind === 'film' ? 'movie' : 'tv';
      try {
        const images = await tmdb(`/${kind}/${t.tmdb_id}/images`, { include_image_language: 'en,null' });
        if (!images) { failed++; return; }
        const [path, poster] = heroOf({ images });
        if (path) { if (poster) posters++; else backdrops++; }
        if (path !== t.hero_path) { await db.query('update public.titles set hero_path = $2, hero_poster = $3 where id = $1', [t.id, path, poster]); changed++ }
      } catch (e) { failed++; if (failed <= 5) log(`  ${kind}:${t.tmdb_id} failed:`, e.message) }
      if (++done % 4000 === 0) log(`  ${done} of ${all.length} read, ${changed} changed`);
    });
    log(`title pictures: ${all.length} titles, ${posters} textless posters, ${backdrops} backdrops, ${all.length - posters - backdrops - failed} with neither (fall back); ${changed} changed${failed ? `, ${failed} failed` : ''}`);
    await stamp();
    await db.end();
    return;
  }
  // SYNC_ONLY=collection: which series of films each well-known film belongs to (TMDB's collections), once
  if (ONLY === 'collection') {
    log('film series only');
    const all = (await db.query(`select id, tmdb_id, collection_id from public.titles where kind = 'film' and imdb_votes >= 10000 order by popularity desc`)).rows;
    let done = 0, changed = 0, failed = 0, inOne = 0;
    await pool(all, 8, async (t) => {
      try {
        const d = await tmdb(`/movie/${t.tmdb_id}`, {});
        if (!d) { failed++; return; }
        const c = d.belongs_to_collection?.id ?? null;
        if (c) inOne++;
        if (c !== t.collection_id) { await db.query('update public.titles set collection_id = $2 where id = $1', [t.id, c]); changed++ }
      } catch (e) { failed++; if (failed <= 5) log(`  movie:${t.tmdb_id} failed:`, e.message) }
      if (++done % 2000 === 0) log(`  ${done} of ${all.length} read`);
    });
    log(`film series: ${all.length} films, ${inOne} in a series; ${changed} changed${failed ? `, ${failed} failed` : ''}`);
    await db.query('select public.refresh_start_wall()'); // the Start wall shows one film per series
    await stamp();
    await db.end();
    return;
  }
  if (ONLY === 'notable') {
    log('notable titles only');
    await syncNotable();
    await syncAwards().catch((e) => log('awards failed:', e.message)); // the new titles' awards
    await stamp();
    await db.end();
    return;
  }
  // SYNC_ONLY=standup: which titles are stand-up (the Stand-up workflow); the nightly sync does it on Sundays
  if (ONLY === 'standup') {
    log('stand-up only');
    await syncStandup();
    await stamp();
    await db.end();
    return;
  }
  if (ONLY === 'awards') {
    log('awards only');
    await syncAwards();
    if (!process.env.AWARDS_DRY) await stamp();
    await db.end();
    return;
  }
  if (ONLY === 'scores') {
    log('scores only');
    await syncMdblist();
    await syncOmdb().catch((e) => log('OMDb failed:', e.message));
    log('scores now:', JSON.stringify((await db.query(COUNTS)).rows[0]));
    // Rotten Tomatoes: how many titles have both scores, and how many only one (with examples to check by hand)
    const rt = (await db.query(
      `select count(*) filter (where rt_critics is not null and rt_audience is not null) both_scores,
              count(*) filter (where rt_critics is not null and rt_audience is null) only_critics,
              count(*) filter (where rt_critics is null and rt_audience is not null) only_audience from public.scores`)).rows[0];
    log('Rotten Tomatoes:', JSON.stringify(rt));
    for (const [label, cond] of [['only audience', 'rt_critics is null and rt_audience is not null'], ['only critics', 'rt_critics is not null and rt_audience is null']]) {
      const ex = (await db.query(
        `select t.title, t.year, t.kind, t.imdb_id, s.rt_critics, s.rt_audience from public.scores s join public.titles t on t.id = s.title_id
         where ${cond} order by t.popularity desc nulls last limit 8`)).rows;
      log(`  ${label}, most popular:`, ex.map((r) => `${r.title} (${r.year}, ${r.kind}, ${r.imdb_id}) ${r.rt_critics ?? '–'}/${r.rt_audience ?? '–'}`).join(' · '));
    }
    await stamp();
    await db.end();
    return;
  }
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
  // known titles due by their tier (new first); and, once, this and last year's titles that don't have their
  // release day yet, so their tier is right from the next night
  const knownSet = new Set(known);
  const due = REFRESH_ALL ? known : (await db.query(
    `select case t.kind when 'film' then 'movie' else 'tv' end || ':' || t.tmdb_id as key
     from public.titles t join public.title_refresh r on r.title_id = t.id
     where t.synced_at < now() - public.refresh_every(r.tier, 'details') + interval '3 hours'
        or (t.released_on is null and t.year >= extract(year from current_date) - 1 and t.synced_at < '2026-11-24')
     order by (t.released_on is null and t.year >= extract(year from current_date) - 1) desc,
              case r.tier when 'new' then 0 when 'recent' then 1 else 2 end, t.synced_at`,
  )).rows.map((r) => r.key).filter((k) => knownSet.has(k));
  const stale = due.slice(0, FULL ? REFRESH_PER_RUN : LIMIT);
  log(`titles: ${keys.length} streaming, ${fresh.length} new, ${stale.length} of ${due.length} due (of ${known.length} known) refreshed`);
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
  // From here on each source is on its own: one that is down (Streaming Availability answered 502 on 24 Nov) is
  // logged and the sync carries on, keeping what that source gave last time.
  const saUsed = await syncLeavingDates().catch((e) => { log('leaving dates failed:', e.message); return SA_BUDGET; });
  await saveLinks().catch((e) => log('saving links failed:', e.message)); // what the leaving-dates list carried
  // a failure here never fails the sync: the app falls back to the service's search
  await syncLinks(Math.max(0, Math.min(SA_LINK_REQUESTS, SA_BUDGET - saUsed))).catch((e) => log('links failed:', e.message));
  await syncImdbRatings().catch((e) => log('IMDb ratings failed:', e.message));
  await syncMdblist().catch((e) => log('MDBList failed:', e.message));
  await syncOmdb().catch((e) => log('OMDb failed:', e.message));
  // a failure here never fails the sync
  if (FULL) await syncLetterboxd().catch((e) => log('Letterboxd failed:', e.message));
  if (FULL) await syncTrending().catch((e) => log('trending failed:', e.message));
  if (FULL) await syncRecs().catch((e) => log('recommendations failed:', e.message));
  if (FULL) await syncSimilar().catch((e) => log('similar failed:', e.message));
  if (FULL && new Date().getUTCDay() === 0) await syncNotable().catch((e) => log('notable failed:', e.message));
  if (FULL && new Date().getUTCDay() === 0) await syncAwards().catch((e) => log('awards failed:', e.message));
  if (FULL && new Date().getUTCDay() === 0) await syncStandup().catch((e) => log('stand-up failed:', e.message));
  if (FULL) await reconcile(runStart);
  // the Start screen's poster wall, made once a night (public.start_wall reads it)
  if (FULL) await db.query('select public.refresh_start_wall()').catch((e) => log('start wall failed:', e.message));
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
  await stamp();
  await db.end();
}

main().catch(async (e) => {
  console.error(e);
  try { await db.end(); } catch {}
  process.exit(1);
});
