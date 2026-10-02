// Gebruik: node tools/test_sumo.mjs [scenario...]  scenario: bots (meerdere potjes), shots, idle
// Versneld (zonder renderen) potjes IJs-Sumo laten spelen door bots; rapporteert rondetijden, sterren, fouten.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

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
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['bots'];

for (const name of scen) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=sumo&quality=${process.env.Q || 'low'}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  await page.evaluate((mode) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = (mode.length * 7919 + 99) >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [{ chargeTarget: 0, charging: false, t: 0, hold: 0, lastJump: -9 }, { chargeTarget: 0, charging: false, t: 0, hold: 0, lastJump: -9 }];
    window.__bot = (n, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) { const v = inp.virtual[i]; v.a = false; v.b = false; v.x = 0; v.y = 0; }
        if (mode !== 'idle' && st.rstate === 'fight') {
          for (const i of [0, 1]) {
            const me = st.p[i], op = st.p[1 - i], v = inp.virtual[i], b = B[i];
            if (me.falling || me.inWater) continue;
            const dx = op.x - me.x, dz = op.z - me.z, dist = Math.hypot(dx, dz) || 1;
            const d0 = Math.hypot(me.x, me.z), R = inst.dbg.radiusAt(me.x, me.z), edge = R - d0;
            const sp = Math.hypot(me.vx, me.vz);
            let mx = 0, mz = 0;
            // gevaarlijk dicht bij de rand? naar het midden
            const outward = (me.x * me.vx + me.z * me.vz) / (d0 || 1);
            if (edge < 1.2 + Math.max(0, outward) * 0.5) { mx = -me.x / (d0 || 1); mz = -me.z / (d0 || 1); }
            else if (dist > (mode === 'passive' ? 6.5 : 3.0)) { mx = dx / dist; mz = dz / dist; }
            else if (mode === 'passive' && dist < 5) { mx = -dx / dist; mz = -dz / dist; }
            else { mx = dx / dist + (rnd() - 0.5) * 0.4; mz = dz / dist + (rnd() - 0.5) * 0.4; }
            // power-up zoeken
            if (st.pw && edge > 2 && dist > 3 && me.heavy <= 0) { const px = st.pw.x - me.x, pz = st.pw.z - me.z, pd = Math.hypot(px, pz); if (pd < 5) { mx = px / pd; mz = pz / pd; } }
            v.x = mx; v.y = mz;
            // laden en duwen
            if (b.charging) { b.hold -= dt; v.a = true; if (b.hold <= 0 || me.falling) { v.a = false; b.charging = false; } }
            else if (dist < 3.4 && me.dashCd <= 0 && me.stun <= 0 && edge > 1.2 && rnd() < (mode === 'passive' ? 0.004 : mode === 'mixed' ? (i ? 0.03 : 0.015) : 0.06)) { b.charging = true; b.hold = rnd() < 0.5 ? 0.05 : 0.2 + rnd() * 0.65; v.a = true; }
            // ontwijken
            const opSp = Math.hypot(op.vx, op.vz); const towards = (op.vx * -dx + op.vz * -dz) / (dist * (opSp || 1));
            if (dist < 3.2 && opSp > 8 && towards > 0.7 && me.jumpCd <= 0 && rnd() < 0.15) v.b = true;
            if (rnd() < 0.002 && me.jumpCd <= 0) v.b = true;
          }
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  }, name === 'shots2' ? 'passive' : name === 'shots' ? 'mixed' : name);

  if (name === 'shots' || name === 'shots2') {
    const tags = name === 'shots2' ? [['crumble', 's.rstate==="fight" && s.rt>13.5'], ['sd', 's.sd && s.rt>21']] : [['fight1', 's.rstate==="fight" && s.rt>2'], ['splash', 's.p.some(p=>p.inWater)']];
    for (const [tag, cond] of tags) {
      await page.evaluate((c) => window.__bot(60 * 90, new Function('s', 'return ' + c)), cond);
      if (tag === 'splash') await page.evaluate(() => window.__bot(14));
      await page.evaluate(() => { window.__app.mode.paused = true; });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `/tmp/sumo_${tag}.png` });
      await page.evaluate(() => { window.__app.mode.paused = false; });
      console.log('shot', tag);
    }
    await page.evaluate(() => window.__bot(60 * 300));
    await page.evaluate(() => { window.__app.mode.paused = true; });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `/tmp/sumo_end_${name}.png` });
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  const res = await page.evaluate(() => {
    const log = []; let last = '';
    const m = window.__app.mode, inst = m.instance;
    let guard = 0, roundStart = 0;
    while (!m.finished && guard++ < 60 * 600) {
      window.__bot(1);
      const st = inst.dbg.state();
      const key = st.round + ':' + st.rstate;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} r${st.round} ${st.rstate} wins=${st.wins} sd=${st.sd} crumbles=${st.crumbles} minR=${st.minR.toFixed(1)}`); last = key; }
    }
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result };
  });
  console.log(`\n=== ${name} ===`);
  console.log(res.log.join('\n'));
  console.log(`end T=${res.st.T.toFixed(1)} wins=${res.st.wins} replays=${res.st.replays} finished=${res.finished}`);
  if (res.result) console.log(`RESULT stars=${res.result.stars} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
  await browser.close();
}
server.close();
