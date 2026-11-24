// Search: the field sits at the bottom, above the keyboard. Before typing: a prompt and three ideas, with recents
// in a drawer on the left. While typing: results with type pills, filter chips read from the words, and a sort sheet.
import { useServicesQuery } from '../lib/profile'
import { paths } from '../lib/routes'
import { warmFacts } from '../lib/facts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { SERVICE_NAME, metaLine, type Card } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { takeKeyboard } from '../lib/keyboard'
import { useWatched } from '../lib/letterboxd'
import { useNav, useNavActions } from '../lib/nav'
import { FRESH, useQuery } from '../lib/query'
import {
  addRecent, countWith, genreNames, guess, loadIdeas, loadPopular, parseQuery, readRecents, search, writeRecents,
  type Filters, type Found, type Hit, type Idea, type Recent, type Token,
  addFromTmdb, searchTmdb, loadMore, pagedList, type TmdbHit,
} from '../lib/search'
import { FilterDrawer, SOURCES, SERVER_ROWS, DECADES, countryName, decadeYears, langName, lengthName, sortName, type Count, type Draft, type Len, type Sort } from './SearchFilters'
import { Icon, LoadOn, PageButton, PageLink, joinHandlers, LoadFailed, PillCount, SmallButton, useKeyboardRoom, useLongPress, useNearScreen, useHold } from '../ui'

type Kind = 'all' | 'series' | 'film' | 'people'

/**
 * What the filter drawer has set, on top of the words. A key that is present has been decided in the drawer, even
 * when its value is "any" (null, []): it then replaces what the words say about it ("90s" typed, Released set to 80s).
 */
type Extra = { genres?: string[]; decades?: number[]; lang?: string | null; country?: string | null; rating?: number; rt?: number; lb?: number; length?: Len }
const slot = (key: string): 'genres' | 'decades' | 'lang' | null => (key.startsWith('genre:') ? 'genres' : key === 'years' ? 'decades' : key === 'lang' ? 'lang' : null)
/** A years chip as one of the drawer's decades, or null ("1994", "70s"). */
const decadeOf = (t: Token | undefined) => { const { from, to } = t?.filter ?? {}; return from !== undefined && from >= 1960 && from % 10 === 0 && to === from + 9 ? from : null }
function toFilters(x: Extra, services: string[] | null, hide: number[] | null = null): Filters {
  const f: Filters = {}
  if (hide?.length) f.hide = hide
  if (x.decades?.length) f.decades = x.decades.map(decadeYears)
  if (x.genres?.length) f.genres = x.genres.flatMap(genreNames)
  if (x.lang) f.lang = x.lang
  if (x.country) f.country = x.country
  if (x.rating) f.minRating = x.rating
  if (x.rt) f.minRt = x.rt
  if (x.lb) f.minLb = x.lb
  if (x.length) f.length = x.length
  if (services) f.services = services
  return f
}

const nameOf = (id: string) => SERVICE_NAME[id] ?? id
const metaOf = (h: Hit) => metaLine({ ...h, runtime_min: h.runtime }, h.services[0] ? nameOf(h.services[0]) : 'Not streaming in Sweden')

// Answers from the last few minutes, so a search made again (or one of the three ideas, fetched ahead) shows at once.
const KEEP = 5 * 60 * 1000
const answers = new Map<string, { at: number; found: Found }>()
const keyOf = (text: string, removed: string[], extra: Filters = {}) => `${text.toLowerCase()}|${removed.join(',')}|${Object.keys(extra).length ? JSON.stringify(extra) : ''}`
const kept = (key: string) => { const a = answers.get(key); return a && Date.now() - a.at < KEEP ? a.found : null }
const keep = (key: string, found: Found) => {
  answers.delete(key)
  answers.set(key, { at: Date.now(), found })
  if (answers.size > 30) answers.delete(answers.keys().next().value!)
}
/** Fetch a search ahead of time (the ideas on the first page). */
const warm = (text: string) => { const key = keyOf(text, []); if (!kept(key)) search(text, []).then((found) => keep(key, found), () => {}) }

/** Run the search a moment after typing stops; keep showing the last results until the new ones arrive. */
function useSearch(typed: string, removed: string[], extra: Filters) {
  const [state, setState] = useState<{ key: string; found: Found | null; error: boolean }>({ key: '', found: null, error: false })
  const [again, setAgain] = useState(0)
  const text = typed.replace(/\s+/g, ' ').trim()
  const key = text.length < 2 ? '' : keyOf(text, removed, extra)
  const ready = key ? kept(key) : null

  useEffect(() => {
    // back to the empty field: the next search starts clean instead of dimming the old one
    if (!key) { setState((s) => (s.found || s.error ? { key: '', found: null, error: false } : s)); return }
    if (kept(key)) return
    let stale = false
    const t = setTimeout(() => {
      search(text, removed, extra).then(
        (found) => { keep(key, found); if (!stale) setState({ key, found, error: false }) },
        () => { if (!stale) setState({ key, found: null, error: true }) },
      )
    }, 220)
    return () => { stale = true; clearTimeout(t) }
    // `key` stands for text, removed and extra
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, again])

  // back online: search again by itself
  useEffect(() => {
    const online = () => setAgain((n) => n + 1)
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [])

  // a list made by filters loads on as it is scrolled: one page at a time
  const loading = useRef(false)
  const more = (kind: 'all' | Hit['kind']) => {
    const now = ready ?? (key && state.key === key ? state.found : null)
    if (!now?.paged || loading.current) return
    loading.current = true
    loadMore(now, kind).then((next) => { keep(key, next); setState({ key, found: next, error: false }) }, () => {}).finally(() => { loading.current = false })
  }

  return {
    found: ready ?? (key ? state.found : null),
    error: !ready && !!key && state.key === key && state.error,
    waiting: !ready && !!key && state.key !== key,
    retry: () => setAgain((n) => n + 1),
    more,
  }
}


/** Everything else on TMDB: asked once the catalogue's own answer is on screen, for a plain name search (no filters,
 *  not "only my services", which TMDB's titles can't meet). Kept per words for the session. */
const tmdbKept = new Map<string, TmdbHit[]>()
function useTmdb(text: string, words: string, on: boolean): { hits: TmdbHit[]; waiting: boolean } {
  const key = text.replace(/\s+/g, ' ').trim().toLowerCase()
  const [got, setGot] = useState<{ key: string; hits: TmdbHit[] } | null>(null)
  useEffect(() => {
    if (!on || key.length < 2 || tmdbKept.has(key)) return
    let live = true
    const t = setTimeout(() => {
      searchTmdb(key, words).then((hits) => { tmdbKept.set(key, hits); if (live) setGot({ key, hits }) }, () => { tmdbKept.set(key, []); if (live) setGot({ key, hits: [] }) })
    }, 150)
    return () => { live = false; clearTimeout(t) }
    // `words` follows `key`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, on])
  if (!on || key.length < 2) return { hits: [], waiting: false }
  const hits = tmdbKept.get(key) ?? (got?.key === key ? got.hits : undefined)
  return { hits: hits ?? [], waiting: hits === undefined }
}

/** A TMDB title: tapping saves it to the catalogue, then opens its page like any other. */
function TmdbRow({ h, onOpen }: { h: TmdbHit; onOpen: (id: number) => void }) {
  const [state, setState] = useState<'idle' | 'adding' | 'failed'>('idle')
  const open = () => {
    if (state === 'adding') return
    setState('adding')
    addFromTmdb(h).then((id) => { setState('idle'); onOpen(id) }, () => setState('failed'))
  }
  const meta = state === 'adding' ? 'Opening…' : state === 'failed' ? 'Couldn’t open it. Tap to try again.' : [h.year, h.kind === 'film' ? 'Film' : 'Series'].filter(Boolean).join(' · ')
  return (
    <li className="s-tmdb">
      <button type="button" className="s-row press-row" onClick={open} aria-busy={state === 'adding' || undefined}>
        <span className="wl-poster">{h.poster_path && <img src={tmdbImage(h.poster_path, 'w185')} alt="" loading="lazy" decoding="async" draggable={false} />}<span className="hair" aria-hidden="true" /></span>
        <span className="wl-text"><b>{h.title}</b><small>{meta}</small></span>
      </button>
    </li>
  )
}

const cardOf = (h: Hit): Card => ({ id: h.id, kind: h.kind, title: h.title, year: h.year, runtime_min: h.runtime, seasons: h.seasons, poster_path: h.poster_path, availability: h.services.map((s) => ({ service_id: s, leaves_on: null })) })

/** True once `on` has lasted `ms`: a quick answer never flashes a loading state. */
function useLate(on: boolean, ms: number) {
  const [late, setLate] = useState(false)
  useEffect(() => {
    if (!on) { setLate(false); return }
    const t = setTimeout(() => setLate(true), ms)
    return () => clearTimeout(t)
  }, [on, ms])
  return on && late
}

/** Rows in the shape of results while the first answer is on its way; they fade out down the list. */
const Skeleton = () => (
  <ul className="s-results s-skel" aria-hidden="true">
    {Array.from({ length: 7 }, (_, i) => (
      <li key={i}><span className="s-row"><span className="wl-poster" /><span className="wl-text"><b style={{ width: `${[52, 34, 44, 28, 48, 62, 30][i]}%` }} /><small /></span></span></li>
    ))}
  </ul>
)

function Row({ h, near, onOpen, before }: { h: Hit; near?: boolean; onOpen: () => void; before?: () => void }) {
  const onHold = useHold(before)
  const hold = useLongPress((el) => onHold(cardOf(h), el.querySelector<HTMLElement>('.wl-poster')!))
  const li = useRef<HTMLLIElement>(null)
  const close = useNearScreen(li, near)
  useEffect(() => { if (near || close) warmFacts([h.id]) }, [near, close, h.id])
  return (
    <li ref={li}>
      <PageLink to={paths.title(h.id)} className="s-row press-row" handlers={joinHandlers(hold.handlers, { onPointerDown: () => warmFacts([h.id], true) })} onClick={() => { if (!hold.fired()) onOpen() }}>
        <span className="wl-poster">{h.poster_path && <img src={tmdbImage(h.poster_path, 'w185')} alt="" loading={near || close ? 'eager' : 'lazy'} decoding={near ? 'sync' : 'async'} draggable={false} />}<span className="hair" aria-hidden="true" /></span>
        <span className="wl-text"><b>{h.title}</b><small>{metaOf(h)}</small></span>
      </PageLink>
    </li>
  )
}

const readKeyboardHeight = () => { try { return Number(localStorage.getItem('reelay:kb-height')) || 300 } catch { return 300 } }

export default function Search() {
  const { push, setTab } = useNavActions()
  const { tab } = useNav()
  const input = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [removed, setRemoved] = useState<string[]>([])
  const [kind, setKind] = useState<Kind>('all')
  const [sort, setSort] = useState<Sort>('best')
  const [onlyMine, setOnlyMine] = useState(false)
  const [hideSeen, setHideSeen] = useState(false)
  const [extra, setExtra] = useState<Extra>({})
  const [sheet, setSheet] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [typing, setTyping] = useState(false)
  const [recents, setRecents] = useState(readRecents)
  const [online, setOnline] = useState(navigator.onLine)
  const { room, pending } = useKeyboardRoom(typing)
  const [hour] = useState(() => new Date().getHours())

  const mineQ = useServicesQuery()
  const ideas = useQuery<Idea[]>('search-ideas', loadIdeas, FRESH.catalogue)
  const popular = useQuery<Hit[]>('search-popular', loadPopular, FRESH.catalogue)
  const picked = useMemo(() => mineQ.data ?? [], [mineQ.data])
  const hasPicked = picked.length > 0 // without services, "Only on my services" isn't offered
  const myOnly = onlyMine && hasPicked
  // Hide watched: the films logged on Letterboxd (a long list is left to the phone, so the request stays short)
  const seen = useWatched()
  const seenIds = useMemo(() => [...seen].sort((a, b) => a - b).slice(0, 400), [seen])
  const hiding = hideSeen && seen.size > 0

  useEffect(() => {
    const set = () => setOnline(navigator.onLine)
    window.addEventListener('online', set); window.addEventListener('offline', set)
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set) }
  }, [])

  // Opened from the tab bar: the keyboard is already on its way up (see keyboard.ts), so the field rises with it.
  // It happens before the first paint, so Search appears with the field already in its place above the keyboard
  // and only fades in: nothing has to chase the keyboard.
  const [arriving, setArriving] = useState(false)
  useLayoutEffect(() => {
    if (tab !== 'search' || !takeKeyboard(input.current)) return
    setTyping(true)
    setArriving(true)
    const t = setTimeout(() => setArriving(false), 450)
    return () => clearTimeout(t)
  }, [tab])

  // chips from the words that the drawer has replaced
  const off = useMemo(() => [...removed, ...parseQuery(q).tokens.filter((t) => { const s = slot(t.key); return s !== null && extra[s] !== undefined }).map((t) => t.key)], [q, removed, extra])
  const xf = useMemo(() => toFilters(extra, myOnly ? picked : null, hiding ? seenIds : null), [extra, myOnly, picked, hiding, seenIds])
  const { found, error, waiting, retry, more: loadNext } = useSearch(q, off, xf)
  const hasQ = q.trim().length > 0
  // "films" or "series" in the words picks that pill (once per result, so All can still be tapped after)
  useEffect(() => { if (found?.kind) setKind(found.kind) }, [found])
  // While waiting, the words themselves already say which chips and type apply ("90s films")
  const early = useMemo(() => (waiting ? guess(q, off) : null), [waiting, q, off])
  useEffect(() => { if (early?.kind) setKind(early.kind) }, [early?.kind])
  const tokens = early?.tokens ?? found?.tokens ?? []
  const skeleton = useLate(waiting && !found, 150)
  // the three ideas are fetched ahead, so tapping one has nothing to wait for
  useEffect(() => { (ideas.data ?? []).forEach((c) => warm(c.query)) }, [ideas.data])

  const all = useMemo(() => (hiding ? (found?.hits ?? []).filter((h) => !seen.has(h.id)) : found?.hits ?? []), [found, hiding, seen])
  const mine = all
  const folks = found?.people ?? []
  // a list made by filters counts what the database has, and shows what has loaded so far (it loads on as it scrolls)
  const paged = found?.paged
  const counts = paged
    ? { all: paged.totals.all + folks.length, people: folks.length, series: paged.totals.series, film: paged.totals.film }
    : { all: mine.length + folks.length, people: folks.length, series: mine.filter((h) => h.kind === 'series').length, film: mine.filter((h) => h.kind === 'film').length }
  const shown = kind === 'people' ? [] : paged && found ? pagedList(found, kind) : mine.filter((h) => kind === 'all' || h.kind === kind)
  const unloaded = !!paged && kind !== 'people' && shown.length < (kind === 'all' ? paged.totals.all : paged.totals[kind])
  const shownPeople = kind === 'people' ? folks : kind === 'all' ? folks.slice(0, 2) : []
  const list = sort === 'best' ? shown : [...shown].sort((a, b) => (sort === 'rated' ? (b.rating ?? 0) - (a.rating ?? 0) : (b.year ?? 0) - (a.year ?? 0)))
  // everything else on TMDB, after the catalogue's own answer, for a plain name search
  // asked whenever there are name words (film names often hold a year, "2001 a space odyssey"), not with a service
  // or "my services" (TMDB's titles don't stream there) or the drawer's filters
  const words = parseQuery(q).rest
  const plain = hasQ && !!found && !waiting && !error && !myOnly && words.length >= 2 && !tokens.some((t) => t.filter.service || t.filter.services) && Object.keys(extra).length === 0 && kind !== 'people'
  const more = useTmdb(q, words, plain)
  const extraHits = more.hits.filter((h) => kind === 'all' || h.kind === kind)

  const remember = (r: Recent) => setRecents((old) => { const next = addRecent(old, r); writeRecents(next); return next })
  const forget = (list: Recent[]) => { setRecents(list); writeRecents(list) }
  const change = (text: string) => { setQ(text); setRemoved([]); if (!text) setExtra({}) }
  const open = (h: Hit) => {
    remember({ t: 'title', id: h.id, text: h.title, sub: metaLine({ ...h, runtime_min: h.runtime }), poster_path: h.poster_path })
    input.current?.blur()
    push(paths.title(h.id))
  }
  const run = (text: string) => { change(text); setExtra({}); setKind(guess(text, [])?.kind ?? 'all'); setDrawer(false) }

  // ---- Sort and filter drawer ----
  // what is on, for the chips and the count on the button (sort isn't a filter, so it doesn't count)
  const less = (patch: Extra) => setExtra((x) => ({ ...x, ...patch }))
  const xchips: { key: string; label: string; drop: () => void }[] = [
    ...DECADES.filter(([, y]) => extra.decades?.includes(y)).map(([label, y]) => ({ key: `x-decade:${y}`, label, drop: () => less({ decades: (extra.decades ?? []).filter((z) => z !== y) }) })),
    ...(extra.genres ?? []).map((g) => ({ key: `x-genre:${g}`, label: g, drop: () => less({ genres: (extra.genres ?? []).filter((x) => x !== g) }) })),
    ...SOURCES.filter((s) => extra[s.key]).map((s) => ({ key: `x-${s.key}`, label: `${s.short} ${s.show(extra[s.key]!)}`, drop: () => less({ [s.key]: undefined }) })),
    ...(extra.length ? [{ key: 'x-length', label: lengthName(extra.length), drop: () => less({ length: undefined }) }] : []),
    ...(extra.lang ? [{ key: 'x-lang', label: langName(extra.lang), drop: () => less({ lang: null }) }] : []),
    ...(extra.country ? [{ key: 'x-country', label: `From ${countryName(extra.country)}`, drop: () => less({ country: null }) }] : []),
    ...(myOnly ? [{ key: 'x-mine', label: 'My services', drop: () => setOnlyMine(false) }] : []),
    ...(hiding ? [{ key: 'x-hide', label: 'Hide watched', drop: () => setHideSeen(false) }] : []),
  ]
  const filtersOn = tokens.filter((t) => !t.key.startsWith('genre:')).length + (tokens.some((t) => t.key.startsWith('genre:')) || extra.genres?.length ? 1 : 0)
    + xchips.filter((c) => !c.key.startsWith('x-genre:')).length
  // the drawer opens on how things stand: what it set itself, else what the words say
  const yearsToken = tokens.find((t) => t.key === 'years')
  const init: Draft = {
    sort, mine: myOnly, hide: hiding, rating: extra.rating ?? 0, rt: extra.rt ?? 0, lb: extra.lb ?? 0, length: extra.length ?? null,
    genres: extra.genres ?? tokens.filter((t) => t.key.startsWith('genre:')).map((t) => t.label),
    decades: extra.decades !== undefined ? extra.decades : decadeOf(yearsToken) !== null ? [decadeOf(yearsToken)!] : [],
    lang: extra.lang !== undefined ? extra.lang : tokens.find((t) => t.key === 'lang')?.filter.lang ?? null,
    country: extra.country ?? null,
  }
  const yearsNote = extra.decades === undefined && yearsToken && decadeOf(yearsToken) === null ? yearsToken.label : ''
  /** How many results a draft would give: the draft stands in for what the words say about genre, years and language. */
  const countOf = (d: Draft): Count => {
    const keepYears = d.decades.length === 0 && yearsNote !== ''
    const gone = [...removed, ...parseQuery(q).tokens.filter((t) => slot(t.key) !== null && !(t.key === 'years' && keepYears)).map((t) => t.key)]
    const f = toFilters({ genres: d.genres, decades: d.decades, lang: d.lang, country: d.country, rating: d.rating, rt: d.rt, lb: d.lb, length: d.length ?? undefined }, d.mine && hasPicked ? picked : null, d.hide ? seenIds : null)
    const k = kind === 'film' || kind === 'series' ? kind : undefined
    return { key: `${q.trim().toLowerCase()}|${gone.join(',')}|${JSON.stringify(f)}|${k ?? ''}`, run: () => countWith(q, gone, f, k) }
  }
  const apply = (d: Draft) => {
    setSort(d.sort as Sort)
    setOnlyMine(d.mine)
    setHideSeen(d.hide)
    setExtra((x) => {
      const next: Extra = { ...x, rating: d.rating || undefined, rt: d.rt || undefined, lb: d.lb || undefined, length: d.length ?? undefined }
      if (d.genres.join('|') !== init.genres.join('|')) next.genres = d.genres
      if (d.decades.join('|') !== init.decades.join('|')) next.decades = d.decades
      if (d.lang !== init.lang) next.lang = d.lang
      if ((d.country ?? null) !== (init.country ?? null)) next.country = d.country ?? null
      return next
    })
    setSheet(false)
  }
  // A search counts as made once its results have been on screen for a moment (no need to press Search).
  const settled = found && !waiting && found.hits.length + found.people.length > 0 ? q.trim() : ''
  useEffect(() => {
    if (settled.length < 2) return
    const t = setTimeout(() => remember({ t: 'q', text: settled }), 1500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled])
  // Tapping the field: focus it ourselves at touch-down, without scrolling (left alone, iOS scrolls the whole app
  // up to reveal it) and without the tap's own click. That click arrives after the field has already risen, so it
  // lands on the empty page where the field used to be, which takes the focus away and closes the keyboard again.
  // React's onTouchStart is passive and can't cancel the tap, so this listens on the element itself.
  const box = useRef<HTMLDivElement>(null)
  const focusedAt = useRef(0)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const down = (e: TouchEvent) => {
      const field = input.current
      if (!field || (e.target as HTMLElement).closest('button')) return
      if (field === document.activeElement) return
      e.preventDefault()
      focusedAt.current = Date.now()
      field.focus({ preventScroll: true })
    }
    el.addEventListener('touchstart', down, { passive: false })
    return () => el.removeEventListener('touchstart', down)
  }, [])
  // How far the keyboard travels (as last measured): Search rises that far with it when it opens.
  // read on every render (it's one small value): the keyboard may differ from the last one, so it's never kept
  const kb = readKeyboardHeight()
  // Leaving the app closes the keyboard without telling the page. Let go of the field then, and drop it back to
  // rest at once (no animation): iOS takes its app-switcher picture right away, and coming back starts from that
  // picture, so it must already show Search at rest, not halfway down. Animations come back once the app is shown
  // again (after two frames), so a keyboard iOS brings back by itself still carries the field up with it.
  useEffect(() => {
    const page = () => input.current?.closest('main')
    const seen = () => {
      if (document.visibilityState === 'hidden') {
        page()?.setAttribute('data-still', '')
        flushSync(() => input.current?.blur())
        return
      }
      requestAnimationFrame(() => requestAnimationFrame(() => page()?.removeAttribute('data-still')))
    }
    const gone = () => { page()?.setAttribute('data-still', ''); flushSync(() => input.current?.blur()) }
    document.addEventListener('visibilitychange', seen)
    window.addEventListener('pagehide', gone)
    window.addEventListener('pageshow', seen)
    return () => { document.removeEventListener('visibilitychange', seen); window.removeEventListener('pagehide', gone); window.removeEventListener('pageshow', seen) }
  }, [])
  // Recents: swipe it (or the page beside it) to the left to close
  const swipe = useRef<{ x: number; y: number } | null>(null)

  // why there is nothing, and the one step that gets something back
  const empty = hasQ && !waiting && !error && found !== null && list.length === 0 && shownPeople.length === 0 && extraHits.length === 0 && !more.waiting
  const other: 'film' | 'series' = kind === 'film' ? 'series' : 'film'
  const nothing = !empty ? null
    : myOnly ? {
      title: 'None on your services', body: 'There may be matches on services you don’t have.',
      action: 'Show all services', run: () => setOnlyMine(false), popular: false,
    }
      : (kind === 'film' || kind === 'series') && mine.length ? {
        title: kind === 'film' ? 'No films match' : 'No series match', body: '',
        action: `Show ${other === 'film' ? 'films' : 'series'} (${counts[other]})`, run: () => setKind(other), popular: false,
      }
        : tokens.length ? {
          title: 'Nothing matches all of these', body: 'Remove a filter above, or clear them all.',
          action: 'Clear filters', run: () => setRemoved((r) => [...r, ...tokens.map((t) => t.key)]), popular: false,
        }
          : { title: `Nothing for “${q.trim()}”`, body: 'Try a service, genre or year.', action: '', run: () => {}, popular: true }

  // How far the field (and the prompt above it) lift to clear the keyboard. Moved with a transform, not `bottom`,
  // so Safari animates it without laying the page out again on every frame.
  const lift = typing && room ? `calc(${room + 12}px - 34px - var(--edge-b))` : '0px'
  const up = typing && room > 0

  return (
    <main className="search" data-drawer={drawer} data-arriving={arriving} data-kb={typing ? 'up' : 'down'} style={{ '--lift': lift, '--kb': `${kb}px` } as React.CSSProperties}
      onTouchStart={(e) => { swipe.current = drawer ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null }}
      onTouchMove={(e) => {
        const s = swipe.current
        if (!s) return
        const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y
        if (dx < -40 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipe.current = null; setDrawer(false) }
      }}
      onTouchEnd={() => { swipe.current = null }}
      // a stray press on the empty page right after the field took focus must not take it away again
      onMouseDown={(e) => { if (Date.now() - focusedAt.current < 700 && !(e.target as HTMLElement).closest('input, button, a')) e.preventDefault() }}>
      <nav className="s-recents" aria-label="Recent searches" inert={!drawer}>
        <div className="s-recents-head">
          <h2>Recents</h2>
          {recents.length > 0 && <button type="button" onClick={() => forget([])}>Clear</button>}
        </div>
        <ul>
          {recents.map((r, i) => (
            <li key={r.t === 'q' ? `q:${r.text}` : `t:${r.id}`}>
              <PageButton to={r.t === 'title' ? paths.title(r.id) : null} className="s-recent" onClick={() => { if (r.t === 'q') run(r.text); else { setDrawer(false); push(paths.title(r.id)) } }}>
                {r.t === 'title'
                  ? <span className="s-thumb">{r.poster_path && <img src={tmdbImage(r.poster_path, 'w92')} alt="" />}<span className="hair" aria-hidden="true" /></span>
                  : <span className="s-thumb-icon"><Icon name="search" size={20} /></span>}
                <span className="s-recent-text"><b>{r.text}</b>{r.t === 'title' && <small>{r.sub}</small>}</span>
              </PageButton>
              <button type="button" className="s-recent-x" aria-label={`Remove ${r.text}`} onClick={() => forget(recents.filter((_, j) => j !== i))}><Icon name="close" size={18} /></button>
            </li>
          ))}
        </ul>
        {recents.length === 0 && <p className="s-recents-none">Your searches show up here.</p>}
      </nav>

      <div className="s-stage">
        {drawer && <div className="s-stage-scrim" aria-hidden="true" onClick={() => setDrawer(false)} />}
        {!hasQ && (
          <button type="button" className="icon-btn s-recents-btn" aria-label="Recent searches" aria-expanded={drawer}
            onClick={() => { input.current?.blur(); setDrawer(true) }}>
            <span><Icon name="schedule" size={20} /></span>
          </button>
        )}

        <div className="s-list noscroll" data-idle={!hasQ} data-pending={pending}
          // dragging the results puts the keyboard away, like iOS lists do
          onTouchMove={() => { if (typing) input.current?.blur() }}
          // results run under the field and its fade, down to the keyboard (the prompt moves with the field instead)
          style={up && hasQ ? { bottom: lift } : undefined}>
          {!hasQ ? (
            <div className="s-idle">
              <h1>{'What are we\nwatching '}{hour >= 17 || hour < 4 ? 'tonight' : 'today'}?</h1>
              <ul>
                {(ideas.data ?? []).map((c) => (
                  <li key={c.query}>
                    <button type="button" className="s-idea" onClick={() => run(c.query)}>
                      <span className="s-thumb">{c.poster_path && <img src={tmdbImage(c.poster_path, 'w92')} alt="" />}<span className="hair" aria-hidden="true" /></span>
                      <span className="s-recent-text"><b>{c.title}</b><small>{c.sub}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="wl-filters">
                <div role="group" aria-label="Type">
                  {([['all', 'All'], ['series', 'Series'], ['film', 'Films'], ...(folks.length ? [['people', 'People']] : [])] as [Kind, string][]).map(([k, label]) => (
                    <button key={k} type="button" className="wl-pill" aria-pressed={kind === k} aria-label={waiting ? label : `${label}, ${counts[k]} results`} onClick={() => setKind(k)}>
                      <span>{label}<PillCount n={waiting && !found ? undefined : counts[k]} off={waiting} /></span>
                    </button>
                  ))}
                </div>
                {/* no count on it: what's on shows as chips right under it; the label says it for screen readers */}
                <button type="button" className="wl-tune" aria-haspopup="dialog" aria-label={filtersOn ? `Sort and filter, ${filtersOn} on` : 'Sort and filter'} onClick={() => { input.current?.blur(); setSheet(true) }}>
                  <Icon name="tune" size={22} />
                </button>
              </div>
              {tokens.length + xchips.length + (sort !== 'best' ? 1 : 0) > 0 && (
                <div className="s-chips">
                  {tokens.map((t) => (
                    <button key={t.key} type="button" aria-label={`Remove filter ${t.label}`} onClick={() => setRemoved((r) => [...r, t.key])}>
                      {t.label}<Icon name="close" size={16} />
                    </button>
                  ))}
                  {xchips.map((c) => (
                    <button key={c.key} type="button" aria-label={`Remove filter ${c.label}`} onClick={c.drop}>{c.label}<Icon name="close" size={16} /></button>
                  ))}
                  {sort !== 'best' && <button type="button" aria-label="Back to best match" onClick={() => setSort('best')}>{sortName(sort)}<Icon name="close" size={16} /></button>}
                </div>
              )}

              {!online && list.length === 0 && <p className="s-note">Search needs a connection for this. We’ll search again when you’re back.</p>}
              {online && error && <div className="s-failed"><LoadFailed what="results" retry={retry} retrying={waiting} compact /></div>}
              {shownPeople.length > 0 && (
                <ul className="s-results s-people">
                  {shownPeople.map((p) => (
                    <li key={p.id}>
                      <PageLink to={paths.person(p.id)} className="s-person" onClick={() => { input.current?.blur(); push(paths.person(p.id)) }}>
                        <span className="avatar" aria-hidden="true">{p.profile_path ? <img src={tmdbImage(p.profile_path, 'w185')} alt="" loading="lazy" /> : p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>
                        <span className="wl-text"><b>{p.name}</b>{p.known_for && <small>{p.known_for}</small>}</span>
                        <Icon name="chevron_right" size={16} style={{ color: 'var(--text-faint)' }} />
                      </PageLink>
                    </li>
                  ))}
                </ul>
              )}
              <p className="sr-only" role="status">{waiting ? 'Searching' : ''}</p>
              {skeleton && <Skeleton />}
              {/* keyed by the type pill: every switch plays the rows' entrance, also when the rows are the same */}
              <ul className="s-results" key={kind} data-waiting={waiting}>
                {list.map((h, i) => <Row key={h.id} h={h} near={i < 10} onOpen={() => open(h)} before={() => input.current?.blur()} />)}
                {unloaded && <LoadOn key={`${kind}:${shown.length}`} onNear={() => loadNext(kind)} />}
                {extraHits.map((h) => <TmdbRow key={`${h.kind}:${h.tmdb_id}`} h={h} onOpen={(id) => { input.current?.blur(); remember({ t: 'title', id, text: h.title, sub: [h.year, h.kind === 'film' ? 'Film' : 'Series'].filter(Boolean).join(' · '), poster_path: h.poster_path }); push(paths.title(id)) }} />)}
              </ul>

              {nothing && online && (
                <section className="s-nothing" role="status">
                  <h2>{nothing.title}</h2>
                  {nothing.body && <p>{nothing.body}</p>}
                  {nothing.action && <div><SmallButton onClick={nothing.run}>{nothing.action}</SmallButton></div>}
                  {nothing.popular && (popular.data ?? []).length > 0 && (
                    <>
                      <h3>Popular right now</h3>
                      <ul className="s-results">{popular.data!.map((h) => <Row key={h.id} h={h} onOpen={() => open(h)} before={() => input.current?.blur()} />)}</ul>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* the same fade as under the tab bar; it rides up with the field */}
        <div className="tabbar-fade s-fade" aria-hidden="true" data-pending={pending}><i /><i /><i /></div>
        <form className="s-field" role="search" data-pending={pending}
          onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) remember({ t: 'q', text: q.trim() }); input.current?.blur() }}>
          <div className="s-input" ref={box} data-own-focus="">
            <Icon name="search" size={20} />
            <input ref={input} type="search" enterKeyHint="search" aria-label="Search films and series" placeholder="Films and series"
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              value={q} onChange={(e) => change(e.target.value)} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} />
            {hasQ && (
              <button type="button" aria-label="Clear search"
                // keep the keyboard up: clear without taking focus from the field
                onPointerDown={(e) => e.preventDefault()} onClick={() => { change(''); setKind('all') }}>
                <Icon name="cancel" size={18} fill />
              </button>
            )}
          </div>
          <button type="button" className="s-close" aria-label="Close search" onClick={() => { input.current?.blur(); setTab('now') }}><Icon name="close" size={20} /></button>
        </form>
      </div>

      {/* over everything, inside #root (its clip keeps iOS from scrolling the document) */}
      <FilterDrawer open={sheet} onClose={() => setSheet(false)} init={init} yearsNote={yearsNote}
        services={picked.map(nameOf)} noun={kind === 'film' ? ['film', 'films'] : kind === 'series' ? ['series', 'series'] : ['result', 'results']}
        countOf={countOf} apply={apply} rows={SERVER_ROWS} />
    </main>
  )
}
