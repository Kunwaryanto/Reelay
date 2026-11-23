import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'

// https://vite.dev/config/
// Which build this is, shown in Settings: the commit on Vercel, "local" otherwise.
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 7)

// The start-up wordmark (index.html, #boot) is the brand file itself, put in the page when it is built
const bootWordmark = (): Plugin => ({
  name: 'boot-wordmark',
  transformIndexHtml: (html) => html.replace('<!-- boot-wordmark -->', readFileSync('public/brand/wordmark.svg', 'utf8').replace(/ role="img" aria-label="Reelay"/, '')),
})

export default defineConfig({
  plugins: [react(), bootWordmark()],
  define: { __BUILD__: JSON.stringify(BUILD) },
})
