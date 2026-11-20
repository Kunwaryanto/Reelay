import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// iOS 26 can give a Home Screen web app a viewport shorter than the screen, leaving a black band at the bottom.
// There, size the app to the screen and tell fixed layers (sheet, toasts) how big the gap is.
const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
function fitScreen() {
  if (!standalone) return
  const portrait = matchMedia('(orientation: portrait)').matches
  const full = Math.max(window.innerHeight, portrait ? screen.height : screen.width)
  const root = document.documentElement.style
  root.setProperty('--app-h', `${full}px`)
  root.setProperty('--gap', `${full - window.innerHeight}px`)
}
fitScreen()
window.addEventListener('resize', fitScreen)
window.addEventListener('orientationchange', fitScreen)
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
