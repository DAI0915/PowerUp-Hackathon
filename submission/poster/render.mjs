// Renders poster.html to poster.pdf (24 x 36 in) and poster.png.
// Usage: node submission/poster/render.mjs [url]   (default: the GitHub Pages demo; the QR code is made by segno)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pwPath = join(execFileSync('npm', ['root', '-g']).toString().trim(), 'playwright');
const { chromium } = require(pwPath);

const url = process.argv[2] || 'https://mrbese.github.io/PowerUp/';
let qrSvg = null;
if (url) {
  qrSvg = execFileSync('python3', ['-I', '-c',
    'import sys,segno,io;b=io.BytesIO();segno.make(sys.argv[1],error="m").save(b,kind="svg",scale=10,border=0,dark="#13202A",light=None,xmldecl=False,svgns=True);print(b.getvalue().decode())', url]).toString();
}

const browser = await chromium.launch(Object.assign(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}, process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}));
const page = await browser.newPage({ viewport: { width: 2304, height: 3456 } });
await page.goto(pathToFileURL(join(here, 'poster.html')).href, { waitUntil: 'networkidle' });
if (url) {
  await page.evaluate(([u, svg]) => {
    document.getElementById('link').textContent = u.replace(/^https:\/\//, '');
    document.getElementById('qr').innerHTML = svg;
  }, [url, qrSvg]);
}
await page.evaluate(() => document.fonts.ready);
const overflow = await page.evaluate(() => {
  const b = document.body;
  const kids = [...b.children].map((el) => ({ tag: el.tagName, h: Math.round(el.getBoundingClientRect().height) }));
  const filler = document.querySelector('.fill').getBoundingClientRect().height;
  return { scrollHeight: b.scrollHeight, filler: Math.round(filler), kids, fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight) };
});
console.log(JSON.stringify(overflow));
await page.screenshot({ path: join(here, 'poster.png'), fullPage: false });
await page.pdf({ path: join(here, 'poster.pdf'), width: '24in', height: '36in', printBackground: true, pageRanges: '1' });
await browser.close();
