# Onboarding's wall (and the titles picked from it for the Watchlist): chosen by the database (onboarding_wall:
# three films for every series, best-known first, no kids' titles), 8 × 8.
import mock_api as m

def test_wall_offers_64_to_pick(app):
    # the middle 36 are what Services shows; picking pans out to the rest, loaded while Services is up
    m.MODE.pop('wall_asked', None)
    pg = app()
    pg.goto(m.B + '/onboarding'); pg.settle(9000)
    asked = m.MODE.get('wall_asked')
    assert asked and asked['p_rows'] == 8 and asked['p_cols'] == 8 and asked['p_services'], asked
    n = pg.evaluate("document.querySelectorAll('.ob-tile:not([aria-hidden])').length")
    late = pg.evaluate("document.querySelectorAll('.ob-tile:not([aria-hidden]) img[data-late]').length")
    svc = pg.evaluate("[...document.querySelectorAll('.ob-tile:not([aria-hidden])')].slice(0, 3).map(t => t.dataset.svc)")
    assert n == 64, n
    assert late == 64 - 36, late   # the outer ones are there by now, loaded after the middle
    assert all(svc), 'each poster stands for its service'
