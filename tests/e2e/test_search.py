

def test_filter_list_counts_and_loads_on(app):
    # a search made by filters alone: the pills count what the database has, and the list loads on as it scrolls
    import mock_api as m
    m.MODE['pool'] = 200
    try:
        pg = app()
        pg.goto(m.B + '/search'); pg.wait_for_timeout(1500)
        pg.fill('input[type=search], input', 'thriller 90s'); pg.wait_for_timeout(2500)
        pg.keyboard.press('Enter'); pg.wait_for_timeout(1500)
        total = len([i for i in range(41, 241) if i % 5])
        pills = pg.evaluate("[...document.querySelectorAll('main.search .wl-pill')].map(b => b.getAttribute('aria-label') + '|' + b.textContent)")
        assert any(f'{total} results' in (p or '') for p in pills), pills
        first = pg.evaluate("document.querySelectorAll('.s-results:not(.s-people) > li:not(.s-loadon)').length")
        assert first == 60, first
        for _ in range(4):
            pg.evaluate("document.querySelector('.s-loadon')?.scrollIntoView()"); pg.wait_for_timeout(800)
        after = pg.evaluate("document.querySelectorAll('.s-results:not(.s-people) > li:not(.s-loadon)').length")
        assert after == total, after
    finally:
        m.MODE.pop('pool', None)
