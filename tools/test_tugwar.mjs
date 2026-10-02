// Gebruik: node tools/test_tugwar.mjs [scenario...]   scenario: bots | twists | shots | idle | timeout
//   TW=<twist-id> (optioneel) kiest een twist; Q=low|high kwaliteit.
// Bots drukken A/B op een instelbaar tempo (zonder renderen, versneld) en spelen hele potjes; rapporteert tijden, winnaars, fouten.
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
const TWISTS = ['none', 'swapab', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=tugwar&quality=${process.env.Q || 'low'}${twist ? '&twist=' + twist : ''}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = true;
    mode.paused = false;
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// bot-installatie: cfg[i] = { rate: drukken per seconde, style: 'alt'|'mash', surge: kans dat de bot de surge raakt }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map((i) => ({ next: rnd() * 0.3, alt: 0, t: 0 }));
    window.__cfg = cfg;
    window.__bot = (n, stop) => {
      const dt = 1 / 60;
      m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          b.t += dt;
          if (c.rate > 0 && b.t >= b.next) {
            let btn = c.style === 'alt' ? (b.alt++ % 2 ? 'b' : 'a') : 'a';
            const sg = st.surge[i]; if (sg && sg.state !== 'done' && sg.t >= sg.travel - 0.02 && sg.t < sg.travel + 0.3 && (c.surge || 0) > 0.5) btn = sg.btn;
            v[btn] = true; b.next = b.t + (1 / c.rate) * (0.75 + 0.5 * rnd());
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (name === 'bots' || name === 'twists' || name === 'idle' || name === 'timeout') {
    const list = name === 'twists' ? TWISTS.map((t) => [t, [{ rate: 7, style: 'alt', surge: 1 }, { rate: 5, style: 'mash', surge: 0 }]])
      : name === 'idle' ? [['none', [{ rate: 0 }, { rate: 0 }]]]
        : name === 'timeout' ? [['none', [{ rate: 3, style: 'mash' }, { rate: 3, style: 'mash' }]]]
          : [
            [process.env.TW || 'none', [{ rate: 7, style: 'alt', surge: 1 }, { rate: 4, style: 'alt', surge: 0 }]],
            [process.env.TW || 'none', [{ rate: 6, style: 'mash' }, { rate: 6, style: 'mash' }]],
            [process.env.TW || 'none', [{ rate: 4, style: 'alt', surge: 1 }, { rate: 8, style: 'mash' }]],
            [process.env.TW || 'none', [{ rate: 9, style: 'alt', surge: 1 }, { rate: 9, style: 'alt', surge: 1 }]],
          ];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
        while (!m.finished && g++ < 60 * 400) {
          window.__bot(1);
          const st = inst.dbg.state(); const key = st.round + ':' + st.rstate + ':' + (st.snapT > 0 ? 'snap' : '') + ':' + (st.chick || '');
          if (key !== last) { log.push(`T=${st.T.toFixed(1)} r${st.round} ${st.rstate}${st.snapT > 0 ? ' SNAP' : ''} chick=${st.chick} lead=${st.lead.toFixed(2)} wins=${st.wins} tens=${st.tension.toFixed(2)}`); last = key; }
        }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.join('\n'));
      console.log(`end T=${res.st.T.toFixed(1)} wins=${res.st.wins} hist=${JSON.stringify(res.st.hist)} finished=${res.finished} snaps=${res.st.stats.snaps} chickenHelped=${res.st.stats.chickenHelped}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
      await browser.close();
    }
    continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ rate: 7, style: 'alt', surge: 0 }, { rate: 6, style: 'alt', surge: 0 }]);
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/tug_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { r: s.rstate, lead: +s.lead.toFixed(2), t: +s.tension.toFixed(2), chick: s.chick, surge: s.surge, wins: s.wins }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await go('s.rstate==="tug" && s.T>3'); await page.evaluate(() => window.__bot(40)); await snap('fight');
    await page.evaluate(() => window.__app.mode.instance.dbg.forceSurge());
    await go('s.surge[0] && s.surge[0].t>s.surge[0].travel*0.8'); await snap('surge');
    await page.evaluate(() => window.__app.mode.instance.dbg.forceChick(1));
    await go('s.chick==="pull"'); await page.evaluate(() => window.__bot(30)); await snap('chicken');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setLead(0.1); });
    await page.evaluate(() => { window.__cfg = [{ rate: 12, style: 'alt', surge: 0 }, { rate: 12, style: 'alt', surge: 0 }]; });
    await go('s.tension>0.8 || s.snapT>0'); await snap('tension');
    await go('s.snapT>0.9 && s.snapT<1.7'); await snap('snap');
    await page.evaluate(() => { window.__cfg = [{ rate: 12, style: 'alt', surge: 0 }, { rate: 3, style: 'mash', surge: 0 }]; });
    await go('s.rstate==="tug" && s.snapT<=0 && Math.abs(s.lead)>0.62'); await snap('danger');
    await go('s.rstate==="drop"'); await page.evaluate(() => window.__bot(8)); await snap('drop');
    await go('s.rstate==="lava"'); await page.evaluate(() => window.__bot(4)); await snap('lava');
    await go('s.rstate==="pop"'); await page.evaluate(() => window.__bot(10)); await snap('pop');
    await go('s.rstate==="burn"'); await page.evaluate(() => window.__bot(40)); await snap('burn');
    await go('s.rstate==="end"'); await snap('end');
    await go('s.round===2 && s.rstate==="tug"'); await page.evaluate(() => window.__bot(10)); await snap('round2');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
server.close();
