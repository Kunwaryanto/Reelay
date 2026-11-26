# Settings › Suggestions: tags a member doesn't want suggested. Home and Browse leave those titles out; the
# watchlist and searching by name don't.
import re
from urllib.parse import unquote
import mock_api as m
from conftest import TOP

def test_pick_what_not_to_suggest(app):
    m.MODE.pop('patched', None)
    pg = app()
    pg.goto(m.B + '/settings'); pg.settle(4000)
    assert pg.locator('text=Suggestions').count() == 1
    pg.goto(m.B + '/settings/suggestions'); pg.settle(4000)
    pills = lambda: pg.evaluate(f"[...({TOP}).querySelectorAll('.sg-pills .pill')].map(p => [p.textContent, p.getAttribute('aria-pressed')])")
    assert [p for p, _ in pills()] == ['Kids', 'Anime', 'Horror', 'Reality', 'Documentaries', 'Stand-up']
    pg.locator('main .sg-pills .pill', has_text='Horror').click(); pg.wait_for_timeout(600)
    assert ['Horror', 'true'] in pills()
    assert m.MODE['patched'][-1] == {'hidden_tags': ['horror']}
    # every other genre is in the sheet; one picked there joins the page's pills
    pg.locator('text=More genres').first.click(); pg.wait_for_timeout(700)
    pg.locator('dialog .sg-pills .pill', has_text='Western').click(); pg.wait_for_timeout(400)
    pg.locator('dialog .sg-done').click(); pg.wait_for_timeout(700)
    assert ['Western', 'true'] in pills()
    assert m.MODE['patched'][-1] == {'hidden_tags': ['horror', 'western']}
    # taking it off again keeps the pill in place while the page is open
    pg.locator('main .sg-pills .pill', has_text='Western').click(); pg.wait_for_timeout(400)
    assert ['Western', 'false'] in pills()

def test_home_and_browse_leave_hidden_out(app):
    m.MODE['hidden'] = ['horror', 'kids']
    try:
        m.MODE['home_asked'] = []
        pg = app(); asked = []
        # as on a phone that has opened Reelay before: the list is kept there, so the first screen knows it
        pg.add_init_script("localStorage.setItem('reelay.hidden-tags', JSON.stringify(['horror','kids']))")
        pg.on('request', lambda r: asked.append(unquote(r.url)))
        pg.goto(m.B + '/'); pg.settle(6000)
        # Home's lookups are two requests (home_bundle, home_more, 26 Nov): both carry the hidden tags; the watchlist
        # and what arrived from it, the member's own, aren't narrowed by them (the database leaves them out there)
        import json
        asked_home = [x for x in m.MODE.get('home_asked', []) if x[0] in ('home_bundle', 'home_more')]
        assert asked_home and all(b['p_hidden'] == ['horror', 'kids'] for _, b in asked_home), asked_home
        assert not any('not.ov' in u for u in asked if '/rest/v1/watchlist' in u), 'the watchlist is the member\'s own'
        # Browse: the Horror card is gone
        pg.goto(m.B + '/browse'); pg.settle(4000)
        names = pg.evaluate(f"[...({TOP}).querySelectorAll('.br-section[data-first=true] .br-grid > *')].map(c => c.textContent)")
        assert names and not any('Horror' in n for n in names), names
    finally:
        m.MODE.pop('hidden', None)
