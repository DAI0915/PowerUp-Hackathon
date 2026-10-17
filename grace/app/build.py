#!/usr/bin/env python3
"""Inline data.json, src/engine.js, Interlock, the PowerUp bridge and the island planner into src/page.html -> index.html (no runtime fetches).

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
# SCE's line devices that opened in a Malibu shutoff (names and customers cut are real, positions are estimated) and the
# count of hypothetical service transformers behind each, from islands/malibu_hypothetical_assets.geojson
assets = json.load(open(os.path.join(root, 'islands', 'malibu_hypothetical_assets.geojson')))['features']
behind = {}
for f in assets:
    if f['properties']['kind'] == 'transformer':
        k = f['properties']['behind_device']; behind[k] = behind.get(k, 0) + 1
d['switches'] = [dict(kind=f['properties']['kind'], device=f['properties'].get('device') or f['properties']['name'].split(' ')[0],
                      circuit=(f['properties'].get('circuit') or '').title(), type=f['properties'].get('type', 'substation'),
                      customers_cut=f['properties'].get('customers_cut'), times_opened=f['properties'].get('times_opened'),
                      transformers=behind.get(f['properties'].get('device'), 0),
                      lon=rnd(f['geometry']['coordinates'][0]), lat=rnd(f['geometry']['coordinates'][1]))
                 for f in assets if f['properties']['kind'] != 'transformer']
d['transformers_total'] = sum(behind.values())
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
# islands/island.js is UMD (window.GraceIsland); scenario.cjs is CommonJS, so it gets a stand-in require and module
islands = (open(os.path.join(root, 'islands', 'island.js')).read() + '\n(function () {\nvar module = { exports: {} }, require = function () { return window.GraceIsland; };\n'
           + open(os.path.join(root, 'islands', 'scenario.cjs')).read() + '\nwindow.IslandScenario = module.exports;\n})();')
page = open(os.path.join(here, 'src', 'page.html')).read()
for k in ('/*__DATA__*/', '/*__ENGINE__*/', '/*__INTERLOCK__*/', '/*__BRIDGE__*/', '/*__ISLANDS__*/'):
    assert k in page, k
for js in (interlock, bridge, islands):
    assert '</script' not in js
out = (page.replace('/*__DATA__*/', data_js, 1).replace('/*__ENGINE__*/', engine, 1)
       .replace('/*__INTERLOCK__*/', interlock, 1).replace('/*__BRIDGE__*/', bridge, 1).replace('/*__ISLANDS__*/', islands, 1))
open(os.path.join(here, 'index.html'), 'w').write(out)
print('wrote index.html', len(out.encode('utf-8')), 'bytes')
