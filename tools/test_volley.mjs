// Gebruik: node tools/test_volley.mjs [scenario...]   scenario: bots | twists | timeout | idle | events | physics | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert winnaar, aantal finishPvp-aanroepen (moet precies 1 zijn), fouten.
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
let FAILS = 0; const fail = (m) => { FAILS++; console.log('FAIL: ' + m); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=volley&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // tel de finishPvp-aanroepen
    window.__fin = { n: 0, last: null }; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.n++; window.__fin.last = r; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1, style: 'attack'|'idle'|'jumper' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4711; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__cfg = cfg; const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const GB = 17;
    // voorspelt waar de bal op hoogte yh (op de weg omlaag) uitkomt: [t, x]
    const predict = (b, yh, wind) => {
      const g = GB * (window.__gbMul || 1);
      const disc = b.vy * b.vy + 2 * g * (b.y - yh); if (disc < 0) return [0, b.x];
      const t = (b.vy + Math.sqrt(disc)) / g; let x = b.x + b.vx * t + 0.5 * wind * 0.7 * t * t;
      while (Math.abs(x) > 9.38) x = Math.sign(x) * 9.38 * 2 - x;
      return [t, x];
    };
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = st.pl[i], b = st.ball; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.gstate === 'init' || st.gstate === 'end') continue;
          const s = me.side, sd = -s;                  // sd = richting naar de tegenstander
          const [t, px] = predict(b, 2.1, st.wind);
          let tx = s * 5;
          const mine = b.x * s > 0 || (px * s > 0.3);
          if (st.gstate === 'serve') tx = b.x;
          else if (mine && !b.held) tx = px - sd * (me.R * 0.35 + (c.style === 'attack' ? 0.4 : 0.1));
          else tx = s * 5.5;
          tx += (rnd() - 0.5) * (1 - c.skill) * 1.8;
          const dx = tx - me.x;
          if (Math.abs(dx) > 0.15) v.x = clamp(dx / 0.6, -1, 1) * (0.7 + 0.3 * c.skill);
          const ddx = b.x - me.x, ddy = b.y - me.y, dist = Math.hypot(ddx, ddy);
          const reach = me.R + 0.5 + 0.62;
          // springen als de bal hoog komt
          if (mine && !b.held && me.grounded && b.y > 3.2 && Math.abs(ddx) < 2.4 && b.vy < 2 && t < 0.42 && rnd() < 0.3 + 0.7 * c.skill) v.y = -1;
          // slag
          if (mine && !b.held && me.slapCd <= 0 && me.st === 'idle' && dist < reach + 0.35 && rnd() < 0.25 + 0.7 * c.skill) { v.a = true; v.x = sd * (c.style === 'attack' ? 0.8 : 0.2); }
          // duik voor lage ballen
          else if (mine && !b.held && me.diveCd <= 0 && me.st === 'idle' && b.y < 1.9 && b.vy < 0 && Math.abs(ddx) > reach && Math.abs(ddx) < 4.2 && rnd() < 0.5 * c.skill) { v.b = true; v.x = Math.sign(ddx); }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (name === 'physics') {
    // robuustheid: de bal met willekeurige snelheden afvuren; hij mag nooit door de netpaal of buiten de pilaren lekken
    for (const style of ['idle', 'attack']) {
      const { browser, page, errors } = await open(process.env.TW || 'none');
      await installBots(page, [{ skill: 0.9, style }, { skill: 0.9, style }]);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance, d = inst.dbg; let viol = 0, cross = 0, maxX = 0, maxY = 0, steps = 0; const bad = [];
        for (let f = 0; f < 5000 && !m.finished; f++) {
          const st = d.state();
          if ((st.gstate === 'play' || st.gstate === 'serve') && f % 50 === 0) { const a = Math.random() * 6.283, sp = 8 + Math.random() * 19; d.setBall((Math.random() - 0.5) * 16, 1 + Math.random() * 8, Math.cos(a) * sp, Math.sin(a) * sp); }
          const before = d.ball.x; window.__bot(1); steps++;
          const bl = d.ball; maxX = Math.max(maxX, Math.abs(bl.x)); maxY = Math.max(maxY, bl.y);
          if (Math.abs(bl.x) > 10 || bl.y > 13.2 || bl.y < 0.5) { viol++; if (bad.length < 4) bad.push({ x: bl.x, y: bl.y }); }
          if (bl.y < 3.5 && Math.abs(bl.x) < 0.3 && Math.sign(before) !== Math.sign(bl.x) && Math.abs(before) > 0.6) cross++;
          for (const p of d.pl) if (Math.abs(p.x) < 0.28 + p.Rc - 0.01 || p.x * p.side < 0) viol++;
        }
        return { viol, cross, maxX, maxY, steps, bad, score: d.state().score };
      });
      console.log(`physics style=${style}`, JSON.stringify(res));
      if (res.viol || res.cross) fail(`physics style=${style} viol=${res.viol} cross=${res.cross}`);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
      await browser.close();
    }
    continue;
  }
  if (['bots', 'twists', 'timeout', 'idle', 'events'].includes(name)) {
    const A = { skill: 0.95, style: 'attack' }, Bw = { skill: 0.5, style: 'jumper' }, M = { skill: 0.8, style: 'attack' };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [M, M]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
          : name === 'events' ? [['none', [M, M]]]
            : [[process.env.TW || 'none', [A, Bw]], [process.env.TW || 'none', [Bw, A]], [process.env.TW || 'none', [M, M]]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(3, 3); d.setTime(0.3); });   // gelijkspel bij tijd -> gouden punt
      if (tw === 'lowgrav') await page.evaluate(() => { window.__gbMul = 1 - 0.6 * 0.6; });
      const res = await page.evaluate((forceEvents) => {
        const m = window.__app.mode, inst = m.instance, d = inst.dbg; const log = []; let last = ''; let g = 0;
        if (forceEvents) { window.__bot(120); d.mirror(); d.chicken(); d.gust(1); }
        let kindsSeen = new Set();
        while (!m.finished && g++ < 60 * 420) {
          window.__bot(1);
          const st = d.state(); kindsSeen.add(st.ball.kind);
          if (forceEvents && g % 600 === 0) { d.forceKind(['gold', 'bomb'][(g / 600) & 1]); }
          const key = st.score.join('-') + ':' + st.gstate + ':' + st.golden;
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.gstate} score=${st.score} left=${st.timeLeft.toFixed(1)} golden=${st.golden} ball=${st.ball.kind} rally=${st.rally}`); last = key; }
        }
        return { log: log.length > 40 ? [...log.slice(0, 6), '...', ...log.slice(-30)] : log, st: d.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin.n, kinds: [...kindsSeen] };
      }, name === 'events');
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} score=${st.score} finished=${res.finished} finishPvp-calls=${res.fin} smashes=${st.stats.smashes} digs=${st.stats.digs} gold=${st.stats.gold} bombs=${st.stats.bombs} chickens=${st.stats.chickens} mirrors=${st.stats.mirrors} gusts=${st.stats.gusts} faults=${st.stats.faults} longestRally=${st.stats.longest} kinds=${res.kinds}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      if (!res.finished) fail(`${name}/${tw}: niet afgelopen`);
      if (res.fin !== 1) fail(`${name}/${tw}: finishPvp ${res.fin}x aangeroepen`);
      if (res.result && res.result.winner == null) console.log('(gelijkspel)');
      if (name === 'timeout' && !st.golden) fail('timeout: geen gouden punt bij gelijkspel');
      if (name === 'events') { if (!st.stats.mirrors || !st.stats.chickens || !st.stats.gold && !st.stats.bombs) fail('events: niet alle gimmicks gezien'); }
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'attack' }, { skill: 0.85, style: 'attack' }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/vb_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.gstate, score: s.score, ball: s.ball.kind, rally: s.rally, wind: +s.wind.toFixed(1) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await go('s.gstate==="play" && s.rally>=2', 60 * 30); await snap('play');
    await page.evaluate(() => window.__bot(40)); await snap('play2');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.chicken(); }); await page.evaluate(() => window.__bot(60)); await snap('chicken');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.gust(-1); }); await page.evaluate(() => window.__bot(60)); await snap('wind');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.forceKind('gold'); }); await page.evaluate(() => window.__bot(30)); await snap('gold');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.forceKind('bomb'); }); await page.evaluate(() => window.__bot(30)); await snap('bomb');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(1, 5); }); await page.evaluate(() => window.__bot(30)); await snap('assist');
    await go('s.gstate==="point"', 60 * 60); await page.evaluate(() => window.__bot(10)); await snap('point');
    await go('s.gstate==="end"', 60 * 400); await page.evaluate(() => window.__bot(40)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
}
console.log(FAILS ? `\n${FAILS} FOUT(EN)` : '\nALLES OK');
server.close();
