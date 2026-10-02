// Gebruik: node tools/test_memory.mjs [scenario...]   scenario: bots twists shots
// Versnelde (niet-gerenderde) simulatie van het Geheugen-Duel met bots; 'shots' maakt screenshots van de belangrijkste momenten.
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
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'lowgrav', 'bodyswap', 'deurman'];

async function open(twist = 'none') {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=memory&twist=${twist}&quality=${process.env.Q || "low"}`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 240000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__rnd = rnd;
    // skill: mem = kans dat een gezien kaartje onthouden wordt, think = frames bedenktijd, lazy = bot doet niets, want = eerst een speciale kaart
    window.__sk = [{ mem: 0.7, think: [20, 60], lazy: false, want: null }, { mem: 0.7, think: [20, 60], lazy: false, want: null }];
    const known = [new Map(), new Map()];       // per bot: uid -> face
    let seenShuf = [0, 0]; const B = [{ wait: 0, key: '', hold: 0 }, { wait: 0, key: '', hold: 0 }];
    const tw = m.twist.id;
    const DIRS = ['L', 'R', 'U', 'D'];
    const phys = (d) => (tw === 'invert' ? { L: 'R', R: 'L', U: 'D', D: 'U' }[d] : d);
    const physBtn = (b) => (tw === 'swapab' ? (b === 'a' ? 'b' : 'a') : b);
    const KEY = { L: 'left', R: 'right', U: 'up', D: 'down' };
    window.__step = (n, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (const i of [0, 1]) { const v = inp.virtual[i]; v.a = v.b = v.left = v.right = v.up = v.down = false; }
        for (const bi of [0, 1]) {
          const sk = window.__sk[bi], kn = known[bi], b = B[bi];
          if (seenShuf[bi] !== st.shuffles) { seenShuf[bi] = st.shuffles; kn.clear(); }
          // wat is er zichtbaar (open of tijdelijk open)? onthoud met kans mem
          st.cards.forEach((c) => { if (c && (c.st === 'up' || (st.revealed && c.st === 'down')) && !kn.has(c.uid) && window.__rnd() < (st.revealed ? sk.mem * 0.5 : sk.mem) / 60 * 12) kn.set(c.uid, c.face); });
          if (st.active !== bi || sk.lazy) continue;
          if (st.phase !== 'pick1' && st.phase !== 'pick2') { b.wait = 0; continue; }
          const owner = m.swapped ? 1 - bi : bi; const vo = inp.virtual[owner];
          if (b.wait > 0) { b.wait--; continue; }
          // doel kiezen
          const downs = st.cards.map((c, s) => (c && c.st === 'down' ? { s, c } : null)).filter(Boolean);
          let target = null;
          const fresh = downs.filter((d) => d.c.kind === 'pair');
          if (st.phase === 'pick2') {
            const f = st.cards[st.first]; const mate = downs.find((d) => d.c.kind === 'pair' && kn.get(d.c.uid) === f.face);
            if (mate) target = mate.s;
            else { const unk = downs.filter((d) => !kn.has(d.c.uid) && d.c.kind === 'pair'); target = (unk.length ? unk : fresh)[Math.floor(window.__rnd() * (unk.length ? unk : fresh).length)].s; }
          } else {
            if (sk.want) { const w = downs.find((d) => d.c.kind === sk.want); if (w) target = w.s; }
            if (target == null) {
              const byFace = {}; for (const d of downs) { const f = kn.get(d.c.uid); if (f && d.c.kind === 'pair') (byFace[f] ||= []).push(d); }
              const pairKnown = Object.values(byFace).find((g) => g.length >= 2);
              if (pairKnown) target = pairKnown[0].s;
              else { const unk = downs.filter((d) => !kn.has(d.c.uid)); const pool = unk.length ? unk : downs; target = pool[Math.floor(window.__rnd() * pool.length)].s; }
            }
          }
          if (target == null) continue;
          const cur = st.cur[bi];
          if (cur === target) { vo[physBtn('a')] = true; b.wait = sk.think[0] + Math.floor(window.__rnd() * (sk.think[1] - sk.think[0])); continue; }
          // BFS over cursorstappen
          const seen = new Map([[cur, null]]); const q = [cur]; let found = false;
          while (q.length && !found) { const x = q.shift(); for (const d of DIRS) { const y = inst.dbg.nextCur(x, d); if (!seen.has(y)) { seen.set(y, [x, d]); if (y === target) { found = true; break; } q.push(y); } } }
          if (!found) { vo[physBtn('b')] = true; b.wait = 6; continue; }
          let y = target, first = null; while (seen.get(y)) { const [x, d] = seen.get(y); first = d; y = x; }
          vo[KEY[phys(first)]] = true; b.wait = 5;
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { browser, page, errors };
}

for (const name of scen) {
  if (name === 'bots') {
    const cases = [
      ['even (mem 0.7)', [{ mem: 0.7 }, { mem: 0.7 }]],
      ['wes goed geheugen', [{ mem: 0.95 }, { mem: 0.35 }]],
      ['jor goed geheugen', [{ mem: 0.35 }, { mem: 0.95 }]],
      ['allebei slecht', [{ mem: 0.15 }, { mem: 0.15 }]],
      ['jor slaapt (lazy)', [{ mem: 0.7 }, { mem: 0.7, lazy: true }]],
      ['allebei slapen', [{ mem: 0.7, lazy: true }, { mem: 0.7, lazy: true }]],
    ];
    for (const [label, sk] of cases) {
      const o = await open('none');
      await o.page.evaluate((sk) => { sk.forEach((s, i) => Object.assign(window.__sk[i], s)); }, sk);
      const res = await o.page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; let guard = 0; let lastPh = '';
        const log = [];
        while (!m.finished && guard++ < 60 * 260) { window.__step(1); }
        return { st: inst.dbg.state(), finished: m.finished, result: m.result };
      });
      console.log(`\n=== ${label} ===`);
      console.log(`END total=${res.st.total.toFixed(1)}s scores=${res.st.scores} remaining=${res.st.remaining} shuffles=${res.st.shuffles} misses=${res.st.misses} finished=${res.finished} winner=${res.result && res.result.winner}`);
      if (res.result) console.log('summary:', res.result.summary.replace(/<[^>]+>/g, ' '));
      console.log(o.errors.length ? 'ERRORS:\n' + o.errors.slice(0, 6).join('\n') : 'NO ERRORS');
      await o.browser.close();
    }
    continue;
  }
  if (name === 'twists') {
    for (const tw of TWISTS) {
      const o = await open(tw);
      const res = await o.page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; let guard = 0;
        while (!m.finished && guard++ < 60 * 300) window.__step(1);
        return { st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id };
      });
      console.log(`twist ${res.twist}: total=${res.st.total.toFixed(1)}s scores=${res.st.scores} rem=${res.st.remaining} finished=${res.finished} winner=${res.result && res.result.winner}`, o.errors.length ? 'ERRORS ' + o.errors.slice(0, 3).join(' | ') : 'ok');
      await o.browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const tw = process.env.TWIST || 'none';
    const o = await open(tw); const { page } = o;
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/mem_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => window.__step(60 * 5, (s) => s.phase === 'peek')); await page.evaluate(() => window.__step(60 * 3)); await snap('peek');
    await page.evaluate(() => window.__step(60 * 30, (s) => s.phase === 'pick1')); await page.evaluate(() => window.__step(40)); await snap('pick1');
    await page.evaluate(() => window.__step(60 * 60, (s) => s.phase === 'pick2')); await page.evaluate(() => window.__step(25)); await snap('pick2');
    await page.evaluate(() => window.__step(60 * 60, (s) => s.phase === 'match')); await page.evaluate(() => window.__step(10)); await snap('match');
    await page.evaluate(() => window.__step(60 * 60, (s) => s.phase === 'mismatch')); await page.evaluate(() => window.__step(20)); await snap('mismatch');
    for (const kind of ['bomb', 'joker', 'mirror', 'ghost']) {
      await page.evaluate((k) => { window.__sk[0].want = k; window.__sk[1].want = k; }, kind);
      await page.evaluate(() => window.__step(60 * 90, (s) => s.phase === 'special')); await page.evaluate(() => window.__step(45)); await snap(kind + '_a');
      await page.evaluate(() => window.__step(60)); await snap(kind + '_b');
      await page.evaluate(() => window.__step(60 * 20, (s) => s.phase === 'pick1'));
      await page.evaluate(() => { window.__sk[0].want = null; window.__sk[1].want = null; });
    }
    await page.evaluate(() => window.__step(60 * 260, (s) => s.phase === 'event')); await page.evaluate(() => window.__step(50)); await snap('poltergeist');
    await page.evaluate(() => window.__step(60 * 260)); await snap('end');
    console.log(o.errors.length ? 'ERRORS:\n' + o.errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await o.browser.close(); continue;
  }
}
server.close();
