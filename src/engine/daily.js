// Uitdaging van de dag: elke dag een vast duel met een vaste twist (voor iedereen gelijk), met bonus-heitjes en een reeks (streak)
import { S, persist } from '../save.js';
import { mulberry32 } from './util.js';
import { TWISTS } from './twist.js';

export const DAILY_BONUS = 60;
const pad = (n) => String(n).padStart(2, '0');
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => dstr(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dstr(d); };
const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
const D = () => (S.daily ||= { lastDone: '', streak: 0, total: 0 });

export const dailyDone = () => D().lastDone === today();
export const dailyStreak = () => { const d = D(); return (d.lastDone === today() || d.lastDone === yesterday()) ? d.streak : 0; };
export function dailyBonus() { const s = dailyStreak() + (dailyDone() ? 0 : 1); return DAILY_BONUS + Math.min(5, Math.max(0, s - 1)) * 10; }

// Het duel van vandaag: { date, id, twist } — games = app.games (id -> definitie)
export function dailyInfo(games) {
  const date = today();
  const off = S.arcade && S.arcade.excluded || [];
  const ids = Object.keys(games).filter((id) => games[id].mode === 'pvp' && !off.includes(id)).sort();
  if (!ids.length) return null;
  const rnd = mulberry32(hash(date));
  const id = ids[Math.floor(rnd() * ids.length)];
  const offT = (S.arcade && S.arcade.offTwists) || [];
  const allowed = (games[id].twists || TWISTS.map((t) => t.id)).filter((t) => t !== 'none' && !offT.includes(t) && (t !== 'deurman' || S.settings.scare > 0));
  const twist = allowed.length ? allowed[Math.floor(rnd() * allowed.length)] : 'none';
  return { date, id, twist };
}
// Aanroepen als het dagduel gespeeld is; geeft het bonusbedrag (of 0 als het vandaag al gedaan was)
export function completeDaily() {
  const d = D(); if (d.lastDone === today()) return 0;
  const bonus = dailyBonus();
  d.streak = d.lastDone === yesterday() ? d.streak + 1 : 1; d.lastDone = today(); d.total = (d.total || 0) + 1; persist();
  return bonus;
}
