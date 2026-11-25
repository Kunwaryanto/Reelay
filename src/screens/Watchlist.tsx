// Watchlist: what you've saved, as one wall of posters: leaving soonest first, then what's on your services, then what
// isn't (greyed). A tap opens the title, holding it gives Remove and Notify me. Empty: a wall of posters to pick from.
import { useServicesQuery } from '../lib/profile'
import { paths } from '../lib/routes'
import { warmFacts } from '../lib/facts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  SERVICE_NAME, leavingFor, loadPicks, loadWatchlistTitles,
  type Card, type SavedTitle,
} from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll, useNav } from '../lib/nav'
import { FRESH, useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { Button, Cover, Icon, SettingsButton, LoadFailed, PillCount, joinHandlers, useLongPress, usePageLink, useSwitched, useHold, usePageRefresh } from '../ui'
import { useWatched } from '../lib/letterboxd'
import { FilterDrawer, NO_FILTERS, draftChips, passesDraft, type Count, type Draft, type Facets } from './SearchFilters'

type Kind = 'all' | 'film' | 'series'
type Sort = 'added' | 'leaving' | 'rated' | 'az'
const SORTS: [Sort, string][] = [['added', 'Recently added'], ['leaving', 'Leaving soonest'], ['rated', 'Highest rated'], ['az', 'A–Z']]

const nameOf = (id: string) => SERVICE_NAME[id] ?? id

type Row = { t: SavedTitle; service: string | null; mine: boolean; leaves: string | null }

export default function Watchlist() {
  const { session } = useAuth()
  const { tab } = useNav()
  const saved = useSaved()
  const onDim = useDimOnScroll()
  const uid = session?.user.id
  const q = useQuery<SavedTitle[]>(uid ? `watchlist-titles:${uid}` : null, loadWatchlistTitles, FRESH.mine('watchlist'))
  const mineQ = useServicesQuery()
  // pull to refresh: the list itself, its titles and the member's services
  const pull = usePageRefresh(q, mineQ, { retry: saved.reload })
  const [kind, setKind] = useState<Kind>('all')
  const switched = useSwitched(kind)
  // sort and filters, set in the Sort and filter drawer
  const [f, setF] = useState<Draft>({ ...NO_FILTERS, sort: 'added' })
  const sort = f.sort as Sort
  const [sheet, setSheet] = useState(false)

  // Titles saved elsewhere in the app aren't in this list's data yet: fetch again when one is missing.
  const have = useMemo(() => new Set((q.data ?? []).map((t) => t.id)), [q.data])
  const asked = useRef('')
  const { retry } = q
  useEffect(() => {
    if (tab !== 'watchlist' || !q.data) return
    const missing = saved.ids.filter((id) => !have.has(id)).join(',')
    if (missing && missing !== asked.current) { asked.current = missing; retry() }
  }, [tab, saved.ids, have, q.data, retry])

  // A row that arrives while the list is showing (a slow save, or one from another device) opens up and fades in.
  // Rows there when the list first shows, and rows added while another tab was showing, are just there.
  const known = useRef<Set<number> | null>(null)
  const born = useRef(new Map<number, number>())
  if (q.data) {
    const first = !known.current
    known.current ??= new Set()
    for (const t of q.data) if (!known.current.has(t.id)) { known.current.add(t.id); if (!first && tab === 'watchlist') born.current.set(t.id, Date.now()) }
  }
  const isNew = (id: number) => Date.now() - (born.current.get(id) ?? 0) < 600

  // the long-press facts for everything saved, in one go
  useEffect(() => { if (q.data) warmFacts(q.data.map((t) => t.id)) }, [q.data])
  const picked = useMemo(() => mineQ.data ?? [], [mineQ.data])
  const hasPicked = picked.length > 0 // until Your services is set up, every service counts as yours

  const all: Row[] = useMemo(() => (q.data ?? []).filter((t) => saved.isSaved(t.id)).map((t) => {
    const own = t.availability.find((a) => !hasPicked || picked.includes(a.service_id))
    const a = own ?? t.availability[0]
    return { t: { ...t, notify: saved.isNotifying(t.id) }, service: a?.service_id ?? null, mine: !!own, leaves: own?.leaves_on ?? null }
  }), [q.data, saved, hasPicked, picked])

  const facets = (r: Row): Facets => ({ year: r.t.year, genres: r.t.genres, rating: r.t.rating, rt: r.t.rt, lb: r.t.lb, runtime: r.t.runtime_min, lang: r.t.original_language, services: [] })
  // "mine" is checked against the row (which knows about the services someone has picked), the rest on the title
  const seen = useWatched()
  const fits = (r: Row, d: Draft) => (!d.mine || r.mine) && !(d.hide && seen.has(r.t.id)) && passesDraft(facets(r), { ...d, mine: false }, picked)
  const shown = all.filter((r) => fits(r, f))
  const chips = draftChips(f, setF, SORTS, 'added')
  const countOf = (d: Draft): Count => ({
    key: `${JSON.stringify(d)}|${kind}|${all.length}`,
    run: async () => all.filter((r) => fits(r, d) && (kind === 'all' || r.t.kind === kind)).length,
  })
  const counts = { all: shown.length, film: shown.filter((r) => r.t.kind === 'film').length, series: shown.filter((r) => r.t.kind === 'series').length }
  const list = shown.filter((r) => kind === 'all' || r.t.kind === kind).sort((a, b) =>
    sort === 'added' ? b.t.added_at.localeCompare(a.t.added_at)
      : sort === 'leaving' ? (a.leaves ?? '9').localeCompare(b.leaves ?? '9')
        : sort === 'rated' ? (b.t.rating ?? 0) - (a.t.rating ?? 0)
          : a.t.title.localeCompare(b.t.title))

  // leaving within a month counts as Leaving soon
  const note = (r: Row) => leavingFor(r.leaves, { stale: q.stale, within: 30 })
  // one wall: leaving soonest first, then the rest on the member's services (in the chosen order), then the others
  const leaving = list.filter((r) => r.mine && note(r)).sort((a, b) => (a.leaves ?? '9').localeCompare(b.leaves ?? '9'))
  const wall = [...leaving, ...list.filter((r) => r.mine && !note(r)), ...list.filter((r) => !r.mine)]

  const header = (
    <div className="tab-head">
      <h1>Watchlist</h1>
      <SettingsButton />
    </div>
  )

  if (q.error) return <main className="page"><div className="page-center"><LoadFailed what="your watchlist" retry={q.retry} retrying={q.retrying} /></div>{header}</main>
  // saved, but the titles themselves are still on their way
  const arriving = all.length === 0 && saved.ids.some((id) => !have.has(id))
  if (!saved.loaded || (saved.ids.length > 0 && !q.data) || (arriving && saved.ids.length > 0)) return <main className="page">{header}</main>
  if (saved.ids.length === 0) return <PickWall header={header} onAdd={(ids) => { saved.addMany(ids).then(() => q.retry()) }} />

  return (
    <>
    <main className="page noscroll" ref={pull.bind.ref} onScroll={onDim}>
      {header}
      <div className="wl-filters">
        <div role="group" aria-label="Type">
          {([['all', 'All'], ['film', 'Films'], ['series', 'Series']] as [Kind, string][]).map(([k, label]) => (
            <button key={k} type="button" className="wl-pill" aria-pressed={kind === k} onClick={() => setKind(k)}>
              <span>{label}<PillCount n={q.data ? counts[k] : undefined} /></span>
            </button>
          ))}
        </div>
        {/* no count on it: what's on shows as chips right under it */}
        <button type="button" className="wl-tune" aria-haspopup="dialog" aria-label={chips.length ? `Sort and filter, ${chips.length} on` : 'Sort and filter'} onClick={() => setSheet(true)}>
          <Icon name="tune" size={22} />
        </button>
      </div>
      {chips.length > 0 && (
        <div className="s-chips">
          {chips.map((c) => <button key={c.key} type="button" aria-label={`Remove ${c.label}`} onClick={c.drop}>{c.label}<Icon name="close" size={16} /></button>)}
        </div>
      )}

      <ul key={kind} className={`wl-wall${switched ? ' pill-in' : ''}`} aria-label="Saved titles">
        {wall.map((r) => (
          <WallPoster key={r.t.id} row={r} fresh={isNew(r.t.id)} note={r.mine ? note(r) : null} notifying={!r.mine && saved.isNotifying(r.t.id)}
            where={r.mine ? null : r.service ? `on ${nameOf(r.service)}` : 'not streaming'} />
        ))}
      </ul>
      {wall.length === 0 && <p className="wl-none">Nothing here with these filters.</p>}

      <FilterDrawer open={sheet} onClose={() => setSheet(false)} init={f} services={picked.map(nameOf)}
        noun={['title', 'titles']} sorts={SORTS} firstSort="added" countOf={countOf} apply={(d) => { setF(d); setSheet(false) }} />
    </main>
    {pull.indicator}
    </>
  )
}

/** One saved title on the wall: its poster with the service it's on, how soon it leaves, or greyed when it isn't on
 *  the member's services (a small bell when they'll be told it arrives). Tap opens it; hold gives the poster menu. */
function WallPoster({ row, fresh, note, notifying, where }: { row: Row; fresh?: boolean; note: string | null; notifying: boolean; where: string | null }) {
  const { t, service, mine } = row
  const onHold = useHold()
  const hold = useLongPress((el) => onHold(t as unknown as Card, el.querySelector<HTMLElement>('.cover')!))
  const link = usePageLink(paths.title(t.id))
  const { push } = useNav()
  // "Leaves in 3 days" says it on a poster as "3 days"
  const soon = note?.replace(/^Leaves (in )?/, '').replace(/^./, (c) => c.toUpperCase())
  const label = [t.title, mine && service ? nameOf(service) : where, note, notifying ? 'you will be notified' : null].filter(Boolean).join(', ')
  return (
    <li className="wl-tile" data-off={!mine || undefined} data-fresh={fresh || undefined}>
      <a href={paths.title(t.id)} aria-label={label} {...joinHandlers(hold.handlers, link)}
        onClick={(e) => { e.preventDefault(); if (!hold.fired()) push(paths.title(t.id)) }}>
        <Cover path={t.poster_path} service={mine ? service ?? undefined : undefined} sizes="96px" />
        {soon && <span className="wl-soon" aria-hidden="true">{soon}</span>}
        {notifying && <span className="wl-bellmark" aria-hidden="true"><Icon name="notifications" size={14} fill /></span>}
      </a>
    </li>
  )
}

const COLS = 7, ROWS = 7
const PICKS = COLS * ROWS
const BX = 150, BY = 140 // how far the wall pans; past it, it pulls back like iOS
const band = (v: number, lim: number) => (v > lim ? lim + (v - lim) * 0.35 : v < -lim ? -lim + (v + lim) * 0.35 : v)
const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v))

/** The wall of posters to pick from. Used when the Watchlist is empty, and as a step in onboarding (`bare`: no tab bar, no hint). */
export function PickWall({ header, onAdd, bare }: { header: React.ReactNode; onAdd: (ids: number[]) => void; bare?: boolean }) {
  const q = useQuery<Card[]>(`picks:${PICKS}`, loadPicks, FRESH.catalogue)
  const [sel, setSel] = useState<number[]>([])
  const [pan, setPan] = useState({ x: 0, y: 0, settle: false })
  const d = useRef<{ x: number; y: number; px: number; py: number; moved: boolean; lx: number; ly: number; lt: number; vx: number; vy: number } | null>(null)
  const dragged = useRef(false)
  const n = sel.length

  return (
    <main className="page pick" data-bare={bare}>
      <div className="pick-pan"
        onPointerDown={(e) => { d.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false, lx: e.clientX, ly: e.clientY, lt: Date.now(), vx: 0, vy: 0 }; dragged.current = false }}
        onPointerMove={(e) => {
          const s = d.current
          if (!s) return
          const mx = e.clientX - s.x, my = e.clientY - s.y
          if (!s.moved && Math.hypot(mx, my) < 6) return
          s.moved = true
          const now = Date.now(), dt = Math.max(1, now - s.lt)
          s.vx = 0.8 * ((e.clientX - s.lx) / dt) + 0.2 * s.vx
          s.vy = 0.8 * ((e.clientY - s.ly) / dt) + 0.2 * s.vy
          s.lx = e.clientX; s.ly = e.clientY; s.lt = now
          setPan({ x: band(s.px + mx, BX), y: band(s.py + my, BY), settle: false })
        }}
        onPointerUp={() => {
          const s = d.current
          d.current = null
          if (!s?.moved) return
          dragged.current = true
          setTimeout(() => { dragged.current = false }, 0)
          // throw: carry the release speed a little further, then settle inside the range
          setPan((p) => ({ x: clamp(p.x + s.vx * 220, BX), y: clamp(p.y + s.vy * 220, BY), settle: true }))
        }}
        onPointerCancel={() => { d.current = null }}>
        <div className="pick-wall" data-settle={pan.settle} style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) rotate(-6deg)` }}>
          {(q.data ?? []).map((c, i) => {
            const col = i % COLS, row = Math.floor(i / COLS)
            const on = sel.includes(c.id)
            return (
              <button key={c.id} type="button" className="pick-poster" aria-pressed={on} aria-label={c.title} data-dim={n > 0 && !on}
                style={{ left: col * 136, top: row * 200 + (col % 2 ? 0 : 96) }}
                onClick={() => { if (!dragged.current) setSel((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id])) }}>
                {c.poster_path && <img src={tmdbImage(c.poster_path, 'w342')} alt="" draggable={false} decoding="async" />}
                <i aria-hidden="true" />
              </button>
            )
          })}
        </div>
      </div>
      <div className="pick-fade" aria-hidden="true" />
      {header}
      {!bare && <p className="pick-hint" aria-hidden={n > 0} data-hide={n > 0}>Tap what you want to watch.</p>}
      {q.error && <div className="page-center"><LoadFailed what="titles to pick from" retry={q.retry} retrying={q.retrying} /></div>}
      <div className="pick-add" data-show={n > 0}>
        <Button tabIndex={n ? 0 : -1} aria-label={`Add ${n === 1 ? '1 title' : `${n} titles`} to Watchlist`} onClick={() => onAdd(sel)}>Add {n} to Watchlist</Button>
      </div>
    </main>
  )
}
