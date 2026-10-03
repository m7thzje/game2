// Gebruik: node tools/test_golf.mjs [scenario...]   scenario: course | bots | twists | idle | timeout | sudden | abilities | shots
//   TW=<twist-id> kiest een twist (anders: "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp precies 1x komt, beide spelers kunnen winnen,
// elke twist werkt en er geen console-fouten zijn.
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
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['course', 'bots'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=golf&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // finishPvp-teller
    window.__fin = 0; const ctx = mode.ctx, orig = ctx.finishPvp; ctx.finishPvp = (r) => { window.__fin++; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}


// cfg[i] = { skill: 0..1, style: 'play'|'idle', bonk: kans per slag }
async function installBots(page, cfg) {
  await page.evaluate(async (cfg) => {
    const GC = await import('/src/games/golf_course.js');
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__cfg = cfg;
    const potFor = (def) => {
      const pts = [[def.tee[0][0], (def.tee[0][1] + def.tee[1][1]) / 2], ...def.route]; const segs = []; let tot = 0;
      for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], l]); tot += l; }
      return (x, z) => { let best = 1e9, acc = 0; for (const [a, b, l] of segs) { const dx = b[0] - a[0], dz = b[1] - a[1]; let u = ((x - a[0]) * dx + (z - a[1]) * dz) / (l * l); u = Math.max(0, Math.min(1, u)); const px = a[0] + dx * u, pz = a[1] + dz * u; best = Math.min(best, tot - acc - u * l + 2.5 * Math.hypot(x - px, z - pz)); acc += l; } return best; };
    };
    function plan(i, delay) {
      const C = d.course(), def = d.def(), st = d.state(), me = st.pl[i], pot = potFor(def); let best = null;
      const mill0 = C.mill ? C.mill.ang : 0;
      for (let a = 0; a < 48; a++) for (let pi = 0; pi < 8; pi++) {
        const ang = a / 48 * Math.PI * 2, mm = 0.15 + pi * 0.12;
        if (C.mill) C.mill.ang = mill0 + C.mill.w2 * delay;
        const r = GC.simulateShot(C, { x: me.x, z: me.z, r: me.r }, ang, GC.powerToV(mm), { grav: 1, maxT: 7 });
        const cost = r.ev === 'sunk' ? -100 : pot(r.x, r.z) + (r.ev === 'water' || r.ev === 'oob' ? 40 : 0) + 1.5 * mm;
        if (!best || cost < best.cost) best = { cost, ang, m: mm };
      }
      if (C.mill) C.mill.ang = mill0;
      return best;
    }
    const B = [{ plan: null, key: '' }, { plan: null, key: '' }];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = st.pl[i], b = B[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.gstate !== 'play') { b.plan = null; continue; }
          if (me.state !== 'aim') { b.plan = null; if (me.state === 'roll' && c.bonk && rnd() < c.bonk * 0.01 && !me.bonkUsed) v.b = true; continue; }
          if (!b.plan) { b.plan = plan(i, 1.0); const noise = (1 - c.skill); b.plan.ang += (rnd() - 0.5) * noise * 0.5; b.plan.m = Math.max(0.12, Math.min(1, b.plan.m + (rnd() - 0.5) * noise * 0.4)); b.rel = false; }
          const diff = ((b.plan.ang - me.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(diff) > 0.04) { v.x = Math.sign(diff) * Math.max(0.3, Math.min(1, Math.abs(diff) * 3)); continue; }
          // kracht-preset net boven de gewenste kracht
          if (me.pw < b.plan.m + 0.04) { v.y = -1; continue; }
          if (me.pw > b.plan.m + 0.2) { v.y = 1; continue; }
          v.a = true; if (me.charging && me.m >= b.plan.m - 0.01) { v.a = false; b.plan = null; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function runMatch(label, twist, cfg, pre) {
  const { browser, page, errors } = await open(twist);
  await installBots(page, cfg);
  if (pre) await page.evaluate(pre);
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < 60 * 260) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.hole + ':' + st.gstate + ':' + st.totals;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} hole=${st.hole} ${st.gstate} totals=${st.totals} strokes=${st.pl.map((p) => p.strokes)} ${st.pl.map((p) => p.state)}`); last = key; }
    }
    const st = inst.dbg.state();
    for (let k = 0; k < 60 * 4; k++) window.__bot(1);
    return { log: log.slice(-16), st, finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
  });
  console.log(`\n=== ${label} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
  console.log(res.log.join('\n'));
  const s = res.st;
  console.log(`end T=${s.T.toFixed(1)} totals=${s.totals} holes=${JSON.stringify(s.results.map((r) => r.add))} stats=${JSON.stringify(s.stats)}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  check(res.finished && res.fin === 1, `${label}: finishPvp precies 1x (fin=${res.fin}, finished=${res.finished})`);
  check(res.result && res.result.winner != null, `${label}: altijd een winnaar (winner=${res.result && res.result.winner})`);
  check(s.T < 140, `${label}: potje duurt ${s.T.toFixed(0)} s (< 140)`);
  check(!errors.length, `${label}: geen console-fouten ${errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''}`);
  await browser.close();
  return res;
}

for (const name of scen) {
  if (name === 'course') {
    // banen: ballen lekken nooit door muren, en elke baan is oplosbaar (greedy planner met simulatie)
    const GC = await import(path.join(root, 'src/games/golf_course.js'));
    for (const H of GC.HOLES) {
      const C = GC.makeCourse(H); let esc = 0;
      for (let k = 0; k < 400; k++) {
        const b = GC.makeBall(H.tee[0][0] + (Math.random() - 0.5), H.tee[0][1] + (Math.random() - 0.5)); const a = Math.random() * 6.283, v = 8 + Math.random() * 22; b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; let launched = false;
        for (let i = 0; i < 240 * 8; i++) { if (C.mill) C.mill.ang += C.mill.w2 / 240; const ev = GC.stepBall(C, b, 1 / 240); if (b.ev === 'launch') launched = true; if (ev === 'water' || ev === 'oob' || ev === 'sunk') break; if (!launched && b.y < 0.5 && !GC.inPoly(C.poly, b.x, b.z)) { esc++; break; } }
      }
      check(esc === 0, `${H.name}: geen ontsnapte ballen (${esc}/400)`);
      // oplosbaarheid
      const pts = [[H.tee[0][0], 0], ...H.route]; const segs = []; let tot = 0; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], l]); tot += l; }
      const pot = (x, z) => { let best = 1e9, acc = 0; for (const [a, b, l] of segs) { const dx = b[0] - a[0], dz = b[1] - a[1]; let u = ((x - a[0]) * dx + (z - a[1]) * dz) / (l * l); u = Math.max(0, Math.min(1, u)); best = Math.min(best, tot - acc - u * l + 2.5 * Math.hypot(x - (a[0] + dx * u), z - (a[1] + dz * u))); acc += l; } return best; };
      let ball = { x: H.tee[0][0], z: H.tee[0][1] }, n = 0, sunk = false;
      while (n < 8 && !sunk) {
        let best = null; for (let a = 0; a < 72; a++) for (let pi = 0; pi < 12; pi++) { const ang = a / 72 * 6.2832, mm = 0.12 + pi * 0.08; const r = GC.simulateShot(C, ball, ang, GC.powerToV(mm)); const cost = r.ev === 'sunk' ? -100 : pot(r.x, r.z) + (r.ev === 'water' || r.ev === 'oob' ? 40 : 0) + 1.2 * mm; if (!best || cost < best.cost) best = { cost, r }; }
        n++; if (best.r.ev === 'sunk') sunk = true; else if (best.r.ev !== 'water' && best.r.ev !== 'oob') ball = { x: best.r.x, z: best.r.z }; if (C.mill) C.mill.ang += C.mill.w2 * (best.r.t + 3);
      }
      check(sunk && n <= H.par + 1, `${H.name}: oplosbaar in ${n} slagen (par ${H.par})`);
    }
    continue;
  }
  const A = { skill: 0.97, style: 'play', bonk: 0.5 }, Bw = { skill: 0.55, style: 'play', bonk: 0.2 };
  if (name === 'bots') {
    const r1 = await runMatch('bots A>B', process.env.TW || 'none', [A, Bw]);
    const r2 = await runMatch('bots B>A', process.env.TW || 'none', [Bw, A]);
    const r3 = await runMatch('bots gelijk', process.env.TW || 'none', [A, A]);
    const ws = new Set([r1, r2, r3].map((r) => r.result && r.result.winner)); check(ws.has(0) && ws.has(1), `beide spelers kunnen winnen (winnaars: ${[...ws]})`);
    continue;
  }
  if (name === 'twists') { for (const t of TWISTS) await runMatch('twist', t, [A, Bw]); continue; }
  if (name === 'idle') { await runMatch('idle', 'none', [{ style: 'idle' }, { style: 'idle' }]); continue; }
  if (name === 'timeout') { await runMatch('timeout', 'none', [{ style: 'idle' }, { skill: 0.9, style: 'play', bonk: 0 }]); continue; }
  if (name === 'sudden') {
    // gelijkspel na 3 holes afdwingen: totalen gelijk zetten tijdens hole 3 en beide ballen in het gat
    await runMatch('sudden', 'none', [A, A], () => { const d = window.__app.mode.instance.dbg; d.loadHole(2); d.setTotals(3, 3); d.setTime(0.2); });
    continue;
  }
  if (name === 'abilities') {
    const { browser, page, errors } = await open('none');
    const r = await page.evaluate(() => {
      const m = window.__app.mode, inp = window.__app.input, d = m.instance.dbg; m.paused = false; const out = {};
      const adv = (n) => { for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } };
      adv(120); const s0 = d.state(); out.state0 = s0.gstate;
      // bonk: bal 1 dicht bij bal 0
      d.teleport(1, d.pl[0].ball.x + 3, d.pl[0].ball.z); d.bonk(0); adv(5); out.bonked = Math.hypot(d.pl[1].ball.vx, d.pl[1].ball.vz) > 5; out.bonkUsed = d.pl[0].bonkUsed;
      d.bonk(0); out.second = d.pl[0].boost === false;   // 1x per hole
      adv(240);
      // turbo-slag: andere bal ver weg
      d.teleport(0, -13.5, 0); d.teleport(1, 13, 4); adv(60); d.bonk(1); out.boost = d.pl[1].boost;
      // water-strafslag: bal in het water op hole 1
      d.teleport(0, 4, 4); adv(30); out.waterState = d.state().pl[0].state; out.waterStrokes = d.state().pl[0].strokes; adv(120); out.afterWater = d.state().pl[0].state;
      // sinken
      d.sink(0); adv(30); out.sunk = d.state().pl[0].state;
      return out;
    });
    console.log(JSON.stringify(r));
    check(r.bonked && r.bonkUsed && r.second, 'ballon-bonk werkt en is 1x per hole'); check(r.boost, 'ballon geeft turbo-slag als de ander ver weg is');
    check(r.waterState === 'pen' && r.waterStrokes === 1 && r.afterWater !== 'pen', 'water geeft strafslag en zet de bal terug'); check(r.sunk === 'sunk', 'bal zinkt in het gat');
    check(!errors.length, 'abilities: geen console-fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'dragon') {
    const { browser, page, errors } = await open('none');
    const r = await page.evaluate(() => {
      const m = window.__app.mode, inp = window.__app.input, d = m.instance.dbg; m.paused = false; const adv = (n) => { for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } };
      d.loadHole(2); adv(120); const x0 = d.state().pl[0].x; d.startDragon(); adv(60 * 7); const s = d.state(); return { dragon: s.stats.dragon, dstate: s.dragon, moved: Math.abs(s.pl[0].x - x0) + Math.abs(s.pl[1].x - d.state().pl[1].x) };
    });
    console.log(JSON.stringify(r)); check(r.dragon >= 1, 'draak kaapt een bal'); check(!errors.length, 'dragon: geen console-fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'hooks') {
    const { browser, page, errors } = await open('none');
    const r = await page.evaluate(() => { const m = window.__app.mode, inp = window.__app.input, i = m.instance; m.paused = false; for (let k = 0; k < 90; k++) { inp.update(); m.update(1 / 60); } i.onDeurman([true, false]); i.onSwap(true); i.onDeurman([false, true]); for (let k = 0; k < 60; k++) { inp.update(); m.update(1 / 60); } i.celebrate(0); i.celebrate(1); i.resultUpdate(0.05); return true; });
    check(r && !errors.length, 'hooks (onDeurman/onSwap/celebrate) zonder fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [A, Bw]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/gf_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { h: s.hole, g: s.gstate, totals: s.totals, calls: window.__app.renderer.info.render.calls, tris: window.__app.renderer.info.render.triangles }; }))); };
    const run = (n, cond) => page.evaluate(([n, c]) => window.__bot(n, c ? new Function('s', 'return ' + c) : null), [n, cond || null]);
    const dbg = (fn, ...a) => page.evaluate(([f, a]) => window.__app.mode.instance.dbg[f](...a), [fn, a]);
    await run(60 * 3); await snap('h1a'); await run(60 * 3, 's.pl[0].state==="roll"'); await run(20); await snap('h1b');
    for (const h of [1, 2]) { await dbg('loadHole', h); await run(60 * 2); await snap(`h${h + 1}a`); await run(60 * 4); await snap(`h${h + 1}b`); }
    await dbg('startDragon'); await run(60 * 3); await snap('dragon');
    await dbg('loadHole', 3); await run(60 * 3); await snap('sd');
    await run(60 * 60, 's.finished || s.gstate==="end"'); await run(80); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(failures ? `\n${failures} CHECK(S) MISLUKT` : '\nALLE CHECKS GESLAAGD');
server.close();
process.exitCode = failures ? 1 : 0;
