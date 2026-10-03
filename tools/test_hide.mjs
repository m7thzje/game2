// ONLY=a,b beperkt het twists-scenario tot die twists.
// Gebruik: node tools/test_hide.mjs [scenario...]   scenario: bots | twists | idle | timeout | deur | shots
//   TW=<twist-id> kiest een twist. Q=low|high kwaliteit.
// Bots spelen versneld hele potjes. Controleert: finishPvp precies 1x, beide spelers kunnen winnen, geen console-errors, elke twist werkt.
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
let failures = 0; const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) failures++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.setDefaultTimeout(180000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=hide&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
    // finishPvp tellen
    window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
  });
  return { browser, page, errors };
}


// cfg[i] = { seek: 'smart'|'dumb'|'idle', know: seconden voor de bot "weet" waar de verstopper zit, hide: 'still'|'wander'|'idle' } (per speler, voor beide rondes)
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = { wp: null, wpT: 0, press: 0, runT: 0, tHunt: -1, lastPhase: '', pcool: 0 };
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const v of inp.virtual) { v.a = false; v.b = false; v.x = 0; v.y = 0; }
        const hi = st.hider, se = 1 - hi; const swapAB = m.twist.id === 'swapab';
        const drive = (idx, dx, dz, a, b) => { const vi = m.swapped ? 1 - idx : idx; const v = inp.virtual[vi]; v.x = dx; v.y = dz; if (swapAB) { v.a = b; v.b = a; } else { v.a = a; v.b = b; } };
        const dir = (fx, fz, tx, tz, sp = 1) => { const dx = tx - fx, dz = tz - fz, d = Math.hypot(dx, dz) || 1; return [dx / d * Math.min(1, d / 0.8) * sp, dz / d * Math.min(1, d / 0.8) * sp]; };
        if (st.phase !== B.lastPhase) { B.lastPhase = st.phase; if (st.phase === 'hunt') { B.tHunt = st.T; B.wp = null; B.runT = 0; } }
        B.pcool = Math.max(0, B.pcool - dt); B.wpT -= dt; B.press = Math.max(0, B.press - dt); B.runT = Math.max(0, B.runT - dt);
        const props = inst.dbg.W.props;
        if (st.phase === 'prep' && cfg[hi].hide !== 'idle') {
          let best = null, bd = 1e9; for (const p of props) { const d = Math.hypot(p.x - st.H.x, p.z - st.H.z); if (d < bd) { bd = d; best = p; } }
          if (!st.H.dis) { const [dx, dz] = dir(st.H.x, st.H.z, best.x, best.z); if (bd < 2.4) { if (B.pcool <= 0) { drive(hi, 0, 0, true, false); B.pcool = 0.5; } } else drive(hi, dx, dz, false, false); }
        }
        if (st.phase === 'hunt') {
          // verstopper
          const hc = cfg[hi].hide;
          if (hc === 'wander') {
            const ds = Math.hypot(st.Sk.x - st.H.x, st.Sk.z - st.H.z);
            if (st.H.dis && ds < 3.2 && st.H.cdPop <= 0 && B.runT <= 0) { drive(hi, 0, 0, true, false); B.runT = 1.4; }
            else if (!st.H.dis && B.runT > 0) { const [dx, dz] = dir(st.Sk.x, st.Sk.z, st.H.x, st.H.z); drive(hi, dx, dz, false, false); }
            else if (!st.H.dis) { let best = null, bd = 1e9; for (const p of props) { const d = Math.hypot(p.x - st.H.x, p.z - st.H.z); if (d < bd) { bd = d; best = p; } } if (bd < 2.6 && B.pcool <= 0) { drive(hi, 0, 0, true, false); B.pcool = 0.4; } else { const [dx, dz] = dir(st.H.x, st.H.z, best.x, best.z); drive(hi, dx, dz, false, false); } }
            else if (st.H.cdDecoy <= 0 && rnd() < 0.02) drive(hi, 0, 0, false, true);
            else if (rnd() < 0.01) drive(hi, rnd() < 0.5 ? -1 : 1, 0, false, false);
          }
          // zoeker
          const sc = cfg[se].seek; if (sc !== 'idle') {
            const known = sc === 'smart' && (st.T - B.tHunt) > cfg[se].know;
            let tx, tz;
            if (known) { tx = st.H.x; tz = st.H.z; }
            else { if (!B.wp || B.wpT <= 0) { const p = props[Math.floor(rnd() * props.length)]; B.wp = [p.x + (rnd() - 0.5) * 2, p.z + 1.2]; B.wpT = 2.5; } tx = B.wp[0]; tz = B.wp[1]; }
            const [dx, dz] = dir(st.Sk.x, st.Sk.z, tx, tz); const dd = Math.hypot(tx - st.Sk.x, tz - st.Sk.z);
            let a = false, b = false;
            if (known && dd < 1.1 && B.press <= 0) { a = true; B.press = 0.5; }
            else if (!known && dd < 1.4 && B.press <= 0 && (sc === 'dumb' ? rnd() < 0.5 : rnd() < 0.04)) { a = true; B.press = 0.6; }
            if (st.Sk.scanCd <= 0 && rnd() < 0.05) b = true;
            drive(se, dx, dz, a, b);
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function runMatch(page, maxFrames = 60 * 200) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.phase + ':' + st.round;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.phase} r${st.round + 1} hider=${st.hider} pts=${st.pts.map((x) => x.toFixed(1))} left=${st.left.toFixed(1)} chances=${st.chances}`); last = key; }
    }
    for (let k = 0; k < 400; k++) { window.__app.mode.paused = false; window.__app.input.update(); window.__app.mode.update(0.016); }
    window.__app.mode.paused = true;
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin.length, g };
  }, maxFrames);
}

const wins = [0, 0, 0];
for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'deur'].includes(name)) {
    const mk = (a, b, ha, hb) => [{ seek: a, know: a === 'smart' ? 3 : 0, hide: ha }, { seek: b, know: b === 'smart' ? 3 : 0, hide: hb }];
    const TW_LIST = process.env.ONLY ? process.env.ONLY.split(',') : TWISTS;
    const list = name === 'twists' ? TW_LIST.map((t) => [t, mk('smart', 'smart', 'wander', 'still')])
      : name === 'idle' ? [['none', mk('idle', 'idle', 'idle', 'idle')]]
        : name === 'timeout' ? [['none', mk('dumb', 'dumb', 'still', 'still')]]
          : name === 'deur' ? [['deurman', mk('smart', 'dumb', 'wander', 'wander')]]
            : [[process.env.TW || 'none', mk('smart', 'dumb', 'still', 'wander')], [process.env.TW || 'none', mk('dumb', 'smart', 'wander', 'still')], [process.env.TW || 'none', mk('smart', 'smart', 'wander', 'wander')]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'deur') await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.S.first = 0; });
      const res = await runMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      const st = res.st; console.log(`end T=${st.T.toFixed(1)} pts=${st.pts.map((x) => x.toFixed(1))} finished=${res.finished} results=${JSON.stringify(st.results.map((r) => [r.kind, r.hider, +r.hiP.toFixed(1), +r.seP.toFixed(1)]))} stats=${JSON.stringify(st.stats)}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.finished && res.fin === 1, `finishPvp precies 1x (gekomen: ${res.fin}) [${name}/${res.twist}]`);
      check(res.result && (res.result.winner === 0 || res.result.winner === 1), `er is een winnaar (${res.result && res.result.winner})`);
      check(st.results.length === 2, `2 rondes gespeeld (${st.results.length})`);
      if (res.result) wins[res.result.winner ?? 2]++;
      check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ seek: 'smart', know: 9, hide: 'wander' }, { seek: 'smart', know: 9, hide: 'wander' }]);
    const snap = async (tag) => { await page.waitForTimeout(1500); await page.screenshot({ path: `/tmp/hd_${tag}.png`, timeout: 180000 }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { ph: s.phase, r: s.round, left: +s.left.toFixed(1), pts: s.pts, H: s.H, D: s.D, ch: s.chicken }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.screenshot({ path: '/tmp/hd_start.png', timeout: 180000 });
    await go('s.phase==="intro"', 10); await page.evaluate(() => window.__bot(40)); await snap('intro');
    await go('s.phase==="prep" && s.prepT<4.8', 600); await snap('prep');
    await go('s.phase==="hunt" && s.left<26', 900); await snap('hunt');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.doScan(); }); await page.evaluate(() => window.__bot(14)); await snap('scan');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.S.help = -1; d.CH.x = d.H.x + 1.5; d.CH.z = d.H.z + 1; }); await page.evaluate(() => window.__bot(70)); await snap('chicken');
    await page.evaluate(() => window.__app.mode.instance.dbg.startDeur()); await go('s.D==="stare"', 600); await page.evaluate(() => window.__bot(20)); await snap('deurman');
    await go('s.phase==="found"', 60 * 80); await page.evaluate(() => window.__bot(30)); await snap('found');
    await go('s.phase==="intro" && s.round===1', 600); await page.evaluate(() => window.__bot(30)); await snap('round2');
    await go('s.phase==="found" && s.round===1', 60 * 100); await go('s.finished', 60 * 20); await page.evaluate(() => window.__bot(60)); await snap('end');
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
}
console.log(`\nwinnaars [Wes, Jor, gelijk]: ${wins}`);
console.log(failures ? `${failures} CHECK(S) MISLUKT` : 'ALLES OK');
server.close();
