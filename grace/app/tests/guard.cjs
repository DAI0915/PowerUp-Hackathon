// PowerUp checks for the Interlock panel and the islands band in the Malibu replay. Run: NODE_PATH=$(npm root -g) node tests/guard.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const here = __dirname;
let html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>\n' + html + '\n</body></html>';
fs.mkdirSync(path.join(here, '..', 'shots'), { recursive: true });
const tmp = path.join(here, '..', 'shots', 'guard.wrapped.html');
fs.writeFileSync(tmp, html);
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('ok  ', name); } else { fail++; console.log('FAIL', name, extra || ''); } };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  for (const [w, h] of [[1280, 820], [400, 800]]) {
    const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + tmp, { waitUntil: 'load' });
    await p.waitForTimeout(500);
    const tag = `${w}px:`;
    ok(`${tag} default mode is six failures, guard on`, (await p.evaluate(() => window.__grace.guardMode)) === 'on');
    ok(`${tag} scoreboard shows guard off and guard on`, (await p.$eval('#guardScore', e => e.textContent)).includes('Guard off'));
    const m = await p.evaluate(() => window.__grace.guard.metrics);
    ok(`${tag} guard on keeps every Medical Baseline home lit`, m.on.mbDarkHomes === 0, JSON.stringify(m.on));
    ok(`${tag} guard off darkens Medical Baseline homes`, m.off.mbDarkHomes > 0);
    await p.evaluate(() => window.__grace.setHour(236));
    const darkOn = await p.evaluate(() => window.__grace.sim.fleet[236].byStatus[window.__grace.sim.S.empty]);
    await p.click('[data-gmode="off"]');
    const darkOff = await p.evaluate(() => window.__grace.sim.fleet[236].byStatus[window.__grace.sim.S.empty]);
    ok(`${tag} switching to guard off changes the map and fleet (empty homes Oct 16 8 PM: on ${darkOn}, off ${darkOff})`, darkOff > darkOn);
    ok(`${tag} guard off marks failures as ran as sent`, (await p.$eval('#guardLog', e => e.textContent)).includes('ran as sent'));
    await p.click('[data-gmode="plan"]');
    const g = await p.evaluate(() => { const L = window.__grace.guard.log; return { n: L.length, chaos: L.filter(e => !e.order.plan).length, stopped: L.filter(e => e.order.who === 'grace' && (!e.ran || e.verdict === 'clamp')).length }; });
    ok(`${tag} no failures: no simulated orders, and Grace is never stopped`, g.chaos === 0 && g.stopped === 0 && g.n > 0, JSON.stringify(g));
    ok(`${tag} no failures: the page shows Grace's own plan`, await p.evaluate(() => window.__grace.sim === window.__grace.baseSim));
    await p.click('[data-gmode="on"]');
    await p.evaluate(() => window.__grace.setHour(212));
    ok(`${tag} log lists the stolen key as held for a person`, (await p.$eval('#guardLog', e => e.textContent)).includes('held, to a person'));
    const jump = await p.$('#guardLog button[data-h="205"]');
    if (jump) { await jump.click(); ok(`${tag} a log time jumps the replay`, (await p.evaluate(() => window.__grace.hour)) === 205); }
    // islands band and the estimated switch layer
    ok(`${tag} islands band plans the Merlin island`, (await p.$eval('#islPlan', e => e.textContent)).includes('COAST (313) can island'));
    await p.click('[data-icomm="0"]');
    ok(`${tag} without a community battery the island does not form`, (await p.$eval('#islPlan', e => e.textContent)).includes('no grid-forming source'));
    await p.click('[data-icomm="1"]'); await p.click('[data-ihours="213"]');
    ok(`${tag} a 213 h shutoff runs on solar`, (await p.$eval('#islPlan', e => e.textContent)).includes('rooftop solar carries the island'));
    ok(`${tag} switch table lists SCE's eight line devices, positions estimated`, (await p.$$('#islSwitches tbody tr')).length === 8 && (await p.$eval('#islands', e => e.textContent)).includes('estimated'));
    await p.click('#islSwitches button[data-dev="RAR0775"]');
    ok(`${tag} tapping a switch focuses it on the map`, (await p.evaluate(() => window.__grace.islFocus)) === 'RAR0775');
    const ov = await p.evaluate(() => document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth);
    ok(`${tag} no horizontal overflow`, ov);
    ok(`${tag} no page errors`, errs.length === 0, errs.join(' | '));
  }
  await b.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
