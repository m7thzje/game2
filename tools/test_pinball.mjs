// Gebruik: node tools/test_pinball.mjs [scenario...]   scenario: bots | twists | idle | timeout | physics | shots
//   TW=<twist-id> kiest een twist. Q=low|high kwaliteit.
// Bots spelen versneld hele potjes. Controleert: finishPvp precies 1x, beide spelers kunnen winnen, geen console-errors, elke twist werkt.
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
let failures = 0; const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) failures++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=pinball&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
    // finishPvp tellen
    window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1, nudge: kans per ballen-moment op B, style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ hold: 0, nudge: 0 }));
    window.__cfg = cfg; window.__sw = false;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle') continue;
          // twist swapab: A/B zijn verwisseld -> bot drukt de andere knop
          const swapAB = m.twist.id === 'swapab';
          let want = false;
          for (const f of st.flippers) { if (f.side !== i) continue; for (const q of st.balls) { if (q.ramp) continue; const u = (q.x - f.px) * (f.side ? -1 : 1), vv = q.z - f.pz; if (u > -0.5 && u < f.len + 1.4 && vv > -2.6 && vv < 1.6 && q.vz > -3) want = true; } }
          if (b.hold > 0) { b.hold -= dt; want = true; } else if (want && rnd() < c.skill) b.hold = 0.12 + rnd() * 0.2; else want = false;
          if (m.state === 'play') {
            if (want) { if (swapAB) v.b = true; else v.a = true; }
            if (b.nudge > 0) { b.nudge -= dt; } else if (st.balls.some((q) => q.z > 7 && Math.abs(q.vx) < 3 && q.vz > 4) && rnd() < c.nudge * dt * 6) { b.nudge = 0.4; if (swapAB) v.a = true; else v.b = true; v.x = rnd() < 0.5 ? -1 : 1; }
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function runMatch(page, maxFrames = 60 * 330) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.g + ':' + st.ballNo + ':' + st.sudden;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.g} bal=${st.ballNo} score=${st.score} left=${st.timeLeft.toFixed(1)} sudden=${st.sudden}`); last = key; }
    }
    // na afloop nog even doorspelen: finishPvp mag niet nog eens komen
    for (let k = 0; k < 400; k++) { window.__app.mode.paused = false; window.__app.input.update(); window.__app.mode.update(0.016); }
    window.__app.mode.paused = true;
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin.length, g };
  }, maxFrames);
}

const wins = [0, 0, 0];
for (const name of scen) {
  if (name === 'physics') {
    // robuustheid in de echte pagina: veel ballen met hoge snelheden, nooit buiten de kast
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, nudge: 0.1, style: 'play' }, { skill: 0.9, nudge: 0.1, style: 'play' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; let oob = 0, steps = 0, nan = 0;
      window.__bot(120);
      for (let f = 0; f < 3000 && !m.finished; f++) {
        if (f % 40 === 0) { const a = Math.random() * 6.283, sp = 8 + Math.random() * 28; d.put((Math.random() - 0.5) * 16, -6 + Math.random() * 16, Math.cos(a) * sp, Math.sin(a) * sp, Math.random() < 0.5 ? 0 : 1); }
        window.__bot(1); steps++;
        for (const b of d.balls) { if (!b.on || b.ramp) continue; if (!isFinite(b.x + b.z)) nan++; if (Math.abs(b.x) > 11.3 && b.z < 15.9 || b.z < -15.3) oob++; }
      }
      return { oob, nan, steps, score: d.state().score };
    });
    check(res.oob === 0 && res.nan === 0, `physics: ${JSON.stringify(res)}`);
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (['bots', 'twists', 'timeout', 'idle'].includes(name)) {
    const mk = (a, b, n) => [{ skill: a, nudge: n, style: 'play' }, { skill: b, nudge: n, style: 'play' }];
    const list = name === 'twists' ? TWISTS.map((t) => [t, mk(0.9, 0.7, 0.1)])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', mk(0.9, 0.9, 0.0)]]
          : [[process.env.TW || 'none', mk(0.95, 0.5, 0.1)], [process.env.TW || 'none', mk(0.5, 0.95, 0.1)], [process.env.TW || 'none', mk(0.8, 0.8, 0.15)]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(7); });
      const res = await runMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      const st = res.st; console.log(`end T=${st.T.toFixed(1)} score=${st.score} finished=${res.finished} flipHits=${st.flipHits} steals=${st.S.steals} jackpots=${st.S.jackpots} multis=${st.S.multis} items=${st.S.items} tilts=${st.S.tilts} ramps=${st.S.ramps} sneezes=${st.S.sneezes} chick=${st.S.chickenHits} dragon=${st.S.dragonHits} saves=${st.S.saves}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.finished && res.fin === 1, `finishPvp precies 1x (gekomen: ${res.fin}) [${name}/${res.twist}]`);
      check(res.result && (res.result.winner === 0 || res.result.winner === 1), `er is een winnaar (${res.result && res.result.winner})`);
      if (res.result) wins[res.result.winner ?? 2]++;
      check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.85, nudge: 0.1, style: 'play' }, { skill: 0.8, nudge: 0.1, style: 'play' }]);
    const snap = async (tag) => { await page.waitForTimeout(1200); await page.screenshot({ path: `/tmp/pb_${tag}.png`, timeout: 180000 }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.g, score: s.score, balls: s.balls.length, item: s.item, jp: s.jackpotLit }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.screenshot({ path: '/tmp/pb_start.png', timeout: 180000 });
    await go('s.g==="play" && s.T>6'); await page.evaluate(() => window.__bot(240)); await snap('play');
    await page.evaluate(() => window.__app.mode.instance.dbg.spawnItem('multi')); await page.evaluate(() => window.__bot(30)); await snap('item');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.jackpotOn(); d.sneeze(); }); await page.evaluate(() => window.__bot(14)); await snap('jackpot');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveItem('multi', 1); }); await page.evaluate(() => window.__bot(40)); await snap('multi');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveItem('big', 0); d.giveItem('x2', 1); }); await page.evaluate(() => window.__bot(30)); await snap('powerups');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(0, 300); }); await page.evaluate(() => window.__bot(240)); await snap('comeback');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setTime(3); }); await go('s.g==="end"', 60 * 120); await page.evaluate(() => window.__bot(30)); await snap('end');
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
}
console.log(`\nwinnaars [Wes, Jor, gelijk]: ${wins}`);
console.log(failures ? `${failures} CHECK(S) MISLUKT` : 'ALLES OK');
server.close();
