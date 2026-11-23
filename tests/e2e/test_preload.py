# Every link preloads its page on press: a tap through the app logs no "[pages]" warning; one that skips it does.
import mock_api as m
from conftest import TOP, tap

def test_links_preload(app):
    pg = app(); warns = []
    pg.on('console', lambda msg: warns.append(msg.text) if '[pages]' in msg.text else None)
    pg.goto(m.B + '/'); pg.wait_for_timeout(3500)
    back = lambda: (pg.evaluate('history.back()'), pg.wait_for_timeout(900))
    assert tap(pg, '.hero-slide[data-on]'); pg.wait_for_timeout(1300); back()
    assert tap(pg, '.spot'); pg.wait_for_timeout(1300); back()
    assert tap(pg, '.now-in section.row .card'); pg.wait_for_timeout(1300); back()
    pg.locator('.tabbar button, .tabbar a').nth(1).click(force=True); pg.wait_for_timeout(2500)
    assert tap(pg, '.br-card'); pg.wait_for_timeout(1300); back()
    assert warns == []
    # a tap whose link didn't preload is reported
    pg.locator('.tabbar button, .tabbar a').nth(0).click(force=True); pg.wait_for_timeout(1500)
    pg.evaluate("(()=>{const m=%s; document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); m.querySelectorAll('.now-in section.row .card')[7].click()})()" % TOP)
    pg.wait_for_timeout(800)
    assert any('opened without being preloaded' in w for w in warns)
