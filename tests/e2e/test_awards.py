# The title page's awards: one row per category (the title's own award and the people's together), four at most,
# and View all in the heading opens every award in a sheet, by ceremony.
from conftest import TOP
import mock_api as m

def aw(i, award, year, cat, won, person=None, rank=2):
    return {"id": i, "award": award, "year": year, "short_category": cat, "won": won, "person_name": person, "rank": rank}

def rows(pg):
    return pg.evaluate(f"[...({TOP}).querySelectorAll('.awards > .rows li')].map(l => l.innerText.replace(/\\n/g, ' | '))")

def test_awards_group_by_category(app):
    m.MODE['awards'] = [aw(1, 'Oscars', 1969, 'Best Visual Effects', True, 'Stanley Kubrick'), aw(2, 'Oscars', 1969, 'Best Visual Effects', True),
                        aw(3, 'Oscars', 1969, 'Best Director', False, 'Stanley Kubrick'), aw(4, 'Oscars', 1969, 'Best Director', False),
                        aw(5, 'Oscars', 1969, 'Production Design', False, 'Harry Lange'), aw(6, 'Oscars', 1969, 'Production Design', False, 'Ernest Archer')]
    try:
        pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2500)
        r = rows(pg)
        assert r == ['Oscars 1969 | Won · Best Visual Effects · Stanley Kubrick', 'Oscars 1969 | Nominated · Best Director · Stanley Kubrick',
                     'Oscars 1969 | Nominated · Production Design · Harry Lange, Ernest Archer'], r
        assert pg.evaluate(f"!({TOP}).querySelector('.awards .view-all')")
    finally:
        m.MODE.pop('awards', None)

def test_awards_view_all_opens_sheet(app):
    m.MODE['awards'] = [aw(i, 'Emmys', 2018 + i % 4, f'Category {i}', i % 3 == 0, f'Person {i}') for i in range(1, 10)]
    try:
        pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2500)
        assert len(rows(pg)) == 4
        assert all('Won' in x for x in rows(pg)[:3]), rows(pg)   # wins first
        pg.evaluate(f"({TOP}).querySelector('.awards .view-all').click()"); pg.wait_for_timeout(700)
        heads = pg.evaluate("[...document.querySelectorAll('dialog[open] .lb-list h3')].map(h => h.textContent)")
        assert heads == ['Emmys 2021', 'Emmys 2020', 'Emmys 2019', 'Emmys 2018'], heads
        assert pg.evaluate("document.querySelectorAll('dialog[open] .lb-list li').length") == 9
        assert pg.evaluate("document.querySelector('dialog[open] .aw-sum').textContent") == '3 wins · 9 in all'
    finally:
        m.MODE.pop('awards', None)
