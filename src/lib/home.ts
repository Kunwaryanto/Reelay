// What Home shows: a mix of what is happening on the member's services (new arrivals, trending, leaving soon)
// and what is theirs (their watchlist, films like the ones they rated highly, what friends liked), then a few
// rows that change from day to day. Every row is limited to the member's services when they have picked some.
// A title is shown once: a row skips what a row above it already has. A row needs three titles to be shown.
import { paths } from './routes'
import { CATEGORIES, type Category } from './browse'
import { MIN_ROW, SERVICE_NAME, namesLine, type Card } from './catalogue'
import { supabase } from './supabase'
import { suggestable } from './hidden'
import { dayNumber, daysUntil, localDay } from './days'

export type HomeCard = Card & {
  runtime_min?: number | null
  /** why it is in the hero or the spotlight: "New on Netflix", "Leaves in 3 days", "Anna rated it 4.5" */
  reason?: string
  /** replaces the line under the poster: "Anna 4.5" */
  note?: string
  /** the title page's picture (the spotlight's tall cards show it) */
  hero_path?: string | null
  hero_poster?: boolean | null
  imdb_rating?: number | null
  imdb_votes?: number | null
  /** the spotlight: who made it ("Directed by Celine Song", "Created by Vince Gilligan") */
  by?: string
  /** the spotlight: the service its bottom line names (the one it arrived on or leaves), when not its first */
  via?: string
}
export type HomeRow = {
  id: string
  title: string
  items: HomeCard[]
  notes?: 'leaving'
  /** where View all goes: a Browse page, or 'tab:watchlist'. Set only when the full list has more than the row
   *  shows (see `row` in loadHome), so a row that holds everything never offers it. */
  more?: string
  /** a row of large cards instead of posters, each with its reason */
  spotlight?: HomeCard[]
}
/** One title in the watchlist news under the hero: what arrived on the member's services in the last two weeks,
 *  then what leaves them within two weeks. `what`: "on Netflix", "leaves Viaplay in 3 days". */
export type NewsItem = { card: HomeCard; kind: 'arrived' | 'leaving'; what: string }
/** `partial`: only the generic rows (a quick Home, from the server's base) */
export type HomeData = { hero: HomeCard[]; news: NewsItem[]; rows: HomeRow[]; partial?: boolean }

/** The line as shown, from the news the member hasn't seen: an arrival goes once seen (opened), something leaving
 *  stays until it leaves; anything they have watched goes. Null: no line. */
export function newsLine(news: NewsItem[], seen: ReadonlySet<number>, watched: ReadonlySet<number>) {
  const items = news.filter((n) => !watched.has(n.card.id) && !(n.kind === 'arrived' && seen.has(n.card.id)))
  if (!items.length) return null
  const arrived = items.filter((n) => n.kind === 'arrived').length
  const going = items.length - arrived
  return {
    /** "2 just arrived", "Just arrived", "Leaving soon", "3 leaving soon" */
    head: arrived ? (arrived === 1 ? 'Just arrived' : `${arrived} just arrived`) : going === 1 ? 'Leaving soon' : `${going} leaving soon`,
    /** "Dune: Part Two on Netflix · The Holdovers leaves Viaplay in 3 days" */
    sub: items.map((n) => `${n.card.title} ${n.what}`).join(' · '),
    /** the posters, up to three, in the order of the line */
    cards: items.slice(0, 3).map((n) => n.card),
    /** every title in the line: tapping it counts as seeing them all */
    ids: items.map((n) => n.card.id),
    /** one title: its page; more: the Watchlist tab */
    to: items.length === 1 ? items[0].card.id : ('tab:watchlist' as const),
  }
}
export type HomeAsk = {
  /** the member's services; empty: every service */
  services: string[]
  /** leave films they have logged out of recommendation rows */
  hide: boolean
  /** the catalogue titles they have logged (used when `hide`) */
  watched: number[]
  /** tags they don't want suggested (Settings › Suggestions): left out of everything but their watchlist */
  hidden: string[]
}

/**
 * Raise this whenever what loadHome returns changes (rows, their order, the rules). It is part of the name Home's
 * content is saved under on the phone, so a new build never draws an older build's saved rows.
 */
export const HOME_VERSION = 18

const H = 'id,kind,title,year,poster_path,backdrop_path,logo_path,hero_path,hero_poster,imdb_rating,imdb_votes,genres,seasons,runtime_min,availability!inner(service_id,leaves_on)'
type Kind = Card['kind']

/** "Anna rated it 4.5", "Anna and Erik liked it", "Anna and 2 friends liked it" */
function friendsLine(rows: { name: string; rating: number }[]): string {
  const first = (n: string) => n.trim().split(/\s+/)[0] || n
  const names = [...new Set(rows.map((r) => first(r.name)))]
  if (names.length <= 1) return `${names[0] ?? 'A friend'} rated it ${Number(rows[0]?.rating ?? 0).toFixed(1)}`
  return names.length === 2 ? `${names[0]} and ${names[1]} liked it` : `${names[0]} and ${names.length - 1} friends liked it`
}
/** "Leaves today", "… tomorrow", "… on Friday" (within the week), "… on 12 Dec": the service is on the card's
 *  bottom line (`leavingVia`), so the reason doesn't name it */
function leavingLine(day: string | undefined): string {
  if (!day) return 'Leaving soon'
  const n = daysUntil(day)
  const d = new Date(`${day}T12:00:00`)
  const when = n <= 0 ? 'today' : n === 1 ? 'tomorrow' : n <= 6 ? `on ${d.toLocaleDateString('en-GB', { weekday: 'long' })}` : `on ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
  return `Leaves ${when}`
}
const leavingVia = (t: Card, day: string | undefined) => t.availability.find((a) => a.leaves_on === day)?.service_id
/** "March", or "March 2025" for an earlier year */
function monthOf(at: string): string {
  const d = new Date(at)
  return d.toLocaleDateString('en-GB', d.getFullYear() === new Date().getFullYear() ? { month: 'long' } : { month: 'long', year: 'numeric' })
}
// The picks of earlier days, kept on the phone for a week: they step aside so the picks change from day to day.
const SPOT_KEY = 'reelay.spot-shown'
function spotHistory(): Set<number> {
  try {
    const all = JSON.parse(localStorage.getItem(SPOT_KEY) ?? '{}') as Record<string, string>
    const today = localDay(), weekAgo = localDay(-7)
    return new Set(Object.entries(all).filter(([, day]) => day !== today && day >= weekAgo).map(([id]) => Number(id)))
  } catch { return new Set() }
}
function noteSpots(ids: number[]) {
  try {
    const all = JSON.parse(localStorage.getItem(SPOT_KEY) ?? '{}') as Record<string, string>
    const today = localDay(), weekAgo = localDay(-7)
    for (const id of ids) if (!all[id] || all[id] < weekAgo) all[id] = today
    for (const [id, day] of Object.entries(all)) if (day < weekAgo) delete all[id]
    localStorage.setItem(SPOT_KEY, JSON.stringify(all))
  } catch { /* private mode */ }
}
type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>

const today = () => localDay()
const inDays = localDay
const YEAR = new Date().getFullYear()
const svcName = (id: string) => SERVICE_NAME[id] ?? id

/** A row that fails to load is left out; it never takes the page with it. */
const soft = <T,>(p: Res<T[]>): Promise<T[]> => Promise.resolve(p).then((r) => (r.error ? [] : r.data ?? []), () => [])
/** The page's base (the first rows) must load: without it there is nothing to show. */
function hard<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message)
  return r.data as T
}

function leavesIn(day: string | null | undefined): string | null {
  if (!day) return null
  const n = daysUntil(day)
  if (n < 0 || n > 30) return null
  return n === 0 ? 'Leaves today' : n === 1 ? 'Leaves tomorrow' : `Leaves in ${n} days`
}

/** The genre categories of Browse, the member's best-rated genres first when they have ratings. */
function genreOrder(taste: { genre: string }[]): Category[] {
  const all = CATEGORIES.filter((c) => c.section === 'genres' && !c.only)
  const liked: Category[] = []
  for (const t of taste) {
    const c = all.find((x) => x.rule.genres?.includes(t.genre))
    if (c && !liked.includes(c)) liked.push(c)
  }
  // with ratings: their top five take turns; without: every genre takes its turn
  return liked.length >= 3 ? liked.slice(0, 5) : all
}
const DECADES = CATEGORIES.filter((c) => c.section === 'decades' && (c.rule.from ?? 0) >= 1980 && (c.rule.from ?? 0) <= 2010)

/** The generic part of Home, built on the server per set of services (home_base): a phone with no Home saved
 *  shows it at once and builds the whole Home after, out of sight. */
type Base = {
  trendF: Card[]; trendS: Card[]; newF: Card[]; newS: Card[]
  arrivals: { happened_on: string; service_id: string; title: Card & { popularity: number } }[]
  leaving: { leaves_on: string; service_id: string; title: Card }[]
}

/**
 * Home for the member. `quick`: only the rows everybody gets (trending, new on their services, leaving soon, new
 * films and series), from the ready-made base in one request, fitted to the member here (their hidden tags);
 * for a first Home, while the whole one is built. Without a base it builds the whole Home.
 */
export async function loadHome(ask: HomeAsk, opts: { quick?: boolean } = {}): Promise<HomeData> {
  const svc = ask.services
  const mine = svc.length > 0
  // titles (and what is embedded under them) narrowed to the member's services
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const on = (q: any, path = 'availability.service_id') => (mine ? q.in(path, svc) : q)
  // titles with a tag the member hides are not suggested: `title` for a query that has the title embedded
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ok = (q: any, path?: string) => suggestable(q, ask.hidden, path)
  const titles = (kind: Kind) => ok(on(supabase.from('titles').select(H).eq('kind', kind)))
  const day = dayNumber()
  const rpcArgs = { p_services: mine ? svc : null, p_hide: ask.hide }

  type Arrival = { happened_on: string; service_id: string; title: Card & { popularity: number } }
  type Leaving = { leaves_on: string; service_id: string; title: Card }
  let arrivalsQ = supabase.from('availability_events').select(`happened_on,service_id,title:titles!inner(${H},popularity)`)
    .eq('event', 'added').gte('happened_on', inDays(-30)).order('happened_on', { ascending: false }).limit(200)
  let leavingQ = supabase.from('availability').select(`leaves_on,service_id,title:titles!inner(${H})`)
    .gte('leaves_on', today()).lte('leaves_on', inDays(30)).order('leaves_on').limit(60)
  if (mine) { arrivalsQ = arrivalsQ.in('service_id', svc); leavingQ = leavingQ.in('service_id', svc) }
  // An award row every day, taking turns by day between these (all well over 7 titles on a usual set of services);
  // Hidden gems every other day.
  const AWARD_ROWS = [
    { id: 'oscar-winners', title: 'Oscar winners', award: 'Oscars' },
    { id: 'emmy-winners', title: 'Emmy-winning series', award: 'Emmys', kind: 'series' as Kind },
    { id: 'best-picture', title: 'Best Picture winners', award: 'Oscars', category: 'Best Picture' },
    { id: 'globe-winners', title: 'Golden Globe winners', award: 'Golden Globes' },
  ]
  const awardRow = AWARD_ROWS[day % AWARD_ROWS.length]
  const gemsDay = day % 2 === 1
  let awardsQ = supabase.from('awards').select(`award,short_category,rank,year,title:titles!inner(${H})`).eq('won', true).eq('award', awardRow.award)
  if (awardRow.category) awardsQ = awardsQ.eq('category', awardRow.category)
  if (awardRow.kind) awardsQ = awardsQ.eq('title.kind', awardRow.kind)

  let base: Base | null = null
  if (opts.quick) {
    const r = await supabase.rpc('home_base', { p_services: mine ? svc : null })
    if (!r.error && r.data) base = r.data as Base
  }
  const fits = (c: Card | undefined) => !!c && !c.tags?.some((t) => ask.hidden.includes(t))
  const fetched = base ? [
    base.trendF.filter(fits).slice(0, 40), base.trendS.filter(fits).slice(0, 40),
    base.arrivals.filter((a) => fits(a.title)), base.leaving.filter((l) => fits(l.title)).slice(0, 60),
    [], [], [], [], [], base.newF.filter(fits).slice(0, 25), base.newS.filter(fits).slice(0, 25), [], [], [], [],
  ] : null
  const all = base ? null : Promise.all([
    titles('film').not('trend_rank', 'is', null).order('trend_rank').limit(40).then(hard<Card[]>),
    titles('series').not('trend_rank', 'is', null).order('trend_rank').limit(40).then(hard<Card[]>),
    soft<Arrival>(ok(on(arrivalsQ, 'title.availability.service_id'), 'title') as never),
    soft<Leaving>(ok(on(leavingQ, 'title.availability.service_id'), 'title') as never),
    soft<{ title: Card; added_at?: string }>(on(supabase.from('watchlist').select(`added_at,title:titles!inner(${H})`).order('added_at', { ascending: false }).limit(60), 'title.availability.service_id') as never),
    soft<{ source: string; title_id: number; rank: number }>(supabase.rpc('home_because', { p_day: day, ...rpcArgs }) as never),
    // a second liked film (tomorrow's), for the spotlight: it never repeats the row's reason
    soft<{ source: string; title_id: number; rank: number }>(supabase.rpc('home_because', { p_day: day + 1, ...rpcArgs }) as never),
    soft<{ title_id: number; name: string; rating: number }>(supabase.rpc('home_friends', rpcArgs) as never),
    soft<{ genre: string }>(supabase.rpc('home_taste') as never),
    soft<Card>(titles('film').gte('year', YEAR - 1).order('popularity', { ascending: false }).limit(25) as never),
    soft<Card>(titles('series').gte('year', YEAR - 1).order('popularity', { ascending: false }).limit(25) as never),
    // best category first, newest first within it
    soft<{ award: string; short_category: string; rank: number; year: number; title: Card }>(ok(on(awardsQ.order('rank').order('year', { ascending: false }).limit(300), 'title.availability.service_id'), 'title') as never),
    // the IMDb rating and votes are on the title (kept in step with scores), so this reads in rating order
    gemsDay ? soft<Card>(ok(on(supabase.from('titles').select(H))).gte('imdb_rating', 7.5).gte('imdb_votes', 2000).lte('imdb_votes', 30000)
        .order('imdb_rating', { ascending: false }).limit(40) as never) : Promise.resolve([] as Card[]),
    soft<{ source: string; source_id: number; title_id: number; rank: number }>(supabase.rpc('home_saved', { p_day: day, ...rpcArgs }) as never),
    soft<{ person_id: number; name: string; title_id: number }>(supabase.rpc('home_people', { p_day: day, ...rpcArgs }) as never),
  ])
  const [trendF, trendS, arrivals, leaving, saved, because, becauseAlt, friends, taste, newF, newS, awardWins, theme, savedRecs, people] =
    all ? await all : (fetched as unknown as NonNullable<Awaited<typeof all>>)

  // second step: the titles behind the two personal lists, and the rows that depend on the member's taste
  // taste: the genres the member rates highest; without enough ratings, the genres they save most
  const savedTaste = (() => {
    const n = new Map<string, number>()
    for (const s of saved) for (const g of s.title?.genres ?? []) n.set(g, (n.get(g) ?? 0) + 1)
    return [...n].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([genre]) => ({ genre }))
  })()
  const genres = genreOrder(taste.length >= 3 ? taste : [...taste, ...savedTaste.filter((g) => !taste.some((t) => t.genre === g.genre))])
  const picks = [genres[day % genres.length], genres[(day + 1) % genres.length]].filter((c, i, a) => a.indexOf(c) === i)
  const decade = DECADES[day % DECADES.length]
  const byIds = (ids: number[]) => (ids.length ? soft<Card>(ok(on(supabase.from('titles').select(H))).in('id', ids) as never) : Promise.resolve([] as Card[]))
  const genreRow = (c: Category) => Promise.all((['film', 'series'] as Kind[]).map((k) =>
    soft<Card>(titles(k).overlaps('genres', c.rule.genres ?? []).order('popularity', { ascending: false }).limit(25) as never)))
  // the second liked film only counts when it is a different film from the row's
  const alt = becauseAlt.length && because.length && becauseAlt[0].source !== because[0].source ? becauseAlt : []
  const savedIds = saved.map((s) => s.title?.id).filter((x): x is number => !!x)
  // saved titles that arrived on one of the member's services in the last 30 days, newest first
  type SavedArrival = { title_id: number; service_id: string; happened_on: string }
  let savedArrivalsQ = supabase.from('availability_events').select('title_id,service_id,happened_on').eq('event', 'added')
    .gte('happened_on', inDays(-30)).in('title_id', savedIds).order('happened_on', { ascending: false })
  if (mine) savedArrivalsQ = savedArrivalsQ.in('service_id', svc)
  const [becauseCards, altCards, friendCards, savedRecCards, peopleCards, savedArrivals, decadeLists, ...genreLists] = base
    ? [[], [], [], [], [], [], [[], []], ...picks.map(() => [[], []])] as unknown as [Card[], Card[], Card[], Card[], Card[], SavedArrival[], Card[][], ...Card[][][]]
    : await Promise.all([
    byIds(because.map((b) => b.title_id)), byIds(alt.map((b) => b.title_id)), byIds(friends.map((f) => f.title_id)),
    byIds(savedRecs.map((b) => b.title_id)), byIds(people.map((p) => p.title_id)),
    savedIds.length ? soft<SavedArrival>(savedArrivalsQ as never) : Promise.resolve([] as SavedArrival[]),
    Promise.all((['film', 'series'] as Kind[]).map((k) =>
      soft<Card>(titles(k).gte('year', decade.rule.from!).lte('year', decade.rule.to!).order('popularity', { ascending: false }).limit(25) as never))),
    ...picks.map(genreRow),
  ])

  // ---- Rows, in order. `seen` holds what is already on the page. ----
  const seen = new Set<number>()
  const watched = new Set(ask.hide ? ask.watched : [])
  // A row takes the titles the page hasn't shown yet first, then fills up with ones another row already has (never
  // in its first places, see `back`), so rows stay full. It needs FIRST new titles to be a row of its own.
  const fresh = new WeakMap<HomeCard[], number>()
  const take = (list: HomeCard[], max = 20, skipWatched = false): HomeCard[] => {
    const out: HomeCard[] = [], again: HomeCard[] = []
    for (const t of list) {
      if (!t || (skipWatched && watched.has(t.id)) || out.some((x) => x.id === t.id) || again.some((x) => x.id === t.id)) continue
      if (seen.has(t.id)) again.push(t)
      else if (out.length < max) { seen.add(t.id); out.push(t) }
    }
    const items = [...out, ...again].slice(0, max)
    fresh.set(items, out.length)
    return items
  }
  /** films and series in turn */
  const mix = (lists: Card[][]): Card[] => {
    const out: Card[] = []
    for (let i = 0; i < Math.max(...lists.map((l) => l.length), 0); i++) for (const l of lists) if (l[i]) out.push(l[i])
    return out
  }

  // newest day first; within a day, the best known first
  const arrived = arrivals.filter((a) => a.title && a.happened_on).sort((a, b) => b.happened_on.localeCompare(a.happened_on) || (b.title.popularity ?? 0) - (a.title.popularity ?? 0))
  const arrivedOn = new Map<number, string>()
  for (const a of arrived) if (!arrivedOn.has(a.title.id)) arrivedOn.set(a.title.id, a.service_id)
  const leavesOn = new Map<number, string>()
  for (const l of leaving) if (l.title && l.leaves_on && !leavesOn.has(l.title.id)) leavesOn.set(l.title.id, l.leaves_on)
  const friendOf = new Map(friends.map((f) => [f.title_id, f]))
  const rankOf = new Map(because.map((b) => [b.title_id, b.rank]))
  const first = (name: string) => name.trim().split(/\s+/)[0] || name

  const rowNew = take(arrived.map((a) => a.title))
  const rowTrendF = take(trendF)
  const rowTrendS = take(trendS)
  const rowLeaving = take(leaving.map((l) => l.title).filter(Boolean))
  // The watchlist is the member's own list: everything of theirs that can be played, leaving first. Two small
  // rows look at it another way (up to 10 each, shown from 3): what just arrived, and films short enough for an
  // evening. A title in one of those isn't repeated in the main row.
  const playable: HomeCard[] = saved.map((s) => s.title).filter(Boolean)
    .sort((a, b) => (leavesOn.get(a.id) ?? '9').localeCompare(leavesOn.get(b.id) ?? '9'))
  const arrivedSaved = new Map<number, string>()
  for (const a of savedArrivals) if (!arrivedSaved.has(a.title_id)) arrivedSaved.set(a.title_id, a.service_id)
  const isShort = (t: HomeCard) => t.kind === 'film' && !!t.runtime_min && t.runtime_min > 40 && t.runtime_min <= 100
  // What just arrived from it leads the row, with a note saying where; the rest follow, leaving first. (Runtimes are
  // under every poster now, so short films need no row of their own; the spotlight still picks one for tonight.)
  const savedCards: HomeCard[] = [
    ...playable.filter((t) => arrivedSaved.has(t.id)).map((t) => ({ ...t, note: `Now on ${svcName(arrivedSaved.get(t.id)!)}` })),
    ...playable.filter((t) => !arrivedSaved.has(t.id)),
  ].slice(0, 20)

  // ---- Watchlist news: one line under the hero, in place of a row of the whole watchlist ----
  const recent = inDays(-14), soon = inDays(14)
  const news: NewsItem[] = []
  for (const a of savedArrivals) {
    const t = playable.find((x) => x.id === a.title_id)
    if (t && a.happened_on >= recent && !news.some((n) => n.card.id === t.id)) news.push({ card: t, kind: 'arrived', what: `on ${svcName(a.service_id)}` })
  }
  const going: (NewsItem & { on: string })[] = []
  for (const t of playable) {
    if (news.some((n) => n.card.id === t.id)) continue
    const l = t.availability.filter((a) => a.leaves_on && a.leaves_on >= today() && a.leaves_on <= soon).sort((a, b) => a.leaves_on!.localeCompare(b.leaves_on!))[0]
    const when = l && leavesIn(l.leaves_on)
    if (when) going.push({ card: t, kind: 'leaving', what: when.replace('Leaves', `leaves ${svcName(l.service_id)}`), on: l.leaves_on! })
  }
  going.sort((a, b) => a.on.localeCompare(b.on))
  for (const { on: _on, ...n } of going) news.push(n)
  const rowBecause = take([...becauseCards].sort((a, b) => (rankOf.get(a.id) ?? 99) - (rankOf.get(b.id) ?? 99)))
  const rowFriends = take(friends.map((f) => friendCards.find((c) => c.id === f.title_id)).filter((c): c is Card => !!c)
    .map((c) => ({ ...c, note: `${first(friendOf.get(c.id)!.name)} ${Number(friendOf.get(c.id)!.rating).toFixed(1)}` })))
  const savedRank = new Map(savedRecs.map((b) => [b.title_id, b.rank]))
  const rowSaved = take([...savedRecCards].sort((a, b) => (savedRank.get(a.id) ?? 99) - (savedRank.get(b.id) ?? 99)))
  const rowPeople = take(people.map((p) => peopleCards.find((c) => c.id === p.title_id)).filter((c): c is Card => !!c), 20, true)
  const rowNewF = take(newF)
  const rowNewS = take(newS)
  const rowTheme = take(theme, 20, true)
  // each title once, under it its top category in this award and how many more it won there: "Best Picture +3"
  const awardCards: HomeCard[] = []
  const wins = new Map<number, { top: string; n: number; line: string }>()
  for (const w of awardWins) {
    if (!w.title) continue
    const got = wins.get(w.title.id)
    if (got) got.n++
    else { wins.set(w.title.id, { top: w.short_category, n: 1, line: `${w.short_category} · ${w.award} ${w.year}` }); awardCards.push(w.title) }
  }
  const rowAwards = take(awardCards.map((t) => ({ ...t, note: `${wins.get(t.id)!.top}${wins.get(t.id)!.n > 1 ? ` +${wins.get(t.id)!.n - 1}` : ''}` })), 20, true)
  const rowGenres = picks.map((c, i) => ({ c, items: take(mix(genreLists[i] as Card[][]), 20, true) }))
  const rowDecade = take(mix(decadeLists), 20, true)

  // ---- The hero: one from each kind of reason, as far as they have a wide picture ----
  const wide = (t: HomeCard | undefined) => !!t && !!t.backdrop_path
  // the spotlight's tall cards: the title page's picture, or a wide one to crop
  const tall = (t: HomeCard | undefined) => !!t && (!!t.hero_path || !!t.backdrop_path)
  const watchedAll = new Set(ask.watched)
  // the spotlight's reasons don't name the service: the card's bottom line always does (`via`)
  const newLine = (t: HomeCard) => {
    const on = arrived.find((a) => a.title.id === t.id)?.happened_on
    return on && daysUntil(on) >= -6 ? 'New this week' : 'New this month'
  }
  const hero: HomeCard[] = []
  const lead = (t: HomeCard | undefined, reason: string) => { if (wide(t) && !hero.some((h) => h.id === t!.id) && hero.length < 7) hero.push({ ...t!, reason }) }
  const newest = rowNew.find(wide)
  lead(newest, newest ? `New on ${svcName(arrivedOn.get(newest.id) ?? newest.availability[0]?.service_id)}` : '')
  const savedLead = savedCards.find(wide)
  lead(savedLead, savedLead ? leavesIn(leavesOn.get(savedLead.id)) ?? 'On your watchlist' : '')
  lead(rowTrendF.find(wide), 'Trending film this week')
  lead(rowTrendS.find(wide), 'Trending series this week')
  const altRank = new Map(alt.map((b) => [b.title_id, b.rank]))
  const altList: HomeCard[] = [...altCards].sort((a, b) => (altRank.get(a.id) ?? 99) - (altRank.get(b.id) ?? 99))
  const altReason = alt.length ? `Because you liked ${alt[0].source}` : ''
  // (no "Because you liked" in the hero: the row has one liked film and the spotlight another, each named once)
  const friendLead = rowFriends.find(wide)
  if (friendLead) { const f = friendOf.get(friendLead.id)!; lead(friendLead, `${first(f.name)} rated it ${Number(f.rating).toFixed(1)}`) }
  const goingLead = rowLeaving.find(wide)
  lead(goingLead, goingLead ? leavesIn(leavesOn.get(goingLead.id)) ?? 'Leaving soon' : '')
  // a thin day: fill up from trending so the hero is never one slide
  for (const t of mix([rowTrendF, rowTrendS])) if (hero.length < 5) lead(t, t.kind === 'film' ? 'Trending film this week' : 'Trending series this week')

  // ---- Tonight's picks (the spotlight): up to six titles given room, each from a different reason and each worth
  // an evening. Personal first (films like one they loved, their watchlist's news, friends), then what is timely
  // (leaving, just arrived), then discovery (awards, hidden gems, trending). Never a hero title, never one they have
  // logged; a discovery pick needs a decent rating; and what was picked on an earlier day steps aside for a week
  // (unless it is leaving), so the picks change from day to day. ----
  const inHero = new Set(hero.map((h) => h.id))
  const shownBefore = spotHistory()
  const spots: HomeCard[] = []
  const decent = (t: HomeCard) => t.imdb_rating == null || t.imdb_rating >= 6.5
  const spot = (list: HomeCard[], reason: (t: HomeCard) => string, opts: { n?: number; bar?: boolean; again?: boolean; via?: (t: HomeCard) => string | undefined } = {}) => {
    let n = opts.n ?? 1
    for (const t of list) {
      if (spots.length >= 6 || n <= 0) return
      if (!tall(t) || inHero.has(t.id) || spots.some((x) => x.id === t.id) || watchedAll.has(t.id)) continue
      if (opts.bar && !decent(t)) continue
      if (!opts.again && shownBefore.has(t.id)) continue
      spots.push({ ...t, reason: reason(t), via: opts.via?.(t) }); n--
    }
  }
  if (alt.length) spot(altList, () => altReason)
  spot(playable.filter((t) => arrivedSaved.has(t.id)), () => 'Just arrived', { again: true, via: (t) => arrivedSaved.get(t.id) })
  spot(rowFriends, (t) => friendsLine(friends.filter((f) => f.title_id === t.id)))
  const since = new Map(saved.filter((x) => x.title && x.added_at).map((x) => [x.title.id, x.added_at!]))
  const longSaved = playable.filter((t) => since.has(t.id) && daysUntil(since.get(t.id)!.slice(0, 10)) <= -45)
  spot(longSaved, (t) => `On your watchlist since ${monthOf(since.get(t.id)!)}`)
  // the length itself is on the card's bottom line; exactly 100 minutes isn't "under"
  spot(playable.filter((t) => isShort(t) && t.runtime_min! < 100), () => 'Under 100 minutes')
  spot(rowLeaving, (t) => leavingLine(leavesOn.get(t.id)), { bar: true, again: true, via: (t) => leavingVia(t, leavesOn.get(t.id)) })
  spot(rowNew, (t) => newLine(t), { bar: true, via: (t) => arrivedOn.get(t.id) })
  spot(rowAwards, (t) => wins.get(t.id)!.line, { bar: true })
  spot(rowTheme, (t) => (t.imdb_rating ? `Few have seen it · IMDb ${Number(t.imdb_rating).toFixed(1)}` : 'A hidden gem'))
  spot(rowTrendS, () => 'Everyone’s watching it this week', { bar: true })
  spot(rowTrendF, () => 'Everyone’s watching it this week', { bar: true, n: 2 })
  // a thin day: the same reasons again, with titles picked before
  if (spots.length < 3) {
    spot(rowNew, (t) => newLine(t), { bar: true, again: true, via: (t) => arrivedOn.get(t.id) })
    spot(rowTrendF, () => 'Everyone’s watching it this week', { bar: true, again: true, n: 2 })
  }
  noteSpots(spots.map((t) => t.id))
  // who made each: "Directed by", "Created by" (one small request, for the picks only)
  if (spots.length) {
    type By = { title_id: number; role: string; person: { name: string } | null }
    const by = await soft<By>(supabase.from('credits').select('title_id,role,person:people(name)').in('title_id', spots.map((t) => t.id))
      .in('role', ['director', 'creator']).order('sort_order') as never)
    for (const t of spots) {
      const names = by.filter((b) => b.title_id === t.id && b.role === (t.kind === 'film' ? 'director' : 'creator') && b.person).map((b) => b.person!.name)
      if (names.length) t.by = `${t.kind === 'film' ? 'Directed by' : 'Created by'} ${namesLine([...new Set(names)])}`
    }
  }

  // A featured title (in the hero or the spotlight) can be in a row too, but not in its first four places: it is
  // moved back to just after them, so each row starts with something the page hasn't shown yet.
  const featured = new Set([...inHero, ...spots.map((t) => t.id)])
  const FIRST = 4
  const back = (items: HomeCard[]) => {
    const head: HomeCard[] = [], moved: HomeCard[] = [], tail: HomeCard[] = []
    for (const t of items) {
      if (head.length < FIRST) (featured.has(t.id) ? moved : head).push(t)
      else tail.push(t)
    }
    return [...head, ...moved, ...tail]
  }

  // Each row: its titles, the whole list they were taken from, and where that list opens. View all is offered
  // only when the list holds more than the row shows; a row that has everything doesn't get one.
  const row = (id: string, title: string, items: HomeCard[], from: { length: number }, to?: string, extra: Partial<HomeRow> = {}): HomeRow =>
    ({ id, title, items, ...(to && from.length > items.length ? { more: to } : {}), ...extra })
  const rows: HomeRow[] = [
    row('new', mine ? 'New on your services' : 'New this month', rowNew, arrived, paths.grid('new-arrivals', 'list')),
    row('trending-films', 'Trending films', rowTrendF, trendF, paths.grid('trending', 'list', 'film')),
    row('trending-series', 'Trending series', rowTrendS, trendS, paths.grid('trending', 'list', 'series')),
    row('leaving', 'Leaving soon', rowLeaving, leaving, paths.grid('leaving-soon', 'list'), { notes: 'leaving' }),
    row('because', because.length ? `Because you liked ${because[0].source}` : '', rowBecause, because),
    row('saved', savedRecs.length ? `Because you saved ${savedRecs[0].source}` : '', rowSaved, savedRecs),
    ...(spots.length >= 2 ? [{ id: 'spotlight', title: 'Picked for you', items: [], spotlight: spots }] : []),
    row('friends', 'Friends liked', rowFriends, friends),
    row('people', people.length ? `More with ${people[0].name}` : '', rowPeople, people, people.length ? paths.person(people[0].person_id) : undefined),
    row('new-films', 'New films', rowNewF, newF, paths.grid('new-releases', 'list', 'film')),
    row('new-series', 'New series', rowNewS, newS, paths.grid('new-releases', 'list', 'series')),
    row(awardRow.id, awardRow.title, rowAwards, awardCards, paths.grid('award-winners', 'list')),
    row('gems', 'Hidden gems', rowTheme, theme, paths.grid('hidden-gems', 'list')),
    ...rowGenres.map(({ c, items }, i) => row(c.id, c.label, items, mix(genreLists[i] as Card[][]), paths.category(c.id))),
    row(decade.id, decade.label, rowDecade, mix(decadeLists), paths.category(decade.id)),
  ]
  const full = (r: HomeRow) => r.items.length >= MIN_ROW && (fresh.get(r.items) ?? r.items.length) >= FIRST
  return { hero, news, rows: rows.filter((r) => r.spotlight || full(r)).map((r) => ({ ...r, items: back(r.items) })), ...(base ? { partial: true } : {}) }
}
