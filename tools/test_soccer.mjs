// Gebruik: node tools/test_soccer.mjs [scenario...]   scenario: bots | twists | timeout | idle | events | physics | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert winnaar, aantal finishPvp-aanroepen (moet precies 1 zijn), fouten.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

// omtrek van het veld (zelfde getallen als ARENA in src/games/soccer_world.js)
const LX = 17, LZ = 10.2, CH = 4.2, GW = 4.4, GD = 3.4;
const OUT = [[-LX + CH, -LZ], [LX - CH, -LZ], [LX, -LZ + CH], [LX, -GW], [LX + GD, -GW], [LX + GD, GW], [LX, GW], [LX, LZ - CH], [LX - CH, LZ], [-LX + CH, LZ], [-LX, LZ - CH], [-LX, GW], [-LX - GD, GW], [-LX - GD, -GW], [-LX, -GW], [-LX, -LZ + CH]];
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
let FAILS = 0; const fail = (m) => { FAILS++; console.log('FAIL: ' + m); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=soccer&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    window.__fin = { n: 0, last: null }; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.n++; window.__fin.last = r; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1, style: 'attack'|'defend'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 1234; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__cfg = cfg; const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const LX = 17, LZ = 10.2;   // zie ARENA
    const PADS = [[-LX + 4.2, -LZ + 3.1], [LX - 4.2, -LZ + 3.1], [-LX + 4.2, LZ - 3.1], [LX - 4.2, LZ - 3.1], [0, -LZ + 2.6], [0, LZ - 2.6], [-8.5, 0], [8.5, 0]];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = st.cars[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.gstate !== 'play') continue;
          const dir = me.dir; let b = null, bd = 1e9; for (const q of st.balls) { if (q.frozen) continue; const d = Math.hypot(q.x - me.x, q.z - me.z); if (d < bd) { bd = d; b = q; } }
          let tx = -dir * (LX - 6), tz = 0, kick = false;
          if (b) {
            let ax = dir * LX - b.x, az = -b.z * 0.45; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
            const behind = (b.x - me.x) * dir > -0.5;
            if (c.style === 'defend') { tx = -dir * (LX - 3); tz = clamp(b.z * 0.5, -3.5, 3.5); if (Math.abs(b.x - me.x) < 6 && (b.x * dir) < 0) { tx = b.x - dir * 0.3; tz = b.z; } }
            else {
              tx = b.x - ax * (me.R + b.r + 1.0); tz = b.z - az * (me.R + b.r + 1.0);
              if (!behind) { tz += (me.z >= b.z ? 1 : -1) * 4.5; tx -= dir * 2; }      // eerst om de bal heen
            }
            if (bd < me.R + b.r + 1.4 && (b.x - me.x) * dir > -0.8 && me.cd <= 0 && rnd() < 0.3 + 0.7 * c.skill) kick = true;
            if (c.style === 'defend' && bd < me.R + b.r + 1.4 && me.cd <= 0) kick = true;
          }
          // turbo-pad zoeken als de tank leeg is
          if (me.boost < 15 && (!b || bd > 6)) { let bp = null, pd = 1e9; for (let q = 0; q < PADS.length; q++) { if (st.pads[q] > 0) continue; const d = Math.hypot(PADS[q][0] - me.x, PADS[q][1] - me.z); if (d < pd) { pd = d; bp = PADS[q]; } } if (bp) { tx = bp[0]; tz = bp[1]; } }
          tx += (rnd() - 0.5) * (1 - c.skill) * 3; tz += (rnd() - 0.5) * (1 - c.skill) * 3;
          const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
          if (d > 0.3) { v.x = dx / d; v.y = dz / d; }
          if (d > 11 && me.boost > 25 && c.style !== 'defend') v.a = true;
          if (kick) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (name === 'physics') {
    // robuustheid: bal en auto's met willekeurige (hoge) snelheden; nooit door muren heen (buiten de omtrek)
    for (const style of ['idle', 'attack']) {
      const { browser, page, errors } = await open(process.env.TW || 'none');
      await installBots(page, [{ skill: 0.9, style }, { skill: 0.9, style }]);
      const res = await page.evaluate((OUT) => {
        const m = window.__app.mode, inst = m.instance, d = inst.dbg; let viol = 0, violC = 0, maxSp = 0, steps = 0, goals = 0; const bad = [];
        const inside = (x, z, r) => { // binnen de omtrek, met marge r (afstand tot elk segment >= r - eps en punt binnen polygon)
          let c = false; for (let i = 0, j = OUT.length - 1; i < OUT.length; j = i++) { const [xi, zi] = OUT[i], [xj, zj] = OUT[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } if (!c) return false;
          for (let i = 0; i < OUT.length; i++) { const [x1, z1] = OUT[i], [x2, z2] = OUT[(i + 1) % OUT.length]; const dx = x2 - x1, dz = z2 - z1; let t = ((x - x1) * dx + (z - z1) * dz) / (dx * dx + dz * dz); t = Math.max(0, Math.min(1, t)); if (Math.hypot(x - x1 - dx * t, z - z1 - dz * t) < r - 0.06) return false; }
          return true;
        };
        for (let f = 0; f < 5000 && !m.finished; f++) {
          const st = d.state();
          if (st.gstate === 'play' && f % 40 === 0) { const a = Math.random() * 6.283, sp = 10 + Math.random() * 34; const b = d.balls[0]; if (!b.frozen) d.setBall((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 16, 1 + Math.random() * 5, Math.cos(a) * sp, Math.sin(a) * sp, Math.random() * 12); }
          if (st.gstate === 'play' && f % 90 === 0) { const a = Math.random() * 6.283, sp = 10 + Math.random() * 22; d.setCar(f % 180 ? 0 : 1, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 16, Math.cos(a) * sp, Math.sin(a) * sp); }
          window.__bot(1); steps++;
          if (m.instance.dbg.G.state === 'goal' || m.instance.dbg.G.state === 'replay') { goals++; continue; }
          for (const b of d.balls) { if (!b.on || b.frozen) continue; maxSp = Math.max(maxSp, Math.hypot(b.vx, b.vz)); if (!inside(b.x, b.z, b.r)) { viol++; if (bad.length < 4) bad.push({ x: b.x, z: b.z, r: b.r }); } if (b.h > 9.1 || b.h < b.r - 0.05) viol++; }
          for (const c of d.cars) if (!inside(c.x, c.z, c.R)) { violC++; if (bad.length < 4) bad.push({ car: c.i, x: c.x, z: c.z }); }
        }
        return { viol, violC, maxSp, steps, goals, bad, score: d.state().score };
      }, OUT);
      console.log(`physics style=${style}`, JSON.stringify(res));
      if (res.viol || res.violC) fail(`physics style=${style} bal-lek=${res.viol} auto-lek=${res.violC}`);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
      await browser.close();
    }
    continue;
  }
  if (['bots', 'twists', 'timeout', 'idle', 'events'].includes(name)) {
    const A = { skill: 0.95, style: 'attack' }, Bw = { skill: 0.5, style: 'attack' }, M = { skill: 0.8, style: 'attack' };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [M, M]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ skill: 0.9, style: 'defend' }, { skill: 0.9, style: 'defend' }]]]
          : name === 'events' ? [['none', [M, M]]]
            : [[process.env.TW || 'none', [A, Bw]], [process.env.TW || 'none', [Bw, A]], [process.env.TW || 'none', [M, M]]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout' || name === 'idle') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(6); });
      const res = await page.evaluate((forceEvents) => {
        const m = window.__app.mode, inst = m.instance, d = inst.dbg; const log = []; let last = ''; let g = 0; let sawReplay = false, sawGolden = false, items = new Set(), twin = false, ufo = false, goalsSeen = 0;
        if (forceEvents) { window.__bot(200); d.giveItem('twin', 0); d.ufo(); }
        while (!m.finished && g++ < 60 * 600) {
          window.__bot(1);
          const st = d.state(); sawReplay = sawReplay || st.replay; sawGolden = sawGolden || st.golden; if (st.item) items.add(st.item.id); if (st.balls.length > 1) twin = true; if (st.ufo) ufo = true;
          if (forceEvents && g % 500 === 0) { d.giveItem(['giant', 'magnet', 'twin'][(g / 500) % 3], g % 1000 ? 0 : 1); }
          if (forceEvents && g % 1300 === 0) d.ufo();
          const key = st.score.join('-') + ':' + st.gstate + ':' + st.golden;
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.gstate} score=${st.score} left=${st.timeLeft.toFixed(1)} golden=${st.golden} balls=${st.balls.length}`); last = key; }
        }
        return { log: log.length > 40 ? [...log.slice(0, 6), '...', ...log.slice(-30)] : log, st: d.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin.n, sawReplay, sawGolden, items: [...items], twin, ufo };
      }, name === 'events');
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} score=${st.score} finished=${res.finished} finishPvp-calls=${res.fin} goals=${st.stats.goals} kicks=${st.stats.kicks} items=${st.stats.items} ufos=${st.stats.ufos} bonks=${st.stats.bonks} pads=${st.stats.pads} replays=${st.stats.replays} golden=${res.sawGolden} twinBall=${res.twin}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      if (!res.finished) fail(`${name}/${tw}: niet afgelopen`);
      if (res.fin !== 1) fail(`${name}/${tw}: finishPvp ${res.fin}x aangeroepen`);
      if (res.result && res.result.winner == null) console.log('(gelijkspel)');
      if ((st.score[0] + st.score[1]) > 0 && !st.stats.replays) fail(`${name}/${tw}: geen herhaling na doelpunt`);
      if ((name === 'timeout' || name === 'idle') && !res.sawGolden) fail(`${name}: geen gouden goal bij gelijkspel`);
      if (name === 'events' && (!res.twin || !res.ufo || !st.stats.items)) fail('events: niet alle gimmicks gezien');
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'attack' }, { skill: 0.85, style: 'attack' }]);
    const snap = async (tag) => { await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/sc_${tag}.png`, timeout: 240000 }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.gstate, score: s.score, balls: s.balls.length, item: s.item && s.item.id, ufo: s.ufo, t: +s.T.toFixed(1) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.screenshot({ path: '/tmp/sc_kick.png', timeout: 240000 });
    await go('s.gstate==="play"', 60 * 10); await page.evaluate(() => window.__bot(100)); await snap('play');
    await page.evaluate(() => window.__bot(60)); await snap('play2');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setBall(0, 0, 1, 0, 0, 0); d.ufo(); }); await go('s.ufo==="beam"', 60 * 10); await page.evaluate(() => window.__bot(30)); await snap('ufo');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnItem(); }); await page.evaluate(() => window.__bot(30)); await snap('item');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveItem('giant', 0); }); await page.evaluate(() => window.__bot(40)); await snap('giant');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveItem('twin', 1); d.giveItem('magnet', 0); }); await page.evaluate(() => window.__bot(40)); await snap('twin');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(0, 2); }); await page.evaluate(() => window.__bot(30)); await snap('assist');
    await go('s.gstate==="goal"', 60 * 120); await page.evaluate(() => window.__bot(12)); await snap('goal');
    await go('s.gstate==="replay"', 60 * 10); await page.evaluate(() => window.__bot(40)); await snap('replay');
    await go('s.gstate==="end"', 60 * 400); await page.evaluate(() => window.__bot(40)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
}
console.log(FAILS ? `\n${FAILS} FOUT(EN)` : '\nALLES OK');
server.close();
