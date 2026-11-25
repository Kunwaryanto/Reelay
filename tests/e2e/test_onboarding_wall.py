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
