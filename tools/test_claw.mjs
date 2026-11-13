// Gebruik: node tools/test_claw.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle | physics
//   bots4 | twists4 | idle4 = vier spelers (?players=4, 2 tegen 2: [[0,1],[2,3]]); controleert eindstand, winnende team, plaatsen en console-errors.
//   TW=<twist-id> kiest een twist (anders: "none" / per scenario). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert tussenstanden, winnaar, fouten.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromePath, BROWSER_ARGS } from './chrome_path.mjs';

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
const GAME = 'claw';

async function open(twist, N = 2) {
  const browser = await chromium.launch({ executablePath: chromePath(), args: BROWSER_ARGS });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=${GAME}&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0${N === 4 ? '&players=4' : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    for (const q of mode.ids) inp.virtual[q].a = true; inp.update(); mode.update(0.016);
    for (const q of mode.ids) inp.virtual[q].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1, aggr: kans op RUK, greed: 0..1 (hoe vaak de beste prijs i.p.v. een willekeurige), style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = cfg.map(() => ({ tgt: null, tt: 0, pressAt: -1, wait: 0 }));
    window.__cfg = cfg;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (let i = 0; i < cfg.length; i++) {
          const v = inp.virtual[m.ids[i]], b = B[i], c = window.__cfg[i], me = st.claws[i], op = st.claws.filter((q) => q.team !== me.team).sort((x, y) => (y.hold ? 1 : 0) - (x.hold ? 1 : 0) || Math.hypot(x.hx - me.hx, x.hz - me.hz) - Math.hypot(y.hx - me.hx, y.hz - me.hz))[0]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle') continue;
          b.wait -= dt;
          const sk = c.skill ?? 0.8;
          if (me.state === 'idle' || me.state === 'open') {
            if (!b.tgt || b.tt < st.T - 6 || !st.prizes.some((q) => q === b.tgt || (Math.abs(q.x - b.tgt.x) < 0.01 && q.z === b.tgt.z))) {
              const good = st.prizes.filter((q) => q.held < 0 && q.val > 0 && q.y < 4 && Math.abs(q.x) < inst.dbg.X - 1.5);
              const all = st.prizes.filter((q) => q.held < 0 && q.y < 4);
              const pool = rnd() < (c.greed ?? 0.8) ? good : all;
              let best = null, bs = -1e9;
              for (const q of pool) { const d = Math.hypot(q.x - me.hx, q.z - me.hz); const sc = q.val * 0.6 - d * (1 + rnd() * 2); if (sc > bs) { bs = sc; best = q; } }
              b.tgt = best; b.tt = st.T;
            }
            if (b.tgt) {
              const q = st.prizes.find((p) => p.held < 0 && Math.abs(p.x - b.tgt.x) < 1.5 && Math.abs(p.z - b.tgt.z) < 1.5 && p.type === b.tgt.type) || b.tgt;
              const dx = q.x - me.hx, dz = q.z - me.hz;
              v.x = clamp(dx * 1.6, -1, 1); v.y = clamp(dz * 1.6, -1, 1);
              if (Math.abs(dx) < 0.3 + (1 - sk) * 0.6 && Math.abs(dz) < 0.3 + (1 - sk) * 0.6 && me.state === 'idle' && b.wait <= 0) { v.a = true; b.tgt = null; b.pressAt = 0.52 + rnd() * 0.2 + (1 - sk) * (rnd() - 0.5) * 0.5; b.wait = 0.2; }
            }
            if (me.cdB <= 0 && op.hold && Math.hypot(op.hx - me.hx, op.hz - me.hz) < 4.8 && rnd() < (c.aggr ?? 0.5) * 0.2) v.b = true;
          } else if (me.state === 'close') {
            if (me.t >= b.pressAt && b.pressAt > 0) { v.a = true; b.pressAt = -1; }
          } else if (me.state === 'carry') {
            const cx = (me.team ? 1 : -1) * (inst.dbg.X - inst.dbg.HOLE_W / 2), cz = (inst.dbg.HOLE_Z0 + inst.dbg.ZF) / 2;
            const dx = cx - me.hx, dz = cz - me.hz;
            v.x = clamp(dx * 1.2, -1, 1); v.y = clamp(dz * 1.2, -1, 1);
            if (Math.hypot(dx, dz) < 0.7 + (1 - sk) * 0.5) v.a = true;
            if (me.cdB <= 0 && rnd() < 0.01) v.b = true;
            // een bom altijd naar de ander slepen is te gevaarlijk: bots doen dat niet
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
  }, cfg);
}

let fails = 0; const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
for (const name of scen) {
  if (['bots4', 'twists4', 'idle4'].includes(name)) {
    const good = { skill: 0.9, greed: 0.9, aggr: 0.5, style: 'play' }, weak = { skill: 0.5, greed: 0.5, aggr: 0.2, style: 'play' };
    const list = name === 'twists4' ? TWISTS.map((t) => [t, [good, weak, good, weak]]) : name === 'idle4' ? [['none', [{ style: 'idle' }, { style: 'idle' }, { style: 'idle' }, { style: 'idle' }]]] : [[process.env.TW || 'none', [good, weak, weak, weak]], [process.env.TW || 'none', [weak, weak, good, good]]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw, 4);
      await installBots(page, cfg);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; let calls = 0, g = 0; const rs = [];
        const orig = m.ctx.finishPvp; m.ctx.finishPvp = (r) => { calls++; rs.push(r); return orig(r); };
        while (!m.finished && g++ < 60 * 200) window.__bot(1);
        for (let k = 0; k < 300; k++) { window.__bot(1); m.update(0.016); }
        return { st: inst.dbg.state(), finished: m.finished, result: m.result, calls, r: rs[0], twist: m.twist.id, ids: m.ids.slice() };
      });
      const r = res.r, st = res.st;
      console.log(`--- ${name} twist=${res.twist} teamscore=${st.score} eigen=${st.pscore}`);
      check(res.finished && res.calls === 1, `finishPvp precies één keer (${res.calls})`);
      if (name !== 'idle4' || true) check(r && Array.isArray(r.winners) && r.winners.length === 2 && (r.winners.join() === '0,1' || r.winners.join() === '2,3'), `winnend team als paar slots: ${r && r.winners}`);
      const wt = r && r.winners[0] === 0 ? 0 : 1, lt = 1 - wt;
      check(r && (st.score[wt] > st.score[lt] || st.score[wt] === st.score[lt]), `winnend team heeft de meeste punten (${st.score})`);
      check(r && r.place.length === 4 && r.place.slice(0, 2).every((k) => r.winners.includes(k)) && [...r.place].sort().join() === '0,1,2,3', `plaatsen: winnaars eerst (${r && r.place})`);
      check(r && r.score.length === 4 && r.score[0] === r.score[1] && r.score[2] === r.score[3], `teamscore voor beide teamgenoten (${r && r.score})`);
      if (name === 'bots4') check(st.score[wt] > 0, 'er is gescoord');
      check(!errors.length, 'geen console-errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
      await browser.close();
    }
    continue;
  }
  if (name === 'physics') {
    // robuustheid: prijzen op willekeurige snelheden afschieten, bommen/kippen/kronen spawnen; geen NaN, niets buiten de kast
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.8, style: 'play' }, { skill: 0.8, style: 'play' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, inst = m.instance, d = inst.dbg; let bad = 0, nan = 0, steps = 0, maxV = 0; const X = d.X;
      for (let f = 0; f < 3600 && !m.finished; f++) {
        if (f % 120 === 0) { for (const p of d.prizes) if (p.alive && p.held < 0) { const a = Math.random() * 6.283, sp = 5 + Math.random() * 25; p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = Math.random() * 15; } }
        if (f === 200) d.spawnChicken(); if (f === 400) d.spawnCrown(); if (f === 900) d.explode(0, 1, 0);
        window.__bot(1); steps++;
        for (const p of d.prizes) { if (!p.alive) continue; if (![p.x, p.y, p.z, p.vx, p.vy, p.vz].every(Number.isFinite)) nan++; if (Math.abs(p.x) > X + 0.5 || p.z < d.ZB - 0.5 || p.z > d.ZF + 0.5 || p.y > 40) bad++; maxV = Math.max(maxV, Math.hypot(p.vx, p.vy, p.vz)); }
      }
      const s = d.state(); return { steps, bad, nan, maxV, score: s.score, T: s.T, alive: s.prizes.length };
    });
    console.log('physics', JSON.stringify(res));
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  if (['bots', 'twists', 'timeout', 'idle'].includes(name)) {
    const list = name === 'twists' ? TWISTS.map((t) => [t, [{ skill: 0.9, greed: 0.9, aggr: 0.6, style: 'play' }, { skill: 0.7, greed: 0.8, aggr: 0.4, style: 'play' }]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ skill: 0.9, style: 'play' }, { skill: 0.9, style: 'play' }]]]
          : [
            [process.env.TW || 'none', [{ skill: 0.95, greed: 0.95, aggr: 0.5, style: 'play' }, { skill: 0.5, greed: 0.5, aggr: 0.2, style: 'play' }]],
            [process.env.TW || 'none', [{ skill: 0.5, greed: 0.5, aggr: 0.2, style: 'play' }, { skill: 0.95, greed: 0.95, aggr: 0.5, style: 'play' }]],
            [process.env.TW || 'none', [{ skill: 0.85, greed: 0.85, aggr: 0.5, style: 'play' }, { skill: 0.85, greed: 0.85, aggr: 0.5, style: 'play' }]],
          ];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(6); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0, calls = 0;
        const orig = m.finishPvp.bind(m); m.finishPvp = (r) => { calls++; return orig(r); };
        while (!m.finished && g++ < 60 * 200) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = Math.floor(st.T / 10) + ':' + st.doubleOn;
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} score=${st.score} counts=${st.counts} left=${st.timeLeft.toFixed(1)} prizes=${st.prizes.length} double=${st.doubleOn}`); last = key; }
        }
        // na het einde nog even doorspelen: finishPvp mag niet nog een keer komen
        for (let k = 0; k < 300; k++) { window.__bot(1); m.update(0.016); }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, calls };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg.map((c) => c.style + ':' + (c.skill ?? '')))} ===`);
      console.log(res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} score=${st.score} counts=${st.counts} finished=${res.finished} finishCalls=${res.calls} stats=${JSON.stringify(st.stats)}`);
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
    await installBots(page, [{ skill: 0.85, greed: 0.9, aggr: 0.5, style: 'play' }, { skill: 0.8, greed: 0.9, aggr: 0.5, style: 'play' }]);
    const tag0 = process.env.TAG || 'cl';
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/${tag0}_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { T: +s.T.toFixed(1), score: s.score, c: s.claws.map((c) => c.state + ':' + (c.hold || '-')) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await snap('start');
    await go('s.claws[0].state==="close" || s.claws[1].state==="close"'); await snap('close');
    await go('s.claws[0].state==="carry" || s.claws[1].state==="carry"', 60 * 40); await snap('carry');
    await page.evaluate(() => window.__bot(60 * 8)); await snap('mid');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnChicken(); d.spawnCrown(); });
    await page.evaluate(() => window.__bot(40)); await snap('chicken');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; const b = d.prizes.find((p) => p.alive && p.type === 'bom'); if (b) { b.fuse = 0.9; b.x = 0; b.z = 0; b.y = 1.5; } });
    await page.evaluate(() => window.__bot(30)); await snap('bomb');
    await page.evaluate(() => window.__bot(40)); await snap('boom');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(35, 12); d.setTime(14); });
    await page.evaluate(() => window.__bot(40)); await snap('double');
    await go('s.finished', 60 * 40); await page.evaluate(() => window.__bot(5)); await page.waitForTimeout(2500); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(fails ? `${fails} FOUT(EN)` : 'klaar'); server.close(); process.exit(fails ? 1 : 0);
