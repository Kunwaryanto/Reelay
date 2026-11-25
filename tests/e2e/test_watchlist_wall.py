# The empty Watchlist is onboarding's wall (PosterWall): 64 posters from onboarding_wall for the member's services,
# picked by a tap and added with one button (25 Nov; it used to be its own older 7 × 7 wall).
import mock_api as m

def test_empty_watchlist_is_the_onboarding_wall(app):
    m.MODE['wl'] = 'empty'
    try:
        pg = app(); asked = []
        pg.on('request', lambda r: asked.append(r.post_data_json) if 'rpc/onboarding_wall' in r.url else None)
        pg.goto(m.B + '/watchlist'); pg.settle(8000)
        assert asked and asked[0]['p_rows'] == 8 and asked[0]['p_cols'] == 8, asked
        tiles = pg.locator('.pick .ob-tile:not([aria-hidden])')
        assert tiles.count() == 64
        assert pg.evaluate("document.querySelector('.pick .ob-wall').dataset.on") == 'true'
        # the columns drift into place for about 3 s: pick once they stand still
        pg.wait_for_function("[...document.querySelectorAll('.pick .ob-col')].every(c => c.getAnimations().every(a => a.playState !== 'running'))", timeout=10000)
        # two posters in the middle of the screen (clear of the heading and the button)
        pg.mouse.click(150, 400); pg.mouse.click(260, 330); pg.wait_for_timeout(300)
        assert pg.locator('.pick-add[data-show=true]').count() == 1
        assert pg.get_by_role('button', name='Add 2 titles to Watchlist').count() == 1
        pg.screenshot(path='/tmp/wn/wl-empty.png')
    finally:
        m.MODE['wl'] = 'list'
