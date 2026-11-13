// HUD-controle in een minigame: node tools/hudshot.mjs <spel-id|_quad_test> [teams=0,1/2,3] [ids=0,1,2,3]    (PLAYERS=2|3|4, OUT=<map>, TOAST='tekst', GAMEHAL=0 voor index.html)
// Start het spel via MinigameMode, wacht tot het speelt, toont een toast (TOAST) en maakt een screenshot; print de HUD-vakken (positie per slot).
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import { chromePath, BROWSER_ARGS } from './chrome_path.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = process.env.OUT || '/tmp/hud'; fs.mkdirSync(out, { recursive: true });
const id = process.argv[2] || '_quad_test'; const opt = Object.fromEntries(process.argv.slice(3).map((a) => a.split('=')));
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: chromePath(), args: BROWSER_ARGS });
const W = +(process.env.W || 1100), H = +(process.env.H || 650);
const page = await b.newPage({ viewport: { width: W, height: H } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
const PL = process.env.PLAYERS || '4';
await page.goto(`http://localhost:${port}/${process.env.GAMEHAL === '0' ? '' : 'gamehal.html'}?quality=low&scare=0&unlock=1&players=${PL}`);
await page.waitForFunction(() => window.__app && window.__app.games && window.__app.mode, null, { timeout: 240000 });
await page.waitForTimeout(800);
const ids = opt.ids ? opt.ids.split(',').map(Number) : null;
const teams = opt.teams ? opt.teams.split('/').map((t) => t.split(',').map(Number)) : null;
await page.evaluate(async ([id, ids, teams]) => {
  const app = window.__app, { MinigameMode } = await import('/src/engine/harness.js');
  const def = id === '_quad_test' ? (await import('/src/games/_quad_test.js')).default : app.games[id];
  app.setMode(null);
  const m = new MinigameMode(app, def, { extra: ids || teams ? { ...(ids ? { players: ids } : {}), ...(teams ? { teams } : {}) } : null, twist: 'none', onDone: () => { app.setMode(null); } });
  app.setMode(m); window.__m = m;
}, [id, ids, teams]);
await page.evaluate(() => { const m = window.__m; for (let i = 0; i < 20 && m.state === 'intro'; i++) { m.ready = m.ready.map(() => true); if (m.startCountdown) m.startCountdown(); } });
await page.waitForFunction(() => window.__m.state === 'play', null, { timeout: 60000 });
await page.waitForTimeout(1200);
if (process.env.PILL) await page.evaluate((mode) => { const n = window.__app.net; n.base = 'ready'; n.code = 'ABCD'; n.guests.forEach((g, i) => { g.status = mode === 'all' ? 'connected' : i === 0 ? 'connected' : i === 1 ? 'waiting' : 'lost'; g.pingMs = 54; }); n.emit(); }, process.env.PILL);   // PILL=all|mix: simuleer de online-statuspil
await page.evaluate(async (t) => { const { ui } = await import('/src/engine/ui.js'); ui.hud.setTimer(83); ui.hud.setScore('Stand 2 - 1'); if (t) ui.hud.toast(t, 60000); }, process.env.TOAST || '');
await page.waitForTimeout(1500);
const boxes = await page.evaluate(() => [...document.querySelectorAll('#hud .pbox')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.slot, Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(':'); }).join('  '));
const extra = await page.evaluate(() => { const q = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(':'); }; return `mid=${q('#hud .hud-mid')} toast=${q('#hud .hud-toast')} team=${[...document.querySelectorAll('#hud .hud-team')].map((e) => e.textContent).join('|')}`; });
await page.screenshot({ path: `${out}/${id}_p${PL}${opt.teams ? '_teams' : ''}${process.env.TAG ? '_' + process.env.TAG : ''}.png` });
const pill = await page.evaluate(() => { const e = window.__app.net && window.__app.net.badge; if (!e || e.style.display === 'none') return null; const r = e.getBoundingClientRect(); return e.textContent + ' @' + [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)].join(':'); });
console.log('pil', pill);
console.log(id, 'players', PL, '\n boxes', boxes, '\n', extra);
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 6).join(' || ') : 'NO ERRORS');
await b.close(); server.close();
