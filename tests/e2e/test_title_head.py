# The title page's name is never clipped: no line limit, so the last line's g, j, p and y always show in full.
import mock_api as m

def test_the_name_is_never_clipped(app):
    pg = app(); pg.goto(m.B + '/title/3'); pg.settle(4000)
    style = pg.evaluate("(() => { const s = getComputedStyle(document.querySelector('#t-title')); return [s.overflow, s.webkitLineClamp] })()")
    assert style[0] == 'visible' and style[1] in ('none', '', None), style

def test_a_nordic_title_lists_its_english_one(app):
    # a Nordic film is shown by its own title; Details names the English one
    m.MODE['title_en'] = 'The Celebration'
    try:
        pg = app(); pg.goto(m.B + '/title/3'); pg.settle(4000)
        rows = pg.evaluate("[...document.querySelectorAll('dt')].map(d => d.textContent + ': ' + d.nextElementSibling?.textContent)")
        assert 'English title: The Celebration' in rows, rows
    finally:
        m.MODE.pop('title_en', None)

def _art(pg):
    return pg.evaluate("(() => { const i = document.querySelector('.title-art'); return [i.getAttribute('src'), i.dataset.poster] })()")

def test_the_picture_chosen_by_the_sync(app):
    # a textless poster at 780 wide, framed from the top; a textless backdrop at full size; else the backdrop as before
    try:
        m.MODE['hero'] = ['/textless-poster.jpg', True]
        pg = app(); pg.goto(m.B + '/title/3'); pg.settle(4000)
        assert _art(pg) == ['https://image.tmdb.org/t/p/w780/textless-poster.jpg', 'true'], _art(pg)
        m.MODE['hero'] = ['/textless-backdrop.jpg', False]
        pg = app(); pg.goto(m.B + '/title/3'); pg.settle(4000)
        assert _art(pg) == ['https://image.tmdb.org/t/p/original/textless-backdrop.jpg', 'false'], _art(pg)
        m.MODE.pop('hero')
        pg = app(); pg.goto(m.B + '/title/3'); pg.settle(4000)
        assert _art(pg)[0].startswith('https://image.tmdb.org/t/p/w1280/'), _art(pg)
    finally:
        m.MODE.pop('hero', None)
