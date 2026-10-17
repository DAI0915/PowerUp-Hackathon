// Silence and behaviour checks. Pure ES module.
// A home is silent when its last heartbeat is older than the timeout (an open socket is not proof of life).

const DOMAINS = ['circuit', 'tower', 'isp', 'firmware'];

function groupCounts(homes, silentSet) {
  const g = {};
  for (const d of DOMAINS) g[d] = new Map();
  for (const h of homes) {
    for (const d of DOMAINS) {
      const k = h[d];
      if (k === undefined) continue;
      const e = g[d].get(k) || { total: 0, silent: 0 };
      e.total++;
      if (silentSet.has(h.id)) e.silent++;
      g[d].set(k, e);
    }
  }
  return g;
}

/**
 * classifySilence(nowSec, homes, telemetry, gridState, policy)
 * homes: [{id, circuit, tower, isp, firmware}]
 * telemetry: {homeId: {lastHeartbeatSec, socPct, faultCode?, faultAtSec?, tempDriftC?}}
 * gridState: {circuits: {id: {open}}}
 * Returns {silent: [{homeId, cls, rung, domain, detail}], byClass, clusters}
 */
export function classifySilence(nowSec, homes, telemetry, gridState, policy) {
  const timeout = policy.heartbeatTimeoutSec ?? 90;
  const clusterFrac = policy.clusterFrac ?? 0.5;
  const minCluster = policy.minClusterSize ?? 5;
  const silentSet = new Set();
  for (const h of homes) {
    const tm = telemetry[h.id];
    if (!tm || nowSec - tm.lastHeartbeatSec > timeout) silentSet.add(h.id);
  }
  const g = groupCounts(homes, silentSet);
  const isCluster = (d, k) => {
    const e = g[d].get(k);
    return e && e.total >= minCluster && e.silent / e.total >= clusterFrac;
  };
  const clusters = [];
  for (const d of DOMAINS) for (const [k, e] of g[d]) if (e.total >= minCluster && e.silent / e.total >= clusterFrac)
    clusters.push({ domain: d, key: k, silent: e.silent, total: e.total, frac: e.silent / e.total });

  const silent = [];
  const byClass = { tripped: 0, not_talking: 0, broken: 0, unsure: 0 };
  for (const h of homes) {
    if (!silentSet.has(h.id)) continue;
    const tm = telemetry[h.id] || {};
    const open = gridState?.circuits?.[h.circuit]?.open;
    let cls, rung, domain, detail;
    if (open && isCluster('circuit', h.circuit)) {
      cls = 'tripped'; rung = 'watch'; domain = 'circuit';
      detail = `Circuit ${h.circuit} is open and most of it went quiet together: islanded, probably fine.`;
    } else if (isCluster('tower', h.tower) || isCluster('isp', h.isp)) {
      cls = 'not_talking'; rung = 'watch'; domain = isCluster('tower', h.tower) ? 'tower' : 'isp';
      detail = `Most homes on ${domain} ${h[domain]} went quiet together: comms outage, battery runs its last safe plan.`;
    } else if (isCluster('firmware', h.firmware)) {
      cls = 'not_talking'; rung = 'hold'; domain = 'firmware';
      detail = `Most of firmware ${h.firmware} went quiet together: suspect a bad update; hold rollouts to that cohort.`;
    } else {
      // a fault reported shortly before the home went quiet
      const recentFault = tm.faultCode && (tm.lastHeartbeatSec ?? nowSec) - (tm.faultAtSec ?? -Infinity) <= (policy.faultRecentSec ?? 900);
      const hot = Math.abs(tm.tempDriftC ?? 0) > (policy.tempDriftC ?? 8);
      const empty = (tm.socPct ?? 50) <= (policy.deepDischargePct ?? 3);
      if (recentFault || hot || empty) {
        cls = 'broken'; rung = 'hand'; domain = 'home';
        detail = recentFault ? `Alone and quiet right after fault ${tm.faultCode}: send a person.`
          : hot ? `Alone and quiet after temperature drift of ${tm.tempDriftC} C: send a person.`
          : `Alone and quiet at ${tm.socPct}% SOC: likely deep-discharge lockout, send a person.`;
      } else {
        cls = 'unsure'; rung = 'ask'; domain = 'home';
        detail = 'Alone and quiet with no warning signs: ping it, then text the member if it stays quiet.';
      }
    }
    byClass[cls]++;
    silent.push({ homeId: h.id, cls, rung, domain, key: domain === 'home' ? h.id : h[domain], detail });
  }
  return { silent, byClass, clusters, silentCount: silentSet.size };
}

/**
 * checkBehaviour(homes, samples, policy)
 * Talking but lying. samples: {homeId: [{tSec, socKWh (reported), cmdKw, deliveredKw}]} oldest first.
 * Returns {flags: [{homeId, kind, detail}], cohorts: [{key, lying, total, frac, action}], heldHomes: Set, watchHomes: Set}
 */
export function checkBehaviour(homes, samples, policy) {
  const k = policy.stuckSamples ?? 3;
  const driftTol = policy.driftTolKWh ?? 2;
  const devKw = policy.deviationKw ?? 2;
  const maxKw = policy.maxKw ?? 20;
  const flags = [];
  const lying = new Set();
  for (const h of homes) {
    const s = samples[h.id];
    if (!s || s.length < 2) continue;
    const last = s.slice(-k);
    const kinds = [];
    if (last.length >= k && last.every((x) => Math.abs(x.cmdKw) >= 1 && Math.abs(x.deliveredKw) >= 1) &&
        last.every((x) => Math.abs(x.socKWh - last[0].socKWh) < 1e-6))
      kinds.push(['stuck_soc', `SOC frozen at ${last[0].socKWh.toFixed(1)} kWh for ${k} samples while moving ~${Math.abs(last.at(-1).deliveredKw).toFixed(1)} kW`]);
    // coulomb count over the window vs reported change
    let est = s[0].socKWh;
    for (let i = 1; i < s.length; i++) est -= s[i].deliveredKw * (s[i].tSec - s[i - 1].tSec) / 3600;
    const drift = s.at(-1).socKWh - est;
    if (Math.abs(drift) > driftTol) kinds.push(['drift', `reported SOC is ${drift.toFixed(1)} kWh off the coulomb count`]);
    for (let i = 1; i < s.length; i++) {
      const dt = (s[i].tSec - s[i - 1].tSec) / 3600;
      if (Math.abs(s[i].socKWh - s[i - 1].socKWh) > maxKw * dt * 1.2 + 0.5) { kinds.push(['spike', 'SOC jumped faster than the inverter can move it']); break; }
    }
    const tail = s.slice(-2);
    if (tail.length === 2 && tail.every((x) => Math.abs(x.deliveredKw - x.cmdKw) > Math.max(devKw, 0.25 * Math.abs(x.cmdKw))))
      kinds.push(['deviation', `delivering ${tail[1].deliveredKw.toFixed(1)} kW vs ${tail[1].cmdKw.toFixed(1)} kW commanded`]);
    if (kinds.length) {
      lying.add(h.id);
      for (const [kind, detail] of kinds) flags.push({ homeId: h.id, kind, detail });
    }
  }
  const by = policy.cohortBy ?? ['firmware', 'circuit'];
  const cohorts = new Map();
  for (const h of homes) {
    const key = by.map((d) => h[d]).join('/');
    const e = cohorts.get(key) || { key, total: 0, lying: 0, members: [] };
    e.total++; e.members.push(h.id);
    if (lying.has(h.id)) e.lying++;
    cohorts.set(key, e);
  }
  const heldHomes = new Set(), watchHomes = new Set();
  const out = [];
  for (const e of cohorts.values()) {
    if (!e.lying) continue;
    const frac = e.lying / e.total;
    const hold = frac >= (policy.cohortFrac ?? 0.3) && e.lying >= (policy.minCohort ?? 5);
    out.push({ key: e.key, lying: e.lying, total: e.total, frac, action: hold ? 'hold' : 'watch' });
    if (hold) for (const id of e.members) heldHomes.add(id);
  }
  for (const id of lying) if (!heldHomes.has(id)) watchHomes.add(id);
  return { flags, cohorts: out, heldHomes, watchHomes };
}
