// Volledige flow-test: praten met NPC, klus starten, afronden, terug naar het dorp
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/CERT|404|niet geladen/.test(m.text())) errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
const log = (...a) => console.log(...a);
const press = async (i, k = 'a', ms = 380) => { await page.evaluate(([i, k]) => { window.__app.input.virtual[i][k] = true; }, [i, k]); await page.waitForTimeout(ms); await page.evaluate(([i, k]) => { window.__app.input.virtual[i][k] = false; }, [i, k]); await page.waitForTimeout(ms); };
await page.goto(`http://localhost:${port}/?hub`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.players, null, { timeout: 120000 });
await page.evaluate(() => { const S = window.__app.S; S.flags.intro = true; S.settings.scare = 2; });
await page.waitForTimeout(1500);
const tp = (x, z) => page.evaluate(([x, z]) => { const m = window.__app.mode; m.players.forEach((p, i) => { p.x = x + i * 1.2; p.z = z; p.vx = p.vz = 0; }); }, [x, z]);
// 1. naar de bakker teleporteren en praten
await tp(-17.5, -6); await page.waitForTimeout(800);
await page.screenshot({ path: '/tmp/e2e_1_bakker.png' });
await press(0, 'a');
await page.waitForTimeout(500);
for (let i = 0; i < 40; i++) { if (await page.evaluate(() => !!window.__app.mode.menu)) break; await press(0, 'a'); await page.waitForTimeout(150); }
await page.screenshot({ path: '/tmp/e2e_2_dialog.png' });
log('menu open?', await page.evaluate(() => !!window.__app.mode.menu), await page.evaluate(() => document.querySelector('.dialog')?.innerText || 'geen dialoog'), errors.join('\n'));
for (let i = 0; i < 40; i++) { const nm = await page.evaluate(() => window.__app.mode.constructor.name); if (nm === 'MinigameMode') break; await press(0, 'a'); await page.waitForTimeout(300); }
await page.waitForTimeout(1500);
log('mode na ja:', await page.evaluate(() => window.__app.mode.constructor.name + ' ' + (window.__app.mode.state || '')));
await page.waitForTimeout(1500);
log('fade-overlay na klus starten (moet 0 zijn):', await page.evaluate(() => getComputedStyle(document.getElementById('fade')).opacity));
await page.screenshot({ path: '/tmp/e2e_3_intro.png' });
// 2. minigame afronden
await press(0, 'a'); await press(1, 'a'); await page.waitForTimeout(6000);
log('mode na ready:', await page.evaluate(() => window.__app.mode.state));
await page.evaluate(() => window.__app.mode.ctx.finish({ stars: 2, score: 50, summary: 'Test!' })); await page.waitForTimeout(3500);
await page.screenshot({ path: '/tmp/e2e_4_result.png' });
await press(0, 'a'); await page.waitForTimeout(500); await press(0, 'a'); await page.waitForTimeout(5000);
log('mode terug:', await page.evaluate(() => window.__app.mode.constructor.name + ' coins=' + window.__app.S.coins));
await page.screenshot({ path: '/tmp/e2e_5_back.png' });
for (let i = 0; i < 25; i++) { if (!(await page.evaluate(() => window.__app.mode.busy))) break; await press(0, 'a'); await page.waitForTimeout(200); }
log('na dialoog: busy=', await page.evaluate(() => window.__app.mode.busy));
// 3. Deurman
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; const d = m.W.doors.find((x) => x.owner === 'Bakkerij'); m.players.forEach((p, i) => { p.x = d.x + Math.sin(d.yaw) * 14 + i; p.z = d.z + Math.cos(d.yaw) * 14; }); m.deur.show(d, { seconds: 20, chase: true }); });
await page.waitForTimeout(3500);
log('deurman state:', await page.evaluate(() => window.__app.mode.deur.state));
await page.screenshot({ path: '/tmp/e2e_6_deur.png' });
await page.evaluate(() => { const m = window.__app.mode; const d = m.W.doors.find((x) => x.owner === 'Bakkerij'); m.players.forEach((p, i) => { p.x = d.x + Math.sin(d.yaw) * 8 + i; p.z = d.z + Math.cos(d.yaw) * 8; }); });
await page.waitForTimeout(3000);
log('deurman state na naderen:', await page.evaluate(() => window.__app.mode.deur.state));
await page.screenshot({ path: '/tmp/e2e_7_chase.png' });
// lantaarn op hem richten
await page.evaluate(() => { const m = window.__app.mode; const g = m.deur.m.group.position; m.players.forEach((p) => { p.yaw = Math.atan2(g.x - p.x, g.z - p.z); p.c.targetYaw = p.yaw; }); const i = window.__app.input; i.virtual[0].b = true; i.virtual[1].b = true; });
for (let k = 0; k < 14; k++) { await page.evaluate(() => { const m = window.__app.mode; const g = m.deur.m.group.position; m.players.forEach((p) => { p.yaw = Math.atan2(g.x - p.x, g.z - p.z); }); }); await page.waitForTimeout(400); if (k === 3) await page.screenshot({ path: '/tmp/e2e_8_lantern.png' }); }
await page.evaluate(() => { const i = window.__app.input; i.virtual[0].b = false; i.virtual[1].b = false; });
log('deurman state na licht:', await page.evaluate(() => window.__app.mode.deur.state + ' banished=' + window.__app.S.banished));
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 12).join('\n') : 'NO ERRORS');
await browser.close(); server.close();
