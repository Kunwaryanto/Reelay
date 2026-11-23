# No serious accessibility problems (axe-core) on the main screens.
import os, pytest
import mock_api as m

AXE = open(os.path.join(os.path.dirname(__file__), '../../node_modules/axe-core/axe.min.js')).read()

@pytest.mark.parametrize('path', ['/', '/title/3', '/browse', '/browse/c/drama', '/watchlist', '/search', '/settings', '/privacy'])
def test_no_serious_violations(app, path):
    pg = app()
    pg.goto(m.B + path); pg.wait_for_timeout(2500)
    pg.evaluate(AXE)
    found = pg.evaluate("""async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice'] } }))
      .violations.map(v => `${v.impact} ${v.id}: ${v.nodes[0]?.target?.join(' ')}`)""")
    assert found == [], found
