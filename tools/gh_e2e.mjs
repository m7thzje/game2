// Gamehal-e2e: opstarten, bewaren van namen/aantal spelers over een herlaad heen, ?arcade / ?game-routes, pauzemenu -> instellingen
// (aantal spelers wijzigen herbouwt de hal), terug naar de lobby, geen dorp/opening. Aangeroepen door tools/e2e.mjs (GAMEHAL=1 of PLAYERS=4).
// Gebruik: GAMEHAL=1 PLAYERS=2|3|4 node tools/e2e.mjs     Screenshots: /tmp/e2e_gh<N>_*.png
import { ghHelpers, GH_N } from './gh_lib.mjs';

export async function ghE2E({ page, port, check, shot: shot0 }) {
  const N = GH_N; const shot = (n) => shot0(`gh${N}_${n}`);
  const H = ghHelpers(page, { check, shot });
  const { press, modalText, choose, waitMenu, modeName, isIdle, waitHall, clickUntil, toCab, goto, names } = H;
  const url = (q = '') => `http://localhost:${port}/gamehal.html?quality=low${q}`;
  const waitLobby = () => page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.constructor.name === 'GamehalLobby' && window.__app.mode.menu, null, { timeout: 120000 });

  // 1. standaard: 4 spelers, direct de lobby (geen titelscherm, geen opening)
  await page.goto(url()); await waitLobby(); await page.waitForTimeout(1500);
  const d0 = await page.evaluate(() => ({ p: window.__app.S.settings.players, scare: window.__app.S.settings.scare, un: window.__app.S.settings.unlockAll, names: window.__app.S.names.join(), title: document.title }));
  check(d0.p === 4 && d0.scare === 0 && d0.un === true && d0.names === 'Wes,Jor,Juul,Sam', 'Gamehal-standaard: 4 spelers, scare 0, alles ontgrendeld, namen Wes/Jor/Juul/Sam: ' + JSON.stringify(d0));
  await shot('1_lobby_standaard');

  // 2. naam + aantal spelers blijven bewaard na herladen
  await page.click(`.gh-count button:nth-child(${N - 1})`); await page.waitForTimeout(200);
  await page.click(`.gh-prow:nth-child(${N}) .nm`); await page.keyboard.press('Control+a'); await page.keyboard.type('Sammie'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await shot('2_lobby_naam');
  await page.reload(); await waitLobby(); await page.waitForTimeout(1200);
  const d1 = await page.evaluate(() => ({ p: window.__app.S.settings.players, names: window.__app.S.names.join(), rows: [...document.querySelectorAll('.gh-prow .nm')].map((e) => e.textContent).join() }));
  check(d1.p === N && d1.names.split(',')[N - 1] === 'Sammie' && d1.rows.split(',')[N - 1] === 'Sammie', `na herladen: ${d1.p} spelers en naam bewaard (${d1.names})`);
  await shot('3_lobby_na_herladen');
  // terug naar de standaardnaam voor de rest van de test
  await page.click(`.gh-prow:nth-child(${N}) .nm`); await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);

  // 3. ?arcade gaat rechtstreeks naar de hal (geen lobby), ?hub in de Gamehal ook (geen dorp)
  await page.goto(url(`&players=${N}&arcade`)); await waitHall(); await page.waitForTimeout(1200);
  check((await modeName()) === 'ArcadeMode' && await page.evaluate((n) => window.__app.mode.players.length === n, N), `?arcade -> hal met ${N} spelers`);
  await page.evaluate(() => window.__app.goHub({})); await waitHall(); await page.waitForTimeout(500);
  check((await modeName()) === 'ArcadeMode', 'goHub() in de Gamehal = de hal (geen dorp)');
  await page.evaluate(() => { window.__app.mode.intro = 0; }); await page.waitForTimeout(2500); await shot('4_hal');

  // 4. pauzemenu -> instellingen: aantal spelers wijzigen herbouwt de hal
  await page.keyboard.down('Escape'); await page.waitForFunction(() => window.__app.mode.menu, null, { timeout: 10000 }).catch(() => {}); await page.keyboard.up('Escape'); await waitMenu(); await choose(5);
  await page.waitForTimeout(600); await shot('5_instellingen');
  const set = await page.evaluate(() => document.body.innerText);
  check(/Aantal spelers: \d/.test(set) && !/Alles ontgrendeld/.test(set) && !/Sneller beginnen/.test(set) && /Deurman-gedrag/.test(set), 'instellingen in de Gamehal: aantal spelers, geen ontgrendel-/opening-opties');
  const n1 = N === 4 ? 2 : N + 1;   // 1 stap verder (4 -> 2)
  await page.evaluate(() => { const m = window.__app.ui.activeMenus[window.__app.ui.activeMenus.length - 1]; m.sel = 0; m.activate(1); });
  check(await page.evaluate(() => window.__app.S.settings.players) === n1, `instellingen: aantal spelers ${N} -> ${n1}`);
  await page.evaluate(() => { const m = window.__app.ui.activeMenus[window.__app.ui.activeMenus.length - 1]; m.sel = m.items.length - 1; m.activate(1); });
  await waitHall(); await page.waitForTimeout(1500);
  check(await page.evaluate((n) => window.__app.mode.players.length === n, n1), `hal herbouwd met ${n1} spelers`);
  await page.evaluate((n) => { window.__app.S.settings.players = n; }, N);

  // 5. ?game= (oefenen) en stoppen -> terug naar de lobby (geen titelscherm)
  await page.goto(url(`&players=${N}&game=dueltest`)); await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.ctx && window.__app.mode.ids, null, { timeout: 120000 }); await page.waitForTimeout(800);
  check(await page.evaluate((n) => window.__app.mode.ids.length === 2, N), '?game=dueltest: duel met 2 spelers');
  await page.evaluate(() => window.__app.mode.quit()); await waitLobby();
  check((await modeName()) === 'GamehalLobby', 'spel stoppen -> terug naar de lobby');
  await page.waitForTimeout(800); await shot('6_lobby_terug');

  // 6. kast -> duel -> terug in de hal met stand, daarna uitgang naar de lobby (volledige ronde)
  await page.evaluate(() => window.__app.mode.go()); await waitHall(); await page.waitForTimeout(1000);
  await page.evaluate(async () => { window.__app.games.dueltest = (await import('/src/games/dueltest.js')).default; window.__app.mode.intro = 0; window.__lp = window.__app.mode.launch('dueltest'); }); await page.waitForTimeout(700);
  if (N === 3) { await waitMenu(); await choose(0); }
  if (N === 4) { for (let k = 0; k < 6; k++) { await waitMenu(); const t = await modalText(); if (/wint de knock-out/.test(t)) { await choose(0); break; } await choose(0); await H.playMatch({ winner: 0, score: [1, 0] }); await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: 60000 }); await page.waitForTimeout(1000); } }
  else { await H.playMatch({ winner: 1, score: [0, 1] }); await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: 60000 }); }
  await clickUntil(isIdle, 60);
  const s = await page.evaluate(() => ({ plays: window.__app.S.arcade.plays, hud: document.querySelector('.hud-score').textContent }));
  check(s.plays === (N === 4 ? 3 : 1), `terug in de hal na het duel: ${s.plays} gespeeld, ${s.hud}`);
  await shot('7_na_duel');
  // 7. nooit een dorp of opening bereikt
  check(await page.evaluate(() => !window.__app.S.flags.opening && !document.body.innerText.includes('karweitje')), 'geen dorp/opening/karweitjes in de Gamehal');
}
