"""Build pilot/index.html: one self-contained page from src/page.html, islands/island.js, src/pilot.js and data.json.
Run: python3 -I pilot/build.py   (run pilot/build_data.py first if the data changed)
"""
import os
HERE = os.path.dirname(os.path.abspath(__file__))
read = lambda *p: open(os.path.join(HERE, *p)).read()
page = read('src', 'page.html')
page = page.replace('/*ISLAND*/', read('..', 'islands', 'island.js'))
page = page.replace('/*PILOT*/', read('src', 'pilot.js'))
page = page.replace('/*DATA*/null', read('data.json'))
open(os.path.join(HERE, 'index.html'), 'w').write(page)
print('pilot/index.html', len(page) // 1024, 'KB')
