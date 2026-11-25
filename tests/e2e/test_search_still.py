# With the keyboard up, iOS lets a drag on Search's still parts move the whole page up (the field slid away and
# snapped back, 25 Nov). A drag there is held; a drag on results that can scroll is left to scroll.
import mock_api as m

DRAG = """(sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect()
  const t = new Touch({identifier: 1, target: el, clientX: r.x + 10, clientY: r.y + 10})
  const e = new TouchEvent('touchmove', {bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t]})
  el.dispatchEvent(e); return e.defaultPrevented }"""

def test_search_page_holds_still(app):
    pg = app(); pg.goto(m.B + '/search'); pg.settle(5000)
    assert pg.evaluate(DRAG, '.s-idle h1') is True
    pg.fill('input[type=search], input', 'thriller 90s'); pg.settle(5000)
    # (the mock's results are short: make the list shorter than them, so it can scroll)
    pg.evaluate("document.querySelector('.s-list').style.bottom = '600px'")
    assert pg.evaluate("(() => { const l = document.querySelector('.s-list'); return l.scrollHeight > l.clientHeight })()")
    assert pg.evaluate(DRAG, '.s-list li') is False
