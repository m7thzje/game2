// Gamehal-test voor de hal: lobby -> hal -> kast -> spel met 2/3/4 spelers (alles samen, teams, winnaar blijft of knock-out) -> terug,
// toernooi, ranglijst, winkel, pauzemenu, uitgang naar de lobby. Aangeroepen door tools/hallstest.mjs (GAMEHAL=1 of PLAYERS=4).
// Gebruik: GAMEHAL=1 PLAYERS=2|3|4 node tools/hallstest.mjs     Screenshots: /tmp/hallstest_gh<N>_*.png
import { ghHelpers, GH_N } from './gh_lib.mjs';

export async function ghHallTest({ page, port, check, shot: shot0 }) {
  const N = GH_N; const shot = (n) => shot0(`gh${N}_${n}`);
  const H = ghHelpers(page, { check, shot });
  const { press, modalText, choose, waitMenu, modeName, isIdle, waitHall, clickUntil, toCab, goto, playMatch, names } = H;
  const st = () => page.evaluate(() => { const S = window.__app.S; return { wins: [...S.arcade.wins], plays: S.arcade.plays, tourneys: [...S.arcade.tourneys], coins: S.coins, g: JSON.parse(JSON.stringify(S.arcade.byGame)) }; });

  await page.goto(`http://localhost:${port}/gamehal.html?quality=low&players=${N}`);
  await page.waitForFunction(() => window.__app && window.__app.mode && window.__app.mode.menu, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  check((await modeName()) === 'GamehalLobby', 'gamehal.html start in de lobby (GamehalLobby)');
  check(await page.evaluate(() => document.title === 'Impactid Gamehal' && /Impactid/i.test(document.querySelector('.gh-title').textContent) && /Gamehal/i.test(document.querySelector('.gh-title').textContent)), 'titel Impactid Gamehal (document.title + lobby-kop)');
  check(await page.evaluate((n) => window.__app.S.settings.players === n && window.__app.S.settings.unlockAll === true, N), `lobby: ${N} spelers, unlockAll aan`);
  await shot('1_lobby');

  // ---- lobby: aantal kiezen met de knoppen, namen aanpassen met de muis/toetsenbord, toetsenhulp
  for (const n of [2, 3, 4, N]) {
    await page.click(`.gh-count button:nth-child(${n - 1})`); await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ p: window.__app.S.settings.players, on: document.querySelectorAll('.gh-prow:not(.off)').length, bros: window.__app.mode.bros.length }));
    check(r.p === n && r.on === n && r.bros === n, `lobby: knop '${n} spelers' -> ${r.p} spelers, ${r.on} actieve rijen, ${r.bros} poppetjes`);
  }
  const keyTxt = await page.evaluate(() => [...document.querySelectorAll('.gh-prow')].map((r) => r.innerText.replace(/\s+/g, ' ')).join(' | '));
  check(/WASD/.test(keyTxt) && /Pijltjes/.test(keyTxt) && (N < 3 || /IJKL/.test(keyTxt)) && (N < 4 || (/Numpad 8456/.test(keyTxt) && /Num7/.test(keyTxt))) && (N === 4 || /klik om mee te doen/.test(keyTxt)), `lobby: toetsenhulp per speler (${N} actief, rest 'klik om mee te doen'): ` + keyTxt.slice(0, 170));
  const tip = await page.evaluate(() => document.querySelector('.gh-tip').innerText);
  if (N === 4) check(/ghosting/i.test(tip) && /gamepad/i.test(tip) && /online/i.test(tip), 'lobby: tip over ghosting/gamepads/online bij 4 spelers: ' + tip.slice(0, 80));
  // naam aanpassen: klik op de naam van speler 1 (Wes), typ 'Wesley' (WASD-letters moeten gewoon te typen zijn), Enter
  await page.click('.gh-prow:nth-child(1) .nm'); await page.waitForTimeout(150);
  check(await page.evaluate(() => !!document.querySelector('.gh-prow input')), 'klik op een naam -> invoerveld');
  await page.keyboard.press('Control+a'); await page.keyboard.type('Wesley'); await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  const nm = await names();
  check(nm[0] === 'Wesley', `naam aangepast in S.names: ${nm.join(',')}`);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('impactid_gamehal_v1')).names[0] === 'Wesley' && localStorage.getItem('heitjes_voor_karweitjes_v1') == null), 'naam bewaard in eigen opslag (impactid_gamehal_v1), niet in de gewone');
  // lege naam -> standaardnaam terug; spelletje met Sam hernoemen
  await page.click('.gh-prow:nth-child(1) .nm'); await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace'); await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  check((await names())[0] === 'Wes', 'lege naam -> standaardnaam Wes');
  // toetsenbord: Sam (numpad) bedient het menu door omlaag te drukken (alleen zichtbaar bij 4 spelers)
  if (N === 4) { const s0 = await page.evaluate(() => window.__app.mode.menu.sel); await press(3, 'down'); const s1 = await page.evaluate(() => window.__app.mode.menu.sel); check(s1 === s0 + 1, `menu bedienbaar door Sam met zijn eigen toetsen (sel ${s0} -> ${s1})`); await press(3, 'up'); }
  await shot('2_lobby_na_naam');
  // geluid en kwaliteit wisselen
  const snd = await page.evaluate(() => { const m = window.__app.mode; m.setSound(1); const a = window.__app.S.settings.music; m.setSound(1); const b = window.__app.S.settings.music; m.setSound(1); return [a, b, window.__app.S.settings.music]; });
  check(snd[0] === 0.2 && snd[1] === 0 && snd[2] === 0.5, 'geluid: zacht -> uit -> aan: ' + snd.join(','));
  // hoe werkt het
  await page.evaluate(() => { const m = window.__app.mode; m.hide(); m.howTo(() => m.show()); }); await page.waitForTimeout(500); await shot('3_hoe_werkt_het');
  check(await page.evaluate((n) => document.querySelectorAll('.card .ctrl > div').length === n, N), `'Hoe werkt het' toont ${N} toetsblokken`);
  await page.click('.overlay'); await page.waitForTimeout(300);
  // online-knop opent de host-dialoog (netwerk kan ontbreken: alleen de kaart telt)
  await page.evaluate(() => { const m = window.__app.mode; m.menu.sel = 2; m.menu.activate(1); }); await page.waitForTimeout(800);
  check(await page.evaluate(() => /Online spelen/.test(document.body.innerText) && !!document.querySelector('.card')), 'Online spelen opent de host-dialoog');
  await shot('4_online');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const m = window.__app.mode; const el = [...document.querySelectorAll('.btn')].find((b) => /Terug|Klaar|Toch beginnen/.test(b.textContent)); if (el) el.click(); }); await page.waitForTimeout(500);
  check(await page.evaluate(() => !document.querySelector('.card .btnrow') || !/Online spelen/.test((document.querySelector('.card h2') || {}).textContent || '')), 'host-dialoog sluit weer');

  // ---- starten: eerste menu-item (alle spelers kunnen drukken)
  await page.evaluate(() => { const m = window.__app.mode; m.build(); m.menu.sel = 0; });
  await press(N - 1, 'a');
  await waitHall(); await page.waitForTimeout(1500);
  const hall = await page.evaluate(async () => { const { isUnlocked } = await import('/src/engine/progress.js'); const m = window.__app.mode; const ex = m.interact.find((i) => i.type === 'exit'); return { n: m.players.length, ids: m.players.map((p) => p.i).join(), un: [1, 2, 3, 4].every(isUnlocked), locks: Object.values(m.doorInfo).filter((i) => i.lock && !i.built).length, exit: ex && ex.label, hallId: m.hallId, busy: m.busy, met: window.__app.S.flags.met_king }; });
  check(hall.n === N && hall.ids === [0, 1, 2, 3].slice(0, N).join(), `hal: ${N} personages (${hall.ids}) bij de start`);
  check(hall.un && hall.locks === 0 && hall.hallId === 0 && !hall.busy, 'hal: alle hallen open (unlockAll), geen dichtgetimmerde deuren, geen opening/uitleg');
  check(hall.exit === 'Terug naar de lobby', 'uitgang heet: ' + hall.exit);
  // testspellen: dueltest = 1 tegen 1 (zonder def.players), _quad_test = 2..4 spelers met teams. De echte spellen worden door andere agents omgezet, dus de flows hangen daar niet van af.
  await page.evaluate(async () => { const app = window.__app; app.games.dueltest = (await import('/src/games/dueltest.js')).default; app.games._quad_test = (await import('/src/games/_quad_test.js')).default; });
  await page.evaluate(() => { window.__app.mode.intro = 0; }); await goto(0, 12); await page.waitForTimeout(2800); await shot('5_hal_start');

  // ---- badges per kast
  const bd = await page.evaluate(async (n) => { const { badge } = await import('/src/gamehal/common.js'); const g = window.__app.games; const m = window.__app.mode; return { duel: badge(g.dueltest, n).txt, quad: g._quad_test ? badge(g._quad_test, n).txt : null, onCab: m.cabs.filter((c) => c.badge).length, total: m.cabs.length }; }, N);
  check(N === 2 ? bd.duel === '' : N === 3 ? /2 uit 3/.test(bd.duel) : /knock-out/.test(bd.duel), `badge bij een 1-tegen-1-spel zonder 4-modus (${N} spelers): '${bd.duel}' (${bd.onCab}/${bd.total} kasten met badge)`);
  const bdN = await page.evaluate(async () => { const { badge, playMode } = await import('/src/gamehal/common.js'); const t = (players, n) => badge({ players }, n).txt + '/' + playMode({ players }, n); return [t([2, 3, 4], 4), t([4], 4), t([2], 4), t([2, 4], 4), t([2, 3], 4), t([3], 3), t([4], 3), t(undefined, 3)]; });
  check(bdN.join(' ') === '👥 2-4/all 👥 4/all 🏆 knock-out/bracket 👥 2-4/all 🏆 knock-out/bracket 👥 3/all 👥 alleen 4/null 🥊 2 uit 3/pair', 'badge-regels: ' + bdN.join(' '));

  // ---- prompts voor alle spelers bij een kast; de laatste speler opent de kast met zijn eigen knop
  await toCab('dodgeball'); await page.waitForTimeout(1500); await shot('6_prompts');
  const pr = await page.evaluate(() => (document.querySelector('.hud-prompt') || {}).innerText || '');
  const nm2 = await names();
  check(nm2.slice(0, N).every((n) => pr.includes(n)), `prompt voor alle ${N} spelers: ` + pr.replace(/\n/g, ' | '));
  await press(N - 1, 'a'); await waitMenu(); const cm = await modalText();
  const cabBadge = await page.evaluate(async (n) => { const { badge } = await import('/src/gamehal/common.js'); return badge(window.__app.games.dodgeball, n).txt; }, N);
  check(/Vuurbal/.test(cm) && (!cabBadge || cm.includes(cabBadge)) && /Spelen!/.test(cm), 'kastmenu met badge (' + cabBadge + ') en uitleg: ' + cm.replace(/\n+/g, ' | ').slice(0, 160));
  await shot('7_kastmenu');

  // ---- een 1-tegen-1-spel starten (dueltest, rechtstreeks via launch)
  await choose(2); await clickUntil(isIdle, 30); check(await isIdle(), "kastmenu 'Terug' sluit het menu");
  await page.evaluate(() => { window.__app.mode.intro = 0; window.__lp = window.__app.mode.launch('dueltest'); }); await page.waitForTimeout(700);
  if (N === 2) {
    const d = await playMatch({ winner: 0, score: [1, 0] });
    check(d.ids.join() === '0,1', 'duel met 2 spelers: Wes tegen Jor');
    await clickUntil(isIdle, 60);
  } else if (N === 3) {
    await waitMenu(); check(/Wie spelen\?/.test(await modalText()) && /Winnaar blijft/.test(await modalText()), "3 spelers: keuzescherm 'Wie spelen?'"); await shot('8_wie_spelen');
    await choose(0); const d = await playMatch({ winner: 1, score: [0, 1] });
    check(d.ids.length === 2, 'duel met 2 van de 3 spelers: ' + d.ids.join());
    await clickUntil(isIdle, 60);
  } else {
    // knock-out: 2 halve finales + finale, tussenschermen, eindstand 1e-4e
    const seen = []; let final = null; const winners = [];
    for (let k = 0; k < 6; k++) {
      await waitMenu(); const t = await modalText(); seen.push(t.split('\n')[0]); await shot('8_ko_' + k);
      if (/wint de knock-out/.test(t)) { final = t; await choose(0); break; }
      check(/Halve finale|Finale/.test(t) && /VS/.test(t) && /kijken? toe/.test(t), `knock-out kaart ${k + 1}: ` + t.replace(/\n+/g, ' | ').slice(0, 150));
      await choose(0);
      const d = await playMatch({ winner: 0, score: [1, 0] }); winners.push(d.ids[0]);
      check(d.ids.length === 2 && d.extra.bracket, `knock-out wedstrijd ${k + 1}: ${d.names.join(' - ')}`);
      await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: 60000 }); await page.waitForTimeout(1200);
    }
    check(seen.length === 4 && /Halve finale 1\/2/.test(seen[0]) && /Halve finale 2\/2/.test(seen[1]) && /Finale/.test(seen[2]), 'knock-out: halve finale 1/2, 2/2, finale, eindstand: ' + seen.join(' > '));
    check(!!final && /🥇/.test(final) && /🥈/.test(final) && /🥉/.test(final) && /4️⃣/.test(final), 'knock-out eindstand toont 1e-4e plaats');
    await clickUntil(isIdle, 60);
    const s = await st(); check(s.plays === 3 && s.wins.reduce((a, b) => a + b, 0) === 3, `statistieken: 3 wedstrijden geteld (plays ${s.plays}, wins ${s.wins.join('-')})`);
    // stoppen midden in de knock-out: kaart 'Knock-out stoppen'
    await page.evaluate(() => { window.__lp = window.__app.mode.launch('dueltest'); }); await waitMenu(); await choose(1); await clickUntil(isIdle, 40);
    check(await page.evaluate(async () => { const f = await import('/src/gamehal/flow.js'); return !f.bracketActive() && !window.__app.mode.busy; }), 'knock-out stoppen via de kaart werkt');
  }
  await shot('9_na_duel');

  // ---- spel met alle spelers tegelijk (_quad_test: 2..4 spelers, teams bij 4)
  await page.evaluate(async () => { const app = window.__app; app.games._quad_test = (await import('/src/games/_quad_test.js')).default; app.mode.intro = 0; });
  const hasQuad = await page.evaluate(() => !!window.__app.games._quad_test);
  if (hasQuad) {
    await page.evaluate(() => { window.__lp = window.__app.mode.launch('_quad_test'); });
    if (N === 4) { await waitMenu(); check(/Teams: 2 tegen 2/.test(await modalText()) && /Loten/.test(await modalText()), 'spel met teams (4 spelers): teamkeuze'); await shot('10_teams'); await choose(0); }
    const q = await playMatch(N === 4 ? '(ctx) => ({ winners: ctx.teams[1].slice(), score: [0, 1, 2, 3], place: [3, 2, 1, 0], summary: "test" })' : '(ctx) => ({ winner: ctx.players.length - 1, score: ctx.players.map((_, i) => i), place: ctx.players.map((_, i) => ctx.players.length - 1 - i), summary: "test" })');
    check(q.ids.join() === [0, 1, 2, 3].slice(0, N).join(), `alle ${N} spelers doen mee in een spel met ${N} spelers: ids ${q.ids.join()}`);
    if (N === 4) check(Array.isArray(q.extra.teams) && q.extra.teams.length === 2, 'ctx.teams gevuld bij 4 spelers: ' + JSON.stringify(q.extra.teams));
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: 60000 }); await page.waitForTimeout(1500);
    let place = false;
    for (let k = 0; k < 6 && !(await isIdle()); k++) { if (await page.evaluate(() => !!window.__app.mode.menu)) { const t = await modalText(); if (/Eindstand/.test(t)) { place = t; await shot('11_eindstand'); } await choose(0); } else await press(0, 'a'); await page.waitForTimeout(700); }
    if (N >= 3) check(!!place && /🥇/.test(place) && /🥉/.test(place), 'eindstand-kaart na een spel met alle spelers: ' + String(place).replace(/\n+/g, ' | ').slice(0, 100));
    await clickUntil(isIdle, 40);
    const s = await st(); const g = s.g._quad_test || s.g.quad_test;
    check(g && g.plays === 1 && g.wins.reduce((a, b) => a + b, 0) === (N === 4 ? 2 : 1), `statistieken voor alle winnaars: ${g && g.wins.join('-')} (teams: 2 winnaars)`);
  } else console.log('(overgeslagen: src/games/_quad_test.js bestaat niet)');

  // ---- toernooi (2 spellen) met dit aantal spelers
  const t0 = await st();
  await goto(-8, 5.5);   // rustige plek: doorklikken opent geen kast
  await page.evaluate(() => { const m = window.__app.mode; const A = window.__app.S.arcade; A.excluded = []; A.tlen = 2; m.busy = false; m.allLoaded = () => ['dueltest', '_quad_test']; window.__tp = m.startTourney(); });
  for (let k = 0; k < 700; k++) {
    await page.waitForTimeout(250);
    const mode = await modeName();
    if (mode === 'MinigameMode') { const ready = await page.evaluate(() => !!(window.__app.mode.ctx && window.__app.mode.ids)); if (ready) { await playMatch({ winner: 0, score: [1, 0] }); await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: 60000 }); await page.waitForTimeout(800); } continue; }
    if (mode !== 'ArcadeMode') continue;
    const s = await page.evaluate(() => { const m = window.__app.mode; return { menu: !!m.menu, dlg: !!document.querySelector('.dialog'), tour: m.hasTourney(), busy: m.busy, card: (document.querySelector('.card') || {}).innerText || '' }; });
    if (s.menu) { if (/Eindstand|wint de knock-out/.test(s.card)) await choose(0); else if (/Wie spelen/.test(s.card)) await choose(0); else if (/Toernooi/.test(s.card) || /Spelen!|Volgend/.test(s.card)) await choose(0); else await choose(0); }
    else if (s.dlg) await press(0, 'a');
    else if (!s.tour && !s.busy) break;
  }
  if (await page.evaluate(() => window.__app.mode.hasTourney && window.__app.mode.hasTourney())) console.log('TOERNOOI NIET AFGEROND:', JSON.stringify(await page.evaluate(() => { const m = window.__app.mode; return { mode: m.constructor.name, busy: m.busy, menu: !!m.menu, card: (document.querySelector('.card') || {}).innerText, dlg: (document.querySelector('.dialog .txt') || {}).textContent }; })));
  await clickUntil(isIdle, 60);
  const t1 = await st();
  const lt = await page.evaluate(() => window.__app.mode.lastTourney);
  const dT = t1.tourneys.reduce((a, b) => a + b, 0) - t0.tourneys.reduce((a, b) => a + b, 0);
  check(!!lt && t1.coins >= t0.coins + 50 && (lt.win != null ? dT === 1 : dT === 0), `toernooi afgerond: +50 heitjes, stand ${lt && lt.score.slice(0, N).join('-')}, ${lt && lt.win != null ? 'winnaar ' + lt.win + ' (+1 toernooi)' : 'gelijke stand aan de top (geen winnaar)'}`);
  check(t1.plays > t0.plays, `toernooi: ${t1.plays - t0.plays} wedstrijden gespeeld`);
  await page.evaluate(() => { window.__app.S.arcade.excluded = []; });

  // ---- scorebord/ranglijst (alle namen), HUD-stand, dagelijkse uitdaging
  const board = await page.evaluate(() => { const m = window.__app.mode; m.drawBoard(); return !!m.board.material.map; });
  const it = await page.evaluate(() => { const m = window.__app.mode; const i = m.interact.find((x) => x.type === 'board'); return [i.x, i.z]; });
  await goto(it[0], it[1]); await page.waitForTimeout(800); await press(0, 'a'); await page.waitForTimeout(900); await shot('12_ranglijst');
  const rk = await modalText(); const nm3 = await names();
  check(board && nm3.slice(0, N).every((n) => rk.includes(n)) && /Ranglijst/.test(rk), `ranglijst toont ${N} namen: ` + rk.replace(/\n+/g, ' | ').slice(0, 130));
  await press(0, 'a'); await clickUntil(isIdle, 20);
  check(await page.evaluate((n) => (document.querySelector('.hud-score').textContent.match(/ · /g) || []).length >= (n === 2 ? 0 : n - 1), N), 'HUD-stand: ' + await page.evaluate(() => document.querySelector('.hud-score').textContent));
  const daily = await page.evaluate(async () => { const m = window.__app.mode; const { dailyInfo } = await import('/src/engine/daily.js'); const gs = {}; for (const id of Object.keys(window.__app.games)) if (m.allLoaded().includes(id)) gs[id] = window.__app.games[id]; const d = dailyInfo(gs); return d && d.id; });
  check(!!daily, 'dagelijkse uitdaging kiest een speelbaar spel: ' + daily);

  // ---- winkel met N kolommen
  await page.evaluate(() => { const m = window.__app.mode; m.busy = false; window.__shopP = m.openShop(); }); await page.waitForTimeout(1500); await shot('13_winkel');
  const sh = await page.evaluate(() => ({ cols: document.querySelectorAll('.shop-col').length, names: [...document.querySelectorAll('.shop-col h3')].map((e) => e.textContent).join() }));
  check(sh.cols === N && sh.names === (await names()).slice(0, N).join(), `winkel: ${N} kolommen: ${sh.names}`);
  await page.evaluate(() => { window.__app.S.coins = 500; });
  const own0 = await page.evaluate((n) => window.__app.S.cosmetics.owned[n - 1].hat.length, N);
  await press(N - 1, 'down'); await press(N - 1, 'down'); await press(N - 1, 'a'); await page.waitForTimeout(400);
  const own1 = await page.evaluate((n) => ({ n: window.__app.S.cosmetics.owned[n - 1].hat.length, eq: window.__app.S.cosmetics.equipped[n - 1].hat, other: window.__app.S.cosmetics.equipped[0].hat }), N);
  check(own1.n === own0 + 1 && own1.eq !== 'std' && (N === 1 || own1.other === 'std'), `speler ${N} koopt een hoedje met zijn eigen toetsen: ` + JSON.stringify(own1));
  for (let k = 0; k < 8 && await page.evaluate(() => !!document.querySelector('.shop-col')); k++) { await page.keyboard.down('Escape'); await page.waitForTimeout(1200); await page.keyboard.up('Escape'); await page.waitForTimeout(600); }   // (trage frames: meerdere pogingen)
  check(await page.evaluate(() => !document.querySelector('.shop-col')), 'winkel sluit'); await clickUntil(isIdle, 30); await page.waitForTimeout(500);

  // ---- Feestbord-tafel opent het bord (BoardMode) en terug in de hal
  const pt = await page.evaluate(() => { const i = window.__app.mode.interact.find((x) => x.type === 'party'); return i && [i.x, i.z]; });
  if (pt) {
    await goto(pt[0], pt[1]); await page.waitForTimeout(1000); await press(0, 'a'); await waitMenu(); check(/Feestbord/.test(await modalText()), 'Feestbord-keuzekaart: ' + (await modalText()).replace(/\n+/g, ' | ').slice(0, 100));
    await choose(0);
    await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'BoardMode', null, { timeout: 60000 }).catch(() => {});
    check((await modeName()) === 'BoardMode', 'Feestbord starten -> BoardMode (met ' + N + ' spelers)'); await page.waitForTimeout(2500); await shot('14_feestbord');
    await page.evaluate(() => window.__app.goArcade({})); await waitHall(); await page.waitForTimeout(800);
    check((await modeName()) === 'ArcadeMode', 'uit het bord terug in de hal');
  }

  // ---- pauzemenu -> instellingen herbouwt de hal bij ander aantal spelers? (alleen controleren dat het menu er is) -> terug naar de lobby
  await page.evaluate(() => { const m = window.__app.mode; m.busy = false; m.intro = 0; });
  await page.keyboard.down('Escape'); await page.waitForFunction(() => window.__app.mode.menu, null, { timeout: 10000 }).catch(() => {}); await page.keyboard.up('Escape'); await waitMenu(); await page.waitForTimeout(300); await shot('15_pauze');
  const pz = await modalText();
  check(/Terug naar de lobby/.test(pz) && /Hoeden/.test(pz) && !/titelscherm/.test(pz), 'pauzemenu: Terug naar de lobby, hoeden: ' + pz.replace(/\n+/g, ' | ').slice(0, 130));
  await choose(7); await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'GamehalLobby', null, { timeout: 30000 });
  check((await modeName()) === 'GamehalLobby', 'pauzemenu -> terug naar de lobby');
  // en opnieuw de hal in, uitgang = terug naar de lobby
  await page.waitForTimeout(800); await page.evaluate(() => window.__app.mode.go()); await waitHall(); await page.waitForTimeout(800);
  const ex = await page.evaluate(() => { const i = window.__app.mode.interact.find((x) => x.type === 'exit'); return [i.x, i.z]; });
  await goto(ex[0], ex[1]); await page.waitForTimeout(600); await press(0, 'a'); await waitMenu(); check(/lobby/i.test(await modalText()), 'uitgang vraagt: ' + (await modalText()).replace(/\n+/g, ' | '));
  await choose(0); await page.waitForFunction(() => window.__app.mode && window.__app.mode.constructor.name === 'GamehalLobby', null, { timeout: 30000 });
  check((await modeName()) === 'GamehalLobby', 'uitgang -> lobby');
  // andere hallen: Sporthal/Deurenhal zijn direct open
  await page.evaluate(() => window.__app.mode.go()); await waitHall(); await page.waitForTimeout(500);
  await page.evaluate(() => window.__app.goArcade({ extra: { hall: 3 }, via: 'door', fromHall: 0 })); await page.waitForFunction(() => window.__app.mode && window.__app.mode.hallId === 3 && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  check(await page.evaluate(() => window.__app.mode.hallId === 3 && window.__app.mode.cabs.length === 6), 'Sporthal direct bereikbaar (6 kasten), zonder bouwen'); await shot('16_sporthal');
  await page.evaluate(() => window.__app.goArcade({ extra: { hall: 4 }, via: 'door', fromHall: 0 })); await page.waitForFunction(() => window.__app.mode && window.__app.mode.hallId === 4 && window.__app.mode.cabs && window.__app.mode.life, null, { timeout: 60000 }); await page.waitForTimeout(1200);
  check(await page.evaluate(() => window.__app.mode.hallId === 4), 'Deurenhal direct bereikbaar (alles ontgrendeld)');
}
