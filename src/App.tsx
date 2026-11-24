import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { NavProvider, TabStack, useNav } from './lib/nav'
import { routeOf, tabBarShown, type Route, type Tab } from './lib/routes'
import { SavedProvider } from './lib/saved'
import { useWatchedSync } from './lib/letterboxd'
import { setRunway } from './lib/runway'
import Browse, { BrowseCategory, BrowseGrid, BrowseSection } from './screens/Browse'
import { isDesktop } from './lib/desktop'
import { useProfile } from './lib/profile'
import { noteOpenedFrom, registerDevice } from './lib/push'
import Now, { HoldMenu } from './screens/Now'
import Title from './screens/Title'
import Watchlist from './screens/Watchlist'
import { watchForStaleResume } from './lib/update'
import { checkStamp } from './lib/stamp'
import { endBoot } from './lib/boot'
import { useLaunched } from './lib/launch'
import { HoldProvider, OfflinePill, TabBar, ToastProvider } from './ui'

// Screens Home doesn't need at launch load as their own files, so the app starts sooner: they are asked for as soon
// as the app has started (the tabs mount at once) or when first opened, and show nothing until they are in.
const Dev = lazy(() => import('./screens/Dev'))
const Desktop = lazy(() => import('./screens/Desktop'))
const Invites = lazy(() => import('./screens/Invites'))
const Onboarding = lazy(() => import('./screens/Onboarding'))
const Person = lazy(() => import('./screens/Person'))
const Search = lazy(() => import('./screens/Search'))
const Start = lazy(() => import('./screens/Start'))
const Settings = lazy(() => import('./screens/Settings'))
const SettingsPage = lazy(() => import('./screens/Settings').then((m) => ({ default: ({ page }: { page: Parameters<typeof m.settingsPage>[0] }) => m.settingsPage(page) })))
const PrivacyPolicy = lazy(() => import('./screens/Legal').then((m) => ({ default: m.PrivacyPolicy })))
const Terms = lazy(() => import('./screens/Legal').then((m) => ({ default: m.Terms })))
const Later = ({ children }: { children: ReactNode }) => <Suspense fallback={null}>{children}</Suspense>

/** The screen for each route (see lib/routes): a new route that TypeScript doesn't see here fails to build. */
function renderRoute(r: Route): React.ReactNode {
  switch (r.name) {
    case 'title': return <Title id={r.id} />
    case 'person': return <Person id={r.id} />
    case 'browse-section': return <BrowseSection section={r.section} kind={r.kind} />
    case 'browse-category': return <BrowseCategory id={r.id} kind={r.kind} />
    case 'browse-grid': return <BrowseGrid id={r.id} row={r.row} kind={r.kind} />
    case 'settings': return r.page === 'invites' ? <Invites /> : r.page ? <SettingsPage page={r.page} /> : <Settings />
    case 'privacy': return <PrivacyPolicy />
    case 'terms': return <Terms />
    case 'onboarding': return <main className="page" />
    case 'dev': return <Dev />
    case 'tab': case 'invite': case 'unknown': return <Title id={NaN} />
  }
}
const renderPage = (path: string) => <Later>{renderRoute(routeOf(path))}</Later>

const ROOT: Record<Tab, React.ReactNode> = {
  now: <Now />, browse: <Browse />, watchlist: <Watchlist />, search: <Later><Search /></Later>,
}

/** First run, once the profile says onboarding hasn't happened. Also at /onboarding (Settings › Testing). */
function FirstRun() {
  const { profile } = useProfile()
  const { path, home } = useNav()
  const { isAdmin } = useAuth()
  const [done, setDone] = useState(false)
  // The test run ends like the real one: it leaves for Now (the pages under it are dropped as it starts to leave)
  // and stays up until its hand-off has finished.
  const [replay, setReplay] = useState(false)
  // admins only (Settings › Testing): for anyone else the address shows nothing
  if (path === '/onboarding' && isAdmin && !replay) setReplay(true)
  if (replay) return <Later><Onboarding replay onLeave={home} onDone={() => setReplay(false)} /></Later>
  if (!profile || profile.onboarded_at || done) return null
  return <Later><Onboarding onDone={() => setDone(true)} /></Later>
}


function Shell() {
  const { path, push, setTab } = useNav()
  // at launch the tab bar waits for Now, then arrives last: its fade eases in and the icons rise
  const launched = useLaunched()
  useEffect(() => { if (launched) endBoot() }, [launched])
  useWatchedSync()
  const [arriving, setArriving] = useState(!launched)
  useEffect(() => { if (!launched) return; const t = setTimeout(() => setArriving(false), 1100); return () => clearTimeout(t) }, [launched])
  // keep this device's notification address fresh, and open what a tapped notification points at
  useEffect(() => {
    registerDevice()
    const onMessage = (e: MessageEvent) => {
      const url = (e.data as { open?: string } | null)?.open
      if (!url) return
      const to = noteOpenedFrom(url)
      const r = routeOf(to)
      if (r.name === 'tab') setTab(r.tab); else push(to)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [push, setTab])
  // has the catalogue changed? (on opening, and back after five minutes away): saved catalogue content waits for this
  useEffect(() => {
    void checkStamp()
    let away = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') { away = Date.now(); return }
      if (away && Date.now() - away > 5 * 60 * 1000) void checkStamp()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  // back after an hour or more with a newer version out: open it
  useEffect(() => watchForStaleResume(), [])
  // Safari: run the app behind the status bar and address bar while signed in (Start stays as it is)
  useEffect(() => { setRunway(true); return () => setRunway(false) }, [])
  return (
    <SavedProvider>
     <HoldProvider menu={(held, close) => <HoldMenu held={held} onClose={close} />}>
      {(Object.keys(ROOT) as Tab[]).map((tab) => <TabStack key={tab} tab={tab} root={ROOT[tab]} render={renderPage} />)}
      <FirstRun />
      <OfflinePill />
      {/* Search has its own bar at the bottom: the field and a close button */}
      <TabBar arriving={arriving} hidden={!launched || !tabBarShown(routeOf(path))} />
     </HoldProvider>
    </SavedProvider>
  )
}

function Gate() {
  const { session } = useAuth()
  // Start stays up after the code is accepted, until "Continue" is tapped.
  const [entering, setEntering] = useState(false)
  const sawSignedOut = useRef(false)
  useEffect(() => { if (session === null) setEntering(false) }, [session])
  // signed out (Start has its own entrance), or the address isn't Home: the start-up wordmark leaves at once
  useEffect(() => { if (session === null) endBoot() }, [session])
  if (session === undefined) return null // black, like the launch screen
  if (session === null) sawSignedOut.current = true
  if (location.pathname === '/dev' && !session) return <NavProvider><div className="pane solo"><Later><Dev /></Later></div></NavProvider>
  // the policy and terms can be read without an account
  if (!session && location.pathname === '/privacy') return <div className="pane solo"><Later><PrivacyPolicy signedIn={false} /></Later></div>
  if (!session && location.pathname === '/terms') return <div className="pane solo"><Later><Terms signedIn={false} /></Later></div>
  if (!session || (sawSignedOut.current && !entering)) {
    return <Later><Start onSignedIn={() => { history.replaceState(null, '', '/'); setEntering(true) }} /></Later>
  }
  return <NavProvider><Shell /></NavProvider>
}

export default function App() {
  // a computer gets one page, whatever the address
  if (isDesktop()) { endBoot(); return <Later><Desktop /></Later> }
  return <AuthProvider><ToastProvider><Gate /></ToastProvider></AuthProvider>
}
