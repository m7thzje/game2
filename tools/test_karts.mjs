// Gebruik: node tools/test_karts.mjs [scenario...] [twist=<id>]
//   scenario: race (bot-race, versneld, geen renderen), both (beide spelers winnen), timeout (tijdslimiet), idle (niemand rijdt),
//             items (alle voorwerpen/gimmicks), shots (screenshots), twists (alle twists een stukje racen)
// Versneld (zonder renderen) potjes Kasteel-Kartrace laten spelen door bots; rapporteert winnaar, tijden, en of finishPvp wordt aangeroepen.
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
const argv = process.argv.slice(2);
const twistArg = (argv.find((a) => a.startsWith('twist=')) || '').slice(6);
const scen = argv.filter((a) => !a.includes('=')).length ? argv.filter((a) => !a.includes('=')) : ['race', 'both', 'timeout', 'idle', 'items'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  OK   ' : '  FAIL ') + msg); if (!ok) failures++; };

async function open(twist, quality = 'low') {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=karts&quality=${quality}${twist ? '&twist=' + twist : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  // bot + helpers in de pagina
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, C = inst.dbg.C;
    let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
    const skill = [{ look: 8, drift: 0.55, item: 0.02, err: 0.15 }, { look: 8, drift: 0.55, item: 0.02, err: 0.15 }];
    window.__skill = skill; window.__mode = 'drive'; window.__log = [];
    const pt = (idx, lat) => { const N = C.N, i0 = ((Math.floor(idx) % N) + N) % N, i1 = (i0 + 1) % N, t = idx - Math.floor(idx); const x = C.X[i0] + (C.X[i1] - C.X[i0]) * t, z = C.Z[i0] + (C.Z[i1] - C.Z[i0]) * t; let tx = C.TX[i0], tz = C.TZ[i0]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; return [x - tz * lat, z + tx * lat]; };
    window.__run = (n, stop) => {
      const dt = 1 / 60;
      for (let q = 0; q < n && (!m.finished || window.__post); q++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) {
          const v = inp.virtual[i], k = st.k[i], sk = skill[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (window.__mode === 'idle') continue;
          if (m.state !== 'play') continue;
          const look = sk.look + Math.max(0, k.fwd) * 0.45;
          let lat = ((i ? 1 : -1) * 0.8) + Math.sin(st.T * 0.7 + i) * 1.2;
          const [tx, tz] = pt(k.idx + look, lat);
          const want = Math.atan2(tx - k.x, tz - k.z), ad = angDiff(k.th, want);
          // gebruik de ruwe (niet-getwiste) richting: bij 'invert' etc. regelt de bot via window.__flip
          let x = Math.max(-1, Math.min(1, -ad * 2.4));
          if (window.__flip) x = -x;
          v.x = x;
          const fl = window.__flip ? -1 : 1;
          if (Math.abs(ad) > 0.45 && k.fwd > 9 && rnd() < 0.9 && sk.drift > 0) v.b = true;
          if (k.drift && Math.abs(ad) < 0.12) v.b = false;
          if (k.item && rnd() < sk.item) v.a = true;
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page, errors };
}
const S = (page) => page.evaluate(() => window.__app.mode.instance.dbg.state());

async function raceScenario(name, { twist = 'none', skill0, skill1, maxSec = 130, flip = false, label } = {}) {
  console.log(`\n== ${label || name} ${twist ? '(twist ' + twist + ')' : ''}`);
  const { browser, page, errors } = await open(twist);
  await page.evaluate(([a, b, f]) => { if (a) Object.assign(window.__skill[0], a); if (b) Object.assign(window.__skill[1], b); window.__flip = f; }, [skill0, skill1, flip]);
  let finished = false, st;
  await page.evaluate(() => { window.__fin = null; const m = window.__app.mode; const orig = m.finishPvp.bind(m); let called = 0; m.finishPvp = (res) => { called++; window.__fin = { res, called, t: m.instance.dbg.state().T }; return orig(res); }; m.ctx.finishPvp = (res) => m.finishPvp(res); });
  for (let c = 0; c < maxSec * 60 / 600 + 10 && !finished; c++) {
    await page.evaluate(() => window.__run(600)); st = await S(page); finished = await page.evaluate(() => window.__app.mode.finished);
  }
  const fin = await page.evaluate(() => window.__fin);
  check(finished && fin && fin.called === 1, `finishPvp precies 1x aangeroepen (T=${fin ? fin.t.toFixed(1) : '-'} s)`);
  if (fin) console.log('   winnaar', fin.res.winner, 'score', JSON.stringify(fin.res.score), '|', fin.res.summary.replace(/<[^>]+>/g, ''));
  check(errors.length === 0, `geen console-fouten${errors.length ? '\n' + errors.slice(0, 5).join('\n') : ''}`);
  await browser.close();
  return fin;
}

for (const name of scen) {
  if (name === 'race') {
    const f = await raceScenario('race', { label: 'bots (gelijk)' });
    check(f && f.t > 35 && f.t < 105, `racetijd ${f ? f.t.toFixed(1) : '-'} s ligt in 35-105 s`);
  } else if (name === 'both') {
    const w = [];
    for (const [a, b] of [[{ err: 0 }, { look: 5, drift: 0 }], [{ look: 5, drift: 0 }, { err: 0 }]]) { const f = await raceScenario('both', { skill0: a, skill1: b, label: 'wie wint?' }); if (f) w.push(f.res.winner); }
    check(w.includes(0) && w.includes(1), `beide spelers kunnen winnen (winnaars: ${w.join(',')})`);
  } else if (name === 'timeout') {
    // beide karts rijden maar het kan niet binnen de tijd -> traag: slowmo twist + bot die bijna stilstaat
    console.log('\n== timeout (karts staan stil, tijdslimiet)');
    const { browser, page, errors } = await open('none');
    await page.evaluate(() => { window.__mode = 'idle'; window.__fin = null; const m = window.__app.mode; const orig = m.finishPvp.bind(m); let called = 0; m.finishPvp = (res) => { called++; window.__fin = { res, called }; return orig(res); }; m.ctx.finishPvp = (res) => m.finishPvp(res); });
    // één kart rijdt heel even zodat er een winnaar op voorsprong is
    await page.evaluate(() => { window.__app.mode.instance.dbg.warp(1, 40, 0, 0); });
    for (let c = 0; c < 14 && !(await page.evaluate(() => window.__app.mode.finished)); c++) await page.evaluate(() => window.__run(600));
    const fin = await page.evaluate(() => window.__fin);
    check(fin && fin.called === 1 && fin.res.winner === 1, `bij tijdslimiet wint de leider (winnaar ${fin && fin.res.winner}, aantal ${fin && fin.called})`);
    check(errors.length === 0, 'geen console-fouten' + (errors.length ? '\n' + errors.join('\n') : ''));
    await browser.close();
  } else if (name === 'idle') {
    console.log('\n== idle (niemand doet iets: toch einde via tijd)');
    const { browser, page, errors } = await open('none');
    await page.evaluate(() => { window.__mode = 'idle'; window.__fin = null; const m = window.__app.mode; const orig = m.finishPvp.bind(m); let called = 0; m.finishPvp = (res) => { called++; window.__fin = { res, called }; return orig(res); }; m.ctx.finishPvp = (res) => m.finishPvp(res); });
    for (let c = 0; c < 14 && !(await page.evaluate(() => window.__app.mode.finished)); c++) await page.evaluate(() => window.__run(600));
    const fin = await page.evaluate(() => window.__fin);
    check(fin && fin.called === 1, `finishPvp aangeroepen (winnaar ${fin && fin.res.winner})`);
    check(errors.length === 0, 'geen console-fouten' + (errors.length ? '\n' + errors.join('\n') : ''));
    await browser.close();
  } else if (name === 'items') {
    console.log('\n== items en gimmicks');
    const { browser, page, errors } = await open('none');
    const dbg = (fn, ...a) => page.evaluate(fn, ...a);
    // bananen: kart 0 legt een banaan, kart 1 rijdt erin
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.warp(0, 20, 0, 10); d.warp(1, 17, 0, 12); d.giveItem(0, 'banana'); window.__mode = 'idle'; d.use(0); });
    let st = await S(page); check((await dbg(() => window.__app.mode.instance.dbg.bananas.length)) === 1, 'banaan ligt op de baan');
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.warp(1, 17, 0, 12); window.__mode = 'idle'; });
    await dbg(() => { const d = window.__app.mode.instance.dbg; const b = d.bananas[0]; const k = d.karts[1]; k.x = b.x - Math.sin(k.th) * 3; k.z = b.z - Math.cos(k.th) * 3; k.vx = Math.sin(k.th) * 10; k.vz = Math.cos(k.th) * 10; window.__run(40, (s) => s.k[1].spin > 0); });
    st = await S(page); check(st.k[1].spin > 0 || (await dbg(() => window.__app.mode.instance.dbg.bananas.length)) === 0, `banaan laat kart draaien (spin ${st.k[1].spin.toFixed(2)})`);
    // vuurbal
    await dbg(() => { const d = window.__app.mode.instance.dbg; window.__run(200); d.warp(0, 60, 0, 6); d.warp(1, 66, 0, 6); d.karts[1].invT = 0; d.karts[1].spinT = 0; d.karts[0].invT = 0; d.giveItem(0, 'fire'); });
    await dbg(() => { const d = window.__app.mode.instance.dbg; const k0 = d.karts[0], k1 = d.karts[1]; k0.x = k1.x - 14 * Math.sin(k1.th); k0.z = k1.z - 14 * Math.cos(k1.th); k0.th = k1.th; d.use(0); });
    await dbg(() => window.__run(90, (s) => s.k[1].spin > 0));
    st = await S(page); check(st.k[1].spin > 0, `vuurbal raakt en laat draaien (spin ${st.k[1].spin.toFixed(2)})`);
    // ketchup
    await dbg(() => { const d = window.__app.mode.instance.dbg; window.__run(300); d.warp(0, 90, 0, 6); d.warp(1, 94, 0, 6); d.karts[1].invT = 0; d.karts[1].spinT = 0; d.karts[1].blindT = 0; d.giveItem(0, 'ketchup'); });
    await dbg(() => { const d = window.__app.mode.instance.dbg; const k0 = d.karts[0], k1 = d.karts[1]; k0.x = k1.x - 12 * Math.sin(k1.th); k0.z = k1.z - 12 * Math.cos(k1.th); k0.th = k1.th; d.use(0); });
    await dbg(() => window.__run(90, (s) => s.k[1].blind > 0));
    st = await S(page); check(st.k[1].blind > 0, `ketchup maakt blind (blind ${st.k[1].blind.toFixed(2)})`);
    await page.evaluate(() => { window.__app.mode.paused = true; }); await page.screenshot({ path: '/tmp/karts_ketchup.png' }); await page.evaluate(() => { window.__app.mode.paused = false; });
    // paddenstoel / goud
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.giveItem(0, 'shroom'); d.use(0); });
    st = await S(page); check(st.k[0].boost > 1, `turbo-paddenstoel geeft boost (${st.k[0].boost.toFixed(2)})`);
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.giveItem(1, 'gold'); d.use(1); });
    st = await S(page); check(st.k[1].boost > 3, `gouden paddenstoel geeft grote boost (${st.k[1].boost.toFixed(2)})`);
    // koe
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.cowAt(0); window.__run(60); });
    st = await dbg(() => { const d = window.__app.mode.instance.dbg; return d.cows.map((c) => c.state); }); check(st[0] === 'cross', `koe steekt over (${st[0]})`);
    await dbg(() => { const d = window.__app.mode.instance.dbg; const cw = d.cows[0]; const k = d.karts[0]; k.invT = 0; k.spinT = 0; k.y = 0; k.vy = 0; d.warp(0, cw.idx - 3, cw.lat, 8); window.__run(1); k.x = cw.x; k.z = cw.z; window.__run(2); });
    st = await dbg(() => window.__app.mode.instance.dbg.cows[0].state); check(st === 'fly' || st === 'gone', `koe wordt omver gereden (${st})`); if (st === 'cross') console.log(JSON.stringify(await dbg(() => { const d = window.__app.mode.instance.dbg; const k = d.karts[0], cw = d.cows[0]; return { y: k.y, vy: k.vy, done: k.done, dist: Math.hypot(k.x - cw.x, k.z - cw.z), R: k.R, st: window.__app.mode.state }; })));
    // draak
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.dragonNow(); window.__run(60 * 6); });
    st = await dbg(() => { const d = window.__app.mode.instance.dbg; return { s: d.D.state, b: d.bombs.length, p: d.patches.length }; });
    check(st.s === 'fly', `draak vliegt (${JSON.stringify(st)})`);
    await dbg(() => window.__run(60 * 8));
    await page.evaluate(() => { window.__app.mode.paused = true; }); await page.screenshot({ path: '/tmp/karts_dragon.png' }); await page.evaluate(() => { window.__app.mode.paused = false; });
    check(errors.length === 0, 'geen console-fouten' + (errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''));
    await browser.close();
  } else if (name === 'twists') {
    for (const t of TWISTS) {
      if (twistArg && t !== twistArg) continue;
      const f = await raceScenario('twist', { twist: t, flip: t === 'invert', label: 'twist ' + t, maxSec: 140 });
      check(!!f, `twist ${t}: afgerond`);
    }
  } else if (name === 'shots') {
    const tag = twistArg || 'none';
    const { browser, page, errors } = await open(twistArg || 'none', process.env.Q || 'low');
    const snap = async (n) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.screenshot({ path: `/tmp/karts_${tag}_${n}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); };
    await page.evaluate(() => window.__run(60 * 5)); await snap('start');
    await page.evaluate(() => window.__run(60 * 12)); await snap('run1');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.warp(0, 90, 0, 14); d.warp(1, 88, 1, 14); }); await page.evaluate(() => window.__run(25)); await snap('ramp');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.warp(0, 150, 0, 12); d.warp(1, 152, 1, 12); }); await page.evaluate(() => window.__run(40)); await snap('ice');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.warp(0, 65, 0, 12); d.warp(1, 150, 0, 12); }); await page.evaluate(() => window.__run(40)); await snap('far');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.dragonNow(); }); await page.evaluate(() => window.__run(60 * 7)); await snap('dragon');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.finishNow(0, 'ronde'); window.__post = true; }); await page.evaluate(() => window.__run(60 * 1.0)); await snap('photo0'); await page.evaluate(() => window.__run(60 * 2.6)); await page.waitForTimeout(1200); await snap('photo');
    console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'NO ERRORS'); await browser.close();
  }
}
console.log(failures ? `\n${failures} test(s) MISLUKT` : '\nAlle tests geslaagd');
server.close(); process.exit(failures ? 1 : 0);
