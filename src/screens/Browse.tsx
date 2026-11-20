// Browse: categories as cards (genres, lists, decades, countries), a category's page of rows, and the grid behind "View all".
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../lib/auth'
import {
  CATEGORIES, SECTIONS, categoryOf, loadCategory, loadCovers, rowsOf, titlesIn,
  type Category, type CategoryPage, type Kind, type RowDef, type SectionId, type Sort,
} from '../lib/browse'
import { SERVICE_NAME, leavingNote, loadMyServices, type Card } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll, useNav, useNavActions } from '../lib/nav'
import { useQuery } from '../lib/query'
import { BackButton, Button, Icon, LoadFailed, PosterRow, SectionHeader, Sheet, TitleCard } from '../ui'
import { Hero, HoldMenu } from './Now'

type Pick = 'all' | Kind
const PICKS: [Pick, string][] = [['all', 'All'], ['film', 'Films'], ['series', 'Series']]
const DAY = 24 * 60 * 60 * 1000
const kindPath = (k: Pick) => (k === 'all' ? '' : `/${k}`)
const tintOf = (h: string) => `linear-gradient(25deg, ${h} 0%, ${h}E6 32%, ${h}66 62%, ${h}00 100%)`

/** Where a category's card goes: lists open as a grid, everything else has a page of rows. */
const hrefOf = (cat: Category, k: Pick) => (cat.list ? `/browse/g/${cat.id}/list${kindPath(k)}` : `/browse/c/${cat.id}${kindPath(k)}`)

function CategoryCard({ cat, cover, pick }: { cat: Category; cover: string | null | undefined; pick: Pick }) {
  const { push } = useNavActions()
  const href = hrefOf(cat, pick)
  return (
    <a className="br-card press" href={href} onClick={(e) => { e.preventDefault(); push(href) }}>
      {cover && <img src={tmdbImage(cover, 'w780')} alt="" loading="lazy" decoding="async" draggable={false} />}
      <span className="br-tint" aria-hidden="true" style={{ background: tintOf(cat.tint) }} />
      <span className="hair" aria-hidden="true" />
      <span className="br-label">{cat.label}</span>
    </a>
  )
}

const fits = (cat: Category, pick: Pick) => pick === 'all' || !cat.only || cat.only === pick

function TypePills({ pick, setPick, counts }: { pick: Pick; setPick: (p: Pick) => void; counts?: Record<Pick, number> }) {
  return (
    <div role="group" aria-label="Type">
      {PICKS.map(([k, label]) => (
        <button key={k} type="button" className="wl-pill" aria-pressed={pick === k} onClick={() => setPick(k)}>
          <span>{label}{counts && <sup aria-hidden="true">{counts[k]}</sup>}</span>
        </button>
      ))}
    </div>
  )
}

/** The Browse tab. */
export default function Browse() {
  const { push } = useNavActions()
  const onDim = useDimOnScroll()
  const [pick, setPick] = useState<Pick>('all')
  const covers = useQuery('browse-covers', loadCovers, { maxAge: DAY })
  return (
    <main className="page noscroll" onScroll={onDim}>
      <div className="tab-head br-head"><h1>Browse</h1></div>
      <div className="wl-filters"><TypePills pick={pick} setPick={setPick} /></div>
      {SECTIONS.map((sec, i) => {
        const cats = CATEGORIES.filter((c) => c.section === sec.id && fits(c, pick))
        return (
          <section key={sec.id} className="br-section" data-first={i === 0}>
            <div className="br-section-head">
              <h2>{sec.title}</h2>
              {cats.length > sec.shown && (
                <button type="button" className="view-all" aria-label={`View all ${sec.title.toLowerCase()}`} onClick={() => push(`/browse/all/${sec.id}${kindPath(pick)}`)}>View all</button>
              )}
            </div>
            <div className="br-grid">
              {cats.slice(0, sec.shown).map((c) => <CategoryCard key={c.id} cat={c} cover={covers.data?.[c.id]} pick={pick} />)}
            </div>
          </section>
        )
      })}
    </main>
  )
}

/** A bar across the top of a pushed page: back, and the page's name in the middle. */
function TopBar({ title, glass, shown = true }: { title: string; glass?: boolean; shown?: boolean }) {
  const { dimmed } = useNav()
  return (
    <header className="top-bar" data-dim={dimmed}>
      <div className="top-fade" aria-hidden="true"><i /><i /><i /></div>
      <div className="top-row">
        <div className="top-back"><BackButton glass={glass} /></div>
        <span className="top-title" data-shown={shown}>{title}</span>
      </div>
    </header>
  )
}

/** "View all" on a Browse section: every card in it. */
export function BrowseSection({ section, kind }: { section: SectionId; kind?: Kind }) {
  const onDim = useDimOnScroll()
  const pick: Pick = kind ?? 'all'
  const covers = useQuery('browse-covers', loadCovers, { maxAge: DAY })
  const sec = SECTIONS.find((s) => s.id === section)
  const cats = CATEGORIES.filter((c) => c.section === section && fits(c, pick))
  return (
    <>
      <TopBar title={sec?.title ?? 'Browse'} />
      <main className="page noscroll" onScroll={onDim}>
        <h1 className="sr-only">{sec?.title}</h1>
        <div className="br-grid br-grid-page">
          {cats.map((c) => <CategoryCard key={c.id} cat={c} cover={covers.data?.[c.id]} pick={pick} />)}
        </div>
      </main>
    </>
  )
}

type Held = { card: Card; cover: HTMLElement }
const holdMenu = (held: Held | null, close: () => void) => held && createPortal(<HoldMenu held={held} onClose={close} />, document.body)

/** A category: its top titles, then rows. */
export function BrowseCategory({ id, kind }: { id: string; kind?: Kind }) {
  const { push } = useNavActions()
  const onDim = useDimOnScroll()
  const cat = categoryOf(id)
  const q = useQuery<CategoryPage>(cat ? `browse-cat:${id}:${kind ?? 'all'}` : null, () => loadCategory(cat!, kind), { maxAge: 30 * 60 * 1000 })
  const [held, setHeld] = useState<Held | null>(null)
  if (!cat) return <><TopBar title="Browse" /><main className="page"><p className="br-none">This category isn’t here any more.</p></main></>
  const empty = q.data && q.data.hero.length === 0 && q.data.rows.length === 0
  return (
    <>
      <TopBar title={cat.label} glass />
      <main className="page noscroll" onScroll={onDim}>
        <h1 className="sr-only">{cat.label}</h1>
        {q.error && <div className="page-center"><LoadFailed what={cat.label} retry={q.retry} retrying={q.retrying} /></div>}
        {q.data && (
          <div className="rise">
            {q.data.hero.length > 0 ? <Hero items={q.data.hero} /> : <div className="br-top-gap" />}
            {q.data.rows.map((row, r) => (
              <section key={row.id} className="row">
                <SectionHeader title={row.title} onViewAll={() => push(`/browse/g/${cat.id}/${row.id}${kindPath(kind ?? 'all')}`)} />
                <PosterRow>
                  {row.items.map((card) => {
                    const note = row.notes === 'leaving' && !q.stale ? leavingNote(card.availability.map((a) => a.leaves_on).filter(Boolean).sort()[0])
                      : row.kind ? String(card.year ?? '') : undefined
                    return <TitleCard key={card.id} card={card} note={note} eager={r === 0} onHold={(c, cover) => setHeld({ card: c, cover })} />
                  })}
                </PosterRow>
              </section>
            ))}
            {empty && <p className="br-none">Nothing streaming here right now.</p>}
          </div>
        )}
      </main>
      {holdMenu(held, () => setHeld(null))}
    </>
  )
}

const SORTS: [Sort, string][] = [['rated', 'Highest rated'], ['newest', 'Newest'], ['popular', 'Most popular']]

/** "View all" on a row, or a list from Browse: everything in it, three across. */
export function BrowseGrid({ id, row, kind }: { id: string; row: string; kind?: Kind }) {
  const { session } = useAuth()
  const onDim = useDimOnScroll()
  const cat = categoryOf(id)
  const def: RowDef | undefined = useMemo(() => {
    if (!cat) return undefined
    if (row === 'list') return { id: 'popular', title: cat.label, sort: cat.list ?? 'popular', kind: kind ?? cat.only }
    return rowsOf(cat, kind).find((r) => r.id === row)
  }, [cat, row, kind])
  const typed = !!def?.kind // one kind only: no type pills, and the year alone under each poster
  const start: Sort = def?.sort ?? 'popular'
  const [sort, setSort] = useState<Sort>(start)
  const [pick, setPick] = useState<Pick>('all')
  const [onlyMine, setOnlyMine] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [small, setSmall] = useState(false)
  const [held, setHeld] = useState<Held | null>(null)
  const big = useRef<HTMLHeadingElement>(null)

  const uid = session?.user.id
  const mineQ = useQuery<string[]>(uid ? `my-services:${uid}` : null, loadMyServices, { maxAge: 10 * 60 * 1000 })
  const picked = useMemo(() => mineQ.data ?? [], [mineQ.data])
  const rowId = row === 'list' ? undefined : def?.id
  const q = useQuery<Card[]>(cat && def ? `browse-grid:${id}:${row}:${kind ?? 'all'}:${sort}` : null,
    () => titlesIn(cat!, { kind: def!.kind, sort, row: rowId, limit: 90 }), { maxAge: 30 * 60 * 1000, persist: false })

  if (!cat || !def) return <><TopBar title="Browse" /><main className="page"><p className="br-none">This list isn’t here any more.</p></main></>

  const all = (q.data ?? []).filter((c) => !onlyMine || c.availability.some((a) => picked.includes(a.service_id)))
  const counts = { all: all.length, film: all.filter((c) => c.kind === 'film').length, series: all.filter((c) => c.kind === 'series').length }
  const list = typed || pick === 'all' ? all : all.filter((c) => c.kind === pick)
  const tune = (
    <button type="button" className="wl-tune" aria-label="Sort and filter" onClick={() => setSheet(true)}>
      <Icon name="tune" size={22} />
      {(sort !== start || onlyMine) && <i aria-hidden="true" />}
    </button>
  )

  return (
    <>
      <TopBar title={def.title} shown={small} />
      <main className="page noscroll" onScroll={(e) => {
        onDim(e)
        const y = e.currentTarget.scrollTop
        // the big name fades as the small one takes over in the bar
        if (big.current) big.current.style.opacity = String(Math.max(0, Math.min(1, 1 - (y - 4) / 26)))
        if ((y > 30) !== small) setSmall(y > 30)
      }}>
        <div className="grid-head" data-typed={typed}>
          <h1 ref={big}>{def.title}</h1>
          {typed && tune}
        </div>
        {!typed && <div className="wl-filters"><TypePills pick={pick} setPick={setPick} counts={counts} />{tune}</div>}
        {q.error && <div className="br-failed"><LoadFailed what={def.title} retry={q.retry} retrying={q.retrying} compact /></div>}
        <ul className="grid" data-typed={typed}>
          {list.map((card) => {
            const note = def.notes === 'leaving' && !q.stale ? leavingNote(card.availability.map((a) => a.leaves_on).filter(Boolean).sort()[0])
              : typed || pick !== 'all' ? String(card.year ?? '') : undefined
            return <li key={card.id}><TitleCard card={card} note={note} onHold={(c, cover) => setHeld({ card: c, cover })} /></li>
          })}
        </ul>
        {q.data && list.length === 0 && <p className="br-none">{onlyMine ? 'None of these are on your services.' : 'Nothing streaming here right now.'}</p>}
      </main>
      {holdMenu(held, () => setHeld(null))}
      {createPortal(<Sheet open={sheet} onClose={() => setSheet(false)} label="Sort and filter">
        <div className="wl-sheet-head"><h2>Sort and filter</h2><button type="button" onClick={() => { setSort(start); setOnlyMine(false) }}>Reset</button></div>
        <p className="wl-sheet-label">Sort by</p>
        <div role="radiogroup" aria-label="Sort by">
          {SORTS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={sort === k} className="wl-option" onClick={() => setSort(k)}>
              {label}<Icon name="check" size={20} style={{ opacity: sort === k ? 1 : 0 }} />
            </button>
          ))}
        </div>
        {/* everything in Browse is streaming, so this only means something once services are picked */}
        {picked.length > 0 && (
          <button type="button" role="switch" aria-checked={onlyMine} className="wl-switch" onClick={() => setOnlyMine((v) => !v)}>
            <span><b>Only on my services</b><small>{picked.map((s) => SERVICE_NAME[s] ?? s).slice(0, 3).join(', ')}</small></span>
            <i aria-hidden="true" />
          </button>
        )}
        <div className="sheet-action"><Button onClick={() => setSheet(false)}>Show {list.length === 1 ? '1 result' : `${list.length} results`}</Button></div>
      </Sheet>, document.getElementById('root') ?? document.body)}
    </>
  )
}

/** Routes under /browse. */
export function browsePage(path: string): ReactNode | null {
  const [, , a, b, c, d] = path.split('/') // '', 'browse', …
  const kindOf = (s: string | undefined): Kind | undefined => (s === 'film' || s === 'series' ? s : undefined)
  if (a === 'all' && b) return <BrowseSection section={b as SectionId} kind={kindOf(c)} />
  if (a === 'c' && b) return <BrowseCategory id={b} kind={kindOf(c)} />
  if (a === 'g' && b && c) return <BrowseGrid id={b} row={c} kind={kindOf(d)} />
  return null
}
