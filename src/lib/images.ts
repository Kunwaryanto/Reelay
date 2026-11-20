// Every TMDB image URL goes through here, so routing images through our own site later is a one-line change.
const BASE = 'https://image.tmdb.org/t/p/'

export type ImageSize = 'w92' | 'w185' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original'

export function tmdbImage(path: string | null | undefined, size: ImageSize): string | undefined {
  return path ? `${BASE}${size}${path}` : undefined
}

/** srcset for a poster shown `cssWidth` px wide. */
export function posterSrcSet(path: string | null | undefined): string | undefined {
  if (!path) return undefined
  return `${BASE}w185${path} 185w, ${BASE}w342${path} 342w, ${BASE}w500${path} 500w`
}
