"""Builds public/fonts/material-symbols-reelay.woff2: Material Symbols Outlined
(Apache 2.0) cut down to the icons in icons.txt, with opsz 24 and GRAD 0 fixed,
FILL 0-1 and weight 250-400 kept. Usage:
  npm pack material-symbols && tar xzf material-symbols-*.tgz
  python3 scripts/fonts/build-icons.py package/material-symbols-outlined.woff2
"""
import io, sys, pathlib
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

here = pathlib.Path(__file__).parent
names = {l.strip() for l in (here / 'icons.txt').read_text().splitlines() if l.strip() and not l.startswith('#')}
font = TTFont(sys.argv[1], lazy=False)
font = instancer.instantiateVariableFont(font, {'opsz': 24, 'GRAD': 0, 'wght': (250, 400), 'FILL': (0, 1)})
buf = io.BytesIO(); font.flavor = None; font.save(buf); buf.seek(0)
font = TTFont(buf, lazy=False)

cmap = {v: chr(k) for k, v in font.getBestCmap().items()}
keep, found = set(), set()
for lookup in font['GSUB'].table.LookupList.Lookup:
    for st in lookup.SubTable:
        st = getattr(st, 'ExtSubTable', st)
        if not hasattr(st, 'ligatures'):
            continue
        for first, ligs in list(st.ligatures.items()):
            kept = []
            for lig in ligs:
                word = ''.join(cmap.get(g, '?') for g in [first] + lig.Component)
                if word in names:
                    kept.append(lig); keep.add(lig.LigGlyph); found.add(word)
            if kept: st.ligatures[first] = kept
            else: del st.ligatures[first]
missing = names - found
if missing:
    sys.exit(f'Not in Material Symbols: {sorted(missing)}')

opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['liga', 'rlig']
opts.notdef_outline = True
sub = subset.Subsetter(opts)
sub.populate(glyphs=keep, text='abcdefghijklmnopqrstuvwxyz_0123456789')
sub.subset(font)
out = here.parent.parent / 'public/fonts/material-symbols-reelay.woff2'
out.parent.mkdir(exist_ok=True)
font.flavor = 'woff2'
font.save(out)
print(f'{len(found)} icons, {out.stat().st_size // 1024} KB -> {out}')
