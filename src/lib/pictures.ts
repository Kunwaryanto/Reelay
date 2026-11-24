// Pictures fetched and decoded ahead of the page that shows them, so a page can arrive with them in place.
import { posterSrcSet, tmdbImage } from './images'

export type Picture = { src: string | null | undefined; srcset?: string; sizes?: string }
/** A poster as its card will ask for it, so the file waited for is the file shown. */
export const posterPicture = (path: string | null): Picture => ({ src: tmdbImage(path, 'w342'), srcset: posterSrcSet(path), sizes: '147px' })
// Pictures this session has already decoded: they can show from the first frame, with no fade of their own.
const decoded = new Set<string>()
// The decoded pictures themselves are held on to (the newest 80), so the browser keeps them in memory and the
// page's own <img> gets them in the same frame instead of fetching them from its cache and decoding again.
const held = new Map<string, HTMLImageElement>()
// One request per picture, however many ask (a list warmed while Browse sits idle, then opened): the page's wait
// joins the one under way instead of starting a second.
const decoding = new Map<string, Promise<void>>()
export const decodePicture = ({ src, srcset, sizes }: Picture): Promise<void> => {
  if (!src || decoded.has(src)) return Promise.resolve()
  const going = decoding.get(src)
  if (going) return going
  const img = new Image()
  if (srcset) { img.sizes = sizes ?? '147px'; img.srcset = srcset }
  img.src = src
  const keep = () => {
    decoded.add(src)
    held.set(src, img)
    if (held.size > 120) held.delete(held.keys().next().value!)
  }
  // Safari sometimes refuses decode() on a picture that is still arriving. That must not count as ready (the page
  // then faded in with posters still painting, 22 Nov): wait for it to load instead, and only a broken picture gives up.
  const loaded = () => new Promise<void>((done) => {
    if (img.complete) { if (img.naturalWidth > 0) keep(); done(); return }
    img.addEventListener('load', () => { keep(); done() }, { once: true })
    img.addEventListener('error', () => done(), { once: true })
  })
  const p = img.decode().then(keep, loaded).finally(() => decoding.delete(src))
  decoding.set(src, p)
  return p
}
/** Fetch and decode pictures ahead of the page that will show them. */
export const warmPictures = (pictures: Picture[]) => { for (const p of pictures) void decodePicture(p) }
export const allDecoded = (pictures: Picture[]) => pictures.every((p) => !p.src || decoded.has(p.src))


export function wasDecoded(src: string | null | undefined) { return !!src && decoded.has(src) }
export function markDecoded(src: string | null | undefined) { if (src) decoded.add(src) }

/** A title page's top picture. */
type HeroOf = { backdrop_path?: string | null; poster_path?: string | null; hero_path?: string | null; hero_poster?: boolean | null }
/** The title page's picture: the one the sync chose (a textless poster at 780 wide, or a textless backdrop at full
 *  size, sharp when the page crops it tall), else the backdrop, else the poster. `poster`: framed from the top. */
export function titleHero(t: HeroOf | null | undefined): { src: string | undefined; poster: boolean } {
  if (t?.hero_path) return { src: tmdbImage(t.hero_path, t.hero_poster ? 'w780' : 'original'), poster: !!t.hero_poster }
  return { src: t ? tmdbImage(t.backdrop_path, 'w1280') ?? tmdbImage(t.poster_path, 'w780') : undefined, poster: !t?.backdrop_path }
}
export const titleArt = (t: { backdrop_path?: string | null; poster_path?: string | null } | null | undefined): Picture[] =>
  [{ src: t && (tmdbImage(t.backdrop_path, 'w1280') ?? tmdbImage(t.poster_path, 'w780')) }]
