// Gebruik: node tools/test_sokoban.mjs <scenario> [uit-prefix]
//  shots : speelt voor elk level de BFS-oplossing af (via _dbg.move) en maakt screenshots (begin / midden / klaar)
//  input : speelt level 1 echt via virtuele toetsen (test van de invoer, herhalen, herstarten)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { LEVELS, parseLevel } from '../src/games/sokoban_levels.js';
import { solve } from './solve_sokoban_lib.mjs';

const scenario = process.argv[2] || 'shots'; const out = process.argv[3] || '/tmp/sk';
const only = process.argv[4] ? process.argv[4].split(',').map(Number) : null;
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
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|minigame niet geladen/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=sokoban&quality=low&scare=0`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: out + '_intro.png' });
// beide spelers klaar
for (let k = 0; k < 6; k++) {
  const st = await page.evaluate(() => window.__app.mode.state);
  if (st !== 'intro') break;
  await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = true; i.virtual[1].a = true; });
  await page.waitForTimeout(350);
  await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = false; i.virtual[1].a = false; });
  await page.waitForTimeout(350);
}
await page.waitForFunction(() => window.__app.mode.state === 'play', null, { timeout: 60000 });
await page.waitForTimeout(500);
const log = (...a) => console.log(...a);
const frames = (n) => page.evaluate((n) => new Promise((res) => { let k = 0; const f = () => { if (++k >= n) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), n);
const dbg = (fn, arg) => page.evaluate(([f, a]) => { const d = window.__app.mode.instance._dbg; return typeof d[f] === 'function' ? d[f](...a) : d[f]; }, [fn, arg || []]);

if (scenario === 'shots') {
  for (let i = 0; i < LEVELS.length; i++) {
    if (only && !only.includes(i + 1)) continue;
    const L = parseLevel(LEVELS[i]); const sol = solve(L);
    await dbg('goto', [i]); await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}_L${i + 1}_a.png` });
    const half = Math.floor(sol.path.length * 0.55);
    for (let s = 0; s < sol.path.length; s++) {
      const m = sol.path[s];
      await page.evaluate(([w, d]) => window.__app.mode.instance._dbg.move(w, d), [m.who, m.d]);
      await page.waitForTimeout(60);
      if (s === half) await page.screenshot({ path: `${out}_L${i + 1}_b.png` });
    }
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${out}_L${i + 1}_c.png` });
    const stt = await dbg('state'); const solved = await dbg('solved');
    log(`level ${i + 1}: ${sol.path.length} stappen afgespeeld -> state=${stt}, opgelost=${solved}`);
    await page.waitForTimeout(2600);
  }
}
if (scenario === 'input') {
  const L = parseLevel(LEVELS[0]); const sol = solve(L);
  const keys = ['up', 'down', 'left', 'right'];
  for (const m of sol.path) {
    await page.evaluate(([w, k]) => { window.__app.input.virtual[w][k] = true; }, [m.who, keys[m.d]]);
    await frames(3);
    await page.evaluate(([w, k]) => { window.__app.input.virtual[w][k] = false; }, [m.who, keys[m.d]]);
    await frames(2); await page.waitForTimeout(300);
    if (process.env.VERBOSE) log('na', 'DS'[m.who] + '^v<>'[m.d], await page.evaluate(() => JSON.stringify([window.__app.mode.instance._dbg.lvl.p, window.__app.mode.instance._dbg.lvl.c])));
  }
  await page.waitForTimeout(500);
  log('na invoer-afspelen: state=', await dbg('state'), 'opgelost=', await dbg('solved'));
  await page.screenshot({ path: out + '_input.png' });
}
if (scenario === 'full') {
  for (let i = 0; i < LEVELS.length; i++) {
    const L = parseLevel(LEVELS[i]); const sol = solve(L);
    await page.waitForFunction(() => window.__app.mode.instance._dbg.state === 'play', null, { timeout: 60000 });
    if (i === 3) { await page.waitForTimeout(500); await page.screenshot({ path: out + '_slide.png' }); }
    for (const m of sol.path) await page.evaluate(([w, d]) => window.__app.mode.instance._dbg.move(w, d), [m.who, m.d]);
    if (i === 2) { await page.waitForTimeout(1500); await page.screenshot({ path: out + '_clear.png' }); }
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => window.__app.mode.state === 'result', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '_result.png' });
  log('eindstand: ', await page.evaluate(() => JSON.stringify(window.__app.mode.result)));
}
if (scenario === 'reset') {
  await page.evaluate(() => window.__app.mode.instance._dbg.move(0, 3));
  await page.evaluate(() => { window.__app.input.virtual[1].b = true; });
  await frames(12);
  await page.screenshot({ path: out + '_reset_mid.png' });
  await frames(8);
  await page.evaluate(() => { window.__app.input.virtual[1].b = false; });
  await frames(3);
  log('na reset: positie', await page.evaluate(() => JSON.stringify(window.__app.mode.instance._dbg.lvl.p)));
}
if (scenario === 'timeout') {
  await dbg('setTime', [1.0]); await page.waitForTimeout(6000);
  await page.screenshot({ path: out + '_timeout.png' });
  log('mode.state =', await page.evaluate(() => window.__app.mode.state));
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
