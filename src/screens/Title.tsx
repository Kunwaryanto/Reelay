import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { paths } from '../lib/routes'
import { MIN_ROW, SERVICE_NAME, kindWord, leavingFor, openLink, runtime, type Award, type TitleDetail } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { titleHero } from '../lib/pictures'
import { firstName, fullDate, looseDate, times, useTitleLogs, useWatched, type TitleLogs } from '../lib/letterboxd'
import { useServicesQuery } from '../lib/profile'
import { useDimOnScroll, useNavActions } from '../lib/nav'
import { FRESH, useQuery } from '../lib/query'
import { titlePage } from '../lib/pages'
import { useSaved } from '../lib/saved'
import { takeOpenedFrom } from '../lib/push'
import { supabase } from '../lib/supabase'
import { PageContent, PageLink, usePageFrame, PinnedArt, BackButton, GlassButton, Icon, Laurel, PosterRow, PosterWall, SectionHeader, Sheet, TitleCard } from '../ui'

const LANG: Record<string, string> = { en: 'English', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', ja: 'Japanese', ko: 'Korean' }
const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('')
const names = (t: TitleDetail, role: string) => t.credits.filter((c) => c.role === role).map((c) => c.person.name).join(', ')

const score = (n: number) => n.toFixed(1)

/**
 * Who has watched the film, from Letterboxd: one line under the scores (you and the other people on Reelay),
 * opening a sheet with every log. Ratings are numbers out of 5, like the Letterboxd average beside the other scores.
 */
function Watchers({ logs, tmdbId, everyone }: { logs: TitleLogs; tmdbId: number; everyone: number | null }) {
  const [open, setOpen] = useState(false)
  const { mine, friends, myRating, friendsAvg } = logs
  const you = mine.length > 0
  const n = friends.length
  const who = friends.map((f) => firstName(f.name))
  const line = you
    ? n === 0 ? (mine.length > 1 ? `You’ve watched it ${times(mine.length)}` : mine[0].watched_on ? `You watched it ${fullDate(mine[0].watched_on)}` : 'You’ve watched it')
      : n === 1 ? `You and ${who[0]} have watched it` : `You and ${n} friends have watched it`
    : n === 1 ? `${who[0]} has watched it` : n === 2 ? `${who[0]} and ${who[1]} have watched it` : `${n} friends have watched it`
  const bits: [string, string][] = []
  if (myRating !== null) bits.push(['You', score(myRating)])
  if (n === 1 && friends[0].rating !== null) bits.push([who[0], score(friends[0].rating)])
  else if (n > 1 && friendsAvg !== null) bits.push(['Friends', score(friendsAvg)])
  const faces = [...(you ? [{ key: 'me', letter: mine[0].name[0], me: true }] : []), ...friends.slice(0, you ? 2 : 3).map((f) => ({ key: f.username, letter: f.name[0], me: false }))]
  // one log of your own and nobody else: the line already says it all
  const more = n > 0 || mine.length > 1
  const inner = (
    <>
      <span className="lb-faces" aria-hidden="true">{faces.map((f) => <i key={f.key} data-me={f.me || undefined}>{f.letter.toUpperCase()}</i>)}</span>
      <span className="row-text"><b>{line}</b>{bits.length > 0 && <small>{bits.map(([k, v], i) => <span key={k}>{i > 0 && ' · '}{k} <em>{v}</em></span>)}</small>}</span>
      {more && <Icon name="chevron_right" size={16} style={{ color: 'var(--text-faint)' }} />}
    </>
  )
  return (
    <section className="lb-row" aria-label="Letterboxd">
      {more ? <button type="button" onClick={() => setOpen(true)}>{inner}</button> : <div>{inner}</div>}
      {more && (
        <Sheet open={open} onClose={() => setOpen(false)} label="Letterboxd">
          <div className="lb-head">
            <h2>Letterboxd</h2>
            <a href={`https://letterboxd.com/tmdb/${tmdbId}`} target="_blank" rel="noreferrer">Open<Icon name="north_east" size={15} /></a>
          </div>
          <div className="lb-list noscroll">
            {(everyone !== null || (n > 1 && friendsAvg !== null)) && (
              <dl className="ratings lb-avgs">
                {everyone !== null && <div><dt>Everyone</dt><dd>{score(Number(everyone))}</dd></div>}
                {n > 1 && friendsAvg !== null && <div><dt>Friends</dt><dd>{score(friendsAvg)}</dd></div>}
              </dl>
            )}
            {you && (
              <>
                <h3>You</h3>
                <ul className="rows">
                  {mine.map((l) => (
                    <li key={l.entry_id} className="row-plain">
                      <span className="row-text"><b>{fullDate(l.watched_on)}</b>{mine.length > 1 && <small>{l.rewatch ? 'Rewatch' : 'First watch'}</small>}</span>
                      {l.rating !== null && <span className="lb-score">{score(l.rating)}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {n > 0 && (
              <>
                <h3>Friends</h3>
                <ul className="rows">
                  {friends.map((f) => (
                    <li key={f.username} className="row-plain">
                      <span className="lb-faces" aria-hidden="true"><i>{f.name[0].toUpperCase()}</i></span>
                      <span className="row-text"><b>{f.name}</b><small>{f.logs.length > 1 ? `Watched ${times(f.logs.length)} · last ${looseDate(f.last)}` : looseDate(f.last)}{f.rating === null && ' · no rating'}</small></span>
                      {f.rating !== null && <span className="lb-score">{score(f.rating)}</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Sheet>
      )}
    </section>
  )
}

/** One award in one category: the title's own and those given to people for it, together (wins and nominations apart). */
type AwardGroup = { key: string; award: string; year: number; category: string; won: boolean; rank: number; people: string[] }
function groupAwards(awards: Award[]): AwardGroup[] {
  const groups = new Map<string, AwardGroup>()
  for (const a of awards) {
    const key = `${a.award}|${a.year}|${a.short_category}|${a.won}`
    const g = groups.get(key) ?? { key, award: a.award, year: a.year, category: a.short_category, won: a.won, rank: a.rank, people: [] }
    if (a.person_name && !g.people.includes(a.person_name)) g.people.push(a.person_name)
    g.rank = Math.min(g.rank, a.rank)
    groups.set(key, g)
  }
  return [...groups.values()]
}
/** On the page: the first name and how many more ("Harry Lange +2"), so a row stays one line; the sheet names them all. */
const firstOf = (names: string[]) => (names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0] ?? '')
/** The page shows this many (wins first); more are in the sheet behind View all. */
const AWARDS_SHOWN = 4

function Awards({ awards }: { awards: Award[] }) {
  const [open, setOpen] = useState(false)
  // awards come sorted wins first, then the category's rank, newest first: the page keeps that order
  const groups = useMemo(() => groupAwards(awards), [awards])
  // the sheet: by ceremony, newest first; in each, wins first, then by rank
  const ceremonies = useMemo(() => {
    const by = new Map<string, AwardGroup[]>()
    for (const g of [...groups].sort((a, b) => b.year - a.year || a.award.localeCompare(b.award) || Number(b.won) - Number(a.won) || a.rank - b.rank)) {
      const k = `${g.award} ${g.year}`
      by.set(k, [...(by.get(k) ?? []), g])
    }
    return [...by.entries()]
  }, [groups])
  const shown = groups.slice(0, AWARDS_SHOWN)
  // a line cut short on this phone's width (measured, and again when the width changes)
  const list = useRef<HTMLUListElement>(null)
  const [cut, setCut] = useState(false)
  useLayoutEffect(() => {
    const ul = list.current
    if (!ul) return
    const measure = () => setCut([...ul.querySelectorAll('small')].some((el) => el.scrollWidth > el.clientWidth + 1))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(ul)
    return () => ro.disconnect()
  }, [shown.length])
  // anything the page doesn't show (more awards, "+N" names, a cut line): View all, and every row opens the sheet
  const hidden = groups.length > AWARDS_SHOWN || shown.some((g) => g.people.length > 1) || cut
  const sheetList = useRef<HTMLDivElement>(null)
  const openAt = (key?: string) => {
    setOpen(true)
    if (key) setTimeout(() => sheetList.current?.querySelector(`[data-award="${CSS.escape(key)}"]`)?.scrollIntoView({ block: 'center' }), 60)
  }
  const wins = groups.filter((g) => g.won).length
  const line = (g: AwardGroup) => (
    <>
      <Laurel size={16} won={g.won} />
      <span className="row-text"><b>{g.won ? 'Won' : 'Nominated'} · {g.award} {g.year}</b><small>{[g.category, firstOf(g.people)].filter(Boolean).join(' · ')}</small></span>
    </>
  )
  return (
    <section className="block awards">
      {hidden ? <SectionHeader title="Awards" viewAll={() => openAt()} /> : <h2 className="block-title">Awards</h2>}
      <ul className="rows" ref={list}>
        {shown.map((g) => (hidden
          ? <li key={g.key}><button type="button" onClick={() => openAt(g.key)}>{line(g)}</button></li>
          : <li key={g.key} className="row-plain">{line(g)}</li>))}
      </ul>
      <Sheet open={open} onClose={() => setOpen(false)} label="Awards">
        <div className="lb-head">
          <h2>Awards</h2>
          <span className="aw-sum">{wins > 0 ? `${wins} ${wins === 1 ? 'win' : 'wins'} · ` : ''}{groups.length} in all</span>
        </div>
        <div className="lb-list noscroll" ref={sheetList}>
          {ceremonies.map(([name, gs]) => (
            <div key={name}>
              <h3>{name}</h3>
              <ul className="rows">
                {gs.map((g) => (
                  <li key={g.key} className="row-plain" data-award={g.key}>
                    <Laurel size={16} won={g.won} />
                    <span className="row-text"><b>{g.category}</b><small>{[g.won ? 'Won' : 'Nominated', g.people.join(', ')].filter(Boolean).join(' · ')}</small></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Sheet>
    </section>
  )
}
function Body({ t, stale }: { t: TitleDetail; stale: boolean }) {
  const saved = useSaved()
  // More like this in your order: what's on your services first (each group keeps its likeness order), and films
  // you've logged on Letterboxd left out, as Home does
  const mine = useServicesQuery().data
  const watched = useWatched()
  const more = useMemo(() => {
    const on = new Set(mine ?? [])
    const list = t.more.filter((c) => c.kind !== 'film' || !watched.has(c.id))
    return on.size ? [...list.filter((c) => c.availability.some((a) => on.has(a.service_id))), ...list.filter((c) => !c.availability.some((a) => on.has(a.service_id)))] : list
  }, [t.more, mine, watched])
  // opened from a notification: where it streams lights up once, then settles
  const [flash] = useState(() => takeOpenedFrom(paths.title(t.id)))
  const [open, setOpen] = useState(false)
  const [bump, setBump] = useState<'on' | 'off' | null>(null)
  const film = t.kind === 'film'
  const first = t.availability[0]
  const notifying = saved.isNotifying(t.id)
  const isSaved = saved.isSaved(t.id)
  const years = film || !t.year ? t.year : t.end_year && t.end_year !== t.year ? `${t.year}–${t.end_year}` : `${t.year}–`
  const meta1 = [kindWord(t.kind), years, film ? runtime(t.runtime_min) : t.seasons ? (t.seasons === 1 ? '1 season' : `${t.seasons} seasons`) : null].filter(Boolean).join(' · ')
  const meta2 = [film ? null : runtime(t.runtime_min), t.genres.slice(0, 3).join(', ')].filter(Boolean).join(' · ')
  const by = t.credits.filter((c) => c.role === (film ? 'director' : 'creator')).slice(0, 2).map((c) => c.person.name).join(', ')
  const ratings: [string, string][] = []
  if (t.scores?.imdb_rating != null) ratings.push(['IMDb', Number(t.scores.imdb_rating).toFixed(1)])
  if (t.scores?.rt_critics != null) ratings.push(['Critics', `${t.scores.rt_critics}%`])
  if (t.scores?.rt_audience != null) ratings.push(['Audience', `${t.scores.rt_audience}%`])
  if (t.scores?.letterboxd != null) ratings.push(['Letterboxd', Number(t.scores.letterboxd).toFixed(1)])
  const lb = useTitleLogs(t.id, film)
  const cast = t.credits.filter((c) => c.role === 'cast')
  const details: [string, string][] = ([
    [film ? 'Directed by' : 'Created by', names(t, film ? 'director' : 'creator')],
    ['Written by', film ? names(t, 'writer') : ''],
    ['Runtime', film ? runtime(t.runtime_min) ?? '' : ''],
    ['Seasons', !film && t.seasons ? String(t.seasons) : ''],
    ['Original title', t.original_title && t.original_title !== t.title ? t.original_title : ''],
    // a Nordic film shown by its own title: the English one too
    ['English title', t.title_en && t.title_en !== t.title ? t.title_en : ''],
    ['Language', t.original_language ? LANG[t.original_language] ?? t.original_language.toUpperCase() : ''],
  ] as [string, string][]).filter((d) => d[1])
  const hero = titleHero(t)
  const art = hero.src
  const long = (t.overview?.length ?? 0) > 170

  return (
    <>
      <section className="title-top" aria-labelledby="t-title">
        {art && <PinnedArt><img className="title-art" data-poster={hero.poster} src={art} alt="" fetchPriority="high" /></PinnedArt>}
        <div className="title-head">
          <h1 id="t-title">{t.title}</h1>
          <div className="title-actions">
            {first ? (
              <a className="pill-open" href={openLink(first, t.title)} target="_blank" rel="noreferrer" aria-label={`Open in ${SERVICE_NAME[first.service_id] ?? first.service_id}`}>
                {SERVICE_NAME[first.service_id] ?? first.service_id}<Icon name="north_east" size={15} />
              </a>
            ) : (
              <button type="button" className="pill-open" data-on={notifying} aria-pressed={notifying} onClick={() => saved.toggleNotify(t.id)}>
                <Icon name="notifications" size={16} fill={notifying} />{notifying ? 'Notifying' : 'Notify me'}
              </button>
            )}
            {/* the change shows on the button itself: the bookmark fills with a pop and a ring, or empties with a dip */}
            <button type="button" className="icon-btn wl-btn" data-bump={bump ?? undefined} aria-pressed={isSaved} aria-label={isSaved ? 'Remove from watchlist' : 'Add to watchlist'}
              onClick={() => { setBump(isSaved ? 'off' : 'on'); saved.toggleSaved(t.id, t.title, t, true) }} onAnimationEnd={(e) => { if (e.target === e.currentTarget.querySelector('.ms')) setBump(null) }}>
              <span><Icon name="bookmark" size={18} fill={isSaved} /></span>
            </button>
          </div>
        </div>
      </section>

      <p className="title-meta">{meta1}{by && <><br />{film ? 'Directed by' : 'Created by'} <span>{by}</span></>}{meta2 && <><br />{meta2}</>}</p>
      {ratings.length > 0 && <dl className="ratings">{ratings.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {lb && <Watchers logs={lb} tmdbId={t.tmdb_id} everyone={t.scores?.letterboxd ?? null} />}
      {t.overview && (
        <div className="overview" data-open={open || !long}>
          <p>{t.overview}</p>
          {long && !open && <button type="button" aria-label="Read more" onClick={() => setOpen(true)}>more</button>}
        </div>
      )}

      <section className="block" data-flash={flash ? '' : undefined}>
        <ul className="rows">
          {t.availability.map((a) => {
            const note = leavingFor(a.leaves_on, { stale })
            return (
              <li key={a.service_id}><a href={openLink(a, t.title)} target="_blank" rel="noreferrer">
                <span className="row-text"><b>{a.service?.name ?? SERVICE_NAME[a.service_id] ?? a.service_id}</b><small>{a.type === 'free' || a.service?.kind === 'free' ? 'Free' : 'Subscription'}</small></span>
                <span className="row-note">{note ?? 'Open'}</span>
              </a></li>
            )
          })}
          {t.availability.length === 0 && (
            <li className="row-plain"><span className="row-text"><b>Not streaming in Sweden</b>{notifying && <small>We’ll let you know when it’s on.</small>}</span></li>
          )}
        </ul>
      </section>

      {t.awards.length > 0 && <Awards awards={t.awards} />}

      {cast.length > 0 && (
        <section className="block">
          {/* an animated film's cast are all voices: said once, in the heading, not under every name */}
          <h2 className="block-title">{cast.every((c) => isVoice(c.character)) ? 'Voice cast' : 'Cast'}</h2>
          <div className="row-scroll noscroll"><ul className="cast">
            {cast.map((c) => (
              <li key={c.person.id}>
                <PageLink to={paths.person(c.person.id)}>
                  <span className="avatar" aria-hidden="true">
                    {c.person.profile_path ? <img src={tmdbImage(c.person.profile_path, 'w185')} alt="" loading="lazy" /> : initials(c.person.name)}
                  </span>
                  <span className="cast-name">{c.person.name}</span>
                  {c.character && <span className="cast-role">{part(c.character)}</span>}
                </PageLink>
              </li>
            ))}
          </ul></div>
        </section>
      )}

      {more.length >= MIN_ROW && (
        <section className="block">
          <SectionHeader title="More like this" />
          <PosterRow>{more.map((c) => <TitleCard key={c.id} card={c} />)}</PosterRow>
        </section>
      )}

      {details.length > 0 && (
        <section className="block">
          <h2 className="block-title">Details</h2>
          <dl className="details">{details.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </section>
      )}
    </>
  )
}

async function loadWall(): Promise<string[]> {
  const { data, error } = await supabase.rpc('start_wall')
  if (error) throw new Error(error.message)
  return (data ?? []) as string[]
}

/** For a link or old notification pointing at a title or person Reelay no longer has. */
export function Gone({ what }: { what: 'title' | 'person' }) {
  const { setTab } = useNavActions()
  const wall = useQuery<string[]>('wall', loadWall, FRESH.catalogue)
  return (
    <div className="gone-page">
      <div className="gone-wall" aria-hidden="true"><PosterWall posters={wall.data ?? []} dim={0.62} /></div>
      <div className="gone-body">
        <h1>This {what} isn’t available</h1>
        <GlassButton onClick={() => setTab('search')}>Search</GlassButton>
      </div>
    </div>
  )
}

// "Porco Rosso (voice)": the part without the note (the heading says Voice cast when every part is a voice)
const VOICE = /\s*\((?:voice|uncredited voice|voice, uncredited)\)\s*$/i
const isVoice = (character: string | null | undefined) => !!character && VOICE.test(character)
const part = (character: string) => character.replace(VOICE, '').trim()

export default function Title({ id }: { id: number }) {
  const frame = usePageFrame(Number.isFinite(id) ? titlePage(id) : null)
  const onScroll = useDimOnScroll()
  return (
    <>
    <main className="page noscroll" data-arrive={frame.arrive} ref={frame.pull.bind.ref} onScroll={onScroll}>
      <div className="page-back"><BackButton glass /></div>
      <PageContent frame={frame} what="this title" skeleton="title" missing={<Gone what="title" />}>
        {(t) => <Body t={t} stale={frame.q.stale} />}
      </PageContent>
    </main>
    {frame.pull.indicator}
    </>
  )
}
