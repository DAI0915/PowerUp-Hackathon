/* PowerUp bridge: Grace plans, Interlock guards. Pure functions. Works in the browser (window.PowerUp) and in node (module.exports).
 *
 * Grace never commands a battery directly. Each Grace order becomes a signed, OpenADR-style command that passes Interlock's
 * eight checks, and the reserve Grace plans for each home (100% for Medical Baseline homes from the first wind signal, and so on
 * down the ladder) becomes the floor Interlock enforces against every other sender: Base's daily optimizer, a market bid, the
 * utility's own emergency event, or a forged order.
 *
 * Dependencies are passed in, so the same file runs in both places:
 *   G = the Grace engine (grace/app/src/engine.js)
 *   I = Interlock: { evaluate, signCommand, requestedKw, getPack, DEMO_KEYS } (interlock/src/engine.mjs + packs.mjs)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PowerUp = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GRACE = { id: 'base-grace', role: 'aggregator' };
  const GRACE_KEY = 'k-grace-6e10';        // demo stand-in key, like Interlock's DEMO_KEYS (not cryptography)
  const EXPORT_CAP_FRAC = 0.15;            // ASSUMED: reverse flow allowed on a Malibu circuit, as a share of its cap
  const STEP_MIN = 60;                     // Grace's replay steps hourly
  const SRC = {
    grace: GRACE,
    optimizer: { id: 'base-optimizer', role: 'aggregator' },
    utility: { id: 'sce-drms', role: 'utility' },
    market: { id: 'caiso-market', role: 'market' },
    forged: { id: 'sce-drms-backup', role: 'utility' }   // not on the trusted list
  };
  const EPOCH = { 'base-grace': 1, 'base-optimizer': 42, 'sce-drms': 7, 'caiso-market': 3, 'sce-drms-backup': 1 };

  // Malibu failures, SIMULATED, each one a kind the hackathon prompt names: doing what nobody authorized, somewhere it
  // shouldn't be, or a sender that doesn't know about the shutoff. Times are Grace replay hours (0 = Oct 7, 00:00).
  const D = (day, hour) => (day - 7) * 24 + hour;
  function chaos(sim) {
    const firstRestore = Math.min.apply(null, Object.keys(sim.circuits).map(c => sim.circuits[c].restoreH));
    const list = [
      { h: D(13, 17), id: 'sce-event', who: 'utility', truth: 'legit', tag: 'Utility event',
        title: 'SCE emergency event: export 5 kW per home for 2 hours',
        why: 'A hot, dry Santa Ana evening two days before the shutoff, with the grid tight. Valid, signed, top priority.',
        command: { priority: 0, targets: { all: true }, payload: { type: 'EXPORT_KW', value: 5 }, durationMin: 120 } },
      { h: D(14, 17), id: 'replay', who: 'optimizer', truth: 'malicious', tag: 'Replay', replayOf: 'opt-evening-oct8',
        title: 'Replay: a captured Oct 8 evening discharge order is sent again',
        why: 'Someone recorded a real, validly signed order and re-sends it the evening before the shutoff.' },
      { h: D(15, 13), id: 'sell-down', who: 'market', truth: 'unsafe', tag: 'Unsafe',
        title: 'Market bid: sell every battery down to 10% by 4 PM',
        why: 'A market optimizer that does not know a shutoff starts at 4 PM. Valid signer, terrible timing.',
        command: { priority: 7, targets: { all: true }, payload: { type: 'SOC_TARGET', value: 10 }, durationMin: 180 } },
      { h: D(15, 20), id: 'stolen-key', who: 'forged', truth: 'malicious', tag: 'Forged',
        title: 'Stolen key posing as SCE: discharge every battery at 20 kW',
        why: 'Four hours into the shutoff an unknown signer claims to be the utility.',
        command: { priority: 0, targets: { all: true }, payload: { type: 'DISCHARGE_KW', value: 20 }, durationMin: 60 } },
      { h: D(16, 12), id: 'dead-line', who: 'market', truth: 'unsafe', tag: 'Dead line',
        title: 'Market export onto the de-energized Tuna line',
        why: 'A market award asks Tuna\'s batteries to export while SCE crews patrol a line they believe is dead.',
        command: { priority: 7, targets: { circuits: ['Tuna'] }, payload: { type: 'EXPORT_KW', value: 5 }, durationMin: 120 } }
    ];
    if (Number.isFinite(firstRestore)) list.push({ h: firstRestore, id: 'rebound', who: 'optimizer', truth: 'unsafe', tag: 'Rebound',
      title: 'Optimizer rebound: recharge every battery at 20 kW the moment the first circuit is back',
      why: 'The daily optimizer sees empty batteries and cheap power, and orders a full-speed recharge into cold-load pickup.',
      command: { priority: 5, targets: { all: true }, payload: { type: 'CHARGE_KW', value: 20 }, durationMin: 120 } });
    return list;
  }

  const RUNGS = ['none', 'watch', 'ask', 'slow', 'hold', 'hand'];
  const maxRung = (a, b) => (RUNGS.indexOf(b) > RUNGS.indexOf(a) ? b : a);

  function policyFor(I, pack) {
    const p = I.getPack(pack || 'sce');
    return Object.assign({}, p, { trustedSources: Object.assign({}, p.trustedSources, { 'base-grace': { role: 'aggregator', key: GRACE_KEY } }) });
  }
  function keyOf(I, id) { return id === 'base-grace' ? GRACE_KEY : (I.DEMO_KEYS[id] || 'k-unknown-' + id); }

  // ---------- Grace's reserve per home: the ladder, mirrored from Grace's engine ----------
  function reserveKWh(ctx, b, h, soc) {
    const P = ctx.P, cap = P.capacity_kwh, R = ctx.sim.rungs, named = ctx.sim.namedH[b.circuit];
    const floor = cap * P.reserve_floor_pct / 100, ask = Math.max(floor, cap * P.ask_floor_pct / 100);
    const cc = ctx.sim.circuits[b.circuit];
    if (h >= R.hold && h >= cc.restoreH) return floor;              // circuit back: the ordinary 20% floor again
    if (b.tier === 1 && h >= R.watch) return cap;                   // Medical Baseline: full from the first wind signal
    if (b.tier === 2 && h >= named) return cap;                     // registered critical need: full once SCE names the circuit
    if (b.tier === 3 && h >= R.fill && h >= named + b.consentDelay) return cap;  // everyone who said yes: full once definite
    // once the shutoff is definite, a battery whose owner declined pre-fill is not filled, but nothing is sold out of it either
    if (b.tier === 3 && h >= R.fill && h >= named) return Math.max(ask, Math.min(cap, soc || 0));
    if (b.tier === 3 && h >= named) return ask;                     // everyone else on a named circuit: raised floor
    return floor;
  }

  function context(G, I, DATA, world, P, sim, opts) {
    opts = opts || {};
    const cap = P.capacity_kwh, homes = {};
    for (const b of world.batteries) homes['b' + b.bi] = { id: 'b' + b.bi, bi: b.bi, circuit: b.circuit, socKWh: cap * 0.9, capacityKWh: cap,
      maxKw: P.power_kw, medical: b.tier === 1, tier: b.tier, loadKw: 0, reserveKWh: 0 };
    return { G, I, DATA, world, P, sim, N: sim.N, cap, homes, homeIds: Object.keys(homes), policy: policyFor(I, opts.pack) };
  }

  // Interlock's view of the fleet at the start of hour h, read from a Grace run
  function stateAt(ctx, h) {
    const { G, sim, world, P, N, cap, homes } = ctx;
    const hour = h % 24, prof = world.prof, KW = G.KW_PER_UNIT, C = sim.C, S = sim.S;
    const excluded = {}, snap = {};
    for (const id of ctx.homeIds) {
      const hm = snap[id] = Object.assign({}, homes[id]), b = world.batteries[hm.bi], prev = (h - 1) * N + hm.bi;
      hm.socKWh = h > 0 ? sim.soc[prev] : cap * 0.9;
      hm.loadKw = P.daily_use_kwh * b.factor * prof[b.circuit].shape[hour];
      hm.reserveKWh = reserveKWh(ctx, b, h, hm.socKWh);
      if (h > 0) {
        const ch = sim.chan[prev], st = sim.status[prev];
        if (st === S.fault) excluded[id] = 'faulted';
        else if (ch === C.silent_tower) excluded[id] = 'quiet behind a dead cell tower';
        else if (ch === C.silent_check) excluded[id] = 'quiet, needs a check';
      }
    }
    const circuits = {};
    for (const c of G.NAMED) {
      const cc = sim.circuits[c], lim = cc.capA * KW / 1000;
      circuits[c] = { id: c, name: c, open: cc.state[h] === 1, restoring: cc.state[h] === 2,
        baseLoadMW: Math.max(0, cc.gridA[h] * KW - cc.chargeKW[h]) / 1000, otherFleetKw: -cc.chargeKW[h],
        importLimitMW: lim, exportCapMW: -EXPORT_CAP_FRAC * lim };
    }
    return { nowMin: h * 60, stepMin: STEP_MIN, homes: snap, homeIds: ctx.homeIds, circuits, excluded };
  }

  // ---------- the orders ----------
  function graceOrders(ctx, decisions) {
    const { sim, world, P, G } = ctx, R = sim.rungs, named = sim.namedH, bat = world.batteries;
    const ids = f => bat.filter(f).map(b => 'b' + b.bi);
    const untilHold = h => (R.hold - h) * 60;
    const askC = G.NAMED.filter(c => named[c] === R.ask), fillC = G.NAMED.filter(c => named[c] === R.fill);
    const out = [];
    // Base's ordinary-day optimizer: cover each home's evening load from its battery (a plain rule, not Base's real policy)
    for (let d = 0; d * 24 + 16 < R.hold; d++) {
      const h = d * 24 + 16;
      let load = 0;
      for (const b of bat) load += P.daily_use_kwh * b.factor * world.prof[b.circuit].shape[18];
      out.push({ h, id: `opt-evening-oct${7 + d}`, who: 'optimizer', truth: 'legit', tag: 'Every day',
        title: `Base optimizer, Oct ${7 + d}: cover evening load from batteries (ordinary-day arbitrage)`,
        command: { priority: 5, targets: { all: true }, payload: { type: 'DISCHARGE_KW', value: Math.round(load / bat.length * 10) / 10 }, durationMin: 300 } });
    }
    out.push({ h: R.watch, id: 'grace-watch', who: 'grace', truth: 'legit', tag: 'Watch', rung: 'watch',
      title: 'Grace Watch: fill Medical Baseline homes to 100% and hold them',
      command: { priority: 4, targets: { homes: ids(b => b.tier === 1) }, payload: { type: 'SOC_TARGET', value: 100 }, durationMin: untilHold(R.watch) } });
    out.push({ h: R.ask, id: 'grace-ask', who: 'grace', truth: 'legit', tag: 'Ask', rung: 'ask',
      title: `Grace Ask: fill registered critical-need homes on ${askC.join(', ')}; everyone else there keeps 50% and is asked to pre-fill`,
      command: { priority: 4, targets: { homes: ids(b => b.tier === 2 && askC.includes(b.circuit)) }, payload: { type: 'SOC_TARGET', value: 100 }, durationMin: untilHold(R.ask) } });
    out.push({ h: R.fill, id: 'grace-fill', who: 'grace', truth: 'legit', tag: 'Fill', rung: 'fill',
      title: 'Grace Fill: every battery whose owner said yes goes to 100% under each circuit\'s headroom',
      command: { priority: 4, targets: { homes: ids(b => (b.tier === 3 && Number.isFinite(b.consentDelay)) || (b.tier === 2 && fillC.includes(b.circuit))) },
        payload: { type: 'SOC_TARGET', value: 100 }, durationMin: untilHold(R.fill) } });
    out.push({ h: R.hold, id: 'grace-hold', who: 'grace', truth: 'legit', tag: 'Hold', rung: 'hold',
      title: 'Grace Hold: every battery islands, never exports, and runs its home on the outage budget',
      command: { priority: 4, targets: { all: true }, payload: { type: 'IDLE', value: 0 }, durationMin: P.planned_outage_h * 60 } });
    for (const p of sim.proposals.restore || []) {
      if ((decisions.restore || {})[p.circuit] !== 'approved') continue;
      const h = p.chargeStartH, cc = sim.circuits[p.circuit];
      if (h >= sim.HOURS || !(cc.chargeKW[h] > 0)) continue;
      const room = cc.members.filter(bi => sim.soc[(h - 1) * ctx.N + bi] < ctx.cap - 1);
      if (!room.length) continue;
      out.push({ h, id: `grace-recharge-${p.circuit}`, who: 'grace', truth: 'legit', tag: 'Hand', rung: 'hand',
        title: `Grace recharge on ${p.circuit}, approved by SCE's shutoff officer, after the cold-load pickup`,
        command: { priority: 4, targets: { homes: room.map(bi => 'b' + bi) }, payload: { type: 'CHARGE_KW', value: Math.floor(cc.chargeKW[h] / room.length * 10) / 10 }, durationMin: 60 } });
    }
    for (const o of out) o.plan = true;
    return out;
  }

  function sign(ctx, o, signedById) {
    const I = ctx.I;
    if (o.replayOf) return signedById[o.replayOf];
    const src = SRC[o.who];
    return I.signCommand({ id: o.id, source: src, issuedAt: o.h * 60, epoch: EPOCH[src.id], priority: o.command.priority,
      targets: o.command.targets, payload: o.command.payload, durationMin: o.command.durationMin }, keyOf(I, src.id));
  }

  // ---------- run every order through Interlock ----------
  function guard(ctx, orders) {
    const I = ctx.I, policy = ctx.policy;
    const ledger = { seen: {}, epochs: Object.assign({}, EPOCH), admitted: {}, approved: {}, personApproved: {}, blocked: {} };
    delete ledger.epochs['sce-drms-backup'];
    const active = [], canary = {}, signedById = {}, log = [];
    const sorted = orders.slice().sort((a, b) => a.h - b.h || (a.who === 'grace' ? 0 : 1) - (b.who === 'grace' ? 0 : 1));
    for (const o of sorted) {
      const cmd = sign(ctx, o, signedById);
      if (!o.replayOf) signedById[o.id] = cmd;
      const st = stateAt(ctx, o.h);
      Object.assign(st, { ledger, canary, active: active.filter(a => a.issuedAt + a.durationMin > o.h * 60) });
      // Grace's own charging this hour is already in the circuit's load; when the order being checked IS that charging,
      // count it once
      if (o.plan && o.command && o.command.payload.type === 'CHARGE_KW') for (const c in st.circuits) st.circuits[c].otherFleetKw = 0;
      let r = I.evaluate(cmd, st, policy);
      const first = r;
      let stages = 0;
      // a canary advances one 5-minute step at a time while it behaves (the replay assumes it does)
      while (r.verdict === 'canary' && stages < 4) {
        ledger.admitted[cmd.id] = cmd.sig;
        canary[cmd.id] = { stage: ((canary[cmd.id] && canary[cmd.id].stage) || 0) + 1, behaved: true };
        st.nowMin += 5; stages++;
        r = I.evaluate(cmd, st, policy);
      }
      ledger.seen[cmd.id] = cmd.sig;
      const ran = r.verdict !== 'hold' && r.verdict !== 'escalate';
      if (ran) { ledger.admitted[cmd.id] = cmd.sig; active.push(cmd); }
      const canaryNote = { check: 'ramp', code: 'CANARY_DONE', rung: 'slow',
        detail: `Large order (${(r.stats.homesTouched || 0).toLocaleString('en-US')} homes): rolled out as a canary, 1% of homes, then 10%, then all, five minutes apart; each step delivered on target.` };
      const reasons = stages ? [canaryNote].concat(r.reasons.filter(x => x.code !== 'CANARY')) : r.reasons;
      log.push({ order: o, cmd, verdict: r.verdict, canaried: stages > 0, rung: reasons.reduce((m, x) => maxRung(m, x.rung), 'none'),
        reasons, stats: r.stats, perHome: r.perHome, ran, state: st });
    }
    return log;
  }

  // ---------- what each order does to the batteries, with and without the guard ----------
  // Energy pushed out of a battery beyond its own home's use (the home's use is already in Grace's plan). Applied at the
  // start of the hour after the order's window ends, so Grace then reacts to whatever is left.
  function effects(ctx, entry, guarded) {
    const { cmd, state } = entry, P = ctx.P, I = ctx.I;
    const durH = cmd.durationMin / 60, endH = Math.min(ctx.sim.HOURS - 1, entry.order.h + Math.ceil(durH));
    const ext = {}, type = cmd.payload.type;
    let deadLineBatteryH = 0, energyKWh = 0, homesMoved = 0;
    // every home the order names, whether or not Interlock let it through (with the guard off, it all runs as sent)
    const ids = Array.from(I.targetSet(cmd, state));
    const mb = new Set();
    for (const id of ids) {
      const hm = state.homes[id];
      const kw = guarded ? (entry.ran ? (entry.perHome[id] || 0) : 0) : I.requestedKw(cmd, hm, entry.order.h * 60, STEP_MIN);
      const k = Math.max(-P.power_kw, Math.min(P.power_kw, kw));
      if (Math.abs(k) < 1e-6) continue;
      const load = hm.loadKw, soc = hm.socKWh;
      const open = state.circuits[hm.circuit].open;
      if (k > 0) {
        const beyond = Math.max(0, k - load);
        if (open && beyond > 0) deadLineBatteryH += durH;
        if (type === 'SOC_TARGET') {
          const target = Math.max(0, soc - k * durH);
          ext[hm.bi] = { max: target };
          energyKWh += soc - target;
        } else {
          const kwh = Math.min(soc, beyond * durH);
          ext[hm.bi] = kwh;
          energyKWh += kwh;
        }
        homesMoved++;
        if (hm.tier === 1) mb.add(hm.bi);
      } else if (!open) {
        energyKWh += k * durH;   // charging (negative); no effect on a de-energized circuit
        homesMoved++;
      }
    }
    // circuit loading when the order charges (the rebound): worst MW over the cap across energized circuits
    let overMW = 0, overCircuit = null;
    if (type === 'CHARGE_KW') {
      const byC = {};
      for (const id of ids) {
        const hm = state.homes[id];
        if (state.circuits[hm.circuit].open) continue;
        const kw = guarded ? (entry.ran ? (entry.perHome[id] || 0) : 0) : I.requestedKw(cmd, hm, entry.order.h * 60, STEP_MIN);
        byC[hm.circuit] = (byC[hm.circuit] || 0) + Math.max(-P.power_kw, kw);
      }
      for (const c in byC) {
        const sc = state.circuits[c];
        const net = sc.baseLoadMW - (sc.otherFleetKw + byC[c]) / 1000;
        if (net - sc.importLimitMW > overMW) { overMW = net - sc.importLimitMW; overCircuit = c; }
      }
    }
    return { endH, ext, deadLineBatteryH, energyKWh, homesMoved, mbDrained: mb.size, mb, overMW, overCircuit };
  }

  function outcomes(sim, world, P) {
    const R = sim.rungs, N = sim.N, cap = P.capacity_kwh, S = sim.S, bat = world.batteries;
    let darkH = 0, mbDarkH = 0, mbBelowFull = 0, mbSocAtOff = 0, mbN = 0;
    const dark = new Set(), mbDark = new Set();
    for (let h = R.hold; h < sim.HOURS; h++) {
      for (let bi = 0; bi < N; bi++) {
        const b = bat[bi];
        if (sim.circuits[b.circuit].state[h] !== 1) continue;
        if (sim.status[h * N + bi] === S.empty) { darkH++; dark.add(bi); if (b.tier === 1) { mbDarkH++; mbDark.add(bi); } }
      }
    }
    // charge at the end of the shutoff's first hour (orders that ran up to 4 PM land at the start of that hour)
    for (let bi = 0; bi < N; bi++) if (bat[bi].tier === 1) {
      const s = sim.soc[R.hold * N + bi];
      mbN++; mbSocAtOff += s; if (s < cap * 0.5) mbBelowFull++;
    }
    return { darkHomes: dark.size, darkHomeHours: darkH, mbDarkHomes: mbDark.size, mbDarkHomeHours: mbDarkH,
      mbBelowHalfAtShutoff: mbBelowFull, mbSocAtShutoffPct: mbN ? mbSocAtOff / mbN / cap * 100 : 0,
      fleetSocAtShutoffPct: sim.fleet[R.hold].socPct, protectedHomeHours: sim.totals.protectedHours,
      evProposed: sim.totals.evProposed, unmet: sim.totals.unmet };
  }

  /**
   * run({G, I, DATA, world, P, decisions, chaos: true|false, variants: ['on','off'], base?})
   * Returns { log, base, sims: {on, off}, metrics: {base, on, off}, exposure: {on, off} }.
   *  log: one entry per order in time order, with Interlock's verdict, rung and plain-English reasons, plus `on`/`off` effects.
   *  sims.on / sims.off: Grace re-run with what each order actually did to the batteries with the guard on / off.
   */
  function run(opts) {
    const { G, I, DATA, world, P } = opts;
    const decisions = opts.decisions || { restore: {}, ev: {} };
    const base = opts.base || G.simulate(DATA, world, P, decisions);
    const ctx = context(G, I, DATA, world, P, base, opts);
    const orders = graceOrders(ctx, decisions).concat(opts.chaos === false ? [] : chaos(base));
    const log = guard(ctx, orders);
    const out = { log, base, sims: {}, metrics: { base: outcomes(base, world, P) }, exposure: {} };
    for (const variant of opts.variants || ['on', 'off']) {
      const ext = {}, ex = { deadLineBatteryH: 0, worstOverMW: 0, worstOverCircuit: null, homesDrained: 0, mbDrained: 0, eventMWh: 0 };
      const drained = new Set(), mbDrained = new Set();
      for (const e of log) {
        if (e.order.plan) continue; // Grace's own orders and the daily optimizer are already in Grace's plan
        const f = effects(ctx, e, variant === 'on');
        e[variant] = f;
        for (const bi in f.ext) { (ext[f.endH] = ext[f.endH] || {})[bi] = f.ext[bi]; }
        ex.deadLineBatteryH += f.deadLineBatteryH;
        if (f.overMW > ex.worstOverMW) { ex.worstOverMW = f.overMW; ex.worstOverCircuit = f.overCircuit; }
        if (e.order.truth !== 'legit') { for (const bi in f.ext) drained.add(bi); for (const bi of f.mb) mbDrained.add(bi); }
        else if (e.cmd.payload.type === 'EXPORT_KW') ex.eventMWh += f.energyKWh / 1000;
        delete f.mb;
      }
      const sim = G.simulate(DATA, world, P, Object.assign({}, decisions, { external: ext }));
      out.sims[variant] = sim;
      out.metrics[variant] = outcomes(sim, world, P);
      ex.homesDrained = drained.size; ex.mbDrained = mbDrained.size;
      out.exposure[variant] = ex;
    }
    return out;
  }

  // a short scoreboard of the Grace orders themselves: did the guard ever stop Grace?
  function graceSummary(log) {
    const g = log.filter(e => e.order.who === 'grace');
    return { orders: g.length, held: g.filter(e => !e.ran).length, clamped: g.filter(e => e.verdict === 'clamp').length,
      canaried: g.filter(e => e.canaried).length, passed: g.filter(e => e.ran && e.verdict !== 'clamp').length };
  }

  return { run, chaos, graceOrders, reserveKWh, stateAt, context, outcomes, graceSummary, policyFor, GRACE, GRACE_KEY, EXPORT_CAP_FRAC };
});
