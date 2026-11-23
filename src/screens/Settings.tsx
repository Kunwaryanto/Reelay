// Settings and its pages: Your services, Letterboxd, Region, Credits, Privacy, Delete account. (Invite friends has its own file.)
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { inviteState, loadInvites, type Invite } from '../lib/catalogue'
import { connectLetterboxd, disconnectLetterboxd, refreshLetterboxd, setLetterboxdSwitch, useLetterboxd } from '../lib/letterboxd'
import { readExport, sendImport } from '../lib/letterboxdImport'
import { useNavActions } from '../lib/nav'
import { deleteAccount, exportMyData, forgetSession, loadServices, servicesLabel, useMyServices, useProfile, type NotifyKey, type Service } from '../lib/profile'
import { askPermission, permission, type Permission } from '../lib/push'
import { paths, type SettingsPage } from '../lib/routes'
import { FRESH, clearSavedData, lastLoadError, useQuery } from '../lib/query'
import { BUILD, checkVersion, reloadApp, useNewVersion } from '../lib/update'
import { BackButton, Button, Icon, Sheet, SmallButton, Spinner, useToast } from '../ui'

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
  const lb = useLetterboxd()
  const services = useQuery<Service[]>('services', loadServices, FRESH.catalogue)
  const invites = useQuery<Invite[]>(isAdmin && session ? `invites:${session.user.id}` : null, loadInvites, FRESH.live)
  const waiting = (invites.data ?? []).filter((i) => inviteState(i) === 'waiting').length
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const fresh = useNewVersion()
  const [reloading, setReloading] = useState(false)
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
          <Link label="Letterboxd" note={lb.account ? lb.account.username : ''} to="/settings/letterboxd" />
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
<Link label="Version" note={fresh ? 'Update ready' : BUILD} to="/settings/version" />
        </ul>
      </section>
      {/* admins only: tools for trying things out */}
      {isAdmin && (
        <section className="settings-block">
          <h2 className="block-title">Testing</h2>
          <ul className="rows">
            <li><button type="button" onClick={() => push(paths.onboarding)}><span className="row-text"><b>Show onboarding again</b></span></button></li>
          </ul>
        </section>
      )}

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
  const services = useQuery<Service[]>('services', loadServices, FRESH.catalogue)
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

/** The version this phone runs, a check for a newer one, and the update itself (the card on Settings does the same when one is out). */
function Version() {
  const fresh = useNewVersion()
  const [reloading, setReloading] = useState(false)
  const [check, setCheck] = useState<'busy' | 'none' | 'offline' | 'idle'>('idle')
  const [problem] = useState(lastLoadError)
  const look = async () => {
    if (check === 'busy') return
    if (!navigator.onLine) { setCheck('offline'); return }
    setCheck('busy')
    // the answer often comes at once: hold the spinner a moment so the check is seen to happen
    const [found] = await Promise.all([checkVersion(), new Promise((r) => setTimeout(r, 600))])
    setCheck(found ? 'idle' : navigator.onLine ? 'none' : 'offline')
  }
  // opening the page checks once
  useEffect(() => { void look() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const status = fresh ? 'A new version is ready' : check === 'busy' ? 'Checking…' : check === 'none' ? 'Up to date' : check === 'offline' ? 'You’re offline' : ''
  return (
    <Page title="Version">
      <ul className="rows set-solo">
        <li className="row-plain"><span className="row-text"><b>Installed</b></span><span className="row-note">{BUILD}</span></li>
        <li className="row-plain" aria-live="polite"><span className="row-text"><b>Status</b></span><span className="row-note">{status}</span></li>
      </ul>
      <div className="set-action">
        {fresh
          ? <Button busy={reloading} onClick={() => { if (reloading) return; setReloading(true); void reloadApp() }}>Update</Button>
          : <Button busy={check === 'busy'} onClick={look}>Check for update</Button>}
      </div>
      <p className="set-foot">{fresh ? 'Updating takes a few seconds. You stay signed in.' : 'Reelay also checks by itself when you open it, and shows a dot by the Settings cog when a new version is out.'}</p>
      {/* the most recent thing the app failed to fetch since it opened: what to send along when something looks wrong */}
      {problem && (
        <section className="settings-block">
          <h2 className="block-title">Last problem</h2>
          <p className="set-foot set-problem">{problem}</p>
        </section>
      )}
    </Page>
  )
}

/** When the diary was last read: "03:17" today, "yesterday", else the date. */
function readAt(iso: string): string {
  const d = new Date(iso), now = new Date()
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / DAY)
  if (days <= 0) return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  return days === 1 ? 'yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function Letterboxd() {
  const { session } = useAuth()
  const uid = session?.user.id
  const { account, loading } = useLetterboxd()
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [leaving, setLeaving] = useState(false)
  // Import your history: the sheet explains where the export comes from; the file is read on the phone
  const [howTo, setHowTo] = useState(false)
  const [fetched, setFetched] = useState(false) // the export link was tapped: Choose file is next
  const [importing, setImporting] = useState<null | 'reading' | number>(null)
  const [importError, setImportError] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const importFiles = async (files: File[]) => {
    if (!files.length || !uid || importing !== null) return
    setHowTo(false); setImportError(''); setImporting('reading')
    try {
      const rows = await readExport(files)
      if (!rows.length) { setImportError('That doesn’t look like a Letterboxd export. Pick the ZIP from Letterboxd.'); return }
      setImporting(new Set(rows.map((r) => `${r.n}|${r.y}`)).size)
      const r = await sendImport(rows)
      if ('error' in r) setImportError(r.error === 'too_many' ? 'That export is too large to import.' : r.error === 'empty' ? 'That export has no films in it.' : 'Couldn’t import. Try again.')
      else await refreshLetterboxd(uid)
    } catch {
      setImportError(navigator.onLine ? 'Couldn’t read that file. Pick the ZIP from Letterboxd.' : 'You’re offline. Connect to import.')
    } finally { setImporting(null) }
  }
  const count = (n: number) => n.toLocaleString('en-US')

  const connect = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !uid) return
    if (!name.trim()) { setError('Type your Letterboxd username.'); return }
    if (!navigator.onLine) { setError('You’re offline. Connect to do this.'); return }
    setBusy(true); setError('')
    try {
      const r = await connectLetterboxd(uid, name)
      if ('error' in r) setError(r.error === 'not_found' ? 'Letterboxd has no member with that username.' : r.error === 'invalid' ? 'That doesn’t look like a Letterboxd username.' : 'Couldn’t connect. Try again.')
      else setName('')
    } catch { setError('Couldn’t connect. Try again.') } finally { setBusy(false) }
  }
  const disconnect = async () => {
    if (leaving || !uid) return
    setLeaving(true)
    try { await disconnectLetterboxd(uid) } catch { toast({ text: navigator.onLine ? 'Couldn’t disconnect. Try again.' : 'You’re offline. Connect to change this.' }) } finally { setLeaving(false) }
  }
  const flip = async (key: 'mark_watched' | 'hide_watched') => {
    if (!uid || !account) return
    try { await setLetterboxdSwitch(uid, account, key, !account[key]) } catch { toast({ text: navigator.onLine ? 'Couldn’t save that. Try again.' : 'You’re offline. Connect to change this.' }) }
  }
  const status = !account ? '' : account.synced_at
    ? `${account.films === 1 ? '1 film' : `${count(account.films)} films`} · read ${readAt(account.synced_at)}`
    : 'First read tonight'

  return (
    <Page title="Letterboxd">
      <div className="set-text">
        <p>Reelay reads your public diary each night to mark the films you’ve seen and show friends on Reelay each other’s ratings.</p>
      </div>
      {account === null && (
        <form className="lb-connect" onSubmit={connect} noValidate>
          <div className="lb-field" data-error={!!error}>
            <input id="lb-user" type="text" inputMode="text" enterKeyHint="go" autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="Letterboxd username" aria-label="Letterboxd username" maxLength={60}
              value={name} onChange={(e) => { setName(e.target.value); setError('') }} aria-invalid={!!error} aria-describedby={error ? 'lb-error' : 'lb-hint'} />
            <SmallButton type="submit" busy={busy} disabled={busy}>{busy ? '' : 'Connect'}</SmallButton>
          </div>
          {error ? <p id="lb-error" className="field-error" role="alert">{error}</p>
            : <p id="lb-hint" className="set-foot">Films only. Your diary must be public.</p>}
        </form>
      )}
      {account && (
        <>
          <ul className="rows set-solo">
            <li><a href={`https://letterboxd.com/${account.username}/`} target="_blank" rel="noreferrer">
              <span className="row-text"><b>{account.username}</b><small>{status}</small></span>
              <span className="row-note lb-out">Profile<Icon name="north_east" size={14} /></span>
            </a></li>
            <li><button type="button" role="switch" aria-checked={account.mark_watched} className="set-switch" onClick={() => flip('mark_watched')}>
              <span className="row-text"><b>Mark watched films</b></span><i aria-hidden="true" />
            </button></li>
            <li><button type="button" role="switch" aria-checked={account.hide_watched} className="set-switch" onClick={() => flip('hide_watched')}>
              <span className="row-text"><b>Hide watched films on Home</b><small>In recommendations</small></span><i aria-hidden="true" />
            </button></li>
            <li><button type="button" onClick={() => { if (importing === null) setHowTo(true) }} aria-busy={importing !== null}>
              {importing !== null
                ? <span className="row-text" aria-live="polite"><b>Importing your history…</b><small>{importing === 'reading' ? 'Reading the file' : `Matching ${count(importing)} films`}</small></span>
                : <span className="row-text"><b>Import your history</b>{importError ? <small className="err" role="alert">{importError}</small>
                  : <small>{account.imported_at ? `Imported ${new Date(account.imported_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${count(account.imported_films ?? 0)} films` : 'Everything before your latest entries'}</small>}</span>}
              {importing !== null ? <Spinner light /> : chevron}
            </button></li>
          </ul>
          <input ref={picker} type="file" accept=".zip,.csv,application/zip,text/csv" multiple hidden
            onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ''; void importFiles(files) }} />
          <Sheet open={howTo} onClose={() => setHowTo(false)} label="Import your history">
            <h2 className="sheet-title">Import your history</h2>
            {/* two steps, each with its own button; the white one is the step to do next */}
            <ol className="lb-steps">
              <li>
                <span className="row-text"><b>Download your export</b><small>A ZIP, saved to Files › Downloads</small></span>
                <a className="btn-small press" data-solid={!fetched} href="https://letterboxd.com/data/export/" target="_blank" rel="noreferrer" onClick={() => setFetched(true)}>Download<Icon name="north_east" size={14} /></a>
              </li>
              <li>
                <span className="row-text"><b>Pick the ZIP</b><small>Only the film list is sent</small></span>
                <SmallButton solid={fetched} onClick={() => picker.current?.click()}>Choose file</SmallButton>
              </li>
            </ol>
          </Sheet>
          <ul className="rows set-group">
            <li><button type="button" onClick={disconnect} aria-busy={leaving}><span className="row-text"><b className="err">Disconnect</b></span>{leaving && <Spinner light />}</button></li>
          </ul>
          <p className="set-foot lb-foot">Removes your films and ratings from Reelay.</p>
        </>
      )}
      {account === undefined && !loading && <p className="set-foot">Couldn’t load this. Check your connection and try again.</p>}
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
  ['Data', [['TMDB', 'Titles, posters and cast'], ['JustWatch', 'Where to watch'], ['Streaming Availability', 'Leaving dates'], ['IMDb', 'IMDb rating'], ['MDBList', 'Rotten Tomatoes and Letterboxd scores'], ['Letterboxd', 'Your and your friends’ diaries, when connected'], ['Wikidata', 'Awards']]],
  ['Design', [['Inter', 'Typeface by Rasmus Andersson · SIL Open Font License'], ['Material Symbols', 'Icons by Google · Apache License 2.0']]],
]
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
        <p>Reelay keeps your email, the services you pick, your watchlist and your notification settings, so they follow you to other devices. If you connect Letterboxd, it also keeps your username and the films, dates and ratings in your public diary, and the other people on Reelay can see them. If someone invited you, they see your email once you join.</p>
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
export function settingsPage(page: Exclude<SettingsPage, 'invites'>): ReactNode {
  switch (page) {
    case 'services': return <Services />
    case 'letterboxd': return <Letterboxd />
    case 'region': return <Region />
    case 'version': return <Version />
    case 'credits': return <Credits />
    case 'privacy': return <Privacy />
    case 'delete': return <Delete />
  }
}
