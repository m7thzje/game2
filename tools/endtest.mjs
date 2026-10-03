// Test: Het Grote Slotfeest. Rang Speelhal-Legende -> Koning Klopper biedt het feest aan -> EndingMode (feest, Deurman-diploma, credits) -> eindkaart.
// Screenshots: /tmp/end_*.png
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
const errors = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/CERT|404|Failed to load|niet geladen/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
let fails = 0; const check = (ok, what) => { console.log(ok ? 'OK  ' : 'FOUT', what); if (!ok) fails++; };
const press = (i = 0, k = 'a') => page.evaluate(async ([i, k]) => { const v = window.__app.input.virtual[i]; const raf = () => new Promise((r) => requestAnimationFrame(r)); v[k] = true; await raf(); v[k] = false; await raf(); await raf(); }, [i, k]);
const modeName = () => page.evaluate(() => window.__app.mode && window.__app.mode.constructor.name);
await page.goto(`http://localhost:${port}/?quality=low&unlock=1`);
await page.waitForFunction(() => window.__app && window.__app.games, null, { timeout: 120000 });
await page.waitForTimeout(1500);
// Legende-rang klaarzetten (220 punten) en de Speelhal openen
await page.evaluate(() => { const S = window.__app.S; S.flags.met_king = true; S.flags.intro_done = true; S.arcade.plays = 150; S.arcade.wins = [60, 50]; S.arcade.tourneys = [3, 2]; S.arcade.rankSeen = 5; S.totalEarned = 1234; S.playTime = 3600; window.__app.goArcade({}); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.king, null, { timeout: 60000 });
await page.waitForTimeout(1500);
check(await page.evaluate(async () => (await import('/src/engine/progress.js')).rank().name) === 'Speelhal-Legende', 'rang = Speelhal-Legende');
// Koning Klopper: slotfeest-optie
await page.evaluate(() => { window.__kt = window.__app.mode.kingTalk(); });
for (let i = 0; i < 20 && !(await page.evaluate(() => !!window.__app.mode.menu)); i++) await press();
const labels = await page.evaluate(() => window.__app.mode.menu.items.map((i) => i.label));
check(labels.some((l) => /Slotfeest/.test(l)), 'Koning biedt het Slotfeest aan: ' + labels.join(' | '));
await page.evaluate((i) => { const m = window.__app.mode; m.menu.sel = i; m.menu.activate(1); }, labels.findIndex((l) => /Slotfeest/.test(l)));
for (let i = 0; i < 20 && !(await page.evaluate(() => !!window.__app.mode.menu)); i++) await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/end_0_aanbod.png' });
await page.evaluate(() => { const m = window.__app.mode; m.menu.sel = 0; m.menu.activate(1); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'EndingMode', null, { timeout: 60000 });
check(true, 'Slotfeest start -> EndingMode');
// alle dialogen doorklikken, screenshots per nieuwe regel
let shot = 1; const seen = new Set(); let guard = 0;
while (guard++ < 500 && !(await page.evaluate(() => window.__app.mode.ended))) {
  const txt = await page.evaluate(() => (document.querySelector('.dialog .txt') || {}).textContent || ''); const k = txt.slice(0, 14) + (await page.evaluate(() => !!window.__app.mode.creditsOn));
  if (!seen.has(k) && txt.length > 8 && shot < 14) { seen.add(k); await page.waitForTimeout(500); await page.screenshot({ path: `/tmp/end_${shot++}.png` }); }
  if (await page.evaluate(() => window.__app.mode.creditsOn)) {   // credits: screenshot en overslaan met 1 s vasthouden
    await page.waitForTimeout(3000); await page.screenshot({ path: `/tmp/end_${shot++}_credits.png` });
    await page.evaluate(() => { window.__app.input.virtual[0].a = true; }); await page.waitForTimeout(1500); await page.evaluate(() => { window.__app.input.virtual[0].a = false; });
    continue;
  }
  await press();
}
await page.waitForTimeout(800); await page.screenshot({ path: '/tmp/end_card.png' });
const card = await page.evaluate(() => document.body.innerText);
check(/FEEST/.test(card) && /Doorspelen/.test(card), 'eindkaart met Doorspelen');
check(!/DutchTuber|concert|kaartje/i.test(card), 'geen DutchTuber/concert/kaartje-tekst op de eindkaart');
// doorspelen
await page.evaluate(() => { const m = window.__app.mode; ({}); window.__app.ui.activeMenus[0].items[0].onSelect(); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'ArcadeMode', null, { timeout: 60000 });
check(await page.evaluate(() => window.__app.S.flags.slotfeest && window.__app.S.flags.ended), 'doorspelen na het feest; flags slotfeest + ended');
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 10).join('\n') : 'NO ERRORS', '| fouten:', fails);
await browser.close(); server.close(); process.exit(fails || errors.length ? 1 : 0);
