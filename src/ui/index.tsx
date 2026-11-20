// Building blocks from the Components page of the design canvas. Styles are in src/styles/app.css.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type ReactNode,
} from 'react'
import wordmarkSvg from '../../public/brand/wordmark.svg?raw'
import { posterSrcSet, tmdbImage } from '../lib/images'
import { SERVICE_NAME, type Card } from '../lib/catalogue'
import { useNav, type Tab } from '../lib/nav'
import { useRequestFailed } from '../lib/query'

// ---- Icons -----------------------------------------------------------------

export function Icon({ name, size = 24, fill = false, weight, style }: { name: string; size?: number; fill?: boolean; weight?: number; style?: CSSProperties }) {
  return (
    <span className="ms" aria-hidden="true"
      style={{ fontSize: size, fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight ?? 250}`, ...style }}>
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
export function LoadFailed({ what = 'this', retry, retrying, compact }: { what?: string; retry: () => void; retrying: boolean; compact?: boolean }) {
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

// Column timings from the design: sway [px, seconds, delay] and climb [loop px, seconds, delay].
const WALL: [number, number, number, number, number, number][] = [
  [45, 12, 0, 1296, 14.1, 0], [59, 15.5, 4.7, 1296, 27, 7.3], [36, 9.5, 9.4, 1296, 19.1, 14.6], [51, 13.5, 0.6, 1080, 22.5, 21.9],
  [66, 17.5, 1.3, 1080, 10.4, 7.9], [42, 11, 1.5, 1080, 19.3, 16.7], [55, 14.5, 13.7, 1296, 27, 43.8], [34, 9, 5.9, 1296, 16.2, 1.2],
  [63, 16.5, 4.6, 1296, 25.9, 5.1], [40, 10.5, 0.3, 1080, 11, 9.1], [49, 13, 8, 1080, 22.5, 17.5], [70, 18.5, 14.7, 1080, 17.4, 8.7],
]

export function PosterWall({ posters, still, dim = 0.55 }: { posters: string[]; still?: boolean; dim?: number }) {
  const columns = useMemo(() => WALL.map(([a, wd, wdel, p, d, del], c) => {
    const perLoop = p / 216 // 210px poster + 6px gap
    const tiles = Array.from({ length: perLoop * 5 }, (_, i) => posters.length ? posters[(c * 7 + (i % perLoop) * 5) % posters.length] : null)
    return { a, wd, wdel, p, d, del, tiles }
  }), [posters])
  return (
    <div className="wall" data-still={still} aria-hidden="true">
      <div className="cam"><div className="cam-3"><div className="cam-y"><div className="cam-t"><div className="cam-r"><div className="cam-s">
        <div className="wall-grid">
          {columns.map((col, c) => (
            <div key={c} className="wob" style={{ '--a': `${col.a}px`, animationDuration: `${col.wd}s`, animationDelay: `-${col.wdel}s` } as CSSProperties}>
              <div className="col" style={{ '--p': `${col.p}px`, animationDuration: `${col.d}s`, animationDelay: `-${col.del}s` } as CSSProperties}>
                {col.tiles.map((path, i) => <span key={i}>{path && <img src={tmdbImage(path, 'w185')} alt="" decoding="async" />}</span>)}
              </div>
            </div>
          ))}
        </div>
      </div></div></div></div></div></div>
      <div className="wall-dim" style={{ background: `rgba(0, 0, 0, ${dim})` }} />
      <div className="wall-fade" />
    </div>
  )
}
