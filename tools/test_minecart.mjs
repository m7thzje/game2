// Gebruik: node tools/test_minecart.mjs [scenario...]   (twist kiezen: TWIST=giant node ...)
// Scenario's: look (screenshots), bots (twee goede bots), idle (niemand beweegt), p0 / p1 (alleen die broer speelt), dumb (willekeurig), timeout
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
const twist = process.env.TWIST || 'none';

for (const name of scen) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=minecart&quality=low&twist=${twist}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  await page.evaluate((who) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const tick = [0, 0];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; const D = inst.dbg;
      for (let k = 0; k < n && !m.finished; k++) {
        const s = D.state(); if (stop && stop(s)) return true;
        for (const i of [0, 1]) { const v = inp.virtual[i]; v.a = false; v.b = false; v.x = 0; v.y = 0; }
        for (const i of [0, 1]) {
          if (who === 'idle') continue; if (who === 'p0' && i === 1) continue; if (who === 'p1' && i === 0) continue;
          const p = D.players[i]; const v = inp.virtual[i]; if (p.state !== 'run') continue;
          tick[i]++;
          if (who === 'dumb') { if (tick[i] % 20 === 0) v.x = rnd() < 0.5 ? -1 : 1; if (rnd() < 0.02) v.a = true; if (rnd() < 0.3) v.b = true; continue; }
          // goede bot: kies de veiligste rail
          const near = D.near(i, 0, 46); const cost = [0, 0, 0]; let jump = false;
          const spd = Math.max(8, p.v);
          for (const o of near) {
            const ds = o.D - p.d; const tArr = ds / spd;
            if (o.type === 'gap') { if (ds > 2 && ds < 40) cost[o.lane] += 10 + (ds < 14 ? 20 : 0); if (o.lane === p.lane && ds > 1.5 && ds < 5.5 && p.y < 0.05) jump = true; }
            else if (o.type === 'fire') { const st = D.fireBurn(i, o.id); if (ds > 0 && ds < 32) cost[o.lane] += (st === 1 || st === 2 || ds < 28 ? 30 : 4); }
            else if (o.type === 'wall') { if (ds > -1 && ds < 36) cost[o.lane] += (p.boost > 0 || false) ? 0 : 25; }
            else if (o.type === 'spark') { if (ds > 0 && ds < 24) { for (let l = 0; l < 3; l++) { const sx = D.sparkX(o, i); const lx = [[-7, -5, -3], [3, 5, 7]][i][l]; if (Math.abs(sx - lx) < 1.6) cost[l] += 6; } if (ds < 7 && Math.abs(D.sparkX(o, i) - p.x) < 1.6 && p.y < 0.05) jump = true; } }
            else if (o.type === 'rock') { if (ds > 0 && ds < 22) { const th = D.rockTh(o); for (let l = 0; l < 3; l++) { const lx = [[-7, -5, -3], [3, 5, 7]][i][l]; const rx = [-5, 5][i] + 6.8 * Math.sin(th); if (Math.abs(rx - lx) < 2.0) cost[l] += 8; } } }
            else if (o.type === 'pad') { if (ds > 0 && ds < 30) cost[o.lane] -= 4; }
          }
          cost[p.lane] -= 3;
          let best = p.lane; for (let l = 0; l < 3; l++) if (cost[l] < cost[best] - 0.5 && Math.abs(l - p.lane) === 1) best = l; else if (cost[l] < cost[best] - 0.5) best = p.lane + Math.sign(l - p.lane);
          if (best !== p.lane && tick[i] % 2 === 0) v.x = best < p.lane ? -1 : 1;
          if (jump && tick[i] % 2 === 1) v.a = true;
          // turbo opladen als de baan vrij is
          if (!jump && p.charge < 1 && cost[p.lane] <= -3 + 0 && rnd() < 0.002) { tick[i] = tick[i]; }
          if (who !== 'p0' && who !== 'p1' && (Math.floor(D.T() / 6) + i) % 3 === 0 && cost[p.lane] < 1 && p.charge < 0.95 && !jump) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  }, name === 'idle' ? 'idle' : name === 'p0' ? 'p0' : name === 'p1' ? 'p1' : name === 'dumb' ? 'dumb' : 'bots');

  if (name === 'look') {
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/minecart_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    const E = (fn, arg) => page.evaluate(fn, arg);
    await E(() => { const D = window.__app.mode.instance.dbg; D.players.forEach((p) => { p.inv = 9999; }); window.__bot(70); }); await shot('a_start');
    await E(() => { const D = window.__app.mode.instance.dbg; D.players[0].d += 80; D.players[1].d += 60; window.__bot(50); }); await shot('b_early');
    await E(() => { const D = window.__app.mode.instance.dbg; const fire = D.course.find((o) => o.type === 'fire'); D.players.forEach((p) => { p.d = fire.D - 40; p.inv = 9999; }); window.__bot(60); }); await shot('c_fire_warn');
    await E(() => window.__bot(36)); await shot('d_fire_burn');
    await E(() => { const D = window.__app.mode.instance.dbg; const w = D.course.find((o) => o.type === 'wall'); D.players.forEach((p) => { p.d = w.D - 35; p.inv = 9999; }); window.__bot(40); }); await shot('e_wall');
    await E(() => { const D = window.__app.mode.instance.dbg; const w = D.course.find((o) => o.type === 'rock'); D.players.forEach((p) => { p.d = w.D - 30; p.inv = 9999; }); window.__bot(40); }); await shot('f_rock');
    await E(() => { const D = window.__app.mode.instance.dbg; D.players.forEach((p) => { p.d = 300; p.inv = 9999; p.boostT = 2; p.boostF = 1.55; }); window.__bot(40); }); await shot('g_turbo');
    await E(() => { const D = window.__app.mode.instance.dbg; D.players[0].inv = 0; D.players[0].d = 400; D.hurt(D.players[0], 'spark'); window.__bot(8); }); await shot('h_zap');
    await E(() => { const D = window.__app.mode.instance.dbg; D.players[1].inv = 0; D.players[1].d = 500; D.players[1].fallObs = { D: 495, len: 6 }; D.hurt(D.players[1], 'fall'); window.__bot(20); }); await shot('i_fall');
    await E(() => { const D = window.__app.mode.instance.dbg; D.players.forEach((p) => { p.d = 950; p.inv = 9999; }); window.__bot(60); }); await shot('j_finish');
    await E(() => { window.__bot(260); }); await shot('k_end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }

  if (name === 'timeout') {
    const r = await page.evaluate(() => {
      const m = window.__app.mode, D = m.instance.dbg; window.__bot(60 * 8); D.players[1].d += 120; D.setT(96); window.__bot(10);
      return { finished: m.finished, result: m.result && { winner: m.result.winner, score: m.result.scoreArr, summary: m.result.summary }, st: D.state().d };
    });
    console.log(JSON.stringify(r)); console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); await browser.close(); continue;
  }
  if (name === 'wall') {
    const r = await page.evaluate(() => {
      const D = window.__app.mode.instance.dbg; const w = D.course.find((o) => o.type === 'wall'); const X = [[-7, -5, -3], [3, 5, 7]];
      D.players.forEach((p, i) => { p.d = w.D - 32; p.lane = w.lane; p.x = X[i][w.lane]; p.inv = 0; p.v = 20; p.broken.clear(); D.course.forEach((o) => { if (o.type === 'pad') p.padUsed.add(o.id); }); });
      D.players[0].boostT = 4; D.players[0].boostF = 1.55;
      const out = []; const m = window.__app.mode; const app0 = window.__app;
      for (let k = 0; k < 150; k++) { app0.input.update(); m.update(1 / 60); if (k % 25 === 0) { const s = D.state(); out.push(`k=${k} d=${s.d.map((x) => x.toFixed(0))} stats=${JSON.stringify(s.stats.map((q) => [q.walls, q.crashes]))}`); } }
      return out;
    });
    console.log(r.join('\n')); console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); await browser.close(); continue;
  }
  const res = await page.evaluate((nm) => {
    let fired = false; const log = []; const m = window.__app.mode, inst = m.instance;
    let guard = 0, last = -1;
    while (!m.finished && guard++ < 60 * 130) {
      window.__bot(1);
      const st = inst.dbg.state();
      if (nm === 'deurman' && !fired && st.T > 3) { fired = true; inst.onDeurman([true, false]); inst.onSwap(true); inst.onSwap(false); }
      if (Math.floor(st.T / 10) !== last) { last = Math.floor(st.T / 10); log.push(`T=${st.T.toFixed(1)} d=${st.d.map((x) => x.toFixed(0))} v=${st.v.map((x) => x.toFixed(1))} hits=${st.hits} pads=${st.stats.map((s) => s.pads)} walls=${st.stats.map((s) => s.walls)} falls=${st.stats.map((s) => s.falls)}`); }
    }
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result };
  }, name);
  console.log(`\n=== ${name} (twist ${twist}) ===`);
  console.log(res.log.join('\n'));
  console.log(`end T=${res.st.T.toFixed(1)} d=${res.st.d.map((x) => x.toFixed(0))} finished=${res.finished} order=${res.st.finishOrder} stats=${JSON.stringify(res.st.stats)}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
  await browser.close();
}
server.close();
