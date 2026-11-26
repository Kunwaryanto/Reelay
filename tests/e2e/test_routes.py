# Every kind of address opens its screen, with the tab bar shown or hidden as routes.ts says.
import pytest
from conftest import TOP
import mock_api as m

CASES = [
    ('/settings', False, 'Settings'), ('/settings/services', False, None), ('/settings/letterboxd', False, 'Letterboxd'),
    ('/privacy', False, 'Privacy'), ('/browse/g/leaving-soon/list', True, None), ('/browse/all/lists/film', True, 'Lists'),
    ('/watchlist', True, 'Watchlist'), ('/title/3', True, None), ('/nowhere', True, 'available'),
]

@pytest.mark.parametrize('path,bar,text', CASES)
def test_route(app, path, bar, text):
    pg = app()
    pg.goto(m.B + path); pg.settle(4000)
    shown = pg.evaluate("document.querySelector('.tabbar')?.dataset.hidden") == 'false'
    assert shown == bar
    if text: assert text in pg.evaluate(f"({TOP})?.innerText || ''")
