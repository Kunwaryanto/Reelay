# Pull to refresh asks for the sync stamp and reloads the page; Search and Settings have none.
import re
import pytest
import mock_api as m

def pull(pg):
    c = pg.context.new_cdp_session(pg)
    t = lambda kind, y: c.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [] if kind == 'touchEnd' else [{'x': 200, 'y': y}]})
    t('touchStart', 200)
    for y in range(200, 560, 20): t('touchMove', y); pg.wait_for_timeout(20)
    t('touchEnd', 0); pg.wait_for_timeout(1600)

@pytest.mark.parametrize('path,refreshes', [('/', True), ('/title/3', True), ('/browse', True), ('/browse/c/drama', True),
                                            ('/watchlist', True), ('/search', False), ('/settings', False)])
def test_pull(app, path, refreshes):
    pg = app(); asked = []
    pg.context.route(re.compile(r'.*/rest/v1/data_stamp.*'), lambda r: (asked.append(1), r.fulfill(json={'finished_at': 's1'}))[1])
    pg.goto(m.B + path); pg.wait_for_timeout(2600)
    k = len(asked); pull(pg)
    assert (len(asked) > k) == refreshes
