# The line under a poster: year first, then how long it is (a film's runtime as 2h 6m, a series' seasons).
import re
from conftest import TOP
import mock_api as m

def test_poster_meta_is_year_then_length(app):
    pg = app()
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    metas = pg.evaluate(f"[...({TOP}).querySelectorAll('.card .card-meta')].map(e => e.textContent)")
    assert metas
    for t in metas:
        if not re.match(r'\d{4} · |Film$|Series$', t): continue   # rows with their own notes (friends, leaving)
        assert re.fullmatch(r'(\d{4} · )?((\d+h( \d+m)?|\d+m)|\d+ seasons?|Film|Series)', t), t
    assert any(re.search(r'\d+h \d+m|\d+m$', t) for t in metas), metas
    assert any('season' in t for t in metas), metas

def test_hero_meta_is_service_length_genre(app):
    pg = app()
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    metas = pg.evaluate(f"[...({TOP}).querySelectorAll('.hero-meta')].map(e => e.textContent)")
    assert metas
    for t in metas:
        assert 'Film' not in t.split(' · ') and 'Series' not in t.split(' · ') or not re.search(r'\d', t), t
        assert re.search(r'\d+h( \d+m)?|\d+m|\d+ seasons?|Film|Series', t), t


def test_poster_corner_shows_the_service_logo(app):
    pg = app()
    pg.goto(m.B + '/'); pg.wait_for_timeout(2500)
    marks = pg.evaluate(f"[...({TOP}).querySelectorAll('.cover-mark')].map(e => [e.querySelector('img') ? 'img' : 'text', e.textContent])")
    assert marks
    # every service in the mock has a logo now: no names written out
    assert all(kind == 'img' for kind, _ in marks), marks
