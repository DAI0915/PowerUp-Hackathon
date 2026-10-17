# Prior art: what exists and what Grace adds

From the project's prior-art check (Oct 17 2026), doc: https://claude.ai/code/artifact/dcbde18b-af02-4cc3-83f5-913325c57be4. The app and the pitch must credit the pieces that exist and claim only Grace's additions.

| Grace piece | Today | Who does something close | What Grace adds |
|---|---|---|---|
| Pre-charge home batteries before a shutoff, Medical Baseline first | Partly | Tesla Storm Watch charges Powerwalls to full on NWS watches and warnings, Red Flag included (active for PG&E's Oct 2019 shutoffs). Base says its battery holds more charge and pulls back from grid activity before forecast outages. SCE gives Medical Baseline customers in fire areas a free portable battery, no dispatch. | Triggered by the utility's own shutoff circuit list rather than a weather alert, targeted to the exact circuits, and ordering who charges first by medical need. Storm Watch treats every home the same. |
| Per-home outage energy budget | Partly | SPAN sheds "nice to have" circuits when the battery falls below 50%. Base's storm guide only tells owners to switch off heavy loads. | A budget sized to the expected shutoff length for that circuit, with the home told up front what it can run and for how long. |
| Staggered recharge to avoid cold load pickup | Partly | IEEE 1547-2018 makes inverters wait 300 s and ramp output over 300 s on reconnection. Managing cold load pickup with demand response is patented (US 8,600,573). Base says the battery simply resumes VPP operation on restoration. | The 1547 rule governs output, not the battery's recharge draw. No VPP found staggers a fleet's recharge after a shutoff. |
| Utility-approved restoration plan as the human step | Not found | Utilities sequence restoration themselves. | A battery fleet plan that a utility operator signs off before the batteries act. |
| Telling silent batteries apart and having them follow a plan alone | Partly | California's IEEE 2030.5 profile (CSIP 4.4.2) says a device on lost comms shall complete any scheduled event, then revert to defaults. | Pushing the whole shutoff plan down before cell towers fail, then classifying silence as comms-down or broken. |
| Neighborhood mesh radio with a Starlink uplink | Exists, not for batteries | Meshtastic for wildfire crews; Starlink for community brigades. | Using that link to carry battery plans and status. |
| Daily time-of-use arbitrage with a backup floor | Exists | Base keeps a 20% floor during market dispatch. Sunrun runs a 5 MW VPP for SCE. Tesla offers this on every Powerwall. | Nothing new. Present it as the everyday half of dual-use and credit Base. |

Base Power today: arbitrage with a 20% backup floor; holds more charge when outage risk rises; pre-charges on ERCOT grid emergency alerts; islands without exporting; resumes market dispatch on restoration. Nothing published on medical priority, outage budgets, restart staggering or lost comms. No California customers.

SCE today: free portable batteries for Medical Baseline customers in high fire risk areas; buys capacity from Sunrun's VPP. Nothing found on charging, budgeting or restarting customer batteries around a shutoff.

Pitch line that holds up: Storm Watch fills every tank when the weather turns. Grace uses the utility's own shutoff list to decide whose tank fills first, how long it must last, and how everyone comes back without spiking the circuit.

Required in the app: a short "What exists, what Grace adds" section (or panel) with the four rows that matter (pre-charge, budget, staggered recharge, approved plan) plus the silent-battery row, each crediting the existing piece by name. Nowhere may the app call daily arbitrage, pre-charging on a weather alert, or the 20% floor a Grace invention. The ordinary-day panel should say "as Base and Tesla already do".
