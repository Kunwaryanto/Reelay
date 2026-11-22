// What Home shows: a mix of what is happening on the member's services (new arrivals, trending, leaving soon)
// and what is theirs (their watchlist, films like the ones they rated highly, what friends liked), then a few
// rows that change from day to day. Every row is limited to the member's services when they have picked some.
// A title is shown once: a row skips what a row above it already has. A row needs three titles to be shown.
import { CATEGORIES, type Category } from './browse'
import { SERVICE_NAME, type Card } from './catalogue'
import { supabase } from './supabase'

export type HomeCard = Card & {
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
  /** the Browse page with the whole list, for View all */
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

const H = 'id,kind,title,year,poster_path,backdrop_path,logo_path,genres,seasons,availability!inner(service_id,leaves_on)'
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

  const [trendF, trendS, arrivals, leaving, saved, because, friends, taste, newF, newS, theme] = await Promise.all([
    titles('film').not('trend_rank', 'is', null).order('trend_rank').limit(20).then(hard<Card[]>),
    titles('series').not('trend_rank', 'is', null).order('trend_rank').limit(20).then(hard<Card[]>),
    soft<Arrival>(on(arrivalsQ, 'title.availability.service_id') as never),
    soft<Leaving>(on(leavingQ, 'title.availability.service_id') as never),
    soft<{ title: Card }>(on(supabase.from('watchlist').select(`added_at,title:titles!inner(${H})`).order('added_at', { ascending: false }).limit(60), 'title.availability.service_id') as never),
    soft<{ source: string; title_id: number; rank: number }>(supabase.rpc('home_because', { p_day: day, ...rpcArgs }) as never),
    soft<{ title_id: number; name: string; rating: number }>(supabase.rpc('home_friends', rpcArgs) as never),
    soft<{ genre: string }>(supabase.rpc('home_taste') as never),
    soft<Card>(titles('film').gte('year', YEAR - 1).order('popularity', { ascending: false }).limit(25) as never),
    soft<Card>(titles('series').gte('year', YEAR - 1).order('popularity', { ascending: false }).limit(25) as never),
    themed === 'awards'
      ? soft<{ title: Card }>(on(supabase.from('awards').select(`year,title:titles!inner(${H})`).eq('won', true).order('year', { ascending: false }).limit(80), 'title.availability.service_id') as never).then((r) => r.map((x) => x.title))
      : soft<Card>(on(supabase.from('titles').select(`${H},scores!inner(imdb_rating,imdb_votes)`)).gte('scores.imdb_rating', 7.5).gte('scores.imdb_votes', 2000).lte('scores.imdb_votes', 30000)
        .order('scores(imdb_rating)', { ascending: false }).limit(40) as never),
  ])

  // second step: the titles behind the two personal lists, and the rows that depend on the member's taste
  const genres = genreOrder(taste)
  const picks = [genres[day % genres.length], genres[(day + 1) % genres.length]].filter((c, i, a) => a.indexOf(c) === i)
  const decade = DECADES[day % DECADES.length]
  const byIds = (ids: number[]) => (ids.length ? soft<Card>(on(supabase.from('titles').select(H)).in('id', ids) as never) : Promise.resolve([] as Card[]))
  const genreRow = (c: Category) => Promise.all((['film', 'series'] as Kind[]).map((k) =>
    soft<Card>(titles(k).overlaps('genres', c.rule.genres ?? []).order('popularity', { ascending: false }).limit(25) as never)))
  const [becauseCards, friendCards, decadeLists, ...genreLists] = await Promise.all([
    byIds(because.map((b) => b.title_id)), byIds(friends.map((f) => f.title_id)),
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
  // the watchlist is the member's own list: everything of theirs that can be played, leaving first
  const savedCards = saved.map((s) => s.title).filter(Boolean)
    .sort((a, b) => (leavesOn.get(a.id) ?? '9').localeCompare(leavesOn.get(b.id) ?? '9')).slice(0, 20)
  savedCards.forEach((t) => seen.add(t.id))
  const rowBecause = take([...becauseCards].sort((a, b) => (rankOf.get(a.id) ?? 99) - (rankOf.get(b.id) ?? 99)))
  const rowFriends = take(friends.map((f) => friendCards.find((c) => c.id === f.title_id)).filter((c): c is Card => !!c)
    .map((c) => ({ ...c, note: `${first(friendOf.get(c.id)!.name)} ${Number(friendOf.get(c.id)!.rating).toFixed(1)}` })))
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
  if (because.length) lead(rowBecause.find(wide), `Because you liked ${because[0].source}`)
  const friendLead = rowFriends.find(wide)
  if (friendLead) { const f = friendOf.get(friendLead.id)!; lead(friendLead, `${first(f.name)} rated it ${Number(f.rating).toFixed(1)}`) }
  const goingLead = rowLeaving.find(wide)
  lead(goingLead, goingLead ? leavesIn(leavesOn.get(goingLead.id)) ?? 'Leaving soon' : '')
  // a thin day: fill up from trending so the hero is never one slide
  for (const t of mix([rowTrendF, rowTrendS])) if (hero.length < 5) lead(t, t.kind === 'film' ? 'Trending film this week' : 'Trending series this week')

  // ---- The spotlight: up to five titles given room, each with its reason. Personal first; never a hero title,
  // and each from a different reason where it can be. ----
  const inHero = new Set(hero.map((h) => h.id))
  const spots: HomeCard[] = []
  const spot = (list: HomeCard[], reason: (t: HomeCard) => string, n = 1) => {
    for (const t of list) {
      if (spots.length >= 5 || n <= 0) return
      if (!wide(t) || inHero.has(t.id) || spots.some((x) => x.id === t.id)) continue
      spots.push({ ...t, reason: reason(t) }); n--
    }
  }
  if (because.length) spot(rowBecause, () => `Because you liked ${because[0].source}`)
  spot(rowFriends, (t) => `${first(friendOf.get(t.id)!.name)} rated it ${Number(friendOf.get(t.id)!.rating).toFixed(1)}`)
  spot(rowNew, (t) => `New on ${svcName(arrivedOn.get(t.id) ?? t.availability[0]?.service_id)}`)
  spot(rowTheme, () => (themed === 'awards' ? 'Award winner' : 'Hidden gem'))
  spot(rowLeaving, (t) => leavesIn(leavesOn.get(t.id)) ?? 'Leaving soon')
  spot(rowTrendS, () => 'Trending this week')
  spot(rowTrendF, () => 'Trending this week', 2)

  // a title in the hero goes to the end of its row: the row starts with something else, and it is still there
  const back = (items: HomeCard[]) => [...items.filter((t) => !inHero.has(t.id)), ...items.filter((t) => inHero.has(t.id))]

  const rows: HomeRow[] = [
    { id: 'new', title: mine ? 'New on your services' : 'New this month', items: rowNew },
    { id: 'trending-films', title: 'Trending films', items: rowTrendF },
    { id: 'trending-series', title: 'Trending series', items: rowTrendS },
    { id: 'leaving', title: 'Leaving soon', items: rowLeaving, notes: 'leaving', more: '/browse/g/leaving-soon/list' },
    { id: 'watchlist', title: 'From your watchlist', items: savedCards },
    { id: 'because', title: because.length ? `Because you liked ${because[0].source}` : '', items: rowBecause },
    ...(spots.length >= 2 ? [{ id: 'spotlight', title: '', items: [], spotlight: spots }] : []),
    { id: 'friends', title: 'Friends liked', items: rowFriends },
    { id: 'new-films', title: 'New films', items: rowNewF },
    { id: 'new-series', title: 'New series', items: rowNewS },
    themed === 'awards' ? { id: 'awards', title: 'Award winners', items: rowTheme } : { id: 'gems', title: 'Hidden gems', items: rowTheme, more: '/browse/g/hidden-gems/list' },
    ...rowGenres.map(({ c, items }) => ({ id: c.id, title: c.label, items, more: `/browse/c/${c.id}` })),
    { id: decade.id, title: decade.label, items: rowDecade, more: `/browse/c/${decade.id}` },
  ]
  return { hero, rows: rows.filter((r) => r.spotlight || r.items.length >= 3).map((r) => ({ ...r, items: back(r.items) })) }
}
