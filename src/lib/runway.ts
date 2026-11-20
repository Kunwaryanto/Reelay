// Safari only (not the Home Screen app): Safari 26 draws page content behind its status bar and floating address
// bar only while the document itself is scrolled. The signed-in app scrolls inside itself, so while it's shown the
// document is made a little taller than the screen and held scrolled by --run-top: the app reaches up behind the
// status bar and down behind the address bar, and its UI keeps inside the visible part (see html[data-runway]).

/** Running as the Home Screen app (not in a browser tab). */
export const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const phone = matchMedia('(pointer: coarse) and (max-width: 760px)').matches
export const canRunway = !standalone && phone

const restY = () => (document.documentElement.dataset.runway !== undefined
  ? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--run-top')) || 0
  : 0)
const hold = () => { const y = restY(); if (Math.round(window.scrollY) !== y || window.scrollX !== 0) window.scrollTo(0, y) }

export function setRunway(on: boolean) {
  if (!canRunway) return
  if (on) document.documentElement.dataset.runway = ''
  else delete document.documentElement.dataset.runway
  requestAnimationFrame(hold)
}

// The document never scrolls on its own: pages scroll inside the app. If iOS scrolls it (to show a focused field,
// or a stray drag), put it back once it has settled, not on every scroll event (snapping back mid-animation jumps).
let settle = 0
window.addEventListener('scroll', () => { clearTimeout(settle); settle = window.setTimeout(hold, 300) }, { passive: true })
