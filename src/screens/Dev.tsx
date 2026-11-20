// /dev: every building block on one page, to compare with the Components page on the design canvas.
import { useState, type ReactNode } from 'react'
import type { Card } from '../lib/catalogue'
import {
  Button, Cover, GlassButton, Icon, IconButton, Laurel, LoadFailed, Pill, PosterRow, QuietButton,
  SectionHeader, Sheet, SmallButton, Spinner, TitleCard, Wordmark, useToast,
} from '../ui'

const card = (id: number, title: string, service: string, kind: Card['kind'] = 'series'): Card =>
  ({ id, kind, title, year: 2024, poster_path: null, availability: [{ service_id: service, leaves_on: null }] })
const CARDS = [card(1, 'Black Doves', 'netflix'), card(2, 'Allt för Sverige', 'svt-play'), card(3, 'The Paper', 'skyshowtime'), card(4, 'John Wick: Chapter 4', 'viaplay', 'film')]

const Spec = ({ name, note, children }: { name: string; note: string; children: ReactNode }) => (
  <section className="dev-spec"><h2>{name}</h2><p>{note}</p><div>{children}</div></section>
)

export default function Dev() {
  const toast = useToast()
  const [sheet, setSheet] = useState(false)
  const [pill, setPill] = useState('All')
  const [busy, setBusy] = useState(false)
  return (
    <main className="page page-plain dev noscroll">
      <h1 className="page-title">Building blocks</h1>
      <p className="empty">Compare with the Components page on the canvas. Posters are empty here on purpose.</p>
      <Spec name="Wordmark" note="outlines, never typed"><Wordmark height={32} /></Spec>
      <Spec name="Buttons" note="44 main · 32 small (grey on black, white solid) · glass over art · quiet text">
        <Button>Continue</Button><Button busy>Send code</Button>
        <SmallButton>Try again</SmallButton><SmallButton solid>Browse</SmallButton>
        <SmallButton busy={busy} onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 1200) }}>Try again</SmallButton>
        <span className="dev-art"><GlassButton>Sign in</GlassButton></span>
        <QuietButton>Change</QuietButton>
      </Spec>
      <Spec name="Icon buttons" note="32 circle in a 44 tap area · glass over art · bookmark fills when saved">
        <IconButton label="Back"><Icon name="chevron_left" size={20} /></IconButton>
        <span className="dev-art"><IconButton label="Back" glass><Icon name="chevron_left" size={20} /></IconButton></span>
        <IconButton label="Save"><Icon name="bookmark" size={18} /></IconButton>
        <IconButton label="Saved"><Icon name="bookmark" size={18} fill /></IconButton>
      </Spec>
      <Spec name="Pills" note="28 · selected white, else subtle fill">
        {['All', 'Films', 'Series'].map((p) => <Pill key={p} selected={pill === p} onClick={() => setPill(p)}>{p}</Pill>)}
      </Spec>
      <Spec name="Icons and laurel" note="Material Symbols 250 · laurel won / nominated · spinners">
        {['search', 'bookmark', 'notifications', 'tune', 'browse', 'close', 'north_east', 'chevron_right'].map((n) => <Icon key={n} name={n} />)}
        <Laurel size={16} won /><Laurel size={16} won={false} /><Laurel won /><Laurel won={false} />
        <span className="dev-white"><Spinner /></span><Spinner light />
      </Spec>
      <Spec name="Cover and service marks" note="2:3 · 12 squircle · hairline · mark top right (text until the logo files are added)">
        <div style={{ width: 147 }}><Cover path={null} service="svt-play" /></div>
        <div style={{ width: 147 }}><Cover path={null} service="skyshowtime" /></div>
        <div style={{ width: 147 }}><Cover path={null} service="netflix" /></div>
      </Spec>
      <section className="dev-wide">
        <SectionHeader title="Title cards in a row" onViewAll={() => {}} />
        <PosterRow>{CARDS.map((c, i) => <TitleCard key={c.id} card={c} note={i === 0 ? 'Leaves tomorrow' : undefined} />)}</PosterRow>
      </section>
      <Spec name="Sheet and toast" note="sheet: tap outside, swipe the handle down or Escape · toast: 4 s with Undo">
        <SmallButton onClick={() => setSheet(true)}>Open sheet</SmallButton>
        <SmallButton onClick={() => toast({ text: 'Removed Black Doves', action: 'Undo' })}>Show toast</SmallButton>
      </Spec>
      <Spec name="Couldn’t load" note="one reason and Try again"><LoadFailed what="this row" retry={() => {}} retrying={false} compact /></Spec>
      <Sheet open={sheet} onClose={() => setSheet(false)} label="Example sheet">
        <h2 className="sheet-title">Continue with email</h2>
        <input className="field" placeholder="Email" aria-label="Email" />
        <div className="sheet-action"><Button onClick={() => setSheet(false)}>Done</Button></div>
      </Sheet>
    </main>
  )
}
