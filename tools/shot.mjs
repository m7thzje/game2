// Gebruik: node tools/shot.mjs <id> [seconden] [out.png] [--hub]
// Start de game headless, speelt random input en maakt screenshots. Print console-fouten.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const id = args[0] || 'catch'; const secs = +(args[1] || 8); const out = args[2] || `/tmp/shot_${id}.png`;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
const url = flags.includes('--hub') ? `http://localhost:${port}/?hub` : `http://localhost:${port}/?game=${id}&quality=low`;
await page.goto(url);
await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: out.replace('.png', '_intro.png') });
// beide spelers klaar
await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = true; i.virtual[1].a = true; });
await page.waitForTimeout(250);
await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = false; i.virtual[1].a = false; });
await page.waitForTimeout(5000); // aftellen
const t0 = Date.now(); let n = 0;
while ((Date.now() - t0) / 1000 < secs) {
  await page.evaluate(() => { const i = window.__app.input; for (const k of [0, 1]) { const v = i.virtual[k]; v.x = Math.sin(Date.now() / 700 + k * 2); v.y = Math.cos(Date.now() / 900 + k); v.a = Math.random() < 0.3; v.b = Math.random() < 0.2; } });
  await page.waitForTimeout(150);
  if (++n === Math.floor(secs * 6 / 2)) await page.screenshot({ path: out });
}
await page.screenshot({ path: out.replace('.png', '_end.png') });
const state = await page.evaluate(() => ({ fps: window.__app.fps, state: window.__app.mode?.state, hud: document.getElementById('hud').innerText.replace(/\n+/g, ' | ').slice(0, 200) }));
console.log('STATE', JSON.stringify(state));
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
