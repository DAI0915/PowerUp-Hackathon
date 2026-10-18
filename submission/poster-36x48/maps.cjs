// Screenshots the pilot map a day into the shutoff, guard off and guard on, for the 36 x 48 in poster, at 3x for print.
// Run from the repo root: NODE_PATH=$(npm root -g) CHROMIUM=<chrome path> node submission/poster-36x48/maps.cjs
const path = require('path');
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..', '..');
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  for (const [mode, out] of [['on', 'map-on.png'], ['off', 'map-off.png']]) {
    const pg = await b.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 3, colorScheme: 'light' });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    await pg.goto('file://' + path.join(root, 'pilot', 'app', 'index.html')); await pg.waitForTimeout(2500);
    await pg.evaluate((m) => { window.__powerup.setGuardMode(m); }, mode);
    await pg.waitForTimeout(800);
    await pg.evaluate(() => { const s = window.__powerup.sim; window.__powerup.setHour(s.rungs.hold + 30); });
    await pg.waitForTimeout(1500);
    const el = await pg.$('#mapWrap');
    await el.screenshot({ path: path.join(__dirname, out) });
    // keep the homes, drop the legend, the tower-zone strip and the note
    execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; Image.open(sys.argv[1]).crop((1130, 420, 2580, 1545)).save(sys.argv[1])', path.join(__dirname, out)]);
    console.log(mode, errs, await pg.evaluate(() => window.__powerup.hour));
  }
  await b.close();
})();
