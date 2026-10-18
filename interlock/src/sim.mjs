// Deterministic replay of an ordinary evening on the RAR8848 pilot: Wednesday Oct 14, 2026, the evening before SCE's
// shutoff (power off Oct 15, 4 PM) and the Bryson Fire, on the 456 homes behind SCE switch RAR8848 on the Cuthbert circuit.
// Loads are REAL in shape (Cuthbert, October 2024), scaled to the branch (ASSUMED). The fleet, the chaos and the utility
// event are SIMULATED; prices are ASSUMED SCE TOU (see ASSUMPTIONS). Pure ES module, no I/O.
import circuitsData from '../data/circuits.mjs';
import { evaluate, signCommand, requestedKw, floorKWh, lastSafePlan, lastSafePlanKw, fmtTime, BASE_CORE, maxRung, orderDigest } from './engine.mjs';
import { classifySilence, checkBehaviour } from './silence.mjs';
import { getPack, PACKS, DEMO_KEYS } from './packs.mjs';

export const DAY = { date: '2026-10-14', weekday: 'Wednesday', startMin: 12 * 60, endMin: 22 * 60, stepMin: 5 };

const BRANCH = circuitsData.circuits[0];
export const FACTS = { // REAL (SCE PSPS records, the October 2026 Malibu shutoff timeline in pilot/app/data.json)
  circuit: 'Cuthbert', substation: 'Latigo', switch: 'RAR8848', branchHomes: BRANCH.homes, circuitCustomers: BRANCH.circuitCustomers,
  namedOn: '2026-10-12', powerOff: '2026-10-15 16:00', fire: { name: 'Bryson Fire', started: '2026-10-15 16:41' },
  wholesale: circuitsData.wholesale,
};
// The one utility event of the evening: SIMULATED (no emergency was called on Oct 14, 2026).
export const EVENT = { id: 'sce-event', startMin: 18 * 60, endMin: 20 * 60, label: 'SIMULATED' };

export const ASSUMPTIONS = {
  homes: { value: 189, label: 'ASSUMED (the pilot: our 160 free Base Core batteries plus 29 home-owned)' },
  ourBatteries: { value: 160, label: 'ASSUMED (the pilot plan)' }, homeOwned: { value: 29, label: 'ASSUMED (modelled at Base Core spec, as in the pilot app)' },
  medicalHomes: { value: 16, label: 'ASSUMED (the pilot: free batteries go to Medical Baseline homes first)' },
  branchHomes: { value: BRANCH.homes, label: 'REAL (SCE PSPS record: RAR8848 cut 456 customers)' },
  capacityKWh: { value: 39.2, label: 'REAL (Base Core)' }, maxKw: { value: 20, label: 'REAL (Base Core)' },
  noonSocPct: { value: '60-90', label: 'SIMULATED (seeded)' },
  homeKWhPerDay: { value: 32, label: 'REAL (SCE usage by ZIP: Malibu 90265 averaged about 32 kWh a day in Oct 2025)' },
  touPeak: { value: 0.60, label: 'ASSUMED (SCE TOU-D-4-9PM on-peak 4-9 PM, about $0.60 in 2025, as in the pilot)' },
  touOff: { value: 0.30, label: 'ASSUMED (as in the pilot)' },
  eventPay: { value: 2.0, label: 'REAL rate (CPUC ELRP pays $2/kWh exported); the event itself is SIMULATED' },
  exportCredit: { value: 'same as TOU price', label: 'ASSUMED (simplification; NBT export credits differ)' },
  roundTrip: { value: 1.0, label: 'ASSUMED (losses ignored)' },
  criticalLoadKw: { value: 0.8, medical: 1.5, label: 'ASSUMED (critical-load backup draw)' },
  backupHoursTarget: { value: 8, label: 'ASSUMED' },
  firmwareMix: { value: 'v2.2 70% / v2.3 30%', label: 'SIMULATED' },
};

const TOU = (min) => (min >= 16 * 60 && min < 21 * 60 ? 0.60 : 0.30);
const EVENT_PAY = 2.0;
const HOME_KWH_DAY = 32;
const CRIT_KW = 0.8, CRIT_KW_MED = 1.5, BACKUP_H = 8;
const BLIP_P = 0.0003; // per home-step chance of an isolated comms blip (SIMULATED)

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the chaos schedule (SIMULATED, modelled on real incident types). One array; the UI can fire entries. ----------
// signer: optimizer | utility | market | attacker. truth: legit | unsafe | malicious (ground truth for scoring).
const B = BRANCH.id;
export const SCENARIO = [
  { at: 14 * 60, id: 'price-glitch', kind: 'command', truth: 'unsafe', signer: 'optimizer', expect: 'circuit',
    title: 'Price-feed glitch', story: 'A bad price tick makes our optimizer order all 189 batteries to charge at full power, 3.8 MW on a branch that peaks under 1 MW.',
    command: { priority: 5, targets: { all: true }, payload: { type: 'CHARGE_KW', value: 20 }, durationMin: 30 } },
  { at: 15 * 60, id: 'stolen-key', kind: 'command', truth: 'malicious', signer: 'attacker', expect: 'auth',
    title: 'Stolen key', story: 'Someone signs a fleet-wide full discharge with a key that is not on the trust list, posing as SCE, the day before the shutoff.',
    source: { id: 'sce-drms-2', role: 'utility' }, key: 'k-stolen-0000',
    command: { priority: 0, targets: { all: true }, payload: { type: 'DISCHARGE_KW', value: 20 }, durationMin: 60 } },
  { at: 15 * 60 + 30, id: 'replay', kind: 'command', truth: 'malicious', signer: 'replay', expect: 'freshness',
    title: 'Replay', story: 'A captured 7 AM SCE test order is re-sent, with its old epoch and valid signature.',
    replayOf: 'sce-0700-test' },
  { at: 16 * 60 + 15, id: 'bad-forecast', kind: 'command', truth: 'unsafe', signer: 'optimizer', expect: 'floor',
    title: 'Bad forecast', story: 'A broken forecast tells our optimizer to drain every battery to 5% by 9 PM, the night before the power goes off.',
    command: { priority: 5, targets: { all: true }, payload: { type: 'SOC_TARGET', value: 5 }, durationMin: 300 } },
  { at: 16 * 60 + 30, id: 'circuit-open', kind: 'grid', truth: 'grid', expect: 'circuit',
    title: 'SCE opens RAR8848', story: 'SCE opens switch RAR8848 for 45 minutes of switching ahead of tomorrow\'s shutoff; the 456 homes behind it island.',
    action: { type: 'openCircuit', circuit: B, untilMin: 17 * 60 + 15, silentFrac: 0.7 } },
  { at: 16 * 60 + 30, id: 'market-export', kind: 'command', truth: 'unsafe', signer: 'market', expect: 'circuit',
    title: 'Market export on a dead line', story: 'A market award asks the branch to export 10 kW per home while RAR8848 is open.',
    command: { priority: 7, targets: { circuits: [B] }, payload: { type: 'EXPORT_KW', value: 10 }, durationMin: 30 } },
  { at: EVENT.startMin, id: EVENT.id, kind: 'command', truth: 'legit', signer: 'utility', expect: 'ramp',
    title: 'SCE flex event', story: 'Valid, signed, priority 0: export 3 kW per home from 6 to 8 PM. No emergency was called that evening; this one is simulated.',
    command: { priority: 0, targets: { all: true }, payload: { type: 'EXPORT_KW', value: 3 }, durationMin: EVENT.endMin - EVENT.startMin } },
  { at: 18 * 60 + 15, id: 'tower-drop', kind: 'comms', truth: 'not_talking', expect: 'silence',
    title: 'Cell tower drops', story: 'The cell tower serving most of the branch goes down; about 80 batteries go quiet at once.',
    action: { type: 'towerDrop', tower: `${B}-a`, untilMin: 19 * 60 } },
  { at: 18 * 60 + 45, id: 'stuck-soc', kind: 'device', truth: 'lying', expect: 'behaviour',
    title: 'Stuck-SOC bug', story: 'Most v2.3 units on the branch keep reporting the same SOC while they export.',
    action: { type: 'stuckSoc', firmware: 'v2.3', circuit: B, frac: 0.8 } },
  { at: 19 * 60, id: 'bms-fault', kind: 'device', truth: 'broken', expect: 'silence',
    title: 'BMS fault', story: 'One battery behind RAR8848 reports a BMS fault and goes silent.',
    action: { type: 'bmsFault', circuit: B } },
  { at: 20 * 60 + 5, id: 'rebound', kind: 'command', truth: 'unsafe', signer: 'optimizer', expect: 'circuit',
    title: 'Rebound after the event', story: 'Right after the event our optimizer orders every battery to recharge at full power, 3.8 MW on the branch.',
    command: { priority: 5, targets: { all: true }, payload: { type: 'CHARGE_KW', value: 20 }, durationMin: 60 } },
];

// ---------- fleet: 189 battery homes behind RAR8848 (160 ours, 29 home-owned, 16 Medical Baseline) ----------
function buildFleet(seed, circuits) {
  const rng = mulberry32(seed);
  const homes = [];
  const N = ASSUMPTIONS.homes.value, OURS = ASSUMPTIONS.ourBatteries.value, MED = ASSUMPTIONS.medicalHomes.value;
  // free batteries go to Medical Baseline homes first: 16 of our 160, picked by a seeded shuffle
  const order = Array.from({ length: OURS }, (_, i) => i);
  const mr = mulberry32(seed * 13 + 1);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(mr() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const medical = new Set(order.slice(0, MED));
  const c = circuits[0];
  for (let i = 0; i < N; i++) {
    const tr = rng();
    homes.push({
      id: 'h' + String(i).padStart(4, '0'), idx: i, circuit: c.id,
      owner: i < OURS ? 'ours' : 'home',
      tower: `${c.id}-${tr < 0.45 ? 'a' : tr < 0.8 ? 'b' : 'c'}`,
      isp: rng() < 0.55 ? 'isp-A' : 'isp-B',
      firmware: rng() < 0.7 ? 'v2.2' : 'v2.3',
      medical: medical.has(i),
      soc0: (0.6 + 0.3 * rng()) * BASE_CORE.capacityKWh,
      loadScale: 0.75 + 0.5 * rng(),
      capacityKWh: BASE_CORE.capacityKWh, maxKw: BASE_CORE.maxKw,
    });
  }
  return { homes, rng };
}

function circuitShapes(circuits) {
  const shapes = {};
  for (const c of circuits) {
    const tot = c.hourly.reduce((s, h) => s + h.maxMW, 0);
    shapes[c.id] = c.hourly.map((h) => h.maxMW / tot);
  }
  return shapes;
}

// ---------- the simulator ----------
// reviewer: 'auto' (default) models the second person as approving every authenticated fleet-wide order after
// policy.humanDelayMin; 'person' leaves those orders waiting until decide() is called.
export function createSim({ guard = true, seed = 7, pack = 'sce', strictness = null, legitOnly = false, scenario = SCENARIO, circuits = circuitsData.circuits, reviewer = 'auto' } = {}) {
  const policy = getPack(pack, strictness || {});
  const promise = PACKS.sce; // the member backup promise (20% / 50% medical) used for cross-pack scoring
  const { homes, rng } = buildFleet(seed, circuits);
  const N = homes.length;
  const shapes = circuitShapes(circuits);
  const homeMap = {};
  for (const h of homes) homeMap[h.id] = { id: h.id, circuit: h.circuit, socKWh: h.soc0, capacityKWh: h.capacityKWh, maxKw: h.maxKw, medical: h.medical, loadKw: 0 };
  const circ = {};
  for (const c of circuits) circ[c.id] = { id: c.id, name: c.name, substation: c.substation, open: false, openUntil: 0,
    baseLoadMW: 0, importLimitMW: c.importLimitMW, exportCapMW: c.exportCapMW, staticImportMW: c.importLimitMW, staticExportMW: c.exportCapMW, otherFleetKw: 0, hourly: c.hourly };

  const optSrc = policy.optimizerSource;
  const keyOf = (id) => DEMO_KEYS[id];
  let seq = 0;
  const mk = (source, key, body, at) => signCommand({ id: body.id, source, issuedAt: at, epoch: body.epoch, seq: ++seq,
    priority: body.priority, targets: body.targets, payload: body.payload, durationMin: body.durationMin }, key);

  // morning history (before noon), for replay detection and epochs
  const morning = [mk({ id: 'sce-drms', role: 'utility' }, keyOf('sce-drms'),
    { id: 'sce-0700-test', epoch: 6, priority: 1, targets: { all: true }, payload: { type: 'DISCHARGE_KW', value: 15 }, durationMin: 60 }, 7 * 60)];
  const ledger = { seen: {}, epochs: { [optSrc.id]: 42, 'sce-drms': 7, 'caiso-market': 3 }, admitted: {}, approved: {}, personApproved: {}, blocked: {} };
  for (const m of morning) ledger.seen[m.id] = m.sig;

  // baseline optimizer (plain rule, stand-in for our fleet's own daily policy)
  const loadKw = (h, min) => HOME_KWH_DAY * shapes[h.circuit][Math.floor(min / 60) % 24] * h.loadScale;
  const baseline = [{ at: 12 * 60, id: 'opt-noon-charge', kind: 'command', truth: 'legit', signer: 'optimizer', baseline: true,
    title: 'Optimizer: midday charge', command: { priority: 5, targets: { all: true }, payload: { type: 'CHARGE_KW', value: 3 }, durationMin: 240 } }];
  for (const c of circuits) {
    const hs = homes.filter((h) => h.circuit === c.id);
    let s = 0;
    for (let m = 16 * 60; m < 21 * 60; m += 60) for (const h of hs) s += loadKw(h, m);
    const avg = Math.round((s / (5 * hs.length)) * 10) / 10;
    baseline.push({ at: 16 * 60, id: `opt-evening-${c.id}`, kind: 'command', truth: 'legit', signer: 'optimizer', baseline: true,
      title: `Optimizer: cover evening load behind ${c.switch || c.id}`, command: { priority: 5, targets: { circuits: [c.id] }, payload: { type: 'DISCHARGE_KW', value: avg }, durationMin: 300 } });
  }
  const timeline = [...baseline, ...scenario.filter((e) => !legitOnly || e.kind !== 'command' || e.truth === 'legit')]
    .map((e, i) => ({ ...e, order: i })).sort((a, b) => a.at - b.at || (a.baseline ? 0 : 1) - (b.baseline ? 0 : 1) || a.order - b.order);

  const S = {
    guard, seed, pack, policy, homes, homeMap, circ, t: DAY.startMin, step: DAY.stepMin, timeline, fired: new Set(),
    trueSoc: Float64Array.from(homes, (h) => h.soc0), reported: Float64Array.from(homes, (h) => h.soc0), est: Float64Array.from(homes, (h) => h.soc0),
    hb: Float64Array.from(homes, () => DAY.startMin * 60 - 10), blipUntil: new Float64Array(N), towerDown: null,
    silentCircuit: new Set(), stuck: new Map(), faulted: new Set(), fault: {}, samples: {}, lastWinner: new Array(N).fill(null),
    lastKw: new Float64Array(N), active: [], ledger, canary: {}, pending: [], cmdMeta: {}, lastEvalSig: {},
    log: [], series: [], excluded: {}, cls: {}, handed: {},
    m: { floorBreach: new Set(), floorBreachMin: 0, promiseBreach: new Set(), promiseBreachMin: 0, importOverMWmin: 0, exportOverMWmin: 0,
      deadLineBatteryMin: 0, legitCmdRevenue: 0, belowPromiseValue: 0, touRevenue: 0, eventRevenue: 0, eventKWh: 0, lowBackup8pm: null, fallbackHomeMin: 0,
      confusion: {}, rungCounts: { none: 0, watch: 0, ask: 0, slow: 0, hold: 0, hand: 0 } },
  };
  const engineState = () => ({ nowMin: S.t, stepMin: S.step, homes: homeMap, circuits: circ, ledger: S.ledger,
    active: S.active.map((a) => a.cmd), canary: S.canary, excluded: S.excluded });

  function signerFor(e) {
    if (e.signer === 'optimizer') return [optSrc, keyOf(optSrc.id), S.ledger.epochs[optSrc.id] ?? 1];
    if (e.signer === 'utility') return [{ id: 'sce-drms', role: 'utility' }, keyOf('sce-drms'), 7];
    if (e.signer === 'market') return [{ id: 'caiso-market', role: 'market' }, keyOf('caiso-market'), 3];
    return [e.source, e.key, 1];
  }

  function makeCommand(e) {
    if (e.replayOf) return morning.find((m) => m.id === e.replayOf);
    const [source, key, epoch] = signerFor(e);
    return mk(source, key, { id: `${e.id}@${fmtTime(e.at).replace(/[: ]/g, '')}`, epoch, ...e.command }, e.at);
  }

  function logEntry(entry) {
    S.log.push(entry);
    if (entry.rung) S.m.rungCounts[entry.rung] = (S.m.rungCounts[entry.rung] || 0) + 1;
  }

  function applyAction(e) {
    const a = e.action;
    if (a.type === 'openCircuit') {
      const c = S.circ[a.circuit];
      c.open = true; c.openUntil = a.untilMin;
      const r = mulberry32(S.seed * 31 + 3);
      for (const h of homes) if (h.circuit === a.circuit && r() < a.silentFrac) S.silentCircuit.add(h.idx);
    } else if (a.type === 'towerDrop') S.towerDown = { tower: a.tower, until: a.untilMin };
    else if (a.type === 'stuckSoc') {
      const r = mulberry32(S.seed * 17 + 5);
      for (const h of homes) if (h.firmware === a.firmware && h.circuit === a.circuit && r() < a.frac) S.stuck.set(h.idx, S.reported[h.idx]);
    } else if (a.type === 'bmsFault') {
      const h = homes.find((x) => x.circuit === a.circuit && x.tower.endsWith('-b') && !x.medical);
      S.faulted.add(h.idx);
      S.fault[h.id] = { code: 'BMS_F17', atSec: (S.t - S.step) * 60 }; // reported with its last heartbeat
    }
    logEntry({ t: S.t, time: fmtTime(S.t), kind: e.kind, id: e.id, title: e.title, story: e.story, rung: null });
  }

  function arrive(e) {
    const cmd = makeCommand(e);
    const meta = S.cmdMeta[cmd.id] = { id: cmd.id, event: e.id, title: e.title, truth: e.truth, arrival: S.t, kwh: 0, everRan: false,
      rejected: false, guardHold: false, sourceId: cmd.source.id };
    if (!S.guard) {
      S.active.push({ cmd, meta, start: S.t, end: S.t + cmd.durationMin });
      logEntry({ t: S.t, time: fmtTime(S.t), kind: 'command', id: cmd.id, title: e.title, truth: e.truth, verdict: 'applied', rung: null, reasons: [] });
      return;
    }
    const res = evaluate(cmd, engineState(), S.policy);
    S.ledger.seen[cmd.id] = cmd.sig;
    const rejected = res.reasons.some((r) => r.check === 'shape' || r.check === 'auth' || r.check === 'freshness');
    logEntry({ t: S.t, time: fmtTime(S.t), kind: 'command', phase: 'arrival', id: cmd.id, title: e.title, truth: e.truth, source: cmd.source,
      verdict: res.verdict, rung: res.rung, reasons: res.reasons.map(({ check, code, detail }) => ({ check, code, detail })), stats: res.stats });
    if (rejected) {
      meta.rejected = true; meta.guardHold = true;
      if (res.rung === 'hand') S.handed[cmd.id] = { cmd, meta, code: res.reasons.find((r) => r.rung === 'hand')?.code };
      return;
    }
    S.ledger.admitted[cmd.id] = cmd.sig;
    S.ledger.epochs[cmd.source.id] = Math.max(S.ledger.epochs[cmd.source.id] ?? 0, cmd.epoch);
    S.active.push({ cmd, meta, start: S.t, end: S.t + cmd.durationMin });
    if (res.verdict === 'escalate') S.pending.push({ id: cmd.id, due: reviewer === 'person' ? Infinity : S.t + S.policy.humanDelayMin });
    S.lastEvalSig[cmd.id] = sigOf(res);
  }
  const sigOf = (res) => res.verdict + '|' + res.reasons.map((r) => (r.code === 'CANARY' ? 'CANARY ' + (r.detail.match(/step \d of \d/) || [''])[0] : r.code)).join(',');

  function stepOnce() {
    const t = S.t, dtH = S.step / 60, nowSec = t * 60;
    // 1. grid state
    for (const c of Object.values(S.circ)) {
      if (c.open && t >= c.openUntil) {
        c.open = false;
        for (const i of [...S.silentCircuit]) if (homes[i].circuit === c.id) S.silentCircuit.delete(i);
        logEntry({ t, time: fmtTime(t), kind: 'grid', id: `${c.id}-closed`, title: `${c.switch || 'Circuit ' + c.id} closed, the branch is re-energized`, rung: null });
      }
      c.baseLoadMW = c.hourly[Math.floor(t / 60) % 24].mw;
      if (S.policy.envelope) Object.assign(c, S.policy.envelope({ importLimitMW: c.staticImportMW, exportCapMW: c.staticExportMW }, t));
    }
    if (S.towerDown && t >= S.towerDown.until) S.towerDown = null;
    // 2. scheduled events
    const due = S.timeline.filter((e) => !S.fired.has(e) && e.at <= t);
    for (const e of due) { S.fired.add(e); if (e.kind !== 'command') applyAction(e); }
    // 3. comms truth
    const truthSilent = new Array(N).fill(null);
    for (let i = 0; i < N; i++) {
      const h = homes[i];
      if (rng() < BLIP_P && S.blipUntil[i] <= t) S.blipUntil[i] = t + S.step * (2 + Math.floor(rng() * 3));
      if (S.faulted.has(i)) truthSilent[i] = 'broken';
      else if (S.silentCircuit.has(i)) truthSilent[i] = 'tripped';
      else if (S.towerDown && h.tower === S.towerDown.tower) truthSilent[i] = 'not_talking';
      else if (S.blipUntil[i] > t) truthSilent[i] = 'not_talking';
      if (!truthSilent[i]) S.hb[i] = nowSec - ((i * 7919 + t) % 30);
      S.reported[i] = S.stuck.has(i) ? S.stuck.get(i) : S.trueSoc[i];
      homeMap[h.id].loadKw = loadKw(h, t);
    }
    // 4. guard: silence + behaviour -> exclusions
    S.excluded = {}; S.cls = {};
    if (S.guard) {
      const tel = {};
      for (let i = 0; i < N; i++) {
        const h = homes[i];
        tel[h.id] = { lastHeartbeatSec: S.hb[i], socPct: 100 * S.reported[i] / h.capacityKWh,
          faultCode: S.fault[h.id]?.code, faultAtSec: S.fault[h.id]?.atSec };
      }
      const sil = classifySilence(nowSec, homes, tel, { circuits: S.circ }, S.policy);
      for (const s of sil.silent) {
        S.cls[s.homeId] = s;
        S.excluded[s.homeId] = s.cls === 'not_talking' ? `not talking (${s.domain})` : s.cls;
      }
      for (let i = 0; i < N; i++) if (truthSilent[i]) {
        const pred = S.cls[homes[i].id]?.cls || 'talking';
        const k = truthSilent[i] + '>' + pred;
        S.m.confusion[k] = (S.m.confusion[k] || 0) + 1;
      }
      const talking = homes.filter((h) => !S.cls[h.id]);
      const beh = checkBehaviour(talking, S.samples, S.policy);
      for (const id of beh.heldHomes) { S.excluded[id] = 'cohort hold (reporting implausible data)'; S.cls[id] = { cls: 'cohort_hold' }; }
      noteChanges(sil, beh);
    }
    // 5. arrivals and approvals
    for (const e of due) if (e.kind === 'command') arrive(e);
    for (const p of S.pending.filter((p) => p.due <= t)) {
      S.ledger.approved[p.id] = true;
      logEntry({ t, time: fmtTime(t), kind: 'approval', id: p.id, title: 'Second person approved', rung: null });
    }
    S.pending = S.pending.filter((p) => p.due > t);
    S.active = S.active.filter((a) => a.end > t);
    const activeSet = new Set(S.active);
    // 6. engine view of SOC: conservative (lower of reported and coulomb-counted)
    for (let i = 0; i < N; i++) homeMap[homes[i].id].socKWh = S.guard ? Math.min(S.reported[i], S.est[i]) : S.trueSoc[i];
    // 7. decide kW per home
    const cmdKw = new Float64Array(N);
    const winner = new Array(N).fill(null);
    const fallback = new Uint8Array(N);
    for (const c of Object.values(S.circ)) { c.otherFleetKw = 0; c.uncertainDisKw = 0; c.uncertainChgKw = 0; }
    const sorted = [...S.active].sort((a, b) => a.cmd.priority - b.cmd.priority || b.start - a.start || b.cmd.seq - a.cmd.seq);
    const canaryNow = [];
    if (!S.guard) {
      for (let i = 0; i < N; i++) {
        if (truthSilent[i]) { const w = S.lastWinner[i]; winner[i] = w && activeSet.has(w) ? w : null; }
        else {
          const id = homes[i].id;
          winner[i] = sorted.find((a) => covers(a.cmd, id)) || null;
          S.lastWinner[i] = winner[i];
        }
        if (winner[i]) cmdKw[i] = requestedKw(winner[i].cmd, homeMap[homes[i].id], t, S.step);
      }
    } else {
      for (let i = 0; i < N; i++) {
        const id = homes[i].id;
        if (!S.excluded[id]) continue;
        fallback[i] = 1;
        const plan = lastSafePlan(homeMap[id], S.policy, t);
        const w = S.lastWinner[i];
        if (S.cls[id]?.cls === 'cohort_hold') cmdKw[i] = lastSafePlanKw(plan, S.trueSoc[i], homeMap[id].loadKw, S.step);
        else if (w && activeSet.has(w)) {
          // silent: keep the last approved kW until that command expires, with the device's own floor check
          const k = S.lastKw[i];
          cmdKw[i] = k > 0 ? Math.max(0, Math.min(k, (S.trueSoc[i] - plan.minSocKWh) / dtH)) : k;
          winner[i] = w;
        } else cmdKw[i] = lastSafePlanKw(plan, S.trueSoc[i], homeMap[id].loadKw, S.step);
        const fc = S.circ[homes[i].circuit];
        if (!fc.open) { if (cmdKw[i] > 0) fc.uncertainDisKw += cmdKw[i]; else fc.uncertainChgKw += cmdKw[i]; }
      }
      const st = engineState();
      st.canaryHomes = {};
      for (const a of sorted) {
        const res = evaluate(a.cmd, st, S.policy);
        const isCanary = res.verdict === 'canary';
        if (isCanary) st.canaryHomes[a.cmd.id] = new Set(res.live.filter((id) => Math.abs(res.perHome[id]) > 0));
        for (const id of res.live) {
          const i = Number(id.slice(1));
          if (fallback[i] || winner[i]) continue;
          const k = res.perHome[id];
          if (isCanary && Math.abs(k) === 0) continue; // not in the canary yet: keeps its current plan
          winner[i] = a; cmdKw[i] = k;
          if (Math.abs(k) > 0) st.circuits[homes[i].circuit].otherFleetKw += k;
        }
        if (res.verdict === 'canary') canaryNow.push({ a, res });
        if (res.reasons.some((r) => r.rung === 'hold' || r.rung === 'hand')) a.meta.sawHold = true;
        const sg = sigOf(res);
        if (sg !== S.lastEvalSig[a.cmd.id]) {
          S.lastEvalSig[a.cmd.id] = sg;
          logEntry({ t, time: fmtTime(t), kind: 'command', phase: 'step', id: a.cmd.id, title: a.meta.title, truth: a.meta.truth,
            verdict: res.verdict, rung: res.rung, reasons: res.reasons.map(({ check, code, detail }) => ({ check, code, detail })), stats: res.stats });
        }
      }
      for (let i = 0; i < N; i++) if (!fallback[i]) { S.lastWinner[i] = winner[i]; S.lastKw[i] = cmdKw[i]; }
    }
    // 8. physics
    const price = TOU(t);
    const out = new Float64Array(N);
    const circuitOut = {};
    for (const c in S.circ) circuitOut[c] = 0;
    for (let i = 0; i < N; i++) {
      const h = homes[i], c = S.circ[h.circuit], load = homeMap[h.id].loadKw;
      let o;
      if (S.faulted.has(i)) o = 0;
      else if (c.open) {
        if (!S.guard && cmdKw[i] > load + 1e-6) { o = Math.min(cmdKw[i], h.maxKw); S.m.deadLineBatteryMin += S.step; }
        else o = Math.min(load, h.maxKw);
      } else o = Math.max(-h.maxKw, Math.min(h.maxKw, cmdKw[i]));
      o = o > 0 ? Math.min(o, S.trueSoc[i] / dtH) : Math.max(o, -(h.capacityKWh - S.trueSoc[i]) / dtH);
      out[i] = o;
      S.trueSoc[i] = Math.min(h.capacityKWh, Math.max(0, S.trueSoc[i] - o * dtH));
      const pf = floorKWh(h, promise);
      if (!truthSilent[i]) {
        // coulomb count from delivered-power telemetry; resync when it agrees with the report
        S.est[i] -= o * dtH;
        if (Math.abs(S.est[i] - S.reported[i]) < (S.policy.driftTolKWh ?? 2) && !S.stuck.has(i)) S.est[i] = S.trueSoc[i];
        const rep = S.stuck.has(i) ? S.stuck.get(i) : S.trueSoc[i];
        const arr = S.samples[h.id] || (S.samples[h.id] = []);
        arr.push({ tSec: nowSec, socKWh: rep, cmdKw: c.open ? o : (fallback[i] ? o : cmdKw[i]), deliveredKw: o });
        if (arr.length > 4) arr.shift();
      } else if (S.samples[h.id]) S.samples[h.id] = undefined;
      if (!c.open) {
        circuitOut[h.circuit] += o;
        let rev = o * dtH * price;
        S.m.touRevenue += o * dtH * price;
        const inEvent = winner[i] && winner[i].meta.event === EVENT.id && o > load;
        if (inEvent) {
          S.m.eventKWh += (o - load) * dtH;
          S.m.eventRevenue += (o - load) * dtH * EVENT_PAY;
          rev += (o - load) * dtH * EVENT_PAY;
        }
        if (winner[i]?.meta.truth === 'legit') S.m.legitCmdRevenue += rev;
        if (o > 0) S.m.belowPromiseValue += Math.max(0, Math.min(o * dtH, pf - S.trueSoc[i])) * (price + (inEvent ? EVENT_PAY : 0));
        const fl = floorKWh(h, S.policy);
        if (!S.faulted.has(i) && S.trueSoc[i] < fl - 1e-6) { S.m.floorBreach.add(h.id); S.m.floorBreachMin += S.step; }
        if (!S.faulted.has(i) && S.trueSoc[i] < pf - 1e-6) { S.m.promiseBreach.add(h.id); S.m.promiseBreachMin += S.step; }
      }
      if (winner[i] && Math.abs(o) > 1e-9) { winner[i].meta.everRan = true; winner[i].meta.kwh += o * dtH; }
      if (fallback[i]) S.m.fallbackHomeMin += S.step;
    }
    // 9. canary progression
    for (const { a, res } of canaryNow) {
      const prev = S.canary[a.cmd.id] || { stage: 0, behaved: true };
      let bad = 0, n = 0;
      for (const id in res.perHome) {
        const k = res.perHome[id];
        if (Math.abs(k) < 1e-9) continue;
        const i = Number(id.slice(1));
        n++;
        if (Math.abs(out[i] - k) > Math.max(S.policy.canaryTolKw, S.policy.canaryTolFrac * Math.abs(k))) bad++;
      }
      S.canary[a.cmd.id] = bad > Math.max(0, Math.floor(0.1 * n)) ? { stage: prev.stage, behaved: false, note: `${bad} of ${n} canary homes off target` }
        : { stage: prev.stage + 1, behaved: true };
    }
    // 10. circuit metrics + series
    const cs = {};
    for (const c of Object.values(S.circ)) {
      const net = c.open ? 0 : c.baseLoadMW - circuitOut[c.id] / 1000;
      if (!c.open) {
        if (net > c.importLimitMW) S.m.importOverMWmin += (net - c.importLimitMW) * S.step;
        if (net < c.exportCapMW) S.m.exportOverMWmin += (c.exportCapMW - net) * S.step;
      }
      cs[c.id] = { netMW: r3(net), baseMW: r3(c.baseLoadMW), importLimitMW: r3(c.importLimitMW), exportCapMW: r3(c.exportCapMW), open: c.open };
    }
    if (t === 20 * 60) {
      let low = 0;
      for (let i = 0; i < N; i++) if (S.trueSoc[i] / (homes[i].medical ? CRIT_KW_MED : CRIT_KW) < BACKUP_H) low++;
      S.m.lowBackup8pm = low;
    }
    let socSum = 0, outSum = 0;
    for (let i = 0; i < N; i++) { socSum += S.trueSoc[i]; outSum += out[i]; }
    const silentBy = { tripped: 0, not_talking: 0, broken: 0, unsure: 0, cohort_hold: 0 };
    for (const id in S.cls) silentBy[S.cls[id].cls]++;
    S.series.push({ t, time: fmtTime(t), price, fleetSocPct: r3(100 * socSum / (N * BASE_CORE.capacityKWh)), fleetMW: r3(outSum / 1000),
      circuits: cs, silent: silentBy, truthSilent: truthSilent.filter(Boolean).length,
      eventActive: t >= EVENT.startMin && t < EVENT.endMin });
    S.t += S.step;
  }

  const lastNote = { groups: new Map(), cohorts: '' };
  function noteChanges(sil, beh) {
    const groups = new Map();
    for (const x of sil.silent) {
      const k = x.cls === 'unsure' ? 'unsure' : `${x.cls}|${x.domain}|${x.key}`;
      const g = groups.get(k) || { cls: x.cls, domain: x.domain, key: x.key, n: 0, detail: x.detail, rung: x.rung };
      g.n++; groups.set(k, g);
    }
    {
      const prev = lastNote.groups;
      lastNote.groups = new Map([...groups].map(([k, g]) => [k, Math.round(g.n / 10)]));
      for (const [k, g] of groups) {
        if (k === 'unsure' || prev.get(k) === Math.round(g.n / 10)) continue;
        const where = g.domain === 'home' ? `Home ${g.key}` : `${g.n} homes on ${g.domain} ${g.key}`;
        logEntry({ t: S.t, time: fmtTime(S.t), kind: 'silence', id: `${g.domain}:${g.key}`, cls: g.cls, rung: g.rung,
          detail: `${where}: ${g.detail} Not counted as capacity.` });
      }
    }
    const co = beh.cohorts.filter((c) => c.action === 'hold').map((c) => c.key).join(',');
    if (co !== lastNote.cohorts) {
      lastNote.cohorts = co;
      for (const c of beh.cohorts.filter((x) => x.action === 'hold')) {
        const kinds = [...new Set(beh.flags.filter((f) => beh.heldHomes.has(f.homeId) && (homeById(f.homeId).firmware + '/' + homeById(f.homeId).circuit) === c.key).map((f) => f.kind))].join(', ');
        logEntry({ t: S.t, time: fmtTime(S.t), kind: 'behaviour', id: c.key, cls: 'cohort_hold', rung: 'hold',
          detail: `${c.lying} of ${c.total} homes in cohort ${c.key} are talking but lying (${kinds}). Holding the cohort on its last safe plan.` });
      }
    }
  }
  const byId = Object.fromEntries(homes.map((h) => [h.id, h]));
  const homeById = (id) => byId[id];
  const covCache = new Map();
  function covers(cmd, id) {
    let s = covCache.get(cmd.id);
    if (!s) {
      s = new Set();
      const tg = cmd.targets || {};
      for (const h of homes) if (tg.all || tg.circuits?.includes(h.circuit) || tg.homes?.includes(h.id)) s.add(h.id);
      covCache.set(cmd.id, s);
    }
    return s.has(id);
  }

  function done() { return S.t >= DAY.endMin; }

  // ---------- the "hand" rung: a person's decision ----------
  // Orders waiting for a person right now: fleet-wide orders that need a second person (two-person rule) and
  // orders held at the signature check. Expired windows are left out.
  function openHands() {
    const out = [];
    for (const p of S.pending) {
      const a = S.active.find((x) => x.cmd.id === p.id);
      if (a) out.push(handView(a.cmd, a.meta, 'second_person', 'TWO_PERSON', Number.isFinite(p.due) ? p.due : null, a.end));
    }
    for (const id in S.handed) {
      const h = S.handed[id];
      const end = h.meta.arrival + h.cmd.durationMin;
      if (end > S.t) out.push(handView(h.cmd, h.meta, 'signature', h.code, null, end));
    }
    return out;
  }
  const handView = (cmd, meta, kind, code, autoApproveAt, endsAt) => ({ id: cmd.id, kind, code, title: meta.title,
    source: { ...cmd.source }, priority: cmd.priority, payload: { ...cmd.payload }, targets: cmd.targets,
    durationMin: cmd.durationMin, arrival: meta.arrival, autoApproveAt, endsAt });

  // decide(cmdId, 'approve' | 'reject', {by}) applies a person's decision at the current time, before the next step.
  // approve: a second-person order runs (still through every check); a signature-held order is released past the
  //   signature check only, by its exact signature, and then runs through every later check.
  // reject: the order does not run. An unknown signer is also blocked, so its next order is held without asking.
  function decide(cmdId, choice, { by = 'dispatcher' } = {}) {
    if (!S.guard) return { ok: false, detail: 'The guard is off, so no order is waiting for a person.' };
    if (choice !== 'approve' && choice !== 'reject') return { ok: false, detail: `Unknown choice "${choice}".` };
    const t = S.t;
    const p = S.pending.find((x) => x.id === cmdId);
    const a = S.active.find((x) => x.cmd.id === cmdId);
    const h = S.handed[cmdId];
    let detail, title;
    if (p && a) {
      title = a.meta.title;
      S.pending = S.pending.filter((x) => x !== p);
      if (choice === 'approve') {
        S.ledger.approved[cmdId] = true;
        detail = `The ${by} approved "${title}" as the second person. It still goes through every check.`;
      } else {
        S.active = S.active.filter((x) => x !== a);
        a.meta.rejected = true; a.meta.guardHold = true; a.meta.sawHold = true;
        detail = `The ${by} rejected "${title}". It does not run.`;
      }
    } else if (h) {
      title = h.meta.title;
      const end = h.meta.arrival + h.cmd.durationMin;
      if (choice === 'approve') {
        if (end <= t) return { ok: false, detail: `The order's window closed at ${fmtTime(end)}, so there is nothing left to release.` };
        S.ledger.personApproved[cmdId] = orderDigest(h.cmd);
        S.ledger.admitted[cmdId] = h.cmd.sig;
        h.meta.rejected = false; h.meta.guardHold = false;
        S.active.push({ cmd: h.cmd, meta: h.meta, start: t, end });
        detail = `The ${by} released "${title}" after it failed the signature check. Backup floor, inverter, circuit and canary checks still apply.`;
      } else {
        const block = h.code === 'UNKNOWN_SIGNER';
        if (block) S.ledger.blocked[h.cmd.source.id] = true;
        detail = `The ${by} rejected "${title}".${block ? ` Sender "${h.cmd.source.id}" is blocked; its next order is held without asking.` : ''}`;
      }
      delete S.handed[cmdId];
    } else return { ok: false, detail: `No order "${cmdId}" is waiting for a person.` };
    logEntry({ t, time: fmtTime(t), kind: 'decision', id: cmdId, title, choice, by, rung: null, detail });
    return { ok: true, detail };
  }

  function results() {
    const cmds = Object.values(S.cmdMeta);
    const held = cmds.filter((c) => c.rejected || (!c.everRan && c.sawHold));
    const m = S.m;
    return {
      guard: S.guard, seed: S.seed, pack: S.pack, packLabel: S.policy.label, legitOnly,
      strictness: strictness || null,
      scoreboard: {
        floorBreachHomes: m.floorBreach.size, floorBreachHomeMin: m.floorBreachMin,
        promiseBreachHomes: m.promiseBreach.size, promiseBreachHomeMin: m.promiseBreachMin,
        lowBackupHomes8pm: m.lowBackup8pm,
        importOverMWmin: r3(m.importOverMWmin), exportOverMWmin: r3(m.exportOverMWmin),
        deadLineBatteryMin: m.deadLineBatteryMin,
        touRevenue: r2(m.touRevenue), eventRevenue: r2(m.eventRevenue), revenue: r2(m.touRevenue + m.eventRevenue),
        eventMWh: r3(m.eventKWh / 1000),
        legitCmdRevenue: r2(m.legitCmdRevenue), belowPromiseValue: r2(m.belowPromiseValue),
        rungCounts: m.rungCounts,
        commands: cmds.length, commandsHeld: held.length, legitHeld: held.filter((c) => c.truth === 'legit').length,
        heldIds: held.map((c) => c.id),
        silenceConfusion: S.guard ? m.confusion : null,
        fallbackHomeMin: m.fallbackHomeMin,
      },
      commands: cmds.map(({ id, event, title, truth, kwh, rejected, everRan }) => ({ id, event, title, truth, kwh: r2(kwh), rejected, everRan })),
      series: S.series, log: S.log,
    };
  }

  return { S, step: stepOnce, done, results, fire: (e) => S.timeline.push({ ...e, at: S.t }), decide, openHands };
}

export function runReplay(opts = {}) {
  const sim = createSim(opts);
  while (!sim.done()) sim.step();
  return sim.results();
}

// Sweep the backup floor with the same seed: revenue vs broken promises. Canary thresholds stay at the pack's.
export function toleranceMap({ seed = 7, pack = 'sce', floors = [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4] } = {}) {
  return floors.map((floorPct) => {
    const r = runReplay({ guard: true, seed, pack, strictness: { floorPct } }).scoreboard;
    return { floorPct, revenue: r.revenue, eventMWh: r.eventMWh, promiseBreachHomes: r.promiseBreachHomes,
      lowBackupHomes8pm: r.lowBackupHomes8pm, importOverMWmin: r.importOverMWmin, exportOverMWmin: r.exportOverMWmin, legitHeld: r.legitHeld };
  });
}

function r2(x) { return Math.round(x * 100) / 100; }
function r3(x) { return Math.round(x * 1000) / 1000; }
