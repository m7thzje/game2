// Gebruik: node tools/test_quiz.mjs [scenario...]   scenario: content | bots | twists | idle | tie | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// content = pure data-test (zonder browser); bots/twists/idle/tie spelen versneld hele potjes (zonder renderen).
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
const scen = process.argv.slice(2).length ? process.argv.slice(2) : ['content', 'bots'];
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'bodyswap', 'deurman'];   // = twists van quiz + none
let fails = 0; const check = (ok, msg) => { if (!ok) { fails++; console.log('FAIL:', msg); } };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=quiz&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
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
    // tel hoe vaak finishPvp wordt aangeroepen
    window.__fin = 0; const orig = mode.finishPvp.bind(mode); mode.finishPvp = (r) => { window.__fin++; return orig(r); };
  });
  return { browser, page, errors };
}

// cfg[i] = { acc: kans op goed antwoord, rt: gemiddelde reactietijd (s), joker: kans per vraag op B, style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4711; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ key: '', t: 0, plan: null }));
    window.__cfg = cfg;
    const DIR = ['left', 'up', 'right', 'down'];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        const G = inst.dbg.G, PL = inst.dbg.PL, q = G.q;
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], p = PL[i];
          for (const d of DIR) v[d] = false; v.a = false; v.b = false; v.x = 0; v.y = 0;
          if (window.__force && window.__force[i]) v[window.__force[i]] = true;   // handmatig ingedrukte knop (voor screenshots)
          if (c.style === 'idle' || !q || (st.phase !== 'ask' && st.phase !== 'grace')) continue;
          const key = st.qi + ':' + st.sdCount + ':' + st.stage;
          if (b.key !== key) {
            b.key = key; b.t = 0; b.plan = { rt: c.rt * (0.6 + 0.8 * rnd()), jok: rnd() < c.joker ? 0.6 + 2 * rnd() : -1, jokDone: false, held: 0 };
            if (q.type === 'estimate') { const range = q.max - q.min; const noise = (st.stage === 1 ? (1 - c.acc) * 0.8 + 0.04 : (1 - c.acc) * 0.25 + 0.01); b.plan.target = q.ans + (rnd() - 0.5) * range * noise; b.plan.locked = false; }
            if (q.type === 'order') b.plan.nextT = b.plan.rt;
          }
          b.t += dt; const pl = b.plan;
          if (pl.jok >= 0 && !pl.jokDone && b.t >= pl.jok) { pl.jokDone = true; v.b = true; }
          if (p.frozen > 0 || p.lock > 0 || p.done) continue;
          if (q.type === 'buzz' || q.type === 'gold' || q.type === 'sound') {
            if (b.t >= pl.rt && pl.held < 0.12) { pl.held += dt; if (!pl.dir) { const ok = q.opts.findIndex((o) => o.ok); pl.dir = rnd() < c.acc ? ok : [0, 1, 2, 3].filter((d) => d !== ok)[Math.floor(rnd() * 3)]; } v[DIR[pl.dir]] = true; }
          } else if (q.type === 'order') {
            if (b.t >= pl.nextT) { const pos = rnd() < (1 - c.acc) * 0.25 ? Math.floor(rnd() * 3) : q.perm.indexOf(p.prog); pl.holdFor = (pl.holdFor || 0) + dt; v[DIR[pos]] = true; if (pl.holdFor >= 0.1) { pl.holdFor = 0; pl.nextT = b.t + 0.15 + c.rt * 0.25; } }
          } else if (q.type === 'estimate' && !p.locked) {
            const diff = pl.target - p.val;
            if (Math.abs(diff) > q.coarse * 2.5) v.x = Math.sign(diff);
            else if (Math.abs(diff) > q.fine * 0.8) v.y = -Math.sign(diff);
            else { pl.settle = (pl.settle || 0) + dt; if (pl.settle > 0.15) { v.a = true; pl.settle = 0; } }
          }
        }
        // twist-bewuste bots: compenseer omgekeerde besturing / verwisselde knoppen
        for (const i of [0, 1]) { const v = inp.virtual[i], tw = m.twist.id; if (tw === 'invert') { [v.left, v.right] = [v.right, v.left]; [v.up, v.down] = [v.down, v.up]; v.x = -v.x; v.y = -v.y; } else if (tw === 'swapab') { [v.a, v.b] = [v.b, v.a]; } }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (name === 'content') {
    const Qm = await import(`file://${root}/src/games/quiz_questions.js`);
    const total = Qm.BUZZ.length + Qm.ESTIMATE.length + Qm.ORDER.length + Qm.ANIMALS.length + Qm.SONGS.length;
    console.log(`vragen: buzz ${Qm.BUZZ.length}, schat ${Qm.ESTIMATE.length}, volgorde ${Qm.ORDER.length}, geluid ${Qm.ANIMALS.length}+${Qm.SONGS.length} = ${total}`);
    check(total >= 70, 'minstens 70 vragen');
    for (const r of Qm.BUZZ) { check(r.length === 6 && new Set(r.slice(2)).size === 4, 'buzz-vraag heeft 4 verschillende antwoorden: ' + r[1]); check(r[1].length <= 78 && r.slice(2).every((a) => a.length <= 34), 'lengte: ' + r[1]); }
    for (const r of Qm.ESTIMATE) check(r[1] > r[2] && r[1] < r[3] && r[3] > r[2], 'schat-antwoord binnen bereik: ' + r[0]);
    for (const r of Qm.ORDER) check(r[1].length === 3 && new Set(r[1]).size === 3, 'volgorde 3 items');
    for (const s of Qm.SONGS) check(Qm.songDuration(s[1]) > 2 && Qm.songDuration(s[1]) < 14, 'liedje-duur ' + s[0]);
    let prev = null, overlaps = 0, matches = 0; const typeCount = {};
    for (let k = 0; k < 400; k++) {
      const m = Qm.buildMatch(); matches++;
      check(m.length === 10, 'potje heeft 10 vragen'); const ids = m.map((q) => q.id);
      check(new Set(ids).size === 10, 'geen dubbele vraag in een potje: ' + ids.join(','));
      if (prev && ids.some((id) => prev.includes(id))) overlaps++;
      prev = ids;
      m.forEach((q, i) => {
        typeCount[q.type] = (typeCount[q.type] || 0) + 1;
        if (q.opts) { check(q.opts.length === 4 && q.opts.filter((o) => o.ok).length === 1 && new Set(q.opts.map((o) => o.t)).size === 4, 'opties kloppen: ' + q.q); }
        if (q.type === 'order') check([...q.perm].sort().join('') === '012', 'perm');
      });
      check(m[0].type === 'buzz' && m[9].type === 'gold', 'eerste snelle, laatste goud');
      check(m.filter((q) => q.type === 'sound').length === 1 && m.filter((q) => q.type === 'estimate').length === 2 && m.filter((q) => q.type === 'order').length === 1, 'type-verdeling');
    }
    console.log('typen over 400 potjes:', JSON.stringify(typeCount), '· opeenvolgende potjes met een gedeelde vraag:', overlaps);
    check(overlaps === 0, 'twee potjes achter elkaar delen geen enkele vraag');
    // schudden: de goede antwoordpositie moet verdeeld zijn
    const pos = [0, 0, 0, 0]; for (let k = 0; k < 300; k++) for (const q of Qm.buildMatch()) if (q.opts) pos[q.opts.findIndex((o) => o.ok)]++;
    console.log('positie van het goede antwoord (links/omhoog/rechts/omlaag):', pos.join(' '));
    check(Math.min(...pos) > Math.max(...pos) * 0.7, 'goede antwoord is gelijkmatig verdeeld');
    continue;
  }
  if (['bots', 'twists', 'idle', 'tie'].includes(name)) {
    const A = { acc: 0.95, rt: 2.0, joker: 0.3 }, Bw = { acc: 0.6, rt: 2.6, joker: 0.3 };
    const list = name === 'twists' ? TWISTS.map((t) => [t, [{ ...A }, { ...Bw }]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'tie' ? [[process.env.TW || 'none', [{ acc: 0.9, rt: 2, joker: 0.2 }, { acc: 0.9, rt: 2, joker: 0.2 }]]]
          : [[process.env.TW || 'none', [{ ...A }, { ...Bw }]], [process.env.TW || 'none', [{ ...Bw }, { ...A }]], [process.env.TW || 'none', [{ acc: 0.85, rt: 2.3, joker: 0.4 }, { acc: 0.85, rt: 2.3, joker: 0.4 }]]];
    const wins = [0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      if (name === 'tie') await page.evaluate(() => { const d = window.__app.mode.instance.dbg; window.__tie = true; });
      const res = await page.evaluate((forceTie) => {
        const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0; let forced = false;
        while (!m.finished && g++ < 60 * 500) {
          window.__bot(1);
          const st = inst.dbg.state();
          // 'tie': op vraag 10 de stand gelijktrekken zodat de beslissende vraag gespeeld wordt
          if (forceTie && !forced && st.qi === 9 && st.phase === 'reveal') { inst.dbg.setScore(300, 300); forced = true; }
          const key = st.qi + ':' + st.phase + ':' + st.stage + ':' + st.score.join('-');
          if (key !== last && (st.phase === 'reveal' || st.phase === 'final' || st.phase === 'intro')) { log.push(`T=${st.T.toFixed(1)} q${st.qi + 1} ${st.type} ${st.phase} score=${st.score} sd=${st.sd}${st.chicken ? ' KIP' : ''}`); last = key; }
        }
        return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin };
      }, name === 'tie');
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.filter((l, i) => /reveal|final/.test(l)).join('\n'));
      console.log(`end T=${res.st.T.toFixed(1)} score=${res.st.score} finished=${res.finished} finishPvp-aanroepen=${res.fin} sd=${res.st.sd} sdCount=${res.st.sdCount} coin=${res.st.coin}`);
      if (res.result) { console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, '')}`); if (res.result.winner != null) wins[res.result.winner]++; }
      check(res.finished && res.fin === 1, `finishPvp precies één keer (${res.fin}) [${name}/${tw}]`);
      check(res.result && res.result.winner != null, `er is een winnaar [${name}/${tw}]`);
      if (name === 'tie') check(res.st.sd, 'beslissende vraag is gespeeld');
      if (errors.length) { console.log('ERRORS:\n' + errors.slice(0, 8).join('\n')); fails++; } else console.log('NO ERRORS');
      await browser.close();
    }
    if (name === 'bots') { console.log('winsten Wes/Jor:', wins.join('/')); check(wins[0] > 0 && wins[1] > 0, 'beide spelers kunnen winnen'); }
    continue;
  }
  if (name === 'deur') {
    // close-up van de studiodeur + prestaties (draw calls)
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ acc: 0.8, rt: 3, joker: 0 }, { acc: 0.8, rt: 3.4, joker: 0 }]);
    await page.evaluate(() => window.__bot(60 * 3, (s) => s.phase === 'ask'));
    await page.evaluate(() => { window.__app.mode.instance.dbg.S.deurPeek(12); window.__bot(120); });
    await page.waitForTimeout(500);
    console.log('render-info', JSON.stringify(await page.evaluate(() => { const r = window.__app.mode.ctx.renderer.info; return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, tex: r.memory.textures }; })));
    await page.evaluate(() => { const c = window.__app.mode.camera; c.position.set(-6, 6, 5); c.lookAt(-13.4, 6, -7); c.fov = 40; c.updateProjectionMatrix(); window.__app.mode.instance.dbg.S.doorState.open = 1; });
    await page.waitForTimeout(1200); await page.screenshot({ path: '/tmp/qz_door.png' });
    console.log('deurman visible', await page.evaluate(() => window.__app.mode.instance.dbg.S.deurman.group.visible));
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ acc: 0.8, rt: 3, joker: 0.0 }, { acc: 0.8, rt: 3.4, joker: 0.0 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/qz_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { ph: s.phase, q: s.qi, t: s.type, sc: s.score }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    const frames = (n) => page.evaluate((n) => window.__bot(n), n);
    const goto = (type) => page.evaluate((type) => { const d = window.__app.mode.instance.dbg; const i = d.Q.findIndex((q, k) => q.type === type && k > d.state().qi); d.goto(i < 0 ? d.Q.findIndex((q) => q.type === type) : i); }, type);
    await snap('intro0'); await go('s.phase==="intro"'); await frames(20); await snap('title');
    await go('s.phase==="ask"'); await frames(50); await snap('ask');
    // eerste fout, dan goed
    await page.evaluate(() => { const G = window.__app.mode.instance.dbg.G; const ok = G.q.opts.findIndex((o) => o.ok); const bad = [0, 1, 2, 3].find((d) => d !== ok); window.__force = { 0: ['left', 'up', 'right', 'down'][bad] }; });
    await frames(6); await page.evaluate(() => { window.__force = {}; }); await frames(10); await snap('wrong');
    await go('s.phase==="reveal"'); await frames(25); await snap('reveal');
    await go('s.phase==="reveal"', 5); // (negeren)
    await goto('estimate'); await go('s.phase==="ask"'); await frames(80); await snap('estimate');
    await go('s.stage===2', 60 * 20); await frames(30); await snap('estimate2');
    await go('s.phase==="reveal"', 60 * 30); await frames(25); await snap('estimate_reveal');
    await goto('order'); await go('s.phase==="ask"'); await frames(100); await snap('order');
    await goto('sound'); await go('s.phase==="ask"'); await frames(40); await snap('sound');
    await goto('gold'); await go('s.phase==="intro"'); await frames(25); await snap('gold_title'); await go('s.phase==="ask"'); await frames(60); await snap('gold');
    // kip + deurman + joker
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.goto(1); d.setScore(300, 100); });
    await go('s.phase==="ask"'); await page.evaluate(() => { const G = window.__app.mode.instance.dbg.G; G.chickenAt = 0.05; G.q.limit = 40; G.timer = 40; });
    await go('s.chicken', 60 * 5); await frames(70); await snap('chicken');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.S.deurPeek(6); }); await frames(120); await snap('deurman');
    await page.evaluate(() => { window.__force = { 1: 'b' }; }); await frames(3); await page.evaluate(() => { window.__force = {}; }); await frames(10); await snap('joker');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setScore(500, 480); d.goto(9); });
    await go('s.type==="gold" && s.phase==="ask"', 60 * 10);
    await go('s.phase==="final"', 60 * 400); await frames(60); await snap('final');
    console.log('render-info', JSON.stringify(await page.evaluate(() => { const r = window.__app.mode.ctx.renderer.info; return { calls: r.render.calls, tris: r.render.triangles }; })));
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(fails ? `\n${fails} MISLUKT` : '\nALLES OK');
server.close();
process.exit(fails ? 1 : 0);
