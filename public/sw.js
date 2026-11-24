// Reelay's service worker: lets the app open without a connection, and shows notifications.
//
// - Pages: always from the network when there is one (so a new version shows straight away); the last
//   copy only when the network fails or takes more than 3 seconds.
// - The app's own files (/assets, fonts, icons, the wordmark): kept after first use. Their names change
//   with every build, so a kept copy is never out of date.
// - Pictures from TMDB (posters, backdrops, logos, portraits): kept on the phone after first use, newest 900,
//   so a cold start shows them at once (iOS often empties the ordinary cache of a Home Screen app between
//   opens). A picture's address never changes what it shows, so a kept copy is never out of date.
// - Everything else (the database) is left alone. What Home, title pages and the Watchlist show offline
//   comes from the copies the app saves itself.
const SHELL = 'reelay-shell-v1'
const FILES = 'reelay-files-v1'
const PICTURES = 'reelay-pictures-v1'
const MAX_PICTURES = 900

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL, FILES, PICTURES]
    for (const name of await caches.keys()) if (!keep.includes(name)) await caches.delete(name)
    await self.clients.claim()
  })())
})

async function page(request) {
  const cache = await caches.open(SHELL)
  try {
    const fresh = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 3000)),
    ])
    if (fresh.ok) cache.put('/', fresh.clone())
    return fresh
  } catch {
    return (await cache.match('/')) ?? fetch(request)
  }
}

async function file(request) {
  const cache = await caches.open(FILES)
  const hit = await cache.match(request)
  if (hit) return hit
  const fresh = await fetch(request)
  if (fresh.ok) cache.put(request, fresh.clone())
  return fresh
}

// TMDB allows cross-origin reads, so the picture is fetched with CORS: a readable copy can be kept (an opaque one
// would count many times its size against the phone's storage), and it answers the <img> just the same.
let trimming
async function picture(request) {
  const cache = await caches.open(PICTURES)
  const hit = await cache.match(request.url)
  if (hit) return hit
  let fresh
  try { fresh = await fetch(request.url, { mode: 'cors', credentials: 'omit' }) } catch { return fetch(request) }
  if (fresh.ok) {
    await cache.put(request.url, fresh.clone())
    // the oldest go once there are too many (a moment later, once for a burst of new pictures)
    clearTimeout(trimming)
    trimming = setTimeout(async () => {
      const keys = await cache.keys()
      for (const k of keys.slice(0, Math.max(0, keys.length - MAX_PICTURES))) await cache.delete(k)
    }, 5000)
  }
  return fresh
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.hostname === 'image.tmdb.org') { event.respondWith(picture(request)); return }
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') { event.respondWith(page(request)); return }
  if (/^\/(assets|fonts|icons|brand)\//.test(url.pathname)) event.respondWith(file(request))
})

// ---- Notifications --------------------------------------------------------------
// The sync sends { title, body, url, tag }. Tapping one opens that page in the app.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* not ours */ }
  if (!data.title) return
  event.waitUntil(self.registration.showNotification(data.title, {
    body: data.body ?? '',
    tag: data.tag,
    icon: '/icons/icon-192.png',
    data: { url: data.url ?? '/' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const app = open.find((c) => new URL(c.url).origin === self.location.origin)
    if (app) { app.postMessage({ open: url }); return app.focus() }
    return self.clients.openWindow(url)
  })())
})
