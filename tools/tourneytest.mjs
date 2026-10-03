// Test: volledig toernooi (5 duels) in de Speelhal, met automatisch doorklikken. Controleert Kampioen + 50 heitjes.
// PLAYERS=3: toernooi voor drie (Wes, Jor, Juul): elke ronde een paar uit de wachtrij (winnaar blijft), stand per speler, eindwinnaar = meeste punten.
// Standaard met ?unlock=1 (alle hallen open). LOCKED=1: geen hallen gebouwd -> het toernooi mag alleen spellen uit de Speelhal (hal 0) kiezen.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 650 } });
const P3 = process.env.PLAYERS === '3';
const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack||'').split('\n').slice(1,4).join(' | ')));
await page.goto(`http://localhost:${port}/?quality=low&unlock=${process.env.LOCKED ? 0 : 1}${P3 ? '&players=3' : ''}`);
await page.waitForFunction(() => window.__app && window.__app.games, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(() => window.__app.goArcade({}));
await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs, null, { timeout: 60000 });
if (process.env.EXCL) await page.evaluate(async () => { const { S } = await import('/src/save.js'); const ids = Object.keys(window.__app.games).filter((id) => window.__app.mode.hall.ids.includes(id)); S.arcade.excluded = ids.slice(3); S.arcade.tlen = 8; window.__allowed = ids.slice(0, 3); });
const c0 = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { coins: S.coins, t: [...S.arcade.tourneys], plays: S.arcade.plays, wins: [...S.arcade.wins] }; });
await page.evaluate(() => { const m = window.__app.mode; for (const p of m.players) { p.x = 12; p.z = -2; } window.__log = []; window.__t = m.startTourney(); });
let duels = 0, done = false;
for (let i = 0; i < 400 && !done; i++) {
  const r = await page.evaluate(async () => {
    const app = window.__app, m = app.mode, inp = app.input;
    const { S } = await import('/src/save.js');
    if (!m) return 'wait';
    if (m.ctx) {   // minigame
      if (m.finished) { if (m.resultReady) { const id0 = m.ids[0]; inp.virtual[id0].a = true; inp.update(); m.update(0.016); inp.virtual[id0].a = false; inp.update(); m.update(0.016); return 'close'; } return 'wait'; }
      if (!m.__seen) { m.__seen = true; return 'new ' + m.def.id + ' ' + (m.extra && m.extra.tourney); }
      if (!m.__go) {
        m.__go = true;
        for (const id of m.ids) inp.virtual[id].a = true; inp.update(); m.update(0.016);
        for (const id of m.ids) inp.virtual[id].a = false; inp.update(); m.update(0.016);
        await new Promise((r) => setTimeout(r, 400));
        let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); }
        for (let k = 0; k < 60; k++) { inp.update(); m.update(0.016); }
        const ws = S.arcade.plays % 3 === 0 ? null : S.arcade.plays % 2; window.__log.push({ ids: m.ids.slice(), ws, pair: m.extra && m.extra.players });
        m.ctx.finishPvp({ winner: ws, score: ws === 1 ? [0, 1] : [1, 0], summary: 'toernooitest' }); return 'finish';
      }
      return 'wait';
    }
    if (m.cabs) { for (const p of m.players) { p.x = 12; p.z = -2; }  const ui = (await import('/src/engine/ui.js')).ui; return (ui.dialogActive() || m.menu || m.modal) ? 'dialog' : 'idle'; }
    return 'other';
  });
  if (r.startsWith('new')) await page.waitForTimeout(700);
  if (r === 'dialog') { await page.evaluate(() => { const v = window.__app.input.virtual; v[0].a = true; }); await page.waitForTimeout(150); await page.evaluate(() => { window.__app.input.virtual[0].a = false; }); await page.waitForTimeout(150); }
  if (r !== 'dialog' && r !== 'wait' && r !== 'idle' && r !== 'close') console.log(i, r);
  if (r === 'close') duels++;
  const s = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { coins: S.coins, t: [...S.arcade.tourneys], plays: S.arcade.plays }; });
  if (s.plays >= c0.plays + (process.env.EXCL ? 3 : 5) && s.coins >= c0.coins + (process.env.EXCL ? 110 : 150)) { done = true; console.log('toernooi klaar', JSON.stringify({ c0, s })); }
  await page.waitForTimeout(250);
}
await page.waitForTimeout(3000);
const fin = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { by: Object.keys(S.arcade.byGame).join(','), coins: S.coins, t: [...S.arcade.tourneys], plays: S.arcade.plays, wins: [...S.arcade.wins] }; });
console.log('toegestaan:', await page.evaluate(() => window.__allowed), 'duels gespeeld:', duels, 'eind:', JSON.stringify(fin), 'start:', JSON.stringify(c0));
await page.screenshot({ path: '/tmp/tourney_end.png' });
let bad = 0;
if (P3) {   // controle: paren uit de wachtrij, punten per speler en eindwinnaar
  const log = await page.evaluate(() => window.__log); const pts = [0, 0, 0];
  for (const r of log) { if (r.ws == null) r.ids.forEach((i) => { pts[i] += 1 / r.ids.length; }); else pts[r.ids[r.ws]] += 1; }
  const mx = Math.max(...pts), tops = pts.map((p, i) => (p === mx ? i : -1)).filter((i) => i >= 0), exp = tops.length === 1 ? tops[0] : null;
  const dt = fin.t.map((v, i) => v - c0.t[i]); const got = dt.indexOf(1) >= 0 ? dt.indexOf(1) : null;
  const ok = (cond, what) => { console.log(cond ? 'OK  ' : 'FOUT', what); if (!cond) bad++; };
  console.log('rondes (ids, winnaar-slot):', JSON.stringify(log.map((r) => [r.ids.join(''), r.ws])));
  ok(log.length === 5 && log.every((r) => r.ids.length === 2 && r.ids[0] !== r.ids[1]), 'elke ronde een paar van 2 uit 3 spelers');
  ok(new Set(log.flatMap((r) => r.ids)).size === 3, 'alle drie de spelers komen aan de beurt (winnaar blijft, wachtende komt erin)');
  ok(log.slice(1).every((r, k) => { const prev = log[k]; return r.ids.some((i) => !prev.ids.includes(i)); }), 'volgend paar bevat steeds de wachtende speler');
  ok(got === exp, `eindwinnaar = meeste punten: punten ${pts.map((p) => Math.round(p * 10) / 10).join('/')}, verwacht ${exp}, toernooi-winst bij ${got}`);
  ok(fin.wins.reduce((a, b) => a + b, 0) - c0.wins.reduce((a, b) => a + b, 0) === log.filter((r) => r.ws != null).length, 'duel-winsten per speler geteld: ' + fin.wins.join('-'));
}
if (process.env.LOCKED) { const hall0 = (await import('/home/user/game2/src/games/index.js')).ARCADE_HALLS[0].ids; const played = fin.by.split(','); console.log(played.every((id) => hall0.includes(id)) ? 'OK   toernooi gebruikt alleen ontgrendelde hal (hal 0)' : 'FOUT toernooi pakte spellen uit een dichte hal: ' + played); }
console.log(errors.length ? 'ERRORS ' + errors.join(' | ') : 'NO ERRORS');
await b.close(); server.close(); if (bad) process.exit(1);
