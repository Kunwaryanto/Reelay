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


def test_watchlist_news_under_the_hero(app):
    # what arrived on the watchlist in the last two weeks is one line under the hero, not a row of the whole list
    from conftest import TOP
    pg = app()
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    news = pg.evaluate(f"""(() => {{ const n = ({TOP}).querySelector('.news'); if (!n) return null
      return {{ head: n.querySelector('b').textContent, sub: n.querySelector('small').textContent, posters: n.querySelectorAll('.cover').length,
        afterHero: n.previousElementSibling?.classList.contains('hero'), rows: [...({TOP}).querySelectorAll('section.row h2')].map(h => h.textContent) }} }})()""")
    assert news, 'the news line is shown'
    assert news['head'] == '2 just arrived', news   # the mock's other two arrived 22 and 32 days ago
    assert 'on Netflix' in news['sub'] and news['posters'] == 2 and news['afterHero']
    assert 'From your watchlist' not in news['rows']
    pg.locator('.news').click(); pg.wait_for_timeout(1200)
    assert pg.evaluate("location.pathname") == '/watchlist' or pg.evaluate("!!document.querySelector('[data-tab=watchlist][aria-current], .wl')"), 'more than one: opens the Watchlist'


def test_no_news_no_line(app):
    from conftest import TOP
    m.MODE['news'] = False
    try:
        pg = app()
        pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
        assert pg.evaluate(f"!({TOP}).querySelector('.news')")
    finally:
        m.MODE.pop('news', None)


def test_news_forgets_what_was_seen(app):
    # an arrival leaves the line once its page was opened; something leaving stays until it leaves
    from conftest import TOP
    m.MODE['leave'] = True
    try:
        pg = app()
        line = lambda: pg.evaluate(f"(() => {{ const n = ({TOP}).querySelector('.news'); return n && [n.querySelector('b').textContent, n.querySelector('small').textContent] }})()")
        pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
        head, sub = line()
        assert head == '2 just arrived' and 'leaves' in sub, (head, sub)
        for t in (500, 501, 505):
            pg.goto(m.B + f'/title/{t}'); pg.wait_for_timeout(1200)
        pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
        head, sub = line()
        assert head == 'Leaving soon' and 'leaves' in sub, (head, sub)
    finally:
        m.MODE.pop('leave', None)


def test_days_are_the_phones(app):
    # half past midnight in Stockholm is still yesterday in UTC: "tomorrow" is the phone's tomorrow
    from conftest import TOP
    m.MODE.update(tz='Europe/Stockholm', leave='2026-11-27', news=False)
    try:
        pg = app()
        pg.clock.set_fixed_time('2026-11-25T23:30:00Z')   # 26 Nov, 00:30 in Stockholm
        pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
        sub = pg.evaluate(f"({TOP}).querySelector('.news small')?.textContent")
        assert sub and 'leaves' in sub and sub.endswith('tomorrow'), sub
    finally:
        for k in ('tz', 'leave', 'news'): m.MODE.pop(k, None)
