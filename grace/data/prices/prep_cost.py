"""Revenue a Base Core gives up while held at a readiness floor, priced on real CAISO Q4 2025 day-ahead LMPs.

Usage: python3 -I prep_cost.py <prices.csv>   (columns: interval_start_pt, lmp_total in $/MWh)
Per day, a dynamic program finds the best charge/discharge schedule (39.2 kWh, 20 kW, 95% each way,
start and end at the floor, SOC never below the floor). Lost revenue = value at 20% floor minus value at the hold floor.
Assumptions: battery trades the wholesale price directly, no degradation cost, perfect day-ahead foresight.
"""
import csv, sys, statistics
from collections import defaultdict

CAP, PKW, ETA, STEP = 39.2, 20.0, 0.95, 0.392   # kWh, kW, one-way efficiency, SOC grid step

def day_value(prices_kwh, floor_pct):
    lo = round(CAP * floor_pct / 100 / STEP); hi = round(CAP / STEP); n = hi - lo + 1
    if n <= 1: return 0.0
    maxd = int(PKW / STEP)
    NEG = -1e18
    v = [NEG] * n; v[0] = 0.0
    for p in prices_kwh:
        nv = [NEG] * n
        for i in range(n):
            if v[i] == NEG: continue
            for j in range(max(0, i - maxd), min(n, i + maxd + 1)):
                d = (j - i) * STEP
                cash = -d / ETA * p if d > 0 else -d * ETA * p
                if v[i] + cash > nv[j]: nv[j] = v[i] + cash
        v = nv
    return max(0.0, v[0])

rows = defaultdict(list)
with open(sys.argv[1]) as f:
    for r in csv.DictReader(f):
        rows[r['interval_start_pt'][:10]].append((r['interval_start_pt'], float(r['lmp_total']) / 1000))
days = sorted(d for d in rows if len(rows[d]) >= 23)
floors = [20, 50, 80, 100]
val = {fl: {d: day_value([p for _, p in sorted(rows[d])], fl) for d in days} for fl in floors}
allp = [p * 1000 for d in days for _, p in rows[d]]
print(f"days {len(days)}  hours {len(allp)}  LMP $/MWh mean {statistics.mean(allp):.1f} min {min(allp):.1f} max {max(allp):.1f}")
for fl in floors:
    xs = list(val[fl].values())
    print(f"floor {fl:3d}%: arbitrage $/day mean {statistics.mean(xs):.2f}  median {statistics.median(xs):.2f}  max {max(xs):.2f}  Q4 total {sum(xs):.2f}")
with open(sys.argv[1].replace('.csv', '_daily_value.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['date'] + [f'value_floor{fl}' for fl in floors])
    for d in days: w.writerow([d] + [round(val[fl][d], 4) for fl in floors])

# Readiness ladder on the same calendar days in 2025 (Grace: Watch Oct 9, Ask Oct 12, Fill Oct 14, shutoff Oct 15 4 PM).
# Each tier holds at 100% from its rung until the shutoff day (shutoff day counted as held: no arbitrage).
loss = {d: val[20][d] - val[100][d] for d in days}
tiers = [('Medical Baseline (from Watch, Oct 9)', '2025-10-09'), ('Critical need (from Ask, Oct 12)', '2025-10-12'), ('Everyone else (from Fill, Oct 14)', '2025-10-14')]
print("\nLost arbitrage per battery, holding 100% until the Oct 15 shutoff (2025 prices on 2026 dates):")
for name, start in tiers:
    held = [d for d in days if start <= d <= '2025-10-15']
    print(f"  {name}: {len(held)} days, ${sum(loss[d] for d in held):.2f}")
win = 7
worst = max(sum(loss[d] for d in days[i:i+win]) for i in range(len(days) - win + 1))
print(f"Worst {win}-day hold window in Q4 2025: ${worst:.2f} per battery; Q4 mean per held day ${statistics.mean(loss.values()):.2f}")
