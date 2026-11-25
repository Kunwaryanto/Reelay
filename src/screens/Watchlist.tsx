// Watchlist: what you've saved, as posters three across in two parts: on your services (leaving soonest first), then
// what isn't. Seen films are greyed, like everywhere. A tap opens the title, holding it gives Remove and Notify me.
// Empty: a wall of posters to pick from.
import { loadServices, useMyServices, useServicesQuery, type Service } from '../lib/profile'
import { paths } from '../lib/routes'
import { warmFacts } from '../lib/facts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import {
  SERVICE_NAME, leavingFor, loadWatchlistTitles,
  type Card, type SavedTitle,
} from '../lib/catalogue'
import { useDimOnScroll, useNav } from '../lib/nav'
import { FRESH, useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { Button, Cover, Icon, SettingsButton, LoadFailed, PillCount, joinHandlers, useLongPress, usePageLink, useSwitched, useHold, usePageRefresh } from '../ui'
import { useWatched, useWatchedMark } from '../lib/letterboxd'
import { PICK_CAM, WallColumns, useWall, useWallPan, useWallScale } from './PosterWall'
import { FilterDrawer, NO_FILTERS, draftChips, passesDraft, type Count, type Draft, type Facets } from './SearchFilters'

type Kind = 'all' | 'film' | 'series'
type Sort = 'added' | 'leaving' | 'rated' | 'az'
const SORTS: [Sort, string][] = [['added', 'Recently added'], ['leaving', 'Leaving soonest'], ['rated', 'Highest rated'], ['az', 'A–Z']]

const nameOf = (id: string) => SERVICE_NAME[id] ?? id

type Row = { t: SavedTitle; service: string | null; mine: boolean; leaves: string | null }

export default function Watchlist() {
  const { session } = useAuth()
  const { tab } = useNav()
  const saved = useSaved()
  const onDim = useDimOnScroll()
  const uid = session?.user.id
  const q = useQuery<SavedTitle[]>(uid ? `watchlist-titles:${uid}` : null, loadWatchlistTitles, FRESH.mine('watchlist'))
  const mineQ = useServicesQuery()
  // pull to refresh: the list itself, its titles and the member's services
  const pull = usePageRefresh(q, mineQ, { retry: saved.reload })
  const [kind, setKind] = useState<Kind>('all')
  const switched = useSwitched(kind)
  // sort and filters, set in the Sort and filter drawer
  const [f, setF] = useState<Draft>({ ...NO_FILTERS, sort: 'added' })
  const sort = f.sort as Sort
  const [sheet, setSheet] = useState(false)

  // Titles saved elsewhere in the app aren't in this list's data yet: fetch again when one is missing.
  const have = useMemo(() => new Set((q.data ?? []).map((t) => t.id)), [q.data])
  const asked = useRef('')
  const { retry } = q
  useEffect(() => {
    if (tab !== 'watchlist' || !q.data) return
    const missing = saved.ids.filter((id) => !have.has(id)).join(',')
    if (missing && missing !== asked.current) { asked.current = missing; retry() }
  }, [tab, saved.ids, have, q.data, retry])

  // A row that arrives while the list is showing (a slow save, or one from another device) opens up and fades in.
  // Rows there when the list first shows, and rows added while another tab was showing, are just there.
  const known = useRef<Set<number> | null>(null)
  const born = useRef(new Map<number, number>())
  if (q.data) {
    const first = !known.current
    known.current ??= new Set()
    for (const t of q.data) if (!known.current.has(t.id)) { known.current.add(t.id); if (!first && tab === 'watchlist') born.current.set(t.id, Date.now()) }
  }
  const isNew = (id: number) => Date.now() - (born.current.get(id) ?? 0) < 600

  // the long-press facts for everything saved, in one go
  useEffect(() => { if (q.data) warmFacts(q.data.map((t) => t.id)) }, [q.data])
  const picked = useMemo(() => mineQ.data ?? [], [mineQ.data])
  const hasPicked = picked.length > 0 // until Your services is set up, every service counts as yours

  const all: Row[] = useMemo(() => (q.data ?? []).filter((t) => saved.isSaved(t.id)).map((t) => {
    const own = t.availability.find((a) => !hasPicked || picked.includes(a.service_id))
    const a = own ?? t.availability[0]
    return { t: { ...t, notify: saved.isNotifying(t.id) }, service: a?.service_id ?? null, mine: !!own, leaves: own?.leaves_on ?? null }
  }), [q.data, saved, hasPicked, picked])

  const facets = (r: Row): Facets => ({ year: r.t.year, genres: r.t.genres, rating: r.t.rating, rt: r.t.rt, lb: r.t.lb, runtime: r.t.runtime_min, lang: r.t.original_language, services: [] })
  // "mine" is checked against the row (which knows about the services someone has picked), the rest on the title
  const seen = useWatched()
  const fits = (r: Row, d: Draft) => (!d.mine || r.mine) && !(d.hide && seen.has(r.t.id)) && passesDraft(facets(r), { ...d, mine: false }, picked)
  const shown = all.filter((r) => fits(r, f))
  const chips = draftChips(f, setF, SORTS, 'added')
  const countOf = (d: Draft): Count => ({
    key: `${JSON.stringify(d)}|${kind}|${all.length}`,
    run: async () => all.filter((r) => fits(r, d) && (kind === 'all' || r.t.kind === kind)).length,
  })
  const counts = { all: shown.length, film: shown.filter((r) => r.t.kind === 'film').length, series: shown.filter((r) => r.t.kind === 'series').length }
  const list = shown.filter((r) => kind === 'all' || r.t.kind === kind).sort((a, b) =>
    sort === 'added' ? b.t.added_at.localeCompare(a.t.added_at)
      : sort === 'leaving' ? (a.leaves ?? '9').localeCompare(b.leaves ?? '9')
        : sort === 'rated' ? (b.t.rating ?? 0) - (a.t.rating ?? 0)
          : a.t.title.localeCompare(b.t.title))

  // leaving within a month counts as Leaving soon
  const note = (r: Row) => leavingFor(r.leaves, { stale: q.stale, within: 30 })
  // on the member's services: leaving soonest first, then the rest in the chosen order; then what isn't
  const leaving = list.filter((r) => r.mine && note(r)).sort((a, b) => (a.leaves ?? '9').localeCompare(b.leaves ?? '9'))
  const on = [...leaving, ...list.filter((r) => r.mine && !note(r))]
  const off = list.filter((r) => !r.mine)
  const sections = [
    { id: 'on', title: hasPicked ? 'On your services' : 'Streaming now', sub: String(on.length), rows: on },
    { id: 'off', title: hasPicked ? 'Not on your services' : 'Not streaming in Sweden', sub: String(off.length), rows: off },
  ].filter((x) => x.rows.length)

  const header = (
    <div className="tab-head">
      <h1>Watchlist</h1>
      <SettingsButton />
    </div>
  )

  if (q.error) return <main className="page"><div className="page-center"><LoadFailed what="your watchlist" retry={q.retry} retrying={q.retrying} /></div>{header}</main>
  // saved, but the titles themselves are still on their way
  const arriving = all.length === 0 && saved.ids.some((id) => !have.has(id))
  if (!saved.loaded || (saved.ids.length > 0 && !q.data) || (arriving && saved.ids.length > 0)) return <main className="page">{header}</main>
  if (saved.ids.length === 0) return <PickWall header={header} onAdd={(ids) => { saved.addMany(ids).then(() => q.retry()) }} />

  return (
    <>
    <main className="page noscroll" ref={pull.bind.ref} onScroll={onDim}>
      {header}
      <div className="wl-filters">
        <div role="group" aria-label="Type">
          {([['all', 'All'], ['film', 'Films'], ['series', 'Series']] as [Kind, string][]).map(([k, label]) => (
            <button key={k} type="button" className="wl-pill" aria-pressed={kind === k} onClick={() => setKind(k)}>
              <span>{label}<PillCount n={q.data ? counts[k] : undefined} /></span>
            </button>
          ))}
        </div>
        {/* no count on it: what's on shows as chips right under it */}
        <button type="button" className="wl-tune" aria-haspopup="dialog" aria-label={chips.length ? `Sort and filter, ${chips.length} on` : 'Sort and filter'} onClick={() => setSheet(true)}>
          <Icon name="tune" size={22} />
        </button>
      </div>
      {chips.length > 0 && (
        <div className="s-chips">
          {chips.map((c) => <button key={c.key} type="button" aria-label={`Remove ${c.label}`} onClick={c.drop}>{c.label}<Icon name="close" size={16} /></button>)}
        </div>
      )}

      {sections.map((x) => (
        <section key={x.id} className="wl-section">
          <div className="wl-section-head"><h2>{x.title}</h2><span>{x.sub}</span></div>
          <ul key={kind} className={`wl-wall${switched ? ' pill-in' : ''}`} aria-label={x.title}>
            {x.rows.map((r) => (
              <WallPoster key={r.t.id} row={r} fresh={isNew(r.t.id)} note={r.mine ? note(r) : null} notifying={!r.mine && saved.isNotifying(r.t.id)}
                where={r.mine ? null : r.service ? `on ${nameOf(r.service)}` : 'not streaming'} />
            ))}
          </ul>
        </section>
      ))}
      {sections.length === 0 && <p className="wl-none">Nothing here with these filters.</p>}

      <FilterDrawer open={sheet} onClose={() => setSheet(false)} init={f} services={picked.map(nameOf)}
        noun={['title', 'titles']} sorts={SORTS} firstSort="added" countOf={countOf} apply={(d) => { setF(d); setSheet(false) }} />
    </main>
    {pull.indicator}
    </>
  )
}

/** One saved title: its poster with the service it's on and how soon it leaves, or, when it isn't on the member's
 *  services, a small bell if they'll be told it arrives. Greyed once seen. Tap opens it; hold gives the poster menu. */
function WallPoster({ row, fresh, note, notifying, where }: { row: Row; fresh?: boolean; note: string | null; notifying: boolean; where: string | null }) {
  const { t, service, mine } = row
  const onHold = useHold()
  const hold = useLongPress((el) => onHold(t as unknown as Card, el.querySelector<HTMLElement>('.cover')!))
  const link = usePageLink(paths.title(t.id))
  const { push } = useNav()
  const watched = useWatchedMark(t.id)
  // "Leaves in 3 days" says it on a poster as "3 days"
  const soon = note?.replace(/^Leaves (in )?/, '').replace(/^./, (c) => c.toUpperCase())
  const label = [t.title, mine && service ? nameOf(service) : where, note, notifying ? 'you will be notified' : null, watched ? 'watched' : null].filter(Boolean).join(', ')
  return (
    <li className="wl-tile" data-fresh={fresh || undefined}>
      <a href={paths.title(t.id)} aria-label={label} {...joinHandlers(hold.handlers, link)}
        onClick={(e) => { e.preventDefault(); if (!hold.fired()) push(paths.title(t.id)) }}>
        <Cover path={t.poster_path} service={mine ? service ?? undefined : undefined} sizes="128px" watched={watched} />
        {soon && <span className="wl-soon" aria-hidden="true">{soon}</span>}
        {notifying && <span className="wl-bellmark" aria-hidden="true"><Icon name="notifications" size={14} fill /></span>}
      </a>
    </li>
  )
}

/** The empty Watchlist: the same wall of posters as onboarding's Pick step (PosterWall), with the titles for the
 *  member's services (or the common ones while they have none), the Watchlist's heading and its Add button. */
export function PickWall({ header, onAdd }: { header: React.ReactNode; onAdd: (ids: number[]) => void }) {
  const { mine, loaded } = useMyServices()
  const services = useQuery<Service[]>('services', loadServices, FRESH.catalogue)
  const ids = !loaded ? [] : mine.length ? mine : (services.data ?? []).filter((x) => x.popular).slice(0, 9).map((x) => x.id)
  const { wall, started, query } = useWall(ids)
  const k = useWallScale()
  const pan = useWallPan(true)
  const [sel, setSel] = useState<number[]>([])
  const n = sel.length

  return (
    <main className="page pick" style={{ '--k': k } as React.CSSProperties}>
      <div className="ob-wall" data-on={started} {...pan.handlers}>
        <div className="ob-pan" {...pan.layer}>
          <div className="ob-scale">
            <div className="ob-cam" style={{ transform: PICK_CAM }}>
              <WallColumns wall={wall} started={started} sel={sel} picking shade={n > 0} dragged={pan.dragged}
                onPick={(id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
            </div>
          </div>
        </div>
      </div>
      <div className="ob-shade ob-shade-top" aria-hidden="true" data-on="true" />
      <div className="ob-shade ob-shade-pick" aria-hidden="true" data-on="true" />
      {header}
      <p className="pick-hint" aria-hidden={n > 0} data-hide={n > 0}>Tap what you want to watch.</p>
      {query.error && <div className="page-center"><LoadFailed what="titles to pick from" retry={query.retry} retrying={query.retrying} /></div>}
      <div className="pick-add" data-show={n > 0}>
        <Button tabIndex={n ? 0 : -1} aria-label={`Add ${n === 1 ? '1 title' : `${n} titles`} to Watchlist`} onClick={() => onAdd(sel)}>Add {n} to Watchlist</Button>
      </div>
    </main>
  )
}
