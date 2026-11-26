# Pasting into the code boxes (iOS's own Paste menu, or the code Mail offers on the keyboard) takes the 6 digits
# from whatever was copied, the whole mail line included. (A Paste code button came and went: 25-26 Nov, it took
# more taps than the keyboard's own suggestion.) 26 Nov.
import mock_api as m

def test_pasting_the_mail_line_takes_the_code(app):
    pg = m.ctx(False)
    pg.add_init_script("Object.defineProperty(navigator, 'standalone', { get: () => true })")
    try:
        pg.goto(m.B + '/'); pg.settle(6000)
        pg.get_by_role('button', name='Sign in').click(); pg.settle(3000)
        pg.keyboard.type('someone@example.com'); pg.get_by_role('button', name='Send code').click()
        pg.wait_for_function("document.activeElement && document.activeElement.name === 'code'", timeout=8000)
        assert pg.locator('.code-paste').count() == 0
        pg.evaluate("""(() => { const d = new DataTransfer(); d.setData('text/plain', 'Your sign-in code 482913. If you didn’t ask for it, ignore this.')
          document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: d, bubbles: true, cancelable: true })) })()""")
        pg.wait_for_function("document.body.innerText.includes('You’re in')", timeout=8000)
        assert pg.evaluate("[...document.querySelectorAll('.code > span')].map(s => s.innerText).join('')") == '482913'
    finally:
        pg.context.close()
