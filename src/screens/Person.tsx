// A person: what they've made that Reelay has, as a grid, by role.
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { SERVICE_NAME, type Card } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll } from '../lib/nav'
import { servicesLabel, useMyServices } from '../lib/profile'
import { useQuery } from '../lib/query'
import { supabase } from '../lib/supabase'
import { BackButton, Button, Icon, LoadFailed, PillCount, Sheet, TitleCard } from '../ui'
import { HoldMenu } from './Now'
import { Gone } from './Title'

type Role = 'cast' | 'director' | 'creator' | 'writer'
type Credit = { role: Role; character: string | null; title: Card }
type PersonData = { id: number; name: string; profile_path: string | null; known_for: string | null; credits: Credit[] }

const DEPT: Record<Role, string> = { cast: 'Acting', director: 'Directing', creator: 'Creating', writer: 'Writing' }
const JOB: Record<Role, string> = { cast: 'Actor', director: 'Director', creator: 'Creator', writer: 'Writer' }
const KNOWN: Record<string, string> = { Acting: 'Actor', Directing: 'Director', Writing: 'Writer', Production: 'Producer', Creator: 'Creator' }

async function loadPerson(id: number): Promise<PersonData | null> {
  const { data, error } = await supabase.from('people')
    .select('id,name,profile_path,known_for,credits(role,character,title:titles(id,kind,title,year,poster_path,availability(service_id,leaves_on)))')
    .eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const p = data as unknown as PersonData
  p.credits = (p.credits ?? []).filter((c) => c.title).map((c) => ({ ...c, title: { ...c.title, availability: c.title.availability ?? [] } }))
  return p
}

const initials = (name: string) => name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()
type Sort = 'new' | 'old' | 'az'
type Kind = 'all' | 'film' | 'series'
const SORTS: [Sort, string][] = [['new', 'Newest first'], ['old', 'Oldest first'], ['az', 'A–Z']]
const KINDS: [Kind, string][] = [['all', 'Films and series'], ['film', 'Films'], ['series', 'Series']]

export default function Person({ id }: { id: number }) {
  const onDim = useDimOnScroll()
  const q = useQuery<PersonData | null>(Number.isFinite(id) ? `person:${id}` : null, () => loadPerson(id), { maxAge: 30 * 60 * 1000 })
  const { mine } = useMyServices()
  const [dept, setDept] = useState<Role | null>(null)
  const [sort, setSort] = useState<Sort>('new')
  const [kind, setKind] = useState<Kind>('all')
  const [onlyMine, setOnlyMine] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [held, setHeld] = useState<{ card: Card; cover: HTMLElement } | null>(null)
  const p = q.data

  const pass = (c: Credit) => (kind === 'all' || c.title.kind === kind) && (!onlyMine || c.title.availability.some((a) => mine.includes(a.service_id)))
  const depts = useMemo(() => (Object.keys(DEPT) as Role[]).filter((r) => p?.credits.some((c) => c.role === r)), [p])
  // open on what they're known for, else the role with most titles
  const known = (Object.keys(DEPT) as Role[]).find((r) => DEPT[r] === p?.known_for && depts.includes(r))
  const current = dept ?? known ?? [...depts].sort((a, b) => (p?.credits.filter((c) => c.role === b).length ?? 0) - (p?.credits.filter((c) => c.role === a).length ?? 0))[0]
  const list = (p?.credits ?? []).filter((c) => c.role === current && pass(c)).sort((a, b) =>
    sort === 'az' ? a.title.title.localeCompare(b.title.title)
      : sort === 'new' ? (b.title.year ?? 0) - (a.title.year ?? 0) : (a.title.year ?? 9999) - (b.title.year ?? 9999))

  if (q.error) return <main className="page"><div className="page-back"><BackButton /></div><div className="page-center"><LoadFailed what="this person" retry={q.retry} retrying={q.retrying} /></div></main>
  if (q.data === null) return <main className="page"><div className="page-back"><BackButton glass /></div><Gone what="person" /></main>
  const total = new Set((p?.credits ?? []).map((c) => c.title.id)).size

  return (
    <>
      <main className="page noscroll" onScroll={onDim}>
        <div className="page-back"><BackButton /></div>
        {p && (
          <div className="rise">
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
            <ul className="grid" data-typed="true" aria-label="Filmography">
              {list.map((c) => {
                const job = c.role === 'cast' ? c.character : JOB[c.role]
                return <li key={c.title.id}><TitleCard card={c.title} note={[c.title.year, job].filter(Boolean).join(' · ')} onHold={(card, cover) => setHeld({ card, cover })} /></li>
              })}
            </ul>
            {list.length === 0 && <p className="br-none">Nothing here matches your filters.</p>}
          </div>
        )}
      </main>
      {held && createPortal(<HoldMenu held={held} onClose={() => setHeld(null)} />, document.body)}
      {createPortal(<Sheet open={sheet} onClose={() => setSheet(false)} label="Sort and filter">
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
      </Sheet>, document.getElementById('root') ?? document.body)}
    </>
  )
}
