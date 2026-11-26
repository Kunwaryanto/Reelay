# Rows ask for their pictures a screen and a half ahead; the spotlight's are ready before it is reached.
import mock_api as m

def test_spotlight_ready_ahead(app):
    pg = app()
    pg.goto(m.B + '/'); pg.settle(7000)
    for y in range(0, 3000, 300):
        pg.evaluate(f"document.querySelector('.page').scrollTo(0,{y})"); pg.wait_for_timeout(250)
        top, ready = pg.evaluate("(()=>{const s=document.querySelector('.spot-row'); return [s.getBoundingClientRect().top, [...s.querySelectorAll('.near-img')].every(n=>n.dataset.ready==='true')]})()")
        if top < 844:
            assert ready, 'the spotlight was seen before its pictures were in'
            return
    raise AssertionError('never reached the spotlight')
