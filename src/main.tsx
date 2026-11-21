import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import './lib/runway'
import { noteOpenedFrom, startServiceWorker } from './lib/push'
import App from './App.tsx'

// opened from a notification: remember which kind before the address is tidied
noteOpenedFrom(location.href)
startServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
