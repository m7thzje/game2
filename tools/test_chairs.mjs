// Gebruik: node tools/test_chairs.mjs [scenario ...]
//  bots   : meerdere potjes waarin beide broers door de AI worden bestuurd (met verschillende twists); rapporteert duur, winnaar, ronde-verloop
//  idle   : niemand drukt iets in (brothers staan stil) -> potje moet toch eindigen met finishPvp
//  input  : controleer lopen / zitten / duiken / duwen met echte (virtuele) toetsen
//  shots  : screenshots van de belangrijkste momenten (muziek, stop, gouden stoel, ontploffende stoel, uitvallen, trofee)
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
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const allErrors = [];

async function open(twist = 'none', size = [1100, 650]) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) allErrors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => allErrors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=chairs&twist=${twist}&scare=0&quality=low`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    try { const am = await import('/src/engine/audio.js'); am.audio.init(); window.__audioOK = !!am.audio.ctx; } catch (e) { window.__audioOK = 'err ' + e.message; }
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    window.__step = (n) => { for (let k = 0; k < n && !mode.finished; k++) { inp.update(); mode.update(1 / 60); } };
  });
  return page;
}

for (const name of scen) {
  if (name === 'bots') {
    const twists = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
    const wins = [0, 0, 0]; const N = +process.env.N || twists.length;
    for (let g = 0; g < N; g++) {
      const tw = process.env.TW || twists[g % twists.length];
      const page = await open(tw);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, d = m.instance.dbg; d.auto(0); d.auto(1);
        const log = []; let last = ''; let guard = 0;
        while (!m.finished && guard++ < 60 * 400) {
          window.__step(2);
          const s = d.state(); const key = s.n + s.rs;
          if (key !== last) { last = key; log.push(`T=${s.T.toFixed(1)} r${s.n} ${s.rs} ${s.gimmick || ''} chairs=${s.chairsN} alive=${s.alive.map((x) => (x ? 1 : 0)).join('')} modes=${s.modes.join(',')}`); }
        }
        return { fin: m.finished, st: d.state(), result: m.result, log };
      });
      const w = res.result ? res.result.winner : 'x'; wins[w === null || w === 'x' ? 2 : w]++;
      console.log(`game ${g} twist=${tw} fin=${res.fin} winner=${w} score=${res.result && res.result.scoreArr} T=${res.st.T.toFixed(1)} out=${res.st.outRound} bonks=${res.st.bonks} :: ${res.result ? res.result.summary.replace(/<[^>]+>/g, '') : ''}`);
      if (g === 0 || process.env.LOG) console.log(res.log.join('\n'));
      await page.close();
    }
    console.log('winners [Wes,Jor,none]', wins);
  } else if (name === 'idle') {
    for (const tw of ['none', 'lowgrav']) {
      const page = await open(tw);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, d = m.instance.dbg; let guard = 0;
        while (!m.finished && guard++ < 60 * 400) window.__step(6);
        return { fin: m.finished, st: d.state(), result: m.result };
      });
      console.log(`idle twist=${tw} fin=${res.fin} winner=${res.result && res.result.winner} T=${res.st.T.toFixed(1)} out=${res.st.outRound} :: ${res.result ? res.result.summary.replace(/<[^>]+>/g, '') : ''}`);
      await page.close();
    }
  } else if (name === 'gim') {
    for (const g of ['smoky', 'runaway']) {
      const page = await open(process.env.TWIST || 'none');
      const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); for (let k = 0; k < 4; k++) { try { await page.screenshot({ path: `/tmp/chairs_${tag}.png`, timeout: 90000 }); break; } catch (e) { await page.waitForTimeout(1500); } } await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
      const until = (cond, max = 6000) => page.evaluate(({ cond, max }) => { const d = window.__app.mode.instance.dbg; const f = new Function('s', 'd', 'return ' + cond); let g = 0; while (!f(d.state(), d) && g++ < max && !window.__app.mode.finished) window.__step(1); return d.state().T; }, { cond, max });
      await page.evaluate((g) => { const d = window.__app.mode.instance.dbg; d.auto(0); d.auto(1); d.R.gimmicks = g === 'smoky' ? ['smoky', 'runaway'] : ['runaway', 'smoky']; }, g);
      await until('s.rs==="stop"');
      if (g === 'smoky') {
        await until('d.chairs.some(c => c.kind==="smoky" && c.fuse>0.3)'); await snap('smoky_fuse');
        await until('d.chairs.some(c => c.boomed)'); await page.evaluate(() => window.__step(8)); await snap('smoky_boom');
        await page.evaluate(() => window.__step(30)); await snap('smoky_fly');
      } else {
        await page.evaluate(() => window.__step(30)); await snap('runaway1');
        await page.evaluate(() => window.__step(30)); await snap('runaway2');
      }
      await page.close();
    }
  } else if (name === 'elim') {
    for (const k of ['trap', 'spring']) {
      const page = await open('none');
      const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); for (let q = 0; q < 4; q++) { try { await page.screenshot({ path: `/tmp/chairs_${tag}.png`, timeout: 90000 }); break; } catch (e) { await page.waitForTimeout(1500); } } await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
      const until = (cond, max = 6000) => page.evaluate(({ cond, max }) => { const d = window.__app.mode.instance.dbg; const f = new Function('s', 'd', 'return ' + cond); let g = 0; while (!f(d.state(), d) && g++ < max && !window.__app.mode.finished) window.__step(1); return d.state().T; }, { cond, max });
      await page.evaluate((k) => { const d = window.__app.mode.instance.dbg; d.auto(0); d.auto(1); d.setElim(k); }, k);
      await until('s.rs==="elim"');
      await page.evaluate(() => window.__step(50)); await snap(k + '_a');
      await page.evaluate(() => window.__step(20)); await snap(k + '_b');
      await page.evaluate(() => window.__step(20)); await snap(k + '_c');
      await page.close();
    }
  } else if (name === 'human') {
    // een "mens" (virtuele toetsen) speelt Wes tegen de AI; kijkt of de echte besturing werkt
    for (const tw of ['none', 'invert', 'swapab']) {
      const page = await open(tw);
      const res = await page.evaluate(() => {
        const app = window.__app, m = app.mode, d = m.instance.dbg, inp = app.input; d.auto(1);
        const v = inp.virtual[0]; const out = { audio: window.__audioOK }; let guard = 0; const E0 = d.E[0];
        const inv = window.__app.mode.twist.id === 'invert', swp = window.__app.mode.twist.id === 'swapab';
        while (!m.finished && guard++ < 60 * 400) {
          const s = d.state();
          v.x = 0; v.y = 0; v.a = false; v.b = false;
          if (s.rs === 'music' || s.rs === 'fake' || s.rs === 'intro') { /* rondjes lopen */ const a = Math.atan2(E0.z, E0.x) + 0.3; const tx = Math.cos(a) * 5.8 - E0.x, tz = Math.sin(a) * 5.8 - E0.z; const l = Math.hypot(tx, tz) || 1; v.x = tx / l * (inv ? -1 : 1); v.y = tz / l * (inv ? -1 : 1); }
          if (s.rs === 'stop' && s.mode !== 'sit') {
            let best = null, bd = 99; for (const c of d.chairs) if (c.active && !c.occupant && c.state === 'idle') { const dd = Math.hypot(c.x - E0.x, c.z - E0.z); if (dd < bd) { bd = dd; best = c; } }
            if (best && E0.mode === 'walk') { const l = bd || 1; v.x = (best.x - E0.x) / l * (inv ? -1 : 1); v.y = (best.z - E0.z) / l * (inv ? -1 : 1); if (bd < 3.2 && Math.floor(s.T * 10) % 2 === 0) { if (swp) v.b = true; else v.a = true; } }
          }
          if (s.rs === 'pick' && s.alive[0]) { if (swp) v.b = true; else v.a = true; }
          inp.update(); m.update(1 / 60);
        }
        v.x = v.y = 0; v.a = v.b = false;
        out.fin = m.finished; out.st = d.state(); out.res = m.result && { w: m.result.winner, sc: m.result.scoreArr };
        return out;
      });
      console.log('human', tw, JSON.stringify({ audio: res.audio, fin: res.fin, out: res.st.outRound, bonks: res.st.bonks, res: res.res, T: +res.st.T.toFixed(1) }));
      await page.close();
    }
  } else if (name === 'input') {
    const page = await open('none');
    const res = await page.evaluate(() => {
      const app = window.__app, m = app.mode, d = m.instance.dbg, inp = app.input; const out = {};
      const step = (n, f) => { for (let k = 0; k < n; k++) { if (f) f(k); inp.update(); m.update(1 / 60); } };
      step(200); out.state0 = d.state().rs;      // intro van de ronde (2 s) -> muziek
      const e = d.E[0]; const x0 = e.x, z0 = e.z;
      inp.virtual[0].x = 1; step(30); inp.virtual[0].x = 0; out.moved = Math.hypot(e.x - x0, e.z - z0);
      // A tijdens muziek: hopje of "te vroeg"
      inp.virtual[0].a = true; step(2); inp.virtual[0].a = false; step(20); out.afterEarlyA = e.mode;
      return out;
    });
    console.log('input', JSON.stringify(res)); await page.close();
  } else if (name === 'shots') {
    const tw = process.env.TWIST || 'none';
    const page = await open(tw);
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); for (let k = 0; k < 4; k++) { try { await page.screenshot({ path: `/tmp/chairs_${tag}.png`, timeout: 90000 }); break; } catch (e) { await page.waitForTimeout(1500); } } await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    const until = (cond, max = 6000) => page.evaluate(({ cond, max }) => { const d = window.__app.mode.instance.dbg; const f = new Function('s', 'return ' + cond); let g = 0; while (!f(d.state()) && g++ < max && !window.__app.mode.finished) window.__step(1); return d.state().T; }, { cond, max });
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.auto(0); d.auto(1); });
    await until('s.rs==="music" && s.musicT>3'); await snap('music');
    await until('s.rs==="stop"'); await page.evaluate(() => window.__step(25)); await snap('stop');
    await until('s.rs==="elim"'); await page.evaluate(() => window.__step(40)); await snap('elim1');
    await page.evaluate(() => window.__step(50)); await snap('elim2');
    await until('s.n===2 && s.rs==="stop"'); await page.evaluate(() => window.__step(60)); await snap('gold_stop');
    await until('s.rs==="pick" || s.rs==="elim"'); await page.evaluate(() => window.__step(30)); await snap('pick');
    await until('s.n===3 && s.rs==="stop"'); await page.evaluate(() => window.__step(70)); await snap('r3_stop');
    await until('s.rs==="trophy"'); await page.evaluate(() => window.__step(100)); await snap('trophy');
    await page.close();
  }
}
console.log(allErrors.length ? 'ERRORS:\n' + [...new Set(allErrors)].slice(0, 10).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
