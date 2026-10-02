// Gebruik: node tools/test_chop.mjs [scenario...]   scenario: bots (standaard), twists, shots, edge
// Laat Houthakkers-Duel versneld (zonder renderen) door bots spelen: bewijst dat finishPvp altijd komt en dat beide spelers kunnen winnen.
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

const ID = 'chop';

async function open(twist = '') {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=${ID}&quality=${process.env.Q || 'low'}${twist ? '&twist=' + twist : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__prof = ['pro', 'pro'];
    const B = [0, 1].map(() => ({ next: 0.3, pend: 0 }));
    // gem. seconden tussen acties, kans op een fout (verkeerde kant)
    const GAP = { pro: 0.2, kid: 0.34, slow: 0.5, mash: 0.08, idle: 1e9 };
    const ERR = { pro: 0.02, kid: 0.12, slow: 0.08, mash: 0.5, idle: 0 };
    window.__bot = (n, stop) => {
      const dt = 1 / 60; const tw = new URLSearchParams(location.search).get('twist');
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], prof = window.__prof[i];
          v.a = false; v.b = false; v.left = false; v.right = false;
          if (prof === 'idle') continue;
          b.next -= dt; if (b.next > 0 || st.stun[i] > 0) continue;
          const nx = st.nxt[i]; const cur = st.side[i];
          let want = cur;
          if (nx[1] && nx[1][1] !== 0 && nx[0][2] <= 1) want = -nx[1][1]; else if (nx[0][1] !== 0) want = -nx[0][1];
          if (rnd() < ERR[prof]) want = -want;
          const chopKey = tw === 'swapab' ? 'b' : 'a', swKey = tw === 'swapab' ? 'a' : 'b';
          if (want !== cur && prof !== 'mash') { v[swKey] = true; b.next = 0.05; }
          else { v[chopKey] = true; b.next = GAP[prof] * (0.85 + rnd() * 0.3); }
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page, errors };
}
const summarize = (r) => `T=${r.T.toFixed(1)}s winner=${r.winner} chopped=${r.chopped} hits=${r.hits} cb=${r.uses} fin=${r.fin} :: ${r.res}`;
async function runGame(page, profs) {
  return page.evaluate((profs) => {
    window.__prof = profs; const m = window.__app.mode, inst = m.instance; let g = 0;
    while (!m.finished && g++ < 60 * 200) window.__bot(1);
    const st = inst.dbg.state();
    return { T: st.T, winner: m.result ? m.result.winner : 'NONE', chopped: st.chopped, hits: st.hits, uses: st.uses, fin: m.finished, res: m.result ? m.result.summary.replace(/<[^>]+>/g, ' ').slice(0, 80) + ' | ' + m.result.scoreArr : '' };
  }, profs);
}


for (let trial = 0; trial < 14; trial++) {
const { browser, page, errors } = await open('');
const out = await page.evaluate(() => { window.__prof = ['kid', 'kid']; const m = window.__app.mode, inst = m.instance; let last = -1, stuck = null; for (let g = 0; g < 60 * 60 && !m.finished; g++) { window.__bot(1); const st = inst.dbg.state(); if (st.hits[0] >= 6 && !stuck) { stuck = JSON.stringify({ T: st.T, chopped: st.chopped, side: st.side, nxt: st.nxt, stun: st.stun, hits: st.hits, seq: inst.dbg.seq.map((i) => i.type[0] + (i.side || '') + (i.hz ? i.hz[0] : '')).join(' ') }); break; } } return stuck || ('ok ' + inst.dbg.state().T); });
console.log(trial, out);
await browser.close();
}
server.close();
