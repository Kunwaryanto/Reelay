# What's saved on the phone stays small: entries unused for a month go, and only the newest 400 stay.
import json, time
import mock_api as m

def test_saved_data_is_pruned(app):
    pg = app()
    pg.goto(m.B + '/'); pg.settle(4000)
    now = int(time.time() * 1000)
    pg.evaluate("""([now]) => { for (let i = 0; i < 450; i++) localStorage.setItem('reelay:q:test:' + i, JSON.stringify({ data: 'x'.repeat(100), at: now - i * 60000 }));
      for (let i = 0; i < 20; i++) localStorage.setItem('reelay:q:old:' + i, JSON.stringify({ data: 1, at: now - 40 * 864e5 })) }""", [now])
    reloaded = int(time.time() * 1000)
    pg.reload(); pg.wait_for_timeout(6500)
    left = pg.evaluate("Object.keys(localStorage).filter(k => k.startsWith('reelay:q:'))")
    # (what the app saves after the prune, a few seconds in, doesn't count)
    kept = pg.evaluate("([t]) => Object.keys(localStorage).filter(k => k.startsWith('reelay:q:') && (JSON.parse(localStorage.getItem(k)).at ?? 0) < t).length", [reloaded])
    assert kept <= 400
    assert not any(k.startswith('reelay:q:old:') for k in left)
    assert 'reelay:q:test:0' in left, 'the newest stay'
