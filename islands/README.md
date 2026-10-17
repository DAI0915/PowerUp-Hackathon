# Grace neighborhood islands

Design and working planner for letting a neighborhood that already has some home batteries keep its lights on during a wildfire shutoff, by islanding it from SCE's grid and sharing those batteries. Opt in or opt out per home. Built Oct 17 2026 for Omer's Grace entry; the Grace replay thread decides whether and how to fold it into the app.

Files here:

- `island.js`: the planner, pure functions, same browser/node pattern as Grace's `engine.js` (`window.GraceIsland`).
- `scenario.cjs`: a Merlin-shaped example (`node scenario.cjs`).
- `island.test.cjs`: 11 tests (`node island.test.cjs`), all passing.
- `malibu_device_shutoffs.csv`: the 13 Malibu shutoffs SCE made at a line device instead of the substation breaker.

## 1. The real opening: SCE already cuts partial circuits

Omer's "vertical" shutoff is in SCE's own records. A shutoff can be opened at the substation breaker (whole circuit, tag `CB`) or at a switch out on the line: a recloser (`RAR`), a remote-controlled switch (`RCS`), or another sectionalizing device (`PS`, `RSR`).

- Statewide, 2019 to 2023: 469 of SCE's 901 circuit shutoff operations were opened at a line device, not the breaker (`data/grace/sce/PSPS_Circuit.csv`, tag parsed from the event id).
- Malibu, 2019 to 2025: 13 of the 55 shutoffs on our six circuits were line-device cuts (`malibu_device_shutoffs.csv`). Merlin's recloser RAR0775 was opened four times, always cutting the same 222 to 223 customers (a quarter of Merlin), and in January 2025 those customers stayed off for 213.5 hours while the rest of Merlin was restored in between. Cuthbert has three separate cut points (RAR8848, RAR8623, RCS0036).

So the switch boundaries already exist and SCE already uses them. What nobody does is the opposite case: a section that is not risky itself, often underground, that goes dark only because its feed runs through a risky overhead stretch. The planner calls those customers **collateral**. They are the island candidates.

What the data does not say: which segments are underground, and where exactly each device sits. SCE publishes the whole circuit shape for every event, even partial ones. The pilot's first ask to SCE is that segment map.

## 2. The three hard rules (why most of a circuit can't island)

1. **Never re-energize overhead line in a high fire risk area.** That is the line the shutoff exists to protect. An island may contain only underground or covered line, or only a transformer's low-voltage secondary.
2. **A switch must separate the island from every dead neighbor.** If a risky stretch hangs off the island with no switch between them, the island would energize it. SCE keeps control of opening, closing and reconnecting (the Microgrid Incentive Program handbook requires utility control and a block on reconnecting to a dead grid).
3. **One grid-forming source.** Ordinary home batteries are grid-following and certified to island only the house behind their own gateway. A shared island needs at least one grid-forming inverter sized for the island's peak, which every other battery and rooftop inverter then follows. In the pilot that is one community battery at the island's head switch.

Two technical issues stay with SCE's engineers, not the software: protection (inverters supply little fault current, so fuses and relays set for grid faults may not trip; the island needs inverter-aware protection settings), and the reconnection sync check.

## 3. What the software does (`island.js`)

1. `classify(segments, risky)`: given the feeder as segments between devices and the segments SCE calls high risk, it opens the nearest operable switch above each risky segment and labels every segment `risk`, `collateral` or `on`.
2. `findIslands(segments, classification)`: groups connected collateral segments and checks rules 1 and 2, returning each group with the reasons it is blocked.
3. `planIsland(island, homes, hours)`: each home picks one of four choices.
   - **Donor**: has a battery and shares what's left after its own essential budget for the whole outage plus Base's 20% floor (backup stays sacred).
   - **Receiver**: no battery; gets a share of the pool. A solar home without a battery also joins here and offers its panels, which go dark in an ordinary outage but can run again inside a formed island.
   - **Self**: keeps its battery to itself, as today.
   - **Out**: disconnected at the smart meter's service switch so it draws nothing.
   Medical Baseline receivers are covered at critical first, or the island does not form. Then all receivers rise together to the richest budget the pool carries (critical 8, essential 16, normal 32 kWh per day, Grace's numbers). It also checks the grid-forming source and inverter power against the island's peak, and reports the extra storage needed to carry everyone.
4. `settle(plan)`: donors are paid per kWh shared, receivers pay per kWh plus a small subscription, and the utility pays per customer-hour kept on. The platform keeps a share, and the rest pays for the switch and community battery.
5. `transformerIsland(...)`: the smallest island, one service transformer's 240 V secondary behind a new low-voltage switch. Nothing at distribution voltage is energized, so it can run even inside a risky segment when the secondary is underground.
6. `switchValue(segments, risky)`: for each spot without a switch, how many customers a new one would keep on. This is how the pilot picks where to install.

## 4. Merlin-shaped example (`node scenario.cjs`)

Real inputs: Merlin's ~777 customers and RAR0775's 223. Assumed inputs: the rest of the segment split, which parts are underground (the coast side behind RAR0775 plus a 90-home extension), the homes (15% battery, 25% of the rest solar-only, 5% Medical Baseline), and the opt-ins (60% of battery owners donate, half the rest join).

The shutoff covers the canyon trunk and a fused ridge tap (320 customers at risk). SCE opens the breaker, so 457 more customers go dark with them.

- The overhead MESA branch (144) is blocked by rule 1.
- The underground coast (313) can island. With home batteries only, it fails rule 3, since no home battery is grid-forming.
- With a 400 kWh / 200 kW community battery (assumed size), it forms. For a 48-hour shutoff: 32 donors, 41 solar-only homes, 147 receivers, 114 opted out. The pool carries every receiver at critical for 44 of 48 hours, and another 186 kWh of storage would close the gap. Peak 135 kW against 557 kW of inverters.
- Money for that event, all at assumed rates: donors earn $1,803, receivers pay $2,404, and the utility pays $12,936 at $2 per customer-hour (6,468 customer-hours). That leaves $2,031 for the platform and $11,507 toward the switch and battery.
- For the real 213.5-hour January outage, battery donors keep their batteries for themselves (their own essential need exceeds what they hold). Rooftop solar carries the island for 122 hours, which shows that long shutoffs run on solar, not on stored energy.
- Switch value: if only the ridge tap were risky, a new switch at its head would keep 637 customers on (today the whole circuit drops because the tap has only a fuse).

## 5. Pilot: neighborhood isolation switches in three steps

1. **Software only, on SCE's existing switches.** Grace ingests SCE's per-event device list (the `RAR`/`RCS`/`PS` cut points) and a segment map, runs `classify` and `switchValue`, and gives SCE and the city a ranked list: "these N customers were dark only because of an upstream overhead stretch; here are the switches that bound them." No hardware, and useful to SCE's PSPS planners on day one.
2. **Transformer islands.** 1 to 3 service transformers on underground secondary in a frequent-shutoff Malibu block (10 to 30 homes): a low-voltage isolation switch plus one grid-forming battery each. This is the smallest real island, and it never backfeeds distribution voltage, so it is the easiest for SCE to approve. It is a fit for the Microgrid Incentive Program's community projects.
3. **Segment island** behind an existing recloser like RAR0775, on underground line, with a community battery at the recloser and Grace coordinating donors, receivers and opt-outs. SCE opens and closes it, and Grace requests it and runs what's inside.

## 6. Revenue

- **Utility or program payment** per customer-hour kept on, or a capital grant for the switch and battery. The CPUC's Microgrid Incentive Program funds community microgrids in shutoff-prone areas through SCE, PG&E and SDG&E. The alternative SCE and PG&E pay for today is diesel: PG&E's temporary PSPS microgrids are diesel-fed.
- **Energy margin**: receivers pay more per kWh than donors receive (assumed $1.00 vs $0.75), and the platform takes a share.
- **Resilience subscription**: homes without batteries pay a few dollars a month to be eligible (assumed $5).
- **Every day (the dual use)**: the community battery and the donor fleet bid as one aggregated resource on ordinary days (CAISO arbitrage, and resource adequacy under SB 913). Grace's own readiness math already uses real CAISO SCE-zone prices, so the same table applies.
- **Siting service** to SCE: the step 1 ranked switch list.

Every rate here is a placeholder to tune with SCE and the program. None comes from a tariff.

## 7. How it plugs into Grace

- **Trigger**: Grace already starts from SCE's shutoff circuit list. This adds the segment and device level: which device SCE will open and which segments are collateral.
- **Ask rung**: the same Ask message offers three choices, share, receive or keep mine, and opt-out homes are noted for the meter switch.
- **Fill rung**: donors and the community battery fill to full, as Grace already does.
- **Hand rung**: Grace sends SCE an island request (segments, head switch, grid-former ready, Medical Baseline count). SCE opens the head switch and confirms. The community battery forms the island, and donors and solar join after the IEEE 1547 300-second enter-service delay. Opt-outs are switched off at the meter.
- **During the outage**: budgets re-plan as the outage stretches, as Grace's engine already does, and Medical Baseline stays first.
- **Restore**: SCE closes the head switch only through a sync check. Then Grace's staggered recharge plan runs as today.
- **App view (suggestion)**: color segments risk / collateral / on, outline allowed islands, and show the island's pool, mode, hours and money next to the existing per-home view.

Prior art to credit: SDG&E's Borrego Springs microgrid, PG&E's Community Microgrid Enablement Program and temporary diesel microgrids, and SCE's sectionalizing switches (which SCE chose over PSPS microgrids in 2020). What looks new is pooling home batteries plus one grid-forming community battery behind SCE's existing switches, with per-home opt-in and settlement (already listed as defensible ground in Grace's prior-art note).

## 8. Existing pilots (checked Oct 17 2026)

Nothing in SCE's Malibu territory shares one home's battery with a neighbor. The closest projects anywhere:

- **SCE, Malibu**: SCE's April 2025 response to the Governor plans more than 90 circuit miles of undergrounding in Malibu (16 already begun), "Community Resiliency Zones" with 24+ hours of backup and microgrid capability for public sites such as schools, and batteries for Critical Care customers only. Nothing for ordinary homes and no neighbor sharing ([SCE letter](https://download.edison.com/406/files/20253/GOResponse041125.pdf)). The undergrounding helps this plan: every newly underground segment still fed through overhead line is a new island candidate.
- **SCE, Menifee (KB Home Shadow Mountain)**: about 200 new all-electric homes with solar and a battery each, plus a shared community battery, designed to island together. It is DOE-funded research ($6.6M), and the microgrid was built into new construction, not retrofitted onto existing homes ([Edison](https://energized.edison.com/stories/sce-supported-residential-microgrid-a-first-in-california), [Microgrid Knowledge](https://www.microgridknowledge.com/featured/article/21437522/californias-first-nested-community-microgrid-draws-homebuyers)).
- **SCE, Isla Vista**: a $15.3M Microgrid Incentive Program award (May 2026) for one community solar and battery system serving critical sites and about 150 customers. No home batteries ([Microgrid Knowledge](https://www.microgridknowledge.com/utility-microgrids/article/55378864/utility-supported-153m-microgrid-to-power-public-safety-health-in-coastal-california-community)).
- **PG&E Microgrid Incentive Program**: 9 projects in 2025 and 6 more in Sep 2026 (named one: Pescadero, 2 MW community battery, 200+ customers). These are front-of-meter community systems ([mgrid.org](https://mgrid.org/2026/09/18/pge-picks-six-community-microgrids-for-30-million-but-names-only-one-of-them/)).
- **Sunrun "neighborhood microgrids"** (2020 white paper): islanded circuits sharing home solar and batteries. It stayed a proposal; PG&E was "evaluating" it ([Microgrid Knowledge](https://www.microgridknowledge.com/distributed-energy/article/11429061/neighborhood-microgrids-would-provide-resilience-under-sunrun-plan)).
- **AusNet Mooroolbark, Australia (2016)**: 14 of 16 homes on one street, each with solar and a 10 kWh battery, islanded together as a utility trial. The two non-participating homes were just extra load, with no billing between neighbors ([Renew](https://renew.org.au/renew-magazine/solar-batteries/5730/)).
- **Alabama Power Reynolds Landing**: a utility-owned neighborhood microgrid (shared battery and generator) for 62 new homes ([LBNL](https://connectedcommunities.lbl.gov/node/14)).

The gap is a retrofit on existing homes behind the utility's existing switches, with per-home opt-in and money flowing from homes without batteries to battery owners. That is what `island.js` does (`planIsland` and `settle`).
