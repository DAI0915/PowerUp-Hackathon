#!/usr/bin/env node
// Runs the Sept 6, 2022 replay guard off vs guard on (and the three packs), prints a scoreboard, writes out/results.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runReplay, toleranceMap, SCENARIO, FACTS, ASSUMPTIONS, DAY } from './src/sim.mjs';
import { PACKS } from './src/packs.mjs';
import circuits from './data/circuits.mjs';

const seed = Number(process.argv.find((a) => a.startsWith('--seed='))?.split('=')[1] ?? 7);
const here = dirname(fileURLToPath(import.meta.url));

const runs = {
  guardOff: runReplay({ guard: false, seed }),
  legitBaseline: runReplay({ guard: false, seed, legitOnly: true }),
  guardOn: runReplay({ guard: true, seed, pack: 'sce' }),
  guardOnLegit: runReplay({ guard: true, seed, pack: 'sce', legitOnly: true }),
  installation: runReplay({ guard: true, seed, pack: 'installation' }),
  australia: runReplay({ guard: true, seed, pack: 'australia' }),
};
const tolerance = toleranceMap({ seed });

const rows = [
  ['Homes ever below their floor', 'floorBreachHomes'],
  ['Home-minutes below floor', 'floorBreachHomeMin'],
  ['Homes below 20%/50% promise', 'promiseBreachHomes'],
  ['Homes < 8 h backup at 8 PM', 'lowBackupHomes8pm'],
  ['MW-min over import limit', 'importOverMWmin'],
  ['MW-min past export cap', 'exportOverMWmin'],
  ['Battery-min exporting on open circuit', 'deadLineBatteryMin'],
  ['Revenue $ (TOU + event)', 'revenue'],
  ['  TOU savings $', 'touRevenue'],
  ['  Event pay $', 'eventRevenue'],
  ['Event MWh delivered', 'eventMWh'],
  ['Revenue from legit commands $', 'legitCmdRevenue'],
  ['  of which from below-promise energy $', 'belowPromiseValue'],
  ['Commands held', 'commandsHeld'],
  ['Legit commands held (false holds)', 'legitHeld'],
  ['Fallback home-minutes (last safe plan)', 'fallbackHomeMin'],
];
const cols = ['guardOff', 'guardOn', 'installation', 'australia', 'legitBaseline', 'guardOnLegit'];
const head = ['', 'Guard off', 'Guard on (SCE)', 'Installation', 'Australia', 'Legit-only off', 'Legit-only on'];
const fmt = (v) => (v === null || v === undefined ? '-' : typeof v === 'number' ? (Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { maximumFractionDigits: 2 })) : String(v));
const table = [head, ...rows.map(([label, k]) => [label, ...cols.map((c) => fmt(runs[c].scoreboard[k]))])];
const widths = head.map((_, i) => Math.max(...table.map((r) => r[i].length)));
console.log(`\nInterlock replay: ${DAY.weekday} ${DAY.date}, 12:00-22:00, seed ${seed}. CAISO peak ${FACTS.caisoPeakMW.toLocaleString()} MW, EEA 3 5:17-8:00 PM (REAL).`);
console.log(`Circuits (REAL SCE data): ${circuits.circuits.map((c) => `${c.id} ${c.name}/${c.substation}`).join(', ')}\n`);
for (const r of table) console.log(r.map((x, i) => (i === 0 ? x.padEnd(widths[i]) : x.padStart(widths[i]))).join('  '));
const rc = (s) => Object.entries(s.rungCounts).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ');
console.log(`\nRung counts, guard on (SCE): ${rc(runs.guardOn.scoreboard)}`);
const sb = (k) => runs[k].scoreboard;
const ratios = {
  cleanDay: sb('guardOnLegit').revenue / sb('legitBaseline').revenue,
  cleanDayExcludingBelowPromise: sb('guardOnLegit').revenue / (sb('legitBaseline').revenue - sb('legitBaseline').belowPromiseValue),
  chaosDayVsCleanDay: sb('guardOn').revenue / sb('legitBaseline').revenue,
  chaosDayLegitAttributed: sb('guardOn').legitCmdRevenue / sb('guardOff').legitCmdRevenue,
};
const ratio = ratios.cleanDay;
const pct = (x) => (100 * x).toFixed(1) + '%';
console.log(`Revenue kept by the guard (legit commands only, same day): ${pct(ratios.cleanDay)} ($${fmt(sb('guardOnLegit').revenue)} vs $${fmt(sb('legitBaseline').revenue)}); target 90%.`);
console.log(`  excluding guard-off money made by spending promised backup: ${pct(ratios.cleanDayExcludingBelowPromise)}`);
console.log(`  chaos day, guard on vs clean day guard off: ${pct(ratios.chaosDayVsCleanDay)}; chaos day revenue from legit commands, on vs off: ${pct(ratios.chaosDayLegitAttributed)}`);
console.log('Silence confusion (truth>predicted, home-steps), guard on:', JSON.stringify(runs.guardOn.scoreboard.silenceConfusion));
console.log('\nTolerance map (guard on, SCE, same seed):');
console.log('floor  canaryHomes canaryMW  revenue$   eventMWh  belowPromise  <8h@8PM');
for (const r of tolerance) console.log(`${(r.floorPct * 100).toFixed(0).padStart(4)}%  ${String(r.canaryHomes).padStart(10)}  ${r.canaryMW.toFixed(1).padStart(7)}  ${fmt(r.revenue).padStart(9)}  ${fmt(r.eventMWh).padStart(8)}  ${String(r.promiseBreachHomes).padStart(12)}  ${String(r.lowBackupHomes8pm).padStart(7)}`);

console.log('\nVerdict log, guard on (SCE), command arrivals:');
for (const e of runs.guardOn.log.filter((x) => x.phase === 'arrival' || x.kind === 'silence' || x.kind === 'behaviour')) {
  const why = e.reasons?.length ? e.reasons.map((r) => r.detail).join(' | ') : e.detail || '';
  console.log(`  ${e.time.padStart(8)}  ${(e.verdict || e.cls || '').padEnd(10)} ${String(e.rung).padEnd(5)}  ${e.title || e.id}: ${why}`.slice(0, 260));
}

mkdirSync(join(here, 'out'), { recursive: true });
const out = {
  generatedBy: 'interlock cli.mjs', seed, day: DAY, facts: FACTS, assumptions: ASSUMPTIONS,
  circuits: circuits.circuits.map(({ septHourly, ...c }) => c), circuitLabels: circuits.labels,
  scenario: SCENARIO, packs: Object.fromEntries(Object.entries(PACKS).map(([k, p]) => [k, { label: p.label, description: p.description }])),
  revenueRatios: ratios,
  runs, tolerance,
};
writeFileSync(join(here, 'out', 'results.json'), JSON.stringify(out));
console.log(`\nWrote out/results.json`);
