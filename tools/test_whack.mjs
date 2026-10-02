// Gebruik: node tools/test_whack.mjs [scenario...]   scenario: fast avg slow mash idle shots
// Versnelde (niet-gerenderde) simulatie van de minigame met een bot; 'shots' maakt screenshots op belangrijke momenten.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const GAME = process.env.GAME || 'whack';
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
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['fast', 'avg', 'slow', 'mash', 'idle'];
const SK = {
  fast: { react: 0.22, move: 0.11, swingD: 0.06, sd: 0.08, bad: 0.0 },
  avg: { react: 0.42, move: 0.18, swingD: 0.1, sd: 0.14, bad: 0.04 },
  slow: { react: 0.65, move: 0.26, swingD: 0.16, sd: 0.22, bad: 0.12 },
  mash: { mash: true }, idle: { idle: true },
};

for (const name of scen) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=${GAME}&quality=${process.env.Q || 'low'}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  // bot installeren
  await page.evaluate(({ sk, seed }) => {
    const app = window.__app, mode = app.mode, inst = mode.instance, inp = app.input;
    let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
    const seen = new Map(); const B = [{ tgt: null, nextMove: 0, nextSwing: 0, swings: 0 }, { tgt: null, nextMove: 0, nextSwing: 0, swings: 0 }];
    const gplan = [null, null];
    window.__step = (n, stopFn) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !mode.finished; k++) {
        const st = inst.dbg.state(); if (stopFn && stopFn(st)) return true;
        for (const i of [0, 1]) { const v = inp.virtual[i]; v.a = v.up = v.down = v.left = v.right = false; }
        if (!sk.idle) {
          if (sk.mash) {
            for (const i of [0, 1]) { const v = inp.virtual[i]; if (rnd() < 0.5) v.a = true; if (rnd() < 0.3) { const d = Math.floor(rnd() * 4); v[['up', 'down', 'left', 'right'][d]] = true; } }
          } else {
            const acts = inst.dbg.actors(); const gi = inst.dbg.giant();
            for (const a of acts) if (!seen.has(a.id)) seen.set(a.id, st.T);
            for (const i of [0, 1]) {
              const b = B[i]; const me = st.p[i]; const v = inp.virtual[i];
              if (me.stun > 0) continue;
              // reuzenmol?
              if (gi && gi.state !== 'rise' || (gi && gi.r > 0.5)) {
                const cell = gi.cells[i]; b.tgt = null;
                if (!seen.has('g' + gi.cells[0])) seen.set('g' + gi.cells[0], st.T);
                if (st.T - seen.get('g' + gi.cells[0]) < sk.react) continue;
                if (me.col !== cell[0] || me.row !== cell[1]) {
                  if (st.T >= b.nextMove) { b.nextMove = st.T + sk.move; if (me.col < cell[0]) v.right = true; else if (me.col > cell[0]) v.left = true; else if (me.row < cell[1]) v.down = true; else v.up = true; }
                } else {
                  if (!gplan[i]) gplan[i] = st.T + 0.15 + (i ? 1 : 0) * Math.abs(gauss()) * sk.sd * 1.4 + (i ? 0 : 0);
                  if (gi.firstHit && gi.firstHit.p !== i) gplan[i] = Math.min(gplan[i], st.T + 0.05 + Math.abs(gauss()) * sk.sd * 0.6);
                  if (st.T >= gplan[i] && st.T >= b.nextSwing) { v.a = true; b.nextSwing = st.T + 0.3; gplan[i] = null; }
                }
                continue;
              } else gplan[i] = null;
              // doel kiezen
              const other = B[1 - i].tgt;
              const ok = (a) => (a.kind === 'mole' || a.kind === 'golden' || a.kind === 'helmet') && a.r > 0.4 && a.state !== 'bonk' && a.state !== 'down' && st.T - seen.get(a.id) >= sk.react && a.left > 0.2 && !(other && other.id === a.id);
              if (b.tgt && !acts.find((a) => a.id === b.tgt.id && ok({ ...a, id: -1 }) )) b.tgt = null;
              if (!b.tgt) {
                let best = null, bd = 99;
                for (const a of acts) { if (!ok(a)) continue; const d = Math.abs(a.col - me.col) + Math.abs(a.row - me.row) - (a.kind === 'golden' ? 2 : 0); if (d < bd) { bd = d; best = a; } }
                // af en toe een foute keuze (bom of stekelvarken)
                if (!best && rnd() < sk.bad * 0.02) { const bad = acts.find((a) => (a.kind === 'bomb' || a.kind === 'hedgehog') && a.r > 0.4); if (bad) best = bad; }
                if (best) b.tgt = { id: best.id, col: best.col, row: best.row, kind: best.kind };
              }
              if (b.tgt) {
                if (me.col !== b.tgt.col || me.row !== b.tgt.row) {
                  if (st.T >= b.nextMove) { b.nextMove = st.T + sk.move + Math.abs(gauss()) * 0.03; if (me.col < b.tgt.col) v.right = true; else if (me.col > b.tgt.col) v.left = true; else if (me.row < b.tgt.row) v.down = true; else v.up = true; }
                } else if (st.T >= b.nextSwing) {
                  v.a = true; b.nextSwing = st.T + sk.swingD + (b.tgt.kind === 'helmet' ? 0.25 : 0.12);
                  b.swings++;
                  if (b.tgt.kind !== 'helmet' || b.swings % 2 === 0) { /* gedaan na treffer: doel blijft tot het weg is */ }
                }
              }
            }
          }
        }
        inp.update(); mode.update(dt);
      }
      return false;
    };
  }, { sk: SK[name] || SK.avg, seed: 4242 });

  if (name === 'kinds') {
    await page.evaluate(() => { const inst = window.__app.mode.instance; const d = inst.dbg; d.spawn('mole', 0, 0); d.spawn('golden', 1, 0); d.spawn('helmet', 2, 0); d.spawn('bomb', 3, 0); d.spawn('hedgehog', 0, 1); d.spawn('mole', 1, 1); d.spawn('golden', 3, 2); window.__step(40); window.__app.mode.paused = true; });
    await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/${GAME}_kinds.png` });
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  if (name === 'giant') {
    const out = await page.evaluate(() => {
      const app = window.__app, mode = app.mode, inst = mode.instance, inp = app.input; const log = [];
      const dt = 1 / 60;
      const step = (n, f) => { for (let k = 0; k < n; k++) { for (const i of [0, 1]) { const v = inp.virtual[i]; v.a = v.up = v.down = v.left = v.right = false; } if (f) f(k); inp.update(); mode.update(dt); } };
      // wacht op reuzenmol
      let g = 0; while (g++ < 60 * 30) { step(1); const gi = inst.dbg.giant(); if (gi && gi.state === 'up') break; }
      const gi0 = inst.dbg.giant(); log.push('giant at ' + JSON.stringify(gi0.cells) + ' left=' + gi0.left.toFixed(1));
      // navigeren
      const goto = (i, cell) => { for (let n = 0; n < 12; n++) { const me = inst.dbg.state().p[i]; if (me.col === cell[0] && me.row === cell[1]) return; step(1, () => { const v = inp.virtual[i]; if (me.col < cell[0]) v.right = true; else if (me.col > cell[0]) v.left = true; else if (me.row < cell[1]) v.down = true; else v.up = true; }); step(5); } };
      goto(0, gi0.cells[0]); goto(1, gi0.cells[1]);
      log.push('positions ' + JSON.stringify(inst.dbg.state().p.map((q) => [q.col, q.row])) + ' giant left=' + inst.dbg.giant().left.toFixed(1));
      const k0 = inst.dbg.state().giantsKilled;
      // A: alleen speler 0 slaat (2x)
      step(1, () => { inp.virtual[0].a = true; }); step(40); step(1, () => { inp.virtual[0].a = true; }); step(40);
      log.push('A killed=' + (inst.dbg.state().giantsKilled - k0) + ' firstHit=' + JSON.stringify(inst.dbg.giant()?.firstHit));
      // B: 0 slaat, 1 slaat 0.6 s later
      step(1, () => { inp.virtual[0].a = true; }); step(36); step(1, () => { inp.virtual[1].a = true; }); step(40);
      log.push('B (te laat) killed=' + (inst.dbg.state().giantsKilled - k0) + ' left=' + (inst.dbg.giant()?.left ?? -1).toFixed(1));
      // C: 0 slaat, 1 slaat 0.25 s later
      step(1, () => { inp.virtual[0].a = true; }); step(14); step(1, () => { inp.virtual[1].a = true; }); step(30);
      log.push('C (samen) killed=' + (inst.dbg.state().giantsKilled - k0) + ' score=' + inst.dbg.state().score);
      return log;
    });
    console.log(out.join('\n'));
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const marks = [['t5', 's.T>5'], ['t12', 's.T>12'], ['giant', 'false']];
    for (const [tag, cond] of [['early', 's.T>6'], ['mid', 's.T>14.5'], ['late', 's.T>26']]) {
      await page.evaluate((c) => window.__step(60 * 60, new Function('s', 'return ' + c)), cond);
      await page.evaluate(() => { window.__app.mode.paused = true; });
      await page.waitForTimeout(700);
      await page.screenshot({ path: `/tmp/${GAME}_${tag}.png` });
      await page.evaluate(() => { window.__app.mode.paused = false; });
      console.log('shot', tag);
    }
    await page.evaluate(() => { window.__app.mode.paused = false; });
    for (let k = 0; k < 400; k++) { const ok = await page.evaluate(() => { window.__step(1); const st = window.__app.mode.instance.dbg.state(); return st.p.some((q) => q.sw > 0.06 && q.sw < 0.12); }); if (ok) break; }
    await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/${GAME}_swing.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot swing');
    // wacht tot reuzenmol zichtbaar
    for (let k = 0; k < 40; k++) { const ok = await page.evaluate(() => { window.__step(10); const g = window.__app.mode.instance.dbg.giant(); return g && g.state === 'up'; }); if (ok) break; }
    await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/${GAME}_giant.png` }); console.log('shot giant');
    await page.evaluate(() => window.__step(60 * 80));
    await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/${GAME}_end.png` });
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  const res = await page.evaluate(() => {
    window.__step(60 * 80);
    const mode = window.__app.mode;
    return { st: mode.instance.dbg.state(), finished: mode.finished, result: mode.result };
  });
  console.log(`\n=== ${name} ===`);
  const s = res.st;
  console.log(`score=${s.score} combo(best)=${s.bestCombo} moles=${s.molesHit} gold=${s.goldenHit} helmet=${s.helmetHit} bombs=${s.bombsHit} hedge=${s.hedgeHit} escaped=${s.escaped} team=${s.teamBonuses} whiffs=${s.whiffs} giants=${s.giantsKilled}/${s.giantsSeen} finished=${res.finished}`);
  if (res.result) console.log(`RESULT stars=${res.result.stars} :: ${res.result.summary.replace(/<[^>]+>/g, ' ').slice(0, 220)}`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
  await browser.close();
}
server.close();
