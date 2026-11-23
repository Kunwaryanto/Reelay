// Settings › Invite friends (admins only): single-use invite links, and the ones already sent.
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { cancelInvite, createInvite, inviteState, loadInvites, restoreInvite, shortDate, type Invite } from '../lib/catalogue'
import { FRESH, useQuery } from '../lib/query'
import { BackButton, Icon, LoadFailed, SmallButton, useToast } from '../ui'

const SITE = 'https://usereelay.vercel.app'
const linkOf = (inv: Invite) => `${SITE}/i/${inv.token}`


export default function Invites() {
  const { session } = useAuth()
  const toast = useToast()
  const q = useQuery<Invite[]>(session ? `invites:${session.user.id}` : null, loadInvites, FRESH.live)
  const [busy, setBusy] = useState(false)
  // rows cancelled here, hidden until the list is fetched again
  const [gone, setGone] = useState<Record<string, true>>({})
  const [fresh, setFresh] = useState('')

  // The system share sheet; where there is none (or it refuses), the link is copied instead.
  async function share(inv: Invite) {
    const url = linkOf(inv)
    try {
      if (navigator.share) { await navigator.share({ title: 'You’re invited to Reelay', url }); return }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return // closed the share sheet
    }
    try { await navigator.clipboard.writeText(url); toast({ text: 'Link copied' }) }
    catch { toast({ text: 'Tap the invite in the list to share it' }) }
  }

  async function create() {
    if (busy) return
    if (!navigator.onLine) { toast({ text: 'You’re offline. Connect to make a link.' }); return }
    setBusy(true)
    try {
      const inv = await createInvite()
      setFresh(inv.id)
      q.retry()
      await share(inv)
    } catch {
      toast({ text: 'Couldn’t make a link. Try again.' })
    } finally {
      setBusy(false)
    }
  }

  function cancel(inv: Invite) {
    setGone((g) => ({ ...g, [inv.id]: true }))
    const back = () => setGone((g) => { const n = { ...g }; delete n[inv.id]; return n })
    cancelInvite(inv.id).then(
      () => toast({ text: 'Invite cancelled', action: 'Undo', run: () => { restoreInvite(inv).then(() => { back(); q.retry() }, () => toast({ text: 'Couldn’t bring it back.' })) } }),
      () => { back(); toast({ text: navigator.onLine ? 'Couldn’t cancel that. Try again.' : 'You’re offline. Connect to cancel.' }) },
    )
  }

  const list = (q.data ?? []).filter((inv) => !gone[inv.id])

  return (
    <main className="page page-plain noscroll">
      <div className="page-bar"><BackButton /></div>
      <h1 className="page-title">Invite friends</h1>
      <p className="sheet-text">Each link lets one person join Reelay. It works once and stops working after 14 days.</p>
      <div className="invite-new"><SmallButton onClick={create} busy={busy}><Icon name="add" size={18} style={{ marginLeft: -4 }} />New invite link</SmallButton></div>

      <h2 className="block-title invite-sent">Sent</h2>
      {q.error && <LoadFailed what="your invites" retry={q.retry} retrying={q.retrying} compact />}
      {q.data && list.length === 0 && <p className="invite-none">No invites yet.</p>}
      <ul className="rows invite-rows">
        {list.map((inv) => {
          const state = inviteState(inv)
          const sent = shortDate(inv.created_at)
          const title = state === 'joined' ? inv.used_email ?? 'Joined' : `Sent ${sent}`
          const sub = state === 'waiting' ? `Waiting · works until ${shortDate(inv.expires_at)}`
            : state === 'joined' ? `Joined ${shortDate(inv.joined_at!)}` : 'Expired, not used'
          const text = <span className="row-text"><b data-faint={state === 'expired'}>{title}</b><small>{sub}</small></span>
          return (
            <li key={inv.id} className="row-plain" data-fresh={inv.id === fresh}>
              {state === 'waiting'
                ? <button type="button" className="invite-share" aria-label={`Share the invite sent ${sent} again`} onClick={() => share(inv)}>{text}</button>
                : text}
              {state === 'waiting' && <button type="button" className="invite-cancel" aria-label={`Cancel invite sent ${sent}`} onClick={() => cancel(inv)}>Cancel</button>}
            </li>
          )
        })}
      </ul>
      {list.length > 0 && <p className="invite-foot">Used and expired links disappear after 30 days.</p>}
    </main>
  )
}
