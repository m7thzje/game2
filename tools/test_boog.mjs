// Gebruik: node tools/test_boog.mjs [scenario...]   scenario: bots | twists | shots | timeout | idle | physics
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
  await page.goto(`http://localhost:${port}/?game=boog&quality=low&twist=${twist || 'none'}&scare=0`);
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

// cfg[i] = { skill: 0..1, style: 'aim'|'idle'|'wild', special: kans om een speciale pijl te laden }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ rel: 0.9, cd: 0 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], me = st.a[i], b = B[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || st.st === 'init' || st.st === 'end') continue;
          const tg = st.tg[i];
          // richt op het midden van het doel (iets tegen de wind in), minder precies bij lagere skill
          const lead = -0.2 * st.wind * (0.4 + c.skill * 0.6);
          const tx = tg.x + lead, ty = tg.y;
          const dx = tx - me.bx, dy = ty - me.by;
          if (c.style === 'wild') { v.x = Math.sin(st.T * 1.3 + i) ; v.y = Math.cos(st.T * 0.9); } else { v.x = Math.max(-1, Math.min(1, dx / 0.7)); v.y = -Math.max(-1, Math.min(1, dy / 0.7)); }
          b.cd -= dt;
          if (me.st === 'ready') {
            if (st.special[i] && !st.armed[i] && rnd() < c.special) v.b = true;
            const near = Math.hypot(dx, dy) < 1.4 - c.skill * 0.9 || c.style === 'wild';
            if (near && st.left[i] + 0 >= 0) { v.a = true; b.rel = c.skill > 0.8 ? 0.86 + rnd() * 0.08 : 0.3 + rnd() * 0.75; }
          } else if (me.st === 'draw') {
            v.a = me.tension < b.rel; v.b = Math.abs(me.aim[0] - tx) + Math.abs(me.aim[1] - ty) > 0.5 && c.skill > 0.5;
          }
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
    const hi = { skill: 0.95, style: 'aim', special: 0.5 }, lo = { skill: 0.5, style: 'aim', special: 0.2 };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [hi, { ...hi, skill: 0.85 }]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ skill: 0.6, style: 'aim', special: 0 }, { skill: 0.6, style: 'wild', special: 0 }]]]
          : [[process.env.TW || 'none', [hi, lo]], [process.env.TW || 'none', [lo, hi]], [process.env.TW || 'none', [hi, hi]], [process.env.TW || 'none', [lo, lo]]];
    const wins = [0, 0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(14); });
      if (name === 'idle') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(4); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
        while (!m.finished && g++ < 60 * 300) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = st.st + ':' + st.score.join('-');
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} ${st.st} score=${st.score} left=${st.left} t=${st.timeLeft.toFixed(0)}`); last = key; }
        }
        // nog even doorlopen om dubbele finishPvp-aanroepen te zien
        for (let k = 0; k < 400; k++) { m.paused = false; window.__app.input.update(); m.update(1 / 60); } m.paused = true;
        return { log: log.slice(-6), st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id };
      });
      console.log(`\n=== ${name} twist=${res.twist} ===`);
      console.log(res.log.join('\n'));
      const r = res.result;
      console.log(`end T=${res.st.T.toFixed(1)} score=${res.st.score} bull=${res.st.stats.bull} balloons=${res.st.stats.balloons} chicken=${res.st.stats.chicken} dragon=${res.st.stats.dragon} perfect=${res.st.stats.perfect} specials=${res.st.stats.specials} plof=${res.st.stats.plof}`);
      if (r) console.log(`RESULT winner=${r.winner} score=${r.scoreArr} :: ${r.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.finished && res.fin === 1, `finishPvp precies 1x (fin=${res.fin})`);
      check(errors.length === 0, 'geen console-errors'); if (errors.length) console.log(errors.slice(0, 6).join('\n'));
      if (r) wins[r.winner == null ? 2 : r.winner]++;
      await browser.close();
    }
    if (name === 'bots') { check(wins[0] > 0 && wins[1] > 0, `beide spelers kunnen winnen (${wins})`); }
    continue;
  }
  if (name === 'physics') {
    // robuustheid: veel pijlen met willekeurig richtkruis/wind; controleer dat elke pijl landt (geen eeuwig vliegende pijlen)
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ skill: 0.2, style: 'wild', special: 0.6 }, { skill: 0.2, style: 'wild', special: 0.6 }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; let maxFly = 0, stuckFly = 0;
      for (let f = 0; f < 60 * 120 && !m.finished; f++) { window.__bot(1); const fl = d.arrows.filter((q) => q.on && q.st === 'fly'); maxFly = Math.max(maxFly, fl.length); for (const q of fl) if (q.age > 6) stuckFly++; }
      return { maxFly, stuckFly, st: d.state() };
    });
    check(res.stuckFly === 0, `geen eeuwig vliegende pijlen (maxFly=${res.maxFly})`);
    check(errors.length === 0, 'geen console-errors'); if (errors.length) console.log(errors.join('\n'));
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'aim', special: 0.5 }, { skill: 0.7, style: 'aim', special: 0.3 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/boog_${tag}.png` }); const s = await page.evaluate(() => { const x = window.__app.mode.instance.dbg.state(); let meshes = 0; window.__app.mode.ctx.scene.traverse((o) => { if ((o.isMesh || o.isSprite || o.isPoints) && o.visible) meshes++; }); return { meshes, st: x.st, score: x.score, left: x.left, wind: +x.wind.toFixed(2), pat: x.pat }; }); console.log('shot', tag, JSON.stringify(s)); };
    const dbg = (fn, ...a) => page.evaluate(([f, a]) => window.__app.mode.instance.dbg[f](...a), [fn, a]);
    const go = (cond, max = 60 * 40) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(60 * 6)); await snap('play');
    await go('s.a[0].st==="draw" && s.a[0].tension>0.5'); await snap('draw');
    await go('s.score[0]+s.score[1]>0', 60 * 30); await page.evaluate(() => window.__bot(8)); await snap('hit');
    await dbg('spawnBalloon'); await dbg('forceChicken'); await dbg('forceDragon'); await page.evaluate(() => window.__bot(60 * 2)); await snap('bonus');
    await dbg('give', 0, 'plof'); await dbg('give', 1, 'trio'); await page.evaluate(() => window.__bot(60 * 9)); await snap('special');
    await dbg('forceShout'); await page.evaluate(() => window.__bot(30)); await snap('deurman');
    await dbg('forceDrop'); await page.evaluate(() => window.__bot(60 * 2)); await snap('drop');
    await dbg('setPhase', 50); await page.evaluate(() => window.__bot(60 * 3)); await snap('slide');
    await go('s.left[0]<=1 && s.left[1]<=1', 60 * 90); await page.evaluate(() => window.__bot(40)); await snap('last');
    await go('s.st==="end"', 60 * 120); await page.evaluate(() => window.__bot(60)); await snap('end');
    check(errors.length === 0, 'geen console-errors'); if (errors.length) console.log(errors.slice(0, 6).join('\n'));
    await browser.close(); continue;
  }
}
server.close();
console.log(fails ? `\n${fails} CHECK(S) GEFAALD` : '\nALLES OK');
process.exit(fails ? 1 : 0);
