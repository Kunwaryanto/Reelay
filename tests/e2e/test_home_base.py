# A phone with no Home saved (a first sign-in, a new phone) shows the quick Home at once, from the server's
# ready-made generic part (home_base, one request): trending, new, leaving, new films and series, no personal rows.
# The whole Home is built meanwhile and waits out of sight; it is put in place when Home next comes to the front.
import mock_api as m
from conftest import TOP

ROWS = "[...(%s).querySelectorAll('section.row h2, section.row .row-title')].map(h => h.innerText.trim())" % TOP

def test_first_home_is_quick_then_whole(app):
    m.MODE['base'] = True; m.MODE['base_asked'] = 0
    try:
        pg = app(); pg.goto(m.B + '/'); pg.settle(8000)
        assert m.MODE['base_asked'] == 1
        rows = pg.evaluate(ROWS)
        assert rows and not any(r.startswith('Because you liked') or r == 'Friends liked' for r in rows), rows
        # to another tab and back: the whole Home, with the member's own rows
        pg.locator('.tabbar button, .tabbar a').nth(1).click(force=True); pg.settle(4000)
        pg.locator('.tabbar button, .tabbar a').nth(0).click(force=True); pg.settle(4000)
        rows = pg.evaluate(ROWS)
        assert any(r.startswith('Because you liked') for r in rows), rows
        # and the next opening has the whole one saved: no base asked again
        m.MODE["base_asked"] = 0
        pg.goto(m.B + '/'); pg.settle(8000)
        assert m.MODE['base_asked'] == 0
    finally:
        m.MODE['base'] = False
