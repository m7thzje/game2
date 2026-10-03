// Test: volledig toernooi (5 duels) in de Speelhal, met automatisch doorklikken. Controleert Kampioen + 50 heitjes.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 650 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack||'').split('\n').slice(1,4).join(' | ')));
await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__app && window.__app.games, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__app.goArcade({}));
await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs, null, { timeout: 60000 });
const c0 = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { coins: S.coins, t: [...S.arcade.tourneys], plays: S.arcade.plays }; });
await page.evaluate(() => { const m = window.__app.mode; for (const p of m.players) { p.x = 12; p.z = -2; } window.__t = m.startTourney(); });
let duels = 0, done = false;
for (let i = 0; i < 400 && !done; i++) {
  const r = await page.evaluate(async () => {
    const app = window.__app, m = app.mode, inp = app.input, pulse = () => { inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); m.update && 0; inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); };
    const { S } = await import('/src/save.js');
    if (m.ctx) {   // minigame
      if (m.finished) { if (m.resultReady) { pulse(); m.update(0.016); return 'close'; } return 'wait'; }
      if (m.state !== 'play') { pulse(); m.update(0.016); let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); } return 'start'; }
      for (let k = 0; k < 60; k++) { inp.update(); m.update(0.016); }
      m.ctx.finishPvp({ winner: S.arcade.plays % 3 === 0 ? null : S.arcade.plays % 2, score: [1, 0], summary: 'toernooitest' }); return 'finish';
    }
    if (m.cabs) { const ui = (await import('/src/engine/ui.js')).ui; return (ui.dialogActive() || m.menu || m.modal) ? 'dialog' : 'idle'; }
    return 'other';
  });
  if (r === 'dialog') { await page.evaluate(() => { const v = window.__app.input.virtual; v[0].a = true; }); await page.waitForTimeout(150); await page.evaluate(() => { window.__app.input.virtual[0].a = false; }); await page.waitForTimeout(150); }
  if (r === 'close') duels++;
  const s = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { coins: S.coins, t: [...S.arcade.tourneys], plays: S.arcade.plays }; });
  if (s.coins >= c0.coins + 5 * 12 + 50 - 30 && s.plays >= c0.plays + 5 && (s.t[0] + s.t[1] > c0.t[0] + c0.t[1] || s.coins >= c0.coins + 100)) { done = true; console.log('toernooi klaar', JSON.stringify({ c0, s })); }
  await page.waitForTimeout(250);
}
await page.waitForTimeout(3000);
const fin = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { coins: S.coins, t: [...S.arcade.tourneys], plays: S.arcade.plays }; });
console.log('duels gespeeld:', duels, 'eind:', JSON.stringify(fin), 'start:', JSON.stringify(c0));
await page.screenshot({ path: '/tmp/tourney_end.png' });
console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'NO ERRORS');
await b.close(); server.close();
