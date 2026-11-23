// The Supabase client, made from its two parts the app uses: sign-in (auth-js) and the database (postgrest-js).
// The full supabase-js client also carries Realtime, Storage and Functions, which Reelay doesn't use, and that
// made the app's start-up file larger. This one is set up the way supabase-js sets up its own (same session key,
// so members stay signed in; same headers on every request).
import { AuthClient } from '@supabase/auth-js'
import { PostgrestClient } from '@supabase/postgrest-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example)')
}

const base = new URL(url)
const auth = new AuthClient({
  url: new URL('auth/v1', base.href.endsWith('/') ? base.href : `${base.href}/`).href,
  headers: { Authorization: `Bearer ${key}`, apikey: key },
  // the key supabase-js uses: a session saved before this change is found again
  storageKey: `sb-${base.hostname.split('.')[0]}-auth-token`,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: true,
  flowType: 'implicit',
})

/** Every database request carries the member's token (or the publishable key when signed out), as in supabase-js. */
const withAuth: typeof fetch = async (input, init) => {
  const { data } = await auth.getSession()
  const headers = new Headers(init?.headers)
  if (!headers.has('apikey')) headers.set('apikey', key)
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${data.session?.access_token ?? key}`)
  return fetch(input, { ...init, headers })
}
const rest = new PostgrestClient(new URL('rest/v1', base.href.endsWith('/') ? base.href : `${base.href}/`).href, { fetch: withAuth })

export const supabase = {
  auth,
  from: rest.from.bind(rest),
  rpc: rest.rpc.bind(rest),
}
