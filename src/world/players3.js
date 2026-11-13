// Hulpjes voor de derde speler Juul in de werelden (hal, dorp, winkel, menu...). Contract: docs/PLAYERS3.md.
// Dunne laag boven input.all / party.js / chars.js, met terugval op 2 spelers.
import { S } from '../save.js';
import { input, BASE_KEY_LABELS } from '../engine/input.js';
import { Menu } from '../engine/ui.js';
import * as chars from '../engine/chars.js';
import * as party from '../engine/party.js';

export const NAMES3 = ['Wes', 'Jor', 'Juul', 'Sam'];
const COL = [0x2f9e5b, 0x3a78e0, 0xff8a2a, 0xc844e8];
const CSS = ['#35c46f', '#4a8cff', '#ff9a3c', '#d45cf0'];
export const LABEL_CSS = ['#6bf09a', '#7fb2ff', '#ffb870', '#e79bff'];   // lichtere tint voor namen boven hoofden (leesbaar tegen alle achtergronden)
const KEYS3 = { move: 'IJKL', a: 'U', b: 'O' };
export const pcol = (i) => (chars.BASE_COLORS ? chars.BASE_COLORS[i] : COL[i]);   // per spelers-id (niet per slot)
export const pcss = (i) => (chars.BASE_CSS ? chars.BASE_CSS[i] : CSS[i]);
export const pname = (i) => (S.names && S.names[i]) || NAMES3[i];
export const klabel = (i) => BASE_KEY_LABELS[i] || KEYS3;

// aantal spelers (2, 3 of 4) en hun id's
export const nPlayers = () => party.playerCount();
export const activeIds = () => party.activeIds();
export const hasJuul = () => nPlayers() === 3;

const BLANK = new Proxy({}, { get: (t, k) => (k === 'x' || k === 'y' || k === 'mag' ? 0 : false) });
// ruwe invoer van speler i (spelers-id)
export const inp = (i) => (input.all[i]) || BLANK;
export const activeInputs = () => activeIds().map(inp);
export const anyP = (k) => activeIds().some((i) => inp(i)[k]);   // bijv. anyP('aP')

// ---- teksten ----
export const joinNames = (ids) => { const a = ids.map(pname); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' en ' + a[a.length - 1]; };
export const standTxt = (arr, ids = activeIds(), sep = ' – ') => ids.map((i) => `${pname(i)} ${arr[i] || 0}`).join(sep);
export const sum = (arr, ids = activeIds()) => ids.reduce((a, i) => a + ((arr && arr[i]) || 0), 0);
export const wins3 = (arr) => { const a = arr || []; return [a[0] || 0, a[1] || 0, a[2] || 0, a[3] || 0]; };
// speler(s) met het hoogste getal (arr per spelers-id); lege lijst bij alleen nullen
export function topOf(arr, ids = activeIds()) {
  const m = Math.max(...ids.map((i) => arr[i] || 0)); return m > 0 ? ids.filter((i) => (arr[i] || 0) === m) : [];
}
export const pairLabel = (pr) => `${pname(pr[0])} – ${pname(pr[1])}`;
export const allPairs = (ids = activeIds()) => { const o = []; for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) o.push([ids[a], ids[b]]); return o; };
// past een spel bij dit aantal spelers? (def.players = lijst met ondersteunde aantallen; zonder = alleen duel voor 2)
// (3 spelers: een spel dat 2 kent speelt als paar, ook als het daarnaast 4 kent: def.players = [2, 4])
export const supports = (def, n = nPlayers()) => !def || !def.players || def.players.includes(n) || (n === 3 && def.players.includes(2));
export const wantsAll = (def) => nPlayers() >= 3 && !!def && Array.isArray(def.players) && def.players.includes(nPlayers());   // het spel kent precies dit aantal: iedereen doet mee

// ---- wachtrij 'winnaar blijft' (DuelQueue uit engine/party.js) ----
export const mainQueue = () => party.duelQueue();                  // gedeelde wachtrij van de sessie (wordt vernieuwd bij 2<->3 spelers)
export const newQueue = (ids = activeIds()) => new party.DuelQueue(ids);   // losse wachtrij, bijv. voor een toernooi

// ---- resultaat van een duel, ook als de harness nog oude velden levert ----
export function readResult(r) {
  const ids = (r && r.ids && r.ids.length ? r.ids.slice() : [0, 1]);
  const wid = r && r.winnerId !== undefined ? r.winnerId : (r && r.winner != null ? ids[r.winner] : null);
  const wids = r && Array.isArray(r.winnerIds) ? r.winnerIds.slice() : (wid == null ? [] : [wid]);   // teams: meerdere winnaars
  return { ids, winnerId: wid == null ? null : wid, winnerIds: wids, place: r && Array.isArray(r.place) ? r.place.slice() : null, scoreById: r && r.scoreById };
}

// engine-Menu leest input.all (alle spelers); alias zodat de werelden één naam gebruiken
export const Menu3 = Menu;
