// Building blocks from the Components page of the design canvas. Styles are in src/styles/app.css.
import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type ReactNode,
} from 'react'
import wordmarkSvg from '../../public/brand/wordmark.svg?raw'
import { posterSrcSet, tmdbImage } from '../lib/images'
import { SERVICE_NAME, type Card } from '../lib/catalogue'
import { useNav, type Tab } from '../lib/nav'
import { useRequestFailed } from '../lib/query'

// ---- Icons -----------------------------------------------------------------

/**
 * Same line thickness at every size: weight 250 at 24px, and heavier as the icon gets smaller
 * (20px → 300, 16px → 375, 15px → 400), so small icons don't look thinner than the rest.
 */
export const iconWeight = (size: number) => Math.round(Math.min(400, Math.max(250, 6000 / size)))

export function Icon({ name, size = 24, fill = false, style }: { name: string; size?: number; fill?: boolean; style?: CSSProperties }) {
  return (
    <span className="ms" aria-hidden="true"
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${iconWeight(size)}`, ...style }}>
      {name}
    </span>
  )
}

export function Laurel({ size = 12, won }: { size?: number; won: boolean }) {
  const half = (
    <>
      <path d="M11.4 20.8C7 19.6 4.2 15.6 4.6 9.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M7.80 19.30Q6.08 16.44 2.91 17.52Q4.64 20.38 7.80 19.30ZM4.90 13.60Q4.84 10.26 1.56 9.62Q1.62 12.96 4.90 13.60ZM4.60 9.40Q6.68 7.07 4.77 4.60Q2.68 6.93 4.60 9.40Z"
        fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
  return (
    <svg className="laurel" data-won={won} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g>{half}</g><g transform="translate(24 0) scale(-1 1)">{half}</g>
    </svg>
  )
}

const HomeIcon = () => (
  <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24">
    <path d="M4.75 19V9.6L12 4.1l7.25 5.5V19a1.25 1.25 0 0 1-1.25 1.25H6a1.25 1.25 0 0 1-1.25-1.25Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)

export const GearIcon = () => (
  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24">
    <path d="M10.23 4.92L10.53 2.72A9.4 9.4 0 0 1 13.47 2.72L13.77 4.92A7.3 7.3 0 0 1 15.76 5.74L17.53 4.40A9.4 9.4 0 0 1 19.60 6.47L18.26 8.24A7.3 7.3 0 0 1 19.08 10.23L21.28 10.53A9.4 9.4 0 0 1 21.28 13.47L19.08 13.77A7.3 7.3 0 0 1 18.26 15.76L19.60 17.53A9.4 9.4 0 0 1 17.53 19.60L15.76 18.26A7.3 7.3 0 0 1 13.77 19.08L13.47 21.28A9.4 9.4 0 0 1 10.53 21.28L10.23 19.08A7.3 7.3 0 0 1 8.24 18.26L6.47 19.60A9.4 9.4 0 0 1 4.40 17.53L5.74 15.76A7.3 7.3 0 0 1 4.92 13.77L2.72 13.47A9.4 9.4 0 0 1 2.72 10.53L4.92 10.23A7.3 7.3 0 0 1 5.74 8.24L4.40 6.47A9.4 9.4 0 0 1 6.47 4.40L8.24 5.74A7.3 7.3 0 0 1 10.23 4.92Z"
      fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </svg>
)

/** The Reelay wordmark as outlines. `rise` lets the letters come up one by one (Start, slow launch). */
export function Wordmark({ height = 28, rise = false }: { height?: number; rise?: boolean }) {
  return <span className="wordmark" data-rise={rise} style={{ height }} role="img" aria-label="Reelay" dangerouslySetInnerHTML={{ __html: wordmarkSvg }} />
}

export const Spinner = ({ light = false, label }: { light?: boolean; label?: string }) =>
  <span className={light ? 'spin spin-w' : 'spin'} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />

// ---- Buttons ---------------------------------------------------------------

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }

/** 44px white pill: the main action of a screen or sheet. */
export function Button({ busy, children, className = '', ...rest }: BtnProps) {
  return <button type="button" className={`btn press ${className}`} {...rest}>{busy ? <Spinner label="Working" /> : children}</button>
}
/** 32px pill: a small standalone action. Grey on plain black, white with `solid`. */
export function SmallButton({ solid, busy, children, ...rest }: BtnProps & { solid?: boolean }) {
  return <button type="button" className="btn-small press" data-solid={solid} {...rest}>{children}{busy && <Spinner light={!solid} />}</button>
}
/** 44px frosted pill over artwork (Start). */
export const GlassButton = ({ children, ...rest }: BtnProps) => <button type="button" className="btn-glass press" {...rest}>{children}</button>
/** Quiet text action with a 44px tap area. */
export const QuietButton = ({ children, className = '', ...rest }: BtnProps) => <button type="button" className={`btn-quiet ${className}`} {...rest}>{children}</button>

/** 32px circle in a 44px tap area. `glass` over artwork, otherwise the subtle fill. */
export function IconButton({ label, glass, children, ...rest }: BtnProps & { label: string; glass?: boolean }) {
  return <button type="button" className="icon-btn" aria-label={label} {...rest}><span data-glass={glass}>{children}</span></button>
}

export function BackButton({ glass }: { glass?: boolean }) {
  const { back } = useNav()
  return <IconButton label="Back" glass={glass} onClick={back}><Icon name="chevron_left" size={20} /></IconButton>
}

export const Pill = ({ selected, children, ...rest }: BtnProps & { selected?: boolean }) =>
  <button type="button" className="pill" aria-pressed={selected} {...rest}>{children}</button>

// ---- Posters ---------------------------------------------------------------

const MARK_FILE: Record<string, [string, number]> = { 'svt-play': ['svt-play', 19.3], skyshowtime: ['skyshowtime', 20.3] }

export function ServiceMark({ service }: { service: string }) {
  const file = MARK_FILE[service]
  if (file) return <img className="mark" src={`/icons/services/${file[0]}.svg`} alt="" style={{ width: file[1], height: 8 }} />
  return <span className="mark-text">{(SERVICE_NAME[service] ?? service).toUpperCase()}</span>
}

export function Cover({ path, service, eager, sizes = '147px' }: { path: string | null; service?: string; eager?: boolean; sizes?: string }) {
  const [ready, setReady] = useState(false)
  return (
    <div className="cover">
      {path && (
        <img src={tmdbImage(path, 'w342')} srcSet={posterSrcSet(path)} sizes={sizes} alt="" draggable={false}
          loading={eager ? undefined : 'lazy'} decoding="async" data-ready={ready} onLoad={() => setReady(true)} />
      )}
      <div className="hair" aria-hidden="true" />
      {service && <span className="cover-mark" aria-hidden="true"><ServiceMark service={service} /></span>}
    </div>
  )
}

export function TitleCard({ card, note, eager, onHold }: { card: Card; note?: string | null; eager?: boolean; onHold?: (card: Card, rect: DOMRect) => void }) {
  const { push } = useNav()
  const service = card.availability[0]?.service_id
  const hold = useLongPress((el) => onHold?.(card, el.querySelector('.cover')!.getBoundingClientRect()))
  const meta = note ?? `${card.kind === 'film' ? 'Film' : 'Series'}${card.year ? ` · ${card.year}` : ''}`
  return (
    <a className="card press" href={`/title/${card.id}`} {...hold.handlers}
      onClick={(e) => { e.preventDefault(); if (!hold.fired()) push(`/title/${card.id}`) }}>
      <div role="img" aria-label={`${card.title}${service ? `, ${SERVICE_NAME[service] ?? service}` : ''}`}>
        <Cover path={card.poster_path} service={service} eager={eager} />
      </div>
      <span className="card-title">{card.title}</span>
      <span className="card-meta">{meta}</span>
    </a>
  )
}

/** Hold 0.45 s without moving more than 8px. Scrolling always wins. */
export function useLongPress(onHold: (el: HTMLElement) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef<[number, number] | null>(null)
  const didFire = useRef(false)
  const cancel = () => { clearTimeout(timer.current); start.current = null }
  return {
    fired: () => didFire.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        didFire.current = false
        start.current = [e.clientX, e.clientY]
        const el = e.currentTarget
        clearTimeout(timer.current)
        timer.current = setTimeout(() => { if (start.current) { didFire.current = true; onHold(el) } }, 450)
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (start.current && Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 8) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  }
}

export function SectionHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {onViewAll && <button type="button" className="view-all" aria-label={`View all in ${title}`} onClick={onViewAll}>View all</button>}
    </div>
  )
}

export const PosterRow = ({ children }: { children: ReactNode }) => <div className="row-scroll noscroll"><div className="row-track">{children}</div></div>

// ---- States ----------------------------------------------------------------

/** Nothing saved and it couldn't load: one reason and Try again. */
export function LoadFailed({ what = 'this', retry, retrying, compact }: { what?: string; retry: () => unknown; retrying: boolean; compact?: boolean }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <div className="load-failed" data-compact={compact}>
      <p>{offline ? `You’re offline. Connect to load ${what}.` : `Couldn’t load ${what}.`}</p>
      <SmallButton onClick={retry} busy={retrying}>Try again</SmallButton>
    </div>
  )
}

export function OfflinePill() {
  const failed = useRequestFailed()
  const [online, setOnline] = useState(navigator.onLine)
  const [back, setBack] = useState(false)
  const was = useRef(false)
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const offline = !online || failed
  useEffect(() => {
    if (offline) { was.current = true; setBack(false); return }
    if (!was.current) return
    was.current = false
    setBack(true)
    const t = setTimeout(() => setBack(false), 2000)
    return () => clearTimeout(t)
  }, [offline])
  if (!offline && !back) return null
  return <div className="offline-pill" role="status">{offline ? 'Offline' : 'Back online'}</div>
}

// ---- Pull to refresh ----------------------------------------------------

/** The iOS activity indicator: eight spokes that appear one by one as you pull, then spin. */
function Activity() {
  return (
    <svg className="activity" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="13" y1="3.5" x2="13" y2="8.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"
          transform={`rotate(${i * 45} 13 13)`} style={{ '--i': i } as CSSProperties} />
      ))}
    </svg>
  )
}

const PULL = 70 // px of bounce that triggers a refresh

/**
 * Pull down past the top to refresh, like iOS. The page keeps its native bounce; this only reads how far
 * it bounced (iOS reports a negative scrollTop) and refreshes when you let go past the threshold.
 * Spread `bind` on the scroll area and render `indicator` next to it, inside the same pane.
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const el = useRef<HTMLDivElement>(null)
  const touching = useRef(false)
  const armed = useRef(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const paint = (pulled: number) => {
    const node = el.current
    if (!node || busyRef.current) return
    const p = Math.min(1, pulled / PULL)
    node.style.setProperty('--p', String(p))
    node.style.transform = `translateY(${Math.max(0, pulled - 44)}px)`
  }

  const bind = {
    onTouchStart: () => { touching.current = true; armed.current = false },
    onTouchEnd: () => {
      touching.current = false
      if (!armed.current || busyRef.current) return
      armed.current = false
      busyRef.current = true
      setBusy(true)
      el.current?.style.removeProperty('transform')
      const started = Date.now()
      Promise.resolve(refresh()).finally(() => {
        setTimeout(() => { busyRef.current = false; setBusy(false); paint(0) }, Math.max(0, 700 - (Date.now() - started)))
      })
    },
    onScrollPull: (e: React.UIEvent<HTMLElement>) => {
      const pulled = -e.currentTarget.scrollTop
      if (pulled >= PULL && touching.current) armed.current = true
      paint(Math.max(0, pulled))
    },
  }

  const indicator = <div ref={el} className="ptr" data-busy={busy} role={busy ? 'status' : undefined} aria-label={busy ? 'Refreshing' : undefined}><Activity /></div>
  return { bind, indicator }
}

// ---- Sheet -----------------------------------------------------------------

/** Bottom sheet on a native <dialog>. Tap outside, Escape or a swipe down closes it; it rides above the keyboard. */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) { delete d.dataset.closing; d.showModal() }
    else if (!open && d.open) {
      // Safari has no `overlay` transition yet: animate out, then close
      d.dataset.closing = 'true'
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      const t = setTimeout(() => { d.close(); delete d.dataset.closing }, reduce ? 0 : 380)
      return () => clearTimeout(t)
    }
  }, [open])

  // Keep the sheet above the on-screen keyboard.
  useEffect(() => {
    if (!open || !window.visualViewport) return
    const vv = window.visualViewport
    const set = () => ref.current?.style.setProperty('--kb', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`)
    set()
    vv.addEventListener('resize', set); vv.addEventListener('scroll', set)
    return () => { vv.removeEventListener('resize', set); vv.removeEventListener('scroll', set) }
  }, [open])

  return (
    <dialog ref={ref} className="sheet" aria-label={label}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onPointerDown={(e) => { if ((e.target as HTMLElement).closest('.sheet-grab')) drag.current = { y: e.clientY, dy: 0 } }}
      onPointerMove={(e) => {
        if (!drag.current || !ref.current) return
        drag.current.dy = Math.max(0, e.clientY - drag.current.y)
        ref.current.style.setProperty('--drag', `${drag.current.dy}px`)
      }}
      onPointerUp={() => {
        const d = drag.current
        drag.current = null
        ref.current?.style.removeProperty('--drag')
        if (d && d.dy > 80) onClose()
      }}>
      <div className="sheet-body">
        <div className="sheet-grab" aria-hidden="true"><span /></div>
        {children}
      </div>
    </dialog>
  )
}

// ---- Toasts ----------------------------------------------------------------

type Toast = { id: number; text: string; action?: string; run?: () => void }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = useCallback((t: Omit<Toast, 'id'>) => {
    clearTimeout(timer.current)
    setToast({ ...t, id: Date.now() })
    timer.current = setTimeout(() => setToast(null), 4000)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toast && (
          <div key={toast.id} className="toast" role="status">
            <span>{toast.text}</span>
            {toast.action && <button type="button" onClick={() => { clearTimeout(timer.current); setToast(null); toast.run?.() }}>{toast.action}</button>}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  )
}

// ---- Tab bar ---------------------------------------------------------------

export function TabBar({ hidden }: { hidden?: boolean }) {
  const { tab, setTab, dimmed } = useNav()
  const items: [Tab, string, ReactNode][] = [
    ['now', 'Now', <HomeIcon />], ['browse', 'Browse', <Icon name="browse" />],
    ['watchlist', 'Watchlist', <Icon name="bookmark" />], ['search', 'Search', <Icon name="search" />],
  ]
  return (
    <nav className="tabbar" aria-label="Main" data-dim={dimmed} data-hidden={hidden} inert={hidden}>
      <div className="tabbar-fade" aria-hidden="true"><i /><i /><i /></div>
      <div className="tabbar-row">
        {items.map(([id, label, icon]) => (
          <button key={id} type="button" aria-label={label} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{icon}</button>
        ))}
      </div>
    </nav>
  )
}

// ---- Poster wall (Start) ---------------------------------------------------

// Drawn on one <canvas>: a CSS version with hundreds of moving layers flickers on iPhone,
// because Safari drops oversized layers while it re-rasterises them.
// Column timings from the design: sway [px, seconds, delay] and climb [loop px, seconds, delay].
const WALL: [number, number, number, number, number, number][] = [
  [45, 12, 0, 1296, 14.1, 0], [59, 15.5, 4.7, 1296, 27, 7.3], [36, 9.5, 9.4, 1296, 19.1, 14.6], [51, 13.5, 0.6, 1080, 22.5, 21.9],
  [66, 17.5, 1.3, 1080, 10.4, 7.9], [42, 11, 1.5, 1080, 19.3, 16.7], [55, 14.5, 13.7, 1296, 27, 43.8], [34, 9, 5.9, 1296, 16.2, 1.2],
  [63, 16.5, 4.6, 1296, 25.9, 5.1], [40, 10.5, 0.3, 1080, 11, 9.1], [49, 13, 8, 1080, 22.5, 17.5], [70, 18.5, 14.7, 1080, 17.4, 8.7],
]
const TILE_W = 140, TILE_H = 210, GAP = 6, PITCH = TILE_H + GAP
const GRID_W = WALL.length * (TILE_W + GAP) - GAP, GRID_H = 2600

/** cubic-bezier(0.37, 0, 0.63, 1) going back and forth, like `infinite alternate` */
function sway(t: number, seconds: number, delay: number): number {
  let u = ((t + delay) / seconds) % 2
  if (u > 1) u = 2 - u
  return (1 - Math.cos(Math.PI * u)) / 2
}

type Tile = { img: CanvasImageSource; at: number }

function roundedTile(img: HTMLImageElement | null): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 342; c.height = 513
  const g = c.getContext('2d')!
  g.beginPath(); g.roundRect(0, 0, c.width, c.height, 29); g.clip()
  g.fillStyle = '#1A1A1A'; g.fillRect(0, 0, c.width, c.height)
  if (img) {
    // object-fit: cover, top aligned
    const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight)
    g.drawImage(img, (c.width - img.naturalWidth * s) / 2, 0, img.naturalWidth * s, img.naturalHeight * s)
  }
  return c
}

/**
 * The moving wall of posters behind Start. `onReady` fires once most of the first posters are decoded
 * (or after 2.5 s), so the wall can fade in with real posters instead of popping them in one by one.
 */
export function PosterWall({ posters, still, dim = 0.55, onReady }: { posters: string[]; still?: boolean; dim?: number; onReady?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const tiles = useRef(new Map<string, Tile>())
  const readyRef = useRef(onReady)
  readyRef.current = onReady

  // Load and pre-round each poster once.
  useEffect(() => {
    if (!posters.length) return
    let live = true, done = 0, told = false
    const unique = [...new Set(posters)]
    const tell = () => { if (!told && live) { told = true; readyRef.current?.() } }
    const timer = setTimeout(tell, 2500)
    for (const path of unique) {
      if (tiles.current.has(path)) { done++; continue }
      const img = new Image()
      img.decoding = 'async'
      img.src = tmdbImage(path, 'w342')!
      img.decode().then(() => {
        if (!live) return
        tiles.current.set(path, { img: roundedTile(img), at: performance.now() })
        if (++done >= Math.ceil(unique.length * 0.7)) tell()
      }).catch(() => { if (++done >= Math.ceil(unique.length * 0.7)) tell() })
    }
    if (done >= Math.ceil(unique.length * 0.7)) tell()
    return () => { live = false; clearTimeout(timer) }
  }, [posters])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const ctx = el.getContext('2d')!
    const empty = roundedTile(null)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    const start = performance.now() / 1000
    let raf = 0, w = 0, h = 0, dpr = 1

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = el.clientWidth; h = el.clientHeight
      el.width = Math.round(w * dpr); el.height = Math.round(h * dpr)
    }
    size()
    const ro = new ResizeObserver(() => { size(); if (reduce || still) draw(start) })
    ro.observe(el)

    const columns = WALL.map(([a, wd, wdel, p, d, del], c) => ({ a, wd, wdel, p, d, del, x: c * (TILE_W + GAP), perLoop: p / PITCH, c }))

    function draw(t: number) {
      const now = performance.now()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      // camera: translate → rotate → scale, as on the design boards (the tilt is CSS on the canvas)
      const rot = reduce ? -14 : -10 - 8 * sway(t, 45, 0)
      const scale = reduce ? 1.3 : 1.2 + 0.4 * sway(t, 28, 0)
      const tx = reduce ? 0 : -150 + 300 * sway(t, 34, 0)
      const ty = reduce ? 0 : 60 - 120 * sway(t, 34, 0)
      ctx.translate(w / 2 + tx, h / 2 + ty)
      ctx.rotate((rot * Math.PI) / 180)
      ctx.scale(scale, scale)
      ctx.translate(-GRID_W / 2, -GRID_H / 2)

      // which part of the grid is on screen
      const inv = ctx.getTransform().inverse()
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
      for (const [px, py] of [[0, 0], [w * dpr, 0], [0, h * dpr], [w * dpr, h * dpr]]) {
        const q = inv.transformPoint(new DOMPoint(px, py))
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y)
      }

      for (const col of columns) {
        if (col.x + TILE_W < x0 || col.x > x1) continue
        const climb = reduce ? 0 : ((t + col.del) / col.d) % 1
        const bob = reduce ? 0 : col.a - 2 * col.a * sway(t, col.wd, col.wdel)
        const offset = -col.p - col.p * climb + bob
        const first = Math.max(0, Math.floor((y0 - offset) / PITCH))
        const last = Math.ceil((y1 - offset) / PITCH)
        for (let i = first; i <= last; i++) {
          const y = offset + i * PITCH
          const path = posters.length ? posters[(col.c * 7 + (i % col.perLoop) * 5) % posters.length] : null
          const tile = path ? tiles.current.get(path) : undefined
          ctx.globalAlpha = 1
          ctx.drawImage(empty, col.x, y, TILE_W, TILE_H)
          if (tile) {
            ctx.globalAlpha = Math.min(1, (now - tile.at) / 600)
            ctx.drawImage(tile.img, col.x, y, TILE_W, TILE_H)
          }
        }
      }
      ctx.globalAlpha = 1
    }

    const loop = () => {
      if (!document.hidden) draw(performance.now() / 1000 - start + 30)
      raf = requestAnimationFrame(loop)
    }
    if (reduce || still) {
      draw(30)
      // draw again as posters arrive
      const t = setInterval(() => draw(30), 300)
      return () => { clearInterval(t); ro.disconnect() }
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [posters, still])

  return (
    <div className="wall" aria-hidden="true">
      <canvas ref={canvas} className="wall-canvas" data-still={still} />
      <div className="wall-dim" style={{ background: `rgba(0, 0, 0, ${dim})` }} />
      <div className="wall-fade" />
    </div>
  )
}
