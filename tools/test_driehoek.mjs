// Gebruik: node tools/test_driehoek.mjs [scenario...]   scenario: bots | winners | twists | idle | timeout | shots | physics
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Drie bots (slot 0..2) spelen versneld (zonder renderen) hele potjes; rapporteert tussenstanden, winnaar en fouten.
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
let FAIL = 0; const check = (ok, msg) => { if (!ok) { FAIL++; console.log('FOUT:', msg); } };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=driehoek&players=3&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    window.__finishCalls = 0; const orig = mode.finishPvp.bind(mode); mode.finishPvp = (r) => { window.__finishCalls++; return orig(r); };
    mode.paused = false;
    for (const k of [0, 1, 2]) inp.virtual[k].a = true; inp.update(); mode.update(0.016);
    for (const k of [0, 1, 2]) inp.virtual[k].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { style: 'pro'|'sloppy'|'catcher'|'idle', skill 0..1 }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1, 2].map(() => ({ hold: 0, rel: 0, noise: 0, nt: 0, tu: 0 }));
    window.__cfg = cfg; const A_ = 9.5;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1, 2]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.pads[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || !st.started || st.gstate === 'end') continue;
          const skill = c.skill ?? 0.8;
          const ps = st.pucks.filter((q) => !q.drop && q.scored < 0);
          const nIn = [-me.nx, -me.nz];
          let tu = 0, tw = me.R + 2.2, near = null, nd = 1e9, thr = null, tmin = 1e9;
          for (const q of ps) {
            const dist = A_ - (q.x * me.nx + q.z * me.nz), vN = q.vx * me.nx + q.vz * me.nz;
            if (vN > 1.5) { const t = dist / vN; if (t < tmin) { tmin = t; thr = q; tu = (q.x * me.tx + q.z * me.tz) + (q.vx * me.tx + q.vz * me.tz) * t; } }
            const d = Math.hypot(q.x - me.x, q.z - me.z); if (d < nd) { nd = d; near = q; }
          }
          if (!thr && near) tu = (near.x * me.tx + near.z * me.tz) * 0.8;
          b.nt -= dt; if (b.nt <= 0) { b.nt = 0.25 + rnd() * 0.4; b.noise = (rnd() - 0.5) * (1 - skill) * 6; }
          tu = Math.max(-7.4, Math.min(7.4, tu + b.noise));
          if (thr && tmin < 0.5) tw = me.R + 3.6;
          let aim = 0;
          // magneet: vangen en richten
          if (c.style === 'catcher' || c.style === 'pro') {
            if (me.caught) {
              b.hold += dt; const tg = st.pads.filter((o, j) => j !== i && !o.elim).sort((a, bb) => a.lives - bb.lives)[0];
              if (tg) { const dx = tg.x - me.x, dz = tg.z - me.z, d = Math.hypot(dx, dz) || 1; const sn = nIn[0] * dz / d - nIn[1] * dx / d, cs = nIn[0] * dx / d + nIn[1] * dz / d; aim = Math.max(-1, Math.min(1, Math.atan2(sn, cs))); }
              v.b = b.hold <= 0.35;   // na een korte richt-tijd loslaten
            } else {
              b.hold = 0;
              if (me.magOn) v.b = true;
              else if (near && nd < 4.4 && me.magCd === 0 && Math.hypot(near.vx, near.vz) < 22 && rnd() < 0.5 * skill + 0.1 && me.lst === 'idle' && ((near.x - me.x) * nIn[0] + (near.z - me.z) * nIn[1]) > 0) v.b = true;
            }
          }
          // positie -> invoer
          const px = me.nx * (A_ - tw) + me.tx * tu, pz = me.nz * (A_ - tw) + me.tz * tu;
          let dx = px - me.x, dz = pz - me.z; const d = Math.hypot(dx, dz);
          if (me.caught) { /* richtingskeuze via stick: wijs naar het doel van de zwakste */ const c_ = Math.cos(aim), s_ = Math.sin(aim); dx = nIn[0] * c_ - nIn[1] * s_; dz = nIn[0] * s_ + nIn[1] * c_; v.x = dx; v.y = dz; }
          else if (d > 0.12) { const sp = Math.min(1, d / 1.1) * (0.55 + 0.45 * skill); v.x = dx / d * sp; v.y = dz / d * sp; }
          // smash
          if (near && me.lcd === 0 && me.lst === 'idle' && !me.magOn && nd < me.R + 2.6 && ((near.x - me.x) * nIn[0] + (near.z - me.z) * nIn[1]) > -0.2 && rnd() < (c.smash ?? 0.2) * skill) v.a = true;
          // twist-compensatie (bots spelen slim rond de twist)
          if (m.twist.id === 'invert') { v.x = -v.x; v.y = -v.y; } if (m.twist.id === 'swapab') { const t = v.a; v.a = v.b; v.b = t; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const sum = (r) => (r ? r.replace(/<[^>]+>/g, ' ') : '');
async function playOut(page) {
  return page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let g = 0, last = '';
    while (!m.finished && g++ < 60 * 220) {
      window.__bot(1);
      const st = inst.dbg.state();
      if (m.twist.id === 'deurman' && !window.__deurDone && st.clock > 20 && st.gstate === 'play') { window.__deurDone = true; inst.onDeurman([true, false, true]); log.push(`onDeurman: frozen=${inst.dbg.state().pads.map((p) => p.frozen)}`); }
      const key = st.pads.map((p) => p.lives).join('-') + ':' + st.gstate + ':' + st.pk + ':' + st.overtime + st.door.map((d) => (d > 0.5 ? 1 : 0)).join('');
      if (key !== last) { log.push(`T=${st.clock.toFixed(1)} ${st.gstate} lives=${st.pads.map((p) => p.lives)} gf=${st.pads.map((p) => p.gf)} pucks=${st.pk} ot=${st.overtime} bump=${st.ev.bump} door=${st.door}`); last = key; }
    }
    for (let k = 0; k < 400; k++) { m.update(0.016); }
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, finishCalls: window.__finishCalls, names: m.ctx.players.map((p) => p.name + ':' + p.css) };
  });
}

for (const name of scen) {
  if (name === 'physics') {
    // robuustheid: pucks met willekeurige (hoge) snelheden afvuren; ze mogen nooit buiten de arena of door schijven lekken
    for (const style of ['idle', 'pro']) {
      const { browser, page, errors } = await open(process.env.TW || 'none');
      await installBots(page, [{ style, skill: 0.9 }, { style, skill: 0.9 }, { style, skill: 0.9 }]);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, d = m.instance.dbg; let viol = 0, maxPen = 0, maxR = 0, frames = 0, nan = 0; const bad = [];
        d.setClock(13); window.__bot(120);
        for (let f = 0; f < 5000 && !m.finished; f++) {
          const st = d.state();
          if (st.gstate === 'play' && f % 40 === 0) { for (const q of d.pucks) if (q.on && !q.drop && q.scored < 0 && q.stuck < 0) { const a = Math.random() * 6.283, sp = 12 + Math.random() * 30; q.x = (Math.random() - 0.5) * 12; q.z = (Math.random() - 0.5) * 12; q.vx = Math.cos(a) * sp; q.vz = Math.sin(a) * sp; } }
          if (st.gstate === 'goal') { /* gewoon doorspelen: nieuw serve volgt */ }
          window.__bot(1); frames++;
          for (const q of d.pucks) {
            if (!q.on || q.drop || q.scored >= 0) continue;
            if (!Number.isFinite(q.x + q.z + q.vx + q.vz)) { nan++; continue; }
            const r = Math.hypot(q.x, q.z); maxR = Math.max(maxR, r);
            if (r > 19) { viol++; if (bad.length < 4) bad.push({ x: q.x, z: q.z }); }
            for (const p of d.pads) { const pen = (p.R + q.r) - Math.hypot(q.x - p.x, q.z - p.z); if (q.stuck < 0 && pen > maxPen) { maxPen = pen; window.__worst = { pen, pad: p.i, lst: p.lst, L: p.L, vx: q.vx, vz: q.vz, px: p.x, pz: p.z, qx: q.x, qz: q.z, noHit: q.noHit, noHitT: q.noHitT, u: p.u, w: p.w, mag: p.mag.on, f: p.frozen, g: d.state().gstate }; } }
          }
        }
        return { worst: window.__worst, viol, maxPen: +maxPen.toFixed(2), maxR: +maxR.toFixed(2), frames, nan, bad, lives: d.pads.map((p) => p.lives), finished: m.finished, goals: d.state().stats.goals };
      });
      console.log(`physics style=${style}`, JSON.stringify(res));
      check(res.viol === 0, 'puck buiten de arena'); check(res.nan === 0, 'NaN in puck'); check(res.maxPen < 1.2, 'puck te diep in schijf: ' + res.maxPen);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) FAIL++;
      await browser.close();
    }
    continue;
  }
  if (['bots', 'winners', 'twists', 'timeout', 'idle'].includes(name)) {
    const Pro = { style: 'pro', skill: 1, smash: 0.3 }, Sl = { style: 'sloppy', skill: 0.35, smash: 0.1 }, Ca = { style: 'catcher', skill: 0.8 }, Id = { style: 'idle' };
    // winners: per slot een goede bot met 3 levens tegen twee zwakke bots met 1 leven (voorsprong, zodat elk slot de eindstand kan halen)
    const wcfg = (s) => { const c = [Sl, Sl, Sl]; c[s] = Pro; return c; };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [Pro, Ca, Sl]])
      : name === 'idle' ? [['none', [Id, Id, Id]]]
        : name === 'timeout' ? [['none', [Sl, Sl, Sl]]]
          : name === 'winners' ? [0, 1, 2].map((s) => [process.env.TW || 'none', wcfg(s), s])
            : [[process.env.TW || 'none', [Pro, Ca, Sl]], [process.env.TW || 'none', [Sl, Pro, Ca]], [process.env.TW || 'none', [Ca, Sl, Pro]]];
    const winners = new Set();
    for (const [tw, cfg, want] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (want !== undefined) await page.evaluate((w) => { const d = window.__app.mode.instance.dbg; for (let j = 0; j < 3; j++) if (j !== w) d.setLives(j, 1); }, want);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setClock(84); });
      const res = await playOut(page);
      console.log(`\n=== ${name} twist=${res.twist} cfg=${cfg.map((c) => c.style)} ===`);
      console.log(res.log.join('\n'));
      const r = res.result;
      console.log(`end clock=${res.st.clock.toFixed(1)} finished=${res.finished} finishCalls=${res.finishCalls} stats=${JSON.stringify(res.st.stats)} names=${res.names}`);
      if (r) { console.log(`RESULT winner=${r.winner} winnerId=${r.winnerId} lives=${r.scoreArr} ids=${r.ids} :: ${sum(r.summary)}`); winners.add(r.winner); }
      check(res.finished, 'potje niet afgelopen'); check(res.finishCalls === 1, `finishPvp ${res.finishCalls}x aangeroepen`); check(r && r.winner != null, 'geen winnaar');
      if (want !== undefined && r) check(r.winner === want, `slot ${want} had een voorsprong maar slot ${r.winner} won`);
      check(res.names.join() === 'Wes:#35c46f,Jor:#4a8cff,Juul:#ff9a3c', 'namen/kleuren kloppen niet: ' + res.names);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) FAIL++;
      await browser.close();
    }
    if (name === 'winners' || name === 'bots') { console.log('winnaar-slots gezien:', [...winners].sort().join(',')); if (name === 'winners') check(winners.size === 3, 'niet alle drie de slots wonnen'); }
    continue;
  }
  if (name === 'custom') {   // BOTS=pro,idle,idle (stijlen per slot) node tools/test_driehoek.mjs custom
    const cfg = (process.env.BOTS || 'pro,idle,idle').split(',').map((st) => ({ style: st, skill: 1, smash: 0.3 }));
    const { browser, page, errors } = await open(process.env.TW || 'none'); await installBots(page, cfg);
    const res = await playOut(page); console.log(res.log.join('\n')); console.log(res.st.goalLog.map((g) => JSON.stringify(g)).join('\n')); console.log('RESULT', res.result.winner, res.result.scoreArr, JSON.stringify(res.st.pads.map((p) => [p.gf, p.ga])));
    if (errors.length) { FAIL++; console.log(errors.slice(0, 3).join('\n')); } await browser.close(); continue;
  }
  if (name === 'fair') {   // symmetrie-check: drie even goede bots, 5 potjes; totaal aantal goals-tegen per slot en winnaars
    const tot = [0, 0, 0], win = [0, 0, 0];
    for (let k = 0; k < 5; k++) {
      const { browser, page, errors } = await open('none');
      await installBots(page, [{ style: 'pro', skill: 0.9 }, { style: 'pro', skill: 0.9 }, { style: 'pro', skill: 0.9 }]);
      const res = await playOut(page);
      res.st.pads.forEach((p, i) => { tot[i] += p.ga; }); win[res.result.winner]++;
      console.log(`potje ${k}: lives=${res.result.scoreArr} ga=${res.st.pads.map((p) => p.ga)} clock=${res.st.clock.toFixed(0)}`); if (errors.length) { FAIL++; console.log(errors.slice(0, 3).join('\n')); }
      await browser.close();
    }
    console.log('goals-tegen per slot', tot, 'winnaars per slot', win);
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'pro', skill: 0.8 }, { style: 'catcher', skill: 0.7 }, { style: 'sloppy', skill: 0.5 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/dh_${tag}.png` }); const s = await page.evaluate(() => { const st = window.__app.mode.instance.dbg.state(); return { clock: +st.clock.toFixed(1), g: st.gstate, lives: st.pads.map((p) => p.lives), pk: st.pk, pucks: st.pucks.map((q) => [q.x, q.z, q.stuck, q.turbo]), mag: st.pads.map((p) => p.caught), L: st.pads.map((p) => p.L) }; }); console.log('shot', tag, JSON.stringify(s)); };
    await page.screenshot({ path: '/tmp/dh_intro.png' });
    await page.evaluate(() => window.__bot(200)); await snap('play');
    await page.evaluate(() => { window.__app.mode.instance.dbg.forceBump(); }); await page.evaluate(() => window.__bot(70)); await snap('bumpers');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnBoost(); d.startPuck2(); }); await page.evaluate(() => window.__bot(90)); await snap('boost');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.shutDoor(2); }); await page.evaluate(() => window.__bot(80)); await snap('door');
    await page.evaluate(() => window.__bot(60 * 20, (s) => s.pads.some((p) => p.caught))); await snap('magnet');
    await page.evaluate(() => window.__bot(60 * 40, (s) => s.gstate === 'goal')); await page.evaluate(() => window.__bot(12)); await snap('goal');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setLives(2, 1); d.setLives(1, 2); }); await page.evaluate(() => window.__bot(150)); await snap('comeback');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setLives(0, 0); }); await page.evaluate(() => window.__bot(80)); await snap('elim');
    await page.evaluate(() => { window.__bot(60 * 60, (s) => s.finished); }); await page.evaluate(() => { const m = window.__app.mode; for (let k = 0; k < 400; k++) m.update(0.016); });
    await page.waitForTimeout(700); await page.screenshot({ path: '/tmp/dh_end.png' });
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) FAIL++;
    await browser.close(); continue;
  }
}
server.close();
console.log(FAIL ? `\n${FAIL} FOUT(EN)` : '\nALLES OK');
process.exit(FAIL ? 1 : 0);
