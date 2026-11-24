import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import './lib/runway'
import { guardFieldTaps } from './lib/keyboard'
import { noteOpenedFrom, startServiceWorker } from './lib/push'
import App from './App.tsx'
import { watchErrors } from './lib/errors'
import { Crashed } from './ui/Crashed'

// opened from a notification: remember which kind before the address is tidied
noteOpenedFrom(location.href)
startServiceWorker()
guardFieldTaps()
watchErrors()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crashed>
      <App />
    </Crashed>
  </StrictMode>,
)
