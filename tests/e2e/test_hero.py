# The hero's white bar is its timer: the next slide comes when the bar fills, and the current slide starts over
# whenever the hero comes back into view (here: the app sent to the background and opened again).
from conftest import TOP
import mock_api as m

ON = f"(({TOP}).querySelector('.hero-slide[data-on=true]')?.getAttribute('aria-label') || '')"
BAR = f"(() => {{ const i = ({TOP}).querySelector('.hero-dots i'); return i ? i.getAnimations()[0]?.currentTime ?? -1 : -2 }})()"

def hide(pg, hidden):
    pg.evaluate("(h) => { Object.defineProperty(document, 'hidden', {configurable: true, get: () => h}); Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => h ? 'hidden' : 'visible'}); document.dispatchEvent(new Event('visibilitychange')) }", hidden)

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


def test_new_day_covers_then_shows_todays_home(app):
    # back on a new day: the wordmark covers the page while today's Home is made, and the page never goes blank
    pg = app()
    import datetime
    pg.clock.install(time=datetime.datetime(2026, 11, 24, 23, 50))   # ten minutes before midnight
    pg.clock.resume()
    pg.goto(m.B + '/'); pg.wait_for_timeout(3500)
    assert pg.evaluate(f"!!({TOP}).querySelector('.hero')")
    hide(pg, True)
    pg.clock.fast_forward('15:00')                                   # away a quarter of an hour, past midnight
    hide(pg, False)
    pg.wait_for_timeout(150)
    assert pg.evaluate("!!document.querySelector('.launch')"), 'the wordmark covers the page'
    seen_blank = False
    for _ in range(30):
        pg.wait_for_timeout(100)
        if not pg.evaluate(f"!!({TOP}).querySelector('.hero')"): seen_blank = True
    assert not seen_blank
    pg.wait_for_timeout(1500)
    assert not pg.evaluate("!!document.querySelector('.launch')"), 'and lifts again'
