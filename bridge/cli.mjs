// PowerUp bridge CLI: Grace's Malibu replay with every order run through Interlock, guard on vs guard off.
// Run: node bridge/cli.mjs   (writes bridge/out/malibu-guard.json)
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from '../interlock/src/engine.mjs';
import * as packs from '../interlock/src/packs.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const G = require('../grace/app/src/engine.js');
const DATA = require('../grace/data/data.json');
const PowerUp = require('./powerup.js');
const I = { ...engine, ...packs };

const P = G.defaultParams(DATA);
const world = G.buildHomes(DATA, P);
const decisions = { restore: Object.fromEntries(G.NAMED.map((c) => [c, 'approved'])), ev: {} };
const t0 = Date.now();
const res = PowerUp.run({ G, I, DATA, world, P, decisions });
const when = (h) => G.fmtTime(h);
console.log(`ran in ${Date.now() - t0} ms\n`);
for (const e of res.log) {
  const o = e.order;
  const fx = e.on && e.off ? `  | off: ${Math.round(e.off.energyKWh)} kWh, ${e.off.homesMoved} homes, dead-line ${e.off.deadLineBatteryH} batt-h, over ${e.off.overMW.toFixed(2)} MW;  on: ${Math.round(e.on.energyKWh)} kWh, ${e.on.homesMoved} homes, dead-line ${e.on.deadLineBatteryH}, over ${e.on.overMW.toFixed(2)} MW` : '';
  console.log(`${when(o.h).padEnd(22)} ${o.who.padEnd(9)} ${o.truth.padEnd(9)} ${e.verdict.padEnd(8)} ${e.rung.padEnd(5)} ${o.title}${fx}`);
  for (const r of e.reasons) console.log(`      - [${r.check}/${r.code}] ${r.detail}`);
}
console.log('\nGrace orders:', PowerUp.graceSummary(res.log));
console.table(res.metrics);
console.table(res.exposure);
const strip = (e) => ({ h: e.order.h, id: e.order.id, who: e.order.who, truth: e.order.truth, tag: e.order.tag, title: e.order.title, why: e.order.why || null,
  verdict: e.verdict, rung: e.rung, canaried: e.canaried, reasons: e.reasons.map(({ check, code, detail, rung }) => ({ check, code, detail, rung })), stats: e.stats,
  on: e.on ? { energyKWh: e.on.energyKWh, homesMoved: e.on.homesMoved, deadLineBatteryH: e.on.deadLineBatteryH, overMW: e.on.overMW, mbDrained: e.on.mbDrained } : null,
  off: e.off ? { energyKWh: e.off.energyKWh, homesMoved: e.off.homesMoved, deadLineBatteryH: e.off.deadLineBatteryH, overMW: e.off.overMW, mbDrained: e.off.mbDrained } : null });
mkdirSync(join(here, 'out'), { recursive: true });
writeFileSync(join(here, 'out', 'malibu-guard.json'), JSON.stringify({ generated: 'node bridge/cli.mjs', decisions, grace: PowerUp.graceSummary(res.log), metrics: res.metrics, exposure: res.exposure, log: res.log.map(strip) }, null, 1));
