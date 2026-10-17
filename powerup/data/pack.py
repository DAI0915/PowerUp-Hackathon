import json, csv, sys, math, collections
S = sys.argv[1]; G = '/mnt/project-files/data/powerup'
def rdp(pts, eps):
    if len(pts) < 3: return pts
    (x1, y1), (x2, y2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1; L = math.hypot(dx, dy)
    best, idx = -1, 0
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs(dy*px - dx*py + x2*y1 - y2*x1) / L if L else math.hypot(px-x1, py-y1)
        if d > best: best, idx = d, i
    if best > eps: return rdp(pts[:idx+1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]
want = ['GALAHAD','MAGUIRE','CUTHBERT','MERLIN','SERRA','NICHOLAS']
raw = json.load(open(f'{S}/raw/PSPS_Circuit.geojson'))
got = {}
for f in raw['features']:
    c = f['properties']['circuit_name'].strip().upper()
    if c in want and c not in got: got[c] = f
lines = {}; npts = 0; south = {}
for c in want:
    parts = []
    for part in got[c]['geometry']['coordinates']:
        pts = [(x, y) for x, y, *_ in part]
        for x, y in pts:
            b = round(x, 3); south[b] = min(south.get(b, 99), y)
        s = rdp(pts, 0.00008)
        q = []
        for x, y in s:
            t = (round(x, 5), round(y, 5))
            if not q or q[-1] != t: q.append(t)
        if len(q) >= 2: parts.append(q); npts += len(q)
    lines[c.title()] = parts
print('line points', npts)
# coast: hand trace, pushed seaward of any line point
hand = [(-119.10,34.10),(-119.06,34.085),(-118.98,34.06),(-118.935,34.045),(-118.88,34.04),(-118.83,34.015),(-118.806,34.001),(-118.787,34.018),(-118.74,34.03),(-118.68,34.033),(-118.65,34.035),(-118.61,34.038),(-118.585,34.038),(-118.565,34.045),(-118.52,34.03)]
def hy(x):
    for (ax, ay), (bx, by) in zip(hand, hand[1:]):
        if ax <= x <= bx: return ay + (by - ay) * (x - ax) / (bx - ax)
    return hand[-1][1]
coast = []
x = -119.10
while x <= -118.52 + 1e-9:
    b = round(x, 3)
    env = min([south.get(round(b + k/1000, 3), 99) for k in range(-2, 3)])
    y = hy(x)
    if env < 99: y = min(y, env - 0.0015)
    coast.append((round(x, 4), round(y, 4))); x += 0.002
# smooth southward only
sm = []
for i, (x, y) in enumerate(coast):
    w = [coast[j][1] for j in range(max(0, i-2), min(len(coast), i+3))]
    sm.append((x, round(min(y, sum(w)/len(w)), 4)))
# history
def num(s):
    try: return float(s)
    except ValueError: return None
hist = list(csv.DictReader(open(f'{G}/malibu_psps_history.csv')))
events = [dict(circuit=e['circuit'].title(), event=e['psps_event'], customers=int(e['customers']), start=e['deenergized'], end=e['reenergized'], hours=float(e['hours_out']), gust=num(e['wind_gust_mph']), fpi=num(e['fpi']), whole='-CB-' in e['psps_event']) for e in hist]
# load profiles
lp = collections.defaultdict(lambda: [[None]*24 for _ in range(12)])
for r in csv.DictReader(open(f'{G}/malibu_circuit_load_profiles.csv')):
    lp[r['circuit'].title()][int(r['month'])-1][int(r['hour'])] = [float(r['min_load']), float(r['max_load']), int(r['year'])]
load = {}
for c, months in lp.items():
    load[c] = {'min': [[h[0] for h in m] for m in months], 'max': [[h[1] for h in m] for m in months], 'year': [m[0][2] for m in months]}
circuits = {}
cust = {'Cuthbert': 2407, 'Galahad': 2220, 'Merlin': 775, 'Maguire': 687, 'Serra': 285}
sub = {'Cuthbert': 'Latigo', 'Galahad': 'Latigo', 'Merlin': 'Latigo', 'Maguire': 'Latigo', 'Serra': 'Crater', 'Tuna': 'Tapia', 'Nicholas': 'Tapia'}
for c in ['Galahad','Maguire','Cuthbert','Merlin','Serra','Tuna','Nicholas']:
    h = [e for e in events if e['circuit'] == c]
    circuits[c] = dict(substation=sub[c], voltage='16 kV', named_oct_2026=c != 'Nicholas',
        named_on='2026-10-12' if c in ('Cuthbert','Galahad','Maguire','Merlin') else ('2026-10-14' if c in ('Serra','Tuna') else None),
        customers=cust.get(c), customers_source='SCE PSPS layer, latest whole-circuit shutoff' if c in cust else ('assumption: no SCE record; City describes it as coastal Civic Center Way to Carbon Mesa Rd' if c == 'Tuna' else 'not needed'),
        shutoffs_on_record=len(h), longest_hours=max([e['hours'] for e in h], default=None),
        has_line=c in lines, load_usable=c != 'Serra')
circuits['Tuna']['customers'] = 500
circuits['Tuna']['customers_assumed'] = True
# Tuna / Seaboard approximate areas from City descriptions (lon ranges, miles inland)
approx = {'Tuna': dict(lon=[-118.69,-118.655], inland_mi=[0.1,1.0], note='Coastal, Civic Center Way to Carbon Mesa Rd, about 1 mi inland. No SCE line on record.'),
          'Seaboard': dict(lon=[-118.72,-118.668], inland_mi=[0.1,1.5], note='Coastal, Puerco Canyon to Serra Rd, 1.5 mi inland. Not named this event.')}
timeline = [
 dict(t='2026-10-07 14:37', kind='nws', text='NWS LA/Oxnard forecast mentions only decreasing clouds and warming. No Santa Ana language.'),
 dict(t='2026-10-09 02:14', kind='nws', rung='watch', text='First NWS signal: offshore gradients midweek, potential for weak to moderate Santa Ana winds.'),
 dict(t='2026-10-11 08:43', kind='nws', text='NWS: increasing confidence in weak to moderate Santa Ana winds; moderate winds across Ventura and LA by Friday.'),
 dict(t='2026-10-12 09:00', kind='sce', rung='ask', text='SCE tells the City of Malibu it may de-energize Cuthbert, Galahad, Maguire and Merlin from midnight Thursday.'),
 dict(t='2026-10-12 14:09', kind='nws', text='NWS: a hot and dry Santa Ana; large and fast-moving fires are a concern. Gusts 35 to 70 mph Friday morning.'),
 dict(t='2026-10-13 12:00', kind='nws', text='Fire Weather Watch for Thursday morning through Friday evening, Santa Monica Mountains and Malibu Coast. Humidity 5 to 15%.'),
 dict(t='2026-10-14 06:37', kind='sce', rung='fill', text='SCE: Merlin could be shut off as soon as 10:30 AM. Serra and Tuna added. Six Malibu circuits.'),
 dict(t='2026-10-14 09:58', kind='sce', text='Nearly 90,000 LA County customers face possible shutoffs.'),
 dict(t='2026-10-14 17:00', kind='nws', text='Red Flag Warning for the Santa Monica Mountains, Thursday 6 AM through Saturday 8 PM. Heat advisory, up to 95°F.'),
 dict(t='2026-10-15 06:00', kind='nws', text='Red Flag Warning takes effect.'),
 dict(t='2026-10-15 07:00', kind='sce', text='City: SCE may shut off central Malibu circuits this morning; timing changes often.'),
 dict(t='2026-10-15 15:04', kind='sce', text='95,284 LA County customers in PSPS scope.'),
 dict(t='2026-10-15 16:00', kind='sce', rung='hold', text='Power off in central and west Malibu (City reports it out by 5 PM; exact time unpublished).'),
 dict(t='2026-10-15 16:41', kind='fire', text='Bryson Fire starts near Encinal Canyon Rd by Camp Kilpatrick. Evacuation orders for Encinal Canyon and Mulholland.'),
 dict(t='2026-10-15 23:00', kind='fire', text='Evacuation warnings for Malibu zones MAL-C113 and MAL-C114.'),
 dict(t='2026-10-16 07:00', kind='sce', text='69,746 SCE customers de-energized: LA County 34,946, Ventura 34,800.'),
 dict(t='2026-10-16 12:29', kind='sce', text='LA County out: 52,953. Ventura facing shutoff: 57,120. Malibu especially hard hit.'),
 dict(t='2026-10-16 15:00', kind='fire', text='Bryson Fire 147 acres, 39% contained, 7,221 structures threatened, none destroyed.'),
 dict(t='2026-10-17 20:00', kind='nws', rung='hand', text='Red Flag Warning ends. Winds ease; SCE patrols each line before restoring, 8 or more hours.'),
 dict(t='2026-10-18 06:00', kind='plan', text='Planned, not yet happened: first circuits restored after patrol. PowerUP proposes a staggered recharge for the shutoff officer to approve.'),
]
assumptions = dict(
    battery=dict(capacity_kwh=39.2, power_kw=20, reserve_floor_pct=20, source='Base Core spec (Electrek, Aug 2026)'),
    adoption_pct=dict(default=15, min=2, max=100, note='Share of homes with a Base battery. Base has no California fleet; this is a demo.'),
    medical_baseline_pct=dict(default=5, min=1, max=20, note='Share of homes on SCE Medical Baseline. SCE does not publish per-circuit counts.'),
    daily_use_kwh=dict(default=32, min=10, max=60, source='SCE Q4 2025 usage by ZIP: Malibu 90265 homes averaged about 32 kWh a day in October 2025'),
    budget_modes=dict(critical=8, essential=16, normal=32, note='kWh per day in outage. Critical = fridge, medical device, lights, phone, well pump. Assumed.'),
    cell_tower_backup_h=dict(default=8, min=2, max=48, note='Hours a cell tower runs on its own battery after the grid goes down. Assumed.'),
    silent_fault_pct=dict(default=1, note='Share of batteries that are actually broken when silent. Assumed.'),
    restore_patrol_h=dict(default=10, note='Hours from winds easing to first circuit restored. SCE says 8 or more.'),
    cold_load_cap_pct=dict(default=100, note='Fleet recharge after restoration is capped so circuit load stays under its October peak.'),
    tou=dict(on_peak=0.60, off_peak=0.30, on_peak_hours=[16,21], note='SCE TOU-D-4-9PM, approximate 2025 rates in $/kWh. Assumed for the ordinary-day savings estimate.'),
)
sources = [
 dict(name='SCE DRPEP portal, PSPS Circuit layer', url='https://drpep-sce2.opendata.arcgis.com/search', used='circuit lines, customer counts, 55 past shutoffs 2019 to 2025'),
 dict(name='SCE DRPEP portal, Circuit Load Profile', url='https://drpep-sce2.opendata.arcgis.com/search', used='hourly low and high load per circuit and month; units unstated, Serra unusable'),
 dict(name='SCE quarterly usage by ZIP (Q4 2025)', url='https://www.sce.com/regulatory/energy-data---reports-and-compliances', used='Malibu homes about 32 kWh a day in October 2025'),
 dict(name='NWS LA/Oxnard forecast discussions via IEM', url='https://mesonet.agron.iastate.edu/api/1/nwstext/202610090914-KLOX-FXUS66-AFDLOX', used='first Santa Ana signal Oct 9 2:14 AM'),
 dict(name='City of Malibu news flash', url='https://www.malibucity.org/m/newsflash/Home/Detail/2168', used='circuits named, shutoff by 5 PM Oct 15, restoration after patrol'),
 dict(name='Patch, Oct 14', url='https://patch.com/california/malibu/malibu-faces-imminent-power-shutoffs-90-000-la-county-customers-risk', used='Serra and Tuna added; 90,000 LA County customers'),
 dict(name='CAL FIRE Bryson Fire', url='https://www.fire.ca.gov/incidents/2026/10/15/bryson-fire', used='fire origin and containment'),
 dict(name='FOX 11, Oct 16', url='https://www.foxla.com/news/southern-california-edison-power-shutoff-santa-ana-winds-fire-risk', used='69,746 customers out'),
 dict(name='Electrek on Base Core', url='https://electrek.co/2026/08/03/base-power-raises-1b-to-roll-out-its-giant-new-home-battery/', used='39.2 kWh, 20 kW battery'),
 dict(name='Case study page', url='https://claude.ai/artifact/5u8jbeVE844y7heeDDTFi3', used='day-by-day timeline with every source'),
]
pack = dict(
    meta=dict(built='2026-10-17', bbox=[-119.10, 33.98, -118.52, 34.20], crs='lon/lat WGS84', note='Lines simplified to about 10 m. Coast is approximate.'),
    circuits=circuits, lines=lines, approx_areas=approx, coast=sm,
    places=[dict(n='Point Dume', lon=-118.806, lat=34.001), dict(n='Zuma Beach', lon=-118.83, lat=34.015), dict(n='Malibu Lagoon', lon=-118.68, lat=34.033), dict(n='Topanga', lon=-118.60, lat=34.093), dict(n='Calabasas', lon=-118.64, lat=34.157), dict(n='Agoura Hills', lon=-118.76, lat=34.148), dict(n='Leo Carrillo', lon=-118.935, lat=34.045), dict(n='Malibu Civic Center', lon=-118.69, lat=34.035)],
    fire=dict(name='Bryson Fire', lon=-118.8407, lat=34.0924, started='2026-10-15 16:41', acres=147, contained_pct=39, as_of='2026-10-16 15:00'),
    shutoff_history=events, load=load, timeline=timeline, assumptions=assumptions, sources=sources)
json.dump(pack, open(f'{S}/app/data.json', 'w'), separators=(',', ':'))
print('bytes', len(json.dumps(pack, separators=(',', ':'))))
