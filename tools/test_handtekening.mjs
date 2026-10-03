// Gebruik: node tools/test_deurzegt.mjs [scenario...]   scenario: bots | twists | timeout | idle | sd | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp precies 1x komt, beide spelers kunnen winnen,
// er geen console-errors zijn en dat elke twist uit `twists` werkt. Exitcode 1 bij een mislukte controle.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const GAME = 'handtekening';
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
const TWISTS = ['none', 'invert', 'swapab', 'drunk', 'turbo', 'slowmo', 'giant', 'slippery', 'lowgrav', 'bodyswap', 'deurman'];   // alle 11 (twists weggelaten in de game)
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

// cfg[i] = { skill 0..1 (ruis), forget (kans dat hij de Deurman vergeet), react (s), throw (kans/frame), style: 'idle' | 'play' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    let s = 4242; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const B = [0, 1].map(() => ({ look: -1, freeze: false, hold: 0 }));
    window.__cfg = cfg; window.__hook = null;
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        if (window.__hook) window.__hook(st);
        for (const i of [0, 1]) {
          const v = inp.virtual[i], b = B[i], c = window.__cfg[i], me = st.pl[i], op = st.pl[1 - i];
          v.a = false; v.x = 0; v.y = 0; if (b.hold > 0) { b.hold--; v.b = b.hold > 0; } else v.b = false;
          if (c.style === 'idle' || st.gstate !== 'play') continue;
          // de Deurman: nieuwe waarschuwing -> bepaal of we hem opmerken
          if (st.look === 'warn' && b.look !== st.looks) { b.look = st.looks; b.freeze = rnd() >= c.forget; b.at = c.react * (0.6 + rnd() * 0.8); }
          if ((st.look === 'warn' && b.freeze && st.lookT >= b.at) || (st.look === 'look' && b.freeze)) continue;
          if (st.look === 'cool' || st.look === 'walk') b.freeze = false;
          if (me.stun > 0) continue;
          // doel kiezen: superster > gouden blaadje > power-up kistje > dichtstbijzijnde blaadje
          let tx = null, tz = null, best = 1e9;
          if (st.leaf) { tx = st.leaf.x; tz = st.leaf.z; }
          else if (st.star) { tx = st.star.x; tz = st.star.z; }
          else {
            if (st.box && Math.hypot(st.box.x - me.x, st.box.z - me.z) < 14) { tx = st.box.x; tz = st.box.z; best = 0; }
            if (tx == null) for (const q of st.papers) { const d = Math.hypot(q.x - me.x, q.z - me.z) / (q.v > 1 ? 2.2 : 1); const dOp = Math.hypot(q.x - op.x, q.z - op.z); if (d < best && (dOp > d * 0.7 || c.skill < 0.5)) { best = d; tx = q.x; tz = q.z; } }
          }
          for (const f of st.peels) if (Math.hypot(f.x - me.x, f.z - me.z) < 2.2 && tx != null) { /* banaan ontwijken: kleine zijsprong */ tz += (me.z > f.z ? 3 : -3); }
          if (tx == null) { tx = 0; tz = 7; }
          const dx = tx - me.x, dz = tz - me.z, d = Math.hypot(dx, dz) || 1;
          const nz = (1 - c.skill) * 0.8; v.x = dx / d + (rnd() - 0.5) * nz; v.y = dz / d + (rnd() - 0.5) * nz;
          if (d > 5 && me.st > 0.5 && c.skill > 0.4) v.a = true;
          // banaan gooien als de ander dichtbij is en we er ongeveer naartoe lopen
          const dOp = Math.hypot(op.x - me.x, op.z - me.z);
          if (me.cd <= 0 && dOp < 8 && dOp > 2.5 && rnd() < c.throw) { v.x = (op.x - me.x) / dOp; v.y = (op.z - me.z) / dOp; b.hold = 3; v.b = true; }
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

const strong = { skill: 0.95, forget: 0.03, react: 0.35, throw: 0.02, style: 'play' };
const weak = { skill: 0.55, forget: 0.4, react: 0.7, throw: 0.005, style: 'play' };
const mid = { skill: 0.8, forget: 0.15, react: 0.5, throw: 0.015, style: 'play' };

async function runMatch(name, tw, cfg, pre, hook) {
  const { browser, page, errors } = await open(tw);
  await installBots(page, cfg);
  if (pre) await page.evaluate(pre);
  if (hook) await page.evaluate(hook);
  if (name === 'twists') await page.evaluate(() => { window.__bot(600); const i = window.__app.mode.instance; i.onDeurman([true, false]); i.onSwap(true); i.onDeurman([false, true]); i.onSwap(false); });   // twist-hooks ook echt aanroepen
  const res = await page.evaluate(() => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < 60 * 220) {
      window.__bot(1);
      const st = inst.dbg.state(); const key = st.pl[0].pts + ':' + st.pl[1].pts + ':' + st.sd + ':' + Math.floor(st.T / 10);
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} clock=${st.clock.toFixed(0)} pts=${st.pl[0].pts}-${st.pl[1].pts} look=${st.look} papers=${st.papers.length} sd=${st.sd}`); last = key; }
    }
    for (let k = 0; k < 120; k++) { window.__app.input.update(); m.update(1 / 60); }
    return { log, st: inst.dbg.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin };
  });
  console.log(`\n=== ${name} twist=${res.twist} ===`);
  console.log(res.log.filter((_, k) => k % 3 === 0).join('\n'));
  const st = res.st;
  console.log(`end T=${st.T.toFixed(1)} pts=${st.pl.map((p) => p.pts)} why=${st.why} finished=${res.finished} fin-calls=${res.fin} looks=${st.looks} caught=${st.stats.caught} slips=${st.stats.slips} stars=${st.stats.stars} pw=${st.stats.pw}`);
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
  if (name === 'timeout') {   // tijd bijna om: normale afloop op punten
    const { res } = await runMatch('timeout', 'none', [mid, mid], () => { window.__app.mode.instance.dbg.setTime(6); });
    check(res.result.winner != null, 'timeout: er is een winnaar (' + res.st.why + ')'); continue;
  }
  if (name === 'sd') {   // gelijke stand op tijd 0: sudden death met het gouden blaadje
    const { res } = await runMatch('sd', 'none', [strong, strong], () => { const d = window.__app.mode.instance.dbg; d.setTime(3); window.__hook = (st) => { if (!st.sd && st.clock < 0.3) d.setPts(10, 10); }; });
    check(res.result.winner != null && res.st.why === 'sd', 'sd: gouden blaadje besliste (' + res.st.why + ')'); continue;
  }
  if (name === 'sdnear') {   // niemand pakt het gouden blaadje: de dichtstbijzijnde wint na 20 s
    const { res } = await runMatch('sdnear', 'none', [{ style: 'idle' }, { style: 'idle' }], () => { const d = window.__app.mode.instance.dbg; d.setTime(2); window.__hook = (st) => { if (!st.sd && st.clock < 0.3) d.setPts(4, 4); }; });
    check(res.result.winner != null && res.st.why === 'near', 'sdnear: dichtstbijzijnde wint (' + res.st.why + ')'); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [mid, mid]);
    const snap = async (tag) => { await page.waitForTimeout(900); await page.screenshot({ path: `/tmp/ht_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { look: s.look, pts: s.pl.map((p) => p.pts), papers: s.papers.length, clock: +s.clock.toFixed(1) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await page.evaluate(() => window.__bot(60 * 6)); await snap('play');
    await page.evaluate(() => window.__app.mode.instance.dbg.forceLook());
    await go('s.look==="warn"'); await page.evaluate(() => window.__bot(40)); await snap('warn');
    await go('s.look==="look"'); await page.evaluate(() => { const i = window.__app.input; window.__cfg[1].forget = 1; window.__bot(25); }); await snap('look');
    await go('s.look==="walk"'); await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.planStar(); }); await go('s.starPh==="fall"', 60 * 10); await page.evaluate(() => window.__bot(14)); await snap('star_fall');
    await go('s.starPh==="rest"', 60 * 10); await page.evaluate(() => window.__bot(30)); await snap('star');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveBox(0, 'pen'); d.giveBox(1, 'magnet'); });
    await page.evaluate(() => window.__bot(50)); await snap('powerups');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveBox(0, 'cloak'); d.tp(0, -4, 4); d.tp(1, 4, 4); d.throwB(1); });
    await page.evaluate(() => window.__bot(24)); await snap('banana');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.slip(1); });
    await page.evaluate(() => window.__bot(20)); await snap('slip');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setTime(11.5); });
    await page.evaluate(() => window.__bot(100)); await snap('final');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.setTime(0.2); d.setPts(7, 7); window.__hook = (st) => { if (!st.sd && st.clock < 0.3) d.setPts(7, 7); }; });
    await go('s.sd', 60 * 10); await page.evaluate(() => window.__bot(40)); await snap('sd');
    await go('s.gstate==="end"', 60 * 60); await page.evaluate(() => window.__bot(50)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); check(errors.length === 0, 'shots: geen console-errors');
    await browser.close(); continue;
  }
}
server.close();
console.log(failures ? `\n${failures} controle(s) MISLUKT` : '\nAlle controles OK');
process.exit(failures ? 1 : 0);
