// Gebruik: node tools/test_connect4.mjs [scenario...]   scenario: bots | twists | idle | timeout | draw | sudden | powers | events | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit.
// Bots spelen versneld (zonder renderen) hele potjes; controleert dat finishPvp precies 1x komt, beide spelers kunnen winnen en er geen fouten zijn.
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
  await page.goto(`http://localhost:${port}/?game=connect4&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    // tel de aanroepen van finishPvp
    window.__fin = 0; const orig = mode.finishPvp.bind(mode); mode.finishPvp = (r) => { window.__fin++; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
    window.__logic = await import('/src/games/connect4_logic.js');
  });
  return { browser, page, errors };
}

// cfg[i] = { skill 0..1 (kans op een slimme zet), power 0..1 (kans per beurt om een kracht te gebruiken), style: 'play'|'idle', delay: seconden bedenktijd }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input, d = inst.dbg;
    window.__cfg = cfg; const plan = [null, null]; const IDS = ['bom', 'dubbel', 'draai', 'dief'];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i]; v.left = v.right = v.up = v.down = v.a = v.b = false;
          if (c.style === 'idle') continue;
          if (st.state !== 'turn' || st.turn !== i) { plan[i] = null; continue; }
          if (!plan[i] || plan[i].no !== st.turnNo) {
            const b = d.board(); const L = window.__logic;
            const open = (col) => b.canDrop(col) && !(st.closed && st.closed.col === col);
            const smart = Math.random() < c.skill;
            let col = smart ? L.autoPick(b, i, Math.random, open) : (() => { const o = b.legal().filter(open); return o.length ? o[Math.floor(Math.random() * o.length)] : 3; })();
            let power = null;
            if (!st.sd && st.uses[i] > 0 && Math.random() < c.power) {
              const left = IDS.filter((id) => !st.usedTypes[i].includes(id)); power = left[Math.floor(Math.random() * left.length)] || null;
              if (power === 'dief') { const opts = []; for (let cc = 0; cc < 7; cc++) { const t = b.top(cc); if (t && t.o !== i) opts.push(cc); } if (opts.length) col = opts[Math.floor(Math.random() * opts.length)]; else power = null; }
            }
            plan[i] = { no: st.turnNo, col, power, wait: (c.delay ?? 0.3) * (0.5 + Math.random()), tick: 0 };
          }
          const P = plan[i]; P.wait -= dt; if (P.wait > 0) continue; P.tick++;
          if (P.power && !st.armed[i]) {
            const want = IDS.indexOf(P.power);
            if (st.sel[i] !== want) { if (P.tick % 2) v.down = true; } else if (P.tick % 2) v.b = true;
            continue;
          }
          if (P.power === 'dief' || P.power === 'bom' || !P.power || P.power === 'dubbel') {
            if (st.col < P.col) v.right = true; else if (st.col > P.col) v.left = true;
            else if (P.tick % 2) v.a = true;
          } else if (P.tick % 2) v.a = true;      // draai: geen kolom nodig
        }
        inp.update(); m.update(dt);
      }
      m.paused = true; return false;
    };
  }, cfg);
}

async function runMatch(twist, cfg, opts = {}) {
  const { browser, page, errors } = await open(twist);
  await installBots(page, cfg);
  if (opts.setup) await page.evaluate(opts.setup);
  const res = await page.evaluate(async () => {
    const m = window.__app.mode, inst = m.instance; const log = []; let last = ''; let g = 0;
    while (!m.finished && g++ < 60 * 400) {
      window.__bot(20);
      const st = inst.dbg.state(); const key = `${st.score}|${st.round}|${st.sd}|${st.auto}`;
      if (key !== last) { log.push(`T=${st.T.toFixed(1)} clock=${st.clock.toFixed(1)} round=${st.round} score=${st.score} sd=${st.sd} auto=${st.auto}`); last = key; }
    }
    // laat de eindanimatie even doorlopen om te zien dat er geen dubbele finish komt
    for (let k = 0; k < 120; k++) { window.__app.input.update(); m.update(1 / 60); }
    return { log, st: inst.dbg.state(), finished: m.finished, fin: window.__fin, result: m.result, twist: m.twist.id };
  });
  await browser.close();
  return { res, errors };
}
function report(name, { res, errors }, extra = '') {
  console.log(`\n=== ${name} twist=${res.twist} ===`);
  console.log(res.log.join('\n'));
  const s = res.st.stats;
  console.log(`end T=${res.st.T.toFixed(1)} score=${res.st.score} finished=${res.finished} finishPvp-calls=${res.fin} drops=${s.drops} bombs=${s.bombs} flips=${s.flips} steals=${s.steals} doubles=${s.doubles} magic=${s.magic} kip=${s.chickens} deur=${s.doors} timeouts=${s.timeouts} autos=${s.autos} sd=${s.sd} rounds=${s.rounds}`);
  if (res.result) console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`);
  check(res.fin === 1, 'finishPvp precies 1x');
  check(res.result && res.result.winner !== null, 'er is een winnaar');
  check(res.st.T < 200, `potje blijft binnen redelijke tijd (${res.st.T.toFixed(0)} s speeltijd)`);
  check(errors.length === 0, errors.length ? 'console-errors:\n' + errors.slice(0, 6).join('\n') : 'geen console-errors');
}

const SMART = { skill: 0.9, power: 0.3, delay: 0.3 };
const OKAY = { skill: 0.5, power: 0.3, delay: 0.3 };

for (const name of scen) {
  if (name === 'bots') {
    // beide spelers moeten kunnen winnen: slimme Wes tegen domme Jor en andersom + gelijk
    const wins = [0, 0];
    for (const [a, b] of [[SMART, { skill: 0.2, power: 0.2 }], [{ skill: 0.2, power: 0.2 }, SMART], [SMART, SMART], [OKAY, OKAY]]) {
      const r = await runMatch(process.env.TW || 'none', [a, b]); report('bots', r); if (r.res.result) wins[r.res.result.winner]++;
    }
    console.log('winsverdeling [Wes,Jor]:', wins); check(wins[0] > 0 && wins[1] > 0, 'beide spelers kunnen winnen');
    continue;
  }
  if (name === 'twists') {
    for (const tw of TWISTS) { const r = await runMatch(tw, [OKAY, OKAY]); report('twist', r); }
    continue;
  }
  if (name === 'idle') {
    const r = await runMatch('none', [{ style: 'idle' }, { style: 'idle' }]); report('idle (niemand drukt iets)', r); check(r.res.st.stats.timeouts > 0, 'beurttimer greep in'); continue;
  }
  if (name === 'timeout') {
    // klok bijna op: autopilot moet de ronde afspelen, en bij gelijkspel volgt sudden death
    const r = await runMatch('none', [OKAY, OKAY], { setup: () => window.__app.mode.instance.dbg.setClock(3) }); report('timeout (klok op 3 s)', r); check(r.res.st.stats.autos > 0, 'autopilot speelde mee'); continue;
  }
  if (name === 'draw') {
    // een bijna vol bord zonder rij: laatste munt -> gelijkspel; daarna sudden death (ook bij gelijke stand)
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    await page.evaluate(() => window.__bot(300, (s) => s.state === 'turn'));
    const ok = await page.evaluate(() => window.__app.mode.instance.dbg.almostFull());
    check(ok, 'bijna vol bord gegenereerd');
    await installBots(page, [SMART, SMART]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const log = []; let last = '';
      for (let g = 0; g < 60 * 400 && !m.finished; g++) { window.__bot(10); const s = d.state(); const key = `${s.round}|${s.sd}|${s.score}|${s.state}`; if (key !== last) { log.push(`T=${s.T.toFixed(1)} round=${s.round} state=${s.state} sd=${s.sd} score=${s.score} rounds=${s.stats.rounds}`); last = key; } }
      return { log, st: d.state(), fin: window.__fin, result: m.result, finished: m.finished, twist: m.twist.id };
    });
    report('draw', { res, errors }); check(res.st.stats.rounds[0] === -1, 'eerste ronde was een gelijkspel'); await browser.close(); continue;
  }
  if (name === 'sudden') {
    // 3 gelijkspel-rondes achter elkaar (bijna vol bord, laatste munt) -> sudden death op het mini-bord, gespeeld door bots; met screenshots
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    for (let r = 1; r <= 3; r++) {
      await page.evaluate(() => window.__bot(900, (s) => s.state === 'turn'));
      check(await page.evaluate(() => window.__app.mode.instance.dbg.almostFull()), `ronde ${r}: bijna vol bord`);
      await installBots(page, [{ skill: 0.9, power: 0, delay: 0.1 }, { skill: 0.9, power: 0, delay: 0.1 }]);
      await page.evaluate(() => window.__bot(900, (s) => s.state === 'win'));
      await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
      await page.evaluate(() => window.__bot(60 * 12, (s) => s.state === 'toss' && s.round > 0 && s.stats.rounds.length === 0 ? false : s.state === 'toss'));
    }
    const st = await page.evaluate(() => window.__app.mode.instance.dbg.state());
    console.log('na 3 rondes', JSON.stringify({ score: st.score, sd: st.sd, round: st.round, rounds: st.stats.rounds, state: st.state }));
    check(st.sd, 'sudden death gestart bij gelijke stand');
    await installBots(page, [{ skill: 0.9, power: 0, delay: 0.4 }, { skill: 0.6, power: 0, delay: 0.4 }]);
    await page.evaluate(() => window.__bot(200)); await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/c4_sd.png' });
    const res = await page.evaluate(() => { const m = window.__app.mode, d = m.instance.dbg; const log = []; let last = ''; for (let g = 0; g < 60 * 300 && !m.finished; g++) { window.__bot(10); const s = d.state(); const key = `${s.round}|${s.sd}|${s.sdTries}|${s.state}`; if (key !== last) { log.push(`T=${s.T.toFixed(1)} round=${s.round} state=${s.state} sd=${s.sd} tries=${s.sdTries} rounds=${s.stats.rounds}`); last = key; } } for (let k = 0; k < 120; k++) { window.__app.input.update(); m.update(1 / 60); } return { log, st: d.state(), fin: window.__fin, result: m.result, finished: m.finished, twist: m.twist.id }; });
    report('sudden death', { res, errors }); check(res.st.sd, 'beslist in sudden death'); await browser.close(); continue;
  }
  if (name === 'powers' || name === 'events') {
    const { browser, page, errors } = await open('none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    const out = await page.evaluate(() => {
      const m = window.__app.mode, inp = window.__app.input, d = m.instance.dbg; const log = [];
      const spin = (n) => { m.paused = false; for (let k = 0; k < n && !m.finished; k++) { inp.update(); m.update(1 / 60); } m.paused = true; };
      const press = (i, key) => { inp.virtual[i][key] = true; spin(1); inp.virtual[i][key] = false; spin(1); };
      const until = (cond, max = 1200) => { for (let k = 0; k < max && !cond(d.state()); k++) spin(1); return cond(d.state()); };
      until((s) => s.state === 'toss'); until((s) => s.state === 'turn');
      return { ok: true };
    });
    // eigenlijke scenario's per kracht
    const doPower = async (id) => page.evaluate(async (id) => {
      const m = window.__app.mode, inp = window.__app.input, d = m.instance.dbg;
      const spin = (n) => { m.paused = false; for (let k = 0; k < n && !m.finished; k++) { inp.update(); m.update(1 / 60); } m.paused = true; };
      const press = (i, key) => { inp.virtual[i][key] = true; spin(1); inp.virtual[i][key] = false; spin(1); };
      const until = (cond, max = 1500) => { for (let k = 0; k < max && !cond(d.state()); k++) spin(1); return cond(d.state()); };
      const IDS = ['bom', 'dubbel', 'draai', 'dief'];
      until((s) => s.state === 'turn'); const t0 = d.state(); const p = t0.turn;
      // een paar munten neerleggen: afwisselend in kolommen 2,3,4
      const board = d.board();
      d.giveUses(p, 1);
      let s = d.state(); let guard = 0;
      while (s.sel[p] !== IDS.indexOf(id) && guard++ < 6) { press(p, 'down'); s = d.state(); }
      press(p, 'b'); s = d.state(); const armed = s.armed[p];
      // kolom 3 kiezen
      guard = 0; while (d.state().col !== 3 && guard++ < 10) { inp.virtual[p][d.state().col < 3 ? 'right' : 'left'] = true; spin(2); inp.virtual[p].right = inp.virtual[p].left = false; spin(2); }
      const before = board.count();
      press(p, 'a');
      until((x) => x.state === 'turn' || x.state === 'win' || x.state === 'toss', 1500);
      const after = d.board().count(); const s2 = d.state();
      return { id, armed, p, before, after, state: s2.state, turn: s2.turn, uses: s2.uses, extra: s2.extra, grid: s2.grid };
    }, id);
    if (name === 'powers') {
      for (const id of ['dubbel', 'bom', 'draai', 'dief']) {
        // eerst een paar vaste munten zodat bom/dief iets te doen hebben
        await page.evaluate(() => {
          const m = window.__app.mode, inp = window.__app.input, d = m.instance.dbg;
          const spin = (n) => { m.paused = false; for (let k = 0; k < n && !m.finished; k++) { inp.update(); m.update(1 / 60); } m.paused = true; };
          for (const col of [3, 3, 2, 4, 3, 2]) { const s = d.state(); if (s.state !== 'turn') { for (let k = 0; k < 600 && d.state().state !== 'turn'; k++) spin(1); } const p = d.state().turn; let g = 0; while (d.state().col !== col && g++ < 12) { inp.virtual[p][d.state().col < col ? 'right' : 'left'] = true; spin(2); inp.virtual[p].right = inp.virtual[p].left = false; spin(2); } inp.virtual[p].a = true; spin(1); inp.virtual[p].a = false; spin(1); for (let k = 0; k < 600 && d.state().state !== 'turn'; k++) spin(1); }
        });
        const r = await doPower(id);
        console.log(`power ${id}:`, JSON.stringify({ armed: r.armed, before: r.before, after: r.after, state: r.state, uses: r.uses, extra: r.extra }));
        console.log('   grid', r.grid.join('|'));
        if (id === 'dubbel') check(r.armed === 'dubbel' && r.extra >= 0, 'dubbel was gewapend');
        if (id === 'bom') check(r.after < r.before + 1, `bom ruimde munten op (${r.before} -> ${r.after})`);
        if (id === 'dief') check(r.after <= r.before, `dief pakte een munt of werd geweigerd (${r.before} -> ${r.after})`);
        if (id === 'draai') check(r.after === r.before, `draai behoudt alle munten (${r.before} -> ${r.after})`);
      }
    } else {
      for (const kind of ['kip', 'deur']) {
        const r = await page.evaluate((kind) => {
          const m = window.__app.mode, inp = window.__app.input, d = m.instance.dbg;
          const spin = (n) => { m.paused = false; for (let k = 0; k < n && !m.finished; k++) { inp.update(); m.update(1 / 60); } m.paused = true; };
          for (let k = 0; k < 800 && d.state().state !== 'turn'; k++) spin(1);
          // 6 munten neerzetten
          for (let n = 0; n < 6; n++) { const p = d.state().turn; const col = [3, 2, 4, 1, 5, 3][n]; let g = 0; while (d.state().col !== col && g++ < 12) { inp.virtual[p][d.state().col < col ? 'right' : 'left'] = true; spin(2); inp.virtual[p].right = inp.virtual[p].left = false; spin(2); } inp.virtual[p].a = true; spin(1); inp.virtual[p].a = false; spin(1); for (let k = 0; k < 800 && d.state().state !== 'turn'; k++) spin(1); }
          const c0 = d.board().count(); d.startEvent(kind); const s1 = d.state().state;
          let k = 0; for (; k < 600 && d.state().state === 'power'; k++) spin(1);
          return { kind, c0, c1: d.board().count(), s1, s2: d.state().state, frames: k, closed: d.state().closed };
        }, kind);
        console.log('event', JSON.stringify(r));
        check(r.s1 === 'power' && r.s2 === 'turn', `${kind}-event start en eindigt (${r.frames} frames)`);
        if (kind === 'kip') check(r.c1 === r.c0 - 1, 'kip stal een munt'); else check(!!r.closed, 'Deurman sloot een kolom');
      }
    }
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 6).join('\n') : 'NO ERRORS'); fails += errors.length ? 1 : 0;
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.8, power: 0, delay: 0.5 }, { skill: 0.8, power: 0, delay: 0.5 }]);
    const snap = async (tag) => { await page.waitForTimeout(700); await page.screenshot({ path: `/tmp/c4_${tag}.png` }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { st: s.state, turn: s.turn, round: s.round, score: s.score, grid: s.grid, clock: +s.clock.toFixed(1) }; }))); };
    const go = (cond, max = 60 * 80) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    await go('s.state==="toss"'); await page.evaluate(() => window.__bot(20)); await snap('toss');
    await go('s.count>=9 && s.state==="turn"'); await snap('mid');
    // gewapende bom
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.giveUses(d.state().turn, 1); });
    await page.evaluate(() => { const i = window.__app.input, m = window.__app.mode, d = m.instance.dbg; const p = d.state().turn; m.paused = false; for (const k of ['down', 'b']) { i.virtual[p][k] = true; i.update(); m.update(1 / 60); i.virtual[p][k] = false; i.update(); m.update(1 / 60); } m.paused = true; });
    await snap('armed');
    await page.evaluate(() => { const i = window.__app.input, m = window.__app.mode, d = m.instance.dbg; const p = d.state().turn; m.paused = false; i.virtual[p].a = true; i.update(); m.update(1 / 60); i.virtual[p].a = false; for (let k = 0; k < 100; k++) { i.update(); m.update(1 / 60); } m.paused = true; });
    await snap('bomb');
    await page.evaluate(() => window.__bot(70));
    await page.evaluate(() => { window.__app.mode.instance.dbg.startEvent('kip'); window.__app.mode.paused = false; for (let k = 0; k < 75; k++) { window.__app.input.update(); window.__app.mode.update(1 / 60); } window.__app.mode.paused = true; });
    await snap('kip');
    await page.evaluate(() => { const m = window.__app.mode; m.paused = false; for (let k = 0; k < 220; k++) { window.__app.input.update(); m.update(1 / 60); } m.paused = true; window.__app.mode.instance.dbg.startEvent('deur'); m.paused = false; for (let k = 0; k < 100; k++) { window.__app.input.update(); m.update(1 / 60); } m.paused = true; });
    await snap('deur');
    await page.evaluate(() => { const m = window.__app.mode; m.paused = false; for (let k = 0; k < 160; k++) { window.__app.input.update(); m.update(1 / 60); } m.paused = true; });
    await installBots(page, [{ skill: 1, power: 0, delay: 0.1 }, { skill: 1, power: 0, delay: 0.1 }]);
    await go('s.state==="win"', 60 * 200); await page.evaluate(() => window.__bot(70)); await snap('win');
    await go('s.state==="clear"', 60 * 20); await page.evaluate(() => window.__bot(80)); await snap('next');
    await page.evaluate(() => window.__app.mode.instance.dbg.setClock(0.5));
    await go('s.sd', 60 * 400); await page.evaluate(() => window.__bot(100)); await snap('sd');
    await go('s.finished', 60 * 400); await page.evaluate(() => { for (let k = 0; k < 70; k++) { window.__app.input.update(); window.__app.mode.update(1 / 60); } }); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS');
    await browser.close(); continue;
  }
}
console.log(fails ? `\n${fails} CHECK(S) MISLUKT` : '\nALLE CHECKS OK');
server.close();
