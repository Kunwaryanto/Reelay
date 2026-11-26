# One long-press menu for the whole app: posters on Home, Browse and Watchlist open it.
import pytest
import mock_api as m
from conftest import TOP

@pytest.mark.parametrize('path,sel', [('/', '.now-in .card'), ('/browse/c/drama', '.card'), ('/watchlist', '.wl-tile > a')])
def test_long_press_opens_the_menu(app, path, sel):
    pg = app()
    pg.goto(m.B + path); pg.settle(6000)
    box = pg.evaluate("(sel)=>{const m=%s; const el=m&&m.querySelector(sel); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/3]}" % TOP, sel)
    pg.mouse.move(*box); pg.mouse.down(); pg.wait_for_timeout(900); pg.mouse.up(); pg.wait_for_timeout(700)
    assert pg.evaluate("!!document.querySelector('.hold-menu, [class*=hold]')")
