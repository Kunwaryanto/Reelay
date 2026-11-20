import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// The app never scrolls the page itself (pages scroll inside it). If iOS scrolls it to show a focused field,
// put it back once the keyboard has settled, not on every scroll event (snapping back mid-animation made the
// sheet jump while the keyboard opened).
let settleScroll = 0
window.addEventListener('scroll', () => {
  clearTimeout(settleScroll)
  settleScroll = window.setTimeout(() => { if (window.scrollY !== 0 || window.scrollX !== 0) window.scrollTo(0, 0) }, 300)
}, { passive: true })
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
