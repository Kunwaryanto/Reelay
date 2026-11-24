# The title page's name: its last line's g, j, p and y aren't cut by the three-line limit.
import mock_api as m

def test_descenders_have_room(app):
    pg = app(); pg.goto(m.B + '/title/3'); pg.wait_for_timeout(2000)
    room = pg.evaluate("""(() => { const h = document.querySelector('#t-title'); const lines = h.getClientRects();
      const g = document.createRange(); g.selectNodeContents(h); const rs = [...g.getClientRects()]; const last = rs[rs.length - 1]
      // the text's box reaches the font's full descent (about 1px below the 22px line); it must end inside the title
      return h.getBoundingClientRect().bottom - last.bottom })()""")
    assert room >= 1, room  # before the fix: -1 (the descent cut)
