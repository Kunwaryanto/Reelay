"""Builds public/fonts/inter-*.woff2 from InterVariable.woff2 (rsms.me/inter, SIL OFL 1.1):
opsz fixed at 32 (Inter Display, the only size the design uses), weight 400-700 kept,
split by script so Safari only downloads what a page needs (see unicode-range in src/styles/fonts.css).
Usage:
  npm pack inter-ui && tar xzf inter-ui-*.tgz
  python3 scripts/fonts/build-inter.py package/variable/InterVariable.woff2
"""
import io, sys, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

RANGES = {
    'latin': 'U+0000-024F,U+0259,U+02B0-02FF,U+0300-036F,U+1E00-1EFF,U+2000-206F,U+20A0-20CF,U+2100-214F,U+2190-21FF,U+2212,U+2215,U+FEFF,U+FFFD',
    'greek': 'U+0370-03FF,U+1F00-1FFF',
    'cyrillic': 'U+0400-052F,U+1C80-1C8F,U+2DE0-2DFF,U+A640-A69F',
}
out_dir = pathlib.Path(__file__).parent.parent.parent / 'public/fonts'
out_dir.mkdir(exist_ok=True)
src = TTFont(sys.argv[1], lazy=False)
src = instancer.instantiateVariableFont(src, {'opsz': 32, 'wght': (400, 700)})
buf = io.BytesIO(); src.flavor = None; src.save(buf)
for name, rng in RANGES.items():
    font = TTFont(io.BytesIO(buf.getvalue()), lazy=False)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    unicodes = subset.parse_unicodes(rng)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes)
    sub.subset(font)
    font.flavor = 'woff2'
    path = out_dir / f'inter-{name}.woff2'
    font.save(path)
    print(f'{path.name}: {path.stat().st_size // 1024} KB  unicode-range: {rng}')
