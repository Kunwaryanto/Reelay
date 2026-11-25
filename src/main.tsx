import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

import './lib/runway'
import { guardFieldTaps, holdDocument } from './lib/keyboard'
import { standalone } from './lib/runway'
import { noteOpenedFrom, startServiceWorker } from './lib/push'
import App from './App.tsx'
import { watchErrors } from './lib/errors'
import { Crashed } from './ui/Crashed'

// opened from a notification: remember which kind before the address is tidied
noteOpenedFrom(location.href)
startServiceWorker()
guardFieldTaps()
// (in Safari the sign-in page lets Safari move it around its bars, so only in the Home Screen app)
if (standalone) holdDocument()
watchErrors()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Crashed>
      <App />
    </Crashed>
  </StrictMode>,
)
