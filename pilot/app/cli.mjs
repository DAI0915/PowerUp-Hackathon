// PowerUP on the RAR8848 pilot, every order run through Interlock, guard on vs guard off.
// Run: node pilot/app/cli.mjs
import { createRequire } from 'node:module';
import * as engine from '../../interlock/src/engine.mjs';
import * as packs from '../../interlock/src/packs.mjs';

const require = createRequire(import.meta.url);
const G = require('./src/engine.js');
const DATA = require('./data.json');
const PowerUP = require('./src/bridge.js');
const I = { ...engine, ...packs };

const P = G.defaultParams(DATA);
const world = G.buildHomes(DATA, P);
const decisions = { restore: Object.fromEntries(G.NAMED.map((c) => [c, 'approved'])), ev: {} };
const res = PowerUP.run({ G, I, DATA, world, P, decisions });
console.log(`${world.homes.length} homes behind RAR8848, ${world.batteries.length} battery homes, ${world.batteries.filter((b) => b.tier === 1).length} Medical Baseline\n`);
for (const e of res.log) {
  const o = e.order;
  const fx = e.on && e.off ? `  | off: ${Math.round(e.off.energyKWh)} kWh, ${e.off.homesMoved} homes, dead-line ${e.off.deadLineBatteryH} batt-h, over ${e.off.overMW.toFixed(2)} MW;  on: ${Math.round(e.on.energyKWh)} kWh, ${e.on.homesMoved} homes, dead-line ${e.on.deadLineBatteryH}, over ${e.on.overMW.toFixed(2)} MW` : '';
  console.log(`${G.fmtTime(o.h).padEnd(22)} ${o.who.padEnd(9)} ${o.truth.padEnd(9)} ${e.verdict.padEnd(8)} ${e.rung.padEnd(5)} ${o.title}${fx}`);
  for (const r of e.reasons) console.log(`      - [${r.check}/${r.code}] ${r.detail}`);
}
console.log('\nPowerUP orders:', PowerUP.powerupSummary(res.log));
console.table(res.metrics);
console.table(res.exposure);
