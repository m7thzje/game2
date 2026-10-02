// Gebruik: node tools/test_screws.mjs [scenario...]   scenario: bots (standaard), twists, shots, edge
// Laat Schroef-Duel versneld (zonder renderen) door bots spelen: bewijst dat finishPvp altijd komt en dat beide spelers kunnen winnen.
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
const ID = 'screws';

async function open(twist = '', extra = '') {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=${ID}&quality=${process.env.Q || 'low'}${twist ? '&twist=' + twist : ''}${extra}`);
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
    const COL = [-6.8, 6.8];
    window.__prof = ['pro', 'pro'];
    const B = [0, 1].map(() => ({ next: 0.3, btn: 'a', hold: 0, wipe: 0 }));
    // gap per profiel (gemiddelde seconden tussen stampen), kans op fout
    const GAP = { pro: 0.36, slow: 0.62, kid: 0.5, mash: 0.07, idle: 1e9, alt: 0.3 };
    window.__bot = (n, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], prof = window.__prof[i];
          v.a = false; v.b = false; v.left = false; v.right = false; v.down = false;
          if (prof === 'idle') continue;
          // bewegen: poep ontwijken / moersleutel pakken
          let target = 0;
          if (st.blob && st.blob.i === i) target = (st.blob.x - COL[i]) > 0 ? -1.9 : 1.9;
          else if (st.wrench && st.wrench.i === i && st.wrench.state === 'fall') target = st.wrench.off;
          if (prof !== 'mash') { const d = target - st.offX[i]; if (Math.abs(d) > 0.2) { if (d > 0) v.right = true; else v.left = true; } }
          if (st.goo[i] > 0.02 && prof !== 'mash') { b.wipe -= dt; if (b.wipe <= 0) { v.down = true; b.wipe = 0.25; } }
          b.next -= dt;
          if (st.atPatch[i] >= 0 && prof !== 'mash') {
            const nd = st.needle[i];
            if (b.next <= 0 && st.patchT[i] > 0.35 && Math.abs(nd - 0.5) < (prof === 'pro' ? 0.08 : 0.22) && (prof === 'pro' || rnd() < 0.12)) { v[b.btn] = true; b.btn = b.btn === 'a' ? 'b' : 'a'; b.next = 0.2; }
            continue;
          }
          if (b.next <= 0) {
            if (st.jam[i] > 0 && prof !== 'mash') continue;
            v[prof === 'mash' ? 'a' : b.btn] = true; if (prof !== 'mash') b.btn = b.btn === 'a' ? 'b' : 'a';
            b.next = GAP[prof] * (0.8 + rnd() * 0.4);
          }
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page, errors };
}

const summarize = (r) => `T=${r.T.toFixed(1)}s winner=${r.winner} units=${r.units.map((u) => u.toFixed(0))} quakes=${r.quakes} gnomes=${r.gnomes} fin=${r.fin} result=${r.res}`;
async function runGame(page, profs) {
  return page.evaluate((profs) => {
    window.__prof = profs;
    const m = window.__app.mode, inst = m.instance; let g = 0;
    while (!m.finished && g++ < 60 * 400) window.__bot(1);
    const st = inst.dbg.state();
    return { T: st.T, winner: m.result ? m.result.winner : 'NONE', units: st.units, quakes: st.quakes, gnomes: st.gnomes, fin: m.finished, res: m.result ? m.result.summary.replace(/<[^>]+>/g, ' ').slice(0, 90) + ' | score=' + m.result.scoreArr : '' };
  }, profs);
}

for (const name of scen) {
  if (name === 'bots') {
    const cases = [[['pro', 'slow'], ''], [['slow', 'pro'], ''], [['pro', 'pro'], ''], [['kid', 'kid'], ''], [['mash', 'pro'], ''], [['idle', 'idle'], ''], [['idle', 'kid'], '']];
    for (const [profs, tw] of cases) {
      const { browser, page, errors } = await open(tw);
      const r = await runGame(page, profs);
      console.log(profs.join('/').padEnd(12), summarize(r));
      if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 5).join('\n'));
      await browser.close();
    }
  } else if (name === 'twists') {
    for (const tw of ['none', 'invert', 'swapab', 'drunk', 'bodyswap', 'turbo', 'slowmo', 'lowgrav', 'deurman']) {
      const { browser, page, errors } = await open(tw);
      if (tw === 'deurman') await page.evaluate(() => { window.__bot(300); window.__app.mode.instance.onDeurman([true, false]); });
      const r = await runGame(page, ['pro', 'kid']);
      console.log(tw.padEnd(10), summarize(r));
      if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 5).join('\n'));
      await browser.close();
    }
  } else if (name === 'edge') {
    // beide tegelijk klaar, gnoom/aardbeving geforceerd, wedstrijd tot de noodstop
    const { browser, page, errors } = await open('');
    const r = await page.evaluate(() => {
      const m = window.__app.mode, inst = m.instance, F = inst.dbg.force; window.__prof = ['idle', 'idle'];
      F.quake(); window.__bot(120); F.raven(); F.wrench(); window.__bot(60 * 6);
      F.setUnits(0, 150); F.setUnits(1, 20); F.gnome(1); window.__bot(60 * 3);
      const mid = inst.dbg.state();
      F.setUnits(0, 221); F.setUnits(1, 221); window.__prof = ['pro', 'pro']; let g = 0; while (!m.finished && g++ < 60 * 30) window.__bot(1);
      return { mid: { gnome: mid.gnome, quakes: mid.quakes, units: mid.units }, fin: m.finished, w: m.result && m.result.winner, sc: m.result && m.result.scoreArr };
    });
    console.log('edge', JSON.stringify(r));
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close();
  } else if (name === 'jam') {
    const { browser, page, errors } = await open('none');
    await page.evaluate(() => { window.__prof = ['mash', 'pro']; window.__bot(60 * 20, (s) => s.jam[0] > 0.6); window.__bot(20); });
    await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(600); await page.screenshot({ path: '/tmp/screws_jam.png' });
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close();
  } else if (name === 'gnomecam') {
    const { browser, page, errors } = await open('none');
    await page.evaluate(() => { window.__prof = ['kid', 'kid']; const F = window.__app.mode.instance.dbg.force; F.setUnits(0, 150); F.setUnits(1, 40); F.gnome(1); window.__bot(60 * 3, (s) => s.gnome[1] > 0); window.__bot(90); });
    await page.evaluate(() => { const m = window.__app.mode; m.paused = true; const E = m.instance.dbg.E; const g = E.gnome[1]; const cam = m.camera; cam.position.set(g.position.x - 5, g.position.y + 3, 9); cam.lookAt(g.position.x - 2, g.position.y + 1, 0); });
    await page.waitForTimeout(600); await page.screenshot({ path: '/tmp/screws_gnomecam.png' });
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close();
  } else if (name === 'shots') {
    const { browser, page, errors } = await open('none');
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/screws_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => { window.__prof = ['pro', 'kid']; });
    await page.evaluate(() => window.__bot(60 * 4)); await shot('play1');
    await page.evaluate(() => { window.__app.mode.instance.dbg.force.raven(); }); await page.evaluate(() => window.__bot(60 * 1.4, (s) => s.blob)); await page.evaluate(() => window.__bot(8)); await shot('raven');
    await page.evaluate(() => { window.__app.mode.instance.dbg.force.wrench(); window.__bot(5); }); await page.evaluate(() => window.__bot(60 * 3, (s) => s.wrench && s.wrench.state === 'fall')); await page.evaluate(() => window.__bot(40)); await shot('wrench');
    await page.evaluate(() => { const F = window.__app.mode.instance.dbg.force; F.setUnits(0, 40); F.setUnits(1, 20); window.__prof = ['idle', 'kid']; }); await page.evaluate(() => { const m = window.__app.mode; const inp = window.__app.input; inp.virtual[0].a = false; let g = 0; while (g++ < 600) { const st = m.instance.dbg.state(); if (st.atPatch[0] >= 0 && st.patchT[0] > 0.6) break; inp.virtual[0].a = st.atPatch[0] < 0 && (g % 20) === 1; inp.virtual[0].b = false; inp.update(); m.update(1 / 60); } inp.virtual[0].a = false; return JSON.stringify([m.instance.dbg.state().atPatch, m.instance.dbg.state().units, g]); }).then((r) => console.log('patchstate', r)); await shot('patch');
    await page.evaluate(() => { const F = window.__app.mode.instance.dbg.force; F.setUnits(0, 120); F.setUnits(1, 60); F.gnome(1); window.__prof = ['kid', 'kid']; window.__bot(10); }); await page.evaluate(() => window.__bot(60 * 4, (s) => s.gnome[1] > 0)); await page.evaluate(() => window.__bot(100)); await shot('gnome');
    await page.evaluate(() => { window.__app.mode.instance.dbg.force.quake(); window.__bot(40); }); await shot('quake');
    await page.evaluate(() => { const F = window.__app.mode.instance.dbg.force; F.setUnits(0, 215); window.__prof = ['pro', 'kid']; }); await page.evaluate(() => window.__bot(60 * 10, (s) => s.phase === 'won')); await page.evaluate(() => { for (let k = 0; k < 160; k++) window.__app.mode.update(1 / 30); }); await shot('win');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close();
  }
}
server.close();
