# Signing in from the Home Screen app (a sheet): the caret stays hidden while the sheet moves (iOS drew it below
# the field as the sheet rose), and the keyboard is held from the email step to the code step: the focus never
# drops to the page, so iOS doesn't put the keyboard away and bring it back by itself (which pushed the sheet
# down and up when coming back from Mail). 25 Nov.
import mock_api as m

WATCH = """window.__drops = []; document.addEventListener('focusout', (e) => { if (!e.relatedTarget) window.__drops.push(e.target.name || e.target.type || e.target.tagName) }, true)"""

def test_sign_in_sheet_keeps_the_keyboard_and_hides_the_moving_caret(app):
    pg = m.ctx(False)
    pg.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true })")
    try:
        pg.goto(m.B + '/'); pg.settle(6000)
        pg.get_by_role('button', name='Sign in').click()
        pg.wait_for_timeout(30)
        caret = pg.evaluate("(() => { const i = document.querySelector('dialog.sheet input[type=email], dialog.sheet input'); return i && getComputedStyle(i).caretColor })()")
        assert caret == 'rgba(0, 0, 0, 0)', caret   # hidden while the sheet rises
        pg.wait_for_function("document.querySelector('dialog.sheet').dataset.moving === undefined", timeout=5000)
        caret = pg.evaluate("getComputedStyle(document.querySelector('dialog.sheet input')).caretColor")
        assert caret != 'rgba(0, 0, 0, 0)', caret   # and back once it has settled
        pg.evaluate(WATCH)
        pg.keyboard.type('someone@example.com'); pg.get_by_role('button', name='Send code').click()   # the tap keeps the field's focus
        pg.wait_for_function("document.activeElement && document.activeElement.name === 'code'", timeout=8000)
        assert pg.evaluate("window.__drops") == [], 'the focus fell to the page on the way to the code'
    finally:
        pg.context.close()

def test_leaving_for_mail_lets_go_of_the_field(app):
    # Coming back from Mail, iOS brought the keyboard back by itself and panned the app up while it rose: the sheet
    # jumped. So leaving the Home Screen app with the code field focused lets go of the focus: back in the app the
    # sheet stands still and a tap on the boxes (or Paste code) carries on. 26 Nov.
    pg = m.ctx(False)
    pg.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true })")
    try:
        pg.goto(m.B + '/'); pg.settle(6000)
        pg.get_by_role('button', name='Sign in').click()
        pg.wait_for_function("document.querySelector('dialog.sheet').dataset.moving === undefined", timeout=5000)
        pg.keyboard.type('someone@example.com'); pg.get_by_role('button', name='Send code').click()
        pg.wait_for_function("document.activeElement && document.activeElement.name === 'code'", timeout=8000)
        pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))")
        assert pg.evaluate("document.activeElement === document.body || !document.activeElement.matches('input')")
        pg.evaluate("Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'))")
        pg.locator('dialog.sheet .code').click()
        pg.wait_for_function("document.activeElement && document.activeElement.name === 'code'", timeout=3000)
    finally:
        pg.context.close()
