// Start and sign in. Code only: the email holds a 6-digit code. Reelay is invite only:
// an invite link (/i/<token>) creates the account, otherwise only existing accounts get a code.
import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useQuery } from '../lib/query'
import { Button, GlassButton, PosterWall, QuietButton, Sheet, Spinner, Wordmark } from '../ui'

type Invite = 'none' | 'checking' | 'valid' | 'expired' | 'used'
type Step = 'email' | 'code' | 'noinv' | 'gone'
type SendErr = '' | 'invalid' | 'net' | 'offline' | 'rate'
type CodeErr = '' | 'wrong' | 'expired' | 'locked'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/ // loose on purpose: something@something.something
const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/redeem-invite`

async function redeem(body: { token: string; email?: string }): Promise<{ status?: string; error?: string }> {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify(body),
  })
  return res.json()
}

async function loadWall(): Promise<string[]> {
  const { data, error } = await supabase.rpc('start_wall')
  if (error) throw new Error(error.message)
  return (data as { poster_path: string }[] | string[]).map((r) => (typeof r === 'string' ? r : r.poster_path))
}

const SEND_ERR: Record<Exclude<SendErr, ''>, string> = {
  invalid: 'Check the email address.',
  net: 'Couldn’t send the code. Check your connection and try again.',
  offline: 'You’re offline. Connect to send the code.',
  rate: 'Too many codes sent. Wait a minute and try again.',
}
const CODE_ERR: Record<Exclude<CodeErr, ''>, string> = {
  wrong: 'Wrong code. Try again.',
  expired: 'This code has expired.',
  locked: 'Too many attempts. Get a new code.',
}

export default function Start({ onSignedIn }: { onSignedIn: () => void }) {
  const token = useRef(location.pathname.startsWith('/i/') ? location.pathname.slice(3).replace(/\/$/, '') : '').current
  const [invite, setInvite] = useState<Invite>(token ? 'checking' : 'none')
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sendErr, setSendErr] = useState<SendErr>('')
  const [code, setCode] = useState('')
  const [codeErr, setCodeErr] = useState<CodeErr>('')
  const [checking, setChecking] = useState(false)
  const [resent, setResent] = useState(false)
  const [ok, setOk] = useState(false)
  const [secs, setSecs] = useState(60)
  const [shake, setShake] = useState(0)
  const [ready, setReady] = useState(false)
  const [wallReady, setWallReady] = useState(false)
  const tries = useRef(0)
  const sentAt = useRef(0)
  const emailInput = useRef<HTMLInputElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)

  const wall = useQuery('start-wall', loadWall, { maxAge: 6 * 60 * 60 * 1000 })

  // The wordmark always finishes rising before the button shows.
  useEffect(() => { const t = setTimeout(() => setReady(true), 1200); return () => clearTimeout(t) }, [])

  // An invite link: ask whether it still works.
  useEffect(() => {
    if (!token) return
    redeem({ token }).then((r) => {
      const s = r.status === 'valid' ? 'valid' : r.status === 'expired' ? 'expired' : 'used'
      setInvite(s)
      if (s !== 'valid') { setStep('gone'); setOpen(true) }
    }).catch(() => setInvite('none'))
  }, [token])

  useEffect(() => {
    if (step !== 'code' || ok || secs <= 0) return
    const t = setTimeout(() => setSecs((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [step, ok, secs])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => (step === 'code' ? codeInput : emailInput).current?.focus(), 50)
    return () => clearTimeout(t)
  }, [open, step])

  const openSheet = () => {
    if (step !== 'code' || ok) { setStep(invite === 'expired' || invite === 'used' ? 'gone' : 'email'); setSendErr('') }
    setOpen(true)
  }

  async function send(resend = false) {
    const address = email.trim()
    if (!EMAIL.test(address)) { setSendErr('invalid'); setShake((n) => n + 1); return }
    if (!navigator.onLine) { setSendErr('offline'); return }
    setSending(true)
    setSendErr('')
    try {
      if (invite === 'valid') {
        const r = await redeem({ token, email: address })
        if (r.status !== 'created' && r.status !== 'existing') {
          if (r.status === 'expired' || r.status === 'used') { setInvite(r.status); setStep('gone'); return }
          throw new Error(r.error ?? 'invite')
        }
      }
      const { error } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } })
      if (error) {
        if (error.status === 429) { setSendErr('rate'); return }
        // sign-ups are off: no account for this email
        if (error.code === 'otp_disabled' || error.code === 'signup_disabled' || /signups? not allowed/i.test(error.message)) { setStep('noinv'); return }
        throw error
      }
      sentAt.current = Date.now()
      tries.current = 0
      setCode(''); setCodeErr(''); setSecs(60); setOk(false); setResent(resend)
      setStep('code')
    } catch {
      setSendErr(navigator.onLine ? 'net' : 'offline')
    } finally {
      setSending(false)
    }
  }

  async function verify(value: string) {
    setChecking(true)
    setResent(false)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: value, type: 'email' })
    setChecking(false)
    if (!error) { setOk(true); setCodeErr(''); setTimeout(onSignedIn, 700); return }
    tries.current++
    const kind: CodeErr = error.status === 429 || tries.current >= 5 ? 'locked'
      : Date.now() - sentAt.current > 60 * 60 * 1000 ? 'expired' : 'wrong'
    setCodeErr(kind)
    if (kind === 'wrong') setShake((n) => n + 1)
    if (kind !== 'wrong') setSecs(0)
  }

  // Typed, pasted or filled in from Mail: any 6 digits in a row is the code, and it is checked straight away.
  function typeCode(raw: string) {
    if (ok || checking || codeErr === 'locked') return
    const digits = raw.replace(/\D/g, '')
    let next: string
    if (codeErr) next = digits.length > code.length ? digits.slice(code.length).slice(-6) : '' // after an error, start fresh
    else next = digits.length > 6 ? digits.slice(-6) : digits
    setCode(next)
    setCodeErr('')
    if (next.length === 6) verify(next)
  }

  function pasteCode(e: ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text')
    const six = text.match(/\b\d{6}\b/)?.[0] ?? text.replace(/\D/g, '').slice(0, 6)
    if (!six) return
    e.preventDefault()
    if (ok || checking || codeErr === 'locked') return
    setCode(six)
    setCodeErr('')
    if (six.length === 6) verify(six)
  }

  const joining = invite === 'valid'
  const mm = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  const shakeClass = shake ? (shake % 2 ? 'a' : 'b') : ''

  return (
    <div className="start">
      <div className="start-wall" data-ready={wallReady}><PosterWall posters={wall.data ?? []} onReady={() => setWallReady(true)} /></div>
      <h1 className="start-word"><Wordmark height={32} rise /></h1>
      <main className="start-ui" data-ready={ready}>
        <GlassButton onClick={openSheet} disabled={invite === 'checking'}>{joining ? 'Join Reelay' : 'Sign in'}</GlassButton>
        <p>{joining ? 'You’re invited.' : 'Reelay is invite only.'}</p>
      </main>

      <Sheet open={open} onClose={() => setOpen(false)} label={joining ? 'Join Reelay' : 'Continue with email'}>
        {step === 'email' && (
          <form className="stepin" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); send() }}>
            <h2 className="sheet-title">{joining ? 'Join Reelay' : 'Continue with email'}</h2>
            <input ref={emailInput} className={`field ${sendErr === 'invalid' ? `nudge-${shakeClass}` : ''}`} data-error={sendErr === 'invalid'}
              id="email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="Email" aria-label="Email" aria-invalid={sendErr === 'invalid'} value={email}
              onChange={(e) => { setEmail(e.target.value); setSendErr('') }} />
            {sendErr && <p className="field-error" role="alert">{SEND_ERR[sendErr]}</p>}
            <div className="sheet-action"><Button type="submit" busy={sending}>Send code</Button></div>
          </form>
        )}

        {step === 'noinv' && (
          <div className="stepin">
            <h2 className="sheet-title">Reelay is invite only</h2>
            <p className="sheet-text">There’s no account for <span>{email.trim()}</span>. To join, open an invite link from someone who uses Reelay.</p>
            <div className="sheet-action"><Button onClick={() => { setStep('email'); setEmail('') }}>Use another email</Button></div>
          </div>
        )}

        {step === 'gone' && (
          <div className="stepin">
            <h2 className="sheet-title">{invite === 'used' ? 'This invite has been used' : 'This invite has expired'}</h2>
            <p className="sheet-text">{invite === 'used' ? 'Each invite link works once.' : 'Invite links work for 14 days.'} Ask the person who sent it for a new one.</p>
            <div className="sheet-action"><QuietButton onClick={() => { setInvite('none'); setStep('email') }}>I already have an account</QuietButton></div>
          </div>
        )}

        {step === 'code' && (
          <div className="stepin">
            <h2 className="sheet-title">{ok ? 'You’re in' : 'Check your email'}</h2>
            <div className="sent-to">
              <p>{ok ? 'Signed in as ' : 'Sent to '}{email.trim()}</p>
              {!ok && <QuietButton onClick={() => { setStep('email'); setCode(''); setCodeErr('') }}>Change</QuietButton>}
            </div>
            <label className={`code ${codeErr === 'wrong' ? `shake-${shakeClass}` : ''}`} data-dim={codeErr === 'locked' ? 'locked' : checking ? 'checking' : undefined}>
              <input ref={codeInput} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
                aria-label="6-digit code" name="code" id="code" value={code} onChange={(e) => typeCode(e.target.value)} onPaste={pasteCode} disabled={ok} />
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} aria-hidden="true" data-state={codeErr ? 'error' : ok || i === code.length ? 'next' : undefined}>
                  {code[i] ?? ''}{!ok && !codeErr && i === code.length && <i className="caret" />}
                </span>
              ))}
            </label>
            <p className="code-status" role="status">
              {checking && <><Spinner light /><span>Checking…</span></>}
              {resent && !checking && !codeErr && <><span className="resent">New code sent</span><span aria-hidden="true">·</span></>}
              {!ok && codeErr && <span className="err">{CODE_ERR[codeErr]}</span>}
              {!ok && !checking && (
                <button type="button" aria-disabled={secs > 0} data-ready={secs === 0} onClick={() => { if (secs === 0 && !sending) send(true) }}>
                  {secs > 0 ? `Send again in ${mm}` : 'Send again'}
                </button>
              )}
            </p>
            {sendErr && <p className="field-error" role="alert">{SEND_ERR[sendErr]}</p>}
          </div>
        )}
      </Sheet>
    </div>
  )
}
