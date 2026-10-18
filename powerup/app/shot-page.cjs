// Usage: NODE_PATH=$(npm root -g) node shot-page.cjs <page.html> <outPrefix> [script.js]
// Renders the page fragment inside the same skeleton the Artifact publisher uses, at desktop (1280) and phone (400)
// widths, in light and dark themes. Writes <outPrefix>-{desktop,phone}-{light,dark}.png and prints console errors,
// page errors, horizontal overflow and the rendered page height. An optional script.js is evaluated in the page
// after load (async function body, receives `page` context via window) for interaction checks.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [,, file, out, extra] = process.argv;
  let html = fs.readFileSync(file, 'utf8');
  if (!/^\s*<!doctype/i.test(html)) {
    html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n' + html + '\n</body></html>';
  }
  const tmp = path.resolve(path.dirname(out), path.basename(out) + '.wrapped.html');
  fs.writeFileSync(tmp, html);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const report = [];
  for (const [name, w, h] of [['desktop', 1280, 820], ['phone', 400, 800]]) {
    for (const theme of ['light', 'dark']) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: theme });
      const p = await ctx.newPage();
      const errs = [];
      p.on('pageerror', e => errs.push('pageerror: ' + e.message));
      p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
      p.on('requestfailed', r => { if (!/fonts\.g/.test(r.url())) errs.push('requestfailed: ' + r.url()); });
      await p.goto('file://' + tmp, { waitUntil: 'load', timeout: 30000 }).catch(e => errs.push('goto: ' + e.message));
      await p.waitForTimeout(800);
      if (extra) { try { await p.evaluate(fs.readFileSync(extra, 'utf8')); await p.waitForTimeout(500); } catch (e) { errs.push('extra: ' + e.message); } }
      const m = await p.evaluate(() => ({ sw: document.scrollingElement.scrollWidth, cw: document.scrollingElement.clientWidth, sh: document.scrollingElement.scrollHeight }));
      await p.screenshot({ path: `${out}-${name}-${theme}.png`, fullPage: m.sh < 6000 });
      report.push({ view: `${name}-${theme}`, overflowX: m.sw > m.cw ? `${m.sw}>${m.cw}` : 'none', height: m.sh, errors: errs.filter(e => !/fonts\.g/.test(e)) });
      await ctx.close();
    }
  }
  await b.close();
  console.log(JSON.stringify(report, null, 1));
})();
