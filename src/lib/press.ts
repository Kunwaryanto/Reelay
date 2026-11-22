// The poster or row last pressed. When a page opens over it, it is put back to its normal size at once: its
// ease back from the pressed size otherwise gets cut short as the page covers it (iOS pauses what it no longer
// shows) and plays out when you come back, as a poster growing from small to normal.
let last: HTMLElement | null = null

export const notePressed = (el: HTMLElement) => { last = el }

export function settlePressed() {
  const el = last
  if (!el?.isConnected) return
  el.style.transition = 'none'
  delete el.dataset.pressed
  void el.offsetWidth // take the un-pressed size now, without the ease
  requestAnimationFrame(() => { el.style.transition = '' })
}
