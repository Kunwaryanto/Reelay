// The picture at the top of a page stays at the top of the screen when iOS bounces the page down (flicking up
// into the top), the same way it does for a pull that starts at the top: the page reports a scroll position
// above zero, and that distance goes into --pull, which the picture uses to stay put and grow (see app.css).
// One listener for every page: scroll events don't bubble, but they can be caught on the way down.
export function watchTopBounce(): () => void {
  const seen = (e: Event) => {
    const el = e.target
    if (!(el instanceof HTMLElement) || !el.classList.contains('page') || 'ptr' in el.dataset) return
    const over = el.scrollTop < 0 ? -el.scrollTop : 0
    if (over || el.style.getPropertyValue('--pull')) el.style.setProperty('--pull', `${over}px`)
  }
  document.addEventListener('scroll', seen, { capture: true, passive: true })
  return () => document.removeEventListener('scroll', seen, { capture: true })
}
