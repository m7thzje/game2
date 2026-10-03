// Gebruik: node tools/test_pacduel.mjs [scenario...]   scenario: maze | bots | twists | idle | timeout | sudden | shots
//   TW=<twist-id> kiest een twist (anders: "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp precies 1x komt, beide spelers kunnen winnen,
// elke twist werkt en er geen console-fouten zijn.
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
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['maze', 'bots'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=pacduel&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // finishPvp-teller
    window.__fin = 0; const ctx = mode.ctx, orig = ctx.finishPvp; ctx.finishPvp = (r) => { window.__fin++; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1, style: 'coins'|'hunt'|'idle', block: kans, sprint: kans }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__cfg = cfg;
    const W = 21, H = 15, DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const key = (x, z) => z * W + x;
    function nb(x, z) {
      const out = [];
      for (const [dx, dz] of DIRS) { let nx = x + dx; if (!d.free(nx, z + dz)) continue; if (nx < 0) nx = W - 1; else if (nx >= W) nx = 0; out.push([nx, z + dz, dx, dz]); }
      return out;
    }
    // BFS vanaf (sx,sz); retourneert { dist, first } (eerste stap-richting)
    function bfs(sx, sz, avoid) {
      const dist = new Int16Array(W * H).fill(-1), first = new Int8Array(W * H * 2); const q = [[sx, sz]]; dist[key(sx, sz)] = 0;
      for (let h = 0; h < q.length; h++) {
        const [x, z] = q[h];
        for (const [nx, nz, dx, dz] of nb(x, z)) { const k = key(nx, nz); if (dist[k] >= 0 || (avoid && avoid[k])) continue; dist[k] = dist[key(x, z)] + 1; if (h === 0) { first[k * 2] = dx; first[k * 2 + 1] = dz; } else { first[k * 2] = first[key(x, z) * 2]; first[k * 2 + 1] = first[key(x, z) * 2 + 1]; } q.push([nx, nz]); }
      }
      return { dist, first };
    }
    const bot = [0, 1].map(() => ({ sprintT: 0, lastGoal: null }));
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = st.pl[i], ot = st.pl[1 - i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || me.resp > 0 || me.stun > 0 || !(st.gstate === 'play' || st.gstate === 'sudden')) continue;
          const cx = Math.round(me.x), cz = Math.round(me.z);
          // spookjes ontwijken
          const avoid = new Uint8Array(W * H);
          for (const g of st.ghosts) if (g.dead <= 0 && g.wait <= 0 && g.mode !== 'scared' && me.inv <= 0 && me.hunter <= 0) { const gx = Math.round(g.x), gz = Math.round(g.z); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (Math.abs(a) + Math.abs(b) <= 1 && gx + a >= 0 && gx + a < W && gz + b >= 0 && gz + b < H) avoid[key(gx + a, gz + b)] = 1; }
          avoid[key(cx, cz)] = 0;
          let { dist, first } = bfs(cx, cz, avoid); if (dist.reduce((a, b) => a + (b >= 0), 0) < 8) ({ dist, first } = bfs(cx, cz, null));
          let best = null, bd = 1e9;
          const consider = (x, z, bonus = 0) => { x = Math.round(x); z = Math.round(z); const dd = dist[key(x, z)]; if (dd < 0) return; const sc = dd - bonus; if (sc < bd) { bd = sc; best = [x, z, dd]; } };
          if (st.gold) consider(st.gold[0], st.gold[1], 0);
          else {
            if (me.hunter > 0 && ot.resp <= 0 && ot.inv <= 0) consider(ot.x, ot.z, 100);
            else if (ot.hunter > 0 && c.skill > 0.4) { /* weglopen: kies munt het verst van de jager */ }
            for (let zz = 0; zz < H; zz++) for (let xx = 0; xx < W; xx++) if (d.coin[key(xx, zz)]) consider(xx, zz, 0);
            if (c.style === 'hunt' || rnd() < 0.002) for (const o of st.orbs) if (o.on) consider(o.x, o.z, c.style === 'hunt' ? 14 : 4);
            for (const f of st.fruits) consider(f.x, f.z, 6);
            if (me.hunter > 0) for (const g of st.ghosts) if (g.mode === 'scared' && g.dead <= 0) consider(g.x, g.z, 3);
          }
          if (best && (best[0] !== cx || best[1] !== cz)) {
            const k2 = key(best[0], best[1]); let dx = first[k2 * 2], dz = first[k2 * 2 + 1];
            if (rnd() < (1 - c.skill) * 0.08) { const o = DIRS[Math.floor(rnd() * 4)]; dx = o[0]; dz = o[1]; }
            v.x = dx; v.y = dz;
            if (me.sprintCd <= 0 && best[2] > 5 && rnd() < c.sprint) v.a = true;
          } else if (best) { v.x = me.dx; v.y = me.dz; }
          // gelei-blok: als de ander jager is en dichtbij komt
          if (me.bombCd <= 0 && ((ot.hunter > 0 && Math.hypot(ot.x - me.x, ot.z - me.z) < 5) || rnd() < c.block)) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function runMatch(label, twist, cfg, pre) {
  const { browser, page, errors } = await open(twist);
  await installBots(page, cfg);
  if (pre) await page.evaluate(pre);
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0, guard = 0;
    while (!m.finished && g++ < 60 * 220) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.gstate + ':' + st.sd + ':' + st.double + ':' + st.pl.map((p) => (p.hunter > 0 ? 'H' : '') + (p.resp > 0 ? 'R' : '')).join('');
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.gstate} left=${st.timeLeft.toFixed(1)} coins=${st.pl.map((p) => p.coins)} hunters=${st.pl.map((p) => +p.hunter.toFixed(1))}`); last = key; }
    }
    const st = inst.dbg.state();
    for (let k = 0; k < 60 * 4; k++) { window.__bot(1); }   // doorspelen: finishPvp mag niet nog eens komen
    return { log: log.slice(-14), st, finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
  });
  console.log(`\n=== ${label} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
  console.log(res.log.join('\n'));
  const s = res.st;
  console.log(`end T=${s.T.toFixed(1)} coins=${s.pl.map((p) => p.coins)} steals=${s.stats.steals} ghostHits=${s.stats.ghostHits} fruit=${s.stats.fruit} ghostsEaten=${s.stats.ghostsEaten} refills=${s.refills} doorEvents=${s.doorEvents}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  check(res.finished && res.fin === 1, `${label}: finishPvp precies 1x (fin=${res.fin}, finished=${res.finished})`);
  check(res.result && res.result.winner != null, `${label}: altijd een winnaar (winner=${res.result && res.result.winner})`);
  check(!errors.length, `${label}: geen console-fouten ${errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''}`);
  await browser.close();
  return res;
}

for (const name of scen) {
  if (name === 'maze') {
    // doolhof: symmetrisch, alles bereikbaar, geen doodlopende stukken (behalve tunnel-randen)
    const M = await import(path.join(root, 'src/games/pacduel_maze.js'));
    const mz = M.buildMaze(); const { W, H } = M; const wall = mz.wall;
    const open = (x, z) => x >= 0 && x < W && z >= 0 && z < H && !wall[z * W + x];
    let sym = true, dead = 0; for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) { if (wall[z * W + x] !== wall[z * W + (W - 1 - x)]) sym = false; if (open(x, z)) { const dg = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => open(x + a, z + b)).length; if (dg < 2 && x > 0 && x < W - 1) dead++; } }
    const seen = new Set(['1,1']), q = [[1, 1]]; while (q.length) { const [x, z] = q.pop(); for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (open(x + a, z + b) && !seen.has((x + a) + ',' + (z + b))) { seen.add((x + a) + ',' + (z + b)); q.push([x + a, z + b]); } }
    check(sym, 'doolhof is links-rechts symmetrisch'); check(dead === 0, `geen doodlopende gangen (${dead})`); check(seen.size === mz.cells.length, `alle ${mz.cells.length} vakjes bereikbaar (${seen.size})`);
    check(mz.starts.length === 2 && mz.starts[0][0] + mz.starts[1][0] === W - 1 && mz.starts[0][1] === mz.starts[1][1], 'startplekken gespiegeld');
    continue;
  }
  if (name === 'bots') {
    const A = { skill: 0.95, style: 'hunt', block: 0.002, sprint: 0.05 }, B = { skill: 0.55, style: 'coins', block: 0.001, sprint: 0.02 };
    const r1 = await runMatch('bots A>B', process.env.TW || 'none', [A, B]);
    const r2 = await runMatch('bots B>A', process.env.TW || 'none', [B, A]);
    const r3 = await runMatch('bots gelijk', process.env.TW || 'none', [A, A]);
    const ws = new Set([r1, r2, r3].map((r) => r.result && r.result.winner)); check(ws.has(0) && ws.has(1), `beide spelers kunnen winnen (winnaars: ${[...ws]})`);
    continue;
  }
  if (name === 'twists') {
    const A = { skill: 0.9, style: 'hunt', block: 0.002, sprint: 0.04 }, B = { skill: 0.7, style: 'coins', block: 0.001, sprint: 0.02 };
    for (const t of TWISTS) await runMatch('twist', t, [A, B]);
    continue;
  }
  if (name === 'idle') { await runMatch('idle', 'none', [{ style: 'idle' }, { style: 'idle' }]); continue; }
  if (name === 'timeout') {
    await runMatch('timeout', 'none', [{ skill: 0.9, style: 'coins', block: 0, sprint: 0 }, { skill: 0.9, style: 'coins', block: 0, sprint: 0 }], () => { window.__app.mode.instance.dbg.setTime(6); });
    continue;
  }
  if (name === 'sudden') {
    // gelijkspel afdwingen: tijd bijna op, munten gelijk, bots die niets doen -> gouden munt
    await runMatch('sudden(idle)', 'none', [{ style: 'idle' }, { style: 'idle' }], () => { const d = window.__app.mode.instance.dbg; d.setTime(3); d.setCoins(10, 10); });
    await runMatch('sudden(bots)', 'none', [{ skill: 0.9, style: 'coins', block: 0, sprint: 0 }, { skill: 0.9, style: 'coins', block: 0, sprint: 0 }], () => { const d = window.__app.mode.instance.dbg; d.setTime(0.05); d.setCoins(10, 10); });
    continue;
  }
  if (name === 'hooks') {
    const { browser, page, errors } = await open('none');
    const r = await page.evaluate(() => { const m = window.__app.mode, inp = window.__app.input, i = m.instance; m.paused = false; for (let k = 0; k < 90; k++) { inp.update(); m.update(1 / 60); } i.onDeurman([true, false]); i.onSwap(true); i.onDeurman([false, true]); for (let k = 0; k < 60; k++) { inp.update(); m.update(1 / 60); } i.celebrate(0); i.celebrate(1); i.resultUpdate(0.05); return true; });
    check(r && !errors.length, 'hooks (onDeurman/onSwap/celebrate) zonder fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.85, style: 'hunt', block: 0.003, sprint: 0.04 }, { skill: 0.8, style: 'coins', block: 0.002, sprint: 0.03 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/pd_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.gstate, left: +s.timeLeft.toFixed(1), coins: s.pl.map((p) => p.coins), hunter: s.pl.map((p) => +p.hunter.toFixed(1)), calls: window.__app.renderer.info.render.calls, tris: window.__app.renderer.info.render.triangles }; }))); };
    const dbg = (fn, ...a) => page.evaluate(([f, a]) => window.__app.mode.instance.dbg[f](...a), [fn, a]);
    const run = (n, cond) => page.evaluate(([n, c]) => window.__bot(n, c ? new Function('s', 'return ' + c) : null), [n, cond || null]);
    await run(60 * 6); await snap('play1');
    await dbg('spawnFruit'); await run(30); await snap('fruit');
    await dbg('giveOrb', 0); await run(40); await snap('hunter');
    await dbg('startDoorEvent'); await run(50); await snap('deurman0'); await run(50); await snap('deurman');
    await run(60, 's.gates[4]!==s.gates[10]'); await run(40); await snap('door2');
    await dbg('hitGhost', 1); await run(10); await snap('ghosthit');
    await dbg('setCoins', 31, 18); await dbg('steal', 0, 1); await run(12); await snap('steal');
    await dbg('setTime', 14); await run(90); await snap('double');
    await dbg('setCoins', 20, 20); await dbg('setTime', 0.3); await run(240); await snap('sudden');
    await run(60 * 30, 's.gstate==="end"'); await run(60); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(failures ? `\n${failures} CHECK(S) MISLUKT` : '\nALLE CHECKS GESLAAGD');
server.close();
process.exitCode = failures ? 1 : 0;
