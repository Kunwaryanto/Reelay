# The member's watched films come as one list, however long: a row per film was cut at the API's 1,000 rows,
# so some watched films weren't hidden (24 Nov: a member with 1,141).
import json
import mock_api as m

def test_long_watched_list_arrives_whole(app):
    m.ST['acct'] = m.ACC; m.ST['lots'] = True
    try:
        pg = app()
        asked = []
        pg.on('request', lambda r: asked.append(r.url) if 'rpc/letterboxd_watched' in r.url else None)
        pg.goto(m.B + '/'); pg.wait_for_timeout(3000)
        assert any('letterboxd_watched_ids' in u for u in asked), asked
        saved = pg.evaluate("Object.keys(localStorage).filter(k => k.includes('lb-watched')).map(k => JSON.parse(localStorage.getItem(k)).data.length)")
        assert saved == [1200], saved
    finally:
        m.ST['acct'] = None; m.ST.pop('lots', None)

# Films logged on Letterboxd are greyed in Search's results too, as on every poster (25 Nov).
def test_search_greys_watched(app):
    m.ST['acct'] = m.ACC
    try:
        pg = app(); pg.goto(m.B + '/search'); pg.wait_for_timeout(1500)
        pg.locator('input[type=search], input').first.fill(m.NAMES[3 % len(m.NAMES)]); pg.wait_for_timeout(2000)
        row = pg.locator('a.s-row[href="/title/3"] .wl-poster')
        assert row.get_attribute('data-watched') == 'true'
        assert pg.locator('a.s-row:not([href="/title/3"]):not([href="/title/6"]):not([href="/title/9"]):not([href="/title/12"]) .wl-poster[data-watched]').count() == 0
    finally:
        m.ST['acct'] = None
