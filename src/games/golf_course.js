// Banen + balfysica van "Minigolf-Race" — puur rekenwerk (geen THREE), zodat het ook in node te testen is.
// Alles zijn simpele vlakken/muren: omtrek = veelhoek, muren = lijnstukken, bumpers = cirkels, water/bruggen/schansen/pads = rechthoeken.
// Coördinaten: x naar rechts, z naar beneden (naar de camera). Hoogte y omhoog. Een bal boven WALL_H vliegt over muren heen.
export const BALL_R = 0.36, CUP_R = 0.62, WALL_H = 0.75, WALL_T = 0.14, MAXV = 30;
export const MAX_STROKES = 6;
const G0 = 24, FRIC_LIN = 2.4, FRIC_V = 0.8, STOP_V = 0.5;

// ---------------- banen ----------------
// poly: omtrek; tee: 2 startplekken (gespiegeld om de middenlijn); cup; walls: extra muren [x1,z1,x2,z2]; bumpers [x,z,r];
// water/bridges/sand/ramps/pads: [x0,z0,x1,z1] (pads/ramps hebben ook dir); mill: draaiende molen; dragon: draak kaapt ballen.
export const HOLES = [
  { id: 1, name: 'Weide-Weetje', par: 2, time: 22, theme: 'weide',
    poly: [[-16, -5.5], [16, -5.5], [16, 5.5], [-16, 5.5]],
    tee: [[-13.5, -1.4], [-13.5, 1.4]], cup: [13.5, 0],
    water: [[2.5, -5.5, 6.0, 5.5]], bridges: [[2.5, -1.5, 6.0, 1.5]],
    walls: [[2.5, -1.5, 6.0, -1.5], [2.5, 1.5, 6.0, 1.5]],
    bumpers: [[-7, -2.8, 0.85], [-7, 2.8, 0.85], [9.6, 2.7, 0.85]],
    route: [[13.5, 0]] },
  { id: 2, name: 'Molen-Mania', par: 3, time: 26, theme: 'molen',
    poly: [[-16, -7.5], [16, -7.5], [16, 7.5], [-16, 7.5]],
    tee: [[-13.5, -1.4], [-13.5, 1.4]], cup: [12.5, 0],
    walls: [[-4, -7.5, -4, 2.0], [5, 7.5, 5, -1.0]],
    ramps: [{ r: [-10.8, -1.5, -8.8, 1.5], dir: [1, 0] }],
    mill: { x: 0.5, z: 3.3, len: 3.0, w: 0.5, speed: 1.15 },
    bumpers: [[10, -4.5, 0.85], [10, 4.5, 0.85]],
    route: [[-1.5, -2.5], [8, -4.5], [12.5, 0]] },
  { id: 3, name: 'Drakenburcht', par: 3, time: 28, theme: 'burcht', dragon: true, final: true,
    poly: [[-16, -8], [16, -8], [16, 8], [9, 8], [9, -2], [-16, -2]],
    tee: [[-14.5, -6.3], [-14.5, -3.7]], cup: [12.5, 6.2],
    water: [[-9.5, -8, -6, -2], [9, 1.0, 16, 3.4]], bridges: [[-9.5, -5.0, -6, -2.6], [11.3, 1.0, 13.7, 3.4]],
    walls: [[-9.5, -5.0, -6, -5.0], [-9.5, -2.6, -6, -2.6], [11.3, 1.0, 11.3, 3.4], [13.7, 1.0, 13.7, 3.4]],
    ramps: [{ r: [-12.6, -8, -11.2, -5.4], dir: [1, 0] }],
    pads: [{ r: [3.5, -7.2, 6.5, -2.8], dir: [1, 0] }],
    bumpers: [[-2, -6.2, 0.8], [0.6, -3.8, 0.8], [13, -5, 1.0]],
    route: [[-3, -4.5], [12.5, -4.5], [12.5, 6.2]] },
  { id: 4, name: 'Gouden Putt', par: 2, time: 22, theme: 'goud', sudden: true,
    poly: [[-11, -4.5], [11, -4.5], [11, 4.5], [-11, 4.5]],
    tee: [[-8.5, -1.3], [-8.5, 1.3]], cup: [8.5, 0],
    bumpers: [[0, -1.8, 0.9], [0, 1.8, 0.9], [4.6, 0, 0.7]],
    route: [[8.5, 0]] },
];

// ---------------- hulpfuncties ----------------
export function inRect(r, x, z, pad = 0) { return x > r[0] + pad && x < r[2] - pad && z > r[1] + pad && z < r[3] - pad; }
export function inPoly(poly, x, z) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
export function bounds(def) {
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const [x, z] of def.poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  return { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 };
}
const _o = { cx: 0, cz: 0 };
function segDist(px, pz, ax, az, bx, bz, o = _o) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  o.cx = ax + dx * t; o.cz = az + dz * t; o.t = t;
  return Math.hypot(px - o.cx, pz - o.cz);
}

// Bouwt de runtime-baan (muur-lijst, molen-toestand) uit een definitie
export function makeCourse(def) {
  const walls = [];
  const P = def.poly;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; walls.push([a[0], a[1], b[0], b[1]]); }
  for (const w of def.walls || []) walls.push(w);
  const C = { def, walls, polyWalls: P.length, bumpers: def.bumpers || [], water: def.water || [], bridges: def.bridges || [], ramps: def.ramps || [], pads: def.pads || [], sand: def.sand || [], poly: P, cup: def.cup,
    mill: def.mill ? { ...def.mill, ang: 0, w2: def.mill.speed } : null, bounceHit: null };
  return C;
}
export function millBlades(C) {
  const m = C.mill; if (!m) return [];
  const out = [];
  for (let k = 0; k < 4; k++) { const a = m.ang + k * Math.PI / 2; out.push([m.x, m.z, m.x + Math.cos(a) * m.len, m.z + Math.sin(a) * m.len]); }
  return out;
}
export const makeBall = (x, z, r = BALL_R) => ({ x, z, vx: 0, vz: 0, y: 0, vy: 0, r, sunk: false, sinkT: 0, air: 0, hop: 0, onPad: false, lastHit: 0 });
export const speedOf = (b) => Math.hypot(b.vx, b.vz);
export function waterAt(C, x, z) { for (const w of C.water) if (inRect(w, x, z)) { for (const br of C.bridges) if (inRect(br, x, z, -0.2)) return false; return true; } return false; }

// Eén substap van één bal. opts: { fric (1 = normaal), grav (1 = normaal), hop (maan-gravity-botsen) }. Retourneert null | 'water' | 'oob' | 'sunk'
// Zet b.ev op botsing-gebeurtenissen (voor geluid/effecten): 'wall' 'bump' 'mill' 'launch' 'land' 'pad'
export function stepBall(C, b, h, opts = {}) {
  if (b.sunk) return null;
  b.ev = null; const fr = opts.fric ?? 1, gr = (opts.grav ?? 1) * G0;
  // verticaal
  if (b.y > 0 || b.vy > 0) {
    b.vy -= gr * h; b.y += b.vy * h; b.air += h;
    if (b.y <= 0) {
      b.y = 0;
      if (b.vy < -3.2) { b.vy = -b.vy * 0.3; b.y = 1e-4; b.ev = 'land'; const s = Math.hypot(b.vx, b.vz); if (s > 0.1) { b.vx *= 0.88; b.vz *= 0.88; } } else { b.vy = 0; b.ev = 'land'; }
      if (b.vy === 0) b.air = 0;
    }
  }
  const ground = b.y <= 0.0005 && b.vy <= 0;
  // wrijving
  if (ground) {
    let sp = Math.hypot(b.vx, b.vz);
    if (sp > 0) {
      let f = 1; for (const s of C.sand) if (inRect(s, b.x, b.z)) f = 4;
      const dv = (FRIC_LIN + FRIC_V * sp) * h * fr * f;
      if (dv >= sp || (sp < STOP_V && !b.onPad)) { b.vx = b.vz = 0; sp = 0; }
      else { const k = (sp - dv) / sp; b.vx *= k; b.vz *= k; sp -= dv; }
    }
    // maan-zwaartekracht: de bal botst vrolijk door
    if (opts.hop && sp > 5 && b.hop <= 0) { b.vy = 3.4; b.y = 1e-3; b.hop = 0.2; } if (b.hop > 0) b.hop -= h;
  }
  b.x += b.vx * h; b.z += b.vz * h;
  b.onPad = false;
  // schans / boost-pads
  if (ground) {
    for (const rp of C.ramps) if (inRect(rp.r, b.x, b.z)) { const sp = Math.hypot(b.vx, b.vz); if (sp > 4.5) { b.vy = 0.34 * Math.min(sp, 14) * (opts.grav < 1 ? 0.8 : 1); b.y = 1e-3; b.ev = 'launch'; } }
    for (const pd of C.pads) if (inRect(pd.r, b.x, b.z)) { b.onPad = true; const sp = Math.hypot(b.vx, b.vz), along = b.vx * pd.dir[0] + b.vz * pd.dir[1]; if (along < 17) { b.vx += pd.dir[0] * 38 * h; b.vz += pd.dir[1] * 38 * h; } b.ev = b.ev || 'pad'; }
  }
  // botsingen (alleen onder muurhoogte)
  const r = b.r;
  if (b.y < WALL_H) {
    const o = _o;
    for (let i = 0; i < C.walls.length; i++) {
      const w = C.walls[i]; const d = segDist(b.x, b.z, w[0], w[1], w[2], w[3], o);
      if (d < r + WALL_T) {
        let nx, nz;
        if (d > 1e-5) { nx = (b.x - o.cx) / d; nz = (b.z - o.cz) / d; } else { const dx = w[2] - w[0], dz = w[3] - w[1], l = Math.hypot(dx, dz) || 1; nx = -dz / l; nz = dx / l; }
        // binnen de omtrek: duw naar de kant waar de bal vandaan komt (voorkomt doorschieten)
        b.x = o.cx + nx * (r + WALL_T + 1e-3); b.z = o.cz + nz * (r + WALL_T + 1e-3);
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= 1.78 * vn * nx; b.vz -= 1.78 * vn * nz; b.vx *= 0.985; b.vz *= 0.985; if (-vn > 2) b.ev = 'wall'; b.hitV = -vn; }
      }
    }
    for (const bp of C.bumpers) {
      const dx = b.x - bp[0], dz = b.z - bp[1], mm = r + bp[2], d2 = dx * dx + dz * dz;
      if (d2 < mm * mm) {
        const d = Math.sqrt(d2) || 1e-3, nx = dx / d, nz = dz / d; b.x = bp[0] + nx * (mm + 1e-3); b.z = bp[1] + nz * (mm + 1e-3);
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= 2 * vn * nx; b.vz -= 2 * vn * nz; const sp = Math.hypot(b.vx, b.vz), t = Math.max(sp * 1.08, 9) / (sp || 1); b.vx *= t; b.vz *= t; }
        b.ev = 'bump'; b.bump = bp;
      }
    }
    const m = C.mill;
    if (m) {
      // naaf (cirkel)
      { const dx = b.x - m.x, dz = b.z - m.z, mm = r + 0.85, d2 = dx * dx + dz * dz; if (d2 < mm * mm) { const d = Math.sqrt(d2) || 1e-3, nx = dx / d, nz = dz / d; b.x = m.x + nx * (mm + 1e-3); b.z = m.z + nz * (mm + 1e-3); const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vz -= 1.7 * vn * nz; b.ev = 'wall'; } } }
      for (const bl of millBlades(C)) {
        const d = segDist(b.x, b.z, bl[0], bl[1], bl[2], bl[3], o);
        if (d < r + m.w / 2) {
          const nx = d > 1e-5 ? (b.x - o.cx) / d : 0, nz = d > 1e-5 ? (b.z - o.cz) / d : 1;
          b.x = o.cx + nx * (r + m.w / 2 + 1e-3); b.z = o.cz + nz * (r + m.w / 2 + 1e-3);
          const rx = o.cx - m.x, rz = o.cz - m.z, svx = -m.w2 * rz, svz = m.w2 * rx;
          const rvx = b.vx - svx, rvz = b.vz - svz, vn = rvx * nx + rvz * nz;
          if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; b.ev = 'mill'; b.hitV = -vn; }
        }
      }
    }
  }
  // veiligheid: een bal op de grond blijft in de omtrek (voorkomt doorschieten bij hoge snelheid)
  if (ground && b.y < WALL_H && !inPoly(C.poly, b.x, b.z)) {
    // zoek dichtstbijzijnde omtrek-muur en zet de bal terug naar binnen
    let best = 1e9, bi = -1; const o = _o;
    for (let i = 0; i < C.polyWalls; i++) { const w = C.walls[i]; const d = segDist(b.x, b.z, w[0], w[1], w[2], w[3], o); if (d < best) { best = d; bi = i; } }
    if (bi >= 0) { const w = C.walls[bi]; segDist(b.x, b.z, w[0], w[1], w[2], w[3], o); const dx = w[2] - w[0], dz = w[3] - w[1], l = Math.hypot(dx, dz) || 1; let nx = -dz / l, nz = dx / l; if (inPoly(C.poly, o.cx + nx * 0.5, o.cz + nz * 0.5) === false) { nx = -nx; nz = -nz; } b.x = o.cx + nx * (r + WALL_T + 0.01); b.z = o.cz + nz * (r + WALL_T + 0.01); const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.78 * vn * nx; b.vz -= 1.78 * vn * nz; } }
  }
  // water / buiten de baan (alleen als de bal echt op de grond ligt)
  const on = b.y <= 0.0005 && b.vy <= 0;
  if (on) {
    if (waterAt(C, b.x, b.z)) return 'water';
    if (!inPoly(C.poly, b.x, b.z)) return 'oob';
    // gat
    const cx = C.cup[0], cz = C.cup[1], dx = cx - b.x, dz = cz - b.z, d = Math.hypot(dx, dz), sp = Math.hypot(b.vx, b.vz);
    if (d < CUP_R && sp < 8.5) { b.sunk = true; b.sinkT = 0; return 'sunk'; }
    if (d < 1.15 && sp < 7) { const k = 11 * (1 - d / 1.15) * h / (d || 1); b.vx += dx * k; b.vz += dz * k; }
  }
  return null;
}

// Bal-bal botsing (massa ~ straal^2). Retourneert botssnelheid (0 = geen botsing).
export function collideBalls(a, b) {
  if (a.sunk || b.sunk || a.y > 0.45 || b.y > 0.45) return 0;
  const dx = b.x - a.x, dz = b.z - a.z, mm = a.r + b.r, d2 = dx * dx + dz * dz;
  if (d2 >= mm * mm) return 0;
  const d = Math.sqrt(d2) || 1e-3, nx = dx / d, nz = dz / d, ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
  const ov = mm - d; a.x -= nx * ov * (mb / tot); a.z -= nz * ov * (mb / tot); b.x += nx * ov * (ma / tot); b.z += nz * ov * (ma / tot);
  const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
  if (rv <= 0) return 0;
  const e = 0.92, j = (1 + e) * rv / (1 / ma + 1 / mb);
  a.vx -= j / ma * nx; a.vz -= j / ma * nz; b.vx += j / mb * nx; b.vz += j / mb * nz;
  return rv;
}

// Simuleert één slag zonder andere bal. Retourneert { x, z, ev, t, steps } (ev: null/water/oob/sunk)
export function simulateShot(C, start, ang, v0, o = {}) {
  const b = makeBall(start.x, start.z, start.r || BALL_R); b.vx = Math.cos(ang) * v0; b.vz = Math.sin(ang) * v0;
  const h = 1 / 240, millAng0 = C.mill ? C.mill.ang : 0; let t = 0, ev = null, still = 0;
  while (t < (o.maxT || 14)) {
    if (C.mill) C.mill.ang += C.mill.w2 * h;
    ev = stepBall(C, b, h, o); t += h;
    if (ev) break;
    if (b.y <= 0.0005 && b.vy <= 0 && b.vx === 0 && b.vz === 0) { if (++still > 20) break; } else still = 0;
  }
  if (C.mill) C.mill.ang = millAng0;
  return { x: b.x, z: b.z, ev, t, y: b.y };
}
// rond een slag af tot een kracht (0..1) -> snelheid
export const powerToV = (m) => 2 + 25 * Math.max(0, Math.min(1, m));
