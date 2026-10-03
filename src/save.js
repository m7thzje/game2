// Opslag in localStorage (fallback: geheugen)
const KEY = 'heitjes_voor_karweitjes_v1';
const blankOwned = () => ({ hat: ['std'], shirt: ['std'], hair: ['std'], cape: ['std'] });
const blankEq = () => ({ hat: 'std', shirt: 'std', hair: 'std', cape: 'std' });
const defaults = () => ({
  names: ['Wes', 'Jor', 'Juul'],   // altijd 3 (Juul speelt alleen mee bij settings.players === 3)
  coins: 0, totalEarned: 0,
  jobs: {},            // id -> { plays, bestStars, bestScore }
  day: 0,              // loopt op met elke klus
  flags: {},           // story-flags
  collected: {},       // verzamelde muntjes/kisten in de wereld
  sightings: 0,        // aantal keer dat de Deurman gezien is
  scared: 0,           // aantal keer geschrokken
  ticket: false, vip: false, ending: false,   // (oud, door het dorp-team nog gelezen)
  arcade: { wins: [0, 0, 0], draws: 0, plays: 0, byGame: {}, tourneys: [0, 0, 0], unlocked: [0], pairs: {} },   // wins/tourneys/byGame[].wins per spelers-id; pairs['a-b'] (a<b) = { plays, draws, wins:[a,b] }
  deur: { stickers: [], cameos: 0 },   // Deurman-vriendenboek
  // hoedjes en kleuren per broer (zie engine/cosmetics.js); 'std' = standaard
  cosmetics: { owned: [0, 1, 2].map(blankOwned), equipped: [0, 1, 2].map(blankEq) },
  playTime: 0, tod: 0.1, hubPos: null, banished: 0,
  settings: { players: 2, scare: 2, flashFree: false, music: 0.5, sfx: 0.8, quality: 'high', unlockAll: false, quickStart: false },   // scare = Deurman-gedrag 0-3 (Uit/Af en toe/Vaak/Overal!)
});
export const S = defaults();
let mem = null;
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { raw = mem; }
  if (raw) {
    try { const o = JSON.parse(raw); Object.assign(S, defaults(), o, { settings: { ...defaults().settings, ...(o.settings || {}) } }); } catch (e) { /* kapot */ }
  }
  migrate();
  return S;
}
// Oude opslag (2 spelers) aanvullen naar 3 spelers; veilig om vaker aan te roepen
export function migrate() {
  S.names = ['Wes', 'Jor', 'Juul'];   // namen staan vast (ook voor oude opslag)
  S.settings.players = S.settings.players === 3 ? 3 : 2;
  const A = (S.arcade ||= defaults().arcade);
  const fix3 = (a) => { const o = Array.isArray(a) ? a.slice(0, 3) : []; while (o.length < 3) o.push(0); return o.map((n) => (typeof n === 'number' && isFinite(n) ? n : 0)); };
  A.wins = fix3(A.wins); A.tourneys = fix3(A.tourneys); A.pairs ||= {};
  for (const id in (A.byGame ||= {})) { const g = A.byGame[id]; g.wins = fix3(g.wins); }
  const c = (S.cosmetics ||= defaults().cosmetics);
  if (!Array.isArray(c.owned)) c.owned = []; if (!Array.isArray(c.equipped)) c.equipped = [];
  for (let i = 0; i < 3; i++) { c.owned[i] ||= blankOwned(); c.equipped[i] ||= blankEq(); }
}
export function persist() {
  const s = JSON.stringify(S);
  try { localStorage.setItem(KEY, s); } catch (e) { mem = s; }
}
export function reset() {
  const settings = S.settings; Object.assign(S, defaults(), { settings }); persist();
}
// Is er iets om verder mee te spelen? (duels, heitjes, klusjes of de opening gezien)
export function hasSave() {
  try { const raw = localStorage.getItem(KEY); if (!raw) return false; const o = JSON.parse(raw); return !!((o.flags && o.flags.intro_done) || o.totalEarned > 0 || Object.keys(o.jobs || {}).length > 0 || (o.arcade && o.arcade.plays > 0)); } catch (e) { return false; }
}
