# PowerUP: how we take in the three twists

Drafted Sat Oct 17, 11:30 AM PT. Rule from the organizers: a twist is an addition to what we are already building, not a new direction. Best Shift Adapter is scored on "what changed, why, and proof it works", and it favours teams that change the build, not only the slides.

For each twist, this note gives what changes in the build, what changes in the deck and Devpost text, and the proof.

---

## Twist 1: Federal funding pathway

**Pick (recommended):**
- **Primary: DOE SBIR/STTR through the Office of Electricity.** A startup applies directly. Phase I is a feasibility grant (roughly $200k, check this year's cap), and Phase II funds a pilot. OE runs SBIR topics on grid resilience and storage ([DOE OE on SBIR](https://www.energy.gov/oe/articles/leveraging-small-business-innovation-ongoing-advancement-grid-resilience-and-reliability)).
- **Scale path: DOE GRIP (Grid Resilience and Innovation Partnerships).** The utility applies, with PowerUP as a project partner. SCE would be the applicant for a "PSPS readiness with home batteries" project. DOE released a $1.9B GRIP funding opportunity in March 2026 ([Holland & Knight summary](https://www.hklaw.com/en/insights/publications/2026/03/doe-releases-1-9-billion-funding-opportunity-for-grid-upgrades)).
- **After a disaster: FEMA Hazard Mitigation Grant Program.** Once a fire like Bryson gets a federal declaration, LA County can apply for mitigation money, and backup power for vulnerable residents is an eligible kind of project.
- **Military second customer:** Naval Base Ventura County (Point Mugu) is next door to Malibu and sits in the same shutoff zone. DoD funds installation energy resilience demos (ESTCP, DIU). Base housing on a shutoff circuit is a ready pilot, and it makes the dual-use point for us.
- Not federal, but worth one line: California's SGIP Equity Resiliency budget already pays for batteries for Medical Baseline customers in shutoff-prone areas, so it can be stacked with the federal money.

**Build change:** add a **"Grant metrics" panel** to the Malibu replay. Federal grants score projects on outcomes, so PowerUP should produce those numbers itself: homes kept powered, Medical Baseline hours protected, outage hours avoided, peak MW avoided at restoration, and cost per protected home. The numbers come from the simulation that already exists.

**Deck/Devpost:** one "How we fund it" block. SBIR Phase I covers the next 6 months, GRIP with SCE takes it to scale, and HMGP pays after a declared disaster.

**Proof:** the panel's numbers for the real Malibu shutoff, with assumed inputs labelled "assumed".

**To check before the slide:** this year's DOE SBIR topic list, and whether the March 2026 GRIP round is still open. I wrote the program descriptions from what I know; only the two linked facts were confirmed by search.

---

## Twist 2: Make it global

**The idea:** PowerUP's logic doesn't depend on place. It runs the same ladder everywhere (watch, ask, fill, hold, hand to a person), fills batteries by priority and budgets each home's hours. Only the inputs change, so a new region is a **config pack**, not a rewrite:

| Input | Malibu (today) | Australia | South Africa | Puerto Rico | China |
|---|---|---|---|---|---|
| Risk signal | NWS Red Flag Warning | BoM fire danger rating | Eskom load-shedding stage | NWS hurricane watch | CMA heat or typhoon warning |
| Outage notice | SCE PSPS circuit list | Utility bushfire de-energisation | Published load-shedding schedule | LUMA outage notices | State Grid rationing notice |
| Who goes first | Medical Baseline | Life Support Register (required by law) | Hospitals and clinics list | Medical device registry | Local priority users list |
| Person who decides | SCE shutoff officer | Network operator | Municipal control room | LUMA dispatcher | State Grid dispatcher |
| Daily earnings | SCE time-of-use rates | Virtual power plant market | Pre-charging before scheduled cuts | Battery demand response program | Peak/valley tariffs |

**Best story: South Africa.** Load shedding is a planned outage that is announced ahead of time, happens several times a day, and has been going on for years. For PowerUP that is the Malibu shutoff happening every day, and it is the "ordinary Tuesday" and the crisis at once. Australia is the closest match to Malibu: bushfire shutoffs, a legally required life-support register, and the largest home-battery fleets in the world.

**Build change:** move the region-specific bits of the engine (signal names, priority list name, tariff, outage schedule) into a **region config**. Then add a second pack, and a **region switch** in the app that reruns the simulation on that pack. The cheapest real one is a South Africa scenario: a Stage 4 schedule with 2 to 4 hour cuts several times a day, on the same demo homes, labelled "illustrative".

**Deck/Devpost:** one slide with the table above, plus one sentence: "PowerUP ships as one engine plus one config per grid."

**Proof:** a new engine test that runs the same engine on both packs and passes, and the region switch in the demo video.

---

## Twist 3: Poster

**Build change:** none to PowerUP. The poster is a new deliverable built from what the app already shows.

**Content (one page, portrait, readable from 2 m):**
1. Title and one line: "PowerUP: keep the power on for the people who need it most, before the fire shutoff."
2. The problem in one number: the real Malibu shutoff (customers cut, hours dark).
3. The ladder strip: Watch, Ask, Fill, Hold, Hand to a person, with Malibu dates.
4. A map snapshot from the app (six circuits, Medical Baseline homes).
5. Three result numbers from the grant metrics panel.
6. "Every day" box: rate savings on an ordinary Tuesday.
7. "Anywhere" box: the global table, shortened.
8. "Funded by" line: SBIR, then GRIP with SCE.
9. A QR code to the live app.

**Format:** an export-ready poster page sized for print (24×36 in), saved as a PDF. Devpost opens poster upload at 1 PM; the deadline is 10 PM with the rest of the submission.

---

## Order of work (suggested)

1. Poster first. It has a hard deliverable and gets printed for Sunday.
2. Grant metrics panel next. It feeds the poster numbers and the funding slide.
3. Region config and the South Africa pack last. It's the biggest change to the engine.
4. Devpost gets a "How we adapted to the twists" section with three entries: what changed, why, and proof.
