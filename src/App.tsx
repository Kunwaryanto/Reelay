import { useEffect, useRef, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { NavProvider, TabStack, useNav, type Tab } from './lib/nav'
import { SavedProvider } from './lib/saved'
import { setRunway } from './lib/runway'
import Dev from './screens/Dev'
import Browse, { browsePage } from './screens/Browse'
import Desktop, { isDesktop } from './screens/Desktop'
import { useProfile } from './lib/profile'
import { noteOpenedFrom, registerDevice } from './lib/push'
import Invites from './screens/Invites'
import Now from './screens/Now'
import Onboarding from './screens/Onboarding'
import Person from './screens/Person'
import Search from './screens/Search'
import { PrivacyPolicy, Terms } from './screens/Legal'
import Settings, { settingsPage } from './screens/Settings'
import Start from './screens/Start'
import Title from './screens/Title'
import Watchlist from './screens/Watchlist'
import { watchForStaleResume } from './lib/update'
import { useLaunched } from './lib/launch'
import { OfflinePill, TabBar, ToastProvider } from './ui'

function renderPage(path: string) {
  const title = path.match(/^\/title\/(\d+)$/)
  if (title) return <Title id={Number(title[1])} />
  const person = path.match(/^\/person\/(\d+)$/)
  if (person) return <Person id={Number(person[1])} />
  if (path.startsWith('/browse/')) { const page = browsePage(path); if (page) return page }
  if (path === '/settings') return <Settings />
  if (path.startsWith('/settings/')) { const page = settingsPage(path); if (page) return page }
  if (path === '/privacy') return <PrivacyPolicy />
  if (path === '/terms') return <Terms />
  if (path === '/settings/invites') return <Invites />
  if (path === '/onboarding') return <main className="page" />
  if (path === '/dev') return <Dev />
  return <Title id={NaN} />
}

const ROOT: Record<Tab, React.ReactNode> = {
  now: <Now />, browse: <Browse />, watchlist: <Watchlist />, search: <Search />,
}

/** First run, once the profile says onboarding hasn't happened. Also at /onboarding (Settings › Testing). */
function FirstRun() {
  const { profile } = useProfile()
  const { path, home } = useNav()
  const [done, setDone] = useState(false)
  // The test run ends like the real one: it leaves for Now (the pages under it are dropped as it starts to leave)
  // and stays up until its hand-off has finished.
  const [replay, setReplay] = useState(false)
  if (path === '/onboarding' && !replay) setReplay(true)
  if (replay) return <Onboarding replay onLeave={home} onDone={() => setReplay(false)} />
  if (!profile || profile.onboarded_at || done) return null
  return <Onboarding onDone={() => setDone(true)} />
}

const TAB_OF: Record<string, Tab> = { '/': 'now', '/browse': 'browse', '/watchlist': 'watchlist', '/search': 'search' }

function Shell() {
  const { path, push, setTab } = useNav()
  // at launch the tab bar waits for Now, then arrives last: its fade eases in and the icons rise
  const launched = useLaunched()
  const [arriving, setArriving] = useState(!launched)
  useEffect(() => { if (!launched) return; const t = setTimeout(() => setArriving(false), 1100); return () => clearTimeout(t) }, [launched])
  // keep this device's notification address fresh, and open what a tapped notification points at
  useEffect(() => {
    registerDevice()
    const onMessage = (e: MessageEvent) => {
      const url = (e.data as { open?: string } | null)?.open
      if (!url) return
      const to = noteOpenedFrom(url)
      if (TAB_OF[to]) setTab(TAB_OF[to]); else push(to)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [push, setTab])
  // back after an hour or more with a newer version out: open it
  useEffect(() => watchForStaleResume(), [])
  // Safari: run the app behind the status bar and address bar while signed in (Start stays as it is)
  useEffect(() => { setRunway(true); return () => setRunway(false) }, [])
  return (
    <SavedProvider>
      {(Object.keys(ROOT) as Tab[]).map((tab) => <TabStack key={tab} tab={tab} root={ROOT[tab]} render={renderPage} />)}
      <FirstRun />
      <OfflinePill />
      {/* Search has its own bar at the bottom: the field and a close button */}
      <TabBar arriving={arriving} hidden={!launched || path.startsWith('/settings') || path === '/search' || path === '/privacy' || path === '/terms' || path === '/onboarding'} />
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
