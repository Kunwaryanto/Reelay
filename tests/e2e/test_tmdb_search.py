# Everything on TMDB can be found: after the catalogue's own results, TMDB's titles the catalogue doesn't have.
# Opening one saves it first, then opens its page like any other.
import mock_api as m

def test_tmdb_titles_follow_and_open(app):
    pg = app()
    pg.goto(m.B + '/search'); pg.settle(4000)
    pg.fill('input[type=search], input', '2001 a space odyssey'); pg.wait_for_timeout(2500)
    rows = pg.evaluate("[...document.querySelectorAll('.s-tmdb .wl-text b')].map(b => b.textContent)")
    assert rows == ['2001: A Space Odyssey'], rows
    pg.click('.s-tmdb button'); pg.wait_for_timeout(1500)
    assert pg.evaluate("location.pathname") == '/title/777'

def test_no_tmdb_titles_with_a_service(app):
    # "on Netflix" asks for what streams there: TMDB's titles don't
    pg = app()
    pg.goto(m.B + '/search'); pg.settle(4000)
    pg.fill('input[type=search], input', '2001 on netflix'); pg.wait_for_timeout(2500)
    assert pg.evaluate("document.querySelectorAll('.s-tmdb').length") == 0

def test_a_title_listed_above_is_not_listed_again(app):
    # the server leaves out what the catalogue has; if one slips through, the same type, name and year isn't repeated
    m.MODE['tmdb'] = [{'kind': 'series', 'tmdb_id': 1, 'title': 'Fargo', 'year': 2002, 'poster_path': None},
                      {'kind': 'film', 'tmdb_id': 2, 'title': 'Fargo', 'year': 1996, 'poster_path': None}]
    try:
        pg = app()
        pg.goto(m.B + '/search'); pg.settle(4000)
        pg.fill('input[type=search], input', 'fargo'); pg.wait_for_timeout(2500)
        rows = pg.evaluate("[...document.querySelectorAll('.s-tmdb .wl-text')].map(t => t.innerText.replace(/\\n/g, ' | '))")
        assert rows == ['Fargo | 1996 · Film'], rows
    finally:
        m.MODE.pop('tmdb', None)
