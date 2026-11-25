# The empty Watchlist is onboarding's wall (PosterWall): 64 posters from onboarding_wall for the member's services,
# picked by a tap and added with one button (25 Nov; it used to be its own older 7 × 7 wall).
import mock_api as m

def test_empty_watchlist_is_the_onboarding_wall(app):
    m.MODE['wl'] = 'empty'; m.MODE.pop('wall_asked', None)
    try:
        pg = app(); pg.goto(m.B + '/watchlist'); pg.settle(8000)
        asked = m.MODE.get('wall_asked')
        assert asked and asked['p_rows'] == 8 and asked['p_cols'] == 8, asked
        tiles = pg.locator('.pick .ob-tile:not([aria-hidden])')
        assert tiles.count() == 64
        assert pg.evaluate("document.querySelector('.pick .ob-wall').dataset.on") == 'true'
        tiles.nth(27).click(); tiles.nth(28).click(); pg.wait_for_timeout(300)
        assert pg.locator('.pick-add[data-show=true]').count() == 1
        assert pg.get_by_role('button', name='Add 2 titles to Watchlist').count() == 1
        pg.screenshot(path='/tmp/wn/wl-empty.png')
    finally:
        m.MODE['wl'] = 'list'
