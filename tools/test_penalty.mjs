// Gebruik: node tools/test_penalty.mjs [scenario...]   scenario: bots | twists | idle | timeout | events | physics | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit. N=<aantal potjes> voor 'bots'.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert winnaar, aantal finishPvp-aanroepen (moet precies 1 zijn), fouten.
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
let FAILS = 0; const fail = (m) => { FAILS++; console.log('FAIL: ' + m); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=penalty&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    window.__fin = { n: 0, last: null }; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.n++; window.__fin.last = r; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1 (schutter + keeper), style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    window.__cfg = cfg; window.__bs = [{}, {}];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], bs = window.__bs[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || !st.K) continue;
          const role = st.K.shooter === i ? 'sh' : st.K.keeper === i ? 'ke' : null;
          if (bs.kick !== st.kickNo) { bs.kick = st.kickNo; bs.side = Math.random() < 0.5 ? -1 : 1; bs.tx = bs.side * (2.4 + Math.random() * 1.0) * (Math.random() < 0.2 ? 0.1 : 1); bs.ty = Math.random() < 0.5 ? 0.6 + Math.random() * 0.5 : 1.8 + Math.random() * 0.6; bs.pT = 0.66 + (Math.random() - 0.5) * 0.2 * (1.2 - c.skill); bs.pressed = false; bs.guess = Math.random() < c.skill; bs.dir = Math.random() < 0.5 ? -1 : 1; bs.tipT = 0.1 + Math.random() * 0.2; if (c.skill < 0.5) { bs.tx *= 0.3; bs.pT = Math.random() < 0.5 ? 0.3 : 0.95; } }
          if (role === 'sh' && st.state === 'aim') {
            const q = st.K; const ex = bs.tx - q.aimX, ey = bs.ty - q.aimY;
            v.x = clamp(ex * 1.5, -1, 1); v.y = -clamp(ey * 1.5, -1, 1);
            if (!q.charging) { if (Math.abs(ex) < 0.4 && Math.abs(ey) < 0.4 && !bs.pressed) { v.a = true; bs.pressed = true; } }
            else { bs.pressed = true; const rising = q.p > (bs.lastP ?? 0); v.a = !(q.p >= bs.pT && rising); }
            bs.lastP = q.p; if (st.state === 'aim' && Math.random() < 0.004) v.b = true;
          }
          if (role === 'ke') {
            if (st.state === 'aim') { v.x = Math.sin(st.T * 2 + i) * 0.6; }
            if (st.state === 'flight') {
              const q = st.K, t = q.t;
              if (t > 0.05) { let tx = bs.guess ? q.tx : bs.dir * 3, ty = bs.guess ? q.ty : 1; v.x = Math.abs(tx - st.keeper.x) > 0.8 ? Math.sign(tx - st.keeper.x) : 0; v.y = ty > 1.7 ? -1 : (ty < 0.5 ? 0.6 : 0); }
              if (st.ball && st.ball.z < -6.5 && st.ball.z > -9 && !bs.tipped) { v.a = true; bs.tipped = true; }
              if (st.ball && st.ball.z < -3 && Math.random() < 0.05 && st.gloveCd[i] <= 0) v.b = true;
            } else bs.tipped = false;
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (['bots', 'twists', 'idle', 'timeout'].includes(name)) {
    const A = { skill: 0.95, style: 'play' }, Bw = { skill: 0.3, style: 'play' }, M = { skill: 0.7, style: 'play' };
    const N = +(process.env.N || 3);
    const list = name === 'twists' ? TWISTS.map((t) => [t, [M, M]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ style: 'idle' }, M]], ['none', [M, { style: 'idle' }]]]
          : [[process.env.TW || 'none', [A, Bw]], [process.env.TW || 'none', [Bw, A]], ...Array.from({ length: N }, () => [process.env.TW || 'none', [M, M]])];
    const wins = [0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance, d = inst.dbg; const log = []; let last = ''; let g = 0; const seen = { gold: 0, spook: 0, wind: 0, rain: 0, big: 0, tiny: 0, hen: 0, out: {} }; let lastKick = -1;
        while (!m.finished && g++ < 60 * 700) {
          window.__bot(1);
          const st = d.state();
          if (st.K && st.kickNo !== lastKick) { lastKick = st.kickNo; if (st.K.ball === 'gold') seen.gold++; if (st.K.ball === 'spook') seen.spook++; if (st.K.wind) seen.wind++; if (st.K.rain) seen.rain++; if (st.K.kmul > 1) seen.big++; if (st.K.kmul < 1) seen.tiny++; if (st.K.hen) seen.hen++; }
          const key = st.score.join('-') + ':' + st.kickNo + ':' + st.state;
          if (key !== last && st.state === 'result') { log.push(`T=${st.T.toFixed(1)} kick#${st.kickNo} shooter=${st.K.shooter} ${st.K.out}${st.K.saveBy ? '/' + st.K.saveBy : ''} ball=${st.K.ball} score=${st.score}`); seen.out[st.K.out] = (seen.out[st.K.out] || 0) + 1; }
          last = key;
        }
        return { log, st: d.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin.n, seen };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.length > 30 ? [...res.log.slice(0, 4), '...', ...res.log.slice(-16)].join('\n') : res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} score=${st.score} kicks=${st.kickNo} sdPairs=${st.sdPairs} finished=${res.finished} finishPvp-calls=${res.fin} stats=${JSON.stringify(st.stats)} events=${JSON.stringify(res.seen)}`);
      if (res.result) { console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`); if (res.result.winner != null) wins[res.result.winner]++; }
      if (!res.finished) fail(`${name}/${tw}: niet afgelopen`);
      if (res.fin !== 1) fail(`${name}/${tw}: finishPvp ${res.fin}x aangeroepen`);
      if (res.result && res.result.winner == null) fail(`${name}/${tw}: geen winnaar`);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
      await browser.close();
    }
    console.log(`overwinningen (${name}): Wes ${wins[0]} - Jor ${wins[1]}`);
    if (name === 'bots' && (!wins[0] || !wins[1])) fail('bots: niet beide spelers wonnen minstens één potje');
    continue;
  }
  if (name === 'physics') {
    // schoten met vaste parameters, keeper idle/duikt: controleer uitkomsten
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const out = []; m.paused = false; const inp = window.__app.input;
      const tick = (n, stop) => { for (let k = 0; k < n && !m.finished; k++) { inp.update(); m.update(1 / 60); if (stop && stop(d.state())) return true; } return false; };
      const toResult = () => tick(60 * 8, (s) => s.state === 'result');
      const run = (label, o) => {
        d.setTaken(0, 0); d.force({ ball: 'normal', wind: 0, rain: false, kmul: 1, hen: false, ...(o.force || {}) }); d.nextKick();
        tick(60 * 4, (s) => s.state === 'prep'); tick(1); d.skipAim(); tick(60, (s) => s.state === 'aim'); d.shootNow(o.p, o.x, o.y, o.curl || 0);
        if (o.dive) { tick(8); d.diveNow(...o.dive); }
        toResult(); const s = d.state(); out.push(`${label}: ${s.K.out}${s.K.saveBy ? '/' + s.K.saveBy : ''}${s.K.hitFrame ? ' [' + s.K.hitFrame + ']' : ''} (aim ${o.x},${o.y} p=${o.p} T=${s.K.shotT.toFixed(2)}) doel ${s.K.tx.toFixed(2)},${s.K.ty.toFixed(2)} bal ${s.ball.x.toFixed(2)},${s.ball.y.toFixed(2)} pts=${s.K.pts}`);
      };
      tick(60 * 4, (s) => s.state === 'prep'); d.skipAim(); tick(60, (s) => s.state === 'aim'); d.shootNow(0.7, 0, 2, 0); toResult();
      run('hoek rechtsboven, geen duik', { p: 0.72, x: 3.3, y: 2.2 }); run('midden laag, geen duik', { p: 0.72, x: 0, y: 0.5 });
      run('hoek links, keeper duikt links', { p: 0.6, x: -3.2, y: 0.7, dive: [-1, 0] }); run('hoek rechts, keeper duikt links', { p: 0.72, x: 3.3, y: 1.0, dive: [-1, 0] });
      run('naast', { p: 0.72, x: 5.4, y: 1.0 }); run('over de lat', { p: 0.72, x: 0, y: 3.6 }); run('te hard', { p: 1, x: 0, y: 1.2 }); run('curve links', { p: 0.7, x: -3, y: 1.0, curl: 1 });
      run('gouden bal', { p: 0.72, x: 3.4, y: 1.0, force: { ball: 'gold' } }); run('wind', { p: 0.4, x: 3.0, y: 1.5, force: { wind: 4 } }); run('spook', { p: 0.72, x: -3.0, y: 1.2, force: { ball: 'spook' } });
      run('op de paal', { p: 0.75, x: 4.2, y: 1.2 });
      return { out, st: d.state() };
    });
    console.log(res.out.join('\n'));
    console.log('score na physics:', res.st.score, 'stats', JSON.stringify(res.st.stats));
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
  if (name === 'events') {
    // alle gimmicks forceren en kijken of alles blijft werken
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.7, style: 'play' }, { skill: 0.7, style: 'play' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const seen = []; const combos = [{ ball: 'gold' }, { ball: 'spook' }, { wind: 4, rain: true }, { kmul: 1.5 }, { kmul: 0.72 }, { hen: true }, { hen: true, ball: 'spook', rain: true, wind: -3 }];
      let ci = 0, lastKick = -1, g = 0;
      while (!m.finished && g++ < 60 * 400 && ci <= combos.length) {
        const s0 = d.state(); if (s0.kickNo !== lastKick && s0.state === 'result') { lastKick = s0.kickNo; seen.push(`${JSON.stringify(combos[ci - 1] || {})} -> ${s0.K.out} ball=${s0.K.ball} hen=${s0.K.hen} hen.st=${s0.hen.st}`); }
        if (s0.state === 'result' && s0.K.resolved && ci < combos.length && s0.kickNo === lastKick) { d.force(combos[ci]); ci++; d.nextKick(); }
        window.__bot(1);
      }
      const inst = m.instance; inst.onDeurman([true, false]); inst.onSwap(true); inst.onSwap(false); inst.celebrate(0); inst.celebrate(1); for (let k = 0; k < 20; k++) m.update(1 / 60);
      return { seen, st: d.state() };
    });
    console.log(res.seen.join('\n')); console.log(`kicks=${res.st.kickNo} stats=${JSON.stringify(res.st.stats)}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
  if (name === 'shots2') {
    // glove / vingertoppen / kip-redding / reus-keeper in beeld
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    const snap = async (tag) => { await page.waitForTimeout(400); await page.screenshot({ path: `/tmp/pn_${tag}.png`, timeout: 240000 }); const r = await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { st: s.state, out: s.K && s.K.out, by: s.K && s.K.saveBy, hen: s.hen }; }); console.log('shot', tag, JSON.stringify(r)); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    const ev = (f, a) => page.evaluate(f, a);
    // 1. kip-redding
    await ev(() => { const d = window.__app.mode.instance.dbg; d.force({ hen: true, ball: 'normal', kmul: 1 }); d.nextKick(); window.__bot(1); });
    await go('s.state==="aim"', 60 * 10); await go('s.hen.st==="sit"', 60 * 10);
    await ev(() => { const d = window.__app.mode.instance.dbg; const s = d.state(); d.shootNow(0.6, s.hen.x, 0.55, 0); }); await ev(() => window.__bot(30)); await snap('hen');
    await go('s.state==="result"', 60 * 10); await ev(() => window.__bot(20)); await snap('hen_res');
    // 2. reuzenhandschoen
    await ev(() => { const d = window.__app.mode.instance.dbg; d.setTaken(0, 0); d.force({ hen: false, ball: 'normal', kmul: 1.5 }); d.nextKick(); window.__bot(1); });
    await go('s.state==="aim"', 60 * 10);
    await ev(() => { const d = window.__app.mode.instance.dbg, inp = window.__app.input, st = d.state(); d.shootNow(0.55, 3.2, 1.0, 0); const m = window.__app.mode; const ke = st.K.keeper; inp.virtual[ke].b = true; inp.update(); m.paused = false; m.update(1 / 60); inp.virtual[ke].b = false; inp.virtual[ke].x = 1; inp.update(); m.update(1 / 60); m.update(1 / 60); m.update(1 / 60); m.update(1 / 60); m.update(1 / 60); m.update(1 / 60); m.update(1 / 60); inp.update(); m.paused = true; });
    await ev(() => window.__bot(8)); await snap('glove');
    await go('s.state==="result"', 60 * 10); await ev(() => window.__bot(12)); await snap('glove_res');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'play' }, { skill: 0.9, style: 'play' }]);
    const snap = async (tag) => { await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/pn_${tag}.png`, timeout: 240000 }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { st: s.state, score: s.score, out: s.K && s.K.out, t: +s.T.toFixed(1) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    const ev = (f) => page.evaluate(f);
    await snap('start');
    await go('s.state==="aim"', 60 * 10); await ev(() => window.__bot(40)); await snap('aim');
    await go('s.K && s.K.charging', 60 * 10); await ev(() => window.__bot(10)); await snap('charge');
    await go('s.state==="flight"', 60 * 10); await ev(() => window.__bot(14)); await snap('flight');
    await go('s.state==="result"', 60 * 10); await ev(() => window.__bot(14)); await snap('result1');
    await ev(() => { window.__app.mode.instance.dbg.force({ ball: 'gold', wind: 4, rain: true }); window.__app.mode.instance.dbg.nextKick(); }); await go('s.state==="aim"', 60 * 10); await ev(() => window.__bot(50)); await snap('gold_rain');
    await ev(() => { const d = window.__app.mode.instance.dbg; d.shootNow(0.74, 3.2, 1.0, 1); }); await ev(() => window.__bot(16)); await snap('curve');
    await go('s.state==="result"', 60 * 10); await ev(() => window.__bot(20)); await snap('result2');
    await ev(() => { window.__app.mode.instance.dbg.force({ ball: 'spook', hen: true, kmul: 1.5 }); window.__app.mode.instance.dbg.nextKick(); }); await go('s.state==="aim"', 60 * 10); await ev(() => window.__bot(60)); await snap('spook_hen_big');
    await ev(() => { const d = window.__app.mode.instance.dbg; d.shootNow(0.7, 0, 0.8, 0); }); await ev(() => window.__bot(10)); await ev(() => { window.__app.mode.instance.dbg.diveNow(0, 0); }); await snap('flight2');
    await go('s.state==="result"', 60 * 10); await ev(() => window.__bot(14)); await snap('result3');
    await ev(() => { const d = window.__app.mode.instance.dbg; d.setScore(4, 4); d.setTaken(5, 4); }); await go('s.state==="end"', 60 * 400); await ev(() => window.__bot(40)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
}
console.log(FAILS ? `\n${FAILS} FOUT(EN)` : '\nALLES OK');
server.close();
