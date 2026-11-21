// Updating: a Home Screen web app can't be reloaded by hand, so the app notices a new deploy itself
// (a dot by the Settings cog, an Update card in Settings) and reloads into it when asked.
import { useEffect, useSyncExternalStore } from 'react'
declare const __BUILD__: string
export const BUILD = __BUILD__

/** The app script this page runs: index.html names a new one after every deploy. */
const running = () => document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') ?? ''

/** True when the deployed index.html points at a different app script than the one running. */
export async function newVersionOut(): Promise<boolean> {
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text()
    const src = /<script[^>]+type="module"[^>]+src="([^"]+)"/.exec(html)?.[1]
    return !!src && !!running() && src !== running()
  } catch {
    return false
  }
}

// One answer for the whole app: Now's dot and Settings both read it.
let fresh = false
let checkedAt = 0
const watchers = new Set<() => void>()
/** Ask the server whether a newer version is out. Returns the answer and tells everything showing it. */
export async function checkVersion(): Promise<boolean> {
  checkedAt = Date.now()
  const now = fresh || await newVersionOut()
  if (now !== fresh) { fresh = now; watchers.forEach((w) => w()) }
  return fresh
}
/** True once a newer version is out. Checks when first used and when the app comes back to the front (at most every 10 minutes). */
export function useNewVersion(): boolean {
  useEffect(() => {
    const look = () => { if (document.visibilityState === 'visible' && Date.now() - checkedAt > 10 * 60 * 1000) void checkVersion() }
    look()
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [])
  return useSyncExternalStore((w) => { watchers.add(w); return () => watchers.delete(w) }, () => fresh)
}

/** Fetch everything again. Sign-in and the saved watchlist stay on the phone. */
export async function reloadApp() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((regs ?? []).map((r) => r.unregister()))
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  } catch { /* nothing cached: just reload */ }
  // Start again at Now rather than reloading Settings in place: a fresh address always fetches the new page,
  // and the app comes back in its normal first state (tab bar and all). NavProvider tidies the address.
  location.replace(`/?v=${Date.now()}`)
}

/** Temporary, for testing: the sizes the layout depends on, to read off a screenshot when something sits wrong. */
export function layoutReadout(): string {
  const root = document.getElementById('root')?.getBoundingClientRect()
  const vv = window.visualViewport
  const bar = document.querySelector('.tabbar')?.getBoundingClientRect()
  return [
    `screen ${screen.height}`, `inner ${window.innerHeight}`, `doc ${document.documentElement.clientHeight}`,
    `root ${Math.round(root?.top ?? 0)}–${Math.round(root?.bottom ?? 0)}`,
    `vv ${Math.round(vv?.height ?? 0)}@${Math.round(vv?.offsetTop ?? 0)}`, `scroll ${Math.round(window.scrollY)}`,
    `bar ${Math.round(bar?.top ?? 0)}–${Math.round(bar?.bottom ?? 0)}`,
  ].join(' · ')
}
