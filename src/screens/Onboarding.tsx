// First run: which services you have, a few titles to start the Watchlist, and which notifications you want.
// Every step can be skipped. Shown once (profiles.onboarded_at), and again from Settings while testing.
import { useState } from 'react'
import { loadServices, useMyServices, useProfile, type NotifyKey, type Service } from '../lib/profile'
import { askPermission, permission } from '../lib/push'
import { useQuery } from '../lib/query'
import { useSaved } from '../lib/saved'
import { Button, Icon, Sheet, useToast } from '../ui'
import { PickWall } from './Watchlist'

type Step = 'services' | 'pick' | 'notify'
const NOTIFY: [NotifyKey, string][] = [['notify_leaving', 'Leaving soon'], ['notify_arrivals', 'Arriving on your services'], ['notify_new_seasons', 'New seasons']]
const EXAMPLES: [string, string, string][] = [
  ['The Sinner', 'now', 'Leaves Netflix tomorrow.'],
  ['Dune: Part Two', '2h ago', 'Now streaming on HBO Max.'],
  ['Black Doves', 'Yesterday', 'Season 2 is out on Netflix.'],
]

function Head({ onBack, onSkip }: { onBack?: () => void; onSkip: () => void }) {
  return (
    <header className="ob-head">
      {onBack ? <button type="button" className="icon-btn" aria-label="Back" onClick={onBack}><span><Icon name="chevron_left" size={20} /></span></button> : <span />}
      <button type="button" className="ob-skip" onClick={onSkip}>Skip</button>
    </header>
  )
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>('services')
  const { mine, set } = useMyServices()
  const { update } = useProfile()
  const saved = useSaved()
  const toast = useToast()
  const services = useQuery<Service[]>('services', loadServices, { maxAge: 24 * 60 * 60 * 1000 })
  const [more, setMore] = useState(false)
  const [want, setWant] = useState<Record<NotifyKey, boolean>>({ notify_leaving: true, notify_arrivals: true, notify_new_seasons: true })
  const [busy, setBusy] = useState(false)

  const all = services.data ?? []
  const popular = all.filter((s) => s.popular), rest = all.filter((s) => !s.popular)
  const extra = rest.filter((s) => mine.includes(s.id)).length
  const toggle = (s: Service) => set(s.id, !mine.includes(s.id)).catch(() => toast({ text: 'Couldn’t save that. Try again.' }))

  const finish = async (ask: boolean) => {
    if (busy) return
    setBusy(true)
    const any = Object.values(want).some(Boolean)
    // the system question comes from this tap; "Don't Allow" just leaves them off
    if (ask && any && permission() === 'default') await askPermission()
    try { await update({ ...(ask ? want : {}), onboarded_at: new Date().toISOString() }) } catch { /* offline: it shows again next time */ }
    onDone()
  }

  return (
    <div className="ob" data-step={step}>
      {step === 'services' && (
        <section className="ob-step" aria-label="Your services">
          <Head onSkip={() => setStep('pick')} />
          <h1>{'Which services\ndo you have?'}</h1>
          <ul className="ob-tiles" role="group" aria-label="Your services">
            {popular.map((s) => (
              <li key={s.id}><button type="button" role="checkbox" aria-checked={mine.includes(s.id)} onClick={() => toggle(s)}>{s.name}</button></li>
            ))}
            {rest.length > 0 && (
              <li><button type="button" aria-haspopup="dialog" data-on={extra > 0} aria-label={extra ? `More services, ${extra} picked` : 'More services'} onClick={() => setMore(true)}>
                {extra ? `+${extra} more` : <><Icon name="add" size={18} />More</>}
              </button></li>
            )}
          </ul>
          <div className="ob-next"><Button onClick={() => setStep('pick')}>Continue</Button></div>
          <Sheet open={more} onClose={() => setMore(false)} label="More services">
            <h2 className="sheet-title ob-sheet-title">More services</h2>
            <ul className="rows ob-more" role="group" aria-label="More services">
              {rest.map((s) => (
                <li key={s.id}><button type="button" role="checkbox" aria-checked={mine.includes(s.id)} onClick={() => toggle(s)}>
                  <span className="row-text"><b>{s.name}</b>{s.kind === 'free' && <small>Free</small>}</span>
                  <Icon name="check" size={20} style={{ opacity: mine.includes(s.id) ? 1 : 0 }} />
                </button></li>
              ))}
            </ul>
            <div className="sheet-action"><Button onClick={() => setMore(false)}>Done</Button></div>
          </Sheet>
        </section>
      )}

      {step === 'pick' && (
        <PickWall bare
          header={<div className="ob-over"><Head onBack={() => setStep('services')} onSkip={() => setStep('notify')} /><h1>{'Pick a few\nto watch later'}</h1></div>}
          onAdd={(ids) => { saved.addMany(ids); setStep('notify') }} />
      )}

      {step === 'notify' && (
        <section className="ob-step" aria-label="Notifications">
          <Head onBack={() => setStep('pick')} onSkip={() => finish(false)} />
          <div className="ob-cards" aria-label="Example notifications" role="img">
            {EXAMPLES.map(([title, when, body], i) => (
              <div key={title} className="ob-card" style={{ animationDelay: `${150 + i * 120}ms` }}>
                <span className="ob-app" aria-hidden="true">R</span>
                <div><div><b>{title}</b><small>{when}</small></div><p>{body}</p></div>
              </div>
            ))}
          </div>
          <div className="ob-notify">
            <h1>Never miss a title</h1>
            <p>Only about titles on your Watchlist.</p>
            <ul className="rows">
              {NOTIFY.map(([key, label]) => (
                <li key={key}><button type="button" role="switch" className="set-switch" aria-checked={want[key]} onClick={() => setWant((w) => ({ ...w, [key]: !w[key] }))}>
                  <span className="row-text"><b>{label}</b></span><i aria-hidden="true" />
                </button></li>
              ))}
            </ul>
          </div>
          <div className="ob-next"><Button busy={busy} onClick={() => finish(true)}>Continue</Button></div>
        </section>
      )}
    </div>
  )
}
