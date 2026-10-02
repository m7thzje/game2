// Gebruik: node tools/test_airhockey.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle
//   TW=<twist-id> kiest een twist (anders: "none" / per scenario). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert tussenstanden, winnaar, fouten.
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

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=airhockey&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1 (reactie/precisie), smash: kans per kans-moment, style: 'attack'|'defend'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 987; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ hold: 0, wait: 0 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60;
      m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.pads[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.gstate === 'init' || st.gstate === 'end') continue;
          const dir = i === 0 ? 1 : -1;
          const live = st.pucks.filter((q) => !q.falling);
          // kies puck: de gevaarlijkste (op mijn helft / naar mijn doel) of anders dichtstbij
          let tp = null, best = 1e9;
          for (const q of live) { const mine = q.x * dir < 0.5; const d = Math.hypot(q.x - me.x, q.z - me.z) + (mine ? 0 : 20); if (d < best) { best = d; tp = q; } }
          let tx = -dir * 12.5, tz = 0;
          const R = me.R, goalX = dir * 16;
          if (tp) {
            const onMine = tp.x * dir < 0.8;
            if (onMine && c.style !== 'defend') {
              // achter de puck komen, dan erdoorheen richting doel
              const bx = tp.x - dir * (R + 0.7 + 0.9), bz = tp.z - (tp.z - 0) * 0.15 * dir * 0 ;
              const behind = (me.x - tp.x) * dir < -0.4 && Math.abs(me.z - tp.z) < 1.1;
              if (behind || Math.hypot(me.x - tp.x, me.z - tp.z) < R + 1.9) { tx = tp.x + dir * 3; tz = tp.z + (0 - tp.z) * 0.25; }
              else { tx = bx; tz = tp.z; }
              // niet te ver van het doel
              if (tp.vx * dir < -6) { tx = -dir * 13; tz = tp.z + tp.vz * 0.15; }   // verdedigen als hij hard op mijn doel afkomt
            } else if (onMine) { tx = -dir * 12.5; tz = tp.z * 0.7 + tp.vz * 0.1; }
            else { tx = -dir * 11.5; tz = clamp(tp.z * 0.5, -4, 4); }
          }
          const noise = (1 - c.skill) * 2.2;
          tx += (rnd() - 0.5) * noise * 0.2; tz += (rnd() - 0.5) * noise * 0.2;
          const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
          const sp = Math.min(1, d / 1.5) * (0.65 + 0.35 * c.skill);
          if (d > 0.15) { v.x = dx / d * sp; v.y = dz / d * sp; }
          // smash
          if (b.hold > 0) { b.hold -= dt; v.b = true; if (b.hold <= 0) v.b = false; }
          else if (tp && me.cd <= 0 && me.st === 'idle' && Math.hypot(tp.x - me.x, tp.z - me.z) < R + 2.6 && (tp.x - me.x) * dir > -0.3 && rnd() < c.smash) { b.hold = 0.05 + rnd() * 0.35; v.b = true; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    window.__clamp = clamp;
  }, cfg);
}

for (const name of scen) {
  if (name === 'physics') {
    // robuustheid: pucks met willekeurige (hoge) snelheden afvuren, controleren dat ze nooit door muren/schijven lekken
    for (const style of ['idle', 'attack']) {
      const { browser, page, errors } = await open(process.env.TW || 'none');
      await installBots(page, [{ skill: 0.9, smash: 0.2, style }, { skill: 0.9, smash: 0.2, style }]);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance, d = inst.dbg; let viol = 0, maxPen = 0, maxX = 0, maxZ = 0, steps = 0; const bad = [];
        window.__bot(120);
        for (let f = 0; f < 4000 && !m.finished; f++) {
          const st = d.state();
          if (st.gstate === 'play' && f % 45 === 0) {
            for (const q of d.pucks) if (q.on && !q.falling) { const a = Math.random() * 6.283, sp = 10 + Math.random() * 28; q.x = (Math.random() - 0.5) * 20; q.z = (Math.random() - 0.5) * 12; q.vx = Math.cos(a) * sp; q.vz = Math.sin(a) * sp; q.stuck = -1; }
          }
          window.__bot(1); steps++;
          for (const q of d.pucks) {
            if (!q.on || q.falling) continue;
            const ax = Math.abs(q.x), az = Math.abs(q.z);
            maxX = Math.max(maxX, ax); maxZ = Math.max(maxZ, az);
            if (ax > 16 + 2.4 + 0.2 || az > 8.5 + 0.2 || (ax <= 16 && az > 8.5 - q.r + 0.2)) { viol++; if (bad.length < 4) bad.push({ x: q.x, z: q.z, r: q.r }); }
            if (q.stuck < 0 && !(q.kind === 'main' && false)) for (const p of d.pads) { const pen = (p.R + q.r) - Math.hypot(q.x - p.x, q.z - p.z); if (pen > maxPen) maxPen = pen; }
          }
        }
        return { viol, maxPen, maxX, maxZ, steps, bad, score: d.state().score };
      });
      console.log(`physics style=${style}`, JSON.stringify(res));
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
      await browser.close();
    }
    continue;
  }
  if (['bots', 'twists', 'timeout', 'idle'].includes(name)) {
    const list = name === 'twists' ? TWISTS.map((t) => [t, [{ skill: 0.9, smash: 0.12, style: 'attack' }, { skill: 0.7, smash: 0.06, style: 'attack' }]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ skill: 0.9, smash: 0.0, style: 'defend' }, { skill: 0.9, smash: 0.0, style: 'defend' }]]]
          : [
            [process.env.TW || 'none', [{ skill: 0.95, smash: 0.12, style: 'attack' }, { skill: 0.6, smash: 0.04, style: 'attack' }]],
            [process.env.TW || 'none', [{ skill: 0.6, smash: 0.04, style: 'attack' }, { skill: 0.95, smash: 0.12, style: 'attack' }]],
            [process.env.TW || 'none', [{ skill: 0.85, smash: 0.1, style: 'attack' }, { skill: 0.85, smash: 0.1, style: 'attack' }]],
          ];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(8); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
        while (!m.finished && g++ < 60 * 400) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = st.score.join('-') + ':' + st.gstate + ':' + st.ot;
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.gstate} score=${st.score} left=${st.timeLeft.toFixed(1)} ot=${st.ot} pucks=${st.pucks.length} golden=${st.golden}`); last = key; }
        }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      console.log(`end T=${res.st.T.toFixed(1)} score=${res.st.score} finished=${res.finished} smashes=${res.st.stats.smashes} flowers=${res.st.stats.flowers} events=${res.st.stats.events} bumpers=${res.st.stats.bumpers} pressure=${res.st.pads.map((p) => p.pressure)}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
      await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.85, smash: 0.1, style: 'attack' }, { skill: 0.8, smash: 0.1, style: 'attack' }]);
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/ah_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.gstate, score: s.score, pucks: s.pucks.length, fx: s.fx, gh: s.gh.map((x) => +x.toFixed(2)), fl: s.flower, b: s.bumpers }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await go('s.gstate==="play" && s.T>4'); await page.evaluate(() => window.__bot(90)); await snap('play');
    await page.evaluate(() => window.__app.mode.instance.dbg.spawnFlower());
    await page.evaluate(() => window.__bot(30)); await snap('flower');
    for (const id of ['multi', 'giant', 'shrink', 'sticky', 'ghost']) {
      await page.evaluate((id) => { const d = window.__app.mode.instance.dbg; d.giveFlower(id, id === 'shrink' ? 0 : 1); }, id);
      await page.evaluate(() => window.__bot(50)); await snap('pu_' + id);
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(...d.state().score); });
    }
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setEventAlt(true); d.startEvent(); });
    await go('s.pucks.some(p=>p.kind==="fire")', 60 * 20); await page.evaluate(() => window.__bot(20)); await snap('dragon');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setEventAlt(false); d.startEvent(); });
    await go('s.pucks.some(p=>p.kind==="pen")', 60 * 20); await page.evaluate(() => window.__bot(20)); await snap('penguin');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnBumper(); d.spawnBumper(); });
    await page.evaluate(() => window.__bot(40)); await snap('bumper');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(0, 2); });
    await page.evaluate(() => window.__bot(30)); await snap('golden');
    await go('s.gstate==="goal"', 60 * 60); await page.evaluate(() => window.__bot(10)); await snap('goal');
    await page.evaluate(() => window.__bot(50)); await snap('goal2');
    await go('s.gstate==="end"', 60 * 300); await page.evaluate(() => window.__bot(40)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
