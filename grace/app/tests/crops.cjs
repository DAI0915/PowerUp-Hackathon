// viewport crops for review at common sizes; writes into shots-r2/
const { chromium } = require('playwright');
const path = require('path');
const tmp = path.join(__dirname, '..', 'shots-r2', 'r2.wrapped.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const out = [];
  for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900], [1280, 820]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'light' });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('file://' + tmp, { waitUntil: 'load' }); await p.waitForTimeout(500);
    const g = await p.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { tlBottom: Math.round(r('timeline').bottom), mapH: Math.round(r('mapWrap').height), ladderH: Math.round(r('ladder').height), hdrH: Math.round(document.querySelector('.hdr').getBoundingClientRect().height), what: getComputedStyle(document.getElementById('stepWhat-hold')).display, legendHidden: document.getElementById('legend').hidden }; });
    out.push({ w, h, ...g, errs });
    await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', `fold-${w}x${h}.png`) });
    if (w === 1280 && h === 820) {
      await p.evaluate(() => window.__grace.setHour(236)); await p.waitForTimeout(200);
      await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'd-silent-map.png'), clip: { x: 0, y: 150, width: 800, height: 420 } });
      await p.click('#legendBtn'); await p.waitForTimeout(200);
      await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'd-legend-open.png'), clip: { x: 0, y: 150, width: 800, height: 420 } });
      await p.click('#legendBtn');
      await p.click('#step-hand'); await p.evaluate(() => window.__grace.setHour(273)); await p.waitForTimeout(200);
      await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'd-h273.png') });
      await p.evaluate(() => document.getElementById('approvalsPanel').scrollIntoView()); await p.waitForTimeout(100);
      await p.evaluate(() => document.getElementById('approveAllRestore').click()); await p.waitForTimeout(600);
      await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
      await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'd-h273-approved.png') });
      await p.evaluate(() => window.__grace.setHour(189)); await p.waitForTimeout(200);
      await p.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'd-h189.png'), clip: { x: 0, y: 0, width: 1280, height: 820 } });
    }
    await ctx.close();
  }
  const ctx2 = await b.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, colorScheme: 'light', hasTouch: true, isMobile: true });
  const q = await ctx2.newPage(); const errs2 = []; q.on('pageerror', e => errs2.push(e.message)); q.on('console', m => { if (m.type() === 'error') errs2.push(m.text()); });
  await q.goto('file://' + tmp, { waitUntil: 'load' }); await q.waitForTimeout(500);
  const pg = await q.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const m = r('mapWrap'), t = r('timeline'), tb = document.getElementById('themeBtn').getBoundingClientRect(), tag = document.querySelector('.tag').getBoundingClientRect(); return { mapTop: Math.round(m.top), mapBottom: Math.round(m.bottom), tlTop: Math.round(t.top), tlH: Math.round(t.height), themeBtn: [Math.round(tb.x), Math.round(tb.y), Math.round(tb.width), Math.round(tb.height)], tag: [Math.round(tag.y), Math.round(tag.bottom)], hdrH: Math.round(document.querySelector('.hdr').getBoundingClientRect().height) }; });
  out.push({ phone: pg, errs2 });
  await q.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'p-first.png') });
  await q.click('#legendBtn'); await q.waitForTimeout(400);
  await q.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'p-legend.png') });
  await q.click('#legendBtn');
  await q.click('#step-hand'); await q.waitForTimeout(200);
  await q.screenshot({ path: path.join(__dirname, '..', 'shots-r2', 'p-hand.png') });
  await ctx2.close(); await b.close();
  console.log(JSON.stringify(out, null, 1));
})();
