// Bot-test voor het FEESTBORD (src/world/board.js): speelt een volledig potje van 5 rondes via de echte route
// goBoard -> dobbelen/lopen/vakjes -> duel (playGame + finishPvp) -> terug op het bord -> ceremonie -> terug naar de Speelhal.
// Gebruik: node tools/test_board.mjs [rondes=5]      Env: SHOTS=map  (screenshots opslaan), VIEW=WxH
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nope'); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const ROUNDS = +(process.argv[2] || 5);
const SHOTS = process.env.SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const [VW, VH] = (process.env.VIEW || '1100x650').split('x').map(Number);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|ERR_/.test(m.text())) errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')));
const fail = (msg) => { console.log('FOUT:', msg); errors.push(msg); };

await page.goto(`http://localhost:${port}/?quality=low`);
await page.waitForFunction(() => window.__app && window.__app.games && Object.keys(window.__app.games).length > 10, null, { timeout: 90000 }).catch(() => {});
await page.waitForTimeout(1200);
// start: rondes instellen en het bord openen (zoals de Speelhal-tafel: app.goBoard({}))
const before = await page.evaluate(async ([R]) => {
  const { S } = await import('/src/save.js'); S.arcade.board = { plays: 0, wins: [0, 0], rounds: R }; S.settings.scare = 0; S.arcade.offTwists = []; S.arcade.excluded = [];
  window.__coins0 = S.coins; await window.__app.goBoard({}); return { coins: S.coins };
}, [ROUNDS]);
await page.waitForFunction(() => window.__app.mode && window.__app.mode.world && window.__app.mode.wait, null, { timeout: 60000 });
await page.waitForTimeout(3500);
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `board_${name}.png`) }); };
await shot('01_intro');

// bot: één stap per aanroep. Geeft een korte status terug.
const BOT = async () => {
  const st = (window.__st ||= {});
  const app = window.__app, m = app.mode, inp = app.input; const { S } = await import('/src/save.js');
  if (!m) return 'wacht';
  const press = (who, k = 'a') => { inp.virtual[who][k] = true; inp.update(); m.update(0.016); inp.virtual[who][k] = false; inp.update(); };
  const adv = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { inp.update(); m.update(dt); } };
  if (m.ctx) {   // een duel (MinigameMode): klaarmaken, even spelen en een uitslag forceren
    if (m.finished) { if (m.resultReady) { inp.virtual[0].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.update(); m.update(0.016); return 'duel-sluit'; } return 'duel-wacht'; }
    if (!m.__go) {
      m.__go = true; inp.virtual[0].a = true; inp.virtual[1].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.virtual[1].a = false; inp.update(); m.update(0.016);
      await new Promise((r) => setTimeout(r, 450)); let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); }
      for (let k = 0; k < 40; k++) { inp.update(); m.update(0.016); }
      st.duels = (st.duels || 0) + 1; const w = st.duels % 4 === 0 ? null : st.duels % 2;
      st.duelIds = [...(st.duelIds || []), m.def.id + '/' + (m.extra && m.extra.kind) + '/' + (m.extra && m.extra.board)];
      m.ctx.finishPvp({ winner: w, score: [1, 0], summary: 'bordtest' }); return 'duel-start ' + m.def.id;
    }
    return 'duel-bezig';
  }
  if (!m.world || !m.B && !m.wait) return 'laden';
  const w = m.wait; const kinds = (st.kinds ||= {}); if (w) kinds[w.kind] = (kinds[w.kind] || 0) + 1;
  if (!w) { adv(6); return 'anim'; }
  if (w.kind === 'intro') { const k = m.chooser.options.findIndex((o) => /Start|Nieuw/.test(typeof o.label === 'function' ? o.label() : o.label)); m.chooser.sel = Math.max(0, k); m.chooser.t = 0; press(0); await new Promise((r) => setTimeout(r, 200)); return 'intro-start'; }
  if (w.kind === 'dice') {
    const who = w.who, p = m.B.players[who]; st.diceWho = who;
    if (window.__gift && !st.gifted) { st.gifted = true; m.B.players[0].items = ['teleport', 'banana', 'shield']; m.B.players[1].items = ['double', 'speed', 'banana']; m.B.players[0].coins = 45; m.B.players[1].coins = 12; m.hud.update(m.B, who); }
    if (m.dice && !m.dice.frozen && p.items.length && !st.itemTried?.[m.B.round + '_' + who] && Math.random() < 0.7) { (st.itemTried ||= {})[m.B.round + '_' + who] = 1; press(who, 'b'); adv(4); return 'item-menu'; }
    adv(Math.floor(Math.random() * 5) + 1, 0.04); press(who, 'a'); adv(2); return 'dobbel';
  }
  if (w.kind === 'menu') {
    const c = m.chooser, n = c.options.length; let idx = n - 1; const title = c.el.querySelector('h3')?.textContent || '';
    const ok = c.options.map((o, i) => (!o.disabled ? i : -1)).filter((i) => i >= 0);
    if (/Trofee/.test(title)) idx = 0;
    else if (/Winkel/.test(title)) { const buy = ok.filter((i) => i < n - 1); idx = buy.length && Math.random() < 0.8 ? buy[Math.floor(Math.random() * buy.length)] : n - 1; }
    else if (/item gebruik/.test(title)) idx = Math.random() < 0.7 ? 0 : n - 1;
    st.menus = [...(st.menus || []), title.slice(0, 20)];
    if (window.__menuPick !== undefined) idx = Math.min(window.__menuPick, n - 1);
    c.sel = idx; c.t = 0; press(w.who >= 0 ? w.who : 0); adv(2); return 'menu ' + title.slice(0, 25);
  }
  if (w.kind === 'branch') { m.branch.sel = Math.floor(Math.random() * m.branch.n); adv(8); press(w.who, 'a'); adv(2); return 'splitsing'; }
  if (w.kind === 'say') { adv(14, 0.1); press(0); adv(2); return 'tekst'; }
  if (w.kind === 'modal') { adv(8); press(0); return 'modal'; }
  if (w.kind === 'end') return 'EINDE';
  return 'onbekend ' + w.kind;
};


// ---------------------------------------------------------------- deel A: losse onderdelen (opts.manual: geen speellus, de test roept ze aan)
const pump = async (label, code, check, tmo = 90000) => {
  await page.evaluate(async (src) => {
    const m = window.__app.mode, { S } = await import('/src/save.js'); const D = await import('/src/world/board_data.js');
    const B = m.B; B.players.forEach((p, i) => { p.coins = 10; p.trophies = 0; p.items = []; p.shield = false; p.mods = {}; p.hat = 0; p.node = D.GRAPH.start; m.world.tokens[i].pos.copy(m.world.slot(p.node, i, true)); m.world.setHat(i, null); });
    B.traps.forEach((t) => m.world.removeTrap(t.node)); B.traps = []; B.trophyNode = 19; m.world.setTrophyNode(19); m.force = null; window.__menuPick = undefined; m.setActive(0);
    window.__done = false; window.__res = undefined;
    const f = new Function('m', 'S', 'D', 'B', 'return (async()=>{' + src + '})()');
    Promise.resolve(f(m, S, D, B)).then((r) => { window.__res = r; window.__done = true; }).catch((e) => { window.__res = { err: e.message + ' ' + (e.stack || '').split('\n')[1] }; window.__done = true; });
  }, code);
  const t0 = Date.now(); while (!(await page.evaluate(() => window.__done)) && Date.now() - t0 < tmo) { await page.evaluate(BOT).catch(() => {}); await page.waitForTimeout(15); }
  const res = await page.evaluate(() => window.__res);
  let ok = true, why = '';
  if (res === undefined) { ok = false; why = 'timeout'; } else if (res && res.err) { ok = false; why = res.err; } else { try { const r = check(res); if (r !== true) { ok = false; why = r || JSON.stringify(res); } } catch (e) { ok = false; why = e.message; } }
  console.log(`${ok ? 'OK  ' : 'FOUT'} ${label}${ok ? '' : ' -> ' + why}`); if (!ok) errors.push(`onderdeel ${label}: ${why}`);
};
const pageBot = BOT;
await page.evaluate(async () => { await window.__app.goBoard({ manual: true }); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.B && window.__app.mode.world, null, { timeout: 60000 });
await page.waitForTimeout(800);
await pump('data: prijs/achterstaander/graaf', `const B2 = D.newState(5); B2.players[1].trophies = 2; return { p0: D.trophyPrice(B2, 0), p1: D.trophyPrice(B2, 1), b0: D.isBehind(B2, 0), b1: D.isBehind(B2, 1), n: D.GRAPH.nodes.length, j: D.GRAPH.nodes.filter((n) => n.next.length > 1).length, ok: D.GRAPH.nodes.every((n) => n.next.every((k) => D.GRAPH.nodes[k])), sp: D.GRAPH.spots.length }`, (r) => (r.p0 === 10 && r.p1 === 20 && r.b0 && !r.b1 && r.n === 40 && r.j === 2 && r.ok && r.sp === 5) || JSON.stringify(r));
await pump('duel kiezen: pvp, excluded, ontgrendeld', `const prog = await import('/src/engine/progress.js'); const G = await import('/src/games/index.js'); const ctx = { isUnlocked: prog.isUnlocked, ARCADE_HALLS: G.ARCADE_HALLS };
  const ids = new Set(); for (let i = 0; i < 60; i++) ids.add(D.pickDuelId(m.app, ctx, []));
  const allPvp = [...ids].every((id) => m.app.games[id].mode === 'pvp');
  const keep = G.ARCADE_IDS.filter((x) => m.app.games[x]).slice(0, 2); S.arcade.excluded = G.ARCADE_IDS.filter((x) => !keep.includes(x)); const ex = new Set(); for (let i = 0; i < 40; i++) ex.add(D.pickDuelId(m.app, ctx, [])); const exOk = [...ex].every((x) => keep.includes(x));
  S.arcade.excluded = []; S.settings.unlockAll = false; S.arcade.unlocked = [0]; const h0 = new Set(G.ARCADE_HALLS[0].ids); const lk = new Set(); for (let i = 0; i < 80; i++) lk.add(D.pickDuelId(m.app, ctx, [])); const lkOk = [...lk].every((x) => h0.has(x));
  S.arcade.unlocked = [0, 1, 2]; S.arcade.excluded = G.ARCADE_IDS.slice(); const none = D.pickDuelId(m.app, ctx, []); S.arcade.excluded = []; S.settings.unlockAll = false;
  return { allPvp, exOk, lkOk, none, n: ids.size }`, (r) => (r.allPvp && r.exOk && r.lkOk && r.none === null && r.n > 5) || JSON.stringify(r));
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.arcade.unlocked = [0, 1, 2]; });
for (const id of ['swap', 'sign', 'steal', 'dance', 'hold', 'gift']) {
  await pump(`Deurman: ${id}`, `m.force = { deur: '${id}' }; B.players[1].node = 5; const c0 = [B.players[0].coins, B.players[1].coins]; const r = await m.deurEvent(0); return { r, c: [B.players[0].coins, B.players[1].coins], c0, n: [B.players[0].node, B.players[1].node], it: B.players[0].items.length, hat: B.players[0].hat }`,
    (r) => ({ swap: r.n[0] === 5 && r.n[1] === 30, sign: r.c[0] === 15, steal: r.c[0] === 8 && r.hat === 1, dance: r.c[0] === 11 && r.c[1] === 11, hold: r.r && r.r.again === true, gift: r.it === 1 })[id] || JSON.stringify(r));
}
for (const id of ['egg', 'duck', 'gift', 'swap', 'forward', 'party', 'gamble', 'robber', 'trophy', 'hat', 'shield', 'again', 'give', 'pie']) {
  await pump(`kanskaart: ${id}`, `m.force = { card: '${id}' }; B.players[1].coins = 20; ${id === 'forward' ? 'B.players[0].node = 1; B.players[0].coins = 10;' : ''} const r = await m.chanceCard(0); return { r, c: [B.players[0].coins, B.players[1].coins], it: B.players[0].items.length, sh: B.players[0].shield, tn: B.trophyNode, n: B.players[0].node }`,
    (r) => ({ egg: r.c[0] === 14, duck: r.c[0] === 8, gift: r.it === 1, swap: r.c[0] === 20 && r.c[1] === 10, forward: r.n === 4 && r.c[0] === 7, party: r.c[0] === 13 && r.c[1] === 23, gamble: r.c[0] === 16 || r.c[0] === 7, robber: r.c[0] === 13 && r.c[1] === 17, trophy: r.tn !== 19, hat: r.c[0] === 12, shield: r.sh === true, again: r.r && r.r.again === true, give: r.c[0] === 8 && r.c[1] === 22, pie: r.c[1] === 18 })[id] || JSON.stringify(r));
}
for (const [type, node] of [['blue', 1], ['red', 4], ['dice', 10], ['party', 8], ['chance', 2], ['shop', 7], ['trophy', 19], ['deur', 15]]) {
  await pump(`vakje: ${type}`, `${type === 'chance' ? "m.force = { card: 'egg' };" : ''}${type === 'deur' ? "m.force = { deur: 'sign' };" : ''} B.players[0].node = ${node}; B.players[0].coins = 40; const r = await m.land(0); return { r, c: B.players[0].coins, c1: B.players[1].coins, t: B.players[0].trophies, it: B.players[0].items.length }`,
    (r) => ({ blue: r.c === 43, red: r.c === 37, dice: r.r && r.r.again === true, party: r.c === 44 && r.c1 === 12, chance: r.c === 44, shop: true, trophy: r.t === 1 && r.c === 20, deur: r.c === 45 })[type] || JSON.stringify(r));
}
for (const id of ['double', 'speed', 'shield', 'banana', 'teleport']) {
  await pump(`item: ${id}`, `B.players[0].items = ['${id}']; B.players[0].node = 5; window.__menuPick = 0; const r = await m.itemMenu(0); const p = B.players[0]; return { r, dbl: !!p.mods.double, spd: !!p.mods.speed, sh: p.shield, tr: B.traps.length, wt: m.world.traps.size, node: p.node, tn: B.trophyNode, left: p.items.length }`,
    (r) => (r.left === 0 && ({ double: r.dbl, speed: r.spd, shield: r.sh, banana: r.tr === 1 && r.wt === 1, teleport: r.r === 'teleport' && r.node === r.tn })[id]) || JSON.stringify(r));
}
await pump('banaan-val: uitglijden + schild', `B.traps.push({ node: 22, owner: 1 }); m.world.addTrap(22); B.players[0].node = 20; const r = await m.move(0, 3); const a = { slipped: r.slipped, node: B.players[0].node, c: B.players[0].coins, tr: B.traps.length, wt: m.world.traps.size };
  B.traps.push({ node: 24, owner: 1 }); m.world.addTrap(24); B.players[0].shield = true; B.players[0].coins = 10; B.players[0].node = 22; const r2 = await m.move(0, 3); return { a, b: { slipped: r2.slipped, c: B.players[0].coins, sh: B.players[0].shield } }`,
  (r) => (r.a.slipped && r.a.node === 22 && r.a.c === 7 && r.a.tr === 0 && r.a.wt === 0 && r.b.slipped && r.b.c === 10 && r.b.sh === false) || JSON.stringify(r));
await pump('eigen banaan: geen uitglijden', `B.traps.push({ node: 22, owner: 0 }); m.world.addTrap(22); B.players[0].node = 20; const r = await m.move(0, 3); return { slipped: r.slipped, node: B.players[0].node }`, (r) => (!r.slipped && r.node === 23) || JSON.stringify(r));
await pump('trofee kopen met korting', `B.players[1].trophies = 2; B.players[0].coins = 12; window.__menuPick = 0; await m.trophyOffer(0, false); return { t: B.players[0].trophies, c: B.players[0].coins, tn: B.trophyNode }`, (r) => (r.t === 1 && r.c === 2 && r.tn !== 19) || JSON.stringify(r));
await pump('trofee: te weinig munten', `B.players[0].coins = 5; await m.trophyOffer(0, false); return { t: B.players[0].trophies, c: B.players[0].coins }`, (r) => (r.t === 0 && r.c === 5) || JSON.stringify(r));
await pump('splitsing kiezen (lopen over de brug/ring)', `B.players[0].node = 8; const r = await m.move(0, 2); return { node: B.players[0].node }`, (r) => [10, 33].includes(r.node) || JSON.stringify(r));
await pump('dubbele dobbelsteen + snelschoen', `B.players[0].mods.double = true; const r = await m.rollDice(0); return { sum: r.sum }`, (r) => (r.sum >= 2 && r.sum <= 12) || JSON.stringify(r));
await pump('dobbelsteen 1-10', `const r = await m.rollDice(0); return { sum: r.sum }`, (r) => (r.sum >= 1 && r.sum <= 10) || JSON.stringify(r));
await pump('Feestfee (achterstaander)', `B.players[1].trophies = 1; await m.feestfee(0); return { it: B.players[0].items.length, d: !!B.players[0].mods.double }`, (r) => (r.it === 1 || r.d) || JSON.stringify(r));
await pump('winkel kopen', `B.players[0].coins = 20; B.players[0].node = 7; window.__menuPick = 0; await m.shop(0); return { it: B.players[0].items.length, c: B.players[0].coins }`, (r) => (r.it >= 1 && r.c < 20) || JSON.stringify(r));
await pump('uitslag duel verwerken (ronde)', `B.pendingDuel = { kind: 'round', id: 'x' }; B.round = 1; await m.afterDuel({ pvp: true, winner: 1 }); return { c: [B.players[0].coins, B.players[1].coins], round: B.round, phase: B.phase }`, (r) => (r.c[0] === 13 && r.c[1] === 20 && r.round === 2 && r.phase === 'turn') || JSON.stringify(r));
await pump('uitslag duel verwerken (vakje, quit = gelijk)', `B.pendingDuel = { kind: 'tile', who: 0 }; B.turn = 0; await m.afterDuel(null); return { turn: B.turn, phase: B.phase }`, (r) => (r.turn === 1) || JSON.stringify(r));
await page.screenshot({ path: SHOTS ? path.join(SHOTS, 'board_04_onderdelen.png') : '/dev/null' }).catch(() => {});
console.log('--- deel B: volledig potje ---');
await page.evaluate(async () => { const { S } = await import('/src/save.js'); S.arcade.board.plays = 0; S.arcade.board.wins = [0, 0]; window.__coins0 = S.coins; window.__st = {}; window.__gift = true; await window.__app.goBoard({}); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.world && window.__app.mode.wait && window.__app.mode.wait.kind === 'intro', null, { timeout: 60000 });
let guard = 0, end = false, last = '', shots = {};
const t0 = Date.now(); let maxFrameGap = 0;
while (guard++ < 9000 && !end && Date.now() - t0 < 600000) {
  const r = await page.evaluate(BOT).catch((e) => 'fout ' + e.message.split('\n')[0]);
  if (typeof r === 'string' && r.startsWith('fout')) { if (!/Execution context|Target closed|navigat/.test(r)) console.log(r); await page.waitForTimeout(150); continue; }
  const rr = r && r.length ? r : String(r);
  if (rr === 'EINDE') { end = true; break; }
  // screenshots van verschillende momenten
  const key = rr.split(' ')[0];
  if (SHOTS && ['dobbel', 'splitsing', 'tekst', 'menu', 'duel-start', 'item-menu'].includes(key)) { shots[key] = (shots[key] || 0) + 1; if (shots[key] === 3 || (key === 'splitsing' && shots[key] === 1) || (key === 'menu' && shots[key] === 4)) { await page.waitForTimeout(250); await shot(`02_${key}_${shots[key]}`); } }
  if (rr !== last) { last = rr; }
  await page.waitForTimeout(rr.startsWith('duel') ? 120 : 25);
}
if (!end) fail('potje niet uitgespeeld binnen de limiet (guard ' + guard + ')');
await page.waitForTimeout(1500);
await shot('03_ceremonie');
// einduitslag controleren
const st = await page.evaluate(() => window.__st || {});
const fin = await page.evaluate(async () => {
  const { S } = await import('/src/save.js'); const m = window.__app.mode;
  return { plays: S.arcade.board.plays, wins: S.arcade.board.wins, coins: S.coins, coins0: window.__coins0, round: m.B && m.B.round, rounds: m.B && m.B.rounds, over: m.B && m.B.over, players: m.B && m.B.players.map((p) => ({ coins: p.coins, trophies: p.trophies })), duelsWon: m.B && m.B.duelsWon, wait: m.wait && m.wait.kind };
});
console.log('eindstand:', JSON.stringify(fin));
console.log('duels:', st.duels, (st.duelIds || []).join(', '));
console.log('wacht-soorten:', JSON.stringify(st.kinds));
if (!fin.over) fail('B.over niet gezet');
if (fin.plays !== 1) fail('S.arcade.board.plays moet 1 zijn, is ' + fin.plays);
if (!(fin.coins > fin.coins0)) fail('geen beloning in S.coins');
if (!st.duels || st.duels < ROUNDS) fail(`te weinig duels gespeeld (${st.duels}) voor ${ROUNDS} rondes`);
if ((st.duelIds || []).some((s) => !s.endsWith('/true'))) fail('duel zonder extra.board');

// pauzemenu testen (Esc), dan terug naar de Speelhal via de ceremonie-keuze
await page.keyboard.down('Escape'); await page.waitForTimeout(250); await page.keyboard.up('Escape'); await page.waitForTimeout(300);
const paused = await page.evaluate(() => window.__app.mode.paused);
console.log('pauze na Esc:', paused);
if (!paused) fail('Esc opent geen pauzemenu');
await page.evaluate(() => { const m = window.__app.mode, inp = window.__app.input; m.pauseChooser.t = 0; inp.virtual[0].b = true; inp.update(); m.update(0.016); inp.virtual[0].b = false; inp.update(); m.update(0.016); });
await page.waitForTimeout(200);
if (await page.evaluate(() => window.__app.mode.paused)) fail('Doorgaan sluit de pauze niet');
await page.evaluate(() => { const m = window.__app.mode, inp = window.__app.input; m.chooser.sel = 1; m.chooser.t = 0; inp.virtual[0].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.update(); m.update(0.016); });
await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs, null, { timeout: 30000 }).then(() => console.log('terug in de Speelhal: ok')).catch(() => fail('niet terug in de Speelhal'));
await page.waitForTimeout(800);
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 15).join('\n') : 'NO ERRORS');
await browser.close(); server.close(); process.exit(errors.length ? 1 : 0);
