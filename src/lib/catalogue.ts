// Reads the catalogue (titles, where they stream, scores, cast) and the user's watchlist.
import { supabase } from './supabase'

// link: the whole link, before links were stored in two parts (kept readable until that database change is live)
export type Avail = { service_id: string; leaves_on: string | null; type?: string; link_path?: string | null; link?: string | null; service?: { link_base?: string | null } | null }
export type Card = {
  id: number
  kind: 'film' | 'series'
  title: string
  year: number | null
  poster_path: string | null
  backdrop_path?: string | null
  logo_path?: string | null
  genres?: string[]
  seasons?: number | null
  availability: Avail[]
}
export type Row = { id: string; title: string; items: Card[]; notes?: 'leaving' }
export type NowData = { hero: Card[]; rows: Row[] }

const CARD = 'id,kind,title,year,poster_path,availability!inner(service_id,leaves_on)'
const HERO = 'id,kind,title,year,poster_path,backdrop_path,logo_path,genres,seasons,availability!inner(service_id,leaves_on)'

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const today = () => new Date().toISOString().slice(0, 10)
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

// Now mixes films and series, and recent titles with classics, so popularity alone (which favours
// long-running series) doesn't fill the page. A title is shown once: rows skip anything already above them.
const YEAR = new Date().getFullYear()
const RECENT_FROM = YEAR - 4 // the last five years
const CLASSIC_TO = YEAR - 15 // fifteen years and older

type Kind = Card['kind']
type Bucket = { kind: Kind; from?: number; to?: number }
const BOTH: Bucket[] = [{ kind: 'film' }, { kind: 'series' }]
const MIXED: Bucket[] = [
  { kind: 'film', from: RECENT_FROM }, { kind: 'series', from: RECENT_FROM },
  { kind: 'film', to: CLASSIC_TO }, { kind: 'series', to: CLASSIC_TO },
]

/** Round robin over the buckets, skipping titles already on the page, until the row is full. */
function interleave(lists: Card[][], seen: Set<number>, max = 20): Card[] {
  const out: Card[] = []
  const at = lists.map(() => 0)
  while (out.length < max && lists.some((l, i) => at[i] < l.length)) {
    lists.forEach((l, i) => {
      while (at[i] < l.length && out.length < max) {
        const t = l[at[i]++]
        if (seen.has(t.id)) continue
        seen.add(t.id)
        out.push(t)
        break
      }
    })
  }
  return out
}

type Filter = { genresAny?: string[]; genresAll?: string[]; from?: number; to?: number }

async function cards(b: Bucket, f: Filter, limit: number): Promise<Card[]> {
  let q = supabase.from('titles').select(CARD).eq('kind', b.kind)
  const from = Math.max(b.from ?? -Infinity, f.from ?? -Infinity)
  const to = Math.min(b.to ?? Infinity, f.to ?? Infinity)
  if (Number.isFinite(from)) q = q.gte('year', from)
  if (Number.isFinite(to)) q = q.lte('year', to)
  if (f.genresAny) q = q.overlaps('genres', f.genresAny)
  if (f.genresAll) q = q.contains('genres', f.genresAll)
  return unwrap((await q.order('popularity', { ascending: false }).limit(limit)) as never)
}

async function rated(b: Bucket): Promise<Card[]> {
  const recent = b.from !== undefined
  let q = supabase.from('titles').select(`${CARD},scores!inner(imdb_rating,imdb_votes)`).eq('kind', b.kind)
    .gte('scores.imdb_votes', recent ? 20000 : 50000)
  q = recent ? q.gte('year', RECENT_FROM) : q.lt('year', RECENT_FROM)
  return unwrap((await q.order('scores(imdb_rating)', { ascending: false }).limit(15)) as never)
}

const RATED: Bucket[] = [
  { kind: 'film', from: RECENT_FROM }, { kind: 'series', from: RECENT_FROM }, { kind: 'film' }, { kind: 'series' },
]

export async function loadNow(): Promise<NowData> {
  const heroQ = (kind: Kind) => supabase.from('titles').select(HERO).eq('kind', kind)
    .not('backdrop_path', 'is', null).not('logo_path', 'is', null).order('popularity', { ascending: false }).limit(6)
  const all = (buckets: Bucket[], f: Filter, limit: number) => Promise.all(buckets.map((b) => cards(b, f, limit)))

  const [heroFilm, heroSeries, leaving, ratedLists, d2000, d90, crime, comedy, drama] = await Promise.all([
    heroQ('film'), heroQ('series'),
    supabase.from('availability').select(`leaves_on,title:titles!inner(${CARD})`).gte('leaves_on', today()).lte('leaves_on', inDays(30)).order('leaves_on').limit(40),
    Promise.all(RATED.map(rated)),
    all(BOTH, { from: 2000, to: 2009 }, 25),
    all(BOTH, { from: 1990, to: 1999 }, 25),
    all(MIXED, { genresAll: ['Crime'] }, 15),
    all(MIXED, { genresAll: ['Comedy'] }, 15),
    all(MIXED, { genresAll: ['Drama'] }, 15),
  ])

  const seen = new Set<number>()
  const hero = interleave([unwrap(heroFilm as never), unwrap(heroSeries as never)], seen, 5)

  // Leaving soon is a list of facts, so it keeps every title, and marks them as shown for the rows below.
  const inLeaving = new Set<number>()
  const leavingCards = (unwrap(leaving as never) as { title: Card }[])
    .map((r) => r.title)
    .filter((t) => t && !inLeaving.has(t.id) && inLeaving.add(t.id))
    .slice(0, 20)
  leavingCards.forEach((t) => seen.add(t.id))

  const rows: Row[] = [
    { id: 'leaving', title: 'Leaving soon', items: leavingCards, notes: 'leaving' },
    { id: 'rated', title: 'Highest rated', items: interleave(ratedLists, seen) },
    { id: '2000s', title: '2000s', items: interleave(d2000, seen) },
    { id: '90s', title: '90s', items: interleave(d90, seen) },
    { id: 'crime', title: 'Crime', items: interleave(crime, seen) },
    { id: 'comedy', title: 'Comedy', items: interleave(comedy, seen) },
    { id: 'drama', title: 'Drama', items: interleave(drama, seen) },
  ]
  return { hero, rows: rows.filter((r) => r.items.length >= 3) }
}

export type Person = { id: number; name: string; profile_path: string | null }
export type Credit = { role: 'cast' | 'director' | 'creator' | 'writer'; character: string | null; sort_order: number; person: Person }
export type Award = { id: number; award: string; year: number; short_category: string; won: boolean; person_name: string | null; rank: number }
export type TitleDetail = Omit<Card, 'availability' | 'genres'> & {
  tmdb_id: number
  original_title: string | null
  end_year: number | null
  runtime_min: number | null
  overview: string | null
  original_language: string | null
  genres: string[]
  availability: (Avail & { service: { name: string; kind: string } | null })[]
  scores: { imdb_rating: number | null; rt_critics: number | null; rt_audience?: number | null; letterboxd: number | null } | null
  credits: Credit[]
  awards: Award[]
  more: Card[]
}

export async function loadTitle(id: number): Promise<TitleDetail | null> {
  const title = unwrap(await supabase.from('titles').select(
    'id,tmdb_id,kind,title,original_title,year,end_year,runtime_min,seasons,overview,genres,original_language,poster_path,backdrop_path,logo_path,' +
    'availability(*,service:services(*)),' +
    'scores(imdb_rating,rt_critics,rt_audience,letterboxd),' +
    'credits(role,character,sort_order,person:people(id,name,profile_path)),' +
    'awards(id,award,year,short_category,won,person_name,rank)',
  ).eq('id', id).maybeSingle()) as unknown as (Omit<TitleDetail, 'more'>) | null
  if (!title) return null
  let more: Card[] = []
  if (title.genres.length) {
    more = (unwrap(await supabase.from('titles').select(CARD).contains('genres', [title.genres[0]]).eq('kind', title.kind)
      .neq('id', id).order('popularity', { ascending: false }).limit(12)) as unknown as Card[])
  }
  title.credits.sort((a, b) => a.sort_order - b.sort_order)
  title.awards.sort((a, b) => Number(b.won) - Number(a.won) || a.rank - b.rank || b.year - a.year)
  return { ...title, more }
}

// ---- Watchlist -------------------------------------------------------------

export type Saved = { title_id: number; notify: boolean }

export async function loadWatchlist(): Promise<Saved[]> {
  return unwrap(await supabase.from('watchlist').select('title_id,notify')) as Saved[]
}

/** A saved title with what the Watchlist shows about it. */
export type SavedTitle = {
  id: number
  kind: Card['kind']
  title: string
  year: number | null
  poster_path: string | null
  availability: Avail[]
  rating: number | null
  /** Rotten Tomatoes critics (%), Letterboxd (0 to 5) */
  rt?: number | null
  lb?: number | null
  notify: boolean
  added_at: string
  genres?: string[]
  original_language?: string | null
  runtime_min?: number | null
}

export async function loadWatchlistTitles(): Promise<SavedTitle[]> {
  type Sc = { imdb_rating: number | null; rt_critics: number | null; letterboxd: number | null }
  type Raw = { notify: boolean; added_at: string; title: (Omit<SavedTitle, 'rating' | 'rt' | 'lb' | 'notify' | 'added_at'> & { scores: Sc | Sc[] | null }) | null }
  const rows = unwrap(await supabase.from('watchlist')
    .select('notify,added_at,title:titles(id,kind,title,year,poster_path,genres,original_language,runtime_min,availability(service_id,leaves_on),scores(imdb_rating,rt_critics,letterboxd))')
    .order('added_at', { ascending: false }) as never) as Raw[]
  return rows.filter((r) => r.title).map((r) => {
    const { scores, ...t } = r.title!
    const score = Array.isArray(scores) ? scores[0] : scores
    return { ...t, availability: t.availability ?? [], rating: score?.imdb_rating ?? null, rt: score?.rt_critics ?? null, lb: score?.letterboxd ?? null, notify: r.notify, added_at: r.added_at }
  })
}

/** The services someone has picked as theirs. Empty until Your services is set up: then every service counts. */
export async function loadMyServices(): Promise<string[]> {
  return (unwrap(await supabase.from('user_services').select('service_id')) as { service_id: string }[]).map((r) => r.service_id)
}

/** Posters to pick from when the Watchlist is empty: recent and classic films and series, mixed. */
export async function loadPicks(): Promise<Card[]> {
  const lists = await Promise.all(MIXED.map((b) => cards(b, {}, 15)))
  return interleave(lists, new Set(), 49)
}

/**
 * Onboarding's wall of posters: the most popular titles of each given service, laid out for six columns so that
 * any few neighbouring rows hold every service (slot (row, column) takes service (column + 3 × row) mod n).
 * Each card's `availability` holds only the service it stands for.
 */
export async function loadWall(serviceIds: string[], rows = 6, cols = 6): Promise<Card[]> {
  const n = serviceIds.length
  if (!n) return []
  const lists = await Promise.all(serviceIds.map(async (s) => unwrap((await supabase.from('titles').select(CARD)
    .eq('availability.service_id', s).not('poster_path', 'is', null).order('popularity', { ascending: false }).limit(24)) as never) as Card[]))
  const seen = new Set<number>()
  const next = (i: number): Card | undefined => {
    const l = lists[i]
    while (l.length) { const c = l.shift()!; if (!seen.has(c.id)) { seen.add(c.id); return c } }
  }
  const out: Card[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const want = (c + 3 * r) % n
    // a service that runs out lends its slot to the next one that still has titles
    let card: Card | undefined
    for (let k = 0; k < n && !card; k++) card = next((want + k) % n)
    if (card) out.push(card)
  }
  return out
}

// ---- Invites (admins) ------------------------------------------------------

export type Invite = {
  id: string; token: string; created_by: string | null; make_admin: boolean; created_at: string; expires_at: string
  used_by: string | null; used_email: string | null; used_at: string | null; joined_at: string | null
}

export const inviteState = (inv: Invite): 'waiting' | 'joined' | 'expired' =>
  inv.joined_at ? 'joined' : new Date(inv.expires_at) <= new Date() ? 'expired' : 'waiting'

export async function loadInvites(): Promise<Invite[]> {
  return unwrap(await supabase.from('invites').select('*').order('created_at', { ascending: false })) as Invite[]
}
export async function createInvite(): Promise<Invite> {
  return unwrap(await supabase.rpc('create_invite')) as Invite
}
export async function cancelInvite(id: string) {
  unwrap(await supabase.rpc('cancel_invite', { invite_id: id }))
}
export async function restoreInvite(inv: Invite) {
  unwrap(await supabase.rpc('restore_invite', { inv }))
}

/** "18 Nov" */
export function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

export async function saveTitle(userId: string, titleId: number, notify: boolean) {
  unwrap(await supabase.from('watchlist').upsert({ user_id: userId, title_id: titleId, notify, updated_at: new Date().toISOString() }))
}

export async function unsaveTitle(userId: string, titleId: number) {
  unwrap(await supabase.from('watchlist').delete().eq('user_id', userId).eq('title_id', titleId))
}

// ---- Words -----------------------------------------------------------------

export const SERVICE_NAME: Record<string, string> = {
  netflix: 'Netflix', 'hbo-max': 'HBO Max', 'svt-play': 'SVT Play', viaplay: 'Viaplay', 'disney-plus': 'Disney+',
  'prime-video': 'Prime Video', 'apple-tv': 'Apple TV', skyshowtime: 'SkyShowtime', 'tv4-play': 'TV4 Play',
  mubi: 'MUBI', crunchyroll: 'Crunchyroll', curiosity: 'Curiosity Stream', 'pluto-tv': 'Pluto TV',
}

// Where "Open in" goes when the catalogue has no direct link: the service's own search for the title.
const SERVICE_SEARCH: Record<string, string> = {
  netflix: 'https://www.netflix.com/search?q=', 'hbo-max': 'https://play.hbomax.com/search?q=',
  'svt-play': 'https://www.svtplay.se/sok?q=', viaplay: 'https://viaplay.se/search?query=',
  'disney-plus': 'https://www.disneyplus.com/search?q=', 'prime-video': 'https://www.primevideo.com/search/?phrase=',
  'apple-tv': 'https://tv.apple.com/se/search?term=', skyshowtime: 'https://www.skyshowtime.com/se/search?q=',
  'tv4-play': 'https://www.tv4play.se/sok?q=', mubi: 'https://mubi.com/en/search/films?query=',
  crunchyroll: 'https://www.crunchyroll.com/search?q=', curiosity: 'https://curiositystream.com/search/',
  'pluto-tv': 'https://pluto.tv/search/details?query=',
}

export function openLink(a: Avail, title: string): string {
  // the title's own part after the service's base; a whole link is kept as it is
  const p = a.link_path ?? a.link
  if (p) return p.startsWith('https://') ? p : (a.service?.link_base ?? '') + p
  return (SERVICE_SEARCH[a.service_id] ?? 'https://www.google.com/search?q=') + encodeURIComponent(title)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function leavingNote(date: string | null | undefined): string | null {
  if (!date) return null
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')) / 864e5)
  if (days < 0) return null
  if (days === 0) return 'Leaves today'
  if (days === 1) return 'Leaves tomorrow'
  if (days <= 14) return `Leaves in ${days} days`
  const d = new Date(date + 'T00:00:00Z')
  return `Leaves ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export const kindWord = (kind: Card['kind']) => (kind === 'film' ? 'Film' : 'Series')

export function runtime(min: number | null): string | null {
  if (!min) return null
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
}
