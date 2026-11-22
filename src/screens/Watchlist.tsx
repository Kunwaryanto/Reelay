// Watchlist: what you've saved, grouped by whether you can watch it tonight. Empty: a wall of posters to pick from.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../lib/auth'
import {
  SERVICE_NAME, kindWord, leavingNote, loadMyServices, loadPicks, loadWatchlistTitles,
  type Card, type SavedTitle,
} from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll, useNav } from '../lib/nav'
import { useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { Button, GearIcon, Icon, IconButton, LoadFailed, PillCount, useLongPress, useSwitched } from '../ui'
import { FilterDrawer, NO_FILTERS, draftChips, passesDraft, type Count, type Draft, type Facets } from './SearchFilters'
import { HoldMenu } from './Now'

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
  const q = useQuery<SavedTitle[]>(uid ? `watchlist-titles:${uid}` : null, loadWatchlistTitles)
  const mineQ = useQuery<string[]>(uid ? `my-services:${uid}` : null, loadMyServices, { maxAge: 10 * 60 * 1000 })
  const [kind, setKind] = useState<Kind>('all')
  const switched = useSwitched(kind)
  // sort and filters, set in the Sort and filter drawer
  const [f, setF] = useState<Draft>({ ...NO_FILTERS, sort: 'added' })
  const sort = f.sort as Sort
  const [sheet, setSheet] = useState(false)
  const [open, setOpen] = useState<number | null>(null) // the row swiped open
  const [held, setHeld] = useState<{ card: Card; cover: HTMLElement } | null>(null)

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

  const picked = useMemo(() => mineQ.data ?? [], [mineQ.data])
  const hasPicked = picked.length > 0 // until Your services is set up, every service counts as yours

  const all: Row[] = useMemo(() => (q.data ?? []).filter((t) => saved.isSaved(t.id)).map((t) => {
    const own = t.availability.find((a) => !hasPicked || picked.includes(a.service_id))
    const a = own ?? t.availability[0]
    return { t: { ...t, notify: saved.isNotifying(t.id) }, service: a?.service_id ?? null, mine: !!own, leaves: own?.leaves_on ?? null }
  }), [q.data, saved, hasPicked, picked])

  const facets = (r: Row): Facets => ({ year: r.t.year, genres: r.t.genres, rating: r.t.rating, runtime: r.t.runtime_min, lang: r.t.original_language, services: [] })
  // "mine" is checked against the row (which knows about the services someone has picked), the rest on the title
  const fits = (r: Row, d: Draft) => (!d.mine || r.mine) && passesDraft(facets(r), { ...d, mine: false }, picked)
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

  const note = (r: Row) => {
    if (q.stale || !r.leaves) return null
    const days = (Date.parse(r.leaves + 'T00:00:00Z') - Date.now()) / 864e5
    return days <= 30 ? leavingNote(r.leaves) : null
  }
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
      <IconButton label="Settings" onClick={() => push('/settings')}><GearIcon /></IconButton>
    </div>
  )

  if (q.error) return <main className="page"><div className="page-center"><LoadFailed what="your watchlist" retry={q.retry} retrying={q.retrying} /></div>{header}</main>
  // saved, but the titles themselves are still on their way
  const arriving = all.length === 0 && saved.ids.some((id) => !have.has(id))
  if (!saved.loaded || (saved.ids.length > 0 && !q.data) || (arriving && saved.ids.length > 0)) return <main className="page">{header}</main>
  if (saved.ids.length === 0) return <PickWall header={header} onAdd={(ids) => { saved.addMany(ids).then(() => q.retry()) }} />

  return (
    <main className="page noscroll" onScroll={(e) => { onDim(e); if (open !== null) setOpen(null) }}>
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
              ? <button type="button" className="wl-services" onClick={() => push('/settings/services')}>{s.sub}<Icon name="chevron_right" size={14} /></button>
              : <span>{s.sub}</span>)}
          </div>
          <ul key={kind} className={switched ? 'pill-in' : undefined}>
            {s.rows.map((r) => (
              <WatchRow key={r.t.id} fresh={isNew(r.t.id)} row={r} group={s.id} showKind={kind === 'all'} note={s.id === 'leaving' ? note(r) : null}
                open={open === r.t.id} setOpen={(v) => setOpen(v ? r.t.id : null)}
                where={s.id !== 'off' ? null : r.service ? `On ${nameOf(r.service)}` : hasPicked ? 'Not streaming in Sweden' : null}
                onNotify={() => saved.toggleNotify(r.t.id)} onHold={(card, cover) => { setOpen(null); setHeld({ card, cover }) }}
                onOpen={() => push(`/title/${r.t.id}`)} onRemove={() => { setOpen(null); saved.toggleSaved(r.t.id, r.t.title) }} />
            ))}
          </ul>
        </section>
      ))}
      {sections.length === 0 && <p className="wl-none">Nothing here with these filters.</p>}

      {held && createPortal(<HoldMenu held={held} onClose={() => setHeld(null)} />, document.body)}
      {/* over the tab bar, so outside the page, but inside #root: its clip keeps iOS from scrolling the document */}
      {createPortal(<FilterDrawer open={sheet} onClose={() => setSheet(false)} init={f} services={picked.map(nameOf)}
        noun={['title', 'titles']} sorts={SORTS} firstSort="added" countOf={countOf} apply={(d) => { setF(d); setSheet(false) }} />,
      document.getElementById('root') ?? document.body)}
    </main>
  )
}

/** One saved title. Swipe left to reveal Remove; a tap opens the title. */
function WatchRow({ row, fresh, group, showKind, note, where, open, setOpen, onOpen, onRemove, onNotify, onHold }: {
  fresh?: boolean
  onHold: (card: Card, cover: HTMLElement) => void
  row: Row; group: string; showKind: boolean; note: string | null; where: string | null; onNotify: () => void
  open: boolean; setOpen: (open: boolean) => void; onOpen: () => void; onRemove: () => void
}) {
  const { t, service } = row
  const g = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const swiped = useRef(false)
  const hold = useLongPress((el) => onHold(t, el.querySelector<HTMLElement>('.wl-poster')!))
  const [dx, setDx] = useState<number | null>(null)
  const base = open ? -88 : 0
  const x = dx === null ? base : Math.max(-96, Math.min(0, base + dx))
  const year = t.year ? String(t.year) : ''
  const meta = [showKind ? kindWord(t.kind) : '', year].filter(Boolean).join(' · ') + (group !== 'off' && service ? ` · ${nameOf(service)}` : '')

  return (
    <li className="wl-row" data-fresh={fresh || undefined}>
      <button type="button" className="wl-remove" aria-label={`Remove ${t.title} from watchlist`} tabIndex={open ? 0 : -1}
        style={{ opacity: open || (dx !== null && dx < -8) ? 1 : 0 }} onClick={onRemove}>
        <Icon name="bookmark_remove" size={20} /><span>Remove</span>
      </button>
      <div className="wl-slide"
        style={{ transform: `translateX(${x}px)`, transition: dx === null ? undefined : 'none' }}
        onPointerDown={(e) => { g.current = { x: e.clientX, y: e.clientY, moved: false } }}
        onPointerMove={(e) => {
          const s = g.current
          if (!s) return
          const mx = e.clientX - s.x, my = e.clientY - s.y
          if (!s.moved && Math.abs(mx) < 8) return
          if (!s.moved && Math.abs(my) > Math.abs(mx)) { g.current = null; return } // scrolling the page
          s.moved = true
          setDx(mx)
        }}
        onPointerUp={() => {
          const s = g.current
          g.current = null
          if (!s?.moved) return
          swiped.current = true
          setOpen(base + (dx ?? 0) < -44)
          setDx(null)
        }}
        onPointerCancel={() => { g.current = null; setDx(null) }}>
       <a href={`/title/${t.id}`} draggable={false} {...hold.handlers} aria-label={[t.title, where ?? (service && nameOf(service)), note].filter(Boolean).join(', ')}
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
       </a>
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
  const q = useQuery<Card[]>(`picks:${PICKS}`, loadPicks, { maxAge: 60 * 60 * 1000 })
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
