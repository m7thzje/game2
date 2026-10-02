// Gebruik: node tools/test_cakefight.mjs [scenario...]
//   bots   : volledige potjes met bots (sterk-vs-zwak, zwak-vs-sterk, gelijk) -> beide kunnen winnen, finishPvp komt altijd
//   twists : één potje per twist
//   idle   : niemand doet iets (-> gelijkspel -> gouden taart -> eindigt)
//   logic  : deterministische mini-tests van de mechanics (pakken, gooien, dienblad, Bram, plassen, gouden taart...)
//   shots / shots2 : screenshots (/tmp/cf_*.png)
// Omgeving: TWIST=<id>, Q=high (schaduwen)
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
  await page.goto(`http://localhost:${port}/?game=cakefight&quality=${process.env.Q || 'low'}&twist=${twist}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 90000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [{ stuck: 0, lx: 0, lz: 0, wander: 0, wx: 0, wz: 0 }, { stuck: 0, lx: 0, lz: 0, wander: 0, wx: 0, wz: 0 }];
    window.__skill = [{ aim: 0.5, tray: 0.5, dodge: 0.5 }, { aim: 0.5, tray: 0.5, dodge: 0.5 }];
    window.__mode = 'bots';
    const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
    function bot(i, st, dt) {
      const me = st.p[i], op = st.p[1 - i], v = inp.virtual[i], b = B[i], sk = window.__skill[i];
      v.a = false; v.b = false; v.x = 0; v.y = 0;
      if (window.__mode === 'idle' || st.over || me.stun > 0 || me.air) return;
      // Bram-baan ontwijken
      if (st.bram.state === 'warn' || st.bram.state === 'run') { const dz = me.z - st.bram.z; if (Math.abs(dz) < 3.4) { v.y = dz >= 0 ? 1 : -1; if (Math.abs(me.z) > 8.6) v.y = -v.y; return; } }
      // vastgelopen?
      b.stuck += Math.hypot(me.x - b.lx, me.z - b.lz) < 0.02 ? dt : -b.stuck; b.lx = me.x; b.lz = me.z;
      if (b.stuck > 0.5) { b.wander = 0.6; b.wx = rnd() * 2 - 1; b.wz = rnd() * 2 - 1; b.stuck = 0; }
      if (b.wander > 0) { b.wander -= dt; v.x = b.wx; v.y = b.wz; return; }
      // dreigende taart? dienblad omhoog
      for (const ck of st.cakes) {
        if (ck.owner === i) continue; const t = ck.T - ck.t;
        const d = Math.hypot(ck.x - me.x, ck.z - me.z);
        if (t < 0.5 && d < 5 && rnd() < sk.tray * 0.25) { v.b = true; const [fx, fz] = norm(ck.x - me.x, ck.z - me.z); v.x = fx * 0.01; v.y = fz * 0.01; return; }
        if (t < 0.7 && d < 4.5 && rnd() < sk.dodge * 0.05) { const [fx, fz] = norm(-(ck.z - me.z), ck.x - me.x); v.x = fx; v.y = fz; return; }
      }
      if (me.cake) {
        const dx = op.x - me.x, dz = op.z - me.z, dist = Math.hypot(dx, dz);
        const [nx, nz] = norm(dx, dz); v.x = nx; v.y = nz;
        const range = { cream: 12, pudding: 10, bride: 9, confetti: 11, gold: 13 }[me.cake] + 2;
        const aligned = (Math.sin(me.face) * nx + Math.cos(me.face) * nz) > 0.9 - sk.aim * 0.1;
        if (dist < range && aligned && rnd() < 0.5) v.a = true;
        if (dist < 5) { v.x = -nx * 0.3 + (rnd() - 0.5); v.y = -nz * 0.3 + (rnd() - 0.5); }
        return;
      }
      // station zoeken
      let best = null, bd = 1e9; for (const s of st.stations) { if (s.kind === 'cart') continue; const d = Math.hypot(s.cx - me.x, s.cz - me.z) + s.cd * 3; if (d < bd) { bd = d; best = s; } }
      const d = Math.hypot(best.cx - me.x, best.cz - me.z); const [nx, nz] = norm(best.cx - me.x, best.cz - me.z); v.x = nx; v.y = nz;
      if (d < (best.kind === 'cart' ? 2.55 : 1.9)) { v.x = 0; v.y = 0; v.a = true; }
    }
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
    const m = window.__app.mode, inst = m.instance; let guard = 0;
    while (!m.finished && guard++ < 30 * 300) window.__bot(1);
    const st = inst.dbg.state();
    return { finished: m.finished, result: m.result, T: st.T, stat: st.stat, score: st.score, sd: st.sdMode };
  });
  const r = res.result;
  console.log(`${label}: finished=${res.finished} T=${res.T.toFixed(1)} sd=${res.sd} winner=${r ? r.winner : '-'} score=${r ? r.scoreArr : '-'} throws=${res.stat.throws} hits=${res.stat.hits} blocks=${res.stat.blocks} bram=${res.stat.bram} self=${res.stat.self} types=${JSON.stringify(res.stat.perType)}`);
  return res;
}

for (const name of scen) {
  if (name === 'bots') {
    const twist = process.env.TWIST || 'none';
    const tally = [0, 0, 0];
    const cfgs = [['sterk(0) vs zwak(1)', [{ aim: 0.9, tray: 0.9, dodge: 0.9 }, { aim: 0.1, tray: 0.1, dodge: 0.1 }]],
      ['zwak(0) vs sterk(1)', [{ aim: 0.1, tray: 0.1, dodge: 0.1 }, { aim: 0.9, tray: 0.9, dodge: 0.9 }]],
      ['gelijk', [{ aim: 0.5, tray: 0.5, dodge: 0.5 }, { aim: 0.5, tray: 0.5, dodge: 0.5 }]],
      ['gelijk (2)', [{ aim: 0.4, tray: 0.2, dodge: 0.4 }, { aim: 0.4, tray: 0.2, dodge: 0.4 }]]];
    for (const [label, sk] of cfgs) {
      const { browser, page } = await open(twist);
      await page.evaluate((s) => { window.__skill = s; }, sk);
      const res = await playOut(page, `[${twist}] ${label}`);
      const w = res.result ? res.result.winner : null; tally[w == null ? 2 : w]++;
      await browser.close();
    }
    console.log(`winnaars: Wes ${tally[0]}, Jor ${tally[1]}, gelijk ${tally[2]}`);
  } else if (name === 'twists') {
    for (const tw of (process.env.TW ? process.env.TW.split(',') : ALL_TWISTS)) {
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
    const { browser, page } = await open('none');
    const res = await page.evaluate(() => {
      const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
      const m = window.__app.mode, inst = m.instance, d = inst.dbg, inp = window.__app.input, v = inp.virtual;
      const step = (n, dt = 1 / 60) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
      const clear = () => { for (const i of [0, 1]) { v[i].a = false; v[i].b = false; v[i].x = 0; v[i].y = 0; } };
      const press = (i, key = 'a') => { v[i][key] = true; step(2); v[i][key] = false; };
      const reset = () => { clear(); window.__mode = 'idle'; for (const p of d.pl) { if (p.cake) { p.cake.obj.busy = false; p.cake.obj.group.visible = false; p.cake = null; } p.x = p.i ? 8 : -8; p.z = 0; p.vx = p.vz = 0; p.stun = 0; p.inv = 0; p.sh = false; p.shT = 0; p.shCd = 0; p.trayBroken = 0; p.air = false; p.y = 0; p.score = 0; p.face = p.i ? -Math.PI / 2 : Math.PI / 2; p.splats.clear(); p.throwCd = 0; } for (const s of d.stations) s.cd = 0; step(1); };
      // 1. pakken bij station
      reset(); d.pl[0].x = d.stations[0].cx + 0.5; d.pl[0].z = d.stations[0].cz; press(0); step(2); let st = d.state(); ok('pakken bij station', !!st.p[0].cake, st.p[0].cake);
      reset(); press(0); st = d.state(); ok('niet pakken zonder station', !st.p[0].cake);
      // 2. gooien en raken
      reset(); d.give(0, 'cream'); d.pl[1].x = 3; press(0); step(60); st = d.state(); ok('slagroomtaart raakt: +1', st.score[0] === 1 && st.p[1].stun > 0 || st.score[0] === 1, JSON.stringify([st.score, st.p[1].stun]));
      ok('slagroomkop zichtbaar', d.pl[1].splats.n > 0);
      // 3. dienblad blokkeert
      reset(); d.give(0, 'cream'); d.pl[1].x = 3; d.pl[1].face = -Math.PI / 2; v[1].b = true; step(4); press(0); step(40); clear(); st = d.state(); ok('dienblad blokkeert', st.score[0] === 0 && st.stat.blocks[1] >= 1, JSON.stringify([st.score, st.stat.blocks]));
      // 4. dienblad van achter helpt niet
      reset(); d.give(0, 'cream'); d.pl[1].x = 3; d.pl[1].face = Math.PI / 2; v[1].b = true; step(4); press(0); step(50); clear(); st = d.state(); ok('dienblad van achteren helpt niet', st.score[0] === 1, JSON.stringify(st.score));
      // 5. bruidstaart 3 punten, traag, grote plas
      reset(); d.give(0, 'bride'); d.pl[1].x = 4; d.pl[1].z = 0; press(0); step(120); st = d.state(); ok('bruidstaart: +3', st.score[0] === 3, JSON.stringify(st.score));
      // 6. confetti: ontploft later, +2
      reset(); d.give(0, 'confetti'); d.pl[1].x = 5; press(0); step(30); st = d.state(); const mid = st.score[0]; step(100); st = d.state(); ok('confetti: +2 (direct of vertraagd)', st.score[0] === 2, JSON.stringify([mid, st.score]));
      // 7. confetti op eigen voeten -> punt voor de ander
      reset(); d.give(0, 'confetti'); d.pl[0].x = -8; d.pl[0].z = -8.4; d.pl[1].x = 14; d.pl[1].z = 8; d.pl[0].face = Math.PI; press(0); step(130); st = d.state(); ok('confetti vlak bij jezelf: tegenstander +1', st.score[1] >= 1 && st.score[0] === 0, JSON.stringify([st.score, st.fuseList]));
      // 8. Bakker Bram
      reset(); d.bramNow(); d.pl[1].x = 0; d.pl[1].z = 1.9; d.pl[0].z = -9; d.pl[0].x = -14; let gotBram = false; for (let k = 0; k < 60 * 7; k++) { d.pl[1].x = 0; d.pl[1].z = 1.9; step(1); const s2 = d.state(); if (s2.stat.bram > 0) { gotBram = true; break; } if (s2.bram.state === 'idle' && s2.bram.runs > 0 && k > 120) break; }
      st = d.state(); ok('Bram rent omver, punt voor de ander', gotBram && st.score[0] >= 1, JSON.stringify([st.stat.bram, st.score, st.bram]));
      // 9. plas laat glijden
      reset(); d.puddleAt(-8, 0, 1.5, 'cream'); step(20); st = d.state(); ok('plas: glibberig', st.p[0].puddle === true);
      // 10. gouden taart bij gelijkspel
      reset(); d.setT(59.9); step(30); st = d.state(); ok('gelijk -> gouden taart (sdMode)', st.sdMode && st.p[0].cake === 'gold' && st.p[1].cake === 'gold', JSON.stringify([st.sdMode, st.p[0].cake]));
      step(120); d.pl[1].x = 3; d.pl[0].x = -3; d.pl[0].z = 0; d.pl[1].z = 0; d.pl[0].face = Math.PI / 2; step(2); press(0); step(60); st = d.state(); ok('gouden taart: eerste treffer wint', m.finished && m.result.winner === 0, JSON.stringify(m.result && [m.result.winner, m.result.scoreArr]));
      return out;
    });
    console.log(res.join('\n'));
    // Deurman en comeback in een verse pagina
    {
      const { browser: b2, page: p2 } = await open('none');
      const r2 = await p2.evaluate(() => {
        const out = []; const ok = (name, cond, info = '') => out.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${info}`);
        const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input;
        const step = (n, dt = 1 / 60) => { for (let k = 0; k < n; k++) { inp.update(); m.update(dt); } };
        window.__mode = 'idle'; d.pl[0].score = 2; d.pl[1].score = 2;
        m.instance.onDeurman([true, false]); step(2); ok('deurman: beweger verliest punt', d.state().score[0] === 1 && d.state().score[1] === 2, JSON.stringify(d.state().score));
        // comeback: de leider krijgt nooit bruidstaart bij het karretje, de achterstaander wel
        d.pl[0].score = 5; d.pl[1].score = 0; const cart = d.stations.find((s) => s.kind === 'cart');
        let leaderBride = 0, trailBride = 0;
        for (let k = 0; k < 20; k++) { for (const p of d.pl) { if (p.cake) { p.cake.obj.busy = false; p.cake = null; } p.stun = 0; p.inv = 0; } cart.cd = 0; d.pl[0].x = 0; d.pl[0].z = 2.2; d.pl[1].x = 40; d.pl[0].face = 0; inp.virtual[0].a = true; step(2); inp.virtual[0].a = false; step(1); if (d.pl[0].cake && d.pl[0].cake.type === 'bride') leaderBride++; if (d.pl[0].cake) { d.pl[0].cake.obj.busy = false; d.pl[0].cake = null; } cart.cd = 0; d.pl[1].x = 0; d.pl[1].z = 2.2; d.pl[0].x = 40; inp.virtual[1].a = true; step(2); inp.virtual[1].a = false; step(1); if (d.pl[1].cake && d.pl[1].cake.type === 'bride') trailBride++; }
        ok('comeback: achterstaander krijgt altijd bruidstaart van het karretje', trailBride >= 18 && leaderBride === 0, JSON.stringify({ leaderBride, trailBride }));
        return out;
      });
      console.log(r2.join('\n')); await b2.close();
    }
    await browser.close();
  } else if (name === 'trace') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    await page.evaluate((s) => { window.__skill = s; }, [{ aim: 0.4, tray: 0.2, dodge: 0.4 }, { aim: 0.4, tray: 0.2, dodge: 0.4 }]);
    for (let k = 0; k < 30; k++) {
      const r = await page.evaluate(() => { window.__bot(30 * 2); const s = window.__app.mode.instance.dbg.state(); return `T=${s.T.toFixed(0)} sc=${s.score} ` + s.p.map((p, i) => `P${i}(${p.x.toFixed(1)},${p.z.toFixed(1)}) ${p.cake || '-'} st${p.stun.toFixed(1)}${p.sh ? ' TRAY' : ''}${p.puddle ? ' PUD' : ''}`).join(' | ') + ` cd=${s.stations.map((q) => q.cd.toFixed(0))} bram=${s.bram.state}`; });
      console.log(r);
    }
    await browser.close();
  } else if (name === 'shots2') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    const step = (n) => page.evaluate((n) => { for (let k = 0; k < n; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }, n);
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(1000); await page.screenshot({ path: `/tmp/cf_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    const setup = () => page.evaluate(() => { const d = window.__app.mode.instance.dbg; window.__mode = 'idle'; d.setT(5); const [a, b] = d.pl; a.x = -6; a.z = 1.9; b.x = 6; b.z = 1.9; a.face = Math.PI / 2; b.face = -Math.PI / 2; a.vx = a.vz = b.vx = b.vz = 0; });
    await page.evaluate(() => window.__bot(30 * 2));
    await setup(); await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'bride'); d.give(1, 'confetti'); }); await step(8); await shot('hold');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'cream'); d.give(1, 'pudding'); const v = window.__app.input.virtual; v[0].a = true; }); await step(2);
    await page.evaluate(() => { window.__app.input.virtual[0].a = false; }); await step(7); await shot('flight');
    await step(14); await shot('hit1');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(1, 'bride'); d.pl[1].stun = 0; d.pl[1].inv = 0; d.pl[0].stun = 0; d.pl[0].inv = 0; d.pl[0].x = -8; d.pl[1].x = 4; d.pl[1].z = 1.9; d.pl[1].face = -Math.PI / 2; window.__app.input.virtual[1].a = true; }); await step(2);
    await page.evaluate(() => { window.__app.input.virtual[1].a = false; }); await step(20); await shot('bridefly'); await step(25); await shot('bridehit');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.pl[0].x = -13; d.pl[0].z = -9; d.pl[1].x = 13; d.pl[1].z = 9; d.bramNow(); window.__app.mode.instance.dbg.pl[0].stun = 0; }); await step(30 * 2.1); await shot('bram1'); await step(8); await shot('bram2');
    await browser.close();
  } else if (name === 'shots') {
    const { browser, page } = await open(process.env.TWIST || 'none');
    const step = (n) => page.evaluate((n) => { for (let k = 0; k < n; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } }, n);
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(1000); await page.screenshot({ path: `/tmp/cf_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await shot('start');
    await page.evaluate(() => window.__bot(30 * 6)); await shot('play1');
    await page.evaluate(() => window.__bot(30 * 8)); await shot('play2');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'bride'); d.give(1, 'confetti'); window.__mode = 'idle'; }); await step(8); await shot('hold');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.bramNow(); }); await step(30 * 2); await shot('bramwarn'); await step(30 * 1.4); await shot('bramrun');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.hit(0, 'bride'); d.hit(1, 'cream'); d.puddleAt(-5, 3, 1.8, 'cream'); d.puddleAt(5, -3, 1.4, 'pudding'); }); await step(6); await shot('hit');
    await browser.close();
  }
}
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO ERRORS');
server.close();
