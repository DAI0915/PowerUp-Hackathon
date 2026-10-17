// The "hand" rung: a person's decision really changes the run (decide() in sim.mjs, ledger checks in engine.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, signCommand, orderDigest } from '../src/engine.mjs';
import { getPack } from '../src/packs.mjs';
import { createSim, SCENARIO } from '../src/sim.mjs';

const CAP = 39.2;
const at = (h, m = 0) => h * 60 + m;
function runTo(sim, min) { while (!sim.done() && sim.S.t < min) sim.step(); return sim; }
function runOut(sim) { while (!sim.done()) sim.step(); return sim.results(); }
const STOLEN = 'stolen-key@300PM';

function smallState(soc = 10) {
  const homes = {};
  for (let i = 0; i < 4; i++) {
    const id = 'h' + String(i).padStart(4, '0');
    homes[id] = { id, circuit: 'c1', socKWh: soc, capacityKWh: CAP, maxKw: 20, medical: false, loadKw: 1 };
  }
  return { nowMin: 900, stepMin: 5, homes, circuits: { c1: { id: 'c1', open: false, baseLoadMW: 5, importLimitMW: 9, exportCapMW: -1.5, otherFleetKw: 0 } },
    ledger: { seen: {}, epochs: {}, admitted: {}, approved: {}, personApproved: {}, blocked: {} }, active: [], canary: {}, excluded: {} };
}
const forged = () => signCommand({ id: 'evil', source: { id: 'sce-drms-2', role: 'utility' }, issuedAt: 900, epoch: 1, priority: 0,
  targets: { all: true }, payload: { type: 'DISCHARGE_KW', value: 20 }, durationMin: 60 }, 'k-stolen');

test('engine: a released order passes the signature check only; the floor still clamps it', () => {
  const policy = getPack('sce');
  const c = forged();
  const st = smallState(10);
  assert.equal(evaluate(c, st, policy).rung, 'hand');
  st.ledger.personApproved[c.id] = orderDigest(c);
  st.ledger.admitted[c.id] = c.sig;
  const res = evaluate(c, st, policy);
  assert.ok(res.reasons.some((r) => r.code === 'PERSON_RELEASED' && r.rung === 'watch'));
  assert.ok(res.reasons.some((r) => r.code === 'FLOOR_CLAMP'), 'backup floor still applies');
  for (const id in res.perHome) assert.ok(st.homes[id].socKWh - res.perHome[id] * 1 >= 0.2 * CAP - 1e-6, 'never below the floor over the window');
  // the release is tied to the exact signature: a changed order is held again
  const changed = { ...c, payload: { type: 'DISCHARGE_KW', value: 15 } };
  assert.equal(evaluate(changed, st, policy).rung, 'hand');
});

test('engine: a blocked sender is held without asking a person again', () => {
  const st = smallState();
  st.ledger.blocked['sce-drms-2'] = true;
  const res = evaluate(forged(), st, getPack('sce'));
  assert.equal(res.verdict, 'hold');
  assert.equal(res.rung, 'hold');
  assert.equal(res.reasons[0].code, 'BLOCKED_SENDER');
});

test('sim: releasing the stolen-key order makes it run, still inside the floor, circuit and dead-line checks', () => {
  const sim = runTo(createSim({ guard: true, seed: 7 }), at(15, 5));
  const hand = sim.openHands().find((h) => h.id === STOLEN);
  assert.ok(hand, 'stolen-key order is waiting for a person');
  assert.equal(hand.kind, 'signature');
  assert.equal(hand.code, 'UNKNOWN_SIGNER');
  const d = sim.decide(STOLEN, 'approve');
  assert.equal(d.ok, true);
  assert.equal(sim.openHands().some((h) => h.id === STOLEN), false);
  // the released order's window (15:00-16:00) ends before circuit 3 opens; nobody is below the floor then
  assert.equal(runTo(sim, at(17)).results().scoreboard.floorBreachHomes, 0);
  const r = runOut(sim);
  const meta = r.commands.find((c) => c.id === STOLEN);
  assert.equal(meta.everRan, true, 'the released order ran');
  assert.ok(meta.kwh > 0);
  assert.equal(r.scoreboard.commandsHeld, 2);
  assert.equal(r.scoreboard.deadLineBatteryMin, 0);
  assert.equal(r.scoreboard.importOverMWmin, 0);
  assert.equal(r.scoreboard.exportOverMWmin, 0);
  assert.ok(r.log.some((e) => e.kind === 'decision' && e.id === STOLEN && e.choice === 'approve'));
  assert.ok(r.log.some((e) => e.id === STOLEN && e.reasons?.some((x) => x.code === 'PERSON_RELEASED')));
});

test('sim: rejecting blocks the unknown signer, so its next order is held at the hold rung', () => {
  const again = SCENARIO.find((e) => e.id === 'stolen-key');
  const nextArrival = (sim) => sim.S.log.filter((e) => e.phase === 'arrival' && e.id.startsWith('stolen-key@')).at(-1);
  const control = runTo(createSim({ guard: true, seed: 7 }), at(15, 30));
  control.fire(again); control.step();
  assert.equal(nextArrival(control).rung, 'hand');
  const sim = runTo(createSim({ guard: true, seed: 7 }), at(15, 5));
  assert.equal(sim.decide(STOLEN, 'reject').ok, true);
  assert.equal(sim.decide(STOLEN, 'reject').ok, false, 'a decision is taken once');
  runTo(sim, at(15, 30));
  sim.fire(again); sim.step();
  const e = nextArrival(sim);
  assert.equal(e.rung, 'hold');
  assert.equal(e.reasons[0].code, 'BLOCKED_SENDER');
});

test('sim: with reviewer "person" the installation pack waits for the dispatcher', () => {
  const eea = (r) => r.commands.find((c) => c.event === 'eea3-event');
  const waiting = runTo(createSim({ guard: true, seed: 7, pack: 'installation', reviewer: 'person' }), at(17, 25));
  const hand = waiting.openHands().find((h) => h.id.startsWith('eea3-event@'));
  assert.ok(hand && hand.kind === 'second_person' && hand.autoApproveAt === null);
  const approved = runTo(createSim({ guard: true, seed: 7, pack: 'installation', reviewer: 'person' }), at(17, 25));
  const rejected = runTo(createSim({ guard: true, seed: 7, pack: 'installation', reviewer: 'person' }), at(17, 25));
  assert.equal(approved.decide(hand.id, 'approve').ok, true);
  assert.equal(rejected.decide(hand.id, 'reject').ok, true);
  for (const s of [waiting, approved, rejected]) runTo(s, at(20, 5));
  assert.equal(eea(waiting.results()).everRan, false, 'nobody approved, so the event never ran');
  assert.ok(eea(approved.results()).kwh > 0, 'approved event ran');
  assert.ok(approved.results().scoreboard.eventMWh > 0);
  assert.equal(eea(rejected.results()).everRan, false);
  assert.ok(rejected.results().scoreboard.legitHeld >= 1, 'a rejected legit order counts as a false hold');
});
