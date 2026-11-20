// The privacy policy (/privacy) and terms of use (/terms). Reached from Settings › Privacy, and readable without signing in.
import type { ReactNode } from 'react'
import { BackButton, Icon } from '../ui'

const MAIL = 'lukas.kunwaryanto@gmail.com'
const mail = <a href={`mailto:${MAIL}`}>{MAIL}</a>

function Doc({ title, signedIn, children }: { title: string; signedIn: boolean; children: ReactNode }) {
  return (
    <main className="page page-plain noscroll legal">
      <div className="page-bar">
        {signedIn ? <BackButton /> : <a className="icon-btn" href="/" aria-label="Back"><span><Icon name="chevron_left" size={20} /></span></a>}
      </div>
      <h1 className="page-title">{title}</h1>
      <p className="legal-date">Updated 20 Nov 2026</p>
      {children}
    </main>
  )
}

const KEEPS: [string, string, string][] = [
  ['Your email address', 'For your account and sign-in codes', 'Contract (GDPR art. 6(1)(b)) · until you delete your account'],
  ['Your services, watchlist and Notify me titles', 'To show what’s on your services and remind you', 'Contract · until you remove them or delete your account'],
  ['Your settings', 'Region, language and which notifications you want', 'Contract · until you delete your account'],
  ['A notification address per device', 'Only if you turn notifications on', 'Contract · until you turn them off, remove the device or delete your account'],
  ['Invite details', 'The person who invited you sees your email once you join', 'Legitimate interest (art. 6(1)(f)) · 30 days after you join'],
  ['Technical logs', 'IP address, time and browser when you load the site, sign in or get a sign-in email', 'Legitimate interest · website logs 1 hour, database logs 1 day, sign-in history and email logs 30 days'],
]
const HANDLERS: [string, string][] = [
  ['Supabase', 'Database and sign-in · EU (Stockholm)'], ['Vercel', 'Hosts the website · USA, servers worldwide'],
  ['Brevo', 'Sends the sign-in email · EU'], ['Apple, Google or Mozilla', 'Deliver notifications, depending on your phone and browser · USA'],
]

export function PrivacyPolicy({ signedIn = true }: { signedIn?: boolean }) {
  return (
    <Doc title="Privacy policy" signedIn={signedIn}>
      <p>Reelay keeps only what it needs to show you where films and series stream and to remind you about them. No ads, no tracking, no analytics, and your data is never sold.</p>
      <h2>Who is responsible</h2>
      <p>Reelay is a free personal project run by Lukas K. in Sweden, who is the controller of your personal data. Questions or requests: {mail}.</p>
      <h2>What Reelay keeps, and why</h2>
      <ul>{KEEPS.map(([what, why, basis]) => <li key={what}><b>{what}</b><span>{why}</span><small>{basis}</small></li>)}</ul>
      <p>Sign-in codes stop working after one hour. Reelay stores your sign-in session on your device so you stay signed in; it uses no other cookies or similar storage.</p>
      <h2>Who handles the data for Reelay</h2>
      <ul>{HANDLERS.map(([who, what]) => <li key={who}><b>{who}</b><span>{what}</span></li>)}</ul>
      <p>They process data only on Reelay’s behalf, under data processing agreements. Posters and photos load straight from TMDB (run by TiVo Platform Technologies in the USA), which sees your IP address when an image loads. Reelay sends TMDB nothing else about you.</p>
      <h2>Outside the EU</h2>
      <p>Vercel, the push services and TMDB are based in the USA. Vercel is certified under the EU–US Data Privacy Framework; the others rely on that Framework or on the EU’s standard contractual clauses.</p>
      <h2>Your rights</h2>
      <p>You can ask to see, correct or delete your data, to limit or object to how it’s used, and to get it in a portable format. Settings › Privacy › Get a copy of my data gives you a copy; Settings › Delete account removes everything straight away. For anything else, email {mail}; you’ll get an answer within one month.</p>
      <p>If you think your data is handled wrongly, you can complain to IMY, the Swedish Authority for Privacy Protection (<a href="https://www.imy.se" target="_blank" rel="noreferrer">imy.se</a>). Reelay makes no automated decisions about you and doesn’t profile you.</p>
      <h2>Age</h2>
      <p>Reelay is for people aged 13 and over.</p>
      <h2>Changes</h2>
      <p>If this policy changes in a way that matters, Reelay tells you in the app before it takes effect.</p>
    </Doc>
  )
}

export function Terms({ signedIn = true }: { signedIn?: boolean }) {
  return (
    <Doc title="Terms of use" signedIn={signedIn}>
      <p>Reelay is free, invite only and run as a personal project by Lukas K. By using it you accept these terms.</p>
      <h2>What Reelay is</h2>
      <p>A guide to where films and series stream in Sweden. It doesn’t stream anything itself; “Open in” takes you to the streaming service, and that service’s own terms apply there.</p>
      <h2>Information can be wrong</h2>
      <p>Availability, leaving dates, ratings and awards come from other sources and change often. Check the streaming service before you rely on them.</p>
      <h2>Your account</h2>
      <p>One account per person, for your own use. Keep your email secure, since anyone who can read it can sign in. Don’t misuse Reelay: no copying the catalogue in bulk, automated access or attempts to break it.</p>
      <h2>Invites</h2>
      <p>Admins can invite people. An invite link is meant for the person it was sent to and works once.</p>
      <h2>Ending</h2>
      <p>You can delete your account at any time in Settings. Lukas K. can close an account that breaks these terms, and can stop Reelay altogether; if that happens, you get at least 30 days’ notice in the app and can download your data first.</p>
      <h2>No guarantees</h2>
      <p>Reelay is provided as is, without warranties. To the extent the law allows, Lukas K. isn’t liable for losses from using it or from it being unavailable.</p>
      <h2>Changes</h2>
      <p>If these terms change in a way that matters, you’re told in the app before they take effect.</p>
      <h2>Law</h2>
      <p>Swedish law applies, and disputes go to a Swedish court. Nothing here limits your rights as a consumer.</p>
      <p>Questions: {mail}</p>
    </Doc>
  )
}
