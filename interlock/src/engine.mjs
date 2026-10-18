// Interlock engine: every command passes ordered checks; each check picks the gentlest rung that keeps the rules.
// Invariant: Interlock can only shrink, slow or stop a command. It never creates, enlarges or sign-flips one.
// Pure ES module, no I/O: runs in Node and in the browser.

export const BASE_CORE = Object.freeze({ capacityKWh: 39.2, maxKw: 20 }); // REAL: Base Core spec
export const RUNGS = ['none', 'watch', 'ask', 'slow', 'hold', 'hand'];
export const ROLES = ['aggregator', 'market', 'utility', 'vendor', 'local'];
export const PAYLOAD_TYPES = ['DISCHARGE_KW', 'CHARGE_KW', 'EXPORT_KW', 'SOC_TARGET', 'IDLE'];
export const STEP_MIN_DEFAULT = 5;

const EPS = 1e-9;

export function maxRung(a, b) {
  return RUNGS.indexOf(b) > RUNGS.indexOf(a) ? b : a;
}

// ---------- signatures (deterministic stand-in) ----------
// Real deployments would use asymmetric signatures (e.g. ECDSA P-256 as in IEEE 2030.5 / OpenADR 3 with TLS client certs).
// Here: FNV-1a over canonical JSON of the command (minus sig) plus a per-source shared key.
export function canonicalJSON(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJSON).join(',') + ']';
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJSON(v[k])).join(',') + '}';
}

export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function computeSig(cmd, key) {
  const { sig, ...body } = cmd;
  return fnv1a(key + '\n' + canonicalJSON(body));
}

export function signCommand(cmd, key) {
  return { ...cmd, sig: computeSig(cmd, key) };
}

// Digest of the whole order as received (body and claimed signature). A person's release is tied to this exact order.
export function orderDigest(cmd) {
  return fnv1a(canonicalJSON(cmd));
}

// ---------- helpers ----------
export function toMinutes(t) {
  if (typeof t === 'number') return t;
  if (typeof t === 'string') {
    const m = t.match(/(?:T|^)(\d{1,2}):(\d{2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
  }
  return NaN;
}

export function fmtTime(min) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function floorKWh(home, policy) {
  const cap = home.capacityKWh ?? BASE_CORE.capacityKWh;
  // reserveKWh: a per-home reserve set by the fleet's planner (PowerUP raises it ahead of a shutoff); never lowers the policy floor
  return Math.max(policy.floorPct * cap, home.medical ? policy.medicalFloorPct * cap : 0, home.reserveKWh || 0);
}

function homeIdsOf(state) {
  return state.homeIds ?? (state.homeIds = Object.keys(state.homes));
}

const targetCache = new WeakMap();
// Resolve the command's targets to a Set of known home ids.
export function targetSet(cmd, state) {
  const cached = targetCache.get(cmd);
  if (cached && cached.homes === state.homes) return cached.set;
  const t = cmd.targets || {};
  const set = new Set();
  if (t.all) for (const id of homeIdsOf(state)) set.add(id);
  if (Array.isArray(t.circuits) && t.circuits.length) {
    const cs = new Set(t.circuits);
    for (const id of homeIdsOf(state)) if (cs.has(state.homes[id].circuit)) set.add(id);
  }
  if (Array.isArray(t.homes)) for (const id of t.homes) if (state.homes[id]) set.add(id);
  targetCache.set(cmd, { homes: state.homes, set });
  return set;
}

function remainingHours(cmd, nowMin, stepMin) {
  const end = toMinutes(cmd.issuedAt) + cmd.durationMin;
  return Math.max(stepMin, end - nowMin) / 60;
}

// What the command literally asks this home's battery to do this step (kW, + discharge/export, - charge).
export function requestedKw(cmd, home, nowMin, stepMin = STEP_MIN_DEFAULT) {
  const p = cmd.payload;
  const v = Number(p.value) || 0;
  switch (p.type) {
    case 'DISCHARGE_KW': return Math.max(0, v);
    case 'CHARGE_KW': return -Math.max(0, v);
    case 'EXPORT_KW': return Math.max(0, v) + Math.max(0, home.loadKw || 0); // export v kW at the meter
    case 'SOC_TARGET': {
      const cap = home.capacityKWh ?? BASE_CORE.capacityKWh;
      const target = Math.min(100, Math.max(0, v)) / 100 * cap;
      return (home.socKWh - target) / remainingHours(cmd, nowMin, stepMin);
    }
    default: return 0;
  }
}

function canaryRank(cmdId, homeId) {
  return parseInt(fnv1a(cmdId + '|' + homeId), 16);
}

function fmtN(n) { return n.toLocaleString('en-US'); }
function fmtMW(kw) { return (kw / 1000).toFixed(2) + ' MW'; }

// ---------- the guard ----------
/**
 * evaluate(command, state, policy)
 * state: { nowMin, stepMin?, homes: {id: {circuit, socKWh, capacityKWh?, maxKw?, medical, loadKw}},
 *          circuits: {id: {open, baseLoadMW, importLimitMW, exportCapMW, otherFleetKw}},
 *          ledger: {seen, epochs, admitted, approved}, active: [{cmd}], canary: {id: {stage, behaved}},
 *          excluded: {homeId: reason} }
 */
export function evaluate(command, state, policy) {
  const reasons = [];
  let rung = 'none';
  const fire = (check, code, detail, r) => { reasons.push({ check, code, detail, rung: r }); rung = maxRung(rung, r); };
  const nowMin = toMinutes(state.nowMin);
  const stepMin = state.stepMin ?? STEP_MIN_DEFAULT;
  const ledger = state.ledger || {};
  let liveIds = [];
  const result = (verdict, perHome = {}, requested = {}, homesTargeted = 0) => {
    let kwReq = 0, kwExe = 0, touched = 0;
    for (const id in requested) kwReq += requested[id];
    for (const id in perHome) { kwExe += perHome[id]; if (Math.abs(perHome[id]) > EPS) touched++; }
    if (verdict !== 'hold' && verdict !== 'escalate' && homesTargeted > 0 && touched === 0 && Math.abs(kwReq) > EPS) verdict = 'hold';
    return { verdict, rung, reasons, perHome, requested, live: liveIds,
      stats: { homesTargeted, homesTouched: touched, kwRequested: round1(kwReq), kwExecuted: round1(kwExe) } };
  };
  const cmd = command || {};

  // (1) shape: required fields, known end nodes, valid sender role (semantic OpenADR / SHACL-style)
  const shapeErr = [];
  if (typeof cmd.id !== 'string' || !cmd.id) shapeErr.push('missing id');
  if (!cmd.source || typeof cmd.source.id !== 'string') shapeErr.push('missing source');
  else if (!ROLES.includes(cmd.source.role)) shapeErr.push(`unknown sender role "${cmd.source.role}"`);
  else if (policy.allowedRoles && !policy.allowedRoles.includes(cmd.source.role))
    shapeErr.push(`sender role "${cmd.source.role}" is not allowed to command batteries under the ${policy.label} pack`);
  if (typeof cmd.sig !== 'string') shapeErr.push('missing signature');
  if (!Number.isFinite(toMinutes(cmd.issuedAt))) shapeErr.push('missing or unreadable issuedAt');
  if (!Number.isFinite(cmd.epoch)) shapeErr.push('missing epoch');
  if (!Number.isInteger(cmd.priority) || cmd.priority < 0 || cmd.priority > 9) shapeErr.push('priority must be 0-9');
  else if (cmd.priority < (policy.utilityOnlyPriority ?? 3) && cmd.source?.role !== 'utility')
    shapeErr.push(`priority ${cmd.priority} is reserved for the utility; a ${cmd.source?.role} cannot send it`);
  if (!cmd.payload || !PAYLOAD_TYPES.includes(cmd.payload.type)) shapeErr.push('unknown payload type');
  else if (cmd.payload.type !== 'IDLE' && (!Number.isFinite(cmd.payload.value) || cmd.payload.value < 0))
    shapeErr.push('payload value must be a non-negative number');
  if (!Number.isFinite(cmd.durationMin) || cmd.durationMin <= 0) shapeErr.push('durationMin must be positive');
  const t = cmd.targets;
  if (!t || typeof t !== 'object') shapeErr.push('missing targets');
  else {
    if (!t.all && !(t.circuits?.length) && !(t.homes?.length)) shapeErr.push('targets name no end node');
    for (const c of t.circuits || []) if (!state.circuits[c]) shapeErr.push(`unknown circuit "${c}"`);
    const badHomes = (t.homes || []).filter((h) => !state.homes[h]);
    if (badHomes.length) shapeErr.push(`${badHomes.length} unknown home id(s), e.g. "${badHomes[0]}"`);
  }
  if (shapeErr.length) {
    fire('shape', 'BAD_SHAPE', `Command rejected before anything else: ${shapeErr.join('; ')}.`, 'hold');
    return result('hold');
  }

  // (2) auth: known signer, matching role, good signature.
  // A person's decision (the "hand" rung) is recorded in the ledger: ledger.blocked[senderId] holds that sender
  // without asking again; ledger.personApproved[cmdId] === orderDigest(cmd) releases that one exact order past this check only.
  if (ledger.blocked?.[cmd.source.id]) {
    fire('auth', 'BLOCKED_SENDER', `A dispatcher blocked "${cmd.source.id}" after an earlier order failed the signature check. Held without asking again.`, 'hold');
    return result('hold');
  }
  const trusted = policy.trustedSources?.[cmd.source.id];
  const authErr = !trusted
    ? ['UNKNOWN_SIGNER', `Signed by "${cmd.source.id}", which is not on the trusted-sender list. Held; a person must review it.`]
    : trusted.role !== cmd.source.role
      ? ['ROLE_MISMATCH', `"${cmd.source.id}" is registered as ${trusted.role} but claims to be ${cmd.source.role}. Held for a person.`]
      : computeSig(cmd, trusted.key) !== cmd.sig
        ? ['BAD_SIGNATURE', `Signature does not match "${cmd.source.id}"'s key: tampered or forged. Held for a person.`]
        : null;
  if (authErr) {
    if (ledger.personApproved?.[cmd.id] !== orderDigest(cmd)) {
      fire('auth', authErr[0], authErr[1], 'hand');
      return result('hold');
    }
    fire('auth', 'PERSON_RELEASED', `Failed the signature check (${authErr[0]}), then a dispatcher released this exact order. Every later check still applies.`, 'watch');
  }

  // (3) freshness: age, epoch, replay (skipped for a command already admitted with this exact signature)
  // A continuing order skips freshness only while its own window is open (plus one step, since an order that arrives
  // between steps runs from the next step): the same signed order re-sent after that is a replay. Found when PowerUP's
  // multi-day Malibu replay re-sent an order admitted days earlier.
  const continuing = ledger.admitted?.[cmd.id] === cmd.sig && nowMin < toMinutes(cmd.issuedAt) + cmd.durationMin + stepMin;
  if (!continuing) {
    const issued = toMinutes(cmd.issuedAt);
    const age = nowMin - issued;
    const fresh = [];
    if (age > policy.maxAgeMin) fresh.push(['STALE', `issued ${Math.round(age)} min ago (limit ${policy.maxAgeMin} min)`]);
    if (age < -(policy.maxFutureMin ?? 2)) fresh.push(['FUTURE', `issued ${Math.round(-age)} min in the future`]);
    const lastEpoch = ledger.epochs?.[cmd.source.id];
    if (Number.isFinite(lastEpoch) && cmd.epoch < lastEpoch) fresh.push(['STALE_EPOCH', `epoch ${cmd.epoch} is older than ${cmd.source.id}'s current epoch ${lastEpoch}`]);
    if (ledger.seen?.[cmd.id] !== undefined) fresh.push(['REPLAY', `command id "${cmd.id}" was already received`]);
    if (fresh.length) {
      for (const [code, d] of fresh) fire('freshness', code, `Looks like a replay or a stale order: ${d}. Held.`, 'hold');
      return result('hold');
    }
  }

  // Resolve targets, then (4) precedence and exclusions
  const targets = targetSet(cmd, state);
  const homesTargeted = targets.size;
  const requested = {};
  const perHome = {};
  const live = [];
  const supersededBy = new Map();
  let excludedCount = 0;
  const excludedWhy = new Map();
  const activeOthers = (state.active || []).map((a) => a.cmd || a).filter((a) =>
    a.id !== cmd.id && toMinutes(a.issuedAt) + a.durationMin > nowMin);
  const winners = activeOthers.filter((a) => a.priority < cmd.priority ||
    (a.priority === cmd.priority && a.source?.id === cmd.source.id && toMinutes(a.issuedAt) > toMinutes(cmd.issuedAt)) ||
    (a.priority === cmd.priority && a.source?.id === cmd.source.id && toMinutes(a.issuedAt) === toMinutes(cmd.issuedAt) && (a.seq ?? 0) > (cmd.seq ?? 0)));
  for (const id of targets) {
    const home = state.homes[id];
    const req = requestedKw(cmd, home, nowMin, stepMin);
    requested[id] = req;
    perHome[id] = 0;
    const ex = state.excluded?.[id];
    if (ex) { excludedCount++; excludedWhy.set(ex, (excludedWhy.get(ex) || 0) + 1); continue; }
    const w = winners.find((a) => targetSet(a, state).has(id) && (!state.canaryHomes?.[a.id] || state.canaryHomes[a.id].has(id)));
    if (w) { supersededBy.set(w.id, (supersededBy.get(w.id) || 0) + 1); continue; }
    live.push(id);
  }
  for (const [wid, n] of supersededBy) {
    const w = winners.find((a) => a.id === wid);
    const why = w.priority < cmd.priority ? `higher-priority command "${wid}" (priority ${w.priority} vs ${cmd.priority})`
      : `newer command "${wid}" from the same sender`;
    fire('precedence', 'SUPERSEDED', `${fmtN(n)} home(s) already follow ${why}; this command does not run there.`, 'watch');
  }
  if (excludedCount) {
    const parts = [...excludedWhy].map(([why, n]) => `${fmtN(n)} ${why}`).join(', ');
    fire('precedence', 'EXCLUDED', `${fmtN(excludedCount)} home(s) skipped and not counted as capacity: ${parts}. They run their last safe plan.`, 'watch');
  }

  // (5) backup floor per home
  let floorClamped = 0, floorClampedMed = 0, targetRaised = 0;
  let reserved = 0; // live homes whose planner reserve sits above the policy floor
  for (const id of live) { const hm = state.homes[id]; if ((hm.reserveKWh || 0) > Math.max(policy.floorPct, hm.medical ? policy.medicalFloorPct : 0) * (hm.capacityKWh ?? BASE_CORE.capacityKWh) + EPS) reserved++; }
  const kw = {};
  for (const id of live) {
    const home = state.homes[id];
    let k = requested[id];
    const floor = floorKWh(home, policy);
    if (cmd.payload.type === 'SOC_TARGET') {
      const cap = home.capacityKWh ?? BASE_CORE.capacityKWh;
      const target = cmd.payload.value / 100 * cap;
      if (target < floor - EPS && k > 0) {
        const kFloor = Math.max(0, (home.socKWh - floor) / remainingHours(cmd, nowMin, stepMin));
        if (kFloor < k - EPS) { k = kFloor; targetRaised++; if (home.medical) floorClampedMed++; }
      }
    } else if (k > 0) {
      const kMax = Math.max(0, (home.socKWh - floor) / remainingHours(cmd, nowMin, stepMin));
      if (k > kMax + EPS) { k = kMax; floorClamped++; if (home.medical) floorClampedMed++; }
    }
    kw[id] = k;
  }
  if (targetRaised) fire('floor', 'SOC_TARGET_RAISED',
    `SOC target ${cmd.payload.value}% is below the backup floor; raised to ${Math.round(policy.floorPct * 100)}% (${Math.round(policy.medicalFloorPct * 100)}% for medical homes${reserved ? `, each home's planned reserve where higher` : ''}) on ${fmtN(targetRaised)} home(s).`, 'slow');
  if (floorClamped) fire('floor', 'FLOOR_CLAMP',
    `Discharge slowed on ${fmtN(floorClamped)} home(s) so backup never drops below the floor over the next ${Math.round(remainingHours(cmd, nowMin, stepMin) * 60)} min${floorClampedMed ? ` (${fmtN(floorClampedMed)} medical homes keep ${Math.round(policy.medicalFloorPct * 100)}%${reserved ? ' or their planned reserve' : ''})` : ''}${reserved ? `; ${fmtN(reserved)} home(s) are held at a planned reserve above the floor` : ''}.`, 'slow');

  // (6) inverter and battery limits
  let invClamped = 0;
  const dtH = stepMin / 60;
  for (const id of live) {
    const home = state.homes[id];
    const maxKw = home.maxKw ?? BASE_CORE.maxKw;
    const cap = home.capacityKWh ?? BASE_CORE.capacityKWh;
    let k = kw[id];
    let lim = k > 0 ? Math.min(maxKw, home.socKWh / dtH) : Math.min(maxKw, Math.max(0, cap - home.socKWh) / dtH);
    lim = Math.max(0, lim);
    if (Math.abs(k) > lim + EPS) { k = Math.sign(k) * lim; invClamped++; }
    kw[id] = k;
  }
  if (invClamped) fire('inverter', 'INVERTER_CLAMP', `Capped ${fmtN(invClamped)} home(s) at the ${BASE_CORE.maxKw} kW inverter limit or the battery's remaining room this step.`, 'slow');

  // (7) circuit: dead line, then import limit / export cap (pro-rata).
  // Homes Interlock cannot vouch for (silent, held) are counted pessimistically: their discharge does not
  // count as headroom for charging, and is assumed to continue when checking the export cap.
  const deadTargets = new Map();
  for (const id of targets) {
    const c = state.homes[id].circuit;
    if (state.circuits[c].open && Math.abs(requested[id]) > EPS) deadTargets.set(c, (deadTargets.get(c) || 0) + 1);
  }
  for (const [cid, n] of deadTargets) {
    const c = state.circuits[cid];
    fire('circuit', 'DEAD_LINE', `Circuit ${cid}${c.name ? ` (${c.name})` : ''} is open (de-energized). Its homes island and serve themselves; this order's export or charge on ${fmtN(n)} home(s) there is held.`, 'hold');
  }
  const byCircuit = new Map();
  for (const id of live) {
    const c = state.homes[id].circuit;
    if (!byCircuit.has(c)) byCircuit.set(c, []);
    byCircuit.get(c).push(id);
  }
  for (const [cid, ids] of byCircuit) {
    const c = state.circuits[cid];
    const name = c.name ? `${cid} (${c.name})` : cid;
    if (c.open) { for (const id of ids) kw[id] = 0; continue; }
    let dis = 0, chg = 0;
    for (const id of ids) { if (kw[id] > 0) dis += kw[id]; else chg += kw[id]; }
    const other = c.otherFleetKw || 0;
    const beforeImp = c.baseLoadMW - (other + (c.uncertainChgKw || 0)) / 1000;
    const beforeExp = c.baseLoadMW - (other + (c.uncertainDisKw || 0)) / 1000;
    const afterImp = beforeImp - (dis + chg) / 1000;
    const afterExp = beforeExp - (dis + chg) / 1000;
    if (afterImp > c.importLimitMW + EPS && chg < 0) {
      const allowedChg = Math.max(0, (c.importLimitMW - beforeImp) * 1000 + dis);
      const f = Math.min(1, allowedChg / -chg);
      for (const id of ids) if (kw[id] < 0) kw[id] *= f;
      fire('circuit', 'IMPORT_LIMIT', `Charging on circuit ${name} would push it to ${afterImp.toFixed(2)} MW, over its ${c.importLimitMW.toFixed(2)} MW limit. All ${fmtN(ids.length)} home(s) slowed pro-rata to ${Math.round(f * 100)}%.`, 'slow');
    } else if (afterExp < c.exportCapMW - EPS && dis > 0) {
      const allowedDis = Math.max(0, (beforeExp - c.exportCapMW) * 1000 - chg);
      const f = Math.min(1, allowedDis / dis);
      for (const id of ids) if (kw[id] > 0) kw[id] *= f;
      fire('circuit', 'EXPORT_CAP', `Export on circuit ${name} would reach ${afterExp.toFixed(2)} MW (reverse flow past the ${c.exportCapMW.toFixed(1)} MW cap). Slowed pro-rata to ${Math.round(f * 100)}%.`, 'slow');
    }
  }

  // (8) size and ramp: canary rollout; two-person rule for fleet-wide orders
  let touched = 0, totalKw = 0;
  for (const id of live) if (Math.abs(kw[id]) > EPS) { touched++; totalKw += Math.abs(kw[id]); }
  const big = touched > policy.canaryHomes || totalKw / 1000 > policy.canaryMW;
  let verdictCanary = false;
  if (big) {
    const st = state.canary?.[cmd.id] || { stage: 0, behaved: true };
    const stages = policy.canaryStages || [0.01, 0.1, 1];
    if (st.behaved === false) {
      for (const id of live) kw[id] = 0;
      fire('ramp', 'CANARY_FAILED', `Canary step ${st.stage + 1} did not behave (${st.note || 'delivered power off target'}). Rollout stopped; a person must look.`, 'hand');
    } else if (st.stage < stages.length - 1) {
      const movers = live.filter((id) => Math.abs(kw[id]) > EPS).sort((a, b) => canaryRank(cmd.id, a) - canaryRank(cmd.id, b));
      const n = Math.max(1, Math.ceil(stages[st.stage] * movers.length));
      const keep = new Set(movers.slice(0, n));
      for (const id of live) if (!keep.has(id)) kw[id] = 0;
      verdictCanary = true;
      fire('ramp', 'CANARY', `Large order (${fmtN(touched)} homes, ${fmtMW(totalKw)}): rolling out as a canary, step ${st.stage + 1} of ${stages.length} (${Math.round(stages[st.stage] * 100)}% = ${fmtN(n)} homes). Next step only if these behave.`, 'slow');
    }
  }
  const fleetWide = !!cmd.targets.all;
  if (policy.twoPersonFleetWide && fleetWide && (cmd.source.role !== 'utility' || policy.twoPersonIncludesUtility) && !ledger.approved?.[cmd.id]) {
    fire('ramp', 'TWO_PERSON', `Fleet-wide order from ${cmd.source.role} "${cmd.source.id}": the ${policy.label} pack needs a second person to approve before it runs.`, 'hand');
    return result('escalate', perHome, requested, homesTargeted);
  }

  for (const id of live) perHome[id] = kw[id];
  liveIds = live;
  const hardHold = reasons.some((r) => r.code === 'CANARY_FAILED');
  const anyClamp = reasons.some((r) => r.rung === 'slow' || r.rung === 'hold');
  const verdict = hardHold ? 'hold' : verdictCanary ? 'canary' : anyClamp ? 'clamp' : 'pass';
  return result(verdict, perHome, requested, homesTargeted);
}

function round1(x) { return Math.round(x * 10) / 10; }

// ---------- last safe plan (IEEE 2030.5 DefaultDERControl-style fallback) ----------
// What each battery runs on its own if Interlock or comms fail: self-consumption only, no export,
// hold SOC at or above the floor (recharge gently from the grid if below), expires after ttl.
export function lastSafePlan(home, policy, nowMin = 0) {
  return {
    mode: 'self_consumption',
    minSocKWh: floorKWh(home, policy),
    maxExportKw: 0,
    maxDischargeKw: home.maxKw ?? BASE_CORE.maxKw,
    rechargeKw: policy.lastSafePlanRechargeKw ?? 2,
    validFromMin: nowMin,
    expiresAtMin: nowMin + (policy.lastSafePlanTtlMin ?? 1440),
    basis: 'Modelled on IEEE 2030.5 DefaultDERControl: the device keeps a pre-loaded safe default when no valid event is active.',
  };
}

// Battery kW the plan allows this step given true SOC and home load (+ discharge, - charge). Never exports.
export function lastSafePlanKw(plan, socKWh, loadKw, stepMin = STEP_MIN_DEFAULT) {
  const dtH = stepMin / 60;
  if (socKWh < plan.minSocKWh - EPS) return -Math.min(plan.rechargeKw, (plan.minSocKWh - socKWh) / dtH);
  return Math.max(0, Math.min(loadKw, plan.maxDischargeKw, (socKWh - plan.minSocKWh) / dtH));
}
