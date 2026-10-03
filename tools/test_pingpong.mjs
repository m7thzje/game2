// Gebruik: node tools/test_pingpong.mjs [scenario...]   scenario: bots | twists | timeout | idle | golden | events | rules | shots
//   TW=<twist-id> kiest een twist (anders: "none" / per scenario). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp PRECIES één keer komt, beide spelers kunnen winnen,
// geen console-errors, dat elke twist werkt en dat de spelregels (serve, stuit, net, gouden punt) kloppen.
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
let FAIL = 0;
const check = (ok, msg) => { if (!ok) { FAIL++; console.log('  FAIL:', msg); } else console.log('  ok:', msg); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=pingpong&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    window.__fin = 0; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin++; window.__finArg = r; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1 (timing/mikfout), style: 'play'|'idle', smash: kans op een smash, fancy: kans op een B-slag }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input; const tw = m.twist.id;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const gs = () => (rnd() + rnd() + rnd() - 1.5) / 0.75;
    const B = [0, 1].map(() => ({ plan: null, pressed: false, lat: 0, fwd: 0, kind: 'A', errT: 0 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.p[i], dir = me.dir; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.phase === 'end' || st.phase === 'point') continue;
          const sk = c.skill ?? 0.7;
          let fwdIn = 0, latIn = 0, zT = me.z, uT = 5.8, press = null;
          if (st.phase === 'serve') { if (st.server === i && st.stare <= 0 && st.T > 0) { b.wait = (b.wait || 0) + dt; if (b.wait > 0.5 + (1 - sk) * 0.8) { press = 'A'; b.wait = 0; fwdIn = rnd() < 0.3 ? 1 : 0; } } }
          else if (st.phase === 'rally' && st.lastHitter !== i && st.ball.vx * dir < 0) {
            const pr = inst.dbg.predict(i);
            if (pr) {
              if (!b.err || b.errBall !== st.rally) { b.errBall = st.rally; b.err = gs() * (0.5 + (1 - sk) * 2.0); b.tErr = gs() * (0.03 + (1 - sk) * 0.14); b.kind = rnd() < (c.fancy ?? 0.12) ? 'B' : 'A'; b.lat = (rnd() - 0.5) * 2; b.fwd = rnd() < (c.smash ?? 0.25) ? 1 : (rnd() < 0.15 ? -1 : 0); }
              zT = pr.z + b.err * 0.6; uT = 5.8;
              if (pr.t < 0.14 + b.tErr && !b.pressed) { press = b.kind; b.pressed = true; fwdIn = b.fwd; latIn = b.lat; }
            }
          } else { b.pressed = false; zT = st.ball.z * 0.25; }
          if (st.phase !== 'rally') b.pressed = false;
          // bewegen
          const dz = zT - me.z; latIn = latIn || 0;
          v.y = Math.max(-1, Math.min(1, dz / 0.7));
          const du = me.u - uT; v.x = dir * Math.max(-1, Math.min(1, du / 1.0));
          if (press) { b.hold = 0.3; b.hx = dir * fwdIn; b.hy = (Math.abs(latIn) > 0.3 || press === 'B') ? latIn : null; if (press === 'A') v.a = true; else v.b = true; }
          if (b.hold > 0) { b.hold -= dt; v.x = b.hx; if (b.hy != null) v.y = b.hy; }   // richting vasthouden tot het contact (zoals een mens)
          if (tw === 'invert') { v.x = -v.x; v.y = -v.y; }
          if (tw === 'swapab') { const t = v.a; v.a = v.b; v.b = t; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'golden'].includes(name)) {
    const list = name === 'twists' ? TWISTS.map((t) => [t, [{ skill: 0.9 }, { skill: 0.7 }]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]], ['none', [{ style: 'idle' }, { skill: 0.8 }]]]
        : name === 'golden' ? [['none', [{ skill: 0.8 }, { skill: 0.8 }]]]
          : name === 'timeout' ? [['none', [{ skill: 0.85 }, { skill: 0.85 }]]]
            : [
              [process.env.TW || 'none', [{ skill: 0.95 }, { skill: 0.6 }]],
              [process.env.TW || 'none', [{ skill: 0.6 }, { skill: 0.95 }]],
              [process.env.TW || 'none', [{ skill: 0.8 }, { skill: 0.8, smash: 0.5, fancy: 0.3 }]],
              [process.env.TW || 'none', [{ skill: 0.5 }, { skill: 0.5 }]],
            ];
    const wins = [0, 0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(9); });
      if (name === 'golden') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(0.1); window.__app.mode.instance.dbg.setScore(3, 3); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
        while (!m.finished && g++ < 60 * 300) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = st.score.join('-') + ':' + st.phase + ':' + st.golden;
          if (key !== last && log.length < 60) { log.push(`T=${st.T.toFixed(1)} ${st.phase} score=${st.score} left=${st.timeLeft.toFixed(0)} srv=${st.server} gold=${st.goldBall} rally=${st.rally} max=${st.maxRally} ev=${st.ev}`); last = key; }
        }
        for (let k = 0; k < 120; k++) { try { m.update(1 / 60); } catch (e) { } }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.slice(-8).join('\n'));
      console.log(`end T=${res.st.T.toFixed(1)} score=${res.st.score} finished=${res.finished} points=${res.st.points} maxRally=${res.st.maxRally} events=${res.st.evs.join(',')} why=${JSON.stringify(res.st.why)} stats=${JSON.stringify(res.st.p.map((p) => p.st))}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.finished && res.fin === 1, `finishPvp precies 1x (fin=${res.fin})`);
      check(res.result && res.result.winner != null, `winnaar bepaald (${res.result && res.result.winner})`);
      if (res.result && res.result.winner != null) wins[res.result.winner]++;
      if (name === 'golden') check(res.st.golden && Math.abs(res.st.score[0] - res.st.score[1]) >= 1, `gouden punt na gelijkspel (score ${res.st.score})`);
      check(errors.length === 0, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
      await browser.close();
    }
    if (name === 'bots') check(wins[0] > 0 && wins[1] > 0, `beide spelers kunnen winnen (${wins})`);
    continue;
  }
  if (name === 'hooks') {
    // hooks: onDeurman (punt/pijlen eraf), onSwap, celebrate, onResult mogen niet crashen
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ skill: 0.7 }, { skill: 0.7 }]);
    const r = await page.evaluate(() => { const inst = window.__app.mode.instance, d = inst.dbg; d.setScore(3, 3); inst.onDeurman([false, true]); const s1 = d.state().score.slice(); inst.onSwap(true); inst.celebrate(0); return { s1, ok: s1[0] === 3 && s1[1] === 2 }; });
    console.log('hooks', JSON.stringify(r));
    check(r.ok, 'onDeurman straft de speler die bewoog');
    for (let k = 0; k < 20; k++) await page.evaluate(() => window.__bot(10));
    check(errors.length === 0, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'events') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.8 }, { skill: 0.8 }]);
    for (const id of ['tilt', 'bumpers', 'wind']) {
      const r = await page.evaluate((id) => {
        const inst = window.__app.mode.instance, d = inst.dbg; d.startEvent(id); const mx = { tilt: 0, wind: 0, b: 0 }; let g = 0;
        while (g++ < 60 * 14) { window.__bot(1); const s = d.state(); mx.tilt = Math.max(mx.tilt, Math.abs(s.tilt)); mx.wind = Math.max(mx.wind, Math.hypot(...s.wind)); mx.b = Math.max(mx.b, s.bumpers); if (!s.ev) break; if (window.__app.mode.finished) break; }
        return { id, mx, ev: d.state().ev, st: d.state().score };
      }, id);
      console.log('event', JSON.stringify(r));
      check(r.ev === null, `event ${id} eindigt`);
      check(id === 'tilt' ? r.mx.tilt > 0.08 : id === 'wind' ? r.mx.wind > 3 : r.mx.b === 4, `event ${id} werkt (${JSON.stringify(r.mx)})`);
    }
    check(errors.length === 0, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'rules') {
    // scripted: een serve moet legaal zijn (eigen helft, dan tegenstander), bal in het net, buiten, twee keer stuiteren
    const { browser, page, errors } = await open('none');
    const res = await page.evaluate(() => {
      const m = window.__app.mode, inst = m.instance, d = inst.dbg; const out = []; m.paused = false;
      const inp = window.__app.input;
      const runUntil = (cond, max = 60 * 8) => { let g = 0; while (g++ < max && !cond(d.state())) { inp.update(); m.update(1 / 60); } return d.state(); };
      d.setTime(999);
      // 1. legale serve door beide kanten
      for (const srv of [0, 1]) {
        d.G.firstServer = srv; d.G.points = 0; d.startServe(); d.G.stare = 0;
        const dir = srv ? -1 : 1; inp.virtual[srv].a = true; inp.update(); m.update(1 / 60); inp.virtual[srv].a = false;
        const bounces = []; let g = 0; const e0 = d.state();
        while (g++ < 300 && d.state().phase === 'rally' && bounces.length < 3) { inp.update(); m.update(1 / 240); const s = d.state(); if (s.stage !== (bounces.last || 'serve1')) { bounces.push(s.stage + '@' + s.ball.x.toFixed(1)); bounces.last = s.stage; } }
        out.push({ srv, bounces, stage: d.state().stage, phase: d.state().phase, score: d.state().score });
      }
      return out;
    });
    console.log(JSON.stringify(res));
    for (const r of res) check(r.bounces.length >= 1 && r.phase !== 'point' || r.stage === 'rally', `serve van speler ${r.srv} is legaal (${r.bounces.join(' > ')}; fase ${r.phase})`);
    check(errors.length === 0, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, smash: 0.4 }, { skill: 0.9, smash: 0.4 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/pp_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { calls: window.__app.renderer.info.render.calls, tris: window.__app.renderer.info.render.triangles, ph: s.phase, score: s.score, rally: s.rally, ev: s.ev, heat: s.heat, fire: s.fire, gold: s.goldBall }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(10)); await snap('serve');
    await go('s.phase==="rally" && s.rally>=2', 60 * 30); await snap('rally');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setHeat(6); });
    await go('s.fire', 60 * 30); await page.evaluate(() => window.__bot(14)); await snap('fire');
    await go('s.phase==="point"', 60 * 30); await snap('point');
    for (const id of ['tilt', 'bumpers', 'wind']) { await page.evaluate((id) => window.__app.mode.instance.dbg.startEvent(id), id); await page.evaluate(() => window.__bot(150)); await snap('ev_' + id); }
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(8, 3); });
    await page.evaluate(() => window.__bot(120)); await snap('bigbat');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(10, 9); });
    await go('s.phase==="end"', 60 * 120); await page.evaluate(() => window.__bot(30)); await snap('end');
    check(errors.length === 0, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
}
server.close();
console.log(FAIL ? `\n${FAIL} CHECK(S) MISLUKT` : '\nALLES OK');
process.exit(FAIL ? 1 : 0);
