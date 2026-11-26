// Opening the app: nothing of the signed-in app shows before Now is ready to (or has given up waiting), so the
// tab bar and the Settings cog never sit on screen ahead of the wordmark. Now says when; the tab bar listens.
import { useSyncExternalStore } from 'react'
import { endBoot } from './boot'

// Opened somewhere other than Now (a notification, a link): there is no launch to wait for.
let launched = location.pathname !== '/'
const watchers = new Set<() => void>()

/** Now is on screen (or failed, or showing its placeholders): the rest of the app may show. */
export function markLaunched() {
  endBoot()
  if (launched) return
  launched = true
  watchers.forEach((w) => w())
}
// Whatever happens to Now, the app is never left without its tab bar: 9 s after (Home's placeholders come at 8) the signed-in app starts (its first
// listener). Not from the page load: after a sign-in that took longer than that, the tab bar showed on black
// before Home and its wordmark.
let fallback = 0
export const useLaunched = () => useSyncExternalStore((w) => {
  watchers.add(w)
  if (!fallback && !launched) fallback = window.setTimeout(markLaunched, 9000)
  return () => watchers.delete(w)
}, () => launched)

/** Resolves once the icon font can draw (at once after the first visit), so icons never pop in one by one. */
export const iconsReady: Promise<unknown> = Promise.race([
  document.fonts?.load('24px "Material Symbols Outlined"', 'home') ?? Promise.resolve(),
  new Promise((r) => setTimeout(r, 1500)),
]).catch(() => {})
