// Opening Search with the keyboard already coming up.
// iOS only opens the keyboard for a field focused during the tap itself, and the Search field is still hidden
// when its tab is tapped. So the tap focuses a stand-in field (the keyboard starts), and Search takes the focus
// over once it is on screen.
let stand: HTMLInputElement | null = null

/** Call inside the tap that opens Search. */
export function summonKeyboard() {
  stand?.remove()
  stand = document.createElement('input')
  stand.setAttribute('aria-hidden', 'true')
  stand.type = 'search'
  stand.enterKeyHint = 'search'
  stand.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0'
  document.body.append(stand)
  stand.focus({ preventScroll: true })
  const mine = stand
  setTimeout(() => { mine.remove(); if (stand === mine) stand = null }, 1000)
}

/** Hand the summoned keyboard to the real field. False if no tap asked for it. */
export function takeKeyboard(field: HTMLInputElement | null): boolean {
  if (!stand || !field) return false
  field.focus({ preventScroll: true })
  stand.remove()
  stand = null
  return true
}

// ---- Every field, everywhere: no jump when the keyboard opens ----
// Left to itself, iOS scrolls the whole app up to "reveal" a tapped field as the keyboard comes up, and the
// page then settles back: a visible jump. So a tap on a field that isn't focused yet is taken over at
// touch-down: we focus it ourselves without scrolling, and the keyboard opens with the page standing still.
// Once a field has the focus its touches are left alone (caret, selection, the Paste menu).
// Installed once for the whole app, so a new screen with a field gets it without doing anything. Sheets and
// Search have their own handling (a sheet moves with the keyboard, Search rises with it): they are skipped.
const TYPED = new Set(['text', 'search', 'email', 'tel', 'url', 'number', 'password'])

export function guardFieldTaps() {
  document.addEventListener('touchstart', (e) => {
    const t = e.target as HTMLElement | null
    if (e.touches.length !== 1 || !t?.closest || t.closest('dialog.sheet, [data-own-focus]')) return
    const field = t.closest('input, textarea') as HTMLInputElement | HTMLTextAreaElement | null
    if (!field || field === document.activeElement || field.disabled || field.readOnly) return
    if (field instanceof HTMLInputElement && !TYPED.has(field.type)) return
    e.preventDefault()
    field.focus({ preventScroll: true })
  }, { passive: false, capture: true })
}

// ---- The app never scrolls as a whole ----
// Every page scrolls inside itself; the document always stands at the top. With the keyboard up, iOS still pans
// the visible area now and then (a field it wants to reveal, a drag on something that doesn't scroll): the sheet
// and Search jumped up and back. In the Home Screen app, while a field in a sheet or Search has the focus (both are
// laid out above the keyboard themselves), any such pan is put straight back. Elsewhere iOS may still reveal a field.
export function holdDocument() {
  const vv = window.visualViewport
  const placed = () => !!(document.activeElement as HTMLElement | null)?.closest?.('dialog.sheet, .search')
  const back = () => { if (placed() && ((vv && vv.offsetTop > 0) || window.scrollY > 0)) window.scrollTo(0, 0) }
  vv?.addEventListener('scroll', back)
  window.addEventListener('scroll', back)
  // Leaving the app (for Mail, to fetch the code) with a field in a sheet focused: iOS brought the keyboard back
  // by itself on return and panned the whole app up while it rose, then let go: the jump coming back from Mail.
  // Nothing panning can be put back mid-way, so the field lets go of the focus as the app is left; back in the
  // app the sheet stands still, and a tap on the field (focused without scrolling) or Paste code carries on.
  document.addEventListener('visibilitychange', () => {
    const a = document.activeElement as HTMLElement | null
    if (document.hidden && a?.closest?.('dialog.sheet') && a.matches('input, textarea')) a.blur()
  })
}
