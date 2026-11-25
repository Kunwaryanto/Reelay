# Paste code: one button under the code boxes reads the clipboard (iOS asks with its own Paste bubble) and takes
# the 6 digits from whatever was copied, the whole mail line included. Nothing to take: it says so. 25 Nov.
import mock_api as m

def to_code_step(pg):
    pg.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true })")
    pg.context.grant_permissions(['clipboard-read', 'clipboard-write'], origin=m.B)
    pg.goto(m.B + '/'); pg.settle(6000)
    pg.get_by_role('button', name='Sign in').click(); pg.settle(3000)
    pg.keyboard.type('someone@example.com'); pg.get_by_role('button', name='Send code').click()
    pg.wait_for_function("!!document.querySelector('.code-paste')", timeout=8000)

def test_paste_code_takes_the_code_from_the_clipboard(app):
    pg = m.ctx(False)
    try:
        to_code_step(pg)
        pg.evaluate("navigator.clipboard.writeText('Your sign-in code 482913. If you didn’t ask for it, ignore this.')")
        pg.locator('.code-paste').click()
        pg.wait_for_function("document.body.innerText.includes('You’re in')", timeout=8000)
        assert pg.evaluate("[...document.querySelectorAll('.code > span')].map(s => s.innerText).join('')") == '482913'
    finally:
        pg.context.close()

def test_paste_code_says_when_there_is_no_code(app):
    pg = m.ctx(False)
    try:
        to_code_step(pg)
        pg.evaluate("navigator.clipboard.writeText('hello')")
        pg.locator('.code-paste').click(); pg.wait_for_timeout(500)
        assert 'No code to paste' in pg.inner_text('.code-status')
    finally:
        pg.context.close()
