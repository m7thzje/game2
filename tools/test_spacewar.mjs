// Gebruik: node tools/test_spacewar.mjs [scenario...]   scenario: bots | twists | idle | timeout | sd | items | shots | wrap
//   TW=<twist-id> kiest een twist. Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert stand, winnaar (finishPvp precies 1x), console-fouten.
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
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=spacewar&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    const fin0 = mode.ctx.finishPvp; window.__fin = 0; mode.ctx.finishPvp = (r) => { window.__fin++; window.__finRes = r; return fin0(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1, style: 'attack'|'idle'|'dodge'|'manual' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const WX = 54, WZ = 32, wd = (d, W) => (d > W / 2 ? d - W : d < -W / 2 ? d + W : d);
    const nrm = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const B = [0, 1].map(() => ({ hold: 0, jit: 0, lastShield: 0 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = st.ships[i], en = st.ships[1 - i], b = B[i];
          if (c.style === 'manual') continue;
          v.left = v.right = v.up = v.down = v.a = v.b = false;
          if (c.style === 'idle' || !me.alive || st.over) continue;
          const speed = Math.hypot(me.vx, me.vz), r = Math.hypot(me.x, me.z);
          let tx = wd(en.x - me.x, WX), tz = wd(en.z - me.z, WZ); const dist = Math.hypot(tx, tz);
          // voorspel: kogelsnelheid ~31
          const t = Math.min(1.2, dist / 31); tx += (en.vx - me.vx * 0.5) * t; tz += (en.vz - me.vz * 0.5) * t;
          let want = Math.atan2(tx, -tz);
          let thrust = speed < 7 || dist > 20;
          // ster ontwijken
          if (r < 8.5 && (me.vx * me.x + me.vz * me.z) < 4) { want = Math.atan2(me.x, -me.z); thrust = true; }
          if (r < 5.5) { want = Math.atan2(me.x, -me.z); thrust = true; }
          // rotsen ontwijken
          for (const q of st.rocks) { const dx = wd(q.x - me.x, WX), dz = wd(q.z - me.z, WZ), d = Math.hypot(dx, dz); if (d < q.r + 4.5) { const away = Math.atan2(-dx, dz); want = away; thrust = d < q.r + 3.2; break; } }
          if (c.style === 'dodge') { want = Math.atan2(me.x, -me.z) + 1.2; thrust = speed < 6; }
          const da = nrm(want - me.a); const noise = (1 - (c.skill ?? 0.8)) * 0.5;
          if (da > 0.08 + noise * rnd()) v.right = true; else if (da < -0.08 - noise * rnd()) v.left = true;
          if (thrust && Math.abs(da) < 1.1) v.up = true;
          // schieten
          const aim = nrm(Math.atan2(tx, -tz) - me.a);
          if (c.style === 'attack' && Math.abs(aim) < 0.14 + 0.05 * (c.skill ?? 0.8) && dist < 30 && me.ammo >= 1 && rnd() < 0.85) v.a = true;
          // schild bij gevaar: kogel dichtbij
          if (b.hold > 0) { b.hold--; v.b = true; }
          else if (me.cd <= 0) {
            for (const q of st.bullets || []) { }
          }
          if (me.cd <= 0 && rnd() < 0.006 * (c.skill ?? 0.8)) { if (rnd() < 0.5) { v.b = true; b.hold = 3; } else { v.b = true; v.down = true; } }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const sum = (res) => `T=${res.st.T.toFixed(1)} winner=${res.st.winner} score=${res.st.score} sd=${res.st.sd} stats=${JSON.stringify(res.st.stats)}`;
async function runMatch(page, maxFrames = 60 * 300) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.score.join('-') + ':' + st.sd;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} clock=${st.clock.toFixed(1)} score=${st.score} sd=${st.sd} n=${JSON.stringify(st.n)}`); last = key; }
    }
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
  }, maxFrames);
}

for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'sd'].includes(name)) {
    const A = { skill: 0.9, style: 'attack' }, Bw = { skill: 0.5, style: 'attack' };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [A, Bw]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' || name === 'sd' ? [['none', [{ style: 'dodge', skill: 0.9 }, { style: 'dodge', skill: 0.9 }]]]
          : [[process.env.TW || 'none', [A, Bw]], [process.env.TW || 'none', [Bw, A]], [process.env.TW || 'none', [{ skill: 0.8, style: 'attack' }, { skill: 0.8, style: 'attack' }]]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(5); });
      if (name === 'sd') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(2); });
      const res = await runMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.slice(0, 30).join('\n'));
      console.log('end ' + sum(res));
      check(res.finished && res.fin === 1, `finishPvp precies 1x (fin=${res.fin}, finished=${res.finished})`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.result && res.result.winner != null, 'er is een winnaar');
      check(errors.length === 0, errors.length ? 'console-errors:\n' + errors.slice(0, 6).join('\n') : 'geen console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'wrap') {
    // wrap-around: schip vliegt de rand uit en komt aan de andere kant terug; zwaartekracht trekt naar de ster
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ style: 'manual' }, { style: 'idle' }]);
    const r = await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg; const out = [];
      window.__bot(10); d.setPos(0, 26, 10, 12, 0); const v = window.__app.input.virtual[0]; v.up = false;
      window.__bot(40); const s1 = d.state().ships[0]; out.push(`na rechts-uit: x=${s1.x.toFixed(1)} z=${s1.z.toFixed(1)}`);
      d.setPos(1, 15, 0, 0, 0); window.__bot(60); const s2 = d.state().ships[1]; out.push(`ster trekt: x=${s2.x.toFixed(1)} vx=${s2.vx.toFixed(1)}`);
      return { out, s1, s2 };
    });
    console.log(r.out.join('\n'));
    check(r.s1.x < 0, 'schip komt links weer binnen na rechts uit te vliegen');
    check(r.s2.vx < 0 && r.s2.x < 15, 'zwaartekracht trekt naar de ster');
    check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'items') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'attack' }, { skill: 0.9, style: 'attack' }]);
    const r = await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg; const out = []; window.__bot(60);
      for (const t of ['triple', 'missile', 'mine']) { d.givePower(0, t); window.__bot(60 * 4); const s = d.state(); out.push(`${t}: me=${JSON.stringify(s.ships[0])} n=${JSON.stringify(s.n)} score=${s.score} missilesFired=${s.stats.missiles} mines=${s.stats.mines}`); }
      d.spawnPowerup('triple'); d.spawnPowerup('missile'); window.__bot(30); out.push('pups=' + d.state().n.pups);
      d.spawnCow(); window.__bot(60 * 12); out.push('cow: ' + JSON.stringify(d.state().cow) + ' hit=' + d.state().stats.cow + ' pups=' + d.state().n.pups);
      d.startComet(); window.__bot(60 * 5); out.push('comet: ' + JSON.stringify(d.state().comet) + ' score=' + d.state().score);
      d.nextEvent(); window.__bot(60 * 4); d.nextEvent(); window.__bot(60 * 4);
      return { out, s: d.state() };
    });
    console.log(r.out.join('\n'));
    check(r.s.stats.comets > 0, 'komeet geweest'); check(r.s.stats.missiles > 0, 'zoekraket afgevuurd');
    check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'attack' }, { skill: 0.8, style: 'attack' }]);
    const snap = async (tag) => { await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/sw_${tag}.png`, timeout: 180000 }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { T: +s.T.toFixed(1), score: s.score, n: s.n }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(120)); await snap('play');
    await go('s.n.bullets>2', 60 * 60); await snap('bullets');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.givePower(0, 'triple'); d.givePower(1, 'missile'); d.spawnPowerup('mine'); d.spawnPowerup('triple'); d.spawnPowerup('missile'); window.__bot(40); }); await snap('powerups');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.givePower(0, 'mine'); window.__bot(60 * 3); }); await snap('mines');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnCow(); window.__bot(60 * 2); }); await snap('cow');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startComet(); window.__bot(60 * 1.2); }); await snap('comet_warn');
    await page.evaluate(() => { window.__bot(60 * 1.1); }); await snap('comet');
    await go('s.ships.some(x=>!x.alive)', 60 * 90); await snap('death');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setPos(0, 25, 12, 14, 0); d.setPos(1, -26, -14, -10, 5); window.__bot(8); }); await snap('wrap');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(3, 1); window.__bot(120); }); await snap('score');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startSD(); window.__bot(60 * 12); }); await snap('sd');
    await go('s.over', 60 * 120); await page.evaluate(() => window.__bot(60)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(fails ? `\n${fails} CHECK(S) MISLUKT` : '\nALLE CHECKS OK');
server.close();
process.exit(fails ? 1 : 0);
