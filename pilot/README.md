# PowerUP pilot: the 456 homes behind SCE switch RAR8848

The whole-Malibu PowerUP app is frozen on branch `archive/malibu-wide-v1`. This branch narrows it to one isolated
neighborhood, as a mentor suggested: the line behind switch RAR8848 on SCE's Cuthbert circuit (coastal flats east of
Latigo, 12.3 km of line, 9 km from the Bryson burn, last switch in its series: breaker > RCS0036 > RAR8848).

**Business model.** Our company buys Base Core batteries (39.2 kWh, 20 kW, 20% floor never shared) and places them free in
homes that volunteer to share with neighbors. On ordinary days the fleet earns money; before a shutoff it holds full.
When SCE opens the switch, the homes behind it run as one island on the batteries and rooftop solar.

## What the page answers

1. **Ordinary-day profit per battery:** real CAISO day-ahead trading value for SCE (Q4 2025, $0.91 a day, about $334 a
   year), plus capacity payments (assumed) and Emergency Load Reduction Program events ($2/kWh real, count assumed).
2. **Readiness cost per rule:** the trading given up while holding (never hold, first forecast, SCE notice, 24 h before,
   medical first, hold at 80%), times SCE's real false-alarm ratio (3.3 customers notified per one cut).
3. **Homes kept on:** each rule replayed on Cuthbert's 16 real shutoffs that cut these homes (2019 to Jan 2025, 435 h).

Default results (56 free batteries, solar homes first, hold from SCE notice):
- All 16 real shutoffs carried in full at clear-sky solar; 36 batteries is the minimum.
- With smoke (solar at half), 56 carries 14 of 16. Carrying all 16 takes 174.
- Readiness costs about $28 per battery per year, 8% of trading income. Holding from the first forecast costs $61, and 24 h before costs $9.
- Payback: about 7.5 years with every income line, 46 years on trading alone. The capacity and event income is assumed, and it decides the business.

## Files

- `build_data.py` -> `data.json`: line, homes, real shutoffs, real prices (sources in its docstring).
- `src/pilot.js`: the engine (uses `islands/island.js` for the island energy plan).
- `src/page.html` + `build.py` -> `index.html`: one self-contained page.
- `tests/pilot.test.cjs`: `node pilot/tests/pilot.test.cjs`.

Rebuild: `python3 -I pilot/build_data.py && python3 -I pilot/build.py`.
