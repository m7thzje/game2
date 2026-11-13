// Test van de spelers-kern (docs/PLAYERS3.md en docs/PLAYERS4.md): input.all/mapSlots, makeBrother-slotmapping, DuelQueue, Bracket, migratie van oude opslag,
// harness met extra.players ([2,0], [1,2], 3 of 4 deelnemers, teams), statistieken per spelers-id, HUD/resultaatkaart met 3 of 4 spelers.
// Gebruik: node tools/playerstest.mjs [--shots]           (PLAYERS=2|3, standaard: de 2/3-spelers-suite)
//          PLAYERS=4 node tools/playerstest.mjs [--shots]  (de 4-spelers-suite + de 2-spelers-regressie)
//   screenshots naar $OUT of /tmp/p3 (/tmp/p4 bij PLAYERS=4), alleen met --shots; CHROME=<pad> kiest een andere Chromium
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const CHROME = process.env.CHROME || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'].find((p) => fs.existsSync(p));   // eerste bestaande Chromium
const PL = process.env.PLAYERS === '4' ? 4 : 3;   // 4: de 4-spelers-suite; anders de 2/3-spelers-suite
const OUT = process.env.OUT || (PL === 4 ? '/tmp/p4' : '/tmp/p3'); const SHOTS = process.argv.includes('--shots'); if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let fails = 0; const errors = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'OK  ' : 'FOUT'} ${name}${ok ? '' : '  -> ' + detail}`); if (!ok) fails++; };

async function open(players) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY/.test(m.text())) errors.push(`[p${players}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[p${players}] [pageerror] ${e.message} ${(e.stack || '').split('\n').slice(0, 3).join(' | ')}`));
  await page.goto(`http://localhost:${port}/?quality=low&scare=0&unlock=1&players=${players}`);
  await page.waitForFunction(() => window.__app && window.__app.games && window.__app.mode, null, { timeout: 240000 });
  await page.waitForTimeout(500);
  return page;
}

if (PL !== 4) {
// ---------------------------------------------------------------- 1. invoer (3 spelers)
{
  const page = await open(3);
  const r = await page.evaluate(async () => {
    const { input, KEY_LABELS } = await import('/src/engine/input.js');
    const out = {};
    out.len = [input.all.length, input.p.length, input.virtual.length];
    out.ident = input.p[0] === input.all[0] && input.p[1] === input.all[1];
    input.virtual[2].a = true; input.virtual[2].x = 1; input.update();
    out.juulA = input.all[2].aP; out.juulX = input.all[2].x; out.anyA = input.anyA();
    input.virtual[2].a = false; input.virtual[2].x = 0; input.update(); out.juulR = input.all[2].aR; out.anyAafter = input.anyA();
    input.mapSlots([2, 0]);
    out.mapped = input.p[0] === input.all[2] && input.p[1] === input.all[0] && input.p.length === 2;
    out.label0 = KEY_LABELS[0].move; out.label1 = KEY_LABELS[1].move;
    input.virtual[2].x = 1; input.virtual[0].y = -1; input.update();
    out.slot0x = input.p[0].x; out.slot1y = input.p[1].y;
    input.virtual[2].x = 0; input.virtual[0].y = 0; input.update();
    input.mapSlots([0, 1, 2]); out.three = input.p.length === 3 && input.p[2] === input.all[2];
    input.resetSlots(); out.reset = input.p.length === 2 && input.p[0] === input.all[0] && KEY_LABELS[0].move === 'WASD' && KEY_LABELS[1].move === 'Pijltjes' && KEY_LABELS[2].move === 'IJKL';
    // remote
    input.setRemote(2, { a: true, x: 1, y: 0 }, ['Escape']); input.update();
    out.remoteA = input.all[2].a; out.remoteX = input.all[2].x; out.online = input.online; out.pressedEsc = input.pressed('Escape');
    input.clearRemote(2); input.update(); out.remoteGone = !input.all[2].a && !input.online;
    // legacy: setRemote(state, keys) = speler 1; online = true zonder remote-staat blokkeert lokale toetsen van speler 1
    input.setRemote({ b: true }, []); input.update(); out.legacy = input.all[1].b && input.online;
    input.clearRemote(); input.update(); out.legacyGone = !input.all[1].b && !input.online;
    input.online = true; input.keys.add('ArrowLeft'); input.update(); out.legacyOnlineBlocks = input.all[1].left === false; input.online = false; input.keys.delete('ArrowLeft');
    out.gameKeys = ['KeyU', 'KeyO', 'KeyI', 'KeyJ', 'KeyK', 'KeyL'].every((c) => input.isGameKey(c));
    return out;
  });
  check('input: all/p/virtual lengtes', r.len.join() === '4,2,4', r.len.join());
  check('input: p[i] === all[i] standaard', r.ident);
  check('input: Juul (virtual[2]) -> all[2] a/x', r.juulA && r.juulX === 1 && r.anyA, JSON.stringify(r));
  check('input: aR + anyA daarna false', r.juulR && !r.anyAafter);
  check('input: mapSlots([2,0]) + KEY_LABELS slot-view', r.mapped && r.label0 === 'IJKL' && r.label1 === 'WASD', JSON.stringify(r));
  check('input: slot 0 volgt speler 2, slot 1 speler 0', r.slot0x === 1 && r.slot1y === -1, JSON.stringify(r));
  check('input: mapSlots met 3 en resetSlots', r.three && r.reset);
  check('input: remote speler 2 (state, toetsen, online)', r.remoteA && r.remoteX === 1 && r.online && r.pressedEsc && r.remoteGone, JSON.stringify(r));
  check('input: oude setRemote(state, keys) = speler 1', r.legacy && r.legacyGone && r.legacyOnlineBlocks);
  check('input: isGameKey voor Juul-toetsen (players=3)', r.gameKeys);
  // toetsenbord
  await page.keyboard.down('KeyU'); await page.keyboard.down('KeyL'); await page.waitForTimeout(150);
  const k3 = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); input.update(); return [input.all[2].a, input.all[2].right, input.all[0].a]; });
  await page.keyboard.up('KeyU'); await page.keyboard.up('KeyL');
  check('toetsenbord: U/L = Juul (A + rechts) bij 3 spelers', k3[0] && k3[1] && !k3[2], k3.join());
  await page.close();
}
{
  const page = await open(2);
  await page.keyboard.down('KeyU'); await page.keyboard.down('KeyL'); await page.waitForTimeout(150);
  const r = await page.evaluate(async () => {
    const { input } = await import('/src/engine/input.js');
    input.virtual[2].a = true; input.update();
    return { a: input.all[2].a, right: input.all[2].right, p: input.p.length, ident: input.p[0] === input.all[0] && input.p[1] === input.all[1], gk: input.isGameKey('KeyU'), players: window.__app.S.settings.players };
  });
  await page.keyboard.up('KeyU'); await page.keyboard.up('KeyL');
  check('2 spelers: Juul-staat blijft nul (toetsen en virtual)', !r.a && !r.right && r.p === 2 && r.ident && !r.gk && r.players === 2, JSON.stringify(r));
  await page.close();
}

// ---------------------------------------------------------------- 2. chars / cosmetica / save / party (pure logica)
{
  const page = await open(3);
  const r = await page.evaluate(async () => {
    const chars = await import('/src/engine/chars.js'); const cos = await import('/src/engine/cosmetics.js');
    const { S } = await import('/src/save.js'); const party = await import('/src/engine/party.js');
    const out = {};
    out.colors = [chars.PLAYER_COLORS.length, chars.PLAYER_CSS.length, chars.PLAYER_COLORS[2].toString(16)];
    // looks: Wes, Jor, Juul verschillen duidelijk
    const specs = [0, 1, 2].map((i) => chars.brotherSpec(i));
    out.distinct = new Set(specs.map((s) => s.shirt)).size === 3 && new Set(specs.map((s) => s.hair)).size === 3 && new Set(specs.map((s) => s.hairStyle)).size === 3 && new Set(specs.map((s) => s.scale)).size === 3;
    // Juul koopt/draagt een feesthoed + roze shirt; Wes niet
    cos.cosm().owned[2].hat.push('party'); cos.cosm().equipped[2].hat = 'party'; cos.cosm().owned[2].shirt.push('purple'); cos.cosm().equipped[2].shirt = 'purple';
    chars.setSlotPlayers([2, 0]);
    const a = chars.makeBrother(0), b = chars.makeBrother(1);
    out.slot0 = [a.brother, a.playerId, a.playerName, a.spec.hat, a.spec.shirt.toString(16)];
    out.slot1 = [b.brother, b.playerName, b.spec.hat, b.spec.shirt.toString(16)];
    out.slotColors = [chars.PLAYER_COLORS[0].toString(16), chars.PLAYER_COLORS[1].toString(16)];
    out.refresh = a.refreshBrother() === false;
    cos.cosm().equipped[2].hat = 'std'; out.refresh2 = a.refreshBrother() === true && a.spec.hat == null;   // winkel-wijziging wordt opgepikt door de juiste speler
    chars.setSlotPlayers([0, 1, 2]);
    const c = chars.makeBrother(2); out.ident = [c.brother, c.playerName, chars.PLAYER_COLORS[0].toString(16)];
    out.shop = chars.makeBrother(2, cos.cosm().equipped[2]).brother === undefined;   // met expliciete uitrusting: geen slot-mapping, geen brother-veld
    cos.cosm().equipped[2] = { hat: 'std', shirt: 'std', hair: 'std', cape: 'std' };
    // standaarduitrusting Juul
    out.items = [cos.itemsFor(2, 'hat')[0].name, cos.itemsFor(2, 'cape')[0].name, cos.itemsFor(2, 'shirt')[0].c.toString(16), cos.catLabel('cape', 2)];
    // party
    out.act = [party.activeIds().join(), party.playerCount(), party.pairsOf([0, 1, 2]).map((p) => p.join('')).join('|'), party.chooseNames([2, 0]).join()];
    out.names = S.names.join();
    return out;
  });
  check('chars: PLAYER_COLORS/CSS hebben 4 items, Juul oranje', r.colors[0] === 4 && r.colors[1] === 4 && r.colors[2] === 'f08a2a', r.colors.join());
  check('chars: Wes/Jor/Juul verschillen (shirt, haar, haarstijl, lengte)', r.distinct);
  check('chars: makeBrother(0) bij slots [2,0] = Juul met haar eigen hoed/shirt', r.slot0.join() === '2,2,Juul,party,8a3fd8', r.slot0.join());
  check('chars: makeBrother(1) bij slots [2,0] = Wes zonder hoed', r.slot1.join() === '0,Wes,,2f9e5b', r.slot1.join());
  check('chars: PLAYER_COLORS volgt slots ([2,0] -> oranje, groen)', r.slotColors.join() === 'f08a2a,2f9e5b', r.slotColors.join());
  check('chars: refreshBrother pikt winkelwijziging op', r.refresh && r.refresh2);
  check('chars: setSlotPlayers([0,1,2]) herstelt identiteit; makeBrother met eq negeert slots', r.ident.join() === '2,Juul,2f9e5b' && r.shop, r.ident.join());
  check('cosmetica: Juul eigen startuitrusting + labels', r.items[0] === 'Blote kop (standaard)' && r.items[1] === 'Standaard sjaal' && r.items[2] === 'f0862a' && r.items[3] === 'Sjaal', r.items.join());
  check('party: activeIds/pairsOf/chooseNames', r.act.join('|') === '0,1,2|3|01|02|12|Juul,Wes' && r.names === 'Wes,Jor,Juul,Sam', r.act.join('|'));
  await page.close();
}

// ---------------------------------------------------------------- 3. DuelQueue
{
  const page = await open(3);
  const r = await page.evaluate(async () => {
    const { DuelQueue, duelQueue, pairStats, recordPair } = await import('/src/engine/party.js');
    const { S } = await import('/src/save.js');
    const o = {}; const q = new DuelQueue([0, 1, 2]);
    o.first = q.next().join(); o.wait0 = q.waiting().join();
    o.after1 = q.report(0).join(); o.champ = [q.champion, q.streak, q.waiting().join()];     // Wes wint: Wes blijft, Jor weg, Juul erin -> [0,2]; Jor wacht
    o.after2 = q.report(2).join(); o.champ2 = [q.champion, q.streak, q.waiting().join()];   // Juul wint -> Juul blijft, Wes weg, Jor erin -> [1,2]
    o.after3 = q.report(2).join(); o.streak = q.streak;                                      // Juul wint weer -> Wes erin: [0,2]
    o.draw = q.report(null).join();                                                          // gelijkspel: uitdager weg
    o.pick = q.pick(1, 2).join(); o.pickWait = q.waiting().join();
    const q2 = new DuelQueue([0, 1]); o.two = [q2.next().join(), q2.report(1).join(), q2.waiting().length];
    const q3 = new DuelQueue([0, 1, 2], { maxStreak: 2 }); q3.report(0); const m = q3.report(0).join(); o.max = [m, q3.streak];   // na 2 winsten moet Wes zitten
    o.single = duelQueue() === duelQueue();
    recordPair(2, 0, 2); recordPair(0, 2, 0); recordPair(0, 2, null);
    o.pair = JSON.stringify(pairStats(0, 2)) + JSON.stringify(S.arcade.pairs['0-2']);
    return o;
  });
  check('DuelQueue: eerste paar [0,1], Juul wacht', r.first === '0,1' && r.wait0 === '2');
  check('DuelQueue: winnaar blijft (Wes wint -> [0,2], Jor wacht)', r.after1 === '0,2' && r.champ.join() === '0,1,1', JSON.stringify(r));
  check('DuelQueue: Juul wint -> [1,2], Wes wacht; reeks telt', r.after2 === '1,2' && r.champ2.join() === '2,1,0' && r.after3 === '0,2' && r.streak === 2, JSON.stringify(r));
  check('DuelQueue: gelijkspel, pick, 2 spelers', r.draw.split(',').length === 2 && r.pick === '1,2' && r.pickWait === '0' && r.two[0] === '0,1' && r.two[1] === '0,1' && r.two[2] === 0, JSON.stringify(r));
  check('DuelQueue: maxStreak=2 zet winnaar op de bank', r.max[0] !== '0,1' && !r.max[0].split(',').includes('0') && r.max[1] === 0, JSON.stringify(r.max));
  check('party: duelQueue() singleton + paarstatistieken', r.single && r.pair === '{"plays":3,"draws":1,"winsA":1,"winsB":1}{"plays":3,"draws":1,"wins":[1,1]}', r.pair);
  await page.close();
}

// ---------------------------------------------------------------- 4. migratie oude opslag
{
  const page = await open(2);
  const r = await page.evaluate(async () => {
    const KEY = 'heitjes_voor_karweitjes_v1';
    const old = { names: ['Wes', 'Jor'], coins: 77, totalEarned: 200, jobs: { catch: { plays: 2, bestStars: 3, bestScore: 5 } }, flags: { intro_done: true },
      arcade: { wins: [3, 4], draws: 1, plays: 9, byGame: { airhockey: { plays: 4, wins: [1, 3], streak: 2, streakWho: 1 } }, tourneys: [1, 0], unlocked: [0, 1] },
      cosmetics: { owned: [{ hat: ['std', 'cap'], shirt: ['std'], hair: ['std'], cape: ['std'] }, { hat: ['std'], shirt: ['std'], hair: ['std'], cape: ['std'] }], equipped: [{ hat: 'cap', shirt: 'std', hair: 'std', cape: 'std' }, { hat: 'std', shirt: 'std', hair: 'std', cape: 'std' }] },
      settings: { scare: 1, flashFree: false, music: 0.5, sfx: 0.8, quality: 'low', unlockAll: true, quickStart: false } };
    localStorage.setItem(KEY, JSON.stringify(old));
    const { S, load } = await import('/src/save.js'); const cos = await import('/src/engine/cosmetics.js'); const prog = await import('/src/engine/progress.js'); const chars = await import('/src/engine/chars.js');
    load();
    const o = {};
    o.names = S.names.join(); o.players = S.settings.players; o.coins = S.coins;
    o.wins = S.arcade.wins.join(); o.tour = S.arcade.tourneys.join(); o.gw = S.arcade.byGame.airhockey.wins.join(); o.pairs = JSON.stringify(S.arcade.pairs);
    const c = cos.cosm(); o.cos = [c.owned.length, c.equipped.length, c.equipped[0].hat, c.owned[2].hat.join(), c.equipped[2].hat];
    o.pts = prog.points();   // plays 9 + wins 7 + tourneys 1*8 + jobs 1
    o.look = chars.makeBrother(0).spec.hat;
    S.arcade.wins[2] = 5; o.pts2 = prog.points();
    return o;
  });
  check('migratie: namen 4, players=2, coins behouden', r.names === 'Wes,Jor,Juul,Sam' && r.players === 2 && r.coins === 77, JSON.stringify(r));
  check('migratie: wins/tourneys/byGame aangevuld tot 4', r.wins === '3,4,0,0' && r.tour === '1,0,0,0' && r.gw === '1,3,0,0' && r.pairs === '{}', JSON.stringify(r));
  check('migratie: cosmetica 4 spelers, Wes houdt zijn pet', r.cos.join() === '4,4,cap,std,std' && r.look === 'cap', r.cos.join());
  check('progress.points() somt over spelers-id', r.pts === 25 && r.pts2 === 30, `${r.pts} ${r.pts2}`);
  await page.close();
}

}   // einde 2/3-spelers-suite (1-4)

// ---------------------------------------------------------------- 5. harness met deelnemers
const RUN = `
async function runDuel(id, ids, { winnerSlot = 0, score = null, twist = null, shot = null, teams = null } = {}) {
  const app = window.__app, { S } = await import('/src/save.js'), { MinigameMode, SERIES } = await import('/src/engine/harness.js');
  const { input, KEY_LABELS } = await import('/src/engine/input.js'); const chars = await import('/src/engine/chars.js');
  const def = id === '_tri_test' ? (await import('/src/games/_tri_test.js')).default : id === '_quad_test' ? (await import('/src/games/_quad_test.js')).default : id === '_quad_ffa' ? { ...(await import('/src/games/_quad_test.js')).default, teams: false, id: 'quad_ffa' } : id === '_quad_duo' ? { ...(await import('/src/games/_quad_test.js')).default, teams: false, players: [2], id: 'quad_duo' } : app.games[id];
  const before = { plays: S.arcade.plays, wins: S.arcade.wins.slice(), draws: S.arcade.draws, g: JSON.parse(JSON.stringify(S.arcade.byGame[def.id] || { plays: 0, wins: [0, 0, 0] })), pairs: JSON.stringify(S.arcade.pairs) };
  app.setMode(null);   // zoals app.playGame: eerst het vorige mode weg
  let done = null; const m = new MinigameMode(app, def, { extra: ids || teams ? { ...(ids ? { players: ids } : {}), ...(teams ? { teams } : {}) } : null, twist, onDone: (r) => { done = r; app.setMode(null); } });
  app.setMode(m);
  const o = { ids: m.ids.slice(), n: m.n };
  o.teams = m.ctx.teams; o.teamOf = m.ctx.teamOf; o.teamInfo = m.ctx.teamInfo && m.ctx.teamInfo.map((t) => [t.name, t.color.toString(16)].join(':'));
  o.ctxPlayers = m.ctx.players.map((p) => [p.id, p.index, p.name, p.color.toString(16), p.css].join(':'));
  o.pMap = input.p.length === m.n && m.ids.every((k, s) => input.p[s] === input.all[k]);
  o.labels = KEY_LABELS.slice(0, m.n).map((k) => k.move).join();
  o.pcol = chars.PLAYER_COLORS.slice(0, m.n).map((c) => c.toString(16)).join();
  const boxes = [...document.querySelectorAll('#hud .pbox')].sort((a, b) => a.dataset.slot - b.dataset.slot);   // op slot (bij 4 spelers staat de DOM-volgorde 0,2,1,3)
  o.hud = boxes.map((e) => e.querySelector('.n').textContent).join();
  o.hudKeys = boxes.map((e) => e.querySelector('.k').textContent).join('|');
  o.intro = [...document.querySelectorAll('.rdy')].map((e) => e.textContent).join('|');
  o.brother = chars.makeBrother(0).playerId;
  if (shot) window.__shot = shot;
  // start: iedereen drukt A
  for (const k of m.ids) input.virtual[k].a = true; input.update(); m.update(0.016); for (const k of m.ids) input.virtual[k].a = false; input.update(); m.update(0.016);
  await new Promise((r) => setTimeout(r, 450));
  let g = 0; while (m.state !== 'play' && g++ < 3000) { input.update(); m.update(0.016); }
  for (let i = 0; i < 60; i++) { input.update(); m.update(0.016); }
  o.state = m.state; o.twist = m.ctx.twist.id;
  o.sizes = m.ids.map((_, s) => m.ctx.pvp.size(s)); o.pvpIn = m.ctx.pvp.input(m.n - 1) !== undefined;
  window.__m = m; window.__done = () => done;
  return o;
}
async function finishDuel(winnerSlot, score) {
  const m = window.__m; const { S } = await import('/src/save.js'); const { SERIES } = await import('/src/engine/harness.js');
  const { input, KEY_LABELS } = await import('/src/engine/input.js'); const chars = await import('/src/engine/chars.js');
  m.ctx.finishPvp(Array.isArray(winnerSlot) ? { winners: winnerSlot, score, summary: 'testduel', delay: 50 } : { winner: winnerSlot, score, summary: 'testduel', delay: 50 });
  await new Promise((r) => setTimeout(r, 200));
  for (let i = 0; i < 5; i++) { input.update(); m.update(0.016); }
  const r = m.result; const o = { res: { ids: r.ids, winner: r.winner, winners: r.winners, winnerId: r.winnerId, winnerIds: r.winnerIds, place: r.place, teams: r.teams, scoreById: r.scoreById, scoreArr: r.scoreArr } };
  o.card = document.querySelector('.card.pvp') ? document.querySelector('.card.pvp').innerText.replace(/\\n+/g, ' / ') : null;
  o.series = JSON.stringify({ key: SERIES.key, wins: SERIES.wins, byId: SERIES.winsById, n: SERIES.n });
  return o;
}
async function closeDuel(rematch = false) {
  const m = window.__m; const { S } = await import('/src/save.js'); const { input, KEY_LABELS } = await import('/src/engine/input.js'); const chars = await import('/src/engine/chars.js');
  await new Promise((r) => { const t = setInterval(() => { if (m.resultReady) { clearInterval(t); r(); } }, 50); });
  m.close(rematch);
  const o = { wins: S.arcade.wins.join(), draws: S.arcade.draws, plays: S.arcade.plays, g: JSON.stringify(S.arcade.byGame[m.def.id]), pairs: JSON.stringify(S.arcade.pairs) };
  o.restored = input.p.length === 2 && input.p[0] === input.all[0] && input.p[1] === input.all[1] && KEY_LABELS[0].move === 'WASD' && KEY_LABELS[1].move === 'Pijltjes' && KEY_LABELS[3].move === 'Numpad 8456' && chars.PLAYER_COLORS[0] === 0x2f9e5b && chars.PLAYER_COLORS[1] === 0x3a78e0 && chars.PLAYER_COLORS[3] === 0xc844e8 && chars.makeBrother(0).playerId === 0 && chars.makeBrother(3).playerId === 3 && !rematch;
  o.hudAfter = document.querySelectorAll('#hud .pbox').length;
  return o;
}`;
if (PL !== 4) {
  const page = await open(3);
  await page.addScriptTag({ type: 'module', content: `${RUN}\nwindow.runDuel = runDuel; window.finishDuel = finishDuel; window.closeDuel = closeDuel;` });
  await page.waitForFunction(() => window.runDuel, null, { timeout: 20000 });
  const shot = async (name) => { if (SHOTS) await page.waitForTimeout(800); if (SHOTS) await page.screenshot({ path: `${OUT}/${name}.png` }); };
  // Juul draagt een feesthoed in het duel Wes-Juul
  await page.evaluate(async () => { const cos = await import('/src/engine/cosmetics.js'); cos.cosm().owned[2].hat.push('party'); cos.cosm().equipped[2].hat = 'party'; cos.cosm().owned[0].hat.push('crown'); cos.cosm().equipped[0].hat = 'crown'; });

  const cases = [
    ['airhockey', [2, 0], 0, [3, 1], 'Juul wint als slot 0'],
    ['tugwar', [1, 2], 1, [0, 2], 'Juul wint als slot 1'],
    ['paint', [0, 2], 1, [4, 7], 'Juul wint (slot 1)'],
    ['airhockey', [0, 1], 0, [1, 0], 'standaard paar Wes-Jor'],
  ];
  for (const [id, ids, ws, sc, label] of cases) {
    const base = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return { wins: S.arcade.wins.slice(), g: JSON.stringify(S.arcade.byGame) }; });
    const o = await page.evaluate(([id, ids]) => runDuel(id, ids), [id, ids]);
    check(`harness ${id} ${ids}: deelnemers/ctx.players/HUD/labels`, o.ids.join() === ids.join() && o.n === 2 && o.pMap && o.state === 'play' && o.brother === ids[0]
      && o.ctxPlayers.length === 2 && o.ctxPlayers[0].startsWith(`${ids[0]}:0:`) && o.hud === ids.map((k) => ['Wes', 'Jor', 'Juul'][k]).join()
      && o.labels === ids.map((k) => ['WASD', 'Pijltjes', 'IJKL'][k]).join() && o.pcol === ids.map((k) => ['2f9e5b', '3a78e0', 'f08a2a'][k]).join(), JSON.stringify(o));
    if (id === 'airhockey' && ids[0] === 2) await shot('duel_juul_wes');
    if (id === 'paint') await shot('duel_wes_juul_paint');
    const f = await page.evaluate(([ws, sc]) => finishDuel(ws, sc), [ws, sc]);
    const wid = ids[ws];
    check(`harness ${id}: result.winnerId/ids/scoreById (${label})`, JSON.stringify(f.res.ids) === JSON.stringify(ids) && f.res.winner === ws && f.res.winnerId === wid && f.res.scoreById[ids[0]] === sc[0] && f.res.scoreById[ids[1]] === sc[1] && Object.keys(f.res.scoreById).length === 2, JSON.stringify(f.res));
    check(`harness ${id}: resultaatkaart noemt winnaar`, f.card && f.card.includes(`${['Wes', 'Jor', 'Juul'][wid]} wint!`), f.card);
    if (id === 'tugwar') await shot('result_two_juul');
    const c = await page.evaluate(() => closeDuel(false));
    const exp = base.wins.slice(); exp[wid]++;
    check(`harness ${id}: S.arcade.wins per spelers-id + mapping hersteld`, c.wins === exp.join() && c.restored && c.hudAfter === 0, `${c.wins} verwacht ${exp.join()} restored=${c.restored}`);
    const gw = JSON.parse(c.g).wins; check(`harness ${id}: byGame wins per id`, gw[wid] >= 1 && gw.length === 4, c.g);
    const pk = [ids[0], ids[1]].sort().join('-'); check(`harness ${id}: S.arcade.pairs['${pk}']`, !!JSON.parse(c.pairs)[pk], c.pairs);
  }
  // revanche behoudt de deelnemers
  {
    const o = await page.evaluate(() => runDuel('airhockey', [2, 1])); await page.evaluate(() => finishDuel(0, [1, 0]));
    const ids = await page.evaluate(async () => { const m = window.__m; await new Promise((r) => { const t = setInterval(() => { if (m.resultReady) { clearInterval(t); r(); } }, 50); }); m.close(true); const nm = window.__app.mode; const { input } = await import('/src/engine/input.js'); return [nm.ids.join(), input.p[0] === input.all[2], nm === m]; });
    check('revanche: zelfde deelnemers [2,1], mapping actief', ids[0] === '2,1' && ids[1] && !ids[2], ids.join());
    await page.evaluate(() => { window.__app.mode.dispose(); window.__app.setMode(null); });
  }
  // 3-slot-testspel
  {
    const o = await page.evaluate(() => runDuel('_tri_test', null, { twist: 'none' }));
    check('tri_test: zonder extra.players spelen alle 3 (def.players [3])', o.n === 3 && o.ids.join() === '0,1,2' && o.hud === 'Wes,Jor,Juul' && o.labels === 'WASD,Pijltjes,IJKL' && o.intro.split('|').length === 3, JSON.stringify(o));
    // elk slot scoort om de beurt
    const s = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); const m = window.__m; const I = m.instance;
      for (const k of [0, 1, 2]) { input.virtual[k].a = true; input.update(); m.update(0.016); input.virtual[k].a = false; input.update(); m.update(0.016); }
      const sc = I.dbg.scores; document.__sc = sc; return { sc, hudInfo: [...document.querySelectorAll('#hud .pbox .i')].map((e) => e.textContent).join('|') }; });
    check('tri_test: A van Wes/Jor/Juul scoort in slot 0/1/2', s.sc.join() === '1,1,1' && s.hudInfo === 'Punten: 1|Punten: 1|Punten: 1', JSON.stringify(s));
    await shot('hud_three_play');
    const fin = await page.evaluate(() => finishDuel(2, [1, 1, 3]));
    check('tri_test: winnaar slot 2 -> winnerId 2, scoreById 3 spelers, kaart met kroon', fin.res.winnerId === 2 && JSON.stringify(fin.res.scoreById) === '{"0":1,"1":1,"2":3}' && fin.card.includes('Juul wint!') && fin.card.includes('👑 Juul 3'), JSON.stringify(fin));
    await shot('result_three');
    const wb = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return S.arcade.wins.join(); });
    const c = await page.evaluate(() => closeDuel(false));
    const w0 = wb.split(',').map(Number); w0[2]++;
    check('tri_test: statistieken Juul +1, geen paar-record bij 3 deelnemers', c.wins === w0.join() && c.restored, `${c.wins} vs ${w0.join()}`);
  }
  // twists met 3 deelnemers: bodyswap + giant
  {
    await page.evaluate(() => runDuel('_tri_test', [0, 1, 2], { twist: 'bodyswap' }));
    const b = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); const m = window.__m; const res = [];
      m.nextSwap = 0; input.virtual[0].x = 1; input.virtual[1].x = 0; input.virtual[2].x = -1; input.update(); m.update(0.016); input.update(); m.update(0.016);
      const sp = m.swapPair.slice(); const ok = m.swapped && sp.length === 2 && sp[0] !== sp[1];
      const xs = [0, 1, 2].map((s) => m.pvpIn[s].x); const raw = [1, 0, -1];
      const exp = [0, 1, 2].map((s) => raw[s === sp[0] ? sp[1] : s === sp[1] ? sp[0] : s]);
      input.virtual[0].x = 0; input.virtual[2].x = 0; window.__app.mode.dispose(); window.__app.setMode(null);
      return { ok, sp, xs, exp };
    });
    check('bodyswap met 3 deelnemers wisselt twee slots', b.ok && b.xs.join() === b.exp.join(), JSON.stringify(b));
    const o = await page.evaluate(() => runDuel('_tri_test', [2, 0, 1], { twist: 'giant' }));
    check('giant met 3 deelnemers: 1 reus, 2 dwergen', o.sizes.filter((x) => x > 1).length === 1 && o.sizes.filter((x) => x < 1).length === 2, o.sizes.join());
    await page.evaluate(() => { window.__app.mode.dispose(); window.__app.setMode(null); });
  }
  // def.players: 3 deelnemers bij een 1-tegen-1-spel -> alleen de eerste twee
  {
    const o = await page.evaluate(() => runDuel('tugwar', [0, 1, 2]));
    check('1-tegen-1-duel met 3 ids: alleen eerste twee spelen', o.n === 2 && o.ids.join() === '0,1', JSON.stringify(o));
    await page.evaluate(() => { window.__app.mode.dispose(); window.__app.setMode(null); });
  }
  await page.close();
}

// ================================================================ PLAYERS=4: de 4-spelers-suite (docs/PLAYERS4.md)
if (PL === 4) {
  // ------------------------------------------------------------ Q1. invoer (4 spelers)
  {
    const page = await open(4);
    const r = await page.evaluate(async () => {
      const { input, KEY_LABELS, KEYMAP } = await import('/src/engine/input.js');
      const out = {};
      out.len = [input.all.length, input.p.length, input.virtual.length, input.prev.length, input.pads.length];
      out.ident = input.p[0] === input.all[0] && input.p[1] === input.all[1];
      input.virtual[3].a = true; input.virtual[3].x = 1; input.update();
      out.samA = input.all[3].aP; out.samX = input.all[3].x; out.anyA = input.anyA();
      input.virtual[3].a = false; input.virtual[3].x = 0; input.update(); out.samR = input.all[3].aR; out.anyAafter = input.anyA();
      input.mapSlots([3, 1, 0, 2]);
      out.mapped = input.p.length === 4 && input.p[0] === input.all[3] && input.p[1] === input.all[1] && input.p[2] === input.all[0] && input.p[3] === input.all[2];
      out.labels = KEY_LABELS.slice(0, 4).map((k) => k.move).join('|');
      input.virtual[3].x = 1; input.virtual[2].y = -1; input.update(); out.s0x = input.p[0].x; out.s3y = input.p[3].y; input.virtual[3].x = 0; input.virtual[2].y = 0; input.update();
      input.mapSlots([2, 3]); out.two = input.p.length === 2 && input.p[1] === input.all[3] && KEY_LABELS[0].move === 'IJKL' && KEY_LABELS[1].move === 'Numpad 8456' && KEY_LABELS[2].move === 'IJKL' && KEY_LABELS[3].move === 'Numpad 8456';
      input.mapSlots([0, 1, 2, 3]); out.four = input.p.length === 4 && input.p[3] === input.all[3];
      input.resetSlots(); out.reset = input.p.length === 2 && KEY_LABELS[0].move === 'WASD' && KEY_LABELS[1].move === 'Pijltjes' && KEY_LABELS[2].move === 'IJKL' && KEY_LABELS[3].move === 'Numpad 8456';
      out.keyLabel = JSON.stringify(KEY_LABELS[3]);
      input.setRemote(3, { a: true, x: 1, y: 0 }, ['Escape']); input.update();
      out.remote = [input.all[3].a, input.all[3].x, input.online, input.pressed('Escape'), input.isRemote(3), input.isRemote(2)].join();
      input.clearRemote(3); input.update(); out.remoteGone = !input.all[3].a && !input.online;
      out.gameKeys = ['Numpad8', 'Numpad4', 'Numpad5', 'Numpad2', 'Numpad6', 'Numpad7', 'Numpad9', 'KeyU', 'KeyW', 'ArrowUp'].every((c) => input.isGameKey(c));
      out.keymapSam = JSON.stringify(KEYMAP[3]);
      const seen = new Map(), dup = [];   // geen toets mag bij twee spelers staan
      for (let i = 0; i < 4; i++) for (const b of ['up', 'down', 'left', 'right', 'a', 'b']) for (const c of KEYMAP[i][b]) { if (seen.has(c)) dup.push(c); seen.set(c, i); }
      out.dups = dup.join();
      return out;
    });
    check('input(4): all/p/virtual/prev/pads lengtes', r.len.join() === '4,2,4,4,4', r.len.join());
    check('input(4): p[i] === all[i] standaard', r.ident);
    check('input(4): Sam (virtual[3]) -> all[3] a/x, anyA', r.samA && r.samX === 1 && r.anyA && r.samR && !r.anyAafter, JSON.stringify(r));
    check('input(4): mapSlots([3,1,0,2]) + slot-view van KEY_LABELS', r.mapped && r.labels === 'Numpad 8456|Pijltjes|WASD|IJKL', r.labels);
    check('input(4): slot 0 volgt speler 3, slot 3 speler 2', r.s0x === 1 && r.s3y === -1, JSON.stringify(r));
    check('input(4): mapSlots met 2 en 4 ids, resetSlots herstelt labels', r.two && r.four && r.reset, JSON.stringify(r));
    check('input(4): BASE_KEY_LABELS[3] = Numpad 8456 / Num7 / Num9', r.keyLabel === '{"move":"Numpad 8456","a":"Num7","b":"Num9"}', r.keyLabel);
    check('input(4): remote speler 3 (setRemote/clearRemote/isRemote)', r.remote === 'true,1,true,true,true,false' && r.remoteGone, r.remote);
    check('input(4): isGameKey voor Numpad + andere spelers; KEYMAP Sam', r.gameKeys && r.keymapSam === '{"up":["Numpad8"],"down":["Numpad5","Numpad2"],"left":["Numpad4"],"right":["Numpad6"],"a":["Numpad7"],"b":["Numpad9"]}', r.keymapSam);
    check('input(4): geen toets bij twee spelers', r.dups === '', r.dups);
    // toetsenbord: Numpad8 + Numpad6 + Numpad7 = Sam omhoog, rechts, A
    await page.keyboard.down('Numpad8'); await page.keyboard.down('Numpad6'); await page.keyboard.down('Numpad7'); await page.waitForTimeout(150);
    const k1 = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); input.update(); const s = input.all[3]; return [s.up, s.right, s.a, s.b, input.all[0].a, input.all[1].a, input.all[2].a].join(); });
    await page.keyboard.up('Numpad8'); await page.keyboard.up('Numpad6'); await page.keyboard.up('Numpad7');
    check('toetsenbord(4): Numpad 8/6/7 = Sam omhoog/rechts/A, anderen niet', k1 === 'true,true,true,false,false,false,false', k1);
    await page.keyboard.down('Numpad5'); await page.keyboard.down('Numpad4'); await page.keyboard.down('Numpad9'); await page.waitForTimeout(150);
    const k2 = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); input.update(); const s = input.all[3]; return [s.down, s.left, s.b].join(); });
    await page.keyboard.up('Numpad5'); await page.keyboard.up('Numpad4'); await page.keyboard.up('Numpad9');
    check('toetsenbord(4): Numpad 5/4/9 = Sam omlaag/links/B', k2 === 'true,true,true', k2);
    await page.keyboard.down('Numpad2'); await page.waitForTimeout(100);
    const k3 = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); input.update(); return input.all[3].down; });
    await page.keyboard.up('Numpad2');
    check('toetsenbord(4): Numpad2 = ook omlaag', k3 === true);
    await page.close();
  }
  for (const pl of [3, 2]) {
    const page = await open(pl);
    await page.keyboard.down('Numpad7'); await page.keyboard.down('Numpad8'); await page.waitForTimeout(120);
    const r = await page.evaluate(async () => {
      const { input } = await import('/src/engine/input.js');
      input.virtual[3].a = true; input.update();
      return { a: input.all[3].a, up: input.all[3].up, gk: input.isGameKey('Numpad7'), juulGk: input.isGameKey('KeyU'), p: input.p.length };
    });
    await page.keyboard.up('Numpad7'); await page.keyboard.up('Numpad8');
    check(`${pl} spelers: Sam-staat blijft nul, Numpad geen spel-toets`, !r.a && !r.up && !r.gk && r.juulGk === (pl === 3) && r.p === 2, JSON.stringify(r));
    await page.close();
  }

  // ------------------------------------------------------------ Q2. chars / cosmetica / party (4 spelers)
  {
    const page = await open(4);
    const r = await page.evaluate(async () => {
      const chars = await import('/src/engine/chars.js'); const cos = await import('/src/engine/cosmetics.js');
      const { S } = await import('/src/save.js'); const party = await import('/src/engine/party.js');
      const out = {};
      out.colors = [chars.PLAYER_COLORS.length, chars.PLAYER_CSS.length, chars.PLAYER_COLORS[3].toString(16), chars.PLAYER_CSS[3], chars.BASE_COLORS.length];
      const specs = [0, 1, 2, 3].map((i) => chars.brotherSpec(i));
      out.distinct = new Set(specs.map((s) => s.shirt)).size === 4 && new Set(specs.map((s) => s.skin)).size === 4 && new Set(specs.map((s) => s.scale)).size === 4 && new Set(specs.map((s) => s.hair)).size >= 3;
      out.sam = [specs[3].hat, specs[3].collar != null, specs[3].grin > 1, specs[3].shirt.toString(16)];
      const sam = chars.makeBrother(3); out.samMake = [sam.brother, sam.playerId, sam.playerName, sam.height > 1, sam.group.children.length > 0];
      // slot-mapping met Sam voorop
      chars.setSlotPlayers([3, 0]);
      const a = chars.makeBrother(0), b = chars.makeBrother(1);
      out.slot = [a.playerId, a.playerName, b.playerId, b.playerName, chars.PLAYER_COLORS[0].toString(16), chars.PLAYER_COLORS[1].toString(16), chars.getSlotPlayers().join()];
      chars.setSlotPlayers([0, 1, 2, 3]);
      out.ident = [chars.makeBrother(3).playerName, chars.PLAYER_COLORS[3].toString(16), chars.PLAYER_COLORS[0].toString(16)];
      // winkel: Sam koopt een cape, hoed
      cos.cosm().owned[3].cape.push('red'); cos.cosm().equipped[3].cape = 'red'; cos.cosm().owned[3].hat.push('crown'); cos.cosm().equipped[3].hat = 'crown';
      const sp = chars.brotherSpec(3); out.shop = [sp.cape === 0xd8372c, sp.hat, chars.makeBrother(3).spec.cape === 0xd8372c];
      cos.cosm().equipped[3].hat = 'none'; out.none = chars.brotherSpec(3).hat == null;
      cos.cosm().equipped[3] = { hat: 'std', shirt: 'std', hair: 'std', cape: 'std' };
      out.std = [chars.brotherSpec(3).hat, chars.brotherSpec(3).cape];
      out.items = [cos.itemsFor(3, 'hat')[0].name, cos.itemsFor(3, 'hat')[1].id, cos.itemsFor(3, 'shirt')[0].c.toString(16), cos.catLabel('cape', 3), cos.catLabel('cape', 2), cos.cosm().owned.length, cos.cosm().equipped.length];
      // Wes/Jor/Juul ongewijzigd
      out.old = [chars.brotherSpec(0).scarf === 0xd8372c, chars.brotherSpec(1).cape === 0xe5484d, chars.brotherSpec(2).scarf === 0xff6fb5];
      out.act = [party.activeIds().join(), party.playerCount(), party.pairsOf([0, 1, 2, 3]).map((p) => p.join('')).join('|'), party.chooseNames([3, 1]).join(), party.nameOf(3), party.spectators([1, 3]).join()];
      out.names = S.names.join();
      return out;
    });
    check('chars(4): PLAYER_COLORS/CSS/BASE_COLORS hebben 4 items, Sam paars', r.colors[0] === 4 && r.colors[1] === 4 && r.colors[4] === 4 && r.colors[2] === 'c844e8' && r.colors[3] === '#d45cf0', r.colors.join());
    check('chars(4): 4 verschillende looks (shirt, huid, lengte)', r.distinct);
    check('chars(4): Sam = achterstevoren pet, hoodie-kraag, grijns, paars shirt', r.sam.join() === 'capback,true,true,9b3fe0', r.sam.join());
    check('chars(4): makeBrother(3) bouwt Sam', r.samMake.join() === '3,3,Sam,true,true', r.samMake.join());
    check('chars(4): setSlotPlayers([3,0]) -> slot 0 = Sam, kleuren volgen', r.slot.join() === '3,Sam,0,Wes,c844e8,2f9e5b,3,0,1,2', r.slot.join());
    check('chars(4): setSlotPlayers herstelt identiteit', r.ident.join() === 'Sam,c844e8,2f9e5b', r.ident.join());
    check('cosmetica(4): Sam kan cape + hoed dragen, "none", standaard (pet, geen cape)', r.shop[0] && r.shop[1] === 'crown' && r.shop[2] && r.none && r.std[0] === 'capback' && r.std[1] == null, JSON.stringify([r.shop, r.none, r.std]));
    check('cosmetica(4): itemsFor/catLabel/cosm() voor 4 spelers', r.items[0].includes('pet') && r.items[1] === 'none' && r.items[2] === '9b3fe0' && r.items[3] === 'Cape' && r.items[4] === 'Sjaal' && r.items[5] === 4 && r.items[6] === 4, r.items.join());
    check('cosmetica(4): Wes/Jor/Juul-looks ongewijzigd', r.old.every(Boolean), r.old.join());
    check('party(4): activeIds/playerCount/pairsOf/chooseNames/nameOf/spectators', r.act.join('|') === '0,1,2,3|4|01|02|03|12|13|23|Sam,Jor|Sam|0,2' && r.names === 'Wes,Jor,Juul,Sam', r.act.join('|') + ' ' + r.names);
    await page.close();
  }

  // ------------------------------------------------------------ Q3. DuelQueue (4), Bracket, party-helpers
  {
    const page = await open(4);
    const r = await page.evaluate(async () => {
      const { DuelQueue, duelQueue, resetDuelQueue, Bracket, playPlan, playBadge, supports, splitTeams } = await import('/src/engine/party.js');
      const { S } = await import('/src/save.js');
      const o = {};
      // --- DuelQueue met 4 spelers
      const q = new DuelQueue([0, 1, 2, 3]);
      o.q0 = [q.next().join(), q.waiting().join()];
      o.q1 = [q.report(0).join(), q.waiting().join(), q.champion, q.streak];     // Wes wint: Wes blijft, Jor achteraan, Juul uitdager
      o.q2 = [q.report(2).join(), q.waiting().join(), q.champion, q.streak];     // Juul wint: Wes achteraan, Sam uitdager
      o.q3 = [q.report(3).join(), q.waiting().join(), q.champion, q.streak];     // Sam wint: Juul achteraan, Jor uitdager
      o.q4 = [q.report(null).join(), q.waiting().length, q.champion];            // gelijkspel: uitdager weg
      o.q5 = [q.pick(1, 3).join(), q.waiting().join()];
      const qm = new DuelQueue([0, 1, 2, 3], { maxStreak: 2 }); qm.report(0); o.qm = [qm.report(0).join(), qm.streak, qm.champion];   // na 2 winsten moet Wes zitten
      const q2 = new DuelQueue([2, 3]); o.q2p = [q2.next().join(), q2.report(3).join(), q2.waiting().length];
      const fresh = new DuelQueue([3, 1, 0, 2]); o.qOrder = [fresh.next().join(), fresh.waiting().join()];   // start: eerste twee uit de lijst
      o.single = duelQueue() === duelQueue() && duelQueue().ids.length === 4;
      S.settings.players = 3; o.refresh3 = duelQueue().ids.length; S.settings.players = 4; o.refresh4 = duelQueue().ids.length; resetDuelQueue();
      // --- Bracket, 4 spelers (vaste volgorde)
      const b = new Bracket([0, 1, 2, 3], { shuffle: false });
      const rr = (x) => (x ? [x.name, x.kind, x.pair.join(), x.no + '/' + x.of, x.waiting.join(), x.replay].join(';') : null);
      o.b1 = rr(b.round()); o.lab1 = b.label();
      o.b2 = rr(b.report(1)); o.b3 = rr(b.report(2)); o.mid = [b.done, b.champion, b.standings().join()];
      o.b4 = b.report(2); o.done = b.done; o.champ = b.champion; o.stand = b.standings().join(); o.lab2 = b.label(); o.res = b.results.map((x) => [x.name, x.winner, x.loser].join(':')).join('|');
      o.afterDone = b.report(0) === null && b.round() === null;
      // met troostfinale
      const t = new Bracket([0, 1, 2, 3], { shuffle: false, thirdPlace: true });
      t.round(); t.report(0); t.report(3); o.t3 = rr(t.round()); t.report(2); o.t4 = rr(t.round()); t.report(3);
      o.tdone = [t.done, t.standings().join(), t.results.length];
      // gelijkspel: opnieuw; na maxDraws muntworp
      const d = new Bracket([0, 1], { shuffle: false, maxDraws: 2 });
      o.d1 = rr(d.round()); o.d2 = rr(d.report(null)); o.d3 = rr(d.report(5));   // 5 zit niet in het paar = ook gelijkspel
      const dn = d.report(null); o.d4 = [dn, d.done, d.results[0].coin, d.results[0].draws, [0, 1].includes(d.champion)];
      // 3 spelers (bye voor de laatste)
      const b3 = new Bracket([0, 1, 2], { shuffle: false });
      o.t1 = rr(b3.round()); o.t2 = rr(b3.report(1)); b3.report(2); o.t5 = [b3.done, b3.standings().join()];
      // 2 spelers
      const b2 = new Bracket([3, 1], { shuffle: false }); o.p1 = rr(b2.round()); b2.report(1); o.p2 = [b2.done, b2.standings().join()];
      // seed: zelfde seed = zelfde volgorde, alle ids aanwezig, verschillende seeds geven verschillende volgordes
      const ord = (seed) => new Bracket([0, 1, 2, 3], { seed }).order.join();
      o.seedSame = ord(5) === ord(5); o.seedAll = [...Array(20).keys()].every((s) => ord(s).split(',').sort().join() === '0,1,2,3'); o.seedVar = new Set([...Array(20).keys()].map(ord)).size > 4;
      const bs = new Bracket([0, 1, 2, 3], { seed: 11 }); const sr = bs.round(); o.semiCover = sr.pair.concat(sr.waiting).sort().join() === '0,1,2,3';
      // --- helpers
      o.plan = [
        playPlan({ players: [2, 3, 4] }, [0, 1, 2, 3]), playPlan({}, [0, 1, 2, 3]), playPlan({}, [0, 1, 2]), playPlan({ players: [2, 3] }, [0, 1, 2, 3]),
        playPlan({ players: [3] }, [0, 1, 2, 3]), playPlan({ players: [4] }, [0, 1, 2]), playPlan({ players: [3] }, [0, 1]), playPlan({}, [0, 1]), playPlan({ players: [2, 4] }, [0, 1, 2]),
      ].map((x) => x.mode + (x.size ? x.size : '')).join();
      o.badge = [[2, 3, 4], [4], [2, 4], [3, 4], [2], [2, 3]].map((p) => playBadge({ players: p })).concat(playBadge({})).join('|');
      o.supports = [supports({ players: [2, 4] }, 4), supports({ players: [2, 4] }, 3), supports({}, 2), supports({}, 3)].join();
      let sd = 3; const rng = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
      const st = splitTeams(4, rng); o.teams = [st.length, st.flat().sort().join(''), st[0].length, splitTeams(3) === null, splitTeams(2) === null].join();
      o.teamsVar = new Set([...Array(15).keys()].map(() => JSON.stringify(splitTeams(4)))).size;
      return o;
    });
    check('DuelQueue(4): start [0,1], 2 en 3 wachten', r.q0[0] === '0,1' && r.q0[1] === '2,3', JSON.stringify(r.q0));
    check('DuelQueue(4): Wes wint -> [0,2], wachtrij 3,1', r.q1[0] === '0,2' && r.q1[1] === '3,1' && r.q1[2] === 0 && r.q1[3] === 1, JSON.stringify(r.q1));
    check('DuelQueue(4): Juul wint -> [2,3], wachtrij 1,0', r.q2[0] === '2,3' && r.q2[1] === '1,0' && r.q2[2] === 2 && r.q2[3] === 1, JSON.stringify(r.q2));
    check('DuelQueue(4): Sam wint -> [1,3], wachtrij 0,2', r.q3[0] === '1,3' && r.q3[1] === '0,2' && r.q3[2] === 3, JSON.stringify(r.q3));
    check('DuelQueue(4): gelijkspel = uitdager weg; pick(1,3) laat 0 en 2 wachten', r.q4[0].split(',').length === 2 && r.q4[1] === 2 && r.q4[2] === null && r.q5[0] === '1,3' && r.q5[1] === '0,2', JSON.stringify([r.q4, r.q5]));
    check('DuelQueue(4): maxStreak=2 zet de winnaar op de bank', !r.qm[0].split(',').includes('0') && r.qm[1] === 0 && r.qm[2] === null, JSON.stringify(r.qm));
    check('DuelQueue: 2 spelers [2,3] zonder wachtrij; startvolgorde volgt ids', r.q2p.join() === '2,3,2,3,0' && r.qOrder.join() === '1,3,0,2', JSON.stringify([r.q2p, r.qOrder]));
    check('duelQueue(): singleton, vernieuwd bij ander aantal spelers (3/4)', r.single && r.refresh3 === 3 && r.refresh4 === 4, JSON.stringify([r.single, r.refresh3, r.refresh4]));
    check('Bracket(4): halve finale 1/2 [0,1] en 2/2 [2,3], daarna finale van de winnaars', r.b1 === 'Halve finale 1/2;semi;0,1;1/3;2,3;0' && r.b2 === 'Halve finale 2/2;semi;2,3;2/3;0,1;0' && r.b3 === 'Finale;final;1,2;3/3;0,3;0' && r.lab1 === 'Halve finale 1/2: Wes – Jor', JSON.stringify([r.b1, r.b2, r.b3, r.lab1]));
    check('Bracket(4): uitslag, standings 1e..4e, label, results', r.mid.join('|') === 'false||1,2,0,3' && r.b4 === null && r.done === true && r.champ === 2 && r.stand === '2,1,0,3' && r.lab2 === 'Winnaar: Juul' && r.res === 'Halve finale 1/2:1:0|Halve finale 2/2:2:3|Finale:2:1' && r.afterDone, JSON.stringify([r.mid, r.champ, r.stand, r.lab2, r.res]));
    check('Bracket(4) met troostfinale: Troostfinale tussen de verliezers, daarna Finale', r.t3 === 'Troostfinale;third;1,2;3/4;0,3;0' && r.t4 === 'Finale;final;0,3;4/4;1,2;0' && r.tdone.join() === 'true,3,0,2,1,4', JSON.stringify([r.t3, r.t4, r.tdone]));
    check('Bracket: gelijkspel = zelfde ronde (replay telt), daarna muntworp', r.d1 === 'Finale;final;0,1;1/1;;0' && r.d2 === 'Finale;final;0,1;1/1;;1' && r.d3 === 'Finale;final;0,1;1/1;;2' && r.d4[0] === null && r.d4[1] && r.d4[2] === true && r.d4[3] === 3 && r.d4[4], JSON.stringify([r.d1, r.d2, r.d3, r.d4]));
    check('Bracket(3): bye -> halve finale [0,1], finale winnaar tegen speler 2', r.t1 === 'Halve finale;semi;0,1;1/2;2;0' && r.t2 === 'Finale;final;1,2;2/2;0;0' && r.t5.join() === 'true,2,1,0', JSON.stringify([r.t1, r.t2, r.t5]));
    check('Bracket(2): alleen een finale', r.p1 === 'Finale;final;3,1;1/1;;0' && r.p2.join() === 'true,1,3', JSON.stringify([r.p1, r.p2]));
    check('Bracket: seed = deterministisch geschud, elke id precies 1x', r.seedSame && r.seedAll && r.seedVar && r.semiCover);
    check('party: playPlan (all/bracket/queue/subset/unsupported)', r.plan === 'all4,bracket2,queue2,bracket2,subset3,unsupported,unsupported,all2,queue2', r.plan);
    check('party: playBadge / supports / splitTeams', r.badge === '👥 2-4|👥 4|👥 2-4|👥 3-4|🏆 knock-out|🏆 knock-out|🏆 knock-out' && r.supports === 'true,false,true,false' && r.teams === '2,0123,2,true,true' && r.teamsVar >= 3, JSON.stringify([r.badge, r.supports, r.teams, r.teamsVar]));
    await page.close();
  }

  // ------------------------------------------------------------ Q4. opslag: migratie, GAMEHAL-sleutel en -standaardwaarden
  {
    const page = await open(2);
    const r = await page.evaluate(async () => {
      const KEY = 'heitjes_voor_karweitjes_v1';
      const { S, load, migrate, persist } = await import('/src/save.js'); const cos = await import('/src/engine/cosmetics.js'); const prog = await import('/src/engine/progress.js'); const chars = await import('/src/engine/chars.js');
      const out = {};
      const blank = () => ({ hat: ['std'], shirt: ['std'], hair: ['std'], cape: ['std'] }), eq = () => ({ hat: 'std', shirt: 'std', hair: 'std', cape: 'std' });
      // 1. oude opslag met 3 spelers
      localStorage.setItem(KEY, JSON.stringify({ names: ['Wes', 'Jor', 'Juul'], coins: 5, totalEarned: 40,
        arcade: { wins: [1, 2, 3], draws: 2, plays: 6, byGame: { tugwar: { plays: 3, wins: [1, 1, 1], streak: 2, streakWho: 2 } }, tourneys: [0, 1, 0], unlocked: [0] },
        cosmetics: { owned: [blank(), blank(), { ...blank(), hat: ['std', 'party'] }], equipped: [eq(), eq(), { ...eq(), hat: 'party' }] }, settings: { players: 3, scare: 1, quality: 'low' } }));
      load();
      out.three = [S.names.join(), S.settings.players, S.arcade.wins.join(), S.arcade.tourneys.join(), S.arcade.byGame.tugwar.wins.join(), S.cosmetics.owned.length, S.cosmetics.equipped.length, cos.cosm().equipped[2].hat, cos.cosm().equipped[3].hat, S.coins].join('|');
      out.look = [chars.makeBrother(2).spec.hat, chars.makeBrother(3).spec.hat];
      out.pts = prog.points();   // plays 6 + wins 6 + tourneys 1*8
      // 2. oude opslag met 2 spelers, rare waarden, ongeldige players
      localStorage.setItem(KEY, JSON.stringify({ names: ['Wes', 'Jor'], arcade: { wins: [3, null, 'x'], plays: 1, byGame: { a: { plays: 1 }, b: { plays: 1, wins: [1, 2, 3, 4, 5] } }, tourneys: [1] }, settings: { players: 7 } }));
      load();
      out.two = [S.names.join(), S.settings.players, S.arcade.wins.join(), S.arcade.tourneys.join(), S.arcade.byGame.a.wins.join(), S.arcade.byGame.b.wins.join()].join('|');
      // 3. players 4 blijft 4; migrate is idempotent en houdt S.names als hetzelfde array
      localStorage.setItem(KEY, JSON.stringify({ settings: { players: 4 }, names: ['Wes', 'Jor', 'Juul', 'Sam'] }));
      load(); const ref = S.names; const snap = JSON.stringify(S); migrate(); migrate();
      out.four = [S.settings.players, ref === S.names, JSON.stringify(S) === snap, S.names.join()].join('|');
      // 4. gewone versie: namen staan vast (ook bij aangepaste namen in opslag), eigen sleutel
      localStorage.setItem(KEY, JSON.stringify({ names: ['A', 'B', 'C', 'D'], settings: { players: 4 } })); load();
      out.fixedNames = S.names.join();
      out.defaults = [S.settings.unlockAll, S.settings.scare];
      persist(); out.keys = [localStorage.getItem(KEY) !== null, localStorage.getItem('impactid_gamehal_v1')];
      localStorage.removeItem(KEY);
      return out;
    });
    check('migratie(4): opslag met 3 spelers -> 4 (wins/tourneys/byGame/cosmetica), players 3 blijft', r.three === 'Wes,Jor,Juul,Sam|3|1,2,3,0|0,1,0,0|1,1,1,0|4|4|party|std|5', r.three);
    check('migratie(4): Juul houdt haar feesthoed, Sam standaard (pet)', r.look[0] === 'party' && r.look[1] === 'capback', r.look.join());
    check('migratie(4): progress.points() over 4 spelers', r.pts === 20, String(r.pts));
    check('migratie(4): opslag met 2 spelers + rare waarden + ongeldige players -> 2', r.two === 'Wes,Jor,Juul,Sam|2|3,0,0,0|1,0,0,0|0,0,0,0|1,2,3,4', r.two);
    check('migratie(4): players 4 blijft, migrate idempotent, S.names blijft hetzelfde array', r.four === '4|true|true|Wes,Jor,Juul,Sam', r.four);
    check('opslag(gewoon): namen vast, unlockAll uit, scare 2', r.fixedNames === 'Wes,Jor,Juul,Sam' && r.defaults.join() === 'false,2', JSON.stringify([r.fixedNames, r.defaults, r.keys]));
    check('opslag(gewoon): schrijft alleen naar heitjes_voor_karweitjes_v1', r.keys[0] === true && r.keys[1] === null, JSON.stringify(r.keys));
    await page.close();
  }
  {
    // GAMEHAL (window.GAMEHAL = true vóór het laden van save.js): eigen sleutel + standaardwaarden; en de gewone variant, in losse Node-processen
    const { spawnSync } = await import('node:child_process');
    const code = (gamehal, seed) => `
      globalThis.window = ${gamehal ? '{ GAMEHAL: true }' : '{}'};
      const store = {}; Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } });
      ${seed ? `store[${JSON.stringify(seed.key)}] = ${JSON.stringify(JSON.stringify(seed.value))};` : ''}
      const { GAMEHAL } = await import(${JSON.stringify(root + '/src/variant.js')});
      const sv = await import(${JSON.stringify(root + '/src/save.js')});
      const out = { GAMEHAL, before: sv.S.settings.players + '|' + sv.S.settings.unlockAll + '|' + sv.S.settings.scare + '|' + sv.S.names.join() };
      sv.load(); out.loaded = sv.S.settings.players + '|' + sv.S.settings.unlockAll + '|' + sv.S.names.join() + '|' + sv.S.arcade.wins.join() + '|' + sv.S.cosmetics.owned.length;
      sv.S.coins = 42; sv.persist(); out.keys = Object.keys(store).join(); out.hasSave = sv.hasSave();
      console.log(JSON.stringify(out));`;
    const run = (c) => { const p = spawnSync(process.execPath, ['--input-type=module', '-e', c], { encoding: 'utf8' }); try { return JSON.parse(p.stdout.trim().split('\n').pop()); } catch (e) { return { err: (p.stderr || p.stdout || String(e)).slice(0, 300) }; } };
    const g = run(code(true, null)), n = run(code(false, null));
    check('GAMEHAL: variant.js = true, standaard players 4, unlockAll, scare 0, 4 namen', g.GAMEHAL === true && g.before === '4|true|0|Wes,Jor,Juul,Sam' && g.loaded === '4|true|Wes,Jor,Juul,Sam|0,0,0,0|4', JSON.stringify(g));
    check('GAMEHAL: localStorage-sleutel impactid_gamehal_v1', g.keys === 'impactid_gamehal_v1', g.keys);
    check('gewone versie: GAMEHAL false, players 2, sleutel heitjes_voor_karweitjes_v1', n.GAMEHAL === false && n.before === '2|false|2|Wes,Jor,Juul,Sam' && n.keys === 'heitjes_voor_karweitjes_v1', JSON.stringify(n));
    const g2 = run(code(true, { key: 'impactid_gamehal_v1', value: { names: ['Mama', '  ', 'Juultje', 'Sammie'], settings: { players: 3 }, arcade: { wins: [1, 2], plays: 3 } } }));
    check('GAMEHAL: opgeslagen namen blijven (leeg -> standaard), players 3 blijft, wins aangevuld, hasSave', g2.loaded === '3|true|Mama,Jor,Juultje,Sammie|1,2,0,0|4' && g2.hasSave === true, JSON.stringify(g2));
    const g3 = run(code(true, { key: 'heitjes_voor_karweitjes_v1', value: { names: ['X', 'Y', 'Z', 'W'], settings: { players: 2 }, totalEarned: 99 } }));
    check('GAMEHAL: leest NIET uit de sleutel van de gewone versie', g3.loaded === '4|true|Wes,Jor,Juul,Sam|0,0,0,0|4' && g3.hasSave === false, JSON.stringify(g3));
    const n2 = run(code(false, { key: 'impactid_gamehal_v1', value: { settings: { players: 3 } } }));
    check('gewone versie: leest NIET uit de Gamehal-sleutel', n2.loaded && n2.loaded.startsWith('2|false|'), JSON.stringify(n2));
  }

  // ------------------------------------------------------------ Q5. harness met 4 deelnemers
  {
    const page = await open(4);
    await page.addScriptTag({ type: 'module', content: `${RUN}\nwindow.runDuel = runDuel; window.finishDuel = finishDuel; window.closeDuel = closeDuel;` });
    await page.waitForFunction(() => window.runDuel, null, { timeout: 20000 });
    const shot = async (name) => { if (SHOTS) { await page.waitForTimeout(800); await page.screenshot({ path: `${OUT}/${name}.png` }); } };
    const dispose = () => page.evaluate(() => { window.__app.mode && window.__app.mode.dispose && window.__app.mode.dispose(); window.__app.setMode(null); });
    // resolveParticipants / resolveTeams
    const rp = await page.evaluate(async () => {
      const { resolveParticipants: R, resolveTeams: T } = await import('/src/engine/harness.js'); const { S } = await import('/src/save.js');
      const o = {}; const j = (x) => x.join();
      o.def = [R({ players: [2, 3, 4] }, null), R({}, null), R({ players: [3] }, null), R({ players: [2, 4] }, null), R({ players: [2, 3] }, null), R({ players: [4] }, null)].map(j).join('|');
      o.ext = [R({ players: [2] }, { players: [3, 1, 0, 2] }), R({ players: [2, 3] }, { players: [3, 1, 0, 2] }), R({ players: [4] }, { players: [2, 3] }), R({ players: [3] }, { players: [2, 3, 1, 0] }), R({ players: [2, 3, 4] }, { players: [0, 0, 1] }), R({ players: [2, 3, 4] }, { players: [5, 1, 2] }), R({ players: [2, 3, 4] }, { players: [3, 0, 2, 1] }), R({ players: [2, 4] }, { players: [3, 0, 2] }), R({ players: [2, 3, 4] }, { players: [1] })].map(j).join('|');
      S.settings.players = 3; o.p3 = [R({ players: [2, 3, 4] }, null), R({ players: [2, 4] }, null), R({ players: [4] }, null)].map(j).join('|');
      S.settings.players = 2; o.p2 = [R({ players: [3] }, null), R({ players: [2, 3, 4] }, null)].map(j).join('|'); S.settings.players = 4;
      const d = { teams: true }; const J = JSON.stringify;
      o.teams = [T(d, null, 4), T(d, { teams: [[0, 3], [1, 2]] }, 4), T(d, { teams: [[0, 1], [0, 2]] }, 4), T(d, { teams: [[0], [1, 2, 3]] }, 4), T(d, { teams: [[0, 1]] }, 4), T(d, null, 3), T(d, null, 2), T({}, { teams: [[0, 1], [2, 3]] }, 4), T(d, { teams: [[0, 1], [2, 9]] }, 4)].map(J).join('|');
      return o;
    });
    check('resolveParticipants(4): standaard deelnemers per def.players', rp.def === '0,1,2,3|0,1|0,1,2|0,1,2,3|0,1,2|0,1,2,3', rp.def);
    check('resolveParticipants(4): extra.players (afkappen, aanvullen, filteren)', rp.ext === '3,1|3,1,0|2,3,0,1|2,3,1|0,1|1,2|3,0,2,1|3,0|0,1,2,3', rp.ext);
    check('resolveParticipants: bij players 3 en 2', rp.p3 === '0,1,2|0,1|0,1' && rp.p2 === '0,1|0,1', `${rp.p3} ${rp.p2}`);
    check('resolveTeams: indeling, ongeldig -> standaard bij 4, null bij 2-3 / zonder def.teams', rp.teams === '[[0,1],[2,3]]|[[0,3],[1,2]]|[[0,1],[2,3]]|[[0],[1,2,3]]|[[0,1],[2,3]]|null|null|null|[[0,1],[2,3]]', rp.teams);

    // 4 deelnemers, def.teams (standaardteams), alle slots
    const o4 = await page.evaluate(() => runDuel('_quad_test', null, { twist: 'none' }));
    // HUD bij 4: zonder teams staan slot 0,2 links en 1,3 rechts (2 hoeken + 2 eronder); met teams (def.teams: o4) staan teamgenoten in één kolom met teamlabel (links team 0, rechts team 1)
    const layJs = () => {
      const B = (s) => document.querySelector(`#hud .pbox[data-slot="${s}"]`).getBoundingClientRect(); const T = document.querySelector('#hud .hud-timer').getBoundingClientRect();
      const b = [0, 1, 2, 3].map(B), teams = !!document.querySelector('#hud .hud-top.teams');
      const L = teams ? [0, 1] : [0, 2], R = teams ? [2, 3] : [1, 3];   // slots links/rechts
      return { top: !!document.querySelector('#hud .hud-top.four'), teams, labels: [...document.querySelectorAll('#hud .hud-team')].map((e) => e.textContent).join('|'), n: document.querySelectorAll('#hud .pbox').length, below: b[L[1]].top >= b[L[0]].bottom - 1 && b[R[1]].top >= b[R[0]].bottom - 1 && Math.abs(b[L[1]].left - b[L[0]].left) < 3 && Math.abs(b[R[1]].right - b[R[0]].right) < 3, corners: b[L[0]].left < 40 && b[R[0]].right > innerWidth - 40 && b[L[0]].top < 40, mid: T.left > b[L[0]].right && T.right < b[R[0]].left, vis: T.width > 0 };
    };
    const lay = await page.evaluate(layJs);
    check('harness(4): zonder extra.players spelen alle 4 (def.players [2,3,4], players=4), ctx.players/HUD/labels/kleuren', o4.n === 4 && o4.ids.join() === '0,1,2,3' && o4.pMap && o4.state === 'play' && o4.hud === 'Wes,Jor,Juul,Sam' && o4.labels === 'WASD,Pijltjes,IJKL,Numpad 8456' && o4.pcol === '2f9e5b,3a78e0,f08a2a,c844e8' && o4.intro.split('|').length === 4 && o4.ctxPlayers[3].startsWith('3:3:Sam:'), JSON.stringify(o4));
    check('harness(4): teamspel-HUD: teamgenoten in één kolom (0,1 links | 2,3 rechts) met teamlabels, timer in het midden', lay.top && lay.teams && lay.labels === 'Wes & Jor|Juul & Sam' && lay.n === 4 && lay.below && lay.corners && lay.mid && lay.vis, JSON.stringify(lay));
    check('harness(4): standaard teams [[0,1],[2,3]], teamOf, teamInfo (kleur eerste lid)', JSON.stringify(o4.teams) === '[[0,1],[2,3]]' && o4.teamOf.join() === '0,0,1,1' && o4.teamInfo.join() === 'Wes & Jor:2f9e5b,Juul & Sam:f08a2a', JSON.stringify([o4.teams, o4.teamOf, o4.teamInfo]));
    // alle vier de A's tellen mee in hun eigen slot
    const s4 = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); const m = window.__m; const I = m.instance;
      for (const k of [0, 1, 2, 3]) { input.virtual[k].a = true; input.update(); m.update(0.016); input.virtual[k].a = false; input.update(); m.update(0.016); }
      const boxes = [...document.querySelectorAll('#hud .pbox')].sort((a, b) => a.dataset.slot - b.dataset.slot);
      return { sc: I.dbg.scores, ts: I.dbg.teamScores, info: boxes.map((e) => e.querySelector('.i').textContent).join('|') }; });
    check('harness(4): A van Wes/Jor/Juul/Sam scoort in slot 0..3, teamscores', s4.sc.join() === '1,1,1,1' && s4.ts.join() === '2,2' && s4.info === 'Team 1: 2 (jij 1)|Team 1: 2 (jij 1)|Team 2: 2 (jij 1)|Team 2: 2 (jij 1)', JSON.stringify(s4));
    await shot('hud_four_play');
    // winners (teamspel): Juul + Sam
    const f1 = await page.evaluate(() => finishDuel([2, 3], [1, 1, 5, 5]));
    check('finishPvp({winners}): winnerIds/winnerId/winner/winners/place/teams/scoreById', JSON.stringify(f1.res.winnerIds) === '[2,3]' && f1.res.winnerId === 2 && f1.res.winner === 2 && JSON.stringify(f1.res.winners) === '[2,3]' && JSON.stringify(f1.res.place) === '[2,3,0,1]' && JSON.stringify(f1.res.teams) === '[[0,1],[2,3]]' && JSON.stringify(f1.res.scoreById) === '{"0":1,"1":1,"2":5,"3":5}', JSON.stringify(f1.res));
    check('resultaatkaart(4): "Team Juul & Sam wint!", kronen bij beide winnaars, plaatsen 1e-4e', f1.card.includes('Team Juul & Sam wint!') && f1.card.includes('👑 Juul 5') && f1.card.includes('👑 Sam 5') && !f1.card.includes('👑 Wes') && f1.card.includes('🥇 Juul') && f1.card.includes('🥈 Sam') && f1.card.includes('🥉 Wes') && f1.card.includes('4️⃣ Jor'), f1.card);
    await shot('result_four_teams');
    const base1 = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return S.arcade.wins.slice(); });
    const c1 = await page.evaluate(() => closeDuel(false));
    const g1 = JSON.parse(c1.g);
    check('statistieken(4): wins +1 voor Juul EN Sam (niet voor Wes/Jor), geen paar-record, streaks', c1.wins === [base1[0], base1[1], base1[2] + 1, base1[3] + 1].join() && g1.wins.join() === '0,0,1,1' && g1.streaks.join() === '0,0,1,1' && g1.streak === 1 && c1.restored && c1.hudAfter === 0 && c1.pairs === '{}', JSON.stringify([c1, base1]));
    // enkelvoudig `winner` bij een teamspel = hele team
    await page.evaluate(() => runDuel('_quad_test', null, { twist: 'none' }));
    const f2 = await page.evaluate(() => finishDuel(1, [3, 4, 0, 0]));
    check('finishPvp({winner}) bij teams: teamgenoten winnen mee', JSON.stringify(f2.res.winnerIds) === '[0,1]' && f2.res.winnerId === 0 && f2.card.includes('Team Wes & Jor wint!'), JSON.stringify(f2.res));
    const c2 = await page.evaluate(() => closeDuel(false)); const g2 = JSON.parse(c2.g);
    check('statistieken(4): streak telt per winnaar (Juul/Sam resetten, Wes/Jor 1)', g2.wins.join() === '1,1,1,1' && g2.streaks.join() === '1,1,0,0' && g2.plays === 2, c2.g);
    // eigen teams + andere volgorde van ids; automatische winst via het spel zelf (4 punten voor team 0)
    const o5 = await page.evaluate(() => runDuel('_quad_test', [3, 2, 1, 0], { twist: 'none', teams: [[0, 2], [1, 3]] }));
    check('harness(4): ids [3,2,1,0] met extra.teams [[0,2],[1,3]]', o5.ids.join() === '3,2,1,0' && o5.hud === 'Sam,Juul,Jor,Wes' && o5.labels === 'Numpad 8456,IJKL,Pijltjes,WASD' && JSON.stringify(o5.teams) === '[[0,2],[1,3]]' && o5.teamOf.join() === '0,1,0,1' && o5.teamInfo.join() === 'Sam & Jor:c844e8,Juul & Wes:f08a2a' && o5.pcol === 'c844e8,f08a2a,3a78e0,2f9e5b', JSON.stringify(o5));
    const a5 = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); const m = window.__m;
      for (const k of [3, 1, 3, 1]) { input.virtual[k].a = true; input.update(); m.update(0.016); input.virtual[k].a = false; input.update(); m.update(0.016); }   // Sam en Jor = slot 0 en 2 = team 0
      await new Promise((r) => setTimeout(r, 700)); for (let i = 0; i < 5; i++) { input.update(); m.update(0.016); }
      const r = m.result; return { res: r && { winnerIds: r.winnerIds, winnerId: r.winnerId, winners: r.winners, place: r.place, scoreArr: r.scoreArr }, card: document.querySelector('.card.pvp') && document.querySelector('.card.pvp').innerText.replace(/\n+/g, ' / ') }; });
    check('spel meldt winners zelf (team 0 = slots 0+2 = Sam + Jor)', a5.res && JSON.stringify(a5.res.winnerIds) === '[3,1]' && a5.res.winnerId === 3 && JSON.stringify(a5.res.winners) === '[0,2]' && a5.res.place.slice(0, 2).join() === '3,1' && a5.card.includes('Team Sam & Jor wint!'), JSON.stringify(a5));
    const bw = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return S.arcade.wins.slice(); });
    const c5 = await page.evaluate(() => closeDuel(true));   // revanche: zelfde deelnemers en teams
    const rv = await page.evaluate(async () => { const nm = window.__app.mode; const { input } = await import('/src/engine/input.js'); const o = { ids: nm.ids.join(), teams: JSON.stringify(nm.ctx.teams), p0: input.p[0] === input.all[3], n: input.p.length }; nm.dispose(); window.__app.setMode(null); return o; });
    check('statistieken + revanche (4): Sam en Jor +1; zelfde ids, teams en mapping bij revanche', c5.wins === [bw[0], bw[1] + 1, bw[2], bw[3] + 1].join() && rv.ids === '3,2,1,0' && rv.teams === '[[0,2],[1,3]]' && rv.p0 && rv.n === 4, JSON.stringify([c5.wins, bw, rv]));
    // ongeldige / ongelijke teams
    const o6 = await page.evaluate(() => runDuel('_quad_test', [0, 1, 2, 3], { twist: 'none', teams: [[0, 1], [1, 2]] })); await dispose();
    const o7 = await page.evaluate(() => runDuel('_quad_test', [0, 1, 2, 3], { twist: 'none', teams: [[0], [1, 2, 3]] })); await dispose();
    check('harness(4): ongeldige teams -> standaard; 1-tegen-3 mag', JSON.stringify(o6.teams) === '[[0,1],[2,3]]' && JSON.stringify(o7.teams) === '[[0],[1,2,3]]' && o7.teamOf.join() === '0,1,1,1', JSON.stringify([o6.teams, o7.teams]));
    // FFA met 4 (spel zonder teams), plaatsen op score, gelijkspel, expliciete place
    const o8 = await page.evaluate(() => runDuel('_quad_ffa', null, { twist: 'none' }));
    check('harness(4) FFA: def.teams niet gezet -> ctx.teams null', o8.n === 4 && o8.teams === null && o8.teamOf === null && o8.teamInfo === null, JSON.stringify(o8.teams));
    const lay8 = await page.evaluate(layJs);
    check('harness(4) FFA: HUD 4 vakken (2 hoeken + 2 eronder: 0,2 links | 1,3 rechts), geen teamlabels, timer in het midden', lay8.top && !lay8.teams && lay8.labels === '' && lay8.n === 4 && lay8.below && lay8.corners && lay8.mid && lay8.vis, JSON.stringify(lay8));
    const f8 = await page.evaluate(() => finishDuel(3, [1, 0, 2, 4]));
    check('finishPvp({winner:3}) FFA: winnerId 3, place op score [3,2,0,1], kaart "Sam wint!"', f8.res.winnerId === 3 && JSON.stringify(f8.res.winnerIds) === '[3]' && JSON.stringify(f8.res.place) === '[3,2,0,1]' && f8.res.teams === null && f8.card.includes('Sam wint!') && f8.card.includes('👑 Sam 4') && !f8.card.includes('👑 Juul') && f8.card.includes('🥇 Sam') && f8.card.includes('4️⃣ Jor'), f8.card + JSON.stringify(f8.res));
    await shot('result_four_ffa');
    const c8 = await page.evaluate(() => closeDuel(false)); check('statistieken(4) FFA: wins[3] +1, geen paar-record', JSON.parse(c8.g).wins.join() === '0,0,0,1' && c8.pairs === '{}', c8.g);
    await page.evaluate(() => runDuel('_quad_ffa', [2, 0, 3, 1], { twist: 'none' }));
    const f9 = await page.evaluate(() => finishDuel(null, [2, 2, 2, 2]));
    check('finishPvp gelijkspel (4): winnerIds [], winnerId null, kaart "Gelijkspel!"', JSON.stringify(f9.res.winnerIds) === '[]' && f9.res.winnerId === null && f9.res.winner === null && f9.card.includes('Gelijkspel!') && f9.res.place.join() === '2,0,3,1', JSON.stringify(f9.res) + f9.card);
    const w9 = await page.evaluate(async () => { const { S } = await import('/src/save.js'); return S.arcade.draws; });
    const c9 = await page.evaluate(() => closeDuel(false)); check('statistieken(4): gelijkspel telt als draw', c9.draws === w9 + 1);
    await page.evaluate(() => runDuel('_quad_ffa', [0, 1, 2, 3], { twist: 'none' }));
    const f10 = await page.evaluate(async () => { const m = window.__m; m.ctx.finishPvp({ winner: 0, score: [9, 1, 1, 1], place: [2, 0, 3, 1], delay: 50 }); await new Promise((r) => setTimeout(r, 120)); return m.result.place.join() + '/' + m.result.winnerId; });
    check('finishPvp({place}) overschrijft de volgorde', f10 === '2,0,3,1/0', f10); await dispose();
    // 2 en 3 deelnemers uit een 4-spelers-opstelling
    const o11 = await page.evaluate(() => runDuel('_quad_test', [3, 0], { twist: 'none' }));
    check('harness(4): quad_test met 2 deelnemers [3,0]: Sam in slot 0, geen teams', o11.n === 2 && o11.hud === 'Sam,Wes' && o11.labels === 'Numpad 8456,WASD' && o11.pcol === 'c844e8,2f9e5b' && o11.teams === null && o11.intro.split('|').length === 2, JSON.stringify(o11));
    const f11 = await page.evaluate(() => finishDuel(0, [3, 1]));
    check('resultaat 2 deelnemers met Sam: "Sam wint!", winnerId 3', f11.res.winnerId === 3 && JSON.stringify(f11.res.place) === '[3,0]' && f11.card.includes('Sam wint!'), f11.card);
    const c11 = await page.evaluate(() => closeDuel(false)); check('statistieken: paar-record 0-3 bij 2 deelnemers', !!JSON.parse(c11.pairs)['0-3'] && JSON.parse(c11.pairs)['0-3'].wins.join() === '0,1', c11.pairs);
    const o12 = await page.evaluate(() => runDuel('_quad_test', [1, 3, 2], { twist: 'none' }));
    check('harness(4): quad_test met 3 deelnemers [1,3,2], geen teams', o12.n === 3 && o12.hud === 'Jor,Sam,Juul' && o12.pcol === '3a78e0,c844e8,f08a2a' && o12.teams === null && o12.intro.split('|').length === 3, JSON.stringify(o12));
    await page.evaluate(() => finishDuel(1, [0, 3, 1])); await page.evaluate(() => closeDuel(false));
    // 1-tegen-1-spel met Sam (airhockey) en 4 ids -> eerste twee
    const o13 = await page.evaluate(() => runDuel('airhockey', [3, 2]));
    check('harness(4): bestaand 1-tegen-1-duel met Sam (airhockey [3,2])', o13.n === 2 && o13.hud === 'Sam,Juul' && o13.labels === 'Numpad 8456,IJKL' && o13.pcol === 'c844e8,f08a2a' && o13.brother === 3, JSON.stringify(o13));
    await dispose();
    const o14 = await page.evaluate(() => runDuel('_quad_duo', [0, 1, 2, 3]));
    check('1-tegen-1-duel met 4 ids: alleen eerste twee spelen', o14.n === 2 && o14.ids.join() === '0,1', JSON.stringify(o14)); await dispose();
    // twists met 4 deelnemers
    await page.evaluate(() => runDuel('_quad_ffa', [0, 1, 2, 3], { twist: 'bodyswap' }));
    const sw = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); const m = window.__m; const o = {};
      const raw = [1, -1, 0.5, -0.5]; const feed = () => { raw.forEach((x, k) => { input.virtual[k].x = x; }); input.update(); m.update(0.016); input.update(); m.update(0.016); };
      m.rng = () => 0.1; m.nextSwap = 0; feed(); o.a = [JSON.stringify(m.swapPairs), JSON.stringify(m.ctx.pvp.swapPairs), m.swapped, m.pvpIn.map((p) => p.x).join()];
      m.nextSwap = 0; feed(); o.back = [m.swapped, m.pvpIn.map((p) => p.x).join()];   // terug
      m.rng = () => 0.9; m.nextSwap = 0; feed(); o.b = [JSON.stringify(m.swapPairs), JSON.stringify(m.swapPair), m.pvpIn.map((p) => p.x).join()];
      for (let k = 0; k < 4; k++) input.virtual[k].x = 0; window.__app.mode.dispose(); window.__app.setMode(null); return o; });
    check('bodyswap met 4 deelnemers: twee paren of een paar', sw.a[0] === '[[0,1],[2,3]]' && sw.a[1] === '[[0,1],[2,3]]' && sw.a[2] === true && sw.a[3] === '-1,1,-0.5,0.5' && sw.back[0] === false && sw.back[1] === '1,-1,0.5,-0.5' && sw.b[0] === '[[3,2]]' && sw.b[1] === '[3,2]' && sw.b[2] === '1,-1,-0.5,0.5', JSON.stringify(sw));
    const o15 = await page.evaluate(() => runDuel('_quad_ffa', [2, 0, 1, 3], { twist: 'giant' }));
    check('giant met 4 deelnemers: 1 reus, 3 dwergen', o15.sizes.filter((x) => x > 1).length === 1 && o15.sizes.filter((x) => x < 1).length === 3, o15.sizes.join()); await dispose();
    const o16 = await page.evaluate(async () => { await runDuel('_quad_ffa', [0, 1, 2, 3], { twist: 'turbo' }); const m = window.__m; const v = [0, 1, 2, 3].map((s) => m.ctx.pvp.speed(s)); m.dispose(); window.__app.setMode(null); return v; });
    check('turbo met 4 deelnemers: pvp.speed(slot) voor 0..3', o16.every((x) => x === 1.6), o16.join());
    // deurman-twist: scare.stare telt alle 4 slots (input.p)
    await page.evaluate(() => runDuel('_quad_ffa', [0, 1, 2, 3], { twist: 'deurman' }));
    const dm = await page.evaluate(async () => { const { input } = await import('/src/engine/input.js'); const m = window.__m;
      input.virtual[3].x = 1; const sc = (await import('/src/engine/scare.js')).scare; const res = await sc.stare({ hold: 0.9 }); input.virtual[3].x = 0; m.dispose(); window.__app.setMode(null); return { caught: res.caught, movers: res.movers }; });
    check('deurman (scare.stare) loopt over alle 4 slots: Sam beweegt -> movers[3]', dm.caught === true && Array.isArray(dm.movers) && dm.movers.length === 4 && dm.movers[3] === true && !dm.movers[0], JSON.stringify(dm));
    await page.close();
  }
  {
    // intro-kaart met 4 spelers (controls-grid, ready-pillen, modeTxt)
    const page = await open(4);
    const intro = async (def) => page.evaluate(async (def) => { const { MinigameMode } = await import('/src/engine/harness.js'); const app = window.__app; app.setMode(null);
      const base = (await import('/src/games/_quad_test.js')).default;
      const d = def === 'quad' ? base : { ...base, players: def, teams: false, id: 'quad_x' };
      const m = new MinigameMode(app, d, {}); app.setMode(m);
      const tag = document.querySelector('.card .tags .tag').textContent, ctrl = document.querySelector('.card .ctrl'), ready = document.querySelector('.card .ready');
      const o = { tag, cls: ctrl.className, nctrl: ctrl.children.length, ready: ready.className, nready: ready.children.length, teams: [...document.querySelectorAll('.card .twist b')].some((b) => b.textContent.includes('TEAMS')), names: [...ctrl.querySelectorAll('h4')].map((e) => e.textContent).join(), small: [...document.querySelectorAll('.card .small-note')].pop().textContent };
      m.dispose(); app.setMode(null); return o; }, def);
    const i1 = await intro('quad'), i2 = await intro([4]), i3 = await intro([2, 3]), i4 = await intro([3, 4]);
    check('intro(4): "2 tot 4 spelers", ctrl.four met 4 blokken, ready.four, TEAMS-regel, "Iedereen klaar?"', i1.tag === '2 tot 4 spelers' && i1.cls === 'ctrl four' && i1.nctrl === 4 && i1.ready === 'ready four' && i1.nready === 4 && i1.teams && i1.names === 'Wes,Jor,Juul,Sam' && i1.small.startsWith('Iedereen klaar?'), JSON.stringify(i1));
    check('modeTxt: "Voor 4 spelers" (alleen 4), "3 tot 4 spelers", [2,3] blijft "Duel: 1 tegen 1"', i2.tag === 'Voor 4 spelers' && i2.nctrl === 4 && !i2.teams && i4.tag === '3 tot 4 spelers' && i3.tag === 'Duel: 1 tegen 1' && i3.nctrl === 3 && i3.cls === 'ctrl three', JSON.stringify([i2.tag, i4.tag, i3.tag, i3.cls]));
    if (SHOTS) { await page.evaluate(async () => { const { MinigameMode } = await import('/src/engine/harness.js'); const app = window.__app; app.setMode(null); app.setMode(new MinigameMode(app, (await import('/src/games/_quad_test.js')).default, {})); }); await page.waitForTimeout(900); await page.screenshot({ path: `${OUT}/intro_four.png` }); }
    await page.close();
  }
}

// ---------------------------------------------------------------- 6. 2 spelers: gedrag ongewijzigd
{
  const page = await open(2);
  await page.addScriptTag({ type: 'module', content: `${RUN}\nwindow.runDuel = runDuel; window.finishDuel = finishDuel; window.closeDuel = closeDuel;` });
  await page.waitForFunction(() => window.runDuel, null, { timeout: 20000 });
  const o = await page.evaluate(() => runDuel('airhockey', null));
  check('2 spelers: standaard [0,1], HUD 2 vakken, kleuren groen/blauw', o.ids.join() === '0,1' && o.hud === 'Wes,Jor' && o.labels === 'WASD,Pijltjes' && o.pcol === '2f9e5b,3a78e0' && o.intro.split('|').length === 2, JSON.stringify(o));
  const f = await page.evaluate(() => finishDuel(1, [1, 2]));
  check('2 spelers: kaart "Jor wint!" en reeks', f.card.includes('Jor wint!') && f.card.includes('Wes 1') && f.card.includes('2 Jor'), f.card);
  const c = await page.evaluate(() => closeDuel(false));
  check('2 spelers: wins [0,1,0,0]', c.wins === '0,1,0,0' && c.restored, c.wins);
  await page.close();
}

console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS', '| fouten:', fails);
await browser.close(); server.close(); process.exit(fails || errors.length ? 1 : 0);
