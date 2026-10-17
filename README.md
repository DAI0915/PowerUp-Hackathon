# PowerUp

**The disaster layer for a home-battery fleet.** PowerUp keeps the power on for the people who need it most when the grid is the disaster, and keeps the fleet's own software from becoming the disaster.

Built for the InnovateLA Dual-Use Hackathon (USC, Oct 16 to 18, 2026), Energy & Grid Hardening lens with Base Power. The seat is the dispatcher of a fleet of Base Core home batteries (39.2 kWh, 20 kW).

PowerUp has three parts that share one ladder, the one the hackathon prompt asks for: *watch, ask, slow, hold, hand to a person*.

| Part | The disaster | What it does | Ladder |
|---|---|---|---|
| **Grace** (`grace/`) | One that comes with warning: a wildfire power shutoff (PSPS) | Fills batteries by risk, Medical Baseline homes first; budgets each home's hours through the outage; staggers the recharge so restoring a circuit does not overload it; the utility's shutoff officer approves | Over days: Watch, Ask, Fill, Hold, Hand |
| **Interlock** (`interlock/`) | One that comes without warning: an order that is forged, stale, unsafe or simply wrong, and batteries that go quiet | Every order passes eight checks and gets the gentlest rung that keeps each home's backup and the local circuit safe. It can only shrink, slow or stop an order, never create one | In seconds: watch, ask, slow, hold, hand |
| **Islands** (`islands/`) | A shutoff that cuts a whole circuit when only part of it is risky | Finds the homes that are dark only because their feed runs through a risky stretch, and plans an opt-in neighborhood island behind SCE's existing switches, with donors, receivers and settlement | Ask (opt in), hand (SCE opens the switch) |

## The joint: Grace plans, Interlock guards

Grace never talks to a battery directly. `bridge/powerup.js` turns each Grace decision into a signed, OpenADR-style order that goes through Interlock like any other sender's. The reserve Grace plans for each home becomes the floor Interlock enforces against **every** sender, including Base's own daily optimizer, a market bid, a forged order and the utility's own emergency event:

- Medical Baseline homes: 100% from the first wind signal (Oct 9).
- Registered critical-need homes: 100% once SCE names their circuit.
- Everyone who agreed to pre-fill: 100% once the shutoff is definite. Everyone else: a raised 50% floor, and once the shutoff is definite nothing is sold out of their battery.
- After the circuit is back: the ordinary 20% floor.

Wiring the two together also hardened Interlock. Grace's multi-day replay showed that a validly signed order admitted days earlier could be re-sent and skip the freshness check, so Interlock now treats it as a replay once the order's own window has closed (`interlock/src/engine.mjs`, tested in `bridge/tests/`).

## Proof 1: the real October 2026 Malibu shutoff, Grace through Interlock

Six SCE circuits (Galahad, Maguire, Cuthbert, Merlin, Serra, Tuna; 6,874 customers), with 1,032 demo battery homes, 50 of them Medical Baseline. Grace's ten orders run through Interlock along with Base's ordinary-day optimizer, and six failures are injected around the real timeline (`node bridge/cli.mjs`):

| Time (2026) | Order | Interlock |
|---|---|---|
| Oct 13, 5 PM | SCE emergency event: export 5 kW per home for 2 h (legitimate, top priority) | Runs, but stops at each home's planned reserve: Medical Baseline homes give nothing, 86% of the energy is still delivered |
| Oct 14, 5 PM | Replay of a captured Oct 8 discharge order | Held: stale and already seen |
| Oct 15, 1 PM | Market bid: sell every battery to 10% by 4 PM, three hours before the power goes off | Grace's fill orders outrank it, and every battery in the shutoff zone keeps its reserve; nothing is sold |
| Oct 15, 8 PM | Stolen key posing as SCE: discharge every battery at 20 kW | Held, handed to a person |
| Oct 16, noon | Market export onto the de-energized Tuna line | Held: dead line |
| Oct 18, 6 AM | Optimizer rebound: recharge everything at 20 kW as the first circuit comes back | Held on the five dead circuits; slowed to 24% on Galahad so its load stays under the cap during cold-load pickup |

Then Grace replays the shutoff with what each order actually did to the batteries:

| Same shutoff, same orders | Guard off | Guard on |
|---|---|---|
| Grace's own orders held or clamped | n/a | 0 of 10 |
| Battery homes that go dark during the shutoff | 1,028 of 1,032 | 0 |
| Medical Baseline homes that go dark | 50 of 50 (2,374 home-hours) | 0 |
| Fleet charge when the power goes off | 9% | 99% |
| Battery-hours pushing power onto a de-energized line | 1,208 | 0 |
| Worst circuit overload at restoration | 5.46 MW over Galahad's cap | none |

With the guard on, the outcome is exactly Grace's plan without any failures. The guard-off numbers count every order as run exactly as sent; in reality IEEE 1547 anti-islanding should trip a battery on a dead line, so Interlock is a second layer, not a replacement.

## Proof 2: Tuesday, September 6, 2022, CAISO's record-peak evening

Four real SCE 12 kV circuits, 2,000 simulated Base Core homes, the real EEA 3 emergency (5:17 to 8 PM) and ten injected failures (`node interlock/cli.mjs`, details in `interlock/README.md`):

| Same evening, same failures | Guard off | Guard on |
|---|---|---|
| Homes drained below their promised backup | 2,000 | 0 |
| Battery-minutes exporting onto a de-energized line | 18,490 | 0 |
| MW-minutes over a circuit's import limit | 2,349 | 0 |
| Revenue (time-of-use savings plus event pay) | $17,758 | $51,965 |
| Energy delivered to the grid emergency | 13.3 MWh | 28.2 MWh |
| Legitimate commands held | 0 | 0 |

## Proof 3: a neighborhood island behind Merlin's recloser

SCE already cuts partial circuits: 13 of the 55 Malibu shutoffs since 2019 were opened at a line switch, not the substation breaker, and Merlin's recloser RAR0775 cut the same 223 customers four times (`islands/malibu_device_shutoffs.csv`). `islands/island.js` finds the homes that went dark only because their feed runs through a risky stretch, checks the three hard rules (never re-energize risky overhead line, a switch to every dead neighbor, one grid-forming source), and plans who donates, who receives, who keeps their own battery and who opts out (`node islands/scenario.cjs`, design in `islands/README.md`).

## Every day: how the same battery earns its keep

- Grace prices readiness with real CAISO day-ahead prices for the SCE load zone (Q4 2025, `grace/data/prices/`): a free battery earns its daily arbitrage value, and readiness forfeits only what holding costs, only where the risk is.
- On an ordinary Tuesday, Base's own team is Interlock's customer: replay a new dispatch policy through the guard, then roll it out to 1%, 10% and 100% of the fleet. The tolerance map shows what each level of strictness costs.
- Grid emergencies like Sept 6, 2022 pay, and the guard earns about three times the unguarded fleet on that chaotic evening.

## Run it

Node 22 and Python 3, no packages to install.

```
npm test                         # Grace engine (22), Interlock (28), islands (11) and bridge (9) tests
node bridge/cli.mjs              # Malibu: Grace through Interlock, guard on vs off -> bridge/out/malibu-guard.json
node interlock/cli.mjs           # Sept 6, 2022 replay -> interlock/out/results.json
node islands/scenario.cjs        # Merlin-shaped neighborhood island
python3 -I grace/app/build.py    # rebuilds the single-file Malibu app, grace/app/index.html
```

## Layout

```
grace/      the Malibu shutoff planner: engine, single-file app, SCE and CAISO data, spec, prior art, twists
interlock/  the guard: engine, silence and behaviour checks, policy packs, Sept 6 2022 replay, demo page
islands/    the neighborhood island planner and the SCE line-device shutoff records for Malibu
bridge/     Grace's orders through Interlock on the Malibu replay, and its tests
```

## Real, assumed, simulated

Every number in the apps carries one of these labels.

- **Real:** SCE open data (circuit lines, customer counts, 55 past Malibu shutoffs, hourly circuit loads), the October 2026 Malibu shutoff timeline (NWS, City of Malibu, CAL FIRE), CAISO day-ahead prices for the SCE zone, CAISO's Sept 6, 2022 record and EEA 3 times, Base Core specs and Base's 20% floor.
- **Assumed:** battery adoption (15%) and Medical Baseline share (5%) per circuit, outage budgets, circuit limits (SCE publishes loads, not ratings), time-of-use rates, event pay, the 50% raised floor, the reverse-flow cap.
- **Simulated:** the fleet, the failures, the physics. Signatures are a deterministic stand-in, not cryptography.

## Credit what exists

Tesla Storm Watch pre-charges on weather warnings; Base keeps a 20% backup floor and arbitrages daily; SCE gives Medical Baseline customers portable batteries; IEEE 1547 governs anti-islanding and reconnection; IEEE 2030.5 defines the default control a battery runs when it loses contact; OpenADR 3 shapes the orders; SDG&E's Borrego Springs runs a community microgrid. PowerUp adds the utility's own shutoff list as the trigger, medical priority, per-home outage budgets, a staggered fleet recharge, a guard that every sender's order must pass, and opt-in neighborhood islands behind existing switches. See `grace/docs/PRIOR_ART.md`.

## Responsible use

PowerUp could be used to throttle or lock owners out of their own batteries, or become a single point of attack. It sees a priority tier per home, never a medical record; Interlock can only shrink or stop an order, never below a home's own backup; each battery falls back to a local safe plan if PowerUp fails; and a person approves every restoration recharge, EV trip and island.

## License

MIT, see `LICENSE`.
