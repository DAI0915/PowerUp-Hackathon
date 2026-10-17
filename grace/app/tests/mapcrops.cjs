// 2x crops of the map for the Tuna label, the place labels and the selected Cuthbert line (round 2 visual check)
const { chromium } = require('playwright');
const path = require('path');
const tmp = path.join(__dirname, '..', 'shots-r2', 'r2.wrapped.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, colorScheme: 'light' });
  const p = await ctx.newPage(); await p.goto('file://' + tmp, { waitUntil: 'load' }); await p.waitForTimeout(500);
  const m = await p.$eval('#mapWrap', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'map-east@2x.png'), clip: { x: m.x + m.w * 0.72, y: m.y + m.h * 0.35, width: m.w * 0.28, height: m.h * 0.6 } });
  await p.evaluate(() => { const g = window.__grace; document.getElementById('circuitSel').value = 'Cuthbert'; document.getElementById('circuitSel').dispatchEvent(new Event('change')); }); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'map-cuthbert@2x.png'), clip: { x: m.x + m.w * 0.45, y: m.y + m.h * 0.45, width: m.w * 0.35, height: m.h * 0.55 } });
  await p.evaluate(() => window.__grace.setHour(236)); await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'map-silent-zones@2x.png'), clip: { x: m.x, y: m.y, width: m.w, height: m.h * 0.45 } });
  await p.click('#zoomIn'); await p.click('#zoomIn'); await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'map-zoom@2x.png'), clip: { x: m.x, y: m.y, width: m.w, height: m.h } });
  await ctx.close(); await b.close();
})();
