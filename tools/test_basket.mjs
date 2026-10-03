// Gebruik: node tools/test_basket.mjs [scenario...]   scenario: bots | twists | idle | timeout | events | physics | shots
//   TW=<twist-id> kiest een twist (anders "none"). Q=low|high kwaliteit. N=<aantal potjes> voor 'bots'.
// Bots spelen versneld (zonder renderen) hele potjes; rapporteert winnaar, aantal finishPvp-aanroepen (moet precies 1 zijn), fouten.
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
let FAILS = 0; const fail = (m) => { FAILS++; console.log('FAIL: ' + m); };

async function open(twist) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=basket&quality=${process.env.Q || 'low'}&twist=${twist || 'none'}&scare=0`);
  await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    mode.paused = false;
    window.__fin = { n: 0, last: null }; const orig = mode.ctx.finishPvp; mode.ctx.finishPvp = (r) => { window.__fin.n++; window.__fin.last = r; return orig(r); };
    inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); mode.update(0.016);
    inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    mode.paused = true;
  });
  return { browser, page, errors };
}

// cfg[i] = { skill: 0..1, style: 'play'|'idle' }
async function installBots(page, cfg) {
  await page.evaluate((cfg) => {
    const app = window.__app, m = app.mode, inst = m.instance, inp = app.input;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v)); const HX = 9.6;
    window.__cfg = cfg; window.__bs = [{ tick: 0 }, { tick: 0 }];
    window.__bot = (n, stop) => {
      const dt = 1 / 60; m.paused = false;
      for (let k = 0; k < n && !m.finished; k++) {
        const st = inst.dbg.state(); if (stop && stop(st)) { m.paused = true; return true; }
        for (const i of [0, 1]) {
          const v = inp.virtual[i], c = window.__cfg[i], bs = window.__bs[i], me = st.players[i], opp = st.players[1 - i], B = st.ball; v.a = false; v.b = false; v.x = 0; v.y = 0; bs.tick++;
          if (c.style === 'idle') continue;
          const hoop = me.dir * HX, goTo = (x, tol = 0.35) => { const d = x - me.x; v.x = Math.abs(d) > tol ? Math.sign(d) : 0; };
          if (st.gstate === 'tip') { goTo(0, 1.5); continue; }
          if (st.gstate === 'scored') { continue; }
          if (me.hold) {
            if (bs.poss !== B.holder + ':' + (me.sc > 7.5 ? 1 : 0) && me.sc > 7.5) { bs.poss = B.holder + ':1'; bs.dT = Math.random() < 0.3 + 0.3 * c.skill ? 7.0 : 3.2 + Math.random() * 2; bs.dunk = Math.random() < 0.25 * c.skill && !st.ball.giant; bs.rel = 0; bs.pressed = false; bs.jumped = false; }
            if (B.giant > 0 || bs.dunk) { const dx = hoop - me.x; goTo(hoop - me.dir * 2.8, 0.3); if (Math.abs(dx) < 3.6) v.b = bs.tick % 3 === 0; continue; }
            const spot = hoop - me.dir * bs.dT; const dx = spot - me.x;
            if (Math.abs(dx) > 0.5 && !me.charging) { v.x = Math.sign(dx); continue; }
            const ideal = me.ideal;
            if (!me.charging) { if (me.grabAge > 0.2 && st.gstate === 'play') { if (bs.pressed) { bs.pressed = false; } else { v.a = true; bs.pressed = true; } } }
            else {
              v.a = true; const p = me.chargeT / 1.0; const wantJump = p >= ideal - 0.36 && !bs.jumped && c.skill > 0.4; if (wantJump) { v.y = -1; bs.jumped = true; }
              const tol = 0.03 + (1 - c.skill) * 0.2, urgent = me.sc < 1.2;
              if ((me.apex || (c.skill <= 0.4 && me.grounded)) && Math.abs(p - ideal) < tol) v.a = false;
              if (!wantJump && bs.jumped && !me.grounded && me.apex && Math.abs(p - ideal) < tol * 2) v.a = false;
              if (urgent || p > 1.2) v.a = false;
              if (me.grounded && bs.jumped && me.vy <= 0 && p > ideal + 0.15) v.a = false;
            }
            continue;
          }
          bs.pressed = false; bs.jumped = false; if (me.grabAge < 0.5) bs.poss = '';
          if (B.state === 'held') {   // tegenstander heeft de bal: verdedigen / stelen
            const guard = opp.x + opp.dir * 2.0; goTo(guard, 0.5);
            if (Math.abs(opp.x - me.x) < 2.0 && me.swingCd <= 0 && st.ref !== 'look' && st.ref !== 'warn' && Math.random() < 0.05 + 0.25 * c.skill && opp.grabAge > 0.4) v.b = true;
            if (st.ref === 'look' && Math.random() < 0.01 * (1 - c.skill)) v.b = true;   // domme bot beukt soms ondanks de Deurman
            continue;
          }
          // losse bal / bal in de lucht
          const tx = B.x + B.vx * 0.15; goTo(tx, 0.3);
          const reach = Math.abs(B.x - me.x) < 1.9 && B.y < me.y + 3.3 && B.y > me.y - 0.3;
          if (reach && bs.tick % 4 < 2) v.a = true;
          if (B.y > 3.2 && Math.abs(B.x - me.x) < 1.6 && me.grounded) v.y = -1;
          if (B.state === 'flight' && B.shooter === 1 - i && Math.abs(B.x - me.x) < 2.6 && B.t < 0.5 && c.skill > 0.5 && me.grounded) v.y = -1;
          if (B.state === 'flight' && B.shooter === 1 - i && !me.grounded && me.swingCd <= 0 && Math.abs(B.x - me.x) < 2.6) v.b = true;
        }
        inp.update(); m.update(dt);
      }
      m.paused = true;
      return false;
    };
  }, cfg);
}

for (const name of scen) {
  if (['bots', 'twists', 'idle', 'timeout'].includes(name)) {
    const A = { skill: 0.95, style: 'play' }, Bw = { skill: 0.3, style: 'play' }, M = { skill: 0.7, style: 'play' };
    const N = +(process.env.N || 3);
    const list = name === 'twists' ? TWISTS.map((t) => [t, [M, M]])
      : name === 'idle' ? [['none', [{ style: 'idle' }, { style: 'idle' }]]]
        : name === 'timeout' ? [['none', [{ style: 'idle' }, M]], ['none', [M, { style: 'idle' }]]]
          : [[process.env.TW || 'none', [A, Bw]], [process.env.TW || 'none', [Bw, A]], ...Array.from({ length: N }, () => [process.env.TW || 'none', [M, M]])];
    const wins = [0, 0];
    for (const [tw, cfg] of list) {
      const { browser, page, errors } = await open(tw);
      await installBots(page, cfg);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, inst = m.instance, d = inst.dbg; const log = []; let last = ''; let g = 0; const seen = { hoops: 0, chick: 0, items: new Set(), look: 0, tramp: 0 }; let lastScore = '';
        while (!m.finished && g++ < 60 * 400) {
          window.__bot(1);
          const st = d.state(); if (st.ev.hoops > 0) seen.hoops++; if (st.ev.chick > 0) seen.chick++; if (st.item) seen.items.add(st.item.id); if (st.ref === 'look') seen.look++; if (st.tramp) seen.tramp++;
          const key = st.score.join('-'); if (key !== lastScore) { lastScore = key; log.push(`T=${st.T.toFixed(1)} score=${st.score} left=${st.timeLeft.toFixed(1)} ${st.gstate}${st.sd ? ' SD' : ''}`); }
        }
        return { log, st: d.state(), finished: m.finished, result: m.result, twist: m.twist.id, fin: window.__fin.n, seen: { ...seen, items: [...seen.items] } };
      });
      console.log(`\n=== ${name} twist=${res.twist} cfg=${JSON.stringify(cfg)} ===`);
      console.log(res.log.length > 26 ? [...res.log.slice(0, 4), '...', ...res.log.slice(-14)].join('\n') : res.log.join('\n'));
      const st = res.st;
      console.log(`end T=${st.T.toFixed(1)} score=${st.score} finished=${res.finished} finishPvp-calls=${res.fin} sd=${st.sd} stats=${JSON.stringify(st.stats)} seen=${JSON.stringify(res.seen)}`);
      if (res.result) { console.log(`RESULT winner=${res.result.winner} score=${res.result.scoreArr} :: ${res.result.summary.replace(/<[^>]+>/g, ' ')}`); if (res.result.winner != null) wins[res.result.winner]++; }
      if (!res.finished) fail(`${name}/${tw}: niet afgelopen`);
      if (res.fin !== 1) fail(`${name}/${tw}: finishPvp ${res.fin}x aangeroepen`);
      if (res.result && res.result.winner == null) fail(`${name}/${tw}: geen winnaar`);
      console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
      await browser.close();
    }
    console.log(`overwinningen (${name}): Wes ${wins[0]} - Jor ${wins[1]}`);
    if (name === 'bots' && (!wins[0] || !wins[1])) fail('bots: niet beide spelers wonnen minstens één potje');
    continue;
  }
  if (name === 'physics') {
    // gerichte tests: perfect schot scoort altijd, slechte kracht mist, dunk, blok, steal, foute Deurman, schotklok, dubbele punten
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const out = []; m.paused = false; const inp = window.__app.input;
      const tick = (n, stop) => { for (let k = 0; k < n && !m.finished; k++) { inp.update(); m.update(1 / 60); if (stop && stop(d.state())) return true; } return false; };
      const reset = () => { d.setTime(60); tick(1); const s = d.state(); if (s.gstate === 'scored') tick(60 * 3, (q) => q.gstate === 'play'); d.setScore(0, 0); d.setPlayer(0, -3, 0); d.setPlayer(1, 6, 0); };
      tick(60 * 4, (s) => s.gstate === 'play');
      const shot = (label, pl, x, power, opts = {}) => {
        reset(); d.setPlayer(pl, x, opts.y || 0); d.setPlayer(1 - pl, opts.ox ?? -x * 0.2, 0); d.giveBall(pl); tick(8);
        if (opts.jump) { const v = window.__app.input.virtual[pl]; v.y = -1; tick(2); v.y = 0; tick(opts.jump, (s) => s.players[pl].apex); }
        d.shootNow(pl, power); tick(60 * 3, (s) => s.gstate === 'scored' || (s.ball.t > 2.2)); const s = d.state();
        out.push(`${label}: ${s.gstate === 'scored' ? 'GOAL' : 'miss'} score=${s.score} from=${s.ball.from.toFixed(1)} perfect=${s.ball.perfect}`); return s.gstate === 'scored';
      };
      // ideal vermogen van de speler opvragen
      const ideal = (pl, x) => { d.setPlayer(pl, x, 0); return d.state().players[pl].ideal; };
      let ok = 0, n = 0;
      for (const x of [2, 4, 6, 8]) { const id = ideal(0, x); for (let r = 0; r < 4; r++) { n++; if (shot(`perfect x=${x} ideal=${id.toFixed(2)}`, 0, x, id, { jump: 80 })) ok++; } }
      out.push(`PERFECT (springen, top, ideaal vermogen): ${ok}/${n} raak`);
      ok = 0; n = 0; for (const x of [2, 5, 7]) { const id = ideal(1, -x); for (const dp of [-0.3, -0.12, 0.12, 0.3]) { n++; if (shot(`jor x=${-x} dp=${dp}`, 1, -x, id + dp, { jump: 80 })) ok++; } }
      out.push(`Jor, afwijking van ideaal (spring): ${ok}/${n} raak`);
      ok = 0; n = 0; for (let r = 0; r < 10; r++) { n++; if (shot('grond-schot ideaal', 0, 5, ideal(0, 5))) ok++; } out.push(`Wes grondschot ideaal x=5: ${ok}/${n} raak`);
      d.event('hoops'); tick(60); ok = 0; n = 0; for (let r = 0; r < 8; r++) { d.event('hoops'); n++; const x = [2, 4, 6][r % 3]; if (shot('perfect bij bewegende mand x=' + x, 0, x, ideal(0, x), { jump: 80 })) ok++; } out.push(`PERFECT bij bewegende manden: ${ok}/${n} raak`);
      return { out, st: d.state() };
    });
    console.log(res.out.join('\n'));
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
  if (name === 'events') {
    // dunk, blok, steal, foul, schotklok, gimmicks en power-ups forceren
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ style: 'idle' }, { style: 'idle' }]);
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const out = []; m.paused = false; const inp = window.__app.input; const V = (i) => window.__app.input.virtual[i];
      const tick = (n, stop) => { for (let k = 0; k < n && !m.finished; k++) { inp.update(); m.update(1 / 60); if (stop && stop(d.state())) return true; } return false; };
      const wait = () => { let s = d.state(); if (s.gstate === 'scored') tick(60 * 4, (q) => q.gstate === 'play'); d.setScore(0, 0); d.setTime(70); d.ref('away'); };
      const press = (i, k, n = 2) => { V(i)[k] = true; tick(n); V(i)[k] = false; tick(1); };
      tick(60 * 4, (s) => s.gstate === 'play'); wait();
      // dunk
      d.setPlayer(0, 6, 0); d.setPlayer(1, -6, 0); d.giveBall(0); tick(8); press(0, 'b'); tick(60 * 2, (s) => s.gstate === 'scored'); out.push(`dunk: ${d.state().score} dunks=${d.state().stats.dunks}`); wait();
      // geblokte dunk
      d.setPlayer(0, 6, 0); d.setPlayer(1, 8, 0); d.giveBall(0); tick(8); press(0, 'b'); tick(6); V(1).y = -1; tick(2); V(1).y = 0; tick(4); press(1, 'b'); tick(60 * 2); out.push(`blok-dunk: ${d.state().score} blocks=${d.state().stats.blocks} ball=${d.state().ball.state}`); wait();
      // steal
      d.setPlayer(0, 0, 0); d.setPlayer(1, 1.2, 0); d.giveBall(0); tick(40); let ok = 0; for (let r = 0; r < 8; r++) { d.giveBall(0); tick(70); d.setPlayer(0, 0, 0); d.setPlayer(1, 1.2, 0); press(1, 'b', 3); tick(20); if (d.state().ball.holder === 1) ok++; } out.push(`steal 8 pogingen (Deurman weg): ${ok} gelukt`);
      // foul (Deurman kijkt)
      wait(); d.ref('look'); d.setPlayer(0, 0, 0); d.setPlayer(1, 1.2, 0); d.giveBall(0); tick(40); const s0 = d.state().score[0]; press(1, 'b', 3); tick(20); out.push(`foul: score vooraf=${s0} nu=${d.state().score} fouls=${d.state().stats.fouls} ref=${d.state().ref}`);
      // schotklok
      const v0 = d.state().stats.violations; let tries = 0; while (d.state().stats.violations === v0 && tries++ < 4) { wait(); d.setPlayer(0, 0, 0); d.setPlayer(1, 5, 0); d.giveBall(0); tick(60 * 9, (s) => s.stats.violations > v0); } out.push(`schotklok: violations=${d.state().stats.violations} bal bij speler ${d.state().ball.holder} (pogingen ${tries})`);
      // dubbele punten laatste 15 s
      wait(); d.setScore(0, 6); d.setTime(10); d.setPlayer(0, 6, 0); d.giveBall(0); tick(8); press(0, 'b'); tick(60 * 2, (s) => s.gstate === 'scored'); out.push(`comeback x2: score=${d.state().score} (dunk 2 x2 = 4 => 4-6 verwacht)`); wait();
      // gimmicks
      d.event('hoops'); tick(60 * 3); out.push(`hoops: off=${d.state().hoopOff.toFixed(2)}`); d.event('chick'); tick(60 * 3); out.push(`kip: chick=${d.state().ball.chick.toFixed(1)}`);
      d.giveItem('boots', 0); tick(30); out.push(`boots: ${d.state().players[0].boots.toFixed(1)}`); d.giveItem('tramp', 1); tick(30); out.push(`tramp: ${JSON.stringify(d.state().tramp)}`); d.giveItem('giant', 0); tick(30); out.push(`giant: ${d.state().ball.giant.toFixed(1)} r=${d.state().ball.r.toFixed(2)}`);
      d.giveBall(0); d.setPlayer(0, 6, 0); tick(8); press(0, 'b'); tick(60 * 2, (s) => s.gstate === 'scored'); out.push(`reuzen-dunk: ${d.state().score}`); wait();
      const inst = m.instance; inst.onDeurman([true, false]); inst.onSwap(true); inst.onSwap(false); inst.celebrate(0); inst.celebrate(1); tick(20);
      return { out, st: d.state() };
    });
    console.log(res.out.join('\n'));
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
  if (name === 'shots') {
    const { browser, page, errors } = await open(process.env.TW || 'none');
    await installBots(page, [{ skill: 0.9, style: 'play' }, { skill: 0.9, style: 'play' }]);
    const snap = async (tag) => { await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/bk_${tag}.png`, timeout: 240000 }); console.log('shot', tag, JSON.stringify(await page.evaluate(() => { const s = window.__app.mode.instance.dbg.state(); return { g: s.gstate, score: s.score, t: +s.T.toFixed(1), left: +s.timeLeft.toFixed(1) }; }))); };
    const go = (cond, max = 60 * 60) => page.evaluate(([c, mx]) => window.__bot(mx, new Function('s', 'return ' + c)), [cond, max]);
    const ev = (f, a) => page.evaluate(f, a);
    await snap('start');
    await go('s.gstate==="play"', 60 * 10); await ev(() => window.__bot(20)); await snap('tip');
    await go('s.players[0].hold || s.players[1].hold', 60 * 20); await ev(() => window.__bot(15)); await snap('hold');
    await go('s.players[0].charging || s.players[1].charging', 60 * 20); await ev(() => window.__bot(8)); await snap('charge');
    await go('s.ball.state==="flight"', 60 * 20); await ev(() => window.__bot(10)); await snap('flight');
    await go('s.gstate==="scored"', 60 * 40); await ev(() => window.__bot(12)); await snap('scored');
    await ev(() => { const d = window.__app.mode.instance.dbg; d.event('hoops'); d.giveItem('boots', 0); d.giveItem('tramp', 1); }); await ev(() => window.__bot(90)); await snap('items');
    await ev(() => { const d = window.__app.mode.instance.dbg; d.event('chick'); d.ref('look'); }); await ev(() => window.__bot(60)); await snap('chick_look');
    await ev(() => { const d = window.__app.mode.instance.dbg; d.giveItem('giant', 0); d.giveBall(1); d.setPlayer(1, 5, 0); }); await ev(() => window.__bot(40)); await snap('giant');
    await ev(() => { const d = window.__app.mode.instance.dbg; d.setScore(10, 14); d.setTime(8); }); await go('s.gstate==="end"', 60 * 400); await ev(() => window.__bot(30)); await snap('end');
    console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 8).join('\n') : 'NO ERRORS'); if (errors.length) fail('console-errors');
    await browser.close(); continue;
  }
}
console.log(FAILS ? `\n${FAILS} FOUT(EN)` : '\nALLES OK');
server.close();
