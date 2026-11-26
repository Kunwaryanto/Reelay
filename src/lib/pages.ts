// Every page that loads something has one entry here: what it loads, what that is saved as, and which pictures it
// waits for before it arrives. The page reads its content through its entry, and every link to it preloads through
// the same entry (`warmPage`, from `usePageLink` and from `push`), so a page and its preload can't drift apart.
// A new page that loads content gets an entry in `pageFor`.
import { dayNumber } from './days'
import { CATEGORIES, browseList, categoryOf, listOf, offered, loadCategory, loadCovers, rowDef, type Category, type CategoryPage, type Kind, type RowDef, type SectionId, type Sort } from './browse'
import { loadTitle, type Card, type TitleDetail } from './catalogue'
import { tmdbImage } from './images'
import { posterPicture, titleArt, titleHero, warmPictures, type Picture } from './pictures'
import { prefetch, readQueryData, useQuery, type Freshness, type Query } from './query'
import { supabase } from './supabase'
import { routeOf, type Route } from './routes'
import { ALL_TITLES, exploreKey, exploreOf, loadExplore, type ExplorePage, type ExploreStart, type Pick } from './explore'
import type { Draft } from '../screens/SearchFilters'
import { hiddenKey } from './hidden'

export type Page<T> = Freshness & {
  key: string
  load: () => Promise<T>
  /** what is above the fold: the page arrives once these are decoded */
  fold: (data: T | undefined) => Picture[]
}

// ---- Title -------------------------------------------------------------------
export const titlePage = (id: number): Page<TitleDetail | null> => ({
  key: `title:${id}`, load: () => loadTitle(id), catalogue: true, fold: (t) => [{ src: titleHero(t).src }],
})

// ---- Person ------------------------------------------------------------------
export type Role = 'cast' | 'director' | 'creator' | 'writer'
export type PersonCredit = { role: Role; character: string | null; title: Card }
export type PersonData = { id: number; name: string; profile_path: string | null; known_for: string | null; credits: PersonCredit[] }
export const DEPT: Record<Role, string> = { cast: 'Acting', director: 'Directing', creator: 'Creating', writer: 'Writing' }

async function loadPerson(id: number): Promise<PersonData | null> {
  const { data, error } = await supabase.from('people')
    .select('id,name,profile_path,known_for,credits(role,character,title:titles(id,kind,title,year,runtime_min,seasons,poster_path,availability(service_id,leaves_on)))')
    .eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const p = data as unknown as PersonData
  p.credits = (p.credits ?? []).filter((c) => c.title).map((c) => ({ ...c, title: { ...c.title, availability: c.title.availability ?? [] } }))
  return p
}
/** The roles a person has titles in, in the page's order. */
export const rolesOf = (p: PersonData | null | undefined) => (Object.keys(DEPT) as Role[]).filter((r) => p?.credits.some((c) => c.role === r))
/** The role a person's page opens on: what they're known for, else the role with most titles. */
export function firstRole(p: PersonData | null | undefined): Role | undefined {
  const roles = rolesOf(p)
  const count = (r: Role) => p?.credits.filter((c) => c.role === r).length ?? 0
  return roles.find((r) => DEPT[r] === p?.known_for) ?? [...roles].sort((a, b) => count(b) - count(a))[0]
}
export const personPage = (id: number): Page<PersonData | null> => ({
  key: `person:${id}`, load: () => loadPerson(id), catalogue: true,
  // the portrait and the first three rows of posters, as the page opens (its first role, newest first)
  fold: (p) => {
    const role = firstRole(p)
    const first = (p?.credits ?? []).filter((c) => c.role === role).sort((a, b) => (b.title.year ?? 0) - (a.title.year ?? 0))
    return [{ src: tmdbImage(p?.profile_path ?? null, 'w185') }, ...first.slice(0, 9).map((c) => posterPicture(c.title.poster_path))]
  },
})

// ---- Browse ------------------------------------------------------------------
// The card is about 170px wide: w300 on ordinary screens, w780 on a 3x iPhone.
export const coverSrc = (path: string) => ({ src: tmdbImage(path, 'w780'), srcSet: `${tmdbImage(path, 'w300')} 300w, ${tmdbImage(path, 'w780')} 780w`, sizes: '50vw' })
/** The category covers as their cards ask for them, for the arrival to wait on. */
export const coverPictures = (covers: Record<string, string | null> | undefined, cats: { id: string }[]): Picture[] =>
  cats.map((c) => covers?.[c.id]).filter((p): p is string => !!p).map((p) => { const c = coverSrc(p); return { src: c.src, srcset: c.srcSet, sizes: c.sizes } })
// The saved card pictures are per set of categories: a new category makes the app look them up again, not wait a day.
export const coversPage: Page<Record<string, string | null>> = {
  key: `browse-covers:2:${CATEGORIES.map((c) => c.id).join(',').length}:${CATEGORIES.length}`, load: loadCovers, catalogue: true, fold: () => [],
}
/** A category's cards in a section (View all on a Browse section): the first eight cards' pictures. */
/** A category Browse shows for a type pill: one that has that type, and not one about a tag the member hides. */
export const fits = (c: Category, k: 'all' | Kind) => (k === 'all' || !c.only || c.only === k) && offered(c)
export const sectionCats = (section: SectionId, kind: 'all' | Kind) => CATEGORIES.filter((c) => c.section === section && fits(c, kind))
export const sectionPage = (section: SectionId, kind: 'all' | Kind): Page<Record<string, string | null>> => ({
  ...coversPage, fold: (covers) => coverPictures(covers, sectionCats(section, kind).slice(0, 8)),
})

/** A category's page: its first top picture, its title logo and the first row's first posters. Built from the
 *  member's services and Letterboxd films too, so it is looked up again when those change. */
export const categoryPage = (cat: Category, kind?: Kind): Page<CategoryPage> => ({
  key: `browse-cat:${cat.id}:${kind ?? 'all'}:d${dayNumber()}${hiddenKey()}`, load: () => loadCategory(cat, kind), catalogue: true, deps: ['services', 'letterboxd'],
  fold: (d) => [...titleArt(d?.hero[0]), { src: tmdbImage(d?.hero[0]?.logo_path, 'w500') },
    ...(d?.rows[0]?.items ?? []).slice(0, 3).map((c) => posterPicture(c.poster_path))],
})

/** What a grid page shows: a category's own list, or one of its rows. */
export const gridDef = (cat: Category, row: string, kind?: Kind): RowDef | undefined =>
  row === 'list' ? { id: listOf(cat).row, title: (kind && cat.labels?.[kind]) || cat.label, sort: cat.list ?? 'popular', kind: kind ?? cat.only, notes: cat.rule.leaving ? 'leaving' : undefined }
    : rowDef(cat, row, kind)
/** A grid (View all): four rows of posters, as a tall iPhone shows three and the top of a fourth. */
export const gridPage = (cat: Category, def: RowDef, row: string, kind: Kind | undefined, sort: Sort): Page<Card[]> => ({
  key: `browse-grid:${cat.id}:${row}:${kind ?? 'all'}:${sort}${hiddenKey()}`,
  // the row's own order unless another is picked; a Browse list in its own order (Hidden gems: highest rated)
  load: () => row === 'list'
    ? browseList(cat, listOf(cat).row, def.kind, sort === (cat.list ?? 'popular') ? listOf(cat).sort : sort)
    : browseList(cat, def.id, def.kind, sort === def.sort ? undefined : sort),
  catalogue: true, deps: ['services', 'letterboxd'], persist: false,
  fold: (cards) => (cards ?? []).slice(0, 12).map((c) => posterPicture(c.poster_path)),
})

/** A Browse list made of filters (Explore): one page of it and its totals. `ctx`: the member's services and watched
 *  films, used only when My services or Hide watched is on (so a list opened from a link has the same key as its preload). */
export const explorePage = (d: Draft, pick: Pick, ctx: { picked: string[]; seen: number[] } = { picked: [], seen: [] }): Page<ExplorePage> => ({
  key: exploreKey(d, pick, ctx),
  load: () => loadExplore(d, pick, ctx),
  catalogue: true, deps: ['services'], persist: false,
  fold: (p) => (p?.cards ?? []).slice(0, 12).map((c) => posterPicture(c.poster_path)),
})
/** Where a grid route starts when its list is made of filters. */
export const exploreStartOf = (r: Route): ExploreStart | null => {
  if (r.name === 'browse-titles') return ALL_TITLES
  if (r.name !== 'browse-grid') return null
  const cat = categoryOf(r.id)
  return cat ? exploreOf(cat, r.row, r.kind) : null
}

// ---- Routes ------------------------------------------------------------------
/** What a route loads, or null for one that loads nothing of its own (Settings, a tab). */
export function pageOf(r: Route): Page<unknown> | null {
  switch (r.name) {
    case 'title': return titlePage(r.id) as Page<unknown>
    case 'person': return personPage(r.id) as Page<unknown>
    case 'browse-section': return sectionPage(r.section, r.kind ?? 'all') as Page<unknown>
    case 'browse-category': { const cat = categoryOf(r.id); return cat ? categoryPage(cat, r.kind) as Page<unknown> : null }
    case 'browse-titles': return explorePage(ALL_TITLES.draft, ALL_TITLES.pick) as Page<unknown>
    case 'browse-grid': {
      const ex = exploreStartOf(r)
      if (ex) return explorePage(ex.draft, ex.pick) as Page<unknown>
      const cat = categoryOf(r.id)
      const def = cat && gridDef(cat, r.row, r.kind)
      return cat && def ? gridPage(cat, def, r.row, r.kind, def.sort ?? 'popular') as Page<unknown> : null
    }
    default: return null
  }
}
export const pageFor = (path: string) => pageOf(routeOf(path))

// Paths preloaded lately: opening one that wasn't is reported on staging (a link that forgot usePageLink).
const warmed = new Map<string, number>()
export const wasWarmed = (path: string) => Date.now() - (warmed.get(path) ?? 0) < 60 * 1000

/** Start loading a page and its pictures above the fold, before it opens. Safe to call often: it loads once. */
export function warmPage(path: string) {
  const page = pageFor(path)
  if (!page) return
  warmed.set(path, Date.now())
  const saved = readQueryData<unknown>(page.key)
  if (saved !== undefined) warmPictures(page.fold(saved))
  prefetch(page.key, () => page.load().then((data) => { warmPictures(page.fold(data)); return data }), page)
}

/** A page's content, read through its entry (null: nothing to load, e.g. an id that isn't a number). */
export function usePageQuery<T>(page: Page<T> | null): Query<T> {
  return useQuery<T>(page?.key ?? null, page ? page.load : () => Promise.reject(new Error('no page')), page ?? {})
}
