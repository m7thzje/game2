// Gebruik: node tools/test_sneeuwgevecht.mjs [scenario...]
//   bots   : volledige potjes met bots (versneld, zonder renderen) met verschillende sterktes; elk potje: finishPvp precies 1x; winnaars 0, 1 en 2 komen voor (zo nodig meer potjes)
//   twists : één potje per twist -> finishPvp altijd 1x, geen fouten
//   idle   : niemand doet iets -> tijd om (90 s) -> winnaar via tiebreak, finishPvp 1x
//   logic  : deterministische mini-tests (maken/gooien/treffer/muur/schild/goud/ijs/KO/storm/yeti/comeback/Deurman/tijdslimiet)
//   shots  : screenshots (/tmp/sg_*.png)
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
const ALL_TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
const errors = []; let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'OK  ' : 'FOUT'} ${name}${ok ? '' : '  -> ' + info}`); if (!ok) fails++; };

async function open(twist, extra = '', skipReady = false, seed = null) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${twist}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${twist}] [pageerror] ` + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=sneeuwgevecht&players=3&quality=${process.env.Q || 'low'}&twist=${twist}${extra}`);
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
  // bots: skill = { aim (rad ruis), dodge (kans 0..1), wall (kans per sec), shield (kans), agg (kans dat hij aanvalt i.p.v. dekking) }
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = (window.__seed ?? 777) >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__skill = [0, 1, 2].map(() => ({ aim: 0.18, dodge: 0.6, wall: 0.12, shield: 0.5 }));
    window.__idle = false;
    const mem = [{}, {}, {}];
    const rel = (v) => { v.a = false; v.b = false; v.x = 0; v.y = 0; };
    const nrm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
    function bot(i, st, dt) {
      const me = st.P[i], v = inp.virtual[i], sk = window.__skill[i], M = mem[i];
      if (M.pulse > 0) { M.pulse--; return; }
      rel(v);
      if (window.__idle || st.over || !me.alive || me.stun > 0) { M.armed = false; return; }
      M.cd = (M.cd ?? 0) - dt;
      const foes = st.P.filter((q) => q.i !== i && q.alive); if (!foes.length) return;
      // 1. wegduiken voor naderende landing / vlakke bal
      let danger = null;
      for (const b of st.balls) {
        if (b.owner === i) continue;
        const rem = (b.T - b.age);
        if (b.y > 2.7 && rem > 0.15) { const dd = Math.hypot(me.x - b.tx, me.z - b.tz); if (dd < 2.6 && rem < 1.0) danger = { x: b.tx, z: b.tz, rem }; }
        else { const sp = Math.hypot(b.vx, b.vz) || 1, dx = me.x - b.x, dz = me.z - b.z, along = (dx * b.vx + dz * b.vz) / sp; if (along > 0 && along < 7) { const miss = Math.abs(dx * b.vz - dz * b.vx) / sp; if (miss < 1.8) danger = { x: b.x + b.vx / sp * along, z: b.z + b.vz / sp * along, rem: along / sp, flat: true, bx: b.vx / sp, bz: b.vz / sp }; } }
      }
      if (danger && rnd() < sk.dodge * 0.9) {
        if (danger.flat && me.shieldCd <= 0 && danger.rem < 0.4 && rnd() < sk.shield) { const [fx, fz] = nrm(-danger.bx, -danger.bz); v.b = true; v.x = fx * 0.3; v.y = fz * 0.3; M.pulse = 0; return; }
        const [ax, az] = nrm(me.x - danger.x, me.z - danger.z); const px = -az, pz = ax; const sg = ((me.x - danger.x) * px + (me.z - danger.z) * pz) >= 0 ? 1 : -1; v.x = px * sg + ax * 0.4; v.y = pz * sg + az * 0.4; return;
      }
      // 2. muur bouwen af en toe
      if (me.wallCd <= 0 && M.cd <= 0 && rnd() < sk.wall * dt * 3) { const t = foes[0]; const [fx, fz] = nrm(t.x - me.x, t.z - me.z); v.x = fx; v.y = fz; v.b = true; M.pulse = 2; M.cd = 2; return; }
      // 3. munitie
      if (me.ammo === 0) {
        const fort = st.forts[i]; let tgt = null, bd = 1e9;
        for (const p of st.piles) if (p.on) { const dd = Math.hypot(p.x - me.x, p.z - me.z); if (dd < bd) { bd = dd; tgt = p; } }
        const fd = Math.hypot(fort.x - me.x, fort.z - me.z);
        if (fd < 7 || !tgt || bd > fd) tgt = fort; const dd = Math.hypot(tgt.x - me.x, tgt.z - me.z);
        if (dd > 1.8) { const [fx, fz] = nrm(tgt.x - me.x, tgt.z - me.z); v.x = fx; v.y = fz; } else if (tgt === fort) { /* wachten tot het fort aanvult */ } else { v.x = 0; v.y = 0; }
        if (dd < 2.2 || dd > 8) v.a = (tgt !== fort); return;
      }
      // 4. aanvallen: dichtstbijzijnde vijand (of degene met het minste leven)
      if (!M.bias) M.bias = [rnd() * 4, rnd() * 4, rnd() * 4];
      foes.sort((a, b) => (a.lives - b.lives) * 4 + Math.hypot(a.x - me.x, a.z - me.z) + M.bias[a.i] - Math.hypot(b.x - me.x, b.z - me.z) - M.bias[b.i]);
      const t = foes[0], dist = Math.hypot(t.x - me.x, t.z - me.z);
      if (!M.armed) { M.armed = true; M.err = (rnd() - 0.5) * 2 * sk.aim; M.perr = (rnd() - 0.5) * 0.12; }
      const lead = 0.25; const tx = t.x + (t.x - (M.px ?? t.x)) * lead, tz = t.z + (t.z - (M.pz ?? t.z)) * lead; M.px = t.x; M.pz = t.z;
      const [ux, uz] = nrm(tx - me.x, tz - me.z); const c = Math.cos(M.err), s2 = Math.sin(M.err); const ax = ux * c - uz * s2, az = ux * s2 + uz * c;
      const need = Math.max(0.04, Math.min(1, (Math.min(dist, 17) - 3.5) / 13.5 + M.perr + (me.power === 'giant' ? 0.12 : 0)));
      v.x = ax * 0.35; v.y = az * 0.35;
      if (me.charge < need) v.a = true; else { M.armed = false; v.a = false; M.pulse = 1; }
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

async function playOut(page, label, maxSteps = 30 * 150) {
  const res = await page.evaluate((maxSteps) => {
    const m = window.__app.mode, inst = m.instance; let calls = 0;
    const ctxFin = m.ctx.finishPvp; m.ctx.finishPvp = (r) => { calls++; return ctxFin(r); };
    let guard = 0;
    while (!m.finished && guard++ < maxSteps) window.__bot(1);
    const st = inst.dbg.state();
    return { finished: m.finished, result: m.result, T: st.T, st, calls };
  }, maxSteps);
  const r = res.result, st = res.st;
  console.log(`${label}: finished=${res.finished} T=${res.T.toFixed(1)} winner=${r ? r.winner : '-'} treffers=${st.P.map((p) => p.hits)} levens=${st.P.map((p) => p.lives)} ko=${st.koCount} worpen=${st.stat.throws} muren=${st.stat.walls} schild=${st.stat.shield} goud=${st.stat.gold} power=${st.stat.powers} storms=${st.stat.storms} yetiBonks=${st.stat.yetiBumps} calls=${res.calls}`);
  return res;
}

for (const name of scen) {
  if (name === 'intro') {
    for (const tw of (process.env.TW || 'none,giant').split(',')) {
      const { browser, page } = await open(tw, '', true); await page.waitForTimeout(600);
      await page.screenshot({ path: `/tmp/sg_intro_${tw}.png` }); console.log('shot intro', tw); await browser.close();
    }
    continue;
  }
  if (name === 'bots') {
    const tally = [0, 0, 0, 0]; const S = { aim: 0.05, dodge: 0.85, wall: 0.2, shield: 0.7 }, W = { aim: 0.45, dodge: 0.3, wall: 0.04, shield: 0.2 };
    const cfgs = [['Wes sterk', [S, W, W]], ['Jor sterk', [W, S, W]], ['Juul sterk', [W, W, S]], ['gelijk', [{ ...W, aim: 0.2, dodge: 0.55 }, { ...W, aim: 0.2, dodge: 0.55 }, { ...W, aim: 0.2, dodge: 0.55 }]], ['Wes sterk (2)', [S, W, W]], ['Jor sterk (2)', [W, S, W]], ['Juul sterk (2)', [W, W, S]], ['gelijk (2)', [{ ...W, aim: 0.15, dodge: 0.6 }, { ...W, aim: 0.15, dodge: 0.6 }, { ...W, aim: 0.15, dodge: 0.6 }]], ['Juul sterk (3)', [W, W, S]], ['Wes sterk (3)', [S, W, W]], ['Jor sterk (3)', [W, S, W]]];
    let run = 0;
    for (const [label, sk] of cfgs) {
      if (run >= 4 && tally[0] && tally[1] && tally[2]) break; run++;
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
    // eerlijkheid: drie gelijke bots, N potjes met andere ruis -> winnaars ~gelijk verdeeld, eerste KO ~gelijk verdeeld
    const N = +(process.env.N || 12), win = [0, 0, 0], firstKo = [0, 0, 0], hits = [0, 0, 0]; let Tsum = 0;
    for (let k = 0; k < N; k++) {
      const { browser, page } = await open('none', '', false, 1000 + k * 37);
      const res = await playOut(page, `sym ${k + 1}`);
      const w = res.result ? res.result.winner : null; if (w != null) win[w]++;
      res.st.P.forEach((p, i) => { hits[i] += p.hits; }); Tsum += res.T;
      await browser.close();
    }
    console.log(`SYM winnaars Wes/Jor/Juul = ${win}, treffers totaal = ${hits}, gem. duur = ${(Tsum / N).toFixed(1)} s`);
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
    const res = await playOut(page, 'idle (niemand doet iets)', 30 * 200);
    check('idle: tijd om, finishPvp 1x met winnaar', res.finished && res.calls === 1 && res.result.winner != null && res.T >= 89, JSON.stringify(res.result && [res.result.winner, res.T]));
    await browser.close();
  } else if (name === 'logic') {
    const { browser, page } = await open('none');
    const res = await page.evaluate(() => {
      const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'OK  ' : 'FOUT'} ${name}${cond ? '' : '  -> ' + info}`);
      const m = window.__app.mode, inst = m.instance, d = inst.dbg, inp = window.__app.input, v = inp.virtual;
      window.__idle = true;
      { const pl = m.ctx.players, hudN = [...document.querySelectorAll('#hud .pbox .n')].map((e) => e.textContent); ok('namen: Wes, Jor, Juul (ctx.players + HUD)', pl.map((p) => p.name).join() === 'Wes,Jor,Juul' && hudN.join() === 'Wes,Jor,Juul', JSON.stringify([pl.map((p) => p.name), hudN])); ok('kleuren: Wes groen, Jor blauw, Juul oranje', pl[0].color === 0x2f9e5b && pl[1].color === 0x3a78e0 && pl[2].color === 0xf08a2a, JSON.stringify(pl.map((p) => p.color.toString(16)))); } d.quiet();
      const step = (n, dt = 1 / 30) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
      const clr = () => { for (const i of [0, 1, 2]) { v[i].a = false; v[i].b = false; v[i].x = 0; v[i].y = 0; } };
      const S = () => d.state();
      // vrij stuk: twee punten op afstand D zonder dekking ertussen
      const clearPair = (D) => {
        const st = S(), circ = st.circles;
        for (let a = 0; a < 360; a += 10) for (let r = 0; r <= 10; r += 1) {
          const ax = Math.cos(a * Math.PI / 180) * r, az = Math.sin(a * Math.PI / 180) * r;
          for (let b = 0; b < 360; b += 15) {
            const dx = Math.cos(b * Math.PI / 180), dz = Math.sin(b * Math.PI / 180), bx = ax + dx * D, bz = az + dz * D; if (Math.hypot(bx, bz) > 10.8) continue;
            let okk = true; for (let t = -1; t <= D + 1; t += 0.5) { const px = ax + dx * t, pz = az + dz * t; for (const c of circ) if (Math.hypot(px - c.x, pz - c.z) < c.r + 1.0) okk = false; for (const f of st.forts) if (Math.hypot(px - f.x, pz - f.z) < 2.8) okk = false; if (!okk) break; }
            if (okk) return { ax, az, bx, bz, dx, dz };
          }
        }
        return null;
      };
      const setup = (D) => { const c = clearPair(D); d.place(0, c.ax, c.az); d.place(1, c.bx, c.bz); d.place(2, S().forts[2].x, S().forts[2].z + 1); d.face(0, c.dx, c.dz); d.face(1, -c.dx, -c.dz); d.ammo(0, 3); d.ammo(1, 3); return c; };
      const hold = (i, pw) => { step(16); v[i].a = true; step(Math.max(1, Math.round(pw * 0.85 * 30))); v[i].a = false; step(1); };
      step(3);
      // 1. maken
      d.place(0, 0, 8); d.ammo(0, 0); v[0].a = true; step(12); let st = S(); ok('maken: nog niet klaar na 0.4s', st.P[0].ammo === 0 && st.P[0].make > 0.4, JSON.stringify([st.P[0].ammo, st.P[0].make])); step(14); v[0].a = false; st = S(); ok('maken: na ~0.7s een sneeuwbal', st.P[0].ammo >= 1, 'ammo=' + st.P[0].ammo); clr(); step(1);
      // 2. gooien + treffer (boogworp op afstand 8)
      let c = setup(8); const pw = (8 - 3.5) / 13.5; const l1 = S().P[1].lives; hold(0, pw); step(50); st = S();
      ok('boogworp raakt: Jor -1 leven, Wes +1 treffer', st.P[1].lives === l1 - 1 && st.P[0].hits === 1, JSON.stringify([st.P[1].lives, st.P[0].hits, st.P[1].x, st.P[1].z]));
      ok('geraakt = verdoofd (stun > 1.2)', st.P[1].stun > 1.2 || st.P[1].inv > 1, JSON.stringify([st.P[1].stun, st.P[1].inv]));
      step(30 * 4);
      // 3. muur blokkeert vlakke worp
      c = setup(4.6); d.buildWall(1); st = S(); ok('muur gebouwd', st.walls.length === 1, JSON.stringify(st.walls)); const l2 = S().P[1].lives; hold(0, 0.0); step(40); st = S();
      ok('muur vangt vlakke worp op: Jor ongedeerd, muur hp 2', st.P[1].lives === l2 && st.walls.length === 1 && st.walls[0].hp === 2, JSON.stringify([st.P[1].lives, st.walls]));
      step(30 * 12);
      // 4. schild blokkeert
      c = setup(5); d.face(1, -c.dx, -c.dz); const l3 = S().P[1].lives; v[1].b = true; step(10); st = S(); ok('schild gaat omhoog bij B ingedrukt', st.P[1].shield, JSON.stringify([st.P[1].shield, st.P[1].shieldHp])); hold(0, 0.03); v[1].b = true; step(30); v[1].b = false; st = S();
      ok('schild blokkeert (geen leven kwijt, hp -1)', st.P[1].lives === l3 && st.stat.shield >= 1, JSON.stringify([st.P[1].lives, st.stat]));
      v[1].b = false; step(30 * 4);
      // 5. gouden bal = dubbele schade, ijsbal bevriest, reuzenbal
      c = setup(8); d.face(1, -c.dx, -c.dz); const l4 = S().P[1].lives; d.give(0, 'gold'); hold(0, pw); step(50); st = S(); ok('gouden bal: 2 levens kwijt', st.P[1].lives === Math.max(0, l4 - 2), JSON.stringify([l4, st.P[1].lives]));
      step(30 * 5);
      // 6. KO -> ijsblok, 1 levend -> einde
      c = setup(8); d.hurt(1, 9, 0); st = S(); ok('KO: Jor is uit (ijsblok)', !st.P[1].alive && st.koCount === 1, JSON.stringify([st.P[1].alive, st.koCount])); step(5);
      ok('na 1 KO nog niet afgelopen', !S().over); step(40);
      // 7. ijsbal: bevroren (op Juul)
      d.place(0, c.ax, c.az); d.place(2, c.ax + c.dx * 6, c.az + c.dz * 6); d.face(0, c.dx, c.dz); d.ammo(0, 2); d.give(0, 'ice'); const l7 = S().P[2].lives; hold(0, (6 - 3.5) / 13.5); step(50); st = S();
      ok('ijsbal: Juul bevroren (frozen > 1.5)', st.P[2].lives === l7 - 1 && st.P[2].frozen > 1.5, JSON.stringify([st.P[2].lives, st.P[2].frozen]));
      // 8. eind: Juul KO -> Wes wint, finishPvp 1x
      step(30 * 7); d.hurt(2, 9, 0); step(3); st = S(); ok('laatste KO: spel afgelopen, winnaar Wes (slot 0)', st.over && st.winner === 0, JSON.stringify([st.over, st.winner]));
      let g = 0; while (!m.finished && g++ < 30 * 6) step(1); ok('finishPvp aangeroepen (winner 0, scores = treffers)', m.finished && m.result.winner === 0 && m.result.scoreArr.length === 3, JSON.stringify(m.result && [m.result.winner, m.result.scoreArr]));
      return out;
    });
    console.log(res.join('\n')); res.forEach((l) => { if (l.startsWith('FOUT')) fails++; });
    await browser.close();
    {   // tweede deel: gimmicks (nieuw potje)
      const { browser: b2, page: p2 } = await open('none');
      const r2 = await p2.evaluate(() => {
        const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'OK  ' : 'FOUT'} ${name}${cond ? '' : '  -> ' + info}`);
        const m = window.__app.mode, inst = m.instance, d = inst.dbg, inp = window.__app.input, v = inp.virtual; window.__idle = true; d.quiet();
        const step = (n, dt = 1 / 30) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
        const clr = () => { for (const i of [0, 1, 2]) { v[i].a = false; v[i].b = false; v[i].x = 0; v[i].y = 0; } };
        const S = () => d.state(); step(3);
        // comeback: laatste krijgt gouden bal
        d.hurt(2, 2, 0); d.hurt(1, 1, 0); step(2); d.setNext(0); d.setT(26); step(3); let st = S();
        ok('comeback: laatste (Juul, 1 leven) krijgt gouden bal', st.P[2].power === 'gold' && !st.P[0].power, JSON.stringify(st.P.map((p) => [p.lives, p.power])));
        // storm
        d.startStorm(); step(30 * 3); st = S(); ok('sneeuwstorm start (active, k > 0.5)', st.storm.active && st.storm.k > 0.5, JSON.stringify(st.storm));
        step(30 * 9); st = S(); ok('sneeuwstorm stopt weer', !st.storm.active, JSON.stringify(st.storm));
        // yeti stompt een speler
        d.place(0, 6, 3); d.yetiAt(6.2, 3.2, 'charge', 0); step(5); st = S(); ok('yeti: bonk -> Wes verdoofd (stun > 0)', st.P[0].stun > 0.5 && st.stat.yetiBumps >= 1, JSON.stringify([st.P[0].stun, st.stat.yetiBumps]));
        // Deurman-sneeuwpop geeft een power-up
        const np = S().pick.length; d.deurmanHit(0); st = S(); ok('Deurman-sneeuwpop: raak -> power-up verschijnt', st.pick.length > np, JSON.stringify(st.pick));
        // power-up oppakken (scooter)
        const pk = st.pick[0]; d.place(1, pk.x, pk.z); step(3); st = S(); ok('power-up pakt de speler op', st.P[1].power != null || st.P[1].scooter > 0, JSON.stringify([st.P[1].power, st.P[1].scooter, st.pick]));
        // Deurman-twist: bewoog = -1 leven
        const lv = S().P[0].lives; inst.onDeurman([true, false, false]); st = S(); ok('onDeurman: beweger -1 leven (nooit tot 0)', st.P[0].lives === Math.max(1, lv - 1), JSON.stringify([lv, st.P[0].lives]));
        // fort vult munitie aan
        const f0 = S().forts[0]; d.place(0, f0.x + f0.dx * 1, f0.z + f0.dz * 1); d.ammo(0, 0); step(30 * 4); st = S(); ok('eigen fort vult munitie aan (>= 2 in 4 s)', st.P[0].ammo >= 2, 'ammo=' + st.P[0].ammo);
        // stapel op de grond
        const pl = S().piles[0]; d.place(1, pl.x, pl.z); d.ammo(1, 0); step(3); st = S(); ok('sneeuwstapel geeft 2 ballen en verdwijnt', st.P[1].ammo === 2 && !st.piles[0].on, JSON.stringify([st.P[1].ammo, st.piles[0].on]));
        // tijdslimiet: meeste treffers wint
        d.setT(89.9); step(10); st = S(); ok('tijdslimiet: afgelopen', st.over);
        let g = 0; while (!m.finished && g++ < 30 * 6) step(1); ok('tijdslimiet: finishPvp 1x met winnaar', m.finished && m.result.winner != null, JSON.stringify(m.result && [m.result.winner, m.result.scoreArr]));
        return out;
      });
      console.log(r2.join('\n')); r2.forEach((l) => { if (l.startsWith('FOUT')) fails++; }); await b2.close();
    }
  } else if (name === 'shots') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/sg_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    const step = (n) => page.evaluate((n) => { for (let k = 0; k < n; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }, n);
    await page.evaluate(() => { window.__idle = true; }); await step(3); await shot('start');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'gold'); d.give(1, 'ice'); d.give(2, 'giant'); d.spawnPickup('ice', -2, 1); d.spawnPickup('scooter', 3, 1.5); d.spawnPickup('giant', 0.5, 5); d.place(0, -6.5, 2); d.place(1, 6.5, 2); d.face(0, 1, 0.3); d.face(1, -1, 0.3); d.face(2, 0, 1); d.throwBall(0, 0.75); d.throwBall(1, 0.55); d.throwBall(2, 0.35); });
    await step(10); await shot('balls');
    console.log('render-info', JSON.stringify(await page.evaluate(() => { const i = window.__app.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries }; })));
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg, v = window.__app.input.virtual; d.ammo(0, 3); d.ammo(2, 3); d.buildWall(0); d.buildWall(1); v[1].b = true; v[2].a = true; v[2].x = 0.3; v[2].y = 0.2; });
    await step(14); await shot('actions');
    await page.evaluate(() => { const v = window.__app.input.virtual; v[1].b = false; v[2].a = false; v[2].x = 0; v[2].y = 0; const d = window.__app.mode.instance.dbg; d.yetiAt(-4, -3, 'wander'); d.hurt(1, 1, 0, { freeze: true }); d.hurt(0, 1, 2); });
    await step(40); await shot('yeti_calm');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startStorm(); });
    await step(30 * 3); await shot('storm');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setT(11); d.yetiAt(-3, -1, 'charge', 2); d.place(2, -1, 1); });
    await step(30 * 2); await shot('yeti');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.hurt(2, 9, 0); }); await step(25); await shot('ko');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.hurt(1, 9, 0); }); await step(100); await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/sg_result.png' }); console.log('shot result');
    await browser.close();
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO ERRORS');
console.log(fails ? `${fails} FOUTEN` : 'ALLES OK');
server.close();
