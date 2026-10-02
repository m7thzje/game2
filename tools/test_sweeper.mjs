// Scenario-tests voor 'sweeper'. Gebruik: node tools/test_sweeper.mjs [scenario] [out.png]
// Scenarios: idle | bot | rescue | raft | orb | shots
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const scenario = process.argv[2] || 'idle'; const out = process.argv[3] || `/tmp/sw_${scenario}.png`;
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
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|minigame niet geladen|CERT/.test(t)) errors.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=sweeper&quality=low`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 30000 });
await page.waitForTimeout(800);
// klaar + aftellen, daarna handmatig tikken
await page.evaluate(() => { const m = window.__app.mode; m.ready = [true, true]; m._starting = true; m.startCountdown(); });
await page.evaluate(() => { const m = window.__app.mode; for (let i = 0; i < 80 && m.state !== 'play'; i++) m.update(0.05); });
console.log('state', await page.evaluate(() => window.__app.mode.state));
// hulpfuncties in de pagina
await page.evaluate(() => {
  const app = window.__app, m = app.mode, I = m.instance, D = I.debug, v = app.input.virtual;
  window.T = {
    m, I, D,
    log: [], prevSt: ['play', 'play'],
    step(n, dt = 0.05, bot = null) { for (let k = 0; k < n; k++) { if (bot) bot(); app.input.update(); m.update(dt); if (m.state === 'result') break;
      D.pl.forEach((p, i) => { if (p.state !== window.T.prevSt[i]) { window.T.log.push(`t=${D.t.toFixed(1)} p${i} ${window.T.prevSt[i]}->${p.state} y=${p.y.toFixed(2)} duck=${p.duck.toFixed(2)} r=${Math.hypot(p.x, p.z).toFixed(1)} beams=` + D.beams.filter((b) => b.active).map((b) => (b.lowT ? 'L' : 'H') + (((b.ang - Math.atan2(p.z, p.x)) % 6.283 + 9.4247) % 6.283 - 3.1416).toFixed(2)).join(',') + ' om=' + D.omega.toFixed(2)); window.T.prevSt[i] = p.state; } }); } },
    set(i, o) { Object.assign(v[i], o); },
  };
  // eenvoudige bot: springt/bukt op tijd, blijft op straal ~6.5 en blijft weg van de rand
  window.T.bot = (opts = {}) => () => {
    for (const i of [0, 1]) {
      const p = D.pl[i]; const o = v[i]; o.a = false; o.b = false; o.x = 0; o.y = 0;
      if (opts.skip && opts.skip.includes(i)) continue;
      if (p.state !== 'play') continue;
      const rp = Math.hypot(p.x, p.z), phi = Math.atan2(p.z, p.x);
      // naar straal 6 en hoek eigen slot
      const want = i ? 0.9 : 2.2; // radialen
      const tx = Math.cos(want + (opts.ang || 0)) * 5.5, tz = Math.sin(want + (opts.ang || 0)) * 5.5;
      const dx = tx - p.x, dz = tz - p.z; const dd = Math.hypot(dx, dz);
      if (dd > 0.8) { o.x = dx / dd; o.y = dz / dd; }
      const om = D.omega;
      for (const b of D.beams) {
        if (!b.active || b.len < 3) continue;
        let d = b.ang - phi; d = Math.atan2(Math.sin(d), Math.cos(d)); // beam - player
        const sgn = Math.sign(om) || 1;
        const tt = (-d * sgn) / Math.max(0.2, Math.abs(om)); // tijd tot de balk bij speler is (d<0 en om>0 => positief)
        if (b.lowT) { if (tt > 0.05 && tt < 0.26 && p.y <= 0.001) o.a = true; }
        else { if (tt > -0.35 && tt < 0.55) o.b = true; }
      }
    }
  };
});
const sc = {
  async idle() {
    await page.evaluate(() => { const T = window.T; T.step(1200); });
  },
  async bot() {
    await page.evaluate(() => { const T = window.T; T.step(1400, 0.05, T.bot()); });
    console.log((await page.evaluate(() => window.T.log)).join('\n'));
  },
  async rescue() {
    const r = await page.evaluate(() => {
      const { D, step, bot } = window.T; const log = [];
      D.pl[1].inv = 999; step(60, 0.05, null); // 3 s
      D.knock(D.pl[0], 0, 1, 'test'); log.push('knocked');
      step(40, 0.05, null); log.push('state0=' + D.pl[0].state + ' x=' + D.pl[0].x.toFixed(1) + ' z=' + D.pl[0].z.toFixed(1));
      // speler 1 loopt naar de rand bij de zwemmer en houdt A vast
      const v = window.__app.input.virtual;
      for (let k = 0; k < 160; k++) {
        const s = D.pl[0], q = D.pl[1]; { const n0 = Math.hypot(s.x, s.z) || 1; v[0].x = -s.x / n0; v[0].y = -s.z / n0; }
        const a = Math.atan2(s.z, s.x); const tx = Math.cos(a) * 10.5, tz = Math.sin(a) * 10.5;
        v[1].x = tx - q.x; v[1].y = tz - q.z; const n = Math.hypot(v[1].x, v[1].y) || 1; v[1].x /= n; v[1].y /= n;
        v[1].a = Math.hypot(tx - q.x, tz - q.z) < 1.8;
        window.__app.input.update(); window.T.m.update(0.05);
        if (D.pl[0].state === 'hop' || D.pl[0].state === 'play') { log.push('revived at k=' + k + ' t=' + D.t.toFixed(1) + ' swimT=' + s.swimT.toFixed(1)); break; }
        if (window.T.m.state === 'result') { log.push('result at k=' + k); break; }
      }
      step(30, 0.05, null);
      log.push('final state0=' + D.pl[0].state + ' rescues=' + D.rescues);
      return log;
    });
    console.log(r.join('\n'));
  },
  async raft() {
    const r = await page.evaluate(() => {
      const { D, step } = window.T; const log = [];
      D.pl[1].inv = 999; step(60); D.knock(D.pl[0], 0, 1, 't'); let k = 0;
      for (; k < 400; k++) { step(1, 0.05); if (D.pl[0].state === 'play') break; }
      log.push('back after ' + (k * 0.05).toFixed(1) + 's state=' + D.pl[0].state + ' inv=' + D.pl[0].inv.toFixed(1)); return log;
    });
    console.log(r.join('\n'));
  },
  async orb() {
    const r = await page.evaluate(() => {
      const { D, step } = window.T; const log = []; const v = window.__app.input.virtual;
      D.pl[1].inv = 999; step(60); D.knock(D.pl[0], 0, 1, 't');
      step(70); log.push('orb on=' + D.orbS.on + ' at ' + D.orbS.x.toFixed(1) + ',' + D.orbS.z.toFixed(1));
      for (let k = 0; k < 200; k++) {
        const q = D.pl[1]; const dx = D.orbS.x - q.x, dz = D.orbS.z - q.z; const n = Math.hypot(dx, dz) || 1; v[1].x = dx / n; v[1].y = dz / n;
        window.__app.input.update(); window.T.m.update(0.05);
        if (D.pl[0].state === 'hop') { log.push('orb pickup k=' + k); break; }
        if (window.T.m.state === 'result') { log.push('result'); break; }
      }
      step(30); log.push('state0=' + D.pl[0].state + ' rescues=' + D.rescues); return log;
    });
    console.log(r.join('\n'));
  },
  async win() {
    await page.evaluate(() => { const T = window.T; T.D.pl.forEach((p) => { p.inv = 9999; }); T.step(1400, 0.05, T.bot()); });
  },
  async rescueshot() {
    await page.evaluate(() => {
      const { D, step } = window.T; const v = window.__app.input.virtual; D.pl[1].inv = 999; step(60); D.knock(D.pl[0], 0, 1, 't'); step(24);
      for (let k = 0; k < 40; k++) {
        const s = D.pl[0], q = D.pl[1]; { const n0 = Math.hypot(s.x, s.z) || 1; v[0].x = -s.x / n0 * 0.5; v[0].y = -s.z / n0 * 0.5; }
        const a = Math.atan2(s.z, s.x); const tx = Math.cos(a) * 10.5, tz = Math.sin(a) * 10.5;
        v[1].x = tx - q.x; v[1].y = tz - q.z; const n = Math.hypot(v[1].x, v[1].y) || 1; v[1].x /= n; v[1].y /= n; v[1].a = true;
        window.__app.input.update(); window.T.m.update(0.05); if (s.rescue > 0.6) break;
      }
    });
    await page.waitForTimeout(600);
  },
  async shots() {
    // screenshots op verschillende momenten, met bot
    const marks = [4, 18, 33, 47];
    let cur = 0;
    for (const mk of marks) {
      await page.evaluate((mk) => { const T = window.T; const d = mk - T.D.t; T.step(Math.round(d / 0.05), 0.05, T.bot()); }, mk);
      await page.waitForTimeout(700);
      await page.screenshot({ path: out.replace('.png', `_${mk}.png`) });
    }
  },
};
await sc[scenario]();
await page.waitForTimeout(500);
const info = await page.evaluate(() => { const m = window.__app.mode; const D = window.T.D; return { state: m.state, t: +D.t.toFixed(1), done: D.done, res: m.result && { stars: m.result.stars, score: m.result.score, bonus: m.result.bonus, summary: m.result.summary }, pl: D.pl.map((p) => p.state), coins: D.coins, rescues: D.rescues }; });
console.log(JSON.stringify(info));
await page.screenshot({ path: out });
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
