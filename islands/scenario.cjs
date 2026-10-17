/* Merlin-shaped example. Real: Merlin's ~777 customers and its RAR0775 recloser, which SCE opened alone four times
   (Nov 2024 to Jan 2025) cutting 222-223 customers, once for 213.5 hours. Assumed: how the rest of the circuit splits
   into segments, which segments are underground, the homes, and every opt-in choice. Run: node scenario.cjs */
const I = require('./island.js');

const SEGMENTS = [
  { id: 'TRUNK', parent: null, device: 'CB', customers: 180, line: 'overhead', hfra: true },       // canyon run from the substation
  { id: 'RIDGE', parent: 'TRUNK', device: null, customers: 140, line: 'overhead', hfra: true },     // fused tap, no remote switch
  { id: 'MESA', parent: 'TRUNK', device: 'RCS-M', customers: 144, line: 'overhead', hfra: true },
  { id: 'COAST', parent: 'TRUNK', device: 'RAR0775', customers: 223, line: 'underground', hfra: false },
  { id: 'COAST-B', parent: 'COAST', device: null, customers: 90, line: 'underground', hfra: false }
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// homes: 15% battery (Grace default), 25% of the rest solar-only, 5% Medical Baseline; battery owners donate 60% of the time, homes without one
// sign up as receivers 50% of the time (all assumed)
function buildHomes(seed, opts) {
  const o = Object.assign({ battery: 0.15, solar: 0.25, donate: 0.6, receive: 0.5, gridFormingHomes: false }, opts || {});
  const rng = mulberry32(seed), homes = [];
  SEGMENTS.forEach(s => {
    for (let i = 0; i < s.customers; i++) {
      const bat = rng() < o.battery, medical = rng() < 0.05;
      const solar = bat || rng() < o.solar;
      let choice = bat ? (rng() < o.donate ? 'donor' : 'self') : (medical || rng() < o.receive ? 'receiver' : 'out');
      if (!bat && solar && choice === 'receiver') choice = 'donor';       // solar-only homes that join offer their panels
      homes.push({
        id: `${s.id}-${i}`, seg: s.id, battery_kwh: bat ? 39.2 : 0, soc: bat ? 1.0 : 0, // Grace fills batteries before the shutoff
        solar_kwh_day: solar ? 15 : 0,     // assumed: ~5 kW roof on an October Malibu day
        grid_forming: bat && o.gridFormingHomes, choice, medical, size: 0.6 + rng()
      });
    }
  });
  return homes;
}

// the pilot's shared asset: one grid-forming battery at the island's head switch (assumed size)
function communityBattery(seg, kwh, kw) {
  return { id: 'COMMUNITY-' + seg, seg, battery_kwh: kwh, soc: 1.0, solar_kwh_day: 0, grid_forming: true, choice: 'donor', size: 0, export_kw: kw };
}

function run(hours, opts) {
  const risky = ['TRUNK', 'RIDGE'];
  const cls = I.classify(SEGMENTS, risky);
  const islands = I.findIslands(SEGMENTS, cls);
  const homes = buildHomes(7, opts && opts.homes);
  if (opts && opts.community) homes.push(communityBattery('COAST', opts.community.kwh, opts.community.kw));
  const plans = islands.map(isl => I.planIsland(isl, homes, hours));
  return { cls, islands, plans, money: plans.map(p => I.settle(p)), switches: I.switchValue(SEGMENTS, ['RIDGE']) };
}

module.exports = { SEGMENTS, buildHomes, communityBattery, run };

if (require.main === module) {
  const show = (label, r) => {
    console.log(`\n== ${label}`);
    console.log('opened:', r.cls.opened.join(', '), '| customers', JSON.stringify(r.cls.customers));
    r.islands.forEach((isl, i) => {
      const p = r.plans[i], m = r.money[i];
      console.log(`${isl.id}: ${isl.customers} customers, ${isl.allowed ? 'allowed' : 'blocked: ' + isl.blockers.join('; ')}`);
      if (isl.allowed) {
        console.log(`  ${JSON.stringify(p.counts)} pool ${p.pool_kwh} kWh, receivers at ${p.receiver_mode} for ${p.receiver_hours} h, peak ${p.peak_kw} kW of ${p.export_kw} kW`);
        console.log(`  shortfall to carry every receiver at critical: ${p.shortfall_kwh} kWh`);
        console.log(`  ${p.feasible ? 'FEASIBLE' : 'not feasible: ' + p.problems.join('; ')}`);
        if (p.feasible) console.log(`  money: ${JSON.stringify({ ...m, donors: undefined })}`);
      }
    });
  };
  show('48 h, home batteries only', run(48));
  show('48 h, plus a 400 kWh / 200 kW community battery', run(48, { community: { kwh: 400, kw: 200 } }));
  show('213 h (the Jan 2025 RAR0775 outage), plus community battery', run(213, { community: { kwh: 400, kw: 200 } }));
  console.log('\nswitch value if only RIDGE is risky:', JSON.stringify(run(48).switches));
}
