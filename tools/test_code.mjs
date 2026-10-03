// Gebruik: node tools/test_code.mjs [scenario...]   scenario: logic | bots | twists | idle | fail | power | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// logic = pure test van de Mastermind-feedback (zonder browser); de rest laat bots (met een Mastermind-oplosser) hele potjes spelen.
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
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['logic', 'bots'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'bodyswap', 'deurman'];   // = twists van code + none
let fails = 0; const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL:', msg); } };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=code&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
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
    window.__fin = 0; const orig = mode.finishPvp.bind(mode); mode.finishPvp = (r) => { window.__fin++; return orig(r); };
  });
  return { browser, page, errors };
}

// cfg[i] = { gap: frames tussen toetsaanslagen, acc: kans dat hij een consistente gok kiest, power: kans om B vast te houden, style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 31337; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const fb = (code, guess) => { const cc = Array(6).fill(0), gc = Array(6).fill(0); let e = 0; for (let i = 0; i < 4; i++) { if (guess[i] === code[i]) e++; else { cc[code[i]]++; gc[guess[i]]++; } } let c = 0; for (let k = 0; k < 6; k++) c += Math.min(cc[k], gc[k]); return [e, c]; };
    const ALL = []; for (let n = 0; n < 1296; n++) { const c = []; let x = n; for (let i = 0; i < 4; i++) { c.push(x % 6); x = Math.floor(x / 6); } ALL.push(c); }
    const B = [0, 1].map(() => ({ cand: ALL, seen: 0, round: -1, target: null, f: 0, bHold: 0, staleDone: false, hintDone: false }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        const PS = inst.dbg.PS, R = inst.dbg.R;
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], p = PS[i];
          v.left = v.right = v.up = v.down = v.a = v.b = false; v.x = v.y = 0;
          if (c.style === 'idle' || R.phase !== 'play' || p.status !== 'play') { if (R.n !== b.round) { b.round = R.n; b.cand = ALL; b.seen = 0; b.target = null; b.staleDone = false; b.hintDone = false; } continue; }
          if (R.n !== b.round) { b.round = R.n; b.cand = ALL; b.seen = 0; b.target = null; b.staleDone = false; b.hintDone = false; }
          if (p.hint && !b.hintDone) { b.hintDone = true; b.cand = b.cand.filter((x) => x[p.hint.pos] === p.hint.color); b.target = null; }
          if (p.rows.some((r) => r.stale) && !b.staleDone) { b.staleDone = true; b.cand = ALL; b.seen = p.rows.length; b.target = null; if (p.hint) b.cand = ALL.filter((x) => x[p.hint.pos] === p.hint.color); }
          while (b.seen < p.rows.length) { const r = p.rows[b.seen++]; b.cand = b.cand.filter((x) => { const f = fb(x, r.guess); return f[0] === r.exact && f[1] === r.color; }); b.target = null; }
          if (!b.target) { const list = b.cand.length && rnd() < c.acc ? b.cand : ALL; b.target = list[Math.floor(rnd() * list.length)]; }
          // B vasthouden voor een power
          if (b.bHold > 0) { b.bHold--; v.b = true; continue; }
          if (p.power > 0 && rnd() < c.power * 0.01) { b.bHold = 40; v.b = true; continue; }
          b.f++; if (b.f < c.gap) continue; b.f = 0;
          const T = b.target; let mis = -1; for (let q = 0; q < 4; q++) { const j = (p.cursor + q) % 4; if (p.cur[j] !== T[j]) { mis = j; break; } }
          if (mis < 0) { v.a = true; continue; }
          if (p.cursor !== mis) { const right = (mis - p.cursor + 4) % 4; if (right <= 2) v.right = true; else v.left = true; continue; }
          const cv = p.cur[mis]; const up = cv < 0 ? T[mis] : (T[mis] - cv + 6) % 6; if (up <= 3) v.up = true; else v.down = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (name === 'logic') {
    const L = await import(`file://${root}/src/games/code_logic.js`);
    // controle tegen een tweede, onafhankelijke formule: som van min(aantal per kleur) minus exact
    const alt = (code, guess) => { let exact = 0; for (let i = 0; i < 4; i++) if (code[i] === guess[i]) exact++; let tot = 0; for (let k = 0; k < 6; k++) tot += Math.min(code.filter((x) => x === k).length, guess.filter((x) => x === k).length); return { exact, color: tot - exact }; };
    const codes = L.allCodes(); check(codes.length === 1296, '1296 codes'); let bad = 0, n = 0;
    for (const a of codes) for (let g = 0; g < 1296; g += 1) { const b = codes[g]; const f = L.feedback(a, b), h = alt(a, b); n++; if (f.exact !== h.exact || f.color !== h.color) bad++; }
    console.log(`feedback gecontroleerd op ${n} combinaties, afwijkingen: ${bad}`); check(bad === 0, 'feedback klopt voor alle combinaties');
    // bekende gevallen (dubbele kleuren)
    const cases = [[[0, 0, 1, 1], [0, 1, 0, 1], 2, 2], [[0, 0, 0, 1], [1, 0, 0, 0], 2, 2], [[0, 1, 2, 3], [3, 2, 1, 0], 0, 4], [[0, 0, 1, 2], [0, 0, 0, 0], 2, 0], [[1, 1, 1, 1], [1, 1, 1, 1], 4, 0], [[0, 1, 2, 3], [0, 0, 0, 0], 1, 0], [[0, 0, 1, 1], [1, 1, 0, 0], 0, 4], [[5, 4, 3, 2], [2, 3, 4, 5], 0, 4], [[0, 1, 0, 1], [0, 0, 1, 1], 2, 2]];
    for (const [c, g, e, k] of cases) { const f = L.feedback(c, g); check(f.exact === e && f.color === k, `feedback ${c} vs ${g}: ${f.exact}/${f.color} verwacht ${e}/${k}`); }
    console.log('bekende gevallen gecontroleerd:', cases.length);
    continue;
  }
  if (['bots', 'twists', 'idle', 'fail', 'power'].includes(name)) {
    const F = { gap: 5, acc: 1, power: 1.2 }, S = { gap: 9, acc: 0.9, power: 0.6 };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [{ ...F }, { ...S }]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'fail' ? [['none', [{ gap: 6, acc: 0, power: 0 }, { style: 'idle' }]], ['none', [{ gap: 6, acc: 0, power: 0 }, { gap: 6, acc: 0, power: 0 }]]]
          : name === 'power' ? [['none', [{ gap: 26, acc: 1, power: 8 }, { gap: 26, acc: 1, power: 8 }]]]
            : [[process.env.TW || 'none', [{ ...F }, { ...S }]], [process.env.TW || 'none', [{ ...S }, { ...F }]], [process.env.TW || 'none', [{ gap: 7, acc: 1, power: 1 }, { gap: 7, acc: 1, power: 1 }]], [process.env.TW || 'none', [{ gap: 7, acc: 1, power: 1 }, { gap: 7, acc: 1, power: 1 }]]];
    const wins = [0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0; const ev = { power: 0, ghost: 0, sand: 0, golem: 0, stale: 0 };
        while (!m.finished && g++ < 60 * 400) {
          window.__bot(1);
          const st = inst.dbg.state();
          const key = st.n + ':' + st.phase + ':' + st.wins.join('-');
          if (key !== last && (st.phase === 'end' || st.phase === 'final' || st.phase === 'play' || st.phase === 'announce')) { log.push(`T=${st.T.toFixed(1)} ronde ${st.n + 1} ${st.phase} wins=${st.wins} rijen=${st.p.map((p) => p.rows.length)} elapsed=${st.elapsed.toFixed(0)}`); last = key; }
          if (st.p.some((p) => p.ghost > 0)) ev.ghost++; if (st.p.some((p) => p.sand > 0)) ev.sand++; if (st.golem === 'warn') ev.golem++; if (st.golemDone) ev.stale++;
        }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin, ev };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.filter((l) => /end|final/.test(l)).join('\n'));
      console.log(`end T=${res.st.T.toFixed(1)} wins=${res.st.wins} finished=${res.finished} finishPvp-aanroepen=${res.fin} speeltijd=${res.st.elapsed.toFixed(0)}s coin=${res.st.coin} golem-frames=${res.ev.golem} spook-frames=${res.ev.ghost} zand-frames=${res.ev.sand}`);
      if (res.result) { console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, '')}`); if (res.result.winner != null) wins[res.result.winner]++; }
      check(res.finished && res.fin === 1, `finishPvp precies één keer (${res.fin}) [${name}/${tw}]`);
      check(res.result && res.result.winner != null, `er is een winnaar [${name}/${tw}]`);
      check(res.st.elapsed < 125, `speeltijd binnen de limiet (${res.st.elapsed.toFixed(0)}s)`);
      if (name === 'power') { check(res.ev.ghost + res.ev.sand > 0, 'power-ups (spook/zandloper) werden gebruikt'); check(res.ev.golem > 0 && res.ev.stale > 0, 'de golem waarschuwt en verandert de code'); }
      if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 8).join('\n')); fails++; } else console.log('NO ERRORS');
      await browser.close();
    }
    if (name === 'bots') { console.log('winsten Wes/Jor:', wins.join('/')); check(wins[0] > 0 && wins[1] > 0, 'beide spelers kunnen winnen'); }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ gap: 14, acc: 1, power: 0 }, { gap: 20, acc: 1, power: 0 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/cd_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { ph: s.phase, n: s.n, wins: s.wins, rows: s.p.map((p) => p.rows.length) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    const frames = (n) => page.evaluate((n) => window.__bot(n), n);
    await snap('intro0'); await go('s.phase==="play"'); await frames(90); await snap('play0');
    await go('s.p[0].rows.length>=3 && s.p[1].rows.length>=2', 60 * 40); await frames(10); await snap('play1');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.PS[0].power = 2; d.PS[1].power = 1; });
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.usePower(0); }); await frames(45); await snap('power_fly'); await frames(30); await snap('power_hit');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.golemNow(); }); await frames(100); await snap('golem_warn');
    await frames(100); await snap('golem_changed');
    await go('s.phase==="end"', 60 * 80); await frames(80); await snap('round_end');
    await go('s.phase==="play" && s.n===1', 60 * 20); await frames(80); await snap('round2_hint');
    await go('s.phase==="final"', 60 * 300); await frames(70); await snap('final');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(fails ? `\n${fails} MISLUKT` : '\nALLES OK');
server.close();
process.exit(fails ? 1 : 0);
