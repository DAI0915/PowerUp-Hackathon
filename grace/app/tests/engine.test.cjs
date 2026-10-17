// Unit tests for the Grace engine on a tiny fleet. Run: node tests/engine.test.cjs
const assert = require('assert');
const G = require('../src/engine.js');
const DATA = require('../../data/data.json');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ', name); }
  catch (e) { failed++; console.log('FAIL ', name, '\n      ', e.message); }
}

const R = G.rungHours(DATA);
const cap = 39.2;

// a tiny world: three battery homes on Galahad (tiers 1, 2, 3), one Tier 1 on Maguire, one Tier 3 EV donor on Galahad
function tinyWorld(opts) {
  opts = opts || {};
  const fac = opts.factors || {};
  const prof = G.circuitProfiles(DATA);
  const mk = (id, circuit, tier, zone, extra) => Object.assign({
    id, circuit, x: 10 + id * 0.5, y: 5, lon: 0, lat: 0, battery: true, tier, factor: 1, ev: false,
    consentDelay: 2, faulty: false, faultAfter: 5, dropout: false, dropStart: 0, dropLen: 0, zone
  }, extra || {});
  const homes = [
    mk(0, 'Galahad', 1, 0),
    mk(1, 'Galahad', 2, 0),
    mk(2, 'Galahad', 3, 0, { ev: true }),
    mk(3, 'Maguire', 1, 2),
    mk(4, 'Galahad', 3, 1, { consentDelay: Infinity })
  ];
  homes.forEach((h, i) => { h.bi = i; if (fac[i] !== undefined) h.factor = fac[i]; });
  const zones = [];
  for (let z = 0; z < 6; z++) zones.push({ id: z, starlink: z !== 1, jitter: z === 2 ? 1 : 0, mainCircuit: z === 2 ? 'Maguire' : 'Galahad', count: 1, batteries: 1, x0: 0, x1: 1, byCircuit: {} });
  return { homes, batteries: homes, zones, zoneEdges: [], prof, bbox: DATA.meta.bbox };
}
function P(over) { return Object.assign(G.defaultParams(DATA), over || {}); }
const at = (res, h, bi) => h * res.N + bi;

test('rung hours come from the timeline (first hour at or after each event)', () => {
  assert.deepStrictEqual(R, { watch: 51, ask: 129, fill: 175, hold: 208, hand: 260 });
  assert.strictEqual(G.fmtTime(208), 'Thu Oct 15, 4:00 PM');
  // the window runs to Oct 18 18:00 so every planned restoration and the start of its recharge is inside it
  assert.strictEqual(G.HOURS, 282);
  assert.strictEqual(G.fmtTime(G.HOURS - 1), 'Sun Oct 18, 5:00 PM');
  assert.strictEqual(G.fmtTime(G.HOURS), 'Sun Oct 18, 6:00 PM');
  assert.strictEqual(G.hourOf('2026-10-09 02:14').toFixed(2), '50.23');
});

test('ordinary day respects the 20% floor and the raised 50% floor after Ask', () => {
  const W = tinyWorld(), p = P({ daily_use_kwh: 60 });
  const res = G.simulate(DATA, W, p, { restore: {}, ev: {} });
  const floor = cap * 0.2, askFloor = cap * 0.5;
  for (let h = 0; h < R.hold; h++) for (let bi = 0; bi < 5; bi++) {
    const s = res.soc[at(res, h, bi)];
    assert.ok(s >= floor - 1e-4, `home ${bi} at h${h} soc ${s} below floor`);
    // Tier 3 on a named circuit after Ask never discharges below 50%
    if (W.homes[bi].tier === 3 && h >= R.ask) assert.ok(s >= askFloor - 1e-4, `tier 3 at h${h} soc ${s} below 50% floor`);
  }
  // on-peak discharge actually happens on an ordinary day (soc dips below full at 20:00 Oct 7)
  assert.ok(res.soc[at(res, 20, 2)] < cap - 1, 'battery should discharge on-peak');
  assert.ok(res.fleet[20].savingsDay > 0, 'savings accrue');
});

test('Tier 1 holds at 100% from Watch, Tier 2 from Ask, consenting Tier 3 from Fill; non-consenting keeps arbitrage', () => {
  const W = tinyWorld();
  const res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  const S = G.S;
  // at 18:00 Oct 10 (on-peak, watch rung) tier 1 is held and full, tier 2 still arbitrages
  const h1 = 3 * 24 + 18;
  assert.strictEqual(res.status[at(res, h1, 0)], S.held);
  assert.ok(res.soc[at(res, h1, 0)] > cap - 0.1);
  assert.strictEqual(res.status[at(res, h1, 1)], S.watch);
  assert.ok(res.soc[at(res, h1, 1)] < cap - 0.5, 'tier 2 still discharging on-peak under watch');
  // after Ask (Oct 12 18:00) tier 2 held
  const h2 = 5 * 24 + 18;
  assert.strictEqual(res.status[at(res, h2, 1)], S.held);
  assert.strictEqual(res.status[at(res, h2, 2)], S.watch);
  // after Fill (Oct 14 18:00) consenting tier 3 held, non-consenting still watch and discharging
  const h3 = 7 * 24 + 18;
  assert.strictEqual(res.status[at(res, h3, 2)], S.held);
  assert.strictEqual(res.status[at(res, h3, 4)], S.watch);
  assert.ok(res.soc[at(res, h3, 4)] < cap - 0.5);
  assert.ok(res.fleet[h3].readinessDay > 0, 'readiness cost is counted for held homes on-peak');
});

test('fill never exceeds the per-circuit headroom cap (full real fleet, tight cap)', () => {
  const p = P({ adoption_pct: 100, cold_load_cap_pct: 92 });
  const W = G.buildHomes(DATA, p);
  const res = G.simulate(DATA, W, p, { restore: {}, ev: {} });
  let charged = 0;
  for (const c of G.NAMED) {
    const cc = res.circuits[c];
    for (let h = 0; h < G.HOURS; h++) {
      assert.ok(cc.chargeKW[h] <= cc.headroomKW[h] + 1e-3, `${c} h${h} charging ${cc.chargeKW[h]} > headroom ${cc.headroomKW[h]}`);
      if (cc.state[h] !== 1) assert.ok(cc.gridA[h] <= Math.max(cc.capA, cc.baseA[h]) + 1e-3, `${c} h${h} grid ${cc.gridA[h]} above cap ${cc.capA}`);
      charged += cc.chargeKW[h];
    }
  }
  assert.ok(charged > 0, 'some charging happened');
  // headroom actually binds somewhere during the fill rung
  let bound = false;
  for (let h = R.fill; h < R.hold; h++) if (res.circuits.Galahad.chargeKW[h] > 0 && Math.abs(res.circuits.Galahad.chargeKW[h] - res.circuits.Galahad.headroomKW[h]) < 1e-3) bound = true;
  assert.ok(bound, 'cap binds at least once on Galahad during Fill at 100% adoption');
});

test('islanded batteries never export and never draw: soc only falls while the circuit is off', () => {
  const W = tinyWorld();
  const res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  for (const c of ['Galahad', 'Maguire']) {
    const cc = res.circuits[c];
    for (let h = R.hold; h < G.HOURS; h++) if (cc.state[h] === 1) {
      assert.strictEqual(cc.gridA[h], 0, `${c} grid load while off at h${h}`);
      assert.strictEqual(cc.chargeKW[h], 0, `${c} charging while off at h${h}`);
    }
  }
  for (let bi = 0; bi < 5; bi++) for (let h = R.hold + 1; h < G.HOURS; h++) {
    if (res.circuits[W.homes[bi].circuit].state[h] !== 1) continue;
    assert.ok(res.soc[at(res, h, bi)] <= res.soc[at(res, h - 1, bi)] + 1e-6, `soc rose while islanded: home ${bi} h${h}`);
  }
});

test('budget mode: richest mode the home sustains for the planned outage; critical is the floor, Tier 1 included', () => {
  const W = tinyWorld();
  // default 62 h: a full battery sustains only critical (16/24*62 = 41.3 > 39.2); Tier 1 gets critical too (its floor)
  let res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  assert.strictEqual(G.MODES[res.mode[at(res, R.hold, 2)]], 'critical');
  assert.strictEqual(G.MODES[res.mode[at(res, R.hold, 0)]], 'critical');
  // a 20 h planned outage: normal (32/24*20 = 26.7 <= 39.2)
  res = G.simulate(DATA, W, P({ planned_outage_h: 20 }), { restore: {}, ev: {} });
  assert.strictEqual(G.MODES[res.mode[at(res, R.hold, 2)]], 'normal');
  // a 40 h planned outage: essential
  res = G.simulate(DATA, W, P({ planned_outage_h: 40 }), { restore: {}, ev: {} });
  assert.strictEqual(G.MODES[res.mode[at(res, R.hold, 2)]], 'essential');
  // islanded load follows the mode: critical = 8 kWh over a full day for an average home
  res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  const used = res.soc[at(res, R.hold, 2)] - res.soc[at(res, R.hold + 24, 2)];
  assert.ok(Math.abs(used - 8) < 0.2, `critical day used ${used} kWh`);
  // the budget scales with the home's size factor: a 1.5x home at 40 h cannot sustain essential (16*1.5/24*40 = 40 > 39.2)
  const W2 = tinyWorld({ factors: { 2: 1.5 } });
  res = G.simulate(DATA, W2, P({ planned_outage_h: 40 }), { restore: {}, ev: {} });
  assert.strictEqual(G.MODES[res.mode[at(res, R.hold, 2)]], 'critical');
  const used2 = res.soc[at(res, R.hold, 2)] - res.soc[at(res, R.hold + 24, 2)];
  assert.ok(Math.abs(used2 - 12) < 0.3, `1.5x home critical day used ${used2} kWh`);
  // the home's plan flags are set while islanded
  assert.strictEqual(res.flags[at(res, R.hold + 1, 2)] & 3, 3);
});

test('at the defaults every Medical Baseline home lasts to its planned restoration (tiny fleet and the real fleet)', () => {
  const S = G.S;
  const W = tinyWorld({ factors: { 0: 1.6, 3: 0.6 } });
  const res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  for (const bi of [0, 3]) {
    const cc = res.circuits[W.homes[bi].circuit];
    for (let h = R.hold; h < cc.restoreH; h++) assert.ok(res.soc[at(res, h, bi)] > 0 && res.status[at(res, h, bi)] !== S.empty, `tier 1 home ${bi} dark at h${h}`);
  }
  const p = P();
  const Wf = G.buildHomes(DATA, p);
  const rf = G.simulate(DATA, Wf, p, { restore: {}, ev: {} });
  let dry = 0, faults = 0;
  for (const hm of Wf.batteries) {
    if (hm.tier !== 1) continue;
    if (hm.faulty) { faults++; continue; }
    const cc = rf.circuits[hm.circuit];
    if (rf.soc[at(rf, cc.restoreH - 1, hm.bi)] <= 0) dry++;
  }
  assert.strictEqual(dry, 0, `${dry} medical homes ran dry before restoration`);
  const end = rf.fleet[G.HOURS - 1];
  assert.strictEqual(end.mbPower, end.mbTotal - faults);
  assert.strictEqual(rf.proposals.ev.length, 0, 'no EV trips needed at the defaults');
  assert.strictEqual(rf.proposals.unmet.length, 0);
});

test('silent timing: a zone goes silent together when its tower battery runs out; mesh keeps Starlink zones reporting', () => {
  const W = tinyWorld();
  const p = P({ cell_tower_backup_h: 8 });
  const res = G.simulate(DATA, W, p, { restore: {}, ev: {} });
  const C = G.C, S = G.S;
  // before shutoff: internet
  assert.strictEqual(res.chan[at(res, R.hold - 1, 0)], C.internet);
  // first outage hour: SMS
  assert.strictEqual(res.chan[at(res, R.hold, 0)], C.sms);
  // zone 0 (Starlink): still SMS at +7, mesh from +8
  assert.strictEqual(res.chan[at(res, R.hold + 7, 0)], C.sms);
  assert.strictEqual(res.chan[at(res, R.hold + 8, 0)], C.mesh);
  // zone 1 (no Starlink): silent, tower-down class, status silent, still executing its plan (soc keeps falling)
  assert.strictEqual(res.chan[at(res, R.hold + 8, 4)], C.silent_tower);
  assert.strictEqual(res.status[at(res, R.hold + 8, 4)], S.silent);
  assert.ok(res.soc[at(res, R.hold + 9, 4)] < res.soc[at(res, R.hold + 8, 4)]);
  // zone 2 has 1 h of jitter: tower lasts one hour longer
  assert.strictEqual(res.chan[at(res, R.hold + 8, 3)], C.sms);
  assert.strictEqual(res.chan[at(res, R.hold + 9, 3)], C.mesh);
  // mesh off: every zone silent when its tower fails
  const res2 = G.simulate(DATA, W, P({ cell_tower_backup_h: 8, mesh: false }), { restore: {}, ev: {} });
  assert.strictEqual(res2.chan[at(res2, R.hold + 8, 0)], C.silent_tower);
  assert.strictEqual(res2.fleet[R.hold + 9].zonesSilent, 6);
  // an isolated dropout is the "check this one" class
  const W3 = tinyWorld(); W3.homes[1].dropout = true; W3.homes[1].dropStart = 2; W3.homes[1].dropLen = 3;
  const res3 = G.simulate(DATA, W3, p, { restore: {}, ev: {} });
  assert.strictEqual(res3.chan[at(res3, R.hold + 2, 1)], C.silent_check);
  assert.strictEqual(res3.chan[at(res3, R.hold + 5, 1)], C.sms);
  // a faulted battery is silent-check and dark
  const W4 = tinyWorld(); W4.homes[1].faulty = true; W4.homes[1].faultAfter = 3;
  const res4 = G.simulate(DATA, W4, p, { restore: {}, ev: {} });
  assert.strictEqual(res4.status[at(res4, R.hold + 3, 1)], S.fault);
  assert.strictEqual(res4.chan[at(res4, R.hold + 3, 1)], C.silent_check);
  assert.strictEqual(res4.fleet[R.hold + 3].faultsActual, 1);
});

test('restoration plan: Medical Baseline first, staggered 1 h from hand + patrol, peak check without vs with Grace vs cap, planned not actual', () => {
  const W = tinyWorld();
  const res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  const plan = res.proposals.restore;
  assert.strictEqual(plan.length, 6);
  assert.strictEqual(plan[0].startH, R.hand + 10);
  assert.strictEqual(plan[0].startH, R.hold + 62, 'default planned outage matches winds ease + patrol');
  assert.strictEqual(plan[1].startH, plan[0].startH + 1);
  assert.strictEqual(plan[5].startH, plan[0].startH + 5);
  // Galahad has a Tier 1 home and more customers than Maguire: Galahad first, Maguire second
  assert.strictEqual(plan[0].circuit, 'Galahad');
  assert.strictEqual(plan[1].circuit, 'Maguire');
  assert.ok(plan.slice(2).every(p => p.t1 === 0));
  for (const p of plan) {
    assert.ok(p.withoutA > 0 && p.withA > 0 && p.capA > 0, 'peak numbers present');
    assert.ok(p.withA <= p.withoutA, 'with Grace never above without Grace');
    assert.ok(Math.abs(p.withKW - p.withA * G.KW_PER_UNIT) < 1e-6 && Math.abs(p.capKW - p.capA * G.KW_PER_UNIT) < 1e-6);
    assert.ok(Math.abs(p.reductionKW - (p.withoutKW - p.withKW)) < 1e-6);
    assert.strictEqual(p.underCap, p.withA <= p.capA + 1e-9);
    assert.ok(p.chargeStartH >= p.startH + 2 && p.chargeStartH < G.HOURS, 'recharge starts after the pickup window, inside the replay');
  }
  // the riding share actually lowers the pickup on Galahad (3 of its 4 battery homes still hold charge)
  assert.ok(plan[0].riding >= 3 && plan[0].withA < plan[0].withoutA);
  // the circuit comes back at the planned hour and stays off before it
  assert.strictEqual(res.circuits.Galahad.state[plan[0].startH - 1], 1);
  assert.strictEqual(res.circuits.Galahad.state[plan[0].startH], 2);
  // every planned restoration and recharge start is inside the window
  assert.ok(plan.every(p => p.chargeStartH < G.HOURS));
  // a longer planned outage moves the simulated restoration out with it (SCE's own estimate)
  const res2 = G.simulate(DATA, W, P({ planned_outage_h: 96 }), { restore: {}, ev: {} });
  assert.strictEqual(res2.proposals.restore[0].startH, R.hold + 96);
  assert.strictEqual(res2.circuits.Galahad.state[G.HOURS - 1], 1, 'still off at the end of the replay');
  // a longer patrol delays it the same way
  const res3 = G.simulate(DATA, W, P({ restore_patrol_h: 20 }), { restore: {}, ev: {} });
  assert.strictEqual(res3.proposals.restore[0].startH, R.hand + 20);
});

test('approval gates the recharge: held plan draws nothing from the grid, approved plan recharges Medical Baseline first', () => {
  const W = tinyWorld();
  const pending = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  const approved = G.simulate(DATA, W, P(), { restore: { Galahad: 'approved' }, ev: {} });
  const s = pending.proposals.restore[0].startH;
  const hCharge = s + 2;
  assert.ok(hCharge < G.HOURS, 'charging hour inside the window');
  assert.strictEqual(pending.circuits.Galahad.chargeKW[hCharge], 0);
  assert.ok(approved.circuits.Galahad.chargeKW[hCharge] > 0);
  assert.strictEqual(approved.status[at(approved, hCharge, 0)], G.S.restoring);
  assert.ok(approved.soc[at(approved, hCharge, 0)] > pending.soc[at(pending, hCharge, 0)]);
  assert.notDeepStrictEqual(approved.fleet[hCharge].byStatus, pending.fleet[hCharge].byStatus);
});

test('EV dispatch: a long planned outage makes a large medical home run low; a small Tier 3 EV home above 55% donates; approval adds 10 kWh next hour', () => {
  // the Galahad medical home is a 1.6x home (12.8 kWh/day in critical mode), the EV donor a 0.7x home
  const W = tinyWorld({ factors: { 0: 1.6, 2: 0.7 } });
  const p = P({ planned_outage_h: 96 });
  assert.strictEqual(p.ev_donor_min_pct, 55, 'donor threshold default is 55%');
  const res = G.simulate(DATA, W, p, { restore: {}, ev: {} });
  const ev = res.proposals.ev;
  assert.ok(ev.length >= 1, 'a proposal exists');
  const pr = ev.find(e => e.medId === 0);
  assert.ok(pr, 'Galahad medical home proposed');
  assert.ok(pr.h < G.HOURS && pr.h > R.hold + 24, `proposed inside the outage at h${pr.h}`);
  assert.strictEqual(pr.donorId, 2);
  assert.strictEqual(pr.kwh, 10);
  assert.ok(res.soc[at(res, pr.h, 0)] < cap * 0.2, 'medical home under 20% when proposed');
  assert.ok(res.soc[at(res, pr.h, 2)] >= cap * 0.55, 'donor above 55% when proposed');
  assert.ok(pr.hoursBought > 10 && pr.hoursLeft < pr.toRestore);
  const dec = { restore: {}, ev: {} }; dec.ev[pr.id] = 'approved';
  const res2 = G.simulate(DATA, W, p, dec);
  const before = res.soc[at(res, pr.h + 1, 0)], after = res2.soc[at(res2, pr.h + 1, 0)];
  assert.ok(Math.abs((after - before) - 10) < 0.01, `credit ${after - before}`);
  assert.strictEqual(res2.totals.evApproved, 1);
  // at the default 62 h the same homes need nothing
  const res3 = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  assert.strictEqual(res3.proposals.ev.length, 0);
  assert.strictEqual(res3.proposals.unmet.length, 0);
  // the real fleet: 96 h planned at the default 55% threshold produces proposals with donors found
  const pf = P({ planned_outage_h: 96 });
  const Wf = G.buildHomes(DATA, pf);
  const rf = G.simulate(DATA, Wf, pf, { restore: {}, ev: {} });
  assert.ok(rf.proposals.ev.length >= 1, `real fleet proposals at 96 h: ${rf.proposals.ev.length}`);
  assert.ok(rf.proposals.ev.every(e => e.distKm < 6 && e.kwh === 10));
  assert.strictEqual(rf.fleet[G.HOURS - 1].evProposed, rf.proposals.ev.length);
});

test('homes are deterministic and sized to the data pack', () => {
  const p = P();
  const a = G.buildHomes(DATA, p), b = G.buildHomes(DATA, p);
  assert.strictEqual(a.homes.length, 6874);
  assert.strictEqual(a.homes.length, Object.values(DATA.circuits).filter(c => c.named_oct_2026).reduce((s, c) => s + c.customers, 0));
  assert.strictEqual(a.batteries.length, b.batteries.length);
  assert.strictEqual(a.homes[100].x, b.homes[100].x);
  assert.strictEqual(a.zones.filter(z => z.starlink).length, 5);
  assert.ok(a.homes.every(h => h.circuit !== 'Nicholas'));
  const tuna = a.homes.filter(h => h.circuit === 'Tuna');
  assert.strictEqual(tuna.length, 500);
  const poly = G.bandPolygon(DATA.approx_areas.Tuna, DATA.coast, 16);
  assert.ok(tuna.every(h => G.pointInPoly([h.lon, h.lat], poly)));
});

test('planned outage shorter than the real one: the estimate is extended 24 h when it passes, budgets step down, medical homes that will not last are flagged before the Hand rung', () => {
  const p = P({ planned_outage_h: 40 });
  const Wf = G.buildHomes(DATA, p);
  const rf = G.simulate(DATA, Wf, p, { restore: {}, ev: {} });
  const cc = rf.circuits.Galahad;
  // the horizon the engine budgeted to, per hour: planned until it passes, then +24 h, then the plan start from the Hand rung
  assert.strictEqual(cc.horizonH[R.hold], R.hold + 40);
  assert.strictEqual(cc.horizonH[R.hold + 39], R.hold + 40);
  assert.strictEqual(cc.horizonH[R.hold + 40], R.hold + 64);
  assert.strictEqual(cc.replans[R.hold + 40], 1);
  assert.strictEqual(cc.replans[R.hold + 39], 0);
  assert.deepStrictEqual(cc.replanAt, [R.hold + 40]);
  assert.strictEqual(cc.horizonH[R.hand], cc.restoreH, 'from the Hand rung the horizon is the plan start');
  // rule 7 keeps a real horizon: every proposal or unmet flag has hours to restoration > 0
  const flags = rf.proposals.ev.concat(rf.proposals.unmet);
  assert.ok(flags.length > 0, 'medical homes flagged at 40 h planned');
  assert.ok(flags.every(f => f.toRestore > 0 && f.hoursLeft < f.toRestore), 'flags carry a positive horizon');
  assert.ok(flags.some(f => f.h < R.hand), 'flags are raised before the Hand rung, not only at it');
  // every medical home that runs dry before restoration was flagged first
  const flagged = new Set(flags.map(f => f.medId));
  let dry = 0, dryUnflagged = 0;
  for (const hm of Wf.batteries) {
    if (hm.tier !== 1 || hm.faulty) continue;
    const c = rf.circuits[hm.circuit];
    if (rf.soc[at(rf, c.restoreH - 1, hm.bi)] <= 0) { dry++; if (!flagged.has(hm.id)) dryUnflagged++; }
  }
  assert.ok(dry > 0 && dryUnflagged === 0, `${dry} dry medical homes, ${dryUnflagged} without a flag`);
  // modes step down at the re-plan for homes that cannot sustain their mode over the extended horizon
  const before = rf.fleet[R.hold + 39].byMode, after = rf.fleet[R.hold + 40].byMode;
  assert.ok(after[0] > before[0], `critical count ${before[0]} -> ${after[0]} at the re-plan`);
  assert.ok(rf.narrative[R.hold + 40].includes('estimate extended 24 h'));
  // at the defaults nothing is re-planned
  const r0 = G.simulate(DATA, Wf, P(), { restore: {}, ev: {} });
  assert.deepStrictEqual(r0.circuits.Galahad.replanAt, []);
  assert.strictEqual(r0.circuits.Galahad.horizonH[R.hold + 20], R.hold + 62);
});

test('after restoration with the plan pending the battery holds at the reserve floor (status standby), draws nothing, and never reads empty', () => {
  const S = G.S;
  const W = tinyWorld();
  const res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  const floor = cap * 0.2;
  for (let bi = 0; bi < 5; bi++) {
    const cc = res.circuits[W.homes[bi].circuit];
    for (let h = cc.restoreH + 2; h < G.HOURS; h++) {
      assert.strictEqual(res.status[at(res, h, bi)], S.standby, `home ${bi} h${h} status ${G.STATUS[res.status[at(res, h, bi)]]}`);
      const prev = res.soc[at(res, h - 1, bi)], now = res.soc[at(res, h, bi)];
      assert.ok(now >= Math.min(prev, floor) - 1e-6, `home ${bi} h${h} went below the floor: ${prev} -> ${now}`);
      assert.ok(now <= prev + 1e-6, 'no grid draw while pending');
    }
    assert.strictEqual(cc.chargeKW[G.HOURS - 1], 0);
  }
  const end = res.fleet[G.HOURS - 1];
  assert.strictEqual(end.byStatus[S.empty], 0);
  assert.strictEqual(end.byStatus[S.standby], 5);
  assert.ok(res.narrative[G.HOURS - 1].includes('20% floor'));
  // the real fleet: no battery on a restored circuit ends below the floor unless it was already there, and no Empty at the end
  const p = P(), Wf = G.buildHomes(DATA, p), rf = G.simulate(DATA, Wf, p, { restore: {}, ev: {} });
  assert.strictEqual(rf.fleet[G.HOURS - 1].byStatus[S.empty], 0);
  assert.ok(rf.fleet[G.HOURS - 1].socPct > 10, `fleet soc at the end ${rf.fleet[G.HOURS - 1].socPct}`);
  // an approved plan recharges and the status says so
  const ra = G.simulate(DATA, W, P(), { restore: { Galahad: 'approved' }, ev: {} });
  assert.strictEqual(ra.status[at(ra, ra.circuits.Galahad.restoreH + 2, 0)], S.restoring);
});

test('a faulted battery does not count as riding through at pickup, and faultsActual counts only the silent check-this-one homes', () => {
  const W = tinyWorld(); W.homes[1].faulty = true; W.homes[1].faultAfter = 3;
  const res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  const plan = res.proposals.restore.find(q => q.circuit === 'Galahad');
  assert.strictEqual(plan.riding, 3, `riding ${plan.riding} of 4 Galahad batteries (one faulted)`);
  const s = plan.startH;
  // pickup grid load reflects 3 riding homes, not 4
  const cc = res.circuits.Galahad, share = 3 / cc.customers;
  assert.ok(Math.abs(cc.gridA[s] - cc.baseA[s] * 1.5 * (1 - share)) < 1e-3);
  // during the outage the fault is a silent check-this-one; after restoration it reports over the internet and is no longer "really faulted" among the silent
  assert.strictEqual(res.fleet[R.hold + 3].faultsActual, 1);
  assert.strictEqual(res.fleet[R.hold + 3].faults, 1);
  assert.strictEqual(res.fleet[G.HOURS - 1].faultsActual, 0);
  assert.strictEqual(res.fleet[G.HOURS - 1].faults, 1);
});

test('hours left follow the hourly shape (walk), so a budget sized to the horizon does not trip rule 7 overnight', () => {
  const flat = new Array(24).fill(1 / 24);
  assert.ok(Math.abs(G.hoursLeftWalk(10, 8, flat, 0) - 30) < 1e-9, 'flat shape equals the flat rate');
  const prof = G.circuitProfiles(DATA).Galahad.shape;
  // at 20:00 the night ahead is light: the walk gives more hours than the flat rate
  const walk = G.hoursLeftWalk(4, 8, prof, 20), flatH = 4 / (8 / 24);
  assert.ok(walk > flatH, `walk ${walk.toFixed(1)} h vs flat ${flatH.toFixed(1)} h`);
  assert.strictEqual(G.hoursLeftWalk(0, 8, prof, 0), 0);
  // no EV trip is proposed at 20% Medical Baseline or 50% adoption at the 62 h default (the flat rate used to propose trips to homes that then reached restoration with charge left)
  for (const over of [{ medical_baseline_pct: 20 }, { adoption_pct: 50 }]) {
    const p = P(over), Wf = G.buildHomes(DATA, p), rf = G.simulate(DATA, Wf, p, { restore: {}, ev: {} });
    assert.strictEqual(rf.proposals.ev.length + rf.proposals.unmet.length, 0, `${JSON.stringify(over)}: ${rf.proposals.ev.length} proposals`);
  }
  // proposals still fire at 96 h, and their hoursLeft is the walked figure
  const p96 = P({ planned_outage_h: 96 }), W96 = G.buildHomes(DATA, p96), r96 = G.simulate(DATA, W96, p96, { restore: {}, ev: {} });
  assert.ok(r96.proposals.ev.length >= 1);
  assert.ok(r96.proposals.ev.every(e => e.hoursLeft < e.toRestore - 0.5));
});

test('narrative: the first shutoff hour is hour 1, the Hand line carries EV dispatch, the pending line names the floor', () => {
  const W = tinyWorld();
  const res = G.simulate(DATA, W, P(), { restore: {}, ev: {} });
  assert.ok(res.narrative[R.hold].startsWith('Hour 1 of the shutoff'));
  assert.ok(res.narrative[R.hold + 1].startsWith('Hour 2 of the shutoff'));
  const W2 = tinyWorld({ factors: { 0: 1.6, 2: 0.7 } });
  const r96 = G.simulate(DATA, W2, P({ planned_outage_h: 96 }), { restore: {}, ev: {} });
  assert.ok(r96.proposals.ev.length >= 1);
  assert.ok(r96.narrative[G.HOURS - 1].includes('EV dispatch'), r96.narrative[G.HOURS - 1]);
  assert.ok(res.narrative[G.HOURS - 1].includes('hold at the 20% floor'));
  // pending proposals only hold a donor briefly; an approved one holds it for a day
  const pr = r96.proposals.ev[0];
  assert.ok(pr.donorId === 2);
});

test('r2: the raised floor at Ask never lowers the reserve floor (the higher of the two applies)', () => {
  const W = tinyWorld(), p = P({ daily_use_kwh: 60, reserve_floor_pct: 50, ask_floor_pct: 20 });
  const res = G.simulate(DATA, W, p, { restore: {}, ev: {} });
  for (let h = 0; h < R.hold; h++) for (let bi = 0; bi < 5; bi++) assert.ok(res.soc[at(res, h, bi)] >= cap * 0.5 - 1e-4, `home ${bi} h${h} soc ${res.soc[at(res, h, bi)]} below the 50% reserve`);
  // the real fleet: no Tier 3 discharge below the reserve floor after its circuit is named
  const pf = P({ reserve_floor_pct: 50, ask_floor_pct: 20 }), Wf = G.buildHomes(DATA, pf), rf = G.simulate(DATA, Wf, pf, { restore: {}, ev: {} });
  let below = 0;
  for (const hm of Wf.batteries) for (let h = 1; h < R.hold; h++) { const a = rf.soc[at(rf, h - 1, hm.bi)], b = rf.soc[at(rf, h, hm.bi)]; if (b < a - 1e-6 && b < cap * 0.5 - 1e-4) below++; }
  assert.strictEqual(below, 0, `${below} discharges below the 50% reserve`);
});

test('r2: a battery spent inside the cold-load pickup window reads standby (on the grid), never islanded at 0 kWh', () => {
  const S = G.S, p = P(), Wf = G.buildHomes(DATA, p), rf = G.simulate(DATA, Wf, p, { restore: {}, ev: {} });
  let bad = 0;
  for (let h = 0; h < G.HOURS; h++) for (let bi = 0; bi < rf.N; bi++) { const i = h * rf.N + bi; if (rf.status[i] === S.islanded && rf.soc[i] <= 0) bad++; }
  assert.strictEqual(bad, 0, `${bad} home-hours islanded at 0 kWh`);
  // a tiny home that runs dry in the window: islanded while it has charge, standby the hour it is spent
  const W = tinyWorld({ factors: { 2: 1.6 } });
  const res = G.simulate(DATA, W, P({ planned_outage_h: 60 }), { restore: {}, ev: {} });
  const s = res.circuits.Galahad.restoreH;
  for (let h = s; h < s + 2; h++) { const i = at(res, h, 2); assert.ok(res.status[i] === S.islanded ? res.soc[i] > 0 : res.status[i] === S.standby || res.status[i] === S.fault, `h${h} ${G.STATUS[res.status[i]]} soc ${res.soc[i]}`); }
});

test('r2: budget modes count only homes whose circuit is still off; homes back on the grid are counted apart', () => {
  const p = P(), Wf = G.buildHomes(DATA, p), rf = G.simulate(DATA, Wf, p, { restore: {}, ev: {} });
  for (const h of [100, R.hold - 1]) assert.deepStrictEqual(rf.fleet[h].byMode, [0, 0, 0]);
  for (const h of [R.hold, 240, 270, 271, 273, 276, G.HOURS - 1]) {
    const f = rf.fleet[h];
    let off = 0, back = 0;
    for (const hm of Wf.batteries) { if (rf.circuits[hm.circuit].state[h] === 1) off++; else back++; }
    assert.strictEqual(f.byMode[0] + f.byMode[1] + f.byMode[2], off, `h${h}: modes ${f.byMode} vs ${off} still off`);
    assert.strictEqual(f.stillOff, off); assert.strictEqual(f.gridBack, back);
  }
  // no home is in "normal" at the defaults (62 h is too long for 32 kWh/day), so the row never shows a normal count after restoration begins
  assert.strictEqual(rf.fleet[273].byMode[2], 0);
  assert.ok(rf.fleet[273].gridBack > 0 && rf.fleet[273].stillOff > 0);
});

test('r2: narrative lines carry the right circuit and the post-allocation headroom', () => {
  const p = P(), Wf = G.buildHomes(DATA, p);
  const none = G.simulate(DATA, Wf, p, { restore: {}, ev: {} });
  const all = { restore: {}, ev: {} }; for (const c of G.NAMED) all.restore[c] = 'approved';
  const ra = G.simulate(DATA, Wf, p, all);
  const mw = kw => kw >= 950 ? (kw / 1000).toFixed(kw >= 9950 ? 0 : 1) + ' MW' : Math.round(kw) + ' kW';
  // Fill: headroom left = headroom - charging on the circuit charging most
  for (const h of [189, 190]) {
    let bestC = null, best = -1; for (const c of G.NAMED) { const kw = none.circuits[c].chargeKW[h]; if (kw > best) { best = kw; bestC = c; } }
    const cc = none.circuits[bestC];
    assert.ok(none.narrative[h].includes(`${bestC}: ${mw(cc.chargeKW[h])} charging, ${mw(Math.max(0, cc.headroomKW[h] - cc.chargeKW[h]))} headroom left`), none.narrative[h]);
  }
  // Fill hour with nothing to charge: the line says the fleet was already full and names what the step changes
  assert.ok(none.narrative[R.fill].includes('already full from last night') && none.narrative[R.fill].includes('held at 100% instead of arbitraging'), none.narrative[R.fill]);
  // Hand, all approved: charging and headroom summed over the approved circuits past their pickup window; headroom is never double counted
  for (const h of [272, 273, 277, 281]) {
    const f = ra.fleet[h]; let ch = 0, hd = 0; const names = [];
    for (const q of ra.proposals.restore) if (h >= q.startH + 2) { ch += ra.circuits[q.circuit].chargeKW[h]; hd += ra.circuits[q.circuit].headroomKW[h]; names.push(q.circuit); }
    const line = ra.narrative[h];
    assert.ok(line.includes(`${f.byStatus[G.S.restoring].toLocaleString()} batteries recharging, ${mw(ch)} inside ${mw(hd)} headroom on ${names.join(', ')}`), `h${h}: ${line}`);
    assert.ok(ch <= hd + 1e-6, 'charging never exceeds the headroom it is printed against');
  }
  // pickup-window hours say the batteries ride through, not that 0 hold at the floor
  assert.ok(none.narrative[270].includes('ride through the 2 h pickup window') && !none.narrative[270].includes('0 batteries'), none.narrative[270]);
  assert.ok(/\b1 circuit still off\b/.test(none.narrative[274]) && !/\b1 batteries\b/.test(ra.narrative[274]), none.narrative[274]);
  // the plan reason names only the non-zero parts
  for (const q of none.proposals.restore) { assert.ok(!q.reason.includes('dark or under'), q.reason); if (q.dark === 0) assert.ok(!q.reason.includes('dark'), q.reason); if (q.low) assert.ok(q.reason.includes(`${q.low} under 20%`), q.reason); }
  // the Hold line carries the cue to the human step
  assert.ok(none.narrative[R.hold].includes('the officer decides at Step 5'));
});

test('money: real CAISO prices give each free battery the day value at its floor, and a held battery forfeits it', () => {
  const W = tinyWorld();
  const v = DATA.prices.daily;
  assert.ok(v['10-07'] && v['10-15'], 'October 2025 daily values present');
  const real = G.simulate(DATA, W, P({ price_mode: 'caiso' }), { restore: {}, ev: {} });
  // Oct 7 (day 0): nobody is held, all five batteries at the 20% floor: savings = 5 x value at 20%
  assert.ok(Math.abs(real.fleet[23].savingsDay - 5 * v['10-07'][0]) < 1e-6, `day 0 savings ${real.fleet[23].savingsDay} vs ${5 * v['10-07'][0]}`);
  assert.ok(Math.abs(real.fleet[23].readinessDay) < 1e-9, 'no readiness cost before Watch');
  // Oct 10 (day 3, after Watch): the two Tier 1 homes are held (forfeit the 20% value), three free homes earn it
  const d3 = real.fleet[3 * 24 + 23];
  assert.ok(Math.abs(d3.savingsDay - 3 * v['10-10'][0]) < 1e-6, `day 3 savings ${d3.savingsDay}`);
  assert.ok(Math.abs(d3.readinessDay - 2 * v['10-10'][0]) < 1e-6, `day 3 readiness ${d3.readinessDay}`);
  // Oct 13 (day 6, after Ask): Tier 2 held too; the consenting Tier 3 home sits at the raised 50% floor and forfeits the difference
  const d6 = real.fleet[6 * 24 + 23];
  const free50 = v['10-13'][1], free20 = v['10-13'][0];
  assert.ok(Math.abs(d6.savingsDay - 2 * free50) < 1e-6, `day 6 savings ${d6.savingsDay} vs ${2 * free50}`);
  assert.ok(Math.abs(d6.readinessDay - (3 * free20 + 2 * (free20 - free50))) < 1e-6, `day 6 readiness ${d6.readinessDay}`);
  // the physics does not change with the price basis: same state of charge path either way
  const tou = G.simulate(DATA, W, P({ price_mode: 'tou' }), { restore: {}, ev: {} });
  for (let h = 0; h < R.hold; h += 7) for (let bi = 0; bi < 5; bi++) assert.strictEqual(real.soc[at(real, h, bi)], tou.soc[at(tou, h, bi)]);
  assert.ok(tou.fleet[23].savingsDay > 0 && Math.abs(tou.fleet[23].savingsDay - real.fleet[23].savingsDay) > 1e-3, 'the two bases differ');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
