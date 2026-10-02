// Gebruik: node tools/test_potion.mjs <scenario> [uit.png-prefix]
// Scenario's: win | lose | mixed | wrongturn
// Speelt Toverdrank Memory met een bot (snel vooruit via handmatige update-stappen) en controleert de spelregels.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const scen = process.argv[2] || 'win'; const out = process.argv[3] || `/tmp/potion_${scen}`;
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
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/404|niet geladen|CERT/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=potion&quality=low&scare=0`);
await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 30000 });
await page.waitForTimeout(1000);
for (let k = 0; k < 12; k++) {
  if (await page.evaluate(() => window.__app.mode.state !== 'intro')) break;
  await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = true; i.virtual[1].a = true; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = false; i.virtual[1].a = false; });
  await page.waitForTimeout(600);
}
await page.waitForFunction(() => window.__app.mode.state === 'countdown' || window.__app.mode.state === 'play', null, { timeout: 15000 });

const log = [];
const result = await page.evaluate(async ({ scen }) => {
  const app = window.__app, inp = app.input, V = inp.virtual; const dirs = ['up', 'left', 'right', 'down'];
  const I = () => app.mode.instance;
  const step = (n = 1) => { for (let k = 0; k < n; k++) { inp.update(); app.mode.update(0.05); } };
  const rel = () => { for (const v of V) for (const d of [...dirs, 'a', 'b']) v[d] = false; };
  const press = (who, key) => { rel(); for (const w of [].concat(who)) V[w][key] = true; step(1); rel(); step(1); };
  const events = []; const t0 = performance.now();
  while (app.mode.state !== 'play') step(1);
  let guard = 0, wrongDone = 0, mistakes = 0; const seen = new Set();
  const lenHist = [];
  while (app.mode.state === 'play' && guard++ < 60000) {
    const d = I().dbg();
    if (scen === 'stir' && d.phase === 'stir' && d.len === 4) { step(6); break; }
    if (scen === 'dbl' && d.phase === 'show' && d.len === 5 && d.showK === 4) { step(3); break; }
    if (d.phase === 'input') {
      if (d.idx === 0 && !seen.has('in' + d.len + '_' + d.lives)) { seen.add('in' + d.len + '_' + d.lives); lenHist.push(`len${d.len} lives${d.lives} swap${d.swapOff} dbl:${d.seq.map((s) => (s.dbl ? 'D' : '-')).join('')}`); }
      const s = d.seq[d.idx]; const own = (d.idx + d.swapOff) % 2;
      let wrong = false;
      if (scen === 'lose' && d.len >= 3) wrong = true;
      if (scen === 'mixed' && d.len === 4 && wrongDone < 1) { wrong = true; wrongDone++; }
      if (scen === 'mixed' && d.len === 7 && wrongDone < 2 && d.idx === 3) { wrong = true; wrongDone++; }
      if (scen === 'wrongturn' && !seen.has('wt' + d.len + d.idx)) {
        seen.add('wt' + d.len + d.idx);
        // de verkeerde speler drukt de goede richting: moet genegeerd worden (geen leven weg) als niet dbl
        if (!s.dbl) { const before = I().dbg().lives; press(1 - own, dirs[s.dir]); if (I().dbg().lives !== before || I().dbg().idx !== d.idx) events.push('FOUT: verkeerde speler had effect'); else events.push('ok negeren'); }
      }
      if (scen === 'err' && d.len === 4 && d.idx === 1) { press(own, dirs[(s.dir + 1) % 4]); step(5); break; }
      if (wrong) { mistakes++; press(own, dirs[(s.dir + 1) % 4]); continue; }
      if (s.dbl) {
        if (scen === 'mixed' && d.len === 6 && !seen.has('late')) { seen.add('late'); press(0, dirs[s.dir]); step(30); const e = I().dbg(); events.push('te laat dubbel -> lives ' + e.lives + ' phase ' + e.phase); continue; }
        rel(); V[0][dirs[s.dir]] = true; V[1][dirs[s.dir]] = true; step(1); rel(); step(1);
      } else press(own, dirs[s.dir]);
    } else if (d.phase === 'stir') {
      press(d.st[0] < d.stirNeed ? 0 : 1, 'a');
      if (d.st[0] >= d.stirNeed) press(1, 'a');
    } else step(2);
    if (scen === 'win' && d.len === 7 && d.phase === 'input' && d.idx === 3 && !window.__shot1) { window.__shot1 = true; break; }
  }
  return { events, lenHist, state: app.mode.state, dbg: I().dbg(), res: app.mode.result || null, mistakes };
}, { scen });
console.log(JSON.stringify(result, null, 1));
await page.screenshot({ path: out + '_a.png' });
if (scen === 'win' && result.state === 'play') {
  // vervolg: speel door naar het einde, met screenshot onderweg
  const res2 = await page.evaluate(async () => {
    const app = window.__app, inp = app.input, V = inp.virtual; const dirs = ['up', 'left', 'right', 'down'];
    const I = () => app.mode.instance; const step = (n = 1) => { for (let k = 0; k < n; k++) { inp.update(); app.mode.update(0.05); } };
    const rel = () => { for (const v of V) for (const d of [...dirs, 'a', 'b']) v[d] = false; };
    const press = (who, key) => { rel(); V[who][key] = true; step(1); rel(); step(1); };
    let g = 0;
    while (app.mode.state === 'play' && g++ < 60000) {
      const d = I().dbg();
      if (d.phase === 'input') { const s = d.seq[d.idx]; const own = (d.idx + d.swapOff) % 2; if (s.dbl) { rel(); V[0][dirs[s.dir]] = V[1][dirs[s.dir]] = true; step(1); rel(); step(1); } else press(own, dirs[s.dir]); }
      else if (d.phase === 'stir') { press(0, 'a'); press(1, 'a'); } else step(2);
    }
    for (let k = 0; k < 10; k++) step(1);
    return { state: app.mode.state, dbg: I().dbg(), res: app.mode.result, g };
  });
  console.log('END', JSON.stringify(res2));
}
await page.waitForTimeout(2500);
await page.screenshot({ path: out + '_end.png' });
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
