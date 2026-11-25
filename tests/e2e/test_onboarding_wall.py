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

PAN = "(() => { const m = new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.ob-pan')).transform); return [m.m41, m.m42] })()"

def test_catching_a_throw_holds_the_wall_where_it_is(app):
    # grabbing the wall while a throw still glides used to jump it ahead to where the glide was going (25 Nov)
    pg = app()
    pg.goto(m.B + '/onboarding'); pg.settle(9000)
    pg.get_by_role('button', name='Continue').click(); pg.settle(4000)
    assert pg.evaluate("document.querySelector('.ob').dataset.step") == 'pick'
    pg.mouse.move(200, 500); pg.mouse.down()
    for i in range(1, 6): pg.mouse.move(200 - i * 30, 500 - i * 20); pg.wait_for_timeout(8)
    pg.mouse.up(); pg.wait_for_timeout(120)   # gliding now
    before = pg.evaluate(PAN)
    pg.mouse.down(); pg.wait_for_timeout(50)
    after = pg.evaluate(PAN)
    pg.mouse.up()
    assert abs(after[0] - before[0]) < 8 and abs(after[1] - before[1]) < 8, (before, after)
