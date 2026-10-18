// Pulls the fleet's state of charge, hour by hour, guard off and guard on, from the pilot app for the poster's chart.
// Run from the repo root: NODE_PATH=$(npm root -g) node submission/poster-36x48/series.cjs
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', '..');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const pg = await b.newPage({ viewport: { width: 1600, height: 1100 } });
  await pg.goto('file://' + path.join(root, 'pilot', 'app', 'index.html')); await pg.waitForTimeout(2500);
  const out = await pg.evaluate(() => {
    const g = window.__powerup.guard; const r = { rungs: window.__powerup.sim.rungs };
    for (const k of ['on', 'off']) {
      const s = g.sims[k];
      r[k] = { soc: s.fleet.map((f) => +(f.socSum / (s.N * s.params.capacity_kwh) * 100).toFixed(1)), power: s.fleet.map((f) => f.power) };
    }
    return r;
  });
  fs.writeFileSync(path.join(__dirname, 'fleet-series.json'), JSON.stringify(out));
  console.log(out.rungs, out.on.soc.length);
  await b.close();
})();
