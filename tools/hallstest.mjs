// Test: Sporthal (dichtgetimmerd -> gebouwd), GEHEIME Deurenhal (vermomd -> ontgrendelen met stickers -> betreden -> terug),
// Feestbord-tafel (-> BoardMode -> terug), Vriendenboek (standaard + pauzemenu), nieuwe hallen in toernooi/wiel.
// Gebruik: node tools/hallstest.mjs     Screenshots: /tmp/hallstest_*.png
// PLAYERS=3 node tools/hallstest.mjs: met Juul erbij (?players=3) + extra: 3 personages, keuzescherm 'Wie spelen?', winnaar-blijft over 3 duels, scorebord met 3 kolommen, ranglijst.
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } const m = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }; res.writeHead(200, { 'content-type': m[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, r)); const port = server.address().port;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1100, height: 650 } });
const P3 = process.env.PLAYERS === '3';
const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join('|'))); page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT/.test(m.text())) errors.push(m.text().slice(0, 200)); });
let fails = 0; const check = (ok, what) => { console.log(ok ? 'OK  ' : 'FOUT', what); if (!ok) fails++; };
const shot = (n) => page.screenshot({ path: `/tmp/hallstest_${n}.png` });
const press = (i = 0, k = 'a') => page.evaluate(async ([i, k]) => { const v = window.__app.input.virtual[i]; const raf = () => new Promise((r) => requestAnimationFrame(r)); v[k] = true; await raf(); v[k] = false; await raf(); await raf(); }, [i, k]);
const dialog = () => page.evaluate(() => (document.querySelector('.dialog .txt') || {}).textContent || '');
const isIdle = () => page.evaluate(() => { const m = window.__app.mode; return !!(m && m.interact && !m.busy && !m.menu && !m.modal); });
const clickUntil = async (cond, max = 80) => { for (let i = 0; i < max; i++) { if (await cond()) return true; await press(0, 'a'); await page.waitForTimeout(120); } return await cond(); };
const waitMenu = (ms = 20000) => page.waitForFunction(() => window.__app.mode && window.__app.mode.menu, null, { timeout: ms }).catch(async (e) => { console.log('GEEN MENU:', JSON.stringify(await page.evaluate(() => { const m = window.__app.mode; return { mode: m && m.constructor.name, busy: m && m.busy, leaving: m && m.leaving, modal: !!(m && m.modal), picker: !!(m && m.picker), dialog: (document.querySelector('.dialog .txt') || {}).textContent, card: (document.querySelector('.card') || {}).innerText, esc: window.__app.input.pressed('Escape'), _esc: m && m._esc, scare: (window.__scare = window.__scare) || undefined, fps: Math.round(window.__app.fps || 0), noAct: m && m.noAct, deur: m && m.deur && m.deur.state, hallId: m && m.hallId }; }))); throw e; });
const choose = (i) => page.evaluate((i) => { const m = window.__app.mode; m.menu.sel = i; m.menu.activate(1); }, i);
const goto = (x, z) => page.evaluate(([x, z]) => { const m = window.__app.mode; m.players.forEach((p, i) => { p.x = x + (m.players.length === 3 ? (i - 1) * 1.2 : i ? 1.2 : -1.2); p.z = z; p.vx = p.vz = 0; }); }, [x, z]);
const nearType = (type, to) => page.evaluate(([type, to]) => { const m = window.__app.mode; const it = m.interact.find((i) => i.type === type && (to == null || i.to === to)); return it ? [it.x, it.z] : null; }, [type, to]);
const modeName = () => page.evaluate(() => window.__app.mode && window.__app.mode.constructor.name);
const hallOf = () => page.evaluate(() => window.__app.mode && window.__app.mode.hallId);
const waitHall = (n) => page.waitForFunction((n) => window.__app.mode && window.__app.mode.constructor.name === 'ArcadeMode' && window.__app.mode.hallId === n && window.__app.mode.cabs && window.__app.mode.life, n, { timeout: 60000 });

await page.goto(`http://localhost:${port}/?quality=low${P3 ? '&players=3' : ''}`);
await page.waitForFunction(() => window.__app && window.__app.games && Object.keys(window.__app.games).length > 40, null, { timeout: 120000 });
await page.waitForTimeout(1200);
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.settings.scare = 0; S.flags.met_king = true; S.flags.intro_done = true; S.coins = 0; });
await page.evaluate(() => window.__app.goArcade({})); await waitHall(0); await page.waitForTimeout(1500);
const st0 = await page.evaluate(async () => { const { isUnlocked } = await import('/src/engine/progress.js'); const m = window.__app.mode; return { u3: isUnlocked(3), u4: isUnlocked(4), sec: !!m.sec, opened: m.sec && m.sec.opened, locks: Object.values(m.doorInfo).filter((i) => i.lock).map((i) => i.to), n: Object.keys(m.doorInfo).join(',') }; });
check(!st0.u3 && !st0.u4 && st0.sec && !st0.opened && st0.locks.join() === '1,2,3', 'hal 0: deur 1,2,3 dichtgetimmerd, 4 = geheime deur (vermomd): ' + JSON.stringify(st0));
await goto(-6.5, -12); await page.waitForTimeout(300);

// ======================= 3 SPELERS (PLAYERS=3): Juul in de hal =======================
if (P3) {
  const modalText = () => page.evaluate(() => (document.querySelector('.card') || {}).innerText || '');
  // dicht bij een kast zetten; geeft de id van de kast terug
  const toCab = (id) => page.evaluate((id) => { const m = window.__app.mode; const c = m.cabs.find((x) => x.id === id); m.players.forEach((p, i) => { p.x = c.ix + (i - 1) * 1.3; p.z = c.iz + (i === 1 ? 0 : 0.4); p.vx = p.vz = 0; }); return c.id; }, id);
  const pend = () => page.evaluate(() => { const m = window.__app.mode; return !!(m.menu || m.modal || document.querySelector('.dialog')); });
  // een duel afspelen: wacht op de MinigameMode, maak iedereen klaar, laat `winnerSlot` winnen, sluit het resultaat
  const playDuel = async (winnerSlot) => {
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.ctx && window.__app.mode.ids, null, { timeout: 60000 }).catch(async (e) => { console.log('DUEL START MISLUKT:', JSON.stringify(await page.evaluate(() => { const m = window.__app.mode; return { mode: m && m.constructor.name, busy: m && m.busy, leaving: m && m.leaving, menu: !!(m && m.menu), card: (document.querySelector('.card') || {}).innerText }; }))); throw e; });
    await page.waitForTimeout(700);
    const info = await page.evaluate((ws) => { const app = window.__app, m = app.mode, inp = app.input; const ids = m.ids.slice();
      for (const id of ids) inp.virtual[id].a = true; inp.update(); m.update(0.016); for (const id of ids) inp.virtual[id].a = false; inp.update(); m.update(0.016);
      return { ids, n: m.n, names: m.ctx.players.map((q) => q.name) }; }, winnerSlot);
    await page.waitForTimeout(500);
    await page.evaluate((ws) => { const app = window.__app, m = app.mode, inp = app.input; let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); } m.ctx.finishPvp({ winner: ws, score: ws == null ? [0, 0] : ws === 0 ? [1, 0] : [0, 1], summary: '3-spelers-test' }); }, winnerSlot);
    await page.waitForFunction(() => window.__app.mode.resultReady, null, { timeout: 20000 });
    await page.evaluate(() => { const app = window.__app, m = app.mode, inp = app.input; const id = m.ids[0]; if (m.canRematch) { m.resSel = 1; m.drawResOpts(); } inp.virtual[id].a = true; inp.update(); m.update(0.016); inp.virtual[id].a = false; inp.update(); m.update(0.016); });
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: 60000 });
    return info;
  };
  const st3 = () => page.evaluate(async () => { const { S } = await import('/src/save.js'); return { wins: [...S.arcade.wins], plays: S.arcade.plays, g: S.arcade.byGame.dodgeball && [...S.arcade.byGame.dodgeball.wins], by: S.arcade.queueMode }; });
  await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.arcade.wins = [0, 0, 0]; S.arcade.byGame = {}; S.arcade.plays = 0; S.arcade.queueMode = null; });
  const pl = await page.evaluate(() => window.__app.mode.players.map((p) => [p.i, !!p.c.group.parent, p.ring.material.color.getHex()]));
  check(pl.length === 3 && pl.map((x) => x[0]).join() === '0,1,2' && pl.every((x) => x[1]), '3 personages in de hal (Wes, Jor, Juul): ' + JSON.stringify(pl));
  await goto(0, 12); await page.waitForTimeout(2200); await shot('p3_1_drie_in_hal');
  // prompts voor 3 spelers bij een kast
  await toCab('dodgeball'); await page.waitForTimeout(1500); await shot('p3_2_prompts');
  const pr = await page.evaluate(() => (document.querySelector('.hud-prompt') || {}).innerText || '');
  check(/Wes/.test(pr) && /Jor/.test(pr) && /Juul/.test(pr) && /\bU\b/.test(pr), 'prompt voor alle 3 spelers: ' + pr.replace(/\n/g, ' | '));
  // Juul (speler 2) opent de kast met haar eigen knop U
  await press(2, 'a'); await waitMenu(); check(/Vuurbal/.test(await modalText()), 'Juul opent een kast met haar eigen knop (U)');
  await choose(0); await page.waitForTimeout(700); await waitMenu(); await shot('p3_3_wie_spelen');
  const wie = await modalText();
  check(/Wie spelen\?/.test(wie) && /Winnaar blijft/.test(wie) && /Zelf kiezen/.test(wie) && /Wes vs Jor, Juul wacht/.test(wie), "keuzescherm 'Wie spelen?': " + wie.replace(/\n+/g, ' | '));
  // duel 1: winnaar blijft -> Wes-Jor, Wes (slot 0) wint
  await choose(0); let d1 = await playDuel(0);
  check(d1.ids.join() === '0,1', 'duel 1 (winnaar blijft): Wes tegen Jor: ' + d1.ids.join());
  await clickUntil(isIdle, 60);
  let s1 = await st3(); check(s1.wins.join() === '1,0,0' && s1.plays === 1 && s1.by === 'queue', 'stand per speler na duel 1: ' + s1.wins.join('-') + ', keuze onthouden: ' + s1.by);
  // duel 2: Wes blijft, Juul komt: Juul (slot 1) wint
  await toCab('dodgeball'); await page.waitForTimeout(600); await press(0, 'a'); await waitMenu(); await choose(0); await page.waitForTimeout(600); await waitMenu();
  check(/Wes vs Juul, Jor wacht/.test(await modalText()), 'wachtrij: nu Wes vs Juul, Jor wacht'); await shot('p3_4_wachtrij');
  await choose(0); let d2 = await playDuel(1);
  check(d2.ids.join() === '0,2' && d2.names.join() === 'Wes,Juul', 'duel 2: Wes tegen Juul: ' + d2.ids.join() + ' ' + d2.names.join());
  await clickUntil(isIdle, 60);
  // duel 3: Juul blijft, Jor komt: Juul wint weer
  await toCab('dodgeball'); await page.waitForTimeout(600); await press(0, 'a'); await waitMenu(); await choose(0); await page.waitForTimeout(600); await waitMenu();
  check(/Jor vs Juul, Wes wacht/.test(await modalText()), 'wachtrij: nu Jor vs Juul, Wes wacht');
  await choose(0); let d3 = await playDuel(1);
  check(d3.ids.join() === '1,2', 'duel 3: Jor tegen Juul: ' + d3.ids.join());
  await clickUntil(isIdle, 60);
  let s3 = await st3(); check(s3.wins.join() === '1,0,2' && s3.plays === 3 && s3.g.join() === '1,0,2', 'statistieken per speler na 3 duels: wins ' + s3.wins.join('-') + ' / dodgeball ' + (s3.g || []).join('-'));
  // zelf kiezen: Jor-Juul, en de keuze wordt onthouden
  await toCab('dodgeball'); await page.waitForTimeout(600); await press(0, 'a'); await waitMenu(); await choose(0); await page.waitForTimeout(600); await waitMenu();
  await choose(1); await page.waitForTimeout(600); await waitMenu(); await shot('p3_5_zelf_kiezen');
  check(/Wes – Jor/.test(await modalText()) && /Wes – Juul/.test(await modalText()) && /Jor – Juul/.test(await modalText()), 'zelf kiezen: alle 3 paren');
  await choose(0); let d4 = await playDuel(null);   // Wes–Jor, gelijkspel
  check(d4.ids.join() === '0,1', 'zelf gekozen paar Wes-Jor gespeeld: ' + d4.ids.join());
  await clickUntil(isIdle, 60);
  check((await st3()).by === 'pick', "keuze 'Zelf kiezen' onthouden (S.arcade.queueMode)");
  // scorebord met 3 kolommen + ranglijst
  const bd = await page.evaluate(() => { const m = window.__app.mode; m.drawBoard(); const t = m.board.material.map; return { w: t.image.width, ok: !!t.image }; });
  await page.evaluate(() => { const m = window.__app.mode; const it = m.interact.find((i) => i.type === 'board'); m.players.forEach((p, i) => { p.x = it.x + (i - 1) * 1.2; p.z = it.z; p.vx = p.vz = 0; }); m.intro = 0; });
  await page.waitForTimeout(2800);
  // camera even recht op het scorebord richten voor een leesbare foto (3 kolommen)
  await page.evaluate(() => { const m = window.__app.mode; const b = m.board.position; m.render = function (r) { this.camera.position.set(b.x, b.y - 1, b.z + 15); this.camera.lookAt(b.x, b.y, b.z); r.render(this.scene, this.camera); }; });
  await page.waitForTimeout(900); await shot('p3_6_scorebord'); await page.evaluate(() => { delete window.__app.mode.render; });
  await press(0, 'a'); await page.waitForTimeout(900); await shot('p3_7_ranglijst');
  const rk = await modalText();
  check(bd.ok && /Wes/.test(rk) && /Jor/.test(rk) && /Juul/.test(rk) && /Koning/.test(rk) && /👑 Juul/.test(rk), 'ranglijst met 3 namen en koning van het spel (Juul): ' + rk.replace(/\n+/g, ' | ').slice(0, 160));
  await press(0, 'a'); await clickUntil(isIdle, 20);
  // stand in de HUD
  check(await page.evaluate(() => /Wes 1 · Jor 0 · Juul 2/.test(document.querySelector('.hud-score').textContent)), 'HUD-stand: Wes 1 · Jor 0 · Juul 2');
}


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
await page.evaluate(() => { const m = window.__app.mode; m.busy = false; }); await page.keyboard.down('Escape'); await page.waitForFunction(() => window.__app.mode.menu, null, { timeout: 10000 }).catch(() => {}); await page.keyboard.up('Escape'); await waitMenu(); await page.waitForTimeout(300); await shot('10_pauze');
check(await page.evaluate(() => /Feestbord \(Mario Party\)/.test(document.body.innerText) && /Deurman-vriendenboek/.test(document.body.innerText)), 'pauzemenu: Feestbord + Deurman-vriendenboek');
await choose(3); await page.waitForTimeout(900); check(await page.evaluate(() => !!document.querySelector('.album')), 'pauzemenu -> vriendenboek opent'); await page.waitForTimeout(500); await page.keyboard.press('Escape'); await page.waitForTimeout(600);
await waitMenu(); await choose(0); await clickUntil(isIdle, 20);

// ---- nieuwe hallen doen mee in toernooi/wiel/pickGames
const pool = await page.evaluate(() => { const m = window.__app.mode; const ids = m.allLoaded(); return { n: ids.length, sport: ids.includes('penalty'), deur: ids.includes('deurzegt'), kermis: ids.includes('bake') }; });
check(pool.sport && pool.deur && !pool.kermis, 'spelpool: Sporthal en Deurenhal doen mee, dichte Kermis niet: ' + JSON.stringify(pool));
console.log(errors.length ? 'ERRORS ' + errors.slice(0, 6).join(' || ') : 'NO ERRORS', '| fouten:', fails);
await b.close(); server.close(); process.exit(fails || errors.length ? 1 : 0);
