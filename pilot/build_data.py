"""Data for the RAR8848 pilot: the line behind switch RAR8848 on SCE's Cuthbert circuit, 456 homes on it, Cuthbert's real
shutoffs that cut those homes, and the real SCE price values.

Real: SCE's Cuthbert line shape, RAR8848's 456 customers and every Cuthbert shutoff 2019 to Jan 2025 (SCE PSPS records),
CAISO day-ahead arbitrage value per battery-day for SCE, Q4 2025 (powerup/data/prices), Malibu 90265 solar and battery
rates (SCE interconnection records) and Maguire's Medical Baseline share (SCE's Dec 2024 report to the CPUC).
Estimated: where RAR8848 sits on the line (islands/hypothetical_assets.py) and where each home is (spread evenly along
the line behind it). Each home's battery, solar, medical need and choice is drawn at the real rates, so a home on the map
is a stand-in, not a real address.
Run: python3 -I pilot/build_data.py  -> pilot/data.json
"""
import csv, json, math, os, random
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..')
src = open(os.path.join(ROOT, 'islands', 'hypothetical_assets.py')).read()
src = src[:src.rstrip().rfind('\nmain()')]          # load the helpers without running that script
NS = {'__file__': os.path.join(ROOT, 'islands', 'hypothetical_assets.py')}
exec(src, NS)
graph, tree, dist = NS['graph'], NS['tree'], NS['dist']

HOMES = 456
RATES = {'battery': 0.071, 'solar_only': 0.084, 'medical': 0.026}   # per home, real (see docstring)
BURN_KM = 9.0                                                        # nearest point of the line to the Bryson burn

def main():
    g = json.load(open(os.path.join(ROOT, 'powerup', 'data', 'malibu', 'malibu_circuits.geojson')))
    A = json.load(open(os.path.join(ROOT, 'islands', 'malibu_hypothetical_assets.geojson')))
    sub = next(f for f in A['features'] if f['properties']['kind'] == 'substation')['geometry']['coordinates']
    dev = {f['properties']['device']: f['geometry']['coordinates'] for f in A['features']
           if f['properties']['kind'] == 'line_device' and f['properties']['circuit'] == 'CUTHBERT'}
    f = next(f for f in g['features'] if f['properties']['circuit'] == 'CUTHBERT')
    adj = graph(f['geometry']['coordinates'])
    root = min(adj, key=lambda n: dist(n, sub))
    d, par, down = tree(adj, root)
    sw = min(d, key=lambda n: dist(n, dev['RAR8848']))
    up = min(d, key=lambda n: dist(n, dev['RCS0036']))
    def behind(n):
        while n is not None:
            if n == sw: return True
            n = par[n]
        return False
    kids = {}
    for n in d:
        if par[n] is not None: kids.setdefault(par[n], []).append(n)
    edges, stack = [], [sw]                       # depth first, so the edges chain into long polylines
    while stack:
        n = stack.pop()
        for k in kids.get(n, []):
            edges.append((n, k)); stack.append(k)
    total = sum(dist(a, b) for a, b in edges)
    # homes spaced evenly along the line behind the switch, nudged off the line so they read as houses
    rnd = random.Random(8848)
    step, homes = total / HOMES, []
    acc = step / 2
    for a, b in edges:
        L = dist(a, b)
        t = acc
        while t < L and len(homes) < HOMES:
            x = a[0] + (b[0] - a[0]) * t / L; y = a[1] + (b[1] - a[1]) * t / L
            nx, ny = -(b[1] - a[1]), (b[0] - a[0]); nl = math.hypot(nx, ny) or 1
            side = 1 if len(homes) % 2 else -1
            off = side * (0.00018 + rnd.random() * 0.00012)
            homes.append([round(x + nx / nl * off, 6), round(y + ny / nl * off, 6)])
            t += step
        acc = t - L
    while len(homes) < HOMES:                     # rounding leftovers go on the last stretch
        homes.append(homes[-1])
    out = []
    for i, (x, y) in enumerate(homes):
        r = rnd.random()
        battery = r < RATES['battery']
        solar = battery or r < RATES['battery'] + RATES['solar_only']
        out.append({'id': i, 'x': x, 'y': y, 'battery': battery, 'solar': solar,
                    'medical': rnd.random() < RATES['medical'], 'size': round(0.6 + rnd.random(), 2),
                    'u': round(rnd.random(), 4), 'v': round(rnd.random(), 4)})
    # Cuthbert shutoffs that cut RAR8848's homes: whole-circuit breaker cuts (>= 1,100 customers; Cuthbert had ~1,130
    # homes before the Galahad tie moved ~1,200 over in 2024) and RAR8848 opened alone. Smaller cuts sat elsewhere.
    ev = []
    for r in csv.DictReader(open(os.path.join(ROOT, 'powerup', 'data', 'malibu', 'malibu_psps_history.csv'))):
        if r['circuit'] != 'CUTHBERT': continue
        dev_ = r['psps_event'].split('-')[3]
        n = int(r['customers'])
        if (dev_ == 'CB' and n >= 1100) or dev_ == 'RAR8848':
            ev.append({'start': r['deenergized'], 'end': r['reenergized'], 'hours': float(r['hours_out']),
                       'cut_at': 'breaker' if dev_ == 'CB' else 'RAR8848', 'customers': n})
    prices = [{'date': r['date'], 'v20': float(r['value_floor20']), 'v50': float(r['value_floor50']),
               'v80': float(r['value_floor80'])}
              for r in csv.DictReader(open(os.path.join(ROOT, 'powerup', 'data', 'prices', 'caiso_dlap_sce_dam_2025q4_daily_value.csv')))]
    # merge consecutive edges into polylines to keep the file small
    polys, cur = [], None
    for a, b in edges:
        if cur and cur[-1] == list(a): cur.append(list(b))
        else:
            cur = [list(a), list(b)]; polys.append(cur)
    feed = []
    n = up
    while n is not None:
        feed.append(list(n)); n = par[n]
    data = {'note': __doc__.strip(), 'switch': list(sw), 'upstream_switch': list(up), 'substation': list(root),
            'feed': feed, 'lines': polys, 'line_km': round(total / 1000, 1), 'homes': out, 'events': ev,
            'prices': prices, 'rates': RATES, 'burn_km': BURN_KM}
    json.dump(data, open(os.path.join(HERE, 'data.json'), 'w'), separators=(',', ':'))
    print(f"{len(out)} homes on {total/1000:.1f} km; batteries {sum(h['battery'] for h in out)}, solar-only "
          f"{sum(h['solar'] and not h['battery'] for h in out)}, medical {sum(h['medical'] for h in out)}; "
          f"{len(ev)} real shutoffs, {sum(e['hours'] for e in ev):.0f} h; {len(polys)} polylines")

if __name__ == '__main__':
    main()
