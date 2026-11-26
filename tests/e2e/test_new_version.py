# A new version deployed while the app is open: a screen it loads only when opened is gone under its old name.
# The app reloads into the new version instead of showing "Something went wrong".
import mock_api as m

def test_missing_screen_file_reloads(app):
    pg = app()
    asked = []
    def missing(route):
        asked.append(route.request.url)
        if len(asked) == 1: return route.fulfill(status=404, body='')   # the old file is gone after the deploy
        return route.fallback()
    pg.route('**/assets/Settings-*.js', missing)
    loads = []
    pg.goto(m.B + '/'); pg.settle(6000)
    pg.on('load', lambda _: loads.append(1))
    pg.click('.now-settings button')
    pg.wait_for_timeout(4000)
    assert asked, 'the Settings screen was asked for'
    assert loads, 'the app reloaded'
    assert 'Something went wrong' not in pg.inner_text('body')
