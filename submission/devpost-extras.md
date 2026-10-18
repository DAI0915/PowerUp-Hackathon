# PowerUP: the other Devpost fields

The story sections are in `devpost.md`. These are the rest of the form.

- **Live demo:** https://mrbese.github.io/PowerUp/ (the RAR8848 pilot replay; a button opens the second page, Interlock on the pilot's evening before the shutoff). Same demo on claude.ai: https://claude.ai/artifact/96RzoqMWxRzLsdrAyRJFv1
- **Code:** https://github.com/mrbese/PowerUp

## Name, lens and one-liner

**PowerUP**

**Lens:** Energy & Grid Hardening (Base Power)

**One-liner:** The disaster layer for our home-battery fleet: PowerUP plans each home's backup before a wildfire shutoff, Interlock guards every order to the batteries, and neighborhood islands share batteries behind the utility's own switches.

## Responsible-use note

Misuse: PowerUP could lock owners out of their own batteries, become a single point of attack, or price power up mid-crisis.
Limits: Interlock can only shrink or stop an order, never below a home's own backup; PowerUP sees a priority tier, never a medical record; a person approves every recharge and island, SCE keeps every switch, and the shutoff price is fixed in advance and billed by SCE.

## Built with

JavaScript, Node.js, Python, HTML Canvas, Playwright, SCE open data (PSPS records, circuit lines, circuit load profiles), CAISO day-ahead prices, OpenADR 3 and IEEE 2030.5 concepts.

## AI and tools used

- Claude (Anthropic), through Claude Code: research, the engines, tests, the apps and these drafts.
- NotebookLM: research mind maps.

## Demo video script (under 3 minutes)

1. **0:00 to 0:20, the problem.** "October 2026: SCE cuts power across Malibu for nine days, and the Bryson Fire starts in the middle of it. 456 homes behind one switch on the Cuthbert circuit have gone dark 16 times since 2019. A home-battery fleet can keep them lit, if it's full when the power goes off and if its own software doesn't drain it."
2. **0:20 to 0:50, PowerUP plans.** Click Watch, Ask, Fill on the ladder. Medical Baseline homes fill first; the map shows the fleet at 99% at Hold.
3. **0:50 to 1:30, the failures.** In the guard panel, scroll the log: the sell-down three hours before power-off is held back, the stolen key is handed to a person, the export onto the dead Cuthbert line is held, SCE's own event stops at each home's reserve.
4. **1:30 to 1:55, guard off.** Switch to "Six failures, guard off". The map goes dark: all 189 battery homes, every Medical Baseline home included. Switch back.
5. **1:55 to 2:15, restoration.** Jump to Oct 18. The rebound is slowed so Cuthbert stays under its cap; the officer approves the recharge.
6. **2:15 to 2:40, the pilot business.** Scroll to the pilot business: 160 free batteries and 226 $9.99-a-month subscribers, carried through all 16 real shutoffs, with shutoff power sold at $1.20 a kWh. Pick a readiness rule to show holding from SCE's notice costs $28 a battery a year.
7. **2:40 to 3:00, close.** Open the Interlock evening page for one second of the scoreboard. "PowerUP plans, Interlock guards. Our fleet runs on Base batteries; any fleet can run PowerUP."
