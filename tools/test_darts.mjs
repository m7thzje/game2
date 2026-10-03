// Gebruik: node tools/test_darts.mjs [scenario...]   scenario: bots | twists | timeout | idle | sd | events | shots
//   TW=<twist-id> kiest een twist (anders: "none" / per scenario). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp PRECIES één keer komt, beide spelers kunnen winnen,
// geen console-errors en elke twist werkt.
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
  await page.goto(`http://localhost:${port}/?game=darts&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // finishPvp tellen (de harness negeert dubbele aanroepen zelf, dus tellen we ze hier)
    window.__fin = 0; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin++; window.__finArg = r; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1, style: 'play'|'idle'|'wild' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ aim: 0, tx: 0, ty: 0, goalPull: 0.9, wait: 0 }));
    window.__cfg = cfg; const tw = m.twist.id;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.p[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.gstate === 'end') continue;
          const sk = c.skill ?? 0.7;
          if (me.state === 'ready' || me.state === 'cool' || me.state === 'pull') {
            if (me.state === 'ready' && b.aim <= 0) {
              // nieuw doel: de bull met menselijke mikfout (kleiner bij hogere skill); 'wild' = willekeurig ergens op het bord
              const sg = 0.35 + (1 - sk) * 1.3, g2 = () => (rnd() + rnd() + rnd() - 1.5) / 0.75 * sg;
              b.ox = g2(); b.oy = g2();
              if (c.style === 'wild') { b.ox = (rnd() - 0.5) * 6; b.oy = (rnd() - 0.5) * 6; }
              b.goalPull = 0.7 + rnd() * 0.3 + (sk > 0.5 ? 0.1 : 0); b.aim = 1; b.hold = 0;
            }
            const tx = st.board.x + b.ox, ty = st.board.y + b.oy;
            const dx = tx - me.ax, dy = ty - me.ay, d = Math.hypot(dx, dy);
            if (d > 0.1) { v.x = Math.max(-1, Math.min(1, dx / 0.5)); v.y = -Math.max(-1, Math.min(1, dy / 0.5)); }
            const live = Math.hypot(me.lx - tx, me.ly - ty);
            if (me.state === 'ready' && d < 0.9 && rnd() < 0.15) { v.a = true; b.hold = 0; }
            else if (me.state === 'pull') {
              v.a = true; b.hold += dt;
              const thr = 1.3 - sk * 1.1;
              if (me.steadyCd <= 0 && me.pull > 0.7 && rnd() < 0.05) v.b = true;
              if ((me.pull >= b.goalPull && live < thr) || b.hold > 1.0 + (1 - sk) * 1.2) { v.a = false; b.aim = 0; }
            }
          }
        }
        // twist-bewust: de bot compenseert omgekeerde besturing / verwisselde knoppen (zoals een mens zou doen)
        for (const i of [0, 1]) { const v = inp.virtual[i]; if (tw === 'invert') { v.x = -v.x; v.y = -v.y; } if (tw === 'swapab') { const t = v.a; v.a = v.b; v.b = t; } }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'sd'].includes(name)) {
    const list = name === 'twists' ? TWISTS.map((t) => [t, [{ skill: 0.9 }, { skill: 0.7 }]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]], ['none', [{ style: 'idle' }, { skill: 0.8 }]]]
        : name === 'sd' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
          : name === 'timeout' ? [['none', [{ skill: 0.1, style: 'wild' }, { skill: 0.1, style: 'wild' }]]]
            : [
              [process.env.TW || 'none', [{ skill: 0.95 }, { skill: 0.6 }]],
              [process.env.TW || 'none', [{ skill: 0.6 }, { skill: 0.95 }]],
              [process.env.TW || 'none', [{ skill: 0.8 }, { skill: 0.8 }]],
              [process.env.TW || 'none', [{ skill: 0.5 }, { skill: 0.5 }]],
            ];
    const wins = [0, 0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(12); });
      if (name === 'sd') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(4); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
        while (!m.finished && g++ < 60 * 400) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = st.score.join('-') + ':' + st.gstate + ':' + st.sd + ':' + st.ev;
          if (key !== last && (log.length < 40)) { log.push(`T=${st.T.toFixed(1)} ${st.gstate} r${st.round} score=${st.score} left=${st.timeLeft.toFixed(1)} sd=${st.sd} ev=${st.ev}`); last = key; }
        }
        // nog even doorspelen zodat een dubbele finishPvp zou opvallen
        for (let k = 0; k < 120; k++) { try { m.update(1 / 60); } catch (e) { } }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.slice(-12).join('\n'));
      console.log(`end T=${res.st.T.toFixed(1)} score=${res.st.score} finished=${res.finished} rounds=${res.st.round} events=${res.st.evs.join(',')} stats=${JSON.stringify(res.st.p.map((p) => p.st))}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.finished && res.fin === 1, `finishPvp precies 1x (fin=${res.fin})`);
      check(res.result && res.result.winner != null || name === 'idle', `winnaar bepaald (${res.result && res.result.winner})`);
      if (res.result && res.result.winner != null) wins[res.result.winner]++;
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
    const r = await page.evaluate(() => { const inst = window.__app.mode.instance, d = inst.dbg; d.setScore(40, 40); inst.onDeurman([true, false]); const s1 = d.state().score.slice(); inst.onSwap(true); inst.celebrate(1); return { s1, ok: s1[0] === 28 && s1[1] === 40 }; });
    console.log('hooks', JSON.stringify(r));
    check(r.ok, 'onDeurman straft de speler die bewoog');
    for (let k = 0; k < 20; k++) await page.evaluate(() => window.__bot(10));
    check(errors.length === 0, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'events') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.8 }, { skill: 0.8 }]);
    for (const id of ['spin', 'slide', 'swing', 'shove', 'chicken']) {
      const r = await page.evaluate((id) => {
        const inst = window.__app.mode.instance, d = inst.dbg; d.startEvent(id); let max = { x: 0, r: 0 }, chick = false, g = 0;
        while (g++ < 60 * 14) { window.__bot(1); const s = d.state(); max.x = Math.max(max.x, Math.abs(s.board.x)); max.r = Math.max(max.r, Math.abs(s.board.rot)); if (s.chicken) chick = true; if (!s.ev) break; if (window.__app.mode.finished) break; }
        return { id, max, chick, ev: d.state().ev, st: d.state().score };
      }, id);
      console.log('event', JSON.stringify(r));
      check(r.ev === null, `event ${id} eindigt`);
      if (id === 'chicken') check(r.chick, 'kip verschijnt'); else if (id === 'slide' || id === 'shove') check(r.max.x > 0.5, `bord verschuift (${r.max.x.toFixed(2)})`); else check(r.max.r > 0.2, `bord draait/kantelt (${r.max.r.toFixed(2)})`);
    }
    check(errors.length === 0, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.85 }, { skill: 0.8 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/dt_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { calls: window.__app.renderer.info.render.calls, tris: window.__app.renderer.info.render.triangles, g: s.gstate, score: s.score, ev: s.ev, round: s.round, darts: s.darts }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(30)); await snap('start');
    await go('s.p[0].state==="pull" && s.p[0].pull>0.6'); await snap('pull');
    await go('s.darts>=4', 60 * 20); await page.evaluate(() => window.__bot(40)); await snap('darts');
    for (const id of ['spin', 'shove', 'chicken', 'swing']) {
      await page.evaluate((id) => window.__app.mode.instance.dbg.startEvent(id), id);
      await page.evaluate((id) => window.__bot(id === 'shove' ? 190 : id === 'chicken' ? 100 : 120), id); await snap('ev_' + id);
    }
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(120, 40); d.setTime(14); });
    await page.evaluate(() => window.__bot(240)); await snap('late');
    await go('s.gstate==="end"', 60 * 300); await page.evaluate(() => window.__bot(30)); await snap('end');
    check(errors.length === 0, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
}
server.close();
console.log(FAIL ? `\n${FAIL} CHECK(S) MISLUKT` : '\nALLES OK');
process.exit(FAIL ? 1 : 0);
