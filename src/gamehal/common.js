// Impactid Gamehal: gedeelde hulpjes (spelers, namen, welk spel past bij hoeveel spelers). Contract: docs/PLAYERS4.md.
import { S, persist } from '../save.js';
import * as party from '../engine/party.js';
import { canvasTex } from '../engine/util.js';

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

// ---- impactID-huisstijl (docs/IMPACTID_STIJL.md): kleuren, lettertype, logo en canvas-teksturen ----
export const II = {
  navy: '#003872', navy2: '#00244b', navy3: '#03152e', blue: '#33608e', sky: '#007fd8', sky5: '#3399e0', sky3: '#99ccef', sky1: '#e0effa', mist: '#f5f7f9', line: '#ccd7e3', white: '#ffffff',
  fund: '#ff3a00', fund5: '#ff6133', proj: '#cc0254', proj5: '#d63576', field: '#00912b', field5: '#33a755',
};
export const IIHEX = (css) => parseInt(css.slice(1), 16);
export const FONT = '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
// kleuren van de badges boven de kasten (HUD/3D): iedereen mee = merkblauw, knock-out = roze, paar/deel = oranje, past niet = grijsblauw
export const BADGE_COL = { all: II.sky, ko: II.proj, pair: '#c7330a', no: II.blue };
export const LOGO_URL = 'img/impactid/logo.png';   // 663 x 334, transparant (het enige logobestand dat er is)
let _logo = null;
export const logoImage = () => (_logo ||= new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = LOGO_URL; }));
export const fontReady = () => (typeof document !== 'undefined' && document.fonts && document.fonts.load
  ? Promise.all(['800 64px "Plus Jakarta Sans"', '700 40px "Plus Jakarta Sans"', '600 30px "Plus Jakarta Sans"'].map((f) => document.fonts.load(f))).catch(() => {}) : Promise.resolve());
// canvastextuur met logo/lettertype: tekent meteen (zonder logo, met terugvalfont) en na het laden nog eens (draw(g, w, h, logoImg|null))
export function brandTex(w, h, draw, opts) {
  const t = canvasTex(w, h, (g, ww, hh) => draw(g, ww, hh, null), opts);
  Promise.all([logoImage(), fontReady()]).then(([img]) => { const c = t.image; const g = c.getContext('2d'); g.clearRect(0, 0, w, h); draw(g, w, h, img); t.needsUpdate = true; });
  return t;
}
export const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
// logo in een vak tekenen (behoud verhouding, gecentreerd), nooit vervormd
export function drawLogo(g, img, x, y, w, h) {
  if (!img) return; const k = Math.min(w / img.naturalWidth, h / img.naturalHeight), lw = img.naturalWidth * k, lh = img.naturalHeight * k;
  g.imageSmoothingQuality = 'high'; g.drawImage(img, x + (w - lw) / 2, y + (h - lh) / 2, lw, lh);
}
