// Gebruik: node tools/test_claw.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle
//   TW=<twist-id> kiest een twist (anders: "none" / per scenario). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert tussenstanden, winnaar, fouten.
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
const GAME = 'bake';

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
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1, aggr: kans op bloemzak/stelen, golden: 0..1 kans op de gouden ster, spr: aantal keer strooien, style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ wait: 0, target: 3.6, round: -1, sprDone: 0, mode: '' }));
    window.__cfg = cfg;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const D = inst.dbg, ST = D.ST;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = D.state(); if (stop && stop(st)) { m.paused = true; return true; }
        if (window.__capTime && st.ph === 'cook' && st.roundLeft > window.__capTime) D.setTime(window.__capTime);
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.p[i], op = st.p[1 - i], sd = i ? 1 : -1; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.ph !== 'cook' || me.served) continue;
          if (b.round !== st.round) { b.round = st.round; b.sprDone = 0; b.target = 3.62 + (1 - (c.skill ?? 0.8)) * (rnd() - 0.5) * 3; b.wait = 0.3; b.mode = ''; }
          b.wait -= dt;
          const sk = c.skill ?? 0.8;
          const go = (p, z) => { const dx = sd * p - me.x, dz = z - me.z, d = Math.hypot(dx, dz); v.x = clamp(dx * 2.2, -1, 1); v.y = clamp(dz * 2.2, -1, 1); return d; };
          const press = (btn, d, r = 0.3) => { if (d < r && b.wait <= 0) { v[btn] = true; b.wait = 0.22; return true; } return false; };
          const crateGo = (kind) => go(ST.crateP[kind], -1.9);
          const plateGo = () => go(ST.plateP, -0.7);
          const ovenGo = () => go(ST.ovenStandP, ST.ovenStandZ);
          const n = me.layers.length, N = st.N, rec = st.recipe;
          if (me.blocked) { press('a', plateGo(), 0.5); continue; }
          // sporadisch: gouden ster, bloemzak
          if (st.gold.on && me.hold == null && n >= 1 && (c.golden ?? 0) > (rnd() * 3)) { const d = go(1.6, 1.0); press('a', d, 0.5); continue; }
          if (me.hold === 'gold') { press('a', plateGo(), 0.5); continue; }
          if (me.cdFlour <= 0 && (c.aggr ?? 0) > 0 && me.hold == null && n >= 1 && n < N && rnd() < 0.002 * (c.aggr ?? 0) * 10) b.mode = 'flour';
          if (me.cdSteal <= 0 && (c.aggr ?? 0) > 0 && me.hold == null && rnd() < 0.002 * (c.aggr ?? 0) * 10 && Math.abs(op.x) < 5.2 && !b.mode) b.mode = 'steal';
          if (b.mode === 'steal') { const d = go(1.6, 1.0); if (press('a', d, 0.6) || me.cdSteal > 0 || Math.abs(op.x) > 5.4) b.mode = ''; continue; }
          if (b.mode === 'flour') { const d = go(1.6, 1.0); if (press('b', d, 0.6)) b.mode = ''; if (me.cdFlour > 0) b.mode = ''; continue; }
          if (n === 0) {
            if (me.oven.st === 'baking') {
              if (me.hold == null) { const d = crateGo(rec[1]); press('a', d); }
              else { const d = ovenGo(); if (me.oven.t >= b.target) press('b', d, 0.5); }
            } else if (me.hold === 'deeg') press('a', ovenGo(), 0.5);
            else press('a', crateGo('deeg'));
          } else if (n < N) {
            const need = rec[n];
            if (me.hold === need || (me.hold && rnd() < 0.0005 * (1 - sk))) press('a', plateGo(), 0.5);
            else press('a', crateGo(need));
          } else {
            if (b.sprDone < (c.spr ?? 0)) { if (press('a', plateGo(), 0.5)) b.sprDone++; }
            else press('b', plateGo(), 0.5);
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
  if (['bots', 'twists', 'timeout', 'idle'].includes(name)) {
    const good = { skill: 0.95, golden: 0.5, aggr: 0.5, spr: 2, style: 'play' }, bad = { skill: 0.4, golden: 0.2, aggr: 0.2, spr: 0, style: 'play' }, mid = { skill: 0.8, golden: 0.4, aggr: 0.4, spr: 1, style: 'play' };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [good, mid]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [mid, mid]]]
          : [[process.env.TW || 'none', [good, bad]], [process.env.TW || 'none', [bad, good]], [process.env.TW || 'none', [mid, mid]]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__capTime = 5; });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0, calls = 0;
        const orig = m.finishPvp.bind(m); m.finishPvp = (r) => { calls++; return orig(r); };
        while (!m.finished && g++ < 60 * 200) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = st.round + ':' + st.ph + ':' + st.tot;
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} r${st.round} ${st.ph} tot=${st.tot} rec=${st.recipe.join('>')} left=${st.roundLeft.toFixed(1)}`); last = key; }
        }
        for (let k = 0; k < 300; k++) { window.__bot(1); m.update(0.016); }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, calls };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg.map((c) => c.style + ':' + (c.skill ?? '')))} ===`);
      console.log(res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} tot=${st.tot} finished=${res.finished} finishCalls=${res.calls} stats=${JSON.stringify(st.stats)}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      if (res.calls !== 1) console.log('!!! FOUT: finishPvp ' + res.calls + 'x aangeroepen');
      if (res.result && res.result.winner == null) console.log('!!! FOUT: geen winnaar');
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
      await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, golden: 0.9, aggr: 0.8, spr: 2, style: 'play' }, { skill: 0.9, golden: 0.9, aggr: 0.8, spr: 1, style: 'play' }]);
    const tag0 = process.env.TAG || 'bk';
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/${tag0}_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { T: +s.T.toFixed(1), ph: s.ph, r: s.round, tot: s.tot, p: s.p.map((p) => p.layers.length + ':' + (p.hold || '-') + ':' + p.oven.st) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await snap('start');
    await go('s.ph==="cook" && s.T>3'); await page.evaluate(() => window.__bot(90)); await snap('baking');
    await go('s.p[0].layers.length>=3 || s.p[1].layers.length>=3', 60 * 40); await snap('building');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnGold(); }); await page.evaluate(() => window.__bot(30)); await snap('gold');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startChicken(0); d.startDragon(1); }); await go('s.chick.st==="sit"', 60 * 10); await snap('chicken');
    await page.evaluate(() => window.__bot(60)); await snap('dragon');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.S[1].flour = 3.4; }); await snap('flour');
    await go('s.ph==="judge"', 60 * 60); await page.evaluate(() => window.__bot(100)); await snap('judge');
    await page.evaluate(() => window.__bot(90)); await snap('judge2');
    await go('s.round===2 && s.ph==="cook"', 60 * 30); await page.evaluate(() => window.__bot(60)); await snap('final');
    await go('s.finished', 60 * 120); await page.evaluate(() => window.__bot(5)); await page.waitForTimeout(2500); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
