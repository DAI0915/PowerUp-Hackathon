#!/usr/bin/env python3
"""Inline data.json and src/engine.js into src/page.html -> index.html (no runtime fetches)."""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
data_path = os.path.join(here, '..', 'data', 'data.json')
d = json.load(open(data_path))
def rnd(v, n=5):
    return round(v, n)
for c in d['lines']:
    d['lines'][c] = [[[rnd(p[0]), rnd(p[1])] for p in pl] for pl in d['lines'][c]]
d['coast'] = [[rnd(p[0]), rnd(p[1])] for p in d['coast']]
data_js = json.dumps(d, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
engine = open(os.path.join(here, 'src', 'engine.js')).read()
page = open(os.path.join(here, 'src', 'page.html')).read()
assert '/*__DATA__*/' in page and '/*__ENGINE__*/' in page
out = page.replace('/*__DATA__*/', data_js, 1).replace('/*__ENGINE__*/', engine, 1)
open(os.path.join(here, 'index.html'), 'w').write(out)
print('wrote index.html', len(out.encode('utf-8')), 'bytes')
