// Impactid Gamehal: een spel starten met 2..4 spelers (alles samen / teams / knock-out / drie van vier) en de tussenschermen daarbij.
// De hal (ArcadeMode) roept `plan()` aan vanuit launch() en `afterMatch()` vanuit afterDuel(). De stand van een lopende knock-out
// staat in de module-variabele BR en overleeft de duels (playGame -> goArcade({ result }) bouwt de hal elke keer opnieuw op).
import { h } from '../engine/util.js';
import { ui, Menu } from '../engine/ui.js';
import { audio } from '../engine/audio.js';
import * as party from '../engine/party.js';
import { S } from '../save.js';
import { playMode, playerIds, playerCount, listNames, shuffled } from './common.js';
import { pname, pcss, readResult } from '../world/players3.js';

let BR = null;            // { b: Bracket, id, base: extra, twist, log: [{name, pair, winner}], tourney }
let SUBWAIT = -1;         // 4 spelers + spel voor 3: wie wacht er (wisselt per potje)
export const bracketActive = () => !!BR;
export const cancelBracket = () => { BR = null; };
export const bracketId = () => (BR ? BR.id : null);

const tag = (id) => `<b style="color:${pcss(id)}">${pname(id)}</b>`;

// ---- een kaart met een menu (alle spelers kunnen bedienen) ----
function cardMenu(A, body, labels, { wide = false, title = '', sub = '' } = {}) {
  return new Promise((resolve) => {
    const items = labels.map((l, i) => ({ label: l, onSelect: () => { A.menu = null; ui.activeMenus = ui.activeMenus.filter((m) => m !== menu); el.remove(); resolve(i); } }));
    const menu = new Menu(items); A.menu = menu; menu.sel = 0; menu.render();
    const card = h('div', { class: 'card gh-card', style: { width: wide ? 'min(760px,94vw)' : 'min(600px,94vw)' } }, title ? h('h2', {}, title) : null, sub ? h('p', { class: 'gh-sub', html: sub }) : null, body, menu.el);
    const el = ui.overlay(card);
  });
}

// ---- 2 tegen 2: teams kiezen ----
async function pickTeams(A, ids, tourney) {
  if (tourney) { const t = party.splitTeams(4); return { ids, teams: t }; }
  const nm = (k) => pname(ids[k]);
  const combos = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
  const c = await A.choose('Teams: 2 tegen 2', ['🎲 Loten (willekeurig)', ...combos.map(([a, b]) => `${nm(a[0])} + ${nm(a[1])}  tegen  ${nm(b[0])} + ${nm(b[1])}`), 'Terug'], 'Dit spel kent teams: je speelt met een maatje.', true);
  if (c == null || c === combos.length + 1) return null;
  if (c === 0) return { ids, teams: party.splitTeams(4) };
  return { ids, teams: combos[c - 1] };
}
// slot-indeling van `teams` ([[0,1],[2,3]] in slots) naar spelers-volgorde: slot k = ids[k]
const teamIds = (ids, teams) => teams.map((t) => t.map((k) => ids[k]));

// ---- Een spel starten: geeft { extra, twist } terug om mee te launchen, of null (afgebroken). ----
export async function plan(A, id, extra, twist) {
  const def = A.app.games[id]; const n = playerCount(); extra = { ...(extra || {}) };
  if (extra.players) return { extra, twist };                        // al bepaald (knock-out, winnaar-blijft, toernooi)
  const mode = playMode(def, n);
  if (mode === 'duel' || mode === null) return { extra, twist };       // 2 spelers [0, 1]
  if (mode === 'all') {
    let ids = playerIds();
    if (def.teams && n === 4) {
      const t = await pickTeams(A, ids, !!extra.tourney); if (!t) return null;
      extra.teams = t.teams; extra.teamIds = teamIds(ids, t.teams);
    }
    extra.players = ids; return { extra, twist };
  }
  if (mode === 'subset') {                                           // 4 spelers, spel voor 3: drie spelen, de vierde wacht
    SUBWAIT = (SUBWAIT + 1) % 4; const wait = SUBWAIT; const ids = playerIds().filter((i) => i !== wait);
    extra.players = ids; extra.waiting = [wait]; return { extra, twist };
  }
  if (mode === 'pair') {                                             // 3 spelers: winnaar blijft / zelf kiezen
    const sel = await A.pickPair(); if (!sel) return null;
    extra.players = sel.pair; extra.q = sel.q; return { extra, twist };
  }
  // knock-out met 4 spelers
  const b = new party.Bracket(playerIds(), { seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0 });
  BR = { b, id, base: { ...extra }, twist, log: [], tourney: !!extra.tourney };
  const nx = await step(A, true);
  return nx;                                                         // { extra, twist } voor de eerste wedstrijd, of null
}

// ---- tussenscherm voor de volgende wedstrijd van de knock-out; geeft de extra voor die wedstrijd (of null bij stoppen) ----
async function step(A, first = false) {
  const rd = BR.b.round(); if (!rd) return null;
  const def = A.app.games[BR.id];
  const [a, b] = rd.pair;
  const body = h('div', { class: 'gh-ko' },
    h('div', { class: 'gh-vs', html: `${tag(a)} <span>VS</span> ${tag(b)}` }),
    rd.waiting.length ? h('div', { class: 'gh-watch', html: `👀 ${listNames(rd.waiting)} ${rd.waiting.length > 1 ? 'kijken' : 'kijkt'} toe` }) : null,
    rd.replay ? h('div', { class: 'gh-watch', html: `🤝 Gelijkspel gehad: deze wedstrijd moet beslist worden!` }) : null,
    BR.log.length ? h('div', { class: 'gh-log' }, ...BR.log.map((m) => h('div', { html: `✔ ${m.name}: ${tag(m.winner)} wint van ${tag(m.pair.find((x) => x !== m.winner))}${m.coin ? ' (munt)' : ''}` }))) : null);
  const sub = `${def.icon || ''} <b>${def.name}</b> · knock-out met ${BR.b.n} spelers · wedstrijd ${rd.no} van ${rd.of}`;
  audio.sfx('select');
  const c = await cardMenu(A, body, ['▶ Spelen!', 'Knock-out stoppen'], { title: `🏆 ${rd.name}`, sub });
  if (c !== 0) { BR = null; A.toast('Knock-out gestopt.'); return null; }
  const extra = { ...BR.base, players: rd.pair.slice(), bracket: true, tourney: true, bracketName: rd.name, waiting: rd.waiting.slice() };
  return { extra, twist: BR.twist };
}

// ---- na een wedstrijd van de knock-out. Geeft nooit terug als er nog een wedstrijd komt (de hal wordt dan opnieuw gebouwd);
//      geeft { done, winnerId, ids, standings } als de knock-out klaar is, of { cancelled: true } bij stoppen. ----
export async function afterMatch(A, r) {
  if (!BR) return { cancelled: true };
  const { winnerId } = readResult(r);
  const rd = BR.b.round(); const nm = rd ? rd.name : '';
  const before = BR.b.results.length;
  BR.b.report(winnerId == null ? null : winnerId);
  if (BR.b.results.length > before) { const m = BR.b.results[BR.b.results.length - 1]; BR.log.push({ name: m.name, pair: m.pair, winner: m.winner, coin: m.coin }); A.toast && A.toast(`${m.name}: ${pname(m.winner)} wint!`); }
  else A.toast && A.toast(`${nm}: gelijkspel! Nog een keer.`);
  if (!BR.b.done) {
    const nx = await step(A);
    if (!nx) return { cancelled: true };
    await A.launch(BR.id, nx.extra, nx.twist);   // verlaat de hal; komt niet terug
    return { cancelled: true };
  }
  return finish(A);
}

async function finish(A) {
  const b = BR.b, st = b.standings(), ids = b.order.slice(); const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  const def = A.app.games[BR.id];
  const body = h('div', { class: 'gh-podium' }, ...st.map((id, k) => h('div', { class: 'gh-place p' + (k + 1), style: { '--c': pcss(id) }, html: `<span class="m">${medals[k]}</span> <b>${pname(id)}</b>` })),
    BR.log.length ? h('div', { class: 'gh-log' }, ...BR.log.map((m) => h('div', { html: `${m.name}: ${tag(m.winner)} won van ${tag(m.pair.find((x) => x !== m.winner))}` }))) : null);
  A.players.forEach((p) => { const k = st.indexOf(p.i); p.c.pose = k === 0 ? 'cheer' : k === st.length - 1 ? 'sad' : 'idle'; });
  audio.sfx('win'); A.life && A.life.cheer && A.life.cheer();
  const out = { done: true, winnerId: b.champion, ids, standings: st.slice() };
  const tourney = BR.tourney; BR = null;
  await cardMenu(A, body, [tourney ? 'Doorgaan' : 'Prachtig!'], { title: `👑 ${pname(out.winnerId)} wint de knock-out!`, sub: `${def.icon || ''} ${def.name} · eindstand`, wide: true });
  A.players.forEach((p) => (p.c.pose = 'idle'));
  return out;
}

// ---- eindstand van een spel met alle spelers tegelijk (result.place = spelers-id's van 1e naar laatste) ----
export function placeCard(A, r, title) {
  const { ids, place, winnerIds } = readResult(r); if (!place || place.length < 3) return Promise.resolve();
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  const body = h('div', { class: 'gh-podium' }, ...place.map((id, k) => h('div', { class: 'gh-place p' + (k + 1), style: { '--c': pcss(id) }, html: `<span class="m">${medals[k]}</span> <b>${pname(id)}</b>${r.scoreById && r.scoreById[id] != null ? ` <small>${r.scoreById[id]}</small>` : ''}` })));
  return cardMenu(A, body, ['Doorgaan'], { title: title || '🏁 Eindstand', wide: false });
}
