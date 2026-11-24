// Every address in the app, read in one place. `routeOf` is the only code that takes a path apart and `paths`
// the only code that puts one together; the screen a route shows is in App (`renderRoute`), what it loads in
// pages.ts (`pageOf`), and whether the tab bar shows here (`tabBarShown`). A new page is a new route here.
import type { Kind, SectionId } from './browse'

export type Tab = 'now' | 'browse' | 'watchlist' | 'search'
export type SettingsPage = 'services' | 'letterboxd' | 'region' | 'version' | 'credits' | 'privacy' | 'delete' | 'invites'
const SETTINGS: SettingsPage[] = ['services', 'letterboxd', 'region', 'version', 'credits', 'privacy', 'delete', 'invites']

export type Route =
  | { name: 'tab'; tab: Tab }
  | { name: 'title'; id: number }
  | { name: 'person'; id: number }
  | { name: 'browse-section'; section: SectionId; kind?: Kind }
  | { name: 'browse-category'; id: string; kind?: Kind }
  | { name: 'browse-grid'; id: string; row: string; kind?: Kind }
  | { name: 'settings'; page?: SettingsPage }
  | { name: 'privacy' } | { name: 'terms' } | { name: 'onboarding' } | { name: 'dev' }
  | { name: 'invite'; token: string }
  /** an address Reelay doesn't have (shown as a title that isn't available) */
  | { name: 'unknown' }

export const TAB_PATH: Record<Tab, string> = { now: '/', browse: '/browse', watchlist: '/watchlist', search: '/search' }
const kindOf = (s: string | undefined): Kind | undefined => (s === 'film' || s === 'series' ? s : undefined)
const kindPart = (k: Kind | 'all' | undefined) => (k === 'film' || k === 'series' ? `/${k}` : '')

export function routeOf(path: string): Route {
  const [, a, b, c, d, e] = path.split(/[?#]/)[0].replace(/\/$/, '').split('/')
  const tab = (Object.keys(TAB_PATH) as Tab[]).find((t) => TAB_PATH[t] === (path.split(/[?#]/)[0].replace(/(.)\/$/, '$1') || '/'))
  if (tab) return { name: 'tab', tab }
  if (a === 'title' && /^\d+$/.test(b ?? '')) return { name: 'title', id: Number(b) }
  if (a === 'person' && /^\d+$/.test(b ?? '')) return { name: 'person', id: Number(b) }
  if (a === 'browse') {
    if (b === 'all' && c) return { name: 'browse-section', section: c as SectionId, kind: kindOf(d) }
    if (b === 'c' && c) return { name: 'browse-category', id: c, kind: kindOf(d) }
    if (b === 'g' && c && d) return { name: 'browse-grid', id: c, row: d, kind: kindOf(e) }
  }
  if (a === 'settings') {
    if (!b) return { name: 'settings' }
    if (SETTINGS.includes(b as SettingsPage) && !c) return { name: 'settings', page: b as SettingsPage }
  }
  if (a === 'privacy' && !b) return { name: 'privacy' }
  if (a === 'terms' && !b) return { name: 'terms' }
  if (a === 'onboarding' && !b) return { name: 'onboarding' }
  if (a === 'dev' && !b) return { name: 'dev' }
  if (a === 'i' && b) return { name: 'invite', token: b }
  return { name: 'unknown' }
}

/** Addresses, built (the only place they are). */
export const paths = {
  tab: (t: Tab) => TAB_PATH[t],
  title: (id: number) => `/title/${id}`,
  person: (id: number) => `/person/${id}`,
  section: (section: SectionId, kind?: Kind | 'all') => `/browse/all/${section}${kindPart(kind)}`,
  category: (id: string, kind?: Kind | 'all') => `/browse/c/${id}${kindPart(kind)}`,
  grid: (id: string, row: string, kind?: Kind | 'all') => `/browse/g/${id}/${row}${kindPart(kind)}`,
  settings: (page?: SettingsPage) => (page ? `/settings/${page}` : '/settings'),
  privacy: '/privacy', terms: '/terms', onboarding: '/onboarding',
} as const

/** The tab bar shows on the tabs and the pages opened from them; Settings, Search and the legal pages have their own bars. */
export function tabBarShown(r: Route): boolean {
  if (r.name === 'tab') return r.tab !== 'search'
  return !['settings', 'privacy', 'terms', 'onboarding'].includes(r.name)
}

/** The invite link the app was opened with (/i/<token>), read once as the app starts, so nothing that changes the
 *  address later (nav.tsx puts a signed-in member on their tab) can lose it before the lazily loaded Start reads it. */
export const INVITE_TOKEN: string = (() => {
  if (typeof location === 'undefined') return ''
  const r = routeOf(location.pathname)
  return r.name === 'invite' ? r.token : ''
})()
