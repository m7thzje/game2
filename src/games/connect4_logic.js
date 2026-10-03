// Pure spellogica van "Vier op een Rij: Drakenmunten" (geen THREE, dus testbaar in node).
// Bord = per kolom een stapel munten (onderaan eerst). Een munt is { id, o: eigenaar 0|1, c, r }.
export const COLS = 7, ROWS = 6;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

export class Board {
  // c0/nc/nr: speelbare deel (sudden-death-mini-bord: 5 kolommen x 4 rijen, rest is steen); need = lengte van de winnende rij
  constructor(cols = COLS, rows = ROWS, need = 4, c0 = 0, nc = cols, nr = rows) {
    this.cols = cols; this.rows = rows; this.need = need; this.nextId = 1;
    this.g = Array.from({ length: cols }, () => []);
    this.cap = Array.from({ length: cols }, (_, c) => (c >= c0 && c < c0 + nc ? nr : 0));
  }
  get(c, r) { return (this.g[c] && this.g[c][r]) || null; }
  h(c) { return this.g[c].length; }
  canDrop(c) { return c >= 0 && c < this.cols && this.g[c].length < this.cap[c]; }
  legal() { const o = []; for (let c = 0; c < this.cols; c++) if (this.canDrop(c)) o.push(c); return o; }
  full() { return this.legal().length === 0; }
  count() { let n = 0; for (const s of this.g) n += s.length; return n; }
  all() { const o = []; for (const s of this.g) for (const k of s) o.push(k); return o; }
  drop(c, o) { const k = { id: this.nextId++, o, c, r: this.g[c].length }; this.g[c].push(k); return k; }
  top(c) { const s = this.g[c]; return s.length ? s[s.length - 1] : null; }
  // zet c/r van alle munten weer goed na verwijderen/draaien; geeft de munten terug die verschoven zijn
  reindex() {
    const moved = [];
    for (let c = 0; c < this.cols; c++) this.g[c].forEach((k, r) => { if (k.c !== c || k.r !== r) { k.pc = k.c; k.pr = k.r; k.c = c; k.r = r; moved.push(k); } });
    return moved;
  }
  // lengte van de rij door (c,r) voor eigenaar o (de cel mag leeg zijn: dan telt hij als een munt van o)
  runThrough(c, r, o) {
    let best = 0;
    for (const [dx, dy] of DIRS) {
      let n = 1;
      for (const s of [1, -1]) { let x = c + dx * s, y = r + dy * s; while (true) { const k = this.get(x, y); if (!k || k.o !== o) break; n++; x += dx * s; y += dy * s; } }
      if (n > best) best = n;
    }
    return best;
  }
  // zou een munt van o in kolom c meteen winnen?
  wins(c, o) { return this.canDrop(c) && this.runThrough(c, this.g[c].length, o) >= this.need; }
  // alle munten die in een rij van minstens `need` van eigenaar o zitten, per rij: [[munt,...], ...]
  lines(o) {
    const out = [];
    for (const k of this.all()) {
      if (k.o !== o) continue;
      for (const [dx, dy] of DIRS) {
        const p = this.get(k.c - dx, k.r - dy); if (p && p.o === o) continue;      // alleen vanaf het begin van een rij
        const run = [k]; let x = k.c + dx, y = k.r + dy, q;
        while ((q = this.get(x, y)) && q.o === o) { run.push(q); x += dx; y += dy; }
        if (run.length >= this.need) out.push(run);
      }
    }
    return out;
  }
  // beste (langste) open rij van o, voor "bijna-vier"-reacties van de poppetjes
  best(o) { let b = 0; for (const k of this.all()) if (k.o === o) b = Math.max(b, this.runThrough(k.c, k.r, o)); return b; }
  remove(c, r) { return this.g[c].splice(r, 1)[0]; }
  // bom: valt in kolom c, ploft op de plek waar hij landt en ruimt de 8 buurvakken op. Munten erboven zakken.
  bomb(c) {
    const r = this.g[c].length, gone = [];
    for (let x = c - 1; x <= c + 1; x++) for (let y = r + 1; y >= r - 1; y--) {
      if (x < 0 || x >= this.cols || (x === c && y === r)) continue;
      if (this.get(x, y)) gone.push(this.remove(x, y));
    }
    return { r, gone, moved: this.reindex() };
  }
  // dief: pak de bovenste munt van kolom c als die van de tegenstander is
  steal(c, me) { const t = this.top(c); if (!t || t.o === me) return null; this.g[c].pop(); return t; }
  // bord 180 graden gedraaid: kolommen gespiegeld, stapels omgekeerd (en dan vallen de munten weer omlaag)
  flip() {
    const ng = Array.from({ length: this.cols }, () => []);
    for (let c = 0; c < this.cols; c++) ng[this.cols - 1 - c] = this.g[c].slice().reverse();
    this.g = ng;
    const cap = this.cap.slice().reverse(); this.cap = cap;
    return this.reindex();
  }
}

// Autopilot: win als het kan, blokkeer anders, geef de ander geen winst op een presenteerblaadje, voorkeur voor het midden.
export function autoPick(b, me, rnd = Math.random, open = (c) => b.canDrop(c)) {
  const L = b.legal().filter(open);
  if (!L.length) return -1;
  for (const c of L) if (b.wins(c, me)) return c;
  for (const c of L) if (b.wins(c, 1 - me)) return c;
  const safe = L.filter((c) => { b.drop(c, me); const bad = b.wins(c, 1 - me); b.g[c].pop(); b.nextId--; return !bad; });
  const pool = safe.length ? safe : L;
  const mid = (b.cols - 1) / 2;
  const w = pool.map((c) => 1 + (mid - Math.abs(c - mid)) * 1.2 + (b.runThrough(c, b.h(c), me) - 1) * 1.5);
  let s = rnd() * w.reduce((a, v) => a + v, 0);
  for (let i = 0; i < pool.length; i++) { s -= w[i]; if (s <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
