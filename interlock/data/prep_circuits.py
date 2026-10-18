"""Write data/circuits.json (+ circuits.mjs) for the RAR8848 pilot: one circuit section, the 456 homes behind SCE
switch RAR8848 on the Cuthbert circuit (Latigo substation, Malibu, 16 kV).

Run: python3 -I interlock/data/prep_circuits.py   (from the repo root, or from anywhere)

Sources (all in the repo):
- powerup/data/malibu/malibu_circuit_load_profiles.csv: SCE Circuit Load Profile (open data), Cuthbert, 2024, hourly
  min and max per month. REAL. SCE states no units; we INFER amps per phase and convert with MW = sqrt(3) x kV x A / 1000
  (27.7 kW per unit at 16 kV, the same reading the pilot uses).
- powerup/data/data.json: Cuthbert's customer count (2,407, SCE PSPS layer). pilot/data.json: the 456 homes behind
  RAR8848 (SCE PSPS record, Dec 2 2020). REAL.
- powerup/data/prices/caiso_dlap_sce_dam_2025q4_daily_value.csv: CAISO day-ahead value of one Base Core per day for the
  SCE load zone, Q4 2025. REAL (only daily values are in the repo, so the replay prices the evening at SCE TOU, ASSUMED).

Branch load: Cuthbert's October 2024 profile x 456 / 2,407 (ASSUMED: every customer on Cuthbert draws alike), the same
scaling the pilot uses (pilot/app/build_pack.py). The ordinary evening uses the midpoint of each hour's October min and
max (ASSUMED). Import limit: the branch's October peak, the cap the pilot uses for its cold-load pickup
(cold_load_cap_pct = 100). Export cap: 15% of that, the pilot's EXPORT_CAP_FRAC (pilot/app/src/bridge.js). Both ASSUMED.
"""
import csv
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
LOADS = os.path.join(ROOT, 'powerup', 'data', 'malibu', 'malibu_circuit_load_profiles.csv')
PRICES = os.path.join(ROOT, 'powerup', 'data', 'prices', 'caiso_dlap_sce_dam_2025q4_daily_value.csv')
OUT_JSON = os.path.join(HERE, 'circuits.json')
OUT_MJS = os.path.join(HERE, 'circuits.mjs')

CIRCUIT, MONTH = 'CUTHBERT', 10        # October
PRICE_DATE = '2025-10-14'              # same calendar date, one year earlier
EXPORT_CAP_FRAC = 0.15                 # pilot/app/src/bridge.js


def to_mw(units, kv):
    return round(math.sqrt(3) * kv * units / 1000.0, 4)


def main():
    pd = json.load(open(os.path.join(ROOT, 'powerup', 'data', 'data.json')))
    circuit_customers = pd['circuits']['Cuthbert']['customers']
    homes = len(json.load(open(os.path.join(ROOT, 'pilot', 'data.json')))['homes'])
    scale = homes / circuit_customers

    hours, kv, year, substation = {}, None, None, None
    with open(LOADS, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            if r['circuit'] != CIRCUIT or int(r['month']) != MONTH:
                continue
            kv = float(r['voltage'].upper().replace('KV', ''))
            year, substation = int(r['year']), r['substation'].title()
            hours[int(r['hour'])] = (float(r['min_load']), float(r['max_load']))
    assert len(hours) == 24, 'need all 24 October hours for Cuthbert'

    hourly = []
    for h in range(24):
        mn, mx = hours[h]
        bmn, bmx = mn * scale, mx * scale
        hourly.append({'hour': h, 'minA': mn, 'maxA': mx, 'minMW': to_mw(bmn, kv), 'maxMW': to_mw(bmx, kv),
                       'mw': to_mw((bmn + bmx) / 2, kv)})
    peak = max(x['maxMW'] for x in hourly)

    price = None
    with open(PRICES, newline='') as f:
        for r in csv.DictReader(f):
            if r['date'] == PRICE_DATE:
                price = {k: float(v) for k, v in r.items() if k != 'date'}
    assert price, f'no CAISO value for {PRICE_DATE}'

    out = {
        'source': 'powerup/data/malibu/malibu_circuit_load_profiles.csv',
        'dataset': 'SCE Circuit Load Profile (open data), Cuthbert circuit, October 2024',
        'selection': (f'The RAR8848 pilot only: the {homes} homes behind SCE switch RAR8848 on Cuthbert ({substation} '
                      f'substation, {kv:g} kV). Cuthbert has {circuit_customers:,} customers, so its load is scaled by '
                      f'{homes} / {circuit_customers:,} = {scale:.4f}.'),
        'labels': {
            'loads': f'REAL shape (SCE open data, Cuthbert hourly October {year} min and max), scaled to the branch',
            'units': 'INFERENCE: values treated as amps per phase; MW = sqrt(3) x kV x A / 1000 (27.7 kW per unit at 16 kV)',
            'scaling': f'ASSUMED: branch load = Cuthbert x {homes} / {circuit_customers:,} (every customer draws alike), as in the pilot',
            'ordinary': 'ASSUMED: an ordinary evening sits at the midpoint of each hour\'s October min and max',
            'importLimitMW': f'ASSUMED: the branch\'s October peak, {peak:.2f} MW, the cap the pilot uses',
            'exportCapMW': f'ASSUMED: reverse flow up to {int(EXPORT_CAP_FRAC * 100)}% of the import limit, as in the pilot',
        },
        'circuits': [{
            'id': 'rar8848',
            'name': 'Cuthbert, behind RAR8848',
            'circuit': 'Cuthbert',
            'switch': 'RAR8848',
            'substation': substation,
            'voltage': f'{kv:g}KV',
            'kv': kv,
            'year': year,
            'month': MONTH,
            'homes': homes,
            'circuitCustomers': circuit_customers,
            'scale': round(scale, 5),
            'hourly': hourly,
            'peakMW': peak,
            'importLimitMW': peak,
            'exportCapMW': round(-EXPORT_CAP_FRAC * peak, 4),
        }],
        'wholesale': {
            'date': PRICE_DATE,
            'valuePerBatteryDay': price,
            'label': 'REAL: CAISO OASIS day-ahead LMP, DLAP_SCE-APND; per-day best schedule for one Base Core at each floor',
            'source': 'powerup/data/prices/caiso_dlap_sce_dam_2025q4_daily_value.csv',
        },
    }
    with open(OUT_JSON, 'w') as f:
        json.dump(out, f, indent=1)
    with open(OUT_MJS, 'w') as f:
        f.write('// Generated by data/prep_circuits.py from SCE open data and the RAR8848 pilot. Do not edit by hand.\n')
        f.write('export default ' + json.dumps(out, indent=1) + ';\n')
    c = out['circuits'][0]
    print(f"{c['id']} {c['name']} ({c['substation']}) {c['voltage']} {c['year']}: {homes} of {circuit_customers} customers, "
          f"ordinary {min(x['mw'] for x in hourly):.3f}-{max(x['mw'] for x in hourly):.3f} MW, import limit "
          f"{c['importLimitMW']} MW, export cap {c['exportCapMW']} MW; CAISO value {PRICE_DATE}: {price}")


if __name__ == '__main__':
    main()
