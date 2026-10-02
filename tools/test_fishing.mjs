// Gebruik: node tools/test_fishing.mjs [scenario] [uit-prefix]
// Scenario's: bot (speelt de hele game met een slimme bot) | idle (doet niets: moet tijdig eindigen) | shot (screenshots van fases)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const scen = process.argv[2] || 'bot'; const MODE = process.argv[4] || ''; const out = process.argv[3] || `/tmp/fishing_${scen}`;
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/404|niet geladen|CERT/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '')));
await page.goto(`http://localhost:${port}/?game=fishing&quality=${process.env.Q || 'low'}&scare=0`);
await page.waitForFunction(() => window.__app && window.__app.mode, null, { timeout: 30000 });
await page.waitForTimeout(1000);
for (let k = 0; k < 12; k++) {
  if (await page.evaluate(() => window.__app.mode.state !== 'intro')) break;
  await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = true; i.virtual[1].a = true; });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const i = window.__app.input; i.virtual[0].a = false; i.virtual[1].a = false; });
  await page.waitForTimeout(600);
}
await page.waitForFunction(() => window.__app.mode.state === 'countdown' || window.__app.mode.state === 'play', null, { timeout: 15000 });

const BOT = `
  const app = window.__app, inp = app.input, V = inp.virtual; const I = () => app.mode.instance;
  const TIPZ = -1.5, TIPX = 0;
  const step = (n = 1) => { for (let k = 0; k < n; k++) { inp.update(); app.mode.update(0.05); } };
  const clear = () => { for (const v of V) { v.x = 0; v.y = 0; v.a = false; v.b = false; } };
  const log = [];
  window.__botStep = () => {
    const d = I().dbg(); const a = d.angler, n = 1 - a;
    clear();
    const M = window.__mode;
    if (M === 'mash') { for (const v of V) { v.a = Math.random() < 0.5; v.x = Math.random() < 0.5 ? 1 : -1; v.b = Math.random() < 0.05; } step(1); return; }
    if (M === 'snap' && (d.phase === 'fight' || d.phase === 'net')) { V[a].a = true; const dx = (d.phase === 'net' ? d.fx : d.lineX) - d.boatX; V[n].x = Math.abs(dx) > 0.15 ? Math.sign(dx) : 0; step(1); return; }
    if (M === 'misscoop' && d.phase === 'net') { V[n].a = Math.random() < 0.6; step(1); return; }
    if (M === 'earlybite' && d.phase === 'wait') { V[a].a = d.bobSub !== 'seek' ? Math.random() < 0.4 : false; step(1); return; }
    if (d.phase === 'cast') {
      // kies een doelvis
      let best = null, bs = 1e9;
      for (const s of d.swimmers) { if (s.k.id === 'boot') continue; const dx = s.x - TIPX, dz = s.z - TIPZ; const D = Math.hypot(dx, dz); if (D < 8.6 || D > 17.8 || Math.abs(Math.atan2(dx, -dz)) > 0.68) continue; const sc = (s.k.id === 'giant' ? -50 : s.k.id === 'gold' ? -20 : s.k.id === 'medium' ? -8 : 0) + D * 0.1; if (sc < bs) { bs = sc; best = s; } }
      if (!best) { step(1); return; }
      const dx = best.x - TIPX, dz = best.z - TIPZ; const th = Math.atan2(dx, -dz); const D = Math.hypot(dx, dz);
      window.__want = { th, p: Math.max(0, Math.min(1, (D - 8.4) / 9.6)) };
      const diff = th - d.aim;
      if (Math.abs(diff) > 0.03) { V[a].x = Math.sign(diff); step(1); return; }
      V[a].a = true; step(1); return;
    }
    if (d.phase === 'charge') {
      const w = window.__want || { th: d.aim, p: 0.5 };
      const diff = w.th - d.aim; if (Math.abs(diff) > 0.03) V[a].x = Math.sign(diff);
      const pw = I().dbgPower ? I().dbgPower() : 0;
      V[a].a = !(pw >= w.p); step(1); return;
    }
    if (d.phase === 'wait') { if (d.bobSub === 'bite') { V[a].a = true; } step(1); return; }
    if (d.phase === 'fight') {
      const run = d.mode !== 'calm';
      if (d.kind === 'giant') { /* afwisselend */ const who = d.lastP === a ? n : a; if (run) { step(1); return; } if (d.T > 0.85) { step(1); return; } if (Math.random() < 0.8) { V[who].a = true; } step(1); return; }
      V[a].a = !(run || d.T > 0.72);
      const dx = d.lineX - d.boatX; V[n].x = Math.abs(dx) > 0.15 ? Math.sign(dx) : 0; step(1); return;
    }
    if (d.phase === 'net') {
      const dx = d.fx - d.boatX; V[n].x = Math.abs(dx) > 0.2 ? Math.sign(dx) : 0;
      if (d.kind === 'giant') { if (Math.abs(dx) < 0.8 && Math.random() < 0.5) { V[n].a = true; V[a].a = true; } }
      else if (d.kind === 'boot') { /* laat de laars gaan */ }
      else if (Math.abs(dx) < 0.7) V[n].a = true;
      step(1); return;
    }
    step(1);
  };
`;
await page.evaluate(`(() => { ${BOT} })()`); await page.evaluate(`window.__mode = '${MODE}'`);
if (scen === 'shot') {
  const conds = [['cast', "d.phase==='cast' && d.elapsed>1"], ['charge', "d.phase==='charge'"], ['bite', "d.phase==='wait' && d.bobSub==='bite'"], ['fight', "d.phase==='fight' && d.T>0.3"], ['run', "d.phase==='fight' && d.mode==='run'"], ['net', "d.phase==='net'"], ['caught', "d.phase==='caught'"], ['giant', "d.giant && d.phase==='cast' && d.elapsed>12"]];
  await page.evaluate(() => { while (window.__app.mode.state !== 'play') { window.__app.input.update(); window.__app.mode.update(0.05); } });
  for (const [name, cond] of conds) {
    await page.evaluate(`(() => { let g = 0; while (window.__app.mode.state === 'play' && g++ < 8000) { const d = window.__app.mode.instance.dbg(); if (${cond}) break; window.__botStep(); } })()`);
    await page.waitForTimeout(250);
    await page.screenshot({ path: out + '_' + name + '.png' });
    console.log('shot', name, JSON.stringify(await page.evaluate(() => { const d = window.__app.mode.instance.dbg(); return { phase: d.phase, e: d.elapsed, k: d.kind }; })));
  }
  console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
  await browser.close(); server.close(); process.exit(0);
}
const res = await page.evaluate(async ({ scen }) => {
  const app = window.__app; const I = () => app.mode.instance;
  while (app.mode.state !== 'play') { window.__app.input.update(); app.mode.update(0.05); }
  const trace = []; let g = 0, lastPhase = '', lastScore = 0; const t0 = performance.now();
  const swaps = []; let lastAng = I().dbg().angler;
  while (app.mode.state === 'play' && g++ < 12000) {
    if (scen === 'idle') { window.__app.input.update(); app.mode.update(0.05); continue; }
    window.__botStep();
    const d = I().dbg();
    if (d.phase !== lastPhase) { trace.push(`${d.elapsed.toFixed(1)} ${d.phase}${d.kind ? ':' + d.kind : ''} sc${d.score}`); lastPhase = d.phase; }
    if (d.angler !== lastAng) { swaps.push(d.elapsed.toFixed(1) + 's -> angler ' + d.angler); lastAng = d.angler; }
  }
  for (let k = 0; k < 6; k++) { window.__app.input.update(); app.mode.update(0.05); }
  return { trace: trace.join('\n'), swaps, state: app.mode.state, res: app.mode.result, final: I().dbg(), steps: g };
}, { scen });
console.log(res.trace); console.log('SWAPS', JSON.stringify(res.swaps)); console.log('STATE', res.state, JSON.stringify(res.res), 'steps', res.steps);
await page.waitForTimeout(1800);
await page.screenshot({ path: out + '_end.png' });
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
