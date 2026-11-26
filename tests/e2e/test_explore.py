# Explore: a Browse list made of filters shows them as chips that can be taken off, the heading follows them, and
# Browse › All titles opens the same page with nothing set. Lists that aren't filters stay fixed.
from conftest import TOP
import mock_api as m

def heading(pg): return pg.evaluate(f"({TOP}).querySelector('.grid-head h1').textContent")
def chips(pg): return pg.evaluate(f"[...({TOP}).querySelectorAll('.s-chips button')].map(b => b.textContent.replace('close', ''))")
def posters(pg): return pg.evaluate(f"({TOP}).querySelectorAll('.grid > li:not(.s-loadon)').length")
def drop(pg, label):
    pg.evaluate(f"[...({TOP}).querySelectorAll('.s-chips button')].find(b => b.getAttribute('aria-label') === 'Remove {label}').click()")
    pg.wait_for_timeout(900)

def own(cs):
    # Browse is the member's services: its lists start with My services on (26 Nov), a chip like the others
    assert 'My services' in cs, cs
    return [c for c in cs if c != 'My services']

def test_row_view_all_is_its_whole_row(app):
    # A category page's rows (new on your services, critics' favourites…) aren't filters: View all is the whole row,
    # in one request (browse_list), in the row's own order. 26 Nov.
    m.MODE['browse_asked'] = []
    pg = app(); pg.goto(m.B + '/browse/g/thriller/critics'); pg.settle(5000)
    assert heading(pg) == 'Critics’ favourites', heading(pg)
    asked = [b for k, b in m.MODE['browse_asked'] if k == 'list']
    assert asked and asked[-1]['p_row'] == 'critics' and asked[-1]['p_sort'] is None and asked[-1]['p_rule'] == {'genres': ['Thriller', 'Mystery']}, asked
    assert posters(pg) > 0

def test_decade_list_widens_to_all_titles(app):
    pg = app(); pg.goto(m.B + '/browse/g/90s/list'); pg.settle(5000)
    assert heading(pg) == '90s' and own(chips(pg)) == ['90s'], (heading(pg), chips(pg))
    drop(pg, '90s')
    assert heading(pg) == 'All titles'

def test_several_decades_from_the_drawer(app):
    pg = app(); pg.goto(m.B + '/browse/g/90s/list'); pg.settle(5000)
    pg.evaluate(f"({TOP}).querySelector('.wl-tune').click()"); pg.wait_for_timeout(600)
    pg.click('dialog[open] [data-row=decade]'); pg.wait_for_timeout(600)
    pg.evaluate("[...document.querySelectorAll('dialog[open] .fd-opt')].find(b => b.textContent.startsWith('2000s')).click()"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('dialog[open] .fd-action button').click()"); pg.wait_for_timeout(1200)
    assert own(chips(pg)) == ['2000s', '90s'], chips(pg)
    assert heading(pg) == '90s & 2000s', heading(pg)

def test_all_titles_from_browse_counts_and_loads_on(app):
    m.MODE['pool'] = 200
    try:
        pg = app(); pg.goto(m.B + '/browse'); pg.settle(5000)
        link = pg.evaluate("[...document.querySelectorAll('.br-head a')].map(a => a.textContent + '|' + a.getAttribute('href'))")
        assert link == ['All titles|/browse/titles'], link
        pg.evaluate("document.querySelector('.br-head a').click()"); pg.wait_for_timeout(2500)
        assert pg.evaluate("location.pathname") == '/browse/titles'
        assert heading(pg) == 'All titles' and own(chips(pg)) == []
        total = len([i for i in range(41, 241) if i % 5])
        pills = pg.evaluate(f"[...({TOP}).querySelectorAll('.wl-pill')].map(b => b.textContent)")
        assert pills[0] == f'All{total}', pills
        assert posters(pg) == 60
        for _ in range(4):
            pg.evaluate(f"({TOP}).querySelector('.s-loadon')?.scrollIntoView()"); pg.wait_for_timeout(800)
        assert posters(pg) == total, posters(pg)
    finally:
        m.MODE.pop('pool', None)

def test_a_list_that_is_not_filters_stays_fixed(app):
    pg = app(); pg.goto(m.B + '/browse/g/trending/list'); pg.settle(5000)
    assert heading(pg) == 'Trending' and chips(pg) == []

def test_country_from_the_drawer(app):
    pg = app(); pg.goto(m.B + '/browse/titles'); pg.settle(5000)
    pg.evaluate(f"({TOP}).querySelector('.wl-tune').click()"); pg.wait_for_timeout(600)
    pg.click('dialog[open] [data-row=country]'); pg.wait_for_timeout(600)
    pg.evaluate("[...document.querySelectorAll('dialog[open] .fd-opt')].find(b => b.textContent.startsWith('Sweden')).click()"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('dialog[open] .fd-action button').click()"); pg.wait_for_timeout(1200)
    assert own(chips(pg)) == ['From Sweden'], chips(pg)
    assert heading(pg) == 'Sweden', heading(pg)
    drop(pg, 'From Sweden')
    assert heading(pg) == 'All titles'

def test_browse_title_sits_where_the_other_tabs_have_it(app):
    pg = app()
    top = "document.querySelector('.tab-head h1').getBoundingClientRect().top"
    pg.goto(m.B + '/watchlist'); pg.settle(4000); w = pg.evaluate(top)
    pg.goto(m.B + '/browse'); pg.settle(4000); b = pg.evaluate(top)
    assert abs(w - b) < 0.5, (w, b)
    # All titles on the title's baseline: the bottoms of their text lines differ only by the fonts' descents
    gap = pg.evaluate("""(() => { const r = (el) => { const g = document.createRange(); g.selectNodeContents(el); return g.getBoundingClientRect() }
      const h = r(document.querySelector('.br-head h1')), a = r(document.querySelector('.br-head a'))
      return (h.bottom - 26 * 0.24) - (a.bottom - 16 * 0.24) })()""")
    assert abs(gap) < 3, gap

def test_totals_come_in_one_request_without_counting_through_the_list(app):
    # The pills' totals (all, films, series) are one call to title_totals, not three HEAD counts through the list's
    # own query (which built every title's services only to count them: 1 to 1.4 s each). 26 Nov.
    pg = app()
    heads = []
    pg.on('request', lambda r: heads.append(r.url) if r.method == 'HEAD' and '/rest/v1/titles' in r.url else None)
    asked = []
    pg.on('request', lambda r: asked.append(r.post_data) if 'rpc/title_totals' in r.url else None)
    pg.goto(m.B + '/browse/g/90s/list'); pg.settle(5000)
    import json
    mine = [json.loads(a)['f'] for a in asked if '"decades":[[1990,1999]]' in a]
    assert len(mine) == 1 and mine[0].get('services'), asked
    assert heads == [], heads
    total = len([i for i in range(41, 55) if i % 5])
    pills = pg.evaluate(f"[...({TOP}).querySelectorAll('.wl-pill')].map(b => (b.getAttribute('aria-label') || '') + '|' + b.textContent)")
    assert any(str(total) in p for p in pills), pills
