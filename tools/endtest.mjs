import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/CERT|404|Failed to load/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.goto(`http://localhost:${port}/?hub`);
await page.waitForFunction(() => window.__app?.mode?.players, null, { timeout: 120000 });
await page.evaluate(async () => { const S = window.__app.S; S.flags.intro = true; S.ticket = true; S.vip = true; const { EndingMode } = await import('/src/world/ending.js'); window.__app.setMode(await EndingMode.create(window.__app, {})); });
let shot = 0;
for (let i = 0; i < 70; i++) {
  await page.evaluate(() => { window.__app.input.virtual[0].a = true; }); await page.waitForTimeout(300); await page.evaluate(() => { window.__app.input.virtual[0].a = false; }); await page.waitForTimeout(500);
  if (i % 8 === 4 && shot < 8) { await page.screenshot({ path: `/tmp/end_${shot++}.png` }); }
}
console.log('klaar, screenshots', shot, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
