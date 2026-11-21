// Settings and its pages: Your services, Region, Credits, Privacy, Delete account. (Invite friends has its own file.)
import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { inviteState, loadInvites, type Invite } from '../lib/catalogue'
import { useNavActions } from '../lib/nav'
import { deleteAccount, exportMyData, forgetSession, loadServices, servicesLabel, useMyServices, useProfile, type NotifyKey, type Service } from '../lib/profile'
import { askPermission, permission, type Permission } from '../lib/push'
import { clearSavedData, lastLoadError, useQuery } from '../lib/query'
import { BUILD, checkVersion, layoutReadout, reloadApp, useNewVersion } from '../lib/update'
import { BackButton, Button, Icon, SmallButton, Spinner, useToast } from '../ui'

const DAY = 24 * 60 * 60 * 1000
const chevron = <Icon name="chevron_right" size={16} style={{ color: 'var(--text-faint)', marginLeft: -10 }} />

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="page page-plain noscroll">
      <div className="page-bar"><BackButton /></div>
      <h1 className="page-title">{title}</h1>
      {children}
    </main>
  )
}

function Link({ label, note, to, danger }: { label: string; note?: string; to: string; danger?: boolean }) {
  const { push } = useNavActions()
  return (
    <li><button type="button" onClick={() => push(to)}>
      <span className="row-text"><b className={danger ? 'err' : undefined}>{label}</b></span>
      {note && <span className="row-note">{note}</span>}
      {chevron}
    </button></li>
  )
}

const NOTIFY: [NotifyKey, string][] = [['notify_leaving', 'Leaving soon'], ['notify_arrivals', 'Arriving on your services'], ['notify_new_seasons', 'New seasons']]

function Notifications() {
  const { profile, update } = useProfile()
  const toast = useToast()
  const [perm, setPerm] = useState<Permission>(permission)
  const off = perm === 'denied' || perm === 'unsupported'

  const flip = async (key: NotifyKey) => {
    if (off || !profile) return
    try {
      if (perm === 'default') {
        // the first switch asks iOS; whatever was tapped ends up on if the answer is Allow
        const answer = await askPermission()
        setPerm(answer)
        if (answer === 'granted' && !profile[key]) await update({ [key]: true })
        return
      }
      await update({ [key]: !profile[key] })
    } catch {
      toast({ text: navigator.onLine ? 'Couldn’t save that. Try again.' : 'You’re offline. Connect to change this.' })
    }
  }

  return (
    <section className="settings-block">
      <h2 className="block-title">Notifications</h2>
      {off && (
        <div className="set-card">
          <span className="row-text">
            <b>{perm === 'denied' ? 'Notifications are off' : 'Notifications need the Home Screen app'}</b>
            <small>{perm === 'denied' ? 'Turn them on for Reelay in iOS Settings.' : 'Add Reelay to your Home Screen and open it from there.'}</small>
          </span>
        </div>
      )}
      <ul className="rows" data-off={off}>
        {NOTIFY.map(([key, label]) => {
          const on = perm === 'granted' && !!profile?.[key]
          return (
            <li key={key}><button type="button" role="switch" className="set-switch" aria-checked={on} aria-disabled={off} onClick={() => flip(key)}>
              <span className="row-text"><b>{label}</b></span><i aria-hidden="true" />
            </button></li>
          )
        })}
      </ul>
    </section>
  )
}

export default function Settings() {
  const { email, signOut, isAdmin, session } = useAuth()
  const { push } = useNavActions()
  const { mine } = useMyServices()
  const services = useQuery<Service[]>('services', loadServices, { maxAge: DAY })
  const invites = useQuery<Invite[]>(isAdmin && session ? `invites:${session.user.id}` : null, loadInvites, { persist: false, maxAge: 0 })
  const waiting = (invites.data ?? []).filter((i) => inviteState(i) === 'waiting').length
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const fresh = useNewVersion()
  const [reloading, setReloading] = useState(false)
  const [check, setCheck] = useState<'idle' | 'busy' | 'none'>('idle')
  const look = async () => {
    if (fresh || check === 'busy') return
    setCheck('busy')
    const [found] = await Promise.all([checkVersion(), new Promise((r) => setTimeout(r, 600))])
    setCheck(found ? 'idle' : 'none')
  }
  const [readout, setReadout] = useState('')
  useEffect(() => { const t = setTimeout(() => setReadout(layoutReadout()), 600); return () => clearTimeout(t) }, [])
  const names = (services.data ?? []).filter((s) => mine.includes(s.id)).map((s) => s.name)

  const out = async () => {
    if (!navigator.onLine) { setAsking(false); setError('Connect to sign out'); return }
    try { await signOut(); clearSavedData() } catch { setAsking(false); setError('Couldn’t sign out. Try again.') }
  }

  return (
    <Page title="Settings">
      {fresh && (
        <section className="update-card" aria-label="Update">
          <span className="row-text"><b>A new version is ready</b><small>Takes a few seconds. You stay signed in.</small></span>
          <SmallButton solid busy={reloading} disabled={reloading} onClick={() => { setReloading(true); void reloadApp() }}>{reloading ? '' : 'Update'}</SmallButton>
        </section>
      )}
      <section className="settings-block set-first">
        <ul className="rows">
          <Link label="Your services" note={services.data ? servicesLabel(names) : ''} to="/settings/services" />
          {isAdmin && <Link label="Invite friends" note={waiting > 0 ? `${waiting} waiting` : ''} to="/settings/invites" />}
        </ul>
      </section>
      <Notifications />
      <section className="settings-block">
        <h2 className="block-title">Account</h2>
        <ul className="rows">
          <li className="row-plain"><span className="row-text"><b>Signed in with email</b><small>{email}</small></span></li>
          <li><button type="button" onClick={() => { setError(''); setAsking(true) }}><span className="row-text"><b>Sign out</b>{error && <small className="err">{error}</small>}</span></button></li>
          <Link label="Delete account" to="/settings/delete" danger />
        </ul>
      </section>
      <section className="settings-block">
        <h2 className="block-title">About</h2>
        <ul className="rows">
          <Link label="Region" note="Sweden" to="/settings/region" />
          <Link label="Credits" to="/settings/credits" />
          <Link label="Privacy" to="/settings/privacy" />
          <li><button type="button" onClick={look} aria-live="polite">
            <span className="row-text"><b>Version</b><small>{BUILD}</small></span>
            <span className="row-note">{check === 'busy' ? <Spinner light label="Checking" /> : fresh ? 'Update ready' : check === 'none' ? 'Up to date' : 'Check for update'}</span>
          </button></li>
        </ul>
      </section>
      {/* Temporary while testing */}
      <section className="settings-block">
        <h2 className="block-title">Testing</h2>
        <ul className="rows">
          <li><button type="button" onClick={() => push('/onboarding')}><span className="row-text"><b>Show onboarding again</b></span></button></li>
          <li><button type="button" onClick={() => push('/settings/app-links')}><span className="row-text"><b>App links</b></span></button></li>
        </ul>
        <p className="version">{readout}</p>
        {lastLoadError() && <p className="version">Last failed load: {lastLoadError()}</p>}
      </section>

      {asking && (
        <div className="action-sheet" role="alertdialog" aria-label="Sign out">
          <div className="action-back" onClick={() => setAsking(false)} />
          <div className="action-body">
            <div className="action-group">
              <p>Sign out of Reelay? Your watchlist stays saved to your account.</p>
              <button type="button" className="danger" onClick={out}>Sign Out</button>
            </div>
            <button type="button" className="action-cancel" onClick={() => setAsking(false)}>Cancel</button>
          </div>
        </div>
      )}
    </Page>
  )
}

/** The list of services with a check on the ones you have. Used here and in onboarding. */
export function ServiceList() {
  const { mine, set } = useMyServices()
  const toast = useToast()
  const services = useQuery<Service[]>('services', loadServices, { maxAge: DAY })
  const toggle = (s: Service) => set(s.id, !mine.includes(s.id)).catch(() =>
    toast({ text: navigator.onLine ? 'Couldn’t save that. Try again.' : 'You’re offline. Connect to change this.' }))
  const group = (title: string, list: Service[]) => list.length > 0 && (
    <>
      <h2 className="block-title set-group">{title}</h2>
      <ul className="rows" role="group" aria-label={title}>
        {list.map((s) => (
          <li key={s.id}><button type="button" role="checkbox" aria-checked={mine.includes(s.id)} onClick={() => toggle(s)}>
            <span className="row-text"><b>{s.name}</b>{s.kind === 'free' && <small>Free</small>}</span>
            <Icon name="check" size={20} style={{ opacity: mine.includes(s.id) ? 1 : 0, transition: 'opacity 160ms var(--ease-out)' }} />
          </button></li>
        ))}
      </ul>
    </>
  )
  const all = services.data ?? []
  return <>{group('Popular', all.filter((s) => s.popular))}{group('More services', all.filter((s) => !s.popular))}</>
}

function Services() {
  return (
    <Page title="Your services">
      <p className="sheet-text">Reelay shows what’s on these first.</p>
      <div className="settings-block set-list"><ServiceList /></div>
    </Page>
  )
}

function Region() {
  return (
    <Page title="Region">
      <ul className="rows set-solo"><li className="row-plain"><span className="row-text"><b>Sweden</b></span><Icon name="check" size={20} /></li></ul>
      <p className="set-foot">Reelay shows what streams in Sweden. More countries may come later.</p>
    </Page>
  )
}

const CREDITS: [string, [string, string][]][] = [
  ['Data', [['TMDB', 'Titles, posters and cast'], ['JustWatch', 'Where to watch'], ['Streaming Availability', 'Leaving dates'], ['IMDb', 'IMDb rating'], ['MDBList', 'Rotten Tomatoes and Letterboxd scores'], ['Wikidata', 'Awards']]],
  ['Design', [['Inter', 'Typeface by Rasmus Andersson · SIL Open Font License'], ['Material Symbols', 'Icons by Google · Apache License 2.0']]],
]
// Testing: which kind of link opens the service's app from the Home Screen app. Two known titles, each linked
// several ways; tap each and note what opens.
const APP_LINKS: [string, [string, string, boolean][]][] = [
  ['Netflix · the title from your share link (70285785)', [
    ['https link, new window (as Open in does today)', 'https://www.netflix.com/title/70285785', true],
    ['https link, same window', 'https://www.netflix.com/title/70285785', false],
    ['https link with /se/', 'https://www.netflix.com/se/title/70285785', true],
    ['App scheme nflx://', 'nflx://www.netflix.com/title/70285785', false],
    ['Search (today’s fallback)', 'https://www.netflix.com/search?q=Lupin', true],
  ]],
  ['HBO Max · The End of Oak Street', [
    ['https link, new window (as Open in does today)', 'https://play.hbomax.com/movie/710798da-f811-40be-9ed9-3a7443e36278', true],
    ['https link, same window', 'https://play.hbomax.com/movie/710798da-f811-40be-9ed9-3a7443e36278', false],
    ['The share link as copied', 'https://play.hbomax.com/movie/710798da-f811-40be-9ed9-3a7443e36278?utm_medium=sharebutton&utm_id=A803F9B7-7703-479C-B9FF-978FF03A9E5E', true],
    ['Search (today’s fallback)', 'https://play.hbomax.com/search?q=The%20End%20of%20Oak%20Street', true],
  ]],
]

function AppLinks() {
  return (
    <Page title="App links">
      <div className="set-small"><p>Tap each link and note whether it opens the app on the title, the app’s start, Safari, or nothing. Try with the app installed and signed in.</p></div>
      {APP_LINKS.map(([title, rows]) => (
        <section key={title} className="settings-block set-list">
          <h2 className="block-title">{title}</h2>
          <ul className="rows">{rows.map(([label, href, blank], i) => (
            <li key={i}><a href={href} {...(blank ? { target: '_blank', rel: 'noreferrer' } : {})}><span className="row-text"><b>{label}</b><small>{href.replace(/^https:\/\//, '').slice(0, 60)}</small></span></a></li>
          ))}</ul>
        </section>
      ))}
    </Page>
  )
}

function Credits() {
  return (
    <Page title="Credits">
      {CREDITS.map(([title, rows]) => (
        <section key={title} className="settings-block set-list">
          <h2 className="block-title">{title}</h2>
          <ul className="rows">{rows.map(([name, what]) => <li key={name} className="row-plain"><span className="row-text"><b>{name}</b><small>{what}</small></span></li>)}</ul>
        </section>
      ))}
      <div className="set-small">
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <p>Streaming data by JustWatch.</p>
        <p>Information courtesy of IMDb (imdb.com). Used with permission.</p>
        <p>Rotten Tomatoes, Letterboxd, IMDb and the streaming services’ names and logos belong to their owners. Reelay isn’t connected to or endorsed by them.</p>
        <p>Reelay 0.1 · Made in Sweden</p>
      </div>
    </Page>
  )
}

function Privacy() {
  const { session, email } = useAuth()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  // The copy is made here and handed to the share sheet (or saved as a file), so there's no wait for an email.
  const copy = async () => {
    if (busy || !session) return
    setBusy(true)
    try {
      const data = await exportMyData(session.user.id, email)
      const file = new File([JSON.stringify(data, null, 2)], 'reelay-my-data.json', { type: 'application/json' })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] })
      else {
        const a = document.createElement('a')
        a.href = URL.createObjectURL(file); a.download = file.name; a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast({ text: navigator.onLine ? 'Couldn’t make the copy. Try again.' : 'You’re offline. Connect to get your data.' })
    } finally { setBusy(false) }
  }
  return (
    <Page title="Privacy">
      <div className="set-text">
        <p>Reelay keeps your email, the services you pick, your watchlist and your notification settings, so they follow you to other devices. If someone invited you, they see your email once you join.</p>
        <p>No ads, no tracking, and your data is never sold.</p>
      </div>
      <ul className="rows set-solo">
        <Link label="Privacy policy" to="/privacy" />
        <Link label="Terms of use" to="/terms" />
        <li><button type="button" onClick={copy}><span className="row-text"><b>Get a copy of my data</b></span>{busy ? <Spinner light /> : <Icon name="ios_share" size={18} style={{ color: 'var(--text-faint)' }} />}</button></li>
      </ul>
    </Page>
  )
}

function Delete() {
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gone, setGone] = useState(false)
  const run = async () => {
    setAsking(false)
    if (!navigator.onLine) { toast({ text: 'You’re offline. Connect to delete your account.' }); return }
    setBusy(true)
    try { await deleteAccount(); setGone(true) }
    catch { toast({ text: 'Couldn’t delete your account. Try again.' }) }
    finally { setBusy(false) }
  }
  return (
    <Page title="Delete account">
      <div className="set-text">
        <p>This deletes your account, your watchlist, the services you picked and your notification settings.</p>
        <p>It can’t be undone.</p>
      </div>
      <div className="set-action"><button type="button" className="btn-danger press" disabled={busy} onClick={() => setAsking(true)}>Delete account{busy && <Spinner light />}</button></div>
      {asking && (
        <div className="ios-alert" role="alertdialog" aria-label="Delete account">
          <div>
            <div className="ios-alert-text"><b>Delete Your Account?</b><span>Your watchlist and settings will be deleted. This can’t be undone.</span></div>
            <div className="ios-alert-actions"><button type="button" onClick={() => setAsking(false)}>Cancel</button><button type="button" className="danger" onClick={run}>Delete</button></div>
          </div>
        </div>
      )}
      {gone && (
        <div className="set-gone" role="status">
          <h2>Your account is deleted</h2>
          <p>Thanks for trying Reelay.</p>
          <Button onClick={async () => { clearSavedData(); await forgetSession(); location.replace('/') }}>Done</Button>
        </div>
      )}
    </Page>
  )
}

/** Pages under /settings/. */
export function settingsPage(path: string): ReactNode | null {
  switch (path) {
    case '/settings/services': return <Services />
    case '/settings/region': return <Region />
    case '/settings/credits': return <Credits />
    case '/settings/app-links': return <AppLinks />
    case '/settings/privacy': return <Privacy />
    case '/settings/delete': return <Delete />
    default: return null
  }
}
