// Flipperkast-natuurkunde (puur JS, geen THREE): tafel-geometrie + botsingen van ballen met muren, bumpers, flippers.
// Coördinaten: x naar rechts, z naar beneden (naar de spelers). Zwaartekracht trekt in +z. De bal is een cirkel (straal TB.BR).
// Alles werkt met substappen (zie `substeps`), zodat een snelle bal of flipper nooit door een muur "tunnelt".

export const TB = { W: 11, TOP: -15, DRAIN: 15.9, BR: 0.62, G: 16, VMAX: 36, FLIP_UP: 15, FLIP_DOWN: 10 };

// flipper-instellingen (links; rechts is gespiegeld). ang = hoek t.o.v. de x-as (positief = punt wijst naar beneden)
const FL = [
  { id: 'LL', side: 0, upper: false, px: 4.25, pz: 13.0, len: 3.75, rest: 0.49, act: -0.56 },
  { id: 'LU', side: 0, upper: true, px: 9.55, pz: 1.0, len: 2.75, rest: 0.46, act: -0.66 },
];

export function buildTable() {
  const walls = [], circles = [], flippers = [], sensors = [];
  const wall = (ax, az, bx, bz, o = {}) => walls.push({ ax, az, bx, bz, e: 0.45, kind: 'wall', cool: 0, ...o });
  const both = (fn) => { fn(-1, 0); fn(1, 1); };   // fn(spiegel, kant): kant 0 = links (Wes, x<0), kant 1 = rechts (Jor)

  // bovenboog (ellips) en zijmuren
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a0 = Math.PI + Math.PI * i / N, a1 = Math.PI + Math.PI * (i + 1) / N;
    wall(11 * Math.cos(a0), -9 + 6 * Math.sin(a0), 11 * Math.cos(a1), -9 + 6 * Math.sin(a1), { e: 0.5, arch: true });
  }
  both((m, s) => {
    wall(m * 11, -9, m * 11, 16.2, { e: 0.45, outer: true });                // buitenmuur
    wall(m * 8.8, 7.2, m * 8.8, 10.9);                                       // scheidingsmuur in-/uitloopbaan
    wall(m * 8.8, 10.9, m * 4.5, 12.45);                                     // schort naar de flipper
    // slingshot (driehoek): verticale zijde, bodem, kicker-zijde
    wall(m * 7.0, 6.4, m * 7.0, 9.6); wall(m * 7.0, 9.6, m * 5.0, 9.6);
    wall(m * 7.0, 6.4, m * 5.0, 9.6, { kind: 'sling', side: s, id: 'S' + s, e: 0.5 });
    // plankje onder de bovenste flipper + doelen (schilden) op de muur
    wall(m * 11, -0.5, m * 9.75, 0.45, { e: 0.3 });
    wall(m * 11, 3.6, m * 9.95, 5.7, { e: 0.35 });                           // afleider: duwt de bal van de muur af de baan in
    for (let k = 0; k < 3; k++) { const z = -7.4 + k * 1.65; wall(m * 10.5, z - 0.6, m * 10.5, z + 0.6, { kind: 'target', side: s, id: 'T' + s + k, k, e: 0.5 }); }
    // paaltjes
    circles.push({ x: m * 8.8, z: 7.2, r: 0.22, e: 0.5, kind: 'post' }, { x: m * 7.0, z: 6.4, r: 0.18, e: 0.5, kind: 'post' });
    // spinner-sensor (links/rechts)
    sensors.push({ id: 'SP' + s, kind: 'spinner', side: s, x: m * 8.3, z: -6.9, r: 1.15, t: 0 });
    // uitloop-redding (kicker)
    sensors.push({ id: 'OL' + s, kind: 'outlane', side: s, x: m * 9.9, z: 13.4, r: 1.0, armed: true });
  });
  // pop-bumpers (kasteeltorens), draak en kip
  const bump = [[-4.4, -6.3], [4.4, -6.3], [0, -3.0]];
  bump.forEach(([x, z], i) => circles.push({ x, z, r: 1.15, e: 1, kind: 'bumper', id: 'B' + i, kick: 15 }));
  circles.push({ x: 0, z: -10.6, r: 1.9, e: 0.8, kind: 'dragon', id: 'D', kick: 11 });
  const chicken = { x: 0, z: 2.0, r: 0.85, e: 0.8, kind: 'chicken', id: 'K', kick: 12, dir: 1, minX: -5.2, maxX: 5.2, spd: 2.2, on: true };
  circles.push(chicken);
  // sensoren
  sensors.push({ id: 'RAMP', kind: 'ramp', x: 0, z: 5.6, r: 1.25, cool: 0 });
  sensors.push({ id: 'CHEST', kind: 'chest', x: 0, z: -13.7, r: 0.95, cool: 0 });
  // flippers
  for (const f of FL) both((m, s) => flippers.push({ ...f, id: f.id + s, side: s, dirX: -m, px: m * f.px, ang: f.rest, vel: 0, r0: f.upper ? 0.5 : 0.58, r1: f.upper ? 0.28 : 0.32, lenMul: 1, press: false }));
  flippers.forEach((f) => { circles.push({ x: f.px, z: f.pz, r: f.r0 * 0.98, e: 0.4, kind: 'post' }); });
  return { walls, circles, flippers, sensors, chicken, bumpers: circles.filter((c) => c.kind === 'bumper') };
}

export function makeBall(x = 0, z = 0) { return { on: false, x, z, vx: 0, vz: 0, r: TB.BR, owner: -1, id: 0, ramp: null, age: 0, last: -1, still: 0 }; }

// ---- botsingen ----
function bounce(b, nx, nz, e, kick) {
  const vn = b.vx * nx + b.vz * nz;
  if (vn < 0) {
    const ee = vn > -1.6 ? 0 : e;               // rustige aanraking: niet stuiteren (voorkomt trillen)
    b.vx -= (1 + ee) * vn * nx; b.vz -= (1 + ee) * vn * nz;
    if (kick) { const out = b.vx * nx + b.vz * nz; if (out < kick) { b.vx += (kick - out) * nx; b.vz += (kick - out) * nz; } }
    return -vn;
  }
  return 0;
}
function hitSeg(b, w, cb) {
  const abx = w.bx - w.ax, abz = w.bz - w.az, l2 = abx * abx + abz * abz;
  let t = ((b.x - w.ax) * abx + (b.z - w.az) * abz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = w.ax + abx * t, pz = w.az + abz * t; let dx = b.x - px, dz = b.z - pz; const d2 = dx * dx + dz * dz;
  if (d2 >= b.r * b.r) return;
  let d = Math.sqrt(d2); let nx, nz;
  if (d < 1e-6) { const l = Math.sqrt(l2); nx = -abz / l; nz = abx / l; d = 0; } else { nx = dx / d; nz = dz / d; }
  b.x = px + nx * b.r; b.z = pz + nz * b.r;
  const sp = bounce(b, nx, nz, w.e, w.kind === 'sling' ? 17 : 0);
  if (sp > 0.8 && cb) cb(w.kind, w, b, sp, nx, nz);
}
function hitCircle(b, c, cb) {
  const dx = b.x - c.x, dz = b.z - c.z, mm = b.r + c.r, d2 = dx * dx + dz * dz;
  if (d2 >= mm * mm) return;
  let d = Math.sqrt(d2), nx, nz; if (d < 1e-6) { nx = 0; nz = 1; d = 0; } else { nx = dx / d; nz = dz / d; }
  b.x = c.x + nx * mm; b.z = c.z + nz * mm;
  const sp = bounce(b, nx, nz, c.e, c.kick || 0);
  if (sp > 0.8 && cb && c.kind !== 'post') cb(c.kind, c, b, sp, nx, nz);
  else if (sp > 4 && cb) cb('post', c, b, sp, nx, nz);
}
// flipper: capsule van pivot naar punt, straal loopt af. Draaisnelheid geeft de bal een klap.
export function flipperTip(f, out) {
  const L = f.len * f.lenMul; out.x = f.px + f.dirX * Math.cos(f.ang) * L; out.z = f.pz + Math.sin(f.ang) * L; return out;
}
const _tip = { x: 0, z: 0 };
function hitFlipper(b, f, cb) {
  const L = f.len * f.lenMul; flipperTip(f, _tip);
  const abx = _tip.x - f.px, abz = _tip.z - f.pz;
  let t = ((b.x - f.px) * abx + (b.z - f.pz) * abz) / (L * L); t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = f.px + abx * t, cz = f.pz + abz * t, rf = f.r0 + (f.r1 - f.r0) * t;
  const dx = b.x - cx, dz = b.z - cz, mm = b.r + rf, d2 = dx * dx + dz * dz;
  if (d2 >= mm * mm) return;
  let d = Math.sqrt(d2), nx, nz;
  if (d < 1e-6) { nx = 0; nz = -1; d = 0; } else { nx = dx / d; nz = dz / d; }
  b.x = cx + nx * mm; b.z = cz + nz * mm;
  // snelheid van het flipper-oppervlak op dit punt
  const s = t * L, w = f.vel; const sx = -f.dirX * Math.sin(f.ang) * s * w, sz = Math.cos(f.ang) * s * w;
  const rvx = b.vx - sx, rvz = b.vz - sz, vn = rvx * nx + rvz * nz;
  if (vn >= 0) return;
  const e = Math.abs(w) > 1 ? 0.55 : 0.25, ee = vn > -1.6 ? 0 : e;
  b.vx -= (1 + ee) * vn * nx; b.vz -= (1 + ee) * vn * nz;
  const sp = Math.hypot(b.vx, b.vz); if (sp > TB.VMAX) { b.vx *= TB.VMAX / sp; b.vz *= TB.VMAX / sp; }
  if (cb && (-vn > 1.2)) cb('flipper', f, b, -vn, nx, nz, t);
}

// aantal substappen voor een frame: ver genoeg onder de balstraal blijven per stap
export function substeps(T, dt, balls) {
  let vmax = 8;
  for (const b of balls) if (b.on && !b.ramp) vmax = Math.max(vmax, Math.hypot(b.vx, b.vz) + TB.G * dt);
  for (const f of T.flippers) vmax = Math.max(vmax, Math.abs(f.vel) * f.len * f.lenMul * 1.1);
  return Math.max(1, Math.min(24, Math.ceil(dt * vmax / 0.22)));
}

// één substap: flippers bewegen, ballen vallen en botsen. cb(kind, obj, ball, snelheid, nx, nz[, t]) meldt botsingen.
export function stepTable(T, balls, h, grav, cb, dragF = 0.03) {
  for (const f of T.flippers) {
    const target = f.press ? f.act : f.rest, sp = f.press ? TB.FLIP_UP : TB.FLIP_DOWN;
    const dA = target - f.ang, mv = Math.sign(dA) * Math.min(Math.abs(dA), sp * h);
    f.ang += mv; f.vel = mv / h;
    if (Math.abs(dA) < 1e-6) f.vel = 0;
  }
  const ch = T.chicken; if (ch.on) { ch.x += ch.dir * ch.spd * h; if (ch.x > ch.maxX) { ch.x = ch.maxX; ch.dir = -1; } else if (ch.x < ch.minX) { ch.x = ch.minX; ch.dir = 1; } }
  for (const b of balls) {
    if (!b.on || b.ramp) continue;
    b.vz += grav * h; const dm = 1 - dragF * h; b.vx *= dm; b.vz *= dm;
    const sp = Math.hypot(b.vx, b.vz); if (sp > TB.VMAX) { b.vx *= TB.VMAX / sp; b.vz *= TB.VMAX / sp; }
    b.x += b.vx * h; b.z += b.vz * h;
    for (let pass = 0; pass < 2; pass++) {
      for (const w of T.walls) hitSeg(b, w, cb);
      for (const c of T.circles) hitCircle(b, c, cb);
      for (const f of T.flippers) hitFlipper(b, f, cb);
    }
    // nooit buiten de muren (veiligheidsnet): de zijmuren lopen tot onder de afvoer
    if (b.z < TB.TOP + b.r) { b.z = TB.TOP + b.r; if (b.vz < 0) b.vz = -b.vz * 0.5; }
    if (b.x < -TB.W + b.r && b.z < TB.DRAIN) { b.x = -TB.W + b.r; if (b.vx < 0) b.vx = -b.vx * 0.4; }
    if (b.x > TB.W - b.r && b.z < TB.DRAIN) { b.x = TB.W - b.r; if (b.vx > 0) b.vx = -b.vx * 0.4; }
  }
  // bal-bal botsingen (multiball)
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
    const A = balls[i], B = balls[j]; if (!A.on || !B.on || A.ramp || B.ramp) continue;
    const dx = B.x - A.x, dz = B.z - A.z, mm = A.r + B.r, d2 = dx * dx + dz * dz;
    if (d2 < mm * mm && d2 > 1e-8) {
      const d = Math.sqrt(d2), nx = dx / d, nz = dz / d, ov = (mm - d) / 2;
      A.x -= nx * ov; A.z -= nz * ov; B.x += nx * ov; B.z += nz * ov;
      const vn = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
      if (vn > 0) { A.vx -= vn * nx; A.vz -= vn * nz; B.vx += vn * nx; B.vz += vn * nz; if (cb && vn > 3) cb('ballball', null, A, vn, nx, nz); }
    }
  }
}
