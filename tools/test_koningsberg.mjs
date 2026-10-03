// Gebruik: node tools/test_koningsberg.mjs [scenario...]   scenario: bots | winners | twists | idle | timeout | shots | physics
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Drie bots (slot 0..2) spelen versneld (zonder renderen) hele potjes; rapporteert tussenstanden, winnaar en fouten.
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
let FAIL = 0; const check = (ok, msg) => { if (!ok) { FAIL++; console.log('FOUT:', msg); } };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=koningsberg&players=3&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    window.__finishCalls = 0; const orig = mode.finishPvp.bind(mode); mode.finishPvp = (r) => { window.__finishCalls++; return orig(r); };
    mode.ctx.finishPvp = (r) => mode.finishPvp(r);
    mode.paused = false;
    for (const k of [0, 1, 2]) inp.virtual[k].a = true; inp.update(); mode.update(0.016);
    for (const k of [0, 1, 2]) inp.virtual[k].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { style: 'king'|'brawler'|'random'|'idle', skill 0..1 }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1, 2].map(() => ({ wt: 0, tx: 0, tz: 0 }));
    window.__cfg = cfg;
    const radiusAt = (st, x, z) => { let a = Math.atan2(x, z); if (a < 0) a += Math.PI * 2; return st.sec[Math.min(23, Math.floor(a / (Math.PI * 2 / 24)))]; };
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1, 2]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.p[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (c.style === 'idle' || me.st === 'dead' || !st.started) continue;
          let tx = 0, tz = 0, push = false, jump = false;
          const foes = st.p.map((q, j) => ({ q, j })).filter((o) => o.j !== i && o.q.st !== 'dead');
          let near = null, nd = 1e9; for (const o of foes) { const d = Math.hypot(o.q.x - me.x, o.q.z - me.z); if (d < nd) { nd = d; near = o.q; } }
          const R = radiusAt(st, me.x, me.z), dc = Math.hypot(me.x, me.z);
          if (c.style === 'random') {
            b.wt -= dt; if (b.wt <= 0) { b.wt = 0.5 + rnd() * 1.2; const a = rnd() * 6.283, r = rnd() * (R - 1.5); b.tx = Math.sin(a) * r; b.tz = Math.cos(a) * r; }
            tx = b.tx; tz = b.tz; if (rnd() < 0.01) jump = true;
            if (near && nd < 2.3 && me.pushCd <= 0 && rnd() < 0.05 * (c.skill ?? 0.5)) { push = true; tx = near.x; tz = near.z; }
          } else if (c.style === 'brawler') {
            if (near) { tx = near.x; tz = near.z; if (nd < 2.5 && me.pushCd <= 0) push = true; } if (dc > R - 1.2) { tx = 0; tz = 0; }
          } else { // king: kroon pakken en vasthouden
            tx = 0; tz = 0;
            if (st.items.length && dc > 2.4 && rnd() < 0.5) { const it = inst.dbg.items[0]; if (it && Math.hypot(it.x, it.z) < R - 1.5 && Math.hypot(it.x - me.x, it.z - me.z) < 6) { tx = it.x; tz = it.z; } }
            if (near && nd < 2.4 && me.pushCd <= 0 && (c.skill ?? 1) > rnd()) { push = true; tx = near.x; tz = near.z; }
            if (me.bomb > 0 && near && nd < 6) { push = true; tx = near.x; tz = near.z; }
            if (st.HF.on) { const ang = Math.atan2(me.x, me.z); jump = st.HF.t > 1.9 && st.HF.t < 2.3; }
          }
          if (me.bomb > 0 && near && nd < 6) { push = true; tx = near.x; tz = near.z; }
          const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz);
          if (d > 0.3) { const sp = Math.min(1, d / 1.2); v.x = dx / d * sp; v.y = dz / d * sp; }
          if (push) v.b = true; if (jump) v.a = true;
          if (m.twist.id === 'invert') { v.x = -v.x; v.y = -v.y; } if (m.twist.id === 'swapab') { const t = v.a; v.a = v.b; v.b = t; }   // bots spelen slim rond de twist
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const sum = (r) => (r ? r.replace(/<[^>]+>/g, ' ') : '');
async function playOut(page, label) {
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let g = 0, lastSec = -1;
    while (!m.finished && g++ < 60 * 200) {
      window.__bot(1);
      const st = inst.dbg.state();
      if (m.twist.id === 'deurman' && !window.__deurDone && st.T > 20) { window.__deurDone = true; const before = st.p.map((p) => p.score); inst.onDeurman([true, false, true]); const after = inst.dbg.state().p.map((p) => p.score); log.push(`onDeurman: ${before.map(Math.round)} -> ${after.map(Math.round)}`); }
      const sec = Math.floor(st.tleft / 10);
      if (sec !== lastSec) { lastSec = sec; log.push(`t=${st.T.toFixed(1)} left=${st.tleft.toFixed(1)} score=${st.p.map((p) => Math.round(p.score))} falls=${st.p.map((p) => p.falls)} kos=${st.p.map((p) => p.kos)} sec=${Math.min(...st.sec)}..${Math.max(...st.sec)} items=${st.items} HF=${st.HF.on}`); }
    }
    for (let k = 0; k < 400; k++) { m.update(0.016); }   // laat de harness het resultaat tonen
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, finishCalls: window.__finishCalls, names: m.ctx.players.map((p) => p.name + ':' + p.css) };
  });
  return res;
}

for (const name of scen) {
  if (name === 'physics') {
    // robuustheid: spelers over de rand duwen, lava-val + respawn; niemand mag buiten de heuvel op y=0 blijven staan of NaN worden
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'random' }, { style: 'random' }, { style: 'random' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; let bad = 0, respawns = 0, maxOut = 0; const was = [false, false, false];
      window.__bot(120);
      for (let f = 0; f < 60 * 70 && !m.finished; f++) {
        if (f % 50 === 0) { const p = d.pl[f / 50 % 3 | 0]; if (p.st === 'ok') { const a = Math.random() * 6.28; p.kx = Math.sin(a) * 26; p.kz = Math.cos(a) * 26; } }
        window.__bot(1);
        d.pl.forEach((p, i) => { if (![p.x, p.y, p.z, p.vx, p.vz, p.kx, p.kz].every(Number.isFinite)) bad++; const dead = p.st === 'dead'; if (was[i] && !dead) respawns++; was[i] = dead; if (p.st === 'ok' && p.y === 0) { const r = Math.hypot(p.x, p.z); const st = d.state(); } });
      }
      const st = d.state(); return { bad, respawns, falls: st.p.map((p) => p.falls), finished: m.finished };
    });
    console.log('physics', JSON.stringify(res)); check(res.bad === 0, 'NaN in fysica'); check(res.respawns > 0, 'geen respawn gezien');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) FAIL++;
    await browser.close(); continue;
  }
  if (['bots', 'winners', 'twists', 'timeout', 'idle'].includes(name)) {
    const K = { style: 'king', skill: 1 }, Rn = { style: 'random', skill: 0.5 }, Br = { style: 'brawler' };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [K, Br, Rn]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [Rn, Rn, Rn]]]
          : name === 'winners' ? [[process.env.TW || 'none', [K, Rn, { style: 'idle' }]], [process.env.TW || 'none', [Rn, K, { style: 'idle' }]], [process.env.TW || 'none', [{ style: 'idle' }, Rn, K]]]
            : [[process.env.TW || 'none', [K, Br, Rn]], [process.env.TW || 'none', [Rn, K, Br]], [process.env.TW || 'none', [Br, Rn, K]]];
    const winners = new Set();
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(6); });
      const res = await playOut(page, name);
      console.log(`\n=== ${name} twist=${res.twist} cfg=${cfg.map((c) => c.style)} ===`);
      console.log(res.log.join('\n'));
      const r = res.result;
      console.log(`end T=${res.st.T.toFixed(1)} finished=${res.finished} finishCalls=${res.finishCalls} stats=${JSON.stringify(res.st.stats)} names=${res.names}`);
      if (r) { console.log(`RESULT winner=${r.winner} winnerId=${r.winnerId} score=${r.scoreArr} ids=${r.ids} :: ${sum(r.summary)}`); winners.add(r.winner); }
      check(res.finished, 'potje niet afgelopen'); check(res.finishCalls === 1, `finishPvp ${res.finishCalls}x aangeroepen`); check(r && r.winner != null, 'geen winnaar');
      check(res.names.join() === 'Wes:#35c46f,Jor:#4a8cff,Juul:#ff9a3c', 'namen/kleuren kloppen niet: ' + res.names);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) FAIL++;
      await browser.close();
    }
    if (name === 'winners' || name === 'bots') { console.log('winnaar-slots gezien:', [...winners].sort().join(',')); if (name === 'winners') check(winners.size === 3, 'niet alle drie de slots wonnen'); }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'king', skill: 0.7 }, { style: 'brawler' }, { style: 'random' }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/kb_${tag}.png` }); const s = await page.evaluate(() => { const st = window.__app.mode.instance.dbg.state(); return { T: +st.T.toFixed(1), sc: st.p.map((p) => Math.round(p.score)), st: st.p.map((p) => p.st), items: st.items, HF: st.HF.on }; }); console.log('shot', tag, JSON.stringify(s)); };
    await page.screenshot({ path: '/tmp/kb_intro.png' });
    await page.evaluate(() => window.__bot(120)); await snap('play');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnItem('boot'); d.spawnItem('shield'); d.spawnItem('bomb'); });
    await page.evaluate(() => window.__bot(40)); await snap('items');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveItem(0, 'boot'); d.giveItem(1, 'shield'); d.giveItem(2, 'bomb'); d.startCrumble(); d.startCrumble(); });
    await page.evaluate(() => window.__bot(50)); await snap('buffs');
    await page.evaluate(() => window.__bot(90)); await snap('crumbled');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startHighFive(); });
    await page.evaluate(() => window.__bot(100)); await snap('deurman');
    await page.evaluate(() => window.__bot(50)); await snap('deurman2');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(0, 200); d.setScore(2, 10); });
    await page.evaluate(() => window.__bot(200)); await snap('comeback');
    await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(14.5); }); await page.evaluate(() => window.__bot(80)); await snap('double');
    await page.evaluate(() => { window.__bot(60 * 40, (s) => s.finished); }); await page.evaluate(() => { const m = window.__app.mode; for (let k = 0; k < 400; k++) m.update(0.016); });
    await page.waitForTimeout(700); await page.screenshot({ path: '/tmp/kb_end.png' });
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) FAIL++;
    await browser.close(); continue;
  }
}
server.close();
console.log(FAIL ? `\n${FAIL} FOUT(EN)` : '\nALLES OK');
process.exit(FAIL ? 1 : 0);
