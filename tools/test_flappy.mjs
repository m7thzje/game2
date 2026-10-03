// Gebruik: node tools/test_flappy.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle | balance
//   TW=<twist-id> kiest een twist (anders: "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp precies één keer komt, wie wint, geen console-fouten.
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
let FAILS = 0; const fail = (m) => { FAILS++; console.log('FAIL:', m); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=flappy&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // telt hoe vaak finishPvp wordt aangeroepen (moet precies 1 zijn)
    window.__finishCalls = 0; const orig = mode.finishPvp.bind(mode); mode.finishPvp = (r) => { window.__finishCalls++; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1, fire: kans op vuur, style: 'race' | 'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__cfg = cfg; const B = [{ lag: 0 }, { lag: 0 }];
    const H = 10.5;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        if (stop && stop(d)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = d.D[i], b = B[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle') continue;
          const cx = d.cx(me); let ty = H / 2;
          // volgende pilaar vooruit: mik op het midden van het gat
          for (const p of d.course.pillars) { if (p.x > cx - 1.5) { if (p.x - cx < 14) ty = (p.gy0 + p.gy1) / 2; break; } }
          // vogel vlak voor me? omhoog/omlaag ontwijken en soms vuur
          for (const bd of d.course.birds) { if (bd.x > cx && bd.x - cx < 7 && Math.abs(bd.y0 - me.y) < 2.4) { ty = bd.y0 > me.y ? Math.max(2, me.y - 2) : Math.min(H - 1.5, me.y + 2); if (me.fireCd <= 0 && rnd() < c.fire) v.b = true; } }
          const target = ty - 0.5 + (1 - c.skill) * (rnd() - 0.5) * 1.5;
          b.lag -= dt;
          if (me.y < target && me.vy < 1.2 && b.lag <= 0) { v.a = true; b.lag = 0.12 + (1 - c.skill) * 0.25 * rnd(); }
          v.x = 0.5 * c.skill;
          if (me.zap && me.fireCd <= 0) v.b = true;
          if (me.fireCd <= 0 && rnd() < c.fire * 0.01) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function runMatch(tw, cfg, tag, pre) {
  const { browser, page, errors } = await open(tw);
  await installBots(page, cfg);
  if (pre) await page.evaluate(pre);
  const res = await page.evaluate(() => {
    const m = window.__app.mode, d = m.instance.dbg; const log = []; let g = 0, nextLog = 10;
    while (!m.finished && g++ < 60 * 160) {
      window.__bot(1);
      const st = d.state();
      if (st.T > nextLog) { nextLog += 10; log.push(`T=${st.T.toFixed(0)} prog=${st.d.map((q) => q.progress)} pts=${st.d.map((q) => q.pts)} hits=${st.d.map((q) => q.hits)}`); }
    }
    // laat de harness nog even doorlopen na de finish (resultaat-timer)
    for (let k = 0; k < 120; k++) { m.update(0.016); }
    return { log, st: d.state(), finished: m.finished, result: m.result, twist: m.twist.id, calls: window.__finishCalls, fps: 0 };
  });
  console.log(`\n=== ${tag} twist=${res.twist} ===`);
  console.log(res.log.join('\n'));
  const st = res.st;
  console.log(`end T=${st.T.toFixed(1)} prog=${st.d.map((q) => q.progress)} pts=${st.d.map((q) => q.pts)} hits=${st.d.map((q) => q.hits)} coins=${st.d.map((q) => q.coins)} why=${st.why} finished=${res.finished} finishCalls=${res.calls} stats=${JSON.stringify(st.stats)}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  if (res.calls !== 1) fail(`${tag}: finishPvp ${res.calls}x aangeroepen`);
  if (!res.finished) fail(`${tag}: niet afgelopen`);
  if (res.result && res.result.winner == null) fail(`${tag}: geen winnaar`);
  if (errors.length) { fail(`${tag}: console-fouten`); console.log('ERRORS:\n' + errors.slice(0, 8).join('\n')); } else console.log('NO ERRORS');
  await browser.close();
  return res;
}

const R = { skill: 0.9, fire: 0.5, style: 'race' };
for (const name of scen) {
  if (name === 'bots') {
    const tw = process.env.TW || 'none'; const W = [];
    W.push((await runMatch(tw, [{ ...R, skill: 0.95 }, { ...R, skill: 0.5 }], 'bots A>B')).result?.winner);
    W.push((await runMatch(tw, [{ ...R, skill: 0.5 }, { ...R, skill: 0.95 }], 'bots B>A')).result?.winner);
    W.push((await runMatch(tw, [{ ...R, skill: 0.8 }, { ...R, skill: 0.8 }], 'bots gelijk')).result?.winner);
    console.log('winnaars:', W.join(','));
    if (!(W.includes(0) && W.includes(1))) fail('niet beide spelers wonnen in de bot-potjes');
    continue;
  }
  if (name === 'balance') { const N = +(process.env.N || 6); const wins = [0, 0]; for (let k = 0; k < N; k++) { const r = await runMatch('none', [{ ...R, skill: 0.8 }, { ...R, skill: 0.8 }], 'balance ' + k); const w = r.result?.winner; if (w != null) wins[w]++; } console.log('BALANS Wes/Jor =', wins.join('/')); continue; }
  if (name === 'twists') { for (const t of TWISTS) await runMatch(t, [{ ...R, skill: 0.85 }, { ...R, skill: 0.7 }], 'twist'); continue; }
  if (name === 'idle') { await runMatch('none', [{ style: 'idle' }, { style: 'idle' }], 'idle'); continue; }
  if (name === 'timeout') { await runMatch('none', [{ ...R }, { ...R }], 'timeout', () => window.__app.mode.instance.dbg.setTime(6)); continue; }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ ...R, skill: 0.85 }, { ...R, skill: 0.75 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/fl_${tag}.png` }); const s = await page.evaluate(() => window.__app.mode.instance.dbg.state()); console.log('shot', tag, `T=${s.T.toFixed(1)} prog=${s.d.map((q) => q.progress)} pts=${s.d.map((q) => q.pts)}`); };
    await page.evaluate(() => window.__bot(60 * 6)); await snap('play');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'shield'); d.give(1, 'magnet'); window.__bot(40); }); await snap('shield_magnet');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'giant'); d.give(1, 'zap'); window.__bot(60); }); await snap('giant_zap');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setProgress(0, 300); d.setProgress(1, 240); d.hurt(1); window.__bot(20); }); await snap('dizzy');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setProgress(0, 700); d.setProgress(1, 690); window.__bot(60 * 4); }); await snap('finish');
    await page.evaluate(() => window.__bot(60 * 3)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('shots: fouten');
    await browser.close(); continue;
  }
}
server.close();
console.log(FAILS ? `\n${FAILS} FOUT(EN)` : '\nALLES OK');
process.exit(FAILS ? 1 : 0);
