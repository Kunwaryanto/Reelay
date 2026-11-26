# Every Settings button carries the update dot when a new version is out, and the dot springs in when it appears
# while the button is on screen.
import datetime
from conftest import TOP
import mock_api as m
from test_hero import hide

def test_dot_springs_in_on_every_settings_button(app):
    pg = app()
    pg.clock.install(time=datetime.datetime(2026, 11, 24, 12, 0)); pg.clock.resume()
    pg.goto(m.B + '/watchlist'); pg.settle(5000)
    assert pg.evaluate(f"!!({TOP}).querySelector('.settings-btn')"), 'Watchlist has the Settings button'
    assert not pg.evaluate(f"!!({TOP}).querySelector('.settings-btn > i')")
    # a deploy: the site now names another app script
    pg.route(m.B + '/', lambda r: r.fulfill(content_type='text/html', body='<script type="module" src="/assets/index-NEW.js"></script>') if r.request.resource_type == 'fetch' else r.fallback())
    hide(pg, True); pg.clock.fast_forward('11:00'); hide(pg, False)
    pg.wait_for_timeout(200)
    dot = pg.evaluate(f"(() => {{ const i = ({TOP}).querySelector('.settings-btn > i'); if (!i) return null; const a = i.getAnimations()[0]; return a ? a.playState : 'none' }})()")
    assert dot == 'running', dot          # appeared on screen, and is springing in
    pg.wait_for_timeout(1000)
    assert pg.evaluate(f"getComputedStyle(({TOP}).querySelector('.settings-btn > i')).transform") in ('none', 'matrix(1, 0, 0, 1, 0, 0)')
    # Home's button has it too
    pg.evaluate("history.replaceState(null, '', '/')")
    pg.goto(m.B + '/'); pg.settle(6000)
    assert pg.evaluate(f"!!({TOP}).querySelector('.now-settings .settings-btn')")
