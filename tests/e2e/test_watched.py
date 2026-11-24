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
