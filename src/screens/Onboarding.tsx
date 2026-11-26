// First run: which services you have, a few titles to start the Watchlist, and which notifications you want.
// One wall of posters and one camera (canvas: Onboarding v19): every step change is a single move of the wall,
// and the step's text and controls fade out as it starts and rise in together as it settles. Every step can be skipped.
// Shown once (profiles.onboarded_at), and again from Settings while testing.
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { loadServices, useMyServices, useProfile, type NotifyKey, type Service } from '../lib/profile'
import { askPermission, permission } from '../lib/push'
import { FRESH, useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { Button, Icon, Sheet, useToast } from '../ui'
import { PICK_CAM, WallColumns, clamp, useWall, useWallPan, useWallScale } from './PosterWall'

type Step = 'svc' | 'pick' | 'notify'
type Cam = 'enter' | Step | 'exit'
// The camera per step: Services sits high and small, Pick is zoomed in to finger-sized posters,
// Notifications pulls back behind a blur, and leaving pushes into the wall.
const CAM: Record<Cam, string> = {
  enter: 'translate3d(0, -150px, 0) rotate(-15deg) scale(1.14)',
  svc: 'translate3d(0, -150px, 0) rotate(-8deg) scale(1)',
  pick: PICK_CAM,
  notify: 'translate3d(0, -90px, 0) rotate(-8deg) scale(0.9)',
  exit: 'translate3d(0, -60px, 0) rotate(-6.5deg) scale(1.2)',
}

// On to start with, so the wall shows straight away what picking a service does.
const DEFAULTS = ['netflix', 'hbo-max', 'svt-play']
// The services' own logos in white, each drawn at about the same area (380 px², at most 52 × 20) from its proportions.
const LOGOS: Record<string, [file: string, ratio: number]> = {
  netflix: ['netflix.png', 3.7], 'hbo-max': ['hbo-max.png', 1.39], 'svt-play': ['svt-play.png', 2.4], viaplay: ['viaplay.png', 4.13],
  'disney-plus': ['disney-plus.png', 1.84], 'prime-video': ['prime-video.png', 3.24], 'apple-tv': ['apple-tv.png', 1.98],
  skyshowtime: ['skyshowtime.png', 4.28], 'tv4-play': ['tv4-play.svg', 1],
  britbox: ['britbox.png', 4.12], curiosity: ['curiosity.png', 2.92], 'pluto-tv': ['pluto-tv.png', 1.34], mubi: ['mubi.png', 1],
  crunchyroll: ['crunchyroll.png', 1], 'triart-play': ['triart-play.png', 3.42],
}
function Logo({ service }: { service: Service }) {
  const logo = LOGOS[service.id]
  if (!logo) return <span className="ob-more-tile">{service.name}</span>
  let h = Math.sqrt(380 / logo[1]), w = h * logo[1]
  if (w > 52) { w = 52; h = w / logo[1] }
  if (h > 20) { h = 20; w = h * logo[1] }
  return <img src={`/icons/services/logos/${logo[0]}`} alt="" width={w} height={h} style={{ width: w, height: h }} draggable={false} decoding="sync" />
}

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

export default function Onboarding({ onDone, onLeave, replay }: { onDone: () => void; onLeave?: () => void; replay?: boolean }) {
  const { mine, loaded, setAll } = useMyServices()
  const k = useWallScale()
  const { update } = useProfile()
  const saved = useSaved()
  const toast = useToast()
  const services = useQuery<Service[]>('services', loadServices, FRESH.catalogue)
  const all = services.data ?? []
  const popular = all.filter((s) => s.popular).slice(0, 9)
  const rest = all.filter((s) => !popular.includes(s))
  // What's switched on here: your own services, or three common ones when you have none yet (and always when this
  // is shown again from Settings, to see it as a new person does; that run saves nothing at all).
  // Saved when you continue; Skip saves nothing.
  const [edits, setEdits] = useState<string[] | null>(null)
  const on = edits ?? (!replay && mine.length ? mine : DEFAULTS.filter((id) => all.some((s) => s.id === id)))

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
  // the wall opens all dimmed; the posters of the services that are on light up as the UI arrives
  const [revealed, setRevealed] = useState(false)
  const [revealing, setRevealing] = useState(false) // that first lighting-up is a slow fade from grey to colour
  const [sel, setSel] = useState<number[]>([])
  const [cards, setCards] = useState(NO_CARDS)
  const [want, setWant] = useState<Record<NotifyKey, boolean>>({ notify_leaving: true, notify_arrivals: true, notify_new_seasons: true })
  const [more, setMore] = useState(false)
  const [leaving, setLeaving] = useState<false | 'wall' | 'out'>(false)
  const busy = useRef(false)

  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)) }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // The wall (PosterWall: the same as the empty Watchlist's): it waits for the middle posters and the services' logos,
  // so the tiles arrive whole with the heading and the button, then fades up from black while the columns drift into
  // place and the camera turns and settles; the step's UI rises after.
  const { wall, started } = useWall(popular.map((s) => s.id), { alsoWait: Object.values(LOGOS).map(([file]) => `/icons/services/logos/${file}`), failed: !!services.error })
  const picking = step === 'pick' && !locked
  const pan = useWallPan(picking)
  useEffect(() => {
    if (!started) return
    later(() => { setWallOn(true); setCam({ at: 'svc', tr: 'transform 2700ms cubic-bezier(0.25, 1, 0.5, 1)' }) }, 40)
    later(() => { setUi(true); setView('svc'); setRevealed(true); setRevealing(true) }, 1300)
    later(() => setRevealing(false), 2600)
    later(() => setLocked(false), 2600)
  }, [started])


  const extra = rest.filter((s) => on.includes(s.id)).length
  const toggle = (s: Service) => setEdits(on.includes(s.id) ? on.filter((x) => x !== s.id) : [...on, s.id])
  const saveServices = () => { if (!replay && loaded) setAll(on).catch(() => toast({ text: 'Couldn’t save your services. Try again in Settings.' })) }

  const setCard = (key: NotifyKey, p: Phase) => setCards((c) => ({ ...c, [key]: p }))
  const arrive = (key: NotifyKey, delay: number) => later(() => { setCard(key, 'pre'); later(() => setCard(key, 'shown'), 140) }, delay)
  const fadeCards = () => setCards((c) => Object.fromEntries(Object.entries(c).map(([key, p]) => [key, p === 'shown' ? 'out' : 'hidden'])) as Record<NotifyKey, Phase>)

  // One camera move per step change. The UI starts fading on the frame the camera starts, so there is no dead beat.
  const go = (to: Step) => {
    if (locked) return
    setLocked(true); setUi(false); setMore(false)
    pan.reset('transform 500ms var(--ease-out)')
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
        NOTIFY.map(([key]) => key).filter((key) => want[key]).reverse().forEach((key, i) => arrive(key, i * 90))
      }, 500)
      later(() => setLocked(false), 900)
      return
    }
    setBlur(false)
    // between Services and Pick the camera eases in and out: it starts gently instead of jumping off
    setCam({ at: to, tr: 'transform 1400ms cubic-bezier(0.65, 0, 0.35, 1)' })
    later(() => setCards(NO_CARDS), 200)
    // the wall moves untouched; the dimming comes back once the camera has nearly settled
    if (to === 'svc') { later(() => { setGrey(true); setSweep(true) }, 450); later(() => setSweep(false), 1400) }
    later(() => { setUi(true); setView(to) }, 700)
    later(() => setLocked(false), 1300)
  }

  // Leaving hands off to Now, unhurried: the UI and cards fade, the blur lifts as the camera drifts into the wall
  // (1.35 s, eased in and out) and the wall sinks to black (0.8 s); as it gets there this whole layer fades away
  // (0.6 s) over Now, which rises with its tab bar already in place.
  const finish = async (ask: boolean) => {
    if (busy.current || locked) return
    busy.current = true
    const any = Object.values(want).some(Boolean)
    // the system question comes from this tap; "Don't Allow" just leaves them off
    // shown again from Settings it is a test run: nothing is saved and iOS isn't asked
    if (!replay) {
      if (ask && any && permission() === 'default') await askPermission()
      try { await update({ ...(ask ? want : {}), onboarded_at: new Date().toISOString() }) } catch { /* offline: it shows again next time */ }
    }
    setLocked(true); setUi(false); setMore(false); fadeCards(); setBlur(false)
    setCam({ at: 'exit', tr: 'transform 1350ms cubic-bezier(0.45, 0, 0.25, 1)' })
    setWallOn(false); setLeaving('wall')
    onLeave?.()
    later(() => setView(null), 320)
    later(() => setLeaving('out'), 700)
    later(onDone, 1350)
  }

  const n = sel.length

  const [now] = useState(() => new Date())
  const day = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="ob" data-step={step} data-leaving={leaving || undefined} style={{ '--k': k } as CSSProperties}>
      <div className="ob-wall" data-on={wallOn} data-blur={blur} data-leaving={leaving ? '' : undefined} style={{ pointerEvents: step === 'pick' ? 'auto' : 'none' }}
        {...pan.handlers}>
        <div className="ob-pan" {...pan.layer}>
          <div className="ob-scale">
            <div className="ob-cam" style={{ transform: CAM[cam.at], transition: cam.tr }}>
              <WallColumns wall={wall} started={started} revealing={revealing} sel={sel} picking={picking} shade={step === 'pick' && n > 0} dragged={pan.dragged}
                onPick={(id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
                tile={(card, y) => {
                  const lit = !(step === 'svc' && grey) || (revealed && card.availability.some((a) => on.includes(a.service_id)))
                  return { lit, dd: sweep && !lit ? Math.round(clamp((818 - y) / 818, 1) * 280) : 0 }
                }} />
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
            <h1 className="ob-rise">{'Which services\ndo you have?'}</h1>
            <ul className="ob-tiles ob-rise" role="group" aria-label="Your services">
              {popular.map((s) => (
                <li key={s.id}><button type="button" className="press" role="checkbox" aria-checked={on.includes(s.id)} aria-label={s.name} onClick={() => toggle(s)}><Logo service={s} /></button></li>
              ))}
              {rest.length > 0 && (
                <li><button type="button" className="press" aria-haspopup="dialog" aria-checked={extra > 0} aria-label={extra ? `More services, ${extra} selected` : 'More services'} onClick={() => setMore(true)}>
                  <span className="ob-more-tile">{extra ? `+${extra}` : <><Icon name="add" size={12} />More</>}</span>
                </button></li>
              )}
            </ul>
            <div className="ob-next ob-rise"><Button onClick={() => { if (locked) return; saveServices(); go('pick') }}>Continue</Button></div>
          </section>
        )}

        {view === 'pick' && (
          <section aria-label="Pick titles">
            <Head onBack={() => go('svc')} onSkip={() => go('notify')} />
            <h1 className="ob-rise">{'Pick a few\nto watch later'}</h1>
            <div className="ob-next ob-add" data-show={n > 0}>
              <Button tabIndex={n ? 0 : -1} aria-label={`Add ${n === 1 ? '1 title' : `${n} titles`} to Watchlist`}
                onClick={() => { if (locked) return; if (!replay) void saved.addMany(sel); go('notify') }}>Add {n} to Watchlist</Button>
            </div>
          </section>
        )}

        {view === 'notify' && (
          <section aria-label="Notifications">
            <Head onBack={() => go('pick')} onSkip={() => finish(false)} />
            <div className="ob-clock ob-rise" aria-hidden="true"><span>{day}</span><b>{time}</b></div>
            <div className="ob-notify ob-rise">
              <h1>Never miss a title</h1>
              <p>Only about titles on your Watchlist.</p>
              <ul className="rows">
                {NOTIFY.map(([key, label]) => (
                  <li key={key}><button type="button" role="switch" className="set-switch" aria-checked={want[key]}
                    onClick={() => {
                      const next = !want[key]
                      setWant((w) => ({ ...w, [key]: next }))
                      // its example lands again, or is swiped away
                      if (next) arrive(key, 0); else { setCard(key, 'swipe'); later(() => setCard(key, 'gone'), 260) }
                    }}>
                    <span className="row-text"><b>{label}</b></span><i aria-hidden="true" />
                  </button></li>
                ))}
              </ul>
            </div>
            <div className="ob-next ob-rise"><Button onClick={() => finish(true)}>Continue</Button></div>
          </section>
        )}
      </div>

      <Sheet open={more} onClose={() => setMore(false)} label="More services">
        <h2 className="sheet-title ob-sheet-title">More services</h2>
        <ul className="rows ob-more" role="group" aria-label="More services">
          {rest.map((s) => (
            <li key={s.id}><button type="button" role="checkbox" aria-checked={on.includes(s.id)} onClick={() => toggle(s)}>
              <span className="row-text"><b>{s.name}</b>{s.kind === 'free' && <small>Free</small>}</span>
              <Icon name="check" size={20} style={{ opacity: on.includes(s.id) ? 1 : 0 }} />
            </button></li>
          ))}
        </ul>
        <div className="sheet-action"><Button onClick={() => setMore(false)}>Done</Button></div>
      </Sheet>
    </div>
  )
}
