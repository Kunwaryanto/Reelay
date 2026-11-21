// The "Sort and filter" drawer (Search, Browse lists, Watchlist): one list (Sort by, Only on my services, then a row per filter with its value);
// a row slides in to its options. Changes are a draft until "Show n" is tapped; closing any other way drops them.
import { useEffect, useRef, useState } from 'react'
import { GENRE_OPTIONS, LANG_OPTIONS, genreNames, type Filters } from '../lib/search'
import { Button, Icon, Sheet } from '../ui'

export type Sort = 'best' | 'rated' | 'newest'
export type Len = NonNullable<Filters['length']>
export const SORTS: [Sort, string][] = [['best', 'Best match'], ['rated', 'Highest rated'], ['newest', 'Newest']]
/** Decade starts; 0 is everything before 1980. */
export const DECADES: [string, number][] = [['2020s', 2020], ['2010s', 2010], ['2000s', 2000], ['90s', 1990], ['80s', 1980], ['Older', 0]]
export const LENGTHS: [string, Len][] = [['Under 90 min', 'short'], ['Up to 2 h', 'mid'], ['Over 2 h', 'long']]
const RATINGS = [6, 7, 8]

export const decadeName = (d: number) => DECADES.find((x) => x[1] === d)?.[0] ?? ''
export const lengthName = (l: Len) => LENGTHS.find((x) => x[1] === l)?.[0] ?? ''
export const langName = (code: string) => LANG_OPTIONS.find((x) => x[0] === code)?.[1] ?? code
export const sortName = (s: Sort) => SORTS.find((x) => x[0] === s)![1]

/** Everything the drawer can set. Empty values mean "any". */
export type Draft = { sort: string; mine: boolean; genres: string[]; decade: number | null; rating: number; length: Len | null; lang: string | null }
export const NO_FILTERS: Draft = { sort: 'best', mine: false, genres: [], decade: null, rating: 0, length: null, lang: null }

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
        {typeof n === 'number' && <small>{n.toLocaleString('en')}</small>}
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

type Sub = 'sort' | 'genres' | 'decade' | 'rating' | 'length' | 'lang'
export type FilterRow = Exclude<Sub, 'sort'>
export const ALL_ROWS: FilterRow[] = ['genres', 'decade', 'rating', 'length', 'lang']
const TITLES: Record<Sub, string> = { sort: 'Sort by', genres: 'Genre', decade: 'Released', rating: 'IMDb rating', length: 'Length', lang: 'Original language' }

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
  const back = useRef<HTMLButtonElement>(null)
  const rows = useRef<HTMLDivElement>(null)
  // a fresh draft every time it opens
  useEffect(() => { if (open) { setD(init); setSub(null) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const go = (s: Sub) => { setLast(s); setSub(s); setTimeout(() => quietFocus(back.current), 380) }
  const home = () => { setSub(null); setTimeout(() => quietFocus(rows.current?.querySelector<HTMLElement>(`[data-row="${last}"]`)), 380) }
  const set = (patch: Partial<Draft>) => setD((old) => ({ ...old, ...patch }))
  const total = useCount(open ? countOf(d) : null)
  const count = (patch: Partial<Draft>) => (open ? countOf({ ...d, ...patch }) : null)

  const notes: Record<Exclude<Sub, 'sort'>, string> = {
    genres: d.genres.join(', '), decade: d.decade !== null ? decadeName(d.decade) : yearsNote,
    rating: d.rating ? `${d.rating}+` : '', length: d.length ? lengthName(d.length) : '', lang: d.lang ? langName(d.lang) : '',
  }
  const set_ = { genres: d.genres.length > 0, decade: d.decade !== null, rating: d.rating > 0, length: d.length !== null, lang: d.lang !== null, sort: d.sort !== firstSort }
  const any = Object.values(set_).some(Boolean) || d.mine
  const clear: Record<Sub, () => void> = {
    sort: () => set({ sort: firstSort }), genres: () => set({ genres: [] }), decade: () => set({ decade: null }),
    rating: () => set({ rating: 0 }), length: () => set({ length: null }), lang: () => set({ lang: null }),
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
        <Option key="any" label="Any time" role="radio" checked={d.decade === null} pick={() => set({ decade: null })} count={count({ decade: null })} />,
        ...DECADES.map(([label, y]) => <Option key={y} label={label} role="radio" checked={d.decade === y} pick={() => set({ decade: y })} count={count({ decade: y })} />),
      ]
      case 'rating': return [
        <Option key={0} label="Any rating" role="radio" checked={d.rating === 0} pick={() => set({ rating: 0 })} count={count({ rating: 0 })} />,
        ...RATINGS.map((r) => <Option key={r} label={`${r}+`} role="radio" checked={d.rating === r} pick={() => set({ rating: r })} count={count({ rating: r })} />),
      ]
      case 'length': return [
        <Option key="any" label="Any length" role="radio" checked={d.length === null} pick={() => set({ length: null })} count={count({ length: null })} />,
        ...LENGTHS.map(([label, l]) => <Option key={l} label={label} role="radio" checked={d.length === l} pick={() => set({ length: l })} count={count({ length: l })} />),
      ]
      case 'lang': return [
        <Option key="any" label="Any language" role="radio" checked={d.lang === null} pick={() => set({ lang: null })} count={count({ lang: null })} />,
        ...LANG_OPTIONS.map(([code, label]) => <Option key={code} label={label} role="radio" checked={d.lang === code} pick={() => set({ lang: code })} count={count({ lang: code })} />),
      ]
    }
  }

  const none = total === 0
  const show = none ? (noun[1] === 'results' ? 'No results' : `No ${noun[1]} match`)
    : typeof total === 'number' ? `Show ${total.toLocaleString('en')} ${total === 1 ? noun[0] : noun[1]}` : `Show ${noun[1]}`

  return (
    <Sheet open={open} onClose={onClose} label="Sort and filter">
      <div className="fd">
        <div className="fd-track" data-sub={sub !== null}>
          <section className="fd-pane" inert={sub !== null} aria-label="Sort and filter">
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
              <h3>Filter</h3>
              {shownRows.map((k) => (
                <button key={k} type="button" className="fd-row" data-row={k} onClick={() => go(k)}>
                  <span>{TITLES[k]}</span><small data-set={notes[k] ? '' : undefined}>{notes[k] || 'Any'}</small><Icon name="chevron_right" size={16} />
                </button>
              ))}
            </div>
          </section>

          <section className="fd-pane" inert={sub === null} aria-label={TITLES[shown]}>
            <div className="fd-head fd-head-sub">
              {/* named after where it goes back to */}
              <button type="button" ref={back} className="fd-back" aria-label="Back to Sort and filter" onClick={home}><Icon name="chevron_left" size={20} /></button>
              <h2>{TITLES[shown]}</h2>
              {set_[shown] && <button type="button" onClick={clear[shown]}>Clear</button>}
            </div>
            {shown === 'genres' && <p className="fd-hint">Any of the ones you pick</p>}
            <ul className="fd-list noscroll" role={shown === 'genres' ? 'group' : 'radiogroup'} aria-label={TITLES[shown]}>{options()}</ul>
          </section>
        </div>
      </div>
      <div className="sheet-action fd-action"><Button disabled={none} onClick={() => { if (!none) apply(d) }}>{show}</Button></div>
    </Sheet>
  )
}

/** What a title needs for the drawer's filters to be checked on the phone (Browse lists, Watchlist). */
export type Facets = { year: number | null; genres?: string[] | null; rating?: number | null; runtime?: number | null; lang?: string | null; services: string[] }

/** Does a title pass the draft? `mine`: the person's services. */
export function passesDraft(t: Facets, d: Draft, mine: string[]): boolean {
  if (d.mine && mine.length && !t.services.some((s) => mine.includes(s))) return false
  if (d.genres.length) { const want = d.genres.flatMap(genreNames); if (!t.genres?.some((g) => want.includes(g))) return false }
  if (d.decade !== null) {
    const y = t.year
    if (y === null || (d.decade === 0 ? y >= 1980 : y < d.decade || y > d.decade + 9)) return false
  }
  if (d.rating && !((t.rating ?? 0) >= d.rating)) return false
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
    ...(d.decade !== null ? [{ key: 'decade', label: decadeName(d.decade), drop: () => set({ ...d, decade: null }) }] : []),
    ...d.genres.map((g) => ({ key: `g:${g}`, label: g, drop: () => set({ ...d, genres: d.genres.filter((x) => x !== g) }) })),
    ...(d.rating ? [{ key: 'rating', label: `IMDb ${d.rating}+`, drop: () => set({ ...d, rating: 0 }) }] : []),
    ...(d.length ? [{ key: 'length', label: lengthName(d.length), drop: () => set({ ...d, length: null }) }] : []),
    ...(d.lang ? [{ key: 'lang', label: langName(d.lang), drop: () => set({ ...d, lang: null }) }] : []),
    ...(d.mine ? [{ key: 'mine', label: 'My services', drop: () => set({ ...d, mine: false }) }] : []),
    ...(d.sort !== firstSort ? [{ key: 'sort', label: sorts.find((x) => x[0] === d.sort)?.[1] ?? '', drop: () => set({ ...d, sort: firstSort }) }] : []),
  ]
}
