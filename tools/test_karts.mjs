// Gebruik: node tools/test_karts.mjs [scenario...] [twist=<id>]
//   Achtervoegsel 3 (race3, both3, timeout3, idle3, items3, twists3, shots3) = 3 spelers (?players=3, Juul = slot 2); all3 = alle 3-speler-scenario's.
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
let scen = argv.filter((a) => !a.includes('=')).length ? argv.filter((a) => !a.includes('=')) : ['race', 'both', 'timeout', 'idle', 'items'];
if (scen.includes('all3')) scen = ['race3', 'both3', 'timeout3', 'idle3', 'items3', 'twists3'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
let failures = 0;
const check = (ok, msg) => { console.log((ok ? '  OK   ' : '  FAIL ') + msg); if (!ok) failures++; };

async function open(twist, quality = 'low', np = 2) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=karts&quality=${quality}${np === 3 ? '&players=3' : ''}${twist ? '&twist=' + twist : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async (np) => {
    const app = window.__app, mode = app.mode, inp = app.input;
    for (let i = 0; i < np; i++) inp.virtual[i].a = true; inp.update(); mode.update(0.016);
    for (let i = 0; i < np; i++) inp.virtual[i].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  }, np);
  // bot + helpers in de pagina
  await page.evaluate((np) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, C = inst.dbg.C;
    let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
    const skill = Array.from({ length: np }, () => ({ look: 8, drift: 0.55, item: 0.02, err: 0.15 }));
    window.__skill = skill; window.__mode = 'drive'; window.__log = [];
    const pt = (idx, lat) => { const N = C.N, i0 = ((Math.floor(idx) % N) + N) % N, i1 = (i0 + 1) % N, t = idx - Math.floor(idx); const x = C.X[i0] + (C.X[i1] - C.X[i0]) * t, z = C.Z[i0] + (C.Z[i1] - C.Z[i0]) * t; let tx = C.TX[i0], tz = C.TZ[i0]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; return [x - tz * lat, z + tx * lat]; };
    window.__run = (n, stop) => {
      const dt = 1 / 60;
      for (let q = 0; q < n && (!m.finished || window.__post); q++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (let i = 0; i < np; i++) {
          const v = inp.virtual[i], k = st.k[i], sk = skill[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (window.__mode === 'idle') continue;
          if (m.state !== 'play') continue;
          const look = sk.look + Math.max(0, k.fwd) * 0.45;
          let lat = (np === 3 ? (i - 1) : (i ? 1 : -1)) * 0.8 + Math.sin(st.T * 0.7 + i) * 1.2;
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
  }, np);
  return { browser, page, errors };
}
const S = (page) => page.evaluate(() => window.__app.mode.instance.dbg.state());

async function raceScenario(name, { twist = 'none', skill0, skill1, skills, maxSec = 130, flip = false, label, np = 2 } = {}) {
  console.log(`\n== ${label || name} ${twist ? '(twist ' + twist + ')' : ''}`);
  const { browser, page, errors } = await open(twist, 'low', np);
  await page.evaluate(([sk, f]) => { sk.forEach((a, i) => { if (a) Object.assign(window.__skill[i], a); }); window.__flip = f; }, [skills || [skill0, skill1], flip]);
  let finished = false, st;
  await page.evaluate(() => { window.__fin = null; const m = window.__app.mode; const orig = m.finishPvp.bind(m); let called = 0; m.finishPvp = (res) => { called++; window.__fin = { res, called, t: m.instance.dbg.state().T }; return orig(res); }; m.ctx.finishPvp = (res) => m.finishPvp(res); });
  for (let c = 0; c < maxSec * 60 / 600 + 10 && !finished; c++) {
    await page.evaluate(() => window.__run(600)); st = await S(page); finished = await page.evaluate(() => window.__app.mode.finished);
  }
  const fin = await page.evaluate(() => window.__fin);
  check(finished && fin && fin.called === 1, `finishPvp precies 1x aangeroepen (T=${fin ? fin.t.toFixed(1) : '-'} s)`);
  if (fin) check(fin.res.winner >= 0 && fin.res.winner < np, `winnaar is een geldig slot (${fin.res.winner})`);
  if (fin) console.log('   winnaar', fin.res.winner, 'score', JSON.stringify(fin.res.score), '|', fin.res.summary.replace(/<[^>]+>/g, ''));
  check(errors.length === 0, `geen console-fouten${errors.length ? '\n' + errors.slice(0, 5).join('\n') : ''}`);
  await browser.close();
  return fin;
}

for (const raw of scen) {
  const np = raw.endsWith('3') ? 3 : 2, name = raw.replace(/3$/, '');
  if (name === 'race') {
    const f = await raceScenario('race', { label: `bots (gelijk, ${np} spelers)`, np });
    if (np === 3 && f) { check(f.res.score.slice().sort().join() === '10,3,6'.split(',').sort().join() || JSON.stringify(f.res.score.slice().sort((a, b) => b - a)) === '[10,6,3]', `positiepunten 10/6/3 (${JSON.stringify(f.res.score)})`); }
    check(f && f.t > 35 && f.t < 105, `racetijd ${f ? f.t.toFixed(1) : '-'} s ligt in 35-105 s`);
  } else if (name === 'both') {
    const w = [];
    const good = { err: 0 }, bad = { look: np === 3 ? 4 : 5, drift: 0 };
    const cfgs = np === 3 ? [[good, bad, bad], [bad, good, bad], [bad, bad, good]] : [[good, bad], [bad, good]];
    for (const [target, sk] of cfgs.entries()) {   // de goede bot hoort te winnen; door de loting van de banen en de items mag een tweede/derde poging
      for (let poging = 0; poging < (np === 3 ? 3 : 1); poging++) { const f = await raceScenario('both', { skills: sk, label: `wie wint? slot ${target} rijdt goed (${np} spelers)`, np }); if (f && (f.res.winner === target || poging === (np === 3 ? 2 : 0))) { w.push(f.res.winner); break; } }
    }
    check(Array.from({ length: np }, (_, i) => w.includes(i)).every(Boolean), `alle spelers kunnen winnen (winnaars: ${w.join(',')})`);
  } else if (name === 'timeout') {
    // beide karts rijden maar het kan niet binnen de tijd -> traag: slowmo twist + bot die bijna stilstaat
    console.log(`\n== timeout (karts staan stil, tijdslimiet, ${np} spelers)`);
    const { browser, page, errors } = await open('none', 'low', np);
    await page.evaluate(() => { window.__mode = 'idle'; window.__fin = null; const m = window.__app.mode; const orig = m.finishPvp.bind(m); let called = 0; m.finishPvp = (res) => { called++; window.__fin = { res, called }; return orig(res); }; m.ctx.finishPvp = (res) => m.finishPvp(res); });
    // één kart rijdt heel even zodat er een winnaar op voorsprong is
    await page.evaluate((np) => { window.__app.mode.instance.dbg.warp(np === 3 ? 2 : 1, 40, 0, 0); }, np);
    for (let c = 0; c < 14 && !(await page.evaluate(() => window.__app.mode.finished)); c++) await page.evaluate(() => window.__run(600));
    const fin = await page.evaluate(() => window.__fin);
    check(fin && fin.called === 1 && fin.res.winner === (np === 3 ? 2 : 1), `bij tijdslimiet wint de leider (winnaar ${fin && fin.res.winner}, aantal ${fin && fin.called})`);
    check(errors.length === 0, 'geen console-fouten' + (errors.length ? '\n' + errors.join('\n') : ''));
    await browser.close();
  } else if (name === 'idle') {
    console.log(`\n== idle (niemand doet iets: toch einde via tijd, ${np} spelers)`);
    const { browser, page, errors } = await open('none', 'low', np);
    await page.evaluate(() => { window.__mode = 'idle'; window.__fin = null; const m = window.__app.mode; const orig = m.finishPvp.bind(m); let called = 0; m.finishPvp = (res) => { called++; window.__fin = { res, called }; return orig(res); }; m.ctx.finishPvp = (res) => m.finishPvp(res); });
    for (let c = 0; c < 14 && !(await page.evaluate(() => window.__app.mode.finished)); c++) await page.evaluate(() => window.__run(600));
    const fin = await page.evaluate(() => window.__fin);
    check(fin && fin.called === 1, `finishPvp aangeroepen (winnaar ${fin && fin.res.winner})`);
    check(errors.length === 0, 'geen console-fouten' + (errors.length ? '\n' + errors.join('\n') : ''));
    await browser.close();
  } else if (name === 'items' && np === 3) {
    console.log('\n== items met 3 karts: mikken op de koploper');
    const { browser, page, errors } = await open('none', 'low', 3);
    const dbg = (fn, ...a) => page.evaluate(fn, ...a);
    // startgrid: 3 verschillende banen naast elkaar, alle drie op dezelfde rij
    const g0 = await dbg(() => { const d = window.__app.mode.instance.dbg; return d.karts.map((k) => ({ idx: +k.loc.idx.toFixed(1), lat: +k.loc.lat.toFixed(2) })); });
    check(new Set(g0.map((g) => g.lat)).size === 3 && g0.every((g) => Math.abs(g.idx - g0[0].idx) < 0.6), `startgrid: 3 banen op één rij (${JSON.stringify(g0.map((g) => g.lat))})`);
    // vuurbal van kart 0 op een rechte: kart 1 (achter) en kart 2 (voorop) allebei in het zoekbereik -> raakt de koploper (kart 2)
    await dbg(() => { const d = window.__app.mode.instance.dbg; window.__mode = 'idle'; window.__run(200); d.warp(0, 60, 0, 6); d.warp(1, 70, -2.5, 6); d.warp(2, 73, 2.5, 6); d.karts.forEach((k) => { k.invT = 0; k.spinT = 0; }); d.giveItem(0, 'fire'); d.use(0); });
    await dbg(() => window.__run(100, (s) => s.k[1].spin > 0 || s.k[2].spin > 0));
    let st = await S(page); check(st.k[2].spin > 0 && !(st.k[1].spin > 0), `vuurbal mikt op de koploper (spin 1: ${st.k[1].spin.toFixed(2)}, spin 2: ${st.k[2].spin.toFixed(2)})`);
    // draak: bom valt (65%) voor de koploper; gewoon laten vliegen zonder fouten
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.dragonNow(); window.__run(60 * 8); });
    st = await dbg(() => { const d = window.__app.mode.instance.dbg; return { s: d.D.state, b: d.bombs.length, p: d.patches.length }; });
    check(st.s === 'fly' || st.s === 'wait', `draak vliegt zonder fouten (${JSON.stringify(st)})`);
    // koeien: steken over (voor de koploper)
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.cowAt(0); window.__run(60 * 3); });
    st = await dbg(() => window.__app.mode.instance.dbg.cows.map((c) => c.state)); check(st[0] === 'cross' || st[0] === 'wait', `koe-logica werkt (${st})`);
    // power-ups voor de achterste hebben meer kans op goud: gouden paddenstoel en banaan gebruiken
    await dbg(() => { const d = window.__app.mode.instance.dbg; d.giveItem(2, 'gold'); d.use(2); d.giveItem(1, 'banana'); d.use(1); });
    st = await S(page); check(st.k[2].boost > 3, 'gouden paddenstoel (kart 3) werkt');
    await dbg(() => { const i = window.__app.mode.instance; i.onDeurman([true, false, true]); });
    st = await S(page); check(st.k[0].freeze > 1 && st.k[1].freeze <= 0 && st.k[2].freeze > 1, `onDeurman met 3 booleans bevriest alleen de bewegers (${st.k.map((q) => q.freeze.toFixed(1))})`);
    check(errors.length === 0, 'geen console-fouten' + (errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''));
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
      const f = await raceScenario('twist', { twist: t, flip: t === 'invert', label: `twist ${t} (${np} spelers)`, maxSec: 140, np });
      check(!!f, `twist ${t}: afgerond`);
    }
  } else if (name === 'shots') {
    const tag = (twistArg || 'none') + (np === 3 ? '_3sp' : '');
    const { browser, page, errors } = await open(twistArg || 'none', process.env.Q || 'low', np);
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
