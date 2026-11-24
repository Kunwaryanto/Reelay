// Error reports: when something fails on a member's phone (a screen that can't draw, code that throws), the app
// sends what went wrong, the screen, the build and the device to `client_errors`. Signed in only; the same error
// once per session, and at most 10 a session, so a loop can't flood it. Kept 30 days (see the privacy policy).
import { supabase } from './supabase'
import { BUILD } from './update'

const sent = new Set<string>()
let count = 0
const clip = (s: string | undefined | null, n: number) => (s ? s.slice(0, n) : null)

export async function reportError(kind: 'render' | 'error' | 'promise', err: unknown, stack?: string) {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === 'string' ? err : JSON.stringify(err) ?? String(err))
    const message = clip(e.message || String(err), 500) ?? 'unknown'
    // noise that isn't the app's: a browser extension, a cancelled request, a script from another site
    if (/ResizeObserver loop|AbortError|Load failed|NetworkError|Failed to fetch|^Script error\.?$/i.test(message)) return
    if (sent.has(message) || count >= 10) return
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    sent.add(message)
    count++
    await supabase.from('client_errors').insert({
      kind, message, build: BUILD, path: clip(location.pathname, 200),
      stack: clip(stack ?? e.stack, 4000), device: clip(navigator.userAgent, 300),
    })
  } catch { /* reporting never fails the app */ }
}

/** Errors no screen caught: reported. Installed once, at start. */
// A new version was deployed while the app was open: the screens it loads only when they're opened (lazy) are
// gone under their old names, and loading one fails. That isn't a bug to show: reload into the new version, once a
// minute at most (offline, the reload would fail the same way).
const STALE = /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS/i
export const isStaleBuild = (err: unknown) => STALE.test(String((err as Error)?.message ?? err))
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem('reelay-stale-reload') || 0)
    if (Date.now() - last < 60_000) return false
    sessionStorage.setItem('reelay-stale-reload', String(Date.now()))
  } catch { /* storage unavailable: reload anyway */ }
  location.reload()
  return true
}

export function watchErrors() {
  // Vite's own signal that a lazy screen's files couldn't be loaded
  window.addEventListener('vite:preloadError', (e) => { if (reloadForNewVersion()) e.preventDefault() })
  window.addEventListener('error', (e) => { if (e.error || e.message) void reportError('error', e.error ?? e.message) })
  window.addEventListener('unhandledrejection', (e) => { if (isStaleBuild(e.reason) && reloadForNewVersion()) return; void reportError('promise', e.reason) })
}
