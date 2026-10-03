// Gebruik: node tools/test_brawl.mjs [scenario...]   scenario: bots | twists | idle | timeout | sd | ko | items | shots | rage
//   TW=<twist-id> kiest een twist. Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert tussenstanden, winnaar (finishPvp precies 1x), console-fouten.
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
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=brawl&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // finishPvp tellen
    const ctxFin = mode.ctx.finishPvp; window.__fin = 0; mode.ctx.finishPvp = (r) => { window.__fin++; window.__finRes = r; return ctxFin(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1, aggr 0..1, style: 'attack'|'idle'|'dodge' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ hold: 0, think: 0, mode: 'a', dirT: 0, dir: 0, shield: 0 }));
    window.__cfg = cfg; window.__act = 0;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.f[i], en = st.f[1 - i];
          if (c.style === 'manual') continue;
          v.left = v.right = v.up = v.down = v.a = v.b = false;
          if (c.style === 'idle' || me.st === 'dead' || st.over) continue;
          b.think -= dt; b.dirT -= dt;
          if (b.hold > 0) { b.hold -= dt; v.b = true; }
          const dx = en.x - me.x, dy = en.y - me.y, adx = Math.abs(dx);
          // herstel: buiten het eiland
          const off = Math.abs(me.x) > 8.6 || me.y < -0.3;
          if (me.st === 'frozen') { v.a = rnd() < 0.5; v.b = !v.a; continue; }
          if (off && !me.grounded) {
            const toC = me.x > 0 ? 'left' : 'right'; v[toC] = true;
            if (me.vy < 2 && me.y < 1.5 && rnd() < 0.15) v.up = true;
            if (me.jumps === 0 && me.y < -1.5 && me.cd <= 0 && !me.boostUsed && rnd() < 0.5) { v.up = true; v.b = true; v[toC] = true; }
            continue;
          }
          // items
          const near = st.items.find((it) => it.st === 'ground' && Math.abs(it.x - me.x) < 12 && !me.item && it.type !== 'tramp');
          if (c.style !== 'dodge' && near && adx > 3) { const d = near.x - me.x; if (Math.abs(d) > 0.5) v[d > 0 ? 'right' : 'left'] = true; if (near.y > me.y + 1.5 && rnd() < 0.1) v.up = true; if (rnd() < 0.05) v.up = true; continue; }
          if (me.item === 'bomb' || me.item === 'ice') {
            if (adx > 3 && adx < 13 && Math.abs(dy) < 2.5 && (me.face > 0) === (dx > 0)) { if (rnd() < c.skill * 0.2) v.a = true; }
            else if (adx > 1.5) v[dx > 0 ? 'right' : 'left'] = true;
            if (me.item === 'bomb' && adx < 2 && rnd() < 0.1) v.a = true;
            continue;
          }
          if (c.style === 'dodge') { if (adx < 5) v[dx > 0 ? 'left' : 'right'] = true; if (rnd() < 0.02) v.up = true; if (rnd() < 0.01) v.b = true; continue; }
          // achtervolgen
          if (adx > 2.0) v[dx > 0 ? 'right' : 'left'] = true;
          if (dy > 2.5 && rnd() < 0.08 * c.skill) v.up = true;
          if (dy > 2.8 && me.jumps < 2 && me.vy < 0 && rnd() < 0.08) v.up = true;
          if (dy < -2.8 && me.grounded && me.y > 3 && rnd() < 0.05) v.down = true;
          // slaan
          if (adx < 3.0 && Math.abs(dy) < 2.6 && rnd() < c.aggr) {
            v.a = true; const r = rnd();
            if (r < 0.2) v.up = true; else if (r < 0.35 && !me.grounded) v.down = true; else if (r < 0.55) v[dx > 0 ? 'right' : 'left'] = true;
          }
          if (me.item === 'hammer' && adx < 3.4 && rnd() < 0.3) v.a = true;
          // schild / roll
          if (en.st === 'atk' && adx < 3.2 && rnd() < 0.05 * c.skill) { if (rnd() < 0.5) b.hold = 0.25; else { v.b = true; v[dx > 0 ? 'left' : 'right'] = true; } }
          if (rnd() < 0.004) v.b = true;
          // af en toe de randen opzoeken: wegduwen van de rand
          if (Math.abs(me.x) > 7.5 && me.grounded) v[me.x > 0 ? 'left' : 'right'] = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const sum = (res) => `T=${res.st.T.toFixed(1)} winner=${res.st.winner} stocks=${res.st.f.map((f) => f.stocks)} pct=${res.st.f.map((f) => Math.round(f.pct))} sd=${res.st.sd} hits=${res.st.f.map((f) => f.hits)} kos=${res.st.f.map((f) => f.kos)} items=${res.st.stats.items} expl=${res.st.stats.explosions} frz=${res.st.stats.freezes} drag=${res.st.stats.dragons} tramp=${res.st.stats.trampolines} perfect=${res.st.stats.perfect}`;

async function runMatch(page, maxFrames = 60 * 400) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.f.map((f) => f.stocks).join('-') + ':' + st.sd + ':' + st.gEv + ':' + st.dragon;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} clock=${st.clock.toFixed(1)} stocks=${st.f.map((f) => f.stocks)} pct=${st.f.map((f) => Math.round(f.pct))} sd=${st.sd} gEv=${st.gEv} dragon=${st.dragon}`); last = key; }
    }
    // laat de resultaatkaart-timer verlopen
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id, finRes: window.__finRes };
  }, maxFrames);
}

for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'sd', 'rage'].includes(name)) {
    const A = { skill: 0.9, aggr: 0.1, style: 'attack' }, Bw = { skill: 0.6, aggr: 0.05, style: 'attack' };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [A, Bw]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' || name === 'sd' ? [['none', [{ skill: 0.9, aggr: 0, style: 'dodge' }, { skill: 0.9, aggr: 0, style: 'dodge' }]]]
          : name === 'rage' ? [['none', [A, { style: 'idle' }]]]
            : [[process.env.TW || 'none', [A, Bw]], [process.env.TW || 'none', [Bw, A]], [process.env.TW || 'none', [{ skill: 0.8, aggr: 0.08, style: 'attack' }, { skill: 0.8, aggr: 0.08, style: 'attack' }]]];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(6); });
      if (name === 'sd') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(3); });
      const res = await runMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.slice(0, 40).join('\n'));
      console.log('end ' + sum(res));
      // laat de harness een paar seconden doorlopen zodat finishPvp (delay) zeker is afgevuurd
      check(res.finished && res.fin === 1, `finishPvp precies 1x (fin=${res.fin}, finished=${res.finished})`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.result && res.result.winner != null, 'er is een winnaar');
      check(errors.length === 0, errors.length ? 'console-errors:\n' + errors.slice(0, 6).join('\n') : 'geen console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'ko') {
    // deterministische test: harde klap bij de rand -> KO, leven eraf, respawn
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ style: 'manual' }, { style: 'idle' }]);
    const r = await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg; const out = [];
      window.__bot(30);
      d.setPct(1, 160); d.setPos(0, 8, 0); d.setPos(1, 9.2, 0); d.fs[1].inv = 0; d.fs[0].inv = 0; d.fs[0].face = 1; d.fs[1].grounded = true;
      window.__bot(2);
      const v = window.__app.input.virtual[0]; v.a = true; v.right = true; // fsmash
      window.__bot(1); v.a = false; v.right = false; window.__app.input.update();
      for (let k = 0; k < 90; k++) { window.__bot(1); const s = d.state(); if (k % 15 === 0) out.push(`k=${k} st=${s.f[1].st} x=${s.f[1].x.toFixed(1)} y=${s.f[1].y.toFixed(1)} vx=${s.f[1].vx.toFixed(1)} stocks=${s.f[1].stocks}`); }
      window.__bot(120); const s2 = d.state(); out.push(`na respawn: st=${s2.f[1].st} stocks=${s2.f[1].stocks} pct=${s2.f[1].pct} y=${s2.f[1].y.toFixed(1)}`);
      return { out, s: d.state() };
    });
    console.log(r.out.join('\n'));
    check(r.s.f[1].stocks === 2, 'KO kost een leven');
    check(r.s.f[1].pct < 5 && r.s.f[1].st !== 'dead', 'respawn met 0% schade');
    check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'items') {
    // elk item en evenement uitproberen
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, aggr: 0.1, style: 'attack' }, { skill: 0.9, aggr: 0.1, style: 'attack' }]);
    const r = await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg; const out = []; window.__bot(60);
      for (const t of ['hammer', 'bomb', 'ice', 'tramp']) { d.spawnItem(t, t === 'tramp' ? 0 : -3); window.__bot(420); const s = d.state(); out.push(`${t}: items=${JSON.stringify(s.items)} held=${s.f.map((f) => f.item)} expl=${s.stats.explosions} frz=${s.stats.freezes} tramps=${s.n.tramps} stats.items=${s.stats.items}`); }
      d.giveItem(0, 'hammer'); window.__bot(200); out.push('hammer held after: ' + d.state().f[0].item);
      d.giveItem(1, 'bomb'); window.__bot(400); out.push('bomb after: ' + d.state().f[1].item + ' expl=' + d.state().stats.explosions);
      d.startDragon(); window.__bot(60 * 9); out.push('dragon: phase=' + d.state().dragon + ' flames=' + d.state().n.flames + ' pct=' + d.state().f.map((f) => Math.round(f.pct)));
      d.nextEvent(); window.__bot(60 * 10); out.push('event gEv=' + d.state().gEv);
      return { out, s: d.state() };
    });
    console.log(r.out.join('\n'));
    check(r.s.stats.explosions > 0, 'bom ontploft'); check(r.s.stats.dragons > 0, 'draak geweest');
    check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, aggr: 0.12, style: 'attack' }, { skill: 0.8, aggr: 0.1, style: 'attack' }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/br_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { T: +s.T.toFixed(1), stocks: s.f.map((f) => f.stocks), pct: s.f.map((f) => Math.round(f.pct)), st: s.f.map((f) => f.st), items: s.items.length }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(90)); await snap('play');
    await go('s.f.some(f=>f.st==="atk")', 600); await page.evaluate(() => window.__bot(4)); await snap('attack');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnItem('hammer', -2); d.spawnItem('bomb', 2); d.spawnItem('ice', 5); window.__bot(40); }); await snap('items_fall');
    await page.evaluate(() => { window.__bot(200); }); await snap('items_land');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveItem(0, 'hammer'); d.giveItem(1, 'ice'); window.__bot(30); }); await snap('held');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startDragon(); window.__bot(60 * 3.6); }); await snap('dragon');
    await page.evaluate(() => { window.__bot(60 * 1.2); }); await snap('dragon2');
    await go('s.f.some(f=>f.st==="shield")', 60 * 40); await snap('shield');
    await go('s.f.some(f=>f.st==="frozen")', 60 * 40); await snap('frozen');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setPct(1, 140); d.setPct(0, 120); window.__bot(20); }); await snap('highpct');
    await go('s.f.some(f=>f.st==="dead")', 60 * 120); await page.evaluate(() => window.__bot(8)); await snap('ko');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.nextEvent(); window.__bot(40); }); await snap('event');
    await page.evaluate(() => { window.__app.mode.instance.dbg.startSD(); window.__bot(90); }); await snap('sd');
    await go('s.over', 60 * 120); await page.evaluate(() => window.__bot(60)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(fails ? `\n${fails} CHECK(S) MISLUKT` : '\nALLE CHECKS OK');
server.close();
process.exit(fails ? 1 : 0);
