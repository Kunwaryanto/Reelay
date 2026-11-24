# The title page's name: its last line's g, j, p and y aren't cut by the three-line limit.
import mock_api as m

def test_descenders_have_room(app):
    pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2000)
    room = pg.evaluate("""(() => { const h = document.querySelector('#t-title'); const lines = h.getClientRects();
      const g = document.createRange(); g.selectNodeContents(h); const rs = [...g.getClientRects()]; const last = rs[rs.length - 1]
      // the font's descent at 20px is about 5px below the baseline; the baseline sits ~3px above the line box's bottom
      return h.getBoundingClientRect().bottom - last.bottom })()""")
    assert room >= 3.5, room
