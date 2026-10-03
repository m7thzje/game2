// Gebruik: node tools/test_deurenrace.mjs [scenario...]   scenario: bots | twists | idle | timeout | hooks | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp PRECIES één keer komt, dat beide spelers kunnen winnen,
// dat elke twist werkt en dat er geen console-fouten zijn.
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
let failed = 0; const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) failed++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=deurenrace&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // finishPvp-teller: telt elke aanroep vanuit de game
    window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: kans dat hij de goede deur kiest (0..1), copy: kans dat hij kijkt naar de markeringen in de baan van de ander, style: 'run'|'idle', dive: kans op duik }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4711; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ tgt: {}, wait: 0, mash: 0 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.P[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          (() => {
          if (c.style === 'idle' || me.done) return;
          const row = me.row, w = st.rows[row];
          if (me.signT > 0) { b.mash += dt; if (b.mash > 0.18) { b.mash = 0; v.a = true; } return; }
          if (me.stunT > 0) return;
          if (!w) { v.y = -1; return; }
          const lane = st.doors[i][row], other = st.doors[1 - i][row];
          // doelkeuze (opnieuw na elke misser)
          const known = (d) => lane[d].marked || (c.copy && rnd() < 0 ? false : (c.copy && other[d].marked));
          let t = b.tgt[row];
          if (t == null || (lane[t].marked && !lane[t].pass)) {
            const open = lane.map((_, d) => d).filter((d) => !lane[d].marked && !(c.copy && other[d].marked));
            const real = lane.findIndex((d) => d.real), copied = c.copy && other[real] && other[real].pass;
            t = (copied || rnd() < c.skill) ? real : (open.length ? open[Math.floor(rnd() * open.length)] : real);
            b.tgt[row] = t;
          }
          void known;
          const d = lane[t], dx = d.cx - me.x, dz = me.z - (w.z + 0.4 + me.rad);
          if (Math.abs(dx) > 0.3) v.x = Math.sign(dx) * Math.min(1, Math.abs(dx) / 0.6);
          if (Math.abs(dx) < 0.6) v.y = -1; else if (dz > 2.2) v.y = -0.6;
          if (!d.pass && Math.abs(dx) < 0.5 && dz < 0.9 && me.chargeCd <= 0) { b.wait -= dt; if (b.wait <= 0) { v.a = true; b.wait = 0.15 + rnd() * 0.25; } }
          if (st.sandbags > 0 && me.diveCd <= 0 && rnd() < c.dive) v.b = true;
          })();
          if (m.twist.id === 'swapab') { const t2 = v.a; v.a = v.b; v.b = t2; }
          if (m.twist.id === 'invert') { v.x = -v.x; v.y = -v.y; }
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
    const bs = (a, b) => [{ skill: a, copy: 0.0, style: 'run', dive: 0.3 }, { skill: b, copy: 0.0, style: 'run', dive: 0.3 }];
    const list = name === 'twists' ? TWISTS.map((t) => [t, bs(0.7, 0.55)])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ style: 'idle' }, { style: 'idle' }]], ['none', [{ skill: 0.2, style: 'run' }, { style: 'idle' }]]]
          : [[process.env.TW || 'none', bs(0.9, 0.35)], [process.env.TW || 'none', bs(0.35, 0.9)], [process.env.TW || 'none', [{ skill: 0.5, copy: 1, style: 'run', dive: 0.3 }, { skill: 0.5, copy: 1, style: 'run', dive: 0.3 }]], [process.env.TW || 'none', bs(0.6, 0.6)]];
    const wins = [0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout' || name === 'idle') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(name === 'idle' ? 4 : 6); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
        while (!m.finished && g++ < 60 * 130) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = st.P.map((p) => p.row).join('-');
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} rijen=${key} z=${st.P.map((p) => p.z.toFixed(0))} wrong=${st.P.map((p) => p.wrong)} items=${st.P.map((p) => p.items)}`); last = key; }
        }
        for (let k = 0; k < 150; k++) window.__bot(1);      // na afloop: nog steeds precies één finishPvp?
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin.length, twist: m.twist.id };
      });
      if (process.env.V) console.log(res.log.join('\n'));
      console.log(`\n=== ${name} twist=${res.twist} T=${res.st.T.toFixed(1)} rijen=${res.st.P.map((p) => p.row)} done=${res.st.P.map((p) => p.done)} nepdeuren=${res.st.stats.wrong} items=${res.st.stats.items} kip=${res.st.stats.kip} taart=${res.st.stats.taart} hand=${res.st.stats.sign} zand=${res.st.stats.sand} boem=${res.st.stats.boom} peeks=${res.st.stats.peeks}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ').slice(0, 150)}`);
      check(res.finished && res.fin === 1, `finishPvp precies één keer (aantal=${res.fin}, finished=${res.finished})`);
      check(res.result && res.result.winner != null, 'er is een winnaar');
      check(!errors.length, 'geen console-fouten' + (errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''));
      if (res.result && res.result.winner != null) wins[res.result.winner]++;
      await browser.close();
    }
    if (name === 'bots') { console.log('winsten per speler', wins); check(wins[0] > 0 && wins[1] > 0, 'beide spelers kunnen winnen'); }
    if (name === 'twists') console.log('winsten per speler', wins);
    continue;
  }
  if (name === 'hooks') {
    // losse controles: items, kijkhoofd, handtekening, zandzak, onDeurman, nepdeuren-effecten
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    const r = await page.evaluate(() => {
      const m = window.__app.mode, inst = m.instance, d = inst.dbg, out = {};
      const st0 = d.state(); out.rows = st0.rows.length;
      // 1. echte deur openen en erdoor lopen
      const w0 = st0.rows[0]; const real = w0.real, cx = st0.doors[0][0][real].cx;
      d.put(0, w0.z + 2, 0); window.__app.input.virtual[0].a = false;
      const v = window.__app.input.virtual[0]; const inp = window.__app.input;
      const step = (n, f) => { m.paused = false; for (let k = 0; k < n; k++) { f && f(k); inp.update(); m.update(1 / 60); } m.paused = true; };
      step(120, () => { const s = d.state().P[0]; v.x = Math.max(-1, Math.min(1, (cx - s.x) * 3)); v.y = Math.abs(cx - s.x) < 0.4 ? -1 : 0; v.a = false; });
      step(2, () => { v.a = true; }); step(2, () => { v.a = false; });
      step(60, () => { v.x = 0; v.y = -1; });
      out.passRow0 = d.state().P[0].row;
      // 2. nepdeuren: elk type effect
      const effects = {};
      for (const [t, name] of [['boom'], ['kip'], ['taart'], ['deurman'], ['slot']].map((x) => [x[0], x[0]])) {
        const s = d.state(); const row = s.P[1].row; let dd = s.rows[row].fakes.findIndex((f) => f === t);
        if (dd < 0) { // forceer: zoek in rijen
          continue;
        }
        d.hit(1, dd); const q = d.state().P[1]; effects[t] = { stun: +q.stunT.toFixed(2), sign: +q.signT.toFixed(2) };
        step(240, () => { v.x = 0; });
        inp.virtual[1].a = false;
      }
      out.effects = effects;
      // 3. items
      d.give(0, 'kijk'); out.kijk = +d.state().P[0].kijkT.toFixed(1);
      d.give(0, 'turbo'); out.turbo = +d.state().P[0].turboT.toFixed(1);
      d.give(0, 'zand'); out.sandbags = d.state().sandbags;
      step(120, () => {}); out.sandAfter = d.state().sandbags; out.p1stun = d.state().P[1].stunT;
      // 4. kijkhoofd
      d.peek(0); step(30, () => {}); out.peek = d.state().stats.peeks;
      // 5. onDeurman
      inst.onDeurman([true, false]); out.deurmanStun = +d.state().P[0].stunT.toFixed(2);
      return out;
    });
    console.log(JSON.stringify(r));
    check(r.passRow0 >= 1, 'echte deur openen en erdoor lopen');
    check(r.kijk > 4 && r.turbo > 3 && r.sandbags === 1 && r.sandAfter === 0, 'items: kijkgat, turbo, zandzak');
    check(r.deurmanStun > 1, 'onDeurman straft de beweger');
    check(!errors.length, 'geen console-fouten' + (errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''));
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.75, copy: 0.5, style: 'run', dive: 0.3 }, { skill: 0.6, copy: 0.5, style: 'run', dive: 0.3 }]);
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/dr_${tag}.png` }); const s = await page.evaluate(() => { const d = window.__app.mode.instance.dbg.state(); return { T: +d.T.toFixed(1), rows: d.P.map((p) => p.row), z: d.P.map((p) => +p.z.toFixed(1)) }; }); console.log('shot', tag, JSON.stringify(s)); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(30)); await snap('start');
    await go('s.P[0].row>=1 && s.P[0].z<-12', 60 * 40); await snap('row1');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'kijk'); d.give(1, 'turbo'); }); await page.evaluate(() => window.__bot(20)); await snap('items');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'zand'); }); await page.evaluate(() => window.__bot(35)); await snap('sandbag');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.peek(0); d.peek(1); }); await page.evaluate(() => window.__bot(40)); await snap('peek');
    await page.evaluate(() => { window.__cfg[1].style = 'idle'; });
    for (const t of ['boom', 'kip', 'taart', 'deurman', 'slot']) {
      const ok = await page.evaluate((t) => {
        const d = window.__app.mode.instance.dbg, s = d.state(); const r = s.rows.findIndex((x, i) => i >= s.P[1].row && x.fakes.includes(t)); if (r < 0) return false;
        d.put(1, s.rows[r].z + 2.6, r); window.__bot(40); const st = d.state(); d.hit(1, st.rows[r].fakes.findIndex((f) => f === t)); window.__bot(14); return true;
      }, t);
      if (ok) await snap('fx_' + t); else console.log('geen rij met', t);
    }
    await page.evaluate(() => { window.__cfg[1].style = 'run'; });
    await go('s.P[0].row>=6', 60 * 120); await snap('mid');
    await go('s.finished || s.P[0].row>=9 || s.P[1].row>=9', 60 * 200); await snap('late');
    await go('s.finished', 60 * 100); await page.evaluate(() => window.__bot(60)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(failed ? `\n${failed} CHECK(S) FAALDEN` : '\nALLES OK');
server.close();
process.exit(failed ? 1 : 0);
