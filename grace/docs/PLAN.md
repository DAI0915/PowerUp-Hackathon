# Plan: the Grace git project

Written Sat Oct 17 2026, 1:45 PM PT. Devpost submission is due 10 PM PT tonight.

## 1. Repository (needs Omer)

- Create a public GitHub repository (suggested name `grace`, under `mrbese`) and share the name. Nothing else is needed: the project is assembled and committed locally and will be pushed with one command.
- The Devpost entry links the repository, the live app and the deck.

## 2. What is in the first commit (done)

- `app/`: the single-file replay app, its source, build script and tests (22 engine tests, 126 Playwright checks, zero page errors, no overflow on phone).
- `data/`: the data pack, the SCE extracts for Malibu, the CAISO price values and the scripts that made them.
- `docs/`: spec, prior art, twists.
- `README.md`, `LICENSE` (MIT), `.gitignore`.

Not in the repository (too large, public downloads): SCE's statewide `PSPS_Circuit.geojson` (107 MB), `Circuit_Load_Profile.csv` (71 MB) and `.geojson` (308 MB). `data/malibu/README.md` says where they come from.

## 3. Profit analysis on real prices (done, one gap)

- Done: the app's money (ordinary-day savings and cost of readiness) now runs on real CAISO day-ahead prices for the SCE load zone, October 2025, as the default. Per day and per battery it is the best charge and discharge schedule against that day's 24 prices at the battery's floor (20%, 50% raised floor, 100% held). The assumed SCE TOU rates stay as the alternative in the drawer.
- Gap: the hourly price file (2,209 rows) is on Omer's Mac at `~/energy-career/data/caiso_dlap_sce_dam_2025q4.csv`; the cloud cannot reach CAISO and folder access was declined. With it, the engine can price every hour instead of spreading the day's value evenly: copy it into `data/prices/` and run `python3 -I prep_cost.py <file>` then `python3 -I ../add_prices.py <file>_daily_value.csv ../data.json`.
- Caveats stated in the app: wholesale value of the flexibility (a California home battery does not collect it directly today), no Malibu node publishes a price, 2025 prices on 2026 dates, perfect foresight.

## 4. Next steps in order

1. Push, then put the repository link on Devpost, the deck and the poster.
2. Add the hourly prices (step 3 gap) if Omer copies the file.
3. Grant metrics panel (twist 1): homes kept powered, Medical Baseline hours, peak MW avoided, cost per protected home, from the existing simulation.
4. Region config and a South Africa load-shedding pack (twist 2).
5. Poster from the app's map, ladder and numbers (twist 3), PDF at 24 x 36 in.
6. Keep every assumed number labelled; never claim arbitrage, weather-alert pre-charging or the 20% floor as new.
