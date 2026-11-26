// What the member doesn't want suggested (Settings › Suggestions): tags kept on their profile (`hidden_tags`) and
// matched against each title's `tags` (genres, plus kids, anime and stand-up; see the suggestion_prefs migration).
// Home, Browse, Explore and Search's ideas leave those titles out; searching by name and the watchlist never do.
// One shared list, kept on the phone too so the first screen already knows it.
import { useEffect, useSyncExternalStore } from 'react'
import { useProfile } from './profile'

/** The pills, in the page's order: the common ones first, then More genres (A–Z). */
export const COMMON_TAGS: [string, string][] = [
  ['kids', 'Kids'], ['anime', 'Anime'], ['horror', 'Horror'], ['reality', 'Reality'], ['documentaries', 'Documentaries'], ['standup', 'Stand-up'],
]
export const MORE_TAGS: [string, string][] = [
  ['action', 'Action'], ['adventure', 'Adventure'], ['animation', 'Animation'], ['comedy', 'Comedy'], ['crime', 'Crime'],
  ['drama', 'Drama'], ['family', 'Family'], ['fantasy', 'Fantasy'], ['history', 'History'], ['music', 'Music'],
  ['mystery', 'Mystery'], ['news', 'News'], ['romance', 'Romance'], ['scifi', 'Sci-fi'], ['soaps', 'Soaps'],
  ['talk', 'Talk shows'], ['thriller', 'Thriller'], ['war', 'War'], ['western', 'Western'],
]
export const TAG_LABEL = Object.fromEntries([...COMMON_TAGS, ...MORE_TAGS])

const KEY = 'reelay.hidden-tags'
const read = (): string[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[] } catch { return [] } }
let hidden: string[] = read()
const subs = new Set<() => void>()

/** Replace the list (from the profile, or the Suggestions page). Sorted, so equal lists have equal keys. */
export function setHiddenTags(tags: string[]) {
  const next = [...new Set(tags)].sort()
  if (next.join(',') === hidden.join(',')) return
  hidden = next
  try { localStorage.setItem(KEY, JSON.stringify(hidden)) } catch { /* private mode: this visit only */ }
  subs.forEach((f) => f())
}
export const hiddenTags = (): string[] => hidden
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useHiddenTags = (): string[] => useSyncExternalStore(subscribe, () => hidden)

/** Part of a saved list's name, so a list read with other tags hidden is never shown: '' when nothing is hidden. */
export const hiddenKey = (tags: string[] = hidden) => (tags.length ? `:h=${tags.join(',')}` : '')

/** Leave out titles with a hidden tag. `path`: where the title is in the query ('title' for an embedded one). */
export function suggestable<Q>(q: Q, tags: string[] = hidden, path?: string): Q {
  if (!tags.length) return q
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (q as any).not(path ? `${path}.tags` : 'tags', 'ov', `{${tags.join(',')}}`) as Q
}
/** The same, for titles already loaded with their tags. */
export const shown = (t: { tags?: string[] | null }, tags: string[] = hidden) => !tags.length || !(t.tags ?? []).some((x) => tags.includes(x))

/** Keeps the shared list in step with the profile. Mounted once, by the app shell. */
export function useHiddenSync() {
  const { profile } = useProfile()
  const tags = profile?.hidden_tags
  useEffect(() => { if (tags) setHiddenTags(tags) }, [tags])
}
