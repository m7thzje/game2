// Gebruik: node tools/test_dance.mjs [scenario...]   scenario: bots | twists | idle | tie | sabotage | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) het hele nummer; controleert dat finishPvp precies 1x komt, beide spelers kunnen winnen, geen console-errors.
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
const check = (ok, msg) => { if (!ok) { fails++; console.log('  FAIL: ' + msg); } else console.log('  ok: ' + msg); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=dance&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    window.__fin = 0; const orig = mode.finishPvp.bind(mode); mode.finishPvp = (r) => { window.__fin++; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { style:'play'|'idle', sigma: tijdsruis (s), miss: kans dat een pijl wordt overgeslagen, sab: kans om A te drukken bij volle meter, shield: kans dat een aankomende bol wordt geschilderd }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    window.__cfg = cfg; const plan = [null, null];
    const KEY = ['left', 'down', 'up', 'right'];
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 0.7;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        const orbs = d.orbsInfo();
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i]; for (const kk of ['left', 'right', 'up', 'down', 'a', 'b']) v[kk] = false;
          if (c.style === 'idle' || st.finished || st.ending) continue;
          const nx = d.next(i);
          if (nx) {
            if (!plan[i] || plan[i].i !== nx.i) plan[i] = { i: nx.i, off: gauss() * c.sigma, skip: rnd() < c.miss };
            if (!plan[i].skip && st.songT >= nx.t + plan[i].off && st.songT < nx.t + 0.3) { v[KEY[nx.d]] = true; plan[i].skip = true; }
          }
          if (st.meter[i] >= 100 && rnd() < (c.sab ?? 0) * 0.05) v.a = true;
          if ((c.shield ?? 0) > 0 && orbs.some((o) => o.to === i && o.t > 0.45 && o.t < 0.7) && rnd() < c.shield * 0.4) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function runMatch(twist, cfg, setup) {
  const { browser, page, errors } = await open(twist);
  await installBots(page, cfg);
  if (setup) await page.evaluate(setup);
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let g = 0, lastS = -1;
    while (!m.finished && g++ < 60 * 200) {
      window.__bot(30);
      const st = inst.dbg.state(); if (Math.floor(st.songT / 10) !== lastS) { lastS = Math.floor(st.songT / 10); log.push(`songT=${st.songT.toFixed(1)} score=${st.score} combo=${st.combo} meter=${st.meter} orbs=${st.orbs} sab=${st.sab.map((x) => x.id)}`); }
    }
    for (let k = 0; k < 120; k++) { window.__app.input.update(); m.update(1 / 60); }
    return { log, st: inst.dbg.state(), finished: m.finished, fin: window.__fin, result: m.result, twist: m.twist.id };
  });
  await browser.close();
  return { res, errors };
}
function report(name, { res, errors }) {
  console.log(`\n=== ${name} twist=${res.twist} ===`);
  console.log(res.log.join('\n'));
  const s = res.st;
  console.log(`end songT=${s.songT.toFixed(1)} score=${s.score} perfect=${s.perfects} good=${s.goods} miss=${s.misses} maxCombo=${s.maxCombo} gold=${s.golds} sabs=${s.sabSent} reflects=${s.reflects} blocks=${s.blocks}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  check(res.fin === 1, 'finishPvp precies 1x');
  check(res.result && res.result.winner !== null, 'er is een winnaar');
  check(errors.length === 0, errors.length ? 'console-errors:\n' + errors.slice(0, 6).join('\n') : 'geen console-errors');
}
const GOOD = { sigma: 0.045, miss: 0.04, sab: 1, shield: 0.5 }, OK = { sigma: 0.09, miss: 0.2, sab: 1, shield: 0.3 }, BAD = { sigma: 0.15, miss: 0.5, sab: 1, shield: 0 };

for (const name of scen) {
  if (name === 'bots') {
    const wins = [0, 0];
    for (const cfg of [[GOOD, BAD], [BAD, GOOD], [OK, OK]]) { const r = await runMatch(process.env.TW || 'none', cfg); report('bots', r); if (r.res.result) wins[r.res.result.winner]++; }
    console.log('winsverdeling [Wes,Jor]:', wins); check(wins[0] > 0 && wins[1] > 0, 'beide spelers kunnen winnen'); continue;
  }
  if (name === 'twists') { for (const tw of TWISTS) report('twist', await runMatch(tw, [OK, OK])); continue; }
  if (name === 'idle') { const r = await runMatch('none', [{ style: 'idle' }, { style: 'idle' }]); report('idle', r); check(r.res.st.songT > 70, 'nummer liep helemaal door'); continue; }
  if (name === 'tie') { const r = await runMatch('none', [{ style: 'idle' }, { style: 'idle' }]); report('gelijkspel (0-0) -> tiebreak', r); check(r.res.st.score[0] === r.res.st.score[1], 'stand was gelijk'); continue; }
  if (name === 'sabotage') {
    // bot 1 schildt altijd; bot 0 stuurt sabotage met een volle meter. Controleert bollen, terugkaatsen en effecten.
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ ...GOOD, shield: 0 }, { ...GOOD, shield: 1 }]);
    const r = await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg, seen = new Set(); let refl = 0, applied = 0;
      d.setMeter(0, 100); d.setMeter(1, 100);
      for (let g = 0; g < 60 * 70 && !window.__app.mode.finished; g++) { window.__bot(1); const s = d.state(); for (const sb of s.sab) if (sb.id) seen.add(sb.id); if (g % 300 === 0) { d.setMeter(0, 100); d.setMeter(1, 100); } if (s.songT > 40) break; }
      const s = d.state(); return { seen: [...seen], sabSent: s.sabSent, reflects: s.reflects, blocks: s.blocks };
    });
    console.log('sabotage', JSON.stringify(r)); check(r.sabSent[0] + r.sabSent[1] > 0, 'sabotages verstuurd'); check(r.seen.length > 0, 'sabotage-effect actief gezien'); check(r.reflects[0] + r.reflects[1] > 0, 'schild kaatste terug');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS'); fails += errors.length ? 1 : 0; await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ ...GOOD }, { ...OK }]);
    const snap = async (tag) => { await page.waitForTimeout(600); await page.screenshot({ path: `/tmp/dn_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { t: +s.songT.toFixed(1), score: s.score, combo: s.combo, meter: s.meter }; }))); };
    const go = (cond, max = 60 * 90) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await go('s.songT>6'); await snap('early');
    await go('s.songT>22'); await snap('mid');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setMeter(0, 100); d.setMeter(1, 100); });
    await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = true; i.update(); window.__app.mode.paused = false; window.__app.mode.update(1 / 60); i.virtual[0].a = false; window.__app.mode.paused = true; });
    await page.evaluate(() => window.__bot(35)); await snap('orb');
    await page.evaluate(() => window.__bot(60)); await snap('hit');
    for (const id of []) void id;
    await go('s.songT>50'); await snap('late');
    await go('s.finished', 60 * 100); await page.evaluate(() => { for (let k = 0; k < 70; k++) { window.__app.input.update(); window.__app.mode.update(1 / 60); } }); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); await browser.close(); continue;
  }
}
console.log(fails ? `\n${fails} CHECK(S) MISLUKT` : '\nALLE CHECKS OK');
server.close();
