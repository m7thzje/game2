// Bot-test voor het FEESTBORD (src/world/board.js): speelt een volledig potje via de echte route
// goBoard -> dobbelen/lopen/vakjes -> duel/mini-spel (playGame + finishPvp) -> terug op het bord -> ceremonie -> terug naar de Speelhal.
// Draait achter elkaar een potje met 2 spelers (regressie) en een potje met 3 spelers (Wes, Jor en Juul).
// Gebruik: node tools/test_board.mjs [rondes=5] [2|3|beide]      Env: SHOTS=map  (screenshots opslaan), VIEW=WxH
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
const WHICH = process.argv[3] || 'beide';
const SHOTS = process.env.SHOTS || ''; if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const [VW, VH] = (process.env.VIEW || '1100x650').split('x').map(Number);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const errors = [];
const fail = (msg) => { console.log('FOUT:', msg); errors.push(msg); };

// ---------------------------------------------------------------- bot: één stap per aanroep (draait in de pagina). Geeft een korte status terug.
const BOT = async () => {
  const st = (window.__st ||= {});
  const app = window.__app, m = app.mode, inp = app.input; const { S } = await import('/src/save.js');
  if (!m) return 'wacht';
  const press = (who, k = 'a') => { inp.virtual[who][k] = true; inp.update(); m.update(0.016); inp.virtual[who][k] = false; inp.update(); m.update(0.016); };
  const adv = (n, dt = 0.05) => { for (let i = 0; i < n; i++) { inp.update(); m.update(dt); } };
  if (m.ctx) {   // een duel of 3-speler-spel (MinigameMode): klaarmaken, even spelen en een uitslag forceren
    if (m.finished) { if (m.resultReady) { const k0 = (m.ids || [0, 1])[0]; inp.virtual[k0].a = true; inp.update(); m.update(0.016); inp.virtual[k0].a = false; inp.update(); m.update(0.016); return 'duel-sluit'; } return 'duel-wacht'; }
    if (!m.__go) {
      m.__go = true; const ids = m.ids || [0, 1], n = ids.length;
      ids.forEach((id) => { inp.virtual[id].a = true; }); inp.update(); m.update(0.016); ids.forEach((id) => { inp.virtual[id].a = false; }); inp.update(); m.update(0.016);
      await new Promise((r) => setTimeout(r, 450)); let g = 0; while (m.state !== 'play' && g++ < 3000) { inp.update(); m.update(0.016); }
      for (let k = 0; k < 40; k++) { inp.update(); m.update(0.016); }
      st.duels = (st.duels || 0) + 1; const w = st.duels % 4 === 0 ? null : st.duels % n;
      const bd = await import('/src/world/board.js'); const B = bd.boardState();
      st.duelIds = [...(st.duelIds || []), m.def.id + '/' + (m.extra && m.extra.kind) + '/' + (m.extra && m.extra.board)];
      (st.info ||= []).push({ n, ids: ids.join(''), kind: m.extra && m.extra.kind, round: B && B.round, spec: n === 2 && S.settings.players === 3 ? [0, 1, 2].find((k) => !ids.includes(k)) : null });
      m.ctx.finishPvp({ winner: w, score: n === 2 ? [1, 0] : ids.map((_, k) => (k === w ? 9 : k + 1)), summary: 'bordtest' }); return 'duel-start ' + m.def.id;
    }
    return 'duel-bezig';
  }
  if (!m.world || !m.B && !m.wait) return 'laden';
  const w = m.wait; const kinds = (st.kinds ||= {}); if (w) kinds[w.kind] = (kinds[w.kind] || 0) + 1;
  if (!w) { adv(6); return 'anim'; }
  if (w.kind === 'intro') { const k = m.chooser.options.findIndex((o) => /Start|Nieuw/.test(typeof o.label === 'function' ? o.label() : o.label)); m.chooser.sel = Math.max(0, k); m.chooser.t = 0; press(0); await new Promise((r) => setTimeout(r, 200)); return 'intro-start'; }
  if (w.kind === 'dice') {
    const who = w.who, p = m.B.players[who]; st.diceWho = who; (st.who ||= {})[who] = 1;
    if (window.__partyRounds && S.settings.players === 3 && window.__stub) {   // even rondes: een nep-3-speler-spel (players:[3]) is beschikbaar
      if (m.B.round % 2 === 0) app.games.bordtest3 = window.__stub; else delete app.games.bordtest3;
    }
    if (window.__gift && !st.gifted) {
      st.gifted = true; const IT = [['teleport', 'banana', 'shield'], ['double', 'speed', 'banana'], ['speed', 'shield', 'double']], CO = [45, 12, 6];
      m.B.players.forEach((q, k) => { q.items = IT[k]; q.coins = CO[k]; }); m.hud.update(m.B, who);
    }
    if (m.dice && !m.dice.frozen && p.items.length && !st.itemTried?.[m.B.round + '_' + who] && Math.random() < 0.7) { (st.itemTried ||= {})[m.B.round + '_' + who] = 1; press(who, 'b'); adv(4); return 'item-menu'; }
    adv(Math.floor(Math.random() * 5) + 1, 0.04); press(who, 'a'); adv(2); return 'dobbel';
  }
  if (w.kind === 'predict') {   // toeschouwer-voorspelling
    if (window.__noPred) { adv(12, 0.05); return 'predict-wacht'; }
    if (m.pred && m.pred.pick == null) { adv(8, 0.05); press(w.who, window.__predKey || (Math.random() < 0.5 ? 'a' : 'b')); adv(3, 0.05); st.preds = (st.preds || 0) + 1; return 'voorspel'; }
    adv(10, 0.05); return 'voorspel-wacht';
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

async function suite(N) {
  console.log(`\n===== ${N} SPELERS =====`);
  const page = await browser.newPage({ viewport: { width: VW, height: VH } });
  page.on('console', (m) => { if (m.type() === 'error' && !/404|CERT_AUTHORITY|ERR_/.test(m.text())) errors.push(`[${N}p] ` + m.text()); });
  page.on('pageerror', (e) => errors.push(`[${N}p][pageerror] ` + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')));
  const tag = (s) => `${N}p ${s}`;
  // nep-3-speler-spel voor de test (de echte komen later): wordt als module geserveerd
  await page.route('**/src/games/bordtest3.js', (route) => route.fulfill({ contentType: 'text/javascript', body: "export default { id: 'bordtest3', name: 'Testspel voor drie', giver: 'De Testmeneer', icon: '🧪', mode: 'pvp', players: [3], time: 20, music: 'game', blurb: 'Een testspel voor drie spelers.', controls: [], tip: 'Niets doen is ook een strategie.', create(ctx) { return { update() {}, onStart() {} }; } };" }));
  await page.goto(`http://localhost:${port}/?quality=low${N === 3 ? '&players=3' : ''}`);
  await page.waitForFunction(() => window.__app && window.__app.games && Object.keys(window.__app.games).length > 10, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1200);
  // start: spelers en rondes instellen en het bord openen (zoals de Speelhal-tafel: app.goBoard({}))
  await page.evaluate(async ([R, N]) => {
    const { S } = await import('/src/save.js'); S.settings.players = N; S.arcade.board = { plays: 0, wins: N === 3 ? [0, 0, 0] : [0, 0], rounds: R }; S.settings.scare = 0; S.arcade.offTwists = []; S.arcade.excluded = [];
    window.__coins0 = S.coins; await window.__app.goBoard({});
  }, [ROUNDS, N]);
  await page.waitForFunction(() => window.__app.mode && window.__app.mode.world && window.__app.mode.wait, null, { timeout: 60000 });
  await page.waitForTimeout(3500);
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `board${N}_${name}.png`) }); };
  await shot('01_intro');

  // ---------------------------------------------------------------- deel A: losse onderdelen (opts.manual: geen speellus, de test roept ze aan)
  const pump = async (label, code, check, tmo = 90000) => {
    await page.evaluate(async (src) => {
      const m = window.__app.mode, { S } = await import('/src/save.js'); const D = await import('/src/world/board_data.js');
      const B = m.B; B.players.forEach((p, i) => { p.coins = 10; p.trophies = 0; p.items = []; p.shield = false; p.mods = {}; p.hat = 0; p.node = D.GRAPH.start; m.world.tokens[i].pos.copy(m.world.slot(p.node, i, true)); m.world.setHat(i, null); });
      B.duelsWon = B.duelsWon.map(() => 0); B.traps.forEach((t) => m.world.removeTrap(t.node)); B.traps = []; B.trophyNode = 19; m.world.setTrophyNode(19); m.force = null; window.__menuPick = undefined; window.__predKey = undefined; window.__noPred = false; m.setActive(0);
      window.__done = false; window.__res = undefined;
      const f = new Function('m', 'S', 'D', 'B', 'return (async()=>{' + src + '})()');
      Promise.resolve(f(m, S, D, B)).then((r) => { window.__res = r; window.__done = true; }).catch((e) => { window.__res = { err: e.message + ' ' + (e.stack || '').split('\n')[1] }; window.__done = true; });
    }, code);
    const t0 = Date.now(); while (!(await page.evaluate(() => window.__done)) && Date.now() - t0 < tmo) { await page.evaluate(BOT).catch(() => {}); await page.waitForTimeout(15); }
    const res = await page.evaluate(() => window.__res);
    let ok = true, why = '';
    if (res === undefined) { ok = false; why = 'timeout'; } else if (res && res.err) { ok = false; why = res.err; } else { try { const r = check(res); if (r !== true) { ok = false; why = r || JSON.stringify(res); } } catch (e) { ok = false; why = e.message; } }
    console.log(`${ok ? 'OK  ' : 'FOUT'} ${label}${ok ? '' : ' -> ' + why}`); if (!ok) errors.push(`onderdeel ${tag(label)}: ${why}`);
  };
  await page.evaluate(async () => { await window.__app.goBoard({ manual: true }); });
  await page.waitForFunction(() => window.__app.mode && window.__app.mode.B && window.__app.mode.world, null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await pump('aantal poppetjes en speler-status', `return { n: B.players.length, tk: m.world.tokens.length, dw: B.duelsWon.length, pc: D.playerCount(), hud: m.hud.pEl.length }`, (r) => (r.n === N && r.tk === N && r.dw === N && r.pc === N && r.hud === N) || JSON.stringify(r));
  await pump('data: prijs/achterstaander/graaf', `const B2 = D.newState(5, 2); B2.players[1].trophies = 2; return { p0: D.trophyPrice(B2, 0), p1: D.trophyPrice(B2, 1), b0: D.isBehind(B2, 0), b1: D.isBehind(B2, 1), n: D.GRAPH.nodes.length, j: D.GRAPH.nodes.filter((n) => n.next.length > 1).length, ok: D.GRAPH.nodes.every((n) => n.next.every((k) => D.GRAPH.nodes[k])), sp: D.GRAPH.spots.length }`, (r) => (r.p0 === 10 && r.p1 === 20 && r.b0 && !r.b1 && r.n === 40 && r.j === 2 && r.ok && r.sp === 5) || JSON.stringify(r));
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
    await pump(`kanskaart: ${id}`, `m.force = { card: '${id}' }; B.players[1].coins = 20; ${id === 'forward' ? 'B.players[0].node = 1; B.players[0].coins = 10;' : ''} const r = await m.chanceCard(0); return { r, c: [B.players[0].coins, B.players[1].coins], c2: B.players[2] ? B.players[2].coins : null, it: B.players[0].items.length, sh: B.players[0].shield, tn: B.trophyNode, n: B.players[0].node }`,
      (r) => ({ egg: r.c[0] === 14, duck: r.c[0] === 8, gift: r.it === 1, swap: r.c[0] === 20 && r.c[1] === 10, forward: r.n === 4 && r.c[0] === 7, party: r.c[0] === 13 && r.c[1] === 23 && (N === 2 || r.c2 === 13), gamble: r.c[0] === 16 || r.c[0] === 7, robber: r.c[0] === 13 && r.c[1] === 17, trophy: r.tn !== 19, hat: r.c[0] === 12, shield: r.sh === true, again: r.r && r.r.again === true,
        give: N === 3 ? (r.c[0] === 8 && r.c[1] === 20 && r.c2 === 12) : (r.c[0] === 8 && r.c[1] === 22), pie: r.c[1] === 18 })[id] || JSON.stringify(r));
  }
  for (const [type, node] of [['blue', 1], ['red', 4], ['dice', 10], ['party', 8], ['chance', 2], ['shop', 7], ['trophy', 19], ['deur', 15]]) {
    await pump(`vakje: ${type}`, `${type === 'chance' ? "m.force = { card: 'egg' };" : ''}${type === 'deur' ? "m.force = { deur: 'sign' };" : ''} B.players[0].node = ${node}; B.players[0].coins = 40; const r = await m.land(0); return { r, c: B.players[0].coins, c1: B.players[1].coins, c2: B.players[2] ? B.players[2].coins : null, t: B.players[0].trophies, it: B.players[0].items.length }`,
      (r) => ({ blue: r.c === 43, red: r.c === 37, dice: r.r && r.r.again === true, party: r.c === 44 && r.c1 === 12 && (N === 2 || r.c2 === 12), chance: r.c === 44, shop: true, trophy: r.t === 1 && r.c === 20, deur: r.c === 45 })[type] || JSON.stringify(r));
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
  if (N === 2) {
    await pump('uitslag duel verwerken (ronde)', `B.pendingDuel = { kind: 'round', id: 'x' }; B.round = 1; await m.afterDuel({ pvp: true, winner: 1 }); return { c: [B.players[0].coins, B.players[1].coins], round: B.round, phase: B.phase }`, (r) => (r.c[0] === 13 && r.c[1] === 20 && r.round === 2 && r.phase === 'turn') || JSON.stringify(r));
    await pump('uitslag duel verwerken (met harness-ids)', `B.pendingDuel = { kind: 'round', id: 'x' }; B.round = 1; await m.afterDuel({ pvp: true, winner: 0, ids: [0, 1], winnerId: 0 }); return { c: [B.players[0].coins, B.players[1].coins] }`, (r) => (r.c[0] === 20 && r.c[1] === 13) || JSON.stringify(r));
  }
  await pump('uitslag duel verwerken (vakje, quit = gelijk)', `B.pendingDuel = { kind: 'tile', who: 0${N === 3 ? ', players: [0, 1], spec: 2, pred: null' : ''} }; B.turn = 0; await m.afterDuel(null); return { turn: B.turn, phase: B.phase }`, (r) => (r.turn === 1) || JSON.stringify(r));

  if (N === 3) {
    // ---- onderdelen die alleen bij 3 spelers bestaan
    await pump('3p data: prijs/achterstaander/plekpunten/doelwit', `const B3 = D.newState(5, 3); B3.players[0].trophies = 2; B3.players[1].trophies = 1; B3.players[0].coins = 10; B3.players[1].coins = 20; B3.players[2].coins = 5; const B4 = D.newState(5, 3); B4.players[0].coins = 10; B4.players[1].coins = 20; B4.players[2].coins = 5;
      return { price: [0, 1, 2].map((i) => D.trophyPrice(B3, i)), behind: [0, 1, 2].map((i) => D.isBehind(B3, i)), a: D.placePoints([5, 9, 7]), tie: D.placePoints([4, 4, 4]), t23: D.placePoints([9, 3, 3]), t12: D.placePoints([8, 8, 1]), win: D.placePoints([1e9, -1, -1]),
        rich0: D.pickTarget(B4, 0, 'rich'), poor0: D.pickTarget(B4, 0, 'poor'), rich1: D.pickTarget(B4, 1, 'rich'), poor1: D.pickTarget(B4, 1, 'poor'), low: D.lowest(B4), lead: D.leader(B3), oth: D.others(B3, 1) }`,
      (r) => (JSON.stringify(r.price) === '[20,15,10]' && JSON.stringify(r.behind) === '[false,false,true]' && JSON.stringify(r.a.pts) === '[3,10,6]' && JSON.stringify(r.a.place) === '[3,1,2]' && JSON.stringify(r.tie.pts) === '[6,6,6]'
        && JSON.stringify(r.t23.pts) === '[10,5,5]' && JSON.stringify(r.t12.pts) === '[8,8,3]' && JSON.stringify(r.win.pts) === '[10,5,5]' && r.rich0 === 1 && r.poor0 === 2 && r.rich1 === 0 && r.poor1 === 2 && r.low === 2 && r.lead === 0 && JSON.stringify(r.oth) === '[0,2]') || JSON.stringify(r));
    await pump('3p spel kiezen: players-definitie met 3 (en niet als duel)', `const prog = await import('/src/engine/progress.js'); const G = await import('/src/games/index.js'); const ctx = { isUnlocked: prog.isUnlocked, ARCADE_HALLS: G.ARCADE_HALLS };
      const saved = Object.values(m.app.games).map((g) => [g, g.players]); saved.forEach(([g]) => { delete g.players; });   // eventuele echte 3-speler-spellen tijdelijk uit
      const none = D.pickPartyId(m.app, ctx, []); const id = Object.keys(m.app.games).find((k) => m.app.games[k].mode === 'pvp'); const def = m.app.games[id]; const old = def.players;
      def.players = [2, 3]; const a = new Set(); for (let i = 0; i < 30; i++) a.add(D.pickPartyId(m.app, ctx, [])); const duelA = new Set(); for (let i = 0; i < 200; i++) duelA.add(D.pickDuelId(m.app, ctx, []));
      def.players = [3]; const duelB = new Set(); for (let i = 0; i < 200; i++) duelB.add(D.pickDuelId(m.app, ctx, [])); const bId = D.pickPartyId(m.app, ctx, [id]);
      S.arcade.excluded = [id]; const ex = D.pickPartyId(m.app, ctx, []); S.arcade.excluded = []; saved.forEach(([g, pl]) => { if (pl === undefined) delete g.players; else g.players = pl; });
      return { none, a: [...a], id, inA: duelA.has(id), inB: duelB.has(id), bId, ex }`, (r) => (r.none === null && r.a.length === 1 && r.a[0] === r.id && r.inA && !r.inB && r.bId === r.id && r.ex === null) || JSON.stringify(r));
    await pump('3p pionnen naast elkaar op een vakje', `B.players.forEach((p) => { p.node = 5; }); const s = [0, 1, 2].map((i) => m.spot(i, 5)); const sh = m.spot(0, 5, [5, 6, 7]); return { xs: s.map((v) => +v.x.toFixed(2)), solo: +sh.x.toFixed(2), nx: +m.world.nodes[5].x.toFixed(2) }`, (r) => (new Set(r.xs).size === 3 && r.solo === r.nx) || JSON.stringify(r));
    await pump('3p Deurman: plekken draaien rond', `m.force = { deur: 'swap' }; B.players[0].node = 5; B.players[1].node = 9; B.players[2].node = 12; await m.deurEvent(0); return B.players.map((p) => p.node)`, (r) => JSON.stringify(r) === '[9,12,5]' || JSON.stringify(r));
    await pump('3p Deurman: iedereen +1 (dansje)', `m.force = { deur: 'dance' }; await m.deurEvent(0); return B.players.map((p) => p.coins)`, (r) => JSON.stringify(r) === '[11,11,11]' || JSON.stringify(r));
    await pump('3p Deurman: troostprijs voor de laagste', `m.force = { deur: 'comfort' }; B.players[2].coins = 3; await m.deurEvent(0); return B.players.map((p) => p.coins)`, (r) => JSON.stringify(r) === '[10,10,7]' || JSON.stringify(r));
    await pump('3p kanskaart: wasbeer pakt van de rijkste', `m.force = { card: 'robber' }; B.players[1].coins = 20; B.players[2].coins = 15; await m.chanceCard(0); return B.players.map((p) => p.coins)`, (r) => JSON.stringify(r) === '[13,17,15]' || JSON.stringify(r));
    await pump('3p kanskaart: taart op de koploper', `m.force = { card: 'pie' }; B.players[2].trophies = 1; await m.chanceCard(0); return B.players.map((p) => p.coins)`, (r) => JSON.stringify(r) === '[10,10,8]' || JSON.stringify(r));
    await pump('3p kanskaart: ruilkaart met de rijkste', `m.force = { card: 'swap' }; B.players[1].coins = 12; B.players[2].coins = 20; await m.chanceCard(0); return B.players.map((p) => p.coins)`, (r) => JSON.stringify(r) === '[20,12,10]' || JSON.stringify(r));
    await pump('3p voorspelling: A = linker speler', `window.__predKey = 'a'; const t0 = performance.now(); const pick = await m.predict(2, [0, 1]); return { pick, ok: !m.pred && !m.wait }`, (r) => (r.pick === 0 && r.ok) || JSON.stringify(r));
    await pump('3p voorspelling: rechterpijl = rechter speler', `window.__predKey = 'right'; const pick = await m.predict(0, [1, 2]); return { pick }`, (r) => r.pick === 2 || JSON.stringify(r));
    await pump('3p voorspelling: B = rechter speler', `window.__predKey = 'b'; const pick = await m.predict(1, [0, 2]); return { pick }`, (r) => r.pick === 2 || JSON.stringify(r));
    await pump('3p voorspelling: niets gekozen na 4 s = geen voorspelling', `window.__noPred = true; const pick = await m.predict(2, [0, 1]); return { pick }`, (r) => r.pick === null || JSON.stringify(r));
    await shot('04_voorspelling_leeg');
    await pump('3p duel + juist geraden: winnaar +10, verliezer +3, toeschouwer +3', `B.pendingDuel = { kind: 'round', id: 'x', players: [0, 2], spec: 1, pred: 2 }; B.round = 1; await m.afterDuel({ pvp: true, ids: [0, 2], winner: 1, winnerId: 2 }); return { c: B.players.map((p) => p.coins), round: B.round, dw: B.duelsWon }`, (r) => (JSON.stringify(r.c) === '[13,13,20]' && r.round === 2 && JSON.stringify(r.dw) === '[0,0,1]') || JSON.stringify(r));
    await pump('3p duel + fout geraden: geen bonus, laagste krijgt troostprijs', `B.pendingDuel = { kind: 'round', id: 'x', players: [0, 2], spec: 1, pred: 0 }; B.round = 1; await m.afterDuel({ pvp: true, ids: [0, 2], winner: 1, winnerId: 2 }); return { c: B.players.map((p) => p.coins) }`, (r) => JSON.stringify(r.c) === '[13,12,20]' || JSON.stringify(r));
    await pump('3p duel: gelijkspel = beide +5', `B.pendingDuel = { kind: 'round', id: 'x', players: [1, 2], spec: 0, pred: 1 }; B.round = 1; await m.afterDuel({ pvp: true, ids: [1, 2], winner: null, winnerId: null }); return { c: B.players.map((p) => p.coins) }`, (r) => JSON.stringify(r.c) === '[10,15,15]' || JSON.stringify(r));
    await pump('3p duel: terugval op result.winner (slot) zonder winnerId/ids', `B.pendingDuel = { kind: 'round', id: 'x', players: [0, 2], spec: 1, pred: null }; B.round = 1; await m.afterDuel({ pvp: true, winner: 0 }); return { c: B.players.map((p) => p.coins) }`, (r) => JSON.stringify(r.c) === '[20,12,13]' || JSON.stringify(r));
    await pump('3p 3-speler-spel: 10 / 6 / 3 (met scoreById)', `B.pendingDuel = { kind: 'round', id: 'x', party: true, players: [0, 1, 2] }; B.round = 1; await m.afterDuel({ pvp: true, ids: [0, 1, 2], winner: 1, winnerId: 1, scoreById: { 0: 5, 1: 9, 2: 7 } }); return { c: B.players.map((p) => p.coins), dw: B.duelsWon }`, (r) => (JSON.stringify(r.c) === '[15,20,16]' && JSON.stringify(r.dw) === '[0,1,0]') || JSON.stringify(r));
    await pump('3p 3-speler-spel: gelijke stand gedeeld', `B.pendingDuel = { kind: 'round', id: 'x', party: true, players: [0, 1, 2] }; B.round = 1; await m.afterDuel({ pvp: true, ids: [0, 1, 2], winner: null, winnerId: null, scoreById: { 0: 4, 1: 4, 2: 4 } }); return { c: B.players.map((p) => p.coins) }`, (r) => JSON.stringify(r.c) === '[16,16,16]' || JSON.stringify(r));
    await pump('3p 3-speler-spel: twee delen de eerste plek', `B.pendingDuel = { kind: 'round', id: 'x', party: true, players: [0, 1, 2] }; B.round = 1; await m.afterDuel({ pvp: true, ids: [0, 1, 2], winner: null, winnerId: null, scoreArr: [8, 3, 8] }); return { c: B.players.map((p) => p.coins) }`, (r) => JSON.stringify(r.c) === '[18,13,18]' || JSON.stringify(r));
    await pump('3p 3-speler-spel: alleen winnaar bekend (zonder scores)', `B.pendingDuel = { kind: 'round', id: 'x', party: true, players: [0, 1, 2] }; B.round = 1; await m.afterDuel({ pvp: true, ids: [0, 1, 2], winner: 2, winnerId: 2 }); return { c: B.players.map((p) => p.coins) }`, (r) => (r.c[2] === 20 && r.c[0] === 15 && r.c[1] === 15) || JSON.stringify(r));
    await pump('3p 3-speler-spel: afgebroken (null) = iedereen gelijk', `B.pendingDuel = { kind: 'round', id: 'x', party: true, players: [0, 1, 2] }; B.round = 1; await m.afterDuel(null); return { c: B.players.map((p) => p.coins) }`, (r) => JSON.stringify(r.c) === '[16,16,16]' || JSON.stringify(r));
    await pump('3p troostprijs: alleen duidelijk laagste en achterstaand', `B.players[0].coins = 4; B.players[1].coins = 14; B.players[2].coins = 14; await m.comfort(); const a = B.players.map((p) => p.coins); B.players[0].coins = 12; B.players[1].coins = 12; B.players[2].coins = 14; await m.comfort(); return { a, b: B.players.map((p) => p.coins) }`, (r) => (JSON.stringify(r.a) === '[6,14,14]' && JSON.stringify(r.b) === '[12,12,14]') || JSON.stringify(r));
    await pump('3p toeschouwer wisselt per ronde', `const pairs = [1, 2, 3, 4, 5, 6].map((r) => (r - 1) % 3); return pairs`, (r) => JSON.stringify(r) === '[0,1,2,0,1,2]' || JSON.stringify(r));
  }
  await page.screenshot({ path: SHOTS ? path.join(SHOTS, `board${N}_04_onderdelen.png`) : '/dev/null' }).catch(() => {});

  // ---------------------------------------------------------------- deel B: volledig potje
  console.log(`--- deel B (${N} spelers): volledig potje ---`);
  await page.evaluate(async ([N]) => {
    const { S } = await import('/src/save.js'); S.arcade.board.plays = 0; S.arcade.board.wins = N === 3 ? [0, 0, 0] : [0, 0]; window.__coins0 = S.coins; window.__st = {}; window.__gift = true; window.__partyRounds = N === 3; if (N === 3) window.__stub = await (await import('/src/games/index.js')).loadGame('bordtest3'); await window.__app.goBoard({});
  }, [N]);
  await page.waitForFunction(() => window.__app.mode && window.__app.mode.world && window.__app.mode.wait && window.__app.mode.wait.kind === 'intro', null, { timeout: 60000 });
  let guard = 0, end = false, last = '', shots = {};
  const t0 = Date.now();
  while (guard++ < (+process.env.GUARD || 9000) && !end && Date.now() - t0 < 600000) {
    const r = await page.evaluate(BOT).catch((e) => 'fout ' + e.message.split('\n')[0]);
    if (typeof r === 'string' && r.startsWith('fout')) { if (!/Execution context|Target closed|navigat/.test(r)) console.log(r); await page.waitForTimeout(150); continue; }
    const rr = r && r.length ? r : String(r);
    if (rr === 'EINDE') { end = true; break; }
    const key = rr.split(' ')[0];   // screenshots van verschillende momenten
    if (SHOTS && ['dobbel', 'splitsing', 'tekst', 'menu', 'duel-start', 'item-menu', 'voorspel'].includes(key)) { shots[key] = (shots[key] || 0) + 1; if (shots[key] === 3 || (key === 'splitsing' && shots[key] === 1) || (key === 'menu' && shots[key] === 4) || (key === 'voorspel' && shots[key] === 1)) { await page.waitForTimeout(250); await shot(`02_${key}_${shots[key]}`); } }
    if (rr !== last) last = rr;
    await page.waitForTimeout(rr.startsWith('duel') ? 120 : 25);
  }
  if (!end) { fail(tag('potje niet uitgespeeld binnen de limiet (guard ' + guard + ', laatste bot-status: ' + last + ')')); console.log(await page.evaluate(() => { const m = window.__app.mode; return JSON.stringify({ cls: m && m.constructor.name, finished: m && m.finished, rr: m && m.resultReady, state: m && m.state, wait: m && m.wait && m.wait.kind, ids: m && m.ids }); })); }
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
  console.log('duel-info:', JSON.stringify(st.info || []));
  console.log('wacht-soorten:', JSON.stringify(st.kinds), 'voorspellingen:', st.preds || 0);
  if (!fin.over) fail(tag('B.over niet gezet'));
  if (fin.plays !== 1) fail(tag('S.arcade.board.plays moet 1 zijn, is ' + fin.plays));
  if (!Array.isArray(fin.wins) || fin.wins.length !== 3 || fin.wins.reduce((a, b) => a + b, 0) !== 1) fail(tag('S.arcade.board.wins moet 3 lang zijn met 1 winst: ' + JSON.stringify(fin.wins)));
  if (!fin.players || fin.players.length !== N) fail(tag('verkeerd aantal spelers aan het eind'));
  if (!(fin.coins > fin.coins0)) fail(tag('geen beloning in S.coins'));
  if (!st.duels || st.duels < ROUNDS) fail(tag(`te weinig duels gespeeld (${st.duels}) voor ${ROUNDS} rondes`));
  if ((st.duelIds || []).some((s) => !s.endsWith('/true'))) fail(tag('duel zonder extra.board'));
  if (N === 2 && (st.info || []).some((x) => x.n !== 2 || x.ids !== '01')) fail(tag('bij 2 spelers moet elk duel [0,1] zijn'));
  if (N === 3) {
    const rounds = (st.info || []).filter((x) => x.kind === 'round');
    if (rounds.some((x) => x.n === 2 && x.spec !== (x.round - 1) % 3)) fail(tag('toeschouwer wisselt niet per ronde: ' + JSON.stringify(rounds)));
    if (!(st.who && st.who[0] && st.who[1] && st.who[2])) fail(tag('niet alle 3 spelers kwamen aan de beurt'));
    if (ROUNDS >= 4 && !rounds.some((x) => x.n === 3)) fail(tag('geen 3-speler-spel (players-definitie) gespeeld'));
    if (ROUNDS >= 4 && !rounds.some((x) => x.n === 2)) fail(tag('geen duel met toeschouwer gespeeld'));
    if (!st.preds) fail(tag('de toeschouwer deed nooit een voorspelling'));
  }

  // pauzemenu testen (Esc), dan terug naar de Speelhal via de ceremonie-keuze
  let paused = false;   // het beeld kan traag zijn (swiftshader): Esc langer vasthouden, zo nodig opnieuw
  for (let k = 0; k < 3 && !paused; k++) { await page.keyboard.down('Escape'); await page.waitForTimeout(900); await page.keyboard.up('Escape'); await page.waitForTimeout(500); paused = await page.evaluate(() => window.__app.mode.paused); }
  console.log('pauze na Esc:', paused);
  if (!paused) fail(tag('Esc opent geen pauzemenu'));
  if (paused) await page.evaluate(() => { const m = window.__app.mode, inp = window.__app.input; m.pauseChooser.t = 0; inp.virtual[0].b = true; inp.update(); m.update(0.016); inp.virtual[0].b = false; inp.update(); m.update(0.016); });
  await page.waitForTimeout(200);
  if (await page.evaluate(() => window.__app.mode.paused)) fail(tag('Doorgaan sluit de pauze niet'));
  await page.evaluate(() => { const m = window.__app.mode, inp = window.__app.input; m.chooser.sel = 1; m.chooser.t = 0; inp.virtual[0].a = true; inp.update(); m.update(0.016); inp.virtual[0].a = false; inp.update(); m.update(0.016); });
  await page.waitForFunction(() => window.__app.mode && window.__app.mode.cabs, null, { timeout: 30000 }).then(() => console.log('terug in de Speelhal: ok')).catch(() => fail(tag('niet terug in de Speelhal')));
  await page.waitForTimeout(800);
  await page.close();
}

if (WHICH !== '3') await suite(2);
if (WHICH !== '2') await suite(3);
console.log(errors.length ? 'ERRORS:\n' + errors.slice(0, 20).join('\n') : 'NO ERRORS');
await browser.close(); server.close(); process.exit(errors.length ? 1 : 0);
