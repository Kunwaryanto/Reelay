# Home loads only when the sync has run (or the day turned), shows yesterday's offline, and never swaps under you.
import re, time
from urllib.parse import unquote
import mock_api as m

def builds(pg):
    n = []
    def count(r):
        if 'rpc/home_because' in unquote(r.request.url): n.append(1)
        return m.hroute(r)
    pg.route(re.compile(r'.*/rest/v1/(?!data_stamp).*'), count)
    return n

def reopen(pg):
    t = time.time(); pg.reload()
    for _ in range(60):
        if pg.evaluate("!!document.querySelector('.now-in')"): return time.time() - t
        pg.wait_for_timeout(100)
    return None

def test_home_follows_the_sync(app):
    pg = app(home=False); n = builds(pg)
    pg.goto(m.B + '/'); pg.wait_for_timeout(3500)
    assert n, 'Home was built on the first open'
    k = len(n); assert reopen(pg) is not None; pg.wait_for_timeout(2500)
    assert len(n) == k, 'same sync, same day: the saved Home is used'
    pg.stamp['v'] = 's2'; reopen(pg); pg.wait_for_timeout(2500)
    assert len(n) > k, 'a new sync: Home is built again'
    k = len(n); pg.stamp['v'] = 's3'; pg.stamp['abort'] = True
    assert reopen(pg) is not None, 'offline: the saved Home is shown'
    pg.wait_for_timeout(2500)
    assert len(n) == k

def test_saving_rebuilds_quietly(app):
    pg = app(home=False); n = builds(pg)
    pg.goto(m.B + '/'); pg.wait_for_timeout(3500)
    before = pg.evaluate("document.querySelector('.now-in').innerText"); k = len(n)
    pg.evaluate("document.querySelector('.now-in section.row .card').click()"); pg.wait_for_timeout(1500)
    pg.locator('.wl-btn').last.click(); pg.wait_for_timeout(2500)
    assert len(n) > k, 'saving a title builds Home again'


def test_every_row_has_at_least_seven(app):
    import mock_api as m
    from conftest import TOP
    pg = app()
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    counts = pg.evaluate(f"[...({TOP}).querySelectorAll('section.row')].filter(s => s.querySelector('.card')).map(s => [s.querySelector('h2')?.textContent, s.querySelectorAll('.card').length])")
    assert counts
    for title, n in counts: assert n >= 7, (title, n)
    assert not any(t.startswith('Friends') for t, _ in counts)   # the mock's friends have 6 titles: left out


def test_award_row_shows_the_award(app):
    import re
    import mock_api as m
    from conftest import TOP
    pg = app()
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    rows = pg.evaluate(f"[...({TOP}).querySelectorAll('section.row')].map(s => [s.querySelector('h2')?.textContent, [...s.querySelectorAll('.card-meta')].map(e => e.textContent)])")
    award = [r for r in rows if re.search(r'Oscar|Emmy|Golden Globe|Best Picture', r[0] or '')]
    assert award, [r[0] for r in rows]
    notes = award[0][1]
    assert len(notes) >= 7 and all(re.match(r'Best \w+( \+\d+)?$', n) for n in notes), notes
    assert any('+1' in n for n in notes), notes   # each title once, with its other wins counted
