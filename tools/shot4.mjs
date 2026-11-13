// Gebruik: node tools/shot4.mjs <id> [N=4] [t1,t2,...] [out-prefix] [extra-query]
// VW=1100 VH=650 stelt de venstergrootte in (bijv. VW=800 VH=600 voor een smal scherm).
// Start spel <id> met N spelers (?players=N), alle spelers klaar, random input; screenshot op t1,t2,... seconden speeltijd
// (na het aftellen). Uitvoer: <prefix>_<N>_<t>.png (standaard /tmp/s4/<id>). Print console-fouten.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { chromePath, BROWSER_ARGS } from './chrome_path.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const id = process.argv[2] || 'catch'; const N = +(process.argv[3] || 4);
const times = (process.argv[4] || '3,10').split(',').map(Number);
const prefix = process.argv[5] || `/tmp/s4/${id}`; const extra = process.argv[6] || '';
fs.mkdirSync(path.dirname(prefix), { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: chromePath(), args: BROWSER_ARGS });
const page = await browser.newPage({ viewport: { width: +(process.env.VW || 1100), height: +(process.env.VH || 650) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|ERR_/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=${id}&quality=low&players=${N}${extra}`);
await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${prefix}_${N}_intro.png` });
await page.evaluate(async () => {
  const app = window.__app, mode = app.mode, inp = app.input;
  for (const q of mode.ids) inp.virtual[q].a = true; inp.update(); mode.update(0.016);
  for (const q of mode.ids) inp.virtual[q].a = false; inp.update(); mode.update(0.016);
  await new Promise((r) => setTimeout(r, 600));
  let g = 0; while (mode.state !== 'play' && g++ < 3000) { inp.update(); mode.update(0.016); }
});
const t0 = Date.now(); let k = 0;
while (k < times.length) {
  await page.evaluate(() => { const app = window.__app, i = app.input; app.mode.ids.forEach((q, c) => { const v = i.virtual[q]; v.x = Math.sin(Date.now() / 700 + c * 2); v.y = Math.cos(Date.now() / 900 + c); v.a = Math.random() < 0.3; v.b = Math.random() < 0.2; }); });
  await page.waitForTimeout(120);
  if ((Date.now() - t0) / 1000 >= times[k]) { await page.screenshot({ path: `${prefix}_${N}_${times[k]}.png` }); k++; }
}
console.log('STATE', JSON.stringify(await page.evaluate(() => ({ state: window.__app.mode?.state }))));
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
