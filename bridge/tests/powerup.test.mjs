// PowerUP bridge tests: PowerUP's Malibu replay with every order run through Interlock. Run: node --test bridge/tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as engine from '../../interlock/src/engine.mjs';
import * as packs from '../../interlock/src/packs.mjs';

const require = createRequire(import.meta.url);
const G = require('../../powerup/app/src/engine.js');
const DATA = require('../../powerup/data/data.json');
const PowerUP = require('../powerup.js');
const I = { ...engine, ...packs };

const P = G.defaultParams(DATA);
const world = G.buildHomes(DATA, P);
const approved = { restore: Object.fromEntries(G.NAMED.map((c) => [c, 'approved'])), ev: {} };
const res = PowerUP.run({ G, I, DATA, world, P, decisions: approved });
const byId = (id) => res.log.find((e) => e.order.id === id);

test('the guard never stops PowerUP: every PowerUP order runs, none held or clamped', () => {
  const s = PowerUP.powerupSummary(res.log);
  assert.ok(s.orders >= 10, `expected at least 10 PowerUP orders, got ${s.orders}`);
  assert.equal(s.held, 0);
  assert.equal(s.clamped, 0);
});

test('every malicious or unsafe order is held or clamped, and every malicious one is held', () => {
  for (const e of res.log.filter((x) => x.order.truth !== 'legit')) {
    assert.notEqual(e.verdict, 'pass', `${e.order.id} passed`);
    if (e.order.truth === 'malicious') assert.equal(e.ran, false, `${e.order.id} ran`);
  }
  assert.equal(byId('stolen-key').rung, 'hand');
  assert.ok(byId('replay').reasons.some((r) => r.code === 'REPLAY'));
  assert.ok(byId('dead-line').reasons.some((r) => r.code === 'DEAD_LINE'));
});

test("PowerUP's reserve is Interlock's floor: the utility's own top-priority event takes nothing from a Medical Baseline home PowerUP is holding", () => {
  const e = byId('sce-event');
  assert.equal(e.ran, true);
  for (const b of world.batteries.filter((b) => b.tier === 1)) assert.ok((e.perHome['b' + b.bi] || 0) <= 1e-6, `MB home b${b.bi} exported`);
  assert.ok(e.on.energyKWh > 0.7 * e.off.energyKWh, 'the safe part of the event still runs');
});

test('guard on keeps the plan: no home goes dark that PowerUP kept lit; guard off darkens Medical Baseline homes', () => {
  assert.equal(res.metrics.on.darkHomes, res.metrics.base.darkHomes);
  assert.equal(res.metrics.on.mbDarkHomeHours, res.metrics.base.mbDarkHomeHours);
  assert.ok(res.metrics.off.mbDarkHomes > 0);
  assert.ok(res.metrics.off.darkHomes > res.metrics.on.darkHomes);
});

test('guard on: zero battery-hours onto a de-energized line and no circuit over its cap; guard off: both', () => {
  assert.equal(res.exposure.on.deadLineBatteryH, 0);
  assert.equal(res.exposure.on.worstOverMW, 0);
  assert.ok(res.exposure.off.deadLineBatteryH > 0);
  assert.ok(res.exposure.off.worstOverMW > 0);
});

test('Interlock only shrinks: no home moves more, or the other way, than its order asked', () => {
  for (const e of res.log) {
    if (!e.ran) continue;
    for (const id of Object.keys(e.perHome)) {
      const asked = I.requestedKw(e.cmd, e.state.homes[id], e.order.h * 60, 60);
      const did = e.perHome[id];
      assert.ok(Math.abs(did) <= Math.abs(asked) + 1e-6, `${e.order.id} ${id}: ${did} vs ${asked}`);
      assert.ok(did * asked >= -1e-9, `${e.order.id} ${id} flipped sign`);
    }
  }
});

test('deterministic: the same inputs give the same log and outcomes', () => {
  const again = PowerUP.run({ G, I, DATA, world, P, decisions: approved });
  assert.deepEqual(again.log.map((e) => [e.order.id, e.verdict, e.rung]), res.log.map((e) => [e.order.id, e.verdict, e.rung]));
  assert.deepEqual(again.metrics, res.metrics);
});

test('a replay of an order admitted days earlier is caught once its window has closed (Interlock hardening)', () => {
  const st = { nowMin: 9000, stepMin: 60, homes: { h1: { circuit: 'c1', socKWh: 30, capacityKWh: 39.2, medical: false, loadKw: 1 } },
    circuits: { c1: { open: false, baseLoadMW: 1, importLimitMW: 5, exportCapMW: -1, otherFleetKw: 0 } }, excluded: {}, active: [], canary: {} };
  const cmd = I.signCommand({ id: 'x', source: { id: 'base-optimizer', role: 'aggregator' }, issuedAt: 1000, epoch: 42, priority: 5,
    targets: { all: true }, payload: { type: 'DISCHARGE_KW', value: 2 }, durationMin: 60 }, I.DEMO_KEYS['base-optimizer']);
  st.ledger = { seen: { x: cmd.sig }, admitted: { x: cmd.sig }, epochs: { 'base-optimizer': 42 } };
  const r = I.evaluate(cmd, st, I.getPack('sce'));
  assert.equal(r.verdict, 'hold');
  assert.ok(r.reasons.some((x) => x.code === 'REPLAY'));
});

test('without a restoration approval PowerUP sends no recharge order', () => {
  const r = PowerUP.run({ G, I, DATA, world, P, decisions: { restore: {}, ev: {} }, variants: [] });
  assert.equal(r.log.filter((e) => e.order.id.startsWith('powerup-recharge')).length, 0);
});
