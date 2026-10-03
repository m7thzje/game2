// Gebruik: node tools/test_blocks.mjs [scenario...]   scenario: logic | bots | twists | idle | timeout | sd | features | shots
//   TW=<twist-id> kiest een twist. Q=low|high kwaliteit.
// Bots (met een simpele blok-AI) spelen versneld (zonder renderen) hele potjes. Controleert: finishPvp precies 1x,
// beide spelers kunnen winnen, geen console-errors, elke twist werkt, en de power-blokken / rommelrijen / kip / I-balk doen wat ze moeten.
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
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=blocks&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    window.__L = await import('/src/games/blocks_logic.js');
    mode.paused = false;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
    window.__fin = 0; const ctx = mode.ctx, orig = ctx.finishPvp; ctx.finishPvp = (r) => { window.__fin++; return orig(r); };
  });
  return { browser, page, errors };
}

// cfg[j] = { skill 0..1 (kans op slechte plaatsing), think: frames wachten per stuk, idle }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, L = window.__L;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ piece: -1, plan: null, wait: 0, tog: 0 }));
    window.__cfg = cfg; window.__rnd = rnd;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false; const tid = m.twist.id;
      for (let k = 0; k < n && !m.finished; k++) {
        if (stop && stop(inst.dbg.state())) { m.paused = true; return true; }
        for (const v of inp.virtual) { v.a = false; v.b = false; v.x = 0; v.y = 0; }
        for (const j of [0, 1]) {
          const c = window.__cfg[j], pj = inst.dbg.pl[j], b = B[j]; if (c.idle) continue;
          if (!pj.piece || pj.state !== 'play') { b.piece = -1; continue; }
          if (b.piece !== pj.pieces) { b.piece = pj.pieces; b.plan = L.aiPlan(pj.grid, pj.piece, c.skill, rnd); b.wait = c.think ?? 6; }
          if (b.wait > 0) { b.wait--; continue; }
          const pc = pj.piece, plan = b.plan; if (!plan) continue;
          let x = 0, a = false, bb = false;
          if (pc.r !== plan.r) { b.tog ^= 1; a = !!b.tog; } else if (pc.x !== plan.x) x = pc.x < plan.x ? 1 : -1; else bb = true;
          const vi = m.swapped ? 1 - j : j, v = inp.virtual[vi];
          let vx = x, vy = 0;
          if (tid === 'invert') vx = -x;
          if (tid === 'drunk') { const ang = Math.sin(m.t * 1.9 + j * 2) * 0.95 + Math.sin(m.t * 5.3) * 0.25, cs = Math.cos(ang), sn = Math.sin(ang); vx = x * cs; vy = -x * sn; }
          v.x = vx; v.y = vy;
          if (tid === 'swapab') { v.a = bb; v.b = a; } else { v.a = a; v.b = bb; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}
const BOT = (skill, think = 6) => ({ skill, think });

for (const name of scen) {
  if (name === 'logic') {
    const L = await import(path.join(root, 'src/games/blocks_logic.js'));
    const g = L.emptyGrid();
    for (let x = 0; x < 10; x++) { g[15][x] = 1; g[14][x] = x === 3 ? 0 : 1; g[13][x] = 2; }
    check(JSON.stringify(L.fullRows(g)) === '[13,15]', 'fullRows vindt volle rijen');
    const sh = L.clearRows(g, [13, 15]);
    check(g[15].join('') === '1110111111' && g[14].every((v) => !v) && sh[15] === 1, 'clearRows schuift rijen goed');
    const g2 = L.emptyGrid(); const ok = L.addGarbage(g2, 2, 4);
    check(ok && g2[15][4] === 0 && g2[15][0] === L.GARB && g2[14].filter((v) => !v).length === 1, 'addGarbage: rij met 1 gat');
    for (const t of L.TYPES) { const p = L.newPiece({ t }); check(L.pieceFits(L.emptyGrid(), p) && L.ROT[t].length === 4 && L.ROT[t].every((r) => r.length === 4), `stuk ${t} past en heeft 4 cellen`); }
    const s1 = new L.Sequence(() => 0.5), s2 = new L.Sequence(() => 0.5); check(s1.get(40).t === s2.get(40).t, 'reeks is deterministisch');
    // 7-bag: elke 7 stuks alle vormen
    const seq = new L.Sequence(Math.random); const bag = new Set(); for (let i = 0; i < 7; i++) bag.add(seq.get(i).t); check(bag.size === 7, '7-bag bevat alle 7 vormen');
    check(L.garbageFor(1, 0) === 0 && L.garbageFor(2, 0) === 1 && L.garbageFor(3, 0) === 2 && L.garbageFor(4, 0) === 4, 'garbageFor 1/2/3/4');
    // AI speelt een poos zonder vol te lopen
    let gg = L.emptyGrid(), lines = 0; const sq = new L.Sequence(Math.random); let alive = 0;
    for (let i = 0; i < 200; i++) { const p = L.newPiece(sq.get(i)); if (!L.pieceFits(gg, p)) break; const pl = L.aiPlan(gg, p, 1); p.r = pl.r; p.x = pl.x; p.y += L.dropDistance(gg, p); L.lockPiece(gg, p); const fr = L.fullRows(gg); if (fr.length) { lines += fr.length; L.clearRows(gg, fr); } alive++; }
    check(lines > 15, `AI maakt rijen (${lines} in ${alive} stukken)`);
    continue;
  }
  if (['bots', 'twists', 'timeout', 'idle', 'sd'].includes(name)) {
    const list = name === 'twists' ? TWISTS.map((t) => [t, [BOT(0.85), BOT(0.7)], null])
      : name === 'idle' ? [['none', [{ idle: true }, { idle: true }], 'idle']]
        : name === 'sd' ? [['none', [{ idle: true }, { idle: true }], 'sd']]
          : name === 'timeout' ? [['none', [BOT(0.8), BOT(0.8)], 'timeout']]
            : [
              [process.env.TW || 'none', [BOT(1.0, 2), { idle: true }], 'p0'],
              [process.env.TW || 'none', [{ idle: true }, BOT(1.0, 2)], 'p1'],
              [process.env.TW || 'none', [BOT(0.95, 3), BOT(0.6, 10)], 'good0'],
              [process.env.TW || 'none', [BOT(0.6, 10), BOT(0.95, 3)], 'good1'],
            ];
    for (const [tw, cfg, expect] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(4); });
      if (name === 'sd') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(0.5); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
        while (!m.finished && g++ < 60 * 400) {
          window.__bot(30);
          const st = inst.dbg.state(); const key = st.g;
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.g} score=${st.p.map((p) => p.score)} lines=${st.p.map((p) => p.lines)} h=${st.p.map((p) => p.h)}`); last = key; }
        }
        for (let k = 0; k < 300; k++) window.__bot(1);     // na afloop nog even doorlopen: mag niet dubbel eindigen
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} score=${st.p.map((p) => p.score)} lines=${st.p.map((p) => p.lines)} sent=${st.stats.garbageSent} bombs=${st.stats.bombs} freezes=${st.stats.freezes} rainbows=${st.stats.rainbows} chickens=${st.stats.chickens} gifts=${st.stats.gifts} tetris=${st.stats.tetris} why=${st.why}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.finished && res.fin === 1, `finishPvp precies 1x (aantal=${res.fin}) [${name}/${tw}]`);
      check(res.result && (res.result.winner === 0 || res.result.winner === 1), `er is een winnaar [${name}/${tw}]`);
      if (expect === 'p0') check(res.result.winner === 0, 'bot 0 wint van niets-doen');
      if (expect === 'p1') check(res.result.winner === 1, 'bot 1 wint van niets-doen');
      if (expect === 'sd') check(st.why === 'sd' || st.why === 'topout', `sudden death beslist (${st.why})`);
      check(errors.length === 0, `geen console-errors [${name}/${tw}]${errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''}`);
      await browser.close();
    }
    continue;
  }
  if (name === 'features') {
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ idle: true }, { idle: true }]);
    const R = await page.evaluate(() => {
      const m = window.__app.mode, inst = m.instance, d = inst.dbg, inp = window.__app.input, L = window.__L; const out = {};
      const step = (n) => { m.paused = false; for (let k = 0; k < n && !m.finished; k++) { for (const v of inp.virtual) { v.a = false; v.b = false; v.x = 0; v.y = 0; } inp.update(); m.update(1 / 60); } m.paused = true; };
      const waitPiece = (i) => { let g = 0; while ((!d.pl[i].piece || d.pl[i].state !== 'play') && g++ < 600) step(1); };
      const hard = (i) => { const v = inp.virtual[m.swapped ? 1 - i : i]; m.paused = false; v.b = true; inp.update(); m.update(1 / 60); v.b = false; inp.update(); m.update(1 / 60); m.paused = true; };
      const settle = (i, n = 90) => { step(n); };
      const clearBoard = (i) => { for (const r of d.pl[i].grid) r.fill(0); };
      step(60);
      // 1. bom: vult 4 rijen, laat de bom midden erin vallen en kijkt of er cellen verdwijnen
      clearBoard(0); d.fill(0, 4, 0); for (let r = 12; r < 16; r++) for (let c = 0; c < 10; c++) d.pl[0].grid[r][c] = 1 + (c % 7);   // volle rijen weghalen voor deze test: geen echte lijnen
      for (let r = 12; r < 16; r++) d.pl[0].grid[r][4] = 0;     // overal een gat in kolom 4
      let before = L.filledCount(d.pl[0].grid);
      waitPiece(0); d.forcePiece(0, { t: 'O', pow: 'bomb', sp: 2 }); hard(0); step(20); waitPiece(0);
      const bpiece = d.pl[0].piece; out.bombPiece = bpiece && bpiece.kind;
      // zet de bom boven de rommel: kolom 4/5 stuk O op de stapel
      const pc = d.pl[0].piece; for (let k = 0; k < 8; k++) { if (pc.x < 4) { const v = inp.virtual[0]; v.x = 1; m.paused = false; inp.update(); m.update(1 / 60); v.x = 0; inp.update(); m.update(1 / 60); m.paused = true; } }
      hard(0); step(30);
      out.bombBefore = before; out.bombAfter = L.filledCount(d.pl[0].grid); out.bombs = d.state().stats.bombs;
      // 2. bevriezer
      clearBoard(0); clearBoard(1); step(40); waitPiece(0); d.forcePiece(0, { t: 'T', pow: 'freeze', sp: 1 }); hard(0); step(20); waitPiece(0); hard(0); step(8);
      out.freezes = d.state().stats.freezes; out.frozenT = d.pl[1].frozenT;
      // 3. regenboog: een rij met 2 gaten
      clearBoard(0); step(40); for (let c = 0; c < 10; c++) d.pl[0].grid[15][c] = (c === 2 || c === 7) ? 0 : 3; waitPiece(0); d.forcePiece(0, { t: 'O', pow: 'rainbow', sp: 0 });
      // zorg dat huidig stuk valt en daarna het regenboogstuk
      hard(0); step(20); waitPiece(0); const l0 = d.pl[0].lines; hard(0); step(40);
      out.rainbowRows = d.pl[0].lines - l0; out.rainbows = d.state().stats.rainbows;
      // 4. rommelrijen: dubbel = 1 rij naar de ander
      clearBoard(0); clearBoard(1); d.pl[1].pend = 0; step(40);
      for (let r = 14; r < 16; r++) for (let c = 0; c < 10; c++) d.pl[0].grid[r][c] = (c === 4 || c === 5) ? 0 : 2;
      waitPiece(0); d.setPiece(0, { t: 'O' }); hard(0); step(80);
      out.garbLines = d.pl[0].lines; out.garbSent = d.state().stats.garbageSent[0]; out.garbPend = d.pl[1].pend;
      // 5. de ontvanger krijgt de rommel na een vastgezette steen
      waitPiece(1); const g1 = L.filledCount(d.pl[1].grid); hard(1); step(60); out.garbGrid = L.filledCount(d.pl[1].grid) - g1; out.garbPendAfter = d.pl[1].pend;
      // 6. kippenblok
      waitPiece(0); d.chicken(0); hard(0); step(20); waitPiece(0); out.chickenPiece = !!(d.pl[0].piece && d.pl[0].piece.chicken);
      { const pc = d.pl[0].piece, x0 = pc.x, r0 = pc.r, n0 = d.pl[0].pieces; out.chickenMoved = false; for (let k = 0; k < 240 && d.pl[0].pieces === n0; k++) { step(1); if (d.pl[0].piece && (d.pl[0].piece.x !== x0 || d.pl[0].piece.r !== r0)) { out.chickenMoved = true; break; } } }
      // 7. comeback I-balk: P1 staat ver achter met hoge stapel
      clearBoard(1); step(30); for (let r = 8; r < 16; r++) for (let c = 0; c < 10; c++) d.pl[1].grid[r][c] = c === 9 ? 0 : 3;
      d.setScore(0, 2000); d.setScore(1, 0); d.pl[1].lastGift = -99; d.pl[1].front.length = 0; hard(1); step(30); waitPiece(1);
      out.gift = d.state().stats.gifts;
      // 8. bevroren speler kan niets
      d.freeze(0); waitPiece(0); const px = d.pl[0].piece.x; { const v = inp.virtual[0]; v.x = 1; m.paused = false; for (let k = 0; k < 20; k++) { inp.update(); m.update(1 / 60); } v.x = 0; inp.update(); m.paused = true; } out.frozenStayed = d.pl[0].piece.x === px;
      return out;
    });
    console.log(JSON.stringify(R));
    check(R.bombs >= 1 && R.bombAfter < R.bombBefore + 4, `bom blaast cellen weg (voor ${R.bombBefore}, na ${R.bombAfter})`);
    check(R.freezes >= 1 && R.frozenT > 0, `bevriezer bevriest de tegenstander (${R.frozenT})`);
    check(R.rainbows >= 1 && R.rainbowRows >= 1, `regenboog vult gat en ruimt rij op (${R.rainbowRows})`);
    check(R.garbLines >= 2 && R.garbSent >= 1 && R.garbPend >= 1, `dubbel stuurt rommel (verstuurd ${R.garbSent}, onderweg ${R.garbPend})`);
    check(R.garbGrid >= 8 && R.garbPendAfter === 0, `rommelrijen verschijnen bij ontvanger (+${R.garbGrid} cellen)`);
    check(R.chickenPiece && R.chickenMoved, 'kippenblok huppelt zelf rond');
    check(R.gift >= 1, 'achterstaande speler krijgt een I-balk');
    check(R.frozenStayed, 'bevroren speler kan niet bewegen');
    check(errors.length === 0, `geen console-errors [features]${errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''}`);
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [BOT(0.95, 3), BOT(0.9, 4)]);
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/blocks_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.g, sc: s.p.map((p) => p.score), pend: s.p.map((p) => p.pend), h: s.p.map((p) => p.h) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(60 * 14)); await snap('play');
    await go('s.p[0].lines>=3&&s.p[1].lines>=3', 60 * 60); await page.evaluate(() => window.__bot(8)); await snap('clear');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.addPend(0, 5); d.addPend(1, 3); window.__bot(40); }); await snap('pend');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.forcePiece(0, { t: 'T', pow: 'bomb', sp: 1 }); d.forcePiece(1, { t: 'L', pow: 'rainbow', sp: 2 }); d.freeze(1); d.chicken(0); window.__bot(70); }); await snap('power');
    await go('s.p[0].piece&&s.p[0].piece.kind', 60 * 20); await page.evaluate(() => window.__bot(6)); await snap('power2');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.freeze(1); d.chicken(1); window.__bot(90); }); await snap('freeze');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.fill(0, 13, 1); window.__bot(40); }); await snap('danger');
    await page.evaluate(() => { window.__cfg[0].idle = true; window.__cfg[1].idle = true; }); await go('s.g==="end"', 60 * 80); await page.evaluate(() => window.__bot(30)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
console.log(fails.length ? `\n${fails.length} MISLUKT` : '\nALLES OK');
process.exit(fails.length ? 1 : 0);
