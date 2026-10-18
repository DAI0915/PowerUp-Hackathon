# PowerUP

## Inspiration

From October 9 to 18, 2026, SCE shut off power to six Malibu circuits (6,874 customers) to keep its lines from starting a fire. On October 15, during that shutoff, the Bryson Fire started in Encinal Canyon. People on oxygen concentrators, people who need refrigerated medicine and everyone in between sat in the dark for days.

A fleet of home batteries should be the answer. It fails in two ways. It can be unready: half empty when the power goes off, with the Medical Baseline homes treated like everyone else. Or the fleet's own software can be the disaster: an optimizer that sells the batteries down three hours before the shutoff, a stolen key, a replayed order, an export onto a line crews think is dead, or a recharge rebound that overloads the circuit the moment it comes back.

The hackathon prompt asks for automation that knows when to watch, ask, slow, hold and hand to a person. We built that ladder twice: once over days, for the disaster that comes with warning, and once in seconds, for the one that doesn't. Then we wired them so neither can undo the other.

## What it does

PowerUP is the disaster layer for a home-battery fleet like Base Power's. It has three parts that share one ladder.

**PowerUP plans (over days).** It starts from SCE's own shutoff circuit list. Watch: Medical Baseline homes fill to 100% at the first wind signal. Ask: owners on named circuits are asked to pre-fill, and everyone else gets a raised 50% floor. Fill, then Hold: every battery runs its home on a per-home outage budget (critical 8, essential 16, normal 32 kWh a day) sized to the planned outage. Hand: SCE's shutoff officer approves a staggered recharge, one circuit at a time, so restoration doesn't overload the circuit.

**Interlock guards (in seconds).** Every order to the fleet, from any sender, passes eight checks: shape, signature, freshness, precedence, each home's backup floor, inverter limit, circuit headroom (no export onto a de-energized line) and ramp. Each check answers on the gentlest rung that keeps homes and the circuit safe: run, clamp, canary (1%, then 10%, then everyone), hold, or hand to a person. It can only shrink, slow or stop an order, never create one. The plan never talks to a battery directly: its orders go through Interlock like anyone else's, and the reserve it plans for each home becomes the floor Interlock enforces against every sender, Base's own optimizer and SCE's emergency event included.

**Islands (for the homes that are dark only because of where their wire runs).** SCE already opens partial circuits: 13 of the 55 shutoffs on these six circuits since 2019 were opened at a switch on the line. The island planner finds the homes that go dark only because their feed runs through a risky stretch, checks three hard rules (never re-energize overhead line in a fire area, a switch to every dead neighbor, one grid-forming source), and plans an opt-in neighborhood island behind the existing switch, with SCE opening and closing it.

**Proof 1, the real October 2026 Malibu shutoff on our pilot.** The pilot is the 456 homes behind RAR8848, the last SCE switch on one Cuthbert branch, on the coastal flats 9 km from the Bryson burn. 189 of them have a battery (our 160 free batteries plus 29 of the homes' own), 16 of them Medical Baseline. PowerUP's five orders run alongside Base's ordinary daily optimizer, and six failures are injected on the real timeline.

| Same shutoff, same orders | Guard off | Guard on |
|---|---|---|
| PowerUP's own orders held or clamped | n/a | 0 of 5 |
| Battery homes that go dark | 189 of 189 | 0 |
| Medical Baseline homes that go dark | 16 of 16 | 0 |
| Fleet charge when the power goes off | 9% | 99% |
| Battery-hours pushing power onto a de-energized line | 567 | 0 |
| Worst circuit overload at restoration | 3.4 MW over Cuthbert's cap | none |

The same run on all six Malibu circuits (1,032 battery homes) gave the same answer: 1,028 dark with the guard off, none with it on. It also held at Malibu's real battery share today, 7.1 per 100 homes (SCE interconnection records): 483 of 484 dark with the guard off, none with it on.

**Proof 2, CAISO's record-peak evening (Sept 6, 2022).** Four real SCE circuits, 2,000 simulated Base Core homes, the real EEA 3 emergency and ten failures. With the guard on: zero homes drained below their backup (2,000 with it off), zero export onto a dead line (18,490 battery-minutes), and $51,965 of revenue against $17,758, because a fleet that keeps its charge can deliver 28.2 MWh to the emergency instead of 13.3.

**Proof 3, the pilot business behind RAR8848.** SCE opened RAR8848 on its own once (Dec 2020, 18 hours), and the homes behind it went dark 15 more times when SCE opened the whole Cuthbert circuit at the breaker: 16 shutoffs since 2019, 435 hours. The upstream reason is real too: one of the two 66 kV lines feeding Latigo substation runs about 650 m inside the Bryson Fire perimeter. Few homes behind the switch have their own battery at Malibu's real rates, so we deploy 160 free Base Core batteries at once with volunteer homes, Medical Baseline homes first and then solar roofs, since those refill every day. That carries every neighbor at the critical budget through all 16 real shutoffs at clear-sky solar (39 is the bare minimum), and through 15 of the 16 even if smoke halves the solar. On ordinary days each battery trades for about $334 a year at real CAISO prices for the SCE zone, about $53,400 for the fleet, and holding it full from SCE's shutoff notice costs about $28 a year, 8% of that. The fleet costs about $2.24M after the 30% tax credit (installed cost assumed); it pays back in about 7.5 years only with assumed capacity and emergency-event income, and in 46 years on trading alone.

**Every day.** The same battery earns its keep on ordinary days, so readiness costs only the arbitrage it gives up, and only where the risk is. Interlock doubles as Base's test bench: replay a new dispatch policy through the guard, then roll it out to 1%, 10% and 100% of the fleet.

## How we built it

- **Planner** (`pilot/app/`): a deterministic hourly engine in plain JavaScript (282 hours from Oct 7), running SCE open data: circuit lines, customer counts, 55 past Malibu shutoffs and hourly circuit loads. Real CAISO day-ahead prices for the SCE zone price readiness.
- **Interlock** (`interlock/`): ES modules with no dependencies, orders shaped like OpenADR 3 events, a 5-minute replay simulator and three policy packs (SCE homes, a military installation, Australia).
- **Bridge** (`pilot/app/src/bridge.js`): turns each planner decision into a signed order, runs every sender's orders through Interlock, and re-runs the plan with what each order actually did to the batteries.
- **Islands** (`islands/`, `pilot/`): pure functions that classify line segments, find islands under the three hard rules, plan donors and receivers, size the free batteries and settle the money. SCE's line switches sit on the map at estimated positions; transformers are hypothetical, one per 8 homes.
- **App:** one page that runs all of it live in the browser on the RAR8848 pilot: the map with the Bryson perimeter and the 66 kV feed, the guard panel with guard on and off, and the pilot business with SCE's switches. We first built it for all six Malibu circuits, then narrowed it to one neighborhood on a mentor's advice. A second page replays the heat wave. Both are static files served from the repo with GitHub Pages.
- **Data:** SCE PSPS records, circuit lines and load profiles, SCE interconnection records for real solar and battery counts by ZIP, the NIFC fire perimeter, the California Energy Commission's transmission map, and CAISO day-ahead prices.
- **Tests:** 53 node tests, including the guard-on and guard-off results on the pilot.

Every number in the apps is labelled real, assumed or simulated.

## Challenges we ran into

- **Two engines, one truth.** The planner thinks in hours and Interlock in 5-minute steps. The bridge advances canaries in substeps and counts the plan's own recharge once, not twice, so every one of its orders passes.
- **The sell-down.** Our first guarded run still let 90 homes go dark: a market bid drained owners who had declined pre-fill. The fix is a rule we now think is right: once a shutoff is definite, nothing is sold out of any battery in the zone.
- **A hole in our own guard.** Wiring the planner in showed that a validly signed order admitted days earlier could be re-sent and pass the freshness check. Interlock now treats it as a replay once its window has closed.
- **Data SCE doesn't publish.** Circuit ratings, switch positions, transformer locations and Medical Baseline counts aren't public. We estimated or assumed them and labelled them that way. Our demo also assumed twice Malibu's real battery share until the interconnection records showed it, so we re-ran everything at the real number.

## Accomplishments that we're proud of

- On the real Malibu timeline with six failures injected, the guard keeps every battery home lit, every Medical Baseline home included, with zero export onto a dead line and no overload at restoration, and it never stops one of PowerUP's own orders.
- The result holds on all six Malibu circuits and at Malibu's real battery share today, not just on the pilot.
- The guard earns about three times what the unguarded fleet earns on the chaotic heat-wave evening.
- A pilot island grounded in SCE's own records: a real switch, a real count of the times its homes went dark, and a real reason upstream.

## What we learned

The disaster that comes with warning and the one that doesn't need the same ladder at different speeds. A safe plan is worthless if any other sender can spend it, so the plan has to become the guard's floor. And on a real neighborhood, the shared battery does most of the work: home batteries are too few to carry their neighbors on their own, and the cheapest fix is putting new batteries where solar already is.

## What's next for PowerUP

- The RAR8848 pilot: SCE's segment and switch map for that branch, one grid-forming community battery at the switch, and 160 free Base batteries for volunteer homes, Medical Baseline and solar homes first.
- Real signatures (per-sender certificates, as OpenADR 3 and IEEE 2030.5 use) in place of the demo stand-in.
- A replay against Base's own dispatch logs, then PowerUP and Interlock in front of one dispatch policy at 1% of a fleet.

## Twist 1

**Federal funding pathway.**

- **Primary: DOE SBIR Phase I,** through the Office of Electricity (grid resilience and storage) and CESER, the Office of Cybersecurity, Energy Security, and Emergency Response (distributed-energy and virtual power plant cybersecurity, which fits Interlock).
- **Scale: DOE GRIP** (Grid Resilience and Innovation Partnerships), with SCE as the applicant and PowerUP as project partner for shutoff readiness with home batteries and the RAR8848 island.
- **After a declared disaster: FEMA's Hazard Mitigation Grant Program,** where backup power for vulnerable residents is an eligible project. California's Microgrid Incentive Program can co-fund the community battery.
- **Military second customer:** Naval Base Ventura County sits in the same shutoff region, and DoD funds installation energy resilience.

**What changed in the build:** Interlock gained an installation policy pack: only local, signed orders, a second person for any fleet-wide order, and vendor-cloud orders held. The same failures pass under it with zero breaches. The bridge also reports the outcome numbers grant programs score: homes kept powered, Medical Baseline hours protected and overload avoided at restoration.

## Twist 2

**Make it global.**

- **Australia:** bushfire shutoffs, a life-support register required by law, the world's largest home-battery fleets, and dynamic operating envelopes, which are per-connection limits the network updates every few minutes. Interlock is what enforces those envelopes on a fleet. Its Australia pack keeps every invariant on the same failures and earns $50,699 (the envelope is illustrative).
- **South Africa:** scheduled load shedding is a planned outage, announced ahead and repeated several times a day. That is PowerUP's ladder running daily, with hospitals and clinics in the Medical Baseline role.

**What changed in the build:** region policy packs swap the risk signal, the priority register, the limits and the update rate without changing the engine, and a switch reruns the replay on any pack.
