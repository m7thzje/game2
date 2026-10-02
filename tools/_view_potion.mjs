// hulpscript: camera-standpunten voor Toverdrank (alleen ontwikkeling)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const game = process.argv[2] || 'potion';
const views = JSON.parse(process.argv[3] || '[]'); // [{name,pos:[x,y,z],look:[x,y,z]}]
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('x'); return; } res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
page.on('pageerror', (e) => console.log('PAGEERR', e.message));
await page.goto(`http://localhost:${port}/?game=${game}&quality=low&scare=0`);
await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 30000 });
await page.waitForTimeout(1000);
await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = true; i.virtual[1].a = true; });
await page.waitForTimeout(300);
await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = false; i.virtual[1].a = false; });
await page.waitForFunction(() => window.__app.mode.state === 'countdown');
await page.evaluate(() => { const app = window.__app; for (let k = 0; k < 120; k++) { app.input.update(); app.mode.update(0.05); } });
for (const v of views) {
  await page.evaluate(({ v }) => { const m = window.__app.mode; m.paused = true; m.camera.position.set(...v.pos); m.camera.lookAt(...v.look); if (v.fov) { m.camera.fov = v.fov; m.camera.updateProjectionMatrix(); } if (v.eval) eval(v.eval); }, { v });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `/tmp/view_${v.name}.png` });
}
await browser.close(); server.close();
