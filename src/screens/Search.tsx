// Search: the field sits at the bottom, above the keyboard. Before typing: a prompt and three ideas, with recents
// in a drawer on the left. While typing: results with type pills, filter chips read from the words, and a sort sheet.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../lib/auth'
import { SERVICE_NAME, kindWord, loadMyServices, type Card } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { takeKeyboard } from '../lib/keyboard'
import { useNav, useNavActions } from '../lib/nav'
import { useQuery } from '../lib/query'
import {
  addRecent, loadIdeas, loadPopular, readRecents, search, writeRecents,
  type Found, type Hit, type Idea, type Recent,
} from '../lib/search'
import { Button, Icon, LoadFailed, Sheet, SmallButton, useKeyboardRoom, useLongPress } from '../ui'
import { HoldMenu } from './Now'

type Kind = 'all' | 'series' | 'film' | 'people'
type Sort = 'best' | 'rated' | 'newest'
const SORTS: [Sort, string][] = [['best', 'Best match'], ['rated', 'Highest rated'], ['newest', 'Newest']]

const nameOf = (id: string) => SERVICE_NAME[id] ?? id
const metaOf = (h: Hit) => [kindWord(h.kind), h.year, h.services[0] ? nameOf(h.services[0]) : 'Not streaming in Sweden'].filter(Boolean).join(' · ')

/** Run the search a moment after typing stops; keep showing the last results until the new ones arrive. */
function useSearch(typed: string, removed: string[]) {
  const [state, setState] = useState<{ key: string; found: Found | null; error: boolean }>({ key: '', found: null, error: false })
  const [again, setAgain] = useState(0)
  const text = typed.replace(/\s+/g, ' ').trim()
  const key = text.length < 2 ? '' : `${text.toLowerCase()}|${removed.join(',')}`

  useEffect(() => {
    if (!key) return
    let stale = false
    const t = setTimeout(() => {
      search(text, removed).then(
        (found) => { if (!stale) setState({ key, found, error: false }) },
        () => { if (!stale) setState({ key, found: null, error: true }) },
      )
    }, 220)
    return () => { stale = true; clearTimeout(t) }
    // `key` stands for text and removed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, again])

  // back online: search again by itself
  useEffect(() => {
    const online = () => setAgain((n) => n + 1)
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [])

  return {
    found: key ? state.found : null,
    error: !!key && state.key === key && state.error,
    waiting: !!key && state.key !== key,
    retry: () => setAgain((n) => n + 1),
  }
}

const cardOf = (h: Hit): Card => ({ id: h.id, kind: h.kind, title: h.title, year: h.year, poster_path: h.poster_path, availability: h.services.map((s) => ({ service_id: s, leaves_on: null })) })

function Row({ h, onOpen, onHold }: { h: Hit; onOpen: () => void; onHold: (card: Card, cover: HTMLElement) => void }) {
  const hold = useLongPress((el) => onHold(cardOf(h), el.querySelector<HTMLElement>('.wl-poster')!))
  return (
    <li>
      <a className="s-row press-row" href={`/title/${h.id}`} {...hold.handlers} onClick={(e) => { e.preventDefault(); if (!hold.fired()) onOpen() }}>
        <span className="wl-poster">{h.poster_path && <img src={tmdbImage(h.poster_path, 'w185')} alt="" loading="lazy" decoding="async" draggable={false} />}<span className="hair" aria-hidden="true" /></span>
        <span className="wl-text"><b>{h.title}</b><small>{metaOf(h)}</small></span>
        {h.rating !== null && <span className="s-rating"><span>IMDb</span><b>{h.rating.toFixed(1)}</b></span>}
      </a>
    </li>
  )
}

export default function Search() {
  const { session } = useAuth()
  const { push, setTab } = useNavActions()
  const { tab } = useNav()
  const uid = session?.user.id
  const input = useRef<HTMLInputElement>(null)
  const [q, setQ] = useState('')
  const [removed, setRemoved] = useState<string[]>([])
  const [kind, setKind] = useState<Kind>('all')
  const [sort, setSort] = useState<Sort>('best')
  const [onlyMine, setOnlyMine] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const [typing, setTyping] = useState(false)
  const [recents, setRecents] = useState(readRecents)
  const [held, setHeld] = useState<{ card: Card; cover: HTMLElement } | null>(null)
  const hold = (card: Card, cover: HTMLElement) => { input.current?.blur(); setHeld({ card, cover }) }
  const [online, setOnline] = useState(navigator.onLine)
  const { room, pending } = useKeyboardRoom(typing)
  const [hour] = useState(() => new Date().getHours())

  const mineQ = useQuery<string[]>(uid ? `my-services:${uid}` : null, loadMyServices, { maxAge: 10 * 60 * 1000 })
  const ideas = useQuery<Idea[]>('search-ideas', loadIdeas, { maxAge: 60 * 60 * 1000 })
  const popular = useQuery<Hit[]>('search-popular', loadPopular, { maxAge: 60 * 60 * 1000 })
  const picked = useMemo(() => mineQ.data ?? [], [mineQ.data])
  const hasPicked = picked.length > 0 // until Your services is set up: "mine" means streaming anywhere

  useEffect(() => {
    const set = () => setOnline(navigator.onLine)
    window.addEventListener('online', set); window.addEventListener('offline', set)
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set) }
  }, [])

  // Opened from the tab bar: the keyboard is already on its way up (see keyboard.ts), so the field rises with it.
  // It happens before the first paint, so Search appears with the field already in its place above the keyboard
  // and only fades in: nothing has to chase the keyboard.
  const [arriving, setArriving] = useState(false)
  useLayoutEffect(() => {
    if (tab !== 'search' || !takeKeyboard(input.current)) return
    setTyping(true)
    setArriving(true)
    const t = setTimeout(() => setArriving(false), 450)
    return () => clearTimeout(t)
  }, [tab])

  const { found, error, waiting, retry } = useSearch(q, removed)
  const hasQ = q.trim().length > 0
  // "films" or "series" in the words picks that pill (once per result, so All can still be tapped after)
  useEffect(() => { if (found?.kind) setKind(found.kind) }, [found])
  const tokens = found?.tokens ?? []

  const all = found?.hits ?? []
  const mine = all.filter((h) => !onlyMine || (hasPicked ? h.services.some((s) => picked.includes(s)) : h.services.length > 0))
  const folks = found?.people ?? []
  const counts = { all: mine.length + folks.length, people: folks.length, series: mine.filter((h) => h.kind === 'series').length, film: mine.filter((h) => h.kind === 'film').length }
  const shown = kind === 'people' ? [] : mine.filter((h) => kind === 'all' || h.kind === kind)
  const shownPeople = kind === 'people' ? folks : kind === 'all' ? folks.slice(0, 2) : []
  const list = sort === 'best' ? shown : [...shown].sort((a, b) => (sort === 'rated' ? (b.rating ?? 0) - (a.rating ?? 0) : (b.year ?? 0) - (a.year ?? 0)))

  const remember = (r: Recent) => setRecents((old) => { const next = addRecent(old, r); writeRecents(next); return next })
  const forget = (list: Recent[]) => { setRecents(list); writeRecents(list) }
  const change = (text: string) => { setQ(text); setRemoved([]) }
  const open = (h: Hit) => {
    remember({ t: 'title', id: h.id, text: h.title, sub: [kindWord(h.kind), h.year].filter(Boolean).join(' · '), poster_path: h.poster_path })
    input.current?.blur()
    push(`/title/${h.id}`)
  }
  const run = (text: string) => { change(text); setKind('all'); setDrawer(false) }

  // why there is nothing, and the one step that gets something back
  const empty = hasQ && !waiting && !error && found !== null && list.length === 0 && shownPeople.length === 0
  const other: 'film' | 'series' = kind === 'film' ? 'series' : 'film'
  const nothing = !empty ? null
    : onlyMine && all.length ? {
      title: hasPicked ? 'None on your services' : 'None streaming right now',
      body: hasPicked
        ? `${all.length === 1 ? '1 match streams' : `${all.length} matches stream`} on services you don’t have.`
        : `${all.length === 1 ? '1 match isn’t' : `${all.length} matches aren’t`} on a service in Sweden right now.`,
      action: hasPicked ? 'Show all services' : 'Show them', run: () => setOnlyMine(false), popular: false,
    }
      : (kind === 'film' || kind === 'series') && mine.length ? {
        title: kind === 'film' ? 'No films match' : 'No series match', body: '',
        action: `Show ${other === 'film' ? 'films' : 'series'} (${counts[other]})`, run: () => setKind(other), popular: false,
      }
        : tokens.length ? {
          title: 'Nothing matches all of these', body: 'Remove a filter above, or clear them all.',
          action: 'Clear filters', run: () => setRemoved((r) => [...r, ...tokens.map((t) => t.key)]), popular: false,
        }
          : { title: `Nothing for “${q.trim()}”`, body: 'Try a service, genre or year.', action: '', run: () => {}, popular: true }

  // How far the field (and the prompt above it) lift to clear the keyboard. Moved with a transform, not `bottom`,
  // so Safari animates it without laying the page out again on every frame.
  const lift = typing && room ? `calc(${room + 12}px - 34px - var(--edge-b))` : '0px'
  const up = typing && room > 0

  return (
    <main className="search" data-drawer={drawer} data-arriving={arriving} style={{ '--lift': lift } as React.CSSProperties}>
      <nav className="s-recents" aria-label="Recent searches" inert={!drawer}>
        <div className="s-recents-head">
          <h2>Recents</h2>
          {recents.length > 0 && <button type="button" onClick={() => forget([])}>Clear</button>}
        </div>
        <ul>
          {recents.map((r, i) => (
            <li key={r.t === 'q' ? `q:${r.text}` : `t:${r.id}`}>
              <button type="button" className="s-recent" onClick={() => { if (r.t === 'q') run(r.text); else { setDrawer(false); push(`/title/${r.id}`) } }}>
                {r.t === 'title'
                  ? <span className="s-thumb">{r.poster_path && <img src={tmdbImage(r.poster_path, 'w92')} alt="" />}<span className="hair" aria-hidden="true" /></span>
                  : <span className="s-thumb-icon"><Icon name="search" size={20} /></span>}
                <span className="s-recent-text"><b>{r.text}</b>{r.t === 'title' && <small>{r.sub}</small>}</span>
              </button>
              <button type="button" className="s-recent-x" aria-label={`Remove ${r.text}`} onClick={() => forget(recents.filter((_, j) => j !== i))}><Icon name="close" size={18} /></button>
            </li>
          ))}
        </ul>
        {recents.length === 0 && <p className="s-recents-none">Your searches show up here.</p>}
      </nav>

      <div className="s-stage">
        {drawer && <div className="s-stage-scrim" aria-hidden="true" onClick={() => setDrawer(false)} />}
        {!hasQ && (
          <button type="button" className="icon-btn s-recents-btn" aria-label="Recent searches" aria-expanded={drawer}
            onClick={() => { input.current?.blur(); setDrawer(true) }}>
            <span><Icon name="schedule" size={20} /></span>
          </button>
        )}

        <div className="s-list noscroll" data-idle={!hasQ} data-pending={pending}
          // dragging the results puts the keyboard away, like iOS lists do
          onTouchMove={() => { if (typing) input.current?.blur() }}
          // results run under the field and its fade, down to the keyboard (the prompt moves with the field instead)
          style={up && hasQ ? { bottom: lift } : undefined}>
          {!hasQ ? (
            <div className="s-idle">
              <h1>{'What are we\nwatching '}{hour >= 17 || hour < 4 ? 'tonight' : 'today'}?</h1>
              <ul>
                {(ideas.data ?? []).map((c) => (
                  <li key={c.query}>
                    <button type="button" className="s-idea" onClick={() => run(c.query)}>
                      <span className="s-thumb">{c.poster_path && <img src={tmdbImage(c.poster_path, 'w92')} alt="" />}<span className="hair" aria-hidden="true" /></span>
                      <span className="s-recent-text"><b>{c.title}</b><small>{c.sub}</small></span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="wl-filters">
                <div role="group" aria-label="Type">
                  {([['all', 'All'], ['series', 'Series'], ['film', 'Films'], ...(folks.length ? [['people', 'People']] : [])] as [Kind, string][]).map(([k, label]) => (
                    <button key={k} type="button" className="wl-pill" aria-pressed={kind === k} aria-label={`${label}, ${counts[k]} results`} onClick={() => setKind(k)}>
                      <span>{label}<sup aria-hidden="true">{counts[k]}</sup></span>
                    </button>
                  ))}
                </div>
                <button type="button" className="wl-tune" aria-label="Sort and filter" onClick={() => { input.current?.blur(); setSheet(true) }}>
                  <Icon name="tune" size={22} />
                  {(sort !== 'best' || onlyMine) && <i aria-hidden="true" />}
                </button>
              </div>
              {tokens.length > 0 && (
                <div className="s-chips">
                  {tokens.map((t) => (
                    <button key={t.key} type="button" aria-label={`Remove filter ${t.label}`} onClick={() => setRemoved((r) => [...r, t.key])}>
                      {t.label}<Icon name="close" size={16} />
                    </button>
                  ))}
                </div>
              )}

              {!online && list.length === 0 && <p className="s-note">Search needs a connection for this. We’ll search again when you’re back.</p>}
              {online && error && <div className="s-failed"><LoadFailed what="results" retry={retry} retrying={waiting} compact /></div>}
              {shownPeople.length > 0 && (
                <ul className="s-results s-people">
                  {shownPeople.map((p) => (
                    <li key={p.id}>
                      <a className="s-person" href={`/person/${p.id}`} onClick={(e) => { e.preventDefault(); input.current?.blur(); push(`/person/${p.id}`) }}>
                        <span className="avatar" aria-hidden="true">{p.profile_path ? <img src={tmdbImage(p.profile_path, 'w185')} alt="" loading="lazy" /> : p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>
                        <span className="wl-text"><b>{p.name}</b>{p.known_for && <small>{p.known_for}</small>}</span>
                        <Icon name="chevron_right" size={16} style={{ color: 'var(--text-faint)' }} />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="s-results" data-waiting={waiting}>
                {list.map((h) => <Row key={h.id} h={h} onOpen={() => open(h)} onHold={hold} />)}
              </ul>

              {nothing && online && (
                <section className="s-nothing" role="status">
                  <h2>{nothing.title}</h2>
                  {nothing.body && <p>{nothing.body}</p>}
                  {nothing.action && <div><SmallButton onClick={nothing.run}>{nothing.action}</SmallButton></div>}
                  {nothing.popular && (popular.data ?? []).length > 0 && (
                    <>
                      <h3>Popular right now</h3>
                      <ul className="s-results">{popular.data!.map((h) => <Row key={h.id} h={h} onOpen={() => open(h)} onHold={hold} />)}</ul>
                    </>
                  )}
                </section>
              )}
            </>
          )}
        </div>

        {/* the same fade as under the tab bar; it rides up with the field */}
        <div className="tabbar-fade s-fade" aria-hidden="true" data-pending={pending}><i /><i /><i /></div>
        <form className="s-field" role="search" data-pending={pending}
          onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) remember({ t: 'q', text: q.trim() }); input.current?.blur() }}>
          <div className="s-input"
            // Focus it ourselves, without scrolling: left alone, iOS scrolls the whole app up to reveal the field.
            onTouchStart={(e) => {
              const el = input.current
              if (!el || el === document.activeElement || (e.target as HTMLElement).closest('button')) return
              e.preventDefault()
              el.focus({ preventScroll: true })
            }}>
            <Icon name="search" size={20} />
            <input ref={input} type="search" enterKeyHint="search" aria-label="Search films and series" placeholder="Films and series"
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              value={q} onChange={(e) => change(e.target.value)} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)} />
            {hasQ && (
              <button type="button" aria-label="Clear search"
                // keep the keyboard up: clear without taking focus from the field
                onPointerDown={(e) => e.preventDefault()} onClick={() => { change(''); setKind('all') }}>
                <Icon name="cancel" size={18} fill />
              </button>
            )}
          </div>
          <button type="button" className="s-close" aria-label="Close search" onClick={() => { input.current?.blur(); setTab('now') }}><Icon name="close" size={20} /></button>
        </form>
      </div>

      {held && createPortal(<HoldMenu held={held} onClose={() => setHeld(null)} />, document.body)}
      {/* over everything, inside #root (its clip keeps iOS from scrolling the document) */}
      {createPortal(<Sheet open={sheet} onClose={() => setSheet(false)} label="Sort and filter">
        <div className="wl-sheet-head"><h2>Sort and filter</h2><button type="button" onClick={() => { setSort('best'); setOnlyMine(false) }}>Reset</button></div>
        <p className="wl-sheet-label">Sort by</p>
        <div role="radiogroup" aria-label="Sort by">
          {SORTS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={sort === k} className="wl-option" onClick={() => setSort(k)}>
              {label}<Icon name="check" size={20} style={{ opacity: sort === k ? 1 : 0 }} />
            </button>
          ))}
        </div>
        <button type="button" role="switch" aria-checked={onlyMine} className="wl-switch" onClick={() => setOnlyMine((v) => !v)}>
          <span><b>{hasPicked ? 'Only on my services' : 'Only what’s streaming'}</b>{hasPicked && <small>{picked.map(nameOf).slice(0, 3).join(', ')}</small>}</span>
          <i aria-hidden="true" />
        </button>
        <div className="sheet-action"><Button onClick={() => setSheet(false)}>Show {list.length + shownPeople.length === 1 ? '1 result' : `${list.length + shownPeople.length} results`}</Button></div>
      </Sheet>, document.getElementById('root') ?? document.body)}
    </main>
  )
}
