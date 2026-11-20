import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/*
 * Temporary: measures the screen on a real iPhone, to find the black band at the bottom of the Home Screen app.
 * Open it by tapping the top edge of the screen (the top 90px) five times quickly, or with ?screen in the address.
 * While it's open the page background turns magenta: if the band turns magenta, it's our layout;
 * if it stays black, iOS isn't drawing the page there at all.
 */

const KEY = 'reelay:screen-check'


function probe(css: string): number {
  const el = document.createElement('div')
  el.style.cssText = `position:fixed;left:0;top:0;width:1px;visibility:hidden;pointer-events:none;${css}`
  document.body.appendChild(el)
  const h = el.getBoundingClientRect().height
  el.remove()
  return Math.round(h * 10) / 10
}

function rect(sel: string) {
  const el = document.querySelector(sel)
  if (!el) return 'none'
  const r = el.getBoundingClientRect()
  return `top ${Math.round(r.top)} bottom ${Math.round(r.bottom)} h ${Math.round(r.height)}`
}

function measure() {
  const vv = window.visualViewport
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    time: new Date().toLocaleTimeString('sv-SE'),
    ios: navigator.userAgent.match(/OS (\d+[_\d]*)/)?.[1]?.replace(/_/g, '.') ?? navigator.userAgent,
    standalone: `${matchMedia('(display-mode: standalone)').matches} / navigator ${nav.standalone}`,
    orientation: matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
    dpr: devicePixelRatio,
    screen: `${screen.width} x ${screen.height}`,
    avail: `${screen.availWidth} x ${screen.availHeight}`,
    inner: `${innerWidth} x ${innerHeight}`,
    outer: `${outerWidth} x ${outerHeight}`,
    client: `${document.documentElement.clientWidth} x ${document.documentElement.clientHeight}`,
    visual: vv ? `${Math.round(vv.width)} x ${Math.round(vv.height)} top ${Math.round(vv.offsetTop)} scale ${vv.scale}` : 'none',
    '100vh': probe('height:100vh'),
    '100svh': probe('height:100svh'),
    '100lvh': probe('height:100lvh'),
    '100dvh': probe('height:100dvh'),
    '100%': probe('top:0;bottom:0'),
    'safe top': probe('height:env(safe-area-inset-top,0px)'),
    'safe bottom': probe('height:env(safe-area-inset-bottom,0px)'),
    html: rect('html'),
    body: rect('body'),
    root: rect('#root'),
    tabbar: rect('.tabbar'),
    sheet: rect('.sheet'),
    'sheet body': rect('.sheet-body'),
    scrollY: Math.round(window.scrollY),
    start: rect('.start'),
  }
}

type Reading = ReturnType<typeof measure>

export function ScreenCheck() {
  const [open, setOpen] = useState(() => {
    try { return location.search.includes('screen') || localStorage.getItem(KEY) === '1' } catch { return false }
  })
  const [panel, setPanel] = useState(true)
  const [now, setNow] = useState<Reading | null>(null)
  const [log, setLog] = useState<string[]>([])
  const last = useRef('')

  // five quick taps on the top edge
  useEffect(() => {
    let taps: number[] = []
    const down = (e: PointerEvent) => {
      if (e.clientY > 90) return
      const t = Date.now()
      taps = [...taps.filter((x) => t - x < 2000), t]
      if (taps.length >= 5) { taps = []; setOpen((o) => !o) }
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  }, [])

  useEffect(() => {
    try { if (open) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY) } catch { /* private mode */ }
    if (!open) return
    document.documentElement.classList.add('screen-check')
    const update = (why: string) => {
      const r = measure()
      setNow(r)
      const sig = `inner ${r.inner} · visual ${r.visual} · scrollY ${r.scrollY} · sheet ${r['sheet body']}`
      if (sig !== last.current) {
        last.current = sig
        setLog((l) => [`${r.time} ${why}: ${sig}`, ...l].slice(0, 20))
      }
    }
    update('open')
    const onResize = () => update('resize')
    const onVV = () => update('keyboard/viewport')
    const onOrient = () => setTimeout(() => update('rotate'), 400)
    const onVis = () => { if (!document.hidden) setTimeout(() => update('back to app'), 300) }
    const tick = setInterval(() => update('check'), 500)
    addEventListener('resize', onResize)
    visualViewport?.addEventListener('resize', onVV)
    addEventListener('orientationchange', onOrient)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.documentElement.classList.remove('screen-check')
      clearInterval(tick)
      removeEventListener('resize', onResize)
      visualViewport?.removeEventListener('resize', onVV)
      removeEventListener('orientationchange', onOrient)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [open])

  if (!open || !now) return null
  const text = [...Object.entries(now).map(([k, v]) => `${k}: ${v}`), '', 'changes:', ...log].join('\n')
  const ticks = Array.from({ length: Math.ceil(screen.height / 50) + 1 }, (_, i) => i * 50)

  return createPortal(
    <>
    {/* not fixed: a ruler as tall as the physical screen in the page itself, so the last number you can see
        is where the page stops being drawn (fixed layers are cut off at the viewport's bottom) */}
    <div className="sc-ruler" style={{ height: screen.height }}>
      {ticks.map((y) => <span key={y} style={{ top: y }}>{y}</span>)}
    </div>
    <div className="sc-mark sc-abs" style={{ top: screen.height - 34 }}>in page, not fixed</div>
    <div className="sc" aria-hidden={!panel}>
      <div className="sc-mark sc-fixed-bottom">bottom: 0</div>
      <div className="sc-mark sc-lvh">100lvh</div>
      <div className="sc-mark sc-screen" style={{ top: screen.height - 16 }}>screen.height</div>
      {panel ? (
        <div className="sc-panel">
          <pre>{text}</pre>
          <div className="sc-actions">
            <button type="button" onClick={() => navigator.clipboard?.writeText(text)}>Copy</button>
            <button type="button" onClick={() => setPanel(false)}>Hide panel</button>
            <button type="button" onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      ) : (
        <button type="button" className="sc-show" onClick={() => setPanel(true)}>Show</button>
      )}
    </div>
    </>,
    document.body,
  )
}
