// Het Feestbord keert terug naar de hal waar de tafel stond: node tools/boardhall.mjs   (GAMEHAL=1|0, PLAYERS=2|3|4)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { chromePath, BROWSER_ARGS } from './chrome_path.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: chromePath(), args: BROWSER_ARGS });
const page = await b.newPage({ viewport: { width: 900, height: 560 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/${process.env.GAMEHAL === '1' ? 'gamehal.html' : ''}?quality=low&unlock=1${process.env.PLAYERS ? '&players=' + process.env.PLAYERS : ''}`);
await page.waitForFunction(() => window.__app && window.__app.games && Object.keys(window.__app.games).length > 40, null, { timeout: 240000 });
await page.waitForTimeout(800);
let fails = 0; const check = (n, ok, d = '') => { console.log(`${ok ? 'OK  ' : 'FOUT'} ${n}${ok ? '' : ' -> ' + d}`); if (!ok) fails++; };
const hallNow = () => page.evaluate(() => window.__app.mode && window.__app.mode.hallId);
for (const hall of (process.env.HALLS || "2,3,0").split(",").map(Number)) {
  await page.evaluate(async (hall) => { const { S } = await import('/src/save.js'); S.flags.met_king = true; S.flags.intro_done = true; for (let i = 0; i < 5; i++) S.flags['met_hall' + i] = true; await window.__app.goArcade({ extra: { hall }, via: 'door', fromHall: 0 }); }, hall);
  await page.waitForFunction((hall) => window.__app.mode && window.__app.mode.hallId === hall && window.__app.mode.life, hall, { timeout: 90000 });
  // zoals de tafel doet: partyMenu -> goBoard({ hall })
  await page.evaluate((hall) => { const m = window.__app.mode; m.busy = false; window.__app.goBoard({ hall: m.hallId, manual: true }); }, hall);
  await page.waitForFunction(() => window.__app.mode && window.__app.mode.world && window.__app.mode.B, null, { timeout: 90000 });
  // duel-terugkeer verliest opts.hall (goBoard({ result, from })): hal moet bewaard blijven
  await page.evaluate(() => window.__app.goBoard({ resume: true }));
  await page.waitForFunction(() => window.__app.mode && window.__app.mode.world, null, { timeout: 90000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => { const m = window.__app.mode; m.toArcade(); });
  await page.waitForFunction(() => window.__app.mode && window.__app.mode.hallId !== undefined && window.__app.mode.life, null, { timeout: 90000 });
  const h = await hallNow(); check(`Feestbord vanuit hal ${hall} keert terug naar hal ${hall}`, h === hall, 'hal ' + h);
}
// vers bord zonder hal (bijv. testhaak of oude aanroep) = hal 0
await page.evaluate(() => window.__app.goBoard({ manual: true })); await page.waitForFunction(() => window.__app.mode && window.__app.mode.world && window.__app.mode.B, null, { timeout: 90000 });
await page.evaluate(() => { window.__app.mode.toArcade(); }); await page.waitForFunction(() => window.__app.mode && window.__app.mode.life, null, { timeout: 90000 });
check('goBoard({}) zonder hal -> hal 0', (await hallNow()) === 0);
check('geen fouten', errors.length === 0, errors.slice(0, 3).join(' || '));
await b.close(); server.close(); process.exit(fails ? 1 : 0);
