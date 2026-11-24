# The title page's name is never clipped: no line limit, so the last line's g, j, p and y always show in full.
import mock_api as m

def test_the_name_is_never_clipped(app):
    pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2000)
    style = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('#t-title')); return [s.overflow, s.webkitLineClamp] })()")
    assert style[0] == 'visible' and style[1] in ('none', '', None), style

def test_a_nordic_title_lists_its_english_one(app):
    # a Nordic film is shown by its own title; Details names the English one
    m.MODE['title_en'] = 'The Celebration'
    try:
        pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2000)
        rows = pg.evaluate("[...document.querySelectorAll('dt')].map(d => d.textContent + ': ' + d.nextElementSibling?.textContent)")
        assert 'English title: The Celebration' in rows, rows
    finally:
        m.MODE.pop('title_en', None)
