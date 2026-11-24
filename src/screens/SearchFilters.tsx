// The "Sort and filter" drawer (Search, Browse lists, Watchlist): one list (Sort by, Only on my services, then a row per filter with its value);
// a row slides in to its options. Changes are a draft until "Show n" is tapped; closing any other way drops them.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { GENRE_OPTIONS, LANG_OPTIONS, genreNames, type Filters } from '../lib/search'
import { useWatched } from '../lib/letterboxd'
import { Button, Icon, Rolling, Sheet } from '../ui'

export type Sort = 'best' | 'rated' | 'newest'
export type Len = NonNullable<Filters['length']>
export const SORTS: [Sort, string][] = [['best', 'Best match'], ['rated', 'Highest rated'], ['newest', 'Newest']]
/** Decade starts; 0 is everything before 1960. */
export const DECADES: [string, number][] = [['2020s', 2020], ['2010s', 2010], ['2000s', 2000], ['90s', 1990], ['80s', 1980], ['70s', 1970], ['60s', 1960], ['Older', 0]]
/** The years a decade covers. */
export const decadeYears = (d: number): [number | undefined, number] => (d === 0 ? [undefined, 1959] : [d, d + 9])
/** Decades in the order the drawer lists them (newest first), as words: "90s & 2000s" reads oldest first. */
export const decadeNames = (ds: number[]) => DECADES.filter((x) => ds.includes(x[1])).map((x) => x[0])
export const LENGTHS: [string, Len][] = [['Under 90 min', 'short'], ['Up to 2 h', 'mid'], ['Over 2 h', 'long']]
/** Where a rating comes from: the draft's key for it, its name (long, and short for chips), the steps on offer and how a step reads. */
export type Source = 'rating' | 'rt' | 'lb'
export const SOURCES: { key: Source; name: string; short: string; steps: number[]; show: (n: number) => string }[] = [
  { key: 'rating', name: 'IMDb', short: 'IMDb', steps: [6, 7, 8], show: (n) => `${n}+` },
  { key: 'rt', name: 'Rotten Tomatoes', short: 'RT', steps: [60, 75, 90], show: (n) => `${n}%+` },
  { key: 'lb', name: 'Letterboxd', short: 'Letterboxd', steps: [3, 3.5, 4], show: (n) => `${n.toFixed(1)}+` },
]
const ratingNote = (d: Draft) => SOURCES.filter((s) => d[s.key]).map((s) => `${s.short} ${s.show(d[s.key])}`).join(', ')

export const decadeName = (d: number) => DECADES.find((x) => x[1] === d)?.[0] ?? ''
/** Where a title was made (TMDB's production countries): the drawer's Country options, in this order. */
export const COUNTRIES: [string, string][] = [
  ['SE', 'Sweden'], ['DK', 'Denmark'], ['NO', 'Norway'], ['FI', 'Finland'], ['GB', 'UK'], ['US', 'US'], ['FR', 'France'], ['DE', 'Germany'],
  ['ES', 'Spain'], ['IT', 'Italy'], ['KR', 'South Korea'], ['JP', 'Japan'], ['IN', 'India'], ['AU', 'Australia'], ['CA', 'Canada'],
]
const COUNTRY = Object.fromEntries(COUNTRIES)
/** "Sweden", "the UK": as it reads after "From". */
export const countryName = (code: string) => (code === 'GB' || code === 'US' ? `the ${COUNTRY[code]}` : COUNTRY[code] ?? code)
export const lengthName = (l: Len) => LENGTHS.find((x) => x[1] === l)?.[0] ?? ''
export const langName = (code: string) => LANG_OPTIONS.find((x) => x[0] === code)?.[1] ?? code
export const sortName = (s: Sort) => SORTS.find((x) => x[0] === s)![1]

/** Everything the drawer can set. Empty values mean "any". */
/** `rating` is IMDb's (0 to 10), `rt` Rotten Tomatoes critics (%), `lb` Letterboxd (0 to 5); 0 is any. */
export type Draft = {
  sort: string; mine: boolean; /** leave out films logged on Letterboxd */ hide: boolean; genres: string[]
  /** any of these decades */
  decades: number[]; rating: number; rt: number; lb: number; length: Len | null; lang: string | null
  /** set by a Browse list, shown as chips (not in the drawer): made in this country, leaving within 30 days, released this year or later */
  country?: string | null; leaving?: boolean; since?: number | null
}
export const NO_FILTERS: Draft = { sort: 'best', mine: false, hide: false, genres: [], decades: [], rating: 0, rt: 0, lb: 0, length: null, lang: null, country: null, leaving: false, since: null }

/** A count to fetch: `key` names it (the same key is never fetched twice), `run` gets it. */
export type Count = { key: string; run: () => Promise<number | null> }

/** The number for a count, once it is known. Undefined while loading, null when there is none to show. */
function useCount(c: Count | null): number | null | undefined {
  const [got, setGot] = useState<{ key: string; n: number | null } | null>(null)
  const key = c?.key
  useEffect(() => {
    if (!c) return
    let stale = false
    c.run().then((n) => { if (!stale) setGot({ key: c.key, n }) }, () => { if (!stale) setGot({ key: c.key, n: null }) })
    return () => { stale = true }
    // `key` stands for the count
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return got && got.key === key ? got.n : undefined
}

function Option({ label, checked, role, pick, count }: { label: string; checked: boolean; role: 'radio' | 'checkbox'; pick: () => void; count: Count | null }) {
  const n = useCount(count)
  // an option that would leave nothing can't be picked (one that is on can always be taken off)
  const dead = n === 0 && !checked
  return (
    <li>
      <button type="button" role={role} aria-checked={checked} aria-disabled={dead || undefined} className="fd-opt" onClick={() => { if (!dead) pick() }}>
        <span>{label}</span>
        {/* the number fades in when it is known; its place is there from the start */}
        <small data-in={typeof n === 'number'}>{typeof n === 'number' ? n.toLocaleString('en') : ''}</small>
        <Icon name="check" size={20} style={{ opacity: checked ? 1 : 0 }} />
      </button>
    </li>
  )
}

// Focus moves with the pages of the drawer (for VoiceOver and keyboards). After a touch, Safari would draw its
// focus ring on the button that received it; the ring is only wanted when someone is using keys.
let keys = false
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab') keys = true }, true)
  document.addEventListener('pointerdown', () => { keys = false }, true)
}
function quietFocus(el: HTMLElement | null | undefined) {
  if (!el) return
  if (!keys) { el.dataset.quiet = ''; el.addEventListener('blur', () => { delete el.dataset.quiet }, { once: true }) }
  el.focus({ preventScroll: true })
}

type Sub = 'sort' | 'genres' | 'decade' | 'rating' | 'length' | 'lang' | 'country'
export type FilterRow = Exclude<Sub, 'sort'>
/** The rows a list filtered on the phone can offer (its titles don't carry their countries). */
export const ALL_ROWS: FilterRow[] = ['genres', 'decade', 'rating', 'length', 'lang']
/** Lists filtered by the database (Search, Explore) can also filter by country. */
export const SERVER_ROWS: FilterRow[] = ['genres', 'decade', 'rating', 'length', 'lang', 'country']
const TITLES: Record<Sub, string> = { sort: 'Sort by', genres: 'Genre', decade: 'Released', rating: 'Ratings', length: 'Length', lang: 'Original language', country: 'Country' }

export function FilterDrawer({ open, onClose, init, yearsNote = '', services, noun, countOf, apply, sorts = SORTS, firstSort = 'best', rows: shownRows = ALL_ROWS }: {
  open: boolean
  onClose: () => void
  /** how things stand when the drawer opens */
  init: Draft
  /** a year from the words that isn't one of the decades ("1994"), shown on the Released row */
  yearsNote?: string
  /** the sort orders on offer, and the one Clear all goes back to */
  sorts?: [string, string][]
  firstSort?: string
  /** which filters are offered (a list that already is one genre doesn't offer Genre) */
  rows?: FilterRow[]
  /** the person's services, by name; empty hides "Only on my services" */
  services: string[]
  noun: [string, string]
  countOf: (d: Draft) => Count
  apply: (d: Draft) => void
}) {
  const [d, setD] = useState(init)
  const [sub, setSub] = useState<Sub | null>(null)
  // the options stay drawn while their page slides away
  const [last, setLast] = useState<Sub>('sort')
  // Ratings has one more level: a source (IMDb, Rotten Tomatoes, Letterboxd), then its steps
  const [src, setSrc] = useState<Source | null>(null)
  const [lastSrc, setLastSrc] = useState<Source>('rating')
  const back2 = useRef<HTMLButtonElement>(null)
  const srcRows = useRef<HTMLUListElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const rows = useRef<HTMLDivElement>(null)
  // a fresh draft every time it opens
  useEffect(() => { if (open) { setD(init); setSub(null); setSrc(null) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (s: Sub) => { setLast(s); setSub(s); setTimeout(() => quietFocus(back.current), 380) }
  const home = () => { setSub(null); setTimeout(() => quietFocus(rows.current?.querySelector<HTMLElement>(`[data-row="${last}"]`)), 380) }
  const goSrc = (s: Source) => { setLastSrc(s); setSrc(s); setTimeout(() => quietFocus(back2.current), 380) }
  const homeSrc = () => { setSrc(null); setTimeout(() => quietFocus(srcRows.current?.querySelector<HTMLElement>(`[data-row="${lastSrc}"]`)), 380) }
  const set = (patch: Partial<Draft>) => setD((old) => ({ ...old, ...patch }))
  const total = useCount(open ? countOf(d) : null)
  const count = (patch: Partial<Draft>) => (open ? countOf({ ...d, ...patch }) : null)

  const notes: Record<Exclude<Sub, 'sort'>, string> = {
    genres: d.genres.join(', '), decade: d.decades.length ? decadeNames(d.decades).join(', ') : yearsNote,
    rating: ratingNote(d), length: d.length ? lengthName(d.length) : '', lang: d.lang ? langName(d.lang) : '',
    country: d.country ? COUNTRY[d.country] ?? d.country : '',
  }
  const set_ = { genres: d.genres.length > 0, decade: d.decades.length > 0, rating: d.rating > 0 || d.rt > 0 || d.lb > 0, length: d.length !== null, lang: d.lang !== null, country: !!d.country, sort: d.sort !== firstSort }
  const any = Object.values(set_).some(Boolean) || d.mine || d.hide || !!d.leaving || !!d.since
  const seen = useWatched()
  const clear: Record<Sub, () => void> = {
    sort: () => set({ sort: firstSort }), genres: () => set({ genres: [] }), decade: () => set({ decades: [] }),
    rating: () => set({ rating: 0, rt: 0, lb: 0 }), length: () => set({ length: null }), lang: () => set({ lang: null }), country: () => set({ country: null }),
  }
  const shown = sub ?? last

  const options = () => {
    switch (shown) {
      case 'sort': return sorts.map(([k, label]) => <Option key={k} label={label} role="radio" checked={d.sort === k} pick={() => set({ sort: k })} count={null} />)
      case 'genres': return GENRE_OPTIONS.map((g) => (
        <Option key={g} label={g} role="checkbox" checked={d.genres.includes(g)} count={count({ genres: [g] })}
          pick={() => set({ genres: d.genres.includes(g) ? d.genres.filter((x) => x !== g) : [...d.genres, g] })} />
      ))
      case 'decade': return [
        <Option key="any" label="Any time" role="radio" checked={d.decades.length === 0} pick={() => set({ decades: [] })} count={count({ decades: [] })} />,
        // several at once: "90s & 2000s"
        ...DECADES.map(([label, y]) => <Option key={y} label={label} role="checkbox" checked={d.decades.includes(y)} count={count({ decades: [y] })}
          pick={() => set({ decades: d.decades.includes(y) ? d.decades.filter((x) => x !== y) : [...d.decades, y] })} />),
      ]
      case 'rating': return SOURCES.map((s) => (
        <li key={s.key}>
          <button type="button" className="fd-row" data-row={s.key} onClick={() => goSrc(s.key)}>
            <span>{s.name}</span><small data-set={d[s.key] ? '' : undefined}>{d[s.key] ? s.show(d[s.key]) : 'Any'}</small><Icon name="chevron_right" size={16} />
          </button>
        </li>
      ))
      case 'length': return [
        <Option key="any" label="Any length" role="radio" checked={d.length === null} pick={() => set({ length: null })} count={count({ length: null })} />,
        ...LENGTHS.map(([label, l]) => <Option key={l} label={label} role="radio" checked={d.length === l} pick={() => set({ length: l })} count={count({ length: l })} />),
      ]
      case 'lang': return [
        <Option key="any" label="Any language" role="radio" checked={d.lang === null} pick={() => set({ lang: null })} count={count({ lang: null })} />,
        ...LANG_OPTIONS.map(([code, label]) => <Option key={code} label={label} role="radio" checked={d.lang === code} pick={() => set({ lang: code })} count={count({ lang: code })} />),
      ]
      case 'country': return [
        <Option key="any" label="Any country" role="radio" checked={!d.country} pick={() => set({ country: null })} count={count({ country: null })} />,
        ...COUNTRIES.map(([code, label]) => <Option key={code} label={label} role="radio" checked={d.country === code} pick={() => set({ country: code })} count={count({ country: code })} />),
      ]
    }
  }

  const source = SOURCES.find((s) => s.key === lastSrc)!
  const steps = (): ReactNode[] => [
    <Option key={0} label="Any rating" role="radio" checked={!d[source.key]} pick={() => set({ [source.key]: 0 })} count={count({ [source.key]: 0 })} />,
    ...source.steps.map((r) => <Option key={r} label={source.show(r)} role="radio" checked={d[source.key] === r} pick={() => set({ [source.key]: r })} count={count({ [source.key]: r })} />),
  ]
  const level = sub === null ? 0 : src === null || sub !== 'rating' ? 1 : 2

  // The button keeps the last number it knew while the next one is being counted, and rolls to it
  const known = useRef<number | null>(null)
  if (typeof total === 'number') known.current = total
  if (!open) known.current = null
  const n = typeof total === 'number' ? total : known.current
  const none = total === 0
  const said = none ? (noun[1] === 'results' ? 'No results' : `No ${noun[1]} match`)
    : typeof n === 'number' ? `Show ${n.toLocaleString('en')} ${n === 1 ? noun[0] : noun[1]}` : `Show ${noun[1]}`

  return (
    <Sheet open={open} onClose={onClose} label="Sort and filter">
      <div className="fd">
        <div className="fd-track" data-level={level}>
          <section className="fd-pane" inert={level !== 0} aria-label="Sort and filter">
            <div className="fd-head">
              <h2>Sort and filter</h2>
              <button type="button" disabled={!any} onClick={() => setD({ ...NO_FILTERS, sort: firstSort })}>Clear all</button>
            </div>
            <div className="fd-list noscroll" ref={rows}>
              <button type="button" className="fd-row" data-row="sort" onClick={() => go('sort')}>
                <span>Sort by</span><small data-set>{sorts.find((x) => x[0] === d.sort)?.[1] ?? ''}</small><Icon name="chevron_right" size={16} />
              </button>
              {services.length > 0 && (
                <button type="button" role="switch" aria-checked={d.mine} className="wl-switch fd-switch" onClick={() => set({ mine: !d.mine })}>
                  <span><b>Only on my services</b><small>{services.slice(0, 3).join(', ')}{services.length > 3 ? ` +${services.length - 3}` : ''}</small></span>
                  <i aria-hidden="true" />
                </button>
              )}
              {/* only with Letterboxd connected and something logged */}
              {seen.size > 0 && (
                <button type="button" role="switch" aria-checked={d.hide} className="wl-switch fd-switch" onClick={() => set({ hide: !d.hide })}>
                  <span><b>Hide watched</b></span>
                  <i aria-hidden="true" />
                </button>
              )}
              <h3>Filter</h3>
              {shownRows.map((k) => (
                <button key={k} type="button" className="fd-row" data-row={k} onClick={() => go(k)}>
                  <span>{TITLES[k]}</span><small data-set={notes[k] ? '' : undefined}>{notes[k] || 'Any'}</small><Icon name="chevron_right" size={16} />
                </button>
              ))}
            </div>
          </section>

          <section className="fd-pane" inert={level !== 1} aria-label={TITLES[shown]}>
            <div className="fd-head fd-head-sub">
              {/* named after where it goes back to */}
              <button type="button" ref={back} className="fd-back" aria-label="Back to Sort and filter" onClick={home}><Icon name="chevron_left" size={20} /></button>
              <h2>{TITLES[shown]}</h2>
              {set_[shown] && <button type="button" onClick={clear[shown]}>Clear</button>}
            </div>
            {shown === 'genres' && <p className="fd-hint">Any of the ones you pick</p>}
            <ul className="fd-list noscroll" ref={srcRows} role={shown === 'genres' || shown === 'rating' ? 'group' : 'radiogroup'} aria-label={TITLES[shown]}>{options()}</ul>
          </section>

          <section className="fd-pane" inert={level !== 2} aria-label={source.name}>
            <div className="fd-head fd-head-sub">
              <button type="button" ref={back2} className="fd-back" aria-label="Back to Ratings" onClick={homeSrc}><Icon name="chevron_left" size={20} /></button>
              <h2>{source.name}</h2>
              {d[source.key] > 0 && <button type="button" onClick={() => set({ [source.key]: 0 })}>Clear</button>}
            </div>
            <ul className="fd-list noscroll" role="radiogroup" aria-label={source.name}>{steps()}</ul>
          </section>
        </div>
        {/* The lists run on under the button to the bottom of the drawer; they blur and fade out beneath it, as pages do under the tab bar */}
        <div className="fd-fade" aria-hidden="true"><i /><i /><i /></div>
        <div className="sheet-action fd-action">
          <Button disabled={none} aria-label={said} onClick={() => { if (!none) apply(d) }}>
            <span className="fd-show">
              {/* never narrower than a three-digit count: an unseen "Show 000 films" sits in the same place */}
              <span aria-hidden="true">Show 000 {noun[1]}</span>
              <span>{none || typeof n !== 'number' ? said : <>Show <Rolling n={n} /> {n === 1 ? noun[0] : noun[1]}</>}</span>
            </span>
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

/** What a title needs for the drawer's filters to be checked on the phone (Browse lists, Watchlist). */
export type Facets = { year: number | null; genres?: string[] | null; rating?: number | null; rt?: number | null; lb?: number | null; runtime?: number | null; lang?: string | null; services: string[] }

/** Does a title pass the draft? `mine`: the person's services. */
export function passesDraft(t: Facets, d: Draft, mine: string[]): boolean {
  if (d.mine && mine.length && !t.services.some((s) => mine.includes(s))) return false
  if (d.genres.length) { const want = d.genres.flatMap(genreNames); if (!t.genres?.some((g) => want.includes(g))) return false }
  if (d.decades.length) {
    const y = t.year
    if (y === null || !d.decades.some((x) => { const [a, b] = decadeYears(x); return (a === undefined || y >= a) && y <= b })) return false
  }
  if (d.rating && !((t.rating ?? 0) >= d.rating)) return false
  if (d.rt && !((t.rt ?? 0) >= d.rt)) return false
  if (d.lb && !((t.lb ?? 0) >= d.lb)) return false
  if (d.length) {
    const m = t.runtime ?? null
    if (m === null || (d.length === 'short' ? m >= 90 : d.length === 'mid' ? m > 120 : m <= 120)) return false
  }
  if (d.lang && t.lang !== d.lang) return false
  return true
}

/** The chips for what a draft has on (sort isn't a filter; it gets a chip only when not the first sort). */
export function draftChips(d: Draft, set: (d: Draft) => void, sorts: [string, string][], firstSort: string): { key: string; label: string; drop: () => void }[] {
  return [
    ...DECADES.filter((x) => d.decades.includes(x[1])).map(([label, y]) => ({ key: `decade:${y}`, label, drop: () => set({ ...d, decades: d.decades.filter((z) => z !== y) }) })),
    ...(d.since ? [{ key: 'since', label: d.since >= new Date().getFullYear() ? 'This year' : `Since ${d.since}`, drop: () => set({ ...d, since: null }) }] : []),
    ...(d.country ? [{ key: 'country', label: `From ${countryName(d.country)}`, drop: () => set({ ...d, country: null }) }] : []),
    ...(d.leaving ? [{ key: 'leaving', label: 'Leaving soon', drop: () => set({ ...d, leaving: false }) }] : []),
    ...d.genres.map((g) => ({ key: `g:${g}`, label: g, drop: () => set({ ...d, genres: d.genres.filter((x) => x !== g) }) })),
    ...SOURCES.filter((s) => d[s.key]).map((s) => ({ key: s.key, label: `${s.short} ${s.show(d[s.key])}`, drop: () => set({ ...d, [s.key]: 0 }) })),
    ...(d.length ? [{ key: 'length', label: lengthName(d.length), drop: () => set({ ...d, length: null }) }] : []),
    ...(d.lang ? [{ key: 'lang', label: langName(d.lang), drop: () => set({ ...d, lang: null }) }] : []),
    ...(d.mine ? [{ key: 'mine', label: 'My services', drop: () => set({ ...d, mine: false }) }] : []),
    ...(d.hide ? [{ key: 'hide', label: 'Hide watched', drop: () => set({ ...d, hide: false }) }] : []),
    ...(d.sort !== firstSort ? [{ key: 'sort', label: sorts.find((x) => x[0] === d.sort)?.[1] ?? '', drop: () => set({ ...d, sort: firstSort }) }] : []),
  ]
}
