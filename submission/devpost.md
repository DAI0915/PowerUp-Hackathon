# PowerUP

## Inspiration

From October 9 to 18, 2026, SCE shut off power to six Malibu circuits (6,874 customers) to keep its lines from starting a fire. On October 15, during that shutoff, the Bryson Fire started in Encinal Canyon. People on oxygen concentrators, people who need refrigerated medicine and everyone in between sat in the dark for days.

A fleet of home batteries should be the answer. It fails in two ways. It can be unready: half empty when the power goes off, with the Medical Baseline homes treated like everyone else. Or the fleet's own software can be the disaster: an optimizer that sells the batteries down three hours before the shutoff, a stolen key, a replayed order, an export onto a line crews think is dead, or a recharge rebound that overloads the circuit the moment it comes back.

The hackathon prompt asks for automation that knows when to watch, ask, slow, hold and hand to a person. We built that ladder twice: once over days, for the disaster that comes with warning, and once in seconds, for the one that doesn't. Then we wired them so neither can undo the other.

## What it does

We are a startup that owns and runs a fleet of Base batteries (Base Core: 39.2 kWh, 20 kW). PowerUP is our disaster layer for that fleet, and it has three parts that share one ladder.

**PowerUP plans (over days).** It starts from SCE's own shutoff circuit list. Watch: Medical Baseline homes fill to 100% at the first wind signal. Ask: owners on named circuits are asked to pre-fill, and everyone else gets a raised 50% floor. Fill, then Hold: every battery runs its home on a per-home outage budget (critical 8, essential 16, normal 32 kWh a day) sized to the planned outage. Hand: SCE's shutoff officer approves a staggered recharge, one circuit at a time, so restoration doesn't overload the circuit.

**Interlock guards (in seconds).** Every order to the fleet, from any sender, passes eight checks: shape, signature, freshness, precedence, each home's backup floor, inverter limit, circuit headroom (no export onto a de-energized line) and ramp. Each check answers on the gentlest rung that keeps homes and the circuit safe: run, clamp, canary (1%, then 10%, then everyone), hold, or hand to a person. It can only shrink, slow or stop an order, never create one. The plan never talks to a battery directly: its orders go through Interlock like anyone else's, and the reserve it plans for each home becomes the floor Interlock enforces against every sender, our own daily optimizer and SCE's emergency event included.

**Silent batteries.** When a battery stops talking, Interlock tells broken, tripped and not talking apart by what went quiet with it. A whole open circuit means tripped. A whole cell tower or internet provider means not talking, and one firmware version going quiet together is held. One home alone with a fault code is broken and goes to a person. Before the towers fail, PowerUP sends each battery its full plan, so a silent battery keeps following it on its own, and homes report over mesh radio to a Starlink dish.

**Islands (for the homes that are dark only because of where their wire runs).** SCE already opens partial circuits: 13 of the 55 shutoffs on these six circuits since 2019 were opened at a switch on the line. The island planner finds the homes that go dark only because their feed runs through a risky stretch, checks three hard rules (never re-energize overhead line in a fire area, a switch to every dead neighbor, one grid-forming source), and plans an opt-in neighborhood island behind the existing switch, with SCE opening and closing it.

**Proof 1, the real October 2026 Malibu shutoff on our pilot.** The pilot is the 456 homes behind RAR8848, the last SCE switch on one Cuthbert branch, on the coastal flats 9 km from the Bryson burn. 189 of them have a battery (our 160 free batteries plus 29 of the homes' own), 16 of them Medical Baseline. PowerUP's five orders run alongside our daily optimizer, and six failures are injected on the real timeline.

| Same shutoff, same orders | Guard off | Guard on |
|---|---|---|
| PowerUP's own orders held or clamped | n/a | 0 of 5 |
| Battery homes that go dark | 189 of 189 | 0 |
| Medical Baseline homes that go dark | 16 of 16 | 0 |
| Fleet charge when the power goes off | 9% | 99% |
| Battery-hours pushing power onto a de-energized line | 567 | 0 |
| Worst circuit overload at restoration | 3.4 MW over Cuthbert's cap | none |
| Home-hours kept powered by batteries | 945 | 11,596 |

The same run on all six Malibu circuits (1,032 battery homes) gave the same answer: 1,028 dark with the guard off, none with it on. It also held at Malibu's real battery share today, 7.1 per 100 homes (SCE interconnection records): 483 of 484 dark with the guard off, none with it on.

**Proof 2, the evening before the shutoff (Oct 14, 2026), Interlock alone.** The same 456 homes behind RAR8848 and our 189 battery homes, replayed as an ordinary trading evening: Cuthbert's real October load shape scaled to the branch (assumed), SCE time-of-use prices (assumed), one simulated SCE event and eleven failures, including a stolen key, a replay, a price glitch, a bad forecast and a market export while SCE has RAR8848 open. With the guard on: zero homes drained below their backup (189 of 189 with it off, every one under 8 hours of backup the night before the shutoff), zero export onto the opened line (2,385 battery-minutes), no overload of the branch's 0.97 MW cap (306 MW-minutes), and $3,331 of revenue against $2,795.

**Proof 3, the pilot business behind RAR8848.** SCE opened RAR8848 on its own once (Dec 2020, 18 hours), and the homes behind it went dark 15 more times when SCE opened the whole Cuthbert circuit at the breaker: 16 shutoffs since 2019, 435 hours. The upstream reason is real too: one of the two 66 kV lines feeding Latigo substation runs about 650 m inside the Bryson Fire perimeter. Few homes behind the switch have their own battery at Malibu's real rates, so we deploy 160 free Base Core batteries at once with volunteer homes, Medical Baseline homes first and then solar roofs, since those refill every day. Homes with no battery can opt in to emergency power for $9.99 a month; Medical Baseline homes and the homes hosting our batteries don't pay. At an assumed 90% opt-in, 226 homes subscribe, about $27,100 a year ($169 per battery). In a shutoff, everyone on the island pays $1.20 per kWh, twice SCE's top residential time-of-use rate (assumed $0.60). SCE bills it and keeps an assumed $0.20 for delivery, and the sellers get $1.00: our batteries, neighbors who choose to sell from their own battery, and every solar roof, which sells all it makes. Battery owners who keep their battery to themselves stay outside the island. A host uses the bottom 20% of our battery first and pays the same price for it; everything above 20% is ours to sell. That is about 20,300 kWh of shutoff power a year: $14,400 to our batteries ($90 each), $2,800 to neighbors selling, $3,800 to host solar and $3,400 to SCE for delivery. The batteries carry every subscriber at the critical budget through all 16 real shutoffs at clear-sky solar (150 is the minimum), and 15 of 16 with smoke halving the solar (all 16 would take 228). On ordinary days each battery trades for about $334 a year at real CAISO prices for the SCE zone, about $53,400 for the fleet, and holding it full from SCE's shutoff notice costs about $28 a year, 8% of that. The fleet costs about $2.24M after the 30% tax credit (installed cost assumed) and nets about $341,000 a year: it pays back in about 6.6 years with the assumed capacity and emergency-event income, 25 years on trading, subscriptions and shutoff sales, and 46 on trading alone.

**Every day.** The same battery earns its keep on ordinary days, so readiness costs only the arbitrage it gives up, and only where the risk is. Interlock doubles as our test bench: replay a new dispatch policy through the guard, then roll it out to 1%, 10% and 100% of the fleet.

## How we built it

- **Planner** (`pilot/app/`): a deterministic hourly engine in plain JavaScript (282 hours from Oct 7), running SCE open data: circuit lines, customer counts, 55 past Malibu shutoffs and hourly circuit loads. Real CAISO day-ahead prices for the SCE zone price readiness.
- **Interlock** (`interlock/`): ES modules with no dependencies, orders shaped like OpenADR 3 events, a 5-minute replay simulator and three policy packs (SCE homes, a military installation, Australia).
- **Bridge** (`pilot/app/src/bridge.js`): turns each planner decision into a signed order, runs every sender's orders through Interlock, and re-runs the plan with what each order actually did to the batteries.
- **Islands** (`islands/`, `pilot/`): pure functions that classify line segments, find islands under the three hard rules, plan donors and receivers, size the free batteries and settle the money. SCE's line switches sit on the map at estimated positions; transformers are hypothetical, one per 8 homes.
- **App:** one page that runs all of it live in the browser on the RAR8848 pilot: the map with the Bryson perimeter and the 66 kV feed, the guard panel with guard on and off, and the pilot business with SCE's switches. We first built it for all six Malibu circuits, then narrowed it to one neighborhood on a mentor's advice. A second page replays the evening before the shutoff on the same branch, through Interlock alone. Both are static files served from the repo with GitHub Pages.
- **Data:** SCE PSPS records, circuit lines and load profiles, SCE interconnection records for real solar and battery counts by ZIP, the NIFC fire perimeter, the California Energy Commission's transmission map, and CAISO day-ahead prices.
- **Tests:** 60 node checks (`npm test`), including the guard-on and guard-off results on the pilot.

Every number in the apps is labelled real, assumed or simulated. Two things we take as given, not as open problems: SCE's grid can already open a line switch and run the section behind it as an island, and the batteries are grid-forming (they can set the island's voltage and frequency), not only grid-following.

## Challenges we ran into

- **Two engines, one truth.** The planner thinks in hours and Interlock in 5-minute steps. The bridge advances canaries in substeps and counts the plan's own recharge once, not twice, so every one of its orders passes.
- **The sell-down.** Our first guarded run still let 90 homes go dark: a market bid drained owners who had declined pre-fill. The fix is a rule we now think is right: once a shutoff is definite, nothing is sold out of any battery in the zone.
- **A hole in our own guard.** Wiring the planner in showed that a validly signed order admitted days earlier could be re-sent and pass the freshness check. Interlock now treats it as a replay once its window has closed.
- **Data SCE doesn't publish.** Circuit ratings, switch positions, transformer locations and Medical Baseline counts aren't public. We estimated or assumed them and labelled them that way. Our demo also assumed twice Malibu's real battery share until the interconnection records showed it, so we re-ran everything at the real number.

## Accomplishments that we're proud of

- On the real Malibu timeline with six failures injected, the guard keeps every battery home lit, every Medical Baseline home included, with zero export onto a dead line and no overload at restoration, and it never stops one of PowerUP's own orders.
- The result holds on all six Malibu circuits and at Malibu's real battery share today, not just on the pilot.
- On the pilot's evening before the shutoff, with eleven failures, the guard keeps all 189 battery homes above their backup and still earns 1.19 times what the unguarded fleet earns.
- A pilot island grounded in SCE's own records: a real switch, a real count of the times its homes went dark, and a real reason upstream.

## What we learned

The disaster that comes with warning and the one that doesn't need the same ladder at different speeds. A safe plan is worthless if any other sender can spend it, so the plan has to become the guard's floor. And on a real neighborhood, the shared battery does most of the work: home batteries are too few to carry their neighbors on their own, and the cheapest fix is putting new batteries where solar already is.

## What's next for PowerUP

- The RAR8848 pilot: SCE's segment and switch map for that branch, and 160 free grid-forming Base batteries for volunteer homes, Medical Baseline and solar homes first.
- A shutoff tariff with SCE and the CPUC, so SCE can bill island power at the fixed price and pay sellers, as the pilot assumes.
- Real signatures (per-sender certificates, as OpenADR 3 and IEEE 2030.5 use) in place of the demo stand-in.
- A replay against real fleet dispatch logs, then PowerUP and Interlock in front of one dispatch policy at 1% of our fleet.

## Twist 1

**Federal funding pathway.**

- **Primary: DOE SBIR Phase I,** through the Office of Electricity (grid resilience and storage) and CESER, the Office of Cybersecurity, Energy Security, and Emergency Response (distributed-energy and virtual power plant cybersecurity, which fits Interlock).
- **Scale: DOE GRIP** (Grid Resilience and Innovation Partnerships), with SCE as the applicant and PowerUP as project partner for shutoff readiness with home batteries and the RAR8848 island.
- **After a declared disaster: FEMA's Hazard Mitigation Grant Program,** where backup power for vulnerable residents is an eligible project. California's Microgrid Incentive Program can co-fund the community battery.
- **Military second customer:** Naval Base Ventura County sits in the same shutoff region, and DoD funds installation energy resilience.

**What changed in the build:** Interlock gained an installation policy pack: only local, signed orders, a second person for any fleet-wide order, and vendor-cloud orders held. The same failures pass under it with zero breaches. The bridge also reports the outcome numbers grant programs score: homes kept powered, Medical Baseline hours protected and overload avoided at restoration.

## Twist 2

**Make it global.**

- **Australia:** bushfire shutoffs, a life-support register required by law, the world's largest home-battery fleets, and dynamic operating envelopes, which are per-connection limits the network updates every few minutes. Interlock is what enforces those envelopes on a fleet. Its Australia pack keeps every invariant on the same failures in the tests (the envelope is illustrative).
- **South Africa:** scheduled load shedding is a planned outage, announced ahead and repeated several times a day. That is PowerUP's ladder running daily, with hospitals and clinics in the Medical Baseline role.

**What changed in the build:** region policy packs swap the risk signal, the priority register, the limits and the update rate without changing the engine, and the tests run the same failures under every pack. The demo page shows only the SCE pack, since the pilot is in SCE territory.

## Twist 3

**The poster.** One 24 × 36 inch page, built from the live app: the RAR8848 pilot map with the guard off and on, the five-step ladder on the real October 2026 dates, Interlock's eight checks and its silent-battery classes, the six guard-on and guard-off results, the pilot business with every income line labelled real or assumed, and a QR code to the live demo.

**What changed in the build:** the poster is generated, not drawn: `submission/poster/maps.cjs` screenshots the app's own map with the guard off and on, and `render.mjs` renders `poster.html` to `poster.pdf`; its numbers are the ones `node pilot/app/cli.mjs` prints.
