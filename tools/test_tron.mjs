// Gebruik: node tools/test_tron.mjs [scenario...]   scenario: bots | twists | idle | timeout | rules | shots
//   TW=<twist-id> kiest een twist (anders "none" / per scenario). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes. Controleert: finishPvp precies één keer, beide spelers kunnen winnen,
// spelregels (botsen, springen, wisser, draak, krimpen) kloppen, geen console-errors, elke twist werkt.
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
  await page.goto(`http://localhost:${port}/?game=tron&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
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


// cfg[i] = { skill 0..1, style: 'smart' | 'idle' | 'rand', jump: kans, boost: kans }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 1234; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const W = d.W, H = d.H, DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
    const V = (b) => ({ alive: b.alive, c: b.c0, r: b.r0, dir: b.dir, meter: b.meter, jumpCd: b.jumpCd, jumpLeft: b.jumpLeft });
    const B = [0, 1].map(() => ({ cool: 0, pulse: 0, pdir: 0, holdA: 0, lastKey: '' }));
    window.__cfg = cfg;
    const free = (c, r, flying) => { if (d.solid(c, r)) return false; const o = d.occ[r * W + c]; return o === 0 || (flying && (o === 3 || o === 4)); };
    function flood(c0, r0, lim, other) { const seen = new Set([r0 * W + c0]); const q = [[c0, r0]]; for (let h = 0; h < q.length && q.length < lim; h++) { const [c, r] = q[h]; for (let k = 0; k < 4; k++) { const nc = c + DX[k], nr = r + DZ[k], key = nr * W + nc; if (seen.has(key) || !free(nc, nr) || (other && other.c === nc && other.r === nr)) continue; seen.add(key); q.push([nc, nr]); } } return q.length; }
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        if (stop && stop(d.state())) { m.paused = true; return true; }
        if (d.G.state === 'play') for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = V(d.bikes[i]), o = V(d.bikes[1 - i]); v.a = false; v.b = false;
          if (b.pulse > 0) { b.pulse--; if (b.pulse === 0) { v.x = 0; v.y = 0; } continue; }
          v.x = 0; v.y = 0;
          if (!me.alive || c.style === 'idle') continue;
          if (c.style === 'rand') { if (rnd() < 0.04) { const dd = (rnd() * 4) | 0; v.x = DX[dd]; v.y = DZ[dd]; b.pulse = 2; } v.a = rnd() < 0.3; v.b = rnd() < 0.05; continue; }
          b.cool--; if (b.holdA > 0) { b.holdA--; v.a = true; } else if (me.meter > 0.6 && rnd() < c.boost) b.holdA = 40 + ((rnd() * 60) | 0);
          if (b.cool > 0) continue;
          const dir = me.dir, opts = [dir, (dir + 1) % 4, (dir + 3) % 4];
          const scoreOf = (dd) => { const nc = me.c + DX[dd], nr = me.r + DZ[dd]; if (!free(nc, nr) || (o.alive && o.c === nc && o.r === nr)) return -1; return flood(nc, nr, c.skill > 0.5 ? 220 : 25, o.alive ? o : null) + (dd === dir ? 6 : 0); };
          const sc = opts.map(scoreOf); let best = 0; for (let j = 1; j < 3; j++) if (sc[j] > sc[best]) best = j;
          // kijk 2 cellen vooruit: vrij?
          const ahead = free(me.c + DX[dir] * 2, me.r + DZ[dir] * 2) && free(me.c + DX[dir], me.r + DZ[dir]);
          let turn = null;
          if (sc[0] < 0 || (!ahead && c.skill > 0.3 && best !== 0 && sc[best] > 0)) turn = opts[best];
          else if (c.skill < 0.5 && rnd() < 0.03) turn = opts[1 + ((rnd() * 2) | 0)];
          else if (sc[best] > sc[0] * 1.6 + 10) turn = opts[best];
          // sprong: spoor vlak voor me en landing vrij
          if (me.jumpCd <= 0 && me.jumpLeft === 0 && c.jump > 0) {
            const nc = me.c + DX[dir], nr = me.r + DZ[dir]; const o2 = d.occ[nr * W + nc];
            if ((o2 === 3 || o2 === 4) && rnd() < c.jump) { for (let L2 = 3; L2 <= 7; L2++) if (free(me.c + DX[dir] * L2, me.r + DZ[dir] * L2)) { v.b = true; turn = null; break; } }
          }
          if (turn != null) { v.x = DX[turn]; v.y = DZ[turn]; b.pulse = 2; b.cool = 3; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const sum = (st) => `R${st.round} ${st.gstate} wins=${st.wins} sprongen=${st.stats.jumps} grazes=${st.stats.grazes} items=${st.stats.items} gewist=${st.stats.erased} draak=${st.stats.dragons} verbrand=${st.stats.burned} crashes=${st.stats.crashes}`;

async function runMatch(page, maxFrames = 60 * 400) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance, d = inst.dbg; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = d.state(); const key = st.round + ':' + st.wins.join('-') + ':' + st.gstate;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} R${st.round} ${st.gstate} wins=${st.wins}`); last = key; }
    }
    const frames = g;
    for (let k = 0; k < 120; k++) { window.__bot(1); }
    return { log, st: d.state(), finished: m.finished, result: m.result, fin: window.__fin.length, twist: m.twist.id, frames };
  }, maxFrames);
}

for (const name of scen) {
  if (['bots', 'twists', 'idle', 'timeout'].includes(name)) {
    const A = { skill: 0.97, style: 'smart', jump: 0.8, boost: 0.02 }, Bw = { skill: 0.3, style: 'smart', jump: 0.2, boost: 0.01 };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [A, Bw]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ style: 'idle' }, { skill: 0.97, style: 'smart', jump: 0, boost: 0 }]]]
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
  if (name === 'rules') {
    // gerichte regeltests met hand-gezette situaties
    const { browser, page, errors } = await open(process.env.TW || 'none');
    const R = await page.evaluate(() => {
      const app = window.__app, m = app.mode, d = m.instance.dbg, inp = app.input; const out = {};
      const W = d.W, step = (n) => { m.paused = false; for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } m.paused = true; };
      const reset = () => { d.startRound(1); d.G.state = 'play'; d.bikes.forEach((b) => { b.q.length = 0; }); };
      // 1) rechtdoor rijden laat een spoor achter en botst op de muur
      reset(); step(60 * 6);
      out.wallCrash = d.state().gstate !== 'play' || !d.bikes[0].alive || !d.bikes[1].alive; out.trailCells = d.occ.filter((o) => o === 3).length;
      // 2) sprong over een spoor
      reset(); const a = d.bikes[0]; d.occ[a.r0 * W + a.c0 + 3] = 4; step(1); a.jumpCd = 0; inp.virtual[0].b = true; step(2); inp.virtual[0].b = false; step(60 * 1.6);
      out.jumpAlive = a.alive; out.jumpCount = d.state().stats.jumps;
      // 3) landen op een spoor = crash
      reset(); const a2 = d.bikes[0]; for (let k = 2; k <= 7; k++) d.occ[a2.r0 * W + a2.c0 + k] = 4; a2.jumpCd = 0; inp.virtual[0].b = true; step(2); inp.virtual[0].b = false; step(60 * 1.5);
      out.landCrash = !a2.alive;
      // 4) wisser
      reset(); for (let k = 0; k < 30; k++) d.occ[(10 + (k % 3)) * W + 10 + k % 20] = 4; d.give(0, 'eraser'); out.erasedLeft = d.occ.filter((o) => o === 4).length;
      // 5) draak veegt en verbrandt
      reset(); step(30); for (let k = 5; k < 35; k++) d.occ[8 * W + k] = 3; d.forceDragon(); step(60 * 5); out.dragonStats = d.state().stats.dragons;
      return out;
    });
    console.log('rules', JSON.stringify(R));
    check(R.wallCrash, 'rechtdoor rijden eindigt in een botsing'); check(R.trailCells > 20, `spoor wordt gelegd (${R.trailCells} cellen)`);
    check(R.jumpAlive && R.jumpCount >= 1, 'springen over een spoor overleef je'); check(R.landCrash, 'landen op een spoor = crash');
    check(R.erasedLeft < 10, `wisser veegt sporen weg (${R.erasedLeft} over)`); check(R.dragonStats >= 1, 'draak komt langs');
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.97, style: 'smart', jump: 0.8, boost: 0.03 }, { skill: 0.9, style: 'smart', jump: 0.8, boost: 0.03 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/tr_${tag}.png` }); console.log('shot', tag, sum(await page.evaluate(() => window.__app.mode.instance.dbg.state()))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(3)); await snap('start');
    await go('s.roundT>6'); await snap('play');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.bikes[0].meter = 1; d.spawnItemPair(); d.forceDragon(); });
    await go('s.dragon==="warn"', 60 * 5); await page.evaluate(() => window.__bot(100)); await snap('dragon');
    await page.evaluate(() => window.__bot(60 * 3)); await snap('play2');
    await page.evaluate(() => window.__app.mode.instance.dbg.setRoundT(20));
    await page.evaluate(() => window.__bot(60 * 3)); await snap('shrink');
    await go('s.gstate==="roundEnd"', 60 * 60); await page.evaluate(() => window.__bot(30)); await snap('roundend');
    await go('s.gstate==="end"', 60 * 300); await page.evaluate(() => window.__bot(40)); await snap('end');
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
}
server.close();
console.log(fails ? `\n${fails} CHECK(S) MISLUKT` : '\nALLES OK'); process.exit(fails ? 1 : 0);
