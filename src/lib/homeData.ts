// When Home loads, and when it doesn't. Home's content changes when the nightly sync has run, when the day turns
// (the rows that rotate), and when the member's own things change (services, Letterboxd, the watchlist). So the
// app keeps the Home it built and asks the server one small question on opening: has the sync run since? Only
// then is Home built again. And the page never changes under the member's eyes:
//  - opening: a Home that is out of date is rebuilt while the launch screen is up (up to 1.5 s). Ready in
//    time, today's Home is the first thing shown; not ready, the saved one is shown and the new one waits.
//  - a new one that waits is put in place when the member comes back to the Home tab, pulls to refresh, or
//    opens the app again.
//  - coming back to the app on a new day (the rotating rows, and usually last night's sync): the launch wordmark
//    covers the page at once (`waking`) while today's Home is built and its first pictures decoded (up to 2 s),
//    then it rises into it, as at a fresh start. Not ready by then, the page stays and the new Home waits.
//  - a new Home is never put on screen before its first pictures are decoded (`prepare`), so it never goes black.
//  - nothing saved at all (a first sign-in, a new phone): the quick Home first, from the server's ready-made
//    generic part (home_base, one request), then the whole one is built and waits like any new Home.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeData } from './home'
import { isDirty, readQueryData, setQueryData } from './query'
import { checkStamp, currentStamp, recentlyChecked } from './stamp'

type Saved = { data: HomeData; stamp: string | null; day: string; partial?: boolean }
const WAIT = 1500
/** coming back on a new day: how long the wordmark may cover the page while today's Home is made */
const WAKE_WAIT = 2000

/** the member's local day: the rotating rows change at midnight */
const today = () => new Date().toLocaleDateString('sv-SE')
const sleep = (ms: number) => new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))

// the stamp, asked once for the whole app when it opens or comes back (Home asks at the same moment)
const loadStamp = () => (recentlyChecked() ? Promise.resolve(currentStamp()) : checkStamp())

/** The saved Home can be shown as it is: built today, from the latest sync, and nothing it is built from changed since. */
const current = (key: string, s: Saved | undefined, stamp: string | null) => !!s && !s.partial && s.day === today() && s.stamp === stamp && !isDirty(key)

export type HomeQuery = {
  data: HomeData | undefined
  loading: boolean
  error: boolean
  /** what is shown was built on an earlier day (offline): leave out "leaves in 3 days" */
  stale: boolean
  retrying: boolean
  /** build Home again now and show it (pull to refresh, Try again) */
  retry: () => Promise<void>
  /** back on a new day: the wordmark covers the page while today's Home is made */
  waking: boolean
}

/**
 * @param key   what Home depends on that can be part of a name (version, services, the hide switch)
 * @param changes goes up when the member's own things that shape Home change (watchlist, Letterboxd: `useChanges`)
 * @param active Home is the page in front: a waiting Home is put in place when this turns true
 * @param prepare decodes a Home's first pictures; a new Home goes on screen only after it
 */
export function useHome(key: string | null, load: (quick?: boolean) => Promise<HomeData>, changes: number, active: boolean,
  prepare: (data: HomeData) => Promise<void> = async () => {}): HomeQuery {
  const [view, setView] = useState<{ data: HomeData; day: string } | undefined>()
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const pending = useRef<{ data: HomeData; day: string } | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const activeRef = useRef(active)
  activeRef.current = active
  const prepareRef = useRef(prepare)
  prepareRef.current = prepare
  const [waking, setWaking] = useState(false)
  const shownDay = useRef<string | null>(null)
  shownDay.current = view?.day ?? null

  const build = useCallback(async (stamp: string | null, quick = false): Promise<{ data: HomeData; day: string }> => {
    const data = await loadRef.current(quick)
    const day = today()
    // saved with what it is built from: a change to either marks it out of date (see `changed`); a quick one is
    // saved too (it shows at the next opening if need be), but never counts as current
    if (key) setQueryData<Saved>(key, { data, stamp, day, ...(data.partial ? { partial: true } : {}) }, true, ['watchlist', 'letterboxd'])
    return { data, day }
  }, [key])

  // Opening (and a change of key: services or the switch, made in Settings while Home isn't in front)
  useEffect(() => {
    if (!key) return
    let live = true
    const read = readQueryData<Saved>(key)
    const saved = read?.day ? read : undefined // an entry from before the stamp
    const show = (v: { data: HomeData; day: string }) => { if (live) { setView(v); setError(false) } }
    const keep = (v: { data: HomeData; day: string }) => { if (live) pending.current = v }
    setError(false)
    void (async () => {
      const started = Date.now()
      const stampP = loadStamp()
      const stamp = await Promise.race([stampP, sleep(WAIT)])
      if ((stamp === undefined || stamp === null) && saved) {
        // slow or offline: the saved Home, and a new one later if the sync has run since
        show({ data: saved.data, day: saved.day })
        const later = await stampP
        if (later !== null && !current(key, saved, later)) build(later).then(keep, () => {})
        return
      }
      if (saved && current(key, saved, stamp ?? null)) { show({ data: saved.data, day: saved.day }); return }
      if (!saved) {
        // nothing to show: the quick Home first (one request), then the whole one, which waits out of sight
        const quick = await build(stamp ?? null, true).catch(() => null)
        if (quick && live) {
          show(quick)
          if (quick.data.partial) build(stamp ?? null).then(keep, () => {}) // (no base: it was the whole Home already)
          return
        }
      }
      const built = build(stamp ?? null)
      const got = await Promise.race([built.catch(() => null), sleep(Math.max(0, WAIT - (Date.now() - started)))])
      if (got) { show(got); return }
      if (saved) { show({ data: saved.data, day: saved.day }); built.then(keep, () => {}); return }
      // nothing to show yet: wait for it (the launch screen's placeholders stand in)
      built.then(show, () => { if (live) setError(true) })
    })()
    return () => { live = false }
  }, [key, build])

  // The member's own things changed (a title saved): build again quietly; it is shown when Home next comes to the front
  const firstChanges = useRef(changes)
  useEffect(() => {
    if (!key || changes === firstChanges.current) return
    firstChanges.current = changes
    let live = true
    loadStamp().then((stamp) => build(stamp)).then((v) => { if (live) pending.current = v }, () => {})
    return () => { live = false }
  }, [key, changes, build])

  // Back on the Home tab: put a waiting Home in place before it is seen
  useEffect(() => {
    if (active && pending.current) { setView(pending.current); pending.current = null }
  }, [active])

  // Back to the front after a while (the app was in the background): check again. On a new day with Home in
  // front, the wordmark covers the page while today's Home is made; otherwise a new one waits, out of sight.
  useEffect(() => {
    if (!key) return
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      if (Date.now() - hiddenAt < 5 * 60 * 1000) return
      const saved = readQueryData<Saved>(key)
      const newDay = !!shownDay.current && shownDay.current !== today()
      if (newDay && activeRef.current) {
        setWaking(true)
        const made = loadStamp().then((stamp) => build(stamp)).then(async (v) => { await prepareRef.current(v.data); return v })
        void Promise.race([made.catch(() => null), sleep(WAKE_WAIT)]).then((v) => {
          if (v) { pending.current = null; setView(v) }
          else made.then((late) => { pending.current = late }, () => {})
          setWaking(false)
        })
        return
      }
      loadStamp().then(async (stamp) => {
        if (stamp === null || current(key, saved, stamp)) return
        const v = await build(stamp)
        await prepareRef.current(v.data)
        pending.current = v
      }, () => {})
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [key, build])

  const retry = useCallback(async () => {
    if (!key) return
    setRetrying(true)
    const started = Date.now()
    try {
      const stamp = await checkStamp() // a pull asks the server, however recently it was asked
      const v = await build(stamp)
      await prepareRef.current(v.data)
      pending.current = null
      setView(v); setError(false)
    } catch { if (!view) setError(true) } finally {
      setTimeout(() => setRetrying(false), Math.max(0, 600 - (Date.now() - started)))
    }
  }, [key, build, view])

  return { data: view?.data, loading: !view && !error, error: error && !view, stale: !!view && view.day !== today(), retrying, retry, waking }
}
