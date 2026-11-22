import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { SERVICE_NAME, kindWord, leavingNote, loadNow, openLink, runtime, type Card } from '../lib/catalogue'
import { useFacts } from '../lib/facts'
import { posterSrcSet, tmdbImage } from '../lib/images'
import { useDimOnScroll, useNavActions } from '../lib/nav'
import { warmBrowse } from './Browse'
import { useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { iconsReady, markLaunched } from '../lib/launch'
import { useNewVersion } from '../lib/update'
import { PinnedArt, GearIcon, Icon, IconButton, LoadFailed, PosterRow, SectionHeader, TitleCard, Wordmark, usePullToRefresh } from '../ui'

function heroMeta(c: Card): string {
  const service = c.availability[0]?.service_id
  const parts = [service ? `On ${SERVICE_NAME[service] ?? service}` : null, kindWord(c.kind)]
  if (c.kind === 'series' && c.seasons) parts.push(c.seasons === 1 ? '1 season' : `${c.seasons} seasons`)
  else if (c.genres?.[0]) parts.push(c.genres[0])
  return parts.filter(Boolean).join(' · ')
}

export function Hero({ items }: { items: Card[] }) {
  const { push } = useNavActions()
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState(1)
  const [paused, setPaused] = useState(false)
  const x0 = useRef<number | null>(null)
  const swiped = useRef(false)
  const n = items.length

  const go = (d: number) => { setDir(d); setIndex((i) => (i + d + n) % n) }

  useEffect(() => {
    if (paused || n < 2) return
    const t = setTimeout(() => go(1), 5000)
    return () => clearTimeout(t)
  })
  useEffect(() => {
    const vis = () => setPaused(document.hidden)
    document.addEventListener('visibilitychange', vis)
    return () => document.removeEventListener('visibilitychange', vis)
  }, [])

  // Touch: a sideways swipe changes the picture. It is read from touch events and claimed on its first sideways
  // move, because on a page that was pushed in (a category) the whole strip of pages scrolls sideways too: the
  // browser took the swipe for that, and the pointer events this used to rely on were cancelled. A swipe that
  // starts at the left edge is left alone: that one goes back.
  const stage = useRef<HTMLDivElement>(null)
  const goRef = useRef(go)
  goRef.current = go
  useEffect(() => {
    const el = stage.current
    if (!el) return
    let g: { x: number; y: number; way: 'h' | 'v' | null; dx: number } | null = null
    const start = (e: TouchEvent) => {
      const p = e.touches[0]
      g = e.touches.length === 1 && p.clientX > 28 ? { x: p.clientX, y: p.clientY, way: null, dx: 0 } : null
      swiped.current = false
      setPaused(true)
    }
    const move = (e: TouchEvent) => {
      if (!g) return
      const p = e.touches[0]
      const dx = p.clientX - g.x, dy = p.clientY - g.y
      if (!g.way && Math.hypot(dx, dy) > 6) g.way = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      if (g.way === 'h') { g.dx = dx; if (e.cancelable) e.preventDefault() }
    }
    const end = () => {
      setPaused(false)
      if (g?.way === 'h' && Math.abs(g.dx) > 40 && n > 1) { swiped.current = true; goRef.current(g.dx < 0 ? 1 : -1) }
      g = null
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end) }
  }, [n])

  return (
    <section className="hero" aria-label="On now" aria-roledescription="carousel">
      <div className="hero-stage" ref={stage}
        // with a mouse (touch is handled above)
        onPointerDown={(e) => { if (e.pointerType === 'touch') return; x0.current = e.clientX; swiped.current = false; setPaused(true) }}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') return
          const dx = x0.current == null ? 0 : e.clientX - x0.current
          x0.current = null; setPaused(false)
          if (Math.abs(dx) > 40 && n > 1) { swiped.current = true; go(dx < 0 ? 1 : -1) }
        }}
        onPointerCancel={(e) => { if (e.pointerType === 'touch') return; x0.current = null; setPaused(false) }}>
        {items.map((h, i) => {
          const on = i === index
          return (
            <a key={h.id} className="hero-slide" data-on={on} href={`/title/${h.id}`} aria-label={`${h.title}, ${heroMeta(h)}`}
              aria-hidden={!on} tabIndex={on ? 0 : -1} style={{ '--from': `${8 * dir}%` } as CSSProperties}
              onClick={(e) => { e.preventDefault(); if (!swiped.current) push(`/title/${h.id}`) }}>
              <div className="hero-text">
                {h.logo_path ? <img className="hero-logo" src={tmdbImage(h.logo_path, 'w500')} alt="" draggable={false} /> : <span className="hero-name">{h.title}</span>}
                <span className="hero-meta">{heroMeta(h)}</span>
              </div>
            </a>
          )
        })}
      </div>
      {/* the pictures sit behind the page, pinned to the top of the screen */}
      <PinnedArt>
        {items.map((h, i) => {
          const art = tmdbImage(h.backdrop_path, 'w1280') ?? tmdbImage(h.poster_path, 'w780')
          return art && <img key={h.id} className="hero-art" data-on={i === index} src={art} alt="" draggable={false}
            style={{ '--from': `${8 * dir}%` } as CSSProperties} fetchPriority={i === 0 ? 'high' : undefined} loading={i === 0 ? undefined : 'lazy'} />
        })}
      </PinnedArt>
      {n > 1 && (
        <div className="hero-dots" aria-hidden="true">
          {items.map((h, i) => <span key={h.id} data-on={i === index}>{i === index && <i key={index} style={{ animationPlayState: paused ? 'paused' : 'running' }} />}</span>)}
        </div>
      )}
    </section>
  )
}

/** Long press: the poster lifts, the screen blurs and a glass menu with the title page's actions opens. */
export function HoldMenu({ held, onClose }: { held: { card: Card; cover: HTMLElement }; onClose: () => void }) {
  const saved = useSaved()
  const { push } = useNavActions()
  const [open, setOpen] = useState(false)
  const lift = useRef<HTMLDivElement>(null)
  // Measured once without the press shrink; the copy starts at the shrunk size it had, then lifts.
  const [rect] = useState(() => {
    const r = held.cover.getBoundingClientRect()
    const w = held.cover.offsetWidth, h = held.cover.offsetHeight
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - h) / 2, width: w, height: h, pressed: r.width / w }
  })
  // Lift a copy of the poster as it is on screen (same image, already loaded, with its service mark)
  // and hide the original until the copy has landed back on it, so there's never two or a blank one.
  useLayoutEffect(() => {
    const copy = held.cover.cloneNode(true) as HTMLElement
    // The copy's picture has to be on screen in the same frame the original is hidden, or the poster blinks
    // (seen the first time a poster is held; after that the browser has the decoded picture at hand). So the copy
    // shows the very file the original is showing, decoded before it paints, and the original is hidden only
    // once the copy's picture is ready.
    const from = held.cover.querySelector('img')
    const img = copy.querySelector('img')
    if (img && from) {
      img.removeAttribute('srcset'); img.removeAttribute('sizes')
      img.loading = 'eager'; img.decoding = 'sync'
      img.src = from.currentSrc || from.src
    }
    lift.current?.append(copy)
    let live = true
    const hide = () => { if (live) held.cover.style.visibility = 'hidden' }
    const late = setTimeout(hide, 200)
    if (img?.src) img.decode().then(hide, hide); else hide()
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
    return () => { live = false; clearTimeout(late); cancelAnimationFrame(r); held.cover.style.visibility = ''; copy.remove() }
  }, [held.cover])
  // closing lands on the poster at its normal size (the pressed, slightly smaller size is only where it starts from)
  // It is measured again at that moment: the first measurement was taken mid-press (the card shrinks around its
  // own centre, not the poster's), so it can be a pixel or two off, which showed as a small jump at the end.
  const [closing, setClosing] = useState<{ x: number; y: number; k: number; radius: string } | null>(null)
  const close = () => {
    const now = held.cover.getBoundingClientRect()
    setClosing({ x: now.left - rect.left, y: now.top - rect.top, k: now.width / rect.width, radius: getComputedStyle(held.cover).borderRadius })
    setOpen(false)
    setTimeout(onClose, 300)
  }
  // The finger that opened the menu is still down, and still belongs to the page: without this, moving it would
  // scroll the page or the row behind the menu, and the poster would land back in the wrong place.
  useEffect(() => {
    const stop = (e: Event) => { if (e.cancelable) e.preventDefault() }
    document.addEventListener('touchmove', stop, { passive: false })
    document.addEventListener('wheel', stop, { passive: false })
    return () => { document.removeEventListener('touchmove', stop); document.removeEventListener('wheel', stop) }
  }, [])

  // Tapping the lifted poster or the name opens the title's page. Not the lift of the finger that opened the
  // menu, which ends on the poster: taps count from a moment after that finger is up.
  // The same holds for every row in the menu: with a poster low on the screen the menu opens right under that
  // finger, and its lift would otherwise press whatever it is resting on.
  const armed = useRef(false)
  const [live, setLive] = useState(false)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const up = () => { t = setTimeout(() => { armed.current = true; setLive(true) }, 350) }
    document.addEventListener('pointerup', up, { once: true })
    document.addEventListener('pointercancel', up, { once: true })
    return () => { clearTimeout(t); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up) }
  }, [])
  // Opening the page: the menu and the lifted poster fade where they are as the page slides in. (Flying the
  // poster back, as closing does, put it on top of the arriving page.)
  const openTitle = () => {
    if (!armed.current || leaving) return
    setLeaving(true)
    push(`/title/${held.card.id}`)
    setTimeout(onClose, 220)
  }

  const { card } = held
  // The facts under the name: kind and year are known at once; length, genres, who made it and the scores come
  // with its facts (lib/facts.ts), fetched as the poster came near the screen or at the latest when the finger
  // landed, so they are nearly always there when the menu opens. Until they are, room is kept for their lines and
  // they fade in. The header is as tall as its lines; `headH` is the tallest it gets, for placing the menu.
  const d = useFacts(card.id)
  const film = card.kind === 'film'
  const years = film || !card.year ? card.year : d?.end_year && d.end_year !== card.year ? `${card.year}–${d.end_year}` : card.year
  const facts = [kindWord(card.kind), years, d && (film ? runtime(d.runtime_min) : d.seasons ? (d.seasons === 1 ? '1 season' : `${d.seasons} seasons`) : null),
    d?.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · ')
  const by = d?.by.slice(0, 2).join(', ')
  const scores: [string, string][] = []
  if (d?.imdb != null) scores.push(['IMDb', Number(d.imdb).toFixed(1)])
  if (d?.rt != null) scores.push(['RT', `${d.rt}%`])
  if (d?.lb != null) scores.push(['Letterboxd', Number(d.lb).toFixed(1)])
  const leaves = card.availability[0] && leavingNote(card.availability[0].leaves_on)
  const leavesOn = leaves ? leaves.replace('Leaves', `Leaves ${SERVICE_NAME[card.availability[0].service_id] ?? card.availability[0].service_id}`) : null
  const headH = 26 + 20 + 26 + 18 + 26 + (leavesOn ? 24 : 0)
  const vw = window.innerWidth, vh = window.innerHeight
  // small posters (list rows) lift to a size worth looking at
  const scale = Math.max(1.25, Math.min(3, 150 / rect.width))
  const w = rect.width * scale, h = rect.height * scale
  const menuH = headH + 44 * 2
  const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vw - w - 16)
  const top = Math.min(Math.max(60, rect.top + rect.height / 2 - h / 2), vh - h - menuH - 40)
  const menuLeft = Math.min(Math.max(16, rect.left + rect.width / 2 - 145), vw - 290 - 16)
  const avail = card.availability[0]
  const isSaved = saved.isSaved(card.id)

  return (
    <div className="hold" role="dialog" aria-label={card.title} data-open={open} data-live={live || undefined} data-leaving={leaving || undefined}>
      <div className="hold-back" onClick={close} />
      <div ref={lift} className="hold-poster" aria-hidden="true" onClick={openTitle} style={{
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        // 16px once lifted, whatever the starting size; back to the poster's own corners (and no shadow) on the way down
        borderRadius: closing ? `calc(${closing.radius} / ${closing.k})` : 20 / scale,
        boxShadow: closing ? '0 18px 50px rgba(0, 0, 0, 0)' : undefined,
        transform: open ? `translate(${left - rect.left}px, ${top - rect.top}px) scale(${scale})`
          : closing ? `translate(${closing.x}px, ${closing.y}px) scale(${closing.k})`
            : `translate(${(rect.width * (1 - rect.pressed)) / 2}px, ${(rect.height * (1 - rect.pressed)) / 2}px) scale(${rect.pressed})`,
      }} />
      <div className="hold-menu" role="menu" style={{ left: menuLeft, top: top + h + 10, transformOrigin: `${rect.left + rect.width / 2 - menuLeft}px 0` }}>
        {/* the name and facts open the title's page, as the lifted poster does */}
        {/* not a link: iOS lifts a link under a resting finger into its own preview, with the address */}
        <div className="hold-head" role="menuitem" tabIndex={0} aria-label={`Open ${card.title}`}
          onClick={openTitle} onKeyDown={(e) => { if (e.key === 'Enter') openTitle() }}>
          <b>{card.title}</b>
          <p key={d ? 'full' : 'short'} className={d ? 'hold-in' : undefined}>{facts}</p>
          {/* room is kept for these two while the title's data loads; a line the title turns out not to have is then
              dropped, so the space under the last line is always the same */}
          {(by || !d) && <p data-in={!!by}>{by ? <>{film ? 'Directed by' : 'Created by'} <span>{by}</span></> : '\u00a0'}</p>}
          {(scores.length > 0 || !d) && <dl data-in={scores.length > 0}>{scores.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
          {leavesOn && <p className="hold-leaves">{leavesOn}</p>}
        </div>
        <button type="button" role="menuitem" onClick={() => { if (!armed.current) return; saved.toggleSaved(card.id, card.title, card); close() }}>
          <span>{isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}</span><Icon name={isSaved ? 'bookmark_remove' : 'bookmark_add'} size={20} />
        </button>
        {avail ? (
          <a role="menuitem" href={openLink(avail, card.title)} target="_blank" rel="noreferrer" draggable={false}
            onClick={(e) => { if (!armed.current) { e.preventDefault(); return } close() }}>
            <span>Open in {SERVICE_NAME[avail.service_id] ?? avail.service_id}</span><Icon name="arrow_outward" size={20} />
          </a>
        ) : (
          <button type="button" role="menuitem" onClick={() => { if (!armed.current) return; saved.toggleNotify(card.id); close() }}>
            <span>Notify me</span><Icon name="notifications" size={20} />
          </button>
        )}
      </div>
    </div>
  )
}

// Where each row's "View all" goes: the Browse page for the same thing
const MORE: Record<string, string> = {
  leaving: '/browse/g/leaving-soon/list', rated: '/browse/g/highest-rated/list',
  '2000s': '/browse/c/2000s', '90s': '/browse/c/90s', crime: '/browse/c/crime', comedy: '/browse/c/comedy', drama: '/browse/c/drama',
}

export default function Now() {
  const { push } = useNavActions()
  const q = useQuery('now', loadNow, { maxAge: 10 * 60 * 1000 })
  const onScroll = useDimOnScroll()
  const { bind, indicator } = usePullToRefresh(q.retry)
  const fresh = useNewVersion()
  const [held, setHeld] = useState<{ card: Card; cover: HTMLElement } | null>(null)
  // Launch: ready means the data is in and everything above the fold is decoded: the first hero picture and its
  // title logo, and the first posters of the first row. Ready within 300 ms: Now just rises.
  // Later than that: the wordmark rises on black and always finishes (900 ms) before fading into the page; still
  // waiting at 3.3 s, grey placeholders stand in and the content rises over them.
  const first = q.data?.hero[0]
  const firstArt = first ? tmdbImage(first.backdrop_path, 'w1280') ?? tmdbImage(first.poster_path, 'w780') : undefined
  const foldKey = q.data ? `${firstArt ?? ''}|${q.data.rows[0]?.id ?? ''}` : null
  const [artFor, setArtFor] = useState<string | null>(null)
  useEffect(() => {
    if (!q.data || foldKey === null) return
    let live = true
    const done = () => { if (live) setArtFor(foldKey) }
    const decode = (src: string | null | undefined, srcset?: string) => {
      if (!src) return Promise.resolve()
      const img = new Image()
      // the same candidates as the card, so this is the file the card will show
      if (srcset) { img.sizes = '147px'; img.srcset = srcset }
      img.src = src
      return img.decode().catch(() => {})
    }
    const posters = (q.data.rows[0]?.items ?? []).slice(0, 3)
    void Promise.all([
      decode(firstArt), decode(tmdbImage(first?.logo_path, 'w500')),
      ...posters.map((c) => decode(tmdbImage(c.poster_path, 'w342'), posterSrcSet(c.poster_path))),
    ]).then(done)
    const t = setTimeout(done, 2500) // slow pictures don't hold the page back for ever
    return () => { live = false; clearTimeout(t) }
    // `foldKey` stands for the data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldKey])
  const [icons, setIcons] = useState(false)
  useEffect(() => { let live = true; void iconsReady.then(() => { if (live) setIcons(true) }); return () => { live = false } }, [])
  const ready = !!q.data && artFor === foldKey && icons
  const readyRef = useRef(ready)
  readyRef.current = ready
  const [phase, setPhase] = useState<'wait' | 'mark' | 'after' | 'late'>('wait')
  useEffect(() => {
    const a = setTimeout(() => { if (!readyRef.current) setPhase('mark') }, 300)
    const b = setTimeout(() => setPhase((p) => (p === 'mark' ? 'after' : p)), 1200)
    const c = setTimeout(() => setPhase((p) => (p === 'after' && !readyRef.current ? 'late' : p)), 3300)
    return () => { clearTimeout(a); clearTimeout(b); clearTimeout(c) }
  }, [])
  const show = ready && phase !== 'mark'
  // The wordmark stays mounted while it fades out over the arriving page (mounting it again would replay its rise).
  const [mark, setMark] = useState<'none' | 'on' | 'gone'>('none')
  if (phase === 'mark' && mark === 'none') setMark('on')
  useEffect(() => {
    if (!show || mark !== 'on') return
    const t = setTimeout(() => setMark('gone'), 700)
    return () => clearTimeout(t)
  }, [show, mark])
  // The tab bar arrives with the page, as part of the same movement.
  const failed = !!q.error
  useEffect(() => {
    if (failed || phase === 'late') { markLaunched(); return }
    if (show) markLaunched()
  }, [show, failed, phase])
  // the staged rise plays once, at launch
  const [launching, setLaunching] = useState(true)
  useEffect(() => { if (!show) return; const t = setTimeout(() => setLaunching(false), 1600); return () => clearTimeout(t) }, [show])

  return (
    <>
    <main className="page noscroll" data-launch={show && launching ? '' : undefined} ref={bind.ref} onScroll={onScroll}>
      <h1 className="sr-only">Now</h1>
      {/* not before the content: at launch it fades in with the picture, never ahead of the wordmark */}
      {(show || failed || phase === 'late') && <div className="now-settings"><IconButton label={fresh ? 'Settings, a new version is ready' : 'Settings'} glass onClick={() => push('/settings')}><GearIcon /></IconButton>{fresh && <i aria-hidden="true" />}</div>}

      {mark === 'on' && !q.error && <div className="launch" data-leaving={show || undefined}><Wordmark height={32} rise /></div>}
      {!show && !q.error && phase === 'late' && (
        <div className="now-holders" aria-hidden="true">
          <div />
          {[0, 1].map((r) => <section key={r}><i /><div><span /><span /><span /></div></section>)}
        </div>
      )}
      {q.error && <div className="page-center"><LoadFailed what="Reelay" retry={q.retry} retrying={q.retrying} /></div>}

      {show && q.data && (
        <div className="now-in">
          {q.data.hero.length > 0 ? <Hero items={q.data.hero} /> : <div className="hero-gap" />}
          {q.data.rows.map((row, r) => (
            <section key={row.id} className="row" style={{ '--i': Math.min(r, 4) } as CSSProperties}>
              <SectionHeader title={row.title} onViewAll={MORE[row.id] ? () => push(MORE[row.id]) : undefined} onViewAllPress={MORE[row.id] ? () => warmBrowse(MORE[row.id]) : undefined} />
              <PosterRow>
                {row.items.map((card) => {
                  const note = row.notes === 'leaving' && !q.stale ? leavingNote(card.availability.map((a) => a.leaves_on).filter(Boolean).sort()[0]) : undefined
                  return <TitleCard key={card.id} card={card} note={note} eager={r === 0} onHold={(c, cover) => setHeld({ card: c, cover })} />
                })}
              </PosterRow>
            </section>
          ))}
          {q.data.rows.length === 0 && q.data.hero.length === 0 && <p className="empty">Nothing to show yet. The catalogue is still filling up.</p>}
        </div>
      )}
      {held && createPortal(<HoldMenu held={held} onClose={() => setHeld(null)} />, document.body)}
    </main>
    {indicator}
    </>
  )
}
