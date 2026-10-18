// node --test pilot/app/tests/guard.test.mjs : PowerUP's orders through Interlock on the RAR8848 pilot, guard on vs off
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as engine from '../../../interlock/src/engine.mjs';
import * as packs from '../../../interlock/src/packs.mjs';

const require = createRequire(import.meta.url);
const G = require('../src/engine.js');
const DATA = require('../data.json');
const PowerUP = require('../src/bridge.js');
const I = { ...engine, ...packs };
const P = G.defaultParams(DATA);
const world = G.buildHomes(DATA, P);
const res = PowerUP.run({ G, I, DATA, world, P, decisions: { restore: { Cuthbert: 'approved' }, ev: {} } });
const { on, off } = res.metrics;

test('guard on: no battery home goes dark, Medical Baseline included, and the fleet is full at shutoff', () => {
  assert.equal(world.batteries.length, 86);
  assert.equal(on.darkHomes, 0);
  assert.equal(on.mbDarkHomes, 0);
  assert.ok(on.fleetSocAtShutoffPct > 98);
  assert.equal(res.exposure.on.deadLineBatteryH, 0);
  assert.equal(res.exposure.on.worstOverMW, 0);
});

test('guard off: the same orders leave 85 of 86 battery homes dark and overload Cuthbert at restoration', () => {
  assert.equal(off.darkHomes, 85);
  assert.equal(off.mbDarkHomes, 13);
  assert.ok(off.fleetSocAtShutoffPct < 10);
  assert.ok(res.exposure.off.deadLineBatteryH > 0);
  assert.equal(res.exposure.off.worstOverCircuit, 'Cuthbert');
  assert.ok(res.exposure.off.worstOverMW > 1.5);
});

test('the guard never stops one of PowerUP\'s own orders', () => {
  const s = PowerUP.powerupSummary(res.log);
  assert.equal(s.held + s.clamped, 0);
  assert.equal(s.passed, s.orders);
});
