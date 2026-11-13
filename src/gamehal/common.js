// Impactid Gamehal: gedeelde hulpjes (spelers, namen, welk spel past bij hoeveel spelers). Contract: docs/PLAYERS4.md.
import { S, persist } from '../save.js';
import * as party from '../engine/party.js';

export const DEF_NAMES = ['Wes', 'Jor', 'Juul', 'Sam'];
export const MAX_NAME = 12;

export const playerCount = () => party.playerCount();
export const playerIds = () => party.activeIds();

// Naam van speler i aanpassen (opslaan in S.names, hetzelfde array-object als ui.names)
export function setName(i, v) {
  const nm = String(v == null ? '' : v).replace(/[<>&"]/g, '').trim().slice(0, MAX_NAME) || DEF_NAMES[i];
  S.names[i] = nm; persist(); return nm;
}

// ---- welk spel past bij hoeveel spelers? (def.players = lijst ondersteunde aantallen; ontbreekt -> alleen 2) ----
export const sizesOf = (def) => (def && Array.isArray(def.players) && def.players.length ? def.players.slice().sort((a, b) => a - b) : [2]);
// 'all'     = alle n spelers doen mee (eigen modus van het spel)
// 'duel'    = n is 2 en het spel is 1 tegen 1
// 'pair'    = 3 spelers, 1-tegen-1-spel: twee spelen, de derde kijkt toe (winnaar blijft / zelf kiezen)
// 'bracket' = 4 spelers, 1-tegen-1-spel: knock-out (2 halve finales + finale)
// 'subset'  = 4 spelers, spel kent alleen 3: drie spelen, de vierde wacht (wisselt per potje)
// null      = past niet bij dit aantal
export function playMode(def, n = playerCount()) {
  if (!def) return null;
  const pl = party.playPlan(def, [0, 1, 2, 3].slice(0, n));
  if (pl.mode === 'all') return n === 2 ? 'duel' : 'all';
  if (pl.mode === 'queue') return 'pair';
  if (pl.mode === 'unsupported') return null;
  return pl.mode;   // 'bracket' | 'subset'
}
export const playable = (def, n = playerCount()) => playMode(def, n) !== null;
// spelers-aantal als tekst: [2,3,4] -> '2-4', [4] -> '4', [2,4] -> '2-4'
export const sizesTxt = (def) => { const ps = sizesOf(def); return ps.length === 1 || ps[0] === ps[ps.length - 1] ? String(ps[0]) : `${ps[0]}-${ps[ps.length - 1]}`; };
// badge per kast: { txt, cls } ; cls = 'all' | 'ko' | 'pair' | 'no' | ''
export function badge(def, n = playerCount()) {
  const m = playMode(def, n), ps = sizesOf(def);
  if (m === 'bracket') return { txt: '🏆 knock-out', cls: 'ko' };
  if (m === 'pair') return { txt: '🥊 2 uit 3', cls: 'pair' };
  if (m === 'subset') return { txt: '👥 3 van 4', cls: 'pair' };
  if (m === null) return { txt: `👥 alleen ${sizesTxt(def)}`, cls: 'no' };
  if (m === 'duel') return ps.length > 1 ? { txt: `👥 ${sizesTxt(def)}`, cls: 'all' } : { txt: '', cls: '' };
  return { txt: `👥 ${sizesTxt(def)}`, cls: 'all' };
}
// uitleg bij de kast
export function modeText(def, n = playerCount()) {
  const m = playMode(def, n);
  if (m === 'all') return n === 2 ? '' : `Alle ${n} spelers doen tegelijk mee.${def.teams && n === 4 ? ' Bij 4 spelers: 2 tegen 2.' : ''}`;
  if (m === 'bracket') return 'Knock-out: 2 halve finales, dan de finale. De rest kijkt toe.';
  if (m === 'subset') return 'Dit spel is voor 3: drie spelen, de vierde kijkt toe (en wisselt per potje).';
  if (m === 'pair') return 'Twee spelen, de derde kijkt toe (winnaar blijft, of zelf kiezen).';
  if (m === null) return `Dit spel heeft ${sizesTxt(def)} spelers nodig. Je speelt nu met ${n}: pas dat aan in de lobby.`;
  return '';
}

// 'A, B en C'
export const listNames = (ids, nameOf = (i) => S.names[i]) => { const a = ids.map(nameOf); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' en ' + a[a.length - 1]; };

export function shuffled(arr, rnd = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
