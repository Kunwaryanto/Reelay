// Notifications on this device: whether they're allowed, asking for it, and telling the server where to send them.
// On iPhone they only exist in the Home Screen app, so Safari reports 'unsupported'.
import { supabase } from './supabase'

export type Permission = 'unsupported' | 'default' | 'granted' | 'denied'

export const permission = (): Permission => ('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
  ? Notification.permission : 'unsupported')

/** Shows the system's "Would Like to Send You Notifications" question. Call it from a tap. */
export async function askPermission(): Promise<Permission> {
  if (permission() === 'unsupported') return 'unsupported'
  let answer: Permission
  try { answer = await Notification.requestPermission() } catch { answer = permission() }
  if (answer === 'granted') registerDevice()
  return answer
}

/** The service worker: offline, and what shows the notifications. Registered once the page has loaded. */
export function startServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return
  const go = () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) }
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true })
}

// The server signs what it sends with the private half of this key (VAPID). It is public by design.
const KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const bytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
const text = (buf: ArrayBuffer | null) => (buf ? btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : '')

/**
 * Give the server this device's notification address (or refresh it). Does nothing unless notifications are
 * allowed, someone is signed in and the site has its key. Safe to call on every launch.
 */
export async function registerDevice(): Promise<boolean> {
  try {
    if (permission() !== 'granted' || !KEY) return false
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return false
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(KEY) })
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: session.user.id, endpoint: sub.endpoint, p256dh: text(sub.getKey('p256dh')), auth: text(sub.getKey('auth')) },
      { onConflict: 'endpoint' },
    )
    return !error
  } catch { return false }
}

/** Signing out: this device stops getting the account's notifications. */
export async function forgetDevice() {
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  } catch { /* nothing to forget */ }
}

/** Which kind of notification opened the app, if one did: the title page marks the matching row once. */
let opened: { path: string; kind: string } | null = null
export function noteOpenedFrom(url: string) {
  const u = new URL(url, location.origin)
  const kind = u.searchParams.get('n')
  if (kind) opened = { path: u.pathname, kind }
  return u.pathname
}
export function takeOpenedFrom(path: string): string | null {
  if (opened?.path !== path) return null
  const { kind } = opened
  opened = null
  return kind
}
