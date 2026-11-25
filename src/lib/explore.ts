// Explore: a Browse list made of filters, where every filter is a chip that can be taken off ("90s thrillers" →
// "Thrillers" → All titles). The list is read from the database by its filters, a page at a time, with real totals.
// Lists that aren't filters (Trending, Hidden gems, Award winners, new on streaming) stay fixed grids.
import type { Draft } from '../screens/SearchFilters'
import { CATEGORIES, rowsOf, type Category, type Kind, type Sort } from './browse'
import type { Card } from './catalogue'
import { genreNames, narrow, type Filters } from './search'
import { supabase } from './supabase'
import { localDay } from './days'

export type Pick = 'all' | Kind
/** Where a list starts: its filters as chips, the type pill and the sort. */
export type ExploreStart = { draft: Draft; pick: Pick }

const thisYear = new Date().getFullYear()
const EMPTY: Draft = { sort: 'popular', mine: false, hide: false, genres: [], decades: [], rating: 0, rt: 0, lb: 0, length: null, lang: null, country: null, leaving: false, since: null }
/** All titles, most popular first. */
export const ALL_TITLES: ExploreStart = { draft: EMPTY, pick: 'all' }

/** The rules a filter can stand for; a list with any other rule (votes, trending, awards…) is a fixed list. */
const FILTERABLE = new Set(['genres', 'from', 'to', 'country', 'under', 'leaving'])

/** A Browse list as filters, or null when it isn't made of filters. `row`: 'list' or a category page's row. */
export function exploreOf(cat: Category, row: string, kind?: Kind): ExploreStart | null {
  const r = cat.rule
  if (Object.keys(r).some((k) => !FILTERABLE.has(k))) return null
  const def = row === 'list' ? null : rowsOf(cat, kind).find((x) => x.id === row)
  if (row !== 'list' && !def) return null
  const d: Draft = { ...EMPTY, genres: [], decades: [] }
  if (r.genres) d.genres = cat.section === 'genres' ? [cat.label] : []
  if (r.from !== undefined && r.to === r.from + 9) d.decades = [r.from]
  else if (r.from !== undefined && r.to === undefined) d.since = r.from
  if (r.country) d.country = r.country
  if (r.under) d.length = 'short'
  if (r.leaving) d.leaving = true
  if (def?.id === 'new') d.since = thisYear - 1
  if (def?.id === 'leaving') d.leaving = true
  d.sort = (def?.sort ?? cat.list ?? (d.leaving ? 'leaving' : 'popular'))
  return { draft: d, pick: def?.kind ?? kind ?? cat.only ?? 'all' }
}

// ---- The heading follows the chips ---------------------------------------------------
const PLURAL: Record<string, string> = {
  Drama: 'dramas', Comedy: 'comedies', Thriller: 'thrillers', Documentary: 'documentaries', Western: 'westerns', Mystery: 'mysteries',
}
const adjectiveOf = (code: string) => CATEGORIES.find((c) => c.rule.country === code)?.noun
const countryOf = (code: string) => CATEGORIES.find((c) => c.rule.country === code)?.label ?? code
const DECADE_WORD: Record<number, string> = { 2020: '2020s', 2010: '2010s', 2000: '2000s', 1990: '90s', 1980: '80s', 1970: '70s', 1960: '60s', 0: 'Older' }
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} & ${xs[xs.length - 1]}`)

/** "90s thrillers", "Swedish crime series", "Thrillers", "Leaving soon", "All titles". */
export function exploreTitle(d: Draft, pick: Pick): string {
  const decades = [...d.decades].sort((a, b) => a - b).map((x) => DECADE_WORD[x] ?? String(x))
  const genres = d.genres.map((g) => PLURAL[g] ?? g.toLowerCase())
  const kindWord = pick === 'film' ? 'films' : pick === 'series' ? 'series' : ''
  // a genre and a type: "crime series", "thriller films"
  const noun = genres.length ? (kindWord ? `${and(d.genres.map((g) => g.toLowerCase()))} ${kindWord}` : and(genres)) : kindWord
  let words: string
  if (noun) words = [and(decades), d.country ? adjectiveOf(d.country) ?? '' : '', noun].filter(Boolean).join(' ')
  else {
    words = and(decades)
    if (d.country) words = words ? `${words} from ${countryOf(d.country)}` : countryOf(d.country)
  }
  if (!words) {
    if (d.leaving) return 'Leaving soon'
    if (d.since) return d.since >= thisYear ? 'New this year' : 'New releases'
    if (d.length === 'short') return 'Under 90 minutes'
    return 'All titles'
  }
  if (d.leaving) words += ' leaving soon'
  return words.charAt(0).toUpperCase() + words.slice(1)
}

// ---- Reading the list -------------------------------------------------------------------
/** Titles shown per page; the next page loads as the end of the list comes near. */
export const EXPLORE_PAGE = 60
const FIELDS = 'id,kind,title,year,runtime_min,seasons,poster_path'
/** A rated list keeps to titles with enough votes for the rating to mean something. */
const RATED_VOTES = 3000

export type Totals = { all: number; film: number; series: number }
export type ExplorePage = { cards: Card[]; totals: Totals }
type Ctx = { picked: string[]; seen: number[] }

function filtersOf(d: Draft, ctx: Ctx, kind?: Kind): Filters & { leaving?: boolean } {
  const f: Filters = {}
  if (kind) f.kind = kind
  if (d.genres.length) f.genres = d.genres.flatMap(genreNames)
  if (d.decades.length) f.decades = d.decades.map((x) => (x === 0 ? [undefined, 1959] : [x, x + 9]))
  if (d.since) f.from = d.since
  if (d.country) f.country = d.country
  if (d.lang) f.lang = d.lang
  if (d.rating) f.minRating = d.rating
  if (d.rt) f.minRt = d.rt
  if (d.lb) f.minLb = d.lb
  if (d.length) f.length = d.length
  if (d.leaving) f.leaving = true
  if (d.mine && ctx.picked.length) f.services = ctx.picked
  if (d.hide && ctx.seen.length) f.hide = ctx.seen
  return f
}
const scored = (d: Draft) => !!(d.rating || d.rt || d.lb)
const today = () => localDay()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function query(d: Draft, ctx: Ctx, kind: Kind | undefined, fields: string, head = false): any {
  const sel = `${fields},availability!inner(service_id,leaves_on)${scored(d) ? ',scores!inner(imdb_rating,rt_critics,letterboxd)' : ''}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = narrow(supabase.from('titles').select(sel, head ? { count: 'exact', head: true } : undefined), filtersOf(d, ctx, kind))
  if (d.leaving) q = q.gte('availability.leaves_on', today())
  if (d.sort === 'rated') q = q.gte('imdb_votes', RATED_VOTES)
  return q
}

/** One page of the list, in the draft's order. */
export async function exploreCards(d: Draft, pick: Pick, ctx: Ctx, from = 0): Promise<Card[]> {
  const kind = pick === 'all' ? undefined : pick
  let q = query(d, ctx, kind, FIELDS)
  if (d.sort === 'rated') q = q.order('imdb_rating', { ascending: false, nullsFirst: false })
  else if (d.sort === 'newest') q = q.order('year', { ascending: false, nullsFirst: false })
  // leaving soonest first: the database can't order by a service's date, so the whole (short) list comes at once
  const leaving = d.sort === 'leaving'
  const res = await q.order('popularity', { ascending: false }).order('id').range(leaving ? 0 : from, leaving ? 499 : from + EXPLORE_PAGE - 1)
  if (res.error) throw new Error(res.error.message)
  const list = res.data as Card[]
  if (leaving) {
    if (from > 0) return []
    const soonest = (c: Card) => c.availability.map((a) => a.leaves_on).filter(Boolean).sort()[0] ?? '9999'
    list.sort((a, b) => soonest(a).localeCompare(soonest(b)))
  }
  return list
}

/** How many titles fit, of each type (the pills and the drawer's button). */
export async function exploreCount(d: Draft, kind: Kind | undefined, ctx: Ctx): Promise<number> {
  const res = await query(d, ctx, kind, 'id', true)
  if (res.error) throw new Error(res.error.message)
  return (res.count as number | null) ?? 0
}

export async function loadExplore(d: Draft, pick: Pick, ctx: Ctx): Promise<ExplorePage> {
  const [cards, all, film, series] = await Promise.all([
    exploreCards(d, pick, ctx), exploreCount(d, undefined, ctx), exploreCount(d, 'film', ctx), exploreCount(d, 'series', ctx),
  ])
  return { cards, totals: { all, film, series } }
}

/** What a list's saved copy is known by: its filters, type and order (and the services or watched films they use). */
export const exploreKey = (d: Draft, pick: Pick, ctx: Ctx) =>
  `explore:${JSON.stringify({ ...d, mine: d.mine ? ctx.picked : false, hide: d.hide ? ctx.seen.length : false })}:${pick}`

export type { Sort }
