// Gebruik: node tools/test_tanks.mjs [scenario ...]
//  4 spelers (2 tegen 2, alle spelers schieten tegelijk): four (volledige potjes met bots, uitslag met teams), four-logic (teamgenoten onschendbaar, KO van een kasteel, einde), four-idle (niemand drukt iets), four-shots (/tmp/tk4_*.png)
//  scenario: bots (meerdere potjes met bots, rapporteert einde/winnaar), input (besturing + twists), idle (niemand drukt iets: automatisch schot -> finishPvp),
//            shots (screenshots van verschillende momenten), types (alle projectieltypes + chaosbeurten screenshots)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { chromePath } from './chrome_path.mjs';
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
const browser = await chromium.launch({ executablePath: chromePath(), args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const allErrors = [];

async function open(twist = 'none', size = [1100, 650], np = 2) {
  const page = await browser.newPage({ viewport: { width: size[0], height: size[1] } });
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|Failed to load resource/.test(m.text())) allErrors.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => allErrors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
  await page.goto(`http://localhost:${port}/?game=tanks&twist=${twist}&scare=0&quality=low&players=${np}`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.instance, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  await page.evaluate(async () => {
    const app = window.__app, mode = app.mode, inp = app.input;
    for (const q of mode.ids) inp.virtual[q].a = true; inp.update(); mode.update(0.016);
    for (const q of mode.ids) inp.virtual[q].a = false; inp.update(); mode.update(0.016);
    await new Promise((r) => setTimeout(r, 600));
    let g = 0; while (mode.state !== 'play' && g++ < 2000) { inp.update(); mode.update(0.016); }
    // bot-helper
    const m = mode, inst = m.instance, d = inst.dbg;
    let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) * 1.6;
    window.__rnd = rnd;
    window.__sigma = [3, 4, 3, 4];       // [hoek, kracht] ruis per speler, kan per scenario worden aangepast
    window.__skill = [1, 1, 1, 1];
    window.__aimed = {};
    window.__bot = (n, opts = {}) => {
      for (let k = 0; k < n && !m.finished; k++) {
        const st = d.state();
        if (st.phase === 'aim' && !opts.idle) {
          for (const i of st.shooters) {
            const key = st.turn + ':' + i + ':' + st.shots[i];
            if (window.__aimed[key]) continue;
            const p = d.pl[i];
            if (p.fired) continue;
            // wacht even zodat het "denken" niet 0 s duurt
            window.__aimed[key] = st.T;
            let best = null;
            for (let ang = -50; ang <= 85; ang += 3) for (let pow = 15; pow <= 100; pow += 3) {
              const r = d.predict(i, ang, pow);
              const sc = r.hit ? -100 : r.best;
              if (!best || sc < best.sc) best = { sc, ang, pow };
            }
            const sg = window.__sigma[i];
            const ang = best.ang + gauss() * sg, pow = Math.max(10, Math.min(100, best.pow + gauss() * sg * 1.3));
            window.__plan = window.__plan || {}; window.__plan[i] = { ang, pow, at: st.T + 0.5 + rnd() * 2.5 };
          }
          for (const i of st.shooters) {
            const pl = window.__plan && window.__plan[i]; const p = d.pl[i];
            if (pl && !p.fired && st.T >= pl.at) { d.setAim(i, pl.ang, pl.pow); d.fireNow(i); window.__plan[i] = null; }
          }
        }
        inp.update(); m.update(1 / 60);
      }
    };
  });
  return page;
}

let bad4 = 0;
const chk = (ok, msg) => { console.log((ok ? 'OK   ' : 'FOUT ') + msg); if (!ok) bad4++; };
for (const name of scen) {
  if (name === 'four') {
    for (const tw of process.env.TW ? process.env.TW.split(',') : ['none', 'bodyswap', 'lowgrav', 'drunk']) {
      const page = await open(tw, [1100, 650], 4);
      const res = await page.evaluate(() => {
        window.__sigma = [4, 6, 4, 6];
        const m = window.__app.mode, d = m.instance.dbg; let fin = 0; const f0 = m.ctx.finishPvp; m.ctx.finishPvp = (r) => { fin++; return f0(r); };
        let guard = 0, shooters4 = 0, turns = 0, last = -1;
        while (!m.finished && guard++ < 60 * 500) { window.__bot(6); const st = d.state(); if (st.phase === 'aim' && st.turn !== last) { last = st.turn; turns++; if (st.shooters.length === 4) shooters4++; } }
        for (let k = 0; k < 60; k++) window.__bot(6);
        return { fin: m.finished, calls: fin, st: d.state(), result: m.result, turns, shooters4 };
      });
      const r = res.result;
      console.log(`four twist=${tw} turns=${res.turns} hp=${res.st.hp} dealt=${res.st.dealt} T=${res.st.T.toFixed(1)} :: ${r ? r.summary.replace(/<[^>]+>/g, '') : ''}`);
      const ok = res.fin && res.calls === 1 && r && r.ids.length === 4 && r.place.length === 4 && r.winnerIds.length === (r.winner == null ? 0 : 2) && r.scoreArr.length === 4 && res.shooters4 >= 1;
      chk(ok, `four ${tw}: einde, 1x finishPvp, winnaars=${r && r.winnerIds} plaatsen=${r && r.place}`);
      await page.close();
    }
    chk(allErrors.length === 0, allErrors.length ? 'console-errors: ' + allErrors.slice(0, 5).join(' | ') : 'geen console-errors');
    if (bad4 || allErrors.length) process.exitCode = 1;
    continue;
  }
  if (name === 'four-idle') {
    const page = await open('none', [1100, 650], 4);
    const res = await page.evaluate(() => { const m = window.__app.mode, d = m.instance.dbg; let g = 0; while (!m.finished && g++ < 60 * 600) window.__bot(10, { idle: true }); return { fin: m.finished, st: d.state(), result: m.result }; });
    chk(res.fin && res.result && res.result.ids.length === 4, `four-idle: niemand drukt, automatische schoten, toch een uitslag (winnaars=${res.result && res.result.winnerIds}, T=${res.st.T.toFixed(0)})`);
    chk(allErrors.length === 0, allErrors.length ? allErrors.slice(0, 5).join(' | ') : 'geen console-errors');
    if (bad4 || allErrors.length) process.exitCode = 1;
    continue;
  }
  if (name === 'four-logic') {
    const page = await open('none', [1100, 650], 4);
    const res = await page.evaluate(() => {
      const out = []; const ok = (n, c, i = '') => out.push(`${c ? 'OK   ' : 'FOUT '}${n} ${i}`);
      const m = window.__app.mode, d = m.instance.dbg, inp = window.__app.input;
      let g = 0; while (d.state().phase !== 'aim' && g++ < 5000) { inp.update(); m.update(1 / 60); }
      const cs = d.castles;
      ok('4 kastelen: team 0 links (-34, -12), team 1 rechts (34, 12)', cs.map((c) => c.cx).join() === '-34,-12,34,12' && cs.map((c) => c.side).join() === '1,1,-1,-1', cs.map((c) => c.cx + '/' + c.side).join());
      ok('teams = [[0,1],[2,3]]', JSON.stringify(d.teams) === '[[0,1],[2,3]]');
      ok('iedereen schiet tegelijk (4 schutters)', d.state().shooters.length === 4 && d.state().sim === true, JSON.stringify(d.state().shooters));
      // teamgenoot onschendbaar, vijand en jezelf niet
      d.boom(-12, 7, 0); ok('inslag van Wes op het kasteel van teamgenoot Jor: geen schade', cs[1].hp === 100, 'hp=' + cs.map((c) => c.hp));
      d.boom(12, 7, 0); ok('inslag van Wes op een vijandelijk kasteel: schade', cs[3].hp < 100 && cs[2].hp === 100, 'hp=' + cs.map((c) => c.hp));
      d.boom(-34, 7, 0); ok('inslag op je eigen kasteel kost je zelf (zoals bij een duel)', cs[0].hp < 100, 'hp=' + cs.map((c) => c.hp));
      ok('schade telt voor de schutter (vijand), niet voor teamgenoot', d.pl[0].dealt > 0 && d.pl[1].dealt === 0, 'dealt=' + d.pl.map((p) => Math.round(p.dealt)));
      // een kasteel laten vallen: spel gaat door met de rest; daarna het tweede kasteel van dat team: einde
      cs[3].hp = 3; d.boom(12, 7, 1); ok('kasteel 3 (Sam) verwoest', cs[3].ko === true);
      ok('team 1 leeft nog (kasteel 2)', !m.finished);
      d.endShot(); const st = d.state(); ok('volgende ronde zonder de uitgeschakelde schutter', st.phase === 'aim' && st.shooters.join() === '0,1,2', 'shooters=' + st.shooters + ' phase=' + st.phase);
      cs[2].hp = 2; d.boom(34, 7, 0); ok('kasteel 2 verwoest', cs[2].ko === true);
      d.endShot(); ok('beide kastelen van team 1 weg: KO-fase', d.state().phase === 'ko', d.state().phase + ' winner=' + d.state().winner);
      let gg = 0; while (!m.finished && gg++ < 1200) { inp.update(); m.update(1 / 30); }
      const r = m.result; ok('uitslag: team Wes & Jor wint', m.finished && r && r.winnerIds.join() === '0,1' && r.place.length === 4 && r.place[0] <= 1 && r.place[1] <= 1, r && `winnerIds=${r.winnerIds} place=${r.place} score=${r.scoreArr}`);
      return out;
    });
    console.log(res.join('\n')); bad4 += res.filter((l) => l.startsWith('FOUT')).length;
    chk(allErrors.length === 0, allErrors.length ? allErrors.slice(0, 5).join(' | ') : 'geen console-errors');
    if (bad4 || allErrors.length) process.exitCode = 1;
    continue;
  }
  if (name === 'four-shots') {
    const page = await open('none', [1100, 650], 4);
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); for (let k = 0; k < 4; k++) { try { await page.screenshot({ path: `/tmp/tk4_${tag}.png`, timeout: 90000 }); break; } catch (e) { await page.waitForTimeout(1500); } } await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => { window.__bot(2); const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().phase !== 'aim' && g++ < 6000) window.__bot(1); window.__bot(30); });
    await snap('aim');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().projs < 3 && g++ < 6000) window.__bot(1); window.__bot(30); });
    await snap('fly');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().phase !== 'aim' && g++ < 6000) window.__bot(1); d.castles[3].hp = 12; d.castles[1].hp = 40; window.__bot(30); });
    await snap('damaged');
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; d.castles[3].hp = 5; d.boom(12, 7, 0); const m = window.__app.mode; for (let k = 0; k < 90; k++) { window.__app.input.update(); m.update(1 / 30); } });
    await snap('ko3');
    console.log(allErrors.length ? 'ERRORS:\n' + allErrors.slice(0, 5).join('\n') : 'NO ERRORS');
    continue;
  }
  if (name === 'bots') {
    const rows = [];
    const twists = ['none', 'invert', 'swapab', 'drunk', 'lowgrav', 'bodyswap'];
    const wins = [0, 0, 0]; let runs = 0;
    for (let g = 0; g < (+process.env.N || 8); g++) {
      const tw = twists[g % twists.length];
      const page = await open(tw);
      const sg = [[3, 4], [10, 12]][g % 2]; const sgs = process.env.BAD ? [+process.env.BAD, +process.env.BAD] : g % 4 < 2 ? [sg[0], sg[0]] : [3, 14];
      await page.evaluate((gt) => { window.__GT = gt; }, +process.env.GT || 0);
      const res = await page.evaluate(({ sgs }) => {
        window.__sigma = sgs; if (window.__GT) window.__app.mode.instance.dbg.S.gameT = window.__GT;
        const m = window.__app.mode, d = m.instance.dbg; let guard = 0; const log = [];
        let last = '';
        while (!m.finished && guard++ < 60 * 400) {
          window.__bot(6);
          const st = d.state(); const key = st.turn + st.phase;
          if (key !== last) { last = key; if (st.phase === 'aim') log.push(`T=${st.T.toFixed(1)} t${st.turn} ${st.chaos || ''} ${st.shooters} ${st.types} w${st.wind} hp=${st.hp}`); }
        }
        return { fin: m.finished, st: d.state(), result: m.result, log };
      }, { sgs });
      runs++;
      const w = res.result ? res.result.winner : 'x';
      wins[w === null ? 2 : w === 'x' ? 2 : w]++;
      console.log(`game ${g} twist=${tw} sigma=${sgs} fin=${res.fin} winner=${w} turns=${res.st.turn} T=${res.st.T.toFixed(1)} gameT=${res.st.gameT.toFixed(1)} hp=${res.st.hp} dealt=${res.st.dealt} shots=${res.st.shots} :: ${res.result ? res.result.summary.replace(/<[^>]+>/g, '') : ''}`);
      if (g === 0) console.log(res.log.join('\n'));
      await page.close();
    }
    console.log('winners [Wes,Jor,none]', wins, 'of', runs);
  } else if (name === 'dbg') {
    const page = await open('none');
    const res = await page.evaluate(() => {
      const m = window.__app.mode, d = m.instance.dbg; const out = [];
      for (let k = 0; k < 60 * 25; k++) { window.__bot(1); const s = d.state(); if (k % 60 === 0) out.push(`${s.T.toFixed(1)} ${s.phase} hp=${s.hp} dealt=${s.dealt} types=${s.types}`); }
      return out;
    });
    console.log(res.join('\n')); await page.close();
  } else if (name === 'chaos') {
    const page = await open(process.env.TWIST || 'none');
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); for (let k = 0; k < 4; k++) { try { await page.screenshot({ path: `/tmp/tanks_${tag}.png`, timeout: 90000 }); break; } catch (e) { await page.waitForTimeout(1500); } } await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    for (const id of ['storm', 'giant', 'flip', 'sim']) {
      await page.evaluate((id) => { const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().phase !== 'aim' && g++ < 6000) window.__bot(1); d.startChaos(id); window.__plan = {}; window.__bot(40); }, id);
      await snap('chaos_' + id + '_aim');
      await page.evaluate((id) => { const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().projs === 0 && g++ < 6000) window.__bot(1); window.__bot(id === 'giant' ? 36 : 28); }, id);
      await snap('chaos_' + id + '_fly');
      const st = await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while ((d.state().phase === 'fly' || d.state().phase === 'aim') && g++ < 6000 && d.state().turn % 4 === 0) window.__bot(1); return d.state(); });
      console.log(id, JSON.stringify(st));
    }
    await page.close();
  } else if (name === 'ko') {
    const page = await open(process.env.TWIST || 'none');
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); for (let k = 0; k < 4; k++) { try { await page.screenshot({ path: `/tmp/tanks_${tag}.png`, timeout: 90000 }); break; } catch (e) { await page.waitForTimeout(1500); } } await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().phase !== 'ko' && g++ < 60 * 300) window.__bot(1); window.__bot(40); });
    await snap('ko1');
    await page.evaluate(() => { window.__bot(70); });
    await snap('ko2');
    await page.evaluate(() => { const m = window.__app.mode; let g = 0; while (!m.finished && g++ < 600) window.__bot(1); window.__bot(120); });
    await snap('ko3');
    await page.close();
  } else if (name === 'idle') {
    for (const tw of ['none', 'lowgrav']) {
      const page = await open(tw);
      const res = await page.evaluate(() => {
        const m = window.__app.mode, d = m.instance.dbg; let guard = 0;
        while (!m.finished && guard++ < 60 * 600) window.__bot(10, { idle: true });
        return { fin: m.finished, st: d.state(), result: m.result };
      });
      console.log(`idle twist=${tw} fin=${res.fin} winner=${res.result && res.result.winner} turns=${res.st.turn} gameT=${res.st.gameT.toFixed(1)} hp=${res.st.hp} :: ${res.result ? res.result.summary.replace(/<[^>]+>/g, '') : ''}`);
      await page.close();
    }
  } else if (name === 'input') {
    for (const tw of ['none', 'invert', 'swapab', 'drunk']) {
      const page = await open(tw);
      const res = await page.evaluate(() => {
        const app = window.__app, m = app.mode, d = m.instance.dbg, inp = app.input;
        const out = {};
        const frames = (n, f) => { for (let k = 0; k < n; k++) { if (f) f(k); inp.update(); m.update(1 / 60); } };
        frames(20);
        let st = d.state(); const i = st.shooters[0]; const v = inp.virtual[i]; out.shooter = i;
        // bij bodyswap wijst pvp.input naar de andere broer; hier niet van toepassing
        const a0 = d.pl[i].ang, p0 = d.pl[i].pow;
        v.y = -1; frames(30); v.y = 0; out.angUp = d.pl[i].ang - a0;
        const a1 = d.pl[i].ang; v.x = i === 0 ? 1 : -1; frames(30); v.x = 0; out.powToward = d.pl[i].pow - p0;
        // tik A -> direct schot
        out.projBefore = d.state().projs;
        v.a = true; frames(2); v.a = false; frames(2);
        out.shotTap = d.pl[i].shots; out.phaseAfterTap = d.state().phase;
        return out;
      });
      console.log('input', tw, JSON.stringify(res));
      await page.close();
    }
    // houd-ingedrukt-krachtmeter
    {
      const page = await open('none');
      const res = await page.evaluate(() => {
        const app = window.__app, m = app.mode, d = m.instance.dbg, inp = app.input;
        const frames = (n, f) => { for (let k = 0; k < n; k++) { if (f) f(k); inp.update(); m.update(1 / 60); } };
        frames(40);
        const i = d.state().shooters[0]; const v = inp.virtual[i]; const out = {};
        v.a = true; frames(50); out.charging = d.pl[i].charging; out.chg1 = d.pl[i].chg; frames(20); out.chg2 = d.pl[i].chg;
        v.a = false; frames(2); out.shots = d.pl[i].shots; out.pow = d.pl[i].pow; out.phase = d.state().phase;
        return out;
      });
      console.log('hold', JSON.stringify(res)); await page.close();
    }
  } else if (name === 'shots' || name === 'types') {
    const tw = process.env.TWIST || 'none';
    const page = await open(tw, [1100, 650]);
    const snap = async (tag) => { await page.evaluate(() => { window.__app.mode.paused = true; }); await page.waitForTimeout(900); for (let k = 0; k < 4; k++) { try { await page.screenshot({ path: `/tmp/tanks_${tag}.png`, timeout: 90000 }); break; } catch (e) { await page.waitForTimeout(1500); } } await page.evaluate(() => { window.__app.mode.paused = false; }); console.log('shot', tag); };
    await page.evaluate(() => window.__bot(30));
    await snap('aim');
    if (name === 'shots') {
      // wacht tot er iets vliegt
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().projs === 0 && g++ < 6000) window.__bot(1); window.__bot(40); });
      await snap('fly');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().phase !== 'aim' && g++ < 6000) window.__bot(1); window.__bot(20); });
      await snap('aim2');
      // speel door tot turn 4 (chaos)
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().turn < 4 && g++ < 60 * 200) window.__bot(1); window.__bot(70); });
      await snap('chaos');
      await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while (!window.__app.mode.finished && g++ < 60 * 300) window.__bot(1); });
      await page.evaluate(() => window.__bot(1)); await snap('end');
    } else {
      for (const id of ['cow', 'cake', 'fire', 'egg', 'cabbage', 'ball']) {
        await page.evaluate((id) => {
          const d = window.__app.mode.instance.dbg; let g = 0; while (d.state().phase !== 'aim' && g++ < 6000) window.__bot(1);
          const i = d.state().shooters[0]; d.setType(i, id);
          // goed schot zoeken
          let best = null; for (let ang = -30; ang <= 85; ang += 3) for (let pow = 20; pow <= 100; pow += 3) { const r = d.predict(i, ang, pow); const sc = r.hit ? -100 : r.best; if (!best || sc < best.sc) best = { sc, ang, pow }; }
          d.setAim(i, best.ang + (id === 'fire' || id === 'egg' ? -8 : 0), best.pow); d.fireNow(i);
          window.__plan = { 0: null, 1: null };
          g = 0; while (d.state().projs === 0 && g++ < 100) window.__bot(1);
          window.__bot(id === 'egg' ? 90 : 55);
        }, id);
        await snap('type_' + id);
        await page.evaluate(() => { const d = window.__app.mode.instance.dbg; let g = 0; while ((d.state().projs > 0 || d.state().dragons > 0) && g++ < 3000) window.__bot(1); window.__bot(1); });
      }
    }
    await page.close();
  }
}
console.log(allErrors.length ? 'ERRORS:\n' + [...new Set(allErrors)].slice(0, 10).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
