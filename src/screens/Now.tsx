import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { SERVICE_NAME, kindWord, leavingNote, loadNow, openLink, type Card } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll, useNavActions } from '../lib/nav'
import { useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { iconsReady, markLaunched } from '../lib/launch'
import { useNewVersion } from '../lib/update'
import { GearIcon, Icon, IconButton, LoadFailed, PosterRow, SectionHeader, TitleCard, Wordmark, usePullToRefresh } from '../ui'

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

  return (
    <section className="hero" aria-label="On now" aria-roledescription="carousel">
      <div className="hero-stage"
        onPointerDown={(e) => { x0.current = e.clientX; swiped.current = false; setPaused(true) }}
        onPointerUp={(e) => {
          const dx = x0.current == null ? 0 : e.clientX - x0.current
          x0.current = null; setPaused(false)
          if (Math.abs(dx) > 40 && n > 1) { swiped.current = true; go(dx < 0 ? 1 : -1) }
        }}
        onPointerCancel={() => { x0.current = null; setPaused(false) }}>
        {items.map((h, i) => {
          const on = i === index
          const art = tmdbImage(h.backdrop_path, 'w1280') ?? tmdbImage(h.poster_path, 'w780')
          return (
            <a key={h.id} className="hero-slide" data-on={on} href={`/title/${h.id}`} aria-label={`${h.title}, ${heroMeta(h)}`}
              aria-hidden={!on} tabIndex={on ? 0 : -1} style={{ '--from': `${8 * dir}%` } as CSSProperties}
              onClick={(e) => { e.preventDefault(); if (!swiped.current) push(`/title/${h.id}`) }}>
              {art && <img className="hero-art" src={art} alt="" draggable={false} fetchPriority={i === 0 ? 'high' : undefined} loading={i === 0 ? undefined : 'lazy'} />}
              <div className="hero-shade" aria-hidden="true" />
              <div className="hero-text">
                {h.logo_path ? <img className="hero-logo" src={tmdbImage(h.logo_path, 'w500')} alt="" draggable={false} /> : <span className="hero-name">{h.title}</span>}
                <span className="hero-meta">{heroMeta(h)}</span>
              </div>
            </a>
          )
        })}
      </div>
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
    // a lazy image doesn't paint again in the copy until it has been seen: make it load now
    copy.querySelectorAll('img').forEach((img) => { img.loading = 'eager' })
    lift.current?.append(copy)
    held.cover.style.visibility = 'hidden'
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setOpen(true)))
    return () => { cancelAnimationFrame(r); held.cover.style.visibility = ''; copy.remove() }
  }, [held.cover])
  const close = () => { setOpen(false); setTimeout(onClose, 280) }

  const { card } = held
  const vw = window.innerWidth, vh = window.innerHeight
  // small posters (list rows) lift to a size worth looking at
  const scale = Math.max(1.25, Math.min(3, 150 / rect.width))
  const w = rect.width * scale, h = rect.height * scale
  const menuH = 34 + 44 * 2
  const left = Math.min(Math.max(16, rect.left + rect.width / 2 - w / 2), vw - w - 16)
  const top = Math.min(Math.max(60, rect.top + rect.height / 2 - h / 2), vh - h - menuH - 40)
  const menuLeft = Math.min(Math.max(16, left), vw - 250 - 16)
  const avail = card.availability[0]
  const isSaved = saved.isSaved(card.id)

  return (
    <div className="hold" role="dialog" aria-label={card.title} data-open={open}>
      <div className="hold-back" onClick={close} />
      <div ref={lift} className="hold-poster" aria-hidden="true" style={{
        left: rect.left, top: rect.top, width: rect.width, height: rect.height,
        borderRadius: 20 / scale, // 16px once lifted, whatever the starting size
        transform: open ? `translate(${left - rect.left}px, ${top - rect.top}px) scale(${scale})`
          : `translate(${(rect.width * (1 - rect.pressed)) / 2}px, ${(rect.height * (1 - rect.pressed)) / 2}px) scale(${rect.pressed})`,
      }} />
      <div className="hold-menu" role="menu" style={{ left: menuLeft, top: top + h + 10, transformOrigin: `${rect.left + rect.width / 2 - menuLeft}px 0` }}>
        <div className="hold-title">{card.title}</div>
        <button type="button" role="menuitem" onClick={() => { saved.toggleSaved(card.id, card.title); close() }}>
          <span>{isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}</span><Icon name={isSaved ? 'bookmark_remove' : 'bookmark_add'} size={20} />
        </button>
        {avail ? (
          <a role="menuitem" href={openLink(avail, card.title)} target="_blank" rel="noreferrer" onClick={close}>
            <span>Open in {SERVICE_NAME[avail.service_id] ?? avail.service_id}</span><Icon name="arrow_outward" size={20} />
          </a>
        ) : (
          <button type="button" role="menuitem" onClick={() => { saved.toggleNotify(card.id); close() }}>
            <span>Notify me</span><Icon name="notifications" size={20} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function Now() {
  const { push } = useNavActions()
  const q = useQuery('now', loadNow, { maxAge: 10 * 60 * 1000 })
  const onScroll = useDimOnScroll()
  const { bind, indicator } = usePullToRefresh(q.retry)
  const fresh = useNewVersion()
  const [held, setHeld] = useState<{ card: Card; cover: HTMLElement } | null>(null)
  // Launch: ready means the data is in and the first hero picture is decoded. Ready within 300 ms: Now just rises.
  // Later than that: the wordmark rises on black and always finishes (900 ms) before handing over; still waiting
  // at 3.3 s, grey placeholders stand in and the content rises over them.
  const first = q.data?.hero[0]
  const firstArt = first ? tmdbImage(first.backdrop_path, 'w1280') ?? tmdbImage(first.poster_path, 'w780') : undefined
  const [artFor, setArtFor] = useState<string | null>(null)
  useEffect(() => {
    if (!q.data) return
    if (!firstArt) { setArtFor(''); return }
    let live = true
    const done = () => { if (live) setArtFor(firstArt) }
    const img = new Image()
    img.src = firstArt
    img.decode().then(done, done)
    const t = setTimeout(done, 2500) // a slow picture doesn't hold the page back for ever
    return () => { live = false; clearTimeout(t) }
  }, [q.data, firstArt])
  const [icons, setIcons] = useState(false)
  useEffect(() => { let live = true; void iconsReady.then(() => { if (live) setIcons(true) }); return () => { live = false } }, [])
  const ready = !!q.data && artFor === (firstArt ?? '') && icons
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
  // The tab bar comes last, after the content has started to arrive (straight away when there is only an
  // error or placeholders to show).
  const failed = !!q.error
  useEffect(() => {
    if (failed || phase === 'late') { markLaunched(); return }
    if (!show) return
    const t = setTimeout(markLaunched, 450)
    return () => clearTimeout(t)
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

      {!show && !q.error && phase === 'mark' && <div className="launch"><Wordmark height={32} rise /></div>}
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
              <SectionHeader title={row.title} />
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
