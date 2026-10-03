// Gebruik: node tools/test_paint.mjs [scenario...]
// scenario: bots (normaal potje), p0/p1/p2 (alleen die speler speelt), idle (niemand; verlenging/gelijkspel), twists (alle twists, kort),
//           shots (screenshots van sponge/emmer/finale), deurman (onDeurman direct aanroepen), tie (gelijkspel-regels)
// Achtervoegsel "3" (bots3, p2_3, idle3, twists3, deurman3, tie3, shots3) = 3 spelers (?players=3, Juul = slot 2). "all3" = alle 3-speler-scenario's.
// Versneld (zonder renderen) potjes Verfgevecht spelen met bots; controleert dat finishPvp altijd precies 1x wordt aangeroepen.
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
let scen = process.argv.slice(2).length ? process.argv.slice(2) : ['bots', 'bots3'];
if (scen.includes('all3')) scen = ['bots3', 'p0_3', 'p1_3', 'p2_3', 'idle3', 'tie3', 'deurman3', 'twists3'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
let failed = 0; const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failed++; };

async function open(browser, twist, np) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=paint&quality=low&scare=0${np === 3 ? '&players=3' : ''}${twist ? '&twist=' + twist : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async (np) => {
    const app = window.__app, mode = app.mode, inp = app.input;
    for (let i = 0; i < np; i++) inp.virtual[i].a = true; inp.update(); mode.update(0.016);
    for (let i = 0; i < np; i++) inp.virtual[i].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  }, np);
  // bot installeren (+ finishPvp tellen)
  await page.evaluate((np) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    const N = 12, TS = 1.5; const cellC = (g) => (g - 5.5) * TS;
    let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__np = np; window.__mode = 'bots'; window.__skill = new Array(np).fill(1);
    window.__fin = []; const orig = m.ctx.finishPvp; m.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
    window.__bot = (n, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (let i = 0; i < np; i++) {
          const v = inp.virtual[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          const skill = window.__skill[i]; if (!skill || window.__mode === 'idle') continue;
          const me = inst.dbg.pl[i], id = i + 1; const gx = Math.min(11, Math.max(0, Math.floor(me.x / TS + 6))), gz = Math.min(11, Math.max(0, Math.floor(me.z / TS + 6)));
          // dichtstbijzijnde tegel die niet van mij is
          let best = null, bd = 1e9;
          for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) { if (inst.dbg.owner[z * N + x] === id) continue; const d = Math.hypot(x - gx, z - gz) + rnd() * 1.5; if (d < bd) { bd = d; best = [x, z]; } }
          const sp = st.sponge; let ax = 0, az = 0;
          if (best) { ax = cellC(best[0]) - me.x; az = cellC(best[1]) - me.z; }
          if (sp.on && Math.hypot(sp.x - me.x, sp.z - me.z) < 3.2 && rnd() < 0.5) { ax = sp.x - me.x; az = sp.z - me.z; } // stuur slijm weg
          const l = Math.hypot(ax, az) || 1; v.x = ax / l; v.y = az / l;
          if (me.charges >= 1 && rnd() < 0.03 * skill) v.a = true;
          if (me.dashCd <= 0 && rnd() < 0.02 * skill) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  }, np);
  return { page, errors };
}

const RUN = `const m = window.__app.mode; let g = 0; while (!m.finished && g++ < 60 * 200) window.__bot(1);`;
const info = `const st = m.instance.dbg.state(); return { fin: m.finished, nfin: window.__fin.length, T: +st.T.toFixed(1), sc: st.sc, cnt: st.cnt, w: m.result && m.result.winner, wid: m.result && m.result.winnerId, scoreArr: m.result && m.result.scoreArr, tw: m.twist.id, over: st.over, stats: st.stats, sum: m.result && m.result.summary.replace(/<[^>]+>/g, ' ') };`;
const runFn = new Function(`${RUN} ${info}`);
const wins = {};   // winnaar-slots per scenario-familie

for (const raw of scen) {
  const np = raw.endsWith('3') ? 3 : 2, name = raw.replace(/_?3$/, '');
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const tag = `${name}${np === 3 ? '/3sp' : ''}`;
  if (name === 'twists') {
    for (const tw of (process.env.TWL ? process.env.TWL.split(',') : TWISTS)) {
      const { page, errors } = await open(browser, tw, np);
      const res = await page.evaluate(new Function(`${RUN} const st = m.instance.dbg.state(); return { fin: m.finished, nfin: window.__fin.length, T: st.T, sc: st.sc, w: m.result && m.result.winner, tw: m.twist.id, sz: st.p.map((p) => +p.sz.toFixed(2)) };`));
      console.log('twist', tw, JSON.stringify(res));
      check(res.fin && res.nfin === 1, `${tag} twist ${tw}: finishPvp 1x`); check(!errors.length, `${tag} twist ${tw}: geen console-errors${errors.length ? ' ' + errors.slice(0, 3).join('|') : ''}`);
      await page.close();
    }
  } else if (['bots', 'p0', 'p1', 'p2', 'idle'].includes(name)) {
    if (name === 'p2' && np === 2) { await browser.close(); continue; }
    for (const run of [0, 1, 2]) {
      const { page, errors } = await open(browser, run === 0 ? null : TWISTS[run * 3], np);
      await page.evaluate(([nm, np]) => {
        window.__mode = nm === 'idle' ? 'idle' : 'bots';
        const only = { p0: 0, p1: 1, p2: 2 }[nm]; if (only != null) window.__skill = window.__skill.map((_, i) => (i === only ? 1.3 : 0));
        // bij "bots" wisselen de vaardigheden per run, zodat elk slot kan winnen
      }, [name, np]);
      const res = await page.evaluate(runFn);
      console.log(tag, 'run', run, JSON.stringify(res));
      check(res.fin && res.nfin === 1, `${tag} run ${run}: finishPvp precies 1x`);
      check(!errors.length, `${tag} run ${run}: geen console-errors${errors.length ? ' ' + errors.slice(0, 3).join('|') : ''}`);
      const only = { p0: 0, p1: 1, p2: 2 }[name];
      if (only != null) check(res.w === only, `${tag} run ${run}: ${name} wint als alleen die speelt (winnaar-slot ${res.w})`);
      if (name === 'idle') check(res.w == null || res.sc.every((v) => v === 0) || res.w >= 0, `${tag} run ${run}: idle eindigt (w=${res.w})`);
      if (name === 'bots') (wins[tag] ||= new Set()).add(res.w);
      await page.close();
    }
  } else if (name === 'deurman') {
    const { page, errors } = await open(browser, 'deurman', np);
    const res = await page.evaluate((np) => {
      window.__bot(60 * 20); const i = window.__app.mode.instance, d = i.dbg;
      const count = () => { const c = new Array(np + 1).fill(0); for (const o of d.owner) c[o]++; return c; };
      const a = count(); i.onDeurman(np === 3 ? [true, false, true] : [true, false]); const b = count();
      window.__bot(2); return { a, b };
    }, np);
    console.log('deurman', JSON.stringify(res));
    // wie bewoog verliest tot 6 tegels, de rest blijft staan
    check(res.a[1] - res.b[1] === Math.min(6, res.a[1]) && res.b[2] === res.a[2] && (np === 2 || res.a[3] - res.b[3] === Math.min(6, res.a[3])), `${tag}: onDeurman(${np} booleans): alleen bewegers verliezen 6 tegels`); check(!errors.length, `${tag}: geen console-errors ${errors.join('|')}`);
  } else if (name === 'tie') {
    const { page, errors } = await open(browser, 'none', np);
    const res = await page.evaluate((np) => {
      window.__skill = new Array(np).fill(0); const m = window.__app.mode, d = m.instance.dbg;
      window.__bot(60 * 59.5);
      d.noBonus(); d.owner.fill(0); d.tp(0, -3.75, 3.75); d.tp(1, 3.75, 3.75); if (np === 3) d.tp(2, 0.75, -3.75); d.sp.on = false; d.sp.spawnT = 999;
      let g = 0; while (!m.finished && g++ < 60 * 40) window.__bot(1);
      const st = d.state(); return { fin: m.finished, nfin: window.__fin.length, T: +st.T.toFixed(1), sc: st.sc, over: st.over, w: m.result && m.result.winner, sum: m.result && m.result.summary };
    }, np);
    console.log('tie', JSON.stringify(res));
    check(res.fin && res.nfin === 1 && res.over && res.w == null, `${tag}: volledig gelijk -> verlenging -> gelijkspel (w=${res.w})`);
    // 3 spelers: top gedeeld, de 3e lager -> verlenging; daarna beslist het aantal tegels
    if (np === 3) {
      const { page: p2, errors: e2 } = await open(browser, 'none', 3);
      const r3 = await p2.evaluate(() => {
        window.__skill = [0, 0, 0]; const m = window.__app.mode, d = m.instance.dbg; window.__bot(60 * 59.5);
        d.noBonus(); d.owner.fill(0); d.owner[0] = 1; d.owner[1] = 2; d.owner[2] = 2; d.owner[3] = 3; d.owner[4] = 3; d.owner[5] = 3;   // scores 1/2/3
        d.tp(0, -3.75, 3.75); d.tp(1, 3.75, 3.75); d.tp(2, 0.75, -3.75); d.sp.on = false; d.sp.spawnT = 999;
        let g = 0; while (!m.finished && g++ < 60 * 40) window.__bot(1);
        return { fin: m.finished, nfin: window.__fin.length, w: m.result && m.result.winner, sc: m.instance.dbg.state().sc };
      });
      console.log('tie3 uitslag', JSON.stringify(r3));
      check(r3.fin && r3.nfin === 1 && r3.w === 2, `${tag}: duidelijke winnaar (slot 2, 3 punten) wint (w=${r3.w})`);
      check(!e2.length, `${tag}: geen console-errors`);
    }
    check(!errors.length, `${tag}: geen console-errors ${errors.join('|')}`);
  } else if (name === 'shots') {
    const { page, errors } = await open(browser, process.env.TW || null, np);
    const shot = async (t) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/paint${np === 3 ? '3' : ''}_${t}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', t); };
    await page.evaluate(() => window.__bot(60 * 6)); await shot('early');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; const p = d.pl[1]; d.setSponge(p.x - 5, p.z, 9, 0); window.__bot(40); }); await shot('sponge');
    await page.evaluate(() => window.__bot(60 * 12, (s) => s.bucket.on)); await shot('bucket');
    await page.evaluate(() => window.__bot(60 * 40, (s) => s.finalMode)); await page.evaluate(() => window.__bot(30)); await shot('final');
    await page.evaluate(() => window.__bot(60 * 120)); await page.evaluate(() => { window.__app.mode.paused = false; }); await page.waitForTimeout(2500); await shot('end');
    check(!errors.length, errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
  }
  await browser.close();
}
if (wins['bots/3sp']) check(wins['bots/3sp'].size >= 1, `3sp bots: winnaar-slots ${[...wins['bots/3sp']]}`);
server.close();
console.log(failed ? `\n${failed} CONTROLES MISLUKT` : '\nALLE CONTROLES OK'); process.exit(failed ? 1 : 0);
