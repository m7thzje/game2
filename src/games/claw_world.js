import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving van "Grijpkraan-Gekte": één reusachtige glazen grijpkast op de kermis (nacht), met reuzenrad, tenten en lichtslingers.
// Ook: prijs-modellen (samengevoegd met vertexkleuren, geïnstancet in claw.js).

export const CB = { X: 11.2, ZB: -4.0, ZF: 3.4, CEIL: 9.8, HOLE_W: 3.4, HOLE_D: 3.0 };

// ---------------- hulpjes ----------------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _n3 = new THREE.Matrix3();
// parts: [{ g: geometry, c: kleur, p:[x,y,z], r:[rx,ry,rz], s: getal|[sx,sy,sz] }] -> één geometrie met vertexkleuren
export function bakeGeo(parts) {
  const geos = parts.map((o) => {
    const g = o.g.index ? o.g.toNonIndexed() : o.g.clone();
    const sc = typeof o.s === 'number' ? [o.s, o.s, o.s] : (o.s || [1, 1, 1]);
    _e.set(...(o.r || [0, 0, 0])); _q.setFromEuler(_e); _v.set(...(o.p || [0, 0, 0])); _s.set(...sc);
    _m4.compose(_v, _q, _s); g.applyMatrix4(_m4);
    return [g, new THREE.Color(o.c)];
  });
  const n = geos.reduce((a, [g]) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  for (const [g, c] of geos) {
    const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < k; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += k; g.dispose();
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mg.computeBoundingSphere();
  return mg;
}
const S = (r, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const C = (rt, rb, h, n = 10) => new THREE.CylinderGeometry(rt, rb, h, n);
const K = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);

// ---------------- prijsmodellen (middelpunt = bolcentrum van de fysica) ----------------
export function prizeGeo(kind) {
  switch (kind) {
    case 'teddy': case 'teddy2': {
      const f = kind === 'teddy' ? 0xa8683a : 0xf08ac0, bl = kind === 'teddy' ? 0xe8c490 : 0xffd0ea, dk = 0x2a1a14;
      return bakeGeo([
        { g: S(0.55), c: f, p: [0, -0.12, 0], s: [1, 1.05, 0.9] }, { g: S(0.3), c: bl, p: [0, -0.1, 0.4], s: [1, 1.1, 0.5] },
        { g: S(0.42), c: f, p: [0, 0.55, 0.05] }, { g: S(0.17), c: f, p: [-0.33, 0.9, 0] }, { g: S(0.17), c: f, p: [0.33, 0.9, 0] },
        { g: S(0.17), c: bl, p: [0, 0.5, 0.38], s: [1.2, 0.9, 0.8] }, { g: S(0.06, 6, 5), c: dk, p: [0, 0.55, 0.52] },
        { g: S(0.06, 6, 5), c: dk, p: [-0.16, 0.66, 0.38] }, { g: S(0.06, 6, 5), c: dk, p: [0.16, 0.66, 0.38] },
        { g: S(0.2), c: f, p: [-0.58, -0.02, 0.1] }, { g: S(0.2), c: f, p: [0.58, -0.02, 0.1] },
        { g: S(0.23), c: f, p: [-0.3, -0.62, 0.22] }, { g: S(0.23), c: f, p: [0.3, -0.62, 0.22] },
        { g: B(0.5, 0.14, 0.1), c: kind === 'teddy' ? 0xd8372c : 0x58d6ff, p: [0, 0.2, 0.36] },
      ]);
    }
    case 'eend':
      return bakeGeo([
        { g: S(0.55), c: 0xffd23f, p: [0, -0.1, 0], s: [1.05, 0.88, 1.2] }, { g: S(0.34), c: 0xffd23f, p: [0, 0.5, 0.3] },
        { g: B(0.3, 0.1, 0.28), c: 0xff8a1c, p: [0, 0.44, 0.62] }, { g: S(0.05, 6, 5), c: 0x111111, p: [-0.15, 0.58, 0.5] }, { g: S(0.05, 6, 5), c: 0x111111, p: [0.15, 0.58, 0.5] },
        { g: S(0.22), c: 0xf0b820, p: [-0.5, -0.05, 0], s: [0.5, 0.8, 1.2] }, { g: S(0.22), c: 0xf0b820, p: [0.5, -0.05, 0], s: [0.5, 0.8, 1.2] }, { g: K(0.16, 0.3, 5), c: 0xffd23f, p: [0, 0.1, -0.62], r: [-1.2, 0, 0] },
      ]);
    case 'bal':
      return bakeGeo([{ g: S(0.6, 14, 10), c: 0xffffff }, { g: new THREE.TorusGeometry(0.6, 0.07, 6, 18), c: 0xb0b0b0, r: [Math.PI / 2, 0, 0] }, { g: new THREE.TorusGeometry(0.6, 0.07, 6, 18), c: 0xb0b0b0, r: [0, 0.7, 0] }, { g: S(0.12, 6, 5), c: 0x888888, p: [0, 0.6, 0] }]);
    case 'kist':
      return bakeGeo([
        { g: B(1.5, 0.9, 1.0), c: 0x8a5a2b, p: [0, -0.15, 0] }, { g: C(0.5, 0.5, 1.5, 8), c: 0x9a6a33, p: [0, 0.3, 0], r: [0, 0, Math.PI / 2] },
        { g: B(0.2, 1.3, 1.06), c: 0xf2c230, p: [-0.5, -0.05, 0] }, { g: B(0.2, 1.3, 1.06), c: 0xf2c230, p: [0.5, -0.05, 0] }, { g: B(0.22, 0.28, 0.12), c: 0xffe680, p: [0, 0.18, 0.55] },
        { g: S(0.16, 8, 6), c: 0xffe14a, p: [0.2, 0.62, 0.0] },
      ]);
    case 'goudkip':
      return bakeGeo([
        { g: S(0.5), c: 0xffcf3a, p: [0, -0.1, 0], s: [0.9, 0.95, 1.2] }, { g: S(0.28), c: 0xffcf3a, p: [0, 0.5, 0.3] }, { g: K(0.1, 0.3, 4), c: 0xff9a1c, p: [0, 0.46, 0.62], r: [Math.PI / 2, 0, 0] },
        { g: B(0.08, 0.2, 0.26), c: 0xe03030, p: [0, 0.82, 0.28] }, { g: K(0.3, 0.7, 4), c: 0xe8b020, p: [0, 0.1, -0.62], r: [-1.1, 0, 0] },
        { g: S(0.05, 6, 5), c: 0x222222, p: [-0.14, 0.58, 0.5] }, { g: S(0.05, 6, 5), c: 0x222222, p: [0.14, 0.58, 0.5] },
        { g: C(0.2, 0.2, 0.2, 8), c: 0xe8b020, p: [0, -0.62, 0] },
      ]);
    case 'bom':
      return bakeGeo([
        { g: S(0.62, 14, 10), c: 0x2a2a30 }, { g: C(0.2, 0.26, 0.2, 8), c: 0x6a6a74, p: [0, 0.62, 0] }, { g: new THREE.TorusGeometry(0.6, 0.06, 6, 18), c: 0xd8372c, r: [Math.PI / 2, 0, 0], p: [0, 0.05, 0] },
        { g: C(0.04, 0.04, 0.4, 5), c: 0xc8a050, p: [0.1, 0.9, 0], r: [0, 0, -0.5] }, { g: S(0.13, 6, 5), c: 0xffffff, p: [0, 0.1, 0.56], s: [1, 1.2, 0.5] },
      ]);
    case 'deurman':
      return bakeGeo([
        { g: C(0.24, 0.3, 1.3, 8), c: 0x2a2a33, p: [0, -0.05, 0] }, { g: S(0.3, 12, 9), c: 0xe6e6dc, p: [0, 0.85, 0], s: [0.9, 1.25, 0.9] },
        { g: S(0.07, 6, 5), c: 0x050505, p: [-0.11, 0.95, 0.24], s: [1, 1.5, 0.5] }, { g: S(0.07, 6, 5), c: 0x050505, p: [0.11, 0.95, 0.24], s: [1, 1.5, 0.5] },
        { g: new THREE.TorusGeometry(0.15, 0.03, 5, 12, Math.PI), c: 0x050505, p: [0, 0.74, 0.26], r: [0, 0, Math.PI] },
        { g: C(0.05, 0.05, 1.1, 5), c: 0x2a2a33, p: [-0.38, -0.05, 0.1], r: [0.15, 0, 0.08] }, { g: C(0.05, 0.05, 1.1, 5), c: 0x2a2a33, p: [0.38, -0.05, 0.1], r: [0.15, 0, -0.08] },
        { g: C(0.07, 0.07, 0.9, 5), c: 0x1c1c22, p: [-0.12, -1.0, 0] }, { g: C(0.07, 0.07, 0.9, 5), c: 0x1c1c22, p: [0.12, -1.0, 0] },
        { g: B(0.1, 0.5, 0.04), c: 0xd8372c, p: [0, 0.0, 0.3] },
      ]);
    case 'kroon': {
      const parts = [{ g: C(0.5, 0.42, 0.45, 10), c: 0xffd23f, p: [0, -0.1, 0] }, { g: new THREE.TorusGeometry(0.46, 0.06, 5, 12), c: 0xfff0a0, r: [Math.PI / 2, 0, 0], p: [0, -0.3, 0] }];
      for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; parts.push({ g: K(0.14, 0.5, 4), c: 0xffd23f, p: [Math.cos(a) * 0.42, 0.3, Math.sin(a) * 0.42] }, { g: S(0.09, 6, 5), c: [0xff3a3a, 0x3a8aff, 0x3aff7a][k % 3], p: [Math.cos(a) * 0.42, 0.6, Math.sin(a) * 0.42] }); }
      return bakeGeo(parts);
    }
    default: return bakeGeo([{ g: S(0.6), c: 0xffffff }]);
  }
}

// ---------------- teksttextuur ----------------
function signTex() {
  return canvasTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff3a8a'); gr.addColorStop(1, '#9a1a6a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffe14a'; g.lineWidth = 10; g.strokeRect(14, 14, w - 28, h - 28);
    g.font = 'bold 120px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 16; g.strokeStyle = '#3a0a30'; g.lineJoin = 'round'; g.strokeText('GRIJPKRAAN', w / 2, 100); g.fillStyle = '#ffe14a'; g.fillText('GRIJPKRAAN', w / 2, 100);
    g.font = 'bold 88px Fredoka, Arial Black, sans-serif'; g.strokeText('GEKTE!!', w / 2, 192); g.fillStyle = '#7af0ff'; g.fillText('GEKTE!!', w / 2, 192);
  });
}
function floorTex() {
  return canvasTex(512, 256, (g, w, h) => {
    const r = mulberry32(12);
    g.fillStyle = '#5a2a78'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${150 + r() * 100 | 0},${100 + r() * 100 | 0},255,${0.12 + r() * 0.25})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
    g.fillStyle = 'rgba(255,225,74,.35)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 2, 0, TAU); g.fill(); }
  }, { repeat: [4, 2] });
}
function backTex() {
  return canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2a1458'); gr.addColorStop(1, '#6a2a8a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = mulberry32(4);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,240,180,${0.3 + r() * 0.6})`; const x = r() * w, y = r() * h * 0.9, s = 1 + r() * 3; g.fillRect(x, y, s, s); }
    g.strokeStyle = 'rgba(255,200,60,.4)'; g.lineWidth = 6; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 64, h); g.lineTo(i * 64 + 40, 0); g.stroke(); }
  });
}
function beltTex() {
  const t = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#2a2a38'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd23f';
    for (let i = 0; i < 4; i++) { const x = i * 64 + 10; g.beginPath(); g.moveTo(x, 12); g.lineTo(x + 30, 32); g.lineTo(x, 52); g.lineTo(x + 12, 32); g.closePath(); g.fill(); }
    g.strokeStyle = '#555'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  }, { repeat: [5, 1] });
  return t;
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
export const BULB_COLS = [0xff3a8a, 0xffe14a, 0x58d6ff, 0x7aff7a, 0xff8a1c];

// ---------------- de wereld ----------------
export function buildWorld(ctx, L) {
  const { scene, players } = ctx;
  const { X, ZB, ZF, CEIL, HOLE_W, HOLE_D } = CB;
  const rng = mulberry32(2024);
  const W = { bulbs: null, bulbN: 0, ferris: null, belt: null, beltT: null, glass: [], sign: null, trolleys: [], lamps: [], cab: new THREE.Group(), stars: null };
  const start = scene.children.length;

  // lucht met sterren en kermisgrond
  scene.background = new THREE.Color(0x120a2e);
  scene.fog = new THREE.Fog(0x1a1040, 60, 170);
  const starGeo = new THREE.BufferGeometry(); const sp = new Float32Array(240 * 3);
  for (let i = 0; i < 240; i++) { const a = rng() * TAU, e = 0.15 + rng() * 0.7; sp[i * 3] = Math.cos(a) * 110 * Math.cos(e); sp[i * 3 + 1] = 20 + Math.sin(e) * 90; sp[i * 3 + 2] = -Math.abs(Math.sin(a)) * 110 - 20; }
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xfff0c0, size: 0.9, sizeAttenuation: true, fog: false })); stars.userData.dynamic = true; scene.add(stars); W.stars = stars;
  const ground = mesh(new THREE.PlaneGeometry(220, 160), new THREE.MeshStandardMaterial({ map: tex.cobble(30, 22), color: 0x6a5a8a, roughness: 1 }), { cast: false, pos: [0, -4.25, -10], rot: [-Math.PI / 2, 0, 0] }); scene.add(ground);

  // ---------------- de kast ----------------
  const cab = W.cab; scene.add(cab);
  const red = mat(0xd8372c, { flatShading: false }), yel = mat(0xffd23f, { flatShading: false }), dark = mat(0x1c1430), steel = mat(0xb8bcc8, { metalness: 0.7, roughness: 0.35, flatShading: false });
  const add = (g, m, x, y, z, o = {}) => { const k = mesh(g, m, { cast: o.cast ?? false, receive: o.recv ?? true, pos: [x, y, z], rot: o.rot }); cab.add(k); return k; };
  // onderkast (hol onder de gaten: daar vallen de prijzen in)
  const holeZ0 = ZF - HOLE_D, bz0 = ZB - 1.0, XO = X + 1.5, ZC = ZF + 0.3;
  const box = (x0, x1, y0, y1, z0, z1, m) => add(B(x1 - x0, y1 - y0, z1 - z0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  for (const sd of [-1, 1]) {
    const ex = sd * XO, ix = sd * (X - HOLE_W), wx = sd * X;
    box(Math.min(ex, ix), Math.max(ex, ix), -4.2, -0.6, bz0, holeZ0, red);                 // achter het gat
    box(Math.min(ex, wx), Math.max(ex, wx), -4.2, -0.6, holeZ0, ZC, red);                  // zijwand van de put
    box(Math.min(wx, ix), Math.max(wx, ix), -4.2, -3.4, holeZ0, ZC, red);                  // putbodem
  }
  box(-(X - HOLE_W), X - HOLE_W, -4.2, -0.6, bz0, ZC, red);
  box(-XO, XO, -4.2, -0.6, ZC, ZF + 3.3, red);                                                // console-blok
  for (const sd of [-1, 1]) add(B(0.3, 3.6, ZF - ZB + 4.3), yel, sd * (XO + 0.15), -2.4, (bz0 + ZF + 3.3) / 2);
  add(B(2 * XO + 0.6, 0.3, 0.3), yel, 0, -0.5, ZF + 3.3);
  // console met joysticks en knoppen
  for (let i = 0; i < 2; i++) {
    const sx = (i ? 1 : -1) * 8.2, col = i ? 0x3a78e0 : 0x2f9e5b;
    add(B(5.0, 0.2, 2.8), mat(col, { flatShading: false }), sx, -0.5, ZF + 1.8);
    add(C(0.45, 0.6, 0.3, 12), dark, sx, -0.25, ZF + 1.8);
    add(C(0.1, 0.1, 0.9, 6), steel, sx, 0.25, ZF + 1.8);
    add(S(0.32, 10, 8), red, sx, 0.8, ZF + 1.8);
  }
  // prijsluikjes
  for (let i = 0; i < 2; i++) { const sx = (i ? 1 : -1) * (X - HOLE_W / 2); add(B(HOLE_W - 0.6, 0.8, 0.2), dark, sx, -3.5, ZF + 3.35); add(B(HOLE_W - 0.2, 0.18, 0.5), i ? mat(0x3a78e0) : mat(0x2f9e5b), sx, -3.0, ZF + 3.4); }
  // paaltjes + toplijst
  for (const sx of [-1, 1]) for (const z of [ZB - 0.3, ZF + 0.3]) add(B(0.7, CEIL + 0.5, 0.7), yel, sx * (X + 0.45), CEIL / 2, z);
  add(B(2 * X + 2.0, 0.6, ZF - ZB + 1.0), yel, 0, CEIL + 0.3, (ZB + ZF) / 2);
  add(B(2 * X + 2.0, 0.4, 0.6), red, 0, -0.1, ZF + 0.3);
  // marquee
  add(B(2 * X + 3.4, 3.4, 1.4), mat(0x6a1a5a, { flatShading: false }), 0, CEIL + 2.5, (ZB + ZF) / 2 + 0.2);
  const sign = mesh(new THREE.PlaneGeometry(2 * X - 3.0, 3.0), new THREE.MeshBasicMaterial({ map: signTex() }), { cast: false, receive: false, pos: [0, CEIL + 2.5, (ZB + ZF) / 2 + 0.92] }); cab.add(sign); W.sign = sign;
  // scorebord-lampjes links/rechts van het bord (zie claw.js: score-display)
  // achterwand + vloer (met gaten voor de prijsgoten)
  add(new THREE.PlaneGeometry(2 * X + 1, CEIL), new THREE.MeshStandardMaterial({ map: backTex(), roughness: 0.9 }), 0, CEIL / 2, ZB - 0.02, { recv: false });
  const fm = new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.9 });
  const floorPiece = (x0, x1, z0, z1) => { const m = mesh(new THREE.BoxGeometry(x1 - x0, 0.6, z1 - z0), fm, { cast: false, pos: [(x0 + x1) / 2, -0.3, (z0 + z1) / 2] }); cab.add(m); };
  floorPiece(-X, X, ZB, holeZ0); floorPiece(-X + HOLE_W, X - HOLE_W, holeZ0, ZF);
  // putten onder de gaten + kleurige glow
  for (let i = 0; i < 2; i++) {
    const sd = i ? 1 : -1, cx = sd * (X - HOLE_W / 2), cz = (holeZ0 + ZF) / 2;
    const pit = new THREE.Mesh(new THREE.BoxGeometry(HOLE_W - 0.04, 2.8, HOLE_D + 0.26), new THREE.MeshBasicMaterial({ color: 0x0c0618, side: THREE.BackSide })); pit.position.set(cx, -2.0, cz + 0.1); cab.add(pit);
    const col = i ? 0x58a0ff : 0x58ff9a;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(HOLE_W, HOLE_D), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(cx, -3.35, cz + 0.1); cab.add(glow); W.lamps.push(glow);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(HOLE_W + 0.3, 0.16, 0.18), new THREE.MeshBasicMaterial({ color: col })); rim.position.set(cx, 0.08, holeZ0 - 0.09); cab.add(rim);
    const rim2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, HOLE_D), new THREE.MeshBasicMaterial({ color: col })); rim2.position.set(cx - sd * (HOLE_W / 2 + 0.0), 0.08, cz); cab.add(rim2);
  }
  // lopende band achterin
  const bt = beltTex(); W.beltT = bt;
  W.belt = mesh(new THREE.PlaneGeometry(2 * X, 1.1), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8 }), { cast: false, pos: [0, 0.02, ZB + 0.55], rot: [-Math.PI / 2, 0, 0] }); W.belt.userData.dynamic = true; cab.add(W.belt);
  for (const sx of [-1, 1]) { const rl = mesh(C(0.55, 0.55, 1.1, 10), steel, { cast: false, pos: [sx * (X - 0.1), 0.2, ZB + 0.55], rot: [Math.PI / 2, 0, 0] }); cab.add(rl); }
  // plafond met rails
  add(B(2 * X + 1, 0.4, ZF - ZB + 0.6), mat(0x3a2a5a), 0, CEIL + 0.0, (ZB + ZF) / 2);
  for (const z of [-1.2, 1.6]) add(B(2 * X, 0.16, 0.16), steel, 0, CEIL - 0.3, z);
  // glas (alleen deze krijgen transparantie): voorruit + zijkanten
  const glassM = new THREE.MeshStandardMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.11, roughness: 0.05, metalness: 0, depthWrite: false, side: THREE.DoubleSide });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(2 * X + 0.8, CEIL), glassM); front.position.set(0, CEIL / 2, ZF + 0.3); front.renderOrder = 6; cab.add(front); W.glass.push(front);
  for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(ZF - ZB + 0.6, CEIL), glassM); s.rotation.y = Math.PI / 2; s.position.set(sx * (X + 0.45), CEIL / 2, (ZB + ZF) / 2); s.renderOrder = 6; cab.add(s); W.glass.push(s); }
  // glinstering op het glas
  const glintM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const glints = []; for (let k = 0; k < 2; k++) { const gl = new THREE.Mesh(new THREE.PlaneGeometry(1.4 - k * 0.6, CEIL * 0.8), glintM); gl.position.set(-9 + k * 2.2, CEIL * 0.5, ZF + 0.33); gl.rotation.z = 0.35; gl.renderOrder = 7; cab.add(gl); glints.push(gl); }
  W.glints = glints;
  // trolleys (kabelwagentjes) bovenin
  for (let i = 0; i < 2; i++) { const t = new THREE.Group(); t.add(mesh(B(1.3, 0.5, 1.3), i ? mat(0x3a78e0) : mat(0x2f9e5b), { cast: false })); t.add(mesh(C(0.2, 0.2, 0.9, 6), steel, { cast: false, pos: [0, 0.4, 0] })); t.position.y = CEIL - 0.55; t.userData.dynamic = true; cab.add(t); W.trolleys.push(t); }
  // gekleurde lampjes (instanced) rond de kast en het bord
  const bulbPos = [];
  const bx0 = -(X + 1.7), bx1 = X + 1.7, zb = (ZB + ZF) / 2 + 0.95;
  for (let k = 0; k <= 24; k++) { const x = bx0 + (bx1 - bx0) * k / 24; bulbPos.push([x, CEIL + 4.15, zb], [x, CEIL + 0.85, zb]); }
  for (let k = 1; k < 5; k++) { const y = CEIL + 0.85 + (3.3) * k / 5; bulbPos.push([bx0, y, zb], [bx1, y, zb]); }
  for (let k = 0; k <= 9; k++) { const y = -0.3 + (CEIL + 0.3) * k / 9; bulbPos.push([-(X + 0.8), y, ZF + 0.6], [X + 0.8, y, ZF + 0.6]); }
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), bulbPos.length);
  bulbPos.forEach((p, i) => { _m4.makeTranslation(p[0], p[1], p[2]); bulbs.setMatrixAt(i, _m4); bulbs.setColorAt(i, new THREE.Color(BULB_COLS[i % 5])); });
  bulbs.instanceMatrix.needsUpdate = true; bulbs.instanceColor.needsUpdate = true; bulbs.userData.dynamic = true; bulbs.frustumCulled = false; cab.add(bulbs); W.bulbs = bulbs; W.bulbN = bulbPos.length;

  // ---------------- achtergrond: reuzenrad, tenten, slingers ----------------
  const bg = new THREE.Group(); scene.add(bg);
  const wp = [{ g: new THREE.TorusGeometry(11, 0.3, 6, 40), c: 0xe8e0f0 }, { g: new THREE.TorusGeometry(5, 0.2, 6, 28), c: 0xe8e0f0 }, { g: C(0.9, 0.9, 1.2, 10), c: 0xffd23f, r: [Math.PI / 2, 0, 0] }];
  for (let k = 0; k < 8; k++) wp.push({ g: B(22, 0.18, 0.18), c: 0xd8d0e8, r: [0, 0, k / 8 * Math.PI] });
  const wheel = new THREE.Mesh(bakeGeo(wp), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 })); wheel.position.set(-27, 15, -26); bg.add(wheel); W.ferris = wheel; wheel.userData.dynamic = true;
  const wl = new THREE.Mesh(new THREE.TorusGeometry(11, 0.14, 4, 40), new THREE.MeshBasicMaterial({ color: 0xffd86a, fog: false })); wheel.add(wl);
  const gcol = [0xff3a8a, 0xffd23f, 0x58d6ff, 0x7aff7a, 0xff8a1c, 0xa070ff];
  const gg = new THREE.InstancedMesh(bakeGeo([{ g: B(1.7, 1.3, 1.3), c: 0xffffff, p: [0, -1.0, 0] }, { g: B(2.0, 0.22, 1.6), c: 0xf0f0f0, p: [0, -0.25, 0] }]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), 12);
  gcol.forEach((c, k) => { for (const j of [k, k + 6]) gg.setColorAt(j, new THREE.Color(c)); }); gg.userData.dynamic = true; gg.frustumCulled = false; bg.add(gg); W.gond = gg;
  W.updateWheel = (t) => { wheel.rotation.z = t * 0.12; for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + t * 0.12; _m4.makeTranslation(-27 + Math.cos(a) * 11, 15 + Math.sin(a) * 11, -26); gg.setMatrixAt(k, _m4); } gg.instanceMatrix.needsUpdate = true; };
  W.updateWheel(0);
  for (const sx of [-1, 1]) bg.add(mesh(B(0.8, 16, 0.8), mat(0x6a5a8a), { cast: false, pos: [-27 + sx * 4.5, 7.5, -26.2], rot: [0, 0, sx * 0.28] }));
  // gestreepte tenten
  const tentTex = (a, b) => canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 32, 0, 32, h); } }, { repeat: [3, 1] });
  const tents = [[26, -20, 0xff3a8a, '#ff3a8a', '#fff3d0'], [36, -8, 0x58d6ff, '#3a8ae0', '#fff3d0'], [-38, -6, 0xffd23f, '#e8a020', '#fff3d0'], [10, -34, 0x7aff7a, '#2fae5b', '#fff3d0']];
  for (const [x, z, , a, b] of tents) {
    const tm = new THREE.MeshStandardMaterial({ map: tentTex(a, b), roughness: 0.9 });
    bg.add(mesh(C(9, 9, 6, 16), tm, { cast: false, pos: [x, 3, z] })); bg.add(mesh(K(10.5, 5, 16), tm, { cast: false, pos: [x, 8.5, z] }));
    bg.add(mesh(S(0.5), mat(0xffd23f), { cast: false, pos: [x, 11.3, z] }));
  }
  // lantaarns/slingers
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const x = sx * (16 + k * 9), z = 9 - k * 2; bg.add(mesh(C(0.14, 0.18, 9, 6), mat(0x55456a), { cast: false, pos: [x, 0.3, z] })); bg.add(mesh(S(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd86a, fog: false }), { cast: false, pos: [x, 4.9, z] })); }
  // ballonnen
  const bcol = [0xff3a8a, 0xffd23f, 0x58d6ff, 0x7aff7a, 0xa070ff];
  for (let k = 0; k < 14; k++) { const x = (k - 7) * 6 + rng() * 3, z = -16 - rng() * 8, y = 8 + rng() * 10; bg.add(mesh(S(0.9, 8, 6), mat(bcol[k % 5], { flatShading: false }), { cast: false, pos: [x, y, z], scale: [1, 1.2, 1] })); bg.add(mesh(C(0.02, 0.02, 4, 3), mat(0xcccccc), { cast: false, pos: [x, y - 2.4, z] })); }
  // ruimte voor het publiek: wat knuffel-silhouetten uit de kraam links/rechts
  for (const sx of [-1, 1]) bg.add(mesh(B(8, 5, 1), mat(0x7a2a5a), { cast: false, pos: [sx * 24, 2.5, 6] }));
  // lichtpilaar van de kast zelf (sfeer)
  const L2 = new THREE.PointLight(0xffe0ff, 55, 34, 1.6); L2.position.set(0, CEIL - 1.2, 1.0); scene.add(L2); W.pl = L2;
  mergeStatic(scene, start);
  return W;
}
