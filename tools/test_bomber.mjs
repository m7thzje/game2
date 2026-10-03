// Gebruik: node tools/test_bomber.mjs [scenario...]   scenario: bots | twists | idle | timeout | physics | shots
//   TW=<twist-id> kiest een twist (anders "none" / per scenario). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes. Controleert: finishPvp precies één keer, beide spelers kunnen winnen,
// botsingen met muren/kratten kloppen, geen console-errors, elke twist werkt.
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
let fails = 0; const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=bomber&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false; window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1, aggr 0..1 (kans om een bom te leggen als dat nuttig is), style: 'attack' | 'defend' | 'idle' | 'rand' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 4711; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const COLS = 13, ROWS = 11, N = 143, CELL = 2;
    const cxw = (c) => (c - 6) * CELL, czw = (r) => (r - 5) * CELL, idx = (c, r) => r * COLS + c, inb = (c, r) => c >= 0 && r >= 0 && c < COLS && r < ROWS;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const B = [0, 1].map(() => ({ tc: -1, tr: -1, hold: 0, think: 0, bomb: 0 }));
    window.__cfg = cfg;
    function dangerMap(extra) {
      const bs = d.bombs.filter((b) => b.on).map((b) => ({ c: b.c, r: b.r, t: b.t, range: b.range }));
      if (extra) bs.push(extra);
      const covers = (b) => { const out = [idx(b.c, b.r)]; const hitB = []; for (const [dx, dz] of DIRS) for (let k = 1; k <= b.range; k++) { const c = b.c + dx * k, r = b.r + dz * k; if (!inb(c, r)) break; const i = idx(c, r), gi = d.g[i]; if (gi === 1 || gi === 4) break; out.push(i); if (gi === 2 || gi === 3) break; const o = bs.findIndex((q) => q.c === c && q.r === r); if (o >= 0) { hitB.push(o); break; } } return [out, hitB]; };
      const cov = bs.map(covers); const te = bs.map((b) => b.t);
      for (let it = 0; it < bs.length; it++) for (let k = 0; k < bs.length; k++) for (const o of cov[k][1]) if (te[o] > te[k] + 0.07) te[o] = te[k] + 0.07;
      const dz = new Float32Array(N).fill(1e9);
      bs.forEach((b, k) => { for (const i of cov[k][0]) dz[i] = Math.min(dz[i], te[k]); });
      for (let i = 0; i < N; i++) if (d.flameT[i] > 0) dz[i] = 0;
      for (const f of d.state().warn) dz[f.i] = Math.min(dz[f.i], 0.3);
      return dz;
    }
    // BFS over lopbare cellen; arrival < dz - marge. retourneert { first: eerste stap, dist, cell } naar het dichtstbijzijnde doel
    function bfs(c0, r0, dz, goal, speed) {
      const per = CELL / speed + 0.04; const prev = new Int16Array(N).fill(-2), tt = new Float32Array(N); const q = [idx(c0, r0)]; prev[q[0]] = -1; tt[q[0]] = 0;
      for (let h = 0; h < q.length; h++) {
        const cur = q[h]; const c = cur % COLS, r = (cur / COLS) | 0;
        if (cur !== q[0] && goal(c, r, tt[cur])) { let x = cur; while (prev[x] !== q[0] && prev[x] !== -1) x = prev[x]; return { first: x, steps: Math.round(tt[cur] / per), cell: cur }; }
        for (const [dx, dz2] of DIRS) {
          const nc = c + dx, nr = r + dz2; if (!inb(nc, nr)) continue; const ni = idx(nc, nr); if (prev[ni] !== -2) continue;
          if (d.g[ni] !== 0 || d.bombAt[ni] >= 0) continue;
          const arr = tt[cur] + per; if (dz[ni] < 1e8 && arr > dz[ni] - 0.12) continue; if (d.flameT[ni] > 0) continue;
          prev[ni] = cur; tt[ni] = arr; q.push(ni);
        }
      }
      return null;
    }
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        if (stop && stop(d.state())) { m.paused = true; return true; }
        if (d.G.state === 'play' || d.G.state === 'ending') {
          const dzBase = dangerMap(null);
          for (const i of [0, 1]) {
            const v = inp.virtual[i], b = B[i], c = window.__cfg[i], p = d.pl[i], o = d.pl[1 - i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
            if (!p.alive || c.style === 'idle') continue;
            if (c.style === 'rand') { b.hold -= dt; if (b.hold <= 0) { b.hold = 0.3 + rnd() * 0.5; b.tc = (rnd() * 4) | 0; } const dd = DIRS[b.tc]; v.x = dd[0]; v.y = dd[1]; v.a = rnd() < 0.05; v.b = rnd() < 0.05; continue; }
            const cc = Math.round(p.x / CELL) + 6, rr = Math.round(p.z / CELL) + 5; const speed = 5.2 * (1 + 0.11 * p.speedLv) * (p.slow > 0 ? 0.5 : 1) * m.ctx.pvp.speed(i);
            const here = idx(cc, rr); let target = null;
            const safeGoal = (c2, r2) => dzBase[idx(c2, r2)] > 1e8 && !(d.flameT[idx(c2, r2)] > 0);
            // 1) gevaar? vlucht
            if (dzBase[here] < 3.5) { const res = bfs(cc, rr, dzBase, safeGoal, speed); if (res) target = res.first; else { /* geen uitweg: toch iets */ } }
            else {
              // 2) bom leggen als dat nuttig is
              b.think -= dt;
              if (c.style === 'attack' && p.bombsOut < p.bombsMax && b.think <= 0 && d.bombAt[here] < 0) {
                b.think = 0.25 + (1 - c.skill) * 0.6;
                let useful = false; const eC = Math.round(o.x / CELL) + 6, eR = Math.round(o.z / CELL) + 5;
                for (const [dx, dz2] of DIRS) for (let kk = 1; kk <= p.range; kk++) { const x = cc + dx * kk, y = rr + dz2 * kk; if (!inb(x, y)) break; const gi = d.g[idx(x, y)]; if (gi === 1 || gi === 4) break; if (gi === 2 || gi === 3) { useful = true; break; } if (o.alive && x === eC && y === eR) { useful = true; break; } }
                if (useful && rnd() < c.aggr) {
                  const dz2 = dangerMap({ c: cc, r: rr, t: 2.5, range: p.range + (p.mega ? 4 : 0) }); const res = bfs(cc, rr, dz2, (c3, r3) => dz2[idx(c3, r3)] > 1e8, speed);
                  if (res && res.steps <= 5) { v.a = true; target = res.first; }
                }
              }
              // 3) navigeren: naar kratten / items / vijand
              if (target == null && !v.a) {
                const it = d.state().items; const goalCrate = (c2, r2) => { if (dzBase[idx(c2, r2)] < 1e8) return false; for (const [dx, dz2] of DIRS) { const x = c2 + dx, y = r2 + dz2; if (inb(x, y) && (d.g[idx(x, y)] === 2 || d.g[idx(x, y)] === 3)) return true; } return false; };
                const eC = Math.round(o.x / CELL) + 6, eR = Math.round(o.z / CELL) + 5;
                const goalItem = (c2, r2) => it.some((q) => q.c === c2 && q.r === r2);
                const goalEnemy = (c2, r2) => o.alive && Math.abs(c2 - eC) + Math.abs(r2 - eR) <= (c.style === 'attack' ? 2 : 99);
                const res = bfs(cc, rr, dzBase, goalItem, speed) || (rnd() < 0.5 && c.style === 'attack' ? bfs(cc, rr, dzBase, goalEnemy, speed) : null) || bfs(cc, rr, dzBase, goalCrate, speed) || bfs(cc, rr, dzBase, goalEnemy, speed);
                if (res) target = res.first;
                // kans op schoppen: bom voor me
                const fb = d.bombs.find((q2) => q2.on && q2.c === cc + p.fx && q2.r === rr + p.fz); if (fb && rnd() < 0.2 * c.aggr) v.b = true;
              }
            }
            if (target != null) {
              const tc = target % COLS, tr = (target / COLS) | 0; let dx = cxw(tc) - p.x, dz2 = czw(tr) - p.z;
              // eerst op de rijlijn komen
              if (tc !== cc && Math.abs(dz2) > 0.35) dx = 0; if (tr !== rr && Math.abs(dx) > 0.35) dz2 = 0;
              const dl = Math.hypot(dx, dz2) || 1; v.x = dx / dl; v.y = dz2 / dl;
            } else if (dzBase[here] >= 1e8 && c.style === 'defend') { /* blijf staan */ }
            if (rnd() > c.skill + 0.3) { v.x = 0; v.y = 0; }
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const sum = (st) => `R${st.round} ${st.gstate} wins=${st.wins} bombs=${st.stats.bombs} crates=${st.stats.crates} kips=${st.stats.chickens} slijm=${st.stats.slimes} schop=${st.stats.kicks} duw=${st.stats.shoves} items=${st.stats.items} draak=${st.stats.dragons} stenen=${st.stats.crush}`;

async function runMatch(page, maxFrames = 60 * 400) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance, d = inst.dbg; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = d.state(); const key = st.round + ':' + st.wins.join('-') + ':' + st.gstate;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} R${st.round} ${st.gstate} wins=${st.wins}`); last = key; }
    }
    const frames = g;
    // nog even doorspelen om te bewijzen dat er niet opnieuw wordt afgerond
    for (let k = 0; k < 120; k++) { window.__bot(1); }
    return { log, st: d.state(), finished: m.finished, result: m.result, fin: window.__fin.length, twist: m.twist.id, frames };
  }, maxFrames);
}

for (const name of scen) {
  if (['bots', 'twists', 'idle', 'timeout'].includes(name)) {
    const A = { skill: 0.97, aggr: 0.8, style: 'attack' }, Bw = { skill: 0.6, aggr: 0.5, style: 'attack' };
    const list = name === 'twists' ? TWISTS.filter((t) => !process.env.ONLY || t === process.env.ONLY).map((t) => [t, [A, Bw]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ skill: 0.9, aggr: 0, style: 'defend' }, { skill: 0.9, aggr: 0, style: 'defend' }]]]
          : [[process.env.TW || 'none', [A, Bw]], [process.env.TW || 'none', [Bw, A]], [process.env.TW || 'none', [A, A]], [process.env.TW || 'none', [A, A]]];
    const winners = [0, 0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (tw === 'deurman') { await page.evaluate(() => { window.__bot(240); window.__app.mode.instance.onDeurman([true, true]); }); }
      const res = await runMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} frames=${res.frames} ===`);
      console.log(res.log.join('\n')); console.log(sum(res.st));
      check(res.finished && res.fin === 1, `finishPvp precies 1x (aantal=${res.fin})`);
      if (res.result) { console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`); check(res.result.winner === 0 || res.result.winner === 1, 'er is een winnaar'); winners[res.result.winner ?? 2]++; }
      check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
      await browser.close();
    }
    if (name === 'bots') check(winners[0] > 0 && winners[1] > 0, `beide spelers kunnen winnen (Wes ${winners[0]}x, Jor ${winners[1]}x)`);
    continue;
  }
  if (name === 'physics') {
    // robuustheid: spelers die random rondrennen mogen nooit in een muur/krat/pilaar/bom-vast zitten of de arena uit raken
    for (const tw of ['none', 'turbo', 'giant', 'slippery']) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, [{ style: 'rand', skill: 1, aggr: 1 }, { style: 'rand', skill: 1, aggr: 1 }]);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, d = m.instance.dbg; let viol = 0, maxPen = 0, outs = 0, steps = 0, dist = [0, 0]; const bad = [];
        const prev = d.pl.map((p) => [p.x, p.z]);
        for (let f = 0; f < 60 * 120 && !m.finished; f++) {
          d.pl.forEach((p) => { p.inv = 9; p.shield = false; });
          window.__bot(1); steps++;
          if (d.G.state === 'roundEnd') { d.G.t = 9; }
          d.pl.forEach((p, i) => {
            if (!p.alive) return; dist[i] += Math.hypot(p.x - prev[i][0], p.z - prev[i][1]); prev[i] = [p.x, p.z];
            if (Math.abs(p.x) > 12.99 + 0 || Math.abs(p.z) > 10.99 + 0) outs++;
            for (let r = 0; r < 11; r++) for (let c = 0; c < 13; c++) {
              const solid = d.g[r * 13 + c] !== 0 || (d.bombAt[r * 13 + c] >= 0 && !d.bombs[d.bombAt[r * 13 + c]].pass[i]); if (!solid) continue;
              const nx = Math.max((c - 6) * 2 - 1, Math.min(p.x, (c - 6) * 2 + 1)), nz = Math.max((r - 5) * 2 - 1, Math.min(p.z, (r - 5) * 2 + 1));
              const pen = p.r - Math.hypot(p.x - nx, p.z - nz); if (pen > maxPen) maxPen = pen; if (pen > 0.06) { viol++; if (bad.length < 3) bad.push({ x: p.x, z: p.z, c, r, pen }); }
            }
          });
        }
        return { viol, maxPen, outs, steps, bad, dist };
      });
      console.log(`physics twist=${tw}`, JSON.stringify(res));
      check(res.viol === 0 && res.outs === 0, `geen overlap met vaste dingen (max indringing ${res.maxPen.toFixed(3)})`);
      check(res.dist[0] > 30 && res.dist[1] > 30, `spelers bewegen werkelijk (${res.dist.map((x) => x.toFixed(0))} eenheden)`);
      check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'diag') {
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ skill: 0.97, aggr: 0.8, style: 'attack' }, { skill: 0.6, aggr: 0.5, style: 'attack' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const hist = [];
      for (let f = 0; f < 600; f++) { window.__bot(1); const st = d.state(); hist.push(`f${f} ${st.gstate} ` + st.players.map((p) => `(${p.x.toFixed(2)},${p.z.toFixed(2)} c${p.c},${p.r}${p.alive ? '' : ' DEAD'})`).join(' ') + ' B:' + st.bombs.map((b) => `${b.c},${b.r}t${b.t.toFixed(2)}`).join(';') + ' F:' + st.flame.reduce((a, v, i) => (v > 0 ? a + (i % 13) + ',' + ((i / 13) | 0) + ' ' : a), '')); if (st.gstate === 'roundEnd') break; }
      return hist.slice(-70);
    });
    console.log(res.join('\n')); await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.95, aggr: 0.9, style: 'attack' }, { skill: 0.85, aggr: 0.8, style: 'attack' }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/bm_${tag}.png` }); console.log('shot', tag, sum(await page.evaluate(() => window.__app.mode.instance.dbg.state()))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(5)); await snap('start');
    await go('s.roundT>4'); await snap('play');
    await go('s.bombs.length>=2', 60 * 30); await page.evaluate(() => window.__bot(30)); await snap('bombs');
    await go('s.flame.some(f=>f>0.3)', 60 * 60); await page.evaluate(() => window.__bot(7)); await snap('boom');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnSlimes(); d.forceDragon(); });
    await page.evaluate(() => window.__bot(90)); await snap('dragon');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveAll(0); d.spawnItem(3, 0, 'gold'); });
    await page.evaluate(() => window.__bot(60)); await snap('items');
    await page.evaluate(() => window.__app.mode.instance.dbg.setRoundT(19.8));
    await go('s.warn.length>=3', 60 * 40); await page.evaluate(() => window.__bot(40)); await snap('stones');
    await page.evaluate(() => window.__bot(60 * 8)); await snap('stones2');
    await go('s.gstate==="roundEnd"', 60 * 60); await page.evaluate(() => window.__bot(40)); await snap('roundend');
    await go('s.gstate==="end"', 60 * 300); await page.evaluate(() => window.__bot(40)); await snap('end');
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
}
server.close();
console.log(fails ? `\n${fails} CHECK(S) MISLUKT` : '\nALLES OK'); process.exit(fails ? 1 : 0);
