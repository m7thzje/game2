import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 550 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${port}/?hub`);
await page.waitForFunction(() => window.__app?.mode?.players, null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const S = window.__app.S; S.flags.intro = true; S.settings.scare = 2; S.coins = 100;
  const m = window.__app.mode; m.busy = false; const inp = window.__app.input;
  const res = {};
  // A: banish met lantaarn
  const d = m.W.doors.find((x) => x.owner === 'Bakkerij'); m.players.forEach((p, i) => { p.x = d.x + 7 + i; p.z = d.z; });
  m.deur.show(d, { seconds: 60, chase: true });
  for (let i = 0; i < 100 && m.deur.state !== 'chase'; i++) { m.update(0.05); }
  res.afterShow = m.deur.state;
  inp.virtual[0].b = true; inp.virtual[1].b = true;
  let t = 0; while (t < 12 && m.deur.state === 'chase') { inp.update(); m.update(0.05); t += 0.05; }
  inp.virtual[0].b = false; inp.virtual[1].b = false;
  res.lit = { state: m.deur.state, banished: S.banished, seconds: +t.toFixed(1) };
  for (let i = 0; i < 80; i++) { inp.update(); m.update(0.05); }
  res.afterBanish = m.deur.state; res.coinsOnGround = m.pickups.coins.filter((c) => !c.st).length;
  // B: gevangen zonder licht
  m.deur.reset(100); const d2 = m.W.doors.find((x) => x.owner === 'Taverne'); m.players.forEach((p, i) => { p.x = d2.x - 7 - i; p.z = d2.z; });
  m.deur.show(d2, { seconds: 60, chase: true });
  let c = 0; while (c < 400 && !['caught', 'idle'].includes(m.deur.state) || (m.deur.state === 'idle' && c < 5)) { inp.update(); m.update(0.05); c++; if (m.deur.state === 'caught') break; }
  res.caught = { state: m.deur.state, coins: S.coins };
  return res;
});
console.log(JSON.stringify(out)); console.log(errors.length ? errors.join('\n') : 'NO ERRORS');
await browser.close(); server.close();
