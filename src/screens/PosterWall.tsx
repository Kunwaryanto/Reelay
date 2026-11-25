// The wall of posters to pick from: one module for onboarding and the empty Watchlist, so the two never drift apart.
// What it holds (the database's `onboarding_wall`: what a film enthusiast would pick, three films for every series),
// how it opens (it waits for the middle posters, then the columns drift into place), how it pans (the layer moves
// straight on the screen once a frame, a throw glides and settles, and catching a glide holds it where it is) and
// how a poster is picked all live here. The screens only add their own camera, text and buttons around it.
import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { loadWall, type Card } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { FRESH, useQuery } from '../lib/query'

// 8 columns of 8: onboarding's Services and Notifications frame the middle 6 columns, picking pans out to all 64.
// The middle 36 are what the wall waits for; the rest load once it has opened (`inner`).
export const COLS = 8, PER = 8, CELL = 126.24
/** Part of the saved wall's name: raise it when what the wall holds changes (a phone keeps it till the sync).
 *  2: three films for every series; 4: the canon; 5: all acclaimed; 6: films in thirds; 7: less anime;
 *  8–9: one per series; 10: series with awards */
export const WALL_VERSION = 10
export const inner = (c: number, r: number) => c >= 1 && c <= COLS - 2 && r < 6
// each column drifts into place when the wall first shows: a different distance and pace, alternating direction
const DRIFT_MS = [2750, 2500, 2650, 2600, 2800, 2700, 2900, 2550]
const BX = 285, BY = 360 // how far the wall pans while picking; past it, it pulls back like iOS
const band = (v: number, lim: number) => (v > lim ? lim + (v - lim) * 0.35 : v < -lim ? -lim + (v + lim) * 0.35 : v)
export const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v))
/** The camera while picking: zoomed in to finger-sized posters. */
export const PICK_CAM = 'translate3d(0, 0, 0) rotate(-6deg) scale(1.58)'

/** The wall's titles for these services (each service's best), and whether it has opened. It opens once the middle
 *  posters (and anything in `alsoWait`) have decoded, 1.5 s at most, or straight away when loading failed. */
export function useWall(serviceIds: string[], opts: { alsoWait?: string[]; failed?: boolean } = {}) {
  const key = serviceIds.length ? `wall:${WALL_VERSION}:${serviceIds.join()}` : null
  const q = useQuery<Card[]>(key, () => loadWall(serviceIds, PER, COLS), FRESH.catalogue)
  const wall = useMemo(() => (q.data ?? []).slice(0, COLS * PER), [q.data])
  const [started, setStarted] = useState(false)
  const failed = !!q.error || !!opts.failed
  const also = (opts.alsoWait ?? []).join('|')
  useEffect(() => {
    if (started || (!q.data && !failed)) return
    let live = true
    const go = () => { if (live) { live = false; setStarted(true) } }
    const srcs = [...wall.filter((_, i) => inner(i % COLS, Math.floor(i / COLS))).map((c) => tmdbImage(c.poster_path, 'w342')), ...(also ? also.split('|') : [])]
    void Promise.all(srcs.map((src) => {
      if (!src) return null
      const img = new Image()
      img.src = src
      return img.decode().catch(() => {})
    })).then(go)
    const t = window.setTimeout(go, 1500)
    return () => { live = false; clearTimeout(t) }
  }, [q.data, failed, started, wall, also])
  return { wall, started, query: q }
}

/** The phone's size against the board's 390 × 844, so the wall covers any iPhone the same way (`--k`). */
export function useWallScale() {
  const [k, setK] = useState(() => Math.max(window.innerWidth / 390, window.innerHeight / 844))
  useEffect(() => {
    const on = () => setK(Math.max(window.innerWidth / 390, window.innerHeight / 844))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return k
}

/** Dragging the wall around. While a finger drags, the layer is moved directly, once a frame (drawing 64 posters
 *  again for every finger move made it stutter); the state is set when it lets go. A throw glides on and settles
 *  inside the range; catching a glide holds the wall where it is on screen (it used to jump ahead). */
export function useWallPan(enabled: boolean) {
  const [pan, setPan] = useState({ x: 0, y: 0, tr: 'none' })
  const el = useRef<HTMLDivElement>(null)
  const d = useRef<{ x: number; y: number; px: number; py: number; moved: boolean; lx: number; ly: number; lt: number; vx: number; vy: number } | null>(null)
  const dragged = useRef(false)
  const held = useRef<{ x: number; y: number } | null>(null)
  const raf = useRef(0)
  const put = (x: number, y: number, tr: string) => { if (el.current) { el.current.style.transition = tr; el.current.style.transform = `translate3d(${x}px, ${y}px, 0)` } }
  const move = (x: number, y: number) => {
    held.current = { x, y }
    if (raf.current) return
    raf.current = requestAnimationFrame(() => { raf.current = 0; if (held.current) put(held.current.x, held.current.y, 'none') })
  }
  const handlers = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (!enabled) return
      let px = pan.x, py = pan.y
      if (el.current && pan.tr !== 'none') {
        const m = new DOMMatrixReadOnly(getComputedStyle(el.current).transform)
        px = m.m41; py = m.m42
        put(px, py, 'none')
        setPan({ x: px, y: py, tr: 'none' })
      }
      d.current = { x: e.clientX, y: e.clientY, px, py, moved: false, lx: e.clientX, ly: e.clientY, lt: Date.now(), vx: 0, vy: 0 }
      dragged.current = false
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const s = d.current
      if (!s) return
      const mx = e.clientX - s.x, my = e.clientY - s.y
      if (!s.moved && Math.hypot(mx, my) < 6) return
      s.moved = true
      const t = Date.now(), dt = Math.max(1, t - s.lt)
      s.vx = 0.8 * ((e.clientX - s.lx) / dt) + 0.2 * s.vx
      s.vy = 0.8 * ((e.clientY - s.ly) / dt) + 0.2 * s.vy
      s.lx = e.clientX; s.ly = e.clientY; s.lt = t
      move(band(s.px + mx, BX), band(s.py + my, BY))
    },
    onPointerUp: () => {
      const s = d.current
      d.current = null
      if (!s?.moved) return
      dragged.current = true
      setTimeout(() => { dragged.current = false }, 0)
      if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0 }
      const at = held.current ?? { x: s.px, y: s.py }
      held.current = null
      // throw: carry the release speed a little further, then settle inside the range
      const to = { x: clamp(at.x + s.vx * 220, BX), y: clamp(at.y + s.vy * 220, BY), tr: 'transform 600ms var(--ease-out)' }
      put(to.x, to.y, to.tr) // on the layer too: if the state comes out as before, React leaves the style alone
      setPan(to)
    },
    onPointerCancel: () => { d.current = null },
  }
  /** Back to the middle (a camera move). */
  const reset = (tr: string) => { put(0, 0, tr); setPan({ x: 0, y: 0, tr }) }
  const layer = { ref: el, style: { transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`, transition: pan.tr } }
  return { handlers, layer, reset, dragged }
}

/** The wall's columns: each column holds its posters three times, so the wall has no edge wherever the camera is.
 *  `tile` says per poster whether it is lit and how long its dimming waits (onboarding's Services step). */
export function WallColumns({ wall, started, revealing, sel, picking, shade, dragged, onPick, tile }: {
  wall: Card[]; started: boolean; revealing?: boolean; sel: number[]; picking: boolean; shade: boolean
  dragged: { current: boolean }; onPick: (id: number) => void
  tile?: (card: Card, y: number) => { lit: boolean; dd: number }
}): ReactNode {
  return (
    <div className="ob-cols" data-reveal={revealing || undefined}>
      {Array.from({ length: COLS }, (_, c) => {
        const col = wall.filter((_, i) => i % COLS === c)
        const odd = (c + 1) % 2 === 1 // column 1 is the old first column
        const top = -(col.length * CELL) + (odd ? CELL * 0.48 : 0)
        return (
          <div key={c} className="ob-col" data-drift={started || undefined}
            style={{ marginTop: top, '--S': `${(odd ? -1 : 1) * col.length * CELL * 0.45}px`, animationDuration: `${DRIFT_MS[c]}ms`, animationDelay: `${Math.max(0, c - 1) * 50}ms` } as CSSProperties}>
            {[0, 1, 2].flatMap((copy) => col.map((card, r) => {
              const chosen = sel.includes(card.id)
              const y = top + (copy * col.length + r) * CELL + CELL / 2
              const { lit, dd } = tile ? tile(card, y) : { lit: true, dd: 0 }
              return (
                <button key={`${copy}-${card.id}`} type="button" className="ob-tile" data-svc={card.availability[0]?.service_id} data-lit={lit} data-shade={shade && !chosen}
                  aria-pressed={picking ? chosen : undefined} aria-label={card.title} aria-hidden={copy !== 1 || undefined}
                  tabIndex={picking && copy === 1 ? 0 : -1} style={dd > 0 ? { '--dd': `${dd}ms` } as CSSProperties : undefined}
                  onClick={() => { if (picking && !dragged.current) onPick(card.id) }}>
                  {/* the outer posters load once the wall has opened, and fade in when they arrive */}
                  {card.poster_path && (inner(c, r) || started) && <img src={tmdbImage(card.poster_path, 'w342')} alt="" draggable={false} decoding="async"
                    data-late={inner(c, r) ? undefined : ''} onLoad={(e) => { e.currentTarget.dataset.in = '' }}
                    // already there (from the phone's cache) before React listened, or it failed: show it, don't leave a blank
                    ref={(el) => { if (el?.complete) el.dataset.in = '' }} onError={(e) => { e.currentTarget.dataset.in = '' }} />}
                  <i aria-hidden="true" /><b aria-hidden="true" />
                </button>
              )
            }))}
          </div>
        )
      })}
    </div>
  )
}
