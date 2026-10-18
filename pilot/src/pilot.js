/* PowerUP pilot behind SCE switch RAR8848 (Cuthbert circuit, Malibu): pure functions. Works in the browser
   (window.PowerUPPilot, needs window.PowerUPIsland) and in node (module.exports).
   The startup buys Base Core batteries, places them free in homes that volunteer to share with neighbours, earns on
   ordinary days, and holds them full when a shutoff is coming. This file answers three questions:
   1. what one battery earns on an ordinary day, 2. what each readiness rule costs in earnings given up,
   3. how many homes each rule keeps on through Cuthbert's 16 real shutoffs. Numbers marked "assumed" are placeholders. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../islands/island.js'));
  else root.PowerUPPilot = factory(root.PowerUPIsland);
})(typeof self !== 'undefined' ? self : this, function (Island) {
  'use strict';

  const BASE = { kwh: 39.2, kw: 20, floor: 0.2 };             // Base Core; the 20% floor is never shared or sold
  const OWN = { kwh: 20, kw: 10 };                            // real Malibu median home battery (SCE records)
  const SOLAR_KWH_DAY = 27;                                   // assumed: 8.2 kW median roof x 3.3 kWh/kW/day
  const LEAD_DAYS = { forecast: 6.5, notice: 3, dayBefore: 1 };  // real, Bryson Fire 2026: first Santa Ana signal Oct 9,
                                                              // SCE named Cuthbert Oct 12, shutoff Oct 15 5 PM
  const FALSE_ALARM = 509245 / 152393;                        // real: SCE notified 3.3 customers per one cut (Jan 20 2025)

  const DEFAULTS = {
    free: 56,                 // startup batteries placed free in volunteer homes
    solarFirst: true,         // offer them to homes with solar and no battery first (they refill every day)
    solarKwhDay: SOLAR_KWH_DAY, // per roof; smoke can halve it
    ownerShares: 0.6,         // assumed: homes with their own battery that opt in to share
    receiverJoins: 0.5,       // assumed: homes without a battery that join as receivers (medical homes always join)
    capex: 20000,             // assumed: installed cost of one Base Core; Base publishes none
    itc: 0.30,                // federal investment tax credit for business-owned storage (assumed to still apply)
    capacityPerKwMonth: 8,    // assumed: resource adequacy price (SB 913 lets aggregated home batteries count)
    capacityKw: 9.8,          // a 2-hour battery counts for a quarter of 39.2 kWh under 4-hour rules (assumed)
    elrpPerKwh: 2,            // real: CPUC Emergency Load Reduction Program pays $2/kWh exported in an event
    elrpEventsPerYear: 10,    // assumed
    eventsPerYear: 16 / 5.24  // real: 16 shutoffs cut these homes from Oct 30 2019 to Jan 24 2025
  };

  // readiness rules: how long before a shutoff the batteries stop trading, and how full they wait
  const RULES = [
    { id: 'never', label: 'Never hold, keep trading', lead: 0, level: BASE.floor, note: 'Worst case: a battery has just sold down to its 20% floor when the power goes.' },
    { id: 'forecast', label: 'Fill all at the first forecast', lead: LEAD_DAYS.forecast, level: 1 },
    { id: 'notice', label: 'Fill all when SCE sends notice', lead: LEAD_DAYS.notice, level: 1 },
    { id: 'dayBefore', label: 'Fill all 24 h before', lead: LEAD_DAYS.dayBefore, level: 1 },
    { id: 'medical', label: 'Medical first: enough for medical homes at notice, the rest 24 h before', lead: LEAD_DAYS.dayBefore, level: 1, medicalLead: LEAD_DAYS.notice },
    { id: 'eighty', label: 'Hold at 80% from notice', lead: LEAD_DAYS.notice, level: 0.8 }
  ];

  // ---------- homes ----------
  // data homes carry real-rate draws (battery, solar, medical) and two fixed random numbers u, v for choices
  function assign(dataHomes, opts) {
    const P = Object.assign({}, DEFAULTS, opts || {});
    const hs = dataHomes.map(h => {
      const o = { id: h.id, seg: 'A', x: h.x, y: h.y, medical: h.medical, size: h.size, battery_kwh: 0, soc: 0,
                  solar_kwh_day: h.solar ? P.solarKwhDay : 0, owner: null, grid_forming: false };
      if (h.battery) { Object.assign(o, { battery_kwh: OWN.kwh, export_kw: OWN.kw, owner: 'home', choice: h.u < P.ownerShares ? 'donor' : 'self' }); }
      else if (h.medical || h.u < P.receiverJoins) o.choice = h.solar ? 'donor' : 'receiver';  // solar without a battery
      else o.choice = 'out';                                      // also offers its daytime power once it joins
      o._v = h.v; o._solarOnly = h.solar && !h.battery;
      return o;
    });
    // Medical Baseline homes are offered a free battery first, then (optionally) solar roofs, then anyone who volunteers
    const order = hs.filter(h => !h.battery_kwh).sort((a, b) => (b.medical - a.medical) ||
      (P.solarFirst ? (b._solarOnly - a._solarOnly) : 0) || (a._v - b._v));
    order.slice(0, P.free).forEach((h, k) => {
      Object.assign(h, { battery_kwh: BASE.kwh, export_kw: BASE.kw, owner: 'startup', choice: 'donor', grid_forming: k === 0 });
    });
    return hs;
  }

  // how many startup batteries the medical homes need held from notice: their critical energy for the longest real
  // shutoff, plus the grid-former
  function medicalHold(homes, hours) {
    const need = homes.filter(h => h.medical && h.choice === 'receiver')
      .reduce((a, h) => a + Island.BUDGET_KWH_DAY.critical * h.size * hours / 24, 0);
    return Math.min(homes.filter(h => h.owner === 'startup').length, 1 + Math.ceil(need / (BASE.kwh * (1 - BASE.floor))));
  }

  // state of charge when the power goes, per rule. Home-owned batteries get the same ask as the fleet.
  function socAtShutoff(homes, rule) {
    // under the medical rule every battery is full by the shutoff; the early holders only cost more (see yearMoney)
    return homes.map(h => h.battery_kwh ? Object.assign({}, h, { soc: rule.level }) : h);
  }

  // ---------- one shutoff ----------
  const ISLAND = { id: 'RAR8848', segments: ['A'], allowed: true, blockers: [] };
  function runEvent(homes, hours) {
    const p = Island.planIsland(ISLAND, homes, hours, { donor_keeps: 'critical', reserve_floor_pct: BASE.floor * 100 });
    const carried = p.receiver_mode ? hours : Math.min(hours, p.receiver_hours);
    const receivers = p.counts.receivers;
    const medRecv = homes.filter(h => h.medical && h.choice === 'receiver').length;
    const medicalOk = !p.problems.some(s => s.includes('Medical'));
    return {
      hours, carried, full: carried >= hours && p.feasible, mode: p.receiver_mode, receivers,
      receiverHoursDark: receivers * (hours - carried), medicalDark: medicalOk ? 0 : medRecv,
      pool: p.pool_kwh, problems: p.problems, plan: p
    };
  }

  // ---------- money ----------
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  function priceStats(prices) {
    return { day20: mean(prices.map(p => p.v20)), day80: mean(prices.map(p => p.v80)), days: prices.length };
  }
  // earnings given up per battery-day while waiting at a level: arbitrage at the 20% floor minus what is left above it
  function holdCostPerDay(stats, level) {
    if (level <= BASE.floor) return 0;
    if (level >= 1) return stats.day20;
    return stats.day20 - stats.day80;                         // 80% is the only partial level the price file has
  }
  // per battery per year
  function yearMoney(stats, rule, opts, earlyShare) {
    const P = Object.assign({}, DEFAULTS, opts || {});
    const arbitrage = 365 * stats.day20;
    const capacity = 12 * P.capacityPerKwMonth * P.capacityKw;
    const elrp = P.elrpEventsPerYear * P.elrpPerKwh * BASE.kwh * (1 - BASE.floor);
    const holds = P.eventsPerYear * FALSE_ALARM;               // every notice is a hold, cut or not
    let readiness = holds * rule.lead * holdCostPerDay(stats, rule.level);
    if (rule.medicalLead) readiness += holds * (rule.medicalLead - rule.lead) * holdCostPerDay(stats, 1) * (earlyShare || 0);
    const net = arbitrage + capacity + elrp - readiness;
    const cost = P.capex * (1 - P.itc);
    return { arbitrage, capacity, elrp, readiness, net, cost, payback: net > 0 ? cost / net : Infinity,
             arbitrageOnlyPayback: arbitrage - readiness > 0 ? cost / (arbitrage - readiness) : Infinity, holds };
  }

  // ---------- everything for one setting ----------
  function evaluate(data, opts) {
    const P = Object.assign({}, DEFAULTS, opts || {});
    const homes = assign(data.homes, P);
    const stats = priceStats(data.prices);
    const fleet = homes.filter(h => h.owner === 'startup').length;
    const rules = RULES.map(rule => {
      const hs = socAtShutoff(homes, rule);
      const early = rule.medicalLead ? medicalHold(homes, 72) : 0;
      const events = data.events.map(e => Object.assign({ start: e.start, cut_at: e.cut_at }, runEvent(hs, e.hours)));
      const money = yearMoney(stats, rule, P, fleet ? early / fleet : 0);
      return {
        id: rule.id, label: rule.label, note: rule.note || '', lead: rule.lead, level: rule.level, early,
        eventsFull: events.filter(e => e.full).length, events,
        receiverHoursDark: events.reduce((a, e) => a + e.receiverHoursDark, 0),
        medicalEventsDark: events.filter(e => e.medicalDark).length,
        money, fleetMoney: { net: money.net * fleet, readiness: money.readiness * fleet, arbitrage: money.arbitrage * fleet }
      };
    });
    const c = homes.reduce((a, h) => {
      if (h.owner === 'startup') a.startup++; else if (h.owner === 'home') a.own++; else if (h._solarOnly) a.solarOnly++;
      if (h.medical) a.medical++;
      if (h.choice === 'receiver') a.receivers++; if (h.choice === 'out') a.out++;
      return a;
    }, { startup: 0, own: 0, solarOnly: 0, medical: 0, receivers: 0, out: 0 });
    return { homes, counts: c, stats, rules, opts: P };
  }

  // smallest fleet that carries every real shutoff in full under a rule
  function fleetFor(data, ruleId, opts) {
    for (let n = 1; n <= 300; n++) {
      const r = evaluate(data, Object.assign({}, opts, { free: n })).rules.find(x => x.id === ruleId);
      if (r.eventsFull === data.events.length) return n;
    }
    return null;
  }

  return { BASE, OWN, SOLAR_KWH_DAY, LEAD_DAYS, FALSE_ALARM, DEFAULTS, RULES, assign, medicalHold, socAtShutoff,
           runEvent, priceStats, holdCostPerDay, yearMoney, evaluate, fleetFor };
});
