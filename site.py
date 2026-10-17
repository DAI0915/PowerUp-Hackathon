#!/usr/bin/env python3
"""Assemble the two demo pages: the Malibu replay (built by grace/app/build.py) and Interlock's heat-wave replay.
Run: python3 -I site.py

- Repo root: index.html and heatwave.html, for GitHub Pages (deploy from the main branch, root folder). The heat-wave
  page loads interlock/src, interlock/data and interlock/out in place.
- site/: the same two pages with the Interlock files copied beside them, as published to the claude.ai Artifact.

Serve either with any static server (module scripts do not load from file://)."""
import os, shutil
root = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(root, 'site')
il = os.path.join(root, 'interlock')
if os.path.isdir(out):
    shutil.rmtree(out)
os.makedirs(out)
shutil.copy(os.path.join(root, 'grace', 'app', 'index.html'), os.path.join(out, 'index.html'))
for sub, names in (('src', ('engine.mjs', 'packs.mjs', 'silence.mjs', 'sim.mjs')), ('data', ('circuits.mjs',)), ('out', ('results.json',))):
    os.makedirs(os.path.join(out, sub))
    for n in names:
        shutil.copy(os.path.join(il, sub, n), os.path.join(out, sub, n))

page = open(os.path.join(il, 'index.html'), encoding='utf-8').read()
brand = '<span class="wordmark">Interlock</span>'
assert page.count(brand) == 1
page = page.replace(brand, brand + '\n      <a class="brand-sub" href="index.html">Part of PowerUp: back to the Malibu replay</a>', 1)
page = page.replace('<title>Interlock</title>', '<title>Interlock Heat Wave</title>', 1)
# on the Artifact the main page gets the host's skeleton and the second page carries its own; on GitHub Pages both do
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>:root { padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }'
        ' body { margin: 0; font: 14px system-ui, sans-serif; } img { max-width: 100%; } [hidden] { display: none !important; }</style>\n')
open(os.path.join(out, 'heatwave.html'), 'w', encoding='utf-8').write(head + page + '\n</html>\n')
print('wrote', out)

malibu = open(os.path.join(root, 'grace', 'app', 'index.html'), encoding='utf-8').read()
open(os.path.join(root, 'index.html'), 'w', encoding='utf-8').write(head + malibu + '\n</html>\n')
rooted = page
for a, b in (("from './src/", "from './interlock/src/"), ("from './data/", "from './interlock/data/"), ("fetch('./out/", "fetch('./interlock/out/")):
    assert a in rooted, a
    rooted = rooted.replace(a, b)
open(os.path.join(root, 'heatwave.html'), 'w', encoding='utf-8').write(head + rooted + '\n</html>\n')
print('wrote index.html and heatwave.html at the repo root')
