// Reads the catalogue (titles, where they stream, scores, cast) and the user's watchlist.
import { supabase } from './supabase'

export type Avail = { service_id: string; leaves_on: string | null; type?: string; link?: string | null }
export type Card = {
  id: number
  kind: 'film' | 'series'
  title: string
  year: number | null
  poster_path: string | null
  backdrop_path?: string | null
  logo_path?: string | null
  genres?: string[]
  seasons?: number | null
  availability: Avail[]
}
export type Row = { id: string; title: string; items: Card[]; notes?: 'leaving' }
export type NowData = { hero: Card[]; rows: Row[] }

const CARD = 'id,kind,title,year,poster_path,availability!inner(service_id,leaves_on)'
const HERO = 'id,kind,title,year,poster_path,backdrop_path,logo_path,genres,seasons,availability!inner(service_id,leaves_on)'

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

const today = () => new Date().toISOString().slice(0, 10)
const inDays = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10)

export async function loadNow(): Promise<NowData> {
  const titles = () => supabase.from('titles')
  const pop = { ascending: false }
  const [hero, leaving, rated, d2000, d90, crime, comedy, drama] = await Promise.all([
    titles().select(HERO).not('backdrop_path', 'is', null).not('logo_path', 'is', null).order('popularity', { ascending: false }).limit(5),
    supabase.from('availability').select(`leaves_on,title:titles!inner(${CARD})`).gte('leaves_on', today()).lte('leaves_on', inDays(30)).order('leaves_on').limit(40),
    titles().select(`${CARD},scores!inner(imdb_rating,imdb_votes)`).gte('scores.imdb_votes', 50000).order('scores(imdb_rating)', { ascending: false }).limit(20),
    titles().select(CARD).gte('year', 2000).lte('year', 2009).order('popularity', pop).limit(20),
    titles().select(CARD).gte('year', 1990).lte('year', 1999).order('popularity', pop).limit(20),
    titles().select(CARD).overlaps('genres', ['Crime', 'Thriller']).order('popularity', pop).limit(20),
    titles().select(CARD).contains('genres', ['Comedy']).order('popularity', pop).limit(20),
    titles().select(CARD).contains('genres', ['Drama']).order('popularity', pop).limit(20),
  ])

  const seen = new Set<number>()
  const leavingCards = (unwrap(leaving as never) as { title: Card }[])
    .map((r) => r.title)
    .filter((t) => t && !seen.has(t.id) && seen.add(t.id))
    .slice(0, 20)

  const rows: Row[] = [
    { id: 'leaving', title: 'Leaving soon', items: leavingCards, notes: 'leaving' },
    { id: 'rated', title: 'Highest rated', items: unwrap(rated as never) },
    { id: '2000s', title: '2000s', items: unwrap(d2000 as never) },
    { id: '90s', title: '90s', items: unwrap(d90 as never) },
    { id: 'crime', title: 'Crime and thrillers', items: unwrap(crime as never) },
    { id: 'comedy', title: 'Comedy', items: unwrap(comedy as never) },
    { id: 'drama', title: 'Drama', items: unwrap(drama as never) },
  ]
  return { hero: unwrap(hero as never), rows: rows.filter((r) => r.items.length >= 3) }
}

export type Person = { id: number; name: string; profile_path: string | null }
export type Credit = { role: 'cast' | 'director' | 'creator' | 'writer'; character: string | null; sort_order: number; person: Person }
export type Award = { id: number; award: string; year: number; short_category: string; won: boolean; person_name: string | null; rank: number }
export type TitleDetail = Omit<Card, 'availability' | 'genres'> & {
  original_title: string | null
  end_year: number | null
  runtime_min: number | null
  overview: string | null
  original_language: string | null
  genres: string[]
  availability: (Avail & { service: { name: string; kind: string } | null })[]
  scores: { imdb_rating: number | null; rt_critics: number | null; letterboxd: number | null } | null
  credits: Credit[]
  awards: Award[]
  more: Card[]
}

export async function loadTitle(id: number): Promise<TitleDetail | null> {
  const title = unwrap(await supabase.from('titles').select(
    'id,kind,title,original_title,year,end_year,runtime_min,seasons,overview,genres,original_language,poster_path,backdrop_path,logo_path,' +
    'availability(service_id,type,leaves_on,link,service:services(name,kind)),' +
    'scores(imdb_rating,rt_critics,letterboxd),' +
    'credits(role,character,sort_order,person:people(id,name,profile_path)),' +
    'awards(id,award,year,short_category,won,person_name,rank)',
  ).eq('id', id).maybeSingle()) as unknown as (Omit<TitleDetail, 'more'>) | null
  if (!title) return null
  let more: Card[] = []
  if (title.genres.length) {
    more = (unwrap(await supabase.from('titles').select(CARD).contains('genres', [title.genres[0]]).eq('kind', title.kind)
      .neq('id', id).order('popularity', { ascending: false }).limit(12)) as unknown as Card[])
  }
  title.credits.sort((a, b) => a.sort_order - b.sort_order)
  title.awards.sort((a, b) => Number(b.won) - Number(a.won) || a.rank - b.rank || b.year - a.year)
  return { ...title, more }
}

// ---- Watchlist -------------------------------------------------------------

export type Saved = { title_id: number; notify: boolean }

export async function loadWatchlist(): Promise<Saved[]> {
  return unwrap(await supabase.from('watchlist').select('title_id,notify')) as Saved[]
}

export async function saveTitle(userId: string, titleId: number, notify: boolean) {
  unwrap(await supabase.from('watchlist').upsert({ user_id: userId, title_id: titleId, notify, updated_at: new Date().toISOString() }))
}

export async function unsaveTitle(userId: string, titleId: number) {
  unwrap(await supabase.from('watchlist').delete().eq('user_id', userId).eq('title_id', titleId))
}

// ---- Words -----------------------------------------------------------------

export const SERVICE_NAME: Record<string, string> = {
  netflix: 'Netflix', 'hbo-max': 'HBO Max', 'svt-play': 'SVT Play', viaplay: 'Viaplay', 'disney-plus': 'Disney+',
  'prime-video': 'Prime Video', 'apple-tv': 'Apple TV', skyshowtime: 'SkyShowtime', 'tv4-play': 'TV4 Play',
  mubi: 'MUBI', crunchyroll: 'Crunchyroll', curiosity: 'Curiosity Stream', 'pluto-tv': 'Pluto TV',
}

// Where "Open in" goes when the catalogue has no direct link: the service's own search for the title.
const SERVICE_SEARCH: Record<string, string> = {
  netflix: 'https://www.netflix.com/search?q=', 'hbo-max': 'https://play.hbomax.com/search?q=',
  'svt-play': 'https://www.svtplay.se/sok?q=', viaplay: 'https://viaplay.se/search?query=',
  'disney-plus': 'https://www.disneyplus.com/search?q=', 'prime-video': 'https://www.primevideo.com/search/?phrase=',
  'apple-tv': 'https://tv.apple.com/se/search?term=', skyshowtime: 'https://www.skyshowtime.com/se/search?q=',
  'tv4-play': 'https://www.tv4play.se/sok?q=', mubi: 'https://mubi.com/en/search/films?query=',
  crunchyroll: 'https://www.crunchyroll.com/search?q=', curiosity: 'https://curiositystream.com/search/',
  'pluto-tv': 'https://pluto.tv/search/details?query=',
}

export function openLink(a: Avail, title: string): string {
  return a.link || (SERVICE_SEARCH[a.service_id] ?? 'https://www.google.com/search?q=') + encodeURIComponent(title)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function leavingNote(date: string | null | undefined): string | null {
  if (!date) return null
  const days = Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(today() + 'T00:00:00Z')) / 864e5)
  if (days < 0) return null
  if (days === 0) return 'Leaves today'
  if (days === 1) return 'Leaves tomorrow'
  if (days <= 14) return `Leaves in ${days} days`
  const d = new Date(date + 'T00:00:00Z')
  return `Leaves ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

export const kindWord = (kind: Card['kind']) => (kind === 'film' ? 'Film' : 'Series')

export function runtime(min: number | null): string | null {
  if (!min) return null
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
}
