// What Home shows: a mix of what is happening on the member's services (new arrivals, trending, leaving soon)
// and what is theirs (their watchlist, films like the ones they rated highly, what friends liked), then a few
// rows that change from day to day. Every row is limited to the member's services when they have picked some.
// A title is shown once: a row skips what a row above it already has. A row needs three titles to be shown.
import { CATEGORIES, type Category } from './browse'
import { SERVICE_NAME, type Card } from './catalogue'
import { supabase } from './supabase'

export type HomeCard = Card & {
  runtime_min?: number | null
  /** why it is in the hero or the spotlight: "New on Netflix", "Leaves in 3 days", "Anna rated it 4.5" */
  reason?: string
  /** replaces the line under the poster: "Anna 4.5" */
  note?: string
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
export type HomeData = { hero: HomeCard[]; rows: HomeRow[] }
export type HomeAsk = {
  /** the member's services; empty: every service */
  services: string[]
  /** leave films they have logged out of recommendation rows */
  hide: boolean
  /** the catalogue titles they have logged (used when `hide`) */
  watched: number[]
}

/**
 * Raise this whenever what loadHome returns changes (rows, their order, the rules). It is part of the name Home's
 * content is saved under on the phone, so a new build never draws an older build's saved rows.
 */
export const HOME_VERSION = 8

const H = 'id,kind,title,year,poster_path,backdrop_path,logo_path,genres,seasons,runtime_min,availability!inner(service_id,leaves_on)'
type Kind = Card['kind']
type Res<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>

const today = () => new Date().toISOString().slice(0, 10)
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)
const YEAR = new Date().getFullYear()
/** A number that changes once a day, for the rows that rotate. */
const dayNumber = () => Math.floor(Date.now() / 864e5)
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
  const n = Math.round((Date.parse(day) - Date.parse(today())) / 864e5)
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

export async function loadHome(ask: HomeAsk): Promise<HomeData> {
  const svc = ask.services
  const mine = svc.length > 0
  // titles (and what is embedded under them) narrowed to the member's services
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const on = (q: any, path = 'availability.service_id') => (mine ? q.in(path, svc) : q)
  const titles = (kind: Kind) => on(supabase.from('titles').select(H).eq('kind', kind))
  const day = dayNumber()
  const rpcArgs = { p_services: mine ? svc : null, p_hide: ask.hide }

  type Arrival = { happened_on: string; service_id: string; title: Card & { popularity: number } }
  type Leaving = { leaves_on: string; service_id: string; title: Card }
  let arrivalsQ = supabase.from('availability_events').select(`happened_on,service_id,title:titles!inner(${H},popularity)`)
    .eq('event', 'added').gte('happened_on', inDays(-30)).order('happened_on', { ascending: false }).limit(200)
  let leavingQ = supabase.from('availability').select(`leaves_on,service_id,title:titles!inner(${H})`)
    .gte('leaves_on', today()).lte('leaves_on', inDays(30)).order('leaves_on').limit(60)
  if (mine) { arrivalsQ = arrivalsQ.in('service_id', svc); leavingQ = leavingQ.in('service_id', svc) }
  const themed = day % 2 === 0 ? 'awards' : 'gems'

  const [trendF, trendS, arrivals, leaving, saved, because, becauseAlt, friends, taste, newF, newS, theme, savedRecs, people] = await Promise.all([
    titles('film').not('trend_rank', 'is', null).order('trend_rank').limit(40).then(hard<Card[]>),
    titles('series').not('trend_rank', 'is', null).order('trend_rank').limit(40).then(hard<Card[]>),
    soft<Arrival>(on(arrivalsQ, 'title.availability.service_id') as never),
    soft<Leaving>(on(leavingQ, 'title.availability.service_id') as never),
    soft<{ title: Card }>(on(supabase.from('watchlist').select(`added_at,title:titles!inner(${H})`).order('added_at', { ascending: false }).limit(60), 'title.availability.service_id') as never),
    soft<{ source: string; title_id: number; rank: number }>(supabase.rpc('home_because', { p_day: day, ...rpcArgs }) as never),
    // a second liked film (tomorrow's), for the spotlight: it never repeats the row's reason
    soft<{ source: string; title_id: number; rank: number }>(supabase.rpc('home_because', { p_day: day + 1, ...rpcArgs }) as never),
    soft<{ title_id: number; name: string; rating: number }>(supabase.rpc('home_friends', rpcArgs) as never),
    soft<{ genre: string }>(supabase.rpc('home_taste') as never),
    soft<Card>(titles('film').gte('year', YEAR - 1).order('popularity', { ascending: false }).limit(25) as never),
    soft<Card>(titles('series').gte('year', YEAR - 1).order('popularity', { ascending: false }).limit(25) as never),
    themed === 'awards'
      ? soft<{ title: Card }>(on(supabase.from('awards').select(`year,title:titles!inner(${H})`).eq('won', true).order('year', { ascending: false }).limit(80), 'title.availability.service_id') as never).then((r) => r.map((x) => x.title))
      : soft<Card>(on(supabase.from('titles').select(`${H},scores!inner(imdb_rating,imdb_votes)`)).gte('scores.imdb_rating', 7.5).gte('scores.imdb_votes', 2000).lte('scores.imdb_votes', 30000)
        .order('scores(imdb_rating)', { ascending: false }).limit(40) as never),
    soft<{ source: string; source_id: number; title_id: number; rank: number }>(supabase.rpc('home_saved', { p_day: day, ...rpcArgs }) as never),
    soft<{ person_id: number; name: string; title_id: number }>(supabase.rpc('home_people', { p_day: day, ...rpcArgs }) as never),
  ])

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
  const byIds = (ids: number[]) => (ids.length ? soft<Card>(on(supabase.from('titles').select(H)).in('id', ids) as never) : Promise.resolve([] as Card[]))
  const genreRow = (c: Category) => Promise.all((['film', 'series'] as Kind[]).map((k) =>
    soft<Card>(titles(k).overlaps('genres', c.rule.genres ?? []).order('popularity', { ascending: false }).limit(25) as never)))
  // the second liked film only counts when it is a different film from the row's
  const alt = becauseAlt.length && because.length && becauseAlt[0].source !== because[0].source ? becauseAlt : []
  const savedIds = saved.map((s) => s.title?.id).filter((x): x is number => !!x)
  const [becauseCards, altCards, friendCards, savedRecCards, peopleCards, savedArrivals, decadeLists, ...genreLists] = await Promise.all([
    byIds(because.map((b) => b.title_id)), byIds(alt.map((b) => b.title_id)), byIds(friends.map((f) => f.title_id)),
    byIds(savedRecs.map((b) => b.title_id)), byIds(people.map((p) => p.title_id)),
    // saved titles that arrived on a service in the last 30 days
    savedIds.length ? soft<{ title_id: number; service_id: string }>(supabase.from('availability_events').select('title_id,service_id').eq('event', 'added')
      .gte('happened_on', inDays(-30)).in('title_id', savedIds) as never) : Promise.resolve([] as { title_id: number; service_id: string }[]),
    Promise.all((['film', 'series'] as Kind[]).map((k) =>
      soft<Card>(titles(k).gte('year', decade.rule.from!).lte('year', decade.rule.to!).order('popularity', { ascending: false }).limit(25) as never))),
    ...picks.map(genreRow),
  ])

  // ---- Rows, in order. `seen` holds what is already on the page. ----
  const seen = new Set<number>()
  const watched = new Set(ask.hide ? ask.watched : [])
  const take = (list: HomeCard[], max = 20, skipWatched = false): HomeCard[] => {
    const out: HomeCard[] = []
    for (const t of list) {
      if (!t || seen.has(t.id) || (skipWatched && watched.has(t.id))) continue
      seen.add(t.id); out.push(t)
      if (out.length >= max) break
    }
    return out
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
  const arrivedSaved = new Map(savedArrivals.map((a) => [a.title_id, a.service_id]))
  const small = (list: HomeCard[]) => (list.length >= 3 ? list.slice(0, 10) : [])
  const rowJustIn = small(playable.filter((t) => arrivedSaved.has(t.id)))
  rowJustIn.forEach((t) => seen.add(t.id))
  const isShort = (t: HomeCard) => t.kind === 'film' && !!t.runtime_min && t.runtime_min > 40 && t.runtime_min <= 100
  const rowTonight = small(playable.filter((t) => !seen.has(t.id) && isShort(t)))
  rowTonight.forEach((t) => seen.add(t.id))
  const savedCards = playable.filter((t) => !seen.has(t.id)).slice(0, 20)
  savedCards.forEach((t) => seen.add(t.id))
  const rowBecause = take([...becauseCards].sort((a, b) => (rankOf.get(a.id) ?? 99) - (rankOf.get(b.id) ?? 99)))
  const rowFriends = take(friends.map((f) => friendCards.find((c) => c.id === f.title_id)).filter((c): c is Card => !!c)
    .map((c) => ({ ...c, note: `${first(friendOf.get(c.id)!.name)} ${Number(friendOf.get(c.id)!.rating).toFixed(1)}` })))
  const savedRank = new Map(savedRecs.map((b) => [b.title_id, b.rank]))
  const rowSaved = take([...savedRecCards].sort((a, b) => (savedRank.get(a.id) ?? 99) - (savedRank.get(b.id) ?? 99)))
  const rowPeople = take(people.map((p) => peopleCards.find((c) => c.id === p.title_id)).filter((c): c is Card => !!c), 20, true)
  const rowNewF = take(newF)
  const rowNewS = take(newS)
  const rowTheme = take(theme, 20, true)
  const rowGenres = picks.map((c, i) => ({ c, items: take(mix(genreLists[i] as Card[][]), 20, true) }))
  const rowDecade = take(mix(decadeLists), 20, true)

  // ---- The hero: one from each kind of reason, as far as they have a wide picture ----
  const wide = (t: HomeCard | undefined) => !!t && !!t.backdrop_path
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

  // ---- The spotlight: up to six titles given room, each with its reason. Personal first (the watchlist's own
  // finds among them, whether or not their small rows are shown); never a hero title; each from a different reason. ----
  const inHero = new Set(hero.map((h) => h.id))
  const spots: HomeCard[] = []
  const spot = (list: HomeCard[], reason: (t: HomeCard) => string, n = 1) => {
    for (const t of list) {
      if (spots.length >= 6 || n <= 0) return
      if (!wide(t) || inHero.has(t.id) || spots.some((x) => x.id === t.id)) continue
      spots.push({ ...t, reason: reason(t) }); n--
    }
  }
  if (alt.length) spot(altList, () => altReason)
  const runtimeOf = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`)
  spot(playable.filter((t) => arrivedSaved.has(t.id)), (t) => `On your watchlist · now on ${svcName(arrivedSaved.get(t.id)!)}`)
  spot(rowFriends, (t) => `${first(friendOf.get(t.id)!.name)} rated it ${Number(friendOf.get(t.id)!.rating).toFixed(1)}`)
  spot(playable.filter(isShort), (t) => `On your watchlist · ${runtimeOf(t.runtime_min!)}`)
  spot(rowNew, (t) => `New on ${svcName(arrivedOn.get(t.id) ?? t.availability[0]?.service_id)}`)
  spot(rowTheme, () => (themed === 'awards' ? 'Award winner' : 'Hidden gem'))
  spot(rowLeaving, (t) => leavesIn(leavesOn.get(t.id)) ?? 'Leaving soon')
  spot(rowTrendS, () => 'Trending this week')
  spot(rowTrendF, () => 'Trending this week', 2)

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
    row('new', mine ? 'New on your services' : 'New this month', rowNew, arrived, '/browse/g/new-arrivals/list'),
    row('trending-films', 'Trending films', rowTrendF, trendF, '/browse/g/trending/list/film'),
    row('trending-series', 'Trending series', rowTrendS, trendS, '/browse/g/trending/list/series'),
    row('leaving', 'Leaving soon', rowLeaving, leaving, '/browse/g/leaving-soon/list', { notes: 'leaving' }),
    row('just-in', 'Now streaming from your watchlist', rowJustIn, rowJustIn, 'tab:watchlist'),
    row('watchlist', 'From your watchlist', savedCards, saved, 'tab:watchlist'),
    row('tonight', 'Short enough for tonight', rowTonight, rowTonight),
    row('because', because.length ? `Because you liked ${because[0].source}` : '', rowBecause, because),
    row('saved', savedRecs.length ? `Because you saved ${savedRecs[0].source}` : '', rowSaved, savedRecs),
    ...(spots.length >= 2 ? [{ id: 'spotlight', title: 'Picked for you', items: [], spotlight: spots }] : []),
    row('friends', 'Friends liked', rowFriends, friends),
    row('people', people.length ? `More with ${people[0].name}` : '', rowPeople, people, people.length ? `/person/${people[0].person_id}` : undefined),
    row('new-films', 'New films', rowNewF, newF, '/browse/g/new-releases/list/film'),
    row('new-series', 'New series', rowNewS, newS, '/browse/g/new-releases/list/series'),
    themed === 'awards' ? row('awards', 'Award winners', rowTheme, theme, '/browse/g/award-winners/list') : row('gems', 'Hidden gems', rowTheme, theme, '/browse/g/hidden-gems/list'),
    ...rowGenres.map(({ c, items }, i) => row(c.id, c.label, items, mix(genreLists[i] as Card[][]), `/browse/c/${c.id}`)),
    row(decade.id, decade.label, rowDecade, mix(decadeLists), `/browse/c/${decade.id}`),
  ]
  return { hero, rows: rows.filter((r) => r.spotlight || r.items.length >= 3).map((r) => ({ ...r, items: back(r.items) })) }
}
