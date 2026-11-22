// What someone has set up: the services they have and the notifications they want.
import { useAuth } from './auth'
import { setQueryData, useQuery } from './query'
import { supabase } from './supabase'

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export type Service = { id: string; name: string; kind: 'subscription' | 'free'; popular: boolean }
export async function loadServices(): Promise<Service[]> {
  return unwrap(await supabase.from('services').select('id,name,kind,popular').order('sort_order')) as Service[]
}

export type Profile = {
  notify_leaving: boolean; notify_arrivals: boolean; notify_new_seasons: boolean
  onboarded_at: string | null
}
export type NotifyKey = 'notify_leaving' | 'notify_arrivals' | 'notify_new_seasons'
const PROFILE = 'notify_leaving,notify_arrivals,notify_new_seasons,onboarded_at'

async function loadProfile(userId: string): Promise<Profile> {
  return unwrap(await supabase.from('profiles').select(PROFILE).eq('user_id', userId).single()) as Profile
}

/** The signed-in person's profile, and a way to change it (shown at once, put back if saving fails). */
export function useProfile() {
  const { session } = useAuth()
  const uid = session?.user.id
  const key = uid ? `profile:${uid}` : null
  const q = useQuery<Profile>(key, () => loadProfile(uid!), { maxAge: 10 * 60 * 1000 })
  const update = async (patch: Partial<Profile>) => {
    if (!uid || !key || !q.data) return
    const before = q.data
    setQueryData(key, { ...before, ...patch })
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', uid)
    if (error) { setQueryData(key, before); throw new Error(error.message) }
  }
  return { profile: q.data, loaded: q.data !== undefined, update }
}

/** The services someone has picked, and a way to change them. The same list Watchlist, Search and Browse read. */
export function useMyServices() {
  const { session } = useAuth()
  const uid = session?.user.id
  const key = uid ? `my-services:${uid}` : null
  const q = useQuery<string[]>(key, async () =>
    (unwrap(await supabase.from('user_services').select('service_id')) as { service_id: string }[]).map((r) => r.service_id),
  { maxAge: 10 * 60 * 1000 })
  const mine = q.data ?? []
  const set = async (id: string, on: boolean) => {
    if (!uid || !key) return
    const before = mine
    setQueryData(key, on ? [...before.filter((x) => x !== id), id] : before.filter((x) => x !== id))
    const res = on
      // insert, skipping one that's already there (people may add and remove rows here, not change them)
      ? await supabase.from('user_services').upsert({ user_id: uid, service_id: id }, { ignoreDuplicates: true })
      : await supabase.from('user_services').delete().eq('user_id', uid).eq('service_id', id)
    if (res.error) { setQueryData(key, before); throw new Error(res.error.message) }
  }
  /** Replace the whole selection in one go (onboarding's Continue). */
  const setAll = async (ids: string[]) => {
    if (!uid || !key) return
    const before = mine
    const add = ids.filter((x) => !before.includes(x)), drop = before.filter((x) => !ids.includes(x))
    if (!add.length && !drop.length) return
    setQueryData(key, ids)
    const res = await Promise.all([
      add.length ? supabase.from('user_services').upsert(add.map((service_id) => ({ user_id: uid, service_id })), { ignoreDuplicates: true }) : null,
      drop.length ? supabase.from('user_services').delete().eq('user_id', uid).in('service_id', drop) : null,
    ])
    const failed = res.find((r) => r?.error)
    if (failed?.error) { setQueryData(key, before); throw new Error(failed.error.message) }
  }
  return { mine, loaded: q.data !== undefined, set, setAll }
}

/** "Netflix, Viaplay" or "Netflix, Viaplay +3" */
export function servicesLabel(names: string[]): string {
  if (!names.length) return 'None'
  if (names.length <= 3 && names.join(', ').length <= 26) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

/** Everything Reelay keeps about the signed-in person, for "Get a copy of my data". */
export async function exportMyData(userId: string, email: string | null) {
  const [profile, services, watchlist, lbAccount, lbLogs] = await Promise.all([
    supabase.from('profiles').select('region,language,notify_leaving,notify_arrivals,notify_new_seasons,created_at').eq('user_id', userId).single(),
    supabase.from('user_services').select('service:services(name)'),
    supabase.from('watchlist').select('notify,added_at,title:titles(title,year,kind)').order('added_at'),
    supabase.from('letterboxd_accounts').select('username,display_name,mark_watched,connected_at,synced_at').eq('user_id', userId).maybeSingle(),
    supabase.from('letterboxd_logs').select('tmdb_id,watched_on,rating,rewatch').eq('user_id', userId).order('watched_on'),
  ])
  return {
    exported_at: new Date().toISOString(), email,
    settings: unwrap(profile), services: (unwrap(services as never) as { service: { name: string } | null }[]).map((s) => s.service?.name),
    watchlist: unwrap(watchlist as never),
    // only when Letterboxd is connected
    ...(lbAccount.data ? { letterboxd: { ...lbAccount.data, diary: lbLogs.data ?? [] } } : {}),
  }
}

/** Removes the account and everything tied to it (the delete-account function does the removing). */
export async function deleteAccount() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('signed out')
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` },
    body: '{}',
  })
  if (!res.ok) throw new Error(`delete ${res.status}`)
}

/** Forget the session on this device (the account behind it is gone). */
export const forgetSession = () => supabase.auth.signOut({ scope: 'local' }).catch(() => {})
