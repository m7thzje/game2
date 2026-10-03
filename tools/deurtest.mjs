// Test: DEURENFEESTJE: de Deurman neemt een hal van de Speelhal over (disco-waarschuwing -> deur -> dansen naar high-five -> selfie-licht verjaagt / gepakt -> DJ op de troon -> feest-duel -> hal terug)
// Screenshots: /tmp/deur_warn|door|stalk|takeover|result|after.png
// PLAYERS=3: met Juul erbij: selfie-licht (lantaarn + kegel) per speler, ook van Juul (speler 2), en een feest-duel met 2 van de 3.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 650 } });
const P3 = process.env.PLAYERS === '3';
const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join('|')));
page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/?quality=low&unlock=1${P3 ? '&players=3' : ''}`);
await page.waitForFunction(() => window.__app && window.__app.games, null, { timeout: 90000 });
await page.waitForTimeout(1500);
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.settings.scare = 2; S.flags.met_king = true; });
await page.evaluate(() => window.__app.goArcade({}));
await page.waitForFunction(() => window.__app.mode && window.__app.mode.deur, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const st = () => page.evaluate(() => window.__app.mode.deur && window.__app.mode.deur.state);
const log = [];
const note = async (tag) => { const s = await st(); log.push(tag + ':' + s); console.log(tag, s); };
// de wereld loopt hier op ~4 fps (software-GL): daarom de hal-update zelf in stapjes van 0.05 s voortbewegen
const adv = (target, max = 600, pre = '') => page.evaluate(async ([target, max, pre]) => { const m = window.__app.mode, inp = window.__app.input; const f = pre ? new Function('m', 'inp', pre) : null; for (let i = 0; i < max && m.deur.state !== target; i++) { f && f(m, inp); inp.update(); m.update(0.05); } return m.deur.state; }, [target, max, pre]);
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; m.deur.timer = 0.05; for (const p of m.players) { p.x = (m.players.length === 3) ? (p.i - 1) * 6 : (p.i ? 6 : -6); p.z = 12; } });
await adv('warn'); await note('warn'); await page.screenshot({ path: '/tmp/deur_warn.png' });
await adv('door'); await page.evaluate(() => { for (let i = 0; i < 40; i++) window.__app.mode.update(0.05); }); await note('door'); await page.screenshot({ path: '/tmp/deur_door.png' });
await adv('stalk'); await note('stalk');
// selfie-licht: laat Wes naar de Deurman kijken en B vasthouden: hij bloost en danst weg
const SELFIE = P3 ? 2 : 0;   // met 3 spelers: Juul houdt het selfie-licht vast (en Wes er ook bij)
await page.evaluate(([S_, P3]) => { const m = window.__app.mode; const p = m.players[S_]; const gp = m.deur.m.group.position; p.x = gp.x; p.z = gp.z + 9; p.yaw = Math.PI; window.__app.input.virtual[S_].b = true; if (P3) { const q = m.players[0]; q.x = gp.x - 3; q.z = gp.z + 9; q.yaw = Math.PI; window.__app.input.virtual[0].b = true; } for (let i = 0; i < 20; i++) { window.__app.input.update(); m.update(0.05); } }, [SELFIE, P3]);
if (P3) { const li = await page.evaluate(() => { const d = window.__app.mode.deur; return { lamps: d.lamps.length, cones: d.cones.map((c) => c.visible), light: d.lamps.map((l) => Math.round(l.intensity)) }; }); console.log(li.lamps === 3 && li.cones[0] && !li.cones[1] && li.cones[2] && li.light[2] > 50 && li.light[1] === 0 ? 'OK   3 selfie-lampen: Wes en Juul stralen, Jor niet ' + JSON.stringify(li) : 'FOUT selfie-lampen per speler ' + JSON.stringify(li)); }
await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/deur_stalk.png' });
await adv('banished', 800, `const p = m.players[${SELFIE}]; const gp = m.deur.m.group.position; p.x = gp.x; p.z = gp.z + 8; p.yaw = Math.PI;`);
await page.waitForTimeout(300); await page.screenshot({ path: '/tmp/deur_dance.png' });
await page.evaluate(() => { window.__app.input.virtual[0].b = false; window.__app.input.virtual[2].b = false; });
await adv('idle', 200);
await note('na-selfie');
const coins = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { c: S.coins, banished: S.banished }; });
console.log('verjaagd (selfie-licht)?', JSON.stringify(coins));
console.log(coins.banished >= 1 && coins.c >= 15 && (await page.evaluate(async () => (await import('/src/save.js')).S.deur.stickers.includes('selfie'))) ? 'OK   selfie-verjagen: +15 heitjes + sticker' : 'FOUT selfie-verjagen');
// tweede ronde: laat hem je pakken (high-five) -> DJ-overname
await page.evaluate(() => { const m = window.__app.mode; m.deur.state = 'idle'; m.deur.timer = 0.05; });
await adv('stalk');
await page.evaluate(() => { const m = window.__app.mode; const gp = m.deur.m.group.position; for (const p of m.players) { p.x = gp.x + 1; p.z = gp.z + 1; } for (let i = 0; i < 4; i++) m.update(0.05); });
for (let i = 0; i < 80 && (await st()) !== 'takeover'; i++) await page.waitForTimeout(150);   // jumpscare ('FEESTJE!') speelt in echte tijd
await note('gepakt');
for (let i = 0; i < 20; i++) { await page.evaluate(() => { window.__app.mode.update(0.05); }); }
await page.waitForTimeout(500); await page.screenshot({ path: '/tmp/deur_takeover.png' });
// dialoog wegklikken en de DJ-hal bekijken
for (let i = 0; i < 12; i++) { await page.evaluate(() => { const v = window.__app.input.virtual[0]; v.a = true; window.__app.input.update(); window.__app.mode.update(0.05); v.a = false; window.__app.input.update(); window.__app.mode.update(0.05); }); await page.waitForTimeout(120); }
await page.evaluate(() => { const m = window.__app.mode; const d = m.deur; m.players[0].x = -3; m.players[0].z = d.seat.z + 11; m.players[1].x = 3; m.players[1].z = d.seat.z + 11; for (let i = 0; i < 30; i++) m.update(0.05); });
await page.waitForTimeout(600); await page.screenshot({ path: '/tmp/deur_takeover2.png' });
// spookduel via de route van de hal
const mode0 = await page.evaluate(() => { const m = window.__app.mode; return m.deur.takeover; });
console.log('takeover actief:', mode0);
console.log(mode0 === true ? 'OK   DJ-takeover' : 'FOUT geen takeover');
await page.evaluate((p3) => { window.__app.mode.launch('dodgeball', p3 ? { players: [2, 1] } : null); }, P3);   // met 3 spelers: Juul tegen Jor (de keuze wordt overgeslagen)
await page.waitForFunction(() => window.__app.mode && window.__app.mode.ctx, null, { timeout: 60000 });
const tw = await page.evaluate(() => ({ twist: window.__app.mode.ctx.twist.id, spooky: !!(window.__app.mode.extra && window.__app.mode.extra.spooky) }));
console.log('duel:', JSON.stringify(tw), P3 ? 'deelnemers ' + await page.evaluate(() => window.__app.mode.ids.join()) : '');
if (P3) console.log((await page.evaluate(() => window.__app.mode.ids.join())) === '2,1' ? 'OK   spookduel met Juul en Jor' : 'FOUT deelnemers spookduel');
await page.waitForTimeout(600);
await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; for (const id of m.ids) inp.virtual[id].a = true; inp.update(); m.update(0.016); for (const id of m.ids) inp.virtual[id].a = false; inp.update(); m.update(0.016); });
await page.waitForTimeout(500);
await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); } m.ctx.finishPvp({ winner: 0, score: [1, 0], summary: 'spooktest' }); });
await page.waitForFunction(() => window.__app.mode.resultReady, null, { timeout: 20000 });
await page.screenshot({ path: '/tmp/deur_result.png' });
await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; const id = m.ids[0]; inp.virtual[id].a = true; inp.update(); m.update(0.016); inp.virtual[id].a = false; inp.update(); m.update(0.016); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.deur, null, { timeout: 60000 });
// dialogen wegklikken tot hij verdwenen is
for (let i = 0; i < 60; i++) { const s = await st(); if (s === 'idle') break; await page.evaluate(() => { window.__app.input.virtual[0].a = true; }); await page.waitForTimeout(150); await page.evaluate(() => { window.__app.input.virtual[0].a = false; for (let k = 0; k < 12; k++) window.__app.mode.update(0.05); }); await page.waitForTimeout(250); }
await note('na-feestduel');
console.log((await page.evaluate(async () => (await import('/src/save.js')).S.deur.stickers.join(','))), '(stickers)');
await page.waitForTimeout(1500); await page.screenshot({ path: '/tmp/deur_after.png' });
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' || ') : 'NO ERRORS');
await b.close(); server.close();
