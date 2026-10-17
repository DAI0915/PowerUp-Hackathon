// Viewport crops for visual review. Run: NODE_PATH=$(npm root -g) node tests/views.cjs
const { chromium } = require('playwright');
const path = require('path');
const tmp = path.join(__dirname, '..', 'shots', 'final.wrapped.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const theme of ['light', 'dark']) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1, colorScheme: theme });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('file://' + tmp, { waitUntil: 'load' }); await p.waitForTimeout(500);
    await p.screenshot({ path: path.join(__dirname, '..', 'shots', `view-${theme}-top.png`) });
    await p.click('#jump-hand'); await p.evaluate(() => window.__powerup.setHour(272)); await p.waitForTimeout(200);
    await p.evaluate(() => document.getElementById('approvalsPanel').scrollIntoView()); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, '..', 'shots', `view-${theme}-hand.png`) });
    await p.evaluate(() => document.getElementById('mathPanel').scrollIntoView()); await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(__dirname, '..', 'shots', `view-${theme}-math.png`) });
    await p.evaluate(() => { window.scrollTo(0, 0); window.__powerup.setHour(236); }); await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(__dirname, '..', 'shots', `view-${theme}-silent.png`), clip: { x: 0, y: 300, width: 800, height: 520 } });
    if (errs.length) console.log(theme, errs);
    await ctx.close();
  }
  const ctx2 = await b.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, colorScheme: 'light', hasTouch: true, isMobile: true });
  const q = await ctx2.newPage();
  await q.goto('file://' + tmp, { waitUntil: 'load' }); await q.waitForTimeout(500);
  await q.screenshot({ path: path.join(__dirname, '..', 'shots', 'view-phone-top.png') });
  await q.evaluate(() => window.scrollTo(0, 560)); await q.waitForTimeout(200);
  await q.screenshot({ path: path.join(__dirname, '..', 'shots', 'view-phone-map.png') });
  await q.click('#step-hand'); await q.evaluate(() => window.__powerup.setHour(272)); await q.evaluate(() => document.getElementById('approvalsPanel').scrollIntoView()); await q.waitForTimeout(200);
  await q.screenshot({ path: path.join(__dirname, '..', 'shots', 'view-phone-hand.png') });
  await ctx2.close();
  await b.close();
})();
