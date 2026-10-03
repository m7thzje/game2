// Test: Sporthal (dichtgetimmerd -> gebouwd), GEHEIME Deurenhal (vermomd -> ontgrendelen met stickers -> betreden -> terug),
// Feestbord-tafel (-> BoardMode -> terug), Vriendenboek (standaard + pauzemenu), nieuwe hallen in toernooi/wiel.
// Gebruik: node tools/hallstest.mjs     Screenshots: /tmp/hallstest_*.png
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 650 } });
const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join('|'))); page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
let fails = 0; const check = (ok, what) => { console.log(ok ? 'OK  ' : 'FOUT', what); if (!ok) fails++; };
const shot = (n) => page.screenshot({ path: `/tmp/hallstest_${n}.png` });
const press = (i = 0, k = 'a') => page.evaluate(async ([i, k]) => { const v = window.__app.input.virtual[i]; const raf = () => new Promise((r) => requestAnimationFrame(r)); v[k] = true; await raf(); v[k] = false; await raf(); await raf(); }, [i, k]);
const dialog = () => page.evaluate(() => (document.querySelector('.dialog .txt') || {}).textContent || '');
const isIdle = () => page.evaluate(() => { const m = window.__app.mode; return !!(m && m.interact && !m.busy && !m.menu && !m.modal); });
const clickUntil = async (cond, max = 80) => { for (let i = 0; i < max; i++) { if (await cond()) return true; await press(0, 'a'); await page.waitForTimeout(120); } return await cond(); };
const waitMenu = (ms = 20000) => page.waitForFunction(() => window.__app.mode && window.__app.mode.menu, null, { timeout: ms });
const choose = (i) => page.evaluate((i) => { const m = window.__app.mode; m.menu.sel = i; m.menu.activate(1); }, i);
const goto = (x, z) => page.evaluate(([x, z]) => { const m = window.__app.mode; m.players.forEach((p, i) => { p.x = x + (i ? 1.2 : -1.2); p.z = z; p.vx = p.vz = 0; }); }, [x, z]);
const nearType = (type, to) => page.evaluate(([type, to]) => { const m = window.__app.mode; const it = m.interact.find((i) => i.type === type && (to == null || i.to === to)); return it ? [it.x, it.z] : null; }, [type, to]);
const modeName = () => page.evaluate(() => window.__app.mode && window.__app.mode.constructor.name);
const hallOf = () => page.evaluate(() => window.__app.mode && window.__app.mode.hallId);
const waitHall = (n) => page.waitForFunction((n) => window.__app.mode && window.__app.mode.constructor.name === 'ArcadeMode' && window.__app.mode.hallId === n && window.__app.mode.cabs && window.__app.mode.life, n, { timeout: 60000 });

await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__app && window.__app.games && Object.keys(window.__app.games).length > 40, null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.settings.scare = 0; S.flags.met_king = true; S.flags.intro_done = true; S.coins = 0; });
await page.evaluate(() => window.__app.goArcade({})); await waitHall(0); await page.waitForTimeout(1500);
const st0 = await page.evaluate(async () => { const { isUnlocked } = await import('/src/engine/progress.js'); const m = window.__app.mode; return { u3: isUnlocked(3), u4: isUnlocked(4), sec: !!m.sec, opened: m.sec && m.sec.opened, locks: Object.values(m.doorInfo).filter((i) => i.lock).map((i) => i.to), n: Object.keys(m.doorInfo).join(',') }; });
check(!st0.u3 && !st0.u4 && st0.sec && !st0.opened && st0.locks.join() === '1,2,3', 'hal 0: deur 1,2,3 dichtgetimmerd, 4 = geheime deur (vermomd): ' + JSON.stringify(st0));
await goto(-6.5, -12); await page.waitForTimeout(300);

// ---- Sporthal bouwen (450 heitjes)
await page.evaluate(() => { window.__app.S.coins = 460; const m = window.__app.mode; m.refreshHud(); }); await goto(-12.9, -15); await page.waitForTimeout(500);
await press(0, 'a'); await waitMenu(); await shot('1_bouw_sporthal');
check(await page.evaluate(() => /Sporthal/.test(document.body.innerText) && /450/.test(document.body.innerText)), 'bouwvraag Sporthal kost 450');
await choose(0); await page.waitForFunction(() => window.__app.mode.doorInfo[3].built, null, { timeout: 20000 }); await page.waitForTimeout(3500);
await clickUntil(isIdle, 40);
check(await page.evaluate(async () => { const { isUnlocked } = await import('/src/engine/progress.js'); return isUnlocked(3) && window.__app.S.coins === 10; }), 'Sporthal gebouwd (450 heitjes betaald)');
// door de Sporthal in en weer terug
await goto(-12.9, -15); await page.waitForTimeout(400); await press(0, 'a'); await waitMenu(); await choose(0);
await waitHall(3); await page.waitForTimeout(1000); await clickUntil(isIdle, 40); await goto(0, 4); await page.waitForTimeout(1800); await shot('2_sporthal');
check((await hallOf()) === 3 && await page.evaluate(() => window.__app.mode.cabs.length === 6 && window.__app.mode.hostName === 'Trainer Tim'), 'Sporthal: 6 kasten, Trainer Tim');
const pos3 = await page.evaluate(() => window.__app.mode.players.map((p) => +p.x.toFixed(1)));
const back3 = await nearType('door', 0); await goto(back3[0], back3[1]); await page.waitForTimeout(400); await press(0, 'a'); await waitMenu(); await choose(0);
await waitHall(0); await page.waitForTimeout(800); await clickUntil(isIdle, 40);
const px0 = await page.evaluate(() => window.__app.mode.players.map((p) => +p.x.toFixed(1)));
check((await hallOf()) === 0 && Math.abs(px0[0] - -12.9) < 3.5, 'terug in hal 0 bij de Sporthal-deur, x=' + px0.join());

// ---- geheime deur: eerst dicht (knipoog + uitleg), dan stickers, dan ontgrendelen
await goto(12.9, -14.5); await page.waitForTimeout(600); await press(0, 'a'); await page.waitForTimeout(1800); await shot('3_geheime_deur_knipoog');
await page.waitForFunction(() => /vriendenboek/i.test((document.querySelector('.dialog .txt') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
const txt = await dialog(); check(/Nog 6 Deurman-stickers nodig/.test(txt) && /vriendenboek/i.test(txt), 'geheime deur zegt: ' + txt.slice(0, 70));
await clickUntil(() => page.evaluate(() => !!window.__app.mode.menu), 30); await shot('3b_geheime_deur_keuze'); await choose(1); await clickUntil(isIdle, 30);
check(await page.evaluate(() => !window.__app.mode.sec.opened), 'deur blijft dicht zolang er te weinig stickers zijn');
await page.evaluate(async () => { const { addSticker } = await import('/src/engine/progress.js'); const { STICKERS } = await import('/src/engine/cameo.js'); STICKERS.slice(0, 6).forEach((s) => addSticker(s.id)); });
await goto(5, 8); await page.waitForTimeout(500);   // het ontgrendelen start vanzelf in de hal (binnen 1 s)
await page.waitForFunction(() => window.__app.mode.sec.anim || window.__app.mode.sec.opened, null, { timeout: 15000 });
await page.waitForTimeout(2200); await shot('4_ontgrendelen');
await page.waitForFunction(() => window.__app.mode.sec.opened && !window.__app.mode.sec.anim && !window.__app.mode.busy, null, { timeout: 20000 }); await page.waitForTimeout(1200); await goto(10, -8); await page.waitForTimeout(1800); await shot('5_gouden_deur');
check(await page.evaluate(async () => { const { isUnlocked } = await import('/src/engine/progress.js'); return isUnlocked(4) && window.__app.S.flags.deurhal_open; }), 'geheime Deurenhal ontgrendeld (6 stickers) + vlag deurhal_open');
// betreden
await goto(12.9, -14.5); await page.waitForTimeout(400); await press(0, 'a'); await waitMenu(); check(await page.evaluate(() => /Deurenhal/.test(document.body.innerText)), 'keuzekaart: Deurenhal'); await choose(0);
await waitHall(4); await page.waitForTimeout(800); await clickUntil(isIdle, 40);
check((await hallOf()) === 4 && await page.evaluate(() => window.__app.mode.cabs.length === 4 && window.__app.mode.hostName === 'De Deurman' && !!window.__app.mode.hx), 'Deurenhal: 4 deur-kasten, De Deurman, zwevende deuren (DeurHall)');
await goto(0, 5); await page.waitForTimeout(1800); await shot('6_deurenhal');
// vriendenboek-standaard in de Deurenhal
const alb = await nearType('album'); await goto(alb[0], alb[1]); await page.waitForTimeout(400); await press(0, 'a'); await page.waitForTimeout(900); await shot('7_vriendenboek');
check(await page.evaluate(() => !!document.querySelector('.album') && /6 \/ 16|stickers/.test(document.body.innerText)), 'Vriendenboek opent bij de standaard in de Deurenhal');
await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
check(await page.evaluate(() => !document.querySelector('.album')), 'Vriendenboek sluit');
await clickUntil(isIdle, 20);
// naar hal 0 terug
const back4 = await nearType('door', 0); await goto(back4[0], back4[1]); await page.waitForTimeout(400); await press(0, 'a'); await waitMenu(); await choose(0);
await waitHall(0); await page.waitForTimeout(800); await clickUntil(isIdle, 40);
const px4 = await page.evaluate(() => window.__app.mode.players.map((p) => +p.x.toFixed(1)));
check((await hallOf()) === 0 && Math.abs(px4[0] - 12.9) < 3.5, 'terug in hal 0 bij de gouden deur, x=' + px4.join());

// ---- Feestbord-tafel -> BoardMode -> terug
const pt = await nearType('party'); await goto(pt[0], pt[1]); await page.waitForTimeout(1200); await shot('8_feestbord_tafel');
await press(0, 'a'); await waitMenu(); check(await page.evaluate(() => /Feestbord/.test(document.body.innerText) && /starten/.test(document.body.innerText)), 'Feestbord-keuzekaart (starten / uitleg / terug)');
await choose(1); await page.waitForTimeout(500); await clickUntil(() => page.evaluate(() => !!window.__app.mode.menu), 20); await choose(2); await clickUntil(isIdle, 20);   // uitleg lezen, dan Terug
check(await page.evaluate(() => window.__app.mode.constructor.name === 'ArcadeMode'), 'Feestbord: uitleg + Terug blijft in de hal');
await press(0, 'a'); await waitMenu(); await choose(0);
await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'BoardMode', null, { timeout: 60000 }); await page.waitForTimeout(2500); await shot('9_feestbord');
check((await modeName()) === 'BoardMode', 'Feestbord starten -> BoardMode (goBoard)');
await page.evaluate(() => window.__app.goArcade({})); await waitHall(0); await page.waitForTimeout(800);
check((await modeName()) === 'ArcadeMode', 'uit het bord terug (goArcade({})) = gewoon de hal');

// ---- pauzemenu: Feestbord + Vriendenboek
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; }); await page.keyboard.down('Escape'); await page.waitForTimeout(250); await page.keyboard.up('Escape'); await waitMenu(); await page.waitForTimeout(300); await shot('10_pauze');
check(await page.evaluate(() => /Feestbord \(Mario Party\)/.test(document.body.innerText) && /Deurman-vriendenboek/.test(document.body.innerText)), 'pauzemenu: Feestbord + Deurman-vriendenboek');
await choose(3); await page.waitForTimeout(900); check(await page.evaluate(() => !!document.querySelector('.album')), 'pauzemenu -> vriendenboek opent'); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(600);
await waitMenu(); await choose(0); await clickUntil(isIdle, 20);

// ---- nieuwe hallen doen mee in toernooi/wiel/pickGames
const pool = await page.evaluate(() => { const m = window.__app.mode; const ids = m.allLoaded(); return { n: ids.length, sport: ids.includes('penalty'), deur: ids.includes('deurzegt'), kermis: ids.includes('bake') }; });
check(pool.sport && pool.deur && !pool.kermis, 'spelpool: Sporthal en Deurenhal doen mee, dichte Kermis niet: ' + JSON.stringify(pool));
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 6).join(' || ') : 'NO ERRORS', '| fouten:', fails);
await b.close(); server.close(); process.exit(fails || errors.length ? 1 : 0);
