# Q4 2025 CAISO prices and readiness cost

- Source: CAISO OASIS PRC_LMP, day-ahead (DAM), node DLAP_SCE-APND (SCE default load price), Oct 1 to Dec 31 2025, 2,209 hourly rows. Pulled Oct 17 2026 on Omer's Mac (~/energy-career/data/caiso_dlap_sce_dam_2025q4.csv); the cloud container's network blocks OASIS. Mean $38.10/MWh, min -$15.93, max $66.18.
- No Malibu-specific price exists: LATIGO_NODET is in CAISO's node list but publishes no LMP. Nearest priced nodes: MOORPARK_6_N001, MTZUMA2_7_B1 (not pulled).
- `prep_cost.py`: per-day dynamic program for one Base Core (39.2 kWh, 20 kW, 95% each way), SOC never below the floor. Perfect day-ahead foresight, no degradation, battery assumed to trade the wholesale price directly (a home battery in CA does not do this today; treat as the wholesale value of the flexibility).
- `caiso_dlap_sce_dam_2025q4_daily_value.csv`: arbitrage $ per battery per day at floors 20/50/80/100%. Loss from holding at 100% = value_floor20.
