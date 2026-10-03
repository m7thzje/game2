// Banen + balfysica van "Minigolf-Race" — puur rekenwerk (geen THREE), zodat het ook in node te testen is.
// Alles zijn simpele vlakken/muren: omtrek = veelhoek, muren = lijnstukken, bumpers = cirkels, water/bruggen/schansen/pads = rechthoeken.
// Coordinaten: x naar rechts, z naar beneden (naar de camera). Hoogte y omhoog. Een bal boven WALL_H vliegt over muren heen.
// Beweeglijke delen (C.dyn): schuifmuren, zwenkende hamers, draaiende molens/balken. Hun stand hangt alleen af van C.t (stepCourse).
export const BALL_R = 0.36, CUP_R = 0.62, WALL_H = 0.75, WALL_T = 0.14, MAXV = 30;
export const MAX_STROKES = 6;
const G0 = 24, FRIC_LIN = 2.4, FRIC_V = 0.8, STOP_V = 0.5, ICE_F = 0.3, SAND_F = 4;

export { HOLES, POOL, GOLD, pickHoles } from './golf_holes.js';

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
const _o = { cx: 0, cz: 0, t: 0 };
export function segDist(px, pz, ax, az, bx, bz, o = _o) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
  o.cx = ax + dx * t; o.cz = az + dz * t; o.t = t;
  return Math.hypot(px - o.cx, pz - o.cz);
}

// ---------------- runtime-baan ----------------
// Bouwt de runtime-baan (muur-lijst, beweeglijke delen, portalen...) uit een definitie
export function makeCourse(def) {
  const walls = [];
  const P = def.poly;
  for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; walls.push([a[0], a[1], b[0], b[1]]); }
  for (const w of def.walls || []) walls.push(w);
  const C = {
    def, walls, polyWalls: P.length, bumpers: def.bumpers || [], pillars: def.pillars || [], water: def.water || [], bridges: def.bridges || [], ramps: def.ramps || [], pads: def.pads || [], sand: def.sand || [],
    ice: def.ice || [], belts: (def.belts || []).map((b) => ({ accel: 16, speed: 6, ...b })), swirls: def.swirls || [], poly: P, cup: [def.cup[0], def.cup[1]], t: 0,
    lifts: (def.lifts || []).map((l) => ({ down: true, warn: false, f: 0, ...l })), portals: [], dyn: [], mill: null, cupMove: def.cupMove || null,
  };
  for (const p of def.portals || []) {
    const rr = p.r || 0.8; const A = { x: p.a[0], z: p.a[1], r: rr, face: (p.a[2] || 0) * Math.PI / 180, col: p.col || 0x9a5aff, to: null }, B = { x: p.b[0], z: p.b[1], r: rr, face: (p.b[2] || 0) * Math.PI / 180, col: p.col || 0x9a5aff, to: null };
    A.to = B; B.to = A; C.portals.push(A, B);
  }
  // beweeglijke delen
  if (def.mill) { const m = def.mill; const d = { kind: 'spin', visual: 'mill', x: m.x, z: m.z, n: 4, len: m.len, th: (m.w || 0.5) / 2, hub: 0.85, w: m.speed, ph: 0, ...{} }; C.dyn.push(d); C.mill = d; }
  for (const s of def.spinners || []) C.dyn.push({ kind: 'spin', visual: 'bar', n: 2, th: 0.28, hub: 0.55, ph: 0, ...s });
  for (const s of def.swings || []) C.dyn.push({ kind: 'swing', visual: 'hammer', th: 0.26, hub: 0.5, head: 0.8, per: 3.2, ph: 0, amp: 0.8, a0: Math.PI / 2, ...s });
  for (const s of def.slides || []) C.dyn.push({ kind: 'slide', visual: 'door', th: 0.2, per: 4, ph: 0, ang: Math.PI / 2, ...s });
  for (const d of C.dyn) { d.segs = []; d.circles = []; d.lin = [0, 0]; d.om = 0; d.px = d.x; d.pz = d.z; d.cur = 0; d.curs = 0; }
  updateDyn(C);
  return C;
}
// stand van alle beweeglijke delen voor tijd C.t
export function updateDyn(C) {
  const t = C.t;
  for (const d of C.dyn) {
    if (d.kind === 'spin') {
      const a = d.ph + d.w * t; d.cur = a; d.om = d.w; d.px = d.x; d.pz = d.z; d.segs.length = 0;
      for (let k = 0; k < d.n; k++) { const ak = a + k * Math.PI * 2 / d.n; d.segs.push([d.x, d.z, d.x + Math.cos(ak) * d.len, d.z + Math.sin(ak) * d.len]); }
      d.circles.length = 0; if (d.hub > 0) d.circles.push([d.x, d.z, d.hub]);
    } else if (d.kind === 'swing') {
      const W = Math.PI * 2 / d.per, ph = W * t + d.ph, a = d.a0 + d.amp * Math.sin(ph); d.cur = a; d.om = d.amp * Math.cos(ph) * W; d.px = d.x; d.pz = d.z;
      const tx = d.x + Math.cos(a) * d.len, tz = d.z + Math.sin(a) * d.len; d.segs.length = 0; d.segs.push([d.x, d.z, tx, tz]);
      d.circles.length = 0; if (d.hub > 0) d.circles.push([d.x, d.z, d.hub]); if (d.head > 0) d.circles.push([tx, tz, d.head]);
    } else {
      const W = Math.PI * 2 / d.per, ph = W * t + d.ph, s = Math.sin(ph) * d.amp; d.cur = s; d.lin[0] = d.ax * Math.cos(ph) * d.amp * W; d.lin[1] = d.az * Math.cos(ph) * d.amp * W;
      const cx = d.x + d.ax * s, cz = d.z + d.az * s, ux = Math.cos(d.ang) * d.len / 2, uz = Math.sin(d.ang) * d.len / 2; d.px = cx; d.pz = cz; d.om = 0;
      d.segs.length = 0; d.segs.push([cx - ux, cz - uz, cx + ux, cz + uz]);
    }
  }
  for (const l of C.lifts) { const f = ((t / l.per + (l.ph || 0)) % 1 + 1) % 1; l.f = f; l.down = f < l.downFrac; l.warn = l.down && f > l.downFrac - 0.16; }
  const cm = C.cupMove; if (cm) { const s = Math.sin(t * Math.PI * 2 / cm.per + (cm.ph || 0)) * cm.amp; C.cup[0] = C.def.cup[0] + cm.ax * s; C.cup[1] = C.def.cup[1] + cm.az * s; C.cupV = [cm.ax * Math.cos(t * Math.PI * 2 / cm.per + (cm.ph || 0)) * cm.amp * Math.PI * 2 / cm.per, cm.az * Math.cos(t * Math.PI * 2 / cm.per + (cm.ph || 0)) * cm.amp * Math.PI * 2 / cm.per]; }
}
export function stepCourse(C, h) { C.t += h; updateDyn(C); }
export function setCourseTime(C, t) { C.t = t; updateDyn(C); }

export const makeBall = (x, z, r = BALL_R) => ({ x, z, vx: 0, vz: 0, y: 0, vy: 0, r, sunk: false, sinkT: 0, air: 0, hop: 0, onPad: false, lastHit: 0, pcd: 0 });
export const speedOf = (b) => Math.hypot(b.vx, b.vz);
export function liftDown(C, x, z) { for (const l of C.lifts) if (l.down && inRect(l.r, x, z, -0.2)) return true; return false; }
export function onLift(C, x, z) { for (const l of C.lifts) if (inRect(l.r, x - 0, z, -0.6)) return true; return false; }
export function waterAt(C, x, z) { for (const w of C.water) if (inRect(w, x, z)) { for (const br of C.bridges) if (inRect(br, x, z, -0.2)) return false; if (liftDown(C, x, z)) return false; return true; } return false; }
// is deze plek een slechte plek om een bal neer te zetten (water, brug die kan opgaan, portaal)?
export function unsafeAt(C, x, z, r = 0.9) {
  if (waterAt(C, x, z) || !inPoly(C.poly, x, z) || onLift(C, x, z)) return true;
  for (const p of C.portals) if (Math.hypot(x - p.x, z - p.z) < p.r + 0.8) return true;
  for (const d of C.dyn) for (const s of d.segs) if (segDist(x, z, s[0], s[1], s[2], s[3]) < r + d.th + 1.2) return true;
  return false;
}

// Eén substap van één bal. opts: { fric (1 = normaal), grav (1 = normaal), hop (maan-gravity-botsen) }. Retourneert null | 'water' | 'oob' | 'sunk'
// Zet b.ev op gebeurtenissen (voor geluid/effecten): 'wall' 'bump' 'mill' 'launch' 'land' 'pad' 'portal' 'pillar'
export function stepBall(C, b, h, opts = {}) {
  if (b.sunk) return null;
  b.ev = null; const fr = opts.fric ?? 1, gr = (opts.grav ?? 1) * G0;
  if (b.pcd > 0) b.pcd -= h;
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
      let f = 1; for (const s of C.sand) if (inRect(s, b.x, b.z)) { f = SAND_F; break; }
      if (f === 1) for (const s of C.ice) if (inRect(s, b.x, b.z)) { f = ICE_F; break; }
      let k0 = fr * f; if (f < 1) k0 = Math.max(k0, 0.16);
      const dv = (FRIC_LIN + FRIC_V * sp) * h * k0;
      if (dv >= sp || (sp < STOP_V && !b.onPad)) { b.vx = b.vz = 0; sp = 0; }
      else { const k = (sp - dv) / sp; b.vx *= k; b.vz *= k; sp -= dv; }
    }
    // maan-zwaartekracht: de bal botst vrolijk door
    if (opts.hop && sp > 5 && b.hop <= 0) { b.vy = 3.4; b.y = 1e-3; b.hop = 0.2; } if (b.hop > 0) b.hop -= h;
  }
  b.x += b.vx * h; b.z += b.vz * h;
  b.onPad = false;
  // schans / boost-pads / lopende banden / draaikolken (alleen voor rollende ballen)
  if (ground) {
    for (const rp of C.ramps) if (inRect(rp.r, b.x, b.z)) { const sp = Math.hypot(b.vx, b.vz); if (sp > 4.5) { b.vy = 0.34 * Math.min(sp, 14) * (opts.grav < 1 ? 0.8 : 1); b.y = 1e-3; b.ev = 'launch'; } }
    for (const pd of C.pads) if (inRect(pd.r, b.x, b.z)) { b.onPad = true; const along = b.vx * pd.dir[0] + b.vz * pd.dir[1]; if (along < 17) { b.vx += pd.dir[0] * 38 * h; b.vz += pd.dir[1] * 38 * h; } b.ev = b.ev || 'pad'; }
    const sp1 = b.vx !== 0 || b.vz !== 0;
    if (sp1) {
      for (const bl of C.belts) if (inRect(bl.r, b.x, b.z)) {
        const along = b.vx * bl.dir[0] + b.vz * bl.dir[1];
        if (along < bl.speed) { const a = Math.min(bl.accel * h, bl.speed - along); b.vx += bl.dir[0] * a; b.vz += bl.dir[1] * a; }
        if (bl.guide) { // greppel: de bal blijft in het midden van de goot
          const px = -bl.dir[1], pz = bl.dir[0], cx = (bl.r[0] + bl.r[2]) / 2, cz = (bl.r[1] + bl.r[3]) / 2, off = (b.x - cx) * px + (b.z - cz) * pz, lat = b.vx * px + b.vz * pz;
          const k = Math.min(1, 7 * h); b.vx -= px * lat * k; b.vz -= pz * lat * k; b.vx -= px * off * 5 * h; b.vz -= pz * off * 5 * h;
        }
      }
      for (const sw of C.swirls) {
        const dx = b.x - sw.x, dz = b.z - sw.z, d = Math.hypot(dx, dz);
        if (d < sw.r) { const dd = Math.max(d, 0.8), s = Math.sign(sw.w), tx = -dz / (d || 1) * s, tz = dx / (d || 1) * s, tv = Math.abs(sw.w) * dd, k = Math.min(1, 2.6 * h); b.vx += (tx * tv - b.vx) * k; b.vz += (tz * tv - b.vz) * k; }
      }
    }
  }
  // portalen
  if (ground && b.pcd <= 0 && C.portals.length) {
    for (const e of C.portals) {
      const dx = e.x - b.x, dz = e.z - b.z, d = Math.hypot(dx, dz);
      if (d < e.r) {
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 1.5 || d < e.r * 0.5) {
          const o = e.to, sp2 = Math.max(sp * 0.96, 5.5), ca = Math.cos(o.face), sa = Math.sin(o.face);
          b.x = o.x + ca * (o.r + b.r + 0.35); b.z = o.z + sa * (o.r + b.r + 0.35); b.vx = ca * sp2; b.vz = sa * sp2; b.pcd = 0.55; b.ev = 'portal'; b.portal = e; b.portalTo = o; break;
        }
      }
    }
  }
  // botsingen (alleen onder muurhoogte)
  const r = b.r;
  if (b.y < WALL_H) {
    const o = _o;
    // beweeglijke delen: botsen op de relatieve snelheid
    for (let q = 0; q < C.dyn.length; q++) {
      const d = C.dyn[q];
      for (let s = 0; s < d.segs.length; s++) {
        const sg = d.segs[s], dist = segDist(b.x, b.z, sg[0], sg[1], sg[2], sg[3], o);
        if (dist < r + d.th) {
          const nx = dist > 1e-5 ? (b.x - o.cx) / dist : 0, nz = dist > 1e-5 ? (b.z - o.cz) / dist : 1;
          b.x = o.cx + nx * (r + d.th + 1e-3); b.z = o.cz + nz * (r + d.th + 1e-3);
          const rx = o.cx - d.px, rz = o.cz - d.pz, wvx = d.lin[0] - d.om * rz, wvz = d.lin[1] + d.om * rx, vn = (b.vx - wvx) * nx + (b.vz - wvz) * nz;
          if (vn < 0) { b.vx -= 1.6 * vn * nx; b.vz -= 1.6 * vn * nz; b.ev = 'mill'; b.hitV = -vn; }
        }
      }
      for (let s = 0; s < d.circles.length; s++) {
        const c = d.circles[s], dx = b.x - c[0], dz = b.z - c[1], mm = r + c[2], d2 = dx * dx + dz * dz;
        if (d2 < mm * mm) {
          const dist = Math.sqrt(d2) || 1e-3, nx = dx / dist, nz = dz / dist; b.x = c[0] + nx * (mm + 1e-3); b.z = c[1] + nz * (mm + 1e-3);
          const rx = c[0] - d.px, rz = c[1] - d.pz, wvx = d.lin[0] - d.om * rz, wvz = d.lin[1] + d.om * rx, vn = (b.vx - wvx) * nx + (b.vz - wvz) * nz;
          if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vz -= 1.7 * vn * nz; b.ev = 'mill'; b.hitV = -vn; }
        }
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
    for (const pl of C.pillars) {
      const dx = b.x - pl[0], dz = b.z - pl[1], mm = r + pl[2], d2 = dx * dx + dz * dz;
      if (d2 < mm * mm) {
        const d = Math.sqrt(d2) || 1e-3, nx = dx / d, nz = dz / d; b.x = pl[0] + nx * (mm + 1e-3); b.z = pl[1] + nz * (mm + 1e-3);
        const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.8 * vn * nx; b.vz -= 1.8 * vn * nz; if (-vn > 2) b.ev = 'wall'; b.hitV = -vn; }
      }
    }
    // vaste muren (laatste, dus die winnen als de bal ergens tussen zit)
    for (let i = 0; i < C.walls.length; i++) {
      const w = C.walls[i]; const d = segDist(b.x, b.z, w[0], w[1], w[2], w[3], o);
      if (d < r + WALL_T) {
        let nx, nz;
        if (d > 1e-5) { nx = (b.x - o.cx) / d; nz = (b.z - o.cz) / d; } else { const dx = w[2] - w[0], dz = w[3] - w[1], l = Math.hypot(dx, dz) || 1; nx = -dz / l; nz = dx / l; }
        b.x = o.cx + nx * (r + WALL_T + 1e-3); b.z = o.cz + nz * (r + WALL_T + 1e-3);
        const vn = b.vx * nx + b.vz * nz;
        if (vn < 0) { b.vx -= 1.78 * vn * nx; b.vz -= 1.78 * vn * nz; b.vx *= 0.985; b.vz *= 0.985; if (-vn > 2) b.ev = 'wall'; b.hitV = -vn; }
      }
    }
  }
  // veiligheid: een bal op de grond blijft in de omtrek (voorkomt doorschieten bij hoge snelheid)
  if (ground && b.y < WALL_H && !inPoly(C.poly, b.x, b.z)) {
    let best = 1e9, bi = -1; const o = _o;
    for (let i = 0; i < C.polyWalls; i++) { const w = C.walls[i]; const d = segDist(b.x, b.z, w[0], w[1], w[2], w[3], o); if (d < best) { best = d; bi = i; } }
    if (bi >= 0) { const w = C.walls[bi]; segDist(b.x, b.z, w[0], w[1], w[2], w[3], o); const dx = w[2] - w[0], dz = w[3] - w[1], l = Math.hypot(dx, dz) || 1; let nx = -dz / l, nz = dx / l; if (inPoly(C.poly, o.cx + nx * 0.5, o.cz + nz * 0.5) === false) { nx = -nx; nz = -nz; } b.x = o.cx + nx * (r + WALL_T + 0.01); b.z = o.cz + nz * (r + WALL_T + 0.01); const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= 1.78 * vn * nx; b.vz -= 1.78 * vn * nz; } }
  }
  // water / buiten de baan (alleen als de bal echt op de grond ligt)
  const on = b.y <= 0.0005 && b.vy <= 0;
  if (on) {
    if (waterAt(C, b.x, b.z)) return 'water';
    if (!inPoly(C.poly, b.x, b.z)) return 'oob';
    // gat (kan bewegen: dan telt de snelheid van het gat mee)
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

// Simuleert één slag zonder andere bal. o.t0 = baantijd bij de slag. Retourneert { x, z, ev, t, steps, y }
export function simulateShot(C, start, ang, v0, o = {}) {
  const b = makeBall(start.x, start.z, start.r || BALL_R); b.vx = Math.cos(ang) * v0; b.vz = Math.sin(ang) * v0;
  const h = 1 / 240, t0 = C.t; if (o.t0 != null) setCourseTime(C, o.t0);
  let t = 0, ev = null, still = 0, port = 0;
  while (t < (o.maxT || 14)) {
    stepCourse(C, h);
    ev = stepBall(C, b, h, o); t += h;
    if (b.ev === 'portal') port++;
    if (ev) break;
    if (b.y <= 0.0005 && b.vy <= 0 && b.vx === 0 && b.vz === 0) { if (++still > 20) break; } else still = 0;
  }
  const t1 = C.t; setCourseTime(C, t0);
  return { x: b.x, z: b.z, ev, t, y: b.y, tEnd: t1, port };
}
// rond een slag af tot een kracht (0..1) -> snelheid
export const powerToV = (m) => 2 + 25 * Math.max(0, Math.min(1, m));
