#!/usr/bin/env python3
"""Inline data.json, src/engine.js, Interlock and the PowerUp bridge into src/page.html -> index.html (no runtime fetches).

Interlock is written as ES modules (interlock/src/engine.mjs, packs.mjs). The page is a classic script, so each module
is wrapped in a function scope with its `export` keywords dropped, and its exported names are gathered on window.Interlock.
"""
import json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.normpath(os.path.join(here, '..', '..'))
data_path = os.path.join(here, '..', 'data', 'data.json')
d = json.load(open(data_path))
def rnd(v, n=5):
    return round(v, n)
for c in d['lines']:
    d['lines'][c] = [[[rnd(p[0]), rnd(p[1])] for p in pl] for pl in d['lines'][c]]
d['coast'] = [[rnd(p[0]), rnd(p[1])] for p in d['coast']]
data_js = json.dumps(d, separators=(',', ':'), ensure_ascii=False).replace('</', '<\\/')
engine = open(os.path.join(here, 'src', 'engine.js')).read()

def classic(path):
    src = open(path).read()
    assert not re.search(r'^\s*import\s', src, re.M), path + ' imports another module; bundle it first'
    names = re.findall(r'^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)', src, re.M)
    body = re.sub(r'^export\s+(?=(?:async\s+)?(?:function|const|let|class)\s)', '', src, flags=re.M)
    assert not re.search(r'^\s*export\b', body, re.M), path + ' has an export form this bundler does not handle'
    return '(function () {\n' + body + '\nreturn { ' + ', '.join(names) + ' };\n})()'

il = os.path.join(root, 'interlock', 'src')
interlock = ('/* Interlock (interlock/src/engine.mjs + packs.mjs), bundled by grace/app/build.py */\n'
             'window.Interlock = Object.assign({}, ' + classic(os.path.join(il, 'engine.mjs')) + ', ' + classic(os.path.join(il, 'packs.mjs')) + ');')
bridge = open(os.path.join(root, 'bridge', 'powerup.js')).read()
page = open(os.path.join(here, 'src', 'page.html')).read()
for k in ('/*__DATA__*/', '/*__ENGINE__*/', '/*__INTERLOCK__*/', '/*__BRIDGE__*/'):
    assert k in page, k
for js in (interlock, bridge):
    assert '</script' not in js
out = (page.replace('/*__DATA__*/', data_js, 1).replace('/*__ENGINE__*/', engine, 1)
       .replace('/*__INTERLOCK__*/', interlock, 1).replace('/*__BRIDGE__*/', bridge, 1))
open(os.path.join(here, 'index.html'), 'w').write(out)
print('wrote index.html', len(out.encode('utf-8')), 'bytes')
