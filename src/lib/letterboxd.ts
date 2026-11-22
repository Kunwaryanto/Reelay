// Letterboxd: the signed-in person's connection, the films they have watched, and what everyone on Reelay
// logged for a title. The letterboxd function and the nightly sync do the reading; this only asks the database.
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useAuth } from './auth'
import { setQueryData, useQuery } from './query'
import { supabase } from './supabase'

export type LbAccount = { username: string; display_name: string | null; mark_watched: boolean; synced_at: string | null; sync_error: string | null; films: number }
export type LbLog = { me: boolean; name: string; username: string; entry_id: string; watched_on: string | null; rating: number | null; rewatch: boolean }

const meKey = (uid: string) => `lb-me:${uid}`
const watchedKey = (uid: string) => `lb-watched:${uid}`

async function loadMe(): Promise<LbAccount | null> {
  const { data, error } = await supabase.rpc('letterboxd_me')
  if (error) throw new Error(error.message)
  return ((data ?? []) as LbAccount[])[0] ?? null
}
async function loadWatched(): Promise<number[]> {
  const { data, error } = await supabase.rpc('letterboxd_watched')
  if (error) throw new Error(error.message)
  return ((data ?? []) as (number | string)[]).map(Number)
}
export async function loadTitleLogs(titleId: number): Promise<LbLog[]> {
  const { data, error } = await supabase.rpc('letterboxd_for_title', { p_title: titleId })
  if (error) throw new Error(error.message)
  return ((data ?? []) as LbLog[]).map((l) => ({ ...l, rating: l.rating === null ? null : Number(l.rating) }))
}

/** The signed-in person's connection: undefined while loading, null when not connected. */
export function useLetterboxd() {
  const uid = useAuth().session?.user.id
  const q = useQuery<LbAccount | null>(uid ? meKey(uid) : null, loadMe, { maxAge: 5 * 60 * 1000 })
  return { account: q.data, loading: q.loading, error: q.error }
}

async function refresh(uid: string) {
  const [me, watched] = await Promise.all([loadMe(), loadWatched()])
  setQueryData(meKey(uid), me)
  setQueryData(watchedKey(uid), watched)
  return me
}

export type Connected = { status: 'connected' | 'pending' } | { error: 'not_found' | 'invalid' | 'failed' }
/** Connect a Letterboxd member (or read the connected one afresh, with no username). */
export async function connectLetterboxd(uid: string, username?: string): Promise<Connected> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('signed out')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/letterboxd`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(username ? { username } : {}),
  })
  const body = await res.json().catch(() => ({})) as { status?: 'connected' | 'pending'; error?: string }
  if (body.status) { await refresh(uid); return { status: body.status } }
  if (body.error === 'not_found' || body.error === 'invalid') return { error: body.error }
  return { error: 'failed' }
}

/** Disconnect: the account row goes, and its films with it. */
export async function disconnectLetterboxd(uid: string) {
  const { error } = await supabase.from('letterboxd_accounts').delete().eq('user_id', uid)
  if (error) throw new Error(error.message)
  setQueryData(meKey(uid), null)
  setQueryData(watchedKey(uid), [])
}

export async function setMarkWatched(uid: string, account: LbAccount, on: boolean) {
  setQueryData(meKey(uid), { ...account, mark_watched: on })
  const { error } = await supabase.from('letterboxd_accounts').update({ mark_watched: on }).eq('user_id', uid)
  if (error) { setQueryData(meKey(uid), account); throw new Error(error.message) }
}

// ---- Watched titles: one shared set, so every poster can ask without a query of its own ----
let watched: ReadonlySet<number> = new Set()
let marks = false
const listeners = new Set<() => void>()
const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f) } }
function publish(ids: number[], show: boolean) {
  if (show === marks && ids.length === watched.size && ids.every((id) => watched.has(id))) return
  watched = new Set(ids); marks = show
  listeners.forEach((f) => f())
}

/** Keeps the shared set in step with the server. Mounted once, by the app shell. */
export function useWatchedSync() {
  const uid = useAuth().session?.user.id
  const me = useQuery<LbAccount | null>(uid ? meKey(uid) : null, loadMe, { maxAge: 5 * 60 * 1000 })
  const q = useQuery<number[]>(uid && me.data ? watchedKey(uid) : null, loadWatched, { maxAge: 5 * 60 * 1000 })
  const ids = me.data ? q.data : undefined
  const show = !!me.data?.mark_watched
  useEffect(() => { publish(ids ?? [], show) }, [ids, show])
}

/** The catalogue titles the person has logged on Letterboxd (empty when not connected). */
export const useWatched = (): ReadonlySet<number> => useSyncExternalStore(subscribe, () => watched)
/** Does this poster get a check? Only when the person keeps "Mark watched films" on. */
export const useWatchedMark = (id: number): boolean => useSyncExternalStore(subscribe, () => marks && watched.has(id))

// ---- One title: who watched it ----
export type Watcher = { name: string; username: string; logs: LbLog[]; rating: number | null; last: string | null }
export type TitleLogs = { mine: LbLog[]; myRating: number | null; friends: Watcher[]; friendsAvg: number | null }

/** Group a title's logs: mine (latest first) and each friend with their latest date and rating. */
export function groupLogs(logs: LbLog[]): TitleLogs {
  const mine = logs.filter((l) => l.me)
  const by = new Map<string, LbLog[]>()
  for (const l of logs) if (!l.me) by.set(l.username, [...(by.get(l.username) ?? []), l])
  const friends = [...by.values()].map((ls) => ({
    name: ls[0].name, username: ls[0].username, logs: ls,
    rating: ls.find((l) => l.rating !== null)?.rating ?? null, last: ls.find((l) => l.watched_on)?.watched_on ?? null,
  })).sort((a, b) => (b.last ?? '').localeCompare(a.last ?? ''))
  const rated = friends.filter((f) => f.rating !== null)
  return {
    mine, myRating: mine.find((l) => l.rating !== null)?.rating ?? null, friends,
    friendsAvg: rated.length ? rated.reduce((n, f) => n + f.rating!, 0) / rated.length : null,
  }
}

export function useTitleLogs(titleId: number, film: boolean): TitleLogs | null {
  const uid = useAuth().session?.user.id
  const q = useQuery<LbLog[]>(uid && film ? `lb-title:${titleId}` : null, () => loadTitleLogs(titleId), { persist: false, maxAge: 5 * 60 * 1000 })
  return useMemo(() => (q.data && q.data.length ? groupLogs(q.data) : null), [q.data])
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "12 Mar 2025" */
export function fullDate(iso: string | null): string {
  if (!iso) return 'No date'
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}
/** "Today", "3 days ago", "12 Mar" this year, "Feb 2024" before that. */
export function looseDate(iso: string | null, now = new Date()): string {
  if (!iso) return 'No date'
  const [y, m, d] = iso.split('-').map(Number)
  const days = Math.round((Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) - Date.UTC(y, m - 1, d)) / 86_400_000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return y === now.getFullYear() ? `${d} ${MONTHS[m - 1]}` : `${MONTHS[m - 1]} ${y}`
}
export const times = (n: number) => (n === 2 ? 'twice' : `${n} times`)
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name
