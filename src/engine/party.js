// Spelersbeheer voor 2 of 3 spelers (Wes 0, Jor 1, Juul 2): wie doet mee, paren, "winnaar blijft", paar-statistieken.
import { S } from '../save.js';

export const playerCount = () => (S.settings.players === 3 ? 3 : 2);
export const activeIds = () => (playerCount() === 3 ? [0, 1, 2] : [0, 1]);
// Alle paren uit een lijst id's: [0,1,2] -> [[0,1],[0,2],[1,2]]
export const pairsOf = (ids = activeIds()) => ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b]));
export const chooseNames = (ids = activeIds()) => ids.map((i) => S.names[i]);
export const nameOf = (id) => S.names[id] || ['Wes', 'Jor', 'Juul'][id];
// Wie kijkt er toe als `pair` speelt?
export const spectators = (pair, ids = activeIds()) => ids.filter((i) => !pair.includes(i));
const pairKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// Paar-statistieken (S.arcade.pairs['a-b'] = { plays, draws, wins:[winsVanLaagsteId, winsVanHoogsteId] })
export function recordPair(a, b, winnerId) {
  const P = ((S.arcade ||= {}).pairs ||= {});
  const e = (P[pairKey(a, b)] ||= { plays: 0, draws: 0, wins: [0, 0] });
  e.plays++;
  if (winnerId == null) e.draws++; else e.wins[winnerId === Math.min(a, b) ? 0 : 1]++;
  return e;
}
export function pairStats(a, b) {
  const e = ((S.arcade && S.arcade.pairs) || {})[pairKey(a, b)] || { plays: 0, draws: 0, wins: [0, 0] };
  const lo = Math.min(a, b);
  return { plays: e.plays, draws: e.draws, winsA: e.wins[a === lo ? 0 : 1], winsB: e.wins[a === lo ? 1 : 0] };
}

// "Winnaar blijft": met 3 spelers speelt steeds één paar, de derde kijkt toe.
//   q.next()        -> huidig paar [a, b] (oplopend op id; blijft hetzelfde tot report())
//   q.report(winId) -> winnaar blijft, verliezer gaat achteraan de rij (bij gelijkspel/null gaat de uitdager weg)
//   q.pick(a, b)    -> handmatig paar kiezen (de rest wacht)
//   q.waiting()     -> wie kijkt toe;  q.champion / q.streak -> huidige winnaar en zijn reeks
// Bij 2 spelers is het paar altijd [0, 1]. maxStreak > 0: na zoveel winsten op rij moet de winnaar zitten.
export class DuelQueue {
  constructor(ids = activeIds(), { maxStreak = 0 } = {}) { this.maxStreak = maxStreak; this.reset(ids); }
  reset(ids = activeIds()) {
    this.ids = ids.slice(); this.champion = null; this.streak = 0;
    this.cur = this.ids.slice(0, 2); this.queue = this.ids.slice(2);
  }
  next() { return this.ids.length < 3 ? this.ids.slice(0, 2) : this.cur.slice().sort((a, b) => a - b); }
  waiting() { return this.ids.length < 3 ? [] : this.queue.slice(); }
  pick(a, b) {
    if (this.ids.length < 3) return this.next();
    if (a === b || !this.ids.includes(a) || !this.ids.includes(b)) return this.next();
    this.cur = [a, b]; this.queue = this.ids.filter((i) => i !== a && i !== b); this.champion = null; this.streak = 0;
    return this.next();
  }
  // winnerId: spelers-id van de winnaar, of null (gelijkspel)
  report(winnerId) {
    if (this.ids.length < 3) return this.next();
    const [x, y] = this.cur;
    let stay, leave;
    if (winnerId === x || winnerId === y) { stay = winnerId; leave = winnerId === x ? y : x; }
    else { stay = this.champion != null && this.cur.includes(this.champion) ? this.champion : x; leave = stay === x ? y : x; winnerId = null; }   // gelijkspel: uitdager stapt op
    this.streak = winnerId != null && this.champion === stay ? this.streak + 1 : winnerId != null ? 1 : 0;
    this.champion = winnerId != null ? stay : null;
    if (this.maxStreak > 0 && this.streak >= this.maxStreak) { this.queue.push(stay); const nx = this.queue.shift(); this.cur = [leave, nx]; this.champion = null; this.streak = 0; return this.next(); }
    this.queue.push(leave);
    const challenger = this.queue.shift();
    this.cur = [stay, challenger];
    return this.next();
  }
}

// Eén gedeelde wachtrij voor de hele sessie (werelden worden steeds opnieuw gebouwd); wordt vernieuwd als het aantal spelers wijzigt
let _q = null;
export function duelQueue() {
  const ids = activeIds();
  if (!_q || _q.ids.length !== ids.length) _q = new DuelQueue(ids);
  return _q;
}
export function resetDuelQueue() { _q = null; }
