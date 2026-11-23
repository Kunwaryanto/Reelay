# More like this on a title page: the stored list, in its order, with the member's services first and films
# they've logged on Letterboxd left out.
from conftest import TOP
import mock_api as m

def test_more_like_this(app):
    svc = m.MODE.get('svc'); m.MODE['svc'] = ['hbo-max']; m.ST['acct'] = m.ACC   # hbo-max: titles 10 and 2 + 8k; logged films 3, 6, 9, 12
    try:
        pg = app()
        pg.goto(m.B + '/title/1'); pg.wait_for_timeout(2500)
        ids = pg.evaluate(f"""(() => {{ const s = [...({TOP}).querySelectorAll('section')].find(x => x.innerText.startsWith('More like this'));
          return s ? [...s.querySelectorAll('a[href^="/title/"]')].map(a => +a.getAttribute('href').split('/')[2]) : null }})()""")
        assert ids == [10, 4, 5, 7, 8, 11, 13, 14]
    finally:
        m.MODE['svc'] = svc; m.ST['acct'] = None
