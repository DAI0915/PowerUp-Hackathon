/* PowerUP neighborhood islands: pure functions. Works in the browser (window.PowerUPIsland) and in node (module.exports).
   Given a feeder drawn as segments between switching devices, the segments the utility calls high risk, and the homes
   with their opt-in choices, it finds which de-energized pieces can safely run as a neighborhood island, plans how the
   shared battery energy is split, and settles who pays whom. Numbers marked "assumed" are placeholders for a pilot. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PowerUPIsland = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MODES = ['critical', 'essential', 'normal'];
  const BUDGET_KWH_DAY = { critical: 8, essential: 16, normal: 32 };   // same per-home budgets as the PowerUP replay
  const DEFAULTS = {
    capacity_kwh: 39.2,          // Base Core
    reserve_floor_pct: 20,       // Base's backup floor; never shared
    donor_keeps: 'essential',    // a donor keeps enough for its own home at this mode before sharing
    peak_factor: 2.5,            // assumed: island peak kW = average kW x this
    donor_kw: 11.5,              // assumed: export each donor inverter can give the island (Base Core is 20 kW)
    // money, all assumed for a pilot
    donor_rate_per_kwh: 0.75,    // paid to a battery owner for each kWh shared with neighbours
    receiver_rate_per_kwh: 1.00, // charged to a home without a battery for island energy
    subscription_per_month: 5,   // receivers pay this all year to be eligible
    utility_per_customer_hour: 2.0, // paid by the utility (Microgrid Incentive Program style) per customer-hour kept on
    platform_share: 0.15         // of island energy margin and utility payment
  };

  // ---------- 1. which segments are off, and why ----------
  // segments: [{id, parent, device, customers, line: 'overhead'|'underground', hfra}] ; device is the switch at the
  // segment's head (null if none: a fuse or solid tap that cannot be opened remotely). risky: ids the utility calls high risk.
  function classify(segments, risky) {
    const byId = new Map(segments.map(s => [s.id, s]));
    const kids = new Map(segments.map(s => [s.id, []]));
    segments.forEach(s => { if (s.parent != null) kids.get(s.parent).push(s.id); });
    const riskySet = new Set(risky);
    // the utility opens the nearest remotely operable device at or above each risky segment
    const opened = new Set();
    riskySet.forEach(id => {
      let s = byId.get(id);
      while (s && !s.device && s.parent != null) s = byId.get(s.parent);
      opened.add(s.id);
    });
    const off = new Set();
    const walk = id => { off.add(id); kids.get(id).forEach(walk); };
    opened.forEach(walk);
    const state = {};
    segments.forEach(s => {
      state[s.id] = riskySet.has(s.id) ? 'risk' : off.has(s.id) ? 'collateral' : 'on';
    });
    const count = st => segments.filter(s => state[s.id] === st).reduce((a, s) => a + s.customers, 0);
    return {
      state, opened: [...opened].map(id => byId.get(id).device || 'substation breaker'),
      customers: { risk: count('risk'), collateral: count('collateral'), on: count('on') }
    };
  }

  // ---------- 2. which collateral pieces can island ----------
  // An island is a connected group of collateral segments. It is allowed only when (a) a device separates it from every
  // de-energized neighbour that is risky or not in the island, and (b) none of its lines is overhead in a high fire risk
  // area, since re-energizing those wires brings the fire risk back.
  function findIslands(segments, cls) {
    const byId = new Map(segments.map(s => [s.id, s]));
    const kids = new Map(segments.map(s => [s.id, []]));
    segments.forEach(s => { if (s.parent != null) kids.get(s.parent).push(s.id); });
    const st = cls.state, seen = new Set(), islands = [];
    segments.forEach(s => {
      if (st[s.id] !== 'collateral' || seen.has(s.id)) return;
      const par = s.parent != null ? byId.get(s.parent) : null;
      if (par && st[par.id] === 'collateral') return;            // start from the top of each group
      const members = [], blockers = [];
      const grow = id => {
        seen.add(id); members.push(id);
        kids.get(id).forEach(k => {
          if (st[k] === 'collateral') grow(k);
          else if (!byId.get(k).device) blockers.push(`${k} is ${st[k]} with no switch between it and ${id}`);
        });
      };
      grow(s.id);
      if (par && !s.device) blockers.push(`no switch at the head of ${s.id}`);
      members.forEach(id => {
        const m = byId.get(id);
        if (m.line === 'overhead' && m.hfra) blockers.push(`${id} is overhead line in a high fire risk area`);
      });
      islands.push({
        id: 'island-' + s.id, head: s.device || null, segments: members,
        customers: members.reduce((a, id) => a + byId.get(id).customers, 0),
        allowed: blockers.length === 0, blockers
      });
    });
    return islands;
  }

  // ---------- 3. plan the energy inside one island ----------
  // homes: [{id, seg, battery_kwh (0 if none), soc (0..1), solar_kwh_day, grid_forming, choice: 'donor'|'receiver'|'out',
  //          medical, size}]  A community battery is just a donor with no load (size 0) and grid_forming true.
  // Opt-out homes are disconnected at the meter (smart meter service switch) so they draw nothing from the island.
  function planIsland(island, homes, hours, opts) {
    const P = Object.assign({}, DEFAULTS, opts || {});
    const inIsland = new Set(island.segments);
    const hs = homes.filter(h => inIsland.has(h.seg));
    const days = hours / 24;
    const donors = hs.filter(h => h.choice === 'donor' && h.battery_kwh > 0);
    // a rooftop solar home without a battery goes dark in an ordinary outage (its inverter needs a grid to follow); inside a
    // formed island it can run again, so it can offer its solar. It still needs power at night, so it is also a receiver.
    // (Planning level: daytime solar is assumed to be stored by the island's batteries for the night.)
    const solarOnly = hs.filter(h => h.choice === 'donor' && !(h.battery_kwh > 0) && h.solar_kwh_day > 0);
    const receivers = hs.filter(h => h.choice === 'receiver').concat(solarOnly);
    const out = hs.filter(h => h.choice === 'out');
    // a battery home that did not opt in still backs up itself behind its own gateway; it is outside the island's sums
    const selfBackup = hs.filter(h => h.choice !== 'out' && h.battery_kwh > 0 && h.choice !== 'donor');
    const need = (h, mode) => BUDGET_KWH_DAY[mode] * (h.size == null ? 1 : h.size) * days;
    const share = donors.map(h => {
      const usable = Math.max(0, h.battery_kwh * h.soc - h.battery_kwh * P.reserve_floor_pct / 100);
      const own = need(h, P.donor_keeps);
      const solar = (h.solar_kwh_day || 0) * days;
      return { id: h.id, kwh: Math.max(0, usable + solar - own) };
    }).concat(solarOnly.map(h => ({ id: h.id, kwh: h.solar_kwh_day * days })));
    const pool = share.reduce((a, d) => a + d.kwh, 0);
    // Medical Baseline receivers get critical first; then everyone rises together to the richest mode the pool carries
    const med = receivers.filter(h => h.medical);
    const medNeed = med.reduce((a, h) => a + need(h, 'critical'), 0);
    let mode = null, used = 0;
    if (pool >= medNeed) {
      for (const m of MODES) {
        const tot = receivers.reduce((a, h) => a + need(h, m), 0);
        if (tot <= pool) { mode = m; used = tot; }
      }
    }
    const fullHours = mode === null && receivers.length
      ? Math.floor(24 * pool / receivers.reduce((a, h) => a + BUDGET_KWH_DAY.critical * (h.size == null ? 1 : h.size), 0))
      : hours;
    const allCritical = receivers.reduce((a, h) => a + need(h, 'critical'), 0);
    if (mode === null) used = Math.min(pool, allCritical);
    // power: the island needs one grid-forming source and enough inverter export for the peak
    const avgKw = receivers.reduce((a, h) => a + BUDGET_KWH_DAY[mode || 'critical'] * (h.size == null ? 1 : h.size), 0) / 24;
    const peakKw = avgKw * P.peak_factor;
    const exportKw = donors.reduce((a, h) => a + (h.export_kw || P.donor_kw), 0);
    const formers = donors.filter(h => h.grid_forming);
    const problems = [];
    if (!island.allowed) problems.push(...island.blockers);
    if (!formers.length) problems.push('no grid-forming source in the island');
    if (exportKw < peakKw) problems.push(`inverters give ${exportKw.toFixed(0)} kW, the peak needs ${peakKw.toFixed(0)} kW`);
    if (pool < medNeed) problems.push('shared energy does not cover Medical Baseline receivers at critical');
    // each donor gives in proportion to what it offered
    const given = share.map(d => ({ id: d.id, kwh: pool ? used * d.kwh / pool : 0 }));
    return {
      island: island.id, hours, feasible: problems.length === 0, problems,
      shortfall_kwh: round(Math.max(0, allCritical - pool)),   // extra storage to carry every receiver at critical
      counts: { donors: donors.length, solar_only: solarOnly.length, receivers: receivers.length, opted_out: out.length, self_backup: selfBackup.length },
      pool_kwh: round(pool), used_kwh: round(used), receiver_mode: mode, receiver_hours: mode ? hours : fullHours,
      peak_kw: round(peakKw), export_kw: round(exportKw), grid_forming: formers.map(h => h.id), given
    };
  }

  // ---------- 4. settle ----------
  // customer-hours kept on = receivers x hours they were carried (donors and self-backup homes would have had power anyway)
  function settle(plan, opts) {
    const P = Object.assign({}, DEFAULTS, opts || {});
    if (!plan.feasible) return { paid_to_donors: 0, charged_to_receivers: 0, utility_payment: 0, platform: 0, customer_hours: 0 };
    const donorPay = plan.given.reduce((a, d) => a + d.kwh * P.donor_rate_per_kwh, 0);
    const receiverCharge = plan.used_kwh * P.receiver_rate_per_kwh;
    const custHours = plan.counts.receivers * plan.receiver_hours;
    const utility = custHours * P.utility_per_customer_hour;
    const margin = receiverCharge - donorPay;
    const platform = P.platform_share * (Math.max(0, margin) + utility);
    return {
      customer_hours: custHours, paid_to_donors: round(donorPay), charged_to_receivers: round(receiverCharge),
      utility_payment: round(utility), platform: round(platform),
      donors: plan.given.map(d => ({ id: d.id, kwh: round(d.kwh), paid: round(d.kwh * P.donor_rate_per_kwh) })),
      // the rest of the utility payment funds the switch and the grid-forming battery (assumed split)
      to_infrastructure: round(utility + Math.max(0, margin) - platform)
    };
  }

  // ---------- 5. transformer islands (the pilot) ----------
  // A switch on the low-voltage side of one service transformer islands only that transformer's 240 V secondary. Nothing
  // at distribution voltage is re-energized, so it can run even inside a risky segment when the secondary is underground.
  function transformerIsland(xfmr, homes, hours, opts) {
    const island = {
      id: 'xfmr-' + xfmr.id, segments: [xfmr.seg], customers: xfmr.homes.length,
      allowed: xfmr.secondary === 'underground' && !!xfmr.switch,
      blockers: [!xfmr.switch && 'no secondary isolation switch fitted', xfmr.secondary !== 'underground' && 'overhead secondary'].filter(Boolean)
    };
    const ids = new Set(xfmr.homes);
    return planIsland(island, homes.filter(h => ids.has(h.id)), hours, opts);
  }

  // ---------- 6. where a new switch pays off ----------
  // For each segment with no switch at its head, how many fewer customers would lose power in this shutoff if one were
  // fitted there. This is how the pilot picks its first isolation switches.
  function switchValue(segments, risky) {
    const base = classify(segments, risky).customers;
    const offBase = base.risk + base.collateral;
    return segments.filter(s => !s.device && s.parent != null).map(s => {
      const trial = segments.map(x => x.id === s.id ? Object.assign({}, x, { device: 'NEW-' + s.id }) : x);
      const c = classify(trial, risky).customers;
      return { segment: s.id, customers_kept_on: offBase - (c.risk + c.collateral) };
    }).sort((a, b) => b.customers_kept_on - a.customers_kept_on);
  }

  function round(x) { return Math.round(x * 10) / 10; }

  return { MODES, BUDGET_KWH_DAY, DEFAULTS, classify, findIslands, planIsland, settle, transformerIsland, switchValue };
});
