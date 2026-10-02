// Gebruik: node tools/test_vines.mjs [bots|twists|idle|oneside|shots] [twist-id]
// Versneld (zonder renderen) potjes Lianen-Zwaaien laten spelen door bots; rapporteert winnaars, duur, fouten.
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
const args = process.argv.slice(2);
const scen = args[0] || 'bots';
const ALL_TW = ['none', 'invert', 'swapab', 'drunk', 'bodyswap', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'deurman'];

async function open(twist, extra = '') {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|ERR_/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=vines&quality=low${twist ? '&twist=' + twist : ''}${extra}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 3000) { inp.update(); mode.update(0.016); }
  });
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    const B = [0, 1].map(() => ({ hist: [] }));
    window.__bot = (n, opt = {}, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) { const v = inp.virtual[i]; v.left = v.right = v.up = v.down = v.a = v.b = false; v.x = 0; v.y = 0; }
        if (!opt.idle) {
          for (const c of [0, 1]) {
            const phys = st.swapped ? 1 - c : c, p = st.p[c], v = inp.virtual[phys];
            const skill = opt.skill?.[c] ?? 0.8;
            const inv = st.twist === 'invert' ? -1 : 1; const sw = st.twist === 'swapab';
            const hold = () => { if (sw) v.b = true; else v.a = true; };
            const yell = () => { if (sw) v.a = true; else v.b = true; };
            if (p.state === 'hang') {
              let rel = false;
              const dirw = Math.abs(p.w) > 0.05 ? Math.sign(p.w) : 1;
              if (Math.random() < skill) v.x = dirw * inv * (Math.random() < 0.9 ? 1 : -1);
              else v.x = (Math.random() - 0.5) * 2 * inv;
              if (Math.random() < 0.002 * (1 - skill) * 60) { /* verdwaald */ }
              const bb = B[c]; bb.hist.push(inst.dbg.predict(c)); if (bb.hist.length > 60) bb.hist.shift();
              const lagF = opt.react ?? 0; const seen = bb.hist[bb.hist.length - 1 - lagF] || false;
              if (seen && Math.random() < 0.16 * (0.4 + skill)) rel = true;
              if (p.rotT > 2.8) rel = true;
              if (opt.sloppy?.[c] && Math.abs(p.th) > 0.9 && p.w > 0.5 && Math.random() < 0.15) rel = true;
              if (!rel) hold();
              if (p.cd <= 0 && Math.abs(p.th) < 0.6 && Math.random() < 0.01 * skill) yell();
            } else if (p.state === 'fly') {
              hold(); if (p.cd <= 0 && p.vx < 6 && Math.random() < 0.08) yell();
            }
          }
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page, errors };
}

async function runMatch(page, opt) {
  return page.evaluate((opt) => {
    const m = window.__app.mode, inst = m.instance;
    let guard = 0;
    while (!m.finished && guard++ < 60 * 220) window.__bot(1, opt);
    const st = inst.dbg.state();
    return { finished: m.finished, res: m.result && { winner: m.result.winner, score: m.result.scoreArr, summary: m.result.summary.replace(/<[^>]+>/g, ' ') }, t: st.playT, stats: st.p.map((p) => ({ fa: p.falls, ba: p.bananas, ye: p.yells, pct: p.pct })) };
  }, opt);
}

if (scen === 'bots' || scen === 'twists') {
  const tws = scen === 'twists' ? ALL_TW : [args[1] || 'none'];
  for (const tw of tws) {
    const tally = [0, 0, 0]; const durs = [];
    for (let rep = 0; rep < (scen === 'twists' ? 2 : 6); rep++) {
      const { browser, page, errors } = await open(tw);
      const skill = rep % 3 === 0 ? [0.8, 0.8] : rep % 3 === 1 ? [0.6, 0.95] : [0.95, 0.6];
      const r = await runMatch(page, { skill });
      if (!r.finished) console.log('  !! NIET AFGEROND', tw, JSON.stringify(r));
      const w = r.res ? r.res.winner : -1; tally[w == null ? 2 : w]++; durs.push(Math.round(r.t));
      console.log(`  [${tw}] rep${rep} skill=${skill} winner=${w} score=${r.res && r.res.score} t=${r.t.toFixed(1)} stats=${JSON.stringify(r.stats)}`);
      if (errors.length) console.log('  ERRORS:', errors.slice(0, 5).join('\n'));
      await browser.close();
    }
    console.log(`== ${tw}: wins Wes/Jor/gelijk = ${tally.join('/')}  duur(s) = ${durs.join(',')}`);
  }
} else if (scen === 'idle') {
  const { browser, page, errors } = await open(args[1] || 'none');
  const r = await runMatch(page, { idle: true });
  console.log('idle ->', JSON.stringify(r));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
  await browser.close();
} else if (scen === 'oneside') {
  for (const who of [0, 1]) {
    const { browser, page, errors } = await open(args[1] || 'none');
    const r = await runMatch(page, { skill: who === 0 ? [0.9, -1] : [-1, 0.9] , sloppy: [false, false] });
    console.log(`only ${who} plays -> winner ${r.res && r.res.winner}  score ${r.res && r.res.score} t=${r.t.toFixed(1)}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
    await browser.close();
  }
} else if (scen === 'trace') {
  const { browser, page, errors } = await open(args[1] || 'none');
  const out = await page.evaluate(() => { const rows = []; const inst = window.__app.mode.instance; for (let k = 0; k < 60 * 30; k += 15) { window.__bot(15, { skill: [0.9, 0.8] }); const s = inst.dbg.state(); rows.push(`t=${s.playT.toFixed(1)} ` + s.p.map((p) => `${p.state}/v${p.vine} th=${p.th.toFixed(2)} w=${p.w.toFixed(2)} x=${p.x.toFixed(1)} y=${p.y.toFixed(1)} pct=${p.pct}`).join(' | ')); if (window.__app.mode.finished) break; } return rows; });
  console.log(out.join('\n'));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
  await browser.close();
} else if (scen === 'window') {
  const { browser, page, errors } = await open(args[1] || 'none');
  const out = await page.evaluate(() => {
    const inst = window.__app.mode.instance; const rows = [];
    // pomp met bot zonder te loslaten tot amplitude groot
    let g = 0; while (g++ < 60 * 20) { window.__bot(1, { skill: [1, 1], react: 9999 }); const s = inst.dbg.state(); if (Math.abs(s.p[0].th) > 1.0) break; }
    for (let k = 0; k < 60 * 4; k++) { window.__bot(1, { skill: [1, 1], react: 9999 }); const s = inst.dbg.state(); rows.push(`${(k / 60).toFixed(2)} th=${s.p[0].th.toFixed(2)} w=${s.p[0].w.toFixed(2)} ${inst.dbg.predict(0) ? 'CATCH' : '.'}`); }
    return rows.filter((_, i) => i % 3 === 0);
  });
  console.log(out.join('\n'));
  await browser.close();
} else if (scen === 'falls') {
  const { browser, page, errors } = await open(args[1] || 'none');
  const out = await page.evaluate(() => { const inst = window.__app.mode.instance; let g = 0; while (!window.__app.mode.finished && g++ < 60 * 100) window.__bot(1, { skill: [0.6, 0.6] }); return inst.dbg.log.map((l) => JSON.stringify(l)); });
  console.log(out.join('\n'));
  await browser.close();
} else if (scen === 'shots') {
  const tw = args[1] || 'none';
  const { browser, page, errors } = await open(tw);
  const shot = async (name) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/vines_${name}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', name); };
  await shot('start');
  await page.evaluate(() => window.__bot(60 * 6, { skill: [0.9, 0.8] }));
  await shot('play1');
  await page.evaluate(() => window.__bot(60 * 40, { skill: [0.9, 0.8] }, (s) => s.p.some((p) => p.state === 'fly')));
  await shot('fly');
  await page.evaluate(() => window.__bot(60 * 40, { skill: [0.9, 0.8] }, (s) => s.p.some((p) => p.state === 'swim')));
  await page.evaluate(() => window.__bot(40, { skill: [0.9, 0.8] }));
  await shot('swim');
  await page.evaluate(() => { window.__app.mode.instance.dbg.launchBanana(); window.__bot(60 * 1.2, { skill: [0.9, 0.8] }); });
  await shot('banana');
  await page.evaluate(() => window.__bot(60 * 14, { skill: [0.9, 0.8] }));
  await shot('mid');
  await page.evaluate(() => window.__bot(60 * 200, { skill: [0.9, 0.7] }));
  await page.evaluate(() => { for (let k = 0; k < 40; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } });
  await shot('end');
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
  await browser.close();
}
server.close();
