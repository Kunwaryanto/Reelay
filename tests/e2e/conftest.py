# Browser tests for the built app (see docs/testing.md). The app must be built against the mock Supabase
# (VITE_SUPABASE_URL=https://mock.supabase.co) and served by `vite preview --port 4317` (or REELAY_URL).
import re, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import pytest
import mock_api as m

# the page in front (pages stack; the ones behind are inert)
TOP = "(()=>{const ms=[...document.querySelectorAll('main.page')].filter(x=>x.offsetParent&&!x.closest('[inert]'));return ms[ms.length-1]})()"

def open_app(stamp='s1', home=True):
    """A signed-in phone with Home's data, Letterboxd and a sync stamp. Returns the page; `page.stamp` changes it."""
    pg = m.new()
    state = {'v': stamp, 'abort': False}
    def stamp_route(r):
        if state['abort']: return r.abort()
        return r.fulfill(json={'finished_at': state['v']})
    pg.context.route(re.compile(r'.*/rest/v1/data_stamp.*'), stamp_route)
    if home: pg.route(re.compile(r'.*/rest/v1/(?!data_stamp).*'), m.hroute)
    pg.route(re.compile(r'.*(rpc/letterboxd|functions/v1/letterboxd|letterboxd_accounts).*'), m.lbroute)
    pg.stamp = state
    return pg

@pytest.fixture
def app():
    pages = []
    def make(**kw):
        pg = open_app(**kw); pages.append(pg); return pg
    m.errs.clear()
    yield make
    for pg in pages:
        try: pg.context.close()
        except Exception: pass
    assert not m.errs, f'page errors: {m.errs}'

def tap(pg, sel):
    """A finger tap on the first match in the page in front: pointer down and up on it, then the click."""
    return pg.evaluate("""(sel) => { const m = %s; const el = m && m.querySelector(sel); if (!el) return false; el.scrollIntoView({block: 'center'});
      const r = el.getBoundingClientRect(); const o = {bubbles: true, clientX: r.x + 5, clientY: r.y + 5, pointerType: 'touch', isPrimary: true};
      el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); el.click(); return true }""" % TOP, sel)
