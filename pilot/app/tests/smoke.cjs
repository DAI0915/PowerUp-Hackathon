// node pilot/app/tests/smoke.cjs : the PowerUP engine and the Interlock bridge run on the RAR8848 pack
const assert = require('assert');
const G = require('../src/engine.js');
const DATA = require('../data.json');
const P = G.defaultParams(DATA);
assert.deepStrictEqual(G.NAMED, ['Cuthbert']);
const W = G.buildHomes(DATA, P);
assert.strictEqual(W.homes.length, 456);
const sim = G.simulate(DATA, W, P, { restore: { Cuthbert: 'approved' }, ev: {} });
const hold = sim.rungs.hold, last = sim.fleet[sim.fleet.length - 1];
const atHold = sim.fleet[hold + 24];
console.log('homes', W.homes.length, 'batteries', W.batteries.length, 'rungs', sim.rungs);
console.log('24 h into the shutoff:', atHold.power, 'of', W.batteries.length, 'battery homes have power; medical', atHold.mbPower + '/' + atHold.mbTotal);
console.log('restore plan', sim.proposals.restore.map(p => `${p.circuit} ${G.fmt24(p.startH)} ${p.underCap ? 'under' : 'over'} cap`));
assert.ok(atHold.mbPower === atHold.mbTotal, 'every Medical Baseline battery home has power a day into the shutoff');
assert.strictEqual(sim.proposals.restore.length, 1);
for (const h of [0, sim.rungs.watch, sim.rungs.ask, sim.rungs.fill, hold + 3, sim.rungs.hand + 2]) console.log(G.fmt24(h), sim.narrative[h]);
assert.ok(!/Galahad|Maguire|Merlin|Serra|Tuna|six circuits/.test(sim.narrative.join(' ')), 'narrative names only the pilot circuit');
console.log('ok');
