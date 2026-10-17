#!/usr/bin/env python3
"""Add the real CAISO day-ahead arbitrage values (per Base Core per day) to data.json.
Usage: python3 -I add_prices.py <daily_value.csv> [data.json]
The CSV comes from data/grace/prices/prep_cost.py (columns date,value_floor20,value_floor50,value_floor80,value_floor100)."""
import json, csv, sys
src = sys.argv[1]; dst = sys.argv[2] if len(sys.argv) > 2 else 'data.json'
d = json.load(open(dst))
daily = {}
for r in csv.DictReader(open(src)):
    if r['date'] <= '2025-10-31':
        daily[r['date'][5:]] = [round(float(r[k]), 4) for k in ('value_floor20', 'value_floor50', 'value_floor80', 'value_floor100')]
d['prices'] = {
  'source': 'CAISO OASIS PRC_LMP, day-ahead market, node DLAP_SCE-APND (SCE default load aggregation point), Oct 2025; 2,209 hourly rows for Q4 2025, mean $38.10/MWh, min -$15.93, max $66.18. Pulled Oct 17 2026 from OASIS.',
  'method': 'Per day, a dynamic program finds the best charge and discharge schedule for one Base Core (39.2 kWh, 20 kW, 95% efficiency each way) with the state of charge never below the floor; perfect day-ahead foresight, no degradation cost. Value = $ per battery per day at floors 20, 50, 80 and 100%. 2025 prices are applied to the same calendar dates in 2026.',
  'caveats': ['Wholesale value of the flexibility: a California home battery does not trade the wholesale price directly today.', 'No Malibu node publishes a price (LATIGO_NODET has no LMP); the SCE load zone price is used.', 'Same calendar dates in 2025, not 2026 prices.'],
  'floors': [20, 50, 80, 100],
  'daily': daily
}
if not any('CAISO' in s['name'] for s in d['sources']):
    d['sources'].append({'name': 'CAISO OASIS day-ahead LMP, DLAP_SCE-APND, Q4 2025', 'url': 'http://oasis.caiso.com/', 'used': 'real wholesale prices for the ordinary-day savings and the cost of readiness'})
json.dump(d, open(dst, 'w'), separators=(',', ':'), ensure_ascii=False)
print('prices added:', len(daily), 'days')
