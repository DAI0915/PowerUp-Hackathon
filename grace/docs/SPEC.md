# Grace Malibu Replay: app spec

**Revised 06:20 UTC (read this first if you built from an earlier copy):** rules 1 to 3 below now describe a risk-tiered charging ladder (Omer's design): Medical Baseline homes are held at 100% from the first forecast signal, registered critical-need homes once SCE names the circuit, everyone else once the shutoff is definite. A new required view, "What exists, what Grace adds", is listed under Views (item 9) with its content in `PRIOR_ART.md` next to this spec. **Revised again 06:30 UTC:** rule 5 now models the comms channel order (home internet or SMS, then the neighbourhood mesh to a Starlink uplink, mesh on by default), rule 4 adds per-home thermostat and EV limits, and a new rule 7 adds EV dispatch proposals for medical homes running low; view 6 becomes an Approvals panel. Builds made from an earlier copy must be updated to match.

A single-page interactive "mini app" for a hackathon pitch. It replays the real October 2026 Malibu wildfire power shutoff (SCE PSPS + Bryson Fire) on a live map and shows what **Grace**, a dispatcher for a fleet of home batteries (Base Power's Base Core), would have done hour by hour. Judges should understand within a minute: the real event, the ladder of gentle responses, who decides, and the ordinary-day value.

Audience: hackathon judges and Base Power engineers (technical, skeptical, short on time), and Omer's team, who will build further on it.

## Deliverable

One HTML file: `<outDir>/index.html`, following the **page contract** below. Everything inline (CSS, JS, data). No build step. Vanilla JS preferred; a library only if it does substantial work and loads as a pinned UMD script from `https://cdnjs.cloudflare.com` (nothing else loads: no tiles, no images, no fetches, no stylesheets other than Google Fonts). The page must be at most 16 MB; aim under 1.5 MB.

Also write `<outDir>/NOTES.md`: what you built, how the simulation works, what is assumed, known gaps.

### Page contract (the Artifact publisher wraps the file; follow exactly)

- Do NOT write `<!doctype>`, `<html>`, `<head>` or `<body>` tags. Start the file with `<title>Grace Malibu Replay</title>` then `<meta name="claude:viewport-fit-sides" content="cover">`, then `<style>`, then markup, then `<script>`. The publisher adds a head with charset, viewport (`viewport-fit=cover`) and a small reset: `:root` is padded top and bottom by the phone's safe-area insets, `body` has zero margin and a 14px system font, `img{max-width:100%}`, `[hidden]{display:none!important}` (toggle visibility with `el.hidden`, not `style.display`).
- Theme: define every color as a token in this exact shape, and style components only through tokens:
  ```css
  :root { --bg: …; --fg: …; /* every token, light values */ }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { /* same tokens, dark values */ color-scheme: dark } }
  :root[data-theme="dark"] { /* same dark values again */ color-scheme: dark }
  body { background: var(--bg); color: var(--fg) }
  ```
  Canvas drawing must read colors from the tokens (`getComputedStyle(document.documentElement).getPropertyValue('--x')`) and redraw when the theme changes (`matchMedia('(prefers-color-scheme: dark)')` change event and a MutationObserver on `data-theme`).
- Side gutter: `padding-left: max(16px, env(safe-area-inset-left, 0px))` and `padding-right: max(16px, env(safe-area-inset-right, 0px))` on one outer wrapper (or each full-width band's inner wrapper); vertical padding with `padding-block`, never a `padding` shorthand that zeroes the sides. Anything fixed to an edge stays at 0 and adds that edge's `env(safe-area-inset-*)` to its own padding. A sticky header uses `top: env(safe-area-inset-top, 0px)`.
- Must work at phone width (400 px) with no horizontal page scroll; flex/grid children holding text get `min-width: 0`. Size the app to content, not `100vh` heroes. Use `font-variant-numeric: tabular-nums` for numbers in columns.
- Everything meant to be read is visible at rest (no opacity-0 waiting for observers). The first frame shows the app in a working state (map drawn, simulation at a meaningful time, panels filled).
- No `alert/confirm/prompt`, no `window.print`, no downloads, no `mailto`. Respect `prefers-reduced-motion`. Give every control a stable `id` and a visible focus state. Keyboard: arrow keys scrub the timeline when it has focus; space toggles play.
- Only a plain `#token` hash may carry state (e.g. `#hold` jumps to the Hold rung). Optional.
- Fonts: Google Fonts only (`<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=…&display=swap">`), each with a real fallback stack. Pick deliberately; avoid Inter/Space Grotesk as the "safe" pair and avoid the generic AI look (cream + serif + terracotta; black + acid green; purple gradient hero; emoji as section markers; rounded cards everywhere). Ground the look in the subject: utility control rooms, NWS bulletins, SCE outage maps, fire-weather charts. One bold choice, everything else quiet. Design both themes with equal care.

## Data pack

`DATA_PATH` (given in your brief) is a JSON file, about 260 KB. Inline it into the page as `const DATA = {...};` inside a `<script>` (do not fetch it). Schema:

- `meta`: `bbox` [W, S, E, N] in lon/lat (−119.10, 33.98, −118.52, 34.20), notes.
- `circuits`: keyed by name (Galahad, Maguire, Cuthbert, Merlin, Serra, Tuna, Nicholas): `substation`, `voltage`, `named_oct_2026` (true for the six; Nicholas is a neighbour for context), `named_on` (2026-10-12 for the first four, 2026-10-14 for Serra and Tuna), `customers` (SCE accounts on the circuit; Tuna's 500 is an assumption, `customers_assumed: true`), `customers_source`, `shutoffs_on_record`, `longest_hours`, `has_line`, `load_usable` (false for Serra).
- `lines`: keyed by circuit name, an array of polylines, each an array of `[lon, lat]` (SCE's real distribution lines from its PSPS Circuit layer, simplified to ~10 m). No line for Tuna.
- `approx_areas`: Tuna and Seaboard as `{lon: [w, e], inland_mi: [near, far], note}`: a band between those longitudes, from `near` to `far` miles inland of the coast. Draw dashed; label approximate.
- `coast`: array of `[lon, lat]` west to east, an approximate coastline (hand-traced, pushed seaward of every SCE line). Ocean is south of it.
- `places`: `{n, lon, lat}` labels. `fire`: Bryson Fire origin (lon, lat), `started` "2026-10-15 16:41", acres, containment.
- `shutoff_history`: 55 past shutoffs 2019 to 2025: `circuit, event, customers, start, end` (local Pacific, "YYYY-MM-DD HH:MM"), `hours, gust (mph, may be null), fpi, whole` (true = whole circuit, false = a segment). Tuna has none.
- `load`: keyed by circuit: `min[12][24]`, `max[12][24]` hourly low and high load for each month (index 0 = January) and `year[12]` (mixed 2022 to 2024). Units unstated by SCE; the numbers fit **amps per phase at 16 kV**, so 1 unit ≈ 27.7 kW three-phase (√3 × 16 kV × 1 A). Treat that as an assumption and show it. Serra's values are near zero and unusable: use Merlin's shape for Serra and say so.
- `timeline`: real dated events ("YYYY-MM-DD HH:MM" Pacific) with `kind` (nws, sce, fire, plan) and, on five of them, `rung` (watch, ask, fill, hold, hand). `kind: plan` entries have not happened yet (today is Sat Oct 17 2026); label them "planned".
- `assumptions`: defaults, ranges and notes for every adjustable number (battery spec, adoption %, Medical Baseline %, daily kWh, budget modes, cell tower backup hours, silent fault %, patrol hours, cold-load cap, TOU rates). Show each with its note; never present an assumed number as a fact.
- `sources`: name, url, what it was used for. Show them in the page.

## Time

Simulate hourly from **2026-10-07 00:00** to **2026-10-18 12:00** Pacific (276 hours). Hour index `h` → local time. Default timeline view starts at Oct 9. The event shutoff time for all six circuits is **2026-10-15 16:00** (Grace's hold rung). Restoration has not happened yet; the simulated plan restores circuits from **2026-10-18 06:00** (winds ease Oct 17 20:00 + `restore_patrol_h`), staggered 2 hours apart in Grace's proposed order, and is labelled **planned**. Oct 7 and 8 are ordinary days (the dual-use story).

## Homes (deterministic, seeded)

Use a seeded PRNG (e.g. mulberry32, seed 20261015) so every load produces the same homes.

- For each of the six named circuits, place `customers` homes. Circuits with a line: sample points along the polylines proportional to segment length, jittered ±40 m. Tuna: sample inside its approximate band. Nicholas gets no homes (context only).
- A share `adoption_pct` of homes has a Base Core battery (39.2 kWh, 20 kW output, grid charge rate capped at 10 kW per home, assumed). Draw all homes as faint dots; battery homes larger and coloured by state.
- Priority tiers among battery homes: **Tier 1 Medical Baseline** (`medical_baseline_pct` of homes, SCE's programme for people who need power for medical devices), **Tier 2 registered critical need** (10%, assumed: well pumps, infants, elderly), **Tier 3 everyone else**. Show the Medical Baseline homes with a distinct mark on the map.
- Each home has a daily use of `daily_use_kwh` × a lognormal-ish factor (0.6 to 1.6), shaped across the day by its circuit's October `max` load profile normalised to sum to 1 (`load[c].max[9]`; Serra uses Merlin's).
- Each home belongs to one of 6 cell-tower zones (split by longitude). A mesh add-on toggle (off by default) models the neighbourhood radio mesh with one Starlink per zone.

## Simulation rules per hour (keep it transparent; write the engine as pure functions so it can be unit-tested with node)

Battery state: `soc` kWh, `status` ∈ normal, watch, held, filling, islanded, empty, silent, fault, restoring. Circuit state: on, off, restoring. Grid price: TOU on-peak 16:00 to 21:00 else off-peak.

1. **Ordinary day (grid on, before any rung)**: charge from the grid off-peak at up to 10 kW; discharge on-peak to cover home load, never below the floor `reserve_floor_pct` (20%). Savings per home per day = on-peak kWh served from the battery × (on_peak − off_peak). Show $/day per home and for the fleet, and say this is what Base and Tesla already do.

   **The risk ladder (rules 1a to 3).** Readiness costs money (a battery held at 100% forfeits that day's on-peak savings), so Grace spends it by risk and by need. Show the "cost of readiness" per day for the fleet as the ladder climbs.
   - **1a. Low risk, Watch (Oct 9 02:14, first NWS signal)**: on Malibu's high fire-risk circuits (all six), **Tier 1 Medical Baseline homes fill to 100% off-peak and hold** (status held; standing consent from enrolment, Grace sends a notice). Everyone else keeps its ordinary day (arbitrage above the 20% floor); nothing is spent on homes the risk does not yet justify.
2. **Moderate risk, Ask (Oct 12 09:00, SCE names Cuthbert, Galahad, Maguire, Merlin)**: on the named circuits, **Tier 2 registered critical-need homes fill to 100% and hold**. Tier 3 homes on named circuits get their floor raised to 50% (gentle, cheap, reversible) and are asked for consent to pre-fill once the shutoff is definite; assume 90% consent within 12 hours (seeded). Serra and Tuna are named at 06:37 on Oct 14, so their Tier 2 homes jump to 100% then.
3. **Definite, Fill (Oct 14 06:37, SCE says Merlin could be cut by 10:30 AM, six circuits)**: **consenting Tier 3 homes on all six circuits fill to 100%**, staggered without creating a new peak: for each circuit and hour, fleet charging kW ≤ headroom = (that circuit's October peak − `max[9][hour]`) × 27.7 kW × `cold_load_cap_pct`/100. Any Tier 1 or 2 home not yet full goes first; whatever headroom remains spills to the next tier. Serra uses Merlin's headroom scaled by customers. Show per-circuit load vs cap in the circuit panel (the real October shape plus the fleet's charging on top).
4. **Hold (Oct 15 16:00)**: circuits go off. Every battery islands (no export, ever). Grace gives each home an **outage budget mode**: the richest of critical (8 kWh/day), essential (16), normal (32) that its soc can sustain for the planned outage (`planned_outage_h`, default 62 h = to Oct 18 06:00); Tier 1 homes never drop below essential while they have charge. Load follows the home's hourly shape scaled to the mode. Grace also pushes per-home load limits with the budget: thermostat hold (e.g. 78°F in the heat advisory) and EV charger paused, across brands from one plan (ecobee and Powerwall do this within their own brands today); show them on the home card as flags. At 0 kWh the home goes dark (status empty). Count outage-hours protected (home-hours with power) and Medical Baseline hours protected.
5. **Comms channel and silent batteries**: each home reports over a channel that degrades in order: home internet while the grid is on; SMS over the cell network after the shutoff, until the tower's own battery runs out (`cell_tower_backup_h`, assumed; in PG&E's Oct 2019 shutoffs about half of Marin County's cell sites went out); then the **neighbourhood mesh radio to a Starlink uplink**, which is the main outage channel, not a backup (mesh toggle **on by default**; assume 5 of the 6 tower zones have a Starlink node, the sixth does not, seeded). A home with no channel is silent: it stops reporting but keeps executing its last signed plan (the whole shutoff plan was pushed before the towers failed). Grace tells "tower down" (a whole zone silent in the same hour) from "check this one" (an isolated silent battery; `silent_fault_pct` are really faulted, seeded). Show the channel per home on its card, counts per channel in the fleet panel, and both silent classes. With the mesh toggle off, every zone goes silent when its tower does, which shows what the mesh buys.
6. **Hand to a person (Oct 17 20:00)**: Grace proposes a restoration recharge plan per circuit: order (Medical Baseline first), start time, staggered so circuit load after restoration (homes at 1.5× normal load for 2 hours, cold load pickup, plus battery charging) stays under the October peak × cap. The **shutoff officer** (the user) approves or holds each circuit's plan with buttons. Until approved, batteries on that circuit keep serving homes and do not draw from the grid after restoration. Restoration times are planned, not actual; say so.
7. **Emergency power for a medical home (hand to a person, during the outage)**: when a Tier 1 home's battery will not last to the planned restoration (soc below 20% and hours-left < hours-to-restoration), Grace proposes dispatching a charged EV from a nearby Tier 3 home whose battery is above 70% (assume 25% of homes have an EV and one trip delivers 10 kWh; assumed). The proposal appears in the Approvals panel with the two homes, the kWh and the hours it buys; the operator approves or holds; an approved trip adds 10 kWh to the medical home one hour later. Count trips proposed, approved and hours bought.

Re-run the whole simulation whenever an assumption changes (276 h × ~1,100 battery homes is cheap). Precompute per-hour fleet summaries once per run so scrubbing is instant.

## Views

Desktop: map left (about 62% width), panels right; sticky timeline below the map. Phone: map on top (about 55 vh), then panels stacked, timeline sticky at the bottom.

1. **Header**: name, one-line what-this-is, current simulated time (Pacific, e.g. "Thu Oct 15, 4:00 PM"), current rung chip, a "Today" marker (Sat Oct 17) on the timeline.
2. **Map** (Canvas for dots, SVG or Canvas for lines): ocean/coast, SCE lines coloured per circuit (grey for Nicholas, muted when not yet named, bright once named), Tuna and Seaboard dashed approximate bands, homes, fire origin (appears from Oct 15 16:41 with a pulsing ring unless reduced motion), place labels, scale bar, north note "lines from SCE GIS, coast approximate". Pan by drag, zoom by wheel/pinch and +/− buttons, reset. Hover or tap a home: card with circuit, tier, battery state, soc %, budget mode, hours left, reporting status. Click a line or legend: circuit panel. Legend for home states.
3. **Timeline**: Oct 7 → Oct 18 12:00 with rung bands (watch, ask, fill, hold, hand) and event ticks (hover shows the event text), play/pause, speed (1 h, 6 h, 1 day per second), jump buttons for each rung, keyboard arrows. Grace's narrative line for the current hour ("Filling Tier 1 on Galahad: 112 of 118 at 100%, 2.1 MW headroom left").
4. **Fleet panel** (current hour): counts (battery homes with power, Medical Baseline homes with power, empty, silent: tower down vs check, held/filling), fleet soc as a stacked status bar, a small chart of fleet soc over the window with the current hour marked, outage-hours protected so far, ordinary-day savings.
5. **Circuit panel** (selected circuit): facts (substation, customers with source or "assumed", named on, shutoffs on record with the past-shutoff bars by date and hours, longest), October load shape chart (min/max band) with the fleet's charging overlay and the cap line, this hour's load vs cap, battery homes by tier and state. Serra: note the unusable load data.
6. **Approvals panel** (the human step): two kinds of proposal with Approve / Hold buttons and status pills, and a line that the person decides and Grace only proposes. (a) Restoration plans, from the hand rung: per circuit: proposed start, order, peak check. (b) EV dispatches during the outage (rule 7): the medical home, the donor home, kWh, hours bought.
7. **Assumptions drawer**: every number from `assumptions` as a labelled control with its note, plus `planned_outage_h`, the mesh toggle (default on), EV share, and Reset. Changing one re-simulates.
8. **Sources and data notes** section at the bottom (after item 9): the `sources` list as links, plus caveats: SCE's load units inferred; Serra load unusable; Tuna customers and line assumed; coast approximate; restoration planned; Medical Baseline counts unpublished; Base has no California fleet, this is a demo.
9. **What exists, what Grace adds**: a compact section (or panel) with the rows in `PRIOR_ART.md`: pre-charge (Tesla Storm Watch, Base, SCE's portable batteries), outage budget (SPAN), staggered recharge (IEEE 1547 ramps output, not recharge), the utility-approved plan (not found), silent batteries (CSIP 4.4.2). Each row names the existing piece and states Grace's addition in one line. The ordinary-day panel says "as Base and Tesla already do". Nowhere may the app call daily arbitrage, pre-charging on a weather alert, or the 20% floor a Grace invention.

## Testing (required before you return)

`SHOT=<scratch>/app/shot-page.cjs` renders the fragment inside the publisher's skeleton at desktop and phone widths, light and dark, and prints console errors, page errors, failed requests, horizontal overflow and page height:

```
cd <outDir> && NODE_PATH=$(npm root -g) node $SHOT index.html shots/v1
```

Look at the four PNGs (Read them). Fix every error, every overflow, anything unreadable in either theme, anything clipped at phone width. Then write your own Playwright script (same `executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`, CommonJS, `NODE_PATH=$(npm root -g)`) that loads the wrapped page, scrubs to the Hold rung, clicks a circuit, opens the assumptions drawer and changes adoption, jumps to the hand rung and approves a restoration, and asserts no page errors and that the fleet counts changed. Run it. Unit-test the engine with node on a tiny fleet (e.g. 3 homes) for: floor respected, headroom cap respected during fill, islanding never exports, budget mode selection, silent timing, restoration order.

Do not use the Artifact tool or publish anything; the lead publishes.

## Honesty rules

- Real facts come only from the data pack. Assumed numbers carry the word "assumed" where they are shown. Restoration after Oct 17 is "planned". Medical Baseline counts are unpublished, so the Medical Baseline homes are explicitly demo homes.
- No lorem ipsum, no made-up news, no invented sources. Keep copy plain and short; no em dashes.
