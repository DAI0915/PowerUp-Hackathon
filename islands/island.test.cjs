/* node island.test.cjs */
const assert = require('assert');
const I = require('./island.js');
const S = require('./scenario.cjs');
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('a risky segment with no switch opens the nearest switch above it', () => {
  const c = I.classify(S.SEGMENTS, ['RIDGE']);
  assert.deepStrictEqual(c.opened, ['CB']);
  assert.strictEqual(c.customers.risk, 140);
  assert.strictEqual(c.customers.collateral, 637);
});

t('a risky segment with its own switch only takes itself and what hangs below it', () => {
  const c = I.classify(S.SEGMENTS, ['MESA']);
  assert.deepStrictEqual(c.opened, ['RCS-M']);
  assert.deepStrictEqual(c.customers, { risk: 144, collateral: 0, on: 633 });
});

t('vertical shutoff: the underground coast behind its recloser can island, overhead MESA cannot', () => {
  const c = I.classify(S.SEGMENTS, ['TRUNK', 'RIDGE']);
  const isl = I.findIslands(S.SEGMENTS, c);
  const coast = isl.find(i => i.id === 'island-COAST'), mesa = isl.find(i => i.id === 'island-MESA');
  assert.ok(coast.allowed); assert.deepStrictEqual(coast.segments.sort(), ['COAST', 'COAST-B']); assert.strictEqual(coast.customers, 313);
  assert.ok(!mesa.allowed); assert.match(mesa.blockers[0], /overhead/);
});

t('a collateral group with no switch at its head cannot island', () => {
  const segs = S.SEGMENTS.map(s => s.id === 'COAST' ? Object.assign({}, s, { device: null }) : s);
  const isl = I.findIslands(segs, I.classify(segs, ['TRUNK', 'RIDGE']));
  assert.ok(!isl.find(i => i.id === 'island-COAST').allowed);
});

t('no grid-forming source means no island, even with plenty of energy', () => {
  const r = S.run(48);
  const p = r.plans.find(p => p.island === 'island-COAST');
  assert.ok(!p.feasible); assert.ok(p.problems.some(x => /grid-forming/.test(x)));
  assert.strictEqual(I.settle(p).utility_payment, 0);
});

t('a community grid-forming battery makes the coast island feasible and the money adds up', () => {
  const r = S.run(48, { community: { kwh: 400, kw: 200 } });
  const i = r.plans.findIndex(p => p.island === 'island-COAST');
  const p = r.plans[i], m = r.money[i];
  assert.ok(p.feasible, p.problems.join('; '));
  assert.ok(p.used_kwh <= p.pool_kwh + 0.1);
  const donorSum = m.donors.reduce((a, d) => a + d.paid, 0);
  assert.ok(Math.abs(donorSum - m.paid_to_donors) < 1);
  assert.ok(Math.abs(m.platform + m.to_infrastructure - (m.utility_payment + m.charged_to_receivers - m.paid_to_donors)) < 1);
});

t('opt-out homes and self-backup homes draw nothing from the island', () => {
  const isl = { id: 'x', segments: ['A'], allowed: true, blockers: [] };
  const homes = [
    { id: 'cb', seg: 'A', battery_kwh: 100, soc: 1, grid_forming: true, choice: 'donor', size: 0, export_kw: 50 },
    { id: 'out', seg: 'A', battery_kwh: 0, choice: 'out', size: 1 },
    { id: 'self', seg: 'A', battery_kwh: 39.2, soc: 1, choice: 'self', size: 1 }
  ];
  const p = I.planIsland(isl, homes, 24);
  assert.strictEqual(p.used_kwh, 0); assert.strictEqual(p.counts.opted_out, 1); assert.strictEqual(p.counts.self_backup, 1);
});

t('Medical Baseline receivers must be covered at critical or the island does not form', () => {
  const isl = { id: 'x', segments: ['A'], allowed: true, blockers: [] };
  const cb = { id: 'cb', seg: 'A', battery_kwh: 10, soc: 1, grid_forming: true, choice: 'donor', size: 0, export_kw: 50 };
  const med = [1, 2].map(i => ({ id: 'm' + i, seg: 'A', battery_kwh: 0, choice: 'receiver', medical: true, size: 1 }));
  const p = I.planIsland(isl, [cb, ...med], 24);       // 8 kWh usable, 16 kWh needed
  assert.ok(!p.feasible); assert.ok(p.problems.some(x => /Medical/.test(x)));
});

t('the richest mode the pool carries is chosen for everyone', () => {
  const isl = { id: 'x', segments: ['A'], allowed: true, blockers: [] };
  const cb = { id: 'cb', seg: 'A', battery_kwh: 50, soc: 1, grid_forming: true, choice: 'donor', size: 0, export_kw: 50 };
  const r = [1, 2].map(i => ({ id: 'r' + i, seg: 'A', battery_kwh: 0, choice: 'receiver', size: 1 }));
  const p = I.planIsland(isl, [cb, ...r], 24);         // 40 kWh usable: 2 x 16 essential fits, 2 x 32 normal does not
  assert.strictEqual(p.receiver_mode, 'essential'); assert.strictEqual(p.used_kwh, 32);
});

t('a transformer island needs its secondary switch and an underground secondary', () => {
  const homes = [
    { id: 'b', seg: 'RIDGE', battery_kwh: 39.2, soc: 1, solar_kwh_day: 0, grid_forming: true, choice: 'donor', size: 1 },
    { id: 'r', seg: 'RIDGE', battery_kwh: 0, choice: 'receiver', size: 1 }
  ];
  const ok = I.transformerIsland({ id: 'T1', seg: 'RIDGE', homes: ['b', 'r'], secondary: 'underground', switch: true }, homes, 24);
  const no = I.transformerIsland({ id: 'T2', seg: 'RIDGE', homes: ['b', 'r'], secondary: 'overhead', switch: false }, homes, 24);
  assert.ok(ok.feasible, ok.problems.join('; ')); assert.ok(!no.feasible);
  assert.ok(no.problems.some(x => /secondary isolation switch/.test(x)));
});

t('switch value ranks the fused RIDGE tap first', () => {
  const v = I.switchValue(S.SEGMENTS, ['RIDGE']);
  assert.deepStrictEqual(v[0], { segment: 'RIDGE', customers_kept_on: 637 });
});

console.log(`\n${n} tests passed`);
