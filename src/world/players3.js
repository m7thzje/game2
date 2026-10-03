// Hulpjes voor de derde speler Juul in de werelden (hal, dorp, winkel, menu...). Contract: docs/PLAYERS3.md.
// Dunne laag boven input.all / party.js / chars.js, met terugval op 2 spelers.
import { S } from '../save.js';
import { input, BASE_KEY_LABELS } from '../engine/input.js';
import { Menu } from '../engine/ui.js';
import * as chars from '../engine/chars.js';
import * as party from '../engine/party.js';

export const NAMES3 = ['Wes', 'Jor', 'Juul'];
const COL = [0x2f9e5b, 0x3a78e0, 0xff8a2a];
const CSS = ['#35c46f', '#4a8cff', '#ff9a3c'];
export const LABEL_CSS = ['#6bf09a', '#7fb2ff', '#ffb870'];   // lichtere tint voor namen boven hoofden (leesbaar tegen alle achtergronden)
const KEYS3 = { move: 'IJKL', a: 'U', b: 'O' };
export const pcol = (i) => (chars.BASE_COLORS ? chars.BASE_COLORS[i] : COL[i]);   // per spelers-id (niet per slot)
export const pcss = (i) => (chars.BASE_CSS ? chars.BASE_CSS[i] : CSS[i]);
export const pname = (i) => (S.names && S.names[i]) || NAMES3[i];
export const klabel = (i) => BASE_KEY_LABELS[i] || KEYS3;

// aantal spelers (2 of 3) en hun id's
export const nPlayers = () => (S.settings && S.settings.players === 3 ? 3 : 2);
export const activeIds = () => party.activeIds();
export const hasJuul = () => nPlayers() === 3;

const BLANK = new Proxy({}, { get: (t, k) => (k === 'x' || k === 'y' || k === 'mag' ? 0 : false) });
// ruwe invoer van speler i (spelers-id)
export const inp = (i) => (input.all[i]) || BLANK;
export const activeInputs = () => activeIds().map(inp);
export const anyP = (k) => activeIds().some((i) => inp(i)[k]);   // bijv. anyP('aP')

// ---- teksten ----
export const joinNames = (ids) => ids.map(pname).join(' en ');
export const standTxt = (arr, ids = activeIds(), sep = ' – ') => ids.map((i) => `${pname(i)} ${arr[i] || 0}`).join(sep);
export const sum = (arr, ids = activeIds()) => ids.reduce((a, i) => a + ((arr && arr[i]) || 0), 0);
export const wins3 = (arr) => { const a = arr || []; return [a[0] || 0, a[1] || 0, a[2] || 0]; };
// speler(s) met het hoogste getal (arr per spelers-id); lege lijst bij alleen nullen
export function topOf(arr, ids = activeIds()) {
  const m = Math.max(...ids.map((i) => arr[i] || 0)); return m > 0 ? ids.filter((i) => (arr[i] || 0) === m) : [];
}
export const pairLabel = (pr) => `${pname(pr[0])} – ${pname(pr[1])}`;
export const allPairs = (ids = activeIds()) => { const o = []; for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) o.push([ids[a], ids[b]]); return o; };
// past een spel bij dit aantal spelers? (def.players = lijst met ondersteunde aantallen; zonder = alleen duel voor 2)
export const supports = (def, n = nPlayers()) => !def || !def.players || def.players.includes(n);
export const wantsAll = (def) => nPlayers() === 3 && !!def && Array.isArray(def.players) && def.players.includes(3);

// ---- wachtrij 'winnaar blijft' (DuelQueue uit engine/party.js) ----
export const mainQueue = () => party.duelQueue();                  // gedeelde wachtrij van de sessie (wordt vernieuwd bij 2<->3 spelers)
export const newQueue = (ids = activeIds()) => new party.DuelQueue(ids);   // losse wachtrij, bijv. voor een toernooi

// ---- resultaat van een duel, ook als de harness nog oude velden levert ----
export function readResult(r) {
  const ids = (r && r.ids && r.ids.length ? r.ids.slice() : [0, 1]);
  const wid = r && r.winnerId !== undefined ? r.winnerId : (r && r.winner != null ? ids[r.winner] : null);
  return { ids, winnerId: wid == null ? null : wid, scoreById: r && r.scoreById };
}

// engine-Menu leest input.all (alle spelers); alias zodat de werelden één naam gebruiken
export const Menu3 = Menu;
