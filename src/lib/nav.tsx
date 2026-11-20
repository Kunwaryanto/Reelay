// Navigation: four tabs, each with its own stack of pages.
// Pages sit side by side in a horizontal scroll-snap strip, so swiping back follows the finger like iOS
// (the "stack drill-down" pattern from modern-web-guidance). Browser history is kept in step.
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ReactNode, type UIEvent,
} from 'react'

export type Tab = 'now' | 'browse' | 'watchlist' | 'search'
export const TABS: Tab[] = ['now', 'browse', 'watchlist', 'search']
const TAB_PATH: Record<Tab, string> = { now: '/', browse: '/browse', watchlist: '/watchlist', search: '/search' }

type Page = { key: string; path: string }
type State = { tab: Tab; stacks: Record<Tab, Page[]> }

type Nav = {
  tab: Tab
  /** path of the page on top of the active tab, or the tab's own path */
  path: string
  push: (path: string) => void
  back: () => void
  setTab: (tab: Tab) => void
  /** the tab bar dims while a page scrolls down */
  dimmed: boolean
  setDimmed: (dimmed: boolean) => void
}

const Ctx = createContext<Nav | null>(null)
/** The ways to move. They never change, so components that only navigate don't re-render on every push or scroll. */
type NavActions = Pick<Nav, 'push' | 'back' | 'setTab' | 'setDimmed'>
const ActionsCtx = createContext<NavActions | null>(null)
const StackCtx = createContext<{ state: State; popTo: (tab: Tab, length: number) => void } | null>(null)

export function useNav(): Nav {
  const v = useContext(Ctx)
  if (!v) throw new Error('useNav outside NavProvider')
  return v
}

/** push, back, setTab and setDimmed only: use this in anything big (rows of posters), so it doesn't re-render with the nav state. */
export function useNavActions(): NavActions {
  const v = useContext(ActionsCtx)
  if (!v) throw new Error('useNavActions outside NavProvider')
  return v
}

let seq = 0
const page = (path: string): Page => ({ key: `p${++seq}`, path })

function initialState(): State {
  const stacks: State['stacks'] = { now: [], browse: [], watchlist: [], search: [] }
  const path = location.pathname
  const tab = TABS.find((t) => TAB_PATH[t] === path)
  if (tab) return { tab, stacks }
  if (path !== '/' && !path.startsWith('/i/')) stacks.now = [page(path)]
  return { tab: 'now', stacks }
}

export function NavProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initialState)
  const [dimmed, setDimmed] = useState(false)
  const depth = useRef(0)
  const ignorePop = useRef(0)
  const stateRef = useRef(state)
  stateRef.current = state

  const topPath = (s: State) => s.stacks[s.tab].at(-1)?.path ?? TAB_PATH[s.tab]

  useEffect(() => {
    // normalise the first entry (an invite link or unknown path lands on its tab)
    history.replaceState({ depth: 0 }, '', topPath(stateRef.current))
    const onPop = (e: PopStateEvent) => {
      const to = (e.state as { depth?: number } | null)?.depth ?? 0
      if (ignorePop.current > 0) { ignorePop.current--; depth.current = to; return }
      const s = stateRef.current
      if (to < depth.current && s.stacks[s.tab].length > 0) {
        const steps = Math.min(depth.current - to, s.stacks[s.tab].length)
        setState({ ...s, stacks: { ...s.stacks, [s.tab]: s.stacks[s.tab].slice(0, -steps) } })
      }
      depth.current = to
      // keep the address in step if the browser went somewhere we don't follow (forward)
      queueMicrotask(() => history.replaceState({ depth: to }, '', topPath(stateRef.current)))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const push = useCallback((path: string) => {
    const s = stateRef.current
    if (topPath(s) === path) return
    depth.current++
    history.pushState({ depth: depth.current }, '', path)
    setDimmed(false)
    setState({ ...s, stacks: { ...s.stacks, [s.tab]: [...s.stacks[s.tab], page(path)] } })
  }, [])

  const back = useCallback(() => {
    if (stateRef.current.stacks[stateRef.current.tab].length === 0) return
    if (depth.current > 0) history.back()
    else {
      const s = stateRef.current
      const next = { ...s, stacks: { ...s.stacks, [s.tab]: s.stacks[s.tab].slice(0, -1) } }
      setState(next)
      history.replaceState({ depth: 0 }, '', topPath(next))
    }
  }, [])

  // A swipe already moved the strip: drop the pages and step history without another animation.
  const popTo = useCallback((tab: Tab, length: number) => {
    const s = stateRef.current
    const steps = s.stacks[tab].length - length
    if (steps <= 0) return
    const next = { ...s, stacks: { ...s.stacks, [tab]: s.stacks[tab].slice(0, length) } }
    setState(next)
    setDimmed(false)
    const hist = Math.min(steps, depth.current)
    if (hist > 0) { ignorePop.current++; history.go(-hist) }
    else history.replaceState({ depth: depth.current }, '', topPath(next))
  }, [])

  const setTab = useCallback((tab: Tab) => {
    const s = stateRef.current
    // tapping the tab you're on goes back to its first page
    const next = tab === s.tab ? { ...s, stacks: { ...s.stacks, [tab]: [] } } : { ...s, tab }
    setState(next)
    setDimmed(false)
    history.replaceState({ depth: depth.current }, '', topPath(next))
  }, [])

  const nav = useMemo<Nav>(
    () => ({ tab: state.tab, path: topPath(state), push, back, setTab, dimmed, setDimmed }),
    [state, push, back, setTab, dimmed],
  )
  const stack = useMemo(() => ({ state, popTo }), [state, popTo])
  const actions = useMemo<NavActions>(() => ({ push, back, setTab, setDimmed }), [push, back, setTab])

  return (
    <ActionsCtx.Provider value={actions}>
      <Ctx.Provider value={nav}><StackCtx.Provider value={stack}>{children}</StackCtx.Provider></Ctx.Provider>
    </ActionsCtx.Provider>
  )
}

// ---------------------------------------------------------------------------

// Push and pop move the pages with transform animations, which Safari runs off the main thread,
// so a page that is still rendering can't make the slide stutter. The strip jumps (push) or waits (pop)
// and the animations draw the movement, including the leaving page's slower slide and dim that the
// scroll-driven pane-leave animation in app.css draws during a swipe. Only the finger's swipe back scrolls.
const SLIDE = { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' as const } // --ease-sheet
const LEAVE = 0.7 // pane-leave: translateX(70%), opacity 0.55
const at = (x: number, dim = false) => ({ transform: `translateX(${x}px)`, opacity: dim ? 0.55 : 1 })

/** Snapping and the swipe parallax back on. */
function unlockStrip(strip: HTMLElement) {
  strip.style.scrollSnapType = ''
  delete strip.dataset.sliding
}

/** Run the keyframes on each pane, then call done. Returns a cancel. */
function slidePanes(strip: HTMLElement, moves: [Element | undefined, Keyframe[]][], done: () => void): () => void {
  const list = moves.filter((m): m is [Element, Keyframe[]] => !!m[0])
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !list.length) { done(); return () => {} }
  // While the animations draw the slide: no snapping (it would chase the moving panes)
  // and no scroll-driven pane-leave (it would jump with the strip).
  strip.style.scrollSnapType = 'none'
  strip.dataset.sliding = ''
  const anims = list.map(([el, frames]) => el.animate(frames, SLIDE))
  let over = false
  const end = () => {
    if (over) return
    over = true
    clearTimeout(watchdog)
    anims.forEach((a) => a.cancel())
    done()
    // A frame later, once the scroll-driven timelines have caught up with the jump.
    // (The timer covers a frame that never comes, e.g. the app was sent to the background.)
    requestAnimationFrame(() => unlockStrip(strip))
    setTimeout(() => unlockStrip(strip), 100)
  }
  // Never leave the strip locked: if the animation is cancelled or its promise never settles, end anyway.
  const watchdog = setTimeout(end, SLIDE.duration + 250)
  anims[0].finished.then(end, end)
  return () => { if (over) return; over = true; clearTimeout(watchdog); anims.forEach((a) => a.cancel()); unlockStrip(strip) }
}

/** One tab: its first page plus whatever has been pushed on top. Stays mounted while another tab shows. */
export function TabStack({ tab, root, render }: { tab: Tab; root: ReactNode; render: (path: string) => ReactNode }) {
  const ctx = useContext(StackCtx)!
  const pages = ctx.state.stacks[tab]
  const active = ctx.state.tab === tab
  const [shown, setShown] = useState(pages)
  const strip = useRef<HTMLDivElement>(null)
  const sliding = useRef(false)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const first = useRef(true)

  // A page was pushed: mount it, then slide to it. A page was popped: slide back, then unmount it.
  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    if (pages === shown) return
    if (pages.length >= shown.length) { setShown(pages); return }
    const target = pages.length * el.clientWidth
    if (el.scrollLeft <= target + 2) { setShown(pages); return }
    // slide the top page and the one under it right, then jump the strip back and drop the page
    const w = el.clientWidth
    const top = Math.round(el.scrollLeft / w)
    const shift = w * (top - pages.length)
    sliding.current = true
    const cancel = slidePanes(el, [
      [el.children[top], [at(0), at(shift)]],
      [el.children[top - 1], [at(LEAVE * w, true), at(shift)]],
    ], () => {
      el.scrollLeft = target
      sliding.current = false
      setShown(pages)
    })
    return () => { cancel(); sliding.current = false }
  }, [pages, shown])

  useLayoutEffect(() => {
    const el = strip.current
    if (!el) return
    const target = shown.length * el.clientWidth
    if (first.current) { first.current = false; el.scrollLeft = target; return }
    if (el.scrollLeft < target - 2 && shown === pages) {
      // jump the strip to the new page, then slide it and the page under it in from where they were
      const from = target - el.scrollLeft
      sliding.current = true
      const cancel = slidePanes(el, [
        [el.children[shown.length], [at(from), at(0)]],
        [el.children[shown.length - 1], [at(from), at(LEAVE * el.clientWidth, true)]],
      ], () => { sliding.current = false })
      el.scrollLeft = target
      return () => { cancel(); sliding.current = false }
    }
  }, [shown, pages])

  // The finger swiped back: once the strip settles on an earlier page, drop the ones after it.
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || sliding.current) return
    const el = e.currentTarget
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      if (sliding.current || !el.clientWidth) return
      const index = Math.round(el.scrollLeft / el.clientWidth)
      if (index < shown.length && Math.abs(el.scrollLeft - index * el.clientWidth) < 2) ctx.popTo(tab, index)
    }, 90)
  }

  return (
    <div ref={strip} className="stack" data-active={active} inert={!active} onScroll={onScroll}
      // a finger on the strip while no slide runs: make sure it can swipe and snap
      onTouchStart={(e) => { if (!sliding.current) unlockStrip(e.currentTarget) }}>
      {/* The swipe parallax moves .pane-in, never the .pane itself: Safari snaps to the transformed box,
          so a moving snap area pulls the strip to a stop halfway. */}
      <section className="pane" inert={shown.length > 0}><div className="pane-in">{root}</div></section>
      {shown.map((p, i) => (
        <section key={p.key} className="pane" inert={i < shown.length - 1}><div className="pane-in">{render(p.path)}</div></section>
      ))}
    </div>
  )
}

/** For a page's scroll area: tells the tab bar to dim on the way down and return on the way up. */
export function useDimOnScroll() {
  const { setDimmed } = useNavActions()
  const last = useRef(0)
  return useCallback((e: UIEvent<HTMLElement>) => {
    const el = e.currentTarget
    const y = el.scrollTop
    // Ignore the bounce past either end, so the tab bar keeps its state while the page springs back.
    if (y < 0 || y > el.scrollHeight - el.clientHeight) return
    const d = y - last.current
    if (Math.abs(d) < 6) return
    last.current = y
    setDimmed(d > 0 && y > 24)
  }, [setDimmed])
}
