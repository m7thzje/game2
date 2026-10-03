// Volledige flow-test v2: titelscherm -> Nieuw spel -> opening (overslaan, of OPENING_FULL=1 helemaal) -> Speelhal met uitleg ->
// dichtgetimmerde deur + bouwanimatie -> rang-feestje -> Bouwplan -> pauzemenu. Screenshots in /tmp/e2e_*.png (Read ze om te kijken).
// Gebruik: node tools/e2e.mjs   (OPENING_FULL=1 speelt de hele opening af met screenshots per scène)
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
let fails = 0; const check = (ok, what) => { log(ok ? 'OK  ' : 'FOUT', what); if (!ok) fails++; };
const shot = (n) => page.screenshot({ path: `/tmp/e2e_${n}.png` });
// druk een knop precies 1 spelframe in (de rAF-volgorde garandeert dat het spel hem ziet; trage headless-frames!)
const press = (i = 0, k = 'a') => page.evaluate(async ([i, k]) => { const v = window.__app.input.virtual[i]; const raf = () => new Promise((r) => requestAnimationFrame(r)); v[k] = true; await raf(); v[k] = false; await raf(); await raf(); }, [i, k]);
const modeName = () => page.evaluate(() => window.__app.mode && window.__app.mode.constructor.name);
const dialog = () => page.evaluate(() => (document.querySelector('.dialog .txt') || {}).textContent || '');
// klik dialogen weg tot `cond()` waar is (of niets meer te klikken)
const clickUntil = async (cond, max = 80) => { for (let i = 0; i < max; i++) { if (await cond()) return true; await press(0, 'a', 200); } return await cond(); };
const choose = (i) => page.evaluate((i) => { const m = window.__app.mode; m.menu.sel = i; m.menu.activate(1); }, i);
const waitMenu = (ms = 20000) => page.waitForFunction(() => window.__app.mode && window.__app.mode.menu, null, { timeout: ms });
// zet de broers op een plek zonder interactie in de buurt (zodat doorklikken niets opent)
const quiet = () => page.evaluate(() => { const m = window.__app.mode; m.players.forEach((p, i) => { p.x = -8 + i * 1.5; p.z = 5.5; p.vx = p.vz = 0; }); return m.players.map((p) => { const it = m.nearest(p); return it ? it.type : null; }); });
const isIdle = () => page.evaluate(() => { const m = window.__app.mode; return !!(m && m.interact && !m.busy && !m.menu); });
const idle = async () => { const r = await clickUntil(isIdle, 60); await quiet(); return r; };

await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.menu, null, { timeout: 120000 });
await page.waitForTimeout(2000); await shot('1_titel');
check((await modeName()) === 'MenuMode', 'titelscherm (MenuMode)');
// instellingen
await page.evaluate(async () => { const m = window.__app.mode; m.hide(); (await import('/src/world/menu.js')).openSettings(() => m.show()); });
await page.waitForTimeout(500); await shot('2_instellingen');
check(await page.evaluate(() => /Deurman-gedrag/.test(document.body.innerText) && /Alles ontgrendeld/.test(document.body.innerText) && /Sneller beginnen/.test(document.body.innerText) && !/Griezel/.test(document.body.innerText)), 'instellingen: Deurman-gedrag, Alles ontgrendeld, Sneller beginnen');
await page.evaluate(() => { const m = window.__app.mode; window.__app.ui.clearScreens(); m.build(); });
// nieuw spel starten -> opening
await press(0, 'a'); await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'OpeningMode', null, { timeout: 30000 });
check(true, 'Spel starten -> OpeningMode');
if (process.env.OPENING_FULL) {
  const seen = new Set(); let guard = 0;
  while ((await modeName()) === 'OpeningMode' && guard++ < 600) {
    const st = await page.evaluate(() => window.__app.mode.stage + ':' + (!!document.querySelector('.dialog'))); const key = st + ':' + (await dialog()).slice(0, 12);
    if (!seen.has(key) && seen.size < 40) { seen.add(key); await shot('3_opening_' + String(seen.size).padStart(2, '0') + '_' + st.split(':')[0]); }
    await press(0, 'a', 220);
  }
} else {
  await page.waitForTimeout(2500); await shot('3_opening_a');
  // overslaan: A vasthouden (1 s)
  await page.evaluate(() => { window.__app.input.virtual[1].a = true; }); await page.waitForTimeout(1600); await page.evaluate(() => { window.__app.input.virtual[1].a = false; });
}
await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'ArcadeMode' && window.__app.mode.busy, null, { timeout: 60000 });
check(true, 'opening afgerond/overgeslagen -> Speelhal (intro)');
await page.waitForTimeout(1500); await shot('4_hal_begroeting');
check(await page.evaluate(() => window.__app.S.flags.met_king && window.__app.S.flags.intro_done), 'flags met_king + intro_done gezet');
// uitleg: ja, leg maar uit
await clickUntil(async () => await page.evaluate(() => !!window.__app.mode.menu), 30); await page.waitForTimeout(300); await shot('5_uitleg_vraag');
await choose(0);
await clickUntil(async () => await page.evaluate(() => !window.__app.mode.busy), 30);   // tot het lopen-stuk
await page.evaluate(() => { const m = window.__app.mode; m.players.forEach((p, i) => { p.x = -8 + i * 16; p.z = 8; }); });   // 'loop rond'
await page.waitForTimeout(1200);
let k = 0;
while (!(await page.evaluate(() => !!window.__app.mode.menu)) && k++ < 80) { if (k % 5 === 0) await shot('6_uitleg_' + k); await press(0, 'a', 200); }
await shot('7_eerste_duel_vraag');
await choose(1);   // later
await idle();
check(await page.evaluate(() => !window.__app.mode.noAct && window.__app.mode.pointers.length === 0), 'uitleg klaar: pointers weg, acties weer aan');
// rang-HUD
const hud = await page.evaluate(() => (document.querySelector('.hud-quest') || {}).innerText || '');
check(/Bouw de Speelhal uit/.test(hud) && /Rang/.test(hud) && /Volgende hal/.test(hud), 'HUD doel + rang: ' + hud.replace(/\n/g, ' | '));
// dichtgetimmerde deur
const lock = await page.evaluate(async () => { const { isUnlocked } = await import('/src/engine/progress.js'); const m = window.__app.mode; return { l1: isUnlocked(1), l2: isUnlocked(2), info: Object.values(m.doorInfo).map((i) => [i.to, !!i.lock]) }; });
check(!lock.l1 && !lock.l2 && lock.info.filter(([t, l]) => t > 0 && l).length === 2, 'hal 1 en 2 dichtgetimmerd: ' + JSON.stringify(lock.info));
await page.evaluate(() => { const m = window.__app.mode; const d = m.doorInfo[1]; m.players.forEach((p, i) => { p.x = d.x + (i ? 1.3 : -1.3); p.z = d.z + 1; p.vx = p.vz = 0; }); });
await page.waitForTimeout(1500); await shot('8_dichtgetimmerd');
await press(0, 'a', 300); await page.waitForTimeout(500); await waitMenu(); await shot('9_bouw_vraag');
await choose(0); await page.waitForTimeout(600);   // te weinig heitjes -> uitleg
await press(0, 'a'); check(/Dat kost 150/.test(await dialog()), 'te weinig heitjes: Koning legt uit');
await idle();
await page.evaluate(() => { window.__app.S.coins = 200; const m = window.__app.mode; m.refreshHud(); const d = m.doorInfo[1]; m.players.forEach((p, i) => { p.x = d.x + (i ? 1.3 : -1.3); p.z = d.z + 1; p.vx = p.vz = 0; }); });
await page.waitForTimeout(500);
await press(0, 'a', 300); await waitMenu(); await choose(0);
for (let i = 0; i < 6; i++) { await page.waitForTimeout(500); if (i === 1 || i === 3) await shot('10_bouwanimatie_' + i); }
await page.waitForTimeout(3000); await shot('11_gebouwd');
const built = await page.evaluate(async () => { const { isUnlocked } = await import('/src/engine/progress.js'); return { u: isUnlocked(1), coins: window.__app.S.coins, locked: !!window.__app.mode.doorInfo[1].lock && !window.__app.mode.doorInfo[1].built }; });
check(built.u && built.coins === 50 && !built.locked, 'Neonkelder gebouwd: ' + JSON.stringify(built));
await idle();
// toernooi/wiel gebruiken alleen ontgrendelde hallen
const pool = await page.evaluate(() => window.__app.mode.allLoaded().length + '/' + window.__app.games.tugwar.id);
log('spelpool na bouwen Neonkelder:', pool);
check(await page.evaluate(() => { const m = window.__app.mode; return m.allLoaded().includes('bomber') && !m.allLoaded().includes('bake'); }), 'spelpool: Neonkelder erbij, Kermis nog niet');
// rang-stijging
await page.evaluate(() => { const A = window.__app.S.arcade; A.plays = 12; A.wins = [6, 6]; });
await page.evaluate(() => { window.__app.mode.checkRankUp(); }); await page.waitForTimeout(1500); await shot('12_rangstijging');
await idle();
// Bouwplan
await page.evaluate(() => { const m = window.__app.mode; const it = m.interact.find((i) => i.type === 'plan'); m.players.forEach((p, i) => { p.x = it.x + (i ? 1 : -1); p.z = it.z; }); });
await page.waitForTimeout(800); await press(0, 'a', 300); await page.waitForTimeout(800); await shot('13_bouwplan');
check(await page.evaluate(() => /Bouwplan/.test(document.body.innerText) && /Gebouwd/.test(document.body.innerText) && /In aanbouw/.test(document.body.innerText)), 'Bouwplan toont gebouwd + in aanbouw');
await press(0, 'a'); await idle();
// pauzemenu
await page.keyboard.down('Escape'); await page.waitForTimeout(250); await page.keyboard.up('Escape'); await waitMenu(); await page.waitForTimeout(300); await shot('14_pauze');
check(await page.evaluate(() => /Pauze/.test(document.body.innerText) && /Speler|Duelist|Nieuwkomer/.test(document.body.innerText)), 'pauzemenu met rang');
await choose(0); await idle();
// terug naar het titelscherm: nu mét opslag -> Verder spelen / Nieuw spel (met bevestiging)
await page.evaluate(() => window.__app.goMenu()); await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'MenuMode' && window.__app.mode.menu, null, { timeout: 30000 }); await page.waitForTimeout(1200); await shot('15_titel_met_opslag');
const items = await page.evaluate(() => window.__app.mode.menu.items.map((i) => i.label));
check(items[0] === 'Verder spelen' && items[1] === 'Nieuw spel', 'titel met opslag: ' + items.join(' | '));
await choose(1); await page.waitForTimeout(500); await shot('16_nieuw_spel_bevestigen');
check(await page.evaluate(() => /Nieuw spel\?/.test(document.body.innerText) && /gewist/.test(document.body.innerText)), 'Nieuw spel vraagt eerst om bevestiging');
await page.evaluate(() => { [...document.querySelectorAll('.btn')].find((b) => /Nee, terug/.test(b.textContent)).click(); }); await page.waitForTimeout(400);
await choose(0); await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'ArcadeMode', null, { timeout: 60000 }); await page.waitForTimeout(1500);
check(await page.evaluate(() => !window.__app.mode.busy && !window.__app.mode.opts.intro && window.__app.S.coins === 50), 'Verder spelen -> Speelhal zonder intro, heitjes bewaard');
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 12).join('\n') : 'NO ERRORS', '| fouten:', fails);
await browser.close(); server.close(); process.exit(fails || errors.length ? 1 : 0);
