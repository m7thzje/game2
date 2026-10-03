// Compacte 2D-fysica voor "Kasteelbelegering" (Box2D-lite-stijl): dozen + cirkels, wrijving, stapelen, restitutie
// en een slaaptoestand (rustende stapels blijven stabiel en kosten bijna niets). Geen THREE, dus ook in node te testen.
// Coördinaten: x rechts, y omhoog, hoeken tegen de klok in. Normaal van een contact wijst altijd van A naar B.

const ABS = Math.abs, SQRT = Math.sqrt;
let NEXT_ID = 1;

export class Body {
  constructor(o = {}) {
    this.id = NEXT_ID++;
    this.shape = o.shape || 'box';
    this.hw = (o.w || 1) / 2; this.hh = (o.h || 1) / 2; this.r = o.r || 0.5;
    this.x = o.x || 0; this.y = o.y || 0; this.ang = o.ang || 0;
    this.vx = 0; this.vy = 0; this.av = 0;
    this.static = !!o.static;
    const area = this.shape === 'circle' ? Math.PI * this.r * this.r : 4 * this.hw * this.hh;
    this.mass = this.static ? 0 : (o.mass ?? (o.density ?? 1) * area);
    this.invMass = this.static ? 0 : 1 / this.mass;
    const I = this.shape === 'circle' ? 0.5 * this.mass * this.r * this.r : this.mass * (4 * this.hw * this.hw + 4 * this.hh * this.hh) / 12;
    this.invI = this.static ? 0 : 1 / I;
    this.mu = o.mu ?? 0.6; this.e = o.e ?? 0;
    this.rad = this.shape === 'circle' ? this.r : SQRT(this.hw * this.hw + this.hh * this.hh);
    this.asleep = !!o.asleep; this.sleepT = 0;
    this.im = this.invMass; this.ii = this.invI;       // effectieve inverse massa (0 als slapend)
    this.damp = o.damp ?? 0.02; this.adamp = o.adamp ?? 0.25;
    this.user = o.user || null;                           // vrij veld voor de game (mesh, hp, soort ...)
    this.alive = true;
  }
  wake() { this.asleep = false; this.sleepT = 0; }
}

// ---------- contacten ----------
const NO_EDGE = 0;
// feature = 4 bytes (inEdge1, outEdge1, inEdge2, outEdge2) in één getal
const fpMake = (i1, o1, i2, o2) => i1 | (o1 << 4) | (i2 << 8) | (o2 << 12);
const fpFlip = (f) => { const i1 = f & 15, o1 = (f >> 4) & 15, i2 = (f >> 8) & 15, o2 = (f >> 12) & 15; return fpMake(o1, i1, o2, i2); };

function clipSeg(vOut, vIn, nx, ny, offset, clipEdge) {
  let n = 0;
  const d0 = nx * vIn[0].x + ny * vIn[0].y - offset, d1 = nx * vIn[1].x + ny * vIn[1].y - offset;
  if (d0 <= 0) vOut[n++] = vIn[0];
  if (d1 <= 0) vOut[n++] = vIn[1];
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    const o = { x: vIn[0].x + t * (vIn[1].x - vIn[0].x), y: vIn[0].y + t * (vIn[1].y - vIn[0].y), fp: 0 };
    if (d0 > 0) { const f = vIn[0].fp; o.fp = fpMake(clipEdge, (f >> 4) & 15, NO_EDGE, (f >> 12) & 15); }
    else { const f = vIn[1].fp; o.fp = fpMake(f & 15, clipEdge, (f >> 8) & 15, NO_EDGE); }
    vOut[n++] = o;
  }
  return n;
}
function incidentEdge(hx, hy, px, py, c, s, nx, ny) {
  // normaal van de referentiedoos in het frame van de incidente doos (en omgedraaid)
  const lx = -(c * nx + s * ny), ly = -(-s * nx + c * ny);
  let v0, v1;
  if (ABS(lx) > ABS(ly)) {
    if (lx > 0) { v0 = { x: hx, y: -hy, fp: fpMake(0, 0, 3, 4) }; v1 = { x: hx, y: hy, fp: fpMake(0, 0, 4, 1) }; }
    else { v0 = { x: -hx, y: hy, fp: fpMake(0, 0, 1, 2) }; v1 = { x: -hx, y: -hy, fp: fpMake(0, 0, 2, 3) }; }
  } else if (ly > 0) { v0 = { x: hx, y: hy, fp: fpMake(0, 0, 4, 1) }; v1 = { x: -hx, y: hy, fp: fpMake(0, 0, 1, 2) }; }
  else { v0 = { x: -hx, y: -hy, fp: fpMake(0, 0, 2, 3) }; v1 = { x: hx, y: -hy, fp: fpMake(0, 0, 3, 4) }; }
  for (const v of [v0, v1]) { const wx = c * v.x - s * v.y + px, wy = s * v.x + c * v.y + py; v.x = wx; v.y = wy; }
  return [v0, v1];
}

function collideBoxBox(A, B, out) {
  const cA = Math.cos(A.ang), sA = Math.sin(A.ang), cB = Math.cos(B.ang), sB = Math.sin(B.ang);
  const dpx = B.x - A.x, dpy = B.y - A.y;
  const dAx = cA * dpx + sA * dpy, dAy = -sA * dpx + cA * dpy;
  const dBx = cB * dpx + sB * dpy, dBy = -sB * dpx + cB * dpy;
  // C = RA^T * RB
  const c00 = cA * cB + sA * sB, c01 = -cA * sB + sA * cB, c10 = -sA * cB + cA * sB, c11 = sA * sB + cA * cB;
  const a00 = ABS(c00), a01 = ABS(c01), a10 = ABS(c10), a11 = ABS(c11);
  const hAx = A.hw, hAy = A.hh, hBx = B.hw, hBy = B.hh;
  const faceAx = ABS(dAx) - hAx - (a00 * hBx + a01 * hBy), faceAy = ABS(dAy) - hAy - (a10 * hBx + a11 * hBy);
  if (faceAx > 0 || faceAy > 0) return 0;
  const faceBx = ABS(dBx) - (a00 * hAx + a10 * hAy) - hBx, faceBy = ABS(dBy) - (a01 * hAx + a11 * hAy) - hBy;
  if (faceBx > 0 || faceBy > 0) return 0;
  let axis = 0, sep = faceAx, nx, ny;
  nx = dAx > 0 ? cA : -cA; ny = dAx > 0 ? sA : -sA;
  const rel = 0.95, abs = 0.01;
  if (faceAy > rel * sep + abs * hAy) { axis = 1; sep = faceAy; nx = dAy > 0 ? -sA : sA; ny = dAy > 0 ? cA : -cA; }
  if (faceBx > rel * sep + abs * hBx) { axis = 2; sep = faceBx; nx = dBx > 0 ? cB : -cB; ny = dBx > 0 ? sB : -sB; }
  if (faceBy > rel * sep + abs * hBy) { axis = 3; sep = faceBy; nx = dBy > 0 ? -sB : sB; ny = dBy > 0 ? cB : -cB; }
  let fnx, fny, snx, sny, front, negSide, posSide, negEdge, posEdge, inc;
  if (axis === 0) {
    fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + hAx;
    snx = -sA; sny = cA; const side = A.x * snx + A.y * sny; negSide = -side + hAy; posSide = side + hAy; negEdge = 3; posEdge = 1;
    inc = incidentEdge(hBx, hBy, B.x, B.y, cB, sB, fnx, fny);
  } else if (axis === 1) {
    fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + hAy;
    snx = cA; sny = sA; const side = A.x * snx + A.y * sny; negSide = -side + hAx; posSide = side + hAx; negEdge = 2; posEdge = 4;
    inc = incidentEdge(hBx, hBy, B.x, B.y, cB, sB, fnx, fny);
  } else if (axis === 2) {
    fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + hBx;
    snx = -sB; sny = cB; const side = B.x * snx + B.y * sny; negSide = -side + hBy; posSide = side + hBy; negEdge = 3; posEdge = 1;
    inc = incidentEdge(hAx, hAy, A.x, A.y, cA, sA, fnx, fny);
  } else {
    fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + hBy;
    snx = cB; sny = sB; const side = B.x * snx + B.y * sny; negSide = -side + hBx; posSide = side + hBx; negEdge = 2; posEdge = 4;
    inc = incidentEdge(hAx, hAy, A.x, A.y, cA, sA, fnx, fny);
  }
  const cp1 = [null, null], cp2 = [null, null];
  if (clipSeg(cp1, inc, -snx, -sny, negSide, negEdge) < 2) return 0;
  if (clipSeg(cp2, cp1, snx, sny, posSide, posEdge) < 2) return 0;
  let n = 0;
  for (let i = 0; i < 2; i++) {
    const s = fnx * cp2[i].x + fny * cp2[i].y - front;
    if (s <= 0) {
      const c = out[n] || (out[n] = {}); n++;
      c.sep = s; c.nx = nx; c.ny = ny; c.x = cp2[i].x - s * fnx; c.y = cp2[i].y - s * fny;
      c.fp = axis >= 2 ? fpFlip(cp2[i].fp) : cp2[i].fp;
    }
  }
  return n;
}
// cirkel C tegen doos Bx; levert normaal van doos naar cirkel (nx,ny), separatie en punt
function circleBox(C, Bx, res) {
  const c = Math.cos(Bx.ang), s = Math.sin(Bx.ang);
  const dx = C.x - Bx.x, dy = C.y - Bx.y;
  const lx = c * dx + s * dy, ly = -s * dx + c * dy;
  const qx = Math.max(-Bx.hw, Math.min(Bx.hw, lx)), qy = Math.max(-Bx.hh, Math.min(Bx.hh, ly));
  let nlx, nly, sep, plx, ply;
  if (qx === lx && qy === ly) {            // middelpunt in de doos: kleinste doordringing
    const px = Bx.hw - ABS(lx), py = Bx.hh - ABS(ly);
    if (px < py) { nlx = lx >= 0 ? 1 : -1; nly = 0; sep = -px - C.r; plx = nlx * Bx.hw; ply = ly; }
    else { nlx = 0; nly = ly >= 0 ? 1 : -1; sep = -py - C.r; plx = lx; ply = nly * Bx.hh; }
  } else {
    const ex = lx - qx, ey = ly - qy, d = SQRT(ex * ex + ey * ey);
    if (d > C.r) return false;
    nlx = ex / d; nly = ey / d; sep = d - C.r; plx = qx; ply = qy;
  }
  res.nx = c * nlx - s * nly; res.ny = s * nlx + c * nly; res.sep = sep;
  res.x = Bx.x + c * plx - s * ply; res.y = Bx.y + s * plx + c * ply;
  return true;
}
const _r = { nx: 0, ny: 0, sep: 0, x: 0, y: 0 };
function collide(A, B, out) {
  if (A.shape === 'box' && B.shape === 'box') return collideBoxBox(A, B, out);
  if (A.shape === 'circle' && B.shape === 'circle') {
    const dx = B.x - A.x, dy = B.y - A.y, d2 = dx * dx + dy * dy, R = A.r + B.r;
    if (d2 > R * R) return 0;
    const d = SQRT(d2) || 1e-6; const c = out[0] = out[0] || {};
    c.nx = d2 > 1e-10 ? dx / d : 0; c.ny = d2 > 1e-10 ? dy / d : 1; c.sep = d - R; c.x = A.x + c.nx * A.r; c.y = A.y + c.ny * A.r; c.fp = 0; return 1;
  }
  const c = out[0] = out[0] || {};
  if (A.shape === 'box') { if (!circleBox(B, A, _r)) return 0; c.nx = _r.nx; c.ny = _r.ny; }
  else { if (!circleBox(A, B, _r)) return 0; c.nx = -_r.nx; c.ny = -_r.ny; }
  c.sep = _r.sep; c.x = _r.x; c.y = _r.y; c.fp = 0; return 1;
}

// ---------- wereld ----------
export class World {
  constructor({ gravity = 20, iters = 10, onImpact = null } = {}) {
    this.g = gravity; this.iters = iters; this.onImpact = onImpact;
    this.bodies = []; this.arb = new Map(); this.stepN = 0;
  }
  add(b) { this.bodies.push(b); return b; }
  remove(b) {
    b.alive = false;
    const i = this.bodies.indexOf(b); if (i >= 0) this.bodies.splice(i, 1);
    for (const [k, a] of this.arb) if (a.A === b || a.B === b) { const o = a.A === b ? a.B : a.A; if (o.asleep) o.wake(); this.arb.delete(k); }
  }
  // alle (levende) lichamen binnen een cirkel
  query(x, y, r, fn) { for (const b of this.bodies.slice()) { const d = Math.hypot(b.x - x, b.y - y); if (d < r + b.rad * 0.6) fn(b, d); } }
  // schokgolf: duwt bodies weg (alleen bewegende), maakt ze wakker
  blast(x, y, r, power) {
    for (const b of this.bodies) {
      if (b.static) continue;
      const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy);
      if (d > r + b.rad) continue;
      const k = (1 - Math.min(1, d / (r + b.rad))) * power * b.invMass * 0.5;
      b.wake(); b.vx += dx / (d || 1) * k; b.vy += (dy / (d || 1) + 0.35) * k; b.av += (Math.random() - 0.5) * k * 0.15;
    }
  }
  step(dt) {
    const bs = this.bodies, n = bs.length;
    this.stepN++;
    const old = this.arb; let fresh = new Map(); const tmp = [];
    const fast = (q) => q.noSleep || q.vx * q.vx + q.vy * q.vy > 0.16 || q.av * q.av > 0.5;
    for (let pass = 0; pass < 3; pass++) {
      let dirty = false;
      for (let i = 0; i < n; i++) { const b = bs[i]; b.im = b.asleep ? 0 : b.invMass; b.ii = b.asleep ? 0 : b.invI; b.touch = false; }
      fresh = new Map();
      for (let i = 0; i < n; i++) {
        const A = bs[i];
        for (let j = i + 1; j < n; j++) {
          const B = bs[j];
          if ((A.static || A.asleep) && (B.static || B.asleep)) continue;
          const rr = A.rad + B.rad; const dx = B.x - A.x, dy = B.y - A.y;
          if (dx * dx + dy * dy > rr * rr) continue;
          tmp.length = 0;
          const P = A.id < B.id ? A : B, Q = A.id < B.id ? B : A;
          const m = collide(P, Q, tmp);
          if (!m) continue;
          // een snel bewegend lichaam raakt een slapend lichaam: dat (en zijn buren) wakker maken en opnieuw
          const sl = P.asleep && !Q.asleep && !Q.static && fast(Q) ? P : Q.asleep && !P.asleep && !P.static && fast(P) ? Q : null;
          if (sl) { sl.wake(); for (const ar of old.values()) if (ar.A === sl && !ar.B.static) ar.B.wake(); else if (ar.B === sl && !ar.A.static) ar.A.wake(); dirty = true; continue; }
          const key = P.id * 100000 + Q.id;
          const prev = old.get(key);
          const ar = prev ? { A: P, B: Q, cs: [], isNew: false } : { A: P, B: Q, cs: [], isNew: true };
          const ncs = [];
          for (let k = 0; k < m; k++) {
            const t = tmp[k]; const c = { x: t.x, y: t.y, nx: t.nx, ny: t.ny, sep: t.sep, fp: t.fp, Pn: 0, Pt: 0, mN: 0, mT: 0, bias: 0, vn0: 0 };
            if (prev) for (const oc of prev.cs) if (oc.fp === c.fp) { c.Pn = oc.Pn; c.Pt = oc.Pt; break; }
            ncs.push(c);
          }
          P.touch = Q.touch = true;
          ar.cs = ncs; ar.mu = Math.sqrt(P.mu * Q.mu); ar.e = Math.max(P.e, Q.e);
          fresh.set(key, ar);
        }
      }
      if (!dirty) break;
    }
    this.arb = fresh;
    // krachten
    const g = this.g;
    for (let i = 0; i < n; i++) { const b = bs[i]; if (b.im === 0) continue; b.vy -= g * dt; }
    // preStep
    const invDt = 1 / dt;
    for (const ar of fresh.values()) {
      const A = ar.A, B = ar.B;
      for (const c of ar.cs) {
        const r1x = c.x - A.x, r1y = c.y - A.y, r2x = c.x - B.x, r2y = c.y - B.y;
        const rn1 = r1x * c.nx + r1y * c.ny, rn2 = r2x * c.nx + r2y * c.ny;
        c.mN = 1 / (A.im + B.im + A.ii * (r1x * r1x + r1y * r1y - rn1 * rn1) + B.ii * (r2x * r2x + r2y * r2y - rn2 * rn2));
        const tx = c.ny, ty = -c.nx;
        const rt1 = r1x * tx + r1y * ty, rt2 = r2x * tx + r2y * ty;
        c.mT = 1 / (A.im + B.im + A.ii * (r1x * r1x + r1y * r1y - rt1 * rt1) + B.ii * (r2x * r2x + r2y * r2y - rt2 * rt2));
        c.bias = -0.2 * invDt * Math.min(0, c.sep + 0.01);
        // relatieve snelheid (voor inslag en restitutie)
        const dvx = B.vx - B.av * r2y - A.vx + A.av * r1y, dvy = B.vy + B.av * r2x - A.vy - A.av * r1x;
        const vn = dvx * c.nx + dvy * c.ny; c.vn0 = vn;
        if (vn < -1.5 && ar.e > 0) c.bias = Math.max(c.bias, -vn * ar.e);
        // warm start
        const Px = c.Pn * c.nx + c.Pt * tx, Py = c.Pn * c.ny + c.Pt * ty;
        A.vx -= A.im * Px; A.vy -= A.im * Py; A.av -= A.ii * (r1x * Py - r1y * Px);
        B.vx += B.im * Px; B.vy += B.im * Py; B.av += B.ii * (r2x * Py - r2y * Px);
      }
      if (ar.isNew && this.onImpact) {
        let s = 0, c0 = ar.cs[0]; for (const c of ar.cs) if (-c.vn0 > s) { s = -c.vn0; c0 = c; }
        if (s > 0.8) this.onImpact(A, B, s, c0.x, c0.y, c0.nx, c0.ny);
      }
    }
    // iteraties
    const list = [...fresh.values()];
    for (let it = 0; it < this.iters; it++) {
      for (const ar of list) {
        const A = ar.A, B = ar.B, mu = ar.mu;
        for (const c of ar.cs) {
          const r1x = c.x - A.x, r1y = c.y - A.y, r2x = c.x - B.x, r2y = c.y - B.y;
          let dvx = B.vx - B.av * r2y - A.vx + A.av * r1y, dvy = B.vy + B.av * r2x - A.vy - A.av * r1x;
          const vn = dvx * c.nx + dvy * c.ny;
          let dPn = c.mN * (-vn + c.bias);
          const P0 = c.Pn; c.Pn = Math.max(P0 + dPn, 0); dPn = c.Pn - P0;
          let Px = dPn * c.nx, Py = dPn * c.ny;
          A.vx -= A.im * Px; A.vy -= A.im * Py; A.av -= A.ii * (r1x * Py - r1y * Px);
          B.vx += B.im * Px; B.vy += B.im * Py; B.av += B.ii * (r2x * Py - r2y * Px);
          dvx = B.vx - B.av * r2y - A.vx + A.av * r1y; dvy = B.vy + B.av * r2x - A.vy - A.av * r1x;
          const tx = c.ny, ty = -c.nx;
          const vt = dvx * tx + dvy * ty; let dPt = c.mT * (-vt);
          const maxPt = mu * c.Pn; const T0 = c.Pt; c.Pt = Math.max(-maxPt, Math.min(maxPt, T0 + dPt)); dPt = c.Pt - T0;
          Px = dPt * tx; Py = dPt * ty;
          A.vx -= A.im * Px; A.vy -= A.im * Py; A.av -= A.ii * (r1x * Py - r1y * Px);
          B.vx += B.im * Px; B.vy += B.im * Py; B.av += B.ii * (r2x * Py - r2y * Px);
        }
      }
    }
    // integratie + slaap
    for (let i = 0; i < n; i++) {
      const b = bs[i]; if (b.static || b.asleep) continue;
      const dm = 1 / (1 + dt * (b.damp + (b.touch && b.roll ? b.roll : 0))), da = 1 / (1 + dt * (b.adamp * (b.shape === 'circle' ? 0.2 : 1) + (b.touch && b.roll ? b.roll : 0)));
      b.vx *= dm; b.vy *= dm; b.av *= da;
      const sp = Math.hypot(b.vx, b.vy); if (sp > 70) { b.vx *= 70 / sp; b.vy *= 70 / sp; }
      if (b.av > 14) b.av = 14; else if (b.av < -14) b.av = -14;
      b.x += b.vx * dt; b.y += b.vy * dt; b.ang += b.av * dt;
      if (b.vx * b.vx + b.vy * b.vy < 0.05 && b.av * b.av < 0.1) { b.sleepT += dt; if (b.sleepT > 0.5 && !b.noSleep) { b.asleep = true; b.vx = b.vy = b.av = 0; } } else b.sleepT = 0;
    }
    // wakker maken: bewegende bodies wekken hun slapende buren
    for (const ar of list) {
      const A = ar.A, B = ar.B;
      if (A.asleep && !B.asleep && !B.static && (B.vx * B.vx + B.vy * B.vy > 0.16 || B.av * B.av > 0.5)) A.wake();
      else if (B.asleep && !A.asleep && !A.static && (A.vx * A.vx + A.vy * A.vy > 0.16 || A.av * A.av > 0.5)) B.wake();
      else if ((A.asleep && !B.asleep && B.noSleep) || (B.asleep && !A.asleep && A.noSleep)) { A.wake(); B.wake(); }
    }
  }
}

// ---------- kasteel-sjabloon ----------
// Eigenschappen per materiaal: dichtheid, wrijving, hp, brandbaar
export const MATS = {
  wood: { density: 1.1, mu: 0.6, hp: 80, burn: true },
  stone: { density: 2.4, mu: 0.65, hp: 200, burn: false },
  glass: { density: 0.5, mu: 0.4, hp: 14, burn: false },
};
// [materiaal, breedte, hoogte, x (lokaal, +x = naar de vijand), laag-y-onderkant]
function castleSpec() {
  const L = [];
  const row = (mat, w, h, y, xs) => xs.forEach((x) => L.push({ mat, w, h, x, y }));
  row('stone', 4.2, 1.2, 0, [-6.3, -2.1, 2.1, 6.3]);                    // fundering
  row('wood', 4.2, 3.0, 1.2, [-6.3, -2.1, 2.1]);                        // houten muren
  row('stone', 4.2, 3.0, 1.2, [6.3]);                                   // stenen voormuur
  row('wood', 4.2, 0.7, 4.2, [-6.3, -2.1, 2.1, 6.3]);                   // vloer
  row('wood', 4.2, 2.4, 4.9, [-6.3, 6.3]);                              // bovenmuren (achter en voor)
  row('stone', 0.8, 2.4, 4.9, [-3.8]);                                  // stenen zuil achter de koning
  row('glass', 0.45, 2.4, 4.9, [3.6]);                                  // glazen raam voor de koning
  row('wood', 4.4, 0.6, 7.3, [-6.2, 6.3]);                              // zijdaken
  row('wood', 7.6, 0.6, 7.3, [0.2]);                                    // dak boven de koning
  row('stone', 2.0, 1.7, 7.9, [0]);                                     // torentje
  row('stone', 1.1, 0.9, 7.9, [-6.9, 6.9]);                             // kantelen
  return L;
}
// bouwt een kasteel in de wereld; cx = middenpunt, dir = +1 (kijkt naar rechts) of -1 (gespiegeld)
export function buildCastle(world, cx, dir, muMul = 1) {
  const blocks = [];
  const mk = (s, extra = {}) => {
    const m = MATS[s.mat];
    const b = new Body({ w: s.w, h: s.h, x: cx + s.x * dir, y: s.y + s.h / 2, density: m.density, mu: m.mu * muMul, asleep: true, user: { kind: 'block', mat: s.mat, hp: m.hp, maxHp: m.hp, w: s.w, h: s.h, burn: 0, slick: 0, sx: s.x, sy: s.y, dir, cx, mu0: m.mu * muMul, ...extra } });
    world.add(b); blocks.push(b); return b;
  };
  for (const s of castleSpec()) mk(s);
  // voorste muur (schild): twee stenen blokken
  mk({ mat: 'stone', w: 1.4, h: 2.0, x: 10.8, y: 0 }); mk({ mat: 'stone', w: 1.4, h: 2.0, x: 10.8, y: 2.0 });
  // de koning staat in de troonkamer
  const king = new Body({ w: 1.0, h: 1.8, x: cx, y: 4.9 + 0.9, density: 0.7, mu: 0.5 * muMul, asleep: true, user: { kind: 'king', hp: 60, maxHp: 60, startY: 4.9 + 0.9 } });
  world.add(king);
  return { blocks, king };
}
