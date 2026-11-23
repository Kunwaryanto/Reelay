// Watchlist: what you've saved, grouped by whether you can watch it tonight. Empty: a wall of posters to pick from.
import { useServicesQuery } from '../lib/profile'
import { paths } from '../lib/routes'
import { warmFacts } from '../lib/facts'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  SERVICE_NAME, kindWord, leavingFor, loadPicks, loadWatchlistTitles,
  type Card, type SavedTitle,
} from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll, useNav } from '../lib/nav'
import { FRESH, useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { Button, PageLink, GearIcon, Icon, IconButton, LoadFailed, PillCount, useLongPress, useSwitched, useHold, usePageRefresh } from '../ui'
import { useWatched } from '../lib/letterboxd'
import { FilterDrawer, NO_FILTERS, draftChips, passesDraft, type Count, type Draft, type Facets } from './SearchFilters'

type Kind = 'all' | 'film' | 'series'
type Sort = 'added' | 'leaving' | 'rated' | 'az'
const SORTS: [Sort, string][] = [['added', 'Recently added'], ['leaving', 'Leaving soonest'], ['rated', 'Highest rated'], ['az', 'A–Z']]

const nameOf = (id: string) => SERVICE_NAME[id] ?? id
function servicesLabel(names: string[]): string {
  if (names.length <= 3 && names.join(', ').length <= 26) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

type Row = { t: SavedTitle; service: string | null; mine: boolean; leaves: string | null }

export default function Watchlist() {
  const { session } = useAuth()
  const { push, tab } = useNav()
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
  const [open, setOpen] = useState<number | null>(null) // the row swiped open

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
  const leaving = list.filter((r) => r.mine && note(r))
  const on = list.filter((r) => r.mine && !note(r))
  const off = list.filter((r) => !r.mine)
  const sections = [
    { id: 'leaving', title: 'Leaving soon', sub: '', rows: leaving },
    { id: 'on', title: hasPicked ? 'On your services' : 'Streaming now', sub: hasPicked ? servicesLabel(picked.map(nameOf)) : '', rows: on },
    { id: 'off', title: hasPicked ? 'Not on your services' : 'Not streaming in Sweden', sub: 'Notify when it is', rows: off },
  ].filter((s) => s.rows.length)

  const header = (
    <div className="tab-head">
      <h1>Watchlist</h1>
      <IconButton label="Settings" onClick={() => push(paths.settings())}><GearIcon /></IconButton>
    </div>
  )

  if (q.error) return <main className="page"><div className="page-center"><LoadFailed what="your watchlist" retry={q.retry} retrying={q.retrying} /></div>{header}</main>
  // saved, but the titles themselves are still on their way
  const arriving = all.length === 0 && saved.ids.some((id) => !have.has(id))
  if (!saved.loaded || (saved.ids.length > 0 && !q.data) || (arriving && saved.ids.length > 0)) return <main className="page">{header}</main>
  if (saved.ids.length === 0) return <PickWall header={header} onAdd={(ids) => { saved.addMany(ids).then(() => q.retry()) }} />

  return (
    <>
    <main className="page noscroll" ref={pull.bind.ref} onScroll={(e) => { onDim(e); if (open !== null) setOpen(null) }}>
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

      {sections.map((s) => (
        <section key={s.id} className="wl-section">
          <div className="wl-section-head"><h2>{s.title}</h2>
            {s.sub && (s.id === 'on'
              ? <button type="button" className="wl-services" onClick={() => push(paths.settings('services'))}>{s.sub}<Icon name="chevron_right" size={14} /></button>
              : <span>{s.sub}</span>)}
          </div>
          <ul key={kind} className={switched ? 'pill-in' : undefined}>
            {s.rows.map((r) => (
              <WatchRow key={r.t.id} fresh={isNew(r.t.id)} row={r} group={s.id} showKind={kind === 'all'} note={s.id === 'leaving' ? note(r) : null}
                open={open === r.t.id} setOpen={(v) => setOpen(v ? r.t.id : null)}
                where={s.id !== 'off' ? null : r.service ? `On ${nameOf(r.service)}` : hasPicked ? 'Not streaming in Sweden' : null}
                onNotify={() => saved.toggleNotify(r.t.id)}
                onOpen={() => push(paths.title(r.t.id))} onRemove={() => { setOpen(null); saved.toggleSaved(r.t.id, r.t.title) }} />
            ))}
          </ul>
        </section>
      ))}
      {sections.length === 0 && <p className="wl-none">Nothing here with these filters.</p>}

      <FilterDrawer open={sheet} onClose={() => setSheet(false)} init={f} services={picked.map(nameOf)}
        noun={['title', 'titles']} sorts={SORTS} firstSort="added" countOf={countOf} apply={(d) => { setF(d); setSheet(false) }} />
    </main>
    {pull.indicator}
    </>
  )
}

/** One saved title. Swipe left to reveal Remove; a tap opens the title. */
/** How far a swiped row stays open (px): its Remove button's width. */
const OPEN = -88

function WatchRow({ row, fresh, group, showKind, note, where, open, setOpen, onOpen, onRemove, onNotify }: {
  fresh?: boolean
  row: Row; group: string; showKind: boolean; note: string | null; where: string | null; onNotify: () => void
  open: boolean; setOpen: (open: boolean) => void; onOpen: () => void; onRemove: () => void
}) {
  const { t, service } = row
  const swiped = useRef(false)
  // a held row closes its swipe first
  const onHold = useHold(() => setOpen(false))
  const hold = useLongPress((el) => onHold(t, el.querySelector<HTMLElement>('.wl-poster')!))
  const year = t.year ? String(t.year) : ''
  const meta = [showKind ? kindWord(t.kind) : '', year].filter(Boolean).join(' · ') + (group !== 'off' && service ? ` · ${nameOf(service)}` : '')

  // Swipe left, like a row in iOS Mail. The row follows the finger exactly (its position is written straight to
  // the element, not through React, and starts from where the finger was when the swipe was recognised, so it
  // never jumps). A short swipe leaves Remove showing; a swipe past the middle stretches Remove across the row and
  // letting go there removes it: the row slides away and the list closes up. Swiped right it gives a little.
  const li = useRef<HTMLLIElement>(null)
  const g = useRef<{ x: number; y: number; from: number; on: boolean; at: number; full: boolean; trail: [number, number][] } | null>(null)
  const place = (x: number) => { li.current?.style.setProperty('--x', `${x}px`); li.current?.style.setProperty('--r', String(-x)) }
  useLayoutEffect(() => { place(open ? OPEN : 0) }, [open])
  const remove = () => {
    const el = li.current
    if (!el || el.dataset.leaving) return
    el.dataset.leaving = 'true'
    delete el.dataset.drag
    el.dataset.full = 'true'
    place(-(el.offsetWidth + 24))
    setTimeout(() => {
      el.style.maxHeight = `${el.offsetHeight}px`
      void el.offsetHeight
      el.dataset.gone = 'true'
      setTimeout(onRemove, 230)
    }, 200)
  }
  const down = (e: React.PointerEvent) => { g.current = { x: e.clientX, y: e.clientY, from: 0, on: false, at: open ? OPEN : 0, full: false, trail: [] } }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = g.current, el = li.current
    if (!s || !el) return
    const mx = e.clientX - s.x, my = e.clientY - s.y
    if (!s.on) {
      if (Math.abs(mx) < 8) return
      if (Math.abs(my) > Math.abs(mx)) { g.current = null; return } // scrolling the page
      s.on = true
      s.from = e.clientX // from here, so the row doesn't jump the 8px it took to recognise the swipe
      e.currentTarget.setPointerCapture(e.pointerId)
      el.dataset.drag = 'true'
      e.currentTarget.querySelector('[data-pressed]')?.removeAttribute('data-pressed')
    }
    let x = (open ? OPEN : 0) + (e.clientX - s.from)
    if (x > 0) x = 14 * (1 - Math.exp(-x / 60)) // to the right: resists
    s.at = x
    s.trail.push([e.timeStamp, e.clientX])
    if (s.trail.length > 5) s.trail.shift()
    const full = -x > el.offsetWidth * 0.55
    if (full !== s.full) { s.full = full; if (full) el.dataset.full = 'true'; else delete el.dataset.full }
    place(x)
  }
  const up = () => {
    const s = g.current, el = li.current
    g.current = null
    if (!s?.on || !el) return
    swiped.current = true
    delete el.dataset.drag
    const [t0, x0] = s.trail[0] ?? [0, 0]
    const [t1, x1] = s.trail[s.trail.length - 1] ?? [0, 0]
    const speed = t1 > t0 ? (x1 - x0) / (t1 - t0) : 0 // px per ms; negative is leftward
    if (s.full || (speed < -1.2 && s.at < -120)) { remove(); return }
    delete el.dataset.full
    const stay = speed < -0.3 ? true : speed > 0.3 ? false : s.at < OPEN / 2
    place(stay ? OPEN : 0)
    setOpen(stay)
  }

  return (
    <li ref={li} className="wl-row" data-fresh={fresh || undefined} data-open={open || undefined}>
      <button type="button" className="wl-remove" aria-label={`Remove ${t.title} from watchlist`} tabIndex={open ? 0 : -1} onClick={remove}>
        <span><span>Remove</span></span>
      </button>
      <div className="wl-slide" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
       <PageLink to={paths.title(t.id)} draggable={false} handlers={hold.handlers} aria-label={[t.title, where ?? (service && nameOf(service)), note].filter(Boolean).join(', ')}
        onClick={(e) => {
          e.preventDefault()
          if (swiped.current) { swiped.current = false; return }
          if (hold.fired()) return
          if (open) { setOpen(false); return }
          onOpen()
        }}>
        <span className="wl-poster">{t.poster_path && <img src={tmdbImage(t.poster_path, 'w185')} alt="" loading="lazy" decoding="sync" draggable={false} />}<span className="hair" aria-hidden="true" /></span>
        <span className="wl-text"><b>{t.title}</b><small>{meta}</small>{where && <small className="wl-where">{where}</small>}</span>
        {note && <span className="wl-note">{note}</span>}
       </PageLink>
       {group === 'off' && (
         <button type="button" className="wl-bell" aria-pressed={t.notify} aria-label={`Notify me when ${t.title} is on my services`}
           onClick={() => { if (swiped.current) { swiped.current = false; return } if (open) { setOpen(false); return } onNotify() }}>
           <Icon name="notifications" size={20} fill={t.notify} />
         </button>
       )}
      </div>
    </li>
  )
}

// ---- Empty: pick from a wall ------------------------------------------------

// 7 × 7 posters: enough to cover the screen, tilted and panned to either edge
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
