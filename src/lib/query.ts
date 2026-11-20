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

export function clearSavedData() {
  memory.clear()
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith(PREFIX)) localStorage.removeItem(k)
  } catch { /* ignore */ }
}

// A request has failed: the Offline pill listens to this.
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
  retry: () => void
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
    } catch {
      setError(true)
      reportFailure(true)
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
    setError(false)
    attempt.current = 0
    const entry = readSaved(key)
    if (!entry || Date.now() - entry.at > maxAge) run(false)
    const online = () => run(false)
    window.addEventListener('online', online)
    return () => { window.removeEventListener('online', online); clearTimeout(timer.current) }
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
