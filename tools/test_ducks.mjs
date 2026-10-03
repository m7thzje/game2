// Gebruik: node tools/test_ducks.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle | events
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
  await page.goto(`http://localhost:${port}/?game=ducks&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
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

// cfg[i] = { skill 0..1, sab: kans-schaal voor saboteren (0 = niet), style: 'race' | 'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__cfg = cfg; const B = [{ t: 0 }, { t: 0 }];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        if (stop && stop(d)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = d.D[i], ot = d.D[1 - i], b = B[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle') continue;
          // wil ik de ander saboteren? (hij ligt vóór me en dichtbij) of zelf racen (richtkruis achter mijn eend)
          const ahead = ot.x - me.x; const sab = c.sab > 0 && ahead > 1 && ahead < 15 && me.tank > 30 && rnd() < c.sab * 0.02 + (b.sabT > 0 ? 1 : 0);
          if (sab && !(b.sabT > 0)) b.sabT = 1.4; b.sabT = (b.sabT || 0) - dt;
          let tx, tz;   // wereld-doel voor het richtkruis
          if (b.sabT > 0 && ahead > 0) { tx = ot.x + 2.0; tz = ot.z; }
          else {
            // obstakel vooruit? duw mezelf opzij (richtkruis aan de andere kant van het obstakel)
            let push = 0, ob = null;
            for (const o of d.course.obs) { if (o.x < me.x - 1) continue; if (o.x > me.x + 10) break; if (Math.abs(o.z - me.z) < o.r + 1.6) { ob = o; break; } }
            if (ob) push = (me.z >= ob.z ? 1 : -1);
            // draaikolk? ook opzij
            for (const w of d.course.whirls) if (Math.abs(w.x - me.x) < 6 && Math.abs(w.z - me.z) < 3.8 && !ob) { push = me.z >= w.z ? 1 : -1; }
            const wantZ = ob || push ? 0 : (me.z > 0 ? 3.2 : -3.2) - me.z;     // terug naar het midden van mijn baan
            tx = me.x - 1.7 - (1 - c.skill) * 1.5; tz = me.z - push * 1.6 - (push ? 0 : clamp(wantZ, -2, 2) * 0.6);
          }
          const ex = tx - (me.x + me.ox), ez = tz - (me.z + me.oz); const q = 0.4 + 0.6 * c.skill;
          v.x = clamp(ex / 1.2, -1, 1) * q; v.y = clamp(ez / 1.2, -1, 1) * q;
          if (me.tank > 8 || me.boost > 0) v.a = rnd() < 0.5 + 0.5 * c.skill || me.tank > 60;
          if (me.bubCd <= 0 && ahead > 3 && ahead < 12 && rnd() < c.sab * 0.01) { v.b = true; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
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
      if (st.T > nextLog) { nextLog += 10; log.push(`T=${st.T.toFixed(0)} x=${st.d.map((q) => q.x)} tank=${st.d.map((q) => q.tank)} croc=${st.croc} boat=${st.boat} gold=${st.gold} wave=${st.wave}`); }
    }
    // laat de harness nog even doorlopen na de finish (resultaat-timer)
    for (let k = 0; k < 120; k++) { m.update(0.016); }
    return { log, st: d.state(), finished: m.finished, result: m.result, twist: m.twist.id, calls: window.__finishCalls, fps: 0 };
  });
  console.log(`\n=== ${tag} twist=${res.twist} ===`);
  console.log(res.log.join('\n'));
  const st = res.st;
  console.log(`end T=${st.T.toFixed(1)} x=${st.d.map((q) => q.x)} bonks=${st.d.map((q) => q.bonks)} finished=${res.finished} finishCalls=${res.calls} stats=${JSON.stringify(st.stats)}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  if (res.calls !== 1) fail(`${tag}: finishPvp ${res.calls}x aangeroepen`);
  if (!res.finished) fail(`${tag}: niet afgelopen`);
  if (res.result && res.result.winner == null) fail(`${tag}: geen winnaar`);
  if (errors.length) { fail(`${tag}: console-fouten`); console.log('ERRORS:\n' + errors.slice(0, 8).join('\n')); } else console.log('NO ERRORS');
  await browser.close();
  return res;
}

for (const name of scen) {
  if (name === 'bots') {
    const tw = process.env.TW || 'none'; const W = [];
    W.push((await runMatch(tw, [{ skill: 0.95, sab: 0.5, style: 'race' }, { skill: 0.55, sab: 0.1, style: 'race' }], 'bots A>B')).result?.winner);
    W.push((await runMatch(tw, [{ skill: 0.55, sab: 0.1, style: 'race' }, { skill: 0.95, sab: 0.5, style: 'race' }], 'bots B>A')).result?.winner);
    W.push((await runMatch(tw, [{ skill: 0.8, sab: 0.3, style: 'race' }, { skill: 0.8, sab: 0.3, style: 'race' }], 'bots gelijk')).result?.winner);
    console.log('winnaars:', W.join(','), W.includes(0) && W.includes(1) ? '(beide spelers kunnen winnen)' : '');
    if (!(W.includes(0) && W.includes(1))) fail('niet beide spelers wonnen in de bot-potjes');
    continue;
  }
  if (name === 'twists') {
    for (const t of TWISTS) await runMatch(t, [{ skill: 0.85, sab: 0.3, style: 'race' }, { skill: 0.7, sab: 0.3, style: 'race' }], 'twist');
    continue;
  }
  if (name === 'balance') {   // N potjes met gelijke bots: wint de één structureel vaker?
    const N = +(process.env.N || 6); const wins = [0, 0]; const margins = [];
    for (let k = 0; k < N; k++) { const r = await runMatch('none', [{ skill: 0.8, sab: 0.3, style: 'race' }, { skill: 0.8, sab: 0.3, style: 'race' }], 'balance ' + k); const w = r.result?.winner; if (w != null) wins[w]++; margins.push(r.st.d.map((q) => q.x)); }
    console.log('BALANS wins Wes/Jor =', wins.join('/'), JSON.stringify(margins)); continue;
  }
  if (name === 'idle') { await runMatch('none', [{ style: 'idle' }, { style: 'idle' }], 'idle'); continue; }
  if (name === 'timeout') { await runMatch('none', [{ skill: 0.7, sab: 0.2, style: 'race' }, { skill: 0.7, sab: 0.2, style: 'race' }], 'timeout', () => window.__app.mode.instance.dbg.setTime(6)); continue; }
  if (name === 'events') {
    // gebeurtenissen forceren: krokodil, gouden eend, golven (beide soorten), boot, bubbel
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.8, sab: 0.3, style: 'race' }, { skill: 0.8, sab: 0.3, style: 'race' }]);
    const r = await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg; const out = []; window.__bot(120);
      d.tele(0, 40, 3.5); d.tele(1, 44, -3.5); out.push(['croc', d.croc()]); window.__bot(60 * 4); const s1 = d.state(); out.push(['crocState', s1.croc, s1.d.map((q) => q.bonks)]);
      d.gold(); window.__bot(60 * 2); out.push(['gold', d.state().gold]);
      d.wave('surf'); window.__bot(60 * 5); out.push(['wave', d.state().stats.waves]); d.wave('back'); window.__bot(60 * 5);
      out.push(['boat', d.boat()]); window.__bot(60 * 8); out.push(['stats', d.state().stats]);
      return out;
    });
    console.log(JSON.stringify(r)); console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('events: fouten');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.85, sab: 0.3, style: 'race' }, { skill: 0.8, sab: 0.3, style: 'race' }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/du_${tag}.png` }); const s = await page.evaluate(() => window.__app.mode.instance.dbg.state()); console.log('shot', tag, `T=${s.T.toFixed(1)} x=${s.d.map((q) => q.x)} tank=${s.d.map((q) => q.tank)} camD=${s.camD.toFixed(1)}`); };
    await page.evaluate(() => window.__bot(60 * 4)); await snap('play');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.tele(0, 70, 3.5); d.tele(1, 62, -3.5); window.__bot(30); }); await snap('bridge');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.croc(); window.__bot(60 * 3); }); await snap('croc');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.gold(); window.__bot(40); }); await snap('gold');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.wave('surf'); window.__bot(60); }); await snap('wave');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.boat(); window.__bot(60 * 3); }); await snap('boat');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.tele(0, 112, 3.5); d.tele(1, 110, -3.5); window.__bot(60 * 3); }); await snap('casc1');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.tele(0, 228, 3.5); d.tele(1, 226, -3.5); window.__bot(60 * 4); }); await snap('casc2');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.tele(0, 150, 3.5); d.tele(1, 100, -3.5); window.__bot(40); }); await snap('gap');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.tele(0, 372, 3.5); d.tele(1, 360, -3.5); window.__bot(60 * 3); }); await snap('finish');
    await page.evaluate(() => window.__bot(60 * 2)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('shots: fouten');
    await browser.close(); continue;
  }
}
server.close();
console.log(FAILS ? `\n${FAILS} FOUT(EN)` : '\nALLES OK');
process.exit(FAILS ? 1 : 0);
