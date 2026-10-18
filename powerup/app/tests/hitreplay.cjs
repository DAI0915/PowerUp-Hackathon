// replay the page's own hit test at hour 216: taps at battery-home centres and 2 px off, phone and desktop (round 2 check)
const { chromium } = require('playwright');
const path = require('path');
const tmp = path.join(__dirname, '..', 'shots', 'interact.wrapped.html');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const [name, vp, mobile] of [['phone', { width: 400, height: 800 }, true], ['desktop', { width: 1280, height: 820 }, false]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 1, colorScheme: 'light', hasTouch: mobile, isMobile: mobile });
    const p = await ctx.newPage(); await p.goto('file://' + tmp, { waitUntil: 'load' }); await p.waitForTimeout(500);
    await p.evaluate(() => window.__powerup.setHour(216));
    const res = await p.evaluate(() => { const g = window.__powerup, r = document.getElementById('map').getBoundingClientRect(); const cls = (hm, id) => id === hm.id ? 'card' : id >= 0 && g.world.homes[id].battery ? 'other' : id >= 0 ? 'plain' : 'line'; let n = 0; const exact = { card: 0, other: 0, plain: 0, line: 0 }, off = { card: 0, other: 0, plain: 0, line: 0 }, mb = { n: 0, exactCard: 0, offCard: 0 }; for (const hm of g.world.batteries) { const q = g.toPx(hm.x, hm.y); if (q[0] < 10 || q[0] > r.width - 10 || q[1] < 10 || q[1] > r.height - 10) continue; n++; const r0 = g.nearestHome(q[0], q[1]), r1 = g.nearestHome(q[0] + 2, q[1] + 2); exact[cls(hm, r0)]++; off[cls(hm, r1)]++; if (hm.tier === 1) { mb.n++; if (r0 === hm.id) mb.exactCard++; if (r1 === hm.id) mb.offCard++; } } return { scale: +g.view.scale.toFixed(1), batteryHomesInView: n, tapAtCentre: exact, tap2pxOff: off, medical: mb }; });
    console.log(name, JSON.stringify(res));
    // live touch tap on a silent ring on phone: card opens, no scroll jump
    if (mobile) {
      const silentH = await p.evaluate(() => { const f = window.__powerup.sim.fleet; for (let h = 0; h < f.length; h++) if (f[h].byChan[3] > 0) return h; return -1; });
      await p.evaluate(h => window.__powerup.setHour(h), silentH); await p.evaluate(() => document.getElementById('mapWrap').scrollIntoView()); await p.waitForTimeout(200);
      const sh = await p.evaluate(() => { const g = window.__powerup, sim = g.sim, h = g.hour, base = h * sim.N, mr = document.getElementById('map').getBoundingClientRect(), tl = document.getElementById('timeline').getBoundingClientRect(); for (const hm of g.world.batteries) { if (sim.chan[base + hm.bi] !== 3) continue; const q = g.toPx(hm.x, hm.y); if (q[0] > 60 && q[0] < mr.width - 60 && q[1] > 70 && mr.top + q[1] < tl.top - 20) return { x: mr.x + q[0] + 1.5, y: mr.y + q[1] + 1.5, id: hm.id }; } return null; });
      const y0 = await p.evaluate(() => scrollY);
      await p.touchscreen.tap(sh.x, sh.y); await p.waitForTimeout(200);
      const card = await p.$eval('#homeCard', e => ({ hidden: e.hidden, text: e.textContent.slice(0, 50) }));
      console.log('phone silent-ring tap 1.5 px off:', JSON.stringify({ card, scrollBefore: y0, scrollAfter: await p.evaluate(() => scrollY) }));
    }
    await ctx.close();
  }
  await b.close();
})();
