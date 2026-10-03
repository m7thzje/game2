// Gebruik: node tools/test_deurdisco.mjs [scenario...]   scenario: bots | twists | idle | sab | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp PRECIES één keer komt, dat beide spelers kunnen winnen,
// dat de sabotages werken, dat elke twist werkt en dat er geen console-fouten zijn.
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
let failed = 0; const check = (ok, msg) => { console.log((ok ? 'OK   ' : 'FAIL ') + msg); if (!ok) failed++; };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=deurdisco&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    window.__fin = []; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.push(r); return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1, naive: kans dat hij bij een sabotage de grote rij van de Deurman volgt i.p.v. zijn eigen rij, style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 99; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ round: -1, plan: [], hold: false }));
    window.__cfg = cfg;
    const KEY = ['left', 'up', 'down', 'right', 'a', 'b'];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.P[i];
          for (const kk of KEY) v[kk] = false; v.x = 0; v.y = 0;
          if (c.style === 'idle') continue;
          if (st.cur !== b.round && st.open) {
            b.round = st.cur;
            const naive = me.sab && rnd() < (c.naive ?? 0);
            const seq = naive ? st.combo : me.req;
            const d0 = 0.28 + (1 - c.skill) * 0.55 + rnd() * 0.15, iv = 0.15 + (1 - c.skill) * 0.28;
            b.plan = seq.map((g, j) => ({ t: st.r0 + d0 + j * iv + (me.revealT ? me.revealT[j] : 0) * 0 , g, j })); b.iv = iv; b.seq = seq;
            if (me.revealT) b.plan.forEach((p) => { p.t = Math.max(p.t, st.r0 + me.revealT[p.j] + 0.05); });
          }
          if (!st.open || me.done || me.lock > 0 || !b.plan.length) continue;
          if (st.songT >= b.plan[0].t) {
            const p = b.plan.shift(); let g = p.g;
            if (rnd() < (1 - c.skill) * 0.12) { g = (g + 1 + Math.floor(rnd() * 5)) % 6; b.plan = b.seq.map((gg, j) => ({ t: st.songT + b.iv * (2 + j), g: gg, j })); }
            let gg = g;
            if (m.twist.id === 'swapab' && gg >= 4) gg = gg === 4 ? 5 : 4;
            if (m.twist.id === 'invert' && gg < 4) gg = [3, 2, 1, 0][gg];
            v[KEY[gg]] = true;
          }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (['bots', 'twists', 'idle'].includes(name)) {
    const bs = (a, b, nv = 0) => [{ skill: a, naive: nv, style: 'play' }, { skill: b, naive: nv, style: 'play' }];
    const list = name === 'twists' ? TWISTS.map((t) => [t, bs(0.8, 0.65)])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]], ['none', [{ skill: 0.9, style: 'play' }, { style: 'idle' }]]]
        : [[process.env.TW || 'none', bs(0.95, 0.6, 0.5)], [process.env.TW || 'none', bs(0.6, 0.95, 0.5)], [process.env.TW || 'none', bs(0.9, 0.9, 0.5)]];
    const wins = [0, 0]; let flashes = 0;
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance; let g = 0;
        while (!m.finished && g++ < 60 * 100) window.__bot(1);
        for (let k = 0; k < 200; k++) window.__bot(1);      // na afloop: nog steeds precies één finishPvp?
        return { st: inst.dbg.state(), finished: m.finished, result: m.result, fin: window.__fin.length, twist: m.twist.id };
      });
      const P = res.st.P; flashes += res.st.stats.flashes;
      console.log(`\n=== ${name} twist=${res.twist} T=${res.st.songT.toFixed(1)} score=${P.map((p) => p.score)} perfect=${P.map((p) => p.perfects)} goed=${P.map((p) => p.goods)} mis=${P.map((p) => p.misses)} maxcombo=${P.map((p) => p.maxCombo)} flashes=${res.st.stats.flashes} flashesSent=${P.map((p) => p.flashesSent)}`);
      if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ').slice(0, 160)}`);
      check(res.finished && res.fin === 1, `finishPvp precies één keer (aantal=${res.fin}, finished=${res.finished})`);
      check(res.result && res.result.winner != null, 'er is een winnaar');
      check(!errors.length, 'geen console-fouten' + (errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''));
      if (res.result && res.result.winner != null) wins[res.result.winner]++;
      await browser.close();
    }
    if (name === 'bots') { console.log('winsten per speler', wins, 'flashes', flashes); check(wins[0] > 0 && wins[1] > 0, 'beide spelers kunnen winnen'); check(flashes > 0, 'de Deurman-flash komt voor'); }
    if (name === 'twists') console.log('winsten per speler', wins);
    continue;
  }
  if (name === 'sab') {
    // elke sabotage los: de eigen rij van het slachtoffer wijkt af, een naïeve bot (volgt de grote rij) faalt, een slimme bot slaagt
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ skill: 1, naive: 1, style: 'play' }, { skill: 1, naive: 0, style: 'play' }]);
    const r = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg, out = {};
      for (const id of ['spiegel', 'nep', 'trager']) {
        window.__bot(1); const st0 = d.state();
        // wacht tot er net een ronde klaar is, zet de sabotage klaar voor beide spelers en speel de volgende ronde
        d.queueSab(0, id); d.queueSab(1, id);
        const target = st0.cur + 1; let g = 0; while (d.state().cur < target && g++ < 60 * 20) window.__bot(1);
        const st = d.state(); out[id] = { combo: st.combo, req: st.P.map((p) => p.req), sab: st.P.map((p) => p.sab) };
        g = 0; while (d.state().cur === target && d.state().open && g++ < 60 * 8) window.__bot(1);
        const e = d.state(); out[id].res = e.P.map((p) => p.res); out[id].mist = e.P.map((p) => p.mistakes);
      }
      return out;
    });
    console.log(JSON.stringify(r));
    check(r.spiegel.req[0].join() !== r.spiegel.combo.join() || r.spiegel.combo.every((g) => g >= 4), 'spiegel: eigen rij wijkt af van de pose');
    check(r.nep.req[0].length === r.nep.combo.length + 1, 'nep: extra stap in de eigen rij');
    check(r.trager.sab[0] === 'trager', 'trager: sabotage actief');
    check(r.nep.res[0] === 'miss' || r.nep.mist[0] > 0, 'naïeve bot struikelt over de nep-stap');
    check(['perfect', 'good'].includes(r.nep.res[1]) && ['perfect', 'good'].includes(r.spiegel.res[1]), 'slimme bot slaagt ondanks sabotage');
    check(!errors.length, 'geen console-fouten' + (errors.length ? '\n' + errors.slice(0, 6).join('\n') : ''));
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.97, naive: 0.5, style: 'play' }, { skill: 0.7, naive: 0.5, style: 'play' }]);
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/dd_${tag}.png` }); const s = await page.evaluate(() => { const d = window.__app.mode.instance.dbg.state(); return { songT: +d.songT.toFixed(1), cur: d.cur, score: d.P.map((p) => p.score), streak: d.P.map((p) => p.streak), sab: d.P.map((p) => p.sab) }; }); console.log('shot', tag, JSON.stringify(s)); };
    const go = (cond, max = 60 * 90) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await go('s.cur>=0 && s.open && s.songT-s.r0>0.9 && s.P[0].idx>=1', 60 * 30); await snap('step');
    await go('s.cur>=1 && !s.open', 60 * 30); await page.evaluate(() => window.__bot(8)); await snap('judge');
    await page.evaluate(() => window.__app.mode.instance.dbg.queueSab(1, 'spiegel')); await go('s.P[1].sab==="spiegel" && s.songT-s.r0>0.7', 60 * 30); await snap('spiegel');
    await page.evaluate(() => window.__app.mode.instance.dbg.queueSab(1, 'nep')); await go('s.P[1].sab==="nep" && s.songT-s.r0>0.7', 60 * 30); await snap('nep');
    await page.evaluate(() => window.__app.mode.instance.dbg.queueSab(1, 'trager')); await go('s.P[1].sab==="trager" && s.songT-s.r0>0.6', 60 * 30); await snap('trager');
    await go('s.cur>=12 && s.open && s.songT-s.r0>0.5', 60 * 90); await snap('mid');
    await go('s.cur>=19 && s.open && s.songT-s.r0>0.5', 60 * 90); await snap('finale');
    await go('s.finished', 60 * 100); await page.evaluate(() => window.__bot(60)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(failed ? `\n${failed} CHECK(S) FAALDEN` : '\nALLES OK');
server.close();
process.exit(failed ? 1 : 0);
