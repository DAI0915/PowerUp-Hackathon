# PowerUP pitch deck, slide by slide

Ten slides for the InnovateLA pitch (the deck rule is 10 slides max). Each bullet is one short sentence in Simplified Technical English (ASD-STE100): active voice, present tense, one idea per sentence, simple words. Technical names such as PSPS, kWh and Medical Baseline stay as they are. A 16-year-old can read every line aloud. Each slide ends with a "Show:" cue for the live demo at https://mrbese.github.io/PowerUp/.

Editable copy (Claude Doc): https://claude.ai/code/artifact/3dedb88f-58ac-4ee2-8337-695f056fced8

## Slide 1: PowerUP, the disaster layer for a home-battery fleet

- PowerUP is software for a fleet of home batteries, like Base Power's.
- PowerUP plans: it makes homes ready before a wildfire power shutoff.
- Interlock guards: it checks every order before it gets to a battery.
- Islands share: neighbors share batteries behind a switch of the utility.
- Our pilot is one real neighborhood in Malibu: 456 homes.
- Show: the pilot map in the app, at the hour the power goes off.

## Slide 2: The problem, the power goes off before the fire

- When strong dry winds come, the utility turns the power lines off. This stops the lines from starting a fire.
- This is a Public Safety Power Shutoff (PSPS).
- From Oct 9 to 18 2026, SCE turned off six circuits in Malibu. About 6,900 customers lost power.
- On Oct 15, during that shutoff, the Bryson Fire started.
- Some people have a medical device that needs power at home. SCE calls them Medical Baseline customers.
- A battery fleet can help. But it fails if the batteries are half empty, or if its own software drains them.
- Show: the Bryson Fire perimeter on the map.

## Slide 3: The pilot, 456 homes behind switch RAR8848

- RAR8848 is a real SCE switch, the last one on a branch of the Cuthbert circuit.
- 456 homes are behind it, on the coast, 9 km from the Bryson burn.
- These homes lost power 16 times since 2019, for 435 hours in total.
- SCE opened RAR8848 alone only once. The other 15 times, SCE turned off the whole circuit.
- The reason is upstream: a 66 kV line that feeds Latigo substation runs about 650 m inside the fire perimeter.
- Few homes here have their own battery. Malibu has about 7 batteries per 100 homes.
- Show: the switch, the 66 kV line and the fire perimeter on the map.

## Slide 4: PowerUP plans, five steps from gentle to firm

- Step 1, Watch (Oct 9, 3 AM): the first wind warning comes. PowerUP fills the Medical Baseline homes to 100%.
- Step 2, Ask (Oct 12, 9 AM): SCE names Cuthbert. PowerUP asks the other homes for permission to fill.
- Step 3, Fill (Oct 14, 7 AM): the shutoff is sure. Every battery that said yes fills to 100%.
- Step 4, Hold (Oct 15, 4 PM): the power goes off. Each battery runs its home on an energy budget.
- Step 5, Hand to a person (Oct 17, 10 PM): the winds stop. PowerUP gives SCE a restart plan. A person approves it.
- Budgets: critical 8 kWh a day, essential 16, normal 32.
- Show: the ladder strip at the top of the app. Click each step.

## Slide 5: Interlock guards every order

- Many senders give orders to the batteries: Base's optimizer, the market, SCE. A thief can try too.
- Interlock checks every order in eight steps before it gets to a battery.
- It checks the signature, the age, the priority, the backup of each home, the inverter, the circuit and the speed.
- It gives each order the gentlest answer that keeps the home and the circuit safe: run, slow, test on 1% first, hold, or hand to a person.
- Interlock can only make an order smaller, slower or stop it. It cannot make a new order.
- PowerUP's own orders go through Interlock too. The reserve that PowerUP plans for each home becomes the floor that Interlock keeps against every sender.
- Show: the Interlock panel in the app, with the log of orders.

## Slide 6: Six failures, guard off and guard on

- We put six simulated failures on the real timeline: a stolen key, a replayed order, a sell-down three hours before the shutoff, export onto a dead line, a recharge rush, and SCE's own emergency event.
- The pilot has 189 battery homes: our 160 free batteries and 29 of their own. 16 are Medical Baseline homes.
- With the guard off, every order runs as sent. With the guard on, Interlock checks each one.
- Interlock never stops one of PowerUP's own orders: 0 of 5 held.

| Same shutoff, same orders | Guard off | Guard on |
| --- | --- | --- |
| Battery homes that go dark | 189 of 189 | 0 |
| Medical Baseline homes that go dark | 16 of 16 | 0 |
| Fleet charge when the power goes off | 9% | 99% |
| Battery-hours onto a dead line | 567 | 0 |
| Overload at the restart | 3.4 MW over Cuthbert's limit | none |

- Show: switch the guard panel from "guard on" to "guard off" and watch the map go dark.

## Slide 7: The business, free batteries and an island behind the switch

- Our company buys 160 Base Core batteries (39.2 kWh each) and puts them in volunteer homes for free.
- Medical Baseline homes get a free battery first. Then homes with solar get one, because solar fills them again each day.
- Homes without a battery can pay $9.99 a month for emergency power. We assume 90% say yes: 226 homes. Medical Baseline homes and host homes do not pay.
- When SCE opens RAR8848, the 456 homes run as one island on the batteries and the rooftop solar.
- In a shutoff, everyone on the island pays $1.20 per kWh. That is 2 times SCE's top home rate (assumed $0.60).
- SCE sends the bill and keeps $0.20 for delivery (assumed). Each seller gets $1.00: our batteries, neighbors who sell from their battery, and every solar roof.
- Show: the "Pilot business" section of the app.

## Slide 8: The money, good on a normal day, better on a bad day

- On a normal day, each battery buys power when it is cheap and sells it when it is expensive.
- A full battery cannot trade. Holding it full from SCE's notice costs $28 a year, only 8% of its trading money.
- The 160 batteries carry every home on the island through all 16 real shutoffs, in clear weather. With smoke on the solar, they carry 15 of 16.

| Income per battery per year | Amount | Label |
| --- | --- | --- |
| Trading at CAISO prices for SCE | $334 | real prices |
| Capacity payments | $941 | assumed |
| Emergency grid events | $627 | assumed count |
| $9.99 subscriptions | $169 | assumed 90% opt-in |
| Shutoff power sales | $90 | assumed rates |

- The fleet costs about $2.24M after the 30% tax credit (assumed $20,000 a battery). It earns about $341,000 a year.
- Payback: 6.6 years with all income, 25 years without the assumed capacity and event money, 46 years on trading alone.
- Show: the money panel and the readiness rules table in the app.

## Slide 9: Who pays to grow it, and where it goes next (twists)

- Start: DOE SBIR Phase I, from the Office of Electricity and CESER (energy security and cybersecurity).
- Scale: DOE GRIP grants, with SCE as the applicant and PowerUP as a partner.
- After a disaster: FEMA Hazard Mitigation grants. California's Microgrid Incentive Program can help pay for the island.
- Military: Naval Base Ventura County is in the same shutoff region. Interlock has a pack for a base: only local, signed orders, and a second person for each fleet-wide order.
- Australia: bushfire shutoffs and a legal life-support register. Interlock keeps the per-home limits that the network sets.
- South Africa: planned load shedding many times a day. Clinics take the place of Medical Baseline homes.
- Show: the pack switch on the heat-wave page (SCE, base, Australia).

## Slide 10: Safe to use, and what is next

- Every number in the app has a label: real, assumed or simulated.
- Responsible use: PowerUP sees only a priority tier, not a medical record. Interlock never takes a home below its own backup.
- A person approves every restart, every EV trip and every island. SCE keeps control of every switch.
- Next: the RAR8848 pilot with SCE's real switch map, one grid-forming battery at the switch, and the 160 free batteries.
- Next: a shutoff tariff with SCE and the CPUC, so SCE can bill island power at the fixed price.
- Next: replay Base's own dispatch logs through Interlock, then run it on 1% of a fleet.
- The ask: one engineer at Base and one shutoff officer at SCE to test the pilot with us.
- Show: the link and a QR code to https://mrbese.github.io/PowerUp/.
