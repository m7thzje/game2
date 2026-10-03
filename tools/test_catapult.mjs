// Gebruik: node tools/test_catapult.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle | physics | features
//   TW=<twist-id> kiest een twist (anders: "none" / per scenario). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert winnaar, fouten en of finishPvp precies één keer kwam.
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
const GAME = 'catapult';

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=${GAME}&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // telt hoe vaak finishPvp wordt aangeroepen
    window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// bots: cfg[i] = { skill 0..1, style 'aim'|'idle'|'random' }. De bot zoekt (hoek, kracht) met een ballistische berekening incl. wind.
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ plan: null, hold: 0, wait: 0, cycle: 0 }));
    window.__cfg = cfg;
    const GM = 1; // zwaartekrachtfactor zit al in launchVel; banen zijn gelijk
    function simulate(i, aim, power, ammo, wind) {
      const dir = i === 0 ? 1 : -1; const ARM = 3.4, PY = 3.0; const CAT = d.state().cats;
      const v = d.launchVel(d.ST[i], power); const k = [0.35, 1.0, 0.7, 1.3][ammo];
      let x = CAT[i] + dir * ARM * Math.cos(0.9), y = PY + ARM * Math.sin(0.9), vx = dir * Math.cos(aim) * v, vy = Math.sin(aim) * v;
      const ax = wind * 0.35 * k, ay = -20 * (d.world.g / 20);
      const pts = [];
      for (let t = 0; t < 7; t += 0.02) { vx += ax * 0.02; vy += ay * 0.02; x += vx * 0.02; y += vy * 0.02; pts.push([x, y]); if (y < 0) break; }
      return pts;
    }
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.p[i];
          v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.ended) continue;
          if (c.style === 'random') { v.a = Math.random() < 0.5; v.y = Math.random() * 2 - 1; v.b = Math.random() < 0.05; continue; }
          // munitie kiezen (soms)
          if (b.cycle > 0) { b.cycle -= dt; } else if (me.cd > 0 && rnd() < 0.02) { v.b = true; b.cycle = 0.3; }
          // repareren als dat kan
          if (me.tokens > 0 && me.cd > 0.5 && rnd() < 0.5) { v.b = true; continue; }
          if (me.cd > 0) { b.plan = null; continue; }
          if (!b.plan) {
            // doel: koning van de ander (met ruis); soms de bovenkant van het kasteel
            const tk = st.kings[1 - i]; const noise = (1 - c.skill) * 5;
            const tx = tk.x + (rnd() - 0.5) * noise * 2, ty = tk.y + (rnd() < 0.5 ? 0 : 2.5);
            let best = null;
            for (let aim = 0.25; aim < 1.4; aim += 0.04) for (let pw = 0.15; pw <= 1.0; pw += 0.025) {
              const pts = simulate(i, aim, pw, me.ammo, st.wind);
              let md = 1e9; for (const p of pts) md = Math.min(md, Math.hypot(p[0] - tx, p[1] - ty));
              if (!best || md < best.md) best = { aim, pw, md };
            }
            b.plan = { aim: best.aim + (rnd() - 0.5) * (1 - c.skill) * 0.12, pw: clamp(best.pw + (rnd() - 0.5) * (1 - c.skill) * 0.1, 0.1, 1) };
          }
          // richten
          const da = b.plan.aim - me.aim;
          if (Math.abs(da) > 0.02) { v.y = da > 0 ? -1 : 1; }
          else { v.a = true; if (me.power >= b.plan.pw) { v.a = false; b.plan = null; } }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  }, cfg);
}

for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'random'].includes(name)) {
    const mk = (sk) => ({ skill: sk, style: 'aim' });
    const list = name === 'twists' ? TWISTS.map((t) => [t, [mk(0.9), mk(0.7)]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'random' ? [['none', [{ style: 'random' }, { style: 'random' }]]]
          : name === 'timeout' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
            : [[process.env.TW || 'none', [mk(0.95), mk(0.6)]], [process.env.TW || 'none', [mk(0.6), mk(0.95)]], [process.env.TW || 'none', [mk(0.8), mk(0.8)]]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      const res = await page.evaluate((int) => {
        const m = window.__app.mode, inst = m.instance; let g = 0; const log = []; let lastP = '';
        while (!m.finished && g++ < 60 * 200) { window.__bot(1); const st = inst.dbg.state(); const k = st.pct.join('-'); if (k !== lastP && g % 30 === 0) { lastP = k; log.push(`T=${st.T.toFixed(1)} pct=${st.pct} king=${st.kingHp.map((x) => x.toFixed(0))} awake=${st.awake}`); } }
        const st = inst.dbg.state();
        return { log, st, finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin.length, impacts: inst.dbg.log.slice(-int) };
      }, +(process.env.IMP || 0));
      console.log(`\n=== ${name} twist=${res.twist} cfg=${cfg.map((c) => c.style + (c.skill ?? '')).join('/')} ===`);
      console.log(res.log.slice(0, 14).join('\n'));
      console.log(`end T=${res.st.T.toFixed(1)} pct=${res.st.pct} shots=${res.st.stats.shots} blocks=${res.st.stats.blocks} balloons=${res.st.stats.balloons} dragons=${res.st.stats.dragons} repairs=${res.st.stats.repairs} finished=${res.finished} finishPvp-calls=${res.fin} how=${res.st.result && res.st.result.how}`);
      if (res.impacts && res.impacts.length) console.log('IMPACTS\n' + res.impacts.join('\n'));
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
      await browser.close();
    }
    continue;
  }
  if (name === 'features') {
    // forceert gimmicks: ballonkist, draak, vuur, taart, reparatie, koning-dood
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ skill: 0.9, style: 'idle' }, { skill: 0.9, style: 'idle' }]);
    const r = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const out = {}; const run = (n) => window.__bot(n);
      d.startBalloon(); const b = d.balloon.mesh.position; d.balloonPop(0); out.balloon = d.state().balloon === null && d.stats.balloons === 1;
      d.startDragon(); run(60 * 4); out.dragon = d.stats.dragons === 1;
      const wood = d.entries.find((e) => e.side === 1 && e.mat === 'wood' && e.body); d.ignite(wood.body); run(60 * 9); out.fireBurns = !wood.body || wood.body.user.hp < 80;
      d.damageSide(0, 0.8); run(30); const lost = d.entries.filter((e) => e.side === 0 && !e.body).length; d.giveTokens(0, 1); d.repair(0); run(20); out.repair = lost > 0 && d.entries.filter((e) => e.side === 0 && !e.body).length < lost;
      d.splat(24, 4); run(10); out.splat = d.world.bodies.some((b) => b.user && b.user.slick > 0);
      const x0 = d.fire(0, 0.7, 0.8, 0); run(60 * 5); out.shotFlies = d.stats.shots[0] === 1;
      d.killKing(1); run(10); out.kingEnd = d.state().ended && d.state().result.winner !== undefined;
      run(60 * 5); out.finished = m.finished && window.__fin.length === 1;
      return out;
    });
    console.log('FEATURES', JSON.stringify(r)); console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.85, style: 'aim' }, { skill: 0.8, style: 'aim' }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/ct_${tag}.png` }); const s = await page.evaluate(() => { const x = window.__app.mode.instance.dbg.state(); return { T: +x.T.toFixed(1), pct: x.pct, projs: x.projs, awake: x.awake }; }); console.log('shot', tag, JSON.stringify(s)); };
    const run = (n) => page.evaluate((n) => window.__bot(n), n);
    await run(30); await snap('start');
    await run(60 * 6); await snap('play');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setWind(6); d.startDragon(); d.startBalloon(); }); await run(60 * 3); await snap('dragon');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setAmmo(0, 2); d.setAmmo(1, 1); d.ignite(d.entries[8].body); d.splat(24, 4); d.giveTokens(0, 2); }); await run(30); await snap('fire');
    await run(60 * 8); await snap('later');
    await page.evaluate(() => { window.__app.mode.instance.dbg.killKing(1); }); await run(40); await snap('end1'); await run(120); await snap('end2');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
