// When Home loads, and when it doesn't. Home's content changes when the nightly sync has run, when the day turns
// (the rows that rotate), and when the member's own things change (services, Letterboxd, the watchlist). So the
// app keeps the Home it built and asks the server one small question on opening: has the sync run since? Only
// then is Home built again. And the page never changes under the member's eyes:
//  - opening: a Home that is out of date is rebuilt while the launch screen is up (up to 1.5 s). Ready in
//    time, today's Home is the first thing shown; not ready, the saved one is shown and the new one waits.
//  - a new one that waits is put in place when the member comes back to the Home tab, pulls to refresh, or
//    opens the app again; or at once if they haven't touched the page since the app came back to the front.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { HomeData } from './home'
import { readQueryData, setQueryData } from './query'
import { supabase } from './supabase'

type Saved = { data: HomeData; stamp: string | null; day: string; mine: string }
const WAIT = 1500

/** the member's local day: the rotating rows change at midnight */
const today = () => new Date().toLocaleDateString('sv-SE')
const sleep = (ms: number) => new Promise<undefined>((r) => setTimeout(() => r(undefined), ms))

async function loadStamp(): Promise<string> {
  const { data, error } = await supabase.from('data_stamp').select('finished_at').maybeSingle()
  if (error) throw new Error(error.message)
  return (data?.finished_at as string | undefined) ?? ''
}

export type HomeQuery = {
  data: HomeData | undefined
  loading: boolean
  error: boolean
  /** what is shown was built on an earlier day (offline): leave out "leaves in 3 days" */
  stale: boolean
  retrying: boolean
  /** build Home again now and show it (pull to refresh, Try again) */
  retry: () => Promise<void>
}

/**
 * @param key   what Home depends on that can be part of a name (version, services, the hide switch)
 * @param mine  a short signature of the member's own things that change Home's rows (the watchlist)
 * @param active Home is the page in front: a waiting Home is put in place when this turns true
 */
export function useHome(key: string | null, load: () => Promise<HomeData>, mine: string, active: boolean): HomeQuery {
  const [view, setView] = useState<{ data: HomeData; day: string } | undefined>()
  const [error, setError] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const pending = useRef<{ data: HomeData; day: string } | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const mineRef = useRef(mine)
  mineRef.current = mine
  const touched = useRef(false)
  const activeRef = useRef(active)
  activeRef.current = active

  const build = useCallback(async (stamp: string | null): Promise<{ data: HomeData; day: string }> => {
    const mine = mineRef.current
    const data = await loadRef.current()
    const day = today()
    builtMine.current = mine
    if (key) setQueryData<Saved>(key, { data, stamp, day, mine })
    return { data, day }
  }, [key])
  // what the Home on screen (or waiting) was built from: the member's own things then
  const builtMine = useRef<string | null>(null)
  const current = (s: Saved | undefined, stamp: string | null) => !!s && s.day === today() && s.stamp === stamp

  // Opening (and a change of key: services or the switch, made in Settings while Home isn't in front)
  useEffect(() => {
    if (!key) return
    let live = true
    const read = readQueryData<Saved>(key)
    const saved = read?.day ? read : undefined // an entry from before the stamp
    builtMine.current = saved?.mine ?? null
    const show = (v: { data: HomeData; day: string }) => { if (live) { setView(v); setError(false) } }
    const keep = (v: { data: HomeData; day: string }) => { if (live) pending.current = v }
    setError(false)
    void (async () => {
      const started = Date.now()
      const stampP = loadStamp().catch(() => null)
      const stamp = await Promise.race([stampP, sleep(WAIT)])
      if ((stamp === undefined || stamp === null) && saved) {
        // slow or offline: the saved Home, and a new one later if the sync has run since
        show({ data: saved.data, day: saved.day })
        const later = await stampP
        if (later !== null && !current(saved, later)) build(later).then(keep, () => {})
        return
      }
      if (saved && current(saved, stamp ?? null)) { show({ data: saved.data, day: saved.day }); return }
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
  // (compared after a moment: while the app opens, the lists it is made from are still arriving)
  useEffect(() => {
    if (!key) return
    let live = true
    const t = setTimeout(() => {
      if (builtMine.current === null || builtMine.current === mineRef.current) return
      loadStamp().catch(() => null).then((stamp) => build(stamp)).then((v) => { if (live) pending.current = v }, () => {})
    }, 800)
    return () => { live = false; clearTimeout(t) }
  }, [key, mine, build])

  // Back on the Home tab: put a waiting Home in place before it is seen
  useEffect(() => {
    if (active && pending.current) { setView(pending.current); pending.current = null }
  }, [active])

  // Back to the front after a while (the app was in the background): check again. A new Home goes in at once
  // only if the page hasn't been touched since; otherwise it waits like any other.
  useEffect(() => {
    if (!key) return
    let hiddenAt = 0
    const onTouch = () => { touched.current = true }
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      if (Date.now() - hiddenAt < 5 * 60 * 1000) return
      touched.current = false
      const saved = readQueryData<Saved>(key)
      loadStamp().then(async (stamp) => {
        if (current(saved, stamp)) return
        const v = await build(stamp)
        if (!touched.current && activeRef.current) setView(v)
        else pending.current = v
      }, () => {})
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('touchstart', onTouch, { passive: true })
    window.addEventListener('scroll', onTouch, { passive: true, capture: true })
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('touchstart', onTouch)
      window.removeEventListener('scroll', onTouch, { capture: true })
    }
  }, [key, build])

  const retry = useCallback(async () => {
    if (!key) return
    setRetrying(true)
    const started = Date.now()
    try {
      const stamp = await loadStamp().catch(() => null)
      const v = await build(stamp)
      pending.current = null
      setView(v); setError(false)
    } catch { if (!view) setError(true) } finally {
      setTimeout(() => setRetrying(false), Math.max(0, 600 - (Date.now() - started)))
    }
  }, [key, build, view])

  return { data: view?.data, loading: !view && !error, error: error && !view, stale: !!view && view.day !== today(), retrying, retry }
}
