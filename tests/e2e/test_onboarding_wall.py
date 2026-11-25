# Onboarding's wall (and the titles picked from it for the Watchlist): each service's best-known titles, never
# kids' titles.
from urllib.parse import unquote
import mock_api as m

def test_wall_picks_known_titles(app):
    pg = app(); asked = []
    pg.on('request', lambda r: asked.append(unquote(r.url)))
    pg.goto(m.B + '/onboarding'); pg.wait_for_timeout(2500)
    wall = [u for u in asked if '/rest/v1/titles' in u and 'availability.service_id=eq.' in u]
    assert wall, 'the wall asks for each service\'s titles'
    assert all('order=fame.desc' in u and 'tags=not.cs.{kids}' in u for u in wall), wall[0]


def test_wall_offers_64_to_pick(app):
    # 8 × 8: the middle 36 are what Services shows; picking pans out to the rest, loaded while Services is up
    import re
    pg = app()
    def wall(r):
        u = r.request.url
        if 'availability.service_id=eq.' in u and '/rest/v1/titles' in u:
            sv = re.search(r'availability.service_id=eq.([^&]+)', u).group(1); base = abs(hash(sv)) % 50 * 40
            return r.fulfill(json=[dict(m.card(1000 + base + i), availability=[{'service_id': sv, 'leaves_on': None}]) for i in range(40)])
        return r.fallback()
    pg.route(re.compile(r'.*/rest/v1/titles.*'), wall)
    pg.goto(m.B + '/onboarding'); pg.wait_for_timeout(4500)
    n = pg.evaluate("new Set([...document.querySelectorAll('.ob-tile:not([aria-hidden])')].map(t => t.getAttribute('aria-label') + t.dataset.svc)).size")
    late = pg.evaluate("document.querySelectorAll('.ob-tile:not([aria-hidden]) img[data-late]').length")
    assert n == 64, n
    assert late == 64 - 36, late   # the outer ones are there by now, loaded after the middle
