// Whether this is a computer (it gets the one "Made for your phone" page): decided before anything else loads.
/** A computer: no touch screen, or a screen wider than any phone. `?app` in the address shows the app anyway (testing). */
export function isDesktop(): boolean {
  try {
    if (new URLSearchParams(location.search).has('app')) sessionStorage.setItem('reelay:app-anyway', '1')
    if (sessionStorage.getItem('reelay:app-anyway')) return false
  } catch { /* storage blocked: decide by the screen alone */ }
  return !matchMedia('(pointer: coarse)').matches || matchMedia('(min-width: 700px) and (min-height: 700px)').matches
}
