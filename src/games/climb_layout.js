// De Torenklim: layout van de twee torens + de (pure) speler-natuurkunde. Geen THREE: ook te draaien in node (tools/test_climb.mjs).
//
// Coördinaten: x horizontaal (links = Wes' toren, rechts = Jor' toren), y omhoog. `u` is de afstand vanaf het hart van de eigen toren
// richting het midden (de torens zijn elkaars spiegelbeeld). Alle platforms zijn "doorspringbaar" (je landt er alleen bovenop).

export const TOWER_X = 9.5;           // hart van de torens (±)
export const TOWER_HALF = 6;          // halve breedte van een toren
export const WORLD_X = 17.4;          // onzichtbare muur
export const RUN = 7.2;
export const GRAV = 44;
export const JUMP_V = 17;             // hoogte 17²/88 = 3,28
export const DJUMP_V = 13.5;          // dubbele sprong: +2,07
export const SPRING_V = 27.5;         // trampoline: 8,6 hoog
export const PAD_V = 22.5;            // springplaat: 5,75 hoog
export const TERM_V = -34;
export const FEET_HW = 0.38;          // halve breedte van de voeten
export const PLAYER_H = 2.0;
export const JUMP_H = JUMP_V * JUMP_V / (2 * GRAV);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;

// ---------------- layout ----------------
// [y, u, breedte, type, extra]. Types: stone | cloud (verdwijnt) | move (zijwaarts, extra.ax) | lift (op/neer, extra.ay)
const ROUTE = [
  // zone A: de tuin (makkelijk)
  [2.4, -3.0, 4.2, 'stone'], [4.8, 1.5, 4.0, 'stone'], [7.2, 4.6, 3.6, 'stone'], [9.6, 1.2, 3.8, 'stone'], [12.1, -3.2, 3.8, 'stone'],
  [14.5, 0.5, 4.4, 'stone', { spikes: [[1.5, 2.6]] }], [16.9, 4.0, 3.6, 'move', { ax: 1.6, sp: 1.1 }], [19.3, 2.5, 3.6, 'stone'],
  // gedeelde brug 1 (21,7) volgt hieronder
  // zone B: de kasteelmuur
  [24.1, 3.8, 3.4, 'stone'], [26.6, 0.2, 3.6, 'move', { ax: 2.0, sp: 1.2 }], [29.0, -3.6, 3.6, 'stone', { shoe: true }], [31.5, -0.4, 3.2, 'stone', { spikes: [[-1.9, -1.0]] }],
  [33.7, 3.4, 3.6, 'lift', { ay: 0.8, sp: 1.3 }], [36.4, -1.0, 3.6, 'stone'], [38.8, -4.4, 3.4, 'stone'], [41.2, -0.6, 3.6, 'move', { ax: 2.2, sp: 1.15 }], [43.6, 3.6, 3.6, 'stone'],
  // zone C: de wolken
  [46.0, -2.8, 3.6, 'cloud'], [48.4, 3.6, 3.4, 'cloud'],
  // gedeelde brug 2 (50,8)
  [53.3, 3.6, 3.2, 'cloud'], [55.7, -0.2, 3.4, 'cloud'], [58.1, -4.0, 3.4, 'stone', { shoe: true }], [60.5, -0.8, 3.6, 'move', { ax: 2.4, sp: 1.3 }], [62.9, 3.4, 3.4, 'cloud'],
  [65.3, 0.2, 3.2, 'stone', { spikes: [[1.0, 1.8]] }], [67.7, -3.6, 3.6, 'cloud'], [70.1, 2.8, 3.4, 'stone'],
  // gedeelde brug 3 (72,3)
  // zone D: de daken
  [74.9, 3.8, 3.6, 'stone', { shoe: true }], [77.3, 0.4, 3.4, 'stone', { spikes: [[-0.9, -0.2]] }], [79.7, -3.6, 3.6, 'move', { ax: 1.8, sp: 1.2 }], [82.1, -0.2, 3.4, 'cloud'],
  [84.5, 3.4, 3.4, 'stone'], [86.9, 0.0, 3.2, 'lift', { ay: 0.8, sp: 1.2 }], [89.3, -3.4, 3.4, 'stone'], [91.7, 0.2, 3.4, 'stone'], [94.1, 3.4, 3.4, 'move', { ax: 1.6, sp: 1.25 }],
];
// route-indexen waar de gedeelde bruggen tussen zitten (brug staat tussen ROUTE[i-1] en ROUTE[i])
const BRIDGES = [{ y: 21.7, before: 8 }, { y: 50.8, before: 19 }, { y: 72.5, before: 29 }];
// trampolines en springplaten (naast de route; ongelijk met de route zelf een sluiproute)
const SPRINGS = [{ y: 9.6, u: -1.8 }, { y: 29.0, u: -0.2 }, { y: 62.9, u: -0.6 }];
const PADS = [{ y: 14.5, u: -0.9 }, { y: 89.3, u: -2.2 }];
export const TOP_Y = 96.5;

export function towerX(tower, u) { return tower === 0 ? -TOWER_X + u : tower === 1 ? TOWER_X - u : u; }

export function buildLayout() {
  const P = []; let id = 0;
  const add = (o) => { const p = { id: id++, tower: 0, type: 'stone', u: 0, w: 4, y0: 0, ax: 0, ay: 0, sp: 1, ph: 0, spikes: null, shoe: false, spring: false, pad: false, route: false, step: -1, x: 0, y: 0, dx: 0, dy: 0, gone: false, goneT: 0, standT: 0, stood: false, ...o }; P.push(p); return p; };
  // de vloer: één lange platform over beide torens
  add({ tower: 2, type: 'ground', u: 0, w: WORLD_X * 2 + 2, y0: 0, route: true, step: 0, ground: true });
  for (const tower of [0, 1]) {
    let step = 1;
    ROUTE.forEach((r, i) => {
      const [y, u, w, type, ex = {}] = r;
      add({ tower, type, u, w, y0: y, ax: ex.ax || 0, ay: ex.ay || 0, sp: ex.sp || 1, ph: tower ? Math.PI * 0 : 0, spikes: ex.spikes || null, shoe: !!ex.shoe, route: true, step: step++, idx: i });
    });
    for (const s of SPRINGS) add({ tower, type: 'spring', u: s.u, w: 1.8, y0: s.y, spring: true });
    for (const s of PADS) add({ tower, type: 'pad', u: s.u, w: 1.4, y0: s.y, pad: true });
  }
  for (const b of BRIDGES) add({ tower: 2, type: 'bridge', u: 0, w: 6.4, y0: b.y, route: true, shared: true, bridge: true, idx: b.before - 0.5 });
  // de top (kasteeltop), per toren, met de vlag
  for (const tower of [0, 1]) add({ tower, type: 'top', u: 0, w: 5.2, y0: TOP_Y, route: true, step: 99, top: true });
  updatePlatforms(P, 0, 0, true);
  return P;
}

export function updatePlatforms(P, t, dt, init = false) {
  for (const p of P) {
    const nu = p.u + (p.ax ? p.ax * Math.sin(t * p.sp + p.ph) : 0), nx = towerX(p.tower, nu);
    const ny = p.y0 + (p.ay ? p.ay * Math.sin(t * p.sp + p.ph) : 0);
    if (init) { p.dx = 0; p.dy = 0; } else { p.dx = nx - p.x; p.dy = ny - p.y; }
    p.x = nx; p.y = ny;
    if (p.type === 'cloud' && dt > 0) {
      if (p.gone) { p.goneT -= dt; if (p.goneT <= 0) { p.gone = false; p.standT = 0; } }
      else if (p.stood) { p.standT += dt; if (p.standT > 0.9) { p.gone = true; p.goneT = 3.4; p.standT = 0; } }
      else p.standT = Math.max(0, p.standT - dt * 0.6);
    }
    p.stood = false;
  }
}
// wereldposities van de stekels van een platform: [[xa, xb], ...]
export function spikeRanges(p) {
  if (!p.spikes) return null;
  return p.spikes.map(([a, b]) => { const xa = towerX(p.tower, p.u + a), xb = towerX(p.tower, p.u + b); return xa < xb ? [xa, xb] : [xb, xa]; });
}

// ---------------- speler ----------------
export function newPlayer(tower) {
  return { tower, x: towerX(tower, 0), y: 0, vx: 0, vy: 0, face: tower === 0 ? 1 : -1, ground: null, coyote: 0, jbuf: 0, canDouble: true, stun: 0, shoe: 0, maxY: 0, lastStatic: null, padCd: 0, ev: [], dead: false, jumping: false };
}
const approach = (v, target, d) => (v < target ? Math.min(target, v + d) : Math.max(target, v - d));

// Eén stap. W = { P, gm (zwaartekracht), sp (loopsnelheid), slip, size }. Geeft pl.ev terug (lijst gebeurtenissen).
export function stepPlayer(pl, inp, dt, W) {
  const ev = pl.ev; ev.length = 0;
  const hw = FEET_HW * W.size, stun = pl.stun > 0, act = !stun && !pl.dead;
  const ix = act ? clamp(inp.x, -1, 1) : 0;
  const grounded = !!pl.ground;
  const speed = RUN * W.sp * (pl.shoe > 0 ? 1.08 : 1);
  if (stun) pl.vx *= Math.exp(-(grounded ? 6 : 0.8) * dt);
  else {
    const acc = grounded ? lerp(85, 14, W.slip) : lerp(48, 12, W.slip);
    pl.vx = approach(pl.vx, ix * speed, acc * dt);
    if (Math.abs(ix) > 0.2) pl.face = ix > 0 ? 1 : -1;
  }
  if (grounded) { pl.coyote = 0.11; pl.canDouble = true; } else pl.coyote -= dt;
  pl.jbuf -= dt; pl.padCd -= dt;
  const jv = JUMP_V * (pl.shoe > 0 ? 1.28 : 1);
  if (act && inp.aP) {
    if (grounded || pl.coyote > 0) { pl.vy = jv; pl.ground = null; pl.coyote = 0; pl.jumping = true; ev.push('jump'); }
    else if (pl.canDouble) { pl.vy = DJUMP_V * (pl.shoe > 0 ? 1.25 : 1); pl.canDouble = false; ev.push('djump'); }
    else pl.jbuf = 0.1;
  } else if (act && pl.jbuf > 0 && grounded) { pl.vy = jv; pl.ground = null; pl.jbuf = 0; ev.push('jump'); }
  // zwaartekracht + bewegen
  const prevY = pl.y;
  if (!pl.ground) { pl.vy = Math.max(TERM_V, pl.vy - GRAV * W.gm * dt); pl.y += pl.vy * dt; }
  pl.x += pl.vx * dt;
  if (pl.x > WORLD_X) { pl.x = WORLD_X; pl.vx = Math.min(0, pl.vx); } else if (pl.x < -WORLD_X) { pl.x = -WORLD_X; pl.vx = Math.max(0, pl.vx); }
  // platforms
  if (pl.ground) {
    const p = pl.ground;
    if (!p.gone && pl.x + hw > p.x - p.w / 2 && pl.x - hw < p.x + p.w / 2) { pl.x += p.dx; pl.y = p.y; pl.vy = 0; p.stood = true; }
    else { pl.ground = null; pl.vy = 0; }
  }
  if (!pl.ground && pl.vy <= 0.001) {
    let best = null;
    for (const p of W.P) {
      if (p.gone || p.type === 'deco') continue;
      if (pl.x + hw <= p.x - p.w / 2 || pl.x - hw >= p.x + p.w / 2) continue;
      const topPrev = p.y - p.dy;
      if (prevY >= topPrev - 0.14 && pl.y <= p.y + 0.0001 && (!best || p.y > best.y)) best = p;
    }
    if (best) {
      const fall = -pl.vy;
      pl.ground = best; pl.y = best.y; pl.vy = 0; pl.jumping = false; best.stood = true; pl.canDouble = true;
      if (fall > 5) ev.push('land');
      if (best.spring && pl.padCd <= 0) { pl.vy = SPRING_V + 0; pl.ground = null; pl.padCd = 0.25; pl.bounce = best; ev.push('spring'); pl.y = best.y + 0.01; }
      else if (best.pad && pl.padCd <= 0) { pl.vy = PAD_V; pl.ground = null; pl.padCd = 0.25; pl.bounce = best; ev.push('pad'); pl.y = best.y + 0.01; }
      else if (!best.spikes && (best.type === 'stone' || best.type === 'top' || best.type === 'ground' || best.type === 'bridge')) pl.lastStatic = best;
    }
  }
  if (pl.ground && (pl.ground.spring || pl.ground.pad) && pl.padCd <= 0) { pl.vy = pl.ground.spring ? SPRING_V : PAD_V; ev.push(pl.ground.spring ? 'spring' : 'pad'); pl.bounce = pl.ground; pl.ground = null; pl.padCd = 0.25; }
  if (pl.stun > 0) pl.stun = Math.max(0, pl.stun - dt);
  if (pl.shoe > 0) pl.shoe = Math.max(0, pl.shoe - dt);
  if (pl.y > pl.maxY) pl.maxY = pl.y;
  return ev;
}

// ---------------- haalbaarheid ----------------
// kan een speler met één gewone sprong van platform A op platform B komen? (marge m: 0.92 = 8% veiligheidsmarge)
export function reachRange(p) { return { lo: towerX(p.tower, p.u - (p.ax || 0)) , hi: towerX(p.tower, p.u + (p.ax || 0)), y0: p.y0 - (p.ay || 0), y1: p.y0 + (p.ay || 0), w: p.w, tower: p.tower }; }
export function canReach(A, B, { margin = 0.9, sp = 1, jumpV = JUMP_V, grav = GRAV, dbl = false } = {}) {
  // gaten in x tussen de uiterste standen
  const ax0 = Math.min(towerX(A.tower, A.u - A.ax), towerX(A.tower, A.u + A.ax)) - A.w / 2, ax1 = Math.max(towerX(A.tower, A.u - A.ax), towerX(A.tower, A.u + A.ax)) + A.w / 2;
  const bx0 = Math.min(towerX(B.tower, B.u - B.ax), towerX(B.tower, B.u + B.ax)) - B.w / 2, bx1 = Math.max(towerX(B.tower, B.u - B.ax), towerX(B.tower, B.u + B.ax)) + B.w / 2;
  const gap = Math.max(0, Math.max(bx0 - ax1, ax0 - bx1));
  const ayHi = A.y0 + (A.ay || 0), byLo = B.y0 - (B.ay || 0);
  const dy = byLo - (A.ay ? ayHi - 2 * A.ay : A.y0);                    // laagste landing t.o.v. A's laagste stand
  const dyUp = B.y0 - (B.ay || 0) - A.y0 - (A.ay || 0) * 0;               // ruwe stijging
  const rise = Math.max(dy, byLo - ayHi);
  const hmax = jumpV * jumpV / (2 * grav) + (dbl ? DJUMP_V * DJUMP_V / (2 * grav) : 0);
  const need = Math.max(0, byLo - (A.y0 + (A.ay || 0)));
  if (need > hmax * margin) return { ok: false, why: `te hoog (${need.toFixed(2)} > ${(hmax * margin).toFixed(2)})`, gap, need };
  // vlucht: stijg `need`, tijd tot die hoogte op de neergaande tak
  const v2 = jumpV * jumpV - 2 * grav * need;
  const t = (jumpV + Math.sqrt(Math.max(0, v2))) / grav;
  const reach = RUN * sp * t * margin;
  if (gap > reach) return { ok: false, why: `te ver (${gap.toFixed(2)} > ${reach.toFixed(2)})`, gap, need };
  return { ok: true, gap, need, reach };
}

// Controleert de hele route: elke routeplatform moet vanaf een eerder (lager) platform haalbaar zijn. Geeft een lijst problemen.
export function checkLayout(P, opts = {}) {
  const problems = [];
  const reachable = new Set(); const byTower = [0, 1];
  const solid = P.filter((p) => !p.spring && !p.pad);
  for (const tower of byTower) {
    const mine = solid.filter((p) => p.tower === tower || p.tower === 2).sort((a, b) => a.y0 - b.y0);
    const ok = new Set([mine[0].id]);
    for (const B of mine.slice(1)) {
      let found = null;
      for (const A of mine) { if (A === B || !ok.has(A.id) || A.y0 >= B.y0 + 0.01) continue; const r = canReach(A, B, opts); if (r.ok) { found = A; break; } }
      if (found) ok.add(B.id); else if (B.route) problems.push(`toren ${tower}: platform ${B.id} (${B.type} y=${B.y0} u=${B.u}) is niet te bereiken`);
    }
    if (!mine.some((p) => p.top && ok.has(p.id))) problems.push(`toren ${tower}: de top is niet bereikbaar`);
  }
  // trampolines en springplaten: halen ze hun doel?
  for (const s of P.filter((p) => p.spring || p.pad)) {
    const v = s.spring ? SPRING_V : PAD_V, h = v * v / (2 * GRAV);
    const tgt = P.filter((p) => !p.spring && !p.pad && (p.tower === s.tower || p.tower === 2) && p.y0 > s.y0 + 1 && p.y0 < s.y0 + h - 0.3);
    if (!tgt.length) problems.push(`${s.type} ${s.id} (y=${s.y0}) heeft geen doel`);
    else {
      const best = tgt.reduce((a, b) => (b.y0 > a.y0 ? b : a));
      const x0 = towerX(s.tower, s.u);
      const gap = Math.max(0, Math.abs(x0 - best.x) - best.w / 2 - s.w / 2);
      const t = (v + Math.sqrt(Math.max(0, v * v - 2 * GRAV * (best.y0 - s.y0)))) / GRAV;
      if (gap > RUN * t * 0.9) problems.push(`${s.type} ${s.id}: doel ${best.id} te ver weg`);
    }
  }
  return problems;
}
