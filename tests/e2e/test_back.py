# Every back button sits at the same height, whatever kind of page it is on.
import mock_api as m

def test_back_buttons_line_up(app):
    pg = app()
    seen = {}
    for u in ['/title/3', '/person/1', '/browse/titles', '/settings', '/settings/services', '/privacy']:
        pg.goto(m.B + u); pg.wait_for_timeout(1800)
        seen[u] = pg.evaluate("""(() => { const b = [...document.querySelectorAll('[aria-label=Back]')].filter(x => x.offsetParent && !x.closest('[inert]')).pop()
          if (!b) return null; const i = b.querySelector('.ms').getBoundingClientRect(); return Math.round(i.top + i.height / 2) })()""")
    assert len(set(seen.values())) == 1 and None not in seen.values(), seen
