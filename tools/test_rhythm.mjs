// Gebruik: node tools/test_rhythm.mjs <scenario> [simsecs] [shotEvery] [sigma] [missProb]
//   scenario: idle | bot | duet
// De game wordt handmatig doorgestapt (mode.update(0.05)); de bot drukt op de juiste tijd met timing-ruis.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const scen = process.argv[2] || 'bot'; const secs = +(process.argv[3] || 70); const SHOT_EVERY = +(process.argv[4] || 15);
const SIGMA = +(process.argv[5] ?? 0.06), MISSP = +(process.argv[6] ?? 0.05), FPSDT = +(process.argv[7] ?? 0.05);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { const x = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/minigame niet geladen|Failed to load resource|ERR_CERT/.test(x)) errors.push(`[${m.type()}] ${x}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=rhythm&quality=low`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { document.getElementById('screens').style.visibility = 'hidden'; });
await page.screenshot({ path: '/tmp/rh_intro.png' });
await page.evaluate(() => { document.getElementById('screens').style.visibility = 'visible'; });
await page.evaluate(() => { const app = window.__app, i = app.input; i.virtual[0].a = true; i.virtual[1].a = true; i.update(); app.mode.update(0.05); i.virtual[0].a = false; i.virtual[1].a = false; i.update(); app.mode.update(0.05); });
await page.waitForFunction(() => window.__app.mode.state === 'countdown', null, { timeout: 90000 });
await page.evaluate(() => { const app = window.__app; for (let k = 0; k < 120 && app.mode.state !== 'play'; k++) { app.input.update(); app.mode.update(0.05); } app.mode.instance.onStart && 0; });
console.log('PLAY started');
const noRender = () => page.evaluate(() => { const r = window.__app.renderer; if (!r.__render) r.__render = r.render.bind(r); r.render = () => {}; });
const doRender = () => page.evaluate(() => { const r = window.__app.renderer; if (r.__render) r.render = r.__render; });
await noRender();
const botSrc = `(sigma, missp) => {
  const app = window.__app, inst = app.mode.instance, d = inst.debug, inp = app.input;
  const S = d.s; const dt = ${FPSDT};
  const st = (window.__rb ||= { held: [null, null], seed: 123456789 });
  const rnd = () => { st.seed = (st.seed * 16807) % 2147483647; return st.seed / 2147483647; };
  const gauss = () => { let u = 0; for (let i = 0; i < 6; i++) u += rnd(); return (u - 3) * Math.SQRT2; };
  for (const pl of [0, 1]) { const v = inp.virtual[pl]; v.left = v.up = v.right = false; }
  const tp = S.songT + dt - dt * 0.5;
  for (const n of d.notes) {
    if (n.state !== 'wait' || n.t > S.songT + 1) continue;
    if (n._off === undefined) { n._off = gauss() * sigma; n._skip = rnd() < missp; }
    if (n._skip || n._pressed) continue;
    if (n.t + n._off <= tp) {
      n._pressed = true; const v = inp.virtual[n.pl];
      if (n.lane === 0) v.left = true; else if (n.lane === 1) v.up = true; else if (n.lane === 2) v.right = true; else { v.a = true; st.held[n.pl] = n.t + n.dur - 0.05 + gauss() * sigma * 0.5; }
    }
  }
  for (const pl of [0, 1]) { const v = inp.virtual[pl]; if (st.held[pl] !== null && S.songT + dt > st.held[pl]) { v.a = false; st.held[pl] = null; } }
}`;
const fn = scen === 'idle' ? '() => {}' : botSrc;
const step = (n) => page.evaluate(([n, fn, sg, mp]) => { const app = window.__app, i = app.input; const f = eval(fn); for (let k = 0; k < n; k++) { if (app.mode.state !== 'play') break; f(sg, mp); i.update(); app.mode.update(0.05); } }, [n, fn, SIGMA, MISSP]);
const shot = async (name) => { await doRender(); await page.waitForTimeout(1800); await page.screenshot({ path: `/tmp/rh_${name}.png` }); await noRender(); };
const dbg = () => page.evaluate(() => { const d = window.__app.mode.instance.debug; return { ...d.s, perfect: d.stats.perfect, good: d.stats.good, miss: d.stats.miss, ghost: d.stats.ghost, holds: d.stats.holdsDone, maxCombo: d.stats.maxCombo }; });
let simT = 0, shots = 0; const T0 = Date.now();
while (simT < secs) {
  await step(20); simT += 1;
  if (SHOT_EVERY > 0 && simT >= shots * SHOT_EVERY + 6) { shots++; await shot(String(shots)); console.log('sim t=' + simT.toFixed(0), JSON.stringify(await dbg())); }
  if (await page.evaluate(() => window.__app.mode.state) === 'result') { console.log('RESULT reached at sim', simT); break; }
  if ((Date.now() - T0) > 270000) { console.log('wallclock limit'); break; }
}
if (SHOT_EVERY > 0) await shot('end');
console.log(JSON.stringify(await dbg()));
console.log(JSON.stringify(await page.evaluate(() => window.__app.mode.result)));
if (process.env.MISSES) console.log(JSON.stringify(await page.evaluate(() => window.__app.mode.instance.debug.notes.filter((n) => n.state === 'miss').map((n) => [+n.t.toFixed(2), n.lane, n.pl, n._off && +n._off.toFixed(2), n._skip]))));
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
