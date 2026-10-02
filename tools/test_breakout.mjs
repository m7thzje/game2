// Scenario-tests voor 'breakout'. Gebruik: node tools/test_breakout.mjs [idle|bot|bomb|power|physics|shots] [out.png]
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const scenario = process.argv[2] || 'bot'; const out = process.argv[3] || `/tmp/bo_${scenario}.png`;
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
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/Failed to load resource|minigame niet geladen|CERT/.test(t)) errors.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=breakout&quality=low`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 30000 });
await page.waitForTimeout(800);
await page.evaluate(() => { const m = window.__app.mode; m.ready = [true, true]; m._starting = true; m.startCountdown(); });
await page.evaluate(() => { const m = window.__app.mode; for (let i = 0; i < 80 && m.state !== 'play'; i++) m.update(0.05); });
console.log('state', await page.evaluate(() => window.__app.mode.state));
await page.evaluate(() => {
  const app = window.__app, m = app.mode, I = m.instance, D = I.debug, v = app.input.virtual;
  window.T = { m, I, D, issues: [],
    step(n, dt = 0.05, bot = null) {
      for (let k = 0; k < n; k++) {
        if (bot) bot(); app.input.update(); m.update(dt);
        for (const b of D.balls) { if (!b.alive) continue; if (!isFinite(b.x) || !isFinite(b.z)) this.issues.push('NaN ball'); if (b.att < 0 && (Math.abs(b.x) > 12.1 || b.z < -12.6 || b.z > 13.5)) this.issues.push(`ball out ${b.x.toFixed(1)},${b.z.toFixed(1)} t=${D.t.toFixed(1)}`); }
        if (m.state === 'result') break;
      }
    },
  };
  // bot: dichtstbijzijnde bat volgt de laagste bal; ander volgt een tweede bal of blijft
  window.T.bot = (opts = {}) => () => {
    const live = D.balls.filter((b) => b.alive);
    const pri = live.filter((b) => b.att < 0).sort((a, b) => b.z - a.z);   // laagste (grootste z) eerst
    for (const i of [0, 1]) { v[i].x = 0; v[i].a = false; v[i].b = false; }
    if (!pri.length) { v[0].a = true; v[1].a = true; return; }
    const tgt = pri[0];
    const bat = D.bats;
    // wie dichter bij de bal is vangt hem; de ander maakt ruimte
    const catcher = Math.abs(bat[0].x - tgt.x) < Math.abs(bat[1].x - tgt.x) ? 0 : 1;
    const toward = (i, x) => { const d = x - bat[i].x; v[i].x = Math.max(-1, Math.min(1, d / 1.2)); };
    toward(catcher, tgt.x + (opts.offs ?? (catcher ? -0.8 : 0.8)));
    const other = 1 - catcher; const sec = pri[1] || tgt;
    toward(other, opts.parkOther ? (other ? 7 : -7) : sec.x);
    if (opts.smash && tgt.vz > 0 && tgt.z > 6.5 && tgt.z < 8) v[catcher].b = true;
  };
});
const sc = {
  async idle() { await page.evaluate(() => { window.T.step(2400); }); },
  async bot() { await page.evaluate(() => { window.T.step(2000, 0.05, window.T.bot({ smash: true })); }); },
  async physics() {
    // lage fps: dt 0.05 en dt 0.1 (harness clampt op 0.05, we testen engine ook rechtstreeks)
    await page.evaluate(() => { window.T.step(1200, 0.05, window.T.bot()); });
  },
  async stress() {
    const r = await page.evaluate(() => {
      const { D, m } = window.T; const log = [];
      window.T.step(5);
      D.bats.forEach((b, i) => { b.hwT = 5.9; b.hw = 5.9; b.wideT = 9999; });
      D.balls.forEach((b) => { if (b.att >= 0) D.launch(b); });
      for (let k = 0; k < 5; k++) { const a = -2.6 + k * 0.4; D.newBall(rr(-8, 8), 2, Math.cos(a + 1.57) * 12, -Math.abs(Math.sin(a)) * 12 - 4); }
      function rr(a, b) { return a + Math.random() * (b - a); }
      let minRatio = 1, maxSp = 0, bad = 0;
      for (let k = 0; k < 4000; k++) {
        D.bats.forEach((b) => { b.hw = 5.9; b.hwT = 5.9; b.wideT = 9999; });
        const dt = k % 3 === 0 ? 0.05 : 0.033;
        window.__app.input.update(); m.update(dt);
        for (const b of D.balls) { if (!b.alive || b.att >= 0) continue; const sp = Math.hypot(b.vx, b.vz); maxSp = Math.max(maxSp, sp); minRatio = Math.min(minRatio, Math.abs(b.vz) / sp);
          // niet in een steen
          const c = Math.floor((b.x + 12) / 2), r = Math.floor((b.z + 12.4) / 1.2); const br = D.grid[r] && D.grid[r][c]; if (br && br.alive && br.landed && b.fireT <= 0) { const cx = Math.max(-12 + c * 2, Math.min(-12 + c * 2 + 2, b.x)), cz = Math.max(-12.4 + r * 1.2, Math.min(-12.4 + r * 1.2 + 1.2, b.z)); if (Math.hypot(b.x - cx, b.z - cz) < b.r * 0.6) bad++; } }
        if (m.state === 'result') break;
      }
      log.push(`minRatio |vz|/v = ${minRatio.toFixed(2)} maxSp=${maxSp.toFixed(1)} insideBrick=${bad} balls=${D.balls.filter((b) => b.alive).length} w1=${D.levels[0].destroyed}/${D.levels[0].total}`);
      return log;
    });
    console.log(r.join('\n'));
  },
  async push() {
    const r = await page.evaluate(() => {
      const { D, m } = window.T; const v = window.__app.input.virtual; const log = []; let cross = 0, minGap = 99;
      const chk = () => { const a = D.bats[0], b = D.bats[1]; const gap = (b.x - b.hw) - (a.x + a.hw); minGap = Math.min(minGap, gap); if (gap < 0.2) cross++; if (a.x - a.hw < -12.01 || b.x + b.hw > 12.01) cross += 1000; };
      v[0].x = 1; for (let k = 0; k < 80; k++) { window.__app.input.update(); m.update(0.05); chk(); }
      log.push('bat0 pushes right: a=' + D.bats[0].x.toFixed(2) + ' b=' + D.bats[1].x.toFixed(2));
      v[0].x = 0; v[1].x = -1; for (let k = 0; k < 120; k++) { window.__app.input.update(); m.update(0.05); chk(); }
      log.push('bat1 pushes left: a=' + D.bats[0].x.toFixed(2) + ' b=' + D.bats[1].x.toFixed(2));
      v[1].x = 0; v[0].x = 1; v[1].x = 1; for (let k = 0; k < 80; k++) { window.__app.input.update(); m.update(0.05); chk(); }
      log.push('both right: a=' + D.bats[0].x.toFixed(2) + ' b=' + D.bats[1].x.toFixed(2));
      for (let k = 0; k < 2000; k++) { v[0].x = Math.sin(k / 9) * 1.4; v[1].x = Math.cos(k / 13) * 1.4; window.__app.input.update(); m.update(0.05); chk(); if (m.state === 'result') break; }
      log.push('random 2000 steps: violations=' + cross + ' minGap=' + minGap.toFixed(2));
      return log;
    });
    console.log(r.join('\n'));
  },
  async wall2shot() {
    await page.evaluate(() => { const { D } = window.T; window.T.step(40, 0.05, window.T.bot()); for (const row of D.grid) for (const br of row) if (br) D.destroyBrick(br, { chain: true }); window.T.step(70, 0.05, window.T.bot()); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: out.replace('.png', '_a.png') });
    await page.evaluate(() => { window.T.step(120, 0.05, window.T.bot({ smash: true })); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: out.replace('.png', '_b.png') });
  },
  async power2() {
    const r = await page.evaluate(() => {
      const { D } = window.T; const log = [];
      window.T.step(70, 0.05, window.T.bot());
      log.push('balls start=' + D.balls.filter((b) => b.alive).length);
      D.applyPower('multi', D.bats[0]); log.push('multi: balls=' + D.balls.filter((b) => b.alive).length);
      D.applyPower('fire', D.bats[0]); log.push('fire: ' + D.balls.some((b) => b.fireT > 0));
      D.applyPower('life', D.bats[0]); log.push('life: ' + D.lives);
      window.T.step(80, 0.05, window.T.bot());
      return log;
    });
    console.log(r.join('\n'));
  },
  async power() {
    const r = await page.evaluate(() => {
      const { D } = window.T; const log = [];
      window.T.step(40); // ball launched
      for (const type of ['multi', 'wide', 'fire', 'slow', 'life']) {
        D.spawnPower(D.bats[0].x, D.bats[0].z - 3, type); window.T.step(30, 0.05, null);
        log.push(type + ': balls=' + D.balls.filter((b) => b.alive).length + ' hw0=' + D.bats[0].hw.toFixed(2) + ' fire=' + D.balls.some((b) => b.fireT > 0) + ' lives=' + D.lives);
      }
      return log;
    });
    console.log(r.join('\n'));
  },
  async bomb() {
    const r = await page.evaluate(() => {
      const { D } = window.T; const log = [];
      // zoek een bom
      let bomb = null; for (const row of D.grid) for (const br of row) if (br && br.bomb) bomb = br;
      log.push('bomb at ' + (bomb ? bomb.r + ',' + bomb.c : 'none') + ' wall=' + D.levels[0].name);
      if (bomb) { const before = D.levels[0].destroyed; D.destroyBrick(bomb, {}); window.T.step(40); log.push('destroyed delta=' + (D.levels[0].destroyed - before) + ' of total ' + D.levels[0].total); }
      return log;
    });
    console.log(r.join('\n'));
  },
  async clear() {
    // sloop wand 1 helemaal met de bot + cheats (snel), controleer overgang naar muur 2 en 3 sterren
    const r = await page.evaluate(() => {
      const { D } = window.T; const log = [];
      window.T.step(20, 0.05, window.T.bot());
      for (const row of D.grid) for (const br of row) if (br) D.destroyBrick(br, { chain: true });
      log.push('wall1 cleared: destroyed=' + D.levels[0].destroyed + '/' + D.levels[0].total + ' transT=' + D.transT.toFixed(1) + ' timeLeft=' + D.timeLeft.toFixed(1));
      window.T.step(80, 0.05, window.T.bot());
      log.push('curWall=' + D.curWall + ' wall2 total=' + (D.levels[1] && D.levels[1].total));
      window.T.step(30, 0.05, window.T.bot());
      let n = 0; const tot = D.levels[1].total;
      for (const row of D.grid) for (const br of row) if (br && n < tot * 0.55) { D.destroyBrick(br, { chain: true }); n++; }
      log.push('wall2 destroyed=' + D.levels[1].destroyed + '/' + tot);
      D.timeLeft = 0.1; window.T.step(10, 0.05, window.T.bot());
      return log;
    });
    console.log(r.join('\n'));
  },
  async shots() {
    const marks = [5, 14, 26];
    for (const mk of marks) {
      await page.evaluate((mk) => { const T = window.T; const d = mk - T.D.t; T.step(Math.round(d / 0.05), 0.05, T.bot({ smash: true })); }, mk);
      await page.waitForTimeout(700);
      await page.screenshot({ path: out.replace('.png', `_${mk}.png`) });
    }
  },
};
await sc[scenario]();
await page.waitForTimeout(400);
const info = await page.evaluate(() => { const m = window.__app.mode; const D = window.T.D; return { state: m.state, t: +D.t.toFixed(1), done: D.done, res: m.result && { stars: m.result.stars, score: m.result.score, bonus: m.result.bonus, summary: m.result.summary }, lives: D.lives, wall: D.curWall, w1: D.levels[0].destroyed + '/' + D.levels[0].total, w2: D.levels[1] ? D.levels[1].destroyed + '/' + D.levels[1].total : '-', best: D.bestStreak, timeLeft: +D.timeLeft.toFixed(1), issues: window.T.issues.slice(0, 5) }; });
console.log(JSON.stringify(info));
await page.screenshot({ path: out });
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
