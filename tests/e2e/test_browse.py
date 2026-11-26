# Browse, built like Home (26 Nov): the member's own services (the database knows them), moods and themes, a category
# page in one request (browse_page) with picks and rows, the cards' pictures in one request (browse_covers).
from conftest import TOP
import mock_api as m

def test_front_page_moods_first_and_pictures_in_one_request(app):
    m.MODE['browse_asked'] = []
    pg = app()
    pg.goto(m.B + '/browse'); pg.settle(6000)
    heads = pg.evaluate("[...document.querySelectorAll('.br-section h2')].map(h => h.textContent)")
    assert heads[0] == 'Moods & themes', heads
    cards = pg.evaluate("[...document.querySelectorAll('.br-section')][0].querySelectorAll('.br-card').length")
    assert cards == 6
    assert 'Feel-good' in pg.evaluate("document.querySelector('.br-section').textContent")
    covers = [b for k, b in m.MODE['browse_asked'] if k == 'covers']
    assert len(covers) == 1 and any(c['rule'] == {'mood': 'feel-good'} for c in covers[0]['p_cats']), covers

def test_no_card_picture_twice(app):
    # the categories share their popular titles; each card still gets its own picture, a small category first
    pg = app()
    pg.goto(m.B + '/browse'); pg.settle(5000)
    srcs = pg.evaluate("[...document.querySelectorAll('.br-card img')].map(i => i.getAttribute('src'))")
    assert len(srcs) > 10 and len(set(srcs)) == len(srcs), srcs

def test_category_page_is_one_request_with_picks_and_rows(app):
    m.MODE['browse_asked'] = []
    pg = app()
    pg.goto(m.B + '/browse/c/drama'); pg.settle(6000)
    # (the first cards' pages on Browse load ahead, one request each: only Drama's counts here)
    pages = [b for k, b in m.MODE['browse_asked'] if k == 'page' and b['p_rule'] == {'genres': ['Drama']}]
    assert len(pages) == 1, pages
    assert pages[0]['p_rows'][:2] == ['new', 'trending'] and pages[0]['p_rows'][-2:] == ['leaving', 'elsewhere'], pages[0]['p_rows']
    heads = pg.evaluate(f"[...({TOP}).querySelectorAll('section.row h2')].map(h => h.textContent)")
    # the picks, with Home's heading, a little way down: after the first two rows
    picks = pg.evaluate("(() => { const h = new Date().getHours(); return h >= 17 || h < 4 ? 'Tonight’s picks' : 'Today’s picks' })()")
    assert heads[:3] == ['New on your services', 'Trending', picks] and heads[-1] == 'On other services', heads
    reasons = pg.evaluate(f"[...({TOP}).querySelectorAll('.spot-top small')].map(s => s.textContent)")
    assert reasons[:2] == ['Because you liked Past Lives', 'Adam rated it 4.5'], reasons
    assert pg.evaluate(f"({TOP}).querySelector('.spot-by').textContent").endswith('by Celine Song')  # Directed by (a film), Created by (a series)

def test_a_mood_is_a_category(app):
    m.MODE['browse_asked'] = []
    pg = app(); pg.goto(m.B + '/browse/c/heist'); pg.settle(6000)
    pages = [b for k, b in m.MODE['browse_asked'] if k == 'page' and b['p_rule'] == {'mood': 'heist'}]
    assert len(pages) == 1, pages
    assert pg.evaluate(f"({TOP}).querySelector('h1').textContent") == 'Heists'

def test_nothing_on_your_services(app):
    m.MODE['browse_empty'] = True
    try:
        pg = app(); pg.goto(m.B + '/browse/c/drama'); pg.settle(6000)
        assert 'Nothing on your services here right now.' in pg.evaluate(f"({TOP}).textContent")
    finally:
        m.MODE.pop('browse_empty', None)
