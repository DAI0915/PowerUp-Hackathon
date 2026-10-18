"""Data pack for the full PowerUP replay narrowed to the RAR8848 pilot: the same pack as powerup/data/data.json, but with
one circuit section, the 456 homes behind SCE switch RAR8848 on Cuthbert, and the line behind it (pilot/data.json).
- Load: Cuthbert's real October profile scaled by 456 / Cuthbert's customers (homes assumed to draw alike).
- Shutoff history: the 16 real Cuthbert shutoffs that cut these homes (whole-circuit breaker cuts and RAR8848 alone).
- Medical Baseline: the ~12 medical homes get a free battery first, ~15% of battery homes.
- Adoption default: our 56 free Base batteries plus about 35 home-owned ones = 20% of 456 homes.
Run: python3 -I pilot/app/build_pack.py -> pilot/app/data.json
"""
import copy, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', '..')
d = json.load(open(os.path.join(ROOT, 'powerup', 'data', 'data.json')))
pilot = json.load(open(os.path.join(HERE, '..', 'data.json')))
N = len(pilot['homes'])
cut = copy.deepcopy(d['circuits']['Cuthbert'])
scale = N / cut['customers']
cut.update(customers=N, customers_source='SCE PSPS record: RAR8848 cut 456 customers, Dec 2 2020',
           shutoffs_on_record=len(pilot['events']), longest_hours=max(e['hours'] for e in pilot['events']),
           section='RAR8848', note='Only the stretch behind switch RAR8848; the rest of Cuthbert is outside the pilot.')
d['named'] = ['Cuthbert']
d['circuits'] = {'Cuthbert': cut}
d['lines'] = {'Cuthbert': pilot['lines']}
d['load'] = {'Cuthbert': {k: ([[round(v * scale, 2) for v in m] for m in arr] if k in ('min', 'max') else arr)
                          for k, arr in d['load']['Cuthbert'].items()}}
starts = {e['start'] for e in pilot['events']}
d['shutoff_history'] = [s for s in d['shutoff_history'] if s['circuit'] == 'Cuthbert' and s['start'] in starts]
assert len(d['shutoff_history']) == len(pilot['events']), len(d['shutoff_history'])
d['approx_areas'] = {}
d['assumptions']['adoption_pct']['default'] = 20
d['assumptions']['adoption_pct']['note'] = ('Share of the 456 homes with a battery: our 56 free Base batteries plus about 35 '
                                            'home-owned ones (Malibu has 7.1 per 100, SCE interconnection records).')
d['assumptions']['medical_baseline_pct']['default'] = 15
d['assumptions']['medical_baseline_pct']['max'] = 40
d['assumptions']['medical_baseline_pct']['note'] = ('Share of battery homes on SCE Medical Baseline. Real: 2.6% of homes (SCE Dec 2024 '
    'report, Maguire), about 12 of these 456. The pilot offers them a free battery first, so they are about 15% of the ~86 battery homes.')
d['meta']['note'] += ' Pilot: only the line behind RAR8848 on Cuthbert.'
d['pilot'] = {'switch': pilot['switch'], 'upstream_switch': pilot['upstream_switch'], 'burn_km': pilot['burn_km'], 'feed': pilot['feed'][:80]}
json.dump(d, open(os.path.join(HERE, 'data.json'), 'w'), separators=(',', ':'))
print('pack', N, 'homes, load scale', round(scale, 3), 'shutoffs', len(d['shutoff_history']))
