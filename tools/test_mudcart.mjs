// Gebruik: node tools/test_mudcart.mjs [scenario...]   (scenario: perfect good poor masher idle)
// Versneld (zonder renderen) de minigame doorspelen met een bot en rapporteer fase-tijden, sterren en console-fouten.
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
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['perfect', 'good', 'poor', 'masher', 'idle'];
const SHOTS = [['p1', 's.phase===1 && s.T>5.5'], ['p2a', 's.phase===2 && s.sub==="seg" && s.segHits>=3'], ['p2b', 's.phase===2 && s.seg===1 && s.segHits>=2'], ['p3a', 's.phase===3 && s.x>48'], ['p3b', 's.phase===3 && s.x>62'], ['end', 's.phase===4']];
const SK = { perfect: { sd: 0.025, miss: 0, bias: 0 }, good: { sd: 0.07, miss: 0.04, bias: 0.01 }, poor: { sd: 0.12, miss: 0.14, bias: 0.03 }, masher: { masher: true }, idle: { idle: true }, nolever: { sd: 0.03, miss: 0, bias: 0, nolever: true }, drop: { sd: 0.03, miss: 0, bias: 0, drop: true } };

const launch = () => chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const name of scen) {
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 560 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=mudcart&quality=low`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  if (name === 'shots') {
    await page.evaluate(() => {
      const app = window.__app, mode = app.mode, inst = mode.instance, inp = app.input;
      let sd = 777; const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
      const plan = new Map();
      window.__runUntil = (cond, maxT = 80) => {
        const dt = 1 / 60; let g = 0; const f = new Function('s', 'return ' + cond);
        while (g++ < 60 * maxT && !mode.finished) {
          const st = inst.dbg.state(); if (f(st)) return true;
          for (const i of [0, 1]) { inp.virtual[i].a = false; inp.virtual[i].b = false; }
          for (const n of inst.dbg.notes()) for (const i of (n.p === 2 ? [0, 1] : [n.p])) {
            const key = n.t.toFixed(3) + '/' + i; if (!plan.has(key)) plan.set(key, n.t + (rnd() - 0.5) * 0.1);
            const pt = plan.get(key); if (st.T >= pt && st.T < pt + 0.025 && !plan.get('d' + key)) { inp.virtual[i].a = true; plan.set('d' + key, true); }
          }
          if (st.phase === 2 && st.sub !== 'exit') { if (st.sub === 'swap') { inp.virtual[0].b = inp.virtual[1].b = true; } else inp.virtual[st.leverP].b = true; }
          inp.update(); mode.update(dt);
        }
        return false;
      };
    });
    for (const [tag, cond] of SHOTS) {
      const ok = await page.evaluate((c) => window.__runUntil(c), cond);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `/tmp/mc_${tag}.png` });
      console.log('shot', tag, ok);
    }
    await page.evaluate(() => { for (let k = 0; k < 600; k++) window.__app.mode.update(1 / 60); document.getElementById('screens').style.display = 'none'; });
    await page.waitForTimeout(900);
    await page.screenshot({ path: '/tmp/mc_end2.png' });
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  const res = await page.evaluate(({ sk, seed }) => {
    const app = window.__app, mode = app.mode, inst = mode.instance, inp = app.input;
    let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const plan = new Map(); // key -> {time|null}
    const dt = 1 / 60; let guard = 0; const log = [];
    let lastPhase = 0; let T = inst.dbg.state().T;
    while (guard++ < 60 * 80 && !mode.finished) {
      const st = inst.dbg.state();
      if (st.phase !== lastPhase) { log.push(`t=${st.T.toFixed(1)} phase ${st.phase}/${st.sub} x=${st.x.toFixed(1)}`); lastPhase = st.phase; }
      for (const i of [0, 1]) { inp.virtual[i].a = false; inp.virtual[i].b = false; }
      if (sk.idle) { /* niets */ }
      else if (sk.masher) {
        for (const i of [0, 1]) if (rnd() < 0.3) inp.virtual[i].a = true; // ~18 taps/s
        if (st.phase === 2) inp.virtual[st.leverP].b = true;
      } else {
        for (const n of inst.dbg.notes()) {
          const pl = n.p === 2 ? [0, 1] : [n.p];
          for (const i of pl) {
            const key = n.t.toFixed(3) + '/' + i;
            if (!plan.has(key)) plan.set(key, rnd() < sk.miss ? null : n.t + sk.bias + gauss() * sk.sd);
            const pt = plan.get(key);
            if (pt != null && st.T >= pt && st.T < pt + dt * 1.5 && !plan.get('done' + key)) { inp.virtual[i].a = true; plan.set('done' + key, true); }
          }
        }
        if (!sk.nolever && !(sk.drop && window.__dropT != null && st.T < window.__dropT + 1.6) && st.phase === 2 && (st.sub === 'seg' || st.sub === 'swap' || st.sub === 'approach')) { if (st.sub === 'swap') { inp.virtual[0].b = true; inp.virtual[1].b = true; } else inp.virtual[st.leverP].b = true; }
      }
      if (sk.drop && window.__dropT == null && st.sub === 'seg' && st.segHits === 2 && st.seg === 1) window.__dropT = st.T;
      inp.update(); mode.update(dt);
    }
    const st = inst.dbg.state();
    return { st, log, finished: mode.finished, result: mode.result, guard };
  }, { sk: SK[name], seed: 12345 });
  console.log(`\n=== ${name} ===`);
  console.log(res.log.join('\n'));
  const s = res.st;
  console.log(`end: phase=${s.phase} x=${s.x.toFixed(1)} timeLeft=${s.timeLeft.toFixed(1)} bestCombo=${s.bestCombo} perfects=${s.perfects} hits=${s.hitsTotal} misses=${s.missesTotal} slips=${s.slips} bonks=${s.bonks} finished=${res.finished}`);
  if (res.result) console.log(`RESULT stars=${res.result.stars} score=${res.result.score} summary=${res.result.summary.replace(/<[^>]+>/g, '')}`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
  await browser.close();
}
server.close();
