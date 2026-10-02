// Gebruik: node tools/test_quickdraw.mjs [scenario...]   scenario: bots twists shots
// Versnelde (niet-gerenderde) simulatie van Snelle Vingers met bots; 'shots' maakt screenshots van de belangrijkste momenten.
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
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'bodyswap', 'deurman'];

async function open(twist = 'none', extra = '') {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=quickdraw&twist=${twist}&quality=${process.env.Q || "low"}${extra}`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 240000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  // bot: sk[i] = { react (s), err (kans op valse start per ronde), wrong (kans op verkeerde knop) }
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__rnd = rnd;
    const B = [{ plan: null, key: '' }, { plan: null, key: '' }];
    window.__sk = [{ react: 0.3, jitter: 0.08, err: 0, wrong: 0 }, { react: 0.3, jitter: 0.08, err: 0, wrong: 0 }];
    const MAP = { A: 'a', B: 'b', L: 'left', R: 'right', U: 'up', D: 'down' };
    // logische knop -> fysieke knop, volgens de twist
    const tw = m.twist.id;
    const phys = (sym) => {
      if (tw === 'swapab') return sym === 'A' ? 'B' : sym === 'B' ? 'A' : sym;
      if (tw === 'invert') return { L: 'R', R: 'L', U: 'D', D: 'U' }[sym] || sym;
      return sym;
    };
    window.__step = (n, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) { const v = inp.virtual[i]; v.a = v.b = v.left = v.right = v.up = v.down = false; }
        for (const i of [0, 1]) {
          const sk = window.__sk[i], b = B[i], v = inp.virtual[i];
          // bij bodyswap bestuurt de ander mijn poppetje: bot kiest de fysieke toetsen van de eigenaar
          const owner = m.swapped ? 1 - i : i; const vo = inp.virtual[owner];
          const press = (sym) => { vo[MAP[phys(sym)]] = true; };
          const key = st.round + ':' + st.rstate;
          if (key !== b.key) { b.key = key; b.plan = null; b.react = sk.react + (rnd() - 0.5) * 2 * sk.jitter; b.early = rnd() < sk.err; b.earlyT = rnd() * 2.5; b.n = 0; b.nextT = 0; b.done = false; b.done2 = false; }
          if (st.rstate === 'armed') { if (b.early && st.t > b.earlyT && !b.done) { b.done = true; press(st.kind === 'classic' ? 'A' : 'L'); } }
          else if (st.rstate === 'signal') {
            if (st.clock - st.sigClock >= b.react && !b.done2) {
              b.done2 = true;
              if (st.kind === 'classic') press('A');
              else if (rnd() < sk.wrong) { press(['L', 'R', 'U', 'A', 'B'].filter((x) => x !== st.target)[Math.floor(rnd() * 4)]); b.done2 = false; b.react += 0.7; }
              else press(st.target);
            }
          } else if (st.rstate === 'seqin') {
            if (st.clock - st.sigClock >= b.react + b.n * 0.35 && st.prog[i] === b.n) {
              if (rnd() < sk.wrong * 0.5) { press(['L', 'R', 'U', 'A', 'B'][Math.floor(rnd() * 5)]); b.react += 0.4; }
              else { press(st.seq[st.prog[i]]); b.n++; }
            } else if (st.prog[i] < b.n) b.n = st.prog[i];
          }
          if (st.rstate === 'armed' || st.rstate === 'signal' || st.rstate === 'seqin') { /* done flags reset by key change */ }
        }
        // alle toetsen ook doorgeven via "inp.update" hieronder
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page, errors };
}

for (const name of scen) {
  if (name === 'bots') {
    const { browser, page, errors } = await open('none');
    const cases = [
      ['even', [{ react: 0.28, jitter: 0.08, err: 0.05, wrong: 0.1 }, { react: 0.28, jitter: 0.08, err: 0.05, wrong: 0.1 }]],
      ['wes snel', [{ react: 0.2, jitter: 0.05, err: 0, wrong: 0.05 }, { react: 0.45, jitter: 0.1, err: 0, wrong: 0.1 }]],
      ['jor snel', [{ react: 0.45, jitter: 0.1, err: 0, wrong: 0.1 }, { react: 0.2, jitter: 0.05, err: 0, wrong: 0.05 }]],
      ['wes ongeduldig', [{ react: 0.25, jitter: 0.05, err: 0.5, wrong: 0 }, { react: 0.5, jitter: 0.05, err: 0, wrong: 0 }]],
      ['allebei slaap', [{ react: 9, jitter: 0, err: 0, wrong: 0 }, { react: 9, jitter: 0, err: 0, wrong: 0 }]],
    ];
    for (const [label, sk] of cases) {
      // een nieuw potje per geval: herstart via de pauzemenu-functie van de harness is lastig; gebruik een nieuwe pagina
      await browser.close();
      break;
    }
    // aparte pagina per geval
    for (const [label, sk] of cases) {
      const o = await open('none');
      await o.page.evaluate((sk) => { window.__sk[0] = sk[0]; window.__sk[1] = sk[1]; }, sk);
      const res = await o.page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = '';
        let guard = 0;
        while (!m.finished && guard++ < 60 * 400) {
          window.__step(1);
          const st = inst.dbg.state(); const key = st.round + ':' + st.rstate;
          if (key !== last && (st.rstate === 'hit' || st.rstate === 'foul' || st.rstate === 'foulboth' || st.rstate === 'result' && false)) { log.push(`T=${st.T.toFixed(1)} r${st.round}(${st.kind}) ${st.rstate} sc=${st.scores} gag=${st.gag || '-'} ms=${JSON.stringify(st.times)}`); }
          last = key;
        }
        const st = inst.dbg.state();
        return { log, st, finished: m.finished, result: m.result };
      });
      console.log(`\n=== ${label} ===`);
      console.log(res.log.join('\n'));
      console.log(`END T=${res.st.T.toFixed(1)} rounds=${res.st.round} scores=${res.st.scores} finished=${res.finished} winner=${res.result && res.result.winner} replays=${res.st.replays}`);
      if (res.result) console.log('summary:', res.result.summary.replace(/<[^>]+>/g, ' '));
      console.log(o.errors.length ? 'ERRORS:\n' + o.errors.slice(0, 6).join('\n') : 'NO ERRORS');
      await o.browser.close();
    }
    continue;
  }
  if (name === 'hooks') {
    // harness-hooks (onSwap / onDeurman / celebrate) middenin een potje aanroepen en daarna uitspelen
    const o = await open('none');
    const res = await o.page.evaluate(() => {
      const m = window.__app.mode, inst = m.instance;
      window.__step(60 * 12);
      inst.onSwap(true); window.__step(30); inst.onDeurman([true, false]); window.__step(30); inst.onDeurman([false, true]); window.__step(30); inst.onSwap(false);
      let guard = 0; while (!m.finished && guard++ < 60 * 400) window.__step(1);
      return { st: inst.dbg.state(), finished: m.finished, result: m.result };
    });
    console.log('hooks: finished=' + res.finished + ' winner=' + (res.result && res.result.winner) + ' scores=' + JSON.stringify(res.st.scores), o.errors.length ? 'ERRORS ' + o.errors.slice(0, 3).join(' | ') : 'ok');
    await o.browser.close(); continue;
  }
  if (name === 'twists') {
    for (const tw of TWISTS) {
      const o = await open(tw);
      const res = await o.page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; let guard = 0;
        while (!m.finished && guard++ < 60 * 500) window.__step(1);
        return { st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id };
      });
      console.log(`twist ${res.twist}: T=${res.st.T.toFixed(1)} rounds=${res.st.round} scores=${res.st.scores} finished=${res.finished} winner=${res.result && res.result.winner}`, o.errors.length ? 'ERRORS ' + o.errors.slice(0, 3).join(' | ') : 'ok');
      await o.browser.close();
    }
    continue;
  }
  if (name === 'gags') {
    const o = await open(process.env.TWIST || 'none'); const { page } = o;
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/qd_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => { window.__sk[0].react = 0.26; window.__sk[1].react = 0.5; });
    for (const kind of ['pie', 'cow', 'hats', 'glove', 'chickens']) {
      await page.evaluate((k) => window.__app.mode.instance.dbg.setGagBag([k]), kind);
      await page.evaluate((k) => window.__step(60 * 60, (s) => s.rstate === 'hit' && s.gag === k && s.gagU > 0.3), kind); await snap(`gag_${kind}_a`);
      await page.evaluate((k) => window.__step(60 * 60, (s) => s.rstate === 'hit' && s.gag === k && s.gagU > 0.78), kind); await snap(`gag_${kind}_b`);
      await page.evaluate(() => window.__step(60 * 60, (s) => s.rstate === 'announce'));
    }
    console.log(o.errors.length ? 'ERRORS:\n' + o.errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await o.browser.close(); continue;
  }
  if (name === 'panels') {
    const o = await open(process.env.TWIST || 'none'); const { page } = o;
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/qd_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => { window.__sk[0].react = 9; window.__sk[1].react = 9; window.__sk[0].err = 1; });
    await page.evaluate(() => window.__step(60 * 30, (s) => s.rstate === 'foul' && s.t > 0.55)); await snap('foul');
    await page.evaluate(() => { window.__sk[0].err = 0; });
    await page.evaluate(() => window.__step(60 * 80, (s) => s.round === 4 && s.rstate === 'signal' && s.t > 0.25)); await snap('dir');
    await page.evaluate(() => window.__step(60 * 80, (s) => s.round === 6 && s.rstate === 'seqshow' && s.t > 0.95)); await snap('seqshow');
    await page.evaluate(() => { window.__sk[0].react = 0.3; window.__sk[1].react = 0.9; });
    await page.evaluate(() => window.__step(60 * 80, (s) => s.round === 6 && s.rstate === 'seqin' && s.prog[0] === 2)); await snap('seqin');
    console.log(o.errors.length ? 'ERRORS:\n' + o.errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await o.browser.close(); continue;
  }
  if (name === 'fakes') {
    const o = await open(process.env.TWIST || 'none'); const { page } = o;
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/qd_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => { window.__sk[0].react = 9; window.__sk[1].react = 9; });
    // wacht tot ronde 3 (deurman) en maak shots tijdens de nepsignalen
    for (const k of ['chicken', 'bell', 'crow', 'deurman', 'hiccup']) {
      let found = false;
      for (let tries = 0; tries < 12 && !found; tries++) {
        const hit = await page.evaluate((k) => { const inst = window.__app.mode.instance; return window.__step(60 * 40, (s) => s.rstate === 'armed' && s.armedEvents[s.fakeNow - 1] === k && s.t > 0.12 && s.armedEvents[s.fakeNow - 1] !== undefined); }, k);
        if (hit) { found = true; await page.evaluate(() => window.__step(14)); await snap('fake_' + k); }
        else await page.evaluate(() => window.__step(60 * 30, (s) => s.rstate === 'announce'));
      }
      if (!found) console.log('niet gevonden', k);
    }
    console.log(o.errors.length ? 'ERRORS:\n' + o.errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await o.browser.close(); continue;
  }
  if (name === 'shots') {
    const tw = process.env.TWIST || 'none';
    const o = await open(tw);
    const { page } = o;
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/qd_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => { window.__sk[0].react = 0.26; window.__sk[1].react = 0.4; window.__app.mode.instance.dbg.setGagBag(['glove', 'chickens', 'hats', 'cow', 'pie']); });
    await page.evaluate(() => window.__step(60 * 20, (s) => s.rstate === 'announce' && s.t > 0.6)); await snap('announce');
    await page.evaluate(() => window.__step(60 * 20, (s) => s.rstate === 'armed' && s.t > 0.2)); await snap('armed');
    await page.evaluate(() => window.__step(60 * 30, (s) => s.rstate === 'signal' && s.t > 0.05)); await snap('signal');
    await page.evaluate(() => window.__step(60 * 30, (s) => s.rstate === 'hit' && s.gag && s.t > 0.9)); await snap('hit1');
    await page.evaluate(() => window.__step(60 * 30, (s) => s.rstate === 'hit' && s.t > 2.0)); await snap('hit1b');
    for (const n of [2, 3, 4, 5, 6, 7]) {
      await page.evaluate((n) => window.__step(60 * 60, (s) => s.round >= n && s.rstate === 'hit' && s.t > 0.8), n); await snap('round' + n);
    }
    await page.evaluate(() => window.__step(60 * 400));
    await snap('end');
    console.log(o.errors.length ? 'ERRORS:\n' + o.errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await o.browser.close(); continue;
  }
}
server.close();
