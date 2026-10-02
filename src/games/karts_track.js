// Kasteel-Kartrace: het circuit (pure wiskunde, geen THREE) + zoekfuncties.
// Het circuit is een "kantelen"-lus (als een kasteelmuur) van ca. 58 x 32 eenheden met afgeronde hoeken.

export const HALF_W = 3.4;      // halve wegbreedte
export const WALL_M = 2.5;      // gras-marge tussen weg en heg (de heg is een zachte muur)

// hoekpunten [x, z, straal]; de lus loopt "rechtsom" gezien vanaf boven (startrechte: onderaan, naar rechts)
const CORNERS = [
  [-29, 16, 6], [0, 16, 5], [0, 4, 5], [12, 4, 5], [12, 16, 5], [29, 16, 6], [25, 1, 9], [29, -16, 6],
  [-6, -16, 5], [-6, -6, 5], [-18, -6, 5], [-18, -16, 5], [-29, -16, 6],
];

// plek van de startlijn en de bijzondere stukken (zoekt het dichtstbijzijnde punt van het circuit)
const START_AT = [-14, 16];
const SPEC = {
  ramp: { at: [15, -16], len: 7 },          // schans op de bovenrechte
  ice: { at: [-29, -7], len: 20 },          // ijsstuk: linkerbocht
  mud: { at: [26, 1], len: 22 },            // modderstuk: rechterkant
  bridge: { at: [-29, 8], len: 8 },         // brug over het beekje
  pads: [{ idx: 38, len: 3 }, { idx: 122, len: 3 }],   // turbo-pijlen
  cows: [186, 108],                        // waar de koeien oversteken
};

function fillet(C) {
  const n = C.length, out = [];
  const norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
  for (let i = 0; i < n; i++) {
    const p0 = C[(i - 1 + n) % n], p1 = C[i], p2 = C[(i + 1) % n];
    const d1 = norm(p1[0] - p0[0], p1[1] - p0[1]), d2 = norm(p2[0] - p1[0], p2[1] - p1[1]);
    const dot = Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1])), phi = Math.acos(dot);
    const r = p1[2], t = phi < 1e-3 ? 0 : r * Math.tan(phi / 2);
    if (t < 1e-3) { out.push([p1[0], p1[1]]); continue; }
    const a = [p1[0] - d1[0] * t, p1[1] - d1[1] * t];
    const sgn = d1[0] * d2[1] - d1[1] * d2[0] > 0 ? 1 : -1;
    const c = [a[0] + sgn * (-d1[1]) * r, a[1] + sgn * d1[0] * r];
    const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
    const steps = Math.max(4, Math.ceil(phi * r / 0.7));
    for (let s = 0; s <= steps; s++) { const ang = a0 + sgn * phi * s / steps; out.push([c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r]); }
  }
  return out;
}

export function buildCourse() {
  const dense = fillet(CORNERS), m = dense.length;
  const acc = [0];
  for (let i = 1; i <= m; i++) { const a = dense[i - 1], b = dense[i % m]; acc.push(acc[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const L = acc[m], N = Math.round(L);
  const X0 = new Float32Array(N), Z0 = new Float32Array(N);
  let j = 0;
  for (let k = 0; k < N; k++) {
    const d = k / N * L; while (acc[j + 1] < d) j++;
    const f = (d - acc[j]) / ((acc[j + 1] - acc[j]) || 1), a = dense[j], b = dense[(j + 1) % m];
    X0[k] = a[0] + (b[0] - a[0]) * f; Z0[k] = a[1] + (b[1] - a[1]) * f;
  }
  // roteer zodat index 0 = startlijn
  let s0 = 0, bd = 1e9;
  for (let k = 0; k < N; k++) { const d = Math.hypot(X0[k] - START_AT[0], Z0[k] - START_AT[1]); if (d < bd) { bd = d; s0 = k; } }
  const X = new Float32Array(N), Z = new Float32Array(N);
  for (let k = 0; k < N; k++) { X[k] = X0[(k + s0) % N]; Z[k] = Z0[(k + s0) % N]; }
  const TX = new Float32Array(N), TZ = new Float32Array(N);
  for (let k = 0; k < N; k++) {
    const a = (k - 2 + N) % N, b = (k + 2) % N; const dx = X[b] - X[a], dz = Z[b] - Z[a], l = Math.hypot(dx, dz) || 1;
    TX[k] = dx / l; TZ[k] = dz / l;
  }
  const C = { N, L, X, Z, TX, TZ, surf: new Uint8Array(N), padAt: new Uint8Array(N) };
  const near = (p) => { let bi = 0, b = 1e9; for (let k = 0; k < N; k++) { const d = Math.hypot(X[k] - p[0], Z[k] - p[1]); if (d < b) { b = d; bi = k; } } return bi; };
  const range = (spec) => { const c = spec.idx != null ? spec.idx : near(spec.at); return [c - Math.floor(spec.len / 2), c + Math.ceil(spec.len / 2)]; };
  const mark = (r, v) => { for (let k = r[0]; k <= r[1]; k++) C.surf[(k + N) % N] = v; };
  C.zones = { ice: range(SPEC.ice), mud: range(SPEC.mud), bridge: range(SPEC.bridge), ramp: range(SPEC.ramp), pads: SPEC.pads.map(range), cows: SPEC.cows };
  mark(C.zones.ice, 1); mark(C.zones.mud, 2); mark(C.zones.bridge, 3);
  for (const r of C.zones.pads) for (let k = r[0]; k <= r[1]; k++) C.padAt[(k + N) % N] = 1;
  C.idxNear = near;
  return C;
}

// Zoekt het punt van het circuit dat het dichtst bij (x,z) ligt, rond `hint` (float-index). Vult `out`.
//  out.idx (float, 0..N), out.lat (+ = rechts van de rijrichting), out.px/pz = dichtstbijzijnde punt, out.tx/tz = rijrichting
export function locate(C, x, z, hint, out) {
  const { N, X, Z } = C;
  let lo = 0, hi = N - 1, wrap = false;
  if (hint != null) { lo = Math.round(hint) - 14; hi = Math.round(hint) + 14; wrap = true; }
  let bi = 0, bd = 1e12;
  for (let k = lo; k <= hi; k++) {
    const kk = wrap ? ((k % N) + N) % N : k;
    const dx = x - X[kk], dz = z - Z[kk], d = dx * dx + dz * dz;
    if (d < bd) { bd = d; bi = kk; }
  }
  // verfijn op de twee naastliggende segmenten
  let bt = 0, bseg = bi, bdist = 1e12, bpx = X[bi], bpz = Z[bi];
  for (const s0 of [(bi - 1 + N) % N, bi]) {
    const s1 = (s0 + 1) % N, ax = X[s0], az = Z[s0], ex = X[s1] - ax, ez = Z[s1] - az;
    const len2 = ex * ex + ez * ez || 1;
    let t = ((x - ax) * ex + (z - az) * ez) / len2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = ax + ex * t, pz = az + ez * t, d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < bdist) { bdist = d; bseg = s0; bt = t; bpx = px; bpz = pz; }
  }
  const s1 = (bseg + 1) % N;
  const tx = C.TX[bseg] + (C.TX[s1] - C.TX[bseg]) * bt, tz = C.TZ[bseg] + (C.TZ[s1] - C.TZ[bseg]) * bt, tl = Math.hypot(tx, tz) || 1;
  out.tx = tx / tl; out.tz = tz / tl;
  out.idx = bseg + bt; out.px = bpx; out.pz = bpz;
  // rechts van de rijrichting = (-tz, tx)
  out.lat = (x - bpx) * -out.tz + (z - bpz) * out.tx;
  out.dist = Math.sqrt(bdist);
  return out;
}

export function pointAt(C, idx, lat = 0) {
  const N = C.N, i0 = ((Math.floor(idx) % N) + N) % N, i1 = (i0 + 1) % N, t = idx - Math.floor(idx);
  const x = C.X[i0] + (C.X[i1] - C.X[i0]) * t, z = C.Z[i0] + (C.Z[i1] - C.Z[i0]) * t;
  let tx = C.TX[i0] + (C.TX[i1] - C.TX[i0]) * t, tz = C.TZ[i0] + (C.TZ[i1] - C.TZ[i0]) * t; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
  return { x: x - tz * lat, z: z + tx * lat, tx, tz };
}
