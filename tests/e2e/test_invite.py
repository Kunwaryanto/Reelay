# An invite link says "Join Reelay" from the first frame, keeps its code after the app tidies the address, and
# redeems it when the email is sent, even while (or if) the first check is slow.
import json
import mock_api as m

def test_invite_link_says_join_and_keeps_its_code(app):
    pg = m.ctx(False)
    held, bodies = [], []
    def fn(r):
        bodies.append(json.loads(r.request.post_data or '{}'))
        if len(bodies) == 1: held.append(r); return             # the first check is slow: answered later
        return r.fulfill(json={'status': 'created'})
    pg.route('**/functions/v1/redeem-invite', fn)
    try:
        pg.goto(m.B + '/i/abc123'); pg.settle(5000)
        assert 'Join Reelay' in pg.inner_text('body'), 'Join while the invite is checked'
        assert bodies and bodies[0].get('token') == 'abc123', 'the code was read'
        held[0].fulfill(json={'status': 'valid'}); pg.wait_for_timeout(500)
        assert 'Join Reelay' in pg.inner_text('body')
    finally:
        pg.context.close()
