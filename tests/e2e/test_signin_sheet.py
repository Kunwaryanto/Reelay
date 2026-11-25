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
        pg.keyboard.type('someone@example.com'); pg.keyboard.press('Enter')   # (a tap on Send code doesn't take the focus on iOS)
        pg.wait_for_function("document.activeElement && document.activeElement.name === 'code'", timeout=8000)
        assert pg.evaluate("window.__drops") == [], 'the focus fell to the page on the way to the code'
    finally:
        pg.context.close()
