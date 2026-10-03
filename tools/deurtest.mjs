// Test: de Deurman neemt een hal van de Speelhal over (waarschuwing -> deur -> sluipen -> gepakt -> takeover -> spookduel -> verjaagd)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 650 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join('|')));
page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__app && window.__app.games, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.settings.scare = 2; S.flags.met_king = true; });
await page.evaluate(() => window.__app.goArcade({}));
await page.waitForFunction(() => window.__app.mode && window.__app.mode.deur, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const st = () => page.evaluate(() => window.__app.mode.deur && window.__app.mode.deur.state);
const log = [];
const note = async (tag) => { const s = await st(); log.push(tag + ':' + s); console.log(tag, s); };
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; m.deur.timer = 0.05; for (const p of m.players) { p.x = (p.i ? 6 : -6); p.z = 12; } });
for (let i = 0; i < 40 && (await st()) !== 'warn'; i++) await page.waitForTimeout(250);
await note('warn'); await page.screenshot({ path: '/tmp/deur_warn.png' });
for (let i = 0; i < 60 && (await st()) !== 'door'; i++) await page.waitForTimeout(250);
await note('door'); await page.waitForTimeout(1800); await page.screenshot({ path: '/tmp/deur_door.png' });
for (let i = 0; i < 40 && (await st()) !== 'stalk'; i++) await page.waitForTimeout(250);
await note('stalk');
// lantaarn: laat Wes naar de Deurman kijken en B vasthouden
await page.evaluate(() => { const m = window.__app.mode; const d = m.deur; const p = m.players[0]; const gp = d.m.group.position; p.x = gp.x; p.z = gp.z + 9; p.yaw = Math.PI; window.__app.input.virtual[0].b = true; });
await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/deur_stalk.png' });
// eerst verjagen (lantaarn blijft op hem gericht)
for (let i = 0; i < 80 && (await st()) === 'stalk'; i++) { await page.evaluate(() => { const m = window.__app.mode; const p = m.players[0]; const gp = m.deur.m.group.position; p.x = gp.x; p.z = gp.z + 8; p.yaw = Math.PI; }); await page.waitForTimeout(250); }
await page.evaluate(() => { window.__app.input.virtual[0].b = false; });
await note('na-lantaarn');
const coins = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { c: S.coins, banished: S.banished }; });
console.log('verjaagd?', JSON.stringify(coins));
// tweede ronde: laat hem je pakken
await page.waitForTimeout(1500);
await page.evaluate(() => { const m = window.__app.mode; m.deur.state = 'idle'; m.deur.timer = 0.05; });
for (let i = 0; i < 80 && (await st()) !== 'stalk'; i++) await page.waitForTimeout(250);
await page.evaluate(() => { const m = window.__app.mode; const gp = m.deur.m.group.position; for (const p of m.players) { p.x = gp.x + 1; p.z = gp.z + 1; } });
for (let i = 0; i < 40 && (await st()) !== 'takeover'; i++) { await page.evaluate(() => { const v = window.__app.input.virtual[0]; v.a = true; }); await page.waitForTimeout(150); await page.evaluate(() => { window.__app.input.virtual[0].a = false; }); await page.waitForTimeout(150); }
await note('gepakt');
await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/deur_takeover.png' });
// spookduel via de route van de hal
const mode0 = await page.evaluate(() => { const m = window.__app.mode; return m.deur.takeover; });
console.log('takeover actief:', mode0);
await page.evaluate(() => { window.__app.mode.launch('dodgeball'); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.ctx, null, { timeout: 60000 });
const tw = await page.evaluate(() => ({ twist: window.__app.mode.ctx.twist.id, spooky: !!(window.__app.mode.extra && window.__app.mode.extra.spooky) }));
console.log('duel:', JSON.stringify(tw));
await page.waitForTimeout(600);
await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); m.update(0.016); });
await page.waitForTimeout(500);
await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); } m.ctx.finishPvp({ winner: 0, score: [1, 0], summary: 'spooktest' }); });
await page.waitForFunction(() => window.__app.mode.resultReady, null, { timeout: 20000 });
await page.screenshot({ path: '/tmp/deur_result.png' });
await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; inp.virtual[0].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.update(); m.update(0.016); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.deur, null, { timeout: 60000 });
// dialogen wegklikken tot hij verdwenen is
for (let i = 0; i < 60; i++) { const s = await st(); if (s === 'idle') break; await page.evaluate(() => { window.__app.input.virtual[0].a = true; }); await page.waitForTimeout(150); await page.evaluate(() => { window.__app.input.virtual[0].a = false; }); await page.waitForTimeout(250); }
await note('na-spookduel');
await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/deur_after.png' });
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' || ') : 'NO ERRORS');
await b.close(); server.close();
