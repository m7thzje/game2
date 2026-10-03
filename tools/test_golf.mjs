// Gebruik: node tools/test_golf.mjs [scenario...]   scenario: course | bots | lengths | twists | idle | timeout | sudden | abilities | dragon | hooks | holes | intro | shots
//   TW=<twist-id> kiest een twist (anders: "none"). Q=low|high kwaliteit. HOLES=3|6|9|12 zet S.arcade.golfHoles (standaard 6; 'bots' draait zonder HOLES 3 en 6).
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp precies 1x komt, beide spelers kunnen winnen,
// elke twist werkt, elke hole in de pool oplosbaar is en er geen console-fouten zijn.
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
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['course', 'bots'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };
const envHoles = process.env.HOLES ? +process.env.HOLES : null;

const SAVEKEY = 'heitjes_voor_karweitjes_v1';
// opts: { holes (3|6|9|12), start (false = stop op de intro-kaart) }
async function open(twist, opts = {}) {
  const holes = opts.holes ?? envHoles ?? 6;
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  // S.arcade.golfHoles zetten via de localStorage-opslag, voordat het spel start
  await page.addInitScript(([key, n]) => { try { localStorage.setItem(key, JSON.stringify({ arcade: { wins: [0, 0], draws: 0, plays: 0, byGame: {}, tourneys: [0, 0], golfHoles: n } })); } catch (e) { /* */ } }, [SAVEKEY, holes]);
  await page.goto(`http://localhost:${port}/?game=golf&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  if (opts.start === false) return { browser, page, errors };
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
  const got = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return S.arcade.golfHoles; });
  if (got !== holes) { console.log(`WAARSCHUWING: S.arcade.golfHoles=${got}, verwacht ${holes}`); }
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1, style: 'play'|'idle', bonk: kans per slag }
async function installBots(page, cfg) {
  await page.evaluate(async (cfg) => {
    const GC = await import('/src/games/golf_course.js');
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__cfg = cfg;
    const potFor = (def) => {
      const pts = [[def.tee[0][0], (def.tee[0][1] + def.tee[1][1]) / 2], ...def.route]; const segs = []; let tot = 0;
      for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], l]); tot += l; }
      return (x, z) => { let best = 1e9, acc = 0; for (const [a, b, l] of segs) { const dx = b[0] - a[0], dz = b[1] - a[1]; let u = ((x - a[0]) * dx + (z - a[1]) * dz) / (l * l); u = Math.max(0, Math.min(1, u)); const px = a[0] + dx * u, pz = a[1] + dz * u; best = Math.min(best, tot - acc - u * l + 2.5 * Math.hypot(x - px, z - pz)); acc += l; } return best; };
    };
    function plan(i, delay) {
      const C = d.course(), def = d.def(), st = d.state(), me = st.pl[i], pot = potFor(def); let best = null;
      for (let a = 0; a < 48; a++) for (let pi = 0; pi < 8; pi++) {
        const ang = a / 48 * Math.PI * 2, mm = 0.15 + pi * 0.12;
        const r = GC.simulateShot(C, { x: me.x, z: me.z, r: me.r }, ang, GC.powerToV(mm), { grav: 1, maxT: 7, t0: C.t + delay });
        const cost = r.ev === 'sunk' ? -100 : pot(r.x, r.z) + (r.ev === 'water' || r.ev === 'oob' ? 40 : 0) + 1.5 * mm;
        if (!best || cost < best.cost) best = { cost, ang, m: mm };
      }
      return best;
    }
    const B = [{ plan: null, key: '' }, { plan: null, key: '' }];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = st.pl[i], b = B[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.gstate !== 'play') { b.plan = null; continue; }
          if (me.state !== 'aim') { b.plan = null; if (me.state === 'roll' && c.bonk && rnd() < c.bonk * 0.01 && !me.bonkUsed) v.b = true; continue; }
          if (!b.plan) { b.plan = plan(i, 1.0); const noise = (1 - c.skill); b.plan.ang += (rnd() - 0.5) * noise * 0.5; b.plan.m = Math.max(0.12, Math.min(1, b.plan.m + (rnd() - 0.5) * noise * 0.4)); b.rel = false; }
          const diff = ((b.plan.ang - me.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
          if (Math.abs(diff) > 0.04) { v.x = Math.sign(diff) * Math.max(0.3, Math.min(1, Math.abs(diff) * 3)); continue; }
          // kracht-preset net boven de gewenste kracht
          if (me.pw < Math.min(1, b.plan.m + 0.04) - 0.002) { v.y = -1; continue; }
          if (me.pw > b.plan.m + 0.2) { v.y = 1; continue; }
          v.a = true; if (me.charging && me.m >= b.plan.m - 0.01) { v.a = false; b.plan = null; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

// verwachte lengte (s) van een potje van n holes als alles op tijd afloopt: ready + speeltijd + pauze per hole
const TARGET = { 3: 75, 6: 170, 9: 235, 12: 300 };

async function runMatch(label, twist, cfg, pre, opts = {}) {
  const { browser, page, errors } = await open(twist, opts);
  await installBots(page, cfg);
  if (pre) await page.evaluate(pre);
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < 60 * 420) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.hole + ':' + st.gstate + ':' + st.totals;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} hole=${st.hole}(${st.defId}) ${st.gstate} totals=${st.totals} strokes=${st.pl.map((p) => p.strokes)} ${st.pl.map((p) => p.state)}`); last = key; }
    }
    const st = inst.dbg.state();
    for (let k = 0; k < 60 * 4; k++) window.__bot(1);
    return { log: log.slice(-14), st, finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
  });
  const s = res.st;
  console.log(`\n=== ${label} twist=${res.twist} holes=${s.N} ids=${s.holeIds} tscale=${s.tscale.toFixed(2)} cfg=${JSON.stringify(cfg)} ===`);
  console.log(res.log.join('\n'));
  console.log(`end T=${s.T.toFixed(1)} totals=${s.totals} holes=${JSON.stringify(s.results.map((r) => r.add))} stats=${JSON.stringify(s.stats)}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  check(res.finished && res.fin === 1, `${label}: finishPvp precies 1x (fin=${res.fin}, finished=${res.finished})`);
  check(res.result && res.result.winner != null, `${label}: altijd een winnaar (winner=${res.result && res.result.winner})`);
  const played = s.results.filter((r) => !r.sd).length, nsd = s.results.filter((r) => r.sd).length;
  if (opts.expectSd) { check(nsd === 1 && s.results[s.results.length - 1].sd, `${label}: gelijkspel leidt tot precies 1 gouden putt (${nsd})`); check(s.results.filter((r) => r.final).length === 1, `${label}: de finale telde dubbel`); }
  else { check(played === s.N && nsd <= 1, `${label}: ${s.N} holes gespeeld (${played})${nsd ? ' + gouden putt (gelijkspel)' : ''}`); check(s.finals.filter(Boolean).length === 1 && s.finals[s.N - 1], `${label}: alleen de laatste hole telt dubbel`); }
  check(opts.expectSd || s.T < (TARGET[s.N] || 300) * 1.25 + 30 + nsd * 30, `${label}: potje duurt ${s.T.toFixed(0)} s (budget ${TARGET[s.N]} s)`);
  check(!errors.length, `${label}: geen console-fouten ${errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''}`);
  await browser.close();
  return res;
}

for (const name of scen) {
  if (name === 'course') {
    const GC = await import(path.join(root, 'src/games/golf_course.js'));
    // --- pool en selectie ---
    check(GC.POOL.length >= 14, `pool heeft ${GC.POOL.length} holes (>= 14)`);
    check(new Set(GC.POOL.map((h) => h.id)).size === GC.POOL.length && new Set(GC.POOL.map((h) => h.name)).size === GC.POOL.length, 'alle holes hebben een eigen id en naam');
    let pickOk = true, finals = new Set(), firsts = new Set(), used = new Set();
    for (const n of [3, 6, 9, 12]) for (let k = 0; k < 150; k++) {
      const L = GC.pickHoles(n); const ids = L.map((h) => h.id);
      if (L.length !== n || new Set(ids).size !== n || L[0].diff > 2 || !L[n - 1].finale || L.slice(1, -1).some((h) => h.finale)) pickOk = false;
      for (let i = 1; i < n; i++) if (L[i].diff < L[i - 1].diff) pickOk = false;
      finals.add(L[n - 1].id); firsts.add(L[0].id); L.forEach((h) => used.add(h.id));
    }
    check(pickOk, 'pickHoles: n unieke holes, eerste vriendelijk, laatste finale, oplopende moeilijkheid (n=3,6,9,12)');
    check(used.size === GC.POOL.length, `elke hole komt voor in potjes (${used.size}/${GC.POOL.length}); finales: ${[...finals]}, openers: ${[...firsts]}`);
    // --- elke baan: 400 slagen, geen ontsnapte ballen, en oplosbaar ---
    for (const H of GC.HOLES) {
      const C = GC.makeCourse(H); let esc = 0, pen = 0, ends = {};
      for (let k = 0; k < 400; k++) {
        GC.setCourseTime(C, Math.random() * 30);
        const t = H.tee[k % 2]; const b = GC.makeBall(t[0] + (Math.random() - 0.5), t[1] + (Math.random() - 0.5)); const a = Math.random() * 6.283, v = 8 + Math.random() * 22; b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; let launched = false;
        for (let i = 0; i < 240 * 8; i++) {
          GC.stepCourse(C, 1 / 240); const ev = GC.stepBall(C, b, 1 / 240); if (b.ev === 'launch') launched = true;
          if (b.y < 0.5 && !GC.inPoly(C.poly, b.x, b.z) && !launched) { esc++; break; }
          if (b.y < 0.5) for (let w = H.poly.length; w < C.walls.length; w++) { const W = C.walls[w]; if (GC.segDist(b.x, b.z, W[0], W[1], W[2], W[3]) < 0.1) { pen++; break; } }
          if (ev === 'water' || ev === 'oob' || ev === 'sunk') { ends[ev] = (ends[ev] || 0) + 1; if (ev === 'oob' && !launched) esc++; break; }
        }
      }
      check(esc === 0 && pen === 0, `${H.name}: geen ontsnapte ballen / doorgedrongen muren (${esc}+${pen}/400) ${JSON.stringify(ends)}`);
      // oplosbaarheid: greedy planner (simulatie, met tijd voor bewegende delen) vanaf beide tees
      const pts = [[H.tee[0][0], (H.tee[0][1] + H.tee[1][1]) / 2], ...H.route]; const segs = []; let tot = 0; for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push([pts[i], pts[i + 1], l]); tot += l; }
      const pot = (x, z) => { let best = 1e9, acc = 0; for (const [a, b, l] of segs) { const dx = b[0] - a[0], dz = b[1] - a[1]; let u = ((x - a[0]) * dx + (z - a[1]) * dz) / (l * l); u = Math.max(0, Math.min(1, u)); best = Math.min(best, tot - acc - u * l + 2.5 * Math.hypot(x - (a[0] + dx * u), z - (a[1] + dz * u))); acc += l; } return best; };
      const ns = [];
      for (const ti of [0, 1]) {
        let ball = { x: H.tee[ti][0], z: H.tee[ti][1] }, n = 0, sunk = false, tn = 1.3 + Math.random() * 6;
        while (n < 9 && !sunk) {
          let best = null; for (let a = 0; a < 72; a++) for (let pi = 0; pi < 12; pi++) { const ang = a / 72 * 6.2832, mm = 0.12 + pi * 0.08; const r = GC.simulateShot(C, ball, ang, GC.powerToV(mm), { t0: tn }); const cost = r.ev === 'sunk' ? -100 : pot(r.x, r.z) + (r.ev === 'water' || r.ev === 'oob' ? 40 : 0) + 1.2 * mm; if (!best || cost < best.cost) best = { cost, r }; }
          n++; if (best.r.ev === 'sunk') sunk = true; else if (best.r.ev !== 'water' && best.r.ev !== 'oob') ball = { x: best.r.x, z: best.r.z }; tn += best.r.t + 1.5;
        }
        ns.push(sunk ? n : 99);
      }
      check(Math.max(...ns) <= (H.maxStrokes || GC.MAX_STROKES) - 1 && Math.max(...ns) <= H.par + 1, `${H.name}: oplosbaar in ${ns.join(' / ')} slagen (par ${H.par}, max ${H.maxStrokes || GC.MAX_STROKES})`);
    }
    // --- twist-varianten van de natuurkunde (zeepvloer, maan, reus, dwerg): ook dan blijven ballen in/op de baan ---
    for (const V of [{ n: 'zeepvloer', o: { fric: 0.28 }, r: 0.36 }, { n: 'maan', o: { grav: 0.4, hop: true }, r: 0.36 }, { n: 'reus', o: {}, r: 0.36 * Math.pow(1.55, 0.7) }, { n: 'dwerg', o: {}, r: 0.36 * Math.pow(0.65, 0.7) }]) {
      let bad = 0;
      for (const H of GC.HOLES) {
        const C = GC.makeCourse(H);
        for (let k = 0; k < 120; k++) {
          GC.setCourseTime(C, Math.random() * 30); const t = H.tee[k % 2]; const b = GC.makeBall(t[0], t[1], V.r); const a = Math.random() * 6.283, v = 8 + Math.random() * 22; b.vx = Math.cos(a) * v; b.vz = Math.sin(a) * v; let launched = false;
          for (let i = 0; i < 240 * 8; i++) { GC.stepCourse(C, 1 / 240); const ev = GC.stepBall(C, b, 1 / 240, V.o); if (b.ev === 'launch') launched = true; if (b.y < 0.5 && !GC.inPoly(C.poly, b.x, b.z) && !launched) { bad++; break; } if (ev === 'water' || ev === 'oob' || ev === 'sunk') { if (ev === 'oob' && !launched) bad++; break; } }
        }
      }
      check(bad === 0, `twist-variant ${V.n}: 0 ontsnapte ballen op alle ${GC.HOLES.length} banen (${bad})`);
    }
    continue;
  }
  const A = { skill: 0.97, style: 'play', bonk: 0.5 }, Bw = { skill: 0.55, style: 'play', bonk: 0.2 };
  if (name === 'bots') {
    for (const n of (envHoles ? [envHoles] : [3, 6])) {
      const r1 = await runMatch(`bots ${n} A>B`, process.env.TW || 'none', [A, Bw], null, { holes: n });
      const r2 = await runMatch(`bots ${n} B>A`, process.env.TW || 'none', [Bw, A], null, { holes: n });
      const rs = [r1, r2];
      if (n === 3) rs.push(await runMatch(`bots ${n} gelijk`, process.env.TW || 'none', [A, A], null, { holes: n }));
      const ws = new Set(rs.map((r) => r.result && r.result.winner)); check(ws.has(0) && ws.has(1), `${n} holes: beide spelers kunnen winnen (winnaars: ${[...ws]})`);
    }
    continue;
  }
  if (name === 'arcade') {
    // volledige route via de Speelhal (zoals tools/arcadetest.mjs, maar met "Doorgaan" i.p.v. de Revanche-knop): hal -> golf -> finishPvp -> terug in de hal
    const { browser, page, errors } = await open('none', { holes: envHoles || 6, start: false });
    await page.evaluate(() => window.__app.goArcade({}));
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs, null, { timeout: 60000 }); await page.waitForTimeout(1000);
    const before = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return S.arcade.plays; });
    await page.evaluate(() => { window.__app.mode.leaving = true; return window.__app.playGame('golf', { back: 'arcade', twist: null }); });
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.ctx, null, { timeout: 60000 }); await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const app = window.__app, m = app.mode, inp = app.input; window.__fin = 0; const orig = m.ctx.finishPvp; m.ctx.finishPvp = (r) => { window.__fin++; return orig(r); };
      inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); m.update(0.016);
      await new Promise((r) => setTimeout(r, 400)); let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); }
      for (let i = 0; i < 120; i++) { inp.update(); m.update(0.016); }
      m.ctx.finishPvp({ winner: 1, score: [2, 3], summary: 'testduel' });
    });
    await page.waitForFunction(() => window.__app.mode.resultReady, null, { timeout: 20000 });
    await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; inp.virtual[0].right = true; inp.update(); m.update(0.016); inp.virtual[0].right = false; inp.update(); m.update(0.016); inp.virtual[0].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.update(); m.update(0.016); });
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.interact, null, { timeout: 60000 }); await page.waitForTimeout(800);
    const after = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { plays: S.arcade.plays, g: S.arcade.byGame.golf, fin: window.__fin }; });
    check(after.plays === before + 1 && after.g && after.g.plays >= 1, `arcade-route: golf geteld en terug in de hal (plays ${before}->${after.plays})`);
    check(!errors.length, 'arcade-route: geen console-fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'board') {
    // holeborden-tussenscherm bij een lang potje (12 holes): toont de stand per hole in 2 kolommen
    const { browser, page, errors } = await open('none', { holes: 12 });
    await installBots(page, [A, Bw]);
    await page.evaluate(() => window.__bot(60 * 400, (s) => s.results.length >= 9 && s.gstate === 'holeEnd'));
    await page.evaluate(() => window.__bot(70)); await page.waitForTimeout(700); await page.screenshot({ path: '/tmp/gf_board12.png' });
    const t = await page.evaluate(() => { const el = [...document.querySelectorAll('#hud div')].find((d) => /Stand na hole/.test(d.textContent) && d.style.position === 'absolute'); return el ? el.textContent.slice(0, 80) : null; });
    check(!!t, `holeborden-scherm zichtbaar: ${t}`); check(!errors.length, 'board: geen console-fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'lengths') {
    // idle-potjes (alles loopt op de tijdslimiet af) bij 3/6/9/12 holes: aantal holes, duur, winnaar, finishPvp 1x
    for (const n of envHoles ? [envHoles] : [3, 6, 9, 12]) { const r = await runMatch(`idle ${n}`, 'none', [{ style: 'idle' }, { style: 'idle' }], null, { holes: n }); check(Math.abs(r.st.T - TARGET[n]) < TARGET[n] * 0.25, `${n} holes: duur ${r.st.T.toFixed(0)} s ligt bij het doel ${TARGET[n]} s`); }
    continue;
  }
  if (name === 'twists') { for (const t of TWISTS) await runMatch('twist', t, [A, Bw], null, { holes: envHoles || 3 }); continue; }
  if (name === 'idle') { await runMatch('idle', 'none', [{ style: 'idle' }, { style: 'idle' }]); continue; }
  if (name === 'timeout') { await runMatch('timeout', 'none', [{ style: 'idle' }, { skill: 0.9, style: 'play', bonk: 0 }]); continue; }
  if (name === 'sudden') {
    // gelijkspel na de laatste hole afdwingen: totalen gelijk zetten tijdens de laatste hole -> gouden putt
    await runMatch('sudden', 'none', [A, A], () => { const d = window.__app.mode.instance.dbg; d.loadHole(d.N - 1); d.setTotals(0, 6); d.sink(0); }, { holes: envHoles || 3, expectSd: true });
    continue;
  }
  if (name === 'intro') {
    for (const n of envHoles ? [envHoles] : [3, 6, 9, 12]) {
      const { browser, page, errors } = await open('none', { holes: n, start: false });
      await page.waitForTimeout(1200);   // wacht tot de pop-in animatie van de kaart klaar is
      // let op: de kaart kan nog midden in een scale-animatie zitten, dus meet de natuurlijke grootte (offset*) en niet getBoundingClientRect
      const info = await page.evaluate(() => { const k = document.querySelector('.card .ctrl'); const c = k && k.closest('.card'); if (!c) return null; const rd = c.querySelector('.ready'); const ov = c.parentElement.getBoundingClientRect(); return { w: c.offsetWidth, h: c.offsetHeight, text: c.innerText, readyBottom: rd.offsetTop + rd.offsetHeight, scroll: c.scrollHeight > c.clientHeight + 2, ovw: ov.width, ovh: ov.height }; });
      check(info && info.w <= 1100 && info.h <= 650 && info.readyBottom <= info.h && !info.scroll, `intro-kaart past op 1100x650 zonder scrollen (${info ? [info.w, info.h, info.readyBottom].join('x') : '-'}) bij ${n} holes`);
      check(info && info.text.includes(`${n} holes`), `intro-kaart noemt "${n} holes"`);
      if (n === (envHoles || 6)) await page.screenshot({ path: `/tmp/gf_intro_${n}.png` });
      check(!errors.length, 'intro: geen console-fouten ' + errors.join('|')); await browser.close();
    }
    continue;
  }
  if (name === 'abilities') {
    const { browser, page, errors } = await open('none');
    const r = await page.evaluate(() => {
      const m = window.__app.mode, inp = window.__app.input, d = m.instance.dbg; m.paused = false; const out = {};
      const adv = (n) => { for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } };
      d.loadDef(1); adv(120); const s0 = d.state(); out.state0 = s0.gstate;
      // bonk: bal 1 dicht bij bal 0
      d.teleport(1, d.pl[0].ball.x + 3, d.pl[0].ball.z); d.bonk(0); adv(5); out.bonked = Math.hypot(d.pl[1].ball.vx, d.pl[1].ball.vz) > 5; out.bonkUsed = d.pl[0].bonkUsed;
      d.bonk(0); out.second = d.pl[0].boost === false;   // 1x per hole
      adv(240);
      // turbo-slag: andere bal ver weg
      d.teleport(0, -13.5, 0); d.teleport(1, 13, 4); adv(60); d.bonk(1); out.boost = d.pl[1].boost;
      // water-strafslag: bal in het water op hole 1
      d.teleport(0, 4, 4); adv(30); out.waterState = d.state().pl[0].state; out.waterStrokes = d.state().pl[0].strokes; adv(120); out.afterWater = d.state().pl[0].state;
      // sinken
      d.sink(0); adv(30); out.sunk = d.state().pl[0].state;
      return out;
    });
    console.log(JSON.stringify(r));
    check(r.bonked && r.bonkUsed && r.second, 'ballon-bonk werkt en is 1x per hole'); check(r.boost, 'ballon geeft turbo-slag als de ander ver weg is');
    check(r.waterState === 'pen' && r.waterStrokes === 1 && r.afterWater !== 'pen', 'water geeft strafslag en zet de bal terug'); check(r.sunk === 'sunk', 'bal zinkt in het gat');
    check(!errors.length, 'abilities: geen console-fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'dragon') {
    const { browser, page, errors } = await open('none');
    const r = await page.evaluate(() => {
      const m = window.__app.mode, inp = window.__app.input, d = m.instance.dbg; m.paused = false; const adv = (n) => { for (let k = 0; k < n; k++) { inp.update(); m.update(1 / 60); } };
      d.loadDef(17); adv(120); const x0 = d.state().pl[0].x; d.startDragon(); adv(60 * 7); const s = d.state(); return { dragon: s.stats.dragon, dstate: s.dragon, moved: Math.abs(s.pl[0].x - x0) + Math.abs(s.pl[1].x - d.state().pl[1].x) };
    });
    console.log(JSON.stringify(r)); check(r.dragon >= 1, 'draak kaapt een bal'); check(!errors.length, 'dragon: geen console-fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'hooks') {
    const { browser, page, errors } = await open('none');
    const r = await page.evaluate(() => { const m = window.__app.mode, inp = window.__app.input, i = m.instance; m.paused = false; for (let k = 0; k < 90; k++) { inp.update(); m.update(1 / 60); } i.onDeurman([true, false]); i.onSwap(true); i.onDeurman([false, true]); for (let k = 0; k < 60; k++) { inp.update(); m.update(1 / 60); } i.celebrate(0); i.celebrate(1); i.resultUpdate(0.05); return true; });
    check(r && !errors.length, 'hooks (onDeurman/onSwap/celebrate) zonder fouten ' + errors.join('|')); await browser.close(); continue;
  }
  if (name === 'holes') {
    // elke hole in de pool: laden, bots laten spelen, screenshot, draw calls en geheugen (geen lekken)
    const { browser, page, errors } = await open(process.env.TW || 'none', { holes: envHoles || 6 });
    await installBots(page, [A, Bw]); await page.evaluate(() => window.__app.mode.instance.dbg.noCap());
    const only = (process.env.ONLY || '').split(',').filter(Boolean).map(Number);
    const mem0 = await page.evaluate(() => { const i = window.__app.renderer.info; return { g: i.memory.geometries, t: i.memory.textures }; });
    const GCids = await page.evaluate(async () => { const GC = await import('/src/games/golf_course.js'); return GC.HOLES.map((h) => [h.id, h.name]); });
    let maxCalls = 0; const buildMs = [];
    for (const [id, nm] of GCids) {
      if (only.length && !only.includes(id)) continue;
      const bt = await page.evaluate((id) => { const t0 = performance.now(); window.__app.mode.instance.dbg.loadDef(id); return performance.now() - t0; }, id); buildMs.push(bt);
      await page.evaluate(() => window.__bot(60 * 4));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `/tmp/gf_hole_${id}.png` });
      const info = await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(), i = window.__app.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures, st: s.pl.map((p) => p.state + ':' + p.strokes) }; });
      maxCalls = Math.max(maxCalls, info.calls);
      console.log(`hole ${String(id).padStart(2)} ${nm.padEnd(18)} calls=${info.calls} tris=${info.tris} geos=${info.geos} tex=${info.tex} ${info.st}`);
      await page.evaluate(() => window.__bot(60 * 40, (s) => s.gstate === 'holeEnd'));
      const rr = await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); const r = s.results[s.results.length - 1]; return r ? `${r.reason} +${r.add} slagen ${r.strokes} t=${s.timeLeft.toFixed(0)}` : '-'; });
      console.log(`        -> ${rr}`);
    }
    const mem1 = await page.evaluate(() => { const i = window.__app.renderer.info; return { g: i.memory.geometries, t: i.memory.textures }; });
    console.log(`geheugen: geometrieen ${mem0.g} -> ${mem1.g}, textures ${mem0.t} -> ${mem1.t}; max draw calls ${maxCalls}`);
    console.log(`bouwtijd per hole (ms): gemiddeld ${(buildMs.reduce((a, b) => a + b, 0) / buildMs.length).toFixed(0)}, max ${Math.max(...buildMs).toFixed(0)}`);
    check(mem1.g < mem0.g + 160, 'geen geometrie-lek over alle holes'); check(mem1.t < mem0.t + 40, 'geen texture-lek over alle holes');
    check(maxCalls < 170, `draw calls blijven laag (max ${maxCalls})`);
    check(!errors.length, 'holes: geen console-fouten ' + errors.slice(0, 5).join('|')); await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [A, Bw]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/gf_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { h: s.hole, g: s.gstate, totals: s.totals, calls: window.__app.renderer.info.render.calls, tris: window.__app.renderer.info.render.triangles }; }))); };
    const run = (n, cond) => page.evaluate(([n, c]) => window.__bot(n, c ? new Function('s', 'return ' + c) : null), [n, cond || null]);
    const dbg = (fn, ...a) => page.evaluate(([f, a]) => window.__app.mode.instance.dbg[f](...a), [fn, a]);
    await run(60 * 3); await snap('h1a'); await run(60 * 3, 's.pl[0].state==="roll"'); await run(20); await snap('h1b');
    await run(60 * 40, 's.gstate==="holeEnd"'); await run(60 * 1.5); await snap('board');
    await dbg('loadHole', 1); await run(60 * 2); await snap('h2a');
    await dbg('startDragon'); await run(60 * 3); await snap('dragon');
    await dbg('loadHole', 99); await run(60 * 3); await snap('sd');
    await run(60 * 90, 's.finished || s.gstate==="end"'); await run(80); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(failures ? `\n${failures} CHECK(S) MISLUKT` : '\nALLE CHECKS GESLAAGD');
server.close();
process.exitCode = failures ? 1 : 0;
