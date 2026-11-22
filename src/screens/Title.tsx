import { useState } from 'react'
import { SERVICE_NAME, kindWord, leavingNote, loadTitle, openLink, runtime, type TitleDetail } from '../lib/catalogue'
import { tmdbImage } from '../lib/images'
import { useDimOnScroll, useNavActions } from '../lib/nav'
import { useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { takeOpenedFrom } from '../lib/push'
import { supabase } from '../lib/supabase'
import { PinnedArt, BackButton, GlassButton, Icon, Laurel, LoadFailed, PosterRow, PosterWall, SectionHeader, Skeleton, TitleCard, titleArt, useArrival, usePullToRefresh } from '../ui'

const LANG: Record<string, string> = { en: 'English', sv: 'Swedish', no: 'Norwegian', da: 'Danish', fi: 'Finnish', de: 'German', fr: 'French', es: 'Spanish', it: 'Italian', ja: 'Japanese', ko: 'Korean' }
const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('')
const names = (t: TitleDetail, role: string) => t.credits.filter((c) => c.role === role).map((c) => c.person.name).join(', ')

function Body({ t, stale }: { t: TitleDetail; stale: boolean }) {
  const saved = useSaved()
  const { push } = useNavActions()
  // opened from a notification: where it streams lights up once, then settles
  const [flash] = useState(() => takeOpenedFrom(`/title/${t.id}`))
  const [open, setOpen] = useState(false)
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
  if (t.scores?.rt_critics != null) ratings.push(['Tomatometer', `${t.scores.rt_critics}%`])
  if (t.scores?.letterboxd != null) ratings.push(['Letterboxd', Number(t.scores.letterboxd).toFixed(1)])
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
            <button type="button" className="icon-btn" aria-pressed={isSaved} aria-label={isSaved ? 'Remove from watchlist' : 'Add to watchlist'} onClick={() => saved.toggleSaved(t.id, t.title, t)}>
              <span><Icon name="bookmark" size={18} fill={isSaved} /></span>
            </button>
          </div>
        </div>
      </section>

      <p className="title-meta">{meta1}{meta2 && <><br />{meta2}</>}{by && <><br />{film ? 'Directed by' : 'Created by'} <span>{by}</span></>}</p>
      {ratings.length > 0 && <dl className="ratings">{ratings.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
      {t.overview && (
        <div className="overview" data-open={open || !long}>
          <p>{t.overview}</p>
          {long && !open && <button type="button" aria-label="Read more" onClick={() => setOpen(true)}>more</button>}
        </div>
      )}

      <section className="block" data-flash={flash ? '' : undefined}>
        <ul className="rows">
          {t.availability.map((a) => {
            const note = stale ? null : leavingNote(a.leaves_on)
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
          <h2 className="block-title">Cast</h2>
          <div className="row-scroll noscroll"><ul className="cast">
            {cast.map((c) => (
              <li key={c.person.id}>
                <a href={`/person/${c.person.id}`} onClick={(e) => { e.preventDefault(); push(`/person/${c.person.id}`) }}>
                  <span className="avatar" aria-hidden="true">
                    {c.person.profile_path ? <img src={tmdbImage(c.person.profile_path, 'w185')} alt="" loading="lazy" /> : initials(c.person.name)}
                  </span>
                  <span className="cast-name">{c.person.name}</span>
                  {c.character && <span className="cast-role">{c.character}</span>}
                </a>
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
  const wall = useQuery<string[]>('wall', loadWall, { maxAge: 24 * 60 * 60 * 1000 })
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

export default function Title({ id }: { id: number }) {
  const q = useQuery(Number.isFinite(id) ? `title:${id}` : null, () => loadTitle(id), { maxAge: 10 * 60 * 1000 })
  const onScroll = useDimOnScroll()
  const { bind, indicator } = usePullToRefresh(q.retry)
  const missing = !Number.isFinite(id) || (q.data === null && !q.loading)
  // above the fold: the top picture
  const phase = useArrival(String(id), !!q.data, () => titleArt(q.data))
  return (
    <>
    <main className="page noscroll" data-arrive={phase === 'in' ? '' : undefined} ref={bind.ref} onScroll={onScroll}>
      <div className="page-back"><BackButton glass /></div>
      {q.error && <div className="page-center"><LoadFailed what="this title" retry={q.retry} retrying={q.retrying} /></div>}
      {missing && <Gone what="title" />}
      {phase !== 'there' && !q.error && !missing && <Skeleton kind="title" leaving={phase === 'in'} />}
      {q.data && phase !== 'wait' && <div className="arrive"><Body t={q.data} stale={q.stale} /></div>}
    </main>
    {indicator}
    </>
  )
}
