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

def test_home_menu_facts_come_with_the_cards(app):
    # Home's cards carry the menu's facts (home_card, 20261126000900): the menu has them without a facts request
    m.MODE.update(facts=True, me_bundle=True)   # (the saved titles' facts come in the launch request)
    try:
        pg = app(); asked = []
        pg.on('request', lambda r: asked.append(r.url) if 'credits.role' in r.url else None)
        pg.goto(m.B + '/'); pg.settle(6000)
        box = pg.evaluate("(sel)=>{const m=%s; const el=m&&m.querySelector(sel); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/3]}" % TOP, '.now-in .card')
        pg.mouse.move(*box); pg.mouse.down(); pg.wait_for_timeout(900); pg.mouse.up(); pg.wait_for_timeout(700)
        text = pg.evaluate("document.querySelector('.hold')?.innerText ?? ''")
        assert 'Chad Stahelski' in text, text
        assert not asked, asked
    finally:
        m.MODE.update(facts=False, me_bundle=False)
