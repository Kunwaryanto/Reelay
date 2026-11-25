# A button keeps its width while its spinner shows: the text stays (hidden) under the spinner (BusyLabel). 25 Nov:
# Send code shrank to a small pill while sending.
import time, re
import mock_api as m

def test_send_code_keeps_its_width_while_busy(app):
    pg = m.ctx(False)
    held = []
    pg.route(re.compile(r'.*/auth/v1/otp.*'), lambda r: held.append(r))   # sending hangs until answered
    try:
        pg.goto(m.B + '/'); pg.settle(6000)
        pg.get_by_role('button', name='Sign in').click(); pg.settle(3000)
        pg.keyboard.type('someone@example.com')
        btn = pg.locator('form button[type=submit]')
        # the pill's 112px minimum hides the change in this browser's narrower type: measure without it
        pg.evaluate("document.querySelector('form button[type=submit]').style.minWidth = '0'")
        before = btn.bounding_box()
        btn.click(); pg.wait_for_function("document.querySelector('form button[type=submit]').getAttribute('aria-busy') === 'true'", timeout=5000)
        during = btn.bounding_box()
        assert pg.locator('form button[type=submit] .spin').count() == 1
        assert abs(during['width'] - before['width']) < 0.5 and abs(during['height'] - before['height']) < 0.5, (before, during)
    finally:
        for r in held: r.fulfill(json={})
        pg.context.close()
