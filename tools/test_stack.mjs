// Gebruik: node tools/test_stack.mjs [scenario...]   scenario: bots | twists | idle | timeout | collapse | shots
//   TW=<twist-id> kiest een twist. Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes. Controleert: finishPvp precies 1x, beide spelers kunnen winnen, geen console-errors, elke twist werkt.
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
const TWISTS = ['none', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=stack&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
    // finishPvp-aanroepen tellen
    window.__fin = 0; const ctx = mode.ctx, orig = ctx.finishPvp; ctx.finishPvp = (r) => { window.__fin++; return orig(r); };
  });
  return { browser, page, errors };
}

// cfg[i] = { err: dropfout in blokken (0 = perfect), power: kans per frame dat een power-up wordt gebruikt, idle }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ aim: 0, prev: null, lastSpawn: -1 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      const tid = m.twist.id;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const v of inp.virtual) { v.a = false; v.b = false; v.x = 0; v.y = 0; }
        for (const j of [0, 1]) {       // j = speler wiens kraan we sturen
          const c = window.__cfg[j], p = st.p[j], b = B[j]; if (c.idle) continue;
          const vi = m.swapped ? 1 - j : j; const v = inp.virtual[vi];
          const A = tid === 'swapab' ? 'b' : 'a', Bk = tid === 'swapab' ? 'a' : 'b';
          if (p.state === 'swing' && p.spawnT > 0.2) {
            if (b.lastSpawn !== p.floors + ':' + p.hw.toFixed(2)) { b.lastSpawn = p.floors + ':' + p.hw.toFixed(2); b.aim = (rnd() - 0.5) * 2 * c.err; b.prev = null; }
            const d = p.cx - (p.topX + b.aim);
            if (b.prev !== null && (Math.sign(d) !== Math.sign(b.prev) || Math.abs(d) < 0.08)) v[A] = true;
            b.prev = d;
          } else b.prev = null;
          if (p.power && rnd() < (c.power ?? 0.02) && p.state !== 'dead') v[Bk] = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}
const BOT = (err, power = 0.03, extra = {}) => ({ err, power, ...extra });

for (const name of scen) {
  if (['bots', 'twists', 'timeout', 'idle', 'collapse', 'sd'].includes(name)) {
    const list = name === 'twists' ? TWISTS.map((t) => [t, [BOT(0.5), BOT(0.7)], null])
      : name === 'idle' ? [['none', [{ idle: true }, { idle: true }], 'idle']]
        : name === 'collapse' ? [['none', [BOT(0.3), { idle: true }], 'p0'], ['none', [{ idle: true }, BOT(0.3)], 'p1']]
          : name === 'sd' ? [['none', [BOT(0.0), BOT(0.0)], 'sd']]
            : name === 'timeout' ? [['none', [BOT(0.6), BOT(0.6)], 'timeout']]
              : [
                [process.env.TW || 'none', [BOT(0.25), BOT(1.4)], 'p0'],
                [process.env.TW || 'none', [BOT(1.4), BOT(0.25)], 'p1'],
                [process.env.TW || 'none', [BOT(0.6), BOT(0.6)], null],
              ];
    for (const [tw, cfg, expect] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'timeout') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(6); });
      if (name === 'sd') await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(5); });
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0; let maxF = [0, 0];
        while (!m.finished && g++ < 60 * 400) {
          window.__bot(1);
          const st = inst.dbg.state(); maxF = [Math.max(maxF[0], st.p[0].floors), Math.max(maxF[1], st.p[1].floors)];
          const key = st.g + ':' + st.p.map((p) => p.floors + p.state).join('/');
          if (st.g !== last) { log.push(`T=${st.T.toFixed(1)} ${st.g} floors=${st.p.map((p) => p.floors)} loser=${st.loser}`); last = st.g; }
        }
        for (let k = 0; k < 240; k++) { window.__bot(1); }     // na afloop nog even doorlopen: mag niet dubbel eindigen
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin, maxF };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} floors=${st.p.map((p) => p.floors)} max=${res.maxF} perfects=${st.p.map((p) => p.perfects)} gulls=${st.stats.gulls} sabs=${st.stats.sabs} powers=${st.stats.powers} sands=${st.stats.sands} collapses=${st.stats.collapses} sdRound=${st.sdRound}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      check(res.finished && res.fin === 1, `finishPvp precies 1x (aantal=${res.fin}) [${name}/${tw}]`);
      check(res.result && (res.result.winner === 0 || res.result.winner === 1), `er is een winnaar [${name}/${tw}]`);
      if (expect === 'p0') check(res.result.winner === 0, 'goede bot 0 wint');
      if (expect === 'p1') check(res.result.winner === 1, 'goede bot 1 wint');
      check(errors.length === 0, `geen console-errors [${name}/${tw}]${errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''}`);
      await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [BOT(0.2, 0.0), BOT(0.2, 0.0)]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/stack_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.g, f: s.p.map((p) => p.floors), c: s.p.map((p) => p.combo), pw: s.p.map((p) => p.power) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(240)); await snap('play');
    await go('s.p[0].combo>=3||s.p[1].combo>=3'); await page.evaluate(() => window.__bot(12)); await snap('combo');
    await go('s.p[0].floors>=14&&s.p[1].floors>=12'); await page.evaluate(() => window.__bot(30)); await snap('tall');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.give(0, 'sand'); d.give(1, 'glue'); });
    await page.evaluate(() => { window.__cfg[0].power = 1; window.__bot(30); window.__cfg[0].power = 0; }); await snap('sand');
    await page.evaluate(() => { window.__app.mode.instance.dbg.startGull(); window.__bot(120); }); await snap('gull');
    await page.evaluate(() => { window.__app.mode.instance.dbg.sabotage(0); window.__bot(40); }); await snap('sab');
    await page.evaluate(() => { window.__cfg[0].err = 3; window.__cfg[1].err = 0.1; }); await go('s.g==="collapse"', 60 * 120); await page.evaluate(() => window.__bot(30)); await snap('collapse');
    await page.evaluate(() => window.__bot(100)); await snap('collapse2');
    await go('s.finished', 60 * 30); await page.evaluate(() => window.__bot(30)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
console.log(fails.length ? `\n${fails.length} MISLUKT` : '\nALLES OK');
process.exit(fails.length ? 1 : 0);
