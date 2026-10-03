// Gebruik: node tools/test_tron.mjs [scenario...]   scenario: bots | twists | idle | timeout | rules | shots
//   Achtervoegsel 3 (bots3 twists3 idle3 timeout3 rules3 shots3) = drie spelers (Juul doet mee, ?players=3; winnaar-slot 0, 1 en 2 komen voor).
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

async function open(twist, N = 2) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=tron&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0${N === 3 ? '&players=3' : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false; window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
    for (const q of mode.ids) inp.virtual[q].a = true; inp.update(); mode.update(0.016);
    for (const q of mode.ids) inp.virtual[q].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  const nn = await page.evaluate(() => window.__app.mode.n);
  if (nn !== N) errors.push(`verwacht ${N} spelers, kreeg ${nn}`);
  return { browser, page, errors };
}


// cfg[i] = { skill 0..1, style: 'smart' | 'idle' | 'rand', jump: kans, boost: kans }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 1234; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const W = d.W, H = d.H, DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];
    const V = (b) => ({ alive: b.alive, c: b.c0, r: b.r0, dir: b.dir, meter: b.meter, jumpCd: b.jumpCd, jumpLeft: b.jumpLeft });
    const NP = cfg.length, IDS = m.ids;                // virtual[] is per spelers-id, bots per slot
    const B = cfg.map(() => ({ cool: 0, pulse: 0, pdir: 0, holdA: 0, lastKey: '' }));
    window.__cfg = cfg;
    const free = (c, r, flying) => { if (d.solid(c, r)) return false; const o = d.occ[r * W + c]; return o === 0 || (flying && (o === 3 || o === 4 || o === 6)); };
    function flood(c0, r0, lim, other) { const seen = new Set([r0 * W + c0]); const q = [[c0, r0]]; for (let h = 0; h < q.length && q.length < lim; h++) { const [c, r] = q[h]; for (let k = 0; k < 4; k++) { const nc = c + DX[k], nr = r + DZ[k], key = nr * W + nc; if (seen.has(key) || !free(nc, nr) || (other && other.c === nc && other.r === nr)) continue; seen.add(key); q.push([nc, nr]); } } return q.length; }
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        if (stop && stop(d.state())) { m.paused = true; return true; }
        if (d.G.state === 'play') for (let i = 0; i < NP; i++) {
          const mb = d.bikes[i]; let ob = null, bd = 1e9; d.bikes.forEach((q, j) => { if (j !== i && q.alive) { const dd = Math.abs(q.c0 - mb.c0) + Math.abs(q.r0 - mb.r0); if (dd < bd) { bd = dd; ob = q; } } });   // dichtstbijzijnde levende tegenstander
          const v = inp.virtual[IDS[i]], b = B[i], c = window.__cfg[i], me = V(mb), o = ob ? V(ob) : { alive: false, c: -9, r: -9 }; v.a = false; v.b = false;
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
            if ((o2 === 3 || o2 === 4 || o2 === 6) && rnd() < c.jump) { for (let L2 = 3; L2 <= 7; L2++) if (free(me.c + DX[dir] * L2, me.r + DZ[dir] * L2)) { v.b = true; turn = null; break; } }
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

for (const name0 of scen) {
  const N = name0.endsWith('3') ? 3 : 2, name = name0.replace(/3$/, '');
  if (['bots', 'twists', 'idle', 'timeout'].includes(name)) {
    const A = { skill: 0.97, style: 'smart', jump: 0.8, boost: 0.02 }, Bw = { skill: 0.3, style: 'smart', jump: 0.2, boost: 0.01 };
    const I = { style: 'idle' }, S0 = { skill: 0.97, style: 'smart', jump: 0, boost: 0 }, TWE = process.env.TW || 'none';
    const list = N === 3
      ? (name === 'twists' ? TWISTS.filter((t) => !process.env.ONLY || t === process.env.ONLY).map((t) => [t, [A, Bw, A]])
        : name === 'idle' ? [['none', [I, I, I]], ['none', [A, I, I]], ['none', [I, I, A]]]
          : name === 'timeout' ? [['none', [I, S0, S0]]]
            : [[TWE, [A, Bw, Bw]], [TWE, [Bw, A, Bw]], [TWE, [Bw, Bw, A]], [TWE, [A, A, A]], [TWE, [A, A, A]], [TWE, [A, A, A]]])
      : name === 'twists' ? TWISTS.filter((t) => !process.env.ONLY || t === process.env.ONLY).map((t) => [t, [A, Bw]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ style: 'idle' }, { skill: 0.97, style: 'smart', jump: 0, boost: 0 }]]]
          : [[process.env.TW || 'none', [A, Bw]], [process.env.TW || 'none', [Bw, A]], [process.env.TW || 'none', [A, A]], [process.env.TW || 'none', [A, A]]];
    const winners = [0, 0, 0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw, N);
      await installBots(page, cfg);
      if (tw === 'deurman') { await page.evaluate((N) => { window.__bot(240); window.__app.mode.instance.onDeurman(N === 3 ? [true, false, true] : [true, true]); }, N); }
      const res = await runMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} frames=${res.frames} ===`);
      console.log(res.log.join('\n')); console.log(sum(res.st));
      check(res.finished && res.fin === 1, `finishPvp precies 1x (aantal=${res.fin})`);
      if (res.result) { console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`); check(res.result.winner != null && res.result.winner >= 0 && res.result.winner < N && res.result.scoreArr.length === N, `er is een winnaar (${N} spelers)`); winners[res.result.winner ?? 3]++; }
      check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
      await browser.close();
    }
    if (name === 'bots') check(N === 3 ? winners[0] > 0 && winners[1] > 0 && winners[2] > 0 : winners[0] > 0 && winners[1] > 0, N === 3 ? `alle spelers kunnen winnen (Wes ${winners[0]}x, Jor ${winners[1]}x, Juul ${winners[2]}x)` : `beide spelers kunnen winnen (Wes ${winners[0]}x, Jor ${winners[1]}x)`);
    continue;
  }
  if (name0 === 'arcade3') {
    // route Speelhal -> playGame met alle drie spelers (extra.players [0,1,2]) -> finishPvp(winner = slot 2) -> statistieken op spelers-id 2 (arcadetest speelt alleen paren)
    const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1100, height: 650 } }); const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(m.text()); }); page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
    await page.goto(`http://localhost:${port}/?quality=low&unlock=1&players=3`);
    await page.waitForFunction(() => window.__app && window.__app.games, null, { timeout: 90000 }); await page.waitForTimeout(1500);
    await page.evaluate(() => window.__app.goArcade({}));
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs, null, { timeout: 60000 }); await page.waitForTimeout(1000);
    const before = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { plays: S.arcade.plays, wins: S.arcade.wins.slice() }; });
    await page.evaluate((id) => { window.__app.mode.leaving = true; return window.__app.playGame(id, { back: 'arcade', extra: { players: [0, 1, 2] } }); }, 'tron');
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.ctx, null, { timeout: 60000 }); await page.waitForTimeout(600);
    const info = await page.evaluate(async () => {
      const m = window.__app.mode, inp = window.__app.input;
      for (const q of m.ids) inp.virtual[q].a = true; inp.update(); m.update(0.016); for (const q of m.ids) inp.virtual[q].a = false; inp.update(); m.update(0.016);
      await new Promise((r) => setTimeout(r, 400)); let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); }
      for (let i = 0; i < 120; i++) { inp.update(); m.update(0.016); }
      m.ctx.finishPvp({ winner: 2, score: [0, 1, 2], summary: 'testduel' });
      return { ids: m.ids.slice(), n: m.n, hud: document.querySelectorAll('.hud-top .pbox').length };
    });
    await page.waitForFunction(() => window.__app.mode.resultReady, null, { timeout: 20000 });
    await page.evaluate(() => { const m = window.__app.mode, inp = window.__app.input; m.resSel = 1; inp.virtual[m.ids[0]].a = true; inp.update(); m.update(0.016); inp.virtual[m.ids[0]].a = false; inp.update(); m.update(0.016); });
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.interact, null, { timeout: 60000 }); await page.waitForTimeout(800);
    const after = await page.evaluate(async (id) => { const { S } = await import('/src/save.js'); return { plays: S.arcade.plays, wins: S.arcade.wins.slice(), g: S.arcade.byGame[id] }; }, 'tron');
    console.log('arcade3', JSON.stringify({ info, before, after }));
    check(info.ids.join() === '0,1,2' && info.n === 3, 'alle drie spelen mee via de Speelhal-route');
    check(after.plays === before.plays + 1 && after.wins[2] === before.wins[2] + 1 && after.wins[0] === before.wins[0] && after.g && after.g.wins[2] >= 1, 'winst telt voor spelers-id 2 (Juul)');
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'rules' && N === 3) {
    // 3 spelers: driehoeksstart, ronde gaat door na de eerste crash, laatste wint, gelijkspel-ronde, spoor per slot, draak mikt op de leider, gelijkspel -> draak kiest
    const { browser, page, errors } = await open(process.env.TW || 'none', 3);
    const R = await page.evaluate(() => {
      const app = window.__app, m = app.mode, d = m.instance.dbg, inp = app.input; const out = {};
      const W = d.W, step = (n) => { m.paused = false; for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } m.paused = true; };
      const reset = () => { d.startRound(1); d.G.state = 'play'; d.G.ending = false; d.bikes.forEach((b) => { b.q.length = 0; }); for (let i = 0; i < d.occ.length; i++) if (d.occ[i] === 2) d.occ[i] = 0; };
      out.size = [d.W, d.H];
      reset(); out.starts = d.bikes.map((b) => [b.c0, b.r0, b.dir]);
      step(60); out.trail6 = d.occ.filter((o) => o === 6).length; out.trail3 = d.occ.filter((o) => o === 3).length; out.trail4 = d.occ.filter((o) => o === 4).length;
      // 1) eerste crash: de ronde gaat door; tweede crash: winnaar = slot 0
      reset(); step(5); d.crash(2); step(3); out.after1 = { g: d.state().gstate, ending: d.G.ending, alive: d.bikes.map((b) => b.alive) };
      d.crash(1); step(120); out.after2 = { g: d.state().gstate, wins: [...d.G.wins] };
      // 2) iedereen tegelijk: gelijkspel, iedereen +1
      d.G.wins.fill(0); reset(); step(5); d.crashMany([0, 1, 2]); step(120); out.draw = [...d.G.wins];
      // 3) twee tegelijk (de laatste twee): die twee krijgen +1
      d.G.wins.fill(0); reset(); step(5); d.crash(2); step(2); d.crashMany([0, 1]); step(120); out.draw2 = [...d.G.wins];
      // 4) spoor van slot 2 (occ 6) is dodelijk voor een ander
      reset(); const a = d.bikes[0], DXs = [1, 0, -1, 0], DZs = [0, 1, 0, -1]; d.occ[(a.r0 + DZs[a.dir] * 2) * W + a.c0 + DXs[a.dir] * 2] = 6; step(60); out.hit6 = !a.alive;
      // 5) draak mikt op de leider (slot 1 heeft de meeste ronde-winsten)
      d.G.wins.fill(0); d.G.wins[1] = 1; reset(); d.bikes[1].c0 = 30; d.bikes[1].r0 = 20; d.bikes[1].pc = 30; d.bikes[1].pr = 20; d.forceDragon(); step(30);
      out.dragon = { state: d.state().dragon, axis: d.D.axis, k0: d.D.k0, lead: d.bikes[1].c0 + ',' + d.bikes[1].r0 };
      // 6) 1-1-1 na ronde 3: de draak kiest een winnaar
      d.G.wins.fill(1); d.G.round = 3; reset(); d.G.round = 3; d.G.state = 'roundEnd'; d.G.t = 9; step(2); out.tieState = d.state().gstate;
      step(60 * 14); out.tieFin = { fin: window.__fin.length, winner: m.result && m.result.winner, byDragon: d.state().byDragon, score: m.result && m.result.scoreArr };
      return out;
    });
    console.log('rules3', JSON.stringify(R));
    check(R.size[0] === 46 && R.size[1] === 34, `grotere arena (${R.size})`);
    check(R.starts.length === 3 && new Set(R.starts.map((x) => x[0] + ',' + x[1])).size === 3, `3 startposities (${JSON.stringify(R.starts)})`);
    check(R.trail3 > 3 && R.trail4 > 3 && R.trail6 > 3, `elke rijder legt een eigen spoor (${R.trail3}/${R.trail4}/${R.trail6})`);
    check(R.after1.g === 'play' && !R.after1.ending && R.after1.alive.filter(Boolean).length === 2, 'na de eerste crash gaat de ronde door');
    check(R.after2.g === 'roundEnd' && R.after2.wins.join() === '1,0,0', `laatste in leven wint de ronde (${R.after2.wins})`);
    check(R.draw.join() === '1,1,1', `iedereen crasht tegelijk = gelijkspel (${R.draw})`);
    check(R.draw2.join() === '1,1,0', `laatste twee tegelijk = gelijkspel tussen die twee (${R.draw2})`);
    check(R.hit6, 'spoor van slot 2 is dodelijk');
    check(R.dragon.state === 'warn' && R.dragon.k0 === (R.dragon.axis === 0 ? 20 : 30), `draak mikt op de leider (${JSON.stringify(R.dragon)})`);
    check(R.tieState === 'dragon' && R.tieFin.fin === 1 && R.tieFin.winner >= 0 && R.tieFin.winner <= 2 && R.tieFin.byDragon && R.tieFin.score.join() === '1,1,1', `1-1-1: draak kiest, finishPvp 1x (${JSON.stringify(R.tieFin)})`);
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'rules') {
    // gerichte regeltests met hand-gezette situaties
    const { browser, page, errors } = await open(process.env.TW || 'none');
    const R = await page.evaluate(() => {
      const app = window.__app, m = app.mode, d = m.instance.dbg, inp = app.input; const out = {};
      const W = d.W, step = (n) => { m.paused = false; for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } m.paused = true; };
      const reset = () => { d.startRound(1); d.G.state = 'play'; d.bikes.forEach((b) => { b.q.length = 0; }); for (let i = 0; i < d.occ.length; i++) if (d.occ[i] === 2) d.occ[i] = 0; };   // geen willekeurige obstakels in de weg (deterministisch)
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
      reset(); { const a3 = d.bikes[0]; for (let k = 0; k < 30; k++) d.occ[(a3.r0 - 2 + (k % 5)) * W + a3.c0 + 2 + (k % 6)] = 4; } d.give(0, 'eraser'); out.erasedLeft = d.occ.filter((o) => o === 4).length;
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
    const { browser, page, errors } = await open(process.env.TW || 'none', N);
    await installBots(page, N === 3 ? [{ skill: 0.97, style: 'smart', jump: 0.8, boost: 0.03 }, { skill: 0.9, style: 'smart', jump: 0.8, boost: 0.03 }, { skill: 0.93, style: 'smart', jump: 0.8, boost: 0.03 }] : [{ skill: 0.97, style: 'smart', jump: 0.8, boost: 0.03 }, { skill: 0.9, style: 'smart', jump: 0.8, boost: 0.03 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/tr${N === 3 ? '3' : ''}_${tag}.png` }); console.log('shot', tag, sum(await page.evaluate(() => window.__app.mode.instance.dbg.state()))); };
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
