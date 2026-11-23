// A person: what they've made that Reelay has, as a grid, by role.
import { useMemo, useState } from 'react'
import { SERVICE_NAME } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll } from '../lib/nav'
import { servicesLabel, useMyServices } from '../lib/profile'
import { DEPT, firstRole, personPage, rolesOf, type PersonCredit as Credit, type Role } from '../lib/pages'
import { BackButton, PageContent, usePageFrame, Button, Icon, PillCount, Sheet, useSwitched, TitleCard } from '../ui'
import { Gone } from './Title'

const JOB: Record<Role, string> = { cast: 'Actor', director: 'Director', creator: 'Creator', writer: 'Writer' }
const KNOWN: Record<string, string> = { Acting: 'Actor', Directing: 'Director', Writing: 'Writer', Production: 'Producer', Creator: 'Creator' }

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
type Sort = 'new' | 'old' | 'az'
type Kind = 'all' | 'film' | 'series'
const SORTS: [Sort, string][] = [['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'A–Z']]
const KINDS: [Kind, string][] = [['all', 'Films and series'], ['film', 'Films'], ['series', 'Series']]

export default function Person({ id }: { id: number }) {
  const onDim = useDimOnScroll()
  const frame = usePageFrame(Number.isFinite(id) ? personPage(id) : null)
  const q = frame.q
  const { mine } = useMyServices()
  const [dept, setDept] = useState<Role | null>(null)
  const switched = useSwitched(dept ?? '')
  const [sort, setSort] = useState<Sort>('new')
  const [kind, setKind] = useState<Kind>('all')
  const [onlyMine, setOnlyMine] = useState(false)
  const [sheet, setSheet] = useState(false)
  const p = q.data

  const pass = (c: Credit) => (kind === 'all' || c.title.kind === kind) && (!onlyMine || c.title.availability.some((a) => mine.includes(a.service_id)))
  const depts = useMemo(() => rolesOf(p), [p])
  const current = dept ?? firstRole(p)
  const list = (p?.credits ?? []).filter((c) => c.role === current && pass(c)).sort((a, b) =>
    sort === 'az' ? a.title.title.localeCompare(b.title.title)
      : sort === 'new' ? (b.title.year ?? 0) - (a.title.year ?? 0) : (a.title.year ?? 9999) - (b.title.year ?? 9999))

  const total = new Set((p?.credits ?? []).map((c) => c.title.id)).size

  return (
    <>
      <main className="page noscroll" data-arrive={frame.arrive} onScroll={onDim}>
        <div className="page-back"><BackButton glass={!!frame.none || q.data === null} /></div>
        <PageContent frame={frame} what="this person" skeleton="person" missing={<Gone what="person" />}>{(p) => (
          <>
            <header className="person-head">
              <span className="avatar" aria-hidden="true">{p.profile_path ? <img src={tmdbImage(p.profile_path, 'w185')} alt="" /> : initials(p.name)}</span>
              <div>
                <h1>{p.name}</h1>
                <p>{[KNOWN[p.known_for ?? ''] ?? (current ? JOB[current] : ''), `${total} ${total === 1 ? 'title' : 'titles'} on Reelay`].filter(Boolean).join(' · ')}</p>
              </div>
            </header>
            <div className="person-bar">
              <div role="group" aria-label="Credits" className="noscroll">
                {depts.length > 1 ? depts.map((r) => (
                  <button key={r} type="button" className="wl-pill" aria-pressed={current === r} onClick={() => setDept(r)}>
                    <span>{DEPT[r]}<PillCount n={p.credits.filter((c) => c.role === r && pass(c)).length} /></span>
                  </button>
                )) : <span className="person-count">{list.length === 1 ? '1 title' : `${list.length} titles`}</span>}
              </div>
              <button type="button" className="wl-tune" aria-label="Sort and filter" onClick={() => setSheet(true)}>
                <Icon name="tune" size={22} />
                {(sort !== 'new' || kind !== 'all' || onlyMine) && <i aria-hidden="true" />}
              </button>
            </div>
            <ul key={dept ?? ''} className={switched ? 'grid pill-in' : 'grid'} data-typed="true" aria-label="Filmography">
              {list.map((c) => {
                const job = c.role === 'cast' ? c.character : JOB[c.role]
                return <li key={c.title.id}><TitleCard card={c.title} note={[c.title.year, job].filter(Boolean).join(' · ')} /></li>
              })}
            </ul>
            {list.length === 0 && <p className="br-none">Nothing here matches your filters.</p>}
          </>
        )}</PageContent>
      </main>
      <Sheet open={sheet} onClose={() => setSheet(false)} label="Sort and filter">
        <div className="wl-sheet-head"><h2>Sort and filter</h2><button type="button" onClick={() => { setSort('new'); setKind('all'); setOnlyMine(false) }}>Reset</button></div>
        <p className="wl-sheet-label">Sort by</p>
        <div role="radiogroup" aria-label="Sort by">
          {SORTS.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={sort === k} className="wl-option" onClick={() => setSort(k)}>{label}<Icon name="check" size={20} style={{ opacity: sort === k ? 1 : 0 }} /></button>)}
        </div>
        <p className="wl-sheet-label">Type</p>
        <div role="radiogroup" aria-label="Type">
          {KINDS.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={kind === k} className="wl-option" onClick={() => setKind(k)}>{label}<Icon name="check" size={20} style={{ opacity: kind === k ? 1 : 0 }} /></button>)}
        </div>
        {mine.length > 0 && (
          <button type="button" role="switch" aria-checked={onlyMine} className="wl-switch" onClick={() => setOnlyMine((v) => !v)}>
            <span><b>Only on my services</b><small>{servicesLabel(mine.map((s) => SERVICE_NAME[s] ?? s))}</small></span><i aria-hidden="true" />
          </button>
        )}
        <div className="sheet-action"><Button onClick={() => setSheet(false)}>Show {list.length === 1 ? '1 title' : `${list.length} titles`}</Button></div>
      </Sheet>
    </>
  )
}
