// One shared way to load data: cached answers show at once and refresh behind,
// failures keep the saved copy, and "Try again" backs off (1, 2, 4… s) and reruns when the connection returns.
import { useCallback, useEffect, useRef, useState } from 'react'

type Entry = { data: unknown; at: number }
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

function save(key: string, data: unknown, persist: boolean) {
  const entry = { data, at: Date.now() }
  memory.set(key, entry)
  if (!persist) return
  try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)) } catch { /* storage full or blocked: memory only */ }
}

// Screens showing a key re-render when another screen writes it (see setQueryData).
const watchers = new Map<string, Set<() => void>>()

/** Put an answer in the cache by hand, after changing it on the server: every screen showing that key updates. */
export function setQueryData<T>(key: string, data: T, persist = true) {
  save(key, data, persist)
  watchers.get(key)?.forEach((f) => f())
}

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
export function prefetch<T>(key: string, load: () => Promise<T>, opts: { persist?: boolean; maxAge?: number } = {}) {
  const { persist = true, maxAge = 60_000 } = opts
  const entry = readSaved(key)
  if ((entry && Date.now() - entry.at <= maxAge) || inflight.has(key)) return
  inflight.set(key, load()
    .then((data) => { save(key, data, persist); watchers.get(key)?.forEach((f) => f()) })
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

const DAY = 24 * 60 * 60 * 1000

export function useQuery<T>(key: string | null, load: () => Promise<T>, opts: { persist?: boolean; maxAge?: number } = {}): Query<T> {
  const { persist = true, maxAge = 60_000 } = opts
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
      save(key, data, persist)
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
    else if (!entry || Date.now() - entry.at > maxAge) run(false)
    const online = () => run(false)
    window.addEventListener('online', online)
    return () => { live = false; window.removeEventListener('online', online); clearTimeout(timer.current) }
  }, [key, maxAge, run])

  return {
    data: saved?.data as T | undefined,
    loading: !saved && !error,
    error: error && !saved,
    stale: !!saved && Date.now() - saved.at > DAY,
    retrying,
    retry: () => run(true),
  }
}
