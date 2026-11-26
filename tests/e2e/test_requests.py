# Requests at launch: none asked twice, and a budget per page (26 Nov, after Home became two requests, Browse one per
# page and Search's ideas waited for Search: 69 requests at launch down to about 20, title pages the app loads ahead
# included). A change that adds a duplicate or
# blows the budget fails here; raise a budget only for a request that is really new.
import collections
import pytest
import mock_api as m

BUDGET = {'/': 24, '/browse': 26, '/search': 28, '/title/3': 32, '/watchlist': 24, '/browse/c/drama': 24}

def launch(app, path):
    pg = app(); reqs = []
    pg.on('request', lambda r: reqs.append((r.method, r.url.split('/rest/v1/')[-1].split('/functions/v1/')[-1], r.post_data or ''))
          if ('/rest/v1/' in r.url or '/functions/v1/' in r.url) and r.method != 'OPTIONS' else None)
    pg.goto(m.B + path); pg.settle(9000)
    return reqs

@pytest.mark.parametrize('path', list(BUDGET))
def test_no_request_twice_and_within_budget(app, path):
    reqs = launch(app, path)
    twice = [(k[0], k[1][:400], k[2][:60], n) for k, n in collections.Counter(reqs).items() if n > 1]
    assert not twice, twice
    assert len(reqs) <= BUDGET[path], '\n'.join([str(len(reqs))] + [f'{a} {b[:90]}' for a, b, _ in reqs])

def test_tabs_behind_home_wait_to_be_opened(app):
    # Search's ideas and Browse's ahead-loaded pages are for when those tabs are open, not for every launch
    reqs = launch(app, '/')
    urls = [u for _, u, _ in reqs]
    assert not any(u.startswith('rpc/search_titles') or u.startswith('rpc/title_totals') or u.startswith('rpc/browse_page') for u in urls), urls
