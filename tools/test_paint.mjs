// Gebruik: node tools/test_paint.mjs [scenario...]
// scenario: bots (normaal potje), p0 (alleen Wes speelt), p1 (alleen Jor), idle (niemand; verlenging/gelijkspel), twists (alle twists, kort),
//           shots (screenshots van sponge/emmer/finale), deurman (onDeurman direct aanroepen)
// Versneld (zonder renderen) potjes Verfgevecht spelen met bots; controleert dat finishPvp altijd wordt aangeroepen.
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

async function open(browser, twist) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=paint&quality=low&scare=0${twist ? '&twist=' + twist : ''}`);
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
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    const N = 12, TS = 1.5; const cellC = (g) => (g - 5.5) * TS;
    let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__mode = 'bots'; window.__skill = [1, 1];
    window.__bot = (n, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) {
          const v = inp.virtual[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          const skill = window.__skill[i]; if (!skill || window.__mode === 'idle') continue;
          const me = inst.dbg.pl[i], id = i + 1; const gx = Math.min(11, Math.max(0, Math.floor(me.x / TS + 6))), gz = Math.min(11, Math.max(0, Math.floor(me.z / TS + 6)));
          // dichtstbijzijnde tegel die niet van mij is
          let best = null, bd = 1e9;
          for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { if (inst.dbg.owner[z * N + x] === id) continue; const d = Math.hypot(x - gx, z - gz) + rnd() * 1.5; if (d < bd) { bd = d; best = [x, z]; } }
          const sp = st.sponge; let ax = 0, az = 0;
          if (best) { ax = cellC(best[0]) - me.x; az = cellC(best[1]) - me.z; }
          if (sp.on && Math.hypot(sp.x - me.x, sp.z - me.z) < 3.2 && rnd() < 0.5) { ax = sp.x - me.x; az = sp.z - me.z; } // stuur slijm weg
          const l = Math.hypot(ax, az) || 1; v.x = ax / l; v.y = az / l;
          if (me.charges >= 1 && rnd() < 0.03 * skill) v.a = true;
          if (me.dashCd <= 0 && rnd() < 0.02 * skill) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { page, errors };
}

for (const name of scen) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  if (name === 'twists') {
    for (const tw of TWISTS) {
      const { page, errors } = await open(browser, tw);
      const res = await page.evaluate(() => { const m = window.__app.mode; let g = 0; while (!m.finished && g++ < 60 * 200) window.__bot(1); const st = m.instance.dbg.state(); return { fin: m.finished, T: st.T, sc: st.sc, w: m.result && m.result.winner, tw: m.twist.id, sz: st.p.map((p) => +p.sz.toFixed(2)) }; });
      console.log('twist', tw, JSON.stringify(res), errors.length ? 'ERRORS ' + errors.slice(0, 3).join('|') : 'ok');
      await page.close();
    }
  } else if (name === 'bots' || name === 'p0' || name === 'p1' || name === 'idle') {
    for (const run of [0, 1, 2]) {
      const { page, errors } = await open(browser, run === 0 ? null : TWISTS[run * 3]);
      const res = await page.evaluate((nm) => {
        window.__mode = nm === 'idle' ? 'idle' : 'bots'; if (nm === 'p0') window.__skill = [1.3, 0]; if (nm === 'p1') window.__skill = [0, 1.3];
        const m = window.__app.mode; let g = 0; while (!m.finished && g++ < 60 * 200) window.__bot(1);
        const st = m.instance.dbg.state(); return { fin: m.finished, T: +st.T.toFixed(1), sc: st.sc, cnt: st.cnt, w: m.result && m.result.winner, tw: m.twist.id, over: st.over, stats: st.stats, sum: m.result && m.result.summary.replace(/<[^>]+>/g, ' ') };
      }, name);
      console.log(name, 'run', run, JSON.stringify(res), errors.length ? 'ERRORS ' + errors.slice(0, 3).join('|') : 'ok');
      await page.close();
    }
  } else if (name === 'deurman') {
    const { page, errors } = await open(browser, 'deurman');
    const res = await page.evaluate(() => { window.__bot(60 * 20); const i = window.__app.mode.instance; const a = i.dbg.state().cnt.slice(); i.onDeurman([true, false]); const b = i.dbg.state(); window.__bot(2); return { a, b: window.__app.mode.instance.dbg.state().cnt }; });
    console.log('deurman', JSON.stringify(res), errors.length ? 'ERRORS ' + errors.join('|') : 'ok');
  } else if (name === 'shots') {
    const { page, errors } = await open(browser, process.env.TW || null);
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/paint_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => window.__bot(60 * 6)); await shot('early');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; const p = d.pl[1]; d.setSponge(p.x - 5, p.z, 9, 0); window.__bot(40); }); await shot('sponge');
    await page.evaluate(() => window.__bot(60 * 12, (s) => s.bucket.on)); await shot('bucket');
    await page.evaluate(() => window.__bot(60 * 40, (s) => s.finalMode)); await page.evaluate(() => window.__bot(30)); await shot('final');
    await page.evaluate(() => window.__bot(60 * 120)); await page.evaluate(() => { window.__app.mode.paused = false; }); await page.waitForTimeout(2500); await shot('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
  }
  await browser.close();
}
server.close();
