// Nightly catalogue sync for Reelay. Runs in GitHub Actions (see .github/workflows/nightly-sync.yml).
//
// 1. Services: map TMDB's Swedish providers to ours.
// 2. Titles: everything streaming in Sweden on our services (TMDB discover), with details,
//    cast and crew, and where it streams (TMDB watch providers, data from JustWatch).
// 3. Leaving dates: Streaming Availability's list of titles leaving in Sweden.
// 4. Scores: IMDb's daily ratings file, then MDBList for Rotten Tomatoes and Letterboxd.
// 5. Full runs only: titles that are no longer streaming lose their rows, and "added"/"left"
//    events are written by comparing with the night before.
//
// SYNC_LIMIT > 0 runs a test on that many titles (no deletions, no events).

import pg from 'pg';
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
const SA_PAGES = Number(process.env.SA_PAGES || 10);
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
async function discover(providerMap) {
  const seen = new Map(); // key "movie:123" -> popularity
  for (const kind of ['movie', 'tv']) {
    for (const [svc, pid] of Object.entries(providerMap)) {
      for (let page = 1; page <= 500; page++) {
        const r = await tmdb(`/discover/${kind}`, {
          watch_region: 'SE',
          with_watch_providers: String(pid),
          with_watch_monetization_types: 'flatrate|free|ads',
          sort_by: 'popularity.desc',
          include_adult: 'false',
          page: String(page),
        });
        for (const t of r?.results ?? []) {
          const key = `${kind}:${t.id}`;
          if (!seen.has(key)) seen.set(key, t.popularity ?? 0);
        }
        if (!r || page >= r.total_pages) break;
        if (!FULL && page >= 1) break; // test runs: first page per service is plenty
      }
      if (FULL) log(`  discovered ${kind} on ${svc}: total so far ${seen.size}`);
    }
  }
  let keys = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (!FULL) keys = keys.slice(0, LIMIT);
  log('titles to sync:', keys.length);
  return keys;
}

const tmdbToService = (providerMap) => {
  const inv = new Map(Object.entries(providerMap).map(([k, v]) => [v, k]));
  return (pid) => inv.get(pid);
};

function seRating(kind, d) {
  if (kind === 'movie') {
    const se = d.release_dates?.results?.find((r) => r.iso_3166_1 === 'SE');
    return se?.release_dates?.map((x) => x.certification).find(Boolean) || null;
  }
  return d.content_ratings?.results?.find((r) => r.iso_3166_1 === 'SE')?.rating || null;
}

async function fetchTitle(key) {
  const [kind, id] = key.split(':');
  const append = ['external_ids', 'watch/providers', 'images', kind === 'movie' ? 'credits,release_dates' : 'aggregate_credits,content_ratings'].join(',');
  const d = await tmdb(`/${kind}/${id}`, { append_to_response: append, include_image_language: 'en,null' });
  return d ? { kind, d } : null;
}

async function upsertPerson(c, p) {
  const r = await c.query(
    `insert into public.people (tmdb_id, name, profile_path, known_for) values ($1,$2,$3,$4)
     on conflict (tmdb_id) do update set name = excluded.name, profile_path = excluded.profile_path,
       known_for = coalesce(excluded.known_for, public.people.known_for)
     returning id`,
    [p.id, p.name, p.profile_path ?? null, p.known_for_department ?? null],
  );
  return r.rows[0].id;
}

async function saveTitle({ kind, d }, svcOf) {
  const film = kind === 'movie';
  const first = film ? d.release_date : d.first_air_date;
  const lastSeason = film ? null : [...(d.seasons ?? [])].filter((s) => s.season_number > 0 && s.air_date).sort((a, b) => b.season_number - a.season_number)[0];
  const logo = d.images?.logos?.find((l) => l.iso_639_1 === 'en') ?? d.images?.logos?.[0];
  const row = [
    d.id, film ? 'film' : 'series',
    d.external_ids?.imdb_id || d.imdb_id || null,
    d.external_ids?.wikidata_id || null,
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
  const c = await db.connect();
  await c.query('begin');
  try {
    const t = await c.query(
      `insert into public.titles (tmdb_id, kind, imdb_id, wikidata_id, title, original_title, year, end_year,
         runtime_min, seasons, last_season_on, overview, genres, original_language, countries, age_rating,
         poster_path, backdrop_path, logo_path, popularity, keep_reason, synced_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'streaming', now())
       on conflict (tmdb_id, kind) do update set
         imdb_id = excluded.imdb_id, wikidata_id = excluded.wikidata_id, title = excluded.title,
         original_title = excluded.original_title, year = excluded.year, end_year = excluded.end_year,
         runtime_min = excluded.runtime_min, seasons = excluded.seasons, last_season_on = excluded.last_season_on,
         overview = excluded.overview, genres = excluded.genres, original_language = excluded.original_language,
         countries = excluded.countries, age_rating = excluded.age_rating, poster_path = excluded.poster_path,
         backdrop_path = excluded.backdrop_path, logo_path = excluded.logo_path, popularity = excluded.popularity,
         keep_reason = 'streaming', synced_at = now()
       returning id`,
      row,
    );
    const titleId = t.rows[0].id;

    // Cast and crew: top 10 cast, plus directors (films) or creators (series).
    await c.query('delete from public.credits where title_id = $1', [titleId]);
    const cast = film
      ? (d.credits?.cast ?? []).slice(0, 10).map((c) => ({ p: c, role: 'cast', character: c.character, order: c.order }))
      : (d.aggregate_credits?.cast ?? []).slice(0, 10).map((c, i) => ({ p: c, role: 'cast', character: c.roles?.[0]?.character, order: i }));
    const crew = film
      ? (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c, i) => ({ p: c, role: 'director', order: i }))
      : (d.created_by ?? []).map((c, i) => ({ p: { ...c, known_for_department: 'Writing' }, role: 'creator', order: i }));
    for (const cr of [...cast, ...crew]) {
      const pid = await upsertPerson(c, cr.p);
      await c.query(
        `insert into public.credits (title_id, person_id, role, character, sort_order) values ($1,$2,$3,$4,$5)
         on conflict do nothing`,
        [titleId, pid, cr.role, cr.character || null, cr.order ?? 0],
      );
    }

    // Where it streams in Sweden.
    const se = d['watch/providers']?.results?.SE ?? {};
    const offers = new Map();
    for (const [bucket, type] of [['flatrate', 'subscription'], ['free', 'free'], ['ads', 'free']]) {
      for (const p of se[bucket] ?? []) {
        const svc = svcOf(p.provider_id);
        if (svc && !offers.has(svc)) offers.set(svc, type);
      }
    }
    for (const [svc, type] of offers) {
      await c.query(
        `insert into public.availability (title_id, service_id, type, seen_at) values ($1,$2,$3, now())
         on conflict (title_id, service_id) do update set type = excluded.type, seen_at = now()`,
        [titleId, svc, type],
      );
    }
    await c.query('commit');
    return { titleId, services: [...offers.keys()] };
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------------------
// 3. Leaving dates (Streaming Availability)
// ---------------------------------------------------------------------------
async function syncLeavingDates() {
  const key = env('STREAMING_AVAILABILITY_KEY', false);
  if (!key) return log('leaving dates: no key, skipped');
  const host = 'streaming-availability.p.rapidapi.com';
  const headers = { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host };
  const svc = Object.fromEntries((await db.query('select id, sa_service_id from public.services where sa_service_id is not null')).rows.map((r) => [r.sa_service_id, r.id]));
  let cursor = '';
  let matched = 0, seen = 0;
  const found = new Map(); // "titleId|service" -> date
  for (let page = 0; page < SA_PAGES; page++) {
    const q = new URLSearchParams({ country: 'se', change_type: 'expiring', item_type: 'show', output_language: 'en' });
    if (cursor) q.set('cursor', cursor);
    const r = await getJson(`https://${host}/changes?${q}`, headers);
    if (!r) break;
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
    if (!r.hasMore) break;
    cursor = r.nextCursor;
  }
  for (const [k, day] of found) {
    const [titleId, service] = k.split('|');
    const u = await db.query('update public.availability set leaves_on = $3 where title_id = $1 and service_id = $2', [titleId, service, day]);
    matched += u.rowCount;
  }
  // Dates that have passed are no longer "leaving".
  await db.query('update public.availability set leaves_on = null where leaves_on < current_date');
  log(`leaving dates: ${seen} changes read, ${matched} matched to our titles`);
}

// ---------------------------------------------------------------------------
// 4. Scores
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
  let ok = 0, sample = null;
  await pool(todo.map((t) => ({ ...t, key: t.imdb_id })), 4, async (t) => {
    const r = await getJson(`https://api.mdblist.com/imdb/${t.kind === 'film' ? 'movie' : 'show'}/${t.imdb_id}?apikey=${key}`);
    if (!r) return;
    sample ??= r.ratings;
    const by = Object.fromEntries((r.ratings ?? []).map((x) => [x.source, x.value]));
    const rt = by.tomatoes ?? null;
    const lb = t.kind === 'film' ? by.letterboxd ?? null : null;
    await db.query(
      `insert into public.scores (title_id, rt_critics, letterboxd, mdblist_synced_at) values ($1,$2,$3, now())
       on conflict (title_id) do update set rt_critics = excluded.rt_critics, letterboxd = excluded.letterboxd, mdblist_synced_at = now()`,
      [t.id, rt == null ? null : Math.round(rt), lb],
    );
    ok++;
  });
  log(`MDBList: ${ok} of ${todo.length} titles updated`);
  if (sample) log('  sample ratings:', JSON.stringify(sample).slice(0, 400));
}

// ---------------------------------------------------------------------------
// 5. Full runs: drop what's gone, record added/left
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
  const kept = await db.query(
    `update public.titles t set keep_reason = case
       when exists (select 1 from public.watchlist w where w.title_id = t.id) then 'saved'
       when exists (select 1 from public.awards a where a.title_id = t.id) then 'award' else keep_reason end
     where not exists (select 1 from public.availability a where a.title_id = t.id) and keep_reason = 'streaming'`,
  );
  await db.query(`delete from public.availability_events where happened_on < current_date - 90`);
  await db.query(`delete from public.tmdb_search_cache where fetched_at < now() - interval '1 day'`);
  // Invites: joined or expired ones leave the Sent list after 30 days.
  await db.query(`delete from public.invites where coalesce(joined_at, expires_at) < now() - interval '30 days'`);
  log(`events: ${added.rowCount} added, ${left.rowCount} left; ${kept.rowCount} titles no longer streaming`);
}

// ---------------------------------------------------------------------------
async function main() {
  const runStart = new Date();
  log(FULL ? 'full sync' : `test sync, ${LIMIT} titles`);
  const providerMap = await syncServices();
  const svcOf = tmdbToService(providerMap);
  const keys = await discover(providerMap);
  let done = 0;
  const results = await pool(keys.map((key) => ({ key })), 8, async ({ key }) => {
    const t = await fetchTitle(key);
    if (!t) return null;
    const r = await saveTitle(t, svcOf);
    if (++done % 500 === 0) log(`  ${done} titles saved`);
    return r;
  });
  const saved = results.filter(Boolean);
  const perService = {};
  for (const r of saved) for (const s of r.services) perService[s] = (perService[s] ?? 0) + 1;
  log(`titles saved: ${saved.length}; by service: ${JSON.stringify(perService)}`);
  await syncLeavingDates();
  await syncImdbRatings();
  await syncMdblist();
  if (FULL) await reconcile(runStart);
  const counts = (await db.query(
    `select (select count(*) from public.titles) titles, (select count(*) from public.people) people,
            (select count(*) from public.availability) availability,
            (select count(*) from public.availability where leaves_on is not null) leaving,
            (select count(*) from public.scores where imdb_rating is not null) imdb,
            (select count(*) from public.scores where rt_critics is not null) rt,
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
