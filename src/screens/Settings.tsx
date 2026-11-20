// So far: Invite friends (admins) and the account. The full Settings comes later.
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { inviteState, loadInvites, type Invite } from '../lib/catalogue'
import { useNav } from '../lib/nav'
import { useQuery } from '../lib/query'
import { clearSavedData } from '../lib/query'
import { BackButton, Icon } from '../ui'

export default function Settings() {
  const { email, signOut, isAdmin, session } = useAuth()
  const { push } = useNav()
  const invites = useQuery<Invite[]>(isAdmin && session ? `invites:${session.user.id}` : null, loadInvites, { persist: false, maxAge: 0 })
  const waiting = (invites.data ?? []).filter((i) => inviteState(i) === 'waiting').length
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')

  const out = async () => {
    if (!navigator.onLine) { setAsking(false); setError('Connect to sign out'); return }
    try { await signOut(); clearSavedData() } catch { setAsking(false); setError('Couldn’t sign out. Try again.') }
  }

  return (
    <main className="page page-plain noscroll">
      <div className="page-bar"><BackButton /></div>
      <h1 className="page-title">Settings</h1>
      {isAdmin && (
        <section className="settings-block">
          <ul className="rows">
            <li><button type="button" onClick={() => push('/settings/invites')}>
              <span className="row-text"><b>Invite friends</b></span>
              {waiting > 0 && <span className="row-note">{waiting} waiting</span>}
              <Icon name="chevron_right" size={16} style={{ color: 'var(--text-faint)', marginLeft: -10 }} />
            </button></li>
          </ul>
        </section>
      )}
      <section className="settings-block">
        <h2 className="block-title">Account</h2>
        <ul className="rows">
          <li className="row-plain"><span className="row-text"><b>Signed in with email</b><small>{email}</small></span></li>
          <li><button type="button" onClick={() => { setError(''); setAsking(true) }}><span className="row-text"><b>Sign out</b>{error && <small className="err">{error}</small>}</span></button></li>
        </ul>
        <p className="version">Version 0.1</p>
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
    </main>
  )
}
