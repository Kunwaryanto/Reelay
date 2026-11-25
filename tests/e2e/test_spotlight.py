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

def test_card_text_is_never_cut(app):
    # A long title, reason or credit wraps instead of being clipped or cut with an ellipsis, and descenders (the g in
    # Bugonia) show whole: nothing on the card clips its text. 26 Nov.
    pg = app(); pg.goto(m.B + '/'); pg.settle(8000)
    out = pg.evaluate("""(() => { const s = document.querySelector('.spot')
      s.querySelector('.spot-top b').textContent = 'Everything Everywhere All at Once: The Longest Title'
      s.querySelector('.spot-top small').textContent = 'Because you liked Portrait of a Lady on Fire and two more'
      return [...s.querySelectorAll('.spot-top b, .spot-top small, .spot-meta span')].map(e => { const c = getComputedStyle(e)
        return { t: e.className || e.tagName, text: e.textContent, overflow: c.overflow, ellipsis: c.textOverflow, clamp: c.webkitLineClamp } }) })()""")
    bad = [o for o in out if o["overflow"] != "visible" or o["ellipsis"] == "ellipsis" or o["clamp"] not in ("none", "", None)]
    assert not bad, bad

def test_credit_line_names_everyone_without_cutting(app):
    # who made it is never cut short: one name, two joined with "and", three or more as the first "and N others". 26 Nov.
    pg = app(); pg.goto(m.B + '/'); pg.settle(8000)
    by = [c['by'] for c in pg.evaluate(CARDS) if c['by']]
    assert by and not any(', ' in b for b in by), by
    assert any(' and 2 others' in b for b in by) and any('Kwan and' in b for b in by), by
    import re
    assert all(re.fullmatch(r'(Directed|Created) by (Celine Song|Vince Gilligan|Daniel Kwan and Daniel Scheinert|Matt Duffer and 2 others)', b) for b in by), by

def test_service_always_at_the_bottom_never_in_the_reason(app):
    # Where it plays is always on the card's bottom line; the reason says why it was picked and never names the
    # service ("Just arrived", "Leaves on Friday", "New this week"). 26 Nov.
    pg = app(); pg.goto(m.B + '/'); pg.settle(8000)
    out = pg.evaluate("""[...document.querySelectorAll('.spot')].map(s => ({ reason: s.querySelector('.spot-top small').textContent,
      meta: s.querySelector('.spot-meta span:last-child').textContent }))""")
    names = ['Netflix', 'HBO Max', 'Viaplay', 'SkyShowtime', 'Disney+', 'Prime Video', 'Apple TV', 'SVT Play', 'TV4 Play']
    assert out and all(any(n in o['meta'] for n in names) for o in out), out
    assert not any(n in o['reason'] for o in out for n in names), out
    # nor the length: a short saved film is "Under 100 minutes", with its length below
    assert not any(o['reason'].startswith('Only ') for o in out), out
    assert any(o['reason'] == 'Under 100 minutes' for o in out), out
