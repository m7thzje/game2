// Gebruik: node tools/test_ticktock.mjs [scenario...]   (twist kiezen: TWIST=giant node ...)
//   Scenario's bots3 / bots4: drie / vier spelers (vrij voor allen, ?players=N): alle spelers krijgen een bot, uitslag + place volgen (ook idle3/idle4 en 'alleen één speelt').
// Scenario's: look (screenshots van gimmicks), bots (volledige potjes met bots), idle (niemand beweegt), p0 / p1 (alleen die broer speelt goed), timeout
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { chromePath, BROWSER_ARGS } from './chrome_path.mjs';
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
const twist = process.env.TWIST || 'none';
let BAD = 0; const bad = (m) => { BAD++; console.log('FAIL:', m); };

for (const name of scen) {
  const mN = /^(bots|idle|solo)([34])(?:_(\d))?$/.exec(name); const NPL = mN ? +mN[2] : 2, SOLO = mN && mN[1] === 'solo' ? +mN[3] : -1;   // bots3 bots4 idle3 idle4 solo4_2 (alleen speler 2 speelt)
  const browser = await chromium.launch({ executablePath: chromePath(), args: BROWSER_ARGS });
  const page = await browser.newPage({ viewport: { width: 1000, height: 600 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=ticktock&quality=low&twist=${twist}&scare=0${NPL > 2 ? '&players=' + NPL : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    for (const q of mode.ids) inp.virtual[q].a = true; inp.update(); mode.update(0.016);
    for (const q of mode.ids) inp.virtual[q].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  await page.evaluate(([who, solo]) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    const st = { t: 0 }, NN = m.ids.length;
    // Slimme bot voor speler i: springt vlak voor een wijzer/koekoek, rent voor de gouden wijzer uit
    window.__bot = (n, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const s = inst.dbg.state(); if (stop && stop(s)) return true;
        for (const q of m.ids) { const v = inp.virtual[q]; v.a = false; v.b = false; v.x = 0; v.y = 0; }
        if (s.rstate === 'fight' && who !== 'idle') {
          const D = inst.dbg;
          for (let i = 0; i < NN; i++) {
            if (who === 'p0' && i === 1) continue; if (who === 'p1' && i === 0) continue; if (solo >= 0 && i !== solo) continue;
            const me = s.p[i]; if (me.st !== 'play') continue; const v = inp.virtual[m.ids[i]];
            const pr = 0.55; let jump = false; let mx = 0, mz = 0;
            for (const key of ['hour', 'minute', 'second', 'gold']) {
              const h = D.hands[key]; if (!h.on || h.dropY > 0.2) continue;
              const om = (h.dir * h.d.base * D.speedMul()); const lookT = 0.19; // vooruitkijken in s
              for (const tt of [0.1]) {
                const th = h.theta + om * tt; const hh = { dx: Math.sin(th), dz: -Math.cos(th), nx: Math.cos(th), nz: Math.sin(th), len: h.len, tail: h.tail, w: h.w, d: h.d };
                if (D.overlaps(hh, me.x, me.z, pr + 0.2)) { if (key === 'gold') { /* ren voor hem uit */ mx += h.dir * Math.cos(Math.atan2(me.x, -me.z)) * 2; mz += h.dir * Math.sin(Math.atan2(me.x, -me.z)) * 2; } else if (me.y < 0.05) jump = true; }
              }
              if (key === 'gold') { const ang = Math.atan2(me.x, -me.z); let d = ((ang - h.theta) * h.dir) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI; if (d > 5.0 || d < 0.2) { const tx = h.dir * Math.cos(ang), tz = h.dir * Math.sin(ang); mx += tx * 2; mz += tz * 2; } }
            }
            for (const hs of D.houses) { if (hs.state === 'warn' || hs.state === 'out') { const rx = me.x - hs.ox, rz = me.z - hs.oz; const cr = rx * hs.az - rz * hs.ax, s2 = rx * hs.ax + rz * hs.az; if (Math.abs(cr) < 1.9 && s2 > 0 && s2 < hs.reach + 1) { const sg = cr >= 0 ? 1 : -1; mx += hs.az * sg * 3; mz += -hs.ax * sg * 3; } } }
            if (jump) v.a = (k % 2 === 0);
            const l = Math.hypot(mx, mz); if (l > 0) { v.x = mx / l; v.y = mz / l; }
          }
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  }, [/^idle/.test(name) ? 'idle' : name === 'p0' ? 'p0' : name === 'p1' ? 'p1' : 'bots', SOLO]);

  if (name === 'timeout') {
    const r = await page.evaluate(() => {
      const m = window.__app.mode, inst = m.instance, D = inst.dbg, inp = window.__app.input; const log = [];
      let guard = 0;
      while (!m.finished && guard++ < 60 * 200) {
        const s = D.state();
        if (s.rstate === 'fight' && s.ht < 31 && s.ht > 1) D.R.ht = 32.5;   // sla de ronde over: veiligheidsklep moet beide spelers laten vallen
        inp.update(); m.update(1 / 60);
        const k = s.round + ':' + s.rstate + ':' + s.draws + ':' + D.R.matchOver; if (log[log.length - 1] !== k) log.push(k); if (s.draws >= 4) break;
      }
      return { log, finished: m.finished, result: m.result && { winner: m.result.winner, score: m.result.scoreArr }, st: D.state() };
    });
    console.log(JSON.stringify(r)); console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); await browser.close(); continue;
  }
  if (name === 'look') {
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/ticktock_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    const E = (fn) => page.evaluate(fn);
    await E(() => { const D = window.__app.mode.instance.dbg; D.setGod(true); window.__bot(60 * 2.2); }); await shot('a_start');
    await E(() => { const D = window.__app.mode.instance.dbg; D.startRound(); window.__bot(80); D.spawnCuckoo(0); D.spawnCuckoo(1); window.__bot(40); }); await shot('b_cuckoo_warn');
    await E(() => window.__bot(30)); await shot('c_cuckoo_out');
    await E(() => { const D = window.__app.mode.instance.dbg; D.startRound(); window.__bot(70); D.scheduleStrike(); window.__bot(40); }); await shot('d_strike_ghost');
    await E(() => window.__bot(50)); await shot('e_strike_done');
    await E(() => { const D = window.__app.mode.instance.dbg; D.startRound(); window.__bot(70); D.startTilt(); window.__bot(50); }); await shot('f_tilt');
    await E(() => { const D = window.__app.mode.instance.dbg; D.startRound(); window.__bot(70); D.spawnSpecial('second'); D.spawnSpecial('gold'); window.__bot(55); }); await shot('g_gold_ghost');
    await E(() => window.__bot(100)); await shot('h_gold');
    await E(() => { const D = window.__app.mode.instance.dbg; D.startRound(); window.__bot(70); D.R.starFor = 1; D.spawnStar(); window.__bot(30); }); await shot('i_star');
    await E(() => { const D = window.__app.mode.instance.dbg; D.collectStar(D.players[1], { x: 0, z: 0 }); window.__bot(20); }); await shot('j_freeze');
    await E(() => { const D = window.__app.mode.instance.dbg; D.startRound(); window.__bot(70); D.setGod(false); D.hitPlayer(D.players[0], 1, 0, 1, 0, 1, 'forced'); window.__bot(14); }); await shot('k_fly');
    await E(() => window.__bot(24)); await shot('l_fly2');
    await E(() => window.__bot(24)); await shot('l_fly3');
    await E(() => window.__bot(100)); await shot('m_end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }

  const res = await page.evaluate((nm) => {
    let fired = false; const log = []; let last = '';
    const m = window.__app.mode, inst = m.instance;
    let guard = 0; const t0 = 0;
    while (!m.finished && guard++ < 60 * 400) {
      window.__bot(1);
      const st = inst.dbg.state();
      if (nm === 'deurman' && !fired && st.T > 3) { fired = true; inst.onDeurman([true, false]); inst.onSwap(true); inst.onSwap(false); }
      const key = st.round + ':' + st.rstate + ':' + st.wins.join('-');
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} r${st.round} ${st.rstate} wins=${st.wins} ht=${st.ht.toFixed(1)} draws=${st.draws} sd=${st.sd}`); last = key; }
    }
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result };
  }, name);
  console.log(`\n=== ${name} (twist ${twist}) ===`);
  console.log(res.log.join('\n'));
  console.log(`end T=${res.st.T.toFixed(1)} wins=${res.st.wins} draws=${res.st.draws} finished=${res.finished} surv=${res.st.surv.map((x) => x.toFixed(1))}`);
  console.log('hits: ' + res.st.hist.map((h) => `${h.cause}@${h.ht.toFixed(1)}(p${h.i},y${h.y.toFixed(1)})`).join(' '));
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  if (NPL > 2) {
    const r = res.result, okp = res.finished && r && r.place && r.place.length === NPL && new Set(r.place).size === NPL;
    console.log(okp ? `OK   uitslag compleet: winnaarIds=${r.winnerIds} place=${r.place}` : 'FAIL: uitslag/place niet in orde'); if (!okp) bad('place');
  }
  if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 8).join('\n')); bad('console-fouten'); } else console.log('NO ERRORS');
  await browser.close();
}
server.close();
if (BAD) process.exitCode = 1;
