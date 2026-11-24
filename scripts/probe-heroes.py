# One-off: each film's title page picture three ways, cropped as the page does (390 x 560, object-fit cover).
import os, io, requests
from PIL import Image, ImageDraw, ImageFont
H = {'Authorization': f"Bearer {os.environ['TMDB_READ_TOKEN']}", 'accept': 'application/json'}
FILMS = [(238, 'The Godfather'), (693134, 'Dune: Part Two'), (5961, 'Fanny och Alexander')]
W, HT, S = 390, 560, 2
def get(path, **q): return requests.get(f'https://api.themoviedb.org/3{path}', headers=H, params=q, timeout=30).json()
def img(path, size): return Image.open(io.BytesIO(requests.get(f'https://image.tmdb.org/t/p/{size}{path}', timeout=60).content)).convert('RGB')
def cover(im, ypos):  # object-fit: cover; object-position: center <ypos>
    w, h = W * S, HT * S
    r = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x = (im.width - w) // 2; y = round((im.height - h) * ypos)
    return im.crop((x, y, x + w, y + h))
def best(lst, minw):
    c = [i for i in lst if not i.get('iso_639_1') and i.get('width', 0) >= minw]
    c.sort(key=lambda i: (-(i.get('vote_average') or 0), -(i.get('vote_count') or 0), -i.get('width', 0)))
    return c[0] if c else None
font = ImageFont.load_default(size=26 * S // 2)
big = ImageFont.load_default(size=34 * S // 2)
cols = ['1. TMDB main backdrop (as Home), full size', '2. Best textless backdrop ≥1920', '3. Textless poster']
sheet = Image.new('RGB', (3 * W * S + 4 * 20 * S, len(FILMS) * (HT * S + 70 * S) + 60 * S), (20, 20, 20))
d = ImageDraw.Draw(sheet)
for c, label in enumerate(cols): d.text((20 * S + c * (W * S + 20 * S), 20 * S), label, fill=(220, 220, 220), font=font)
for r, (fid, name) in enumerate(FILMS):
    det = get(f'/movie/{fid}'); ims = get(f'/movie/{fid}/images', include_image_language='en,null')
    main = det.get('backdrop_path'); mainimg = next((b for b in ims['backdrops'] if b['file_path'] == main), {})
    tb = best(ims['backdrops'], 1920); tp = best(ims['posters'], 1000)
    picks = [(main, 'original', .25, f"text: {mainimg.get('iso_639_1') or 'none'}, {mainimg.get('width')} wide"),
             (tb and tb['file_path'], 'original', .25, f"{tb and tb['width']} wide" if tb else 'none'),
             (tp and tp['file_path'], 'w780', 0, 'textless poster' if tp else 'none')]
    y0 = 60 * S + r * (HT * S + 70 * S)
    d.text((20 * S, y0), name, fill=(255, 255, 255), font=big)
    for c, (path, size, ypos, note) in enumerate(picks):
        x0 = 20 * S + c * (W * S + 20 * S)
        if path:
            tile = cover(img(path, size), ypos)
            # the page's fade to black at the bottom, where the title sits
            fade = Image.new('L', tile.size, 0); fd = ImageDraw.Draw(fade)
            for i in range(tile.height // 3): fd.line([(0, tile.height - i), (tile.width, tile.height - i)], fill=int(255 * (1 - i / (tile.height / 3))))
            tile.paste((0, 0, 0), mask=fade)
            sheet.paste(tile, (x0, y0 + 45 * S))
        d.text((x0, y0 + 45 * S + HT * S + 4 * S), note, fill=(150, 150, 150), font=font)
sheet.save('heroes.png')
