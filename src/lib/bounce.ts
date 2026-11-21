// The picture at the top of a page stays at the top of the screen when iOS bounces the page down (flicking up
// into the top), the same way it does for a pull that starts at the top: the page reports a scroll position
// above zero, and that distance goes into --pull, which the picture uses to stay put and grow (see app.css).
// One listener for every page: scroll events don't bubble, but they can be caught on the way down.
//
// Two things keep it smooth:
// - --pull is set on the picture's own block, not the page, so only those few elements are restyled per frame;
// - scroll positions reach us a frame late, so on the way down the picture is sent a little further than
//   reported (by how far the page moved since the last frame). Too far is invisible, it is above the screen;
//   not far enough would flash a strip of black at the top.
const art = new WeakMap<HTMLElement, { el: HTMLElement | null; last: number }>()

export function watchTopBounce(): () => void {
  const seen = (e: Event) => {
    const page = e.target
    if (!(page instanceof HTMLElement) || !page.classList.contains('page') || 'ptr' in page.dataset) return
    const over = page.scrollTop < 0 ? -page.scrollTop : 0
    let a = art.get(page)
    if (!over && !a?.last) return
    if (!a || !a.el?.isConnected) { a = { el: page.querySelector<HTMLElement>('.hero-stage, .title-top'), last: 0 }; art.set(page, a) }
    // at rest the value is taken off again, so the page's own --pull (pull to refresh) reaches the picture
    if (a.el) { if (over) a.el.style.setProperty('--pull', `${over + Math.max(0, over - a.last) * 1.5}px`); else a.el.style.removeProperty('--pull') }
    a.last = over
  }
  document.addEventListener('scroll', seen, { capture: true, passive: true })
  return () => document.removeEventListener('scroll', seen, { capture: true })
}
