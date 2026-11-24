// Which titles of the watchlist news (the line under Home's hero) the member has seen: an arrival leaves the line
// once its title page has been opened, or the line was tapped to open the Watchlist. Kept on this phone only (the
// installed app and Safari don't share it); entries go after 30 days, when the news is long over anyway.
import { useSyncExternalStore } from 'react'

const KEY = 'reelay.news-seen'
const KEEP = 30 * 864e5

function read(): Record<string, number> {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>
    const now = Date.now()
    return Object.fromEntries(Object.entries(all).filter(([, at]) => now - at < KEEP))
  } catch { return {} }
}

let seen = read()
let ids: ReadonlySet<number> = new Set(Object.keys(seen).map(Number))
const subs = new Set<() => void>()

/** Mark titles as seen in the news. Cheap to call for a title that isn't in it. */
export function markNewsSeen(...titleIds: number[]): void {
  const add = titleIds.filter((id) => !ids.has(id))
  if (!add.length) return
  seen = { ...seen, ...Object.fromEntries(add.map((id) => [id, Date.now()])) }
  ids = new Set(Object.keys(seen).map(Number))
  try { localStorage.setItem(KEY, JSON.stringify(seen)) } catch { /* private mode: seen for this visit only */ }
  subs.forEach((f) => f())
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } }
export const useNewsSeen = (): ReadonlySet<number> => useSyncExternalStore(subscribe, () => ids)
