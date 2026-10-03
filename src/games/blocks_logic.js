// Spelregels van "Blokkenstrijd": puur rekenwerk, geen Three.js (zodat het ook in node te testen is).
// Het speelveld is een raster H rijen (0 = bovenste rij) x W kolommen met gehele getallen: 0 leeg, 1-7 vormen, 8 rommel, 9 kippen-goud, 10 regenboog.
export const W = 10, H = 16;
export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const TYPE_ID = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
export const GARB = 8, GOLD = 9, RAINBOW = 10;

// basisvormen in een n x n doosje (y naar beneden)
const BASE = {
  I: [4, [[0, 1], [1, 1], [2, 1], [3, 1]]],
  O: [2, [[0, 0], [1, 0], [0, 1], [1, 1]]],
  T: [3, [[1, 0], [0, 1], [1, 1], [2, 1]]],
  S: [3, [[1, 0], [2, 0], [0, 1], [1, 1]]],
  Z: [3, [[0, 0], [1, 0], [1, 1], [2, 1]]],
  J: [3, [[0, 0], [0, 1], [1, 1], [2, 1]]],
  L: [3, [[2, 0], [0, 1], [1, 1], [2, 1]]],
};
// 4 rotaties per vorm (rechtsom); de volgorde van de 4 cellen blijft gelijk, zodat een 'speciale cel' meedraait
export const ROT = {};
for (const t of TYPES) {
  const [n, cells] = BASE[t]; const rs = [cells];
  for (let r = 1; r < 4; r++) rs.push(t === 'O' ? cells : rs[r - 1].map(([x, y]) => [n - 1 - y, x]));
  ROT[t] = rs;
}
export const emptyGrid = () => Array.from({ length: H }, () => new Array(W).fill(0));
export const cloneGrid = (g) => g.map((r) => r.slice());

// Een stuk: { t, r, x, y, kind, sp, chicken }
export function newPiece(def) {
  const p = { t: def.t, r: 0, x: 3, y: def.t === 'I' ? -1 : 0, kind: def.pow || null, sp: def.sp ?? -1, chicken: !!def.chicken };
  if (def.t === 'O') p.x = 4;
  return p;
}
export const cellsOf = (p) => ROT[p.t][p.r];
export function collides(grid, t, r, x, y) {
  for (const [cx, cy] of ROT[t][r]) {
    const gx = x + cx, gy = y + cy;
    if (gx < 0 || gx >= W || gy >= H) return true;
    if (gy >= 0 && grid[gy][gx]) return true;
  }
  return false;
}
export const pieceFits = (grid, p) => !collides(grid, p.t, p.r, p.x, p.y);
export function tryMove(grid, p, dx, dy) { if (collides(grid, p.t, p.r, p.x + dx, p.y + dy)) return false; p.x += dx; p.y += dy; return true; }
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1]];
export function tryRotate(grid, p, dir = 1) {
  if (p.t === 'O') return true;
  const nr = (p.r + dir + 4) % 4;
  for (const [kx, ky] of KICKS) if (!collides(grid, p.t, nr, p.x + kx, p.y + ky)) { p.r = nr; p.x += kx; p.y += ky; return true; }
  return false;
}
export function dropDistance(grid, p) { let d = 0; while (!collides(grid, p.t, p.r, p.x, p.y + d + 1)) d++; return d; }
// schrijft het stuk in het raster; geeft [{x,y,v,i}] van de neergezette cellen
export function lockPiece(grid, p) {
  const out = []; const v = TYPE_ID[p.t];
  cellsOf(p).forEach(([cx, cy], i) => {
    const gx = p.x + cx, gy = p.y + cy; if (gy < 0) return;
    const val = p.chicken ? GOLD : v; grid[gy][gx] = val; out.push({ x: gx, y: gy, v: val, i });
  });
  return out;
}
export const fullRows = (grid) => { const r = []; for (let y = 0; y < H; y++) if (grid[y].every((c) => c)) r.push(y); return r; };
// verwijdert de rijen en schuift de rest omlaag; geeft per overgebleven rij de verschuiving (voor animatie)
export function clearRows(grid, rows) {
  const set = new Set(rows); const shift = new Array(H).fill(0); const kept = [];
  for (let y = 0; y < H; y++) if (!set.has(y)) kept.push(y);
  const below = (y) => rows.filter((r) => r > y).length;
  const out = Array.from({ length: rows.length }, () => new Array(W).fill(0));
  const newGrid = out.concat(kept.map((y) => grid[y]));
  for (let y = 0; y < H; y++) grid[y] = newGrid[y];
  kept.forEach((y) => { shift[y + below(y)] = below(y); });
  return shift;      // shift[nieuweRij] = aantal rijen dat de cellen zijn gevallen
}
// n rommelrijen onderaan (met één gat); geeft false als de bovenkant daardoor overloopt (= vol)
export function addGarbage(grid, n, hole) {
  let ok = true;
  for (let y = 0; y < n; y++) if (grid[y].some((c) => c)) ok = false;
  for (let k = 0; k < n; k++) { grid.shift(); const row = new Array(W).fill(GARB); row[hole] = 0; grid.push(row); }
  return ok;
}
export const colHeights = (grid) => { const h = new Array(W).fill(0); for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (grid[y][x]) { h[x] = H - y; break; } return h; };
export const maxHeight = (grid) => Math.max(...colHeights(grid));
export const filledCount = (grid) => grid.reduce((a, r) => a + r.filter((c) => c).length, 0);

// punten voor lijnen (1..4)
export const LINE_PTS = [0, 100, 300, 500, 800];
// rommelrijen die je verstuurt: 1 lijn = 0, 2 = 1, 3 = 2, 4 = 4 (+1 bij een lange combo)
export const garbageFor = (lines, combo) => (lines >= 4 ? 4 : lines === 3 ? 2 : lines === 2 ? 1 : 0) + (lines > 0 && combo >= 3 ? 1 : 0);

// Gedeelde stukkenreeks (7-bag + af en toe een power-blok), voor beide spelers dezelfde volgorde
export class Sequence {
  constructor(rng) { this.rng = rng; this.list = []; this.bag = []; this.sincePow = 0; }
  _fill() {
    while (this.bag.length === 0) { const b = TYPES.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } this.bag = b; }
    const t = this.bag.pop(); const def = { t };
    this.sincePow++;
    if (this.list.length > 5 && this.sincePow >= 6 && this.rng() < 0.2) {
      const r = this.rng(); def.pow = r < 0.38 ? 'bomb' : r < 0.68 ? 'freeze' : 'rainbow'; def.sp = Math.floor(this.rng() * 4); this.sincePow = 0;
    }
    this.list.push(def);
  }
  get(k) { while (this.list.length <= k) this._fill(); return this.list[k]; }
}

// ---- hulpjes voor de bots in de tests (simpele AI, geen onderdeel van het spel) ----
export function aiPlan(grid, piece, skill = 1, rnd = Math.random) {
  let best = null;
  for (let r = 0; r < (piece.t === 'O' ? 1 : 4); r++) {
    for (let x = -3; x < W; x++) {
      if (collides(grid, piece.t, r, x, piece.y)) continue;
      let y = piece.y; while (!collides(grid, piece.t, r, x, y + 1)) y++;
      const g = cloneGrid(grid); const tmp = { t: piece.t, r, x, y, chicken: false }; lockPiece(g, tmp);
      const rows = fullRows(g); const nl = rows.length; if (nl) clearRows(g, rows);
      const hs = colHeights(g); let holes = 0, bump = 0, agg = 0;
      for (let cx = 0; cx < W; cx++) { agg += hs[cx]; if (cx) bump += Math.abs(hs[cx] - hs[cx - 1]); let seen = false; for (let cy = 0; cy < H; cy++) { if (g[cy][cx]) seen = true; else if (seen) holes++; } }
      const score = -0.51 * agg + 0.76 * nl * 3 - 0.36 * holes * 2 - 0.18 * bump + (rnd() - 0.5) * (1 - skill) * 6;
      if (!best || score > best.score) best = { r, x, score };
    }
  }
  return best;
}
