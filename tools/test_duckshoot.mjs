// Gebruik: node tools/test_duckshoot.mjs [scenario...]
// scenario: bots, p0, p1, idle (gelijkspel/sudden death), twists (alle twists), giant (reuzeneend: delen en alleen), shots (screenshots), deurman
//   bots3 / bots4 = drie / vier spelers (vrij voor allen, ?players=N): alle spelers krijgen input, uitslag volgt, place klopt.
// Versneld (zonder renderen) potjes Schiettent met bots; controleert dat finishPvp altijd wordt aangeroepen en beide spelers kunnen winnen.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { chromePath, BROWSER_ARGS } from './chrome_path.mjs';
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
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'bodyswap', 'deurman'];

async function open(browser, twist, N = 2) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=duckshoot&quality=low&scare=0${twist ? '&twist=' + twist : ''}${N > 2 ? '&players=' + N : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    for (const q of mode.ids) inp.virtual[q].a = true; inp.update(); mode.update(0.016);
    for (const q of mode.ids) inp.virtual[q].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
  });
  await page.evaluate(() => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    window.__mode = 'bots'; window.__skill = m.ids.map(() => 1);
    window.__bot = (n, stop) => {
      const dt = 1 / 60;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) return true;
        for (let i = 0; i < m.ids.length; i++) {
          const v = inp.virtual[m.ids[i]]; v.a = false; v.b = false; v.x = 0; v.y = 0;
          const skill = window.__skill[i]; if (!skill || window.__mode === 'idle') continue;
          const me = st.ch[i]; const tg = inst.dbg.targets;
          // beste doelwit: hoogste waarde, dichtbij
          let best = null, bv = -1e9;
          const cand = tg.filter((t) => t.state === 'alive').map((t) => ({ x: t.x, y: t.y, v: t.kind === 'bomb' ? -50 : (t.pts || 1) * 3 - Math.hypot(t.x - me.x, t.y - me.y) * 0.5 }));
          const gh = inst.dbg.ghost; if (gh.alive) cand.push({ x: gh.x, y: gh.y, v: 20 });
          for (const c of cand) if (c.v > bv) { bv = c.v; best = c; }
          if (best) { const dx = best.x - me.x, dy = best.y - me.y; const d = Math.hypot(dx, dy); v.x = Math.abs(dx) < 0.3 ? 0 : Math.sign(dx); v.y = Math.abs(dy) < 0.3 ? 0 : -Math.sign(dy);
            if (d < 0.7 + (rnd() - 0.5) * 0.6 && rnd() < 0.5 * skill) v.a = true; }
          if (rnd() < 0.02) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      return false;
    };
  });
  return { page, errors };
}

for (const name of scen) {
  const browser = await chromium.launch({ executablePath: chromePath(), args: BROWSER_ARGS });
  if (name === 'bots3' || name === 'bots4') {
    const N = name === 'bots4' ? 4 : 3, winners = new Set(); let bad = 0;
    const SK = N === 4 ? [[1, 0.4, 0.4, 0.4], [0.4, 1, 0.4, 0.4], [0.4, 0.4, 1, 0.4], [0.4, 0.4, 0.4, 1], [0, 0, 0, 0], [1, 1, 1, 1], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] : [[1, 0.4, 0.4], [0.4, 1, 0.4], [0.4, 0.4, 1], [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]];   // laatste reeksen: alleen één speler schiet (elk slot kan winnen)
    for (const skill of SK) {
      const { page, errors } = await open(browser, 'none', N);
      const res = await page.evaluate((skill) => {
        window.__skill = skill; const m = window.__app.mode; let g = 0; while (!m.finished && g++ < 60 * 120) window.__bot(1);
        const st = m.instance.dbg.state(); return { fin: m.finished, T: +st.T.toFixed(1), sc: st.score, over: st.over, place: m.result && m.result.place, winnerIds: m.result && m.result.winnerIds, sum: m.result && m.result.summary.replace(/<[^>]+>/g, ' ').slice(0, 80) };
      }, skill);
      console.log(skill.join('/').padEnd(14), JSON.stringify(res), errors.length ? 'ERRORS ' + errors.slice(0, 3).join('|') : 'ok');
      if (!res.fin || !res.place) { console.log('FAIL: niet afgelopen'); bad++; }
      else { if (res.place.length !== N || new Set(res.place).size !== N) { console.log('FAIL: place ongeldig'); bad++; } for (const w of res.winnerIds) winners.add(w); }
      if (errors.length) bad++;
      await page.close();
    }
    console.log('winnaars (spelers-id):', [...winners].sort().join(','));
    if (winners.size < N) { console.log('FAIL: niet elke speler kon winnen'); bad++; }
    if (bad) process.exitCode = 1;
  } else if (name === 'twists') {
    for (const tw of (process.env.TW ? process.env.TW.split(',') : TWISTS)) {
      const { page, errors } = await open(browser, tw);
      const res = await page.evaluate(() => { const m = window.__app.mode; let g = 0; while (!m.finished && g++ < 60 * 120) window.__bot(1); const st = m.instance.dbg.state(); return { fin: m.finished, T: +st.T.toFixed(1), sc: st.score, w: m.result && m.result.winner, tw: m.twist.id, sz: st.ch.map((c) => +c.size.toFixed(2)), stats: st.stats.hits }; });
      console.log('twist', tw, JSON.stringify(res), errors.length ? 'ERRORS ' + errors.slice(0, 3).join('|') : 'ok');
      await page.close();
    }
  } else if (name === 'bots' || name === 'p0' || name === 'p1' || name === 'idle') {
    for (const run of [0, 1, 2]) {
      const { page, errors } = await open(browser, run === 0 ? 'none' : TWISTS[run * 3]);
      const res = await page.evaluate((nm) => {
        window.__mode = nm === 'idle' ? 'idle' : 'bots'; if (nm === 'p0') window.__skill = [1, 0]; if (nm === 'p1') window.__skill = [0, 1];
        const m = window.__app.mode; let g = 0; while (!m.finished && g++ < 60 * 120) window.__bot(1);
        const st = m.instance.dbg.state(); return { fin: m.finished, T: +st.T.toFixed(1), sc: st.score, w: m.result && m.result.winner, tw: m.twist.id, over: st.over, stats: st.stats, sum: m.result && m.result.summary.replace(/<[^>]+>/g, ' ') };
      }, name);
      console.log(name, 'run', run, JSON.stringify(res), errors.length ? 'ERRORS ' + errors.slice(0, 3).join('|') : 'ok');
      await page.close();
    }
  } else if (name === 'giant') {
    for (const mode of ['both', 'p0', 'p1', 'miss']) {
      const { page, errors } = await open(browser, 'none');
      const res = await page.evaluate((mode) => {
        window.__skill = [0, 0]; const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input;
        window.__bot(60 * 36, (s) => s.giant);
        window.__bot(30);
        const gt = d.targets.find((t) => t.kind === 'king');
        const aim = (i) => { d.aimAt(i, gt.x, gt.y); inp.virtual[i].a = true; };
        const fire = (list) => { for (const i of list) { d.aimAt(i, gt.x, gt.y); d.ch[i].ammo = 6; d.ch[i].cd = 0; d.tryFire(i); } };
        if (mode === 'both') fire([0, 1]); else if (mode === 'p0') fire([0]); else if (mode === 'p1') fire([1]);
        const before = d.score.slice();
        let g = 0; while (!m.finished && g++ < 60 * 40) window.__bot(1);
        const st = d.state(); return { mode, before, sc: st.score, fin: m.finished, w: m.result && m.result.winner, over: st.over, giantDone: st.giantDone };
      }, mode);
      console.log('giant', JSON.stringify(res), errors.length ? 'ERRORS ' + errors.join('|') : 'ok');
      await page.close();
    }
  } else if (name === 'deurman') {
    const { page, errors } = await open(browser, 'deurman');
    const res = await page.evaluate(() => { window.__bot(60 * 20); const i = window.__app.mode.instance; const a = i.dbg.state().score.slice(); i.onDeurman([true, false]); window.__bot(2); return { a, b: i.dbg.state().score }; });
    console.log('deurman', JSON.stringify(res), errors.length ? 'ERRORS ' + errors.join('|') : 'ok');
  } else if (name === 'models') {
    const { page, errors } = await open(browser, 'none');
    await page.evaluate(() => {
      const d = window.__app.mode.instance.dbg; window.__skill = [0, 0];
      for (const t of [...d.targets]) t.state = 'dying', t.exploded = true, t.dead = 1;
      window.__bot(10);
      const kinds = ['duck', 'baby', 'gold', 'fat', 'bunny', 'dragon', 'bomb'];
      kinds.forEach((k, i) => { const t = d.spawnBelt(k, 2, -6.5 + i * 2.2); t.vx = 0; t.def = { ...t.def, shy: 0 }; });
      window.__bot(30);
    });
    await page.evaluate(() => { window.__app.mode.paused = true; });
    for (const [tag, x] of [['a', -4.5], ['b', 1.5], ['c', 6]]) {
      await page.evaluate((x) => { const c = window.__app.mode.camera; c.position.set(x, 7.2, 10); c.lookAt(x, 6.9, 0); }, x);
      await page.waitForTimeout(800); await page.screenshot({ path: `/tmp/duck_models_${tag}.png` });
    }
    console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO ERRORS');
  } else if (name === 'shots') {
    const { page, errors } = await open(browser, process.env.TW || 'none');
    const shot = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/duck_${tag}.png` }); await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => window.__bot(60 * 8)); await shot('early');
    // bom laten ontploffen
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; const b = d.targets.find((t) => t.kind === 'bomb'); if (b) { d.aimAt(0, b.x, b.y); d.ch[0].cd = 0; d.ch[0].ammo = 6; d.tryFire(0); } window.__bot(8); }); await shot('bomb');
    // gouden eend
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.spawnBelt('gold', 1, 6); window.__bot(20); }); await shot('gold');
    // spook-eend zichtbaar
    await page.evaluate(() => window.__bot(60 * 10, (s) => s.ghost.alive)); await page.evaluate(() => window.__bot(8)); await shot('ghost');
    // clown
    await page.evaluate(() => window.__bot(60 * 10, (s) => s.clown.alive)); await page.evaluate(() => window.__bot(10)); await shot('clown');
    // ricochet
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; const p = d.plates[0]; d.aimAt(0, p.x, p.y); d.ch[0].cd = 0; d.ch[0].ammo = 6; for (let k = 0; k < 40 && p.face < 0.5; k++) window.__bot(1); d.tryFire(0); window.__bot(6); }); await shot('ricochet');
    await page.evaluate(() => window.__bot(60 * 40, (s) => s.giant)); await page.evaluate(() => window.__bot(40)); await shot('giant');
    await page.evaluate(() => window.__bot(60 * 120)); await page.evaluate(() => { window.__app.mode.paused = false; }); await page.waitForTimeout(2500); await shot('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
  }
  await browser.close();
}
server.close();
