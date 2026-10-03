// Gebruik: node tools/test_kalaha.mjs [scenario...]   scenario: rules | bots | twists | idle | timeout | events | shots
//   TW=<twist-id> kiest een twist. Q=low|high kwaliteit.
// rules: pure Kalaha-regels in node (conserveert stenen, einde, extra beurt, vangst). De rest draait de echte game in headless chromium
// met bots die via de virtuele invoer spelen (versneld, zonder renderen) en controleren: finishPvp precies 1x, beide spelers kunnen winnen,
// visuele telling == logische stand bij elke beurt, geen console-errors.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['rules', 'bots'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'lowgrav', 'bodyswap', 'deurman'];
let fails = 0; const FAIL = (m) => { fails++; console.log('FAIL: ' + m); };

// ---------------- pure regels ----------------
if (scen.includes('rules')) {
  const R = await import(path.join(root, 'src/games/kalaha_rules.js'));
  let rs = 1; const rnd = () => { rs = (rs * 1664525 + 1013904223) >>> 0; return rs / 4294967296; };
  // handgemaakte gevallen
  let r = R.applyMove([4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0], 0, 2);   // 4 stenen vanaf kuiltje 2 -> eindigt in 6 (schatkamer): extra beurt
  if (!r.extra || r.pits[6] !== 1) FAIL('extra beurt');
  r = R.applyMove([0, 0, 0, 1, 0, 0, 5, 4, 3, 2, 5, 4, 0, 6], 0, 3);       // 1 steen van 3 -> 4 (leeg), opposite 8 heeft 3 => vangst 4
  if (!r.capture || r.capture.n !== 4 || r.pits[6] !== 9 || r.pits[4] !== 0 || r.pits[8] !== 0) FAIL('vangst ' + JSON.stringify(r));
  r = R.applyMove([0, 0, 0, 1, 0, 0, 5, 4, 0, 2, 5, 4, 4, 6], 0, 3);       // opposite leeg -> geen vangst
  if (r.capture) FAIL('vangst met lege overkant');
  const path1 = R.sowPath([0, 0, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0], 0, 5); // 9 stenen vanaf 5, overslaan 13
  if (path1.includes(13) || path1.length !== 9 || path1[0] !== 6) FAIL('overslaan ' + path1);
  const path2 = R.sowPath([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 0, 0], 1, 11); if (path2.includes(6)) FAIL('overslaan 6');
  // willekeurige potjes
  let games = 0, maxMoves = 0, wins = [0, 0, 0], bad = 0, caps = 0, extras = 0;
  for (let g = 0; g < 3000; g++) {
    let pits = R.newPits(4), p = g % 2, n = 0; const sk = [rnd(), rnd()];
    while (n++ < 600) {
      const mv = R.botMove(pits, p, rnd, sk[p]); if (mv < 0) { bad++; break; }
      const res = R.applyMove(pits, p, mv); pits = res.pits; if (res.capture) caps++; if (res.extra) extras++;
      if (pits.reduce((a, b) => a + b, 0) !== 48 || pits.some((x) => x < 0)) { bad++; break; }
      if (res.ended) break;
      p = res.extra ? p : 1 - p;
    }
    if (n >= 600) bad++;
    const t = R.finalTotals(pits); if (t[0] + t[1] !== 48) bad++;
    wins[t[0] === t[1] ? 2 : t[0] > t[1] ? 0 : 1]++; maxMoves = Math.max(maxMoves, n); games++;
  }
  console.log(`rules: ${games} potjes, winst Wes/Jor/gelijk = ${wins}, max zetten ${maxMoves}, vangsten ${caps}, extra beurten ${extras}, fouten ${bad}`);
  if (bad) FAIL('regels: invarianten geschonden'); if (!wins[0] || !wins[1]) FAIL('regels: niet beide spelers winnen');
}

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=kalaha&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // finishPvp tellen
    window.__fin = 0; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin++; window.__finRes = r; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1, think: seconden bedenktijd (max), thief: kans per beurt, style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate(async (cfg) => {
    const R = await import('/src/games/kalaha_rules.js');
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4711; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const tw = m.twist.id; const flipX = tw === 'invert', swapAB = tw === 'swapab';
    const B = [0, 1].map(() => ({ seq: -1, target: -1, wait: 0, thief: false, tog: 0 }));
    window.__cfg = cfg; window.__mism = 0; window.__turns = 0;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) { const v = inp.virtual[i]; v.a = false; v.b = false; v.x = 0; v.y = 0; }
        if (tw === 'deurman' && st.T > (window.__nextDeur ??= 15)) { window.__nextDeur = st.T + 12; inst.onDeurman([rnd() < 0.6, rnd() < 0.6]); }
        if (st.phase === 'choose' && !st.auto) {
          const i = st.turn, c = window.__cfg[i], b = B[i];
          if (b.seq !== st.turnSeq) {
            b.seq = st.turnSeq; b.wait = Math.floor(rnd() * (c.think ?? 3) * 60); b.target = R.botMove(st.pits, i, rnd, c.skill ?? 0.8); b.thief = rnd() < (c.thief ?? 0.3) && !st.thiefUsed[i]; window.__turns++;
            const bad = inst.dbg.check(); if (bad.length) { window.__mism++; window.__lastBad = bad.join(','); }
          }
          if (c.style !== 'idle') {
            const vi = m.swapped ? 1 - i : i; const v = inp.virtual[vi];
            if (b.wait > 0) b.wait--;
            else if (b.thief && st.pits[12 - st.sel[i]] > 0) { b.thief = false; if (swapAB) v.a = true; else v.b = true; }
            else if (st.sel[i] !== b.target) {
              // links/rechts op het scherm: Wes kuiltjes 0..5 staan van rechts naar links, Jor van links naar rechts
              const want = (i === 0 ? (b.target < st.sel[i] ? 1 : -1) : (b.target > st.sel[i] ? 1 : -1)); b.tog ^= 1;
              if (b.tog) v.x = want * (flipX ? -1 : 1);
            } else { if (swapAB) v.b = true; else v.a = true; }
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function playMatch(name, tw, cfg, preset) {
  const { browser, page, errors } = await open(tw);
  await installBots(page, cfg);
  if (preset) await page.evaluate(preset);
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let g = 0, lastP = '';
    while (!m.finished && g++ < 60 * 400) {
      window.__bot(1); const st = inst.dbg.state();
      const key = st.phase; if (key !== lastP && ['sweep', 'end', 'event'].includes(key)) { log.push(`T=${st.T.toFixed(1)} ${key} pits=${st.pits.join(',')} left=${st.timeLeft.toFixed(1)}`); }
      lastP = key;
    }
    // laat de resultaatkaart-timer/afronding lopen
    for (let k = 0; k < 120; k++) window.__bot(1);
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin, mism: window.__mism, lastBad: window.__lastBad, turns: window.__turns, twist: m.twist.id };
  });
  console.log(`\n=== ${name} twist=${res.twist} ===`);
  console.log(res.log.join('\n'));
  const s = res.st;
  console.log(`end T=${s.T.toFixed(1)} pits=${s.pits.join(',')} finished=${res.finished} finishPvp-calls=${res.fin} turns=${res.turns} mismatches=${res.mism}${res.lastBad ? ' (' + res.lastBad + ')' : ''} stats=${JSON.stringify(s.stats)}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  if (res.fin !== 1) FAIL(`${name}: finishPvp ${res.fin}x aangeroepen`);
  if (res.mism) FAIL(`${name}: visuele telling wijkt af van logica (${res.lastBad})`);
  if (errors.length) { FAIL(`${name}: console-errors`); console.log(errors.slice(0, 6).join('\n')); } else console.log('NO ERRORS');
  await browser.close();
  return res.result ? res.result.winner : null;
}

const wins = [0, 0, 0];
for (const name of scen) {
  if (name === 'bots') {
    const cfgs = [[{ skill: 0.95, think: 1.5, thief: 0.5 }, { skill: 0.3, think: 2, thief: 0.3 }], [{ skill: 0.3, think: 2, thief: 0.3 }, { skill: 0.95, think: 1.5, thief: 0.5 }], [{ skill: 0.8, think: 1.2, thief: 0.4 }, { skill: 0.8, think: 1.2, thief: 0.4 }]];
    for (const c of cfgs) { const w = await playMatch('bots', process.env.TW || 'none', c); wins[w == null ? 2 : w]++; }
    console.log('winnaars (Wes, Jor, gelijk):', wins);
    if (!wins[0] || !wins[1]) FAIL('bots: niet beide spelers wonnen');
  } else if (name === 'twists') {
    for (const t of TWISTS) await playMatch('twists', t, [{ skill: 0.8, think: 1.5, thief: 0.4 }, { skill: 0.6, think: 1.5, thief: 0.4 }]);
  } else if (name === 'idle') {
    await playMatch('idle', 'none', [{ style: 'idle' }, { style: 'idle' }]);
  } else if (name === 'timeout') {
    await playMatch('timeout', process.env.TW || 'none', [{ skill: 0.5, think: 2 }, { skill: 0.5, think: 2 }], () => { window.__app.mode.instance.dbg.setTime(14); });
  } else if (name === 'events') {
    // kip en draak forceren, kort na elkaar, en controleren dat de stand klopt
    await playMatch('events', 'none', [{ skill: 0.7, think: 1 }, { skill: 0.7, think: 1 }], () => { const d = window.__app.mode.instance.dbg; d.evT(1); });
  } else if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.8, think: 0.5, thief: 0.5 }, { skill: 0.8, think: 0.5, thief: 0.5 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/kl_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { phase: s.phase, turn: s.turn, pits: s.pits, ev: s.ev }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await snap('start');
    await go('s.phase==="sow"'); await page.evaluate(() => window.__bot(40)); await snap('sow');
    await go('s.phase==="choose" && s.stats.moves>=3'); await snap('choose');
    await go('s.phase==="choose" && !s.ev', 60 * 60);
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.startDragon(); });
    await page.evaluate(() => window.__bot(70)); await snap('dragon1');
    await page.evaluate(() => window.__bot(110)); await snap('dragon2');
    await page.evaluate(() => window.__bot(100)); await snap('dragon3');
    await go('s.phase==="choose" && !s.ev', 60 * 20);
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setEvKind(1); d.evT(0.01); });
    await go('s.ev==="chicken"', 60 * 60); await page.evaluate(() => window.__bot(70)); await snap('chicken');
    await go('s.phase==="capture"', 60 * 120); await page.evaluate(() => window.__bot(15)); await snap('capture');
    await go('s.phase==="thief"', 60 * 120); await page.evaluate(() => window.__bot(30)); await snap('thief');
    await go('s.phase==="choose"', 60 * 20);
    await page.evaluate(() => { window.__app.mode.instance.dbg.setTime(3); });
    await go('s.phase==="sweep"', 60 * 20); await page.evaluate(() => window.__bot(40)); await snap('sweep');
    await go('s.phase==="end"', 60 * 60); await page.evaluate(() => window.__bot(30)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close();
  }
}
server.close();
console.log(fails ? `\n${fails} FOUT(EN)` : '\nALLES OK');
process.exit(fails ? 1 : 0);
