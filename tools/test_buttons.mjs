// Gebruik: node tools/test_buttons.mjs [bots|idle|shots|twists] [twist-id]
// Versneld (zonder renderen) potjes Knoppen-Breker laten spelen door bots; rapporteert winnaars, duur, fouten.
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
const args = process.argv.slice(2);
const scen = args[0] || 'bots';
const ALL_TW = ['none', 'invert', 'swapab', 'drunk', 'bodyswap', 'turbo', 'slowmo', 'deurman'];

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|ERR_/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=buttons&quality=low${twist ? '&twist=' + twist : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 3000) { inp.update(); mode.update(0.016); }
  });
  // bot-installatie
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    const KEYS = ['left', 'right', 'up', 'down', 'a', 'b'];
    const B = [0, 1].map(() => ({ wait: 0, seen: -1, skill: 0.5, err: 0.05, wasKey: null }));
    window.__B = B;
    window.__bot = (n, opt = {}, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) { const v = inp.virtual[i]; for (const key of KEYS) v[key] = false; v.x = 0; v.y = 0; }
        if (!opt.idle) {
          for (const col of [0, 1]) {
            const phys = st.swapped ? 1 - col : col;   // welke toetsenbordspeler bestuurt deze kolom
            const b = B[col], p = st.p[col];
            if (p.need < 0 || p.stun > 0 || p.squash > 0 || p.lock > 0 || p.ignore > 0 || p.frozen > 0.7) { b.seen = -1; continue; }
            const sig = p.need + ':' + p.kind + ':' + st.p[col].broken;
            if (b.sigLast !== sig) { b.sigLast = sig; b.wait = (opt.skill?.[col] ?? 0.5) * (0.5 + Math.random() * 0.7) + 0.12; }
            b.wait -= dt;
            if (b.wait > 0) continue;
            let sym = p.need;
            if (Math.random() < (opt.err?.[col] ?? 0.05)) sym = Math.floor(Math.random() * 6);
            // twist: bot weet welke fysieke toets nodig is
            if (st.twist === 'invert') sym = [1, 0, 3, 2, 4, 5][sym];
            if (st.twist === 'swapab') sym = [0, 1, 2, 3, 5, 4][sym];
            const v = inp.virtual[phys];
            v[KEYS[sym]] = true;
          }
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page, errors };
}

async function runMatch(page, opt) {
  return page.evaluate((opt) => {
    const m = window.__app.mode, inst = m.instance;
    let guard = 0; const log = []; let lastK = '';
    while (!m.finished && guard++ < 60 * 400) {
      window.__bot(1, opt);
      const st = inst.dbg.state();
      if (st.sudden && lastK !== 'sudden') { lastK = 'sudden'; log.push(`sudden@${st.playT.toFixed(1)}`); }
    }
    const st = inst.dbg.state();
    return { finished: m.finished, res: m.result && { winner: m.result.winner, score: m.result.scoreArr, summary: m.result.summary.replace(/<[^>]+>/g, ' ') }, t: st.playT, sudden: st.sudden, log, stats: st.p.map((p) => ({ cr: p.crushes, er: p.errors, go: p.golds, bo: p.booms, ow: p.owed, df: p.defused })) };
  }, opt);
}

if (scen === 'bots' || scen === 'twists') {
  const tws = scen === 'twists' ? ALL_TW : [args[1] || 'none'];
  for (const tw of tws) {
    const tally = [0, 0, 0]; const durs = [];
    for (let rep = 0, tries = 0; rep < (+process.env.REPS || (scen === 'twists' ? 2 : 6)); rep++) {
      let browser, page, errors;
      try { ({ browser, page, errors } = await open(tw)); } catch (e) { console.log('  (open mislukt, opnieuw)', e.message.split('\n')[0]); if (tries++ < 6) rep--; continue; }
      const skill = rep % 3 === 0 ? [0.5, 0.5] : rep % 3 === 1 ? [0.35, 0.8] : [0.8, 0.35];
      let r; try { r = await runMatch(page, { skill, err: [0.06, 0.06] }); } catch (e) { console.log('  (match mislukt, opnieuw)', e.message.split('\n')[0]); await browser.close().catch(() => {}); if (tries++ < 6) rep--; continue; }
      if (!r.finished) console.log('  !! NIET AFGEROND', tw, JSON.stringify(r));
      const w = r.res ? r.res.winner : -1; tally[w == null ? 2 : w]++; durs.push(Math.round(r.t));
      console.log(`  [${tw}] rep${rep} skill=${skill} winner=${w} score=${r.res && r.res.score} t=${r.t.toFixed(1)} sudden=${r.sudden} stats=${JSON.stringify(r.stats)}`);
      if (errors.length) console.log('  ERRORS:', errors.slice(0, 5).join('\n'));
      await browser.close();
    }
    console.log(`== ${tw}: wins Wes/Jor/gelijk = ${tally.join('/')}  duur(s) = ${durs.join(',')}`);
  }
} else if (scen === 'idle') {
  // niemand drukt: er moet toch een einde komen (tijd om / beslissend blok)
  const { browser, page, errors } = await open(args[1] || 'none');
  const r = await runMatch(page, { idle: true });
  console.log('idle ->', JSON.stringify(r));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
  await browser.close();
} else if (scen === 'oneside') {
  // alleen Wes speelt: Jor moet verliezen; daarna alleen Jor
  for (const who of [0, 1]) {
    const { browser, page, errors } = await open('none');
    const r = await runMatch(page, { skill: who === 0 ? [0.4, 99] : [99, 0.4], err: [0.03, 0.03] });
    console.log(`only ${who} plays -> winner ${r.res && r.res.winner}  score ${r.res && r.res.score} t=${r.t.toFixed(1)}`);
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
    await browser.close();
  }
} else if (scen === 'hooks') {
  // roept de optionele hooks (Deurman, lichaamswissel, celebrate) direct aan en kijkt of er niets stukgaat
  const { browser, page, errors } = await open(args[1] || 'none');
  const out = await page.evaluate(() => {
    const inst = window.__app.mode.instance; const log = [];
    window.__bot(60 * 4, { skill: [0.6, 0.6] });
    inst.onDeurman([true, false]); window.__bot(30, { skill: [0.6, 0.6] }); log.push('deurman ok');
    inst.onDeurman([true, true]); window.__bot(30, { skill: [0.6, 0.6] });
    inst.onSwap(true); window.__bot(30, { skill: [0.6, 0.6] }); inst.onSwap(false); window.__bot(30, { skill: [0.6, 0.6] }); log.push('swap ok');
    let g = 0; while (!window.__app.mode.finished && g++ < 60 * 200) window.__bot(1, { skill: [0.8, 0.8] });
    inst.celebrate(0); inst.celebrate(1); inst.resultUpdate(0.05); log.push('celebrate ok, finished=' + window.__app.mode.finished);
    return log;
  });
  console.log(out.join(' | '));
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
  await browser.close();
} else if (scen === 'shots') {
  const tw = args[1] || 'none';
  const { browser, page, errors } = await open(tw);
  const shot = async (name) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/buttons_${name}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', name); };
  await page.evaluate(() => window.__bot(60 * 5, { skill: [0.45, 0.6], err: [0.1, 0.1] }));
  await shot('play1');
  // forceer speciale blokken
  await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.force(0, 0, 'i', [4, 2]); d.force(0, 1, 'g', [0]); d.force(0, 2, 'b', [5]); d.force(1, 0, 'b', [1]); d.force(1, 1, 'g', [3]); d.force(1, 2, 'i', [0, 4]); window.__bot(8, { idle: true }); });
  await shot('special');
  // Jor laat blok vallen -> platgedrukt
  await page.evaluate(() => { window.__bot(60 * 8, { skill: [0.4, 99], err: [0.05, 0] }, (s) => s.p[1].squash > 0.6 || s.p[1].booms > 0 || s.p[0].booms > 0); });
  await shot('crush');
  await page.evaluate(() => { window.__bot(60 * 100, { skill: [0.4, 0.5], err: [0.05, 0.05] }, (s) => s.p[0].broken >= 15 || s.p[1].broken >= 15); });
  await shot('mid');
  await page.evaluate(() => { window.__bot(60 * 100, { skill: [0.35, 0.8], err: [0.05, 0.05] }); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { for (let k = 0; k < 40; k++) { window.__app.input.update(); window.__app.mode.update(1 / 30); } window.__app.mode.paused = true; });
  await page.waitForTimeout(900); await page.screenshot({ path: '/tmp/buttons_win.png' });
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS');
  await browser.close();
}
server.close();
