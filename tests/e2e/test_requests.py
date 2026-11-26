# Requests at launch: none asked twice, and a budget per page. 26 Nov: Home became two requests, Browse one per page
# and Search's ideas waited for Search (69 requests at launch down to about 20); then the member's things became one
# request, a title page one, Home's cards brought their facts and Browse's pictures waited for Browse (about 7).
# A change that adds a duplicate or blows the budget fails here; raise a budget only for a request that is really new.
import collections
import pytest
import mock_api as m

BUDGET = {'/': 10, '/browse': 15, '/search': 12, '/title/3': 12, '/watchlist': 9, '/browse/c/drama': 10}

# as the database answers since 20261126000900: the member's things in one request, a title page in one, Home's
# cards with their facts
NOW = {'me_bundle': True, 'title_page': True, 'facts': True}

@pytest.fixture(autouse=True)
def current_database():
    before = {k: m.MODE.get(k) for k in NOW}
    m.MODE.update(NOW)
    yield
    m.MODE.update(before)

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

def test_launch_asks_for_the_members_things_once(app):
    # profile, services, watchlist (both shapes), Letterboxd, watched films and the stamp: one request
    reqs = launch(app, '/')
    urls = [u for _, u, _ in reqs]
    assert urls.count('rpc/me_bundle') == 1, urls
    alone = [u for u in urls if u.split('?')[0] in ('profiles', 'user_services', 'watchlist', 'data_stamp', 'rpc/letterboxd_me', 'rpc/letterboxd_watched_ids')]
    assert not alone, alone

def test_title_page_is_one_request(app):
    reqs = launch(app, '/title/3')
    urls = [u for _, u, _ in reqs]
    assert 'rpc/title_page' in urls and not any(u.startswith('rpc/similar_titles') for u in urls), urls

def test_home_posters_ask_for_no_facts(app):
    # Home's cards carry the long-press menu's facts
    reqs = launch(app, '/')
    facts = [u for _, u, _ in reqs if u.startswith('titles?select=id%2Ckind%2Cruntime_min%2Cseasons%2Cend_year')]
    assert not facts, facts
