// Gebruik: node tools/test_brawl.mjs [scenario...]
//   scenario: bots | twists | idle | timeout | sd | rage | both | matrix | sym | select | perf | looks | supershots | ko | items | supers | stages | grab | specials | shots
//   TW=<twist-id> kiest een twist. ST=island|dragon|volcano kiest het podium. Q=low|high kwaliteit. N=aantal potjes (bots/both).
// Bots kiezen zelf een vechter (via de echte invoer), spelen versneld (zonder renderen) hele potjes en rapporteren winnaar (finishPvp precies 1x) en console-fouten.
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
const TYPES = ['sword', 'mage', 'giant', 'ninja'], STAGES = ['island', 'dragon', 'volcano'];
let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) fails++; };

async function open(twist, stage) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=brawl&quality=${process.env.Q || 'low'}&twist=${twist || process.env.TW || 'none'}&stage=${stage || process.env.ST || 'island'}&scare=0`);
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

// cfg[i] = { skill 0..1, aggr 0..1, style: 'attack'|'idle'|'dodge'|'manual', type: vechter (undefined = willekeurig), pick: 'input'|'none' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const TY = ['sword', 'mage', 'giant', 'ninja'];
    const B = [0, 1].map(() => ({ hold: 0, think: 0, grab: 0, want: -1, f: 0 }));
    window.__cfg = cfg; window.__rnd = rnd; window.__B = B;
    // dichtstbijzijnde oppervlak voor herstel
    const surf = (me, st) => {
      let best = null, bd = 1e9;
      const cand = [];
      if (st.solid) cand.push({ x: 0, y: st.solid.top, w: st.solid.hw * 2 });
      for (const p of st.plats) if (p.on) cand.push(p);
      for (const p of cand) { const d = Math.hypot(me.x - p.x, (me.y - p.y) * 0.7); if (d < bd) { bd = d; best = p; } }
      return best;
    };
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        B[0].f++; B[1].f++;
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.f[i], en = st.f[1 - i];
          if (c.style === 'manual') continue;
          v.left = v.right = v.up = v.down = v.a = v.b = false;
          if (st.phase === 'select') {
            if (c.style === 'idle' || c.pick === 'none') continue;
            if (b.want < 0) b.want = c.type ? TY.indexOf(c.type) : Math.floor(rnd() * 4);
            const sl = st.sel[i], odd = b.f % 2 === 0;
            if (!sl.ok && odd) { if (sl.idx !== b.want) v[((b.want - sl.idx + 4) % 4) <= 2 ? 'right' : 'left'] = true; else v.a = true; }
            continue;
          }
          if (c.style === 'idle' || me.st === 'dead' || st.over || st.phase !== 'play') continue;
          if (me.st === 'super') continue;
          b.think -= dt;
          if (b.hold > 0) { b.hold -= dt; v.b = true; }
          const dx = en.x - me.x, dy = en.y - me.y, adx = Math.abs(dx), toE = dx > 0 ? 'right' : 'left', away = dx > 0 ? 'left' : 'right';
          if (me.st === 'frozen' || me.st === 'grabbed') { v.a = b.f % 2 === 0; v.b = b.f % 2 === 1; v[['left', 'right', 'up'][b.f % 3]] = true; continue; }
          if (me.st === 'hold') { if (rnd() < 0.08) { const r = rnd(); if (r < 0.4) v.right = true; else if (r < 0.6) v.left = true; else if (r < 0.8) v.up = true; else v.down = true; } else if (rnd() < 0.2) v.a = true; continue; }
          if (b.grab > 0) { b.grab--; v.b = true; if (b.grab <= 2) v.a = true; continue; }
          // super!
          if (me.meter >= 100 && rnd() < 0.15 && (me.st === 'free' || me.st === 'atk')) { v.a = true; v.b = true; continue; }
          // herstel: buiten het podium
          const sf = surf(me, st);
          const out = sf && !me.grounded && (me.y < sf.y - 0.4 || Math.abs(me.x - sf.x) > sf.w / 2 + 0.8);
          if (out) {
            v[me.x > sf.x ? 'left' : 'right'] = Math.abs(me.x - sf.x) > 0.8;
            if (me.type === 'mage' && me.jumps === 0 && me.vy < 0) v.up = true;
            else if (me.vy < 2 && me.y < sf.y + 1.5 && rnd() < 0.15) v.up = true;
            if (me.jumps === 0 && me.y < sf.y - 1 && me.cd <= 0 && !me.boostUsed && rnd() < 0.5) { v.up = true; v.b = true; v[me.x > sf.x ? 'left' : 'right'] = true; }
            continue;
          }
          // items oppakken
          const near = st.items.find((it) => it.st === 'ground' && Math.abs(it.x - me.x) < 12 && Math.abs(it.y - me.y) < 8 && (!me.item || ['heart', 'star', 'orb'].includes(it.type)) && it.type !== 'tramp');
          if (c.style !== 'dodge' && near && adx > 3) { const d = near.x - me.x; if (Math.abs(d) > 0.5) v[d > 0 ? 'right' : 'left'] = true; if (near.y > me.y + 1.5 && rnd() < 0.1) v.up = true; if (rnd() < 0.05) v.up = true; continue; }
          if (me.item === 'bomb' || me.item === 'ice') {
            if (adx > 3 && adx < 13 && Math.abs(dy) < 2.5 && (me.face > 0) === (dx > 0)) { if (rnd() < c.skill * 0.2) v.a = true; }
            else if (adx > 1.5) v[toE] = true;
            if (me.item === 'bomb' && adx < 2 && rnd() < 0.1) v.a = true;
            continue;
          }
          if (me.item === 'banana' || me.item === 'mine') { if (adx > 2) v[toE] = true; if (adx < 7 && rnd() < 0.1) { v.a = true; if (rnd() < 0.3) v.down = true; } continue; }
          if ((me.item === 'sword' || me.item === 'stick') && adx > 5 && adx < 14 && Math.abs(dy) < 2 && rnd() < 0.03) { v.b = true; v[toE] = true; continue; }
          if (c.style === 'dodge') { if (adx < 5) v[away] = true; if (rnd() < 0.02) v.up = true; if (rnd() < 0.01) v.b = true; continue; }
          // achtervolgen
          if (adx > 2.0) v[toE] = true;
          if (dy > 2.5 && rnd() < 0.08 * c.skill) v.up = true;
          if (dy > 2.8 && me.jumps < 2 && me.vy < 0 && rnd() < 0.08) v.up = true;
          if (dy < -2.8 && me.grounded && me.ground === 'plat' && rnd() < 0.05) v.down = true;
          // vechter-specifiek: speciale zetten
          if (me.spCd <= 0 && Math.abs(dy) < 2.5 && (me.face > 0) === (dx > 0) && !me.item) {
            const t = me.type;
            if ((t === 'mage' && adx > 3.5 && adx < 14 && rnd() < 0.05) || (t === 'sword' && adx < 3.6 && rnd() < 0.04) || (t === 'giant' && adx > 3 && adx < 8 && rnd() < 0.05) || (t === 'ninja' && adx > 1.5 && adx < 7 && rnd() < 0.05)) { v.b = true; v[toE] = true; continue; }
            if (t === 'mage' && adx > 4 && adx < 12 && rnd() < 0.04) { v.a = true; v[toE] = true; continue; }
          }
          // grijpen (schild + A)
          if (adx < 1.9 && me.grounded && Math.abs(dy) < 1.5 && rnd() < 0.03 * c.skill) { b.grab = 3; continue; }
          // slaan
          if (adx < 3.0 && Math.abs(dy) < 2.6 && rnd() < c.aggr) {
            v.a = true; const r = rnd();
            if (r < 0.2) v.up = true; else if (r < 0.35 && !me.grounded) v.down = true; else if (r < 0.55) v[toE] = true;
            if (me.type === 'giant' && r > 0.9) b.hold = 0;
          }
          if (me.item === 'hammer' && adx < 3.4 && rnd() < 0.3) v.a = true;
          if ((me.item === 'sword' || me.item === 'stick') && adx < 3.6 && rnd() < 0.3) v.a = true;
          // schild / roll
          if (en.st === 'atk' && adx < 3.2 && rnd() < 0.05 * c.skill) { if (rnd() < 0.5) b.hold = 0.25; else { v.b = true; v.down = true; } }
          if (rnd() < 0.004) v.b = true;
          // af en toe de randen opzoeken: wegduwen van de rand
          if (st.solid && Math.abs(me.x) > st.solid.hw - 1.4 && me.grounded && me.y < 0.5) v[me.x > 0 ? 'left' : 'right'] = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
    window.__press = (i, keys, frames = 1) => { // handmatige invoer
      const v = inp.virtual[i];
      for (let k = 0; k < frames; k++) { v.left = v.right = v.up = v.down = v.a = v.b = false; for (const key of keys) v[key] = true; window.__bot(1); }
      v.left = v.right = v.up = v.down = v.a = v.b = false; window.__bot(1);
    };
  }, cfg);
}

const sum = (res) => `T=${res.st.T.toFixed(1)} stage=${res.st.stage} types=${res.st.f.map((f) => f.type)} winner=${res.st.winner} stocks=${res.st.f.map((f) => f.stocks)} pct=${res.st.f.map((f) => Math.round(f.pct))} sd=${res.st.sd} hits=${res.st.f.map((f) => f.hits)} kos=${res.st.f.map((f) => f.kos)} supers=${res.st.stats.supers} meter=${res.st.f.map((f) => Math.round(f.meter))} items=${res.st.stats.items} expl=${res.st.stats.explosions} frz=${res.st.stats.freezes} drag=${res.st.stats.dragons} gold=${res.st.stats.golden} grabs=${res.st.stats.grabs} thr=${res.st.stats.throws} traps=${res.st.stats.traps} perfect=${res.st.stats.perfect} pick=${JSON.stringify(res.st.stats.pickups)}`;

async function runMatch(page, maxFrames = 60 * 400) {
  return page.evaluate((mx) => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < mx) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.phase + ':' + st.f.map((f) => f.stocks).join('-') + ':' + st.sd + ':' + st.gEv + ':' + st.dragon + st.f.map((f) => f.type);
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} ph=${st.phase} clock=${st.clock.toFixed(1)} stocks=${st.f.map((f) => f.stocks)} pct=${st.f.map((f) => Math.round(f.pct))} types=${st.f.map((f) => f.type)} sd=${st.sd} gEv=${st.gEv} dragon=${st.dragon}`); last = key; }
    }
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, twist: m.twist.id, finRes: window.__finRes };
  }, maxFrames);
}

const matchChecks = (res, errors) => {
  check(res.finished && res.fin === 1, `finishPvp precies 1x (fin=${res.fin}, finished=${res.finished})`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  check(res.result && res.result.winner != null, 'er is een winnaar');
  check(errors.length === 0, errors.length ? 'console-errors:\n' + errors.slice(0, 6).join('\n') : 'geen console-errors');
};

const A = { skill: 0.9, aggr: 0.1, style: 'attack' }, Bw = { skill: 0.6, aggr: 0.05, style: 'attack' };
const winners = [];

for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'sd', 'rage', 'both', 'matrix', 'sym', 'balance'].includes(name)) {
    const N = +(process.env.N || 0);
    let list;
    if (name === 'twists') list = TWISTS.map((t, k) => [t, STAGES[k % 3], [{ ...A, type: TYPES[k % 4] }, { ...Bw, type: TYPES[(k + 1 + (k > 3 ? 1 : 0)) % 4] }]]);
    else if (name === 'idle') list = [['none', 'island', [{ style: 'idle' }, { style: 'idle' }]], ['none', 'volcano', [{ style: 'idle' }, { style: 'idle' }]]];
    else if (name === 'timeout' || name === 'sd') list = [['none', 'dragon', [{ skill: 0.9, aggr: 0, style: 'dodge', type: 'ninja' }, { skill: 0.9, aggr: 0, style: 'dodge', type: 'mage' }]]];
    else if (name === 'rage') list = [['none', 'island', [{ ...A, type: 'sword' }, { style: 'idle', type: 'giant' }]]];
    else if (name === 'matrix') { list = []; let k = 0; for (const a of TYPES) for (const b of TYPES) list.push(['none', STAGES[k++ % 3], [{ ...A, type: a }, { ...Bw, type: b }]]); }
    else if (name === 'balance') { list = []; for (let r = 0; r < +(process.env.R || 2); r++) { let k = r; for (const a of TYPES) for (const b of TYPES) list.push(['none', STAGES[k++ % 3], [{ ...A, type: a }, { ...A, type: b }]]); } }
    else if (name === 'sym') { list = []; for (let k = 0; k < (N || 9); k++) list.push(['none', STAGES[k % 3], [{ ...A, type: TYPES[k % 4] }, { ...A, type: TYPES[(k + 1 + (k > 5 ? 1 : 0)) % 4] }]]); }
    else if (name === 'both') { list = []; for (let k = 0; k < (N || 6); k++) list.push(['none', STAGES[k % 3], k % 2 ? [{ ...Bw, type: TYPES[k % 4] }, { ...A, type: TYPES[k % 4] }] : [{ ...A, type: TYPES[k % 4] }, { ...Bw, type: TYPES[k % 4] }]]); }
    else list = (N ? Array.from({ length: N }, (_, k) => k) : [0, 1, 2, 3, 4, 5]).map((k) => [process.env.TW || 'none', process.env.ST || STAGES[k % 3], [{ ...(k % 2 ? Bw : A), type: TYPES[k % 4] }, { ...(k % 2 ? A : Bw), type: TYPES[(k * 3 + 1) % 4] }]]);
    for (const [tw, stg, cfg] of list) {
      const { browser, page, errors } = await open(tw, stg);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(6); });
      if (name === 'sd') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(3); });
      const t0 = Date.now();
      const res = await runMatch(page);
      console.log(`\n=== ${name} twist=${res.twist} stage=${stg} cfg=${JSON.stringify(cfg.map((c) => c.type || c.style))} (${((Date.now() - t0) / 1000).toFixed(1)}s) ===`);
      console.log(res.log.slice(0, 14).join('\n'));
      console.log('end ' + sum(res));
      matchChecks(res, errors);
      if (res.result) winners.push(res.result.winner);
      if (name === 'balance' && res.result) { const wt = res.st.f[res.result.winner].type, lt = res.st.f[1 - res.result.winner].type; const B = (global.__bal ||= {}); (B[wt] ||= { w: 0, n: 0 }).w++; B[wt].n++; (B[lt] ||= { w: 0, n: 0 }).n++; const BS = (global.__balS ||= {}); const e = (BS[stg] ||= { w0: 0, n: 0, t: 0 }); e.n++; e.t += res.st.T; if (res.result.winner === 0) e.w0++; }
      if ((name === 'idle' && stg === 'island') || name === 'timeout' || name === 'sd') check(res.st.sd, 'sudden death is gestart');
      await browser.close();
    }
    continue;
  }
  if (name === 'select') {
    // vechter kiezen: UI aanwezig, bots kiezen via invoer, time-out kiest willekeurig, na afloop UI weg en 'play'
    const { browser, page, errors } = await open('none', 'island');
    await installBots(page, [{ style: 'attack', skill: 0.5, aggr: 0.1, type: 'ninja' }, { style: 'idle' }]);
    const r = await page.evaluate(() => {
      const inst = window.__app.mode.instance, d = inst.dbg; const out = {};
      window.__bot(2); out.phase0 = d.state().phase; out.panels = document.querySelectorAll('.bw-panel').length; out.tiles = document.querySelectorAll('.bw-tile').length; out.stageTxt = (document.querySelector('.bw-stage') || {}).textContent;
      window.__bot(60 * 3); const s1 = d.state(); out.sel1 = s1.sel; out.types1 = s1.f.map((f) => f.type); out.selT1 = s1.selT;
      out.tips = [...document.querySelectorAll('.bw-tips')].map((e) => e.children.length);
      window.__bot(60 * 9); const s2 = d.state(); out.phase2 = s2.phase; out.types2 = s2.f.map((f) => f.type); out.panelsAfter = document.querySelectorAll('.bw-panel').length;
      window.__bot(60 * 3); out.phase3 = d.state().phase; out.meters = document.querySelectorAll('.bw-meter').length; out.clock = d.state().clock;
      return out;
    });
    console.log(JSON.stringify(r));
    check(r.phase0 === 'select' && r.panels === 2 && r.tiles === 8, 'keuzescherm: 2 panelen met 4 vechters');
    check(r.stageTxt && /Podium/.test(r.stageTxt), 'podium getoond: ' + r.stageTxt);
    check(r.sel1[0].ok && r.types1[0] === 'ninja', 'bot koos Ninja met de invoer');
    check(!r.sel1[1].ok && r.selT1 < 6, 'speler 2 wacht (timer loopt)');
    check(r.phase2 === 'play' || r.phase2 === 'ready', 'na time-out start het gevecht (' + r.phase2 + ')');
    check(TYPES.includes(r.types2[1]), 'time-out: speler 2 kreeg een willekeurige vechter: ' + r.types2[1]);
    check(r.panelsAfter === 0 && r.meters === 2, 'keuzescherm weg, super-meters zichtbaar');
    check(r.clock < 90 && r.phase3 === 'play', 'klok loopt na het kiezen');
    check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'ko') {
    // harde klap bij de rand -> KO, leven eraf, respawn. Op elk podium; blast-zones kloppen
    for (const stg of STAGES) {
      const { browser, page, errors } = await open('none', stg);
      await installBots(page, [{ style: 'manual', type: 'sword' }, { style: 'idle', type: 'sword', pick: 'none' }]);
      const r = await page.evaluate(() => {
        const d = window.__app.mode.instance.dbg; const out = []; d.pick(0, 'sword'); d.pick(1, 'sword'); d.finishSelect(); window.__bot(120); d.setTime(1e9);
        const S = d.S, B = S.BLAST; const res = { B };
        // 1. door de blast-zones vliegen
        const tests = { links: [-B.x - 1, 3], rechts: [B.x + 1, 3], onder: [0, B.bot - 1], boven: [0, B.top + 1] };
        res.zones = {};
        for (const [k, [x, y]] of Object.entries(tests)) { window.__bot(200); const before = d.state().f[1].stocks; d.setStocks(1, 3); d.setPos(1, x, y); window.__bot(2); const s = d.state().f[1]; res.zones[k] = s.st === 'dead' && s.stocks === 2; window.__bot(150); if (!res.respawn) { const s2 = d.state().f[1]; res.respawn = { st: s2.st, pct: s2.pct, stocks: s2.stocks }; } }
        // 2. net binnen de zone: nog niet dood
        d.setStocks(1, 3); window.__bot(200); d.setPos(1, B.x - 2, 3); window.__bot(1); res.inside = d.state().f[1].st !== 'dead';
        // 3. harde klap
        window.__bot(200); for (let k = 0; k < 600 && (d.state().f[1].st === 'dead' || d.state().f[0].st === 'dead'); k++) window.__bot(1); window.__bot(80); d.setStocks(1, 3); const st = S.start(1); d.setPct(1, 160); d.setPos(0, -0.4, st.y); d.setPos(1, 1.0, st.y); d.fs[1].inv = 0; d.fs[0].inv = 0; d.fs[0].face = 1; d.fs[1].grounded = true; d.fs[1].hitCool = 0;
        window.__bot(2);
        window.__press(0, ['a', 'right']);
        for (let k = 0; k < 150; k++) window.__bot(1);
        const s = d.state(); res.after = { pct: s.f[1].pct, x: s.f[1].x, hits: s.f[0].hits };
        return res;
      });
      console.log(stg, JSON.stringify(r));
      for (const k of Object.keys(r.zones)) check(r.zones[k], `${stg}: blast-zone ${k} geeft KO`);
      check(r.inside, `${stg}: net binnen de blast-zone = geen KO`);
      check(r.after.hits >= 1, `${stg}: smash raakt`);
      check(r.respawn.st !== 'dead' && r.respawn.pct < 20, `${stg}: respawn met lage schade`);
      check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'items') {
    // elk item en evenement uitproberen
    const { browser, page, errors } = await open(process.env.TW || 'none', process.env.ST || 'island');
    await installBots(page, [{ style: 'manual', type: 'sword' }, { style: 'manual', type: 'ninja' }]);
    const r = await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg; const out = []; const R = {};
      d.pick(0, 'sword'); d.pick(1, 'ninja'); d.finishSelect(); window.__bot(120); d.setEventT(1e9); d.setTime(1e9);
      const st0 = d.S.start(0), st1 = d.S.start(1);
      const reset = () => { d.itemT(1e9); window.__bot(30); d.setStocks(0, 3); d.setStocks(1, 3); d.setPct(0, 0); d.setPct(1, 0); d.fs.forEach((f, i) => { f.inv = 0; f.starT = 0; f.hitCool = 0; if (f.item) d.dropItem(i); }); };
      // ballonnen: elk type valt en kan worden opgepakt (zonder bots, handmatig neergezet naast een vechter)
      for (const t of ['hammer', 'bomb', 'ice', 'tramp', 'sword', 'stick', 'banana', 'mine', 'heart', 'star', 'orb']) {
        reset(); d.setPos(0, st0.x, st0.y); d.setPos(1, st0.x + 6, st0.y);
        d.itemT(99); const it = d.spawnItem(t, st0.x); for (let k = 0; k < 60 * 25 && it.st === 'fall'; k++) window.__bot(1); if (t !== 'tramp') { d.setPos(0, it.x - 0.3, it.y); } window.__bot(60 * 3);
        const s = d.state(); R[t] = { items: s.items.map((i) => i.type + ':' + i.st), held: s.f[0].item, pick: s.stats.pickups[t] || 0, tramps: s.n.tramps, meter: s.f[0].meter, star: s.f[0].starT };
        out.push(`${t}: ${JSON.stringify(R[t])}`);
        // opruimen
        for (const i of d.items.slice()) if (i.g.parent) i.g.parent.remove(i.g); d.items.length = 0;
      }
      // gebruik: zwaard slaan + gooien
      reset(); d.setPos(0, st0.x, st0.y); d.setPos(1, st0.x + 2.4, st0.y); d.fs[0].face = 1; d.giveItem(0, 'sword'); window.__bot(1);
      const p0 = d.state().f[1].pct; window.__press(0, ['a']); window.__bot(40); R.swordHit = d.state().f[1].pct - p0;
      reset(); d.setPos(0, st0.x, st0.y); d.setPos(1, st0.x + 9, st0.y); d.fs[0].face = 1; d.giveItem(0, 'sword'); window.__bot(1);
      window.__press(0, ['b', 'right']); R.thrownProj = d.projs.length; window.__bot(60); R.thrownHit = d.state().f[1].pct; R.swordAfter = d.state().f[0].item;
      reset(); d.giveItem(0, 'stick'); d.setPos(0, st0.x, st0.y); d.setPos(1, st0.x + 2.2, st0.y); d.fs[0].face = 1; const q0 = d.state().f[1].pct; window.__press(0, ['a']); window.__bot(40); R.stickHit = d.state().f[1].pct - q0;
      // bananenschil: neerleggen, erover lopen
      reset(); d.setPos(0, st0.x, st0.y); d.setPos(1, st0.x + 8, st0.y); d.fs[1].face = -1; d.giveItem(0, 'banana'); window.__bot(1); window.__press(0, ['a', 'down']); R.trapsAfterBanana = d.traps.length;
      d.fs[1].inv = 0; for (let k = 0; k < 90 && d.state().f[1].pct === 0; k++) { window.__bot(1); const v = window.__app.input.virtual[1]; v.left = true; } window.__app.input.virtual[1].left = false; R.bananaPct = d.state().f[1].pct;
      // mijn
      reset(); d.setPos(0, st0.x, st0.y); d.setPos(1, st0.x + 7, st0.y); d.giveItem(0, 'mine'); window.__bot(1); window.__press(0, ['a']); R.trapsAfterMine = d.traps.length; window.__bot(60);
      const mt = d.traps.find((q) => q.kind === 'mine'); d.setPos(1, mt ? mt.x : st0.x, mt ? mt.y : st0.y); d.fs[1].inv = 0; const e0 = d.state().stats.explosions; window.__bot(80); R.mineBoom = d.state().stats.explosions - e0;
      // ster: onkwetsbaar
      reset(); d.fs[1].starT = 5; const h = d.hurt(d.fs[1], { dmg: 10, bkb: 10, kbg: 0.1, ang: 40, dirx: 1, x: 0, y: 0 }); R.starBlocks = !h;
      // hartje herstelt
      reset(); d.setPct(0, 80); d.setPos(0, st0.x, st0.y); d.setPos(1, st0.x + 8, st0.y); const ht = d.spawnItem('heart', st0.x); for (let k = 0; k < 60 * 25 && ht.st === 'fall'; k++) window.__bot(1); d.setPos(0, ht.x, ht.y); window.__bot(60 * 2); R.heartPct = d.state().f[0].pct;
      // gouden draak
      reset(); d.startGolden(); window.__bot(60 * 12); R.golden = { phase: d.state().dragon, gold: d.state().stats.golden, items: d.state().items.map((i) => i.type), meters: d.state().f.map((f) => f.meter) };
      // draak, zwaartekracht, cadeautjes
      d.startDragon(); window.__bot(60 * 9); R.dragon = { phase: d.state().dragon, flames: d.state().n.flames, stats: d.state().stats.dragons };
      d.nextEvent(); window.__bot(60 * 10); R.gEv = d.state().gEv;
      return { out, R, s: d.state() };
    });
    console.log(r.out.join('\n')); console.log(JSON.stringify(r.R));
    const R = r.R;
    for (const t of ['hammer', 'bomb', 'ice', 'sword', 'stick', 'banana', 'mine']) check(R[t].pick >= 1 && R[t].held === t, `item ${t}: opgepakt en vastgehouden`);
    check(R.tramp.tramps >= 1 || R.tramp.pick === 0, 'trampoline wordt neergezet');
    check(R.heart.pick >= 1 && R.heartPct < 80, `hartje geeft herstel (${R.heartPct}%)`);
    check(R.star.pick >= 1 && R.star.star > 0, 'ster pakt op: onkwetsbaar');
    check(R.starBlocks, 'ster blokkeert schade');
    check(R.orb.pick >= 1 && R.orb.meter >= 99, 'gouden bal vult de super-meter');
    check(R.swordHit > 5, `zwaard slaat (${R.swordHit.toFixed(1)}%)`);
    check(R.thrownProj >= 1 && R.thrownHit > 0 && R.swordAfter === null, `zwaard gooien raakt (${R.thrownHit.toFixed(1)}%)`);
    check(R.stickHit > 2, `stok slaat (${R.stickHit.toFixed(1)}%)`);
    check(R.trapsAfterBanana >= 1 && R.bananaPct > 0, `bananenschil laat uitglijden (${R.bananaPct}%)`);
    check(R.trapsAfterMine >= 1 && R.mineBoom >= 1, 'mijn ontploft bij aanraking');
    check(R.golden.gold >= 1 && R.golden.items.includes('orb') || R.golden.meters.some((m) => m >= 99), 'Gouden Draak laat een gouden bal vallen');
    check(r.s.stats.dragons > 0, 'draak geweest'); check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'supers') {
    for (const [k, type] of TYPES.entries()) {
      const { browser, page, errors } = await open(process.env.TW || 'none', process.env.ST || 'island');
      await installBots(page, [{ style: 'manual', type }, { style: 'manual', type: 'sword' }]);
      const r = await page.evaluate(([type]) => {
        const d = window.__app.mode.instance.dbg; const R = {}; d.pick(0, type); d.pick(1, 'sword'); d.finishSelect(); window.__bot(120); d.setEventT(1e9); d.setTime(1e9);
        const st0 = d.S.start(0), st1 = d.S.start(1); const gx = (st0.x + st1.x) / 2;
        d.setPos(0, gx - 2, st0.y); d.setPos(1, gx + 2, st0.y); d.fs[0].face = 1; d.fs[1].face = -1; d.fs[0].inv = 0; d.fs[1].inv = 0; window.__bot(10);
        // niet vol: A+B doet geen super
        window.__press(0, ['a', 'b']); R.noSuperWhenEmpty = d.state().f[0].st !== 'super' && d.state().cine === false; window.__bot(30);
        d.setPos(0, gx - 2, st0.y); d.setPos(1, gx + 2, st0.y); d.fs[0].face = 1; d.fs[0].inv = 0; d.fs[1].inv = 0; window.__bot(5);
        d.setMeter(0, 100); window.__bot(1);
        // echte invoer: A+B tegelijk
        const v = window.__app.input.virtual[0]; v.a = true; v.b = true; window.__bot(1); v.a = false; v.b = false; window.__bot(1);
        R.cine = d.state().cine; R.st = d.state().f[0].st;
        const trace = []; let maxPct = 0, sawMeteor = 0, g = 0, sawSuper = false;
        while (g++ < 60 * 8) { window.__bot(1); const s = d.state(); sawMeteor = Math.max(sawMeteor, s.n.meteors); if (s.f[0].st === 'super') sawSuper = true; maxPct = Math.max(maxPct, s.f[1].pct); if (g % 20 === 0) trace.push(`${s.f[0].st}/${s.f[0].x.toFixed(1)},${s.f[0].y.toFixed(1)} opp ${s.f[1].st} pct=${Math.round(s.f[1].pct)}`); }
        window.__bot(60 * 3);
        const s = d.state(); R.trace = trace.join(' | '); R.maxPct = maxPct; R.sawMeteor = sawMeteor; R.after = s.f[0].st; R.meter = s.f[0].meter; R.supers = s.f[0].supers; R.sawSuper = sawSuper; R.stuck = s.cine;
        return R;
      }, [type]);
      console.log(type, JSON.stringify(r));
      check(r.noSuperWhenEmpty, `${type}: A+B met lege meter doet niets`);
      check(r.sawSuper && r.supers === 1, `${type}: super gestart met A+B (cine=${r.cine})`);
      check(r.maxPct >= 12, `${type}: super doet schade (${Math.round(r.maxPct)}%)`);
      check(r.after !== 'super' && r.after !== 'dead' && r.meter < 40 && !r.stuck, `${type}: na de super weer normaal (${r.after}, meter ${Math.round(r.meter)})`);
      if (type === 'mage') check(r.sawMeteor > 0, 'meteoren gezien');
      check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'grab') {
    const { browser, page, errors } = await open('none', 'island');
    await installBots(page, [{ style: 'manual', type: 'giant' }, { style: 'manual', type: 'ninja' }]);
    const r = await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg; const R = {}; d.pick(0, 'giant'); d.pick(1, 'ninja'); d.finishSelect(); window.__bot(120); d.setEventT(1e9); d.setTime(1e9);
      const st0 = d.S.start(0), setup = () => { window.__bot(40); d.setPos(0, 0, 0); d.setPos(1, 1.8, 0); d.fs[0].face = 1; d.fs[0].inv = 0; d.fs[1].inv = 0; d.fs[1].hitCool = 0; d.fs.forEach((f) => { f.lag = 0; f.cd = 0; f.st = 'free'; f.item = null; }); d.setPct(1, 0); window.__bot(3); };
      setup();
      const v = window.__app.input.virtual[0]; v.b = true; window.__bot(3); v.a = true; window.__bot(1); v.a = false; window.__bot(10); v.b = false;
      R.grabbed = d.state().f[1].st; R.holder = d.state().f[0].st;
      window.__bot(10); window.__press(0, ['right']); window.__bot(2); R.afterThrow = d.state().f[1].st; window.__bot(30);
      R.throwPct = d.state().f[1].pct; R.throwVx = d.state().f[1].vx; R.grabs = d.state().stats.grabs; R.throws = d.state().stats.throws;
      // ontsnappen door te beuken
      setup(); v.b = true; window.__bot(3); v.a = true; window.__bot(1); v.a = false; window.__bot(10); v.b = false; R.grabbed2 = d.state().f[1].st;
      const v1 = window.__app.input.virtual[1]; let esc = false; for (let k = 0; k < 40 && !esc; k++) { v1.a = k % 2 === 0; v1.b = k % 2 === 1; window.__bot(1); esc = d.state().f[1].st !== 'grabbed'; } v1.a = v1.b = false; R.escaped = esc; R.holderFree = d.state().f[0].st;
      // grijp mist als tegenstander te ver weg is
      setup(); d.setPos(1, 6, 0); v.b = true; window.__bot(3); v.a = true; window.__bot(1); v.a = false; window.__bot(10); v.b = false; R.farGrab = d.state().f[1].st; window.__bot(40); R.farRecover = d.state().f[0].st;
      // auto-worp na een seconde
      setup(); v.b = true; window.__bot(3); v.a = true; window.__bot(1); v.a = false; window.__bot(10); v.b = false; R.grabbedA = d.state().f[1].st; window.__bot(90); R.autoThrow = d.state().f[1].st + '/' + d.state().f[1].pct.toFixed(0);
      return R;
    });
    console.log(JSON.stringify(r));
    check(r.grabbed === 'grabbed' && r.holder === 'hold', 'schild + A grijpt de tegenstander');
    check(r.throwPct >= 5 && r.throwVx > 3 && r.afterThrow !== 'grabbed', `worp naar voren: schade ${r.throwPct.toFixed(1)}%, snelheid ${r.throwVx.toFixed(1)}`);
    check(r.grabbed2 === 'grabbed' && r.escaped && r.holderFree !== 'hold', 'knoppen beuken laat je ontsnappen');
    check(r.farGrab !== 'grabbed' && r.farRecover === 'free', 'grijpen op afstand mist (en herstelt)');
    check(r.grabbedA === 'grabbed' && r.autoThrow && !r.autoThrow.startsWith('grabbed') && !r.autoThrow.endsWith('/0'), 'auto-worp na een tijdje: ' + r.autoThrow);
    check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'specials') {
    const { browser, page, errors } = await open('none', 'island');
    await installBots(page, [{ style: 'manual', type: 'sword' }, { style: 'manual', type: 'sword' }]);
    const r = await page.evaluate((TY) => {
      const d = window.__app.mode.instance.dbg; const R = {}; d.pick(0, 'sword'); d.pick(1, 'sword'); d.finishSelect(); window.__bot(120); d.setEventT(1e9); d.setTime(1e9);
      const setup = (a, b, gap, pb) => { window.__bot(40); d.setPos(0, -3, 0); d.setPos(1, -3 + gap, 0); d.fs[0].face = 1; d.fs[1].face = -1; d.fs.forEach((f) => { f.inv = 0; f.lag = 0; f.cd = 0; f.spCd = 0; f.st = 'free'; f.item = null; f.hitCool = 0; f.boostUsed = false; }); d.setPct(0, 0); d.setPct(1, pb || 0); window.__bot(3); };
      for (const t of TY) {
        d.pick(0, t); d.fs[0].meter = 0; const o = {};
        // B + rechts
        setup(0, 1, t === 'mage' ? 7 : t === 'giant' ? 4.5 : t === 'ninja' ? 4 : 2.5);
        const x0 = d.state().f[0].x; window.__press(0, ['b', 'right'], 3); let maxx = x0, projs = 0; for (let k = 0; k < 90; k++) { window.__bot(1); const s = d.state(); maxx = Math.max(maxx, s.f[0].x); projs = Math.max(projs, s.n.projs); }
        o.side = { moved: +(maxx - x0).toFixed(1), opp: d.state().f[1].pct, projs, spCd: d.state().f[0].spCd };
        // B + omhoog (herstel)
        setup(0, 1, 8); d.setPos(0, 2, 6); d.fs[0].vy = 0; window.__bot(2); const y0 = d.state().f[0].y; window.__press(0, ['b', 'up'], 3); let maxy = y0; for (let k = 0; k < 40; k++) { window.__bot(1); maxy = Math.max(maxy, d.state().f[0].y); }
        o.up = { rise: +(maxy - y0).toFixed(1), used: d.state().f[0].boostUsed };
        // B + omlaag = roll
        setup(0, 1, 8); const rx0 = d.state().f[0].x; window.__press(0, ['b', 'down'], 2); let sawRoll = false, rmax = rx0; for (let k = 0; k < 30; k++) { window.__bot(1); const s = d.state(); if (s.f[0].st === 'roll') sawRoll = true; rmax = Math.max(rmax, s.f[0].x); } o.roll = { saw: sawRoll, dist: +(rmax - rx0).toFixed(1) };
        // A-aanval op dichtbij
        setup(0, 1, 1.8); window.__press(0, ['a'], 2); window.__bot(30); o.jab = d.state().f[1].pct;
        setup(0, 1, 2.2); window.__press(0, ['a', 'right'], 2); window.__bot(40); o.fsmash = d.state().f[1].pct;
        // luchtaanval
        setup(0, 1, 2.0); d.setPos(0, -3, 3); d.setPos(1, -1, 0); d.fs[0].vy = 0; window.__bot(1); window.__press(0, ['a'], 2); window.__bot(30); o.nair = d.state().f[1].pct;
        R[t] = o;
      }
      // reus: super-armor tijdens zijn smash; houd A vast = laden = meer schade
      d.pick(0, 'giant'); d.pick(1, 'sword'); setup(0, 1, 1.9, 0); d.fs[0].hitCool = 0; window.__press(0, ['a', 'right'], 1);
      window.__bot(5); const st = d.state().f[0].st; d.fs[1].inv = 0; d.fs[1].hitCool = 0;
      const hr = d.hurt(d.fs[0], { dmg: 6, bkb: 8, kbg: 0.1, ang: 40, dirx: -1, att: d.fs[1], x: 0, y: 1 }); R.armor = { st0: st, hurt: hr, stAfter: d.state().f[0].st };
      setup(0, 1, 1.9, 0); const vv = window.__app.input.virtual[0]; vv.a = true; vv.right = true; window.__bot(2); const cs = []; for (let k = 0; k < 50; k++) { window.__bot(1); cs.push(d.fs[0].charge); } R.chargeMax = Math.max(...cs); vv.a = false; vv.right = false; window.__bot(60); R.chargedPct = d.state().f[1].pct;
      setup(0, 1, 1.9, 0); window.__press(0, ['a', 'right'], 1); window.__bot(60); R.quickPct = d.state().f[1].pct;
      // mage zweeft
      d.pick(0, 'mage'); setup(0, 1, 8); d.setPos(0, 0, 8); d.fs[0].jumps = 0; const mv = window.__app.input.virtual[0]; mv.up = true; let minvy = 0; for (let k = 0; k < 40; k++) { window.__bot(1); minvy = Math.min(minvy, d.state().f[0].vy); } mv.up = false; R.glideMinVy = minvy;
      // ninja driedubbele sprong
      d.pick(0, 'ninja'); setup(0, 1, 8); const nv = window.__app.input.virtual[0]; let jumpsSeen = 0; let prevVy = 0; window.__press(0, ['up']); window.__bot(8); window.__press(0, ['up']); window.__bot(8); window.__press(0, ['up']); R.ninjaJumps = d.state().f[0].jumps; R.ninjaY = d.state().f[0].y;
      return R;
    }, TYPES);
    console.log(JSON.stringify(r, null, 0));
    check(r.sword.side.opp > 3, `Zwaardwervel raakt (${r.sword.side.opp.toFixed(1)}%)`);
    check(r.mage.side.projs >= 1 && r.mage.side.opp > 2, `Magier vuurbal vliegt en raakt (${r.mage.side.opp.toFixed(1)}%)`);
    check(r.giant.side.moved > 3 && r.giant.side.opp > 5, `Reus stormram rent (${r.giant.side.moved}) en raakt (${r.giant.side.opp.toFixed(1)}%)`);
    check(r.ninja.side.moved > 3 && r.ninja.side.opp > 2, `Ninja dash glijdt (${r.ninja.side.moved}) en raakt (${r.ninja.side.opp.toFixed(1)}%)`);
    for (const t of TYPES) { check(r[t].up.rise > 2 && r[t].up.used, `${t}: B+omhoog herstelt (+${r[t].up.rise})`); check(r[t].roll.saw && r[t].roll.dist > 1.5, `${t}: B+omlaag = roll (${r[t].roll.dist})`); check(r[t].jab > 0 && r[t].fsmash > 0, `${t}: grondaanvallen raken (${r[t].jab.toFixed(0)}/${r[t].fsmash.toFixed(0)})`); }
    check(r.armor.stAfter === 'atk' || r.armor.stAfter === 'free', 'reus-armor: ' + JSON.stringify(r.armor));
    check(r.chargeMax > 0.3, `reus laadt smash (${r.chargeMax.toFixed(2)}s)`); check(r.chargedPct > r.quickPct, `geladen smash doet meer schade (${r.chargedPct.toFixed(1)} > ${r.quickPct.toFixed(1)})`);
    check(r.glideMinVy > -4, `magier zweeft (min vy ${r.glideMinVy.toFixed(1)})`);
    check(r.ninjaJumps === 0 || r.ninjaY > 5, `ninja springt 3x (y=${r.ninjaY.toFixed(1)}, jumps over ${r.ninjaJumps})`);
    check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
    await browser.close(); continue;
  }
  if (name === 'stages') {
    for (const stg of STAGES) {
      const { browser, page, errors } = await open('none', stg);
      await installBots(page, [{ style: 'manual', type: 'sword' }, { style: 'manual', type: 'mage' }]);
      const r = await page.evaluate((stg) => {
        const d = window.__app.mode.instance.dbg; const R = { stage: d.state().stage }; d.pick(0, 'sword'); d.pick(1, 'mage'); d.finishSelect(); window.__bot(120); d.setTime(1e9);
        const S = d.S; const st0 = S.start(0);
        if (stg === 'dragon') {
          // staan op de rug: de vechter beweegt mee met het platform
          d.fs.forEach((f) => { f.inv = 9; }); const p0 = S.plats[0]; const xs = [], ys = [], gap = []; let wind = 0, fire = 0, dive = 0;
          for (let k = 0; k < 60 * 40; k++) { window.__bot(1); if (k % 30 === 0) { const s = d.state(); xs.push(p0.x); ys.push(p0.y); if (k < 60 * 9) gap.push(Math.abs(s.f[0].x - p0.x)); wind = Math.max(wind, Math.abs(s.wind)); fire = Math.max(fire, s.n.projs); } if (S.plats[0].y < -2.5) dive++; }
          R.rangeX = +(Math.max(...xs) - Math.min(...xs)).toFixed(1); R.rangeY = +(Math.max(...ys) - Math.min(...ys)).toFixed(1); R.maxGap = +Math.max(...gap).toFixed(1); R.wind = wind; R.fire = fire; R.dive = dive; R.stillOn = d.state().f[0].ground;
        } else if (stg === 'volcano') {
          d.fs.forEach((f) => { f.inv = 0; }); const lav = []; let crumbled = 0, back = false, gey = 0, lavaHits = 0;
          // lava stijgt
          for (let k = 0; k < 60 * 50; k++) { d.fs[0].inv = 9; d.fs[1].inv = 9; window.__bot(1); if (k % 60 === 0) lav.push(d.state().lavaY); }
          R.lavaMin = +Math.min(...lav).toFixed(1); R.lavaMax = +Math.max(...lav).toFixed(1);
          // brokkelend platform
          d.fs[0].inv = 0; d.fs[1].inv = 9; d.setPos(1, 0, 0); const p = S.plats[0]; d.setPos(0, p.x, p.y); const seen = new Set(); let fell = false;
          for (let k = 0; k < 60 * 12; k++) { d.fs[1].inv = 9; d.fs[0].inv = 9; window.__bot(1); seen.add(p.crumble.st); if (p.crumble.st === 'gone' && !fell) { fell = true; } if (fell && p.crumble.st === 'ok') back = true; }
          R.crumble = [...seen].join(','); R.crumbleBack = back; R.fighterFellOff = d.state().f[0].y < p.y - 1;
          // geiser raakt wie erboven staat
          d.fs[0].inv = 0; d.fs[1].inv = 9; d.setPct(0, 0); window.__bot(2); let gp = 0;
          for (let k = 0; k < 60 * 30 && gp === 0; k++) { d.setPos(0, 2.7, 0); d.fs[0].inv = 0; d.fs[0].geyCd = 0; window.__bot(1); gp = d.state().f[0].pct; } R.geyser = gp;
          // lava raakt wie erin valt
          for (let k = 0; k < 600 && d.state().f[0].st === 'dead'; k++) window.__bot(1); window.__bot(10); d.fs[0].inv = 0; d.setPct(0, 0); d.fs[0].hitCool = 0; const ly = d.state().lavaY; d.setPos(0, 9, ly - 1.0); window.__bot(2); const s = d.state().f[0]; R.lavaPct = s.pct; R.lavaVy = s.vy;
        } else {
          d.fs.forEach((f) => { f.inv = 0; }); window.__bot(60 * 3); R.stillOn = d.state().f[0].ground;
        }
        R.errs = 0; return R;
      }, stg);
      console.log(JSON.stringify(r));
      if (stg === 'dragon') { check(r.rangeX > 3 && r.rangeY > 2, `draak beweegt rond en op/neer (x ${r.rangeX}, y ${r.rangeY})`); check(r.maxGap < 4.5 && r.stillOn === 'plat', `vechter reist mee op het platform (max afstand ${r.maxGap})`); check(r.wind > 0, 'windvlaag geweest'); check(r.fire >= 1, 'draak spuwt vuur'); check(r.dive > 0, 'draak duikt'); }
      if (stg === 'volcano') { check(r.lavaMax - r.lavaMin > 4, `lava stijgt en daalt (${r.lavaMin}..${r.lavaMax})`); check(r.crumble.includes('shake') && r.crumble.includes('fall') && r.crumbleBack, 'platform brokkelt en komt terug: ' + r.crumble); check(r.geyser > 3, `geiser raakt (${r.geyser}%)`); check(r.lavaPct > 5 && r.lavaVy > 5, `lava brandt en gooit omhoog (${r.lavaPct}%, vy ${r.lavaVy.toFixed(1)})`); }
      if (stg === 'island') check(r.stillOn === 'solid', 'eiland: staat op het blok');
      check(errors.length === 0, errors.length ? errors.join('\n') : 'geen console-errors');
      await browser.close();
    }
    continue;
  }
  if (name === 'perf') {
    // draw calls / driehoeken per podium (renderer.info van het laatst getekende beeld)
    for (const stg of STAGES) {
      const { browser, page, errors } = await open('none', stg);
      await installBots(page, [{ skill: 0.9, aggr: 0.12, style: 'attack', type: 'mage' }, { skill: 0.8, aggr: 0.1, style: 'attack', type: 'giant' }]);
      const info = async (tag) => { await page.waitForTimeout(500); const r = await page.evaluate(() => { const i = window.__app.renderer.info; return { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; }); console.log(`perf ${stg} ${tag}: calls=${r.calls} tris=${r.tris} geometries=${r.geos} textures=${r.tex}`); return r; };
      await page.evaluate(() => window.__bot(30)); const a = await info('select');
      await page.evaluate(() => { window.__bot(60 * 12); const d = window.__app.mode.instance.dbg; d.setTime(1e9); d.spawnItem('sword', -2); d.spawnItem('mine', 2); d.spawnItem('heart', 4); window.__bot(60 * 5); }); const b = await info('play');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setMeter(0, 100); d.startSuper(0); window.__bot(60 * 2); }); const c = await info('super');
      check(Math.max(a.calls, b.calls, c.calls) < 140, `${stg}: weinig draw calls (max ${Math.max(a.calls, b.calls, c.calls)})`);
      check(errors.length === 0, errors.join('\n') || 'geen console-errors'); await browser.close();
    }
    continue;
  }
  if (name === 'supershots') {
    // screenshot van elke super tijdens de actie (cinematic en uitvoering)
    for (const [k, type] of TYPES.entries()) {
      const { browser, page, errors } = await open('none', process.env.ST || STAGES[k % 3]);
      await installBots(page, [{ style: 'manual', type }, { style: 'manual', type: 'sword' }]);
      await page.evaluate((type) => { const d = window.__app.mode.instance.dbg; d.pick(0, type); d.pick(1, 'sword'); d.finishSelect(); window.__bot(120); d.setTime(1e9); d.setEventT(1e9); const st = d.S.start(0), st1 = d.S.start(1), gx = (st.x + st1.x) / 2; d.setPos(0, gx - 2, st.y); d.setPos(1, gx + 2.5, st.y); d.fs[0].face = 1; d.fs[1].face = -1; window.__bot(5); d.setMeter(0, 100); d.startSuper(0); window.__bot(20); }, type);
      await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/br_super_${type}_a.png` });
      await page.evaluate(() => { window.__bot(50); }); await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/br_super_${type}_b.png` });
      await page.evaluate(() => { window.__bot(30); }); await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/br_super_${type}_c.png` });
      check(errors.length === 0, errors.join('\n') || 'geen console-errors'); await browser.close();
    }
    continue;
  }
  if (name === 'looks') {
    // close-ups van de vier vechters (2 per beeld) op het gekozen podium
    const stg = process.env.ST || 'island';
    for (const [k, pair] of [['sword', 'mage'], ['giant', 'ninja']].entries()) {
      const { browser, page, errors } = await open('none', stg);
      await installBots(page, [{ style: 'idle', pick: 'none' }, { style: 'idle', pick: 'none' }]);
      await page.evaluate((pair) => { const d = window.__app.mode.instance.dbg; window.__bot(5); d.pick(0, pair[0], false); d.pick(1, pair[1], false); window.__bot(20); }, pair);
      await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/br_looks${k}.png` });
      await page.evaluate((pair) => { const d = window.__app.mode.instance.dbg; d.pick(0, pair[0], true); d.pick(1, pair[1], true); window.__bot(200); d.fs[0].face = 1; d.fs[1].face = -1; for (const f of d.fs) f.c.swing(); window.__bot(8); }, pair);
      await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/br_looks${k}_play.png` });
      check(errors.length === 0, errors.join('\n') || 'geen console-errors'); await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    // screenshots van de keuzefase en elk podium (met supers en items)
    const stgs = process.env.ST ? [process.env.ST] : STAGES;
    for (const [si, stg] of stgs.entries()) {
      const { browser, page, errors } = await open(process.env.TW || 'none', stg);
      await installBots(page, [{ skill: 0.9, aggr: 0.12, style: 'attack', type: TYPES[si % 4], pick: 'none' }, { skill: 0.8, aggr: 0.1, style: 'attack', type: TYPES[(si + 2) % 4], pick: 'none' }]);
      const snap = async (tag) => { await page.waitForTimeout(600); await page.screenshot({ path: `/tmp/br_${stg}_${tag}.png` }); console.log('shot', stg, tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { T: +s.T.toFixed(1), ph: s.phase, types: s.f.map((f) => f.type), stocks: s.f.map((f) => f.stocks), pct: s.f.map((f) => Math.round(f.pct)), st: s.f.map((f) => f.st), meter: s.f.map((f) => Math.round(f.meter)), items: s.items.length }; }))); };
      await page.evaluate(() => window.__bot(30)); await snap('select0');
      await page.evaluate((ts) => { const d = window.__app.mode.instance.dbg; d.pick(0, ts[0], false); d.pick(1, ts[1], true); window.__bot(10); }, [TYPES[si % 4], TYPES[(si + 2) % 4]]); await snap('select1');
      await page.evaluate((ts) => { const d = window.__app.mode.instance.dbg; d.pick(0, ts[0], true); window.__bot(75); }, [TYPES[si % 4]]); await snap('ready');
      await page.evaluate(() => { window.__bot(60 * 4); }); await snap('play');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnItem('sword', -2); d.spawnItem('heart', 2); d.spawnItem('mine', 5); window.__bot(40); }); await snap('items_fall');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setMeter(0, 100); d.setMeter(1, 100); window.__bot(20); }); await snap('meter_full');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startSuper(0); window.__bot(25); }); await snap('super_cine');
      await page.evaluate(() => { window.__bot(50); }); await snap('super_go');
      await page.evaluate(() => { window.__bot(60 * 2); const d = window.__app.mode.instance.dbg; d.startSuper(1); window.__bot(50); }); await snap('super2');
      await page.evaluate(() => { window.__bot(60 * 2); }); await snap('super2_go');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startGolden(); window.__bot(60 * 3.4); }); await snap('golden');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setPct(1, 130); d.setPct(0, 90); window.__bot(60 * 8); }); await snap('later');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startDragon(); window.__bot(60 * 4); }); await snap('hazard');
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
      check(errors.length === 0, 'shots: geen console-errors');
      await browser.close();
    }
    continue;
  }
}
if (global.__bal) { console.log('\nBALANS (winst/potjes per vechter):', JSON.stringify(global.__bal)); console.log('per podium (Wes wint / potjes / gem. duur):', JSON.stringify(Object.fromEntries(Object.entries(global.__balS).map(([k, v]) => [k, `${v.w0}/${v.n}/${(v.t / v.n).toFixed(0)}s`])))); }
if (winners.length > 1) {
  const w0 = winners.filter((w) => w === 0).length, w1 = winners.filter((w) => w === 1).length;
  console.log(`winnaars: Wes ${w0}x, Jor ${w1}x`);
  check(w0 > 0 && w1 > 0, 'beide spelers kunnen winnen');
}
console.log(fails ? `\n${fails} CHECK(S) MISLUKT` : '\nALLE CHECKS OK');
server.close();
process.exit(fails ? 1 : 0);
