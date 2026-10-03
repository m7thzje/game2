// Test van de 3-spelers-kern (docs/PLAYERS3.md): input.all/mapSlots, makeBrother-slotmapping, DuelQueue, migratie van oude opslag,
// harness met extra.players ([2,0], [1,2], 3 deelnemers), statistieken per spelers-id, HUD/resultaatkaart met 3 spelers.
// Gebruik: node tools/playerstest.mjs [--shots]   (screenshots naar $OUT of /tmp/p3, alleen met --shots)
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.OUT || '/tmp/p3'; const SHOTS = process.argv.includes('--shots'); if (SHOTS) fs.mkdirSync(OUT, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
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
  check('input: all/p/virtual lengtes', r.len.join() === '3,2,3', r.len.join());
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
  check('chars: PLAYER_COLORS/CSS hebben 3 items, Juul oranje', r.colors[0] === 3 && r.colors[1] === 3 && r.colors[2] === 'f08a2a', r.colors.join());
  check('chars: Wes/Jor/Juul verschillen (shirt, haar, haarstijl, lengte)', r.distinct);
  check('chars: makeBrother(0) bij slots [2,0] = Juul met haar eigen hoed/shirt', r.slot0.join() === '2,2,Juul,party,8a3fd8', r.slot0.join());
  check('chars: makeBrother(1) bij slots [2,0] = Wes zonder hoed', r.slot1.join() === '0,Wes,,2f9e5b', r.slot1.join());
  check('chars: PLAYER_COLORS volgt slots ([2,0] -> oranje, groen)', r.slotColors.join() === 'f08a2a,2f9e5b', r.slotColors.join());
  check('chars: refreshBrother pikt winkelwijziging op', r.refresh && r.refresh2);
  check('chars: setSlotPlayers([0,1,2]) herstelt identiteit; makeBrother met eq negeert slots', r.ident.join() === '2,Juul,2f9e5b' && r.shop, r.ident.join());
  check('cosmetica: Juul eigen startuitrusting + labels', r.items[0] === 'Blote kop (standaard)' && r.items[1] === 'Standaard sjaal' && r.items[2] === 'f0862a' && r.items[3] === 'Sjaal', r.items.join());
  check('party: activeIds/pairsOf/chooseNames', r.act.join('|') === '0,1,2|3|01|02|12|Juul,Wes' && r.names === 'Wes,Jor,Juul', r.act.join('|'));
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
  check('migratie: namen 3, players=2, coins behouden', r.names === 'Wes,Jor,Juul' && r.players === 2 && r.coins === 77, JSON.stringify(r));
  check('migratie: wins/tourneys/byGame aangevuld tot 3', r.wins === '3,4,0' && r.tour === '1,0,0' && r.gw === '1,3,0' && r.pairs === '{}', JSON.stringify(r));
  check('migratie: cosmetica 3 spelers, Wes houdt zijn pet', r.cos.join() === '3,3,cap,std,std' && r.look === 'cap', r.cos.join());
  check('progress.points() somt over spelers-id', r.pts === 25 && r.pts2 === 30, `${r.pts} ${r.pts2}`);
  await page.close();
}

// ---------------------------------------------------------------- 5. harness met deelnemers
const RUN = `
async function runDuel(id, ids, { winnerSlot = 0, score = null, twist = null, shot = null } = {}) {
  const app = window.__app, { S } = await import('/src/save.js'), { MinigameMode, SERIES } = await import('/src/engine/harness.js');
  const { input, KEY_LABELS } = await import('/src/engine/input.js'); const chars = await import('/src/engine/chars.js');
  const def = id === '_tri_test' ? (await import('/src/games/_tri_test.js')).default : app.games[id];
  const before = { plays: S.arcade.plays, wins: S.arcade.wins.slice(), draws: S.arcade.draws, g: JSON.parse(JSON.stringify(S.arcade.byGame[def.id] || { plays: 0, wins: [0, 0, 0] })), pairs: JSON.stringify(S.arcade.pairs) };
  app.setMode(null);   // zoals app.playGame: eerst het vorige mode weg
  let done = null; const m = new MinigameMode(app, def, { extra: ids ? { players: ids } : null, twist, onDone: (r) => { done = r; app.setMode(null); } });
  app.setMode(m);
  const o = { ids: m.ids.slice(), n: m.n };
  o.ctxPlayers = m.ctx.players.map((p) => [p.id, p.index, p.name, p.color.toString(16), p.css].join(':'));
  o.pMap = input.p.length === m.n && m.ids.every((k, s) => input.p[s] === input.all[k]);
  o.labels = KEY_LABELS.slice(0, m.n).map((k) => k.move).join();
  o.pcol = chars.PLAYER_COLORS.slice(0, m.n).map((c) => c.toString(16)).join();
  o.hud = [...document.querySelectorAll('#hud .pbox .n')].map((e) => e.textContent).join();
  o.hudKeys = [...document.querySelectorAll('#hud .pbox .k')].map((e) => e.textContent).join('|');
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
  m.ctx.finishPvp({ winner: winnerSlot, score, summary: 'testduel', delay: 50 });
  await new Promise((r) => setTimeout(r, 200));
  for (let i = 0; i < 5; i++) { input.update(); m.update(0.016); }
  const r = m.result; const o = { res: { ids: r.ids, winner: r.winner, winnerId: r.winnerId, scoreById: r.scoreById, scoreArr: r.scoreArr } };
  o.card = document.querySelector('.card.pvp') ? document.querySelector('.card.pvp').innerText.replace(/\\n+/g, ' / ') : null;
  o.series = JSON.stringify({ key: SERIES.key, wins: SERIES.wins, byId: SERIES.winsById, n: SERIES.n });
  return o;
}
async function closeDuel(rematch = false) {
  const m = window.__m; const { S } = await import('/src/save.js'); const { input, KEY_LABELS } = await import('/src/engine/input.js'); const chars = await import('/src/engine/chars.js');
  await new Promise((r) => { const t = setInterval(() => { if (m.resultReady) { clearInterval(t); r(); } }, 50); });
  m.close(rematch);
  const o = { wins: S.arcade.wins.join(), draws: S.arcade.draws, plays: S.arcade.plays, g: JSON.stringify(S.arcade.byGame[m.def.id]), pairs: JSON.stringify(S.arcade.pairs) };
  o.restored = input.p.length === 2 && input.p[0] === input.all[0] && input.p[1] === input.all[1] && KEY_LABELS[0].move === 'WASD' && KEY_LABELS[1].move === 'Pijltjes' && chars.PLAYER_COLORS[0] === 0x2f9e5b && chars.PLAYER_COLORS[1] === 0x3a78e0 && chars.makeBrother(0).playerId === 0 && !rematch;
  o.hudAfter = document.querySelectorAll('#hud .pbox').length;
  return o;
}`;
{
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
    const gw = JSON.parse(c.g).wins; check(`harness ${id}: byGame wins per id`, gw[wid] >= 1 && gw.length === 3, c.g);
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
  check('2 spelers: wins [0,1,0]', c.wins === '0,1,0' && c.restored, c.wins);
  await page.close();
}

console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS', '| fouten:', fails);
await browser.close(); server.close(); process.exit(fails || errors.length ? 1 : 0);
