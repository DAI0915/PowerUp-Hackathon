# Malibu circuit data for Grace

Pulled Oct 17 2026 from SCE's DRPEP portal (drpep-sce2.opendata.arcgis.com) for the six circuits in the Oct 2026 Malibu shutoff: Cuthbert, Galahad, Maguire, Merlin, Serra, Tuna.

Everything here has been checked against SCE's own downloads in `sce/` except the 2024 to 2025 shutoffs, which came through a web reader. Spot-check those before quoting exact numbers.

## malibu_circuit_load_profiles.csv

1,728 rows: 6 circuits x 12 months x 24 hours. Each row is the lowest and highest load seen on that circuit in that hour of that month.

- Source: ICA_Tables, Circuit Load Profile layer (services5.arcgis.com/z6hI6KRjKHvhNO0r/arcgis/rest/services/ICA_Tables/FeatureServer/1). All 1,728 rows match SCE's own download (`sce/Circuit_Load_Profile.csv`) exactly, including the mixed years and Serra's bad values.
- `month` is 1 to 12 here. The source uses 0 to 11.
- Units are not stated in the source. The numbers fit amps per phase at 16 kV: Cuthbert's October range of 114 to 186 works out to about 3.2 to 5.1 MW, or 1.3 to 2.1 kW per home. That is an inference.
- Years are mixed within a circuit. Galahad is Jan 2024 plus Feb to Dec 2023. Maguire is Jan to Sep 2024 plus Oct to Dec 2023. Tuna is Jan to Jun 2023 plus Jul to Dec 2022. Cuthbert and Merlin are all 2024.
- **Serra is not usable** (`usable = no`). It is 2022, zero from January to March, and near zero until October. Scale another circuit by customer count instead.
- Evening peak is around 6 PM on most circuits in October.

## malibu_psps_history.csv

55 shutoffs on the six circuits from 2019 to 2025. Tuna has none on record.

- 17 events come from SCE's own download (`sce/PSPS_Circuit.csv`, which covers 2019 to 2023 only). The other 38, from 2024 and 2025, come from a live query of the same layer through a web reader. The 14 events in both sources match exactly on times, customers, wind gust and fire index.
- Times read as local Pacific time. SCE labels them +00, but they match the time stamped in each event id.
- `hours_out` is computed from the two times. SCE's own `minutes_deenergized` field is in minutes and agrees with it.
- Typical outage is one to two days. The longest were part of Merlin at about 213 hours and Serra at about 163 hours, both in Jan 2025.
- `customers` is per event and varies, because SCE sometimes cuts only part of a circuit (event ids with RAR, RCS or PS segments). Event ids with `-CB-` are whole-circuit shutoffs.
- `source` says which of the two sources each row came from.

## malibu_circuits.geojson

Line shapes for five of the six circuits (Cuthbert, Galahad, Maguire, Merlin, Serra), cut from SCE's statewide `sce/PSPS_Circuit.geojson`. Coordinates are longitude and latitude (WGS84), rounded to six decimals. Each circuit carries its latest whole-circuit customer count, shutoffs on record, longest outage and line length.

Tuna is missing because it had no shutoffs on record before this month, so it is not in the shutoff layer. Its shape is in the Distribution_circuits layer on the portal.

## sce/

Omer's direct downloads from the portal, kept as they came:

- `PSPS_Circuit.csv` and `PSPS_Circuit.geojson`: 901 statewide circuit shutoffs, 2019 to 2023. The geojson is 107 MB, so use `malibu_circuits.geojson` for maps.
- `PSPS_Subtransmission.csv` and `.geojson`: 4 higher-voltage line shutoffs from 2019 and 2020, none near Malibu. Context only.
- `Circuit_Load_Profile.csv`: 1.23 million rows, hourly low and high load for 4,251 SCE circuits (2017 to 2024, mostly 2022 to 2024). Same columns as the source table. Useful for neighbouring circuits on the same substations (Seaboard and Nicholas on Tapia; Mulholland, Plateau and Rhoda on Crater).
- `Circuit_Load_Profile.geojson`: the same table as GeoJSON with empty geometry (308 MB). It adds nothing over the CSV.

## malibu_circuits_map.png and bryson_page_with_real_lines.html

A preview of the five circuit lines on the Malibu map, and the source of the case-study page rebuilt with them, now live at https://claude.ai/artifact/5u8jbeVE844y7heeDDTFi3.

Not included yet: Tuna's line shape and Medical Baseline counts, which SCE does not publish per circuit.

## app/

The interactive Grace Malibu replay (mini app), live at https://claude.ai/artifact/2nJavppFPcHFBU1HGg18tC (the link stays the same when it is republished).

- `index.html`: the whole app in one file, built by `python3 -I build.py` from `src/page.html` (markup, styles, page script), `src/engine.js` (the simulation, pure functions, also run by the tests) and `data.json`.
- `data.json`: the data pack the app inlines: circuit facts, SCE line shapes (simplified to about 10 m), Tuna and Seaboard approximate areas, coast, places, the fire, the 55 shutoffs, October load shapes, the 20-event timeline, the assumptions with their sources, and the sources list. Built by `pack.py` from the files in this folder plus the earlier web pulls; the pack itself is what to check against.
- `SPEC.md` and `PRIOR_ART.md`: the app's spec (ladder rules, comms chain, EV dispatch, views, honesty rules) and the table of what already exists versus what Grace adds.
- `NOTES.md`: what the app shows, how the simulation works hour by hour, every assumption it introduces, the tests and the known gaps.
- `tests/`: `node tests/engine.test.cjs` (engine rules) and `NODE_PATH=$(npm root -g) node tests/interact.cjs` (Playwright, desktop and phone); `shot-page.cjs` takes the four screenshots.

Demo content: the 6,874 homes are placed along SCE's lines to match customer counts, 15% have a battery and 5% are Medical Baseline (SCE publishes neither per circuit). Restoration times are planned, not reported. SCE's load units are read as amps per phase at 16 kV (1 unit = 27.7 kW), an inference.
