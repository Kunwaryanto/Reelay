# With the keyboard up, iOS lets a drag on Search's still parts move the whole page up (the field slid away and
# snapped back, 25 Nov). While the keyboard is up a drag there is held (on the whole document); a drag on results
# that can scroll is left to scroll. Other tabs, with Search mounted behind them, scroll as usual.
import mock_api as m

DRAG = """(sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect()
  const t = new Touch({identifier: 1, target: el, clientX: r.x + 10, clientY: r.y + 10})
  const e = new TouchEvent('touchmove', {bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t]})
  el.dispatchEvent(e); return e.defaultPrevented }"""

def test_search_page_holds_still(app):
    pg = app(); pg.goto(m.B + '/search'); pg.settle(5000)
    pg.evaluate("document.querySelector('.s-input input').focus({ preventScroll: true })"); pg.wait_for_timeout(300)   # the keyboard is up
    assert pg.evaluate(DRAG, 'body') is True   # a touch beside the page is held too
    assert pg.evaluate(DRAG, '.s-idle h1') is True   # (a drag here also puts the keyboard away, like a list)
    pg.fill('input[type=search], input', 'thriller 90s'); pg.settle(5000)
    # (the mock's results are short: make the list shorter than them, so it can scroll)
    pg.evaluate("document.querySelector('.s-list').style.bottom = '600px'")
    assert pg.evaluate("(() => { const l = document.querySelector('.s-list'); return l.scrollHeight > l.clientHeight })()")
    assert pg.evaluate(DRAG, '.s-list li') is False


def test_other_tabs_scroll_with_search_behind_them(app):
    pg = app(); pg.goto(m.B + '/search'); pg.settle(5000)
    pg.evaluate("document.querySelector('.s-input input').blur()"); pg.wait_for_timeout(300)
    assert pg.evaluate(DRAG, 'body') is False
