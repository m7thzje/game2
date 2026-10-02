// Gebruik: node tools/test_goblins.mjs <scenario> [simsecs] [shotEvery]
//   scenario: look | bot | zoo | showcase | rules
// De game wordt handmatig doorgestapt (mode.update(0.05)) zodat het ook op software-rendering snel gaat.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const scen = process.argv[2] || 'look'; const secs = +(process.argv[3] || 20); const SHOT_EVERY = +(process.argv[4] || 10);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: +(process.env.VW || 1100), height: +(process.env.VH || 650) } });
const errors = [];
page.on('console', (m) => { const x = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/minigame niet geladen|Failed to load resource|ERR_CERT/.test(x)) errors.push(`[${m.type()}] ${x}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=goblins&quality=low`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
await page.waitForTimeout(1200);
await page.evaluate(() => { document.getElementById('screens').style.visibility = 'hidden'; });
await page.screenshot({ path: '/tmp/gob_intro.png' });
await page.evaluate(() => { document.getElementById('screens').style.visibility = 'visible'; });
await page.evaluate(() => { const app = window.__app, i = app.input; i.virtual[0].a = true; i.virtual[1].a = true; i.update(); app.mode.update(0.05); i.virtual[0].a = false; i.virtual[1].a = false; i.update(); app.mode.update(0.05); });
await page.waitForFunction(() => window.__app.mode.state === 'countdown', null, { timeout: 90000 });
await page.evaluate(() => { const app = window.__app; for (let k = 0; k < 120 && app.mode.state !== 'play'; k++) { app.input.update(); app.mode.update(0.05); } });
console.log('PLAY started');

const noRender = () => page.evaluate(() => { const r = window.__app.renderer; if (!r.__render) r.__render = r.render.bind(r); r.render = () => {}; });
const doRender = () => page.evaluate(() => { const r = window.__app.renderer; if (r.__render) r.render = r.__render; });
await noRender();
const step = (n, setup) => page.evaluate(([n, setup]) => { const app = window.__app, i = app.input; const f = setup ? eval('(' + setup + ')') : null; for (let k = 0; k < n; k++) { if (f) f(k); i.update(); app.mode.update(0.05); } }, [n, setup || null]);
const shot = async (name) => { await doRender(); await page.waitForTimeout(1500); await page.screenshot({ path: `/tmp/gob_${name}.png` }); await noRender(); };
const dbg = () => page.evaluate(() => window.__app.mode.instance.debug.state);
const fin = async () => { console.log(JSON.stringify(await dbg())); console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS'); await browser.close(); server.close(); };

if (scen === 'showcase') {
  await step(2); await page.evaluate(() => { window.__app.mode.instance.debug.zoom = 0.62; });
  await page.evaluate(() => { const d = window.__app.mode.instance.debug; d.pl[0].x = -3; d.pl[0].z = 5; d.pl[1].x = 6; d.pl[1].z = 5; d.spawn('goblin', -7, 2); d.spawn('runner', 8, -3); d.spawn('brute', 6, 5); });
  await step(36, '(k) => { const d = window.__app.mode.instance.debug; d.pl.forEach((p) => p.inv = 100); }'); console.log(JSON.stringify(await page.evaluate(() => { const p = window.__app.mode.instance.debug.pl[1]; return { roll: p.roll, tilt: p.tilt, q: p.piv.quaternion.toArray(), ko: p.ko, pose: p.c.pose, y: p.holder.position.y, rotx: p.c.body.rotation.x, legL: p.c.legL.rotation.x }; }))); await shot('s1_carry');
  await page.evaluate(() => { const d = window.__app.mode.instance.debug; d.pl.forEach((p) => p.inv = 0); d.ko(0); });
  await step(10); await shot('s2_ko');
  await page.evaluate(() => { const d = window.__app.mode.instance.debug; d.pl[1].x = d.pl[0].x + 1.5; d.pl[1].z = d.pl[0].z; d.pl[0].x = -2; d.pl[0].z = 3; d.pl[1].x = -0.5; d.pl[1].z = 3; for (const e of d.enemies.slice()) { e.hp = 0; e.dying = 0.01; } });
  await step(25, '(k) => { window.__app.input.virtual[1].a = true; }'); await shot('s3_reviving');
  await step(25, '(k) => { window.__app.input.virtual[1].a = true; }'); await page.evaluate(() => { window.__app.input.virtual[1].a = false; }); await step(6); await shot('s4_revived');
  await page.evaluate(() => { const d = window.__app.mode.instance.debug; for (const e of d.enemies.slice()) { e.hp = 0; e.dying = 0.01; } d.spawn('bomber', 9, 0); d.spawn('bomber', -9, -1); d.pl[0].x = -3; d.pl[0].z = 5; d.pl[1].x = 3; d.pl[1].z = 5; });
  await step(60); await shot('s5_bomb');
  await page.evaluate(() => { const i = window.__app.input; i.virtual[0].x = 1; i.virtual[0].b = true; });
  await step(3); await page.evaluate(() => { window.__app.input.virtual[0].b = false; }); await shot('s6_roll');
  await fin(); process.exit(0);
}

if (scen.startsWith('r_')) {
  await step(10);
  const calls = await page.evaluate(() => { window.__fin = 0; const m = window.__app.mode, orig = m.ctx.finish; m.ctx.finish = (r) => { window.__fin++; window.__finRes = r; return orig(r); }; return 1; });
  if (scen === 'r_ko') await page.evaluate(() => { const d = window.__app.mode.instance.debug; d.ko(0); d.ko(1); });
  if (scen === 'r_sheep') await page.evaluate(() => { window.__app.mode.instance.debug.loseAll(); });
  if (scen === 'r_timeout') await page.evaluate(() => { window.__app.mode.instance.debug.advance(500); });
  if (scen === 'r_win') await page.evaluate(() => { window.__app.mode.instance.debug.killKing(); });
  await step(120);
  console.log(scen, JSON.stringify(await page.evaluate(() => ({ fin: window.__fin, res: window.__finRes, st: window.__app.mode.state }))));
  await step(40);
  console.log('after more steps fin =', await page.evaluate(() => window.__fin));
  await fin(); process.exit(0);
}
const botSrc = (await import('./goblins_bot.mjs')).botFn.toString();
const lookSrc = `() => { const i = window.__app.input; const T = window.__app.mode.t; i.virtual[0].x = Math.sin(T / 0.9); i.virtual[0].y = Math.cos(T / 1.3); i.virtual[0].a = true; i.virtual[1].x = -Math.sin(T / 0.8); i.virtual[1].y = 0.3; i.virtual[1].a = true; }`;
if (scen === 'zoo') {
  await page.evaluate(() => { const d = window.__app.mode.instance.debug; d.god = 1; d.zoom = 0.8; d.pl[0].x = -2; d.pl[0].z = 3; d.pl[1].x = 3; d.pl[1].z = 3; const T = ['goblin', 'runner', 'brute', 'bomber', 'slime', 'slimeS', 'king']; T.forEach((t, i) => { const e = d.spawn(t, -7 + i * 2.6, -3 + (i % 2) * 3); if (e) e.stun = 1e9; }); });
}
await page.evaluate((k) => { window.__skill = k; }, +(process.argv[5] || 1));
const fn = scen === 'bot' ? botSrc : lookSrc;
let simT = 0, shots = 0; const T0 = Date.now();
while (simT < secs) {
  await step(20, fn); simT += 1;
  if (simT >= shots * SHOT_EVERY + 4) { shots++; await shot(String(shots)); console.log('sim t=' + simT.toFixed(0), 'calls', await page.evaluate(() => window.__app.renderer.info.render.calls + '/' + window.__app.renderer.info.render.triangles), JSON.stringify(await dbg()).slice(0, 150)); }
  if (await page.evaluate(() => window.__app.mode.state) === 'result') { console.log('RESULT reached at sim', simT); break; }
  if ((Date.now() - T0) > 270000) { console.log('wallclock limit'); break; }
}
await shot('end');
console.log(JSON.stringify(await page.evaluate(() => window.__app.mode.result)));
await fin();
