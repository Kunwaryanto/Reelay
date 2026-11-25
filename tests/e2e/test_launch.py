# The wordmark is up from the first frame and hands over to Home; signed out it leaves at once.
import mock_api as m

def test_wordmark_hands_over_to_home(app):
    pg = app()
    pg.goto(m.B + '/', wait_until='commit')
    assert pg.evaluate("!!document.getElementById('boot')")
    pg.wait_for_timeout(3000)
    assert pg.evaluate("!document.getElementById('boot') && !!document.querySelector('.now-in')")
    assert not pg.evaluate("!!document.querySelector('.launch')"), 'Home shows no second wordmark of its own'

def test_signed_out_drops_the_wordmark():
    pg = m.ctx(False)
    pg.goto(m.B + '/'); pg.settle(4000)
    assert not pg.evaluate("!!document.getElementById('boot')")
    pg.context.close()
