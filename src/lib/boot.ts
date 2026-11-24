// The wordmark that is on screen before any of the app's code has loaded (index.html, #boot): it rises from the
// first frame instead of after a black wait. Home's launch takes it over (it waits for the rise to finish, then the
// page fades in under it); any other start (a link, Start, the desktop page) lets it fade at once.
const el = typeof document !== 'undefined' ? document.getElementById('boot') : null
let ended = !el

/** The start-up wordmark is still up (Home waits for its rise rather than showing a wordmark of its own). */
export const bootShowing = () => !ended

/** Its rise is done this long after the page started (the letters' last delay and their rise). */
export const BOOT_RISE_MS = 1200

/** Fade it out over whatever has arrived, then take it away. */
export function endBoot() {
  if (ended || !el) return
  ended = true
  el.dataset.leaving = ''
  setTimeout(() => el.remove(), 520)
}
