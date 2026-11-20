import { useEffect, useRef, useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth'
import { NavProvider, TabStack, useNav, type Tab } from './lib/nav'
import { SavedProvider } from './lib/saved'
import { setRunway } from './lib/runway'
import Dev from './screens/Dev'
import Invites from './screens/Invites'
import Now from './screens/Now'
import Search from './screens/Search'
import Settings from './screens/Settings'
import Soon from './screens/Soon'
import Start from './screens/Start'
import Title from './screens/Title'
import Watchlist from './screens/Watchlist'
import { OfflinePill, TabBar, ToastProvider } from './ui'

function renderPage(path: string) {
  const title = path.match(/^\/title\/(\d+)$/)
  if (title) return <Title id={Number(title[1])} />
  if (path === '/settings') return <Settings />
  if (path === '/settings/invites') return <Invites />
  if (path === '/dev') return <Dev />
  return <Title id={NaN} />
}

const ROOT: Record<Tab, React.ReactNode> = {
  now: <Now />, browse: <Soon name="Browse" />, watchlist: <Watchlist />, search: <Search />,
}

function Shell() {
  const { path } = useNav()
  // Safari: run the app behind the status bar and address bar while signed in (Start stays as it is)
  useEffect(() => { setRunway(true); return () => setRunway(false) }, [])
  return (
    <SavedProvider>
      {(Object.keys(ROOT) as Tab[]).map((tab) => <TabStack key={tab} tab={tab} root={ROOT[tab]} render={renderPage} />)}
      <OfflinePill />
      {/* Search has its own bar at the bottom: the field and a close button */}
      <TabBar hidden={path.startsWith('/settings') || path === '/search'} />
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
  if (!session || (sawSignedOut.current && !entering)) {
    return <Start onSignedIn={() => { history.replaceState(null, '', '/'); setEntering(true) }} />
  }
  return <NavProvider><Shell /></NavProvider>
}

export default function App() {
  return <AuthProvider><ToastProvider><Gate /></ToastProvider></AuthProvider>
}
