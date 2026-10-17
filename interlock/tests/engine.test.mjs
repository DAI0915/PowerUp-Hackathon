import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, signCommand, lastSafePlan, lastSafePlanKw, floorKWh, requestedKw } from '../src/engine.mjs';
import { getPack, DEMO_KEYS } from '../src/packs.mjs';
import { mulberry32 } from '../src/sim.mjs';

const CAP = 39.2;

function makeState({ n = 40, circuits = 2, soc = 30, medicalEvery = 0, open = [], baseMW = 8, limitMW = 9, capMW = -1.5, nowMin = 1040 } = {}) {
  const homes = {};
  for (let i = 0; i < n; i++) {
    const id = 'h' + String(i).padStart(4, '0');
    homes[id] = { id, circuit: 'c' + ((i % circuits) + 1), socKWh: typeof soc === 'function' ? soc(i) : soc, capacityKWh: CAP, maxKw: 20,
      medical: medicalEvery ? i % medicalEvery === 0 : false, loadKw: 2.5 };
  }
  const cs = {};
  for (let c = 1; c <= circuits; c++) cs['c' + c] = { id: 'c' + c, open: open.includes('c' + c), baseLoadMW: baseMW, importLimitMW: limitMW, exportCapMW: capMW, otherFleetKw: 0 };
  return { nowMin, stepMin: 5, homes, circuits: cs, ledger: { seen: {}, epochs: { 'sce-drms': 7, 'base-optimizer': 42 }, admitted: {}, approved: {} }, active: [], canary: {}, excluded: {} };
}

const SRC = { utility: { id: 'sce-drms', role: 'utility' }, optimizer: { id: 'base-optimizer', role: 'aggregator' }, market: { id: 'caiso-market', role: 'market' } };
function cmd(over = {}, who = 'optimizer', key) {
  const base = { id: 'cmd-' + Math.random().toString(36).slice(2, 8), source: SRC[who], issuedAt: 1040, epoch: who === 'utility' ? 7 : 42, priority: who === 'utility' ? 0 : 5,
    targets: { all: true }, payload: { type: 'DISCHARGE_KW', value: 5 }, durationMin: 60, ...over };
  return signCommand(base, key ?? DEMO_KEYS[base.source.id]);
}
const noCanary = (p) => ({ ...p, canaryHomes: 1e9, canaryMW: 1e9 });

test('monotonicity: never larger, never sign-flipped, never created (2,000 seeded random commands)', () => {
  const rng = mulberry32(12345);
  const policy = getPack('sce');
  const types = ['DISCHARGE_KW', 'CHARGE_KW', 'EXPORT_KW', 'SOC_TARGET', 'IDLE'];
  const pick = (a) => a[Math.floor(rng() * a.length)];
  for (let k = 0; k < 2000; k++) {
    const st = makeState({ n: 30, circuits: 3, soc: () => rng() * CAP, medicalEvery: 4, open: rng() < 0.2 ? ['c2'] : [], baseMW: 0.2 + rng() * 9, limitMW: 9, capMW: -0.5 });
    for (const c of Object.values(st.circuits)) c.otherFleetKw = (rng() - 0.5) * 400;
    if (rng() < 0.3) st.excluded['h0003'] = 'not talking (tower)';
    const who = pick(['optimizer', 'utility', 'market']);
    const targets = pick([{ all: true }, { circuits: ['c1'] }, { homes: ['h0001', 'h0005', 'h0007'] }, { circuits: ['c2', 'c3'] }]);
    const c = cmd({ id: 'r' + k, targets, payload: { type: pick(types), value: Math.round(rng() * 40) }, durationMin: 5 + Math.floor(rng() * 300),
      priority: who === 'utility' ? Math.floor(rng() * 3) : 3 + Math.floor(rng() * 7) }, who, rng() < 0.1 ? 'wrong-key' : undefined);
    if (rng() < 0.3) st.active.push(cmd({ id: 'hi' + k, priority: 0, targets: { circuits: ['c1'] } }, 'utility'));
    if (rng() < 0.3) st.canary[c.id] = { stage: Math.floor(rng() * 3), behaved: rng() < 0.9 };
    const res = evaluate(c, st, policy);
    const tset = new Set(Object.keys(res.requested));
    for (const [id, exe] of Object.entries(res.perHome)) {
      const req = res.requested[id] ?? 0;
      assert.ok(tset.has(id), `home ${id} not targeted but present`);
      assert.ok(Math.abs(exe) <= Math.abs(req) + 1e-9, `enlarged: ${exe} vs ${req} (${c.payload.type})`);
      assert.ok(exe * req >= -1e-12, `sign flipped: ${exe} vs ${req}`);
      if (Math.abs(req) < 1e-12) assert.equal(Math.abs(exe) < 1e-12, true, 'created from nothing');
    }
    for (const id of Object.keys(st.homes)) if (!tset.has(id)) assert.equal(res.perHome[id] ?? 0, 0);
  }
});

test('unknown signer -> hold + hand', () => {
  const st = makeState();
  const c = signCommand({ id: 'evil', source: { id: 'sce-drms-2', role: 'utility' }, issuedAt: 1040, epoch: 1, priority: 0, targets: { all: true },
    payload: { type: 'DISCHARGE_KW', value: 20 }, durationMin: 60 }, 'k-stolen');
  const res = evaluate(c, st, getPack('sce'));
  assert.equal(res.verdict, 'hold');
  assert.equal(res.rung, 'hand');
  assert.equal(res.reasons[0].code, 'UNKNOWN_SIGNER');
  assert.equal(res.stats.kwExecuted, 0);
});

test('tampered command (bad signature) -> hold + hand', () => {
  const c = cmd();
  const tampered = { ...c, payload: { type: 'DISCHARGE_KW', value: 20 } };
  const res = evaluate(tampered, makeState(), getPack('sce'));
  assert.equal(res.verdict, 'hold');
  assert.equal(res.rung, 'hand');
  assert.equal(res.reasons[0].code, 'BAD_SIGNATURE');
});

test('replay and stale epoch -> hold', () => {
  const policy = getPack('sce');
  const st = makeState();
  const c = cmd({ id: 'once' });
  st.ledger.seen['once'] = c.sig;
  const r1 = evaluate(c, st, policy);
  assert.equal(r1.verdict, 'hold');
  assert.ok(r1.reasons.some((r) => r.code === 'REPLAY'));
  const st2 = makeState();
  const old = cmd({ id: 'old-epoch', epoch: 41 });
  const r2 = evaluate(old, st2, policy);
  assert.equal(r2.verdict, 'hold');
  assert.ok(r2.reasons.some((r) => r.code === 'STALE_EPOCH'));
  const stale = cmd({ id: 'stale', issuedAt: 420 });
  const r3 = evaluate(stale, makeState(), policy);
  assert.equal(r3.verdict, 'hold');
  assert.ok(r3.reasons.some((r) => r.code === 'STALE'));
});

test('SOC_TARGET 5% clamps at 20% (50% for medical homes) over the whole window', () => {
  const policy = noCanary(getPack('sce'));
  const st = makeState({ n: 4, circuits: 1, soc: 30, medicalEvery: 2, baseMW: 5 });
  const c = cmd({ id: 'soc5', payload: { type: 'SOC_TARGET', value: 5 }, durationMin: 300, issuedAt: 1040 });
  st.ledger.admitted[c.id] = c.sig;
  for (let t = 1040; t < 1340; t += 5) {
    st.nowMin = t;
    const res = evaluate(c, st, policy);
    for (const [id, kw] of Object.entries(res.perHome)) st.homes[id].socKWh -= kw * 5 / 60;
  }
  for (const h of Object.values(st.homes)) {
    const floor = h.medical ? 0.5 * CAP : 0.2 * CAP;
    assert.ok(h.socKWh >= floor - 1e-6, `${h.id} below floor: ${h.socKWh}`);
    assert.ok(Math.abs(h.socKWh - floor) < 0.05, `${h.id} should end near its floor ${floor}, got ${h.socKWh}`);
  }
  const first = evaluate(cmd({ id: 'soc5b', payload: { type: 'SOC_TARGET', value: 5 }, durationMin: 300 }), makeState({ n: 2, circuits: 1, soc: 30, medicalEvery: 2 }), policy);
  assert.ok(first.reasons.some((r) => r.code === 'SOC_TARGET_RAISED'));
  assert.equal(first.rung, 'slow');
});

test('export on an open circuit is zero (dead line)', () => {
  const st = makeState({ n: 20, circuits: 2, open: ['c2'] });
  const c = cmd({ id: 'mkt', payload: { type: 'EXPORT_KW', value: 10 }, targets: { circuits: ['c2'] }, priority: 7 }, 'market');
  const res = evaluate(c, st, getPack('sce'));
  for (const id of Object.keys(res.perHome)) assert.equal(res.perHome[id], 0);
  assert.equal(res.verdict, 'hold');
  assert.ok(res.reasons.some((r) => r.code === 'DEAD_LINE'));
  assert.equal(res.rung, 'hold');
});

test('charge-all is clamped so circuit load stays within the import limit', () => {
  const st = makeState({ n: 1000, circuits: 2, soc: 10, baseMW: 8, limitMW: 9 });
  const c = cmd({ id: 'chg', payload: { type: 'CHARGE_KW', value: 20 } });
  const res = evaluate(c, st, noCanary(getPack('sce')));
  for (const cid of ['c1', 'c2']) {
    let kw = 0;
    for (const [id, k] of Object.entries(res.perHome)) if (st.homes[id].circuit === cid) kw += k;
    const net = 8 - kw / 1000;
    assert.ok(net <= 9 + 1e-9, `${cid} net ${net} MW over limit`);
    assert.ok(net > 8.99, 'should use the headroom, not hold everything');
  }
  assert.equal(res.verdict, 'clamp');
  assert.ok(res.reasons.some((r) => r.code === 'IMPORT_LIMIT'));
});

test('utility emergency passes as a 1% / 10% / 100% canary', () => {
  const policy = getPack('sce');
  const st = makeState({ n: 2000, circuits: 4, soc: 36, baseMW: 8, limitMW: 30 });
  const c = cmd({ id: 'eea3', payload: { type: 'EXPORT_KW', value: 8 }, durationMin: 160 }, 'utility');
  const expect = [20, 200, 2000];
  for (let stage = 0; stage < 3; stage++) {
    st.canary[c.id] = { stage, behaved: true };
    const res = evaluate(c, st, policy);
    assert.equal(res.stats.homesTouched, expect[stage], `stage ${stage}`);
    assert.equal(res.verdict, stage < 2 ? 'canary' : 'pass');
  }
  st.canary[c.id] = { stage: 1, behaved: false, note: 'test' };
  const bad = evaluate(c, st, policy);
  assert.equal(bad.verdict, 'hold');
  assert.equal(bad.rung, 'hand');
});

test('precedence: a higher-priority utility command wins over the market for the same homes', () => {
  const st = makeState({ n: 10, circuits: 1 });
  st.active.push(cmd({ id: 'util', payload: { type: 'EXPORT_KW', value: 8 } }, 'utility'));
  const res = evaluate(cmd({ id: 'mk', priority: 7, payload: { type: 'CHARGE_KW', value: 5 } }, 'market'), st, getPack('sce'));
  assert.equal(res.stats.homesTouched, 0);
  assert.ok(res.reasons.some((r) => r.code === 'SUPERSEDED'));
});

test('two-person rule and role allow-list (installation pack)', () => {
  const inst = getPack('installation');
  const st = makeState({ n: 10, circuits: 1 });
  const vend = signCommand({ id: 'v1', source: { id: 'vendor-cloud', role: 'vendor' }, issuedAt: 1040, epoch: 1, priority: 5, targets: { all: true },
    payload: { type: 'DISCHARGE_KW', value: 5 }, durationMin: 60 }, DEMO_KEYS['vendor-cloud']);
  assert.equal(evaluate(vend, st, inst).verdict, 'hold');
  const util = cmd({ id: 'u1', payload: { type: 'EXPORT_KW', value: 2 } }, 'utility');
  const r = evaluate(util, st, inst);
  assert.equal(r.verdict, 'escalate');
  assert.equal(r.rung, 'hand');
  st.ledger.approved['u1'] = true;
  assert.notEqual(evaluate(util, st, inst).verdict, 'escalate');
});

test('last safe plan: self-consumption only, never exports, keeps the floor', () => {
  const policy = getPack('sce');
  const home = { id: 'x', socKWh: 20, capacityKWh: CAP, maxKw: 20, medical: false };
  const plan = lastSafePlan(home, policy, 1100);
  assert.equal(plan.maxExportKw, 0);
  assert.equal(plan.minSocKWh, floorKWh(home, policy));
  assert.ok(plan.expiresAtMin > 1100);
  assert.equal(lastSafePlanKw(plan, 20, 3), 3);                       // serves load
  assert.ok(lastSafePlanKw(plan, plan.minSocKWh + 0.1, 3) <= 0.1 * 12 + 1e-9); // stops at floor
  assert.ok(lastSafePlanKw(plan, 5, 3) < 0);                         // recharges below floor
  assert.equal(requestedKw({ payload: { type: 'IDLE' } }, home, 0), 0);
});
