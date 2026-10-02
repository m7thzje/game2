// Testscenario's voor Taverne-keuken. Gebruik: node tools/test_kitchen.mjs [scenario] [out-prefix]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const scen = process.argv[2] || 'look'; const out = process.argv[3] || '/tmp/k';
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
const W = +(process.env.W || 1100), H = +(process.env.H || 650);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|minigame niet geladen/.test(t)) errors.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=kitchen&quality=${process.env.Q || 'low'}`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
const ev = (fn, arg) => page.evaluate(fn, arg);
// in-page helpers
await ev(() => {
  window.step = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { __app.input.update(); __app.mode.update(dt); } };
  window.K = () => __app.mode.instance.dbg;
  window.V = (i) => __app.input.virtual[i];
});
const step = (n, dt) => ev(([n, dt]) => step(n, dt), [n, dt || 0.05]);
const shot = (name) => page.screenshot({ path: `${out}_${name}.png` });
async function start() {
  await ev(() => { V(0).a = true; V(1).a = true; }); await step(2); await ev(() => { V(0).a = false; V(1).a = false; }); await step(2);
  await page.waitForFunction(() => __app.mode.state === 'countdown' || __app.mode.state === 'play', null, { timeout: 20000 });
  await step(90); // aftellen
}
const S = { page, ev, step, shot, start, errors, server, browser, out, W, H };
globalThis.S = S;
const mod = await import(`./kitchen_scen/${scen}.mjs`);
await mod.default(S);
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
