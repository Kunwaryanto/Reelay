// Browse: the categories (genres, lists, decades, countries), and the lookups behind their pages.
// A category is a set of filters over streaming titles; nothing here is stored in the database.
import type { Card } from './catalogue'
import { supabase } from './supabase'

export type Kind = Card['kind']
export type SectionId = 'genres' | 'lists' | 'decades' | 'countries'
export type Sort = 'popular' | 'rated' | 'newest'

type Rule = {
  genres?: string[]
  from?: number
  to?: number
  country?: string
  /** films shorter than this many minutes */
  under?: number
  /** IMDb: at least this rating, and between these vote counts */
  rating?: number
  votes?: [number, number?]
}

export type Category = {
  id: string
  section: SectionId
  label: string
  /** the card's colour wash */
  tint: string
  /** only films or only series exist here (e.g. Under 90 minutes) */
  only?: Kind
  rule: Rule
  /** how the rows name it: "New in crime", "Top Swedish films", "Top 90s series" */
  noun?: string
  /** lists open straight as a grid, sorted this way */
  list?: Sort
}

const thisYear = new Date().getFullYear()
const g = (id: string, label: string, tint: string, genres: string[], only?: Kind): Category =>
  ({ id, section: 'genres', label, tint, rule: { genres }, noun: label.toLowerCase(), only })
const d = (label: string, from: number, tint: string): Category =>
  ({ id: label.toLowerCase(), section: 'decades', label, tint, rule: { from, to: from + 9 }, noun: label })
const c = (id: string, label: string, adjective: string, country: string, tint: string): Category =>
  ({ id, section: 'countries', label, tint, rule: { country }, noun: adjective })

export const CATEGORIES: Category[] = [
  g('drama', 'Drama', '#6B2E3A', ['Drama']),
  g('crime', 'Crime', '#2F3B52', ['Crime']),
  g('thriller', 'Thriller', '#3F2A4F', ['Thriller', 'Mystery']),
  g('comedy', 'Comedy', '#8A5A1F', ['Comedy']),
  g('action', 'Action', '#7A2A1A', ['Action', 'Action & Adventure']),
  g('horror', 'Horror', '#1F3A33', ['Horror'], 'film'),
  g('war', 'War', '#4B4A32', ['War', 'War & Politics']),
  g('romance', 'Romance', '#7A3550', ['Romance']),
  g('animation', 'Animation', '#1F4F6B', ['Animation']),
  g('family', 'Family', '#2E5A3A', ['Family', 'Kids']),
  g('reality', 'Reality', '#5A4632', ['Reality'], 'series'),
  g('sci-fi', 'Sci-fi', '#23395B', ['Science Fiction', 'Sci-Fi & Fantasy']),
  g('documentary', 'Documentary', '#55555E', ['Documentary']),

  { id: 'highest-rated', section: 'lists', label: 'Highest rated', tint: '#4B4A32', rule: { votes: [20000] }, list: 'rated' },
  { id: 'hidden-gems', section: 'lists', label: 'Hidden gems', tint: '#1F4F6B', rule: { rating: 7.5, votes: [2000, 30000] }, list: 'rated' },
  { id: 'under-90', section: 'lists', label: 'Under 90 minutes', tint: '#2E5A3A', only: 'film', rule: { under: 90 }, list: 'popular' },
  { id: 'new-this-year', section: 'lists', label: 'New this year', tint: '#3E5A2E', rule: { from: thisYear }, list: 'popular' },

  d('2020s', 2020, '#3E5A2E'), d('2010s', 2010, '#2F4F5F'), d('2000s', 2000, '#6B4A2A'), d('90s', 1990, '#5B3A6B'),
  d('80s', 1980, '#5A3A5A'), d('70s', 1970, '#6B5A2A'), d('60s', 1960, '#2F4F5F'),

  c('sweden', 'Sweden', 'Swedish', 'SE', '#2F4F6B'),
  c('south-korea', 'South Korea', 'Korean', 'KR', '#5B2A2A'),
  c('spain', 'Spain', 'Spanish', 'ES', '#7A3A2A'),
  c('united-kingdom', 'United Kingdom', 'British', 'GB', '#2F3B52'),
  c('denmark', 'Denmark', 'Danish', 'DK', '#5B2A2A'),
  c('norway', 'Norway', 'Norwegian', 'NO', '#23395B'),
  c('japan', 'Japan', 'Japanese', 'JP', '#7A3550'),
  c('france', 'France', 'French', 'FR', '#3F2A4F'),
  c('united-states', 'United States', 'American', 'US', '#6B2E3A'),
]

export const SECTIONS: { id: SectionId; title: string; shown: number }[] = [
  { id: 'genres', title: 'Genres', shown: 6 },
  { id: 'lists', title: 'Lists', shown: 4 },
  { id: 'decades', title: 'Decades', shown: 4 },
  { id: 'countries', title: 'Countries', shown: 4 },
]
export const categoryOf = (id: string) => CATEGORIES.find((x) => x.id === id)

// ---- Rows on a category page ------------------------------------------------------

export type RowId = 'new' | 'popular' | 'leaving' | 'top-series' | 'top-films'
export type RowDef = { id: RowId; title: string; kind?: Kind; sort: Sort; notes?: 'leaving' }

/** The rows a category page shows, for all kinds or just one. */
export function rowsOf(cat: Category, kind?: Kind): RowDef[] {
  const k = kind ?? cat.only
  const n = cat.noun ?? cat.label.toLowerCase()
  const fresh: RowDef = cat.section === 'genres' ? { id: 'new', title: `New in ${n}`, sort: 'popular' }
    : cat.section === 'countries' ? { id: 'new', title: `New from ${cat.label === 'United Kingdom' || cat.label === 'United States' ? 'the ' : ''}${cat.label}`, sort: 'popular' }
      : { id: 'popular', title: `Popular from the ${cat.label}`, sort: 'popular' }
  const rows: RowDef[] = [
    { ...fresh, kind: k },
    { id: 'leaving', title: 'Leaving soon', kind: k, sort: 'popular', notes: 'leaving' },
  ]
  if (k !== 'film') rows.push({ id: 'top-series', title: `Top ${n} series`, kind: 'series', sort: 'rated' })
  if (k !== 'series') rows.push({ id: 'top-films', title: `Top ${n} films`, kind: 'film', sort: 'rated' })
  return rows
}

// ---- Lookups -----------------------------------------------------------------------

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const today = () => inDays(0)

const CARD = 'id,kind,title,year,poster_path,availability!inner(service_id,leaves_on)'
const ART = 'id,kind,title,year,poster_path,backdrop_path,logo_path,genres,seasons,availability!inner(service_id,leaves_on)'

type Opts = { kind?: Kind; sort?: Sort; row?: RowId; limit?: number; art?: boolean }

/** Streaming titles in a category. `row` narrows it the way that row on the category page does. */
export async function titlesIn(cat: Category, { kind, sort = 'popular', row, limit = 20, art }: Opts = {}): Promise<Card[]> {
  const r = cat.rule
  const k = kind ?? cat.only
  const scored = sort === 'rated' || r.rating !== undefined || r.votes !== undefined
  let q = supabase.from('titles').select(`${art ? ART : CARD}${scored ? ',scores!inner(imdb_rating,imdb_votes)' : ''}`)
  if (k) q = q.eq('kind', k)
  if (r.genres) q = q.overlaps('genres', r.genres)
  if (r.from !== undefined) q = q.gte('year', r.from)
  if (r.to !== undefined) q = q.lte('year', r.to)
  if (r.country) q = q.contains('countries', [r.country])
  if (r.under) q = q.eq('kind', 'film').gt('runtime_min', 40).lt('runtime_min', r.under)
  if (r.rating !== undefined) q = q.gte('scores.imdb_rating', r.rating)
  if (r.votes) {
    q = q.gte('scores.imdb_votes', r.votes[0])
    if (r.votes[1]) q = q.lte('scores.imdb_votes', r.votes[1])
  } else if (sort === 'rated') {
    // enough votes for the rating to mean something; fewer for small categories (a country, an old decade)
    q = q.gte('scores.imdb_votes', cat.section === 'genres' ? 20000 : 3000)
  }
  if (row === 'new') q = q.gte('year', thisYear - 1)
  if (row === 'leaving') q = q.gte('availability.leaves_on', today()).lte('availability.leaves_on', inDays(30))
  if (art) q = q.not('backdrop_path', 'is', null).not('logo_path', 'is', null)

  if (sort === 'rated') q = q.order('scores(imdb_rating)', { ascending: false })
  else if (sort === 'newest') q = q.order('year', { ascending: false, nullsFirst: false })
  return unwrap(await q.order('popularity', { ascending: false }).limit(limit) as never) as Card[]
}

export type CategoryPage = { hero: Card[]; rows: (RowDef & { items: Card[] })[] }

export async function loadCategory(cat: Category, kind?: Kind): Promise<CategoryPage> {
  const defs = rowsOf(cat, kind)
  const [hero, ...lists] = await Promise.all([
    titlesIn(cat, { kind, limit: 3, art: true }),
    ...defs.map((r) => titlesIn(cat, { kind: r.kind, sort: r.sort, row: r.id, limit: 15 })),
  ])
  return { hero, rows: defs.map((r, i) => ({ ...r, items: lists[i] })).filter((r) => r.items.length >= 3) }
}

/** One picture per category for the Browse cards: its most popular title's artwork, no title used twice. */
export async function loadCovers(): Promise<Record<string, string | null>> {
  const tops = await Promise.all(CATEGORIES.map((cat) =>
    supabaseTop(cat).catch(() => [] as { id: number; backdrop_path: string | null; poster_path: string | null }[])))
  const used = new Set<number>()
  const out: Record<string, string | null> = {}
  CATEGORIES.forEach((cat, i) => {
    const pick = tops[i].find((t) => !used.has(t.id)) ?? tops[i][0]
    if (pick) used.add(pick.id)
    out[cat.id] = pick ? pick.backdrop_path ?? pick.poster_path : null
  })
  return out
}
async function supabaseTop(cat: Category) {
  const list = await titlesIn(cat, { sort: cat.list === 'rated' ? 'rated' : 'popular', limit: 5, art: true })
  return list.map((t) => ({ id: t.id, backdrop_path: t.backdrop_path ?? null, poster_path: t.poster_path }))
}
