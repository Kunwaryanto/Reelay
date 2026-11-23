import { useState } from 'react'
import { paths } from '../lib/routes'
import { SERVICE_NAME, kindWord, leavingFor, openLink, runtime, type TitleDetail } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { firstName, fullDate, looseDate, times, useTitleLogs, type TitleLogs } from '../lib/letterboxd'
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

function Body({ t, stale }: { t: TitleDetail; stale: boolean }) {
  const saved = useSaved()
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
    ['Language', t.original_language ? LANG[t.original_language] ?? t.original_language.toUpperCase() : ''],
  ] as [string, string][]).filter((d) => d[1])
  const art = tmdbImage(t.backdrop_path, 'w1280') ?? tmdbImage(t.poster_path, 'w780')
  const long = (t.overview?.length ?? 0) > 170

  return (
    <>
      <section className="title-top" aria-labelledby="t-title">
        {art && <PinnedArt><img className="title-art" data-poster={!t.backdrop_path} src={art} alt="" fetchPriority="high" /></PinnedArt>}
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
            <li className="row-plain"><span className="row-text"><b>Not streaming in Sweden</b><small>{notifying ? 'We’ll let you know when it’s on.' : 'Not on any service here right now.'}</small></span></li>
          )}
        </ul>
      </section>

      {t.awards.length > 0 && (
        <section className="block">
          <h2 className="block-title">Awards</h2>
          <ul className="rows">
            {t.awards.map((a) => (
              <li key={a.id} className="row-plain">
                <Laurel size={16} won={a.won} />
                <span className="row-text"><b>{a.award} {a.year}</b><small>{a.won ? 'Won' : 'Nominated'} · {a.short_category}{a.person_name ? `, ${a.person_name}` : ''}</small></span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {t.more.length >= 3 && (
        <section className="block">
          <SectionHeader title="More like this" />
          <PosterRow>{t.more.map((c) => <TitleCard key={c.id} card={c} />)}</PosterRow>
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
