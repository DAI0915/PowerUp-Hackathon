// Playwright interaction checks. Run: cd final && NODE_PATH=$(npm root -g) node tests/interact.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), assert = require('assert');
const here = __dirname;
const file = path.join(here, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');
html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n' + html + '\n</body></html>';
const tmp = path.join(here, '..', 'shots', 'interact.wrapped.html');
fs.writeFileSync(tmp, html);
const results = [];
// the legend starts closed wherever the map is under 400 px tall, so the checks set it explicitly instead of toggling it
const legend = (pg, show) => pg.evaluate(sh => { const l = document.getElementById('legend'); l.hidden = !sh; document.getElementById('legendBtn').setAttribute('aria-pressed', String(sh)); }, show);
function ok(name, cond, extra) { results.push({ name, ok: !!cond, extra }); if (!cond) console.log('FAIL', name, extra || ''); else console.log('ok  ', name, extra || ''); }

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  // ---------- desktop ----------
  const ctx = await b.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1, colorScheme: 'light' });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto('file://' + tmp, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  const text = id => p.$eval('#' + id, e => e.textContent.trim());
  ok('first frame: clock at Hold', (await text('clock')) === 'Thu Oct 15, 4:00 PM', await text('clock'));
  ok('first frame: narrative filled', (await text('narrative')).length > 40);
  ok('first frame: real event line is the shutoff', (await text('realEvent')).includes('Power off in central and west Malibu'));
  ok('first frame: ladder marks Hold as the current step', await p.$eval('#step-hold', e => e.getAttribute('aria-current') === 'step'));
  ok('ladder has six step buttons with dates', (await p.$$('#ladderSteps button.step')).length === 6 && (await text('step-hand')).includes('Sat Oct 17, 8:00 PM'));
  const tlGeom = await p.$eval('#timeline', e => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
  ok('first frame: the timeline (play, scrub, both bulletin lines) is above the fold at 1280x820', tlGeom.bottom <= 820, JSON.stringify(tlGeom));
  ok('first frame: the map is at least 260 px tall', (await p.$eval('#mapWrap', e => e.getBoundingClientRect().height)) >= 260);
  ok('the ladder now-line names the current step', (await text('ladderNow')).startsWith('Step 4, Hold') && (await text('ladderNow')).includes('Power off'));
  ok('the Hand card says forecast', (await text('step-hand')).includes('(forecast)'));
  ok('rung chip is readable: white on a 4.5:1 colour (light theme)', await p.$eval('#rungChip', e => { const cs = getComputedStyle(e); const lum = c => { const m = c.match(/\d+/g).map(Number).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; }; const a = lum(cs.backgroundColor), b = lum(cs.color); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5; }));

  // ladder strip buttons jump the timeline
  await p.click('#step-watch');
  ok('ladder Watch jumps the timeline', (await text('clock')) === 'Fri Oct 9, 3:00 AM' && await p.$eval('#step-watch', e => e.getAttribute('aria-current') === 'step'), await text('clock'));
  await p.click('#step-ordinary');
  ok('ladder Ordinary day jumps to Oct 7 evening', (await text('clock')) === 'Wed Oct 7, 6:00 PM', await text('clock'));
  ok('ladder current step moved to Ordinary day', await p.$eval('#step-ordinary', e => e.getAttribute('aria-current') === 'step') && await p.$eval('#step-hold', e => !e.hasAttribute('aria-current')));
  const realAtOct7 = await text('realEvent');
  ok('real event at Oct 7 6 PM is the first forecast discussion', realAtOct7.includes('decreasing clouds') && realAtOct7.includes('Wed Oct 7, 2:37 PM'), realAtOct7.slice(0, 60));
  await p.focus('#tlWrap'); await p.keyboard.press('Home');
  ok('real event before any event says nothing yet', (await text('realEvent')).startsWith('Nothing yet'));
  await p.click('#step-hand');
  const realAtHand = await text('realEvent');
  ok('real event line changes with the hour (Hand rung shows the Red Flag Warning ending)', realAtHand.includes('Red Flag Warning ends') && realAtHand !== realAtOct7);
  ok('math panel shows this hour and circuit', (await text('mathBody')).includes('Galahad, 8:00 PM') && (await text('mathBody')).includes('Restoration peak check'));

  // scrub to Hold via keyboard: jump to watch then arrows
  await p.click('#jump-watch');
  ok('jump watch', (await text('clock')) === 'Fri Oct 9, 3:00 AM', await text('clock'));
  await p.focus('#tlWrap');
  await p.keyboard.press('ArrowRight');
  ok('arrow right scrubs +1 h', (await text('clock')) === 'Fri Oct 9, 4:00 AM', await text('clock'));
  await p.keyboard.press('Shift+ArrowLeft');
  ok('shift arrow scrubs -6 h', (await text('clock')) === 'Thu Oct 8, 10:00 PM', await text('clock'));
  await p.keyboard.press('Space');
  await p.waitForTimeout(350);
  const playing = await text('playBtn');
  await p.keyboard.press('Space');
  ok('space toggles play', playing === 'Pause' && (await text('playBtn')) === 'Play', playing);
  const afterPlay = await p.evaluate(() => window.__grace.hour);
  ok('play advanced the clock', afterPlay > 46, String(afterPlay));
  // drag-scrub on the timeline canvas to the hold rung
  const tlBox = await p.$eval('#tlCanvas', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const xHold = tlBox.x + 6 + (208 / 282) * (tlBox.w - 12);
  await p.mouse.move(tlBox.x + 40, tlBox.y + tlBox.h / 2); await p.mouse.down(); await p.mouse.move(xHold, tlBox.y + tlBox.h / 2, { steps: 8 }); await p.mouse.up();
  const hAfterDrag = await p.evaluate(() => window.__grace.hour);
  ok('drag scrub lands near Hold', Math.abs(hAfterDrag - 208) <= 1, String(hAfterDrag));
  await p.click('#jump-hold');
  ok('Hold rung chip', (await text('rungChip')).toLowerCase().startsWith('hold'), await text('rungChip'));
  const fleetAtHold = await text('fleetKpis');
  const mathAtHold = await text('mathBody');
  ok('math panel numbers follow the hour', mathAtHold.includes('Galahad, 4:00 PM') && mathAtHold.includes('circuit off') && mathAtHold.includes('critical'), mathAtHold.slice(0, 80));
  await p.focus('#tlWrap'); await p.keyboard.press('ArrowRight');
  ok('math panel changes when the hour changes', (await text('mathBody')) !== mathAtHold && (await text('mathBody')).includes('5:00 PM'));
  await p.click('#jump-hold');
  // MW load chart
  const loadPx = await p.$eval('#loadChart', cv => { const c = cv.getContext('2d'); const d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (d.length / 4); });
  ok('MW load chart renders (painted pixels)', loadPx > 0.2, loadPx.toFixed(2));
  ok('load chart is labelled in MW with the unit inference', (await text('loadCap')).includes('on-peak') && (await text('loadNow')).includes('MW') && (await text('loadNow')).includes('27.7 kW'));

  // hover a battery home on the map
  const home = await p.evaluate(() => { const g = window.__grace; const hm = g.world.batteries.find(h => h.tier === 1); const q = g.toPx(hm.x, hm.y); const r = document.getElementById('map').getBoundingClientRect(); return { x: r.x + q[0], y: r.y + q[1], id: hm.id }; });
  await p.mouse.move(home.x, home.y);
  await p.waitForTimeout(100);
  const cardVisible = await p.$eval('#homeCard', e => !e.hidden && e.textContent.includes('Medical Baseline'));
  ok('hover shows a Medical Baseline card', cardVisible);
  // tap pins the card
  await p.mouse.click(home.x, home.y);
  await p.waitForTimeout(100);
  ok('click pins the card', await p.$eval('#homeCard', e => e.classList.contains('pinned') && !!document.getElementById('cardClose')));
  await p.click('#cardClose');
  ok('card closes', await p.$eval('#homeCard', e => e.hidden));
  await p.mouse.click(home.x, home.y); await p.waitForTimeout(100);
  await p.keyboard.press('Escape'); await p.waitForTimeout(50);
  ok('Escape closes a pinned card', await p.$eval('#homeCard', e => e.hidden));
  // math row 3 names the same mode as the pinned home's card, now and at the shutoff
  await p.evaluate(() => window.__grace.setHour(248)); await p.waitForTimeout(100);
  await legend(p, false);
  const pinTarget = await p.evaluate(() => { const g = window.__grace; const r = document.getElementById('map').getBoundingClientRect(); const legend = document.getElementById('legend').getBoundingClientRect(); for (const hm of g.world.batteries) { const q = g.toPx(hm.x, hm.y); if (q[0] < 60 || q[1] < 60 || q[0] > r.width - 80 || q[1] > r.height - 40) continue; if (g.sim.mode[248 * g.sim.N + hm.bi] === 0 && hm.factor > 1.2) return { x: r.x + q[0], y: r.y + q[1], id: hm.id }; } return null; });
  await p.mouse.click(pinTarget.x, pinTarget.y); await p.waitForTimeout(150);
  const cardMode = await p.$eval('#homeCard', e => (e.textContent.match(/Budget mode(critical|essential|normal)/) || [])[1]);
  const row3 = await p.$eval('#mathBody', e => e.innerHTML.split('3. Outage budget')[1].split('4. Silent')[0]);
  const row3Modes = [...row3.matchAll(/=&gt; <b>(critical|essential|normal)<\/b>/g)].map(m => m[1]);
  ok('math row 3 for the pinned home names the same mode as its card', cardMode && row3Modes.length >= 2 && row3Modes[row3Modes.length - 1] === cardMode && row3.includes('entering the shutoff') && row3.includes('62 h planned'), `card ${cardMode}, row ${row3Modes.join('>')}`);
  ok('math row 3 says the mode is set at the shutoff and only steps down', row3.includes('steps down, never up'));
  await p.keyboard.press('Escape');
  await legend(p, false);
  await p.click('#jump-hold');

  // click a circuit line on the map (Merlin)
  const linePt = await p.evaluate(() => { const g = window.__grace; const r = document.getElementById('map').getBoundingClientRect(); let fallback = null; for (const pl of DATA.lines.Merlin) for (let i = 1; i < pl.length; i++) { const a = window.Grace.toKm(pl[i - 1][0], pl[i - 1][1], DATA.meta.bbox), b = window.Grace.toKm(pl[i][0], pl[i][1], DATA.meta.bbox); for (let t = 0.1; t < 0.95; t += 0.1) { const q = g.toPx(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); if (q[0] < 40 || q[1] < 60 || q[0] > r.width - 80 || q[1] > r.height - 40) continue; if (g.nearestLine(q[0], q[1]) !== 'Merlin') continue; const id = g.nearestHome(q[0], q[1]); if (id < 0) return { x: r.x + q[0], y: r.y + q[1], bare: true }; if (!fallback && !g.world.homes[id].battery) fallback = { x: r.x + q[0], y: r.y + q[1], bare: false }; } } return fallback; });
  await p.mouse.click(linePt.x, linePt.y);
  await p.waitForTimeout(100);
  ok('clicking a line selects the circuit' + (linePt.bare ? ' without a card' : ' (a plain home on it pins its card)'), (await p.$eval('#circuitSel', e => e.value)) === 'Merlin' && (!linePt.bare || await p.$eval('#homeCard', e => e.hidden)), await p.$eval('#circuitSel', e => e.value));
  await p.keyboard.press('Escape');
  ok('circuit panel shows Merlin facts', (await text('circuitFacts')).includes('775'));
  ok('math panel follows the selected circuit', (await text('mathBody')).includes('Headroom cap, Merlin'));
  await legend(p, true); await p.click('#leg-Serra'); await legend(p, false);
  ok('legend click selects Serra and notes unusable load', (await text('circuitNote')).includes('unusable'));
  // a click on a plain (no-battery) home that sits on its line selects the circuit without pinning a card
  await legend(p, false);
  const plainPt = await p.evaluate(() => { const g = window.__grace; const r = document.getElementById('map').getBoundingClientRect(); const bb = DATA.meta.bbox; const G2 = window.Grace; const segs = DATA.lines.Maguire.flatMap(pl => pl.slice(1).map((b, i) => [G2.toKm(pl[i][0], pl[i][1], bb), G2.toKm(b[0], b[1], bb)])); const distToLine = (x, y) => { let bd = 1e9; for (const [a, b] of segs) { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9; let t = ((x - a[0]) * dx + (y - a[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); bd = Math.min(bd, Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y)); } return bd * g.view.scale; }; for (const hm of g.world.homes) { if (hm.battery || hm.circuit !== 'Maguire') continue; const q = g.toPx(hm.x, hm.y); if (q[0] < 40 || q[1] < 60 || q[0] > r.width - 80 || q[1] > r.height - 40) continue; let nearBat = false; for (const b of g.world.batteries) { const qb = g.toPx(b.x, b.y); if (Math.hypot(qb[0] - q[0], qb[1] - q[1]) < 14) { nearBat = true; break; } } if (nearBat) continue; if (distToLine(hm.x, hm.y) < 4) return { x: r.x + q[0], y: r.y + q[1], id: hm.id }; } return null; });
  if (plainPt) { await p.mouse.click(plainPt.x, plainPt.y); await p.waitForTimeout(150); }
  ok('clicking a plain home on the Maguire line selects Maguire and pins its no-battery card', !!plainPt && (await p.$eval('#circuitSel', e => e.value)) === 'Maguire' && (await p.$eval('#homeCard', e => !e.hidden && e.classList.contains('pinned') && e.textContent.includes('no battery'))), plainPt ? await p.$eval('#circuitSel', e => e.value) : 'no plain home found');
  await p.keyboard.press('Escape');
  await legend(p, false);

  // zoom and pan
  const v0 = await p.evaluate(() => ({ ...window.__grace.view }));
  const mapBox = await p.$eval('#map', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(mapBox.x + mapBox.w / 2, mapBox.y + mapBox.h / 2);
  await p.mouse.wheel(0, -300);
  await p.waitForTimeout(50);
  const v1 = await p.evaluate(() => ({ ...window.__grace.view }));
  ok('wheel zooms in', v1.scale > v0.scale, `${v0.scale.toFixed(1)} -> ${v1.scale.toFixed(1)}`);
  await p.mouse.move(mapBox.x + 300, mapBox.y + 200); await p.mouse.down(); await p.mouse.move(mapBox.x + 400, mapBox.y + 240, { steps: 5 }); await p.mouse.up();
  const v2 = await p.evaluate(() => ({ ...window.__grace.view }));
  ok('drag pans', Math.abs(v2.cx - v1.cx) > 0.5, `${v1.cx.toFixed(2)} -> ${v2.cx.toFixed(2)}`);
  await p.click('#zoomIn'); await p.waitForTimeout(300);
  const v3 = await p.evaluate(() => ({ ...window.__grace.view }));
  ok('+ button zooms', v3.scale > v2.scale);
  await p.click('#zoomReset'); await p.waitForTimeout(300);
  const v4 = await p.evaluate(() => ({ ...window.__grace.view }));
  ok('reset restores the view', Math.abs(v4.scale - v0.scale) < 0.01 && Math.abs(v4.cx - v0.cx) < 0.01);

  // assumptions drawer: change adoption
  await p.click('#drawerBtn');
  ok('drawer opens', await p.$eval('#drawer', e => !e.hidden));
  const nBefore = await p.evaluate(() => window.__grace.sim.N);
  await p.$eval('#a-adoption_pct', e => { e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(900);
  const nAfter = await p.evaluate(() => window.__grace.sim.N);
  ok('adoption change re-simulates with more battery homes', nAfter > nBefore * 2, `${nBefore} -> ${nAfter}`);
  const fleetAfterAdoption = await text('fleetKpis');
  ok('fleet counts changed after adoption change', fleetAfterAdoption !== fleetAtHold);
  await p.$eval('#a-adoption_pct', e => { e.value = 15; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(900);
  ok('adoption back to 15 restores the fleet size', (await p.evaluate(() => window.__grace.sim.N)) === nBefore);
  // mesh toggle
  await p.click('#jump-hand');
  const silentMeshOn = await p.evaluate(() => window.__grace.sim.fleet[window.__grace.hour].byChan[3]);
  await p.click('#a-mesh'); await p.waitForTimeout(900);
  const silentMeshOff = await p.evaluate(() => window.__grace.sim.fleet[window.__grace.hour].byChan[3]);
  ok('mesh off makes every zone silent', silentMeshOff > silentMeshOn * 3, `${silentMeshOn} -> ${silentMeshOff}`);
  await p.click('#a-mesh'); await p.waitForTimeout(900);

  // hand rung: the reframed peak check, then approve a restoration and check the fleet changes after restoration
  await p.click('#jump-hand');
  ok('hand rung lists six plans', (await p.$$('#restoreList .plan')).length === 6);
  const planText = await text('restoreList');
  ok('peak check shows without PowerUP vs with PowerUP vs cap', planText.includes('without PowerUP') && planText.includes('with PowerUP') && planText.includes('cap') && planText.includes('off the peak') && (await p.$$('#restoreList .pk')).length === 6);
  const firstPlan = await p.evaluate(() => { const q = window.__grace.sim.proposals.restore[0]; return { c: q.circuit, w: q.withoutKW, g: q.withKW, cap: q.capKW, under: q.underCap, start: q.startH, charge: q.chargeStartH }; });
  ok('with Grace is below without Grace and the plan starts 62 h after the shutoff', firstPlan.g < firstPlan.w && firstPlan.start === 270 && firstPlan.charge >= 272, JSON.stringify(firstPlan));
  ok('plans are staggered 1 h apart', await p.evaluate(() => { const r = window.__grace.sim.proposals.restore; return r.every((q, i) => q.startH === r[0].startH + i); }));
  ok('every recharge start is inside the replay window', await p.evaluate(() => window.__grace.sim.proposals.restore.every(q => q.chargeStartH < window.__grace.sim.HOURS)));
  ok('the Approvals copy says planned, not actual', (await text('approvalsPanel')).includes('planned, not actual'));
  await p.focus('#tlWrap'); await p.keyboard.press('End');
  ok('End key reaches Oct 18, 5:00 PM', (await text('clock')) === 'Sun Oct 18, 5:00 PM', await text('clock'));
  const kpiPending = await text('fleetKpis');
  const restoringPending = await p.evaluate(() => window.__grace.sim.fleet[274].byStatus[8]);
  await p.click('#approve-' + firstPlan.c);
  await p.waitForTimeout(800);
  const restoringApproved = await p.evaluate(() => window.__grace.sim.fleet[274].byStatus[8]);
  const kpiApproved = await text('fleetKpis');
  ok('approving a restoration starts recharging (batteries recharging at Oct 18 10:00, end-of-window counts change)', restoringApproved > restoringPending && kpiApproved !== kpiPending, `${restoringPending} -> ${restoringApproved}`);
  ok('plan shows approved pill', (await text('restoreList')).includes('approved'));
  ok('peak check pill carries the percent of cap, so rounding cannot contradict the verdict', /(under|over) cap, \d+%/.test(await text('restoreList')) && (await text('restoreList')).includes('kW against a cap of'));
  ok('the chosen Approve button is disabled and filled', await p.$eval('#approve-' + firstPlan.c, e => e.disabled && getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(e).cursor === 'default'));
  const kpiEnd = await text('fleetKpis');
  ok('end of window: batteries on restored circuits read "recharge pending", not Empty', kpiEnd.includes('recharge pending') && /0Empty/.test(kpiEnd), kpiEnd);
  ok('end of window: fleet soc stays above the floor region, not near zero', (await p.evaluate(() => window.__grace.sim.fleet[281].socPct)) > 10);
  ok('tier grid rows add up', await p.$eval('#tierGrid', e => { const n = [...e.querySelectorAll('.n')].map(x => +x.textContent).filter(x => !isNaN(x)); for (let i = 0; i < n.length; i += 4) if (n[i] !== n[i + 1] + n[i + 2] + n[i + 3]) return false; return n.length === 12; }));
  ok('narrative mentions the approved plan', (await text('narrative')).toLowerCase().includes('approved'));

  // EV dispatch: none needed at the defaults; a 96 h planned outage produces proposals at the default 55% threshold
  await p.click('#jump-hand');
  ok('donor threshold default is 55% and no relax button exists', (await p.evaluate(() => window.__grace.P.ev_donor_min_pct)) === 55 && !(await p.$('#relaxDonor')));
  ok('EV panel at the defaults says every medical home lasts and suggests 96 h', (await text('evSummary')).includes('try') === false && (await text('evSummary')).includes('96 h'));
  ok('no EV proposals at the defaults', (await p.evaluate(() => window.__grace.sim.proposals.ev.length)) === 0);
  await p.$eval('#a-planned_outage_h', e => { e.value = 96; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(900);
  await p.focus('#tlWrap'); await p.keyboard.press('End');
  const evCount = await p.evaluate(() => window.__grace.sim.proposals.ev.length);
  ok('planned outage 96 h produces EV proposals at 55%', evCount >= 1 && (await p.evaluate(() => window.__grace.P.ev_donor_min_pct)) === 55, String(evCount));
  ok('EV proposals are listed with Approve buttons', (await p.$$('#evList .plan')).length === evCount && (await text('evSummary')).includes(`${evCount} proposed`));
  ok('restoration moved out with the planned outage', (await p.evaluate(() => window.__grace.sim.proposals.restore[0].startH)) === 208 + 96);
  await p.click('#approveAllEv'); await p.waitForTimeout(900);
  const evApproved = await p.evaluate(() => window.__grace.sim.totals.evApproved);
  ok('approve all EV trips', evApproved === evCount, `${evApproved}/${evCount}`);
  ok('approved trips bought hours', (await p.evaluate(() => window.__grace.sim.totals.evHoursBought)) > 10);
  const mbEnd = await p.evaluate(() => { const f = window.__grace.sim.fleet[281]; return [f.mbPower, f.mbTotal, f.faultsActual]; });
  ok('medical homes keep power to the end of the window after EV trips', mbEnd[0] >= mbEnd[1] - mbEnd[2] - 1, JSON.stringify(mbEnd));
  const cardHome = await p.evaluate(() => { const g = window.__grace; const pr = g.sim.proposals.ev[0]; const hm = g.world.homes[pr.medId]; const q = g.toPx(hm.x, hm.y); const r = document.getElementById('map').getBoundingClientRect(); return { x: r.x + q[0], y: r.y + q[1] }; });
  await legend(p, false);
  await p.mouse.click(cardHome.x, cardHome.y); await p.waitForTimeout(100);
  const cardText = await p.$eval('#homeCard', e => e.textContent);
  ok('medical home card shows the budget with the size factor and the medical device inside critical', cardText.includes('home size') && cardText.includes('inside the critical budget'), cardText.slice(0, 80));
  ok('real-event line at 96 h names this run\'s first restoration', (await text('realEvent')).includes('this run: first restoration Mon Oct 19, 4:00 PM'));
  ok('Hand narrative at 96 h mentions EV dispatch', (await text('narrative')).includes('EV dispatch'));
  await p.click('#cardClose');
  await legend(p, false);
  ok('drawer reports what changed at this hour after a re-run', (await text('drawerDelta')).startsWith('Re-ran 282 h'));
  // a short planned outage: the estimate passes, Grace re-plans and the card says so
  await p.$eval('#a-planned_outage_h', e => { e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await p.waitForTimeout(900);
  await p.evaluate(() => window.__grace.setHour(252)); await p.waitForTimeout(100);
  ok('40 h planned: medical homes are flagged before the Hand rung', (await p.evaluate(() => window.__grace.sim.proposals.unmet.concat(window.__grace.sim.proposals.ev).some(f => f.h < 260))));
  ok('40 h planned: the narrative says the estimate was extended', (await text('narrative')).includes('estimate extended 24 h'));
  const rp = await p.evaluate(() => { const g = window.__grace; const r = document.getElementById('map').getBoundingClientRect(); const hm = g.world.batteries.find(b => b.tier === 1 && g.sim.soc[252 * g.sim.N + b.bi] > 0); const q = g.toPx(hm.x, hm.y); return { x: r.x + q[0], y: r.y + q[1] }; });
  await legend(p, false); await p.mouse.click(rp.x, rp.y); await p.waitForTimeout(150);
  const card40 = await p.$eval('#homeCard', e => e.textContent);
  ok('40 h planned: the home card reads the horizon the engine used and says it was re-planned', /To restoration\d+ h \(estimate\)estimate passed, re-planned once/.test(card40), card40.slice(0, 160));
  await p.keyboard.press('Escape'); await legend(p, false);

  // theme toggle redraws without error and adds no duplicate listeners
  await p.evaluate(() => { window.__added = 0; const sel = document.getElementById('circuitSel'); const orig = sel.addEventListener.bind(sel); sel.addEventListener = (t, ...a) => { if (t === 'change') window.__added++; return orig(t, ...a); }; });
  await p.click('#themeBtn');
  await p.waitForTimeout(200);
  ok('theme toggle sets data-theme=dark', (await p.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
  const bgDark = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await p.click('#themeBtn'); await p.click('#themeBtn');
  ok('theme cycles back to auto', (await p.evaluate(() => document.documentElement.dataset.theme)) === undefined, bgDark);
  ok('theme toggles do not add duplicate change listeners to the circuit select', (await p.evaluate(() => window.__added)) === 0);
  ok('prior-art table keeps Base\'s claims attributed', (await text('paRows')).includes('Base says its battery holds more charge') && (await text('paRows')).includes('Base says the battery simply resumes'));
  // reset
  await p.click('#resetBtn'); await p.waitForTimeout(900);
  ok('reset restores defaults', (await p.evaluate(() => window.__grace.P.ev_donor_min_pct === 55 && window.__grace.P.planned_outage_h === 62 && window.__grace.sim.proposals.ev.length === 0)));
  // ---- round 2 checks ----
  ok('ladder cards carry their what-line at 1280x820 (visible, not only in the title)', await p.$eval('#stepWhat-hold', e => getComputedStyle(e).display !== 'none' && e.textContent.includes('Power off')) && await p.$eval('#step-hand', e => e.title.includes('shutoff officer')));
  ok('legend hidden by default on a map under 400 px tall (1280x820), button still opens it', await p.$eval('#mapWrap', e => e.getBoundingClientRect().height < 400) && await p.$eval('#legend', e => e.hidden));
  await p.click('#legendBtn'); ok('legend button opens the legend', await p.$eval('#legend', e => !e.hidden)); await legend(p, false);
  ok('legend names the standby state the same way as the status key', (await text('legend')).includes('grid on, recharge pending') && (await text('legend')).includes('Medical Baseline (demo)'));
  ok('fleet subtitle says Tuna\'s 500 are assumed', (await text('fleetSub')).includes("Tuna's 500 assumed"));
  await p.click('#step-hand');
  ok('real-event line marks the NWS Red Flag end after Today as a forecast', await p.$eval('#realEvent', e => e.querySelector('.pill') && e.querySelector('.pill').textContent === 'forecast'));
  await p.evaluate(() => window.__grace.setHour(273)); await p.waitForTimeout(100);
  ok('budget modes row counts only homes still off', (await text('protectRows')).includes('Budget modes (homes still off)') && /\d+ critical, \d+ essential, 0 normal; [\d,]+ back on the grid/.test(await text('protectRows')), (await text('protectRows')).slice(0, 160));
  await p.evaluate(() => document.getElementById('approveAllRestore').click()); await p.waitForTimeout(800);
  const narr273 = await text('narrative');
  const sums = await p.evaluate(() => { const g = window.__grace, h = 273; let ch = 0, hd = 0; for (const q of g.sim.proposals.restore) if (h >= q.startH + 2) { ch += g.sim.circuits[q.circuit].chargeKW[h]; hd += g.sim.circuits[q.circuit].headroomKW[h]; } return { ch: Math.round(ch), hd: Math.round(hd), restoring: g.sim.fleet[h].byStatus[8] }; });
  ok('Hand narrative with every plan approved prints the fleet charging inside the summed headroom of the circuits actually charging', narr273.includes(`${sums.restoring} batteries recharging, ${(sums.ch / 1000).toFixed(1)} MW inside ${(sums.hd / 1000).toFixed(1)} MW headroom on Galahad, Cuthbert`) && sums.ch <= sums.hd, narr273.slice(0, 200));
  ok('grid-back KPI splits recharging and pending', /Grid back: [\d,]+ recharging, [\d,]+ recharge pending/.test(await text('fleetKpis')));
  await p.evaluate(() => window.__grace.setHour(189)); await p.waitForTimeout(100);
  const narr189 = await text('narrative'), loadNow189 = await p.$eval('#loadNow', e => e.textContent);
  ok('Fill narrative headroom left equals the circuit panel\'s headroom left (post-allocation)', narr189.includes('Galahad: 276 kW charging, 195 kW headroom left') && loadNow189.includes('Headroom left 195 kW'), narr189.slice(-60) + ' | ' + loadNow189.slice(-40));
  // hit test replay: a tap 2 px off a battery home still opens a card, Medical Baseline diamonds included
  await p.evaluate(() => window.__grace.setHour(216)); await p.waitForTimeout(100);
  const hit = await p.evaluate(() => { const g = window.__grace, r = document.getElementById('map').getBoundingClientRect(); let n = 0, card = 0, line = 0, mb = 0, mbCard = 0; for (const hm of g.world.batteries) { const q = g.toPx(hm.x, hm.y); if (q[0] < 10 || q[0] > r.width - 10 || q[1] < 10 || q[1] > r.height - 10) continue; n++; const id = g.nearestHome(q[0] + 2, q[1] + 2); if (id >= 0 && g.world.homes[id].battery) card++; else if (id < 0) line++; if (hm.tier === 1) { mb++; if (id === hm.id) mbCard++; } } return { n, card, line, mb, mbCard }; });
  ok('desktop: a tap 2 px off a battery home opens a battery card at least 95% of the time', hit.card / hit.n >= 0.95, JSON.stringify(hit));
  ok('desktop: a tap 2 px off a Medical Baseline diamond opens that home\'s card', hit.mbCard >= hit.mb * 0.95, JSON.stringify(hit));
  // drawer: budget modes kept in order, cap slider capped at 100, whole-run delta line
  await p.$eval('#a-mode_critical', e => { e.value = 20; e.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(400);
  ok('budget modes stay in order: critical above essential is clamped and the note says so', (await p.evaluate(() => window.__grace.P.mode_critical)) === 16 && (await text('n-budget')).includes('kept at 16'));
  await p.$eval('#a-mode_critical', e => { e.value = 8; e.dispatchEvent(new Event('change', { bubbles: true })); }); await p.waitForTimeout(400);
  ok('cap slider never exceeds 100% (the engine is never looser than the spec)', (await p.$eval('#a-cold_load_cap_pct', e => +e.max)) === 100);
  await p.$eval('#a-ev_pct', e => { e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(900);
  ok('a control that changes nothing anywhere says so (EV share at the defaults)', (await text('drawerDelta')).includes('No change anywhere in this run') && (await text('drawerDelta')).includes('74 h'), await text('drawerDelta'));
  await p.$eval('#a-ev_pct', e => { e.value = 25; e.dispatchEvent(new Event('input', { bubbles: true })); }); await p.waitForTimeout(900);
  await p.click('#resetBtn'); await p.waitForTimeout(900);
  await p.screenshot({ path: path.join(here, '..', 'shots', 'interact-desktop-end.png') });
  ok('desktop: no page or console errors', errs.length === 0, errs.join(' | '));
  await ctx.close();

  // ---------- small laptops: the timeline is above the fold on the first frame ----------
  for (const [w, h] of [[1280, 720], [1366, 768], [1440, 900]]) {
    const c3 = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'light' });
    const p3 = await c3.newPage();
    await p3.goto('file://' + tmp, { waitUntil: 'load' }); await p3.waitForTimeout(400);
    const g3 = await p3.$eval('#timeline', e => Math.round(e.getBoundingClientRect().bottom));
    ok(`first frame at ${w}x${h}: timeline fully visible`, g3 <= h, `tlBottom ${g3}`);
    await c3.close();
  }

  // ---------- phone ----------
  const ctx2 = await b.newContext({ viewport: { width: 400, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark', hasTouch: true, isMobile: true });
  const q = await ctx2.newPage();
  const errs2 = [];
  q.on('pageerror', e => errs2.push('pageerror: ' + e.message));
  q.on('console', m => { if (m.type() === 'error') errs2.push('console: ' + m.text()); });
  await q.goto('file://' + tmp, { waitUntil: 'load' });
  await q.waitForTimeout(600);
  const ov = await q.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
  ok('phone: no horizontal overflow', ov.sw <= ov.cw, JSON.stringify(ov));
  await q.screenshot({ path: path.join(here, '..', 'shots', 'phone-1-top.png') });
  ok('phone: legend hidden by default', await q.$eval('#legend', e => e.hidden));
  ok('phone: math panel collapsed by default', await q.$eval('#mathBody', e => e.hidden));
  const mapTop = await q.$eval('#mapWrap', e => e.getBoundingClientRect().top);
  ok('phone: map starts within the first screen and a half', mapTop < 1200, String(mapTop));
  const pg = await q.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const m = r('mapWrap'), t = r('timeline'); return { mapTop: Math.round(m.top), visibleMap: Math.round(Math.min(m.bottom, t.top) - m.top), tlH: Math.round(t.height) }; });
  ok('phone: at least 250 px of map is visible above the sticky timeline on the first frame', pg.visibleMap >= 250, JSON.stringify(pg));
  const pgm = await q.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const m = r('mapWrap'), t = r('timeline'); return { covered: Math.max(0, Math.round(m.bottom - t.top)), mapH: Math.round(m.height) }; });
  ok('phone: the whole map clears the sticky timeline on the first frame', pgm.covered === 0 && pgm.mapH >= 260, JSON.stringify(pgm));
  const hdrPhone = await q.evaluate(() => { const b = document.getElementById('themeBtn').getBoundingClientRect(), t = document.querySelector('.tag').getBoundingClientRect(); const overlap = Math.max(0, Math.min(b.right, t.right) - Math.max(b.left, t.left)) * Math.max(0, Math.min(b.bottom, t.bottom) - Math.max(b.top, t.top)); return { overlap, btnH: b.height, rowH: document.querySelector('.hdr-r').getBoundingClientRect().height }; });
  ok('phone: the theme button never covers the tagline and the clock row is one row', hdrPhone.overlap === 0 && hdrPhone.btnH >= 40 && hdrPhone.rowH <= 44, JSON.stringify(hdrPhone));
  await q.evaluate(() => document.getElementById('legendBtn').click()); await q.waitForTimeout(400);
  const legT = await q.evaluate(() => [...document.querySelectorAll('#legendCircuits button')].map(b => Math.round(b.getBoundingClientRect().height)));
  ok('phone: legend circuit buttons are at least 40 px tall', legT.length === 7 && legT.every(h => h >= 40), legT.join(','));
  await q.evaluate(() => document.getElementById('legendBtn').click());
  await q.evaluate(() => document.getElementById('drawerBtn').click()); await q.waitForTimeout(100);
  ok('phone: the mesh switch row is a 40 px target', await q.$eval('label.switch[for=a-mesh]', e => e.getBoundingClientRect().height >= 40));
  await q.evaluate(() => document.getElementById('drawerBtn').click());
  await q.evaluate(() => window.scrollTo(0, 0));
  const smallTargets = await q.evaluate(() => { const out = []; for (const el of document.querySelectorAll('button, select, input[type=number], input[type=checkbox], a')) { const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) continue; if (r.height < 39.5 || (el.tagName !== 'A' && r.width < 24)) out.push(`${el.id || el.tagName}(${Math.round(r.width)}x${Math.round(r.height)})`); } return out; });
  ok('phone: every button, select, input and link is at least 40 px tall', smallTargets.length === 0, smallTargets.join(', '));
  ok('phone: KPI values fit their columns', await q.$eval('#fleetKpis', e => [...e.querySelectorAll('.kpi .v')].every(v => v.scrollWidth <= v.clientWidth + 1)));
  ok('phone: rung jumps live in the ladder (timeline row stays compact)', await q.$eval('#rungBtns', e => getComputedStyle(e).display === 'none'));
  await q.evaluate(() => document.getElementById('bulletin').click()); await q.waitForTimeout(100);
  const tlExp = await q.$eval('#timeline', e => e.getBoundingClientRect().height);
  ok('phone: expanded timeline stays under 46% of the screen', tlExp <= 800 * 0.46, String(tlExp));
  await q.evaluate(() => document.getElementById('bulletin').click());
  await q.click('#step-fill');
  ok('phone: ladder step jumps the timeline', (await q.$eval('#clock', e => e.textContent)) === 'Wed Oct 14, 7:00 AM');
  await q.click('#step-hold');
  await q.evaluate(() => document.getElementById('mapWrap').scrollIntoView()); await q.waitForTimeout(150);
  // tap a home
  const hm2 = await q.evaluate(() => { const g = window.__grace; const r = document.getElementById('map').getBoundingClientRect(); let best = null, bd = 1e9; for (const hm of g.world.batteries) { const q = g.toPx(hm.x, hm.y); const d = (q[0] - r.width / 2) ** 2 + (q[1] - r.height / 2) ** 2; if (d < bd) { bd = d; best = { x: r.x + q[0], y: r.y + q[1] }; } } return best; });
  await q.touchscreen.tap(hm2.x, hm2.y);
  await q.waitForTimeout(150);
  ok('phone: tap shows a pinned card', await q.$eval('#homeCard', e => !e.hidden && e.classList.contains('pinned')));
  ok('phone: the card close button is at least 40 px', await q.$eval('#cardClose', e => { const r = e.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; }));
  await q.screenshot({ path: path.join(here, '..', 'shots', 'phone-2-card.png') });
  await q.click('#cardClose');
  // scroll to panels: timeline should stick to the bottom of the viewport
  await q.evaluate(() => window.scrollTo(0, 900));
  await q.waitForTimeout(200);
  const tlRect = await q.$eval('#timeline', e => { const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  ok('phone: timeline sticks to the bottom while reading panels', Math.abs(tlRect.bottom - 800) < 2, JSON.stringify(tlRect));
  await q.screenshot({ path: path.join(here, '..', 'shots', 'phone-3-panels.png') });
  await q.evaluate(() => window.scrollTo(0, 1700)); await q.waitForTimeout(150);
  await q.screenshot({ path: path.join(here, '..', 'shots', 'phone-4-circuit.png') });
  await q.evaluate(() => window.scrollTo(0, 0)); await q.click('#step-hand'); await q.waitForTimeout(150);
  ok('phone: Hand chip is short and says planned', (await q.$eval('#rungChip', e => e.textContent)) === 'Hand (planned)');
  ok('phone: the clock row stays one row at the Hand rung', (await q.$eval('.hdr-r', e => e.getBoundingClientRect().height)) <= 44);
  const tlFocus = await q.evaluate(async () => { const c = document.getElementById('tlCanvas').getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
  await q.touchscreen.tap(tlFocus.x, tlFocus.y); await q.waitForTimeout(100);
  ok('phone: a touch tap on the timeline scrubs without leaving a focus ring', (await q.evaluate(() => !document.querySelector('#tlWrap:focus-visible'))));
  await q.evaluate(() => document.getElementById('approvalsPanel').scrollIntoView()); await q.waitForTimeout(150);
  await q.screenshot({ path: path.join(here, '..', 'shots', 'phone-5-approvals.png') });
  await q.click('#mathBtn'); await q.waitForTimeout(100);
  ok('phone: math panel opens and fills', await q.$eval('#mathBody', e => !e.hidden && e.textContent.includes('Headroom cap')));
  await q.click('#drawerBtn'); await q.evaluate(() => document.getElementById('assumptionsPanel').scrollIntoView()); await q.waitForTimeout(150);
  await q.screenshot({ path: path.join(here, '..', 'shots', 'phone-6-drawer.png') });
  await q.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await q.waitForTimeout(150);
  await q.screenshot({ path: path.join(here, '..', 'shots', 'phone-7-bottom.png') });
  const ov2 = await q.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth }));
  ok('phone: still no horizontal overflow after interactions', ov2.sw <= ov2.cw, JSON.stringify(ov2));
  ok('phone: no page or console errors', errs2.length === 0, errs2.join(' | '));
  await ctx2.close();
  await b.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
