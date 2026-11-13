// Spelersbeheer voor 2, 3 of 4 spelers (Wes 0, Jor 1, Juul 2, Sam 3): wie doet mee, paren, "winnaar blijft", knock-out (Bracket), paar-statistieken.
import { S } from '../save.js';

export const playerCount = () => { const n = S.settings.players; return n >= 4 ? 4 : n === 3 ? 3 : 2; };
export const activeIds = () => [0, 1, 2, 3].slice(0, playerCount());
// Alle paren uit een lijst id's: [0,1,2] -> [[0,1],[0,2],[1,2]]
export const pairsOf = (ids = activeIds()) => ids.flatMap((a, i) => ids.slice(i + 1).map((b) => [a, b]));
export const chooseNames = (ids = activeIds()) => ids.map((i) => S.names[i]);
export const nameOf = (id) => S.names[id] || ['Wes', 'Jor', 'Juul', 'Sam'][id];
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

// "Winnaar blijft": met 3 of 4 spelers speelt steeds één paar, de anderen kijken toe (wachtrij).
//   q.next()        -> huidig paar [a, b] (oplopend op id; blijft hetzelfde tot report())
//   q.report(winId) -> winnaar blijft, verliezer gaat achteraan de rij (bij gelijkspel/null gaat de uitdager weg)
//   q.pick(a, b)    -> handmatig paar kiezen (de rest wacht)
//   q.waiting()     -> wie kijkt toe;  q.champion / q.streak -> huidige winnaar en zijn reeks
// Bij 2 spelers is het paar altijd [0, 1]; bij 4 spelers spelen twee spelers en wachten er twee (verliezer gaat achteraan). maxStreak > 0: na zoveel winsten op rij moet de winnaar zitten.
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

// ---------------------------------------------------------------------------------------------------------------------
// Knock-out voor 2, 3 of 4 spelers met 1-tegen-1-spellen.
//   const b = new Bracket(ids, { seed, shuffle = true, thirdPlace = false, maxDraws = 2 });
//   b.round()         -> { name, kind: 'semi'|'third'|'final', pair: [a, b], no, of, waiting: [ids], replay } of null als klaar
//                         name: 'Halve finale 1/2', 'Halve finale 2/2' (bij 3 spelers: 'Halve finale'), 'Troostfinale', 'Finale'
//   b.report(winId)   -> verwerkt de uitslag van de huidige ronde, geeft de volgende b.round() (of null). null = gelijkspel:
//                         dezelfde ronde nog eens (replay = aantal gelijkspellen); na maxDraws gelijkspellen beslist een (geseede) muntworp.
//   b.done            -> true zodra alle rondes gespeeld zijn;  b.champion -> id van de winnaar (na afloop, anders null)
//   b.standings()     -> spelers-id's van 1e plaats naar laatste (altijd alle deelnemers; bij nog niet klaar: voorlopig op voortgang)
//   b.label()         -> tekst voor de intro: 'Halve finale 1/2: Wes – Jor'  (klaar: 'Winnaar: Wes')
//   b.results         -> [{ name, kind, pair, winner, loser, draws, coin }] van afgeronde rondes;  b.order = geschudde volgorde
// 4 spelers: 2 halve finales -> (optioneel Troostfinale tussen de verliezers) -> Finale. Zonder troostfinale delen de twee verliezers
// van de halve finales de 3e plek (b.standings() zet ze dan op volgorde van de halve finales).
// 3 spelers: één speler krijgt een bye (in de seed-volgorde de laatste): halve finale tussen de andere twee, dan finale tegen de bye-speler.
// 2 spelers: alleen een Finale.
export class Bracket {
  constructor(ids = activeIds(), { seed = Date.now(), shuffle = true, thirdPlace = false, maxDraws = 2 } = {}) {
    this.rng = rngOf(seed); this.seed = seed; this.maxDraws = maxDraws;
    const order = ids.slice(0, 4);
    if (shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    this.order = order; this.n = order.length;
    this.points = {}; order.forEach((id) => { this.points[id] = 0; });
    this.results = []; this.idx = 0; this.draws = 0; this.semiW = []; this.semiL = []; this.bye = null;
    const M = (kind, name, pair) => ({ kind, name, pair });
    if (this.n >= 4) this.matches = [M('semi', 'Halve finale 1/2', [order[0], order[1]]), M('semi', 'Halve finale 2/2', [order[2], order[3]]), ...(thirdPlace ? [M('third', 'Troostfinale', null)] : []), M('final', 'Finale', null)];
    else if (this.n === 3) { this.bye = order[2]; this.points[this.bye] += 2; this.semiW.push(this.bye); this.matches = [M('semi', 'Halve finale', [order[0], order[1]]), M('final', 'Finale', null)]; }
    else this.matches = [M('final', 'Finale', [order[0], order[1]])];
    this.thirdPlace = !!thirdPlace && this.n >= 4;
  }
  get done() { return this.idx >= this.matches.length; }
  get champion() { return this.done ? this.standings()[0] : null; }
  _prepare() {   // pair van troost-/finale invullen zodra de halve finales klaar zijn
    const m = this.matches[this.idx]; if (!m || m.pair) return m;
    m.pair = m.kind === 'third' ? this.semiL.slice(0, 2) : this.n === 3 ? [this.semiW[1], this.semiW[0]] : this.semiW.slice(0, 2);   // 3 spelers: semi-winnaar tegen de bye
    return m;
  }
  round() {
    const m = this._prepare(); if (!m) return null;
    return { name: m.name, kind: m.kind, pair: m.pair.slice(), no: this.idx + 1, of: this.matches.length, waiting: this.order.filter((id) => !m.pair.includes(id)), replay: this.draws };
  }
  report(winnerId) {
    const m = this._prepare(); if (!m) return null;
    let coin = false;
    if (winnerId == null || !m.pair.includes(winnerId)) {
      this.draws++;
      if (this.draws <= this.maxDraws) return this.round();   // gelijkspel: nog een keer
      winnerId = m.pair[this.rng() < 0.5 ? 0 : 1]; coin = true;   // te vaak gelijk: muntworp
    }
    const loser = m.pair[0] === winnerId ? m.pair[1] : m.pair[0];
    this.results.push({ name: m.name, kind: m.kind, pair: m.pair.slice(), winner: winnerId, loser, draws: this.draws, coin });
    if (m.kind === 'semi') { this.points[winnerId] += 2; this.semiW.push(winnerId); this.semiL.push(loser); }
    else if (m.kind === 'third') this.points[winnerId] += 1;
    else this.points[winnerId] += 4;
    this.draws = 0; this.idx++;
    return this.round();
  }
  standings() { return this.order.map((id, i) => [id, i]).sort((a, b) => this.points[b[0]] - this.points[a[0]] || a[1] - b[1]).map((x) => x[0]); }
  label() {
    const r = this.round(); if (!r) return `Winnaar: ${nameOf(this.champion)}`;
    return `${r.name}: ${nameOf(r.pair[0])} – ${nameOf(r.pair[1])}`;
  }
}
function rngOf(seed) {   // mulberry32 (hier zelf, zodat party.js geen three.js nodig heeft)
  let a = (typeof seed === 'number' ? seed : 1) >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------------------------------------------------------------------------------------------------------------------
// Hulpjes voor werelden (hal, toernooi, bord) die een spel moeten starten met het juiste aantal spelers.
//   supports(def, n)       -> kan het spel met n spelers? (def.players, standaard [2])
//   playBadge(def)         -> label voor de kast: '👥 2-4' | '👥 4' | '👥 2-3' | '👥 3' | '🏆 knock-out' (geen 4-speler-modus)
//   playPlan(def, ids)     -> hoe speel je dit spel met ids (de spelers die aan tafel zitten):
//        { mode: 'all',     ids, size }       alle ids spelen mee (n wordt door def.players ondersteund)
//        { mode: 'queue',   ids, size: 2 }    3 spelers, 1-tegen-1-spel: 'winnaar blijft' (DuelQueue)
//        { mode: 'bracket', ids, size: 2 }    4 spelers, spel kent 2 maar niet 4: Bracket (halve finales + finale)
//        { mode: 'subset',  ids, size: 3 }    4 spelers, spel kent alleen 3: drie spelen, de vierde wacht (wissel per potje)
//        { mode: 'unsupported', ids }         spel kan niet met zo weinig spelers (bijv. alleen-3 met 2 spelers)
//   splitTeams(n, rng)     -> teamindeling in SLOTS voor extra.teams: n=4 -> [[0,1],[2,3]] (willekeurig verdeeld met rng), anders null
export const supports = (def, n) => (Array.isArray(def.players) ? def.players : [2]).includes(n);
export function playBadge(def) {
  const sizes = (Array.isArray(def.players) ? def.players : [2]).filter((k) => k >= 2 && k <= 4);
  if (sizes.includes(4)) return sizes.length === 1 ? '👥 4' : `👥 ${Math.min(...sizes)}-4`;
  return '🏆 knock-out';
}
export function playPlan(def, ids = activeIds()) {
  const sizes = (Array.isArray(def.players) ? def.players : [2]), n = ids.length;
  if (sizes.includes(n)) return { mode: 'all', ids: ids.slice(), size: n };
  if (n === 4 && sizes.includes(2)) return { mode: 'bracket', ids: ids.slice(), size: 2 };
  const fit = sizes.filter((k) => k < n).sort((a, b) => b - a)[0];   // grootste ondersteunde groep die in n past
  if (!fit) return { mode: 'unsupported', ids: ids.slice() };
  return { mode: fit === n - 1 && n === 4 ? 'subset' : 'queue', ids: ids.slice(), size: fit };
}
export function splitTeams(n = 4, rng = Math.random) {
  if (n !== 4) return null;
  const slots = [0, 1, 2, 3]; for (let i = 3; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  return [[slots[0], slots[1]].sort(), [slots[2], slots[3]].sort()].sort((a, b) => a[0] - b[0]);
}

// Eén gedeelde wachtrij voor de hele sessie (werelden worden steeds opnieuw gebouwd); wordt vernieuwd als het aantal spelers wijzigt
let _q = null;
export function duelQueue() {
  const ids = activeIds();
  if (!_q || _q.ids.length !== ids.length) _q = new DuelQueue(ids);
  return _q;
}
export function resetDuelQueue() { _q = null; }
