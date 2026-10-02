// Gebruik: node tools/test_climb.mjs [layout] [sim] [game] [shots]
//   layout : controleert of alle sprongen in de layout haalbaar zijn (analytisch) en of de trampolines hun doel halen
//   sim    : laat bots in de pure natuurkunde (zonder lava/gevaren) naar de top klimmen: alle twists-instellingen, beide torens
//   game   : speelt het echte spel (headless, versneld) met bots: finishPvp wordt altijd aangeroepen, beide spelers kunnen winnen, tijdslimiet
//   shots  : screenshots (/tmp/climb_*.png)
import * as L from '../src/games/climb_layout.js';
import { makeBot, botInput } from '../src/games/climb_bot.js';
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const argv = process.argv.slice(2);
const twistArg = (argv.find((a) => a.startsWith('twist=')) || '').slice(6);
const scen = argv.filter((a) => !a.includes('=')).length ? argv.filter((a) => !a.includes('=')) : ['layout', 'sim', 'game'];
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  OK   ' : '  FAIL ') + msg); if (!ok) failures++; };

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

if (scen.includes('layout')) {
  console.log('\n== layout (analytisch)');
  const P = L.buildLayout();
  for (const margin of [0.9, 0.8]) { const pr = L.checkLayout(P, { margin }); check(pr.length === 0, `alle sprongen haalbaar met ${Math.round((1 - margin) * 100)}% marge${pr.length ? '\n    ' + pr.join('\n    ') : ''}`); }
  const steps = P.filter((p) => (p.tower === 0 || p.tower === 2) && p.route && !p.ground && !p.top).sort((a, b) => a.y0 - b.y0); steps.unshift({ y0: 0 });
  let maxStep = 0; for (let i = 1; i < steps.length; i++) maxStep = Math.max(maxStep, steps[i].y0 - steps[i - 1].y0);
  check(maxStep <= L.JUMP_H * 0.85, `grootste stijging ${maxStep.toFixed(2)} <= ${(L.JUMP_H * 0.85).toFixed(2)} (springhoogte ${L.JUMP_H.toFixed(2)})`);
  const mirror = P.filter((p) => p.tower === 0).every((p) => { const q = P.find((r) => r.tower === 1 && r.type === p.type && r.y0 === p.y0 && Math.abs(r.u - p.u) < 1e-9); return q && Math.abs(q.x + p.x) < 1e-6; });
  check(mirror, 'de twee torens zijn elkaars spiegelbeeld');
  console.log(`   ${P.length} platforms, top y=${L.TOP_Y}`);
}

// ---------------- pure simulatie ----------------
function sim({ tower = 0, gm = 1, sp = 1, slip = 0, size = 1, skill = {}, seed = 1, maxT = 140, lava = false }) {
  const P = L.buildLayout(); const rnd = mulberry(seed);
  const pl = L.newPlayer(tower), bot = makeBot(tower, { rnd, ...skill }); const inp = { x: 0, aP: false, a: false };
  const W = { P, gm, sp, slip, size }; let t = 0; const dt = 1 / 60; let falls = 0, lastY = 0, wasGround = false;
  while (t < maxT) {
    L.updatePlatforms(P, t, dt); botInput(bot, pl, P, t, dt, inp); L.stepPlayer(pl, inp, dt, W); t += dt;
    if (pl.y < lastY - 6) falls++; lastY = Math.max(lastY - 0.02, pl.y);
    if (pl.ground && pl.ground.top) return { t, falls, ok: true, maxY: pl.maxY };
  }
  return { t, falls, ok: false, maxY: pl.maxY };
}
if (scen.includes('sim')) {
  console.log('\n== sim (bot klimt naar de top; pure natuurkunde)');
  const T = [['normaal', {}], ['turbo (sp 1.6)', { sp: 1.6 }], ['slowmo (sp 0.65)', { sp: 0.65 }], ['reus (size 1.55, sp 0.8)', { size: 1.55, sp: 0.8 }], ['dwerg (size 0.65, sp 1.3)', { size: 0.65, sp: 1.3 }], ['glad (slip 0.85)', { slip: 0.85 }], ['maan (g 0.4)', { gm: 0.4 }]];
  for (const [name, o] of T) {
    for (const tower of [0, 1]) {
      const r = sim({ tower, ...o });
      check(r.ok, `${name}, toren ${tower}: top in ${r.t.toFixed(1)} s (hoogste ${r.maxY.toFixed(1)}, ${r.falls} grote vallen)`);
    }
  }
  const ts = []; for (let s = 1; s <= 6; s++) ts.push(sim({ tower: s % 2, seed: s, skill: { err: 0.5, react: 0.4 } }));
  check(ts.every((r) => r.ok), `slordige bots komen ook boven (${ts.map((r) => r.t.toFixed(0)).join(', ')} s)`);
}

// ---------------- echt spel ----------------
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
let server = null, port = 0;
async function startServer() {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
    res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, r)); port = server.address().port;
}
async function open(twist = 'none', quality = 'low') {
  if (!server) await startServer();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=climb&quality=${quality}&twist=${twist}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  // bot in de pagina: dezelfde botcode als in node
  await page.evaluate(async () => {
    const { makeBot, botInput } = await import('/src/games/climb_bot.js');
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, dbg = inst.dbg;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__bots = [makeBot(0, { rnd }), makeBot(1, { rnd })]; window.__idle = [false, false]; window.__flip = [false, false];
    const out = [{}, {}];
    window.__run = (n, stop) => {
      const dt = 1 / 60;
      for (let q = 0; q < n && (!m.finished || window.__post); q++) {
        const st = dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) {
          const v = inp.virtual[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (window.__idle[i] || m.state !== 'play') continue;
          const pl = dbg.players[i].pl; botInput(window.__bots[i], pl, dbg.P, st.T, dt, out[i], { dbg });
          let x = out[i].x; if (window.__flip[i]) x = -x;
          v.x = x; v.a = !!out[i].aP; v.b = !!out[i].bP || (window.__bots[i].pushNow ? (window.__bots[i].pushNow = false, true) : false);
          // pas op: aP wordt door de input-laag afgeleid uit a (1 frame ingedrukt)
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page, errors };
}
const S = (page) => page.evaluate(() => window.__app.mode.instance.dbg.state());
const hookFinish = (page) => page.evaluate(() => { window.__fin = null; const m = window.__app.mode; const orig = m.finishPvp.bind(m); let called = 0; m.finishPvp = (res) => { called++; window.__fin = { res, called, T: m.instance.dbg.state().T }; return orig(res); }; });

async function gameRun(label, { twist = 'none', idle = [false, false], flip = [false, false], maxFrames = 60 * 130, prep } = {}) {
  console.log(`\n== ${label} (twist ${twist})`);
  const { browser, page, errors } = await open(twist);
  await hookFinish(page);
  await page.evaluate(([i, f]) => { window.__idle = i; window.__flip = f; }, [idle, flip]);
  if (prep) await prep(page);
  for (let c = 0; c < maxFrames / 600 + 2 && !(await page.evaluate(() => window.__app.mode.finished)); c++) await page.evaluate(() => window.__run(600));
  const fin = await page.evaluate(() => window.__fin), st = await S(page);
  check(!!fin && fin.called === 1, `finishPvp precies 1x aangeroepen${fin ? ` (T=${fin.T.toFixed(1)} s, winnaar ${fin.res.winner}, score ${JSON.stringify(fin.res.score)})` : ''}`);
  if (fin) console.log('   ' + fin.res.summary.replace(/<[^>]+>/g, ''));
  check(errors.length === 0, 'geen console-fouten' + (errors.length ? '\n' + errors.slice(0, 5).join('\n') : ''));
  await browser.close();
  return { fin, st };
}
if (scen.includes('game')) {
  const r1 = await gameRun('bots tegen elkaar');
  check(r1.fin && r1.fin.T < 85, `potje duurt ${r1.fin ? r1.fin.T.toFixed(1) : '-'} s (< 85)`);
  // beide spelers kunnen winnen: wie niet 'idle' is en omhoog klimt wint
  const a = await gameRun('alleen Wes klimt', { idle: [false, true] }); check(a.fin && a.fin.res.winner === 0, `Wes wint (${a.fin && a.fin.res.winner})`);
  const b = await gameRun('alleen Jor klimt', { idle: [true, false] }); check(b.fin && b.fin.res.winner === 1, `Jor wint (${b.fin && b.fin.res.winner})`);
  const c = await gameRun('niemand beweegt (tijdslimiet / lava)', { idle: [true, true] }); check(c.fin && c.fin.called === 1, 'einde ook zonder activiteit');
}
if (scen.includes('twists')) {
  for (const t of ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman']) {
    if (twistArg && t !== twistArg) continue;
    const r = await gameRun('twist-test', { twist: t, flip: t === 'invert' ? [true, true] : [false, false] });
    check(!!r.fin, `twist ${t}: afgerond`);
  }
}

if (scen.includes('shots')) {
  const tag = twistArg || 'none';
  const { browser, page, errors } = await open(twistArg || 'none', process.env.Q || 'low');
  const snap = async (n) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.screenshot({ path: `/tmp/climb_${tag}_${n}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); };
  const run = (n) => page.evaluate((k) => window.__run(k), n);
  await run(60 * 4); await snap('a_start');
  await run(60 * 10); await snap('b_climb');
  // brug met tonnen
  await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.warpTo(0, d.P.find((p) => p.bridge).id); d.warpTo(1, d.P.find((p) => p.bridge).id); }); await run(60 * 5); await snap('c_bridge');
  // wolken
  await page.evaluate(() => { const d = window.__app.mode.instance.dbg; const c = d.P.filter((p) => p.type === 'cloud'); d.warpTo(0, c[2].id); d.warpTo(1, c[3].id); window.__idle = [true, true]; }); await run(30); await snap('d_clouds');
  // draak
  await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.dragonNow(); window.__idle = [true, true]; d.players[0].pl.shoe = 0; }); await run(60 * 2.6); await snap('e_dragon_aim'); await run(60 * 0.9); await snap('f_dragon_fire');
  // schildpad
  await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.warpTo(0, d.P.filter((p) => p.tower === 0 && p.route && p.y0 > 40)[5].id); d.warpTo(1, d.P.filter((p) => p.tower === 1 && p.route && p.y0 > 10)[1].id); d.turtleNow(); }); await run(60 * 2.0); await snap('g_turtle');
  // kip
  await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.chickenNow(); }); await run(60 * 1.2); await snap('h_chicken');
  // lava dichtbij
  await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.warpTo(0, d.P.filter((p) => p.tower === 0 && p.route && p.y0 > 1)[0].id); d.warpTo(1, d.P.filter((p) => p.tower === 1 && p.route && p.y0 > 1)[1].id); d.setLava(1.0); }); await run(60 * 2.2); await snap('i_lava');
  await browser.close();
  const o2 = await open(twistArg || 'none', process.env.Q || 'low');
  const snap2 = async (n) => { await o2.page.evaluate(() => { window.__app.mode.paused = true; }); await o2.page.screenshot({ path: `/tmp/climb_${tag}_${n}.png` }); await o2.page.evaluate(() => { window.__app.mode.paused = false; }); };
  await o2.page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.warpTo(0, d.P.filter((p) => p.tower === 0 && p.route && p.y0 > 88 && !p.top)[0].id); d.warpTo(1, d.P.filter((p) => p.tower === 1 && p.route && p.y0 > 84 && !p.top)[0].id); d.setLava(40); });
  await o2.page.evaluate(() => window.__run(60 * 1.5)); await snap2('j_top');
  await o2.page.evaluate(() => { window.__post = true; window.__app.mode.instance.dbg.endNow(0, 'top'); }); await o2.page.evaluate(() => window.__run(60 * 2.2)); await o2.page.waitForTimeout(500); await snap2('k_win');
  errors.push(...o2.errors); await o2.browser.close();
  console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'NO ERRORS');
}

if (scen.includes('trace')) {
  const { browser, page, errors } = await open(twistArg || 'none');
  for (let k = 0; k < 40; k++) {
    await page.evaluate(() => window.__run(90)); const st = await S(page);
    console.log(`t=${st.T.toFixed(1)} lava=${st.lava.toFixed(1)} x${st.lavaMult.toFixed(1)} dragon=${st.dragon} turtle=${st.turtle} | ` + st.p.map((p) => `[y=${p.y.toFixed(1)} h=${p.height.toFixed(0)} ${p.dead ? 'DEAD' : ''} st=${p.stun.toFixed(1)} gr=${p.ground} f=${p.falls} hit=${p.hits}]`).join(' '));
    if (await page.evaluate(() => window.__app.mode.finished)) break;
  }
  console.log(errors.join('\n')); await browser.close();
}
if (server) server.close();
console.log(failures ? `\n${failures} test(s) MISLUKT` : '\nAlle tests geslaagd');
process.exit(failures ? 1 : 0);
