// Browse: the categories (moods and themes, genres, lists, decades, countries), and the lookups behind their pages.
// A category is a rule over streaming titles, sent to the database with each lookup (browse_page, browse_list,
// browse_covers: migration 20261126000600); nothing about categories is stored there. Like Home, Browse is the
// member's own services, without their logged films or hidden tags (the database knows them: auth.uid()); one row
// at the end of a category page shows what is on other services. Each page is one request.
import { MIN_ROW, namesLine, type Card } from './catalogue'
import { supabase } from './supabase'
import { dayNumber } from './days'
import { hiddenTags } from './hidden'
import type { HomeCard } from './home'

export type Kind = Card['kind']
/** 'home': lists that only Home's rows open (View all); they aren't shown in Browse */
export type SectionId = 'moods' | 'genres' | 'lists' | 'decades' | 'countries' | 'home'
export type Sort = 'popular' | 'rated' | 'newest' | 'leaving' | 'trending'

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
  /** leaving a service within 30 days */
  leaving?: boolean
  /** arrived on a service within this many days */
  arrived?: number
  /** in this week's trending list */
  trending?: boolean
  /** has won an award */
  awards?: boolean
  /** a mood or theme (title_moods, from TMDB keywords: MOODS in the sync) */
  mood?: string
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
  /** the list's name when it is opened for films or series only ("New films") */
  labels?: Record<Kind, string>
  /** the Suggestions tag it is all about: hiding that tag takes the category out of Browse */
  tag?: string
}

const thisYear = new Date().getFullYear()
const g = (id: string, label: string, tint: string, genres: string[], only?: Kind, tag?: string): Category =>
  ({ id, section: 'genres', label, tint, rule: { genres }, noun: label.toLowerCase(), only, tag })
const d = (label: string, from: number, tint: string): Category =>
  ({ id: label.toLowerCase(), section: 'decades', label, tint, rule: { from, to: from + 9 }, noun: label })
const m = (id: string, label: string, tint: string, noun = label.toLowerCase()): Category =>
  ({ id, section: 'moods', label, tint, rule: { mood: id }, noun })
const c = (id: string, label: string, adjective: string, country: string, tint: string): Category =>
  ({ id, section: 'countries', label, tint, rule: { country }, noun: adjective })

export const CATEGORIES: Category[] = [
  m('feel-good', 'Feel-good', '#8A5A1F'), m('mind-bending', 'Mind-bending', '#23395B'), m('true-stories', 'True stories', '#55555E'),
  m('edge-of-your-seat', 'Edge of your seat', '#3F2A4F', 'edge-of-your-seat'), m('cosy', 'Cosy', '#6B4A2A'), m('dark-gritty', 'Dark & gritty', '#1F3A33'),
  m('based-on-a-book', 'Based on a book', '#2F4F5F', 'book adaptations'), m('heist', 'Heists', '#5B3A2A', 'heist'), m('coming-of-age', 'Coming of age', '#2E5A3A'),

  g('drama', 'Drama', '#6B2E3A', ['Drama'], undefined, 'drama'),
  g('crime', 'Crime', '#2F3B52', ['Crime'], undefined, 'crime'),
  g('thriller', 'Thriller', '#3F2A4F', ['Thriller', 'Mystery'], undefined, 'thriller'),
  g('comedy', 'Comedy', '#8A5A1F', ['Comedy'], undefined, 'comedy'),
  g('action', 'Action', '#7A2A1A', ['Action', 'Action & Adventure'], undefined, 'action'),
  g('horror', 'Horror', '#1F3A33', ['Horror'], 'film', 'horror'),
  g('war', 'War', '#4B4A32', ['War', 'War & Politics'], undefined, 'war'),
  g('romance', 'Romance', '#7A3550', ['Romance'], undefined, 'romance'),
  g('animation', 'Animation', '#1F4F6B', ['Animation'], undefined, 'animation'),
  g('family', 'Family', '#2E5A3A', ['Family', 'Kids'], undefined, 'family'),
  g('reality', 'Reality', '#5A4632', ['Reality'], 'series', 'reality'),
  g('sci-fi', 'Sci-fi', '#23395B', ['Science Fiction', 'Sci-Fi & Fantasy'], undefined, 'scifi'),
  g('documentary', 'Documentary', '#55555E', ['Documentary'], undefined, 'documentaries'),

  { id: 'leaving-soon', section: 'lists', label: 'Leaving soon', tint: '#5A3A2A', rule: { leaving: true }, list: 'leaving' },
  { id: 'highest-rated', section: 'lists', label: 'Highest rated', tint: '#4B4A32', rule: { votes: [20000] }, list: 'rated' },
  { id: 'hidden-gems', section: 'lists', label: 'Hidden gems', tint: '#1F4F6B', rule: { rating: 7.5, votes: [2000, 30000] }, list: 'rated' },
  { id: 'under-90', section: 'lists', label: 'Under 90 minutes', tint: '#2E5A3A', only: 'film', rule: { under: 90 }, list: 'popular' },
  { id: 'new-this-year', section: 'lists', label: 'New this year', tint: '#3E5A2E', rule: { from: thisYear }, list: 'popular' },

  // the lists behind Home's rows (View all); not shown in Browse
  { id: 'new-arrivals', section: 'home', label: 'New on streaming', tint: '#333', rule: { arrived: 30 }, list: 'popular' },
  { id: 'trending', section: 'home', label: 'Trending', tint: '#333', rule: { trending: true }, list: 'trending', labels: { film: 'Trending films', series: 'Trending series' } },
  { id: 'new-releases', section: 'home', label: 'New releases', tint: '#333', rule: { from: thisYear - 1 }, list: 'popular', labels: { film: 'New films', series: 'New series' } },
  { id: 'award-winners', section: 'home', label: 'Award winners', tint: '#333', rule: { awards: true }, list: 'popular' },

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
  { id: 'moods', title: 'Moods & themes', shown: 6 },
  { id: 'genres', title: 'Genres', shown: 6 },
  { id: 'lists', title: 'Lists', shown: 4 },
  { id: 'decades', title: 'Decades', shown: 4 },
  { id: 'countries', title: 'Countries', shown: 4 },
]
export const categoryOf = (id: string) => CATEGORIES.find((x) => x.id === id)
/** A category Browse offers: not one all about a tag the member hides (Settings › Suggestions). */
export const offered = (c: Category, hidden: string[] = hiddenTags()) => !c.tag || !hidden.includes(c.tag)

// ---- Rows on a category page ------------------------------------------------------

/** A row's id is what the database calls it (browse_keep, browse_order). */
export type RowId = 'popular' | 'new' | 'trending' | 'critics' | 'top' | 'gems' | 'classics' | 'awards' | 'leaving' | 'elsewhere'
/** sort: the order a View all of the row starts in (its own, unless the member picks another) */
export type RowDef = { id: RowId; title: string; kind?: Kind; sort: Sort; notes?: 'leaving'; own?: boolean }

const ROWS: Record<RowId, Omit<RowDef, 'id' | 'kind'>> = {
  popular: { title: 'Popular', sort: 'popular' },
  new: { title: 'New on your services', sort: 'popular', own: true },
  trending: { title: 'Trending', sort: 'trending', own: true },
  critics: { title: 'Critics’ favourites', sort: 'rated', own: true },
  top: { title: 'Highest rated', sort: 'rated' },
  gems: { title: 'Hidden gems', sort: 'rated' },
  classics: { title: 'Classics', sort: 'rated', own: true },
  awards: { title: 'Award winners', sort: 'popular' },
  leaving: { title: 'Leaving soon', sort: 'leaving', notes: 'leaving' },
  elsewhere: { title: 'On other services', sort: 'popular', own: true },
}
/** The quality rows take turns at the top by day, so a category page isn't the same every day. */
const QUALITY: RowId[] = ['critics', 'classics', 'gems', 'awards', 'top']

/** The rows a category page shows, in order (those with too few titles are left out when it loads). */
export function rowsOf(cat: Category, kind?: Kind): RowDef[] {
  const k = kind ?? cat.only
  const turn = dayNumber() % QUALITY.length
  const quality = [...QUALITY.slice(turn), ...QUALITY.slice(0, turn)]
  const ids: RowId[] = ['new', 'trending', ...quality, 'leaving', 'elsewhere']
  // a list of things that are trending, leaving or award-winning already: not those rows again
  const skip = new Set<RowId>([...(cat.rule.trending ? ['trending' as const] : []), ...(cat.rule.leaving ? ['leaving' as const] : []), ...(cat.rule.awards ? ['awards' as const] : [])])
  return ids.filter((id) => !skip.has(id)).map((id) => ({ id, ...ROWS[id], kind: k }))
}
export const rowDef = (cat: Category, row: string, kind?: Kind): RowDef | undefined =>
  row in ROWS ? { id: row as RowId, ...ROWS[row as RowId], kind: kind ?? cat.only } : undefined

// ---- Lookups -----------------------------------------------------------------------

/** The rule as the database reads it. */
const ruleOf = (cat: Category) => cat.rule

/** A whole list: a row's View all, or a Browse list (Leaving soon, Hidden gems…). `sort`: another order than the
 *  row's own. On the member's services (but the "elsewhere" row), as cards with what the filter drawer looks at. */
export async function browseList(cat: Category, row: RowId, kind?: Kind, sort?: Sort, limit = 90): Promise<Card[]> {
  const { data, error } = await supabase.rpc('browse_list', { p_rule: ruleOf(cat), p_row: row, p_kind: kind ?? cat.only ?? null, p_limit: limit, p_sort: sort ?? null })
  if (error) throw new Error(error.message)
  return (data ?? []) as Card[]
}
/** A Browse list's own row and order (Leaving soon is the leaving row; the others are the category itself). */
export const listOf = (cat: Category): { row: RowId; sort?: Sort } =>
  cat.list === 'leaving' ? { row: 'leaving' } : cat.list === 'trending' ? { row: 'trending' }
    : { row: 'popular', sort: cat.list && cat.list !== 'popular' ? cat.list : undefined }

/** Tonight's picks' kind of card: a title, why, who made it and the service to name. */
export type Pick = HomeCard
/** `more`: the row has more titles than it shows (its View all is worth opening) */
export type CategoryPage = { hero: Card[]; picks: Pick[]; rows: (RowDef & { items: Card[]; more: boolean })[] }
const ROW_SHOWS = 15

type Raw = { hero: Card[]; picks: (Card & { reason: string; via: string | null; by: string[] })[]; rows: { id: RowId; items: Card[] }[] }
/** A category page in one request: its top titles, its picks (with why) and its rows. */
export async function loadCategory(cat: Category, kind?: Kind): Promise<CategoryPage> {
  const defs = rowsOf(cat, kind)
  const { data, error } = await supabase.rpc('browse_page', {
    p_rule: ruleOf(cat), p_kind: kind ?? cat.only ?? null, p_rows: defs.map((d) => d.id), p_day: dayNumber(), p_shows: ROW_SHOWS,
  })
  if (error) throw new Error(error.message)
  const raw = data as Raw
  const items = new Map(raw.rows.map((r) => [r.id, r.items]))
  const picks: Pick[] = raw.picks.map(({ by, via, ...c }) => ({
    ...c, via: via ?? undefined,
    by: by.length ? `${c.kind === 'film' ? 'Directed by' : 'Created by'} ${namesLine([...new Set(by)])}` : undefined,
  }) as Pick)
  return {
    hero: raw.hero, picks,
    rows: defs.map((r) => ({ ...r, items: (items.get(r.id) ?? []).slice(0, ROW_SHOWS), more: (items.get(r.id) ?? []).length > ROW_SHOWS }))
      .filter((r) => r.items.length >= MIN_ROW),
  }
}

/** One picture per category for the Browse cards: its most popular title's backdrop, no title used twice. In one
 *  request; the database keeps them until the nightly sync has run (they are everyone's). */
export async function loadCovers(): Promise<Record<string, string | null>> {
  const cats = CATEGORIES.filter((cat) => cat.section !== 'home')
  const { data, error } = await supabase.rpc('browse_covers', { p_cats: cats.map((cat) => ({ id: cat.id, rule: ruleOf(cat), kind: cat.only ?? null })) })
  if (error) throw new Error(error.message)
  const tops = (data ?? {}) as Record<string, { id: number; path: string }[]>
  const used = new Set<number>()
  const out: Record<string, string | null> = {}
  for (const cat of cats) {
    const list = tops[cat.id] ?? []
    const pick = list.find((t) => !used.has(t.id)) ?? list[0]
    if (pick) used.add(pick.id)
    out[cat.id] = pick?.path ?? null
  }
  return out
}
