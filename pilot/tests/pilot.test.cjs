// node pilot/tests/pilot.test.cjs : checks for the RAR8848 pilot engine
const assert = require('assert');
const P = require('../src/pilot.js');
const D = require('../data.json');
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };

t('data: 456 homes, 16 real shutoffs, 92 price days', () => {
  assert.strictEqual(D.homes.length, 456); assert.strictEqual(D.events.length, 16); assert.strictEqual(D.prices.length, 92);
  assert.strictEqual(Math.round(D.events.reduce((a, e) => a + e.hours, 0)), 435);
});
t('assign: the fleet size is what was asked, and only one battery forms the grid', () => {
  const hs = P.assign(D.homes, { free: 56 });
  assert.strictEqual(hs.filter(h => h.owner === 'startup').length, 56);
  assert.strictEqual(hs.filter(h => h.grid_forming).length, 1);
  assert.ok(hs.filter(h => h.owner === 'startup').every(h => h.choice === 'donor'));
});
t('assign: medical homes get a free battery first, then solar roofs', () => {
  const hs = P.assign(D.homes, { free: 30, solarFirst: true });
  const med = hs.filter(h => h.medical && h.owner !== 'home');
  assert.ok(med.every(h => h.owner === 'startup'));
  assert.ok(hs.filter(h => h.owner === 'startup' && !h.medical).every(h => h.solar_kwh_day > 0));
});
t('assign: medical homes always take part', () => {
  const hs = P.assign(D.homes, { free: 0 });
  assert.ok(hs.filter(h => h.medical).every(h => h.choice !== 'out'));
});
t('money: one battery trades for about $0.91 a day on real Q4 2025 prices', () => {
  const s = P.priceStats(D.prices); assert.ok(Math.abs(s.day20 - 0.914) < 0.01);
});
t('money: holding full costs the whole day of trading; holding at the floor costs nothing', () => {
  const s = P.priceStats(D.prices);
  assert.strictEqual(P.holdCostPerDay(s, 1), s.day20); assert.strictEqual(P.holdCostPerDay(s, 0.2), 0);
  assert.ok(P.holdCostPerDay(s, 0.8) < s.day20);
});
t('rules: an earlier hold always costs more', () => {
  const r = P.evaluate(D, {}).rules, c = id => r.find(x => x.id === id).money.readiness;
  assert.ok(c('forecast') > c('notice') && c('notice') > c('dayBefore') && c('dayBefore') > c('never'));
  assert.ok(c('medical') > c('dayBefore') && c('medical') < c('notice'));
});
t('rules: never holding leaves receiving homes dark in every real shutoff', () => {
  const r = P.evaluate(D, { free: 56 }).rules.find(x => x.id === 'never');
  assert.strictEqual(r.eventsFull, 0); assert.ok(r.receiverHoursDark > 0);
});
t('outcome: 56 batteries held from notice carry all 16 shutoffs; half solar does not', () => {
  assert.strictEqual(P.evaluate(D, { free: 56 }).rules.find(x => x.id === 'notice').eventsFull, 16);
  assert.ok(P.evaluate(D, { free: 56, solarKwhDay: 13.5 }).rules.find(x => x.id === 'notice').eventsFull < 16);
});
t('outcome: the default pilot fleet is 160 and carries all 16; on smoky days holding is what keeps homes on', () => {
  assert.strictEqual(P.DEFAULTS.free, 160);
  assert.strictEqual(P.evaluate(D, {}).rules.find(x => x.id === 'notice').eventsFull, 16);
  const smoke = id => P.evaluate(D, { solarKwhDay: 13.5 }).rules.find(x => x.id === id).eventsFull;
  assert.ok(smoke('notice') > smoke('never'));
});
t('outcome: more batteries never carry fewer shutoffs', () => {
  let last = -1;
  for (const free of [0, 10, 20, 40, 80, 160]) {
    const k = P.evaluate(D, { free }).rules.find(x => x.id === 'notice').eventsFull;
    assert.ok(k >= last); last = k;
  }
});
console.log(`${n} passing`);
