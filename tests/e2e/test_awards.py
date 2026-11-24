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
        assert r == ['Won · Oscars 1969 | Best Visual Effects · Stanley Kubrick', 'Nominated · Oscars 1969 | Best Director · Stanley Kubrick',
                     'Nominated · Oscars 1969 | Production Design · Harry Lange +1'], r
        # a "+1" hides a name: View all, and a row opens the sheet with everyone
        assert pg.evaluate(f"!!({TOP}).querySelector('.awards .view-all')")
        pg.evaluate(f"[...({TOP}).querySelectorAll('.awards > .rows button')][2].click()"); pg.wait_for_timeout(800)
        names = pg.evaluate("[...document.querySelectorAll('dialog[open] .lb-list li')].map(l => l.innerText.replace(/\\n/g, ' | '))")
        assert 'Production Design | Nominated · Harry Lange, Ernest Archer' in names, names
    finally:
        m.MODE.pop('awards', None)

def test_awards_that_fit_are_plain_rows(app):
    m.MODE['awards'] = [aw(1, 'Oscars', 1969, 'Best Visual Effects', True, 'Stanley Kubrick'), aw(2, 'Oscars', 1969, 'Best Director', False)]
    try:
        pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2500)
        assert pg.evaluate(f"!({TOP}).querySelector('.awards .view-all') && !({TOP}).querySelector('.awards > .rows button')")
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

def test_a_cut_line_offers_the_sheet(app):
    m.MODE['awards'] = [aw(1, 'Oscars', 1969, 'Best Writing, Story and Screenplay Written Directly for the Screen', False, 'Arthur C. Clarke')]
    try:
        pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2500)
        assert pg.evaluate(f"!!({TOP}).querySelector('.awards .view-all') && !!({TOP}).querySelector('.awards > .rows button')")
    finally:
        m.MODE.pop('awards', None)
