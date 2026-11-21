// Search: what the words mean (filters such as a service, a decade or a genre) and the lookups behind the screen.
import { supabase } from './supabase'

export type Hit = {
  id: number
  kind: 'film' | 'series'
  title: string
  year: number | null
  poster_path: string | null
  /** services it streams on now, best first */
  services: string[]
  leaves: string | null
  rating: number | null
  genres: string[]
  lang: string | null
  runtime: number | null
}

export type Filters = {
  kind?: Hit['kind']
  service?: string
  from?: number
  to?: number
  genres?: string[]
  lang?: string
  leaving?: boolean
  /** from the filter drawer */
  minRating?: number
  length?: 'short' | 'mid' | 'long' // under 90 min, up to 2 h, over 2 h
  services?: string[]
}

/** A word in the query that became a filter chip. */
export type Token = { key: string; label: string; filter: Filters }

const SERVICES: [RegExp, string, string][] = [
  [/\b(?:on |på )?netflix\b/, 'netflix', 'Netflix'],
  [/\b(?:on |på )?(?:hbo max|hbo|max)\b/, 'hbo-max', 'HBO Max'],
  [/\b(?:on |på )?viaplay\b/, 'viaplay', 'Viaplay'],
  [/\b(?:on |på )?disney(?:\+| plus)?(?=\s|$)/, 'disney-plus', 'Disney+'],
  [/\b(?:on |på )?(?:prime video|amazon prime|prime|amazon)\b/, 'prime-video', 'Prime Video'],
  [/\b(?:on |på )?apple(?: tv)?\+?(?=\s|$)/, 'apple-tv', 'Apple TV'],
  [/\b(?:on |på )?sky ?showtime\b/, 'skyshowtime', 'SkyShowtime'],
  [/\b(?:on |på )?svt(?: play)?\b/, 'svt-play', 'SVT Play'],
  [/\b(?:on |på )?tv4(?: play)?\b/, 'tv4-play', 'TV4 Play'],
  [/\b(?:on |på )?mubi\b/, 'mubi', 'MUBI'],
]

// TMDB's genre names; series use a few combined ones.
const GENRES: [RegExp, string, string[]][] = [
  [/\b(?:crime|krim|deckare)\b/, 'Crime', ['Crime']],
  [/\b(?:comedy|comedies|komedi|komedier)\b/, 'Comedy', ['Comedy']],
  [/\b(?:drama|dramas)\b/, 'Drama', ['Drama']],
  [/\b(?:thrillers?)\b/, 'Thriller', ['Thriller']],
  [/\b(?:horror|skräck)\b/, 'Horror', ['Horror']],
  [/\b(?:documentary|documentaries|dokumentär|dokumentärer)\b/, 'Documentary', ['Documentary']],
  [/\b(?:animation|animated|animerat)\b/, 'Animation', ['Animation']],
  [/\b(?:romance|romantic|romantik)\b/, 'Romance', ['Romance']],
  [/\b(?:sci-?fi|science fiction)\b/, 'Sci-fi', ['Science Fiction', 'Sci-Fi & Fantasy']],
  [/\b(?:fantasy)\b/, 'Fantasy', ['Fantasy', 'Sci-Fi & Fantasy']],
  [/\b(?:action)\b/, 'Action', ['Action', 'Action & Adventure']],
  [/\b(?:family|familj)\b/, 'Family', ['Family', 'Kids']],
  [/\b(?:war|krig)\b/, 'War', ['War', 'War & Politics']],
  [/\b(?:westerns?)\b/, 'Western', ['Western']],
  [/\b(?:mystery|mysteries)\b/, 'Mystery', ['Mystery']],
  [/\b(?:history|historical)\b/, 'History', ['History']],
  [/\b(?:reality)\b/, 'Reality', ['Reality']],
]

const LANGS: [RegExp, string, string][] = [
  [/\b(?:swedish|svensk|svenska)\b/, 'sv', 'Swedish'], [/\b(?:danish|dansk|danska)\b/, 'da', 'Danish'],
  [/\b(?:norwegian|norsk|norska)\b/, 'no', 'Norwegian'], [/\b(?:finnish|finsk|finska)\b/, 'fi', 'Finnish'],
  [/\b(?:korean)\b/, 'ko', 'Korean'], [/\b(?:japanese)\b/, 'ja', 'Japanese'], [/\b(?:french)\b/, 'fr', 'French'],
  [/\b(?:spanish)\b/, 'es', 'Spanish'], [/\b(?:german)\b/, 'de', 'German'], [/\b(?:italian)\b/, 'it', 'Italian'],
]

const DECADE = /\b(19|20)?([0-9])0(?:s|'s|-?talet|-?tal)(?=\s|$)/
const YEAR = /\b(19[2-9]\d|20[0-3]\d)\b/

/** Split what was typed into filter chips and the words left to match against names. */
export function parseQuery(typed: string): { tokens: Token[]; rest: string } {
  let rest = typed.toLowerCase().replace(/\s+/g, ' ').trim()
  const tokens: Token[] = []
  const take = (re: RegExp, token: (m: RegExpExecArray) => Token | null) => {
    const m = re.exec(rest)
    if (!m) return
    const t = token(m)
    if (!t) return
    tokens.push(t)
    rest = (rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim()
  }
  for (const [re, id, name] of SERVICES) {
    if (tokens.some((t) => t.filter.service)) break
    take(re, () => ({ key: `service:${id}`, label: `On ${name}`, filter: { service: id } }))
  }
  take(/\b(?:leaving soon|leaving|last chance)\b/, () => ({ key: 'leaving', label: 'Leaving soon', filter: { leaving: true } }))
  take(/\b(?:films?|movies?|filmer)\b/, () => ({ key: 'kind', label: 'Films', filter: { kind: 'film' } }))
  if (!tokens.some((t) => t.key === 'kind')) take(/\b(?:series|shows?|tv|serier|serie)\b/, () => ({ key: 'kind', label: 'Series', filter: { kind: 'series' } }))
  take(DECADE, (m) => {
    const century = m[1] ? Number(m[1]) : Number(m[2]) >= 3 ? 19 : 20
    const from = century * 100 + Number(m[2]) * 10
    return { key: 'years', label: `${m[1] ? from : String(from).slice(2)}s`, filter: { from, to: from + 9 } }
  })
  // a year is only a filter next to other words: "1917" alone is a title
  if (!tokens.some((t) => t.key === 'years') && rest.replace(YEAR, '').trim()) {
    take(YEAR, (m) => (Number(m[1]) <= new Date().getFullYear() ? { key: 'years', label: m[1], filter: { from: Number(m[1]), to: Number(m[1]) } } : null))
  }
  for (const [re, label, genres] of GENRES) take(re, () => ({ key: `genre:${label}`, label, filter: { genres } }))
  for (const [re, lang, label] of LANGS) {
    if (tokens.some((t) => t.filter.lang)) break
    take(re, () => ({ key: 'lang', label, filter: { lang } }))
  }
  return { tokens, rest }
}

const merge = (tokens: Token[]): Filters => tokens.reduce<Filters>((f, t) => ({
  ...f, ...t.filter, genres: t.filter.genres ? [...(f.genres ?? []), ...t.filter.genres] : f.genres,
}), {})

// ---- Lookups ----------------------------------------------------------------

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

type Raw = {
  id: number; kind: Hit['kind']; title: string; year: number | null; poster_path: string | null
  genres: string[] | null; original_language: string | null; runtime_min: number | null
  availability: { service_id: string; leaves_on: string | null }[] | null
  scores: { imdb_rating: number | null } | { imdb_rating: number | null }[] | null
}
const FIELDS = 'id,kind,title,year,poster_path,genres,original_language,runtime_min,scores(imdb_rating)'

function toHit(r: Raw): Hit {
  const score = Array.isArray(r.scores) ? r.scores[0] : r.scores
  const av = r.availability ?? []
  return {
    id: r.id, kind: r.kind, title: r.title, year: r.year, poster_path: r.poster_path,
    services: [...new Set(av.map((a) => a.service_id))],
    leaves: av.map((a) => a.leaves_on).filter(Boolean).sort()[0] ?? null,
    rating: score?.imdb_rating ?? null, genres: r.genres ?? [], lang: r.original_language, runtime: r.runtime_min ?? null,
  }
}

function passes(h: Hit, f: Filters): boolean {
  if (f.kind && h.kind !== f.kind) return false
  if (f.service && !h.services.includes(f.service)) return false
  if (f.from !== undefined && (h.year === null || h.year < f.from)) return false
  if (f.to !== undefined && (h.year === null || h.year > f.to)) return false
  if (f.genres && !f.genres.some((g) => h.genres.includes(g))) return false
  if (f.lang && h.lang !== f.lang) return false
  if (f.leaving && !(h.leaves && h.leaves <= inDays(30))) return false
  if (f.services && !h.services.some((s) => f.services!.includes(s))) return false
  if (f.minRating && !(h.rating !== null && h.rating >= f.minRating)) return false
  if (f.length) {
    const m = h.runtime
    if (m === null || (f.length === 'short' ? m >= 90 : f.length === 'mid' ? m > 120 : m <= 120)) return false
  }
  return true
}

/** Names that match the words, streaming titles first (the database's search_titles), with what a row shows. */
async function byName(text: string, max = 60): Promise<Hit[]> {
  const found = unwrap(await supabase.rpc('search_titles', { q: text, max_results: max })) as { id: number }[]
  if (!found.length) return []
  const ids = found.map((r) => r.id)
  const rows = unwrap(await supabase.from('titles').select(`${FIELDS},availability(service_id,leaves_on)`).in('id', ids) as never) as Raw[]
  const byId = new Map(rows.map((r) => [r.id, toHit(r)]))
  return ids.map((id) => byId.get(id)).filter((h): h is Hit => !!h)
}

/** Put the filters on a query of streaming titles (its select must embed availability, and scores for a rating). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function narrow<Q>(query: Q, f: Filters): Q {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q = query as any
  if (f.kind) q = q.eq('kind', f.kind)
  if (f.service) q = q.eq('availability.service_id', f.service)
  if (f.services) q = q.in('availability.service_id', f.services)
  if (f.leaving) q = q.not('availability.leaves_on', 'is', null).lte('availability.leaves_on', inDays(30))
  if (f.from !== undefined) q = q.gte('year', f.from)
  if (f.to !== undefined) q = q.lte('year', f.to)
  if (f.genres) q = q.overlaps('genres', f.genres)
  if (f.lang) q = q.eq('original_language', f.lang)
  if (f.minRating) q = q.gte('scores.imdb_rating', f.minRating)
  if (f.length === 'short') q = q.lt('runtime_min', 90)
  if (f.length === 'mid') q = q.lte('runtime_min', 120)
  if (f.length === 'long') q = q.gt('runtime_min', 120)
  return q as Q
}

/** Streaming titles that fit the filters, most popular first. */
export async function byFilters(f: Filters, max = 60): Promise<Hit[]> {
  const fields = f.minRating ? FIELDS.replace('scores(', 'scores!inner(') : FIELDS
  const q = narrow(supabase.from('titles').select(`${fields},availability!inner(service_id,leaves_on)`), f)
  const rows = unwrap(await q.order('popularity', { ascending: false }).limit(max) as never) as Raw[]
  return rows.map(toHit)
}

export type PersonHit = { id: number; name: string; profile_path: string | null; known_for: string | null }

/** People whose name contains the words; names that start with them first. */
async function people(text: string): Promise<PersonHit[]> {
  const needle = fold(text).replace(/[%_,()]/g, ' ').trim()
  if (needle.length < 3) return []
  const rows = unwrap(await supabase.from('people').select('id,name,profile_path,known_for').ilike('search_text', `%${needle}%`).limit(30)) as PersonHit[]
  const rank = (p: PersonHit) => { const n = fold(p.name); return n === needle ? 0 : n.startsWith(needle) ? 1 : n.split(' ').some((w) => w.startsWith(needle)) ? 2 : 3 }
  return rows.sort((a, b) => rank(a) - rank(b) || (a.profile_path ? 0 : 1) - (b.profile_path ? 0 : 1)).slice(0, 8)
}

/** `kind`: the words asked for films or series. That picks the type pill; it isn't a filter chip. */
export type Found = { hits: Hit[]; tokens: Token[]; people: PersonHit[]; kind?: Hit['kind'] }

// Lookups made again within a few minutes (the same words with other filters, counts in the filter drawer) are reused.
const memo = new Map<string, Promise<unknown>>()
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  let p = memo.get(key) as Promise<T> | undefined
  if (!p) {
    p = run()
    memo.set(key, p)
    p.catch(() => memo.delete(key))
    setTimeout(() => memo.delete(key), 5 * 60 * 1000)
    if (memo.size > 120) memo.delete(memo.keys().next().value!)
  }
  return p
}
const named = (text: string, max: number) => once(`name:${max}:${text.toLowerCase()}`, () => byName(text, max))

const some = (f: Filters) => Object.values(f).some((v) => v !== undefined)
const combine = (f: Filters, extra: Filters): Filters => ({ ...f, ...extra, genres: f.genres && extra.genres ? [...f.genres, ...extra.genres] : extra.genres ?? f.genres })

/** What a search is made of: titles found by name (`pool`), or none when the words are only filters. */
type Plan = { tokens: Token[]; people: PersonHit[]; kind?: Hit['kind']; f: Filters; pool: Hit[] | null }

/**
 * Words that name a service, type, decade, genre or language become filters,
 * unless the whole phrase is a title's name ("Modern Family", "American Horror Story"): then it's just a name.
 * `removed` are the chips the person took off again.
 */
async function plan(typed: string, removed: string[]): Promise<Plan> {
  const text = typed.replace(/\s+/g, ' ').trim()
  if (text.length < 2) return { tokens: [], people: [], f: {}, pool: [] }
  const parsed = parseQuery(text)
  if (!parsed.tokens.length) {
    const [hits, found] = await Promise.all([named(text, 60), once(`people:${text.toLowerCase()}`, () => people(text)).catch(() => [])])
    return { tokens: [], people: found, f: {}, pool: hits }
  }

  const phrase = text.includes(' ') ? await named(text, 30) : []
  const whole = fold(text)
  if (phrase.some((h) => fold(h.title).includes(whole))) return { tokens: [], people: [], f: {}, pool: phrase }

  const kind = parsed.tokens.find((t) => t.key === 'kind')?.filter.kind
  const tokens = parsed.tokens.filter((t) => t.key !== 'kind' && !removed.includes(t.key))
  const f = merge(tokens)
  if (parsed.rest.length >= 2) return { tokens, people: [], kind, f, pool: await named(parsed.rest, 100) }
  return { tokens, people: [], kind, f, pool: null }
}

/** Search for what was typed. `extra`: filters set in the filter drawer, on top of the ones in the words. */
export async function search(typed: string, removed: string[], extra: Filters = {}): Promise<Found> {
  const p = await plan(typed, removed)
  const f = combine(p.f, extra)
  const base = { tokens: p.tokens, people: p.people, kind: p.kind }
  if (p.pool) return { ...base, hits: p.pool.filter((h) => passes(h, f)) }
  if (!some(f) && !p.kind) return { ...base, hits: [] }
  if (!p.kind) return { ...base, hits: await byFilters(f) }
  // enough of the kind that was asked for, plus the mixed list so the other pills have something too
  const [asked, mixed] = await Promise.all([byFilters({ ...f, kind: p.kind }), byFilters(f)])
  const seen = new Set(asked.map((h) => h.id))
  return { ...base, hits: [...asked, ...mixed.filter((h) => !seen.has(h.id))] }
}

/**
 * How many titles a search with these filters has (for the filter drawer). By-name searches count what was
 * found; filter-only searches ask the database, so the number can be larger than the 60 the list shows.
 * Null when the database gave no count.
 */
export async function countWith(typed: string, removed: string[], extra: Filters, kind?: Hit['kind']): Promise<number | null> {
  const p = await plan(typed, removed)
  const f = { ...combine(p.f, extra), ...(kind ? { kind } : {}) }
  if (p.pool) return p.pool.filter((h) => passes(h, f)).length
  if (!some(combine(p.f, extra)) && !p.kind) return 0
  return once(`count:${JSON.stringify(f)}`, async () => {
    const res = await narrow(supabase.from('titles').select(`id,availability!inner(service_id)${f.minRating ? ',scores!inner(imdb_rating)' : ''}`, { count: 'exact', head: true }), f)
    if (res.error) throw new Error(res.error.message)
    return res.count as number | null
  })
}

/** The genres and languages the filter drawer offers. */
export const GENRE_OPTIONS = GENRES.map(([, label]) => label)
export const genreNames = (label: string) => GENRES.find((g) => g[1] === label)?.[2] ?? []
export const LANG_OPTIONS: [string, string][] = [['en', 'English'], ['sv', 'Swedish'], ['da', 'Danish'], ['no', 'Norwegian'], ['fi', 'Finnish'], ['fr', 'French'], ['de', 'German'], ['es', 'Spanish'], ['it', 'Italian'], ['ja', 'Japanese'], ['ko', 'Korean']]

/**
 * What the words alone say, before the server answers: when every word is a filter ("90s films"), the chips and
 * the type are known at once. With other words in it the phrase may be a title's name, so nothing is guessed.
 */
export function guess(typed: string, removed: string[]): { tokens: Token[]; kind?: Hit['kind'] } | null {
  const text = typed.replace(/\s+/g, ' ').trim()
  if (text.length < 2) return null
  const parsed = parseQuery(text)
  if (!parsed.tokens.length || parsed.rest.length > 0) return null
  return { tokens: parsed.tokens.filter((t) => t.key !== 'kind' && !removed.includes(t.key)), kind: parsed.tokens.find((t) => t.key === 'kind')?.filter.kind }
}

/** For "Popular right now" under an empty result. */
export const loadPopular = () => byFilters({}, 3)

export type Idea = { query: string; title: string; sub: string; poster_path: string | null }
const IDEAS: [string, string, string, Filters][] = [
  ['leaving soon', 'Leaving soon', 'Last chance', { leaving: true }],
  ['swedish series', 'Swedish series', 'From Sweden', { lang: 'sv', kind: 'series' }],
  ['90s films', '90s films', 'Classics', { kind: 'film', from: 1990, to: 1999 }],
]
/** The three suggestions before typing, each with the poster of its top result. */
export async function loadIdeas(): Promise<Idea[]> {
  const tops = await Promise.all(IDEAS.map(([, , , f]) => byFilters(f, 1)))
  return IDEAS.map(([query, title, sub], i) => ({ query, title, sub, poster_path: tops[i][0]?.poster_path ?? null })).filter((_, i) => tops[i].length > 0)
}

// ---- Recents (on this phone) ---------------------------------------------------

export type Recent = { t: 'q'; text: string } | { t: 'title'; id: number; text: string; sub: string; poster_path: string | null }
const RECENTS = 'reelay:q:recents' // under the saved-data prefix, so signing out clears it

export function readRecents(): Recent[] {
  try { return JSON.parse(localStorage.getItem(RECENTS) ?? '[]') as Recent[] } catch { return [] }
}
export function writeRecents(list: Recent[]) {
  try { localStorage.setItem(RECENTS, JSON.stringify(list)) } catch { /* private mode: recents last for this visit only */ }
}
const same = (a: Recent, b: Recent) => (a.t === 'q' && b.t === 'q' ? a.text.toLowerCase() === b.text.toLowerCase() : a.t === 'title' && b.t === 'title' && a.id === b.id)
/** Newest first, 12 at most. A search replaces the shorter ones typed on the way to it ("sha" then "shaw"). */
export const addRecent = (list: Recent[], r: Recent): Recent[] => [r, ...list.filter((x) =>
  !same(x, r) && !(r.t === 'q' && x.t === 'q' && r.text.toLowerCase().startsWith(x.text.toLowerCase())))].slice(0, 12)
