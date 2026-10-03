// Gebruik: node tools/test_bowling.mjs [scenario...]   scenario: bots | twists | idle | timeout | sudden | shots
//   TW=<twist-id> kiest een twist. Q=low|high kwaliteit.
// Draait de echte game in headless chromium
// met bots die via de virtuele invoer spelen (versneld, zonder renderen) en controleren: finishPvp precies 1x, beide spelers kunnen winnen,
// scores kloppen met de ronde-uitslagen, geen console-errors.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['bots'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'lowgrav', 'bodyswap', 'deurman'];
let fails = 0; const FAIL = (m) => { fails++; console.log('FAIL: ' + m); };

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=bowling&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // finishPvp tellen
    window.__fin = 0; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin++; window.__finRes = r; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}


// cfg[i] = { skill 0..1, think (s), bomb: kans, steer: kans, style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const tw = m.twist.id; const flipX = tw === 'invert', swapAB = tw === 'swapab';
    const B = [0, 1].map(() => ({ key: '', target: 0, hold: 0.55, wait: 0, bomb: false, steer: false, armedDone: false }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) { const v = inp.virtual[i]; v.a = false; v.b = false; v.x = 0; v.y = 0; }
        if (tw === 'deurman' && st.T > (window.__nextDeur ??= 20)) { window.__nextDeur = st.T + 25; inst.onDeurman([rnd() < 0.6, rnd() < 0.6]); }
        for (const i of [0, 1]) {
          const c = window.__cfg[i], L = st.lanes[i], b = B[i]; if (c.style === 'idle') continue;
          const vi = m.swapped ? 1 - i : i; const v = inp.virtual[vi]; const A = swapAB ? 'b' : 'a', Bk = swapAB ? 'a' : 'b'; const fx = flipX ? -1 : 1;
          if (L.st === 'aim' || L.st === 'charge') {
            const key = `${st.frame}|${L.throwNo}|${st.sudden}`;
            if (b.key !== key) { b.key = key; b.wait = Math.floor(rnd() * (c.think ?? 1.5) * 60); b.target = (i ? -1 : 1) * 0.9 + (rnd() - 0.5) * (1 - (c.skill ?? 0.8)) * 14; b.hold = 0.45 + rnd() * 0.25 + (rnd() < 0.15 ? 0.3 : 0); b.bomb = rnd() < (c.bomb ?? 0.2); b.steer = rnd() < (c.steer ?? 0.5); b.armedDone = false; b.tog = 0; }
            if (L.st === 'aim') {
              if (b.wait > 0) { b.wait--; continue; }
              if (b.bomb && !b.armedDone && L.bombs > 0) { b.armedDone = true; v[Bk] = true; continue; }
              const err = b.target - L.angle;
              if (Math.abs(err) > 0.7) { v.x = Math.sign(err) * fx; } else v[A] = true;
            } else { if (L.chargeT < b.hold) v[A] = true; }
          } else if (L.st === 'roll' && b.steer && L.ball.mode === 'roll' && L.ball.z > -9.5) {
            const dx = L.ball.x - (i ? 3.3 : -3.3); if (Math.abs(dx) > 0.35) { v[Bk] = true; v.x = -Math.sign(dx) * fx; }
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function playMatch(name, tw, cfg, preset) {
  const { browser, page, errors } = await open(tw);
  await installBots(page, cfg);
  if (preset) await page.evaluate(preset);
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let g = 0, lastF = -9, lastG = '';
    while (!m.finished && g++ < 60 * 400) {
      window.__bot(1); const st = inst.dbg.state();
      if (st.frame !== lastF || st.gst !== lastG) { log.push(`T=${st.T.toFixed(1)} ${st.gst} frame=${st.frame} score=${st.score} left=${st.timeLeft.toFixed(1)} lanes=${st.lanes.map((l) => l.st + (l.bump ? '+B' : '') + (l.drag ? '+D' : '')).join('/')}`); lastF = st.frame; lastG = st.gst; }
    }
    for (let k = 0; k < 120; k++) window.__bot(1);
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
  });
  console.log(`\n=== ${name} twist=${res.twist} ===`);
  console.log(res.log.join('\n'));
  const s = res.st;
  console.log(`end T=${s.T.toFixed(1)} score=${s.score} finished=${res.finished} finishPvp-calls=${res.fin} sudden=${s.sudden} stats=${JSON.stringify(s.stats)}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  if (res.fin !== 1) FAIL(`${name}: finishPvp ${res.fin}x aangeroepen`);
  const sum = [0, 1].map((p) => s.lanes[p].fscore.reduce((a, b) => a + (b || 0), 0));
  if (s.sudden === 0 && !s.timeUp && (sum[0] !== s.score[0] || sum[1] !== s.score[1]) && tw !== 'deurman') FAIL(`${name}: score ${s.score} != som van rondes ${sum}`);
  if (res.result && res.result.winner == null) FAIL(`${name}: geen winnaar`);
  if (errors.length) { FAIL(`${name}: console-errors`); console.log(errors.slice(0, 6).join('\n')); } else console.log('NO ERRORS');
  await browser.close();
  return res.result ? res.result.winner : null;
}

const wins = [0, 0, 0];
for (const name of scen) {
  if (name === 'bots') {
    const cfgs = [[{ skill: 0.95, think: 1, bomb: 0.3 }, { skill: 0.3, think: 1.5, bomb: 0.2 }], [{ skill: 0.3, think: 1.5, bomb: 0.2 }, { skill: 0.95, think: 1, bomb: 0.3 }], [{ skill: 0.8, think: 1 }, { skill: 0.8, think: 1 }], [{ skill: 0.6, think: 1.5 }, { skill: 0.9, think: 1 }]];
    for (const c of cfgs) { const w = await playMatch('bots', process.env.TW || 'none', c); wins[w == null ? 2 : w]++; }
    console.log('winnaars (Wes, Jor, gelijk):', wins);
    if (!wins[0] || !wins[1]) FAIL('bots: niet beide spelers wonnen');
  } else if (name === 'skill') {
    for (const sk of [1, 0.6, 0.2]) await playMatch('skill=' + sk, 'none', [{ skill: sk, think: 0.3, bomb: 0, steer: 0 }, { skill: sk, think: 0.3, bomb: 0, steer: 0 }]);
  } else if (name === 'twists') {
    for (const t of TWISTS) await playMatch('twists', t, [{ skill: 0.8, think: 1, bomb: 0.3 }, { skill: 0.6, think: 1.5, bomb: 0.3 }]);
  } else if (name === 'idle') {
    await playMatch('idle', 'none', [{ style: 'idle' }, { style: 'idle' }]);
  } else if (name === 'timeout') {
    await playMatch('timeout', process.env.TW || 'none', [{ skill: 0.7, think: 1.5 }, { skill: 0.7, think: 1.5 }], () => { window.__app.mode.instance.dbg.setTime(18); });
  } else if (name === 'sudden') {
    await playMatch('sudden', 'none', [{ skill: 0.8, think: 0.5 }, { skill: 0.8, think: 0.5 }], () => { window.__app.mode.instance.dbg.forceTie(); window.__app.mode.instance.dbg.setScore(0, 0); });
  } else if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.85, think: 0.3, bomb: 0.5 }, { skill: 0.85, think: 0.3, bomb: 0.5 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/bw_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { gst: s.gst, frame: s.frame, score: s.score, lanes: s.lanes.map((l) => [l.st, l.standing, l.ball.mode, l.bump, l.drag]) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(70)); await snap('start');
    await go('s.lanes[0].st==="charge"'); await page.evaluate(() => window.__bot(10)); await snap('charge');
    await go('s.lanes[0].ball.mode==="roll"'); await page.evaluate(() => window.__bot(30)); await snap('roll');
    await go('s.lanes[0].st==="settle"'); await page.evaluate(() => window.__bot(25)); await snap('hit');
    await go('s.lanes[0].st==="sweep"'); await snap('sweep');
    await go('s.frame>=1 && s.lanes.some(l=>l.bump)', 60 * 120); await page.evaluate(() => window.__bot(90)); await snap('bumpers');
    await go('s.frame>=1 && s.lanes.some(l=>l.drag)', 60 * 200); await page.evaluate(() => window.__bot(90)); await snap('dragon');
    await go('s.frame>=4', 60 * 200); await page.evaluate(() => window.__bot(90)); await snap('last');
    await go('s.gst==="end"', 60 * 200); await page.evaluate(() => window.__bot(30)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close();
  }
}
server.close();
console.log(fails ? `\n${fails} FOUT(EN)` : '\nALLES OK');
process.exit(fails ? 1 : 0);
