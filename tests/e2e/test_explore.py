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

def test_row_view_all_opens_its_filters_as_chips(app):
    pg = app(); pg.goto(m.B + '/browse/g/thriller/top-series'); pg.wait_for_timeout(2500)
    assert heading(pg) == 'Thriller series', heading(pg)
    assert chips(pg) == ['Thriller'], chips(pg)
    assert pg.evaluate(f"({TOP}).querySelector('.wl-pill[aria-pressed=true]').textContent").startswith('Series')
    drop(pg, 'Thriller')
    assert heading(pg) == 'Series' and chips(pg) == []

def test_decade_list_widens_to_all_titles(app):
    pg = app(); pg.goto(m.B + '/browse/g/90s/popular'); pg.wait_for_timeout(2500)
    assert heading(pg) == '90s' and chips(pg) == ['90s'], (heading(pg), chips(pg))
    drop(pg, '90s')
    assert heading(pg) == 'All titles'

def test_several_decades_from_the_drawer(app):
    pg = app(); pg.goto(m.B + '/browse/g/90s/popular'); pg.wait_for_timeout(2500)
    pg.evaluate(f"({TOP}).querySelector('.wl-tune').click()"); pg.wait_for_timeout(600)
    pg.click('dialog[open] [data-row=decade]'); pg.wait_for_timeout(600)
    pg.evaluate("[...document.querySelectorAll('dialog[open] .fd-opt')].find(b => b.textContent.startsWith('2000s')).click()"); pg.wait_for_timeout(300)
    pg.evaluate("document.querySelector('dialog[open] .fd-action button').click()"); pg.wait_for_timeout(1200)
    assert chips(pg) == ['2000s', '90s'], chips(pg)
    assert heading(pg) == '90s & 2000s', heading(pg)

def test_all_titles_from_browse_counts_and_loads_on(app):
    m.MODE['pool'] = 200
    try:
        pg = app(); pg.goto(m.B + '/browse'); pg.wait_for_timeout(2500)
        link = pg.evaluate("[...document.querySelectorAll('.br-head a')].map(a => a.textContent + '|' + a.getAttribute('href'))")
        assert link == ['All titles|/browse/titles'], link
        pg.evaluate("document.querySelector('.br-head a').click()"); pg.wait_for_timeout(2500)
        assert pg.evaluate("location.pathname") == '/browse/titles'
        assert heading(pg) == 'All titles' and chips(pg) == []
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
    pg = app(); pg.goto(m.B + '/browse/g/trending/list'); pg.wait_for_timeout(2500)
    assert heading(pg) == 'Trending' and chips(pg) == []
