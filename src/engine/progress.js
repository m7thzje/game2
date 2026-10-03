// Voortgang van de Speelhal: hallen ontgrendelen, rang en Deurman-stickers (contract voor alle onderdelen)
import { S, persist } from '../save.js';

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
