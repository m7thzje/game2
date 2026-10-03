// Gebruik: node tools/test_deurzegt.mjs [scenario...]   scenario: bots | twists | timeout | idle | sd | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp precies 1x komt, beide spelers kunnen winnen,
// er geen console-errors zijn en dat elke twist uit `twists` werkt. Exitcode 1 bij een mislukte controle.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const GAME = 'deurzegt';
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
const TWISTS = ['none', 'invert', 'swapab', 'turbo', 'slowmo', 'giant', 'lowgrav', 'bodyswap', 'deurman'];   // = `twists` van de game (+ none)
let failures = 0; const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) failures++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=${GAME}&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
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
    window.__fin = 0; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin++; return orig(r); };
  });
  return { browser, page, errors };
}

// cfg[i] = { delay, jitter (s), err (kans op fout antwoord), trapErr (kans dat hij in een val trapt), style: 'idle' | 'play' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const KEY = { A: 'a', B: 'b', L: 'left', R: 'right', U: 'up', D: 'down' }; const ALL = ['a', 'b', 'left', 'right', 'up', 'down'];
    const B = [0, 1].map(() => ({ key: '', at: 0, hold: 0, cool: 0, move: null, doPress: true }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i];
          if (b.hold > 0) { b.hold--; if (b.hold === 0) { for (const a of ALL) v[a] = false; b.cool = 2; } continue; }
          if (b.cool > 0) { b.cool--; continue; }
          for (const a of ALL) v[a] = false;
          if (c.style === 'idle' || st.gstate !== 'win' || st.done[i]) { if (st.gstate !== 'win') b.key = ''; continue; }
          const need = st.expect.length ? st.expect[st.idx[i]] : null;
          const key = st.round + ':' + st.idx[i];
          if (b.key !== key) {   // nieuw doel: kies reactietijd en eventuele fout
            b.key = key; b.at = c.delay + rnd() * c.jitter;
            if (need) { b.doPress = true; b.move = rnd() < c.err ? ['A', 'B', 'L', 'R', 'U', 'D'].filter((x) => x !== need)[Math.floor(rnd() * 5)] : need; }
            else { b.doPress = rnd() < c.trapErr; b.move = ['A', 'B', 'L', 'R', 'U', 'D'][Math.floor(rnd() * 6)]; b.at = 0.3 + rnd() * 0.8; }
          }
          if (b.doPress && st.t >= b.at) { v[KEY[b.move]] = true; b.hold = 2; b.doPress = false; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const strong = { delay: 0.3, jitter: 0.25, err: 0.02, trapErr: 0.03, style: 'play' };
const weak = { delay: 0.55, jitter: 0.45, err: 0.12, trapErr: 0.2, style: 'play' };
const mid = { delay: 0.42, jitter: 0.35, err: 0.06, trapErr: 0.1, style: 'play' };
const perfect = { delay: 0.12, jitter: 0.05, err: 0, trapErr: 0, style: 'play' };

async function runMatch(name, tw, cfg, pre) {
  const { browser, page, errors } = await open(tw);
  await installBots(page, cfg);
  if (pre) await page.evaluate(pre);
  if (name === 'twists') await page.evaluate(() => { window.__bot(600); const i = window.__app.mode.instance; i.onDeurman([true, false]); i.onSwap(true); i.onDeurman([false, true]); i.onSwap(false); });   // twist-hooks ook echt aanroepen
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < 60 * 300) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.hearts.join('') + ':' + st.sd;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} r${st.round} ${st.type} hearts=${st.hearts} pts=${st.pts} clock=${st.clock.toFixed(0)} sd=${st.sd}`); last = key; }
    }
    // laat de harness het eindscherm afhandelen en tel finishPvp nog eens na een paar extra frames
    for (let k = 0; k < 120; k++) { window.__app.input.update(); m.update(1 / 60); }
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin };
  });
  console.log(`\n=== ${name} twist=${res.twist} ===`);
  console.log(res.log.slice(0, 40).join('\n'));
  const st = res.st;
  console.log(`end T=${st.T.toFixed(1)} rounds=${st.round} pts=${st.pts} hearts=${st.hearts} why=${st.why} finished=${res.finished} fin-calls=${res.fin} perfect=${st.stats.perfect}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
  await browser.close();
  check(res.finished && res.fin === 1, `${name}/${res.twist}: finishPvp precies 1x (calls=${res.fin})`);
  check(errors.length === 0, `${name}/${res.twist}: geen console-errors`);
  return { res, errors };
}

const winners = new Set();
for (const name of scen) {
  if (name === 'bots') {
    for (const cfg of [[strong, weak], [weak, strong], [mid, mid]]) {
      const { res } = await runMatch('bots', process.env.TW || 'none', cfg);
      if (res.result && res.result.winner != null) winners.add(res.result.winner);
    }
    check(winners.has(0) && winners.has(1), `beide spelers kunnen winnen (winnaars: ${[...winners]})`);
    continue;
  }
  if (name === 'twists') {
    for (const tw of TWISTS) { const { res } = await runMatch('twists', tw, [mid, mid]); check(res.result && res.result.winner != null, `twist ${tw}: er is een winnaar`); }
    continue;
  }
  if (name === 'idle') { const { res } = await runMatch('idle', 'none', [{ style: 'idle' }, { style: 'idle' }]); check(res.result.winner != null, 'idle: toch een winnaar (' + res.st.why + ')'); continue; }
  if (name === 'timeout') {   // perfecte spelers: niemand valt af, tijd loopt af -> punten / sudden death
    const { res } = await runMatch('timeout', 'none', [perfect, perfect], () => { window.__app.mode.instance.dbg.setTime(10); });
    check(res.result.winner != null, 'timeout: er is een winnaar (' + res.st.why + ')'); continue;
  }
  if (name === 'sd') {   // gelijke stand op tijd 0: sudden death en daarna beslissing
    const { res } = await runMatch('sd', 'none', [perfect, perfect], () => { const d = window.__app.mode.instance.dbg; d.setTime(0.5); d.setPts(5, 5); });
    check(res.result.winner != null, 'sd: er is een winnaar (' + res.st.why + ')'); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [mid, mid]);
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/dz_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.gstate, r: s.round, type: s.type, pts: s.pts, hearts: s.hearts }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await go('s.gstate==="win" && s.round>=1'); await page.evaluate(() => window.__bot(14)); await snap('win');
    await go('s.gstate==="fb"'); await page.evaluate(() => window.__bot(10)); await snap('fb');
    for (const t of ['trap', 'mirror', 'combo', 'chicken', 'sleep', 'not']) {
      await page.evaluate((t) => { const d = window.__app.mode.instance.dbg; d.queue(t); d.setRound(9); }, t);
      await go(`s.gstate==="win" && s.type==="${t}"`, 60 * 30); await page.evaluate(() => window.__bot(8)); await snap(t);
    }
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setHearts(1, 3); d.setPts(2, 14); });
    await page.evaluate(() => window.__bot(30)); await snap('comeback');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setHearts(0, 2); });
    await go('s.gstate==="end"', 60 * 60); await page.evaluate(() => window.__bot(40)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); check(errors.length === 0, 'shots: geen console-errors');
    await browser.close(); continue;
  }
}
server.close();
console.log(failures ? `\n${failures} controle(s) MISLUKT` : '\nAlle controles OK');
process.exit(failures ? 1 : 0);
