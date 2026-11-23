// Browse: categories as cards (genres, lists, decades, countries), a category's page of rows, and the grid behind "View all".
import { useServicesQuery } from '../lib/profile'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import {
  CATEGORIES, SECTIONS, categoryOf, type Category, type Kind, type SectionId, type Sort,
} from '../lib/browse'
import { SERVICE_NAME, leavingFor, type Card } from '../lib/catalogue'
import { useDimOnScroll, useNav, useNavActions } from '../lib/nav'
import { useWatched } from '../lib/letterboxd'
import { ALL_ROWS, FilterDrawer, NO_FILTERS, draftChips, passesDraft, type Count, type Draft, type Facets } from './SearchFilters'
import { paths } from '../lib/routes'
import { categoryPage, coverPictures, coverSrc, coversPage, fits, gridDef, gridPage, sectionCats, sectionPage, usePageQuery, warmPage } from '../lib/pages'
import { BackButton, PageContent, PageLink, usePageFrame, ViewAll, Icon, LoadFailed, PillCount, PosterRow, SectionHeader, Skeleton, TitleCard, useArrival, useSwitched } from '../ui'
import { Hero } from './Now'

type Pick = 'all' | Kind
const PICKS: [Pick, string][] = [['all', 'All'], ['film', 'Films'], ['series', 'Series']]
const tintOf = (h: string) => `linear-gradient(25deg, ${h} 0%, ${h}E6 32%, ${h}66 62%, ${h}00 100%)`

/** Where a category's card goes: lists open as a grid, everything else has a page of rows. */
const hrefOf = (cat: Category, k: Pick) => (cat.list ? paths.grid(cat.id, 'list', k) : paths.category(cat.id, k))

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
  const href = hrefOf(cat, pick)
  // Picture, colour wash and name are one: all three fade in together once the picture is decoded (or there is
  // none), over the plain card. Nothing shows on its own first.
  const [loaded, setLoaded] = useState(false)
  const ready = loaded || cover === null
  const setReady = setLoaded
  const show = (img: HTMLImageElement) => { img.decode().catch(() => {}).finally(() => setReady(true)) }
  return (
    // on the Browse tab each card has a name, so switching type moves it to its new place (see setPick there)
    <PageLink to={href} className="br-card press" data-ready={ready} data-flip={named ? cat.id : undefined}>
      {cover && <img {...coverSrc(cover)} alt="" decoding="sync" draggable={false}
        ref={(el) => { if (el?.complete && el.naturalWidth && !ready) show(el) }}
        onLoad={(e) => show(e.currentTarget)} onError={() => setReady(true)} />}
      <span className="br-tint" aria-hidden="true" style={{ background: tintOf(cat.tint) }} />
      <span className="hair" aria-hidden="true" />
      <span className="br-label">{cat.label}</span>
    </PageLink>
  )
}


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
  const covers = usePageQuery(coversPage)
  useWarmCovers(covers.data)
  // the first cards' pages load ahead, a moment after Browse has settled
  useEffect(() => {
    const t = setTimeout(() => {
      const sec = SECTIONS[0]
      for (const c of CATEGORIES.filter((x) => x.section === sec.id && fits(x, pick)).slice(0, sec.shown)) warmPage(hrefOf(c, pick))
    }, 2000)
    return () => clearTimeout(t)
  }, [pick])
  // The heading and pills are there at once; the cards wait for their pictures above the fold (the first two
  // sections), then fade in as one piece. Once seen, Browse shows straight away.
  const phase = useArrival('browse-tab', !!covers.data, () => coverPictures(covers.data, SECTIONS.slice(0, 2).flatMap((sec) =>
    CATEGORIES.filter((c) => c.section === sec.id && fits(c, pick)).slice(0, sec.shown))))
  return (
    <main className="page noscroll" data-arrive={phase === 'in' ? '' : undefined} onScroll={onDim} ref={page}>
      <div className="tab-head br-head"><h1>Browse</h1></div>
      <div className="wl-filters"><TypePills pick={pick} setPick={setPick} /></div>
      <div className="br-body">
      {phase !== 'there' && <Skeleton kind="cards" leaving={phase === 'in'} />}
      <div className={phase === 'in' ? 'arrive' : undefined} hidden={phase === 'wait'}>
      {SECTIONS.map((sec, i) => {
        const cats = CATEGORIES.filter((c) => c.section === sec.id && fits(c, pick))
        return (
          <section key={sec.id} className="br-section" data-first={i === 0}>
            <div className="br-section-head" data-flip={`head-${sec.id}`}>
              <h2>{sec.title}</h2>
              {cats.length > sec.shown && (
                <ViewAll to={paths.section(sec.id, pick)} label={`View all ${sec.title.toLowerCase()}`} />
              )}
            </div>
            <div className="br-grid">
              {cats.slice(0, sec.shown).map((c) => <CategoryCard key={c.id} cat={c} cover={covers.data ? covers.data[c.id] ?? null : undefined} pick={pick} named />)}
            </div>
          </section>
        )
      })}
      </div>
      </div>
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
  // above the fold: the first eight cards' pictures (Browse usually fetched them already, then it shows at once)
  const { q: covers, phase } = usePageFrame(sectionPage(section, pick))
  const sec = SECTIONS.find((s) => s.id === section)
  const cats = sectionCats(section, pick)
  return (
    <>
      <TopBar title={sec?.title ?? 'Browse'} />
      <main className="page noscroll" data-arrive={phase === 'in' ? '' : undefined} onScroll={onDim}>
        <h1 className="sr-only">{sec?.title}</h1>
        {phase !== 'there' && <Skeleton kind="cards" leaving={phase === 'in'} />}
        <div className={phase === 'in' ? 'br-grid br-grid-page arrive' : 'br-grid br-grid-page'} hidden={phase === 'wait'}>
          {cats.map((c) => <CategoryCard key={c.id} cat={c} cover={covers.data ? covers.data[c.id] ?? null : undefined} pick={pick} />)}
        </div>
      </main>
    </>
  )
}


/** A category: its top titles, then rows. */
export function BrowseCategory({ id, kind }: { id: string; kind?: Kind }) {
  const onDim = useDimOnScroll()
  const cat = categoryOf(id)
  const frame = usePageFrame(cat ? categoryPage(cat, kind) : null)
  const q = frame.q
  if (!cat) return <><TopBar title="Browse" /><main className="page"><p className="br-none">This category isn’t here any more.</p></main></>
  return (
    <>
      <TopBar title={cat.label} glass />
      <main className="page noscroll" data-arrive={frame.arrive} onScroll={onDim}>
        <h1 className="sr-only">{cat.label}</h1>
        <PageContent frame={frame} what={cat.label} skeleton="rows">{(d) => (
          <>
            {d.hero.length > 0 ? <Hero items={d.hero} /> : <div className="br-top-gap" />}
            {d.rows.map((row, r) => (
              <section key={row.id} className="row">
                {/* View all only when the row doesn't already hold the whole list */}
                <SectionHeader title={row.title} viewAll={row.more ? paths.grid(cat.id, row.id, kind) : undefined} />
                <PosterRow>
                  {row.items.map((card) => {
                    const note = row.notes === 'leaving' ? leavingFor(card, { stale: q.stale })
                      : row.kind ? String(card.year ?? '') : undefined
                    return <TitleCard key={card.id} card={card} note={note} eager={r === 0} />
                  })}
                </PosterRow>
              </section>
            ))}
            {d.hero.length === 0 && d.rows.length === 0 && <p className="br-none">Nothing streaming here right now.</p>}
          </>
        )}</PageContent>
      </main>
    </>
  )
}

const SORTS: [Sort, string][] = [['rated', 'Highest rated'], ['newest', 'Newest'], ['popular', 'Most popular']]

/** "View all" on a row, or a list from Browse: everything in it, three across. */
export function BrowseGrid({ id, row, kind }: { id: string; row: string; kind?: Kind }) {
  const onDim = useDimOnScroll()
  const cat = categoryOf(id)
  const def = useMemo(() => (cat ? gridDef(cat, row, kind) : undefined), [cat, row, kind])
  const typed = !!def?.kind // one kind only: no type pills, and the year alone under each poster
  const start: Sort = def?.sort ?? 'popular'
  const sorts: [Sort, string][] = cat?.rule.leaving ? [['leaving', 'Leaving first'], ...SORTS] : cat?.rule.trending ? [['trending', 'Trending'], ...SORTS] : SORTS
  const [f, setF] = useState<Draft>({ ...NO_FILTERS, sort: start })
  const seen = useWatched()
  const sort = f.sort as Sort
  const [pick, setPick] = useState<Pick>('all')
  const switched = useSwitched(pick)
  const [sheet, setSheet] = useState(false)
  const [small, setSmall] = useState(false)
  const big = useRef<HTMLHeadingElement>(null)

  const mineQ = useServicesQuery()
  const picked = useMemo(() => mineQ.data ?? [], [mineQ.data])
  const frame = usePageFrame(cat && def ? gridPage(cat, def, row, kind, sort) : null)
  const { q, phase } = frame
  // above the fold: the first three rows of posters

  if (!cat || !def) return <><TopBar title="Browse" /><main className="page"><p className="br-none">This list isn’t here any more.</p></main></>

  // the drawer's filters are checked here, on the list as loaded (the list's own rule is the category's)
  const facets = (c: Card): Facets => {
    type Sc = { imdb_rating: number | null; rt_critics?: number | null; letterboxd?: number | null }
    const x = c as Card & { original_language?: string | null; runtime_min?: number | null; scores?: Sc | Sc[] | null }
    const sc = Array.isArray(x.scores) ? x.scores[0] : x.scores
    return { year: c.year, genres: c.genres, rating: sc?.imdb_rating ?? null, rt: sc?.rt_critics ?? null, lb: sc?.letterboxd ?? null, runtime: x.runtime_min ?? null, lang: x.original_language ?? null, services: c.availability.map((a) => a.service_id) }
  }
  const fits = (c: Card, d: Draft) => passesDraft(facets(c), d, picked) && !(d.hide && seen.has(c.id))
  const all = (q.data ?? []).filter((c) => fits(c, f))
  const r = cat.rule
  // a list that already is one genre, decade or length doesn't offer that filter
  const rows = ALL_ROWS.filter((k) => !(k === 'genres' && r.genres) && !(k === 'decade' && (r.from !== undefined || r.to !== undefined)) && !(k === 'length' && r.under))
  const chips = draftChips(f, setF, sorts, start)
  const countOf = (d: Draft): Count => ({
    key: `${JSON.stringify(d)}|${pick}|${q.data?.length ?? 0}|${seen.size}`,
    // a different sort loads a different list: the count for it is known once it's shown
    run: async () => (d.sort !== sort ? null : (q.data ?? []).filter((c) => fits(c, d) && (typed || pick === 'all' || c.kind === pick)).length),
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
            const note = def.notes === 'leaving' ? leavingFor(card, { stale: q.stale })
              : typed || pick !== 'all' ? String(card.year ?? '') : undefined
            return <li key={card.id}><TitleCard card={card} note={note} /></li>
          })}
        </ul>
        </div>
        {q.data && phase !== 'wait' && list.length === 0 && <p className="br-none">{chips.length ? 'Nothing here with these filters.' : 'Nothing streaming here right now.'}</p>}
      </main>
      <FilterDrawer open={sheet} onClose={() => setSheet(false)} init={f} services={picked.map((s) => SERVICE_NAME[s] ?? s)}
        noun={typed ? (def.kind === 'film' ? ['film', 'films'] : ['series', 'series']) : ['title', 'titles']} sorts={sorts} firstSort={start} rows={rows}
        countOf={countOf} apply={(d) => { setF(d); setSheet(false) }} />
    </>
  )
}

/** Routes under /browse. */
