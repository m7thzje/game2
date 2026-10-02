// node tools/hubtest.mjs [seconden] [prefix]  — start het dorp, sla intro over, loopt rond, maakt screenshots
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const secs = +(process.argv[2] || 10); const pre = process.argv[3] || '/tmp/hub';
const extra = process.argv[4] || '';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { if (m.text().startsWith('merge')) console.log(m.text()); if (['error', 'warning'].includes(m.type()) && !/CERT|404|niet geladen/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
await page.addInitScript((t) => { if (t) window.__TOD = +t; }, process.env.TOD); await page.goto(`http://localhost:${port}/?hub&${extra}`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.players, null, { timeout: 120000 }).catch((e) => errors.push('timeout bij laden: ' + e.message));
await page.evaluate(() => { const S = window.__app.S; S.flags.intro = true; S.settings.scare = 0; if (window.__TOD) S.tod = window.__TOD; });
await page.waitForTimeout(3000);
await page.screenshot({ path: pre + '_1.png' });
const t0 = Date.now(); let n = 0;
while ((Date.now() - t0) / 1000 < secs) {
  await page.evaluate((k) => { const i = window.__app.input; i.virtual[0].y = -1; i.virtual[0].x = 0.3 * Math.sin(Date.now() / 1500); i.virtual[1].y = -1; i.virtual[1].x = -0.2; }, n);
  await page.waitForTimeout(200); n++;
}
await page.evaluate(() => { const i = window.__app.input; i.virtual[0].y = 0; i.virtual[1].y = 0; i.virtual[0].x = 0; i.virtual[1].x = 0; });
await page.waitForTimeout(800);
await page.screenshot({ path: pre + '_2.png' });
console.log('STATE', JSON.stringify(await page.evaluate(() => ({ fps: Math.round(window.__app.fps), pos: window.__app.mode.players.map((p) => [p.x | 0, p.z | 0]), tod: window.__app.S.tod, draw: window.__app.renderer.info.render.calls, tris: window.__app.renderer.info.render.triangles }))));
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 12).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
