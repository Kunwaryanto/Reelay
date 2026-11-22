import { createPortal } from 'react-dom'
// Building blocks from the Components page of the design canvas. Styles are in src/styles/app.css.
import { useLayoutEffect,
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type ReactNode,
} from 'react'
import wordmarkSvg from '../../public/brand/wordmark.svg?raw'
import svtPlaySvg from '../../public/icons/services/svt-play.svg?raw'
import skyShowtimeSvg from '../../public/icons/services/skyshowtime.svg?raw'
import { posterSrcSet, tmdbImage } from '../lib/images'
import { summonKeyboard } from '../lib/keyboard'
import { SERVICE_NAME, loadTitle, type Card } from '../lib/catalogue'
import { useNav, useNavActions, type Tab } from '../lib/nav'
import { prefetch, useRequestFailed } from '../lib/query'
import { notePressed } from '../lib/press'

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
  const { back } = useNavActions()
  return <IconButton label="Back" glass={glass} onClick={back}><Icon name="chevron_left" size={20} /></IconButton>
}

export const Pill = ({ selected, children, ...rest }: BtnProps & { selected?: boolean }) =>
  <button type="button" className="pill" aria-pressed={selected} {...rest}>{children}</button>

// ---- Posters ---------------------------------------------------------------

// Built into the app as data URLs, so a mark never loads (or arrives) separately from its poster.
const svgUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`
const MARK_IMG: Record<string, [string, number]> = { 'svt-play': [svgUrl(svtPlaySvg), 19.3], skyshowtime: [svgUrl(skyShowtimeSvg), 20.3] }

export function ServiceMark({ service }: { service: string }) {
  const mark = MARK_IMG[service]
  if (mark) return <img className="mark" src={mark[0]} alt="" style={{ width: mark[1], height: 8 }} />
  return <span className="mark-text">{(SERVICE_NAME[service] ?? service).toUpperCase()}</span>
}

// A poster row near the screen (about a screen and a half ahead) loads all its posters, so they're usually ready
// by the time you scroll to them. Safari's own lazy loading only starts when an image is almost on screen.
const NearContext = createContext(false)

/**
 * True once the element is within about a screen and a half of what's showing in its page: time to load its
 * picture, ahead of the scroll. One observer per page, shared by everything in it.
 */
const nearObservers = new WeakMap<Element, { io: IntersectionObserver; on: WeakMap<Element, () => void> }>()
export function useNearScreen(ref: React.RefObject<HTMLElement | null>, skip = false) {
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    const page = el?.closest('.page')
    if (!el || !page || skip || near) return
    let o = nearObservers.get(page)
    if (!o) {
      const on = new WeakMap<Element, () => void>()
      // the page scrolls inside .page, so measure against it (a margin on the viewport would be clipped by it)
      const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { on.get(e.target)?.(); io.unobserve(e.target) } },
        { root: page, rootMargin: '150% 0px' })
      nearObservers.set(page, o = { io, on })
    }
    const { io, on } = o
    on.set(el, () => setNear(true))
    io.observe(el)
    return () => { io.unobserve(el); on.delete(el) }
  }, [ref, skip, near])
  return near
}

/**
 * A poster arrives in one moment: the grey tile stays plain until the image is loaded and decoded, then the
 * image, its edge line and the service mark fade in together.
 */
function wasDecoded(src: string | null | undefined) { return !!src && decoded.has(src) }
function markDecoded(src: string | null | undefined) { if (src) decoded.add(src) }

export function Cover({ path, service, eager, sizes = '147px' }: { path: string | null; service?: string; eager?: boolean; sizes?: string }) {
  const inRow = useContext(NearContext)
  const box = useRef<HTMLDivElement>(null)
  // in a grid (no row to speak for it), each poster watches for itself
  const close = useNearScreen(box, eager || inRow)
  const near = inRow || close
  const src = tmdbImage(path, 'w342')
  const [ready, setReady] = useState(!path || wasDecoded(src))
  const show = (img: HTMLImageElement) => { img.decode().catch(() => {}).finally(() => { markDecoded(src); setReady(true) }) }
  // a picture that is already loaded (the page waited for it, or it was seen before) is there from the first frame
  const pic = useRef<HTMLImageElement>(null)
  useLayoutEffect(() => { if (pic.current?.complete && pic.current.naturalWidth > 0) setReady(true) }, [])
  return (
    <div className="cover" data-ready={ready} ref={box}>
      {path && (
        <img ref={pic} src={src} srcSet={posterSrcSet(path)} sizes={sizes} alt="" draggable={false}
          loading={eager || near ? undefined : 'lazy'} decoding="async" onLoad={(e) => show(e.currentTarget)} onError={() => setReady(true)} />
      )}
      <div className="hair" aria-hidden="true" />
      {service && <span className="cover-mark" aria-hidden="true"><ServiceMark service={service} /></span>}
    </div>
  )
}

export function TitleCard({ card, note, eager, onHold }: { card: Card; note?: string | null; eager?: boolean; onHold?: (card: Card, cover: HTMLElement) => void }) {
  const { push } = useNavActions()
  const service = card.availability[0]?.service_id
  const hold = useLongPress((el) => onHold?.(card, el.querySelector<HTMLElement>('.cover')!))
  const meta = note ?? `${card.kind === 'film' ? 'Film' : 'Series'}${card.year ? ` · ${card.year}` : ''}`
  return (
    <a className="card" href={`/title/${card.id}`} {...hold.handlers}
      onPointerDown={(e) => {
        hold.handlers.onPointerDown(e)
        // a finger resting on the poster (not a scroll passing over it) starts loading its page
        const el = e.currentTarget
        setTimeout(() => { if (el.dataset.pressed) warmTitle(card.id) }, 100)
      }}
      onClick={(e) => { e.preventDefault(); if (!hold.fired()) push(`/title/${card.id}`) }}>
      <div role="img" aria-label={`${card.title}${service ? `, ${SERVICE_NAME[service] ?? service}` : ''}`}>
        <Cover path={card.poster_path} service={service} eager={eager} />
      </div>
      <span className="card-title">{card.title}</span>
      <span className="card-meta">{meta}</span>
    </a>
  )
}

/**
 * Hold 0.45 s without moving more than 8px. Scrolling always wins.
 * The press shrink waits 90 ms like iOS, so a finger that lands only to scroll never moves the poster.
 */
export function useLongPress(onHold: (el: HTMLElement) => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const start = useRef<[number, number] | null>(null)
  const el = useRef<HTMLElement | null>(null)
  const didFire = useRef(false)
  const cancel = () => {
    clearTimeout(timer.current); clearTimeout(pressTimer.current); start.current = null
    if (el.current) delete el.current.dataset.pressed
  }
  return {
    fired: () => didFire.current,
    handlers: {
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        didFire.current = false
        start.current = [e.clientX, e.clientY]
        el.current = e.currentTarget
        const target = e.currentTarget
        notePressed(target)
        clearTimeout(timer.current); clearTimeout(pressTimer.current)
        pressTimer.current = setTimeout(() => { if (start.current) target.dataset.pressed = 'true' }, 90)
        timer.current = setTimeout(() => {
          if (!start.current) return
          didFire.current = true
          delete target.dataset.pressed
          onHold(target)
        }, 450)
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        if (start.current && Math.hypot(e.clientX - start.current[0], e.clientY - start.current[1]) > 8) cancel()
      },
      // a short tap still shows the press briefly before opening
      onPointerUp: () => {
        const t = el.current
        const quick = start.current && !t?.dataset.pressed
        clearTimeout(timer.current); clearTimeout(pressTimer.current); start.current = null
        if (t && quick && !didFire.current) { t.dataset.pressed = 'true'; setTimeout(() => { delete t.dataset.pressed }, 120) }
        else if (t) delete t.dataset.pressed
      },
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  }
}

export function SectionHeader({ title, onViewAll, onViewAllPress }: { title: string; onViewAll?: () => void; onViewAllPress?: () => void }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {onViewAll && <button type="button" className="view-all" aria-label={`View all in ${title}`} onPointerDown={onViewAllPress} onClick={onViewAll}>View all</button>}
    </div>
  )
}

export function PosterRow({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    // the page scrolls inside .page, so measure against it (a margin on the viewport would be clipped by it)
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setNear(true) },
      { root: el.closest('.page'), rootMargin: '150% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [near])
  return (
    <NearContext.Provider value={near}>
      <div ref={ref} className="row-scroll noscroll"><div className="row-track">{children}</div></div>
    </NearContext.Provider>
  )
}

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
  // Shown once a request can't get through, not the moment the connection drops: until something
  // fails to load, being offline changes nothing on screen.
  const offline = failed
  useEffect(() => {
    if (offline) { was.current = true; setBack(false); return }
    if (!was.current) return
    was.current = false
    // "Back online" only if the connection really is back
    if (!navigator.onLine) return
    setBack(true)
    const t = setTimeout(() => setBack(false), 2000)
    return () => clearTimeout(t)
  }, [offline, online])
  // It drops in from above and lifts away; the words cross-fade when they change.
  const text = offline ? 'Offline' : back ? 'Back online' : ''
  const [shown, setShown] = useState(text)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (text) { setShown(text); setLeaving(false); return }
    if (!shown) return
    setLeaving(true)
    const t = setTimeout(() => { setShown(''); setLeaving(false) }, 320)
    return () => clearTimeout(t)
  }, [text, shown])
  if (!shown) return null
  return <div className="offline-pill" role="status" data-leaving={leaving}><span key={shown}>{shown}</span></div>
}

// ---- Pull to refresh ----------------------------------------------------

/** The iOS activity indicator: eight thin spokes that appear one by one as you pull, then spin. */
function Activity() {
  return (
    <svg className="activity" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <line key={i} x1="11" y1="1.5" x2="11" y2="6.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          transform={`rotate(${i * 45} 11 11)`} style={{ '--i': i } as CSSProperties} />
      ))}
    </svg>
  )
}

const HOLD = 48 // px below the status bar where the page waits while loading
const SETTLE = '--pull 420ms cubic-bezier(0.22, 1, 0.36, 1)'

/**
 * Pull down from the top to refresh, like a native iOS list. A pull that starts at the top of the page is ours
 * (not the browser's bounce): the page follows the finger with the iOS rubber-band resistance, the wheel sits in
 * the middle of the gap that opens and fills in spoke by spoke, and it starts spinning once pulled far enough. On
 * release the page eases to a resting place below the wheel, waits for the refresh, then eases home. Every
 * movement is one transform on the page, so nothing fights the native bounce.
 * Put `bind.ref` on the scroll area and render `indicator` next to it, inside the same pane.
 */
export function usePullToRefresh(refresh: () => Promise<unknown>) {
  const ind = useRef<HTMLDivElement>(null)
  const latest = useRef(refresh)
  latest.current = refresh

  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return
    let start: { x: number; y: number } | null = null
    let pulling = false
    let busy = false
    let dist = 0
    let hold = 0, trigger = 0

    const state = (v: 'idle' | 'pull' | 'armed' | 'busy' | 'done') => { if (ind.current) ind.current.dataset.state = v }
    const place = (d: number, animate: boolean) => {
      dist = d
      el.style.transition = animate ? SETTLE : 'none'
      // --pull moves what is on the page down (not the page's own box, which would cut off anything above its top
      // edge), and the picture at the top uses it to stay at the top of the screen and grow (see app.css)
      el.style.setProperty('--pull', `${d}px`)
      const i = ind.current
      if (!i) return
      i.style.transition = animate ? SETTLE : 'none'
      i.style.setProperty('--d', String(d))
      i.style.setProperty('--p', String(Math.min(1, d / trigger)))
    }
    const home = () => {
      place(0, true)
      setTimeout(() => { if (!pulling && !busy) { el.style.transition = ''; delete el.dataset.ptr; state('idle') } }, 430)
    }

    const down = (e: TouchEvent) => {
      start = !busy && e.touches.length === 1 && el.scrollTop <= 0 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null
      pulling = false
    }
    const move = (e: TouchEvent) => {
      if (!start) return
      const dx = e.touches[0].clientX - start.x, dy = e.touches[0].clientY - start.y
      if (!pulling) {
        // the first movement decides: straight down from the top is a pull, anything else is the page's own
        if (!(dy > 0 && dy > Math.abs(dx) && el.scrollTop <= 0)) { start = null; return }
        pulling = true
        el.dataset.ptr = ''
        hold = (ind.current ? parseFloat(getComputedStyle(ind.current).top) || 0 : 0) + HOLD
        trigger = hold + 12
      }
      if (e.cancelable) e.preventDefault()
      // the iOS rubber band: follows the finger at about half speed, slower the further it goes
      const h = el.clientHeight
      const d = Math.max(0, (1 - 1 / ((dy * 0.55) / h + 1)) * h)
      place(d, false)
      state(d >= trigger ? 'armed' : d > 0 ? 'pull' : 'idle')
    }
    const up = () => {
      if (!pulling) { start = null; return }
      pulling = false
      start = null
      if (dist < trigger) { state(dist > 0 ? 'done' : 'idle'); home(); return }
      busy = true
      state('busy')
      place(hold, true)
      const began = Date.now()
      Promise.resolve(latest.current()).catch(() => {}).finally(() => {
        setTimeout(() => { busy = false; state('done'); home() }, Math.max(0, 900 - (Date.now() - began)))
      })
    }

    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', up)
    el.addEventListener('touchcancel', up)
    return () => {
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
      el.removeEventListener('touchcancel', up)
    }
  }, [])

  const indicator = <div ref={ind} className="ptr" data-state="idle" aria-hidden="true"><Activity /></div>
  return { bind: { ref }, indicator }
}

// ---- Sheet -----------------------------------------------------------------

/**
 * Bottom sheet on a native <dialog>. Tap outside, Escape or a swipe down closes it.
 * Opened non-modally with its own scrim: a modal dialog sits in the browser's top layer, which iOS cuts off
 * above the bottom of the screen in Home Screen apps, leaving black under the sheet.
 */
// The room the keyboard takes at the bottom of the app, measured the first time a sheet with a field opens on
// this phone, and kept. (Sheets with fields are only used in the Home Screen app; Safari has a sign-in page.)
const KB_KEY = 'reelay:kb-height' // (renamed: the old value was measured after iOS had moved the page, so too small)

// The visible height without a keyboard, kept up to date while no field is focused. The keyboard's height is how
// much that shrinks; measuring it this way doesn't depend on iOS moving the page or the visual viewport.
let openHeight = window.visualViewport?.height ?? window.innerHeight
const typing = () => { const a = document.activeElement; return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement }
window.visualViewport?.addEventListener('resize', () => { if (!typing()) openHeight = window.visualViewport!.height })
const storedRoom = () => { try { return Number(localStorage.getItem(KB_KEY)) || 0 } catch { return 0 } }

/**
 * The room the on-screen keyboard takes while `typing`, in px (0 when it's away). Uses the height measured before
 * on this phone (the sign-in sheet and Search share it) and measures again each time the keyboard settles. The very
 * first time there is nothing to go on: `pending` is true until the keyboard has settled and been measured, so the
 * caller can hold its field back and bring it in at the right place. For a field at the bottom of the screen (Search).
 */
export function useKeyboardRoom(isTyping: boolean): { room: number; pending: boolean } {
  const touch = useMemo(() => matchMedia('(pointer: coarse)').matches, [])
  const [measured, setMeasured] = useState(storedRoom)
  const [absent, setAbsent] = useState(false)
  useEffect(() => {
    const vv = window.visualViewport
    if (!isTyping || !touch || !vv) return
    let quiet = 0
    const measure = () => {
      const room = Math.round(openHeight - vv.height)
      if (room <= 150) return // no on-screen keyboard (a hardware one, or it hasn't come up)
      setMeasured(room)
      try { localStorage.setItem(KB_KEY, String(room)) } catch { /* private mode */ }
    }
    const moved = () => { clearTimeout(quiet); clearTimeout(none); setAbsent(false); quiet = window.setTimeout(measure, 120) }
    // nothing moved: no on-screen keyboard came up (a hardware keyboard), so don't hold the field up
    const none = window.setTimeout(() => { if (openHeight - vv.height <= 150) setAbsent(true) }, 900)
    vv.addEventListener('resize', moved)
    return () => { clearTimeout(quiet); clearTimeout(none); setAbsent(false); vv.removeEventListener('resize', moved) }
  }, [isTyping, touch])
  if (!isTyping || !touch || absent) return { room: 0, pending: false }
  // never measured on this phone: wait for the keyboard to settle instead of guessing
  return { room: measured, pending: !measured }
}

/**
 * `keyboard`: for sheets with a text field (focused as the sheet opens). The sheet has one constant height: its
 * content sits just above the keyboard, keyboard open or not, and it never moves with the keyboard.
 * The first time on a phone it waits for the keyboard, measures it, then slides up; after that it uses the
 * stored measurement and opens straight away.
 */
export function Sheet({ open, onClose, label, keyboard, children }: { open: boolean; onClose: () => void; label: string; keyboard?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const drag = useRef<{ y: number; dy: number } | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      delete d.dataset.closing
      if (keyboard) {
        const room = storedRoom()
        d.style.setProperty('--kb-room', room ? `${room}px` : '46lvh')
        // first time: invisible but roughly in place (field above the keyboard, so iOS doesn't scroll the page)
        if (!room) d.dataset.waiting = 'true'
      }
      // Without a field to type in, focus the sheet itself rather than its first button
      // (which would wear a focus ring and could be scrolled into view).
      if (!keyboard) { d.tabIndex = -1; d.setAttribute('autofocus', '') }
      d.show()
    }
    else if (!open && d.open) {
      // Safari has no `overlay` transition yet: animate out, then close
      d.dataset.closing = 'true'
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
      const t = setTimeout(() => { d.close(); delete d.dataset.closing }, reduce ? 0 : 380)
      return () => clearTimeout(t)
    }
  }, [open, keyboard])


  // First time only: wait for the keyboard to settle, measure the room it takes, keep it, then slide up.
  useEffect(() => {
    const d = ref.current
    if (!open || !keyboard || !d || !d.dataset.waiting) return
    const vv = window.visualViewport
    let quiet = 0
    const place = () => {
      clearTimeout(quiet); clearTimeout(limit)
      const box = d.offsetParent
      const room = vv && box ? Math.round(openHeight - vv.height) : 0
      if (room > 150) {
        d.style.setProperty('--kb-room', `${room}px`)
        try { localStorage.setItem(KB_KEY, String(room)) } catch { /* private mode */ }
      } else d.style.setProperty('--kb-room', '0px') // no on-screen keyboard: an ordinary sheet
      d.dataset.entering = 'true'
      delete d.dataset.waiting
      requestAnimationFrame(() => requestAnimationFrame(() => { delete d.dataset.entering }))
    }
    // settled = no keyboard movement for 120 ms; give up after 900 ms (no keyboard came up)
    const moved = () => { clearTimeout(quiet); quiet = window.setTimeout(place, 120) }
    const limit = window.setTimeout(place, 900)
    vv?.addEventListener('resize', moved)
    return () => { clearTimeout(quiet); clearTimeout(limit); vv?.removeEventListener('resize', moved) }
  }, [open, keyboard])


  // Tapping a field that isn't focused yet: focus it ourselves without scrolling. Left to itself iOS scrolls the
  // whole page to "reveal" the field as the keyboard comes up, then we put it back: a visible jump. Once a field is
  // focused, touches on it are left alone (caret, selection, the Paste menu).
  useEffect(() => {
    const d = ref.current
    if (!open || !d) return
    const onTouch = (e: TouchEvent) => {
      const t = e.target as HTMLElement
      const field = t.closest('input, textarea') as HTMLInputElement | null
        ?? (t.closest('.code')?.querySelector('input') as HTMLInputElement | null)
      if (!field || field === document.activeElement || field.disabled) return
      e.preventDefault()
      field.focus({ preventScroll: true })
    }
    d.addEventListener('touchstart', onTouch, { passive: false })
    return () => d.removeEventListener('touchstart', onTouch)
  }, [open])

  // Drag the sheet down to close it, from anywhere on it: rows and buttons included (a touch that moves is a drag,
  // not a tap). A list inside scrolls first; the sheet takes over once the list is at its top, also in the middle
  // of a gesture. Closes past a quarter of its height or on a quick flick down; otherwise springs back. Dragged
  // up, it gives a little and springs back. Sideways movement is left to whatever scrolls sideways.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const d = ref.current
    if (!open || !d) return
    type G = { x: number; y: number; mode: 'pending' | 'scroll' | 'drag' | 'ignore'; list: HTMLElement | null; from: number; dy: number; trail: [number, number][] }
    let g: G | null = null
    let dragged = 0
    const scrollerOf = (t: HTMLElement) => {
      for (let el: HTMLElement | null = t; el && el !== d; el = el.parentElement) {
        if (el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el
      }
      return null
    }
    const start = (e: TouchEvent) => {
      const t = e.target as HTMLElement
      g = null
      if (e.touches.length !== 1 || !t.closest('.sheet-body') || t.closest('input, textarea') || d.dataset.closing) return
      const p = e.touches[0]
      g = { x: p.clientX, y: p.clientY, mode: 'pending', list: scrollerOf(t), from: p.clientY, dy: 0, trail: [] }
    }
    const move = (e: TouchEvent) => {
      if (!g || g.mode === 'ignore') return
      const p = e.touches[0]
      const dx = p.clientX - g.x, dy = p.clientY - g.y
      if (g.mode === 'pending') {
        if (Math.hypot(dx, dy) < 8) return
        if (Math.abs(dx) > Math.abs(dy)) { g.mode = 'ignore'; return }
        const l = g.list
        const scrolls = l && (dy > 0 ? l.scrollTop > 0 : l.scrollTop + l.clientHeight < l.scrollHeight - 1)
        g.mode = scrolls ? 'scroll' : 'drag'
        g.from = p.clientY
      }
      if (g.mode === 'scroll') {
        // the list has reached its top and the finger keeps going down: the sheet takes over from here
        if (g.list && g.list.scrollTop <= 0 && p.clientY > g.from) g.mode = 'drag'
        else { g.from = p.clientY; return }
      }
      if (e.cancelable) e.preventDefault()
      const raw = p.clientY - g.from
      g.dy = raw >= 0 ? raw : -12 * (1 - Math.exp(raw / 60)) // upward: resists, 12px at most
      g.trail.push([e.timeStamp, p.clientY])
      if (g.trail.length > 6) g.trail.shift()
      d.style.setProperty('--drag', `${g.dy}px`)
    }
    const end = () => {
      const was = g
      g = null
      if (!was || was.mode !== 'drag') return
      dragged = Date.now()
      const [t0, y0] = was.trail[0] ?? [0, 0]
      const [t1, y1] = was.trail[was.trail.length - 1] ?? [0, 0]
      const speed = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0 // px per ms, over the last few moves
      const close = was.dy > d.offsetHeight * 0.25 || (speed > 0.5 && was.dy > 16)
      // closing: straight on down from where the finger let go, not back up first
      if (close) d.dataset.closing = 'true'
      d.style.removeProperty('--drag')
      if (close) closeRef.current()
    }
    // a drag that started on a row or button must not also press it
    const click = (e: MouseEvent) => { if (Date.now() - dragged < 400) { e.preventDefault(); e.stopPropagation() } }
    d.addEventListener('touchstart', start, { passive: true })
    d.addEventListener('touchmove', move, { passive: false })
    d.addEventListener('touchend', end)
    d.addEventListener('touchcancel', end)
    d.addEventListener('click', click, true)
    return () => {
      d.removeEventListener('touchstart', start); d.removeEventListener('touchmove', move)
      d.removeEventListener('touchend', end); d.removeEventListener('touchcancel', end); d.removeEventListener('click', click, true)
      d.style.removeProperty('--drag')
    }
  }, [open])

  // A non-modal dialog doesn't close on Escape by itself
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, onClose])

  return (
    <>
    <div className="sheet-scrim" data-open={open} aria-hidden="true" onClick={onClose} />
    <dialog ref={ref} className="sheet"
data-keyboard={keyboard || undefined} aria-label={label} aria-modal="true"
      onCancel={(e) => { e.preventDefault(); onClose() }}
      // with a mouse: drag down from the sheet's own surface (not a field or button) to close it. Touch is handled above.
      onPointerDown={(e) => {
        const t = e.target as HTMLElement
        if (e.pointerType === 'touch' || !t.closest('.sheet-body') || t.closest('input, textarea, button, a')) return
        drag.current = { y: e.clientY, dy: 0 }
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
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
      }}
      onPointerCancel={() => { drag.current = null; ref.current?.style.removeProperty('--drag') }}>
      <div className="sheet-body">
        <div className="sheet-grab" aria-hidden="true"><span /></div>
        {children}
      </div>
    </dialog>
    </>
  )
}

// ---- Toasts ----------------------------------------------------------------

type Toast = { id: number; text: string; action?: string; run?: () => void }
const ToastCtx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

// A plain message stays 2.2 s; one with an action (Undo) 4 s, so there's time to reach it. A finger on the toast,
// or focus on its button, holds it. It leaves on its own, on its action, or flicked down towards the screen edge
// it came from (the way an iOS banner is flicked back up to the top edge).
const TOAST_MS = 2200
const TOAST_ACTION_MS = 4000
const TOAST_OUT_MS = 240

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setLeaving(true)
    timer.current = setTimeout(() => { setToast(null); setLeaving(false) }, TOAST_OUT_MS)
  }, [])
  const wait = useCallback((ms: number) => { clearTimeout(timer.current); timer.current = setTimeout(dismiss, ms) }, [dismiss])
  const show = useCallback((t: Omit<Toast, 'id'>) => {
    setLeaving(false)
    setToast({ ...t, id: Date.now() })
    wait(t.action ? TOAST_ACTION_MS : TOAST_MS)
  }, [wait])

  // Drag: follows the finger down, resists upward. Let go past 20px or on a quick flick down and it leaves from
  // where it is; otherwise it springs back and its time starts over.
  const drag = useRef<{ y: number; dy: number; on: boolean; trail: [number, number][] } | null>(null)
  const draggedAt = useRef(0)
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (leaving) return
    drag.current = { y: e.clientY, dy: 0, on: false, trail: [] }
    clearTimeout(timer.current) // held while touched
  }
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current
    if (!g) return
    const raw = e.clientY - g.y
    if (!g.on) {
      if (Math.abs(raw) < 6) return
      g.on = true
      e.currentTarget.setPointerCapture(e.pointerId)
      e.currentTarget.dataset.dragging = 'true'
    }
    g.dy = raw >= 0 ? raw : -10 * (1 - Math.exp(raw / 50))
    g.trail.push([e.timeStamp, e.clientY])
    if (g.trail.length > 5) g.trail.shift()
    e.currentTarget.style.setProperty('--drag', `${g.dy}px`)
  }
  const up = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = drag.current
    drag.current = null
    if (!g) return
    if (g.on) draggedAt.current = Date.now()
    delete e.currentTarget.dataset.dragging
    const [t0, y0] = g.trail[0] ?? [0, 0]
    const [t1, y1] = g.trail[g.trail.length - 1] ?? [0, 0]
    const speed = t1 > t0 ? (y1 - y0) / (t1 - t0) : 0
    if (g.on && (g.dy > 20 || (speed > 0.4 && g.dy > 6))) { dismiss(); return } // --drag stays: it leaves from there
    e.currentTarget.style.removeProperty('--drag')
    if (toast) wait(toast.action ? TOAST_ACTION_MS : TOAST_MS)
  }
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications" aria-live="polite">
        {toast && (
          <div key={toast.id} className="toast" role="status" data-leaving={leaving || undefined}
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onFocus={() => clearTimeout(timer.current)} onBlur={() => { if (!leaving) wait(TOAST_MS) }}>
            <span>{toast.text}</span>
            {toast.action && <button type="button" onClick={() => { if (Date.now() - draggedAt.current < 400) return; dismiss(); toast.run?.() }}>{toast.action}</button>}
          </div>
        )}
      </div>
    </ToastCtx.Provider>
  )
}

// ---- Tab bar ---------------------------------------------------------------

export function TabBar({ hidden, arriving }: { hidden?: boolean; arriving?: boolean }) {
  const { tab, setTab, dimmed } = useNav()
  const items: [Tab, string, ReactNode][] = [
    ['now', 'Now', <HomeIcon key="i" />], ['browse', 'Browse', <Icon key="i" name="browse" />],
    ['watchlist', 'Watchlist', <Icon key="i" name="bookmark" />], ['search', 'Search', <Icon key="i" name="search" />],
  ]
  return (
    <nav className="tabbar" aria-label="Main" data-dim={dimmed} data-hidden={hidden} data-arriving={arriving || undefined} inert={hidden}>
      <div className="tabbar-fade" aria-hidden="true"><i /><i /><i /></div>
      <div className="tabbar-row">
        {items.map(([id, label, icon]) => (
          <button key={id} type="button" aria-label={label} aria-current={tab === id ? 'page' : undefined} onClick={() => { if (id === 'search' && tab !== 'search') summonKeyboard(); setTab(id) }}>{icon}</button>
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

// ---- The picture at the top of a page ----------------------------------------

/**
 * Puts the top picture behind the scrolling page instead of inside it, pinned to the top of the screen. When iOS
 * bounces the page down, or it is pulled to refresh, the picture then simply doesn't move, so nothing has to be
 * corrected frame by frame (which is what made it judder). Scrolling up, the picture's frame leaves with the page
 * and the picture inside it lags a little (see .art-layer in app.css).
 * Render it anywhere inside the page; `children` are the pictures.
 */
export function PinnedArt({ children }: { children: ReactNode }) {
  const mark = useRef<HTMLSpanElement>(null)
  const [frame, setFrame] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    const page = mark.current?.closest<HTMLElement>('main.page')
    if (!page?.parentElement) return
    const layer = document.createElement('div')
    layer.className = 'art-layer'
    layer.setAttribute('aria-hidden', 'true')
    const drift = document.createElement('div')
    drift.className = 'art-drift'
    // the dark fade over the picture belongs to it (it stays put with it); the title over it moves with the page
    const shade = document.createElement('div')
    shade.className = 'hero-shade'
    layer.append(drift, shade)
    page.before(layer)
    setFrame(drift)
    // browsers without scroll-driven animations: move it by hand
    let stop = () => {}
    if (!CSS.supports('animation-timeline', 'scroll()')) {
      const move = () => { const y = Math.max(0, Math.min(540, page.scrollTop)); layer.style.translate = `0 ${-y}px`; drift.style.translate = `0 ${y * 0.315}px` }
      page.addEventListener('scroll', move, { passive: true })
      stop = () => page.removeEventListener('scroll', move)
    }
    return () => { stop(); layer.remove() }
  }, [])
  return <><span ref={mark} hidden />{frame && createPortal(children, frame)}</>
}

/** The small count on a type pill. Without a number yet it takes no room; when the number lands the pill eases wider as it fades in. */
export function PillCount({ n, off }: { n?: number; off?: boolean }) {
  return <sup aria-hidden="true" data-on={n !== undefined || undefined} data-off={off || undefined}><i>{n}</i></sup>
}

// ---- Pages arriving ----------------------------------------------------------

/** Start loading a title's page as a finger lands on its poster. */
export const titleArt = (t: { backdrop_path?: string | null; poster_path?: string | null } | null | undefined): Picture[] =>
  [{ src: t && (tmdbImage(t.backdrop_path, 'w1280') ?? tmdbImage(t.poster_path, 'w780')) }]
export const warmTitle = (id: number) => prefetch(`title:${id}`, () => loadTitle(id).then((t) => { warmPictures(titleArt(t)); return t }), { maxAge: 10 * 60 * 1000 })

/** Start a load on a press that isn't a scroll: the finger still after 80 ms, or lifted without having moved. */
export function usePressWarm(run: () => void) {
  const at = useRef<[number, number] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const stop = () => { clearTimeout(timer.current); at.current = null }
  return {
    onPointerDown: (e: React.PointerEvent) => { at.current = [e.clientX, e.clientY]; clearTimeout(timer.current); timer.current = setTimeout(() => { if (at.current) run() }, 80) },
    onPointerMove: (e: React.PointerEvent) => { if (at.current && Math.hypot(e.clientX - at.current[0], e.clientY - at.current[1]) > 8) stop() },
    onPointerUp: () => { if (at.current) run(); stop() },
    onPointerCancel: stop,
  }
}

export type Picture = { src: string | null | undefined; srcset?: string; sizes?: string }
/** A poster as its card will ask for it, so the file waited for is the file shown. */
export const posterPicture = (path: string | null): Picture => ({ src: tmdbImage(path, 'w342'), srcset: posterSrcSet(path), sizes: '147px' })
// Pictures this session has already decoded: they can show from the first frame, with no fade of their own.
const decoded = new Set<string>()
const decodePicture = ({ src, srcset, sizes }: Picture) => {
  if (!src || decoded.has(src)) return Promise.resolve()
  const img = new Image()
  if (srcset) { img.sizes = sizes ?? '147px'; img.srcset = srcset }
  img.src = src
  return img.decode().then(() => { decoded.add(src) }).catch(() => {})
}
/** Fetch and decode pictures ahead of the page that will show them. */
export const warmPictures = (pictures: Picture[]) => { for (const p of pictures) void decodePicture(p) }
const allDecoded = (pictures: Picture[]) => pictures.every((p) => !p.src || decoded.has(p.src))

export type Arrival = 'wait' | 'in' | 'there'
/**
 * How a page arrives. Its answer saved and its pictures above the fold already decoded when it opens: 'there' at
 * once, nothing animates. Otherwise 'wait' (placeholders) until the answer is in and those pictures are decoded,
 * at most 2.5 s for the pictures; then 'in' while everything fades in as one piece, and 'there' after.
 */
export function useArrival(key: string, has: boolean, pictures: () => Picture[]): Arrival {
  const [st, setSt] = useState<{ key: string; phase: Arrival }>(() => ({ key, phase: has && allDecoded(pictures()) ? 'there' : 'wait' }))
  let cur = st
  if (st.key !== key) { cur = { key, phase: has && allDecoded(pictures()) ? 'there' : 'wait' }; setSt(cur) }
  const phase = cur.phase
  const pics = useRef(pictures)
  pics.current = pictures
  useEffect(() => {
    if (phase !== 'wait' || !has) return
    let live = true
    const done = () => { if (live) { live = false; setSt({ key, phase: 'in' }) } }
    void Promise.all(pics.current().map(decodePicture)).then(done)
    const t = setTimeout(done, 2500)
    return () => { live = false; clearTimeout(t) }
  }, [key, has, phase])
  useEffect(() => {
    if (phase !== 'in') return
    const t = setTimeout(() => setSt((s) => (s.key === key && s.phase === 'in' ? { key, phase: 'there' } : s)), 460)
    return () => clearTimeout(t)
  }, [key, phase])
  return phase
}

/** Placeholders while a page waits: 'rows' a heading and posters under the top picture, 'grid' posters three across, 'title' a title page's first lines. */
export function Skeleton({ kind, leaving }: { kind: 'rows' | 'grid' | 'title'; leaving?: boolean }) {
  return (
    <div className="skel" data-kind={kind} data-leaving={leaving || undefined} aria-hidden="true">
      {kind === 'rows' && <section><i /><div><span /><span /><span /></div></section>}
      {kind === 'grid' && Array.from({ length: 12 }, (_, i) => <span key={i} />)}
      {kind === 'title' && <><i /><i /><i /><b /><b /><b /></>}
    </div>
  )
}

/** True once a pill has been switched on this screen: its list is then keyed by the pill and plays the entrance (`pill-in`) on every switch, never on first showing. */
export function useSwitched(value: string) {
  const prev = useRef(value)
  const switched = useRef(false)
  if (prev.current !== value) { prev.current = value; switched.current = true }
  return switched.current
}

// ---- A rolling number -------------------------------------------------------

const TEN = Array.from({ length: 10 }, (_, i) => i)
/**
 * A number whose digits roll to their new value, each in its own column (1,204 to 1,198: only the digits that
 * change move). Digits are kept by place, counted from the right, so the ones stay the ones. A place the number
 * no longer has (1,204 to 87) closes up instead of vanishing, and a new one opens, so whatever holds the number
 * changes width smoothly. Hidden from screen readers: give the holder the plain text as its label.
 */
export function Rolling({ n }: { n: number }) {
  const s = Math.max(0, Math.round(n)).toLocaleString('en')
  const most = useRef(0)
  most.current = Math.max(most.current, s.length)
  // not on first showing: the number is simply there
  const [live, setLive] = useState(false)
  useEffect(() => { setLive(true) }, [])
  const cells: ReactNode[] = []
  for (let place = most.current; place >= 1; place--) {
    const ch = s[s.length - place]
    cells.push(place % 4 === 0
      ? <span key={place} className="roll-c" data-off={ch === undefined || undefined}>,</span>
      : <span key={place} className="roll-d" data-off={ch === undefined || undefined} style={{ '--d': ch ?? 0 } as CSSProperties}><span>{TEN.map((i) => <i key={i}>{i}</i>)}</span></span>)
  }
  return <span className="roll" data-live={live || undefined} aria-hidden="true">{cells}</span>
}
