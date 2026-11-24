# On the iPhone Home Screen the app adds no history entries, so iOS's own edge swipe back never has anything to
# slide in (it showed a snapshot of Home on Home). Going back is the app's own: the back button and the swipe.
from conftest import TOP
import mock_api as m

def test_home_screen_app_keeps_one_history_entry(app):
    pg = app()
    pg.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true })")
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    start = pg.evaluate("history.length")
    pg.evaluate(f"(() => {{ const a = ({TOP}).querySelector('a.card'); a.dispatchEvent(new PointerEvent('pointerdown', {{bubbles: true}})); a.click() }})()")
    pg.wait_for_timeout(1200)
    assert pg.evaluate("location.pathname").startswith('/title/')
    assert pg.evaluate("history.length") == start, 'no entry for iOS to go back to'
    pg.evaluate(f"({TOP}).querySelector('button[aria-label=Back]').click()"); pg.wait_for_timeout(1200)
    assert pg.evaluate("location.pathname") == '/'

def test_browser_keeps_history(app):
    pg = app()
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    start = pg.evaluate("history.length")
    pg.evaluate(f"(() => {{ const a = ({TOP}).querySelector('a.card'); a.dispatchEvent(new PointerEvent('pointerdown', {{bubbles: true}})); a.click() }})()")
    pg.wait_for_timeout(1200)
    assert pg.evaluate("history.length") == start + 1
    pg.go_back(); pg.wait_for_timeout(1200)
    assert pg.evaluate("location.pathname") == '/'
