// Gebruik: node tools/test_curling.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle | physics
//   TW=<twist-id> kiest een twist (anders: "none" / per scenario).
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp PRECIES één keer komt, beide spelers kunnen winnen, geen console-errors.
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
  await page.goto(`http://localhost:${port}/?game=curling&quality=low&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    window.__fin = 0; const orig = mode.finishPvp.bind(mode); mode.finishPvp = (r) => { window.__fin++; return orig(r); };
    mode.paused = false;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1, style: 'draw'|'takeout'|'mix'|'idle'|'wild' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 777; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const PL = [{}, {}]; window.__cfg = cfg; let frame = 0;
    const HZ = -7.5, HACK = 10;
    function plan(i, st) {
      const c = window.__cfg[i], d = inst.dbg; const noise = (1 - c.skill);
      const opp = st.stones.filter((q) => q.owner !== i && q.st === 'rest' && Math.hypot(q.x, q.z - HZ) < 4.5);
      const takeout = c.style === 'takeout' || (c.style === 'mix' && opp.length && rnd() < 0.5);
      if (c.style === 'wild') return { mx: (rnd() - 0.5) * 8, spin: 0, power: rnd() };
      if (takeout && opp.length) {
        const t = opp.sort((a, b) => Math.hypot(a.x, a.z - HZ) - Math.hypot(b.x, b.z - HZ))[0];
        const mx = t.x * (HACK - HZ) / (HACK - t.z);
        return { mx: Math.max(-4, Math.min(4, mx)) + (rnd() - 0.5) * noise * 1.2, spin: 0, power: 0.72 + (rnd() - 0.5) * noise * 0.3 };
      }
      // trekken: beste combinatie van richting/draai/kracht om dichtbij de knop te stoppen
      const tx = (rnd() - 0.5) * 1.2, tz = HZ + (rnd() - 0.3) * 1.2; let best = null;
      for (let mx = -3; mx <= 3; mx += 0.25) for (const sp of [-1, -0.5, 0, 0.5, 1]) for (let pw = 0.2; pw <= 0.9; pw += 0.04) { const r = d.predict(mx, sp, pw); const e = Math.hypot(r.x - tx, r.z - tz); if (!best || e < best.e) best = { e, mx, spin: sp, power: pw }; }
      return { mx: best.mx + (rnd() - 0.5) * noise * 0.8, spin: best.spin, power: best.power + (rnd() - 0.5) * noise * 0.18 };
    }
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        frame++;
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = st.p[i], pp = PL[i]; v.a = false; v.b = false; v.x = 0; v.y = 0; v.up = false; v.down = false;
          if (c.style === 'idle' || (st.st !== 'play' && st.st !== 'sudden')) continue;
          if (me.st === 'aim') {
            const key = `${st.end}:${st.turnIdx}:${st.sd}`; if (pp.key !== key) { Object.assign(pp, plan(i, st), { key, t: 0 }); }
            pp.t++;
            const dx = pp.mx - me.mx; if (Math.abs(dx) > 0.06) v.x = Math.max(-1, Math.min(1, dx / 0.5));
            if (me.spin < pp.spin - 0.01) { if (frame % 6 < 2) v.up = true; } else if (me.spin > pp.spin + 0.01) { if (frame % 6 < 2) v.down = true; }
            else if (Math.abs(dx) <= 0.1 && pp.t > 12) { // kracht laden en loslaten op het juiste moment
              if (!me.charging) v.a = true; else v.a = !(Math.abs(me.power - pp.power) < 0.045 && pp.t > 30) ;
              if (me.charging) pp.t = Math.max(pp.t, 31);
            }
          } else if (me.st === 'glide') { const mine = st.stones.find((q) => q.owner === i && q.st === 'glide'); if (mine && mine.z > HZ + 5.5 && frame % 9 < 2) v.b = true; if (c.style === 'wild') v.x = Math.sin(frame / 20 + i); }
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
    const hi = { skill: 0.95, style: 'mix' }, lo = { skill: 0.45, style: 'draw' };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [{ skill: 0.85, style: 'mix' }, { skill: 0.7, style: 'mix' }]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ skill: 0.6, style: 'mix' }, { skill: 0.6, style: 'wild' }]]]
          : [[process.env.TW || 'none', [hi, lo]], [process.env.TW || 'none', [lo, hi]], [process.env.TW || 'none', [hi, hi]], [process.env.TW || 'none', [{ skill: 0.8, style: 'takeout' }, { skill: 0.6, style: 'mix' }]]];
    const wins = [0, 0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(40); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
        while (!m.finished && g++ < 60 * 400) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = st.st + ':' + st.end + ':' + st.score.join('-');
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.st} end=${st.end} score=${st.score} ends=${JSON.stringify(st.ends)}`); last = key; }
        }
        for (let k = 0; k < 400; k++) { m.paused = false; window.__app.input.update(); m.update(1 / 60); } m.paused = true;
        return { log: log.slice(-8), st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
      });
      console.log(`\n=== ${name} twist=${res.twist} ===`);
      console.log(res.log.join('\n'));
      const r = res.result, s = res.st.stats;
      console.log(`end T=${res.st.T.toFixed(1)} score=${res.st.score} ends=${JSON.stringify(res.st.ends)} throws=${s.throws} coll=${s.collisions} bombs=${s.bombs} seal=${s.seal} walker=${s.walker} outs=${s.outs} tekort=${s.tekort} gold=${s.gold} knock=${s.knock} sweeps=${s.sweeps}`);
      if (r) console.log(`RESULT winner=${r.winner} score=${r.scoreArr} :: ${r.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.finished && res.fin === 1, `finishPvp precies 1x (fin=${res.fin})`);
      check(errors.length === 0, 'geen console-errors'); if (errors.length) console.log(errors.slice(0, 6).join('\n'));
      if (r) wins[r.winner == null ? 2 : r.winner]++;
      await browser.close();
    }
    if (name === 'bots') check(wins[0] > 0 && wins[1] > 0, `beide spelers kunnen winnen (${wins})`);
    continue;
  }
  if (name === 'physics') {
    // robuustheid: stenen met willekeurige snelheden; geen NaN, binnen de baan (of uit spel), geen overlap-explosies
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ skill: 0.5, style: 'wild' }, { skill: 0.5, style: 'wild' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; let bad = 0, maxOv = 0, nan = 0, frames = 0;
      for (let f = 0; f < 60 * 100 && !m.finished; f++) {
        window.__bot(1); frames++;
        const st = d.state();
        if (f % 50 === 0) for (const q of d.stones) if (q.st === 'rest' || q.st === 'glide') { q.vx = (Math.random() - 0.5) * 30; q.vz = (Math.random() - 0.5) * 30; }
        const live = d.stones.filter((q) => q.st === 'rest' || q.st === 'glide');
        for (const q of live) { if (!isFinite(q.x) || !isFinite(q.z) || !isFinite(q.vx)) nan++; if (Math.abs(q.x) > 5.5 + 0.1 || q.z > 13.4 || q.z < -12.6) bad++; }
        for (let a = 0; a < live.length; a++) for (let b = a + 1; b < live.length; b++) { const ov = live[a].r + live[b].r - Math.hypot(live[a].x - live[b].x, live[a].z - live[b].z); if (ov > maxOv) maxOv = ov; }
      }
      return { bad, maxOv, nan, frames, st: d.state() };
    });
    console.log(JSON.stringify({ bad: res.bad, maxOv: +res.maxOv.toFixed(2), nan: res.nan, frames: res.frames }));
    check(res.nan === 0, 'geen NaN'); check(res.bad === 0, 'stenen blijven in de baan'); check(res.maxOv < 0.5, `geen grote overlap (max ${res.maxOv.toFixed(2)})`);
    check(errors.length === 0, 'geen console-errors'); if (errors.length) console.log(errors.join('\n'));
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'mix' }, { skill: 0.8, style: 'mix' }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/curling_${tag}.png` }); const s = await page.evaluate(() => { const x = window.__app.mode.instance.dbg.state(); let meshes = 0; window.__app.mode.ctx.scene.traverse((o) => { if ((o.isMesh || o.isSprite || o.isPoints) && o.visible) meshes++; }); return { meshes, st: x.st, end: x.end, score: x.score, turn: x.turnIdx, stones: x.stones.map((q) => `${q.owner}${q.st[0]}`).join(' ') }; }); console.log('shot', tag, JSON.stringify(s)); };
    const dbg = (fn, ...a) => page.evaluate(([f, a]) => window.__app.mode.instance.dbg[f](...a), [fn, a]);
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await snap('start');
    await go('s.p[0].st==="aim" && s.p[0].aimT>0.5'); await snap('aim');
    await go('s.p[0].st==="aim" && s.p[0].charging'); await snap('charge');
    await go('s.stones.some(q=>q.st==="glide")'); await page.evaluate(() => window.__bot(70)); await snap('glide');
    await dbg('spawnWalker', 'bear'); await page.evaluate(() => window.__bot(80)); await snap('bear');
    await dbg('spawnSeal'); await go('s.seal==="up"', 60 * 10); await page.evaluate(() => window.__bot(15)); await snap('seal');
    await go('s.turnIdx>=4', 60 * 60); await page.evaluate(() => window.__bot(100)); await snap('mid');
    await go('s.st==="scoring"', 60 * 80); await page.evaluate(() => window.__bot(40)); await snap('score');
    await go('s.end===1 && s.turnIdx>=2', 60 * 80); await page.evaluate(() => window.__bot(30)); await snap('end2');
    await go('s.end===2 && s.turnIdx>=3', 60 * 120); await page.evaluate(() => window.__bot(100)); await snap('end3');
    await go('s.st==="end"', 60 * 400); await page.evaluate(() => window.__bot(40)); await snap('final');
    check(errors.length === 0, 'geen console-errors'); if (errors.length) console.log(errors.slice(0, 6).join('\n'));
    await browser.close(); continue;
  }
}
server.close();
console.log(fails ? `\n${fails} CHECK(S) GEFAALD` : '\nALLES OK');
process.exit(fails ? 1 : 0);
