// Gebruik: node tools/test_catapult.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle | random | features
//   TW=<twist-id> kiest een twist (anders: "none" / per scenario). Q=low|high kwaliteit.
// Bots lopen via het BFS-veld naar kisten en luik; versneld (zonder renderen) hele potjes; rapporteert winnaar, fouten en of finishPvp precies één keer kwam.
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
const GAME = 'heist';

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=${GAME}&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // telt hoe vaak finishPvp wordt aangeroepen
    window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}


// bots: cfg[i] = { greed (buit voordat hij naar huis gaat), pause (kans op even stilstaan per s), style: 'bot'|'idle'|'random', crown }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ goal: null, pause: 0, field: null, key: '' }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], t = d.th[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.ended) continue;
          if (c.style === 'random') { v.x = Math.sin(st.T * 1.3 + i) ; v.y = Math.cos(st.T * 0.9 + i * 2); v.a = rnd() < 0.5; v.b = rnd() < 0.03; continue; }
          if (t.stun > 0.5) continue;
          if (b.pause > 0) { b.pause -= dt; continue; }
          if (rnd() < c.pause * dt) { b.pause = 0.4 + rnd() * 0.8; continue; }
          const tc = d.cx_(t.x), tr = d.cz_(t.z);
          const myH = d.M.hatches[i];
          const goHome = (t.carry >= c.greed) || (st.left < 14 && t.carry > 0) || (t.carry > 0 && t.alert > 0 && rnd() < 0.5);
          let gc, gr, kind = 'home';
          if (goHome) { gc = myH.c; gr = myH.r; }
          else {
            // dichtstbijzijnde volle kist / pile (BFS vanaf de dief)
            const f = d.fieldTo(tc, tr); let best = null, bd = 1e9;
            for (const ch of d.chests) { if (!ch.full) continue; if (ch.kind === 'K' && !c.crown) continue; const dd = f[ch.d.r * 25 + ch.d.c]; if (dd >= 0 && dd < bd) { bd = dd; best = [ch.d.c, ch.d.r, 'chest', ch]; } }
            for (const p of d.piles) if (p.on) { const dd = f[d.cz_(p.z) * 25 + d.cx_(p.x)]; if (dd >= 0 && dd < bd) { bd = dd; best = [d.cx_(p.x), d.cz_(p.z), 'pile', p]; } }
            if (!best) { gc = myH.c; gr = myH.r; } else { gc = best[0]; gr = best[1]; kind = best[2]; b.target = best[3]; }
          }
          const wx = d.tx(gc), wz = d.tz(gr); const dist = Math.hypot(wx - t.x, wz - t.z);
          if (kind === 'chest' && dist < 1.3) { v.a = true; continue; }
          if (kind === 'pile' && dist < 1.3) { v.a = rnd() < 0.5; continue; }
          if (kind === 'home' && dist < 0.6) { continue; }
          const key = gc + ',' + gr; if (b.key !== key) { b.key = key; b.field = d.fieldTo(gc, gr); }
          const nx = d.stepDir(b.field, tc, tr);
          const tx_ = nx ? d.tx(nx[0]) : wx, tz_ = nx ? d.tz(nx[1]) : wz;
          const dx = tx_ - t.x, dz = tz_ - t.z, l = Math.hypot(dx, dz) || 1; v.x = dx / l; v.y = dz / l;
          if (rnd() < 0.004 && t.bCd <= 0) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const BOT = (greed, pause, crown = false) => ({ style: 'bot', greed, pause, crown });
for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'random'].includes(name)) {
    const list = name === 'twists' ? TWISTS.map((t) => [t, [BOT(70, 0.1), BOT(70, 0.1)]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'random' ? [['none', [{ style: 'random' }, { style: 'random' }]]]
          : name === 'timeout' ? [['none', [BOT(9999, 0.05), BOT(9999, 0.05)]]]
            : [[process.env.TW || 'none', [BOT(60, 0.05), BOT(140, 0.3, true)]], [process.env.TW || 'none', [BOT(140, 0.3, true), BOT(60, 0.05)]], [process.env.TW || 'none', [BOT(90, 0.15), BOT(90, 0.15)]]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(8); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; let g = 0; const log = []; let lastP = '';
        while (!m.finished && g++ < 60 * 140) { window.__bot(1); const st = inst.dbg.state(); const k = st.bank.join('-'); if (k !== lastP) { lastP = k; log.push(`T=${st.T.toFixed(1)} bank=${st.bank} carry=${st.carry} caught=${st.caught} alarms=${st.alarms} dragon=${st.dragon}`); } }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin.length };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${cfg.map((c) => c.style + (c.greed ?? '')).join('/')} ===`);
      console.log(res.log.slice(-8).join('\n'));
      const s = res.st.stats;
      console.log(`end T=${res.st.T.toFixed(1)} bank=${res.st.bank} chests=${s.chests} alarms=${s.alarms} caught=${s.caught} coins=${s.coins} hats=${s.hats} lasers=${s.lasers} rob=${s.pickpocket} chicken=${s.chicken} dragon=${s.dragon} deurman=${s.deurman} crown=${s.crown} how=${s.how} finished=${res.finished} finishPvp-calls=${res.fin}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
      await browser.close();
    }
    continue;
  }
  if (name === 'features') {
    // forceert elke gimmick en controleert het effect
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    const r = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const out = {}; const run = (n) => window.__bot(n);
      d.give(0, 100); const g0 = d.guards[0]; d.tp(0, g0.x + 0.4, g0.z + 0.3); run(5); out.caughtByTouch = d.state().caught[0] === 1 && d.state().carry[0] === 0;
      d.give(1, 100); d.raise(1, g0); out.alarmLoss = d.state().carry[1] === 70 && d.state().gstates.some((s) => s === 'chase');
      d.jail(1, null); run(2);
      d.wakeDragon(0); run(3); out.dragonAwake = d.state().dragon === 'awake';
      d.spawnHat(); out.hat = d.hats.some((h) => h.on);
      d.startDeurman(); run(5); out.deurman = d.dm.on;
      d.noise(d.th[0].x, d.th[0].z, 0, 30); out.noiseInvestigate = d.guards.some((g) => g.state === 'investigate' || g.state === 'chase');
      d.setBank(0, 499); d.give(0, 10); d.th[0].invuln = 0; d.tp(0, d.tx(d.M.hatches[0].c), d.tz(d.M.hatches[0].r)); window.__app.input.virtual[0].a = false; run(60);
      const st = d.state(); out.targetEnd = st.ended && st.winner === 0; out.state = { bank: st.bank, ended: st.ended, winner: st.winner };
      return out;
    });
    console.log('FEATURES', JSON.stringify(r)); console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [BOT(60, 0.05), BOT(80, 0.1, true)]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/ht_${tag}.png` }); const s = await page.evaluate(() => { const x = window.__app.mode.instance.dbg.state(); return { T: +x.T.toFixed(1), bank: x.bank, carry: x.carry, g: x.gstates.join(','), dr: x.dragon }; }); console.log('shot', tag, JSON.stringify(s)); };
    const run = (n) => page.evaluate((n) => window.__bot(n), n);
    await run(30); await snap('start'); await run(60 * 12); await snap('play');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 80); d.raise(0, d.guards[0]); }); await run(40); await snap('alarm');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.wakeDragon(1); d.spawnHat(); d.startDeurman(); d.throwCoin(1); }); await run(60 * 3); await snap('dragon');
    await run(60 * 20); await snap('later');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setTime(10); }); await run(60 * 4); await snap('last');
    await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(0.2); }); await run(90); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
