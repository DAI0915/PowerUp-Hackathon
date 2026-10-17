const G = require('../src/engine.js');
const DATA = require('../../data/data.json');
const P = G.defaultParams(DATA);
let t = Date.now();
const W = G.buildHomes(DATA, P);
console.log('homes', W.homes.length, 'batteries', W.batteries.length, 'build ms', Date.now() - t);
console.log('zones', W.zones.map(z => ({ id: z.id, starlink: z.starlink, n: z.count, b: z.batteries, main: z.mainCircuit, jitter: z.jitter })));
const tiers = [0,0,0]; for (const b of W.batteries) tiers[b.tier-1]++; console.log('tiers', tiers, 'ev', W.batteries.filter(b=>b.ev).length, 'faulty', W.batteries.filter(b=>b.faulty).length, 'dropout', W.batteries.filter(b=>b.dropout).length);
t = Date.now();
const R = G.simulate(DATA, W, P, { restore: {}, ev: {} });
console.log('sim ms', Date.now() - t, 'rungs', R.rungs);
for (const h of [0, 20, 60, 130, 176, 200, 208, 220, 240, 255, 260, 262, 268, 271, 273, 275, 281]) {
  const f = R.fleet[h];
  console.log(G.fmt24(h), f.rung, 'st', f.byStatus.join('/'), 'ch', f.byChan.join('/'), 'pow', f.power, 'mb', f.mbPower + '/' + f.mbTotal, 'soc%', f.socPct.toFixed(1), 'save', f.savingsDay.toFixed(0), 'ready', f.readinessDay.toFixed(0), 'modes', f.byMode.join('/'), 'zonesDown', f.zonesDown);
  console.log('   ', R.narrative[h]);
}
console.log('plan', R.proposals.restore.map(p => `${p.order} ${p.circuit} start ${G.fmt24(p.startH)} without ${(p.withoutKW/1000).toFixed(1)} with ${(p.withKW/1000).toFixed(1)} cap ${(p.capKW/1000).toFixed(1)} MW ${p.underCap ? 'under' : 'over'} recharge ${G.fmt24(p.chargeStartH)} | ${p.reason}`));
console.log('ev proposals', R.proposals.ev.length, R.proposals.ev.slice(0,3));
console.log('unmet', R.proposals.unmet.length, R.proposals.unmet.slice(0,2));
console.log('totals', R.totals);
// soc trajectory of a tier1 and tier3 home
const t1 = W.batteries.find(b => b.tier === 1), t3 = W.batteries.find(b => b.tier === 3 && b.consentDelay < 50), t3n = W.batteries.find(b => b.tier === 3 && b.consentDelay === Infinity);
for (const [name, b] of [['T1', t1], ['T3', t3], ['T3noconsent', t3n]]) {
  const line = []; for (let h = 0; h < G.HOURS; h += 6) line.push(R.soc[h * R.N + b.bi].toFixed(0) + G.STATUS[R.status[h*R.N+b.bi]][0]);
  console.log(name, b.circuit, line.join(' '));
}
// circuit Galahad load check hours 170..210
const c = R.circuits.Galahad; const arr=[]; for (let h = 174; h < 210; h+=2) arr.push(`${h}:${c.gridA[h].toFixed(0)}/${c.capA.toFixed(0)}(${c.chargeKW[h].toFixed(0)}kW)`); console.log('Galahad', arr.join(' '));
const arr2=[]; for (let h = 268; h < G.HOURS; h++) arr2.push(`${h}:st${c.state[h]} ${c.gridA[h].toFixed(0)}/${c.capA.toFixed(0)}(${c.chargeKW[h].toFixed(0)}kW)`); console.log('Galahad end', arr2.join(' '));
