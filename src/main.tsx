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
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
