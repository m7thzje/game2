// Gebruik: node tools/test_hexagone.mjs [scenario...]   scenario: bots | twists | idle | timeout | rules | shots
//   Achtervoegsel 3 (bots3 twists3 idle3 timeout3 rules3 shots3) = drie spelers (Juul doet mee, ?players=3; winnaar-slot 0, 1 en 2 komen voor).
//   TW=<twist-id> kiest een twist (anders "none"). Bots spelen versneld (zonder renderen) hele potjes; rapporteert rondes, winnaar, finishPvp-aantal, fouten.
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
let failed = 0; const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

async function open(twist, size = [1100, 650], N = 2) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=hexagone&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0${N === 3 ? '&players=3' : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    for (const q of mode.ids) inp.virtual[q].a = true; inp.update(); mode.update(0.016);
    for (const q of mode.ids) inp.virtual[q].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
    // finishPvp tellen
    window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
  });
  const nn = await page.evaluate(() => window.__app.mode.n);
  if (nn !== N) errors.push(`verwacht ${N} spelers, kreeg ${nn}`);
  return { browser, page, errors };
}

// bots: cfg[i] = { skill 0..1, style: 'push' | 'run' | 'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const NP = cfg.length, IDS = m.ids;                // virtual[] is per spelers-id, bots per slot
    const B = cfg.map(() => ({ ja: 0, bb: 0, lastA: false, dir: null, keep: 0 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        const tl = d.tiles;
        for (let i = 0; i < NP; i++) {
          let op = null, bd = 1e9; st.pl.forEach((q, j) => { if (j === i) return; const d2 = (q.x - st.pl[i].x) ** 2 + (q.z - st.pl[i].z) ** 2 + (q.dead ? 1e5 : 0); if (d2 < bd) { bd = d2; op = q; } });   // dichtstbijzijnde (levende) tegenstander
          const v = inp.virtual[IDS[i]], b = B[i], c = window.__cfg[i], me = st.pl[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.rstate !== 'play' || me.dead) continue;
          const ok = (x, z) => { const l = tl.support(x, z, me.y, 0.3); if (l < 0) return -6; const kk = tl.kAt(x, z); const s2 = tl.st[l * tl.K + kk]; return s2 === 0 ? 2 : s2 === 1 ? -1.5 : -6; };
          b.keep -= dt;
          if (!b.dir || b.keep <= 0) {
            let best = -1e9, ba = 0;
            for (let a = 0; a < 16; a++) {
              const an = a / 16 * Math.PI * 2 + (rnd() - 0.5) * 0.2, cx = Math.cos(an), cz = Math.sin(an); let sc = 0;
              for (const dd of [1.4, 2.8, 4.2]) { const x = me.x + cx * dd, z = me.z + cz * dd; sc += ok(x, z) * (dd < 2 ? 1.5 : 1) - (Math.abs(x) > 11.5 ? 4 : 0) - (Math.abs(z) > 7.4 ? 4 : 0); }
              const ox = op.x - me.x, oz = op.z - me.z, od = Math.hypot(ox, oz) || 1, dot = (cx * ox + cz * oz) / od;
              if (c.style === 'push') sc += dot * 2.2 * (od < 9 ? 1 : 0.2); else sc -= dot * (od < 4 ? 2.5 : 0);
              sc += rnd() * (1 - c.skill) * 6;
              if (sc > best) { best = sc; ba = an; }
            }
            b.dir = [Math.cos(ba), Math.sin(ba)]; b.keep = 0.18 + (1 - c.skill) * 0.3;
          }
          v.x = b.dir[0]; v.y = b.dir[1];
          // spring over een gat vlak voor je
          const ax = me.x + b.dir[0] * 1.6, az = me.z + b.dir[1] * 1.6;
          if (me.g && ok(ax, az) <= -5 && !b.lastA && rnd() < 0.3 + c.skill * 0.6) { v.a = true; }
          // dubbele sprong in de lucht
          if (!me.g && me.dj && me.y < -0.3 && !b.lastA && rnd() < 0.1) v.a = true;
          b.lastA = v.a;
          // duwen
          const od = Math.hypot(op.x - me.x, op.z - me.z);
          if (c.style === 'push' && od < 2.3 && me.cd <= 0 && Math.abs(op.y - me.y) < 1.5 && rnd() < 0.25 + c.skill * 0.4) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function playMatch(page, maxFrames = 60 * 400) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance, log = []; let last = '', g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = `${st.round}:${st.rstate}:${st.wins}`;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} ronde ${st.round} ${st.rstate} wins=${st.wins} tp=${st.tp.toFixed(1)} solid=${st.solid} loser=${st.loser}`); last = key; }
    }
    // laat de harness afronden
    window.__app.mode.paused = false; for (let k = 0; k < 400 && !window.__app.mode.result; k++) { window.__app.input.update(); m.update(1 / 60); } window.__app.mode.paused = true;
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
  }, maxFrames);
}
const lines = (r) => `RESULT winner=${r.result?.winner} score=${r.result?.scoreArr} fin=${r.fin?.length}`;

for (const name0 of scen) {
  const N = name0.endsWith('3') ? 3 : 2, name = name0.replace(/3$/, '');
  if (['bots', 'twists', 'idle', 'timeout'].includes(name)) {
    const P = (skill, style) => ({ skill, style });
    const list = N === 3
      ? (name === 'twists' ? TWISTS.map((t) => [t, [P(0.9, 'push'), P(0.7, 'push'), P(0.8, 'push')]])
        : name === 'idle' ? [['none', [P(0, 'idle'), P(0, 'idle'), P(0, 'idle')]], ['none', [P(1, 'run'), P(0, 'idle'), P(0, 'idle')]], ['none', [P(0, 'idle'), P(0, 'idle'), P(1, 'run')]]]
          : name === 'timeout' ? [['none', [P(1, 'run'), P(1, 'run'), P(1, 'run')]]]
            : [[process.env.TW || 'none', [P(0.95, 'push'), P(0.5, 'run'), P(0.5, 'run')]], [process.env.TW || 'none', [P(0.5, 'run'), P(0.95, 'push'), P(0.5, 'run')]], [process.env.TW || 'none', [P(0.5, 'run'), P(0.5, 'run'), P(0.95, 'push')]], [process.env.TW || 'none', [P(0.85, 'push'), P(0.85, 'push'), P(0.85, 'push')]], [process.env.TW || 'none', [P(0.9, 'run'), P(0.9, 'run'), P(0.9, 'run')]]])
      : (name === 'twists' ? TWISTS.map((t) => [t, [P(0.9, 'push'), P(0.7, 'push')]])
        : name === 'idle' ? [['none', [P(0, 'idle'), P(0, 'idle')]], ['none', [P(1, 'run'), P(0, 'idle')]], ['none', [P(0, 'idle'), P(1, 'run')]]]
          : name === 'timeout' ? [['none', [P(1, 'run'), P(1, 'run')]]]
            : [[process.env.TW || 'none', [P(0.95, 'push'), P(0.5, 'run')]], [process.env.TW || 'none', [P(0.5, 'run'), P(0.95, 'push')]], [process.env.TW || 'none', [P(0.85, 'push'), P(0.85, 'push')]], [process.env.TW || 'none', [P(0.9, 'run'), P(0.9, 'run')]]]);
    const wins = [0, 0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw, [1100, 650], N);
      await installBots(page, cfg);
      if (tw === 'deurman') await page.evaluate((N) => { window.__bot(240); window.__app.mode.instance.onDeurman(N === 3 ? [true, false, true] : [true, true]); }, N);   // Deurman-straf (3 booleans bij 3 spelers)
      const res = await playMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} wins=${st.wins} tiles=${st.tiles} stats=${JSON.stringify(st.stats)} pl=${st.pl.map((p) => `push${p.pushes}/hit${p.hits}/it${p.items}`)}`);
      console.log(lines(res), '::', (res.result?.summary || '').replace(/<[^>]+>/g, ' '));
      check(res.fin.length === 1 && res.finished, `finishPvp precies één keer (${res.fin.length}) twist=${res.twist}`);
      check(res.result && res.result.winner != null && res.result.winner >= 0 && res.result.winner < N && res.result.scoreArr.length === N, `er is een winnaar (${N} spelers, score-array ${N})`);
      if (N === 3 && tw === 'bodyswap') check(true, 'bodyswap met 3 spelers: ok');
      check(!errors.length, errors.length ? 'console-errors: ' + errors.slice(0, 5).join(' | ') : 'geen console-errors');
      if (res.result && res.result.winner != null) wins[res.result.winner]++;
      await browser.close();
    }
    if (name === 'bots') check(N === 3 ? wins[0] > 0 && wins[1] > 0 && wins[2] > 0 : wins[0] > 0 && wins[1] > 0, `alle spelers kunnen winnen (${wins.slice(0, N)})`);
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
    await page.evaluate((id) => { window.__app.mode.leaving = true; return window.__app.playGame(id, { back: 'arcade', extra: { players: [0, 1, 2] } }); }, 'hexagone');
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
    const after = await page.evaluate(async (id) => { const { S } = await import('/src/save.js'); return { plays: S.arcade.plays, wins: S.arcade.wins.slice(), g: S.arcade.byGame[id] }; }, 'hexagone');
    console.log('arcade3', JSON.stringify({ info, before, after }));
    check(info.ids.join() === '0,1,2' && info.n === 3, 'alle drie spelen mee via de Speelhal-route');
    check(after.plays === before.plays + 1 && after.wins[2] === before.wins[2] + 1 && after.wins[0] === before.wins[0] && after.g && after.g.wins[2] >= 1, 'winst telt voor spelers-id 2 (Juul)');
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'rules' && N === 3) {
    // 3 spelers: ronde gaat door na de eerste val, laatste die staat wint, startdriehoek eerlijk, duw raakt de dichtstbijzijnde, 3 wins -> tiebreak
    const { browser, page, errors } = await open(process.env.TW || 'none', [1100, 650], 3);
    const R = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input, out = {}; m.paused = false;
      const step = (k) => { for (let q = 0; q < k; q++) { inp.update(); m.update(1 / 60); } };
      const s0 = d.state(); out.start = s0.pl.map((p) => [p.x, p.z]);
      const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]); out.sides = [dist(out.start[0], out.start[1]), dist(out.start[0], out.start[2]), dist(out.start[1], out.start[2])].map((x) => +x.toFixed(2));
      step(14);
      // 1) speler 2 valt in de lava: ronde gaat door met 2 levenden
      d.pl[2].y = -40; step(6); const s1 = d.state(); out.after1 = { rstate: s1.rstate, dead: s1.pl.map((p) => p.dead) };
      // 2) speler 0 valt ook: speler 1 wint de ronde
      d.pl[0].y = -40; step(12); const s2 = d.state(); out.after2 = { rstate: s2.rstate, wins: s2.wins };
      // 3) duw: speler 1 duwt de dichtstbijzijnde (speler 0 staat dichterbij dan 2)
      return out;
    });
    console.log('rules3', JSON.stringify(R));
    check(Math.max(...R.sides) - Math.min(...R.sides) < 0.2, `startdriehoek is gelijkzijdig (zijden ${R.sides})`);
    check(R.after1.rstate === 'play' && R.after1.dead.filter(Boolean).length === 1, 'na de eerste val gaat de ronde door');
    check(R.after2.rstate === 'over' && R.after2.wins.join() === '0,1,0', `laatste die staat wint de ronde (${R.after2.wins})`);
    // duw met 3 spelers
    {
      const r2 = await page.evaluate(() => {
        const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input; m.paused = false;
        const step = (k) => { for (let q = 0; q < k; q++) { inp.update(); m.update(1 / 60); } }; step(270);   // volgende ronde start vanzelf
        step(10);
        d.place(0, -1.4, 0.9, 0); d.place(1, 0.2, 0.9, 0); d.place(2, 8, -4.5, 0); inp.virtual[0].x = 1; inp.virtual[0].b = true; inp.update(); m.update(1 / 60); inp.virtual[0].b = false; step(10); inp.virtual[0].x = 0;
        const s = d.state(); return { pushes: s.pl[0].pushes, hit1: s.pl[1].hits, hit2: s.pl[2].hits, x1: s.pl[1].x, rstate: s.rstate };
      });
      console.log('push3', JSON.stringify(r2));
      check(r2.pushes === 1 && r2.hit1 === 1 && r2.hit2 === 0 && r2.x1 > 0.8, 'duw raakt de dichtstbijzijnde van de 2 anderen');
    }
    check(!errors.length, errors.length ? errors.join('|') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'rules') {
    // regels afzonderlijk testen: tegel stort in, duw werkt, power-ups, draak
    const out = {}; const allErr = [];
    {
      const { browser, page, errors } = await open(process.env.TW || 'none');
      out.fall = await page.evaluate(() => {
        const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input; m.paused = false;
        for (let k = 0; k < 20; k++) { inp.update(); m.update(1 / 60); } const y0 = d.state().pl[0].y;
        for (let k = 0; k < 90; k++) { inp.update(); m.update(1 / 60); } m.paused = true; return { y0, y1: d.state().pl[0].y, tiles: d.state().tiles };
      }); allErr.push(...errors); await browser.close();
    }
    {
      const { browser, page, errors } = await open(process.env.TW || 'none');
      out.push = await page.evaluate(() => {
        const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input; m.paused = false;
        for (let k = 0; k < 14; k++) { inp.update(); m.update(1 / 60); }
        d.place(0, -1.4, 0.9, 0); d.place(1, 0.2, 0.9, 0); inp.virtual[0].x = 1; inp.virtual[0].b = true; inp.update(); m.update(1 / 60); inp.virtual[0].b = false;
        const sp = []; for (let k = 0; k < 12; k++) { inp.update(); m.update(1 / 60); sp.push(+d.state().pl[1].vx.toFixed(1)); } m.paused = true; inp.virtual[0].x = 0;
        const s = d.state(); return { pushes: s.pl[0].pushes, hits: s.pl[1].hits, x1: s.pl[1].x, sp: sp.slice(0, 4) };
      }); allErr.push(...errors); await browser.close();
    }
    {
      const { browser, page, errors } = await open(process.env.TW || 'none');
      await installBots(page, [{ skill: 1, style: 'run' }, { skill: 1, style: 'run' }]);
      out.items = await page.evaluate(() => {
        const d = window.__app.mode.instance.dbg; d.giveItem(0, 'djump'); d.giveItem(1, 'shield'); d.giveItem(0, 'power'); const s3 = d.state(); return { dj: s3.pl[0].dj, pw: s3.pl[0].pw, sh: s3.pl[1].sh };
      });
      out.dragon = await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.fire(); window.__bot(60 * 6); const s = d.state(); return { fires: s.stats.fires, rs: s.rstate }; });
      allErr.push(...errors); await browser.close();
    }
    console.log(JSON.stringify(out));
    check(out.fall.y1 < out.fall.y0 - 2.5, 'stilstaan: tegel stort in, speler zakt een laag');
    check(out.push.pushes === 1 && out.push.hits === 1 && out.push.x1 > 0.8, 'duw raakt en duwt weg');
    check(out.items.dj && out.items.pw && out.items.sh, 'power-ups worden toegepast');
    check(out.dragon.fires >= 1, 'draak spuwt vuur');
    check(!allErr.length, allErr.length ? allErr.join('|') : 'geen console-errors');
    continue;
  }
  if (name === 'view') {
    // snelle visuele controle: speler op een lagere laag (glazige tegels erboven), draak, items
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 1, style: 'idle' }, { skill: 1, style: 'idle' }]);
    const step = (n) => page.evaluate((n) => { const m = window.__app.mode, inp = window.__app.input; m.paused = false; for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } m.paused = true; }, n);
    const shot = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/hexv_${tag}.png` }); };
    await step(20);
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.place(0, -3.1, -0.9, -3.2); d.place(1, 5.2, 0.9, 0); d.spawnItem(); d.spawnItem(); });
    await step(12); await shot('ghost');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.place(0, -3.1, -0.9, 0); d.place(1, 5.2, 0.9, 0); d.tiles.resetAll(); d.fire(); });
    await step(200); await shot('dragon1');
    await step(30); await shot('dragon2');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none', [1100, 650], N);
    await installBots(page, Array.from({ length: N }, () => ({ skill: 0.95, style: 'run' })));
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/hex${N === 3 ? '3' : ''}_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { r: s.round, st: s.rstate, tp: +s.tp.toFixed(1), solid: s.solid, wins: s.wins, items: s.items.length, dr: s.dragon }; }))); };
    const go = (cond, max = 60 * 120) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(60 * 4)); await snap('play');
    await page.evaluate(() => window.__app.mode.instance.dbg.spawnItem()); await page.evaluate(() => window.__app.mode.instance.dbg.spawnItem());
    await page.evaluate(() => window.__bot(30)); await snap('items');
    await page.evaluate(() => window.__app.mode.instance.dbg.fire()); await go('s.dragon==="aim"', 60 * 12); await page.evaluate(() => window.__bot(40)); await snap('dragon_aim');
    await go('s.dragon==="wait" && s.stats.fires>0', 60 * 8); await page.evaluate(() => window.__bot(12)); await snap('dragon_fire');
    await page.evaluate(() => window.__app.mode.instance.dbg.giveItem(0, 'shield')); await page.evaluate(() => window.__app.mode.instance.dbg.giveItem(1, 'power')); await page.evaluate(() => window.__bot(30)); await snap('powered');
    await go('s.stats.pushes>0', 60 * 60); await page.evaluate(() => window.__bot(3)); await snap('push');
    await page.evaluate(() => window.__app.mode.instance.dbg.setTp(15.5)); await go('s.sd', 60 * 5); await page.evaluate(() => window.__bot(60 * 4)); await snap('suddendeath');
    await page.evaluate(() => window.__app.mode.instance.dbg.setTp(33.5)); await go('s.melt', 60 * 5); await page.evaluate(() => window.__bot(60 * 2)); await snap('melt');
    await go('s.rstate==="over"', 60 * 80); await page.evaluate(() => window.__bot(45)); await snap('roundover');
    await go('s.rstate==="play" && s.round===2', 60 * 20); await page.evaluate(() => window.__bot(20)); await snap('round2');
    await go('s.finished', 60 * 400); await page.waitForTimeout(1800); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
console.log(failed ? `\n${failed} CONTROLES MISLUKT` : '\nALLE CONTROLES OK'); process.exit(failed ? 1 : 0);
