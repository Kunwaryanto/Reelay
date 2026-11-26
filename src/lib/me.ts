// The member's own things at launch, in one request (me_bundle, migration 20261126000900): profile, services,
// watchlist, Letterboxd connection, watched films and the sync stamp. Each of those still has its own loader and
// saved answer; at launch the first loader that asks starts the one request, and the others take their part of it.
// Each part is taken from it once, within the first moments: a later load (after a change, a pull, coming back)
// asks for that thing alone, as before.
import { supabase } from './supabase'

export type MeBundle = {
  profile: Record<string, unknown> | null
  services: string[]
  watchlist: { notify: boolean; added_at: string; title: Record<string, unknown> | null }[]
  letterboxd: Record<string, unknown> | null
  watched: (number | string)[]
  stamp: string | null
}
export type Part = 'profile' | 'services' | 'saved' | 'watchlist' | 'letterboxd' | 'watched' | 'stamp'

const WINDOW = 20_000
let bundle: Promise<MeBundle> | null = null
let askedAt = 0
const taken = new Set<Part>()

async function ask(): Promise<MeBundle> {
  // signed out (Start, sign-in): nothing to bundle
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('signed out')
  const { data, error } = await supabase.rpc('me_bundle')
  if (error || !data) throw new Error(error?.message ?? 'no answer')
  return data as MeBundle
}

/** One part of the member's things: from the launch request while it is new, else with `own` (its own request). */
export function fromLaunch<T>(part: Part, own: () => Promise<T>, read: (b: MeBundle) => T | undefined): Promise<T> {
  if (taken.has(part) || (bundle && Date.now() - askedAt > WINDOW)) return own()
  taken.add(part)
  if (!bundle) {
    askedAt = Date.now()
    const b = ask()
    bundle = b
    // not answered (signed out, an older database): the next part asks again, this one on its own
    b.catch(() => { if (bundle === b) bundle = null })
  }
  return bundle.then((b) => { const v = read(b); return v === undefined ? own() : v }, () => own())
}

/** Who is signed in: another member signing in on this phone gets a launch request of their own. */
let user: string | null = null
export function launchUser(uid: string | null) {
  if (user && uid !== user) { bundle = null; askedAt = 0; taken.clear() }
  if (uid) user = uid
}
