// When the catalogue last changed: the sync sets `data_stamp` at the end of every run. Catalogue content saved on
// the phone (titles, people, Browse) is kept until this moves, instead of on a timer, since it only changes then.
// It is asked for on opening and on coming back after a while; the answer is saved for the next opening.
import { supabase } from './supabase'
import { fromLaunch } from './me'

const KEY = 'reelay:stamp'
let current: string | null = (() => { try { return localStorage.getItem(KEY) } catch { return null } })()
let asking: Promise<string | null> | null = null
let askedAt = 0

/** The latest stamp known on this phone (null before the first answer). */
export const currentStamp = () => current

/** Ask the server (once for everyone asking at the same moment). Null when it can't be reached. */
export function checkStamp(): Promise<string | null> {
  if (asking) return asking
  asking = (async () => {
    // at launch, in the member's one request (me_bundle)
    return fromLaunch('stamp', async () => {
      const { data, error } = await supabase.from('data_stamp').select('finished_at').maybeSingle()
      if (error) throw new Error(error.message)
      return (data?.finished_at as string | undefined) ?? ''
    }, (b) => b.stamp ?? '')
  })().then((s) => {
    current = s
    askedAt = Date.now()
    try { localStorage.setItem(KEY, s) } catch { /* memory only */ }
    return s as string | null
  }, () => null).finally(() => { asking = null })
  return asking
}
/** Asked within the last minute: what the server said then. */
export const recentlyChecked = () => Date.now() - askedAt < 60_000
