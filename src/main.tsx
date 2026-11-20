import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// How much of the bottom of the page Safari's floating address bar covers (0 in the Home Screen app), so the
// tab bar and the ends of pages sit above it while the page itself still runs behind it. Not while typing,
// when the keyboard covers the bottom instead.
function measureChrome() {
  const vv = window.visualViewport
  if (!vv) return
  const el = document.activeElement
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
  const page = document.documentElement.getBoundingClientRect().bottom
  const covered = Math.max(0, Math.round(page - (vv.offsetTop + vv.height)))
  document.documentElement.style.setProperty('--chrome-b', `${covered}px`)
}
measureChrome()
window.visualViewport?.addEventListener('resize', measureChrome)
window.addEventListener('resize', measureChrome)
document.addEventListener('focusout', () => setTimeout(measureChrome, 400))

// The app never scrolls the page itself (pages scroll inside it), but iOS scrolls the page to show a focused
// field above the keyboard, which moves the whole background up. Put it straight back.
window.addEventListener('scroll', () => { if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0) }, { passive: true })
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
