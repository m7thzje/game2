// Gebruik: node tools/test_dodgeball.mjs [scenario...]
//   bots      : volledige potjes met bots (versneld, zonder renderen): sterk-vs-zwak, zwak-vs-sterk, gelijk; toont dat beide kunnen winnen en finishPvp komt
//   twists    : één potje per twist (alle twists van het spel) -> finishPvp altijd aangeroepen, geen fouten
//   idle      : niemand doet iets -> tijd om / sudden death / eindigt toch
//   shots     : screenshots van aanvoer, laden, pompoen, bom, gouden bal, sudden death, einde (/tmp/db_*.png)
// Omgeving: TWIST=<id> om de twist in 'bots'/'shots' te forceren. Q=high voor schaduwen.
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
const ALL_TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
const errors = [];

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${twist}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${twist}] [pageerror] ` + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=dodgeball&quality=${process.env.Q || 'low'}&twist=${twist}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  // bots installeren
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [{ tgt: 0.5, hold: false, cd: 0 }, { tgt: 0.5, hold: false, cd: 0 }];
    window.__skill = [{ dodge: 0.6, catch: 0.5, aim: 0.15, react: 0.3 }, { dodge: 0.6, catch: 0.5, aim: 0.15, react: 0.3 }];
    window.__mode = 'bots';
    const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
    function bot(i, st, dt) {
      const me = st.p[i], op = st.p[1 - i], v = inp.virtual[i], b = B[i], sk = window.__skill[i];
      v.a = false; v.b = false; v.x = 0; v.y = 0;
      if (window.__mode === 'idle' || st.over) return;
      b.cd -= dt;
      // dreiging?
      let tmin = 9, thr = null;
      for (const ba of st.balls) {
        if (!ba.live || ba.state !== 'air' || ba.owner === i) continue;
        const dx = me.x - ba.x, dz = me.z - ba.z, d = Math.hypot(dx, dz), sp = Math.hypot(ba.vx, ba.vz);
        if (sp < 2.5 || d < 0.01) continue;
        const dot = (dx * ba.vx + dz * ba.vz) / (d * sp); if (dot < 0.5) continue;
        const t = d / sp, miss = Math.abs(dx * ba.vz - dz * ba.vx) / sp;
        if (miss < 2.6 * me.sz && t < tmin) { tmin = t; thr = ba; }
      }
      if (thr) {
        if (me.ball == null && me.catchCd <= 0 && tmin < 0.3 && tmin > 0.03 && rnd() < sk.catch * 0.5) { v.a = true; return; }
        if (me.rollCd <= 0 && tmin < 0.55 && rnd() < sk.dodge) { v.b = true; const [px, pz] = norm(-(thr.vz), thr.vx); const sg = rnd() < 0.5 ? 1 : -1; v.x = px * sg; v.y = pz * sg; return; }
        if (tmin < 1.0) { const [px, pz] = norm(-(thr.vz), thr.vx); const sg = (me.x - thr.x) * px + (me.z - thr.z) * pz > 0 ? 1 : -1; v.x = px * sg; v.y = pz * sg; return; }
      }
      // bom in de buurt en bijna af? wegwezen
      for (const ba of st.balls) if (ba.type === 'bomb' && ba.state !== 'held' && ba.fuse < 1.6 && Math.hypot(ba.x - me.x, ba.z - me.z) < 4.2) { const [ax, az] = norm(me.x - ba.x, me.z - ba.z); v.x = ax; v.y = az; return; }
      if (me.ball) {
        const [dx, dz] = norm(op.x - me.x, op.z - me.z), dist = Math.hypot(op.x - me.x, op.z - me.z);
        v.x = dx; v.y = dz;
        if (!me.charging) {
          if (!b.armed) { b.armed = true; const pump = me.ball === 'pumpkin'; b.tgt = clamp01(pump ? (dist - 3) / 10 : (dist - 4.5) / 22.5 + (rnd() - 0.5) * sk.aim * 2); b.wait = rnd() * 0.5 * (1 - sk.react); }
          if (b.wait > 0) b.wait -= dt; else v.a = true;
        } else if (me.charge < b.tgt) v.a = true;
        else { v.a = false; b.armed = false; }
        return;
      }
      b.armed = false;
      // bal zoeken
      let best = null, bd = 1e9;
      for (const ba of st.balls) {
        const ok = ba.state === 'rest' || (ba.state === 'air' && !ba.live && ba.y < ba.r + 0.8);
        if (!ok) continue; if (ba.type === 'bomb' && ba.fuse < 1.3) continue;
        const own = i === 0 ? ba.x < 1.2 : ba.x > -1.2; if (!own) continue;
        const d = Math.hypot(ba.x - me.x, ba.z - me.z); if (d < bd) { bd = d; best = ba; }
      }
      if (best) { const tx = i === 0 ? Math.min(best.x, -0.8) : Math.max(best.x, 0.8); const [dx, dz] = norm(tx - me.x, best.z - me.z); v.x = dx; v.y = dz; }
      else { const [dx, dz] = norm((i ? 7 : -7) - me.x, -me.z + Math.sin(st.T * 0.7 + i) * 3); v.x = dx * 0.5; v.y = dz * 0.5; }
    }
    const clamp01 = (x) => Math.max(0, Math.min(1, x));
    window.__bot = (n, stop) => {
      const dt = 1 / 30;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        bot(0, st, dt); bot(1, st, dt);
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page };
}

async function playOut(page, label) {
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; let guard = 0; const log = []; let last = '';
    while (!m.finished && guard++ < 30 * 400) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.hearts.join('/') + (st.sd ? 'S' : '') + (st.deathmatch ? 'D' : '');
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} hearts=${st.hearts} sd=${st.sd}`); last = key; }
    }
    const st = inst.dbg.state();
    return { finished: m.finished, result: m.result, T: st.T, stat: st.stat, hearts: st.hearts, log };
  });
  const r = res.result;
  console.log(`${label}: finished=${res.finished} T=${res.T.toFixed(1)} winner=${r ? r.winner : '-'} score=${r ? r.scoreArr : '-'} hits=${res.stat.hits} catches=${res.stat.catches} dodges=${res.stat.dodges} gold=${res.stat.goldHits} bombs=${res.stat.bombs} pump=${res.stat.pump}`);
  return res;
}

for (const name of scen) {
  if (name === 'bots') {
    const twist = process.env.TWIST || 'none';
    const tally = [0, 0, 0];
    const cfgs = [['sterk(0) vs zwak(1)', [{ dodge: 0.9, catch: 0.9, aim: 0.05, react: 0.9 }, { dodge: 0.3, catch: 0.1, aim: 0.3, react: 0.2 }]],
      ['zwak(0) vs sterk(1)', [{ dodge: 0.3, catch: 0.1, aim: 0.3, react: 0.2 }, { dodge: 0.9, catch: 0.9, aim: 0.05, react: 0.9 }]],
      ['gelijk', [{ dodge: 0.6, catch: 0.5, aim: 0.15, react: 0.5 }, { dodge: 0.6, catch: 0.5, aim: 0.15, react: 0.5 }]],
      ['gelijk (2)', [{ dodge: 0.5, catch: 0.3, aim: 0.2, react: 0.5 }, { dodge: 0.5, catch: 0.3, aim: 0.2, react: 0.5 }]]];
    for (const [label, sk] of cfgs) {
      const { browser, page } = await open(twist);
      await page.evaluate((s) => { window.__skill = s; }, sk);
      const res = await playOut(page, `[${twist}] ${label}`);
      const w = res.result ? res.result.winner : null; tally[w == null ? 2 : w]++;
      await browser.close();
    }
    console.log(`winnaars: Wes ${tally[0]}, Jor ${tally[1]}, gelijk ${tally[2]}`);
  } else if (name === 'twists') {
    for (const tw of ALL_TWISTS) {
      const { browser, page } = await open(tw);
      await playOut(page, `twist ${tw}`);
      await browser.close();
    }
  } else if (name === 'idle') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    await page.evaluate(() => { window.__mode = 'idle'; });
    await playOut(page, 'idle (niemand beweegt)');
    await browser.close();
  } else if (name === 'logic') {
    // deterministische mini-tests van de gimmicks
    const { browser, page } = await open('none');
    const res = await page.evaluate(() => {
      const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
      const m = window.__app.mode, inst = m.instance, d = inst.dbg, inp = window.__app.input, v = inp.virtual;
      const step = (n, dt = 1 / 60) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
      const clear = () => { for (const i of [0, 1]) { v[i].a = false; v[i].b = false; v[i].x = 0; v[i].y = 0; } };
      const reset = () => { clear(); for (const b of d.balls) { if (b.state !== 'off') { if (b.holder) { b.holder.ball = null; b.holder.charging = false; } b.state = 'off'; b.v.group.visible = false; b.blob.visible = false; b.armed = false; b.live = false; } } for (const p of d.pl) { p.x = p.i ? 8 : -8; p.z = 0; p.vx = p.vz = 0; p.inv = 0; p.stun = 0; p.hearts = 3; p.shield = 0; p.rageOn = false; p.roll = 0; p.rollCd = 0; p.catchT = 0; p.catchCd = 0; p.ball = null; p.charging = false; } window.__mode = 'idle'; };
      // 1. vangen
      reset(); d.giveBall(0, 'fire'); v[0].a = true; step(35); v[0].a = false;
      let caught = false; for (let k = 0; k < 140 && !caught; k++) { const st = d.state(); const b = st.balls.find((q) => q.live && q.state === 'air'); v[1].a = false; if (b) { const me = st.p[1]; const dist = Math.hypot(me.x - b.x, me.z - b.z), sp = Math.hypot(b.vx, b.vz); if (dist / sp < 0.2) v[1].a = true; } step(1); caught = d.state().stat.catches[1] > 0; }
      let st = d.state(); ok('vangen: Jor vangt', caught, JSON.stringify(st.stat)); ok('vangen: Wes verliest hartje', st.hearts[0] === 2, 'hearts=' + st.hearts); ok('vangen: Jor heeft de bal', st.p[1].ball === 'fire');
      // 2. raak (geen vangst): hartje eraf + onkwetsbaarheid
      reset(); d.giveBall(0, 'fire'); v[0].a = true; step(35); v[0].a = false; for (let k = 0; k < 150; k++) step(1); st = d.state();
      ok('raak: Jor gewond of bal gemist', st.hearts[1] <= 3, 'hearts=' + st.hearts + ' hits=' + st.stat.hits);
      // directe schade test: bal vlak voor Jor
      reset(); d.giveBall(0, 'fire'); d.pl[1].x = 3; v[0].a = true; step(12); v[0].a = false; step(90); st = d.state(); ok('raak dichtbij: Jor -1', st.hearts[1] === 2, 'hearts=' + st.hearts);
      // 3. duiken geeft onkwetsbaarheid
      reset(); d.giveBall(0, 'fire'); d.pl[1].x = 3; v[0].a = true; step(12); v[0].a = false; let rolled = false; for (let k = 0; k < 90; k++) { const s2 = d.state(); const b = s2.balls.find((q) => q.live && q.state === 'air'); v[1].b = false; if (b && !rolled) { const dist = Math.hypot(s2.p[1].x - b.x, s2.p[1].z - b.z), sp = Math.hypot(b.vx, b.vz); if (dist / sp < 0.25) { v[1].b = true; v[1].x = -1; rolled = true; } } step(1); } clear(); st = d.state();
      ok('duiken: Jor ontwijkt', st.hearts[1] === 3 && st.stat.dodges[1] >= 1, 'hearts=' + st.hearts + ' dodges=' + st.stat.dodges);
      // 4. gouden bal: raak = 2 hartjes
      reset(); d.giveBall(0, 'gold'); d.pl[1].x = 3; v[0].a = true; step(12); v[0].a = false; step(90); st = d.state(); ok('goud: dubbele schade', st.hearts[1] === 1, 'hearts=' + st.hearts);
      // gouden bal mist -> keert terug
      reset(); d.giveBall(0, 'gold'); d.pl[1].z = -8; d.pl[1].x = 12; v[0].a = true; step(20); v[0].a = false; let ret = false; for (let k = 0; k < 120; k++) { step(1); const b = d.balls.find((q) => q.type === 'gold'); if (b.returning) { ret = true; break; } } ok('goud: stuitert terug', ret);
      // 5. bom: ontploft na 3 s
      reset(); d.dropAt('bomb', -3, 3); d.pl[0].x = -8; step(60 * 1.3); let b = d.balls.find((q) => q.type === 'bomb'); const f0 = b.fuse; step(60 * 3.0); b = d.balls.find((q) => q.type === 'bomb'); ok('bom: ontploft', b.state === 'off', `fuse@1.3s=${f0.toFixed(2)}`);
      reset(); d.dropAt('bomb', -5, 0); step(60 * 1.3); d.pl[0].x = -5.5; step(60 * 3); st = d.state(); ok('bom: schade in straal', st.hearts[0] === 2, 'hearts=' + st.hearts);
      // 6. pompoen valt en raakt
      reset(); d.dropAt('pumpkin', -8, 0.5); step(60 * 1.4); st = d.state(); ok('pompoen: raakt speler', st.hearts[0] === 2, 'hearts=' + st.hearts);
      // 7. comeback
      reset(); d.hurt(0, 1); step(120); d.hurt(0, 1); st = d.state(); ok('comeback: schild + woede bij 1 hartje', st.hearts[0] === 1 && st.shield[0] > 0 && st.rage[0], JSON.stringify([st.hearts[0], st.shield[0], st.rage[0]]));
      // schild absorbeert
      d.hurt(0, 1); st = d.state(); ok('schild absorbeert treffer', st.hearts[0] === 1 && st.shield[0] === 0);
      // 8. Deurman
      reset(); inst.onDeurman([true, false]); st = d.state(); ok('deurman: beweger verliest hartje', st.hearts[0] === 2 && st.hearts[1] === 3);
      return out;
    });
    console.log(res.join('\n'));
    await browser.close();
    {
      const { browser: b2, page: p2 } = await open('none');
      const r2 = await p2.evaluate(() => {
        const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
        const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input;
        const step = (n, dt = 1 / 60) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
        window.__mode = 'idle'; d.setT(79.9); step(30); let st = d.state(); ok('sudden death start', st.sd);
        step(60 * 16); st = d.state(); ok('arena krimpt', st.ext.x < 9.5 && st.ext.z < 6.2, JSON.stringify(st.ext));
        return out;
      });
      console.log(r2.join('\n')); await b2.close();
      const { browser: b3, page: p3 } = await open('none');
      const r3 = await p3.evaluate(() => {
        const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
        const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input;
        const step = (n, dt = 1 / 60) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
        window.__mode = 'idle'; const before = m.finished; d.hurt(1, 9); step(5);
        ok('KO: finishPvp aangeroepen', m.finished && !before && m.result.winner === 0, JSON.stringify(m.result && [m.result.winner, m.result.scoreArr]));
        return out;
      });
      console.log(r3.join('\n')); await b3.close();
    }
  } else if (name === 'twshots') {
    for (const tw of (process.env.TW || 'giant,lowgrav,slippery').split(',')) {
      const { browser, page } = await open(tw);
      await page.evaluate(() => window.__bot(30 * 7));
      await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900);
      await page.screenshot({ path: `/tmp/db_tw_${tw}.png` }); console.log('shot', tw);
      await browser.close();
    }
  } else if (name === 'shots2') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    const step = (n) => page.evaluate((n) => { for (let k = 0; k < n; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }, n);
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/db_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => { window.__mode = 'idle'; const d = window.__app.mode.instance.dbg; for (const b of d.balls) if (b.type === 'fire') b.state = 'rest'; });
    // vangst: Wes gooit naar Jor, Jor drukt A op het juiste moment
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveBall(0, 'fire'); const v = window.__app.input.virtual; v[0].x = 1; v[0].a = true; });
    await step(18);
    await page.evaluate(() => { const v = window.__app.input.virtual; v[0].a = false; v[0].x = 0; });
    // wacht tot de bal dichtbij Jor is en vang
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg, inp = window.__app.input; const v = inp.virtual; for (let k = 0; k < 90; k++) { inp.update(); window.__app.mode.update(1 / 60); const st = d.state(); const b = st.balls.find((q) => q.live && q.state === 'air'); v[1].a = false; if (b) { const me = st.p[1]; const dist = Math.hypot(me.x - b.x, me.z - b.z), sp = Math.hypot(b.vx, b.vz); if (dist / sp < 0.2) v[1].a = true; } if (st.stat.catches[1]) break; } });
    await step(3); await shot('catch');
    // gouden bal
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; const v = window.__app.input.virtual; v[1].a = false; d.giveBall(1, 'gold'); v[1].x = -1; v[1].y = 0.2; v[1].a = true; });
    await step(14);
    await page.evaluate(() => { const v = window.__app.input.virtual; v[1].a = false; v[1].x = 0; v[1].y = 0; });
    await step(30); await shot('gold1'); await step(22); await shot('gold2');
    // bom ontploft
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.dropAt('bomb', -3, 2); });
    await step(30 * 2 + 20); await shot('bomb1'); await step(30 * 2); await shot('bomb2');
    // KO
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.hurt(1, 9); });
    await step(14); await shot('ko');
    await step(30); await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/db_koresult.png' });
    await browser.close();
  } else if (name === 'shots') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/db_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    // 1. begin
    await page.evaluate(() => window.__bot(20)); await shot('start');
    // 2. Wes laadt op, Jor heeft een bal
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveBall(0, 'fire'); d.giveBall(1, 'gold'); window.__mode = 'idle'; const v = window.__app.input.virtual; v[0].a = true; v[0].x = 1; v[1].a = true; v[1].x = 0; v[1].y = 1; window.__app.input.update(); });
    await page.evaluate(() => { for (let k = 0; k < 14; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }); await shot('charge');
    // 3. gooien + pompoen en bom laten vallen
    await page.evaluate(() => { const v = window.__app.input.virtual; v[0].a = false; v[1].a = false; v[0].x = v[1].x = 0; const d = window.__app.mode.instance.dbg; d.dropAt('pumpkin', -6, 2); d.dropAt('bomb', 0.5, -3); for (let k = 0; k < 18; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }); await shot('flight');
    await page.evaluate(() => { for (let k = 0; k < 24; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }); await shot('pumpkin');
    await page.evaluate(() => { for (let k = 0; k < 40; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }); await shot('after');
    // 4. sudden death
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setT(81); d.meteor(-5, 2); for (let k = 0; k < 30 * 8; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } d.meteor(5, -2); for (let k = 0; k < 18; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }); await shot('suddendeath');
    // 5. einde (KO)
    await page.evaluate(() => { window.__mode = 'bots'; const d = window.__app.mode.instance.dbg; d.hurt(1, 1); for (let k = 0; k < 40; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }); await shot('hurt');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.state().hearts; window.__app.mode.paused = false; d.hurt(1, 5); for (let k = 0; k < 20; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }); await shot('ko');
    await page.evaluate(() => { for (let k = 0; k < 40; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }); await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/db_result.png' });
    await browser.close();
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO ERRORS');
server.close();
