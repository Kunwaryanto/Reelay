import { useEffect, useRef, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { NavProvider, TabStack, useNav } from './lib/nav'
import { routeOf, tabBarShown, type Route, type Tab } from './lib/routes'
import { SavedProvider } from './lib/saved'
import { useWatchedSync } from './lib/letterboxd'
import { setRunway } from './lib/runway'
import Dev from './screens/Dev'
import Browse, { BrowseCategory, BrowseGrid, BrowseSection } from './screens/Browse'
import Desktop, { isDesktop } from './screens/Desktop'
import { useProfile } from './lib/profile'
import { noteOpenedFrom, registerDevice } from './lib/push'
import Invites from './screens/Invites'
import Now, { HoldMenu } from './screens/Now'
import Onboarding from './screens/Onboarding'
import Person from './screens/Person'
import Search from './screens/Search'
import { PrivacyPolicy, Terms } from './screens/Legal'
import Settings, { settingsPage } from './screens/Settings'
import Start from './screens/Start'
import Title from './screens/Title'
import Watchlist from './screens/Watchlist'
import { watchForStaleResume } from './lib/update'
import { checkStamp } from './lib/stamp'
import { useLaunched } from './lib/launch'
import { HoldProvider, OfflinePill, TabBar, ToastProvider } from './ui'

/** The screen for each route (see lib/routes): a new route that TypeScript doesn't see here fails to build. */
function renderRoute(r: Route): React.ReactNode {
  switch (r.name) {
    case 'title': return <Title id={r.id} />
    case 'person': return <Person id={r.id} />
    case 'browse-section': return <BrowseSection section={r.section} kind={r.kind} />
    case 'browse-category': return <BrowseCategory id={r.id} kind={r.kind} />
    case 'browse-grid': return <BrowseGrid id={r.id} row={r.row} kind={r.kind} />
    case 'settings': return r.page === 'invites' ? <Invites /> : r.page ? settingsPage(r.page) : <Settings />
    case 'privacy': return <PrivacyPolicy />
    case 'terms': return <Terms />
    case 'onboarding': return <main className="page" />
    case 'dev': return <Dev />
    case 'tab': case 'invite': case 'unknown': return <Title id={NaN} />
  }
}
const renderPage = (path: string) => renderRoute(routeOf(path))

const ROOT: Record<Tab, React.ReactNode> = {
  now: <Now />, browse: <Browse />, watchlist: <Watchlist />, search: <Search />,
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
  if (replay) return <Onboarding replay onLeave={home} onDone={() => setReplay(false)} />
  if (!profile || profile.onboarded_at || done) return null
  return <Onboarding onDone={() => setDone(true)} />
}


function Shell() {
  const { path, push, setTab } = useNav()
  // at launch the tab bar waits for Now, then arrives last: its fade eases in and the icons rise
  const launched = useLaunched()
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
  if (session === undefined) return null // black, like the launch screen
  if (session === null) sawSignedOut.current = true
  if (location.pathname === '/dev' && !session) return <NavProvider><div className="pane solo"><Dev /></div></NavProvider>
  // the policy and terms can be read without an account
  if (!session && location.pathname === '/privacy') return <div className="pane solo"><PrivacyPolicy signedIn={false} /></div>
  if (!session && location.pathname === '/terms') return <div className="pane solo"><Terms signedIn={false} /></div>
  if (!session || (sawSignedOut.current && !entering)) {
    return <Start onSignedIn={() => { history.replaceState(null, '', '/'); setEntering(true) }} />
  }
  return <NavProvider><Shell /></NavProvider>
}

export default function App() {
  // a computer gets one page, whatever the address
  if (isDesktop()) return <Desktop />
  return <AuthProvider><ToastProvider><Gate /></ToastProvider></AuthProvider>
}
