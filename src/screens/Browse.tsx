// Browse: categories as cards (genres, lists, decades, countries), a category's page of rows, and the grid behind "View all".
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { useAuth } from '../lib/auth'
import {
  CATEGORIES, SECTIONS, categoryOf, loadCategory, loadCovers, rowsOf, titlesIn,
  type Category, type CategoryPage, type Kind, type RowDef, type SectionId, type Sort,
} from '../lib/browse'
import { SERVICE_NAME, leavingNote, loadMyServices, type Card } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll, useNav, useNavActions } from '../lib/nav'
import { ALL_ROWS, FilterDrawer, NO_FILTERS, draftChips, passesDraft, type Count, type Draft, type Facets } from './SearchFilters'
import { prefetch, useQuery } from '../lib/query'
import { BackButton, Icon, LoadFailed, PillCount, PosterRow, SectionHeader, Skeleton, TitleCard, posterPicture, titleArt, useArrival, usePressWarm, useSwitched, warmPictures, type Picture } from '../ui'
import { Hero, HoldMenu } from './Now'

type Pick = 'all' | Kind
const PICKS: [Pick, string][] = [['all', 'All'], ['film', 'Films'], ['series', 'Series']]
const DAY = 24 * 60 * 60 * 1000
const kindPath = (k: Pick) => (k === 'all' ? '' : `/${k}`)
const tintOf = (h: string) => `linear-gradient(25deg, ${h} 0%, ${h}E6 32%, ${h}66 62%, ${h}00 100%)`

/** Where a category's card goes: lists open as a grid, everything else has a page of rows. */
const hrefOf = (cat: Category, k: Pick) => (cat.list ? `/browse/g/${cat.id}/list${kindPath(k)}` : `/browse/c/${cat.id}${kindPath(k)}`)

const HALF_HOUR = 30 * 60 * 1000
/** What a grid page shows: a category's own list, or one of its rows. */
const gridDef = (cat: Category, row: string, kind?: Kind): RowDef | undefined =>
  row === 'list' ? { id: 'popular', title: cat.label, sort: cat.list ?? 'popular', kind: kind ?? cat.only, notes: cat.rule.leaving ? 'leaving' : undefined } : rowsOf(cat, kind).find((r) => r.id === row)
const gridKey = (id: string, row: string, kind: Kind | undefined, sort: Sort) => `browse-grid:${id}:${row}:${kind ?? 'all'}:${sort}`
const loadGrid = (cat: Category, def: RowDef, row: string, sort: Sort) => titlesIn(cat, { kind: def.kind, sort, row: row === 'list' ? undefined : def.id, limit: 90, facets: true })
// what's above the fold: a category's first top picture, its title logo and the first row's first posters; a grid's first three rows
const catFold = (d: CategoryPage | undefined): Picture[] => [...titleArt(d?.hero[0]), { src: tmdbImage(d?.hero[0]?.logo_path, 'w500') },
  ...(d?.rows[0]?.items ?? []).slice(0, 3).map((c) => posterPicture(c.poster_path))]
const gridFold = (cards: Card[] | undefined): Picture[] => (cards ?? []).slice(0, 9).map((c) => posterPicture(c.poster_path))
/** Start loading a Browse page before it opens (a finger on its card, or Browse sitting idle). */
export function warmBrowse(path: string) {
  const [, , a, id, c, d] = path.split('/')
  const cat = id ? categoryOf(id) : undefined
  if (!cat) return
  const kindOf = (s: string | undefined): Kind | undefined => (s === 'film' || s === 'series' ? s : undefined)
  if (a === 'c') prefetch(`browse-cat:${id}:${kindOf(c) ?? 'all'}`, () => loadCategory(cat, kindOf(c)).then((p) => { warmPictures(catFold(p)); return p }), { maxAge: HALF_HOUR })
  if (a === 'g' && c) {
    const def = gridDef(cat, c, kindOf(d))
    if (def) prefetch(gridKey(id, c, kindOf(d), def.sort ?? 'popular'), () => loadGrid(cat, def, c, def.sort ?? 'popular').then((l) => { warmPictures(gridFold(l)); return l }), { maxAge: HALF_HOUR, persist: false })
  }
}

// The card is about 170px wide: w300 on ordinary screens, w780 on a 3x iPhone.
const coverSrc = (path: string) => ({ src: tmdbImage(path, 'w780'), srcSet: `${tmdbImage(path, 'w300')} 300w, ${tmdbImage(path, 'w780')} 780w`, sizes: '50vw' })

/** Load every card picture ahead (a couple of seconds after Browse shows), so View all opens with them ready. */
// The saved card pictures are per set of categories: a new category makes the app look them up again, not wait a day.
const COVERS_KEY = `browse-covers:${CATEGORIES.map((c) => c.id).join(',').length}:${CATEGORIES.length}`

function useWarmCovers(covers: Record<string, string | null> | undefined) {
  useEffect(() => {
    if (!covers) return
    const t = setTimeout(() => {
      for (const path of Object.values(covers)) {
        if (!path) continue
        const img = new Image()
        const c = coverSrc(path)
        img.sizes = c.sizes; img.srcset = c.srcSet; img.src = c.src!
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [covers])
}

function CategoryCard({ cat, cover, pick, named }: { cat: Category; cover: string | null | undefined; pick: Pick; named?: boolean }) {
  const { push } = useNavActions()
  const href = hrefOf(cat, pick)
  // Picture, colour wash and name are one: all three fade in together once the picture is decoded (or there is
  // none), over the plain card. Nothing shows on its own first.
  const [loaded, setLoaded] = useState(false)
  const ready = loaded || cover === null
  const setReady = setLoaded
  const show = (img: HTMLImageElement) => { img.decode().catch(() => {}).finally(() => setReady(true)) }
  const warm = usePressWarm(() => warmBrowse(href))
  return (
    <a className="br-card press" href={href} data-ready={ready} {...warm}
      // on the Browse tab each card has a name, so switching type moves it to its new place (see setPick there)
      data-flip={named ? cat.id : undefined} onClick={(e) => { e.preventDefault(); push(href) }}>
      {cover && <img {...coverSrc(cover)} alt="" decoding="async" draggable={false}
        ref={(el) => { if (el?.complete && el.naturalWidth && !ready) show(el) }}
        onLoad={(e) => show(e.currentTarget)} onError={() => setReady(true)} />}
      <span className="br-tint" aria-hidden="true" style={{ background: tintOf(cat.tint) }} />
      <span className="hair" aria-hidden="true" />
      <span className="br-label">{cat.label}</span>
    </a>
  )
}

const fits = (cat: Category, pick: Pick) => pick === 'all' || !cat.only || cat.only === pick

function TypePills({ pick, setPick, counts }: { pick: Pick; setPick: (p: Pick) => void; counts?: Partial<Record<Pick, number>> }) {
  return (
    <div role="group" aria-label="Type">
      {PICKS.map(([k, label]) => (
        <button key={k} type="button" className="wl-pill" aria-pressed={pick === k} onClick={() => setPick(k)}>
          <span>{label}{counts && <PillCount n={counts[k]} />}</span>
        </button>
      ))}
    </div>
  )
}

/** The Browse tab. */
export default function Browse() {
  const { push } = useNavActions()
  const onDim = useDimOnScroll()
  const [pick, setPickNow] = useState<Pick>('all')
  const page = useRef<HTMLElement>(null)
  // All / Films / Series: cards that stay glide to their new places, the ones that come and go fade.
  const setPick = (p: Pick) => {
    const root = page.current
    if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) { setPickNow(p); return }
    // Measure, change, then animate each piece from where it was (in the page itself: a view transition would lift
    // the cards above the tab bar and its blur for as long as it runs).
    const marks = () => [...root.querySelectorAll<HTMLElement>('[data-flip]')]
    const was = new Map(marks().map((el) => [el.dataset.flip!, el.getBoundingClientRect()]))
    flushSync(() => setPickNow(p))
    const h = window.innerHeight, w = window.innerWidth
    const seen = (r: DOMRect) => r.bottom > 0 && r.top < h && r.right > 0 && r.left < w
    for (const el of marks()) {
      const to = el.getBoundingClientRect()
      const from = was.get(el.dataset.flip!)
      if (!from) { if (seen(to)) el.animate([{ opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1 }], { duration: 320, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); continue }
      const dx = from.left - to.left, dy = from.top - to.top
      if ((dx || dy) && (seen(from) || seen(to))) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' })
    }
  }
  const covers = useQuery(COVERS_KEY, loadCovers, { maxAge: DAY })
  useWarmCovers(covers.data)
  // the first cards' pages load ahead, a moment after Browse has settled
  useEffect(() => {
    const t = setTimeout(() => {
      const sec = SECTIONS[0]
      for (const c of CATEGORIES.filter((x) => x.section === sec.id && fits(x, pick)).slice(0, sec.shown)) warmBrowse(hrefOf(c, pick))
    }, 2000)
    return () => clearTimeout(t)
  }, [pick])
  return (
    <main className="page noscroll" onScroll={onDim} ref={page}>
      <div className="tab-head br-head"><h1>Browse</h1></div>
      <div className="wl-filters"><TypePills pick={pick} setPick={setPick} /></div>
      {SECTIONS.map((sec, i) => {
        const cats = CATEGORIES.filter((c) => c.section === sec.id && fits(c, pick))
        return (
          <section key={sec.id} className="br-section" data-first={i === 0}>
            <div className="br-section-head" data-flip={`head-${sec.id}`}>
              <h2>{sec.title}</h2>
              {cats.length > sec.shown && (
                <button type="button" className="view-all" aria-label={`View all ${sec.title.toLowerCase()}`} onClick={() => push(`/browse/all/${sec.id}${kindPath(pick)}`)}>View all</button>
              )}
            </div>
            <div className="br-grid">
              {cats.slice(0, sec.shown).map((c) => <CategoryCard key={c.id} cat={c} cover={covers.data ? covers.data[c.id] ?? null : undefined} pick={pick} named />)}
            </div>
          </section>
        )
      })}
    </main>
  )
}

/** A bar across the top of a pushed page: back, and the page's name in the middle. */
function TopBar({ title, glass, shown = true }: { title: string; glass?: boolean; shown?: boolean }) {
  const { dimmed, path } = useNav()
  const { setDimmed } = useNavActions()
  // The bar belongs to its page: it follows the shared "dimmed" state only while its page is the one showing.
  // Left behind (a page opened over it) or leaving (going back), it keeps the look it had, and coming back to
  // it puts that look back, so nothing brightens or fades during the slide.
  const [mine] = useState(path)
  const [dim, setDim] = useState(dimmed)
  const away = useRef(false)
  useLayoutEffect(() => {
    if (path !== mine) { away.current = true; return }
    if (away.current) { away.current = false; if (dimmed !== dim) { setDimmed(dim); return } }
    setDim(dimmed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimmed, path])
  return (
    <header className="top-bar" data-dim={dim}>
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
  const covers = useQuery(COVERS_KEY, loadCovers, { maxAge: DAY })
  const sec = SECTIONS.find((s) => s.id === section)
  const cats = CATEGORIES.filter((c) => c.section === section && fits(c, pick))
  return (
    <>
      <TopBar title={sec?.title ?? 'Browse'} />
      <main className="page noscroll" onScroll={onDim}>
        <h1 className="sr-only">{sec?.title}</h1>
        <div className="br-grid br-grid-page">
          {cats.map((c) => <CategoryCard key={c.id} cat={c} cover={covers.data ? covers.data[c.id] ?? null : undefined} pick={pick} />)}
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
  // above the fold: the first top picture and its title logo, and the first row's first posters
  const phase = useArrival(`${id}:${kind ?? 'all'}`, !!q.data, () => catFold(q.data))
  if (!cat) return <><TopBar title="Browse" /><main className="page"><p className="br-none">This category isn’t here any more.</p></main></>
  const empty = q.data && q.data.hero.length === 0 && q.data.rows.length === 0
  return (
    <>
      <TopBar title={cat.label} glass />
      <main className="page noscroll" data-arrive={phase === 'in' ? '' : undefined} onScroll={onDim}>
        <h1 className="sr-only">{cat.label}</h1>
        {q.error && <div className="page-center"><LoadFailed what={cat.label} retry={q.retry} retrying={q.retrying} /></div>}
        {phase !== 'there' && !q.error && <Skeleton kind="rows" leaving={phase === 'in'} />}
        {q.data && phase !== 'wait' && (
          <div className="arrive">
            {q.data.hero.length > 0 ? <Hero items={q.data.hero} /> : <div className="br-top-gap" />}
            {q.data.rows.map((row, r) => (
              <section key={row.id} className="row">
                <SectionHeader title={row.title} onViewAll={() => push(`/browse/g/${cat.id}/${row.id}${kindPath(kind ?? 'all')}`)}
                  onViewAllPress={() => warmBrowse(`/browse/g/${cat.id}/${row.id}${kindPath(kind ?? 'all')}`)} />
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
  const def = useMemo(() => (cat ? gridDef(cat, row, kind) : undefined), [cat, row, kind])
  const typed = !!def?.kind // one kind only: no type pills, and the year alone under each poster
  const start: Sort = def?.sort ?? 'popular'
  const sorts: [Sort, string][] = cat?.rule.leaving ? [['leaving', 'Leaving first'], ...SORTS] : SORTS
  const [f, setF] = useState<Draft>({ ...NO_FILTERS, sort: start })
  const sort = f.sort as Sort
  const [pick, setPick] = useState<Pick>('all')
  const switched = useSwitched(pick)
  const [sheet, setSheet] = useState(false)
  const [small, setSmall] = useState(false)
  const [held, setHeld] = useState<Held | null>(null)
  const big = useRef<HTMLHeadingElement>(null)

  const uid = session?.user.id
  const mineQ = useQuery<string[]>(uid ? `my-services:${uid}` : null, loadMyServices, { maxAge: 10 * 60 * 1000 })
  const picked = useMemo(() => mineQ.data ?? [], [mineQ.data])
  const key = gridKey(id, row, kind, sort)
  const q = useQuery<Card[]>(cat && def ? key : null, () => loadGrid(cat!, def!, row, sort), { maxAge: HALF_HOUR, persist: false })
  // above the fold: the first three rows of posters
  const phase = useArrival(key, !!q.data, () => gridFold(q.data))

  if (!cat || !def) return <><TopBar title="Browse" /><main className="page"><p className="br-none">This list isn’t here any more.</p></main></>

  // the drawer's filters are checked here, on the list as loaded (the list's own rule is the category's)
  const facets = (c: Card): Facets => {
    const x = c as Card & { original_language?: string | null; runtime_min?: number | null; scores?: { imdb_rating: number | null } | { imdb_rating: number | null }[] | null }
    const sc = Array.isArray(x.scores) ? x.scores[0] : x.scores
    return { year: c.year, genres: c.genres, rating: sc?.imdb_rating ?? null, runtime: x.runtime_min ?? null, lang: x.original_language ?? null, services: c.availability.map((a) => a.service_id) }
  }
  const all = (q.data ?? []).filter((c) => passesDraft(facets(c), f, picked))
  const r = cat.rule
  // a list that already is one genre, decade or length doesn't offer that filter
  const rows = ALL_ROWS.filter((k) => !(k === 'genres' && r.genres) && !(k === 'decade' && (r.from !== undefined || r.to !== undefined)) && !(k === 'length' && r.under))
  const chips = draftChips(f, setF, sorts, start)
  const countOf = (d: Draft): Count => ({
    key: `${JSON.stringify(d)}|${pick}|${q.data?.length ?? 0}`,
    // a different sort loads a different list: the count for it is known once it's shown
    run: async () => (d.sort !== sort ? null : (q.data ?? []).filter((c) => passesDraft(facets(c), d, picked) && (typed || pick === 'all' || c.kind === pick)).length),
  })
  const counts = { all: all.length, film: all.filter((c) => c.kind === 'film').length, series: all.filter((c) => c.kind === 'series').length }
  const list = typed || pick === 'all' ? all : all.filter((c) => c.kind === pick)
  const tune = (
    <button type="button" className="wl-tune" aria-haspopup="dialog" aria-label={chips.length ? `Sort and filter, ${chips.length} on` : 'Sort and filter'} onClick={() => setSheet(true)}>
      <Icon name="tune" size={22} />
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
        {!typed && <div className="wl-filters"><TypePills pick={pick} setPick={setPick} counts={q.data && phase !== 'wait' ? counts : {}} />{tune}</div>}
        {chips.length > 0 && (
          <div className="s-chips">
            {chips.map((c) => <button key={c.key} type="button" aria-label={`Remove ${c.label}`} onClick={c.drop}>{c.label}<Icon name="close" size={16} /></button>)}
          </div>
        )}
        {q.error && <div className="br-failed"><LoadFailed what={def.title} retry={q.retry} retrying={q.retrying} compact /></div>}
        <div className="grid-wrap">
        {phase !== 'there' && !q.error && <Skeleton kind="grid" leaving={phase === 'in'} />}
        <ul key={pick} className={phase === 'in' ? 'grid arrive' : switched ? 'grid pill-in' : 'grid'} data-typed={typed} hidden={phase === 'wait'}>
          {list.map((card) => {
            const note = def.notes === 'leaving' && !q.stale ? leavingNote(card.availability.map((a) => a.leaves_on).filter(Boolean).sort()[0])
              : typed || pick !== 'all' ? String(card.year ?? '') : undefined
            return <li key={card.id}><TitleCard card={card} note={note} onHold={(c, cover) => setHeld({ card: c, cover })} /></li>
          })}
        </ul>
        </div>
        {q.data && phase !== 'wait' && list.length === 0 && <p className="br-none">{chips.length ? 'Nothing here with these filters.' : 'Nothing streaming here right now.'}</p>}
      </main>
      {holdMenu(held, () => setHeld(null))}
      {createPortal(<FilterDrawer open={sheet} onClose={() => setSheet(false)} init={f} services={picked.map((s) => SERVICE_NAME[s] ?? s)}
        noun={typed ? (def.kind === 'film' ? ['film', 'films'] : ['series', 'series']) : ['title', 'titles']} sorts={sorts} firstSort={start} rows={rows}
        countOf={countOf} apply={(d) => { setF(d); setSheet(false) }} />, document.getElementById('root') ?? document.body)}
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
