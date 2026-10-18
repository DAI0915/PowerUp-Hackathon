# PowerUP: Devpost text

Paste-ready text for the Devpost form. Every number comes from `node bridge/cli.mjs`, `node interlock/cli.mjs` and `node islands/scenario.cjs`, and matches the README.

- **Live demo:** https://mrbese.github.io/PowerUp/ (the Malibu replay; the Heat-wave replay button opens the second page). Same demo on claude.ai: https://claude.ai/artifact/1f2gVaMjYXvTs8xiqCi5Lu
- **Code:** https://github.com/mrbese/PowerUp

## Name, lens and one-liner

**PowerUP**

**Lens:** Energy & Grid Hardening (Base Power)

**One-liner:** The disaster layer for a home-battery fleet: PowerUP plans each home's backup before a wildfire shutoff, Interlock guards every order to the batteries, and neighborhood islands share batteries behind the utility's own switches.

## Inspiration

From October 9 to 18, 2026, SCE cut power to six Malibu circuits (6,874 customers) for a wildfire shutoff. A fleet of home batteries is the obvious answer, and it fails in two ways. It can be unready: the batteries are half empty when the power goes off, and the homes that run oxygen concentrators are treated like everyone else. Or the fleet's own software can be the disaster: an optimizer that sells the batteries down three hours before the shutoff, a stolen key, a replayed order, an export onto a line crews think is dead, or a recharge rebound that overloads the circuit the moment it comes back.

The hackathon prompt asks for automation that knows when to watch, ask, slow, hold and hand to a person. We built that ladder twice, once over days for the disaster that comes with warning and once in seconds for the one that doesn't, and wired them so neither can undo the other.

## What it does

PowerUP has three parts that share one ladder.

**PowerUP plans (days).** The planner starts from SCE's own shutoff circuit list. Watch: Medical Baseline homes fill to 100% at the first wind signal. Ask: owners on named circuits are asked to pre-fill, and everyone else gets a raised 50% floor. Fill, then Hold: every battery islands its home on a per-home outage budget (critical 8, essential 16, normal 32 kWh a day) sized to the planned outage. Hand: SCE's shutoff officer approves a staggered recharge, one circuit at a time, so restoration doesn't overload the circuit.

**Interlock guards (seconds).** Every order to the fleet, from any sender, passes eight checks: shape, signature, freshness, precedence, each home's backup floor, inverter limit, circuit headroom (including no export onto a de-energized line) and ramp. Each check answers on the gentlest rung that keeps homes and the circuit safe: run, clamp, canary (1%, 10%, everyone), hold, or hand to a person. It can only shrink, slow or stop an order, never create one.

**The joint.** PowerUP never talks to a battery. Its decisions become signed orders that go through Interlock like anyone else's, and the reserve PowerUP plans for each home becomes the floor Interlock enforces against every sender, Base's own optimizer and SCE's emergency event included.

**Islands (for the rest of the circuit).** SCE already opens partial circuits: 13 of the 55 shutoffs on these six circuits since 2019 were opened at a line switch, and Merlin's recloser RAR0775 cut the same 223 customers four times. PowerUP finds the homes that go dark only because their feed runs through a risky stretch and plans an opt-in neighborhood island behind the existing switch: one grid-forming community battery, home batteries donating what is left after their own backup, and SCE opening and closing the switch.

### Proof 1: the October 2026 Malibu shutoff

1,032 demo battery homes on SCE's six real circuits, 50 of them Medical Baseline. PowerUP's ten orders run with Base's ordinary daily optimizer, and six failures are injected on the real timeline: SCE's own emergency event, a replayed order, a market sell-down three hours before power-off, a stolen key, an export onto the de-energized Tuna line, and a recharge rebound at restoration.

| Same shutoff, same orders | Guard off | Guard on |
|---|---|---|
| PowerUP's own orders held or clamped | n/a | 0 of 10 |
| Battery homes that go dark | 1,028 of 1,032 | 0 |
| Medical Baseline homes that go dark | 50 of 50 (2,374 home-hours) | 0 |
| Fleet charge when the power goes off | 9% | 99% |
| Battery-hours pushing power onto a de-energized line | 1,208 | 0 |
| Worst circuit overload at restoration | 5.46 MW over Galahad's cap | none |

The demo's 15 batteries per 100 homes is an assumption about a grown fleet. At Malibu's real share today, about 7.1 per 100 (482 batteries on 6,829 homes, SCE interconnection records), the same run has 484 battery homes: guard off, 483 go dark, including all 27 Medical Baseline homes; guard on, none do.

With the guard on, the outcome equals PowerUP's plan with no failures. SCE's emergency event still delivers 86% of its energy; it stops at each home's planned reserve, so Medical Baseline homes give nothing.

### Proof 2: September 6, 2022, CAISO's record-peak evening

Four real SCE circuits, 2,000 simulated Base Core homes, the real EEA 3 emergency (5:17 to 8 PM) and ten failures.

| Same evening, same failures | Guard off | Guard on |
|---|---|---|
| Homes drained below their promised backup | 2,000 | 0 |
| Battery-minutes exporting onto a de-energized line | 18,490 | 0 |
| MW-minutes over a circuit's import limit | 2,349 | 0 |
| Revenue (time-of-use savings plus event pay) | $17,758 | $51,965 |
| Energy delivered to the grid emergency | 13.3 MWh | 28.2 MWh |
| Legitimate commands held | 0 | 0 |

### Proof 3: an island behind Merlin's recloser

For a 48-hour shutoff, the underground coast section (313 customers) can island; the overhead branch beside it is blocked. With a 400 kWh community battery: 32 battery donors, 41 solar-only homes, 147 receivers and 114 opt-outs, with every receiver carried at the critical budget for 44 of 48 hours. At Malibu's real battery and solar shares the same island runs about 20 of 48 hours on 400 kWh and about 29 on 1,000 kWh, so the community battery does most of the work and a pilot sizes it first. Without a grid-forming battery the island does not form, because home batteries are certified to island only their own house. On a 213-hour shutoff like January 2025, rooftop solar carries the island.

**The pilot: RAR8623 on Point Dume.** One of the two 66 kV lines feeding Latigo substation runs about 650 m inside the Bryson Fire perimeter, and all four Latigo circuits (Cuthbert, Galahad, Maguire, Merlin) hang off that substation. RAR8623 is the last known switch on Cuthbert's main line, with 84 Point Dume homes behind it. Cuthbert's breaker has opened 16 times in shutoffs since 2019, darkening those homes each time, and SCE opened RAR8623 on its own once (Jan 2021, 84 customers, 14.5 hours). Those homes go dark because of the canyon feed, not their own street, which makes them the first island to build. Real: SCE's shutoff records and the NIFC fire perimeter. Approximate or estimated: the 66 kV route (traced from the California Energy Commission's transmission map over aerial imagery) and the switch positions.

### Every day

The same battery earns its keep on ordinary days. PowerUP prices readiness with real CAISO day-ahead prices for the SCE zone, so holding a battery full costs only the arbitrage it gives up, and only where the risk is. Interlock is a test bench for Base's own team: replay a new dispatch policy through the guard, then roll it out to 1%, 10% and 100% of the fleet.

## How we built it

- **Planner** (`grace/`): a deterministic hourly engine in plain JavaScript (282 hours from Oct 7), running SCE open data: circuit lines, customer counts, 55 past Malibu shutoffs and hourly circuit loads. CAISO day-ahead prices for the SCE zone price readiness.
- **Interlock:** ES modules with no dependencies; orders shaped like OpenADR 3 events; a 5-minute replay simulator; three policy packs (SCE homes, a military installation, Australia).
- **Bridge:** turns each PowerUP decision into a signed order, runs every sender's orders through Interlock, and re-runs PowerUP with what each order actually did to the batteries. Wiring it also hardened Interlock: a validly signed order admitted days earlier could be re-sent and pass the freshness check, and it is now treated as a replay once its window has closed.
- **Islands:** pure functions that classify segments, find islands under three hard rules (never re-energize overhead line in a fire area, a switch to every dead neighbor, one grid-forming source), plan donors and receivers, and settle the money.
- **App:** one page that runs all of it live in the browser: the Malibu map, the guard panel with guard on and off, the island planner and SCE's switches on the map. A second page replays the heat wave.
- **Tests:** 71 node tests (planner 22, Interlock 28, islands 11, bridge 10) and 160 Playwright browser checks at desktop and phone width.

Every number in the apps is labelled real, assumed or simulated.

## Challenges we ran into

- **Two engines, one truth.** The planner thinks in hours and Interlock in 5-minute steps. The bridge advances canaries in substeps and counts PowerUP's own recharge once, not twice, so the planner's orders pass 10 of 10.
- **The sell-down.** Our first guarded run still let 90 homes go dark: the market bid drained owners who had declined pre-fill. The fix is a rule we now think is right: once the shutoff is definite, nothing is sold out of any battery in the zone.
- **Data SCE doesn't publish.** Circuit ratings, switch positions, transformer locations and Medical Baseline counts aren't public. Those inputs are assumed or estimated and labelled that way, and the pilot's first ask to SCE is the segment and device map.

## Accomplishments that we're proud of

- With the guard on, zero dark homes, zero Medical Baseline homes dark, zero dead-line export and no restoration overload on the real Malibu timeline, with PowerUP never stopped.
- The guard earns about three times what the unguarded fleet earns on the chaotic heat-wave evening.
- An island planner built on a switch SCE has already opened four times for the same 223 customers.

## What we learned

The disaster that comes with warning and the one that doesn't need the same ladder at different speeds. The safest plan is useless if any other sender can spend it, so the plan has to become the guard's floor.

## What's next for PowerUP

- SCE's per-event device list and segment map, so islands run on real switches.
- Real signatures (per-sender certificates, as OpenADR 3 and IEEE 2030.5 use) in place of the demo stand-in.
- A replay against Base's own dispatch logs.
- A pilot: the planner plus Interlock in front of one dispatch policy at 1% of a fleet, then one transformer island in a frequent-shutoff Malibu block.

## Twist 1: federal funding pathway

- **Primary: DOE SBIR Phase I**, through the Office of Electricity (grid resilience and storage) and CESER (distributed-energy and virtual power plant cybersecurity, which fits Interlock).
- **Scale: DOE GRIP**, with SCE as applicant and PowerUP as project partner for shutoff readiness with home batteries.
- **After a declared disaster: FEMA's Hazard Mitigation Grant Program**, where backup power for vulnerable residents is eligible. The CPUC Microgrid Incentive Program funds community microgrids like the islands.
- **Military second customer:** Naval Base Ventura County sits in the same shutoff region.
- **What changed in the build:** Interlock's installation pack (only local signed orders, a second person for fleet-wide orders, vendor-cloud orders held) passes the same failures; grant-style outcome numbers (homes kept powered, Medical Baseline hours protected, overload avoided) come straight out of the bridge.

## Twist 2: make it global

- **Australia:** bushfire shutoffs, a legally required life-support register and dynamic operating envelopes. Interlock's Australia pack keeps every invariant on the same failures and earns $50,699 (the envelope is illustrative).
- **South Africa:** scheduled load shedding is a planned shutoff every day, which is PowerUP's ladder on repeat.
- **What changed in the build:** region policy packs that swap signals, limits and priority registers without changing the engine.

## Twist 3: poster

A 24 × 36 inch poster made from the app: the ladder, the guard-off and guard-on table for Malibu, the island behind RAR0775, and a QR code to the live demo.

## Responsible-use note

PowerUP could be used to throttle or lock owners out of their own batteries, or become a single point of attack. It sees a priority tier per home, never a medical record. Interlock can only shrink or stop an order, never below a home's own backup. Each battery falls back to a signed local plan if PowerUP fails, and every hold is logged where the owner can see it. A person approves every restoration recharge, EV trip and island, and the utility keeps control of every switch.

## Built with

JavaScript, Node.js, Python, HTML Canvas, Playwright, SCE open data (PSPS records, circuit lines, circuit load profiles), CAISO day-ahead prices, OpenADR 3 and IEEE 2030.5 concepts.

## AI and tools used

- Claude (Anthropic), through Claude Code: research, the engines, tests, the apps and these drafts.
- NotebookLM: research mind maps.
- [Add any other tools the team used.]

## Demo video script (under 3 minutes)

1. **0:00 to 0:20, the problem.** "October 2026: SCE cuts power to six Malibu circuits for nine days. A home-battery fleet can keep those homes lit, if it's full when the power goes off and if its own software doesn't drain it."
2. **0:20 to 0:50, PowerUP plans.** Click Watch, Ask, Fill on the ladder. Medical Baseline homes fill first; the map shows the fleet at 99% at Hold.
3. **0:50 to 1:30, the failures.** In the guard panel, scroll the log: the sell-down three hours before power-off is held, the stolen key is handed to a person, the export onto Tuna is held, SCE's own event stops at each home's reserve.
4. **1:30 to 1:55, guard off.** Switch to guard off. The map goes dark: 1,028 homes and every Medical Baseline home. Switch back.
5. **1:55 to 2:15, restoration.** Jump to Oct 18. The rebound is slowed so Galahad stays under its cap; the officer approves the staggered recharge.
6. **2:15 to 2:40, islands.** Scroll to Islands, tap RAR0775 to find it on the map, toggle the community battery to show the island forming.
7. **2:40 to 3:00, close.** Open the heat-wave replay for one second of the scoreboard. "PowerUP plans, Interlock guards. Base can run it on its fleet."
