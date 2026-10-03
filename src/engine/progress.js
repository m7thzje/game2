// Voortgang van de Speelhal: hallen ontgrendelen, rang en Deurman-stickers (contract voor alle onderdelen)
import { S, persist } from '../save.js';
import { ARCADE_HALLS } from '../games/index.js';

// Kosten (heitjes) om een hal te laten bouwen. 4 = geheime Deurenhal: opent na Deurman-stickers.
export const HALL_COST = { 0: 0, 1: 150, 2: 300, 3: 450, 4: 0 };
export const HALL_NAMES = ['Speelhal', 'Neonkelder', 'Kermis', 'Sporthal', 'Deurenhal'];
export const DEUR_HALL_STICKERS = 6;   // aantal Deurman-stickers voor de geheime Deurenhal

const A = () => (S.arcade ||= { wins: [0, 0], draws: 0, plays: 0, byGame: {}, tourneys: [0, 0] });
export const unlockedHalls = () => (A().unlocked ||= [0]);
export const stickers = () => ((S.deur ||= { stickers: [], cameos: 0 }).stickers ||= []);
export function isUnlocked(id) {
  if (id === 0 || S.settings.unlockAll) return true;
  if (id === 4) return unlockedHalls().includes(4) || stickers().length >= DEUR_HALL_STICKERS;
  return unlockedHalls().includes(id);
}
export function canAfford(id) { return S.coins >= (HALL_COST[id] || 0); }
export function unlockHall(id) {   // betaalt en ontgrendelt; geeft true bij succes
  if (isUnlocked(id)) return true; const c = HALL_COST[id] || 0; if (S.coins < c) return false;
  S.coins -= c; unlockedHalls().push(id); persist(); return true;
}
export function addSticker(id) { const s = stickers(); if (s.includes(id)) return false; s.push(id); persist(); return true; }

// Rang: punten uit duels, winst, toernooien, dagduel, verjaagde Deurman
export const RANKS = [
  { name: 'Nieuwkomer', at: 0, icon: '🌱' }, { name: 'Speler', at: 8, icon: '🎮' }, { name: 'Duelist', at: 25, icon: '⚔️' }, { name: 'Kampioen', at: 60, icon: '🏅' },
  { name: 'Meester', at: 120, icon: '🏆' }, { name: 'Speelhal-Legende', at: 220, icon: '👑' },
];
export function points() {
  const a = A(); return a.plays + (a.wins[0] + a.wins[1]) + (a.tourneys[0] + a.tourneys[1]) * 8 + ((S.daily && S.daily.total) || 0) * 3 + (S.banished || 0) * 3 + Object.keys(S.jobs || {}).length;
}
export function rank() { const p = points(); let r = RANKS[0], i = 0; RANKS.forEach((x, k) => { if (p >= x.at) { r = x; i = k; } }); return { ...r, index: i, points: p, next: RANKS[i + 1] || null }; }

// ---- hulpjes voor de Speelhal (hallen bouwen, rangbalk, spelfilter) ----
export const hallExists = (id) => ARCADE_HALLS.some((x) => x.id === id);
// id's van alle spellen in ontgrendelde hallen (met unlockAll: alles)
export const unlockedIds = () => ARCADE_HALLS.filter((x) => isUnlocked(x.id)).flatMap((x) => x.ids);
// Volgende te bouwen hal die al bestaat (geheime hal 4 telt niet mee), of null
export const nextHall = () => { const l = ARCADE_HALLS.map((x) => x.id).filter((id) => id !== 4 && !isUnlocked(id)).sort((a, b) => HALL_COST[a] - HALL_COST[b]); return l.length ? l[0] : null; };
// 'built' | 'building' (kan gebouwd worden) | 'secret' (nog onbekend/geheim)
export function hallStatus(id) { if (isUnlocked(id) && hallExists(id)) return 'built'; if (hallExists(id) && id !== 4) return 'building'; return 'secret'; }
// Voortgang binnen de huidige rang, 0..1
export function rankFrac() { const r = rank(); return r.next ? Math.max(0, Math.min(1, (r.points - r.at) / (r.next.at - r.at))) : 1; }
// Rang gestegen sinds de vorige keer? Geeft de nieuwe rang terug (en onthoudt hem), anders null
export function rankUp() { const a = A(); const r = rank(); if (a.rankSeen == null) { a.rankSeen = r.index; return null; } if (r.index > a.rankSeen) { a.rankSeen = r.index; persist(); return r; } a.rankSeen = Math.max(a.rankSeen, r.index); return null; }
