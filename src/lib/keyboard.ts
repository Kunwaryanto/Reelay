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
