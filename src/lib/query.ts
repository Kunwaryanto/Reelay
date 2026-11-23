// One shared way to load data: cached answers show at once and refresh behind,
// failures keep the saved copy, and "Try again" backs off (1, 2, 4… s) and reruns when the connection returns.
//
// When a saved answer is fresh is said once per kind of content (`Freshness`), not with a timer per screen:
//  - catalogue: titles, people, Browse lists. Kept until the nightly sync has run (`data_stamp`, see stamp.ts).
//  - the member's own things: kept until they change them (`changed('watchlist')` etc.); `deps` says which.
//  - anything else: `maxAge`.
import { useCallback, useEffect, useRef, useState } from 'react'
import { currentStamp } from './stamp'

/** The member's own things that other saved answers are built from. */
export type Dep = 'services' | 'watchlist' | 'letterboxd'
export type Freshness = {
  /** catalogue content: fresh until the sync stamp moves */
  catalogue?: boolean
  /** built from these of the member's things: stale as soon as one changes */
  deps?: Dep[]
  /** fresh for this long (ms); with `catalogue`, also the limit while the stamp can't be asked */
  maxAge?: number
  persist?: boolean
}
type Entry = { data: unknown; at: number; stamp?: string | null; dirty?: boolean; deps?: Dep[] }
const memory = new Map<string, Entry>()
const PREFIX = 'reelay:q:'

function readSaved(key: string): Entry | undefined {
  const hit = memory.get(key)
  if (hit) return hit
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (!raw) return undefined
    const entry = JSON.parse(raw) as Entry
    memory.set(key, entry)
    return entry
  } catch { return undefined }
}

function save(key: string, data: unknown, persist: boolean, extra: Pick<Entry, 'stamp' | 'deps'> = {}) {
  const entry: Entry = { data, at: Date.now(), ...extra }
  memory.set(key, entry)
  if (!persist) return
  try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)) } catch { /* storage full or blocked: memory only */ }
}

// Screens showing a key re-render when another screen writes it (see setQueryData).
const watchers = new Map<string, Set<() => void>>()

/** Put an answer in the cache by hand, after changing it on the server: every screen showing that key updates. */
export function setQueryData<T>(key: string, data: T, persist = true, deps?: Dep[]) {
  save(key, data, persist, deps ? { deps } : {})
  watchers.get(key)?.forEach((f) => f())
}

/** A saved answer built from something the member has changed since (see `changed`). */
export const isDirty = (key: string) => !!readSaved(key)?.dirty

/** What is saved under a key, without loading it. */
export const readQueryData = <T,>(key: string): T | undefined => readSaved(key)?.data as T | undefined

/** Change what's saved under a key from what is there now (nothing happens when nothing is saved yet). */
export function updateQueryData<T>(key: string, change: (now: T) => T, persist = true) {
  const entry = readSaved(key)
  if (entry) setQueryData(key, change(entry.data as T), persist)
}

// Loads started ahead of the screen that will show them (see prefetch): that screen waits for this one answer.
const inflight = new Map<string, Promise<void>>()

/** Start loading a key before its screen opens (a finger on a card): the screen then finds the answer waiting or on its way. */
export function prefetch<T>(key: string, load: () => Promise<T>, opts: Freshness = {}) {
  const { persist = true } = opts
  if (isFresh(readSaved(key), opts) || inflight.has(key)) return
  inflight.set(key, load()
    .then((data) => { save(key, data, persist, { stamp: opts.catalogue ? currentStamp() : undefined, deps: opts.deps }); watchers.get(key)?.forEach((f) => f()) })
    .catch(() => { /* the screen loads it itself and shows what went wrong */ })
    .finally(() => { inflight.delete(key) }))
}

export function clearSavedData() {
  memory.clear()
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  } catch { /* ignore */ }
}

/** The last load that failed, and why (shown on Settings › Version). */
let lastError = ''
export const lastLoadError = () => lastError

// A request couldn't reach the server: the Offline pill listens to this.
const failListeners = new Set<(failed: boolean) => void>()
let lastFailed = false
function reportFailure(failed: boolean) {
  if (failed === lastFailed) return
  lastFailed = failed
  failListeners.forEach((f) => f(failed))
}
export function useRequestFailed(): boolean {
  const [failed, setFailed] = useState(lastFailed)
  useEffect(() => { failListeners.add(setFailed); return () => { failListeners.delete(setFailed) } }, [])
  return failed
}

const DAY = 24 * 60 * 60 * 1000

const MIN = 60 * 1000
/** The kinds of content, by how long a saved answer stays fresh. Every cache uses one of these. */
export const FRESH = {
  /** titles, people, lists, pictures: until the nightly sync has run */
  catalogue: { catalogue: true },
  /** the member's own things: until they change them here, or ten minutes (another device may have) */
  mine: (...deps: Dep[]): Freshness => ({ deps, maxAge: 10 * MIN }),
  /** what everyone logged on Letterboxd for a film: until the sync has run or the member's own films change */
  logs: { catalogue: true, deps: ['letterboxd'] } as Freshness,
  /** read afresh every time (admin lists) */
  live: { maxAge: 0, persist: false },
} satisfies Record<string, Freshness | ((...d: Dep[]) => Freshness)>

/** Whether a saved answer can be shown without loading again. */
function isFresh(entry: Entry | undefined, f: Freshness): boolean {
  if (!entry || entry.dirty) return false
  if (f.catalogue) {
    const now = currentStamp()
    // the stamp not known yet (first opening, or the server can't be reached): a day at most
    if (now === null || entry.stamp == null) return Date.now() - entry.at <= (f.maxAge ?? DAY)
    return entry.stamp === now
  }
  return Date.now() - entry.at <= (f.maxAge ?? 60_000)
}

// ---- The member's own things changed ----------------------------------------------------------------------------
// Every saved answer built from them is marked stale; the ones on screen load again quietly (what they show stays
// until the new answer is in). Screens that decide themselves when to rebuild (Home) follow `useChanges`.
const depWatchers = new Map<string, { deps: Dep[]; reload: () => void }>()
const changeCount: Record<Dep, number> = { services: 0, watchlist: 0, letterboxd: 0 }
const changeListeners = new Set<() => void>()
const pendingChange = new Set<Dep>()
let changeTimer: ReturnType<typeof setTimeout> | undefined
/** Say that one of the member's own things changed (after saving it on the server). A burst counts once. */
export function changed(dep: Dep) {
  pendingChange.add(dep)
  clearTimeout(changeTimer)
  changeTimer = setTimeout(() => {
    const deps = [...pendingChange]
    pendingChange.clear()
    for (const d of deps) changeCount[d]++
    const hit = (e: Entry | undefined) => !!e?.deps?.some((d) => deps.includes(d))
    for (const [key, e] of memory) if (hit(e)) { e.dirty = true; try { if (localStorage.getItem(PREFIX + key)) localStorage.setItem(PREFIX + key, JSON.stringify(e)) } catch { /* ignore */ } }
    try {
      for (const k of Object.keys(localStorage)) {
        if (!k.startsWith(PREFIX) || memory.has(k.slice(PREFIX.length))) continue
        const e = JSON.parse(localStorage.getItem(k) ?? 'null') as Entry | null
        if (hit(e ?? undefined)) localStorage.setItem(k, JSON.stringify({ ...e, dirty: true }))
      }
    } catch { /* ignore */ }
    for (const w of depWatchers.values()) if (w.deps.some((d) => deps.includes(d))) w.reload()
    changeListeners.forEach((f) => f())
  }, 400)
}
/** A number that goes up each time one of these changes. */
export function useChanges(deps: Dep[]): number {
  const [, bump] = useState(0)
  useEffect(() => { const f = () => bump((n) => n + 1); changeListeners.add(f); return () => { changeListeners.delete(f) } }, [])
  return deps.reduce((n, d) => n + changeCount[d], 0)
}

export type Query<T> = {
  data: T | undefined
  /** first load with nothing saved */
  loading: boolean
  /** failed and nothing saved to show */
  error: boolean
  /** the saved copy is older than a day: hide time-sensitive notes */
  stale: boolean
  retrying: boolean
  /** fetch again now (Try again, pull to refresh) */
  retry: () => Promise<void>
}


export function useQuery<T>(key: string | null, load: () => Promise<T>, opts: Freshness = {}): Query<T> {
  const { persist = true } = opts
  const optsRef = useRef(opts)
  optsRef.current = opts
  const depsKey = (opts.deps ?? []).join(',')
  const saved = key ? readSaved(key) : undefined
  const [, bump] = useState(0)
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load
  const attempt = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const run = useCallback(async (manual: boolean) => {
    if (!key) return
    const started = Date.now()
    if (manual) setRetrying(true)
    try {
      const data = await loadRef.current()
      save(key, data, persist, { stamp: optsRef.current.catalogue ? currentStamp() : undefined, deps: optsRef.current.deps })
      attempt.current = 0
      setError(false)
      reportFailure(false)
    } catch (e) {
      setError(true)
      // Only a request that never reached the server says anything about the connection. A request the server
      // answered with an error is our problem, not the network's: it shows where it happened, not as "Offline".
      const message = e instanceof Error ? e.message : String(e)
      lastError = `${key}: ${message}`.slice(0, 160)
      if (!navigator.onLine || /failed to fetch|load failed|networkerror|network request failed|timed? ?out/i.test(message)) reportFailure(true)
      else console.warn('Reelay: couldn’t load', lastError)
      const wait = Math.min(30_000, 1000 * 2 ** attempt.current++)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => run(false), wait)
    } finally {
      if (manual) {
        // keep the spinner for at least 600 ms so it doesn't flicker
        const left = 600 - (Date.now() - started)
        setTimeout(() => setRetrying(false), Math.max(0, left))
      }
      bump((n) => n + 1)
    }
  }, [key, persist])

  useEffect(() => {
    if (!key) return
    const f = () => bump((n) => n + 1)
    const set = watchers.get(key) ?? new Set()
    watchers.set(key, set.add(f))
    return () => { set.delete(f) }
  }, [key])

  useEffect(() => {
    if (!key) return
    setError(false)
    attempt.current = 0
    const entry = readSaved(key)
    const ahead = inflight.get(key)
    let live = true
    if (ahead) void ahead.then(() => { if (live && !readSaved(key)) run(false) })
    else if (!isFresh(entry, optsRef.current)) run(false)
    const online = () => run(false)
    window.addEventListener('online', online)
    const watch = Symbol(key).toString() + Math.random()
    if (depsKey) depWatchers.set(watch, { deps: depsKey.split(',') as Dep[], reload: () => run(false) })
    return () => { live = false; window.removeEventListener('online', online); clearTimeout(timer.current); depWatchers.delete(watch) }
  }, [key, depsKey, run])

  const retry = useCallback(() => run(true), [run])
  return {
    data: saved?.data as T | undefined,
    loading: !saved && !error,
    error: error && !saved,
    stale: !!saved && Date.now() - saved.at > DAY,
    retrying,
    retry,
  }
}
