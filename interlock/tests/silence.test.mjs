import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySilence, checkBehaviour } from '../src/silence.mjs';
import { getPack } from '../src/packs.mjs';

const policy = getPack('sce');
const NOW = 18 * 3600;

function fleet() {
  const homes = [];
  for (let i = 0; i < 200; i++) homes.push({ id: 'h' + i, circuit: i < 100 ? 'c1' : 'c2', tower: `t${Math.floor(i / 50)}`, isp: i % 2 ? 'isp-A' : 'isp-B', firmware: i % 3 ? 'v2.2' : 'v2.3' });
  const tel = {};
  for (const h of homes) tel[h.id] = { lastHeartbeatSec: NOW - 20, socPct: 60 };
  return { homes, tel };
}

test('heartbeat older than 90 s is silent even if nothing else is wrong', () => {
  const { homes, tel } = fleet();
  tel.h7.lastHeartbeatSec = NOW - 91;
  const r = classifySilence(NOW, homes, tel, { circuits: {} }, policy);
  assert.equal(r.silentCount, 1);
  assert.equal(r.silent[0].cls, 'unsure');
  assert.equal(r.silent[0].rung, 'ask');
});

test('tower cluster -> not_talking', () => {
  const { homes, tel } = fleet();
  for (const h of homes) if (h.tower === 't1' && Number(h.id.slice(1)) % 10 !== 0) tel[h.id].lastHeartbeatSec = NOW - 300;
  const r = classifySilence(NOW, homes, tel, { circuits: { c1: { open: false }, c2: { open: false } } }, policy);
  assert.ok(r.silent.length >= 40);
  assert.ok(r.silent.every((s) => s.cls === 'not_talking' && s.domain === 'tower'));
});

test('open-circuit cluster -> tripped', () => {
  const { homes, tel } = fleet();
  for (const h of homes) if (h.circuit === 'c2' && Number(h.id.slice(1)) % 4 !== 0) tel[h.id].lastHeartbeatSec = NOW - 300;
  const r = classifySilence(NOW, homes, tel, { circuits: { c2: { open: true } } }, policy);
  assert.equal(r.byClass.tripped, 75);
  assert.equal(r.byClass.not_talking, 0);
});

test('isolated faulted unit -> broken (hand); deep discharge -> broken', () => {
  const { homes, tel } = fleet();
  tel.h3 = { lastHeartbeatSec: NOW - 400, socPct: 55, faultCode: 'BMS_F17', faultAtSec: NOW - 420 };
  tel.h150 = { lastHeartbeatSec: NOW - 400, socPct: 1 };
  const r = classifySilence(NOW, homes, tel, { circuits: {} }, policy);
  const by = Object.fromEntries(r.silent.map((s) => [s.homeId, s]));
  assert.equal(by.h3.cls, 'broken');
  assert.equal(by.h3.rung, 'hand');
  assert.equal(by.h150.cls, 'broken');
});

function samplesFor(homes, stuckIds) {
  const s = {};
  for (const h of homes) {
    const arr = [];
    let soc = 30;
    for (let k = 0; k < 4; k++) {
      arr.push({ tSec: NOW + k * 300, socKWh: stuckIds.has(h.id) ? 30 : soc, cmdKw: 10, deliveredKw: 10 });
      soc -= 10 * 300 / 3600;
    }
    s[h.id] = arr;
  }
  return s;
}

test('stuck-SOC cohort -> cohort hold; a single liar -> watch', () => {
  const { homes } = fleet();
  const cohort = homes.filter((h) => h.firmware === 'v2.3' && h.circuit === 'c2');
  const stuck = new Set(cohort.slice(0, Math.ceil(cohort.length * 0.8)).map((h) => h.id));
  stuck.add('h1'); // one v2.2 unit on c1
  const r = checkBehaviour(homes, samplesFor(homes, stuck), policy);
  const held = r.cohorts.find((c) => c.key === 'v2.3/c2');
  assert.equal(held.action, 'hold');
  for (const h of cohort) assert.ok(r.heldHomes.has(h.id));
  assert.ok(r.watchHomes.has('h1'));
  assert.ok(!r.heldHomes.has('h1'));
  assert.ok(r.flags.some((f) => f.kind === 'stuck_soc'));
});
