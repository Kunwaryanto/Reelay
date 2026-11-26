# Swiping a page back decides like iOS: the way the finger is moving when it lets go, not only how far the page got.
# Chrome can't pan the strip with a synthetic finger, so the test places the strip where a short swipe would have
# taken it and sends the finger's touches; the snap does the rest, as Safari's does on the phone.
from conftest import TOP
import mock_api as m

STRIP = "document.querySelector('.stack[data-active=true]')"

def open_title(app):
    pg = app()
    pg.goto(m.B + '/'); pg.settle(5000)
    pg.evaluate(f"(() => {{ const a = ({TOP}).querySelector('a.card'); a.dispatchEvent(new PointerEvent('pointerdown', {{bubbles: true}})); a.click() }})()")
    pg.wait_for_timeout(1500)
    assert pg.evaluate("location.pathname").startswith('/title/')
    return pg

def swipe(pg, xs):
    """The strip a quarter of the way back, then one finger through xs (16 ms apart), then up."""
    pg.evaluate(f"""(async (xs) => {{
      const s = {STRIP}, w = s.clientWidth, top = s.children[s.children.length - 1]
      const t = (x) => [new Touch({{identifier: 1, target: top, clientX: x, clientY: 600}})]
      const send = (type, x) => s.dispatchEvent(new TouchEvent(type, {{bubbles: true, touches: type === 'touchend' ? [] : t(x), changedTouches: t(x)}}))
      send('touchstart', xs[0])
      s.style.scrollSnapType = 'none'; s.scrollLeft = (s.children.length - 1) * w - w / 4
      for (const x of xs.slice(1)) {{ await new Promise((r) => setTimeout(r, 16)); send('touchmove', x) }}
      window.__going = top.dataset.going !== undefined
      send('touchend', xs[xs.length - 1]); s.style.scrollSnapType = ''
    }})""", xs)
    pg.wait_for_timeout(1500)
    return pg.evaluate("window.__going")

def test_quick_short_swipe_closes(app):
    pg = open_title(app)
    assert swipe(pg, [60, 75, 90, 105, 120])           # moving right when it lets go
    assert not pg.evaluate("location.pathname").startswith('/title/')

def test_swipe_that_turns_back_stays(app):
    pg = open_title(app)
    assert not swipe(pg, [60, 90, 120, 150, 130, 110, 90])   # out, then back left before letting go
    assert pg.evaluate("location.pathname").startswith('/title/')
    assert pg.evaluate(f"(() => {{ const s = {STRIP}; return Math.abs(s.scrollLeft - (s.children.length - 1) * s.clientWidth) < 1 }})()")
