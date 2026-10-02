// Opslag in localStorage (fallback: geheugen)
const KEY = 'heitjes_voor_karweitjes_v1';
const defaults = () => ({
  names: ['Wes', 'Jor'],
  coins: 0, totalEarned: 0,
  jobs: {},            // id -> { plays, bestStars, bestScore }
  day: 0,              // loopt op met elke klus
  flags: {},           // story-flags
  collected: {},       // verzamelde muntjes/kisten in de wereld
  sightings: 0,        // aantal keer dat de Deurman gezien is
  scared: 0,           // aantal keer geschrokken
  ticket: false, vip: false, ending: false,
  arcade: { wins: [0, 0], draws: 0, plays: 0, byGame: {}, tourneys: [0, 0] },
  playTime: 0, tod: 0.1, hubPos: null, banished: 0,
  settings: { scare: 2, flashFree: false, music: 0.5, sfx: 0.8, quality: 'high' },
});
export const S = defaults();
let mem = null;
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = mem; }
  if (raw) {
    try { const o = JSON.parse(raw); Object.assign(S, defaults(), o, { settings: { ...defaults().settings, ...(o.settings || {}) } }); } catch (e) { /* kapot */ }
  }
  S.names = ['Wes', 'Jor'];   // namen staan vast (ook voor oude opslag)
  return S;
}
export function persist() {
  const s = JSON.stringify(S);
  try { localStorage.setItem(KEY, s); } catch (e) { mem = s; }
}
export function reset() {
  const settings = S.settings; Object.assign(S, defaults(), { settings }); persist();
}
export function hasSave() { try { return !!localStorage.getItem(KEY) && (JSON.parse(localStorage.getItem(KEY)).totalEarned > 0 || Object.keys(JSON.parse(localStorage.getItem(KEY)).jobs || {}).length > 0); } catch (e) { return false; } }
