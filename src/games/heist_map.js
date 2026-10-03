// Plattegrond van het kasteel voor "Schatkamer-Overval": een 25x13 tegelraster, links/rechts gespiegeld.
// Alles wat met rekenen op het raster te maken heeft (botsing, zicht, paden) staat hier; geen THREE.

export const TILE = 2.1, W = 25, H = 13;
export const OX = -(W * TILE) / 2, OZ = -(H * TILE) / 2;          // wereldhoek linksboven
export const tx = (c) => OX + (c + 0.5) * TILE;                     // tegel -> wereld (midden)
export const tz = (r) => OZ + (r + 0.5) * TILE;
export const cx_ = (x) => Math.floor((x - OX) / TILE);              // wereld -> tegel
export const cz_ = (z) => Math.floor((z - OZ) / TILE);

// waarden per kist-soort
export const CHEST_KINDS = {
  c: { val: 25, hold: 0.6, name: 'kistje' },
  C: { val: 60, hold: 0.9, name: 'schatkist' },
  G: { val: 90, hold: 1.1, name: 'drakenkist' },
  M: { val: 100, hold: 1.0, name: 'midden-kist' },
  K: { val: 150, hold: 1.5, name: 'kroon' },
};

export function buildMap() {
  const ch = Array.from({ length: H }, () => Array(W).fill('#'));
  const floor = (c, r, f = '.') => { if (c >= 0 && c < W && r >= 0 && r < H) ch[r][c] = f; };
  const rect = (c0, r0, c1, r1) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) floor(c, r); };
  const mirror = (c) => W - 1 - c;
  // 3x3-kamers: cel (j,i) -> tegels 4j+1..4j+3, 4i+1..4i+3
  for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) rect(4 * j + 1, 4 * i + 1, 4 * j + 3, 4 * i + 3);
  // brede middenzalen (draken-hol, kroonkamer, laser-galerij): midden-muur weg
  for (const i of [0, 1, 2]) rect(9, 4 * i + 1, 15, 4 * i + 3);
  // deuren (links; spiegel automatisch)
  const doorsL = [[4, 2], [8, 2], [4, 6], [8, 6], [4, 10], [8, 10], [2, 4], [2, 8], [6, 4], [6, 8], [10, 8]];
  const doors = [];
  for (const [c, r] of doorsL) for (const cc of [c, mirror(c)]) { floor(cc, r); doors.push([cc, r]); }
  // pilaren, kisten, lasers, luik (links; spiegel)
  const feat = (c, r, f) => { floor(c, r, f); if (mirror(c) !== c) floor(mirror(c), r, f); };
  const pillars = [[6, 2], [6, 6], [6, 10], [10, 5], [10, 7]];
  for (const [c, r] of pillars) feat(c, r, 'P');
  const chestsL = [[1, 1, 'c'], [3, 3, 'c'], [6, 1, 'C'], [9, 1, 'G'], [9, 3, 'G'], [6, 11, 'C'], [1, 11, 'c'], [3, 9, 'c'], [10, 11, 'c']];
  for (const [c, r, k] of chestsL) feat(c, r, k);
  feat(12, 11, 'M');                      // midden-kist (gedeeld)
  feat(12, 6, 'K');                       // kroon
  feat(12, 2, 'D');                       // draak
  for (const [c, r] of [[8, 10], [10, 8]]) feat(c, r, 'l');   // lasers in deuropeningen
  feat(1, 6, 'a');                        // ontsnappingsluik (links = Wes, rechts = Jor)
  // lijsten uitlezen
  const solid = new Uint8Array(W * H);
  const chests = [], lasers = [], hatches = [], pillarList = [];
  let crown = null, dragon = null;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const f = ch[r][c];
    if (f === '#' || f === 'P') solid[r * W + c] = 1;
    if (f === 'P') pillarList.push([c, r]);
    if (f === 'c' || f === 'C' || f === 'G' || f === 'M') chests.push({ c, r, kind: f, side: c < 12 ? 0 : c > 12 ? 1 : -1 });
    if (f === 'K') crown = { c, r, kind: 'K', side: -1 };
    if (f === 'D') dragon = { c, r };
    if (f === 'l') {
      const horiz = ch[r][c - 1] !== '#' && ch[r][c + 1] !== '#' && ch[r][c - 1] !== 'P' && ch[r][c + 1] !== 'P';
      lasers.push({ c, r, horiz, phase: (c * 0.37 + r * 0.61) % 3 });  // horiz: gang loopt links-rechts, straal loopt voor-achter
    }
    if (f === 'a') hatches.push({ c, r, side: c < 12 ? 0 : 1 });
  }
  if (crown) chests.push(crown);
  hatches.sort((a, b) => a.side - b.side);
  // patrouilleroutes (links; rechts gespiegeld). Midden-routes zijn zelf symmetrisch.
  const mir = (route) => route.map(([c, r]) => [mirror(c), r]);
  const routes = {
    knightL: [[2, 2], [7, 1], [7, 3], [6, 5], [5, 5], [5, 3]],
    knightL2: [[2, 10], [7, 11], [7, 9], [6, 7], [5, 7], [5, 9]],
    dogL: [[5, 6], [9, 6], [9, 5], [7, 7]],
    captain: [[10, 6], [12, 5], [14, 6], [12, 7]],
  };
  const guards = [
    { type: 'knight', side: 0, route: routes.knightL }, { type: 'knight', side: 1, route: mir(routes.knightL) },
    { type: 'knight', side: 0, route: routes.knightL2 }, { type: 'knight', side: 1, route: mir(routes.knightL2) },
    { type: 'dog', side: 0, route: routes.dogL }, { type: 'dog', side: 1, route: mir(routes.dogL) },
    { type: 'captain', side: -1, route: routes.captain },
  ];
  const M = { ch, solid, chests, lasers, hatches, pillars: pillarList, crown, dragon, doors, guards };
  return M;
}

// ---------- raster-hulpfuncties ----------
export const isSolidC = (M, c, r) => c < 0 || r < 0 || c >= W || r >= H || M.solid[r * W + c] === 1;
export const isSolidW = (M, x, z) => isSolidC(M, cx_(x), cz_(z));

// is er een vrije lijn tussen twee punten? (stapjes van 0.3)
export function los(M, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.3);
  for (let k = 1; k < n; k++) { const t = k / n; if (isSolidW(M, x0 + dx * t, z0 + dz * t)) return false; }
  return true;
}
// afstand tot de eerste muur langs een straal (max `max`)
export function rayDist(M, x, z, dx, dz, max, step = 0.25) {
  for (let d = step; d < max; d += step) if (isSolidW(M, x + dx * d, z + dz * d)) return d - step * 0.5;
  return max;
}
// cirkel (x,z,R) uit de muren duwen; werkt `p` ({x,z}) bij; retourneert true als er geduwd is
export function pushOut(M, p, R) {
  let hit = false;
  for (let it = 0; it < 2; it++) {
    const c0 = cx_(p.x), r0 = cz_(p.z);
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (!isSolidC(M, c, r)) continue;
      const x0 = OX + c * TILE, z0 = OZ + r * TILE, x1 = x0 + TILE, z1 = z0 + TILE;
      const qx = Math.max(x0, Math.min(x1, p.x)), qz = Math.max(z0, Math.min(z1, p.z));
      let dx = p.x - qx, dz = p.z - qz; const d2 = dx * dx + dz * dz;
      if (d2 >= R * R) continue;
      hit = true;
      if (d2 < 1e-9) { // middelpunt in de tegel: naar de dichtstbijzijnde rand
        const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z, m = Math.min(l, rr, t, b);
        if (m === l) p.x = x0 - R; else if (m === rr) p.x = x1 + R; else if (m === t) p.z = z0 - R; else p.z = z1 + R;
      } else { const d = Math.sqrt(d2); p.x = qx + dx / d * R; p.z = qz + dz / d * R; }
    }
  }
  return hit;
}

// BFS-afstandsveld vanaf een doeltegel (4-richtingen); -1 = onbereikbaar
export function bfsField(M, gc, gr, out) {
  const f = out || new Int16Array(W * H); f.fill(-1);
  if (isSolidC(M, gc, gr)) return f;
  const q = new Int16Array(W * H); let h = 0, t = 0; q[t++] = gr * W + gc; f[gr * W + gc] = 0;
  while (h < t) {
    const i = q[h++], c = i % W, r = (i / W) | 0, d = f[i] + 1;
    if (c > 0 && f[i - 1] < 0 && !M.solid[i - 1]) { f[i - 1] = d; q[t++] = i - 1; }
    if (c < W - 1 && f[i + 1] < 0 && !M.solid[i + 1]) { f[i + 1] = d; q[t++] = i + 1; }
    if (r > 0 && f[i - W] < 0 && !M.solid[i - W]) { f[i - W] = d; q[t++] = i - W; }
    if (r < H - 1 && f[i + W] < 0 && !M.solid[i + W]) { f[i + W] = d; q[t++] = i + W; }
  }
  return f;
}
// volgende tegel richting het doel volgens het veld
export function stepDir(f, c, r) {
  const here = f[r * W + c]; if (here <= 0) return null;
  let best = null, bd = here;
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= W || nr >= H) continue; const d = f[nr * W + nc]; if (d >= 0 && d < bd) { bd = d; best = [nc, nr]; } }
  return best;
}
