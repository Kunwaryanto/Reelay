// Temporary, for testing: a Home Screen web app can't be reloaded by hand, so Settings has a Reload button.
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

/** Fetch everything again. Sign-in and the saved watchlist stay on the phone. */
export async function reloadApp() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations()
    await Promise.all((regs ?? []).map((r) => r.unregister()))
    if ('caches' in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)))
  } catch { /* nothing cached: just reload */ }
  location.reload()
}
