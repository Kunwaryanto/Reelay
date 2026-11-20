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

/** Hand the summoned keyboard to the real field. Does nothing if no tap asked for it. */
export function takeKeyboard(field: HTMLInputElement | null) {
  if (!stand || !field) return
  field.focus({ preventScroll: true })
  stand.remove()
  stand = null
}
