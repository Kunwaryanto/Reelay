// First run: which services you have, a few titles to start the Watchlist, and which notifications you want.
// One wall of posters and one camera (canvas: Onboarding v19): every step change is a single move of the wall,
// and the step's text and controls fade out as it starts and rise in as it settles. Every step can be skipped.
// Shown once (profiles.onboarded_at), and again from Settings while testing.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { loadPicks, type Card } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { loadServices, useMyServices, useProfile, type NotifyKey, type Service } from '../lib/profile'
import { askPermission, permission } from '../lib/push'
import { useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { Button, Icon, ServiceMark, Sheet, useToast } from '../ui'

type Step = 'svc' | 'pick' | 'notify'
type Cam = 'enter' | Step | 'exit'
// The camera per step: Services sits high and small, Pick is zoomed in to finger-sized posters,
// Notifications pulls back behind a blur, and leaving pushes into the wall.
const CAM: Record<Cam, string> = {
  enter: 'translate3d(0, -150px, 0) rotate(-15deg) scale(1.14)',
  svc: 'translate3d(0, -150px, 0) rotate(-8deg) scale(1)',
  pick: 'translate3d(0, 0, 0) rotate(-6deg) scale(1.58)',
  notify: 'translate3d(0, -90px, 0) rotate(-8deg) scale(0.9)',
  exit: 'translate3d(0, -70px, 0) rotate(-7deg) scale(1.22)',
}
const COLS = 6, PER = 6, CELL = 126.24
// each column drifts into place when the wall first shows: a different distance and pace, alternating direction
const DRIFT_MS = [2500, 2650, 2600, 2800, 2700, 2900]
const BX = 150, BY = 160 // how far the wall pans while picking; past it, it pulls back like iOS
const band = (v: number, lim: number) => (v > lim ? lim + (v - lim) * 0.35 : v < -lim ? -lim + (v + lim) * 0.35 : v)
const clamp = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v))

const NOTIFY: [NotifyKey, string][] = [['notify_leaving', 'Leaving soon'], ['notify_arrivals', 'Arriving on your services'], ['notify_new_seasons', 'New seasons']]
const EXAMPLES: Record<NotifyKey, [string, string, string]> = {
  notify_leaving: ['Paranoid', 'now', 'Leaves Netflix tomorrow.'],
  notify_arrivals: ['The Gilded Age', '2h ago', 'Now streaming on HBO Max.'],
  notify_new_seasons: ['Black Doves', 'Yesterday', 'Season 2 is out on Netflix.'],
}
// A notification card: not there, about to land (space opens), there, fading with the step, swiped away, gone.
type Phase = 'hidden' | 'pre' | 'shown' | 'out' | 'swipe' | 'gone'
const NO_CARDS: Record<NotifyKey, Phase> = { notify_leaving: 'hidden', notify_arrivals: 'hidden', notify_new_seasons: 'hidden' }

function Head({ onBack, onSkip }: { onBack?: () => void; onSkip: () => void }) {
  return (
    <header className="ob-head ob-rise">
      {onBack ? <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><span><Icon name="chevron_left" size={20} /></span></button> : <span />}
      <button type="button" className="ob-skip" onClick={onSkip}>Skip</button>
    </header>
  )
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const { mine, set } = useMyServices()
  const { update } = useProfile()
  const saved = useSaved()
  const toast = useToast()
  const services = useQuery<Service[]>('services', loadServices, { maxAge: 24 * 60 * 60 * 1000 })
  const picks = useQuery<Card[]>('picks:49', loadPicks, { maxAge: 60 * 60 * 1000 })

  const [step, setStep] = useState<Step>('svc')       // where the camera is
  const [view, setView] = useState<Step | null>(null) // whose text and controls are mounted
  const [cam, setCam] = useState<{ at: Cam; tr: string }>({ at: 'enter', tr: 'none' })
  const [wallOn, setWallOn] = useState(false)
  const [blur, setBlur] = useState(false)
  const [ui, setUi] = useState(false)
  const [locked, setLocked] = useState(true)
  // posters for services you don't have are dimmed on Services; on the way back the dimming sweeps up the wall
  const [grey, setGrey] = useState(true)
  const [sweep, setSweep] = useState(false)
  const [sel, setSel] = useState<number[]>([])
  const [pan, setPan] = useState({ x: 0, y: 0, tr: 'none' })
  const [cards, setCards] = useState(NO_CARDS)
  const [want, setWant] = useState<Record<NotifyKey, boolean>>({ notify_leaving: true, notify_arrivals: true, notify_new_seasons: true })
  const [more, setMore] = useState(false)
  const [leaving, setLeaving] = useState<false | 'wall' | 'out'>(false)
  const busy = useRef(false)

  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // The wall: the first 36 picks in six columns. It waits for its posters (1.5 s at most), then fades up from
  // black while the columns drift into place and the camera turns and settles; the step's UI rises after.
  const wall = useMemo(() => (picks.data ?? []).slice(0, COLS * PER), [picks.data])
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (started || (!picks.data && !picks.error)) return
    let live = true
    const go = () => { if (live) { live = false; setStarted(true) } }
    void Promise.all(wall.map((c) => {
      const src = tmdbImage(c.poster_path, 'w342')
      if (!src) return null
      const img = new Image()
      img.src = src
      return img.decode().catch(() => {})
    })).then(go)
    const t = window.setTimeout(go, 1500)
    return () => { live = false; clearTimeout(t) }
  }, [picks.data, picks.error, started, wall])
  useEffect(() => {
    if (!started) return
    later(() => { setWallOn(true); setCam({ at: 'svc', tr: 'transform 2700ms cubic-bezier(0.25, 1, 0.5, 1)' }) }, 40)
    later(() => { setUi(true); setView('svc') }, 1300)
    later(() => setLocked(false), 2600)
  }, [started])

  // the phone's size against the board's 390 × 844, so the wall covers any iPhone the same way
  const [k, setK] = useState(() => Math.max(window.innerWidth / 390, window.innerHeight / 844))
  useEffect(() => {
    const on = () => setK(Math.max(window.innerWidth / 390, window.innerHeight / 844))
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  const all = services.data ?? []
  const popular = all.filter((s) => s.popular).slice(0, 9)
  const rest = all.filter((s) => !popular.includes(s))
  const extra = rest.filter((s) => mine.includes(s.id)).length
  const toggle = (s: Service) => set(s.id, !mine.includes(s.id)).catch(() => toast({ text: 'Couldn’t save that. Try again.' }))

  const setCard = (key: NotifyKey, p: Phase) => setCards((c) => ({ ...c, [key]: p }))
  const arrive = (key: NotifyKey, delay: number) => later(() => { setCard(key, 'pre'); later(() => setCard(key, 'shown'), 140) }, delay)
  const fadeCards = () => setCards((c) => Object.fromEntries(Object.entries(c).map(([key, p]) => [key, p === 'shown' ? 'out' : 'hidden'])) as Record<NotifyKey, Phase>)

  // One camera move per step change. The UI starts fading on the frame the camera starts, so there is no dead beat.
  const go = (to: Step) => {
    if (locked) return
    setLocked(true); setUi(false); setMore(false)
    setPan({ x: 0, y: 0, tr: 'transform 500ms var(--ease-out)' })
    if (to !== 'svc') setGrey(false)
    if (step === 'notify') fadeCards()
    setStep(to)
    later(() => setView(null), 200)
    if (to === 'notify') {
      // pull back and blur: the wall becomes the lock screen's wallpaper
      setBlur(true)
      setCam({ at: 'notify', tr: 'transform 900ms var(--ease-out)' })
      later(() => { setUi(true); setView('notify') }, 440)
      // oldest first: each new one lands on top and pushes the others down, like iOS
      later(() => {
        const on = NOTIFY.map(([key]) => key).filter((key) => want[key]).reverse()
        on.forEach((key, i) => arrive(key, i * 90))
      }, 500)
      later(() => setLocked(false), 900)
      return
    }
    setBlur(false)
    setCam({ at: to, tr: 'transform 1400ms var(--ease-camera)' })
    later(() => setCards(NO_CARDS), 200)
    // the wall moves untouched; the dimming comes back once the camera has nearly settled
    if (to === 'svc') { later(() => { setGrey(true); setSweep(true) }, 450); later(() => setSweep(false), 1400) }
    later(() => { setUi(true); setView(to) }, 700)
    later(() => setLocked(false), 1300)
  }

  // Leaving hands off to Now: the UI and cards fade, the blur lifts as the camera pushes into the wall and the wall
  // fades to black, then this whole layer fades away over Now, which rises with its tab bar already in place.
  const finish = async (ask: boolean) => {
    if (busy.current || locked) return
    busy.current = true
    const any = Object.values(want).some(Boolean)
    // the system question comes from this tap; "Don't Allow" just leaves them off
    if (ask && any && permission() === 'default') await askPermission()
    try { await update({ ...(ask ? want : {}), onboarded_at: new Date().toISOString() }) } catch { /* offline: it shows again next time */ }
    setLocked(true); setUi(false); setMore(false); fadeCards(); setBlur(false)
    setCam({ at: 'exit', tr: 'transform 900ms cubic-bezier(0.32, 0.72, 0, 1)' })
    setWallOn(false); setLeaving('wall')
    later(() => setView(null), 220)
    later(() => setLeaving('out'), 360)
    later(onDone, 800)
  }

  // Picking: drag to look around the wall, tap a poster to choose it.
  const d = useRef<{ x: number; y: number; px: number; py: number; moved: boolean; lx: number; ly: number; lt: number; vx: number; vy: number } | null>(null)
  const dragged = useRef(false)
  const picking = step === 'pick' && !locked
  const n = sel.length

  const [now] = useState(() => new Date())
  const day = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="ob" data-step={step} data-leaving={leaving || undefined} style={{ '--k': k } as CSSProperties}>
      <div className="ob-wall" data-on={wallOn} data-blur={blur} data-leaving={leaving ? '' : undefined} style={{ pointerEvents: step === 'pick' ? 'auto' : 'none' }}
        onPointerDown={(e) => {
          if (!picking) return
          d.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false, lx: e.clientX, ly: e.clientY, lt: Date.now(), vx: 0, vy: 0 }
          dragged.current = false
        }}
        onPointerMove={(e) => {
          const s = d.current
          if (!s) return
          const mx = e.clientX - s.x, my = e.clientY - s.y
          if (!s.moved && Math.hypot(mx, my) < 6) return
          s.moved = true
          const t = Date.now(), dt = Math.max(1, t - s.lt)
          s.vx = 0.8 * ((e.clientX - s.lx) / dt) + 0.2 * s.vx
          s.vy = 0.8 * ((e.clientY - s.ly) / dt) + 0.2 * s.vy
          s.lx = e.clientX; s.ly = e.clientY; s.lt = t
          setPan({ x: band(s.px + mx, BX), y: band(s.py + my, BY), tr: 'none' })
        }}
        onPointerUp={() => {
          const s = d.current
          d.current = null
          if (!s?.moved) return
          dragged.current = true
          setTimeout(() => { dragged.current = false }, 0)
          // throw: carry the release speed a little further, then settle inside the range
          setPan((p) => ({ x: clamp(p.x + s.vx * 220, BX), y: clamp(p.y + s.vy * 220, BY), tr: 'transform 600ms var(--ease-out)' }))
        }}
        onPointerCancel={() => { d.current = null }}>
        <div className="ob-pan" style={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0)`, transition: pan.tr }}>
          <div className="ob-scale">
            <div className="ob-cam" style={{ transform: CAM[cam.at], transition: cam.tr }}>
              <div className="ob-cols">
                {Array.from({ length: COLS }, (_, c) => {
                  const col = wall.filter((_, i) => i % COLS === c)
                  // each column holds its posters three times, so the wall has no edge wherever the camera is
                  const top = -(col.length * CELL) + (c % 2 ? CELL * 0.48 : 0)
                  return (
                    <div key={c} className="ob-col" data-drift={started || undefined}
                      style={{ marginTop: top, '--S': `${(c % 2 ? -1 : 1) * col.length * CELL * 0.45}px`, animationDuration: `${DRIFT_MS[c]}ms`, animationDelay: `${c * 50}ms` } as CSSProperties}>
                      {[0, 1, 2].flatMap((copy) => col.map((card, r) => {
                        const on = sel.includes(card.id)
                        // nothing picked yet: nothing to tell apart, so the whole wall stays lit
                        const lit = !(step === 'svc' && grey && mine.length > 0) || card.availability.some((a) => mine.includes(a.service_id))
                        const y = top + (copy * col.length + r) * CELL + CELL / 2
                        const dd = sweep && !lit ? Math.round(clamp((818 - y) / 818, 1) * 280) : 0
                        return (
                          <button key={`${copy}-${card.id}`} type="button" className="ob-tile" data-lit={lit} data-shade={step === 'pick' && n > 0 && !on}
                            aria-pressed={step === 'pick' ? on : undefined} aria-label={card.title} aria-hidden={copy !== 1 || undefined}
                            tabIndex={picking && copy === 1 ? 0 : -1} style={dd > 0 ? { '--dd': `${dd}ms` } as CSSProperties : undefined}
                            onClick={() => { if (picking && !dragged.current) setSel((s) => (on ? s.filter((x) => x !== card.id) : [...s, card.id])) }}>
                            {card.poster_path && <img src={tmdbImage(card.poster_path, 'w342')} alt="" draggable={false} decoding="async" />}
                            <i aria-hidden="true" /><b aria-hidden="true" />
                          </button>
                        )
                      }))}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ob-shade ob-shade-top" aria-hidden="true" data-on={step !== 'notify'} />
      <div className="ob-shade ob-shade-svc" aria-hidden="true" data-on={step === 'svc' && ui} />
      <div className="ob-shade ob-shade-lock" aria-hidden="true" data-on={step === 'notify' && !leaving} />
      <div className="ob-shade ob-shade-pick" aria-hidden="true" data-on={step === 'pick'} />

      {/* the notifications stay mounted: their glass is ready before they arrive, and no fading parent delays the blur */}
      <section className="ob-cards" aria-label="Example notifications" role="img">
        {NOTIFY.map(([key], i) => {
          const [title, when, body] = EXAMPLES[key]
          return (
            <div key={key} className="ob-card" data-phase={cards[key]}>
              <div>
                <span className="ob-app" aria-hidden="true" />
                <div><div><b>{title}</b><small>{when}</small></div><p>{body}</p></div>
              </div>
              {i === NOTIFY.length - 1 && <><span className="ob-under" aria-hidden="true" /><span className="ob-under" aria-hidden="true" /></>}
            </div>
          )
        })}
      </section>

      <div className="ob-ui" data-on={ui} data-live={(ui && !locked) || undefined}>
        {view === 'svc' && (
          <section aria-label="Your services">
            <Head onSkip={() => go('pick')} />
            <h1 className="ob-rise" style={{ animationDelay: '60ms' }}>{'Which services\ndo you have?'}</h1>
            <ul className="ob-tiles ob-rise" role="group" aria-label="Your services" style={{ animationDelay: '160ms' }}>
              {popular.map((s) => (
                <li key={s.id}><button type="button" className="press" role="checkbox" aria-checked={mine.includes(s.id)} aria-label={s.name} onClick={() => toggle(s)}><ServiceMark service={s.id} /></button></li>
              ))}
              {rest.length > 0 && (
                <li><button type="button" className="press" aria-haspopup="dialog" aria-checked={extra > 0} aria-label={extra ? `More services, ${extra} selected` : 'More services'} onClick={() => setMore(true)}>
                  <span className="ob-more-tile">{extra ? `+${extra}` : <><Icon name="add" size={12} />More</>}</span>
                </button></li>
              )}
            </ul>
            <div className="ob-next ob-rise" style={{ animationDelay: '240ms' }}><Button onClick={() => go('pick')}>Continue</Button></div>
          </section>
        )}

        {view === 'pick' && (
          <section aria-label="Pick titles">
            <Head onBack={() => go('svc')} onSkip={() => go('notify')} />
            <h1 className="ob-rise" style={{ animationDelay: '60ms' }}>{'Pick a few\nto watch later'}</h1>
            <div className="ob-next ob-add" data-show={n > 0}>
              <Button tabIndex={n ? 0 : -1} aria-label={`Add ${n === 1 ? '1 title' : `${n} titles`} to Watchlist`}
                onClick={() => { if (locked) return; void saved.addMany(sel); go('notify') }}>Add {n} to Watchlist</Button>
            </div>
          </section>
        )}

        {view === 'notify' && (
          <section aria-label="Notifications">
            <Head onBack={() => go('pick')} onSkip={() => finish(false)} />
            <div className="ob-clock ob-rise" aria-hidden="true"><span>{day}</span><b>{time}</b></div>
            <div className="ob-notify ob-rise" style={{ animationDelay: '120ms' }}>
              <h1>Never miss a title</h1>
              <p>Only about titles on your Watchlist.</p>
              <ul className="rows">
                {NOTIFY.map(([key, label]) => (
                  <li key={key}><button type="button" role="switch" className="set-switch" aria-checked={want[key]}
                    onClick={() => {
                      const on = !want[key]
                      setWant((w) => ({ ...w, [key]: on }))
                      // its example lands again, or is swiped away
                      if (on) arrive(key, 0); else { setCard(key, 'swipe'); later(() => setCard(key, 'gone'), 260) }
                    }}>
                    <span className="row-text"><b>{label}</b></span><i aria-hidden="true" />
                  </button></li>
                ))}
              </ul>
            </div>
            <div className="ob-next ob-rise" style={{ animationDelay: '200ms' }}><Button onClick={() => finish(true)}>Continue</Button></div>
          </section>
        )}
      </div>

      <Sheet open={more} onClose={() => setMore(false)} label="More services">
        <h2 className="sheet-title ob-sheet-title">More services</h2>
        <ul className="rows ob-more" role="group" aria-label="More services">
          {rest.map((s) => (
            <li key={s.id}><button type="button" role="checkbox" aria-checked={mine.includes(s.id)} onClick={() => toggle(s)}>
              <span className="row-text"><b>{s.name}</b>{s.kind === 'free' && <small>Free</small>}</span>
              <Icon name="check" size={20} style={{ opacity: mine.includes(s.id) ? 1 : 0 }} />
            </button></li>
          ))}
        </ul>
        <div className="sheet-action"><Button onClick={() => setMore(false)}>Done</Button></div>
      </Sheet>
    </div>
  )
}
