// Gebruik: node tools/test_buzz3.mjs [scenario...]
//   bots    : 4 volledige potjes met bots (versneld, zonder renderen); in elk potje is een andere speler (slot 0, 1, 2) de sterkste -> winnaars 0, 1 en 2 komen voor; finishPvp precies 1x
//   twists  : één potje per twist -> finishPvp altijd aangeroepen, geen fouten
//   idle    : niemand doet iets -> tijd om / beslissingsronde / loting, finishPvp toch 1x
//   logic   : deterministische mini-tests (valse start, goed/fout antwoord, Deurman zegt, schatten, comeback, tiebreak, Deurman-twist)
//   shots   : screenshots van alle rondesoorten, finale en resultaatkaart (/tmp/b3_*.png)
// Omgeving: TWIST=<id> om de twist te forceren. Q=high voor schaduwen.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['bots'];
const ALL_TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'bodyswap', 'deurman'];
const errors = []; let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FOUT'} ${name}${ok ? '' : '  -> ' + info}`); if (!ok) fails++; };

async function open(twist, extra = '', skipReady = false, seed = null) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${twist}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${twist}] [pageerror] ` + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=buzz3&players=3&quality=${process.env.Q || 'low'}&twist=${twist}${extra}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  if (skipReady) return { browser, page };
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    for (const k of [0, 1, 2]) inp.virtual[k].a = true; inp.update(); mode.update(0.016);
    for (const k of [0, 1, 2]) inp.virtual[k].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  if (seed != null) await page.evaluate((sd) => { window.__seed = sd; }, seed);
  // bots installeren: skill = { react (sec), acc (0..1), trap (0..1 kans dat hij NIET in de valstrik trapt), est (ruis bij schatten) }
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = (window.__seed ?? 4242) >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__skill = [0, 1, 2].map(() => ({ react: 0.35, acc: 0.85, trap: 0.8, est: 9 }));
    window.__idle = false;
    const mem = [{}, {}, {}]; let key = '';
    const rel = (v) => { v.a = false; v.b = false; v.x = 0; v.y = 0; };
    const XY = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const dirs = ['up', 'left', 'right', 'down'];
    function bot(i, st, dt) {
      const v = inp.virtual[i], sk = window.__skill[i], M = mem[i];
      // a/dir-knoppen één frame, dan loslaten
      if (M.pulse) { M.pulse = false; rel(v); return; }
      rel(v);
      if (window.__idle || st.ph !== 'play' || !st.round) return;
      const k = `${st.ridx}${st.tiebreak ? 't' : ''}${st.round.cmd ?? ''}${st.round.phase === 'pre' ? 'p' : ''}`;
      if (M.key !== k) { for (const q in M) delete M[q]; M.key = k; M.t0 = st.T; M.delay = sk.react * (0.8 + 0.5 * rnd()); M.dummy = rnd(); }
      const el = st.T - M.t0, R = st.round;
      const A = () => { v.a = true; M.pulse = true; M.done = true; };
      const D = (dir) => { v.x = XY[dir][0]; v.y = XY[dir][1]; M.pulse = true; };
      if (st.type === 'a') {
        if (M.done) return;
        if (R.go) { if (M.goT == null) M.goT = st.T; if (st.T - M.goT >= M.delay) A(); }
        else if (M.dummy > sk.acc + 0.12 && el > 0.9) A();   // valse start door onnauwkeurigheid
      } else if (st.type === 'b') {
        if (M.done || el < M.delay * 5) return;
        const wrong = dirs.filter((d2) => d2 !== R.correct);
        const d2 = rnd() < sk.acc ? R.correct : wrong[Math.floor(rnd() * 3)]; M.done = true; D(d2);
      } else if (st.type === 'c') {
        if (R.phase !== 'go') return;
        if (M.goT == null) { M.goT = st.T; M.idx = 0; }
        M.wait = (M.wait ?? 0) - dt; if (M.wait > 0) return;
        const nxt = R.seq[R.prog[i]]; if (nxt == null) return;
        const err = rnd() > Math.pow(sk.acc, 1 / 3) ? dirs.filter((d2) => d2 !== nxt)[Math.floor(rnd() * 3)] : nxt;
        D(err); M.wait = sk.react * 0.8 + 0.1;
      } else if (st.type === 'd') {
        if (R.phase !== 'cmd' || M.done) return;
        if (R.valid) { if (el >= M.delay) A(); } else if (el > 0.5 && rnd() > sk.trap) { A(); } else if (el > 1.0) M.done = true;
      } else if (st.type === 'e') {
        if (R.phase !== 'guess' || M.done) return;
        if (M.tgt == null) M.tgt = Math.max(0, Math.min(100, R.N + (rnd() - 0.5) * 2 * sk.est * (1.4 - sk.acc)));
        const cur = R.v[i], diff = M.tgt - cur;
        if (Math.abs(diff) < 2.5) { if (el > M.delay * 2) A(); } else { v.x = Math.sign(diff); v.y = 0; }
      }
    }
    window.__botStep = (dt) => { const st = d.state(); for (let i = 0; i < 3; i++) bot(i, st, dt); };   // alleen virtuele invoer zetten (voor realtime-tests)
    window.__bot = (n, stop) => {
      const dt = 1 / 30;
      for (let q = 0; q < n && !m.finished; q++) {
        const st = d.state(); if (stop && stop(st)) return true;
        for (let i = 0; i < 3; i++) bot(i, st, dt);
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page };
}

async function playOut(page, label, maxSteps = 30 * 260) {
  const res = await page.evaluate((maxSteps) => {
    const m = window.__app.mode, inst = m.instance; let calls = 0; const orig = m.finishPvp.bind(m);
    // finishPvp-aanroepen tellen via ctx
    const ctxFin = m.ctx.finishPvp; m.ctx.finishPvp = (r) => { calls++; return ctxFin(r); };
    let guard = 0, last = '';
    const log = [];
    while (!m.finished && guard++ < maxSteps) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.ridx + (st.tiebreak ? 't' : '');
      if (key !== last) { log.push(`T=${st.T.toFixed(0)} r${st.ridx} [${st.scores}]`); last = key; }
    }
    const st = inst.dbg.state();
    return { finished: m.finished, result: m.result, T: st.T, st, calls, log };
  }, maxSteps);
  const r = res.result;
  console.log(`${label}: finished=${res.finished} T=${res.T.toFixed(1)} winner=${r ? r.winner : '-'} score=${r ? r.scoreArr : '-'} firsts=${res.st.firsts} fouls=${res.st.fouls} tiebreak=${res.st.tiebreak} finishPvp-aanroepen=${res.calls}`);
  return res;
}

for (const name of scen) {
  if (name === 'intro') {
    for (const tw of (process.env.TW || 'none,giant').split(',')) {
      const { browser, page } = await open(tw, '', true); await page.waitForTimeout(600);
      await page.screenshot({ path: `/tmp/b3_intro_${tw}.png` }); console.log('shot intro', tw); await browser.close();
    }
    continue;
  }
  if (name === 'bots') {
    const tally = [0, 0, 0, 0]; const S = { react: 0.3, acc: 0.95, trap: 0.95, est: 5 }, W = { react: 0.75, acc: 0.6, trap: 0.35, est: 14 };
    const cfgs = [['Wes sterk', [S, W, W]], ['Jor sterk', [W, S, W]], ['Juul sterk', [W, W, S]], ['allen gelijk', [{ ...W }, { ...W }, { ...W }]]];
    for (const [label, sk] of cfgs) {
      const { browser, page } = await open(process.env.TWIST || 'none');
      await page.evaluate((s) => { window.__skill = s; }, sk);
      const res = await playOut(page, label);
      check(`${label}: finishPvp precies 1x en afgelopen`, res.finished && res.calls === 1, `finished=${res.finished} calls=${res.calls}`);
      const w = res.result ? res.result.winner : null; tally[w == null ? 3 : w]++;
      await browser.close();
    }
    console.log(`winnaars: Wes ${tally[0]}, Jor ${tally[1]}, Juul ${tally[2]}, geen ${tally[3]}`);
    check('elke speler kan winnen (slot 0, 1 en 2)', tally[0] >= 1 && tally[1] >= 1 && tally[2] >= 1, JSON.stringify(tally));
  } else if (name === 'sym') {
    // eerlijkheid: drie gelijke bots, N potjes met andere ruis -> winnaars ~gelijk verdeeld
    const N = +(process.env.N || 9), win = [0, 0, 0], tot = [0, 0, 0]; let Tsum = 0;
    for (let k = 0; k < N; k++) {
      const { browser, page } = await open('none', '', false, 500 + k * 53);
      const res = await playOut(page, `sym ${k + 1}`);
      const w = res.result ? res.result.winner : null; if (w != null) win[w]++;
      (res.result ? res.result.scoreArr : [0, 0, 0]).forEach((v, i) => { tot[i] += v; }); Tsum += res.T;
      await browser.close();
    }
    console.log(`SYM winnaars Wes/Jor/Juul = ${win}, punten totaal = ${tot}, gem. duur = ${(Tsum / N).toFixed(1)} s`);
    check('symmetrie: geen speler wint meer dan 65% (gelijke bots)', Math.max(...win) <= Math.ceil(N * 0.65), JSON.stringify(win));
  } else if (name === 'twists') {
    for (const tw of ALL_TWISTS) {
      const { browser, page } = await open(tw);
      const res = await playOut(page, `twist ${tw}`);
      check(`twist ${tw}: finishPvp 1x`, res.finished && res.calls === 1, `finished=${res.finished} calls=${res.calls}`);
      await browser.close();
    }
  } else if (name === 'deurman') {
    // echte Deurman-stare in realtime (scare=2): game pauzeert, wie bewoog verliest iets via onDeurman; spel loopt daarna gewoon door
    for (const still of [true, false]) {
      const { browser, page } = await open('deurman', '&scare=2');
      await page.evaluate((still) => {
        const inst = window.__app.mode.instance; window.__dm = 0; window.__dmArgs = null; const o = inst.onDeurman;
        inst.onDeurman = (mv) => { window.__dm++; window.__dmArgs = mv.slice(); return o.call(inst, mv); };
        import('/src/engine/scare.js').then(({ scare }) => { window.__scare = scare; });
        window.__tick = setInterval(() => { const sc = window.__scare; if (!sc || window.__app.mode.finished) return; if (sc.active) { for (const k of [0, 1, 2]) { const v = window.__app.input.virtual[k]; v.a = v.b = false; v.x = v.y = 0; if (!still && k === 1) v.x = 1; } return; } window.__botStep(0.1); }, 100);
      }, still);
      const t0 = Date.now(); let dm = 0; while (Date.now() - t0 < 150000) { dm = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return window.__dm + (S.sightings || 0) * 100; }); if (dm % 100 >= 1 || (still && dm >= 100)) break; await page.waitForTimeout(1000); }
      await page.waitForTimeout(still ? 5000 : 500);
      const r = await page.evaluate(() => ({ dm: window.__dm, args: window.__dmArgs, T: window.__app.mode.instance.dbg.state().T, fin: window.__app.mode.finished }));
      check(`Deurman-twist (${still ? 'iedereen stil: geen straf' : 'Jor beweegt: onDeurman([f,t,f])'}): stare afgehandeld`, still ? (r.dm === 0 && dm >= 100) : (r.dm >= 1 && r.args[1] === true), JSON.stringify(r) + ' ' + dm);
      await page.waitForFunction(() => !window.__scare.active, null, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(500); const T1 = await page.evaluate(() => window.__app.mode.instance.dbg.state().T);
      await page.waitForTimeout(3000); const T2 = await page.evaluate(() => window.__app.mode.instance.dbg.state().T);
      check('spel loopt na de Deurman door', T2 > T1 || r.fin, `${T1} -> ${T2}`);
      await page.evaluate(() => clearInterval(window.__tick)); await browser.close();
    }
  } else if (name === 'idle') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    await page.evaluate(() => { window.__idle = true; });
    const res = await playOut(page, 'idle (niemand doet iets)');
    check('idle: finishPvp 1x met winnaar', res.finished && res.calls === 1 && res.result.winner != null, JSON.stringify(res.result && [res.result.winner]));
    await browser.close();
  } else if (name === 'logic') {
    const { browser, page } = await open('none');
    const res = await page.evaluate(() => {
      const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'OK  ' : 'FOUT'} ${name}${cond ? '' : '  -> ' + info}`);
      const m = window.__app.mode, inst = m.instance, d = inst.dbg, inp = window.__app.input, v = inp.virtual;
      window.__idle = true;
      { const pl = m.ctx.players, hudN = [...document.querySelectorAll('#hud .pbox .n')].map((e) => e.textContent); ok('namen: Wes, Jor, Juul (ctx.players + HUD)', pl.map((p) => p.name).join() === 'Wes,Jor,Juul' && hudN.join() === 'Wes,Jor,Juul', JSON.stringify([pl.map((p) => p.name), hudN])); ok('kleuren: Wes groen, Jor blauw, Juul oranje', pl[0].color === 0x2f9e5b && pl[1].color === 0x3a78e0 && pl[2].color === 0xf08a2a, JSON.stringify(pl.map((p) => p.color.toString(16)))); }
      const step = (n, dt = 1 / 30) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
      const clr = () => { for (const i of [0, 1, 2]) { v[i].a = false; v[i].b = false; v[i].x = 0; v[i].y = 0; } };
      const tap = (i, what) => { clr(); if (what === 'a') v[i].a = true; else { v[i].x = what === 'left' ? -1 : what === 'right' ? 1 : 0; v[i].y = what === 'up' ? -1 : what === 'down' ? 1 : 0; } step(1); clr(); step(1); };
      const play = (idx) => { d.goto(idx); step(3); };
      const upTo = (cond, max = 600) => { let k = 0; while (!cond(d.state()) && k++ < max) step(1); return k < max; };
      // 1. Groen: valse start = -1, goed = punten, eerste krijgt het meest
      play(0); let st = d.state(); ok('ronde 0 is Groen (a)', st.type === 'a', st.type);
      step(5); tap(1, 'a'); st = d.state(); ok('valse start: Jor -1 (score blijft >= 0)', st.fouls[1] === 1 && st.scores[1] === 0, JSON.stringify([st.fouls, st.scores]));
      upTo((s) => s.round && s.round.go); step(2); tap(2, 'a'); step(2); tap(0, 'a'); upTo((s) => s.ph === 'reveal'); st = d.state();
      ok('Groen: Juul 3, Wes 2', st.scores[2] === 3 && st.scores[0] === 2, JSON.stringify(st.scores));
      // 2. Welk is het meest
      play(1); st = d.state(); const cor = st.round.correct, wrong = ['up', 'left', 'right', 'down'].filter((x) => x !== cor)[0];
      ok('ronde 1 is Meeste (b)', st.type === 'b'); step(4); tap(0, wrong); tap(1, cor); tap(2, cor); upTo((s) => s.ph === 'reveal'); st = d.state();
      ok('Meeste: Jor +3, Juul +2, Wes fout (-1)', st.scores[1] === 3 && st.scores[2] === 5 && st.scores[0] === 1 && st.fouls[0] === 1, JSON.stringify(st.scores) + st.fouls);
      // 3. Volgorde
      d.setScore(0, 5); d.setScore(1, 5); d.setScore(2, 5);
      play(4); st = d.state(); ok('ronde 4 is Volgorde (c)', st.type === 'c'); upTo((s) => s.round.phase === 'go'); step(1);
      const seq = d.state().round.seq; for (const x of seq) tap(2, x); const wr = seq[0] === 'up' ? 'down' : 'up'; tap(0, wr);
      upTo((s) => s.ph === 'reveal'); st = d.state(); ok('Volgorde: Juul klaar +3, Wes fout (-1)', st.scores[2] === 8 && st.scores[0] === 4 && st.fouls[0] >= 2, JSON.stringify(st.scores) + st.fouls);
      // 4. Deurman zegt: trap
      d.setScore(0, 5); d.setScore(1, 5); d.setScore(2, 5);
      play(2); st = d.state(); ok('ronde 2 is Deurman zegt (d)', st.type === 'd');
      let sawTrap = false, sawValid = false, trapPunished = false; const before = st.scores.slice();
      for (let q = 0; q < 2; q++) {
        upTo((s) => s.round && s.round.phase === 'cmd' || s.ph === 'reveal'); st = d.state(); if (st.ph === 'reveal') break;
        if (!st.round.valid) { sawTrap = true; tap(1, 'a'); const s0 = d.state().scores.slice(); upTo((s) => s.round.phase === 'gap'); step(1); trapPunished = d.state().scores[1] === 4; }
        else { sawValid = true; tap(0, 'a'); upTo((s) => s.round.phase === 'gap'); step(1); }
        upTo((s) => s.round.phase === 'pre' || s.ph === 'reveal');
      }
      ok('Deurman zegt: valstrik + echte opdracht gezien', sawTrap && sawValid, `${sawTrap} ${sawValid}`); ok('valstrik kost een punt', trapPunished, JSON.stringify(d.state().scores));
      // 5. Schatten
      play(3); st = d.state(); ok('ronde 3 is Schat (e)', st.type === 'e'); upTo((s) => s.round.phase === 'guess'); const N = d.state().round.N;
      // Wes naar N (links/rechts), anderen idle
      let k = 0; while (k++ < 300 && Math.abs(d.state().round.v[0] - N) > 1.5) { clr(); v[0].x = N > d.state().round.v[0] ? 1 : -1; step(1); } clr(); tap(0, 'a');
      upTo((s) => s.ph === 'reveal'); st = d.state(); ok('Schat: Wes dichtst bij (krijgt >= 3)', st.round.v[0] > 0 && Math.abs(st.round.v[0] - N) < 6, `N=${N} v=${st.round.v}`);
      // 6. goud + comeback
      d.setScore(0, 20); d.setScore(1, 12); d.setScore(2, 4); play(9); st = d.state();
      ok('ronde 9 is goud', st.gold === true, String(st.gold)); ok('comeback: Juul (laatste) krijgt hulpje, rest niet', st.helped[2] && !st.helped[0] && !st.helped[1], JSON.stringify(st.helped));
      upTo((s) => s.round.phase === 'guess'); const N2 = d.state().round.N; let k2 = 0; while (k2++ < 300 && Math.abs(d.state().round.v[1] - N2) > 1.5) { clr(); v[1].x = N2 > d.state().round.v[1] ? 1 : -1; step(1); } clr(); tap(1, 'a');
      const s0 = d.state().scores[1]; upTo((s) => s.ph === 'reveal'); st = d.state(); ok('goud: dubbele punten (>= +6)', st.scores[1] - s0 >= 6, `${s0} -> ${st.scores[1]}`);
      // 7. Deurman-twist: bewoog = -1
      d.setScore(1, 5); inst.onDeurman([false, true, false]); st = d.state(); ok('onDeurman: beweger -1', st.scores[1] === 4 && st.fouls[1] >= 1, JSON.stringify(st.scores));
      return out;
    });
    console.log(res.join('\n')); res.forEach((l) => { if (l.startsWith('FOUT')) fails++; });
    await browser.close();
    {   // gelijkstand -> beslissingsronde met alleen de koplopers
      const { browser: b2, page: p2 } = await open('none');
      const r2 = await p2.evaluate(() => {
        const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'OK  ' : 'FOUT'} ${name}${cond ? '' : '  -> ' + info}`);
        const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input; window.__idle = true;
        const step = (n, dt = 1 / 30) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
        d.setScore(0, 9); d.setScore(1, 9); d.setScore(2, 3); d.goto(9); step(2);
        let g = 0; while (d.state().ph !== 'play' && g++ < 100) step(1);
        // zonder spelers te laten buzzeren: ronde e eindigt na time-out; scores gelijk -> beslissing
        g = 0; while (!d.state().tiebreak && g++ < 30 * 40) step(1); let st = d.state();
        ok('gelijkstand start beslissingsronde', st.tiebreak, JSON.stringify(st));
        const v = inp.virtual; g = 0; while (!(d.state().round && d.state().round.go) && g++ < 600) step(1);
        v[1].a = true; step(1); v[1].a = false; step(1); g = 0; while (!m.finished && g++ < 30 * 30) step(1);
        ok('beslissing: Jor (buzzerde als eerste) wint, finishPvp', m.finished && m.result.winner === 1, JSON.stringify(m.result && m.result.winner));
        return out;
      });
      console.log(r2.join('\n')); r2.forEach((l) => { if (l.startsWith('FOUT')) fails++; }); await b2.close();
    }
  } else if (name === 'shots') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    console.log('render-info', JSON.stringify(await page.evaluate(() => { const i = window.__app.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries }; })));
    await page.evaluate(() => { window.__idle = true; });
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/b3_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    const run = (n, cond) => page.evaluate(([n]) => { window.__bot(n); }, [n]);
    // title (ronde a), dan spelen: bots aan
    await page.evaluate(() => { window.__idle = false; const d = window.__app.mode.instance.dbg; d.setScore(0, 9); d.setScore(1, 6); d.setScore(2, 2); });
    await run(20); await shot('title');
    for (const [tag, idx, until] of [['a', 0, (s) => s.round && s.round.go], ['b', 1, (s) => s.round && s.round.t > 2.5], ['c', 4, (s) => s.round && s.round.phase === 'go' && s.round.t > 5], ['d', 2, (s) => s.round && s.round.phase === 'cmd'], ['e', 3, (s) => s.round && s.round.phase === 'guess' && s.round.t > 2.5], ['gold', 9, (s) => s.round && s.round.phase === 'guess' && s.round.t > 2.5]]) {
      await page.evaluate((idx) => { window.__app.mode.instance.dbg.goto(idx); }, idx);
      await page.evaluate(([until]) => { const f = eval('(' + until + ')'); window.__bot(30 * 20, f); }, [until.toString()]);
      await shot('round_' + tag);
      await page.evaluate(() => window.__bot(30 * 12, (s) => s.ph === 'reveal'));
      await run(18); await shot('reveal_' + tag);
    }
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.toFinal(); window.__bot(40); });
    await shot('final');
    await page.evaluate(() => window.__bot(30 * 8, (s) => s.done)); await page.evaluate(() => window.__bot(40)); await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/b3_result.png' }); console.log('shot result');
    await browser.close();
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO ERRORS');
console.log(fails ? `${fails} FOUTEN` : 'ALLES OK');
server.close();
