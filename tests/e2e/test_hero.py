# The hero's white bar is its timer: the next slide comes when the bar fills, and the current slide starts over
# whenever the hero comes back into view (here: the app sent to the background and opened again).
from conftest import TOP
import mock_api as m

ON = f"(({TOP}).querySelector('.hero-slide[data-on=true]')?.getAttribute('aria-label') || '')"
BAR = f"(() => {{ const i = ({TOP}).querySelector('.hero-dots i'); return i ? i.getAnimations()[0]?.currentTime ?? -1 : -2 }})()"

def hide(pg, hidden):
    pg.evaluate("(h) => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => h}); document.dispatchEvent(new Event('visibilitychange')) }", hidden)

def test_bar_advances_and_restarts_on_return(app):
    pg = app()
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    first = pg.evaluate(ON)
    assert first
    pg.wait_for_timeout(1500)
    assert pg.evaluate(BAR) > 1000                    # the bar is running
    hide(pg, True); pg.wait_for_timeout(6000)
    assert pg.evaluate(ON) == first                   # nothing moves while the app is away
    hide(pg, False); pg.wait_for_timeout(300)
    assert pg.evaluate(ON) == first and 0 <= pg.evaluate(BAR) < 1000   # back: same slide, a fresh five seconds
    pg.wait_for_timeout(5200)
    assert pg.evaluate(ON) != first                   # and when the bar fills, the next one comes
