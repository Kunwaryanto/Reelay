# Tonight's picks (the spotlight): tall cards with the reason and title at the top and, at the bottom, a small poster
# with who made it and where it plays; held, they open the poster menu like posters. What was picked on an earlier
# day steps aside for a week (unless it just arrived or is leaving), so the picks change from day to day. 25 Nov.
import json
import mock_api as m
from conftest import TOP

CARDS = """[...(%s).querySelectorAll('.spot')].map(s => ({ id: s.getAttribute('href'), reason: s.querySelector('.spot-top small')?.textContent,
  title: s.querySelector('.spot-top b')?.innerText, by: s.querySelector('.spot-by')?.innerText ?? null }))""" % TOP

def heading(pg):
    return pg.evaluate("(() => { const s = document.querySelector('.spot-row').closest('section'); return s.querySelector('h2').innerText })()")

def test_picks_cards_and_heading(app):
    pg = app(); pg.goto(m.B + '/'); pg.settle(8000)
    cards = pg.evaluate(CARDS)
    assert len(cards) >= 2, cards
    assert all(c['reason'] and c['title'] for c in cards), cards
    assert any(c['by'] and (c['by'].startswith('Directed by') or c['by'].startswith('Created by')) for c in cards), cards
    h = pg.evaluate("new Date().getHours()")
    assert heading(pg) == ('Tonight’s picks' if h >= 17 or h < 4 else 'Today’s picks')

def test_holding_a_pick_opens_the_poster_menu(app):
    pg = app(); pg.goto(m.B + '/'); pg.settle(8000)
    box = pg.evaluate("(()=>{const el=document.querySelector('.spot'); el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()")
    pg.wait_for_timeout(300)
    pg.mouse.move(*box); pg.mouse.down(); pg.wait_for_timeout(900); pg.mouse.up(); pg.wait_for_timeout(700)
    assert pg.evaluate("!!document.querySelector('.hold-menu, [class*=hold]')")

def test_picks_change_from_day_to_day(app):
    pg = app(); pg.goto(m.B + '/'); pg.settle(8000)
    first = [c['id'] for c in pg.evaluate(CARDS)]
    # the same picks, shown yesterday: today's Home picks others
    import datetime
    yday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    pg2 = app()
    pg2.add_init_script("localStorage.setItem('reelay.spot-shown', %s)" % json.dumps(json.dumps({c.split('/')[-1]: yday for c in first})))
    pg2.goto(m.B + '/'); pg2.settle(8000)
    cards = pg2.evaluate(CARDS)
    # only what is timely comes back: a watchlist title that just arrived, or one leaving
    repeated = [c for c in cards if c['id'] in first]
    assert cards and all(c['reason'].startswith(('Just arrived', 'Leaves')) for c in repeated), (first, cards)
    assert len(repeated) < len(cards), (first, cards)
