# Placeholders sit where the content arrives: for every page with placeholders, the first heading, poster, card or
# line of the placeholders and of the page that replaces them are measured, and must be in the same place and size
# (within 3 px). Placeholders are drawn by hand (`Skeleton` in src/ui, `.now-holders` on Home), so a design change
# to a page that isn't carried over to its placeholders fails here, before it can reach main.
import re
import pytest
import mock_api as m
from conftest import open_app, TOP

BOX = """(sel) => { const m = %s; const el = m && m.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect()
  return [r.x, r.y, r.width, r.height] }""" % TOP
KEEP = re.compile(r'/rest/v1/(profiles|user_services|services\b|services\?|data_stamp|watchlist|letterboxd|push_)')

def measure(path, pairs, hold=lambda u: '/rest/v1/' in u and not KEEP.search(u), wait=2500, personal=True):
    m.CASE['personal'] = personal
    pg = open_app(); held = []; st = {'hold': True}
    def h(r):
        if st['hold'] and hold(r.request.url): held.append(r); return
        return r.fallback()
    pg.route(re.compile(r'.*'), h)
    try:
        pg.goto(m.B + path); pg.wait_for_timeout(wait)
        skel = {k: pg.evaluate(BOX, s) for k, (s, _) in pairs.items()}
        st['hold'] = False
        for r in held: r.fallback()
        pg.settle(8000); pg.wait_for_timeout(1000)
        real = {k: pg.evaluate(BOX, s) for k, (_, s) in pairs.items()}
        return skel, real
    finally:
        m.CASE['personal'] = True
        pg.context.close()

def same(skel, real, size=True, centre=False):
    for k in skel:
        a, b = skel[k], real[k]
        assert a and b, (k, a, b)
        if centre:   # a text line: the placeholder bar is centred on the line, and only its height differs
            assert abs(a[0] - b[0]) <= 3 and abs((a[1] + a[3] / 2) - (b[1] + b[3] / 2)) <= 3, (k, a, b)
        else:
            assert all(abs(x - y) <= 3 for x, y in zip(a[:2], b[:2])), (k, a, b)
            if size: assert all(abs(x - y) <= 3 for x, y in zip(a[2:], b[2:])), (k, a, b)

@pytest.mark.parametrize('path,pairs', [
    ('/browse/c/drama', {'poster': ('.skel span', 'section.row .cover')}),
    ('/browse/titles', {'poster': ('.skel span', '.cover')}),
    ('/person/1', {'picture': ('.skel header i', '.person-head .avatar'), 'poster': ('.skel > div span', '.cover')}),
    ('/browse', {'card': ('.skel span', '.br-card')}),
])
def test_placeholders_sit_where_the_content_arrives(app, path, pairs):
    skel, real = measure(path, pairs)
    same(skel, real)

def test_row_and_title_headings_line_up(app):
    skel, real = measure('/browse/c/drama', {'heading': ('.skel i', 'section.row h2')})
    same(skel, real, centre=True)
    skel, real = measure('/title/3', {'name': ('.skel i', 'h1')})
    same(skel, real, size=False)

def test_home_placeholders(app):
    # Home's come only after 8 s (the wordmark stands in before): hold Home's own data past that
    skel, real = measure('/', {'poster': ('.now-holders section > div span', '.now-in section.row .cover')},
                         hold=lambda u: re.search(r'/rest/v1/(rpc/home_|titles|availability|awards)', u), wait=9500, personal=False)
    same(skel, real)
