"""Hypothetical switch and transformer layer for the five Malibu circuits SCE publishes line shapes for.

Real: SCE's circuit lines (data/grace/malibu_circuits.geojson), each line device's name and how many customers it cut
(malibu_device_shutoffs.csv). Not public, so estimated here: where each device sits, and where the service
transformers are. Run: python3 -I hypothetical_assets.py  -> malibu_hypothetical_assets.geojson
- Substation: Latigo is placed where the Cuthbert, Galahad, Maguire and Merlin lines come closest together; Serra (Crater
  substation) is rooted at its most inland vertex.
- Device: placed at the line vertex whose downstream line length, as a share of the circuit, is closest to the share
  of customers the device cut, smallest cut on record (customers assumed spread evenly along the line).
- Transformers: one per 8 customers (assumed, a typical 25-50 kVA residential unit), spaced evenly along the line.
"""
import csv, heapq, json, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
GRACE = os.path.join(HERE, '..', 'data', 'grace')
HOMES_PER_XFMR = 8

def dist(a, b):
    kx = 111320 * math.cos(math.radians(34.03))
    return math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110570)

def graph(lines):
    key = lambda p: (round(p[0], 5), round(p[1], 5))
    adj = {}
    def add(a, b):
        if a == b: return
        d = dist(a, b)
        adj.setdefault(a, {})[b] = d; adj.setdefault(b, {})[a] = d
    ends = []
    for ln in lines:
        pts = [key(p) for p in ln]
        for a, b in zip(pts, pts[1:]): add(a, b)
        ends += [pts[0], pts[-1]]
    # SCE's shapes come in loose pieces: join every piece to the nearest part of the network, nearest gaps first
    comp = {}
    for n in adj:
        if n in comp: continue
        stack, cid = [n], len(set(comp.values()))
        comp[n] = cid
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if v not in comp: comp[v] = cid; stack.append(v)
    CELL = 0.002
    cell = lambda p: (int(p[0] // CELL), int(p[1] // CELL))
    groups = {}
    for n, c in comp.items(): groups.setdefault(c, []).append(n)
    main = max(groups, key=lambda c: len(groups[c]))
    grid = {}
    def index(nodes):
        for n in nodes: grid.setdefault(cell(n), []).append(n)
    index(groups.pop(main))
    def nearest(nodes, radius):
        best, rc = (1e18, None, None), int(radius / (CELL * 90000)) + 1
        for n in nodes:
            cx, cy = cell(n)
            for i in range(cx - rc, cx + rc + 1):
                for j in range(cy - rc, cy + rc + 1):
                    for m in grid.get((i, j), ()):
                        d = dist(n, m)
                        if d < best[0]: best = (d, n, m)
        return best if best[0] <= radius else None
    # pass with a growing gap allowance, so close pieces join first; only piece ends are tried
    radius = 40
    while groups and radius < 20000:
        joined = True
        while joined:
            joined = False
            for c in list(groups):
                tips = [n for n in groups[c] if len(adj[n]) <= 1] or groups[c]
                hit = nearest(tips, radius)
                if hit:
                    add(hit[1], hit[2]); index(groups.pop(c)); joined = True
        radius *= 2
    return adj

def tree(adj, root):
    d, par, pq = {root: 0}, {root: None}, [(0, root)]
    while pq:
        du, u = heapq.heappop(pq)
        if du > d[u]: continue
        for v, w in adj[u].items():
            if du + w < d.get(v, 1e18): d[v] = du + w; par[v] = u; heapq.heappush(pq, (d[v], v))
    down = {n: 0.0 for n in d}
    for n in sorted(d, key=lambda n: -d[n]):
        p = par[n]
        if p is not None: down[p] += down[n] + adj[n][p]
    return d, par, down

def main():
    g = json.load(open(os.path.join(GRACE, 'malibu_circuits.geojson')))
    circ = {f['properties']['circuit']: f for f in g['features']}
    adjs = {c: graph(f['geometry']['coordinates']) for c, f in circ.items()}
    lat = ['CUTHBERT', 'GALAHAD', 'MAGUIRE', 'MERLIN']
    near = lambda c, p: min(adjs[c], key=lambda n: dist(n, p))
    sub = min(adjs['MERLIN'], key=lambda p: max(dist(p, near(c, p)) for c in lat))
    roots = {c: near(c, sub) for c in lat}
    roots['SERRA'] = max(adjs['SERRA'], key=lambda p: p[1])
    feats = [{'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': list(sub)},
              'properties': {'kind': 'substation', 'name': 'LATIGO (estimated location)', 'basis': 'where four Latigo circuits converge'}}]
    trees = {c: tree(adjs[c], roots[c]) for c in circ}
    devs = list(csv.DictReader(open(os.path.join(HERE, 'malibu_device_shutoffs.csv'))))
    seen, devnode = set(), {}
    for r in devs:
        c, dv = r['circuit'], r['device']
        if (c, dv) in seen: continue
        seen.add((c, dv))
        d, par, down = trees[c]
        total = down[roots[c]]
        share = min(float(x['share_of_circuit']) for x in devs if x['circuit'] == c and x['device'] == dv)
        node = min((n for n in d if n != roots[c]), key=lambda n: abs(down[n] / total - share))
        devnode.setdefault(c, {})[node] = dv
        feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': list(node)},
                      'properties': {'kind': 'line_device', 'circuit': c, 'device': dv,
                                     'type': {'RAR': 'recloser', 'RCS': 'remote-controlled switch', 'PS': 'sectionalizing device'}.get(''.join(ch for ch in dv if ch.isalpha()), dv),
                                     'customers_cut': min(int(x['customers_cut']) for x in devs if x['circuit'] == c and x['device'] == dv),
                                     'times_opened': sum(1 for x in devs if x['circuit'] == c and x['device'] == dv),
                                     'location': 'estimated', 'downstream_line_share': round(down[node] / total, 2)}})
    def behind(c, n, par, memo):
        path = []
        while n is not None and n not in memo:
            if n in devnode.get(c, {}): memo[n] = devnode[c][n]; break
            path.append(n); n = par[n]
        v = memo.get(n, 'breaker') if n is not None else 'breaker'
        for q in path: memo[q] = v
        return v
    for c, f in circ.items():
        d, par, down = trees[c]
        memo = {}
        cust = f['properties']['customers_latest']
        total = down[roots[c]]
        n = max(1, round(cust / HOMES_PER_XFMR))
        step = total / n
        acc, k = step / 2, 0
        for u in sorted(d, key=lambda n: d[n]):
            p = par[u]
            if p is None: continue
            w = adjs[c][u][p]
            while acc <= w and k < n:
                t = acc / w
                pt = [round(p[0] + (u[0] - p[0]) * t, 6), round(p[1] + (u[1] - p[1]) * t, 6)]
                k += 1
                feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': pt},
                              'properties': {'kind': 'transformer', 'id': f'{c}-T{k:04d}', 'circuit': c,
                                             'homes': HOMES_PER_XFMR, 'location': 'hypothetical',
                                             'behind_device': behind(c, u, par, memo),
                                             'island_switch': 'hypothetical (not installed)'}})
                acc += step
            acc -= w
    out = {'type': 'FeatureCollection', 'note': __doc__.strip(), 'features': feats}
    json.dump(out, open(os.path.join(HERE, 'malibu_hypothetical_assets.geojson'), 'w'))
    kinds = {}
    for f in feats: kinds[f['properties']['kind']] = kinds.get(f['properties']['kind'], 0) + 1
    print(kinds, 'substation est', sub)
    for f in feats:
        if f['properties']['kind'] == 'line_device': print(f['properties'], f['geometry']['coordinates'])

main()
