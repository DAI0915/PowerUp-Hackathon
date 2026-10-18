# PowerUP pilot: the 456 homes behind SCE switch RAR8848

The whole-Malibu PowerUP app is frozen on branch `archive/malibu-wide-v1`. This branch narrows it to one isolated
neighborhood, as a mentor suggested: the line behind switch RAR8848 on SCE's Cuthbert circuit (coastal flats east of
Latigo, 12.3 km of line, 9 km from the Bryson burn, last switch in its series: breaker > RCS0036 > RAR8848).

**Business model.** Our company buys Base Core batteries (39.2 kWh, 20 kW; the bottom 20% is the host's) and places them free in
homes that volunteer to share with neighbors. On ordinary days the fleet earns money; before a shutoff it holds full.
When SCE opens the switch, the homes behind it run as one island on the batteries and rooftop solar. Homes without a
battery subscribe for emergency power at $9.99 a month (assumed 90% opt in); Medical Baseline homes and battery hosts pay no
subscription. In a shutoff everyone on the island pays 2x SCE's top residential TOU price ($0.60 assumed, so $1.20) for every
kWh, billed by SCE. Sellers get that less SCE's delivery ($0.20, assumed): our batteries above the host's 20%, neighbors who
choose to sell their own battery, and every solar roof (which must sell all it makes). Owners who keep their battery for
themselves stay outside the island. A host runs on the bottom 20% of our battery first and pays us the same price for it.

## Two pages

- **`pilot/app/index.html`, the full PowerUP replay on these homes:** the ladder (watch, ask, fill, hold, hand to a person), the map, tower zones with mesh and Starlink, the Interlock guard (six simulated failures, guard on vs off), the outage budgets, EV dispatch, the restoration plan and the cold-load cap. All of it runs on one circuit section, Cuthbert behind RAR8848, with its own data pack (`pilot/app/build_pack.py`). It also has a "Pilot business" band with the money and readiness panels below. Build it with `python3 -I pilot/app/build_pack.py && python3 -I pilot/app/build.py`. The engine, page and bridge are copies of `powerup/app/src/engine.js`, `powerup/app/src/page.html` and `bridge/powerup.js`, made circuit-agnostic (`DATA.named`), so the whole-Malibu app is unchanged.
- **`pilot/index.html`:** the money and readiness panels on their own.

## What the money panels answer

1. **Ordinary-day profit per battery:** real CAISO day-ahead trading value for SCE (Q4 2025, $0.91 a day, about $334 a
   year), plus capacity payments (assumed), Emergency Load Reduction Program events ($2/kWh real, count assumed) and
   the $9.99 monthly subscriptions, shared across the fleet.
2. **Readiness cost per rule:** the trading given up while holding (never hold, first forecast, SCE notice, 24 h before,
   medical first, hold at 80%), times SCE's real false-alarm ratio (3.3 customers notified per one cut).
3. **Homes kept on:** each rule replayed on Cuthbert's 16 real shutoffs that cut these homes (2019 to Jan 2025, 435 h).

Default results (160 free batteries deployed at once, Medical Baseline homes first, then solar roofs; hold from SCE notice):
- Free batteries go to Medical Baseline homes first, then to solar roofs.
- 226 homes subscribe (90% of the homes without a battery): about $27,100 a year, $169 per battery.
- At clear-sky solar 160 carries all 16 real shutoffs held from notice (150 is the minimum; hosts running on their own 20%
  first leaves more for the island). With half the other homes joining instead of 90%, 39 would be enough.
- With smoke (solar at half), 160 carries 15 of 16 held from notice, and 0 of 16 if never held. All 16 takes 228.
- Shutoff power, per year at $1.20/kWh: about 20,300 kWh. Subscribers pay $17,800, hosts $5,800, selling neighbors $770.
  Our batteries earn $14,400 ($90 each), selling neighbors $2,800, host solar roofs $3,800, SCE $3,400 in delivery.
- Fleet: $2.24M after the tax credit (assumed $20k installed), about $341k a year with every income line.
- Readiness costs about $28 per battery per year, 8% of trading income. Holding from the first forecast costs $61, and 24 h before costs $9.
- Payback: about 6.6 years with every income line, 25 years on trading, subscriptions and shutoff sales, 46 years on trading alone. The capacity and event income is assumed, and it decides the business.

## Files

- `build_data.py` -> `data.json`: line, homes, real shutoffs, real prices (sources in its docstring).
- `src/pilot.js`: the engine (uses `islands/island.js` for the island energy plan).
- `src/page.html` + `build.py` -> `index.html`: one self-contained page.
- `tests/pilot.test.cjs`: `node pilot/tests/pilot.test.cjs`.

Rebuild: `python3 -I pilot/build_data.py && python3 -I pilot/build.py`.
