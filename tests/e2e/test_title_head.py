# The title page's name is never clipped: no line limit, so the last line's g, j, p and y always show in full.
import mock_api as m

def test_the_name_is_never_clipped(app):
    pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2000)
    style = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('#t-title')); return [s.overflow, s.webkitLineClamp] })()")
    assert style[0] == 'visible' and style[1] in ('none', '', None), style
