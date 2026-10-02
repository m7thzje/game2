import * as THREE from 'three';
import { mat, mesh, canvasTex, TAU, mulberry32, lerp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { Butterfly } from '../engine/chars.js';

// Bouwstenen voor Houthakkers-Duel: bosweide, totem-stammen, stekels/takken/bijennesten, bommen.

export const PIECE_H = 1.55, TRUNK_R = 1.02;

// ---------- geometrie samenvoegen met vertexkleuren (weinig draw calls) ----------
export function bakeGroup(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const n = g.attributes.position.count; const col = new Float32Array(n * 3);
    const c = m.color || new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); if (g.attributes.uv1) g.deleteAttribute('uv1');
    parts.push(g);
  });
  const total = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
const vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });

// ---------- houttexturen ----------
function ringsTex(base = '#d9a860') {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(110,70,30,.55)'; g.lineWidth = 2;
    for (let r = 6; r < 64; r += 7) { g.beginPath(); g.ellipse(64 + (r % 3), 64, r, r * 0.96, 0, 0, TAU); g.stroke(); }
    g.fillStyle = 'rgba(90,50,20,.7)'; g.beginPath(); g.arc(64, 64, 3, 0, TAU); g.fill();
  });
}
const faceFns = [
  // uil
  (g, cx, cy, c) => { g.fillStyle = '#f4ecd0'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 26, cy - 8, 20, 0, TAU); g.fill(); } g.fillStyle = '#1c0f06'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 26, cy - 6, 9, 0, TAU); g.fill(); } g.fillStyle = c; g.beginPath(); g.moveTo(cx - 12, cy + 8); g.lineTo(cx + 12, cy + 8); g.lineTo(cx, cy + 36); g.fill(); },
  // beer
  (g, cx, cy, c) => { g.fillStyle = '#3a2210'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 34, cy - 30, 14, 0, TAU); g.fill(); } g.fillStyle = '#f4ecd0'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 22, cy - 8, 7, 0, TAU); g.fill(); } g.fillStyle = '#1c0f06'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 22, cy - 8, 3.5, 0, TAU); g.fill(); } g.fillStyle = c; g.beginPath(); g.ellipse(cx, cy + 16, 22, 15, 0, 0, TAU); g.fill(); g.fillStyle = '#1c0f06'; g.beginPath(); g.ellipse(cx, cy + 8, 8, 5, 0, 0, TAU); g.fill(); },
  // wolf/vos met tanden
  (g, cx, cy, c) => { g.fillStyle = '#f4ecd0'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * 10, cy - 8); g.lineTo(cx + s * 42, cy - 22); g.lineTo(cx + s * 36, cy + 2); g.fill(); } g.fillStyle = '#1c0f06'; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 28, cy - 10, 4.5, 0, TAU); g.fill(); } g.fillStyle = c; g.fillRect(cx - 34, cy + 14, 68, 22); g.fillStyle = '#fff'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(cx - 33 + k * 11.5, cy + 14); g.lineTo(cx - 27.5 + k * 11.5, cy + 28); g.lineTo(cx - 22 + k * 11.5, cy + 14); g.fill(); } },
  // zon
  (g, cx, cy, c) => { g.fillStyle = c; g.beginPath(); g.arc(cx, cy, 20, 0, TAU); g.fill(); g.strokeStyle = c; g.lineWidth = 5; for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; g.beginPath(); g.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26); g.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42); g.stroke(); } g.fillStyle = '#1c0f06'; g.beginPath(); g.arc(cx - 7, cy - 4, 3, 0, TAU); g.arc(cx + 7, cy - 4, 3, 0, TAU); g.fill(); g.strokeStyle = '#1c0f06'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy + 3, 9, 0.2, Math.PI - 0.2); g.stroke(); },
];
function pieceTex(kind, css, variant, tall = 1, seed = 1) {
  const W = 512, Hh = 128 * tall;
  return canvasTex(W, Hh, (g, w, h) => {
    const r = mulberry32(seed * 131 + variant * 17 + (kind.length * 7));
    const base = { bark: '#8b5a30', knot: '#5a3a20', gold: '#e9b52a', long: '#d9b67c', tail: '#8b5a30' }[kind];
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    if (kind === 'gold') { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#fff2a0'); gr.addColorStop(0.25, '#e9b52a'); gr.addColorStop(0.5, '#fff2a0'); gr.addColorStop(0.75, '#d99a14'); gr.addColorStop(1, '#fff2a0'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    // schors-strepen
    for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h; g.strokeStyle = kind === 'gold' ? 'rgba(160,100,10,.35)' : kind === 'long' ? `rgba(150,110,60,${0.15 + r() * 0.2})` : `rgba(${r() < 0.5 ? '40,20,8' : '200,150,90'},${0.12 + r() * 0.22})`; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + 12 + r() * 40); g.stroke(); }
    // gekleurde banden boven en onder
    g.fillStyle = css; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 14, w, 3); g.fillRect(0, h - 17, w, 3);
    const cx = w / 2, cy = h / 2;
    if (kind === 'bark' && variant >= 0) {
      g.fillStyle = 'rgba(20,10,4,.22)'; g.beginPath(); g.ellipse(cx, cy, 70, h / 2 - 20, 0, 0, TAU); g.fill();
      faceFns[variant % faceFns.length](g, cx, cy, css);
    } else if (kind === 'knot') {
      g.fillStyle = '#9aa3b2'; g.fillRect(0, h * 0.22, w, 10); g.fillRect(0, h * 0.7, w, 10);
      g.fillStyle = '#e0e6f0'; for (let k = 0; k < 16; k++) { g.beginPath(); g.arc(k * 32 + 10, h * 0.22 + 5, 3, 0, TAU); g.arc(k * 32 + 10, h * 0.7 + 5, 3, 0, TAU); g.fill(); }
      g.strokeStyle = '#2a170a'; g.lineWidth = 4; for (let k = 1; k < 5; k++) { g.beginPath(); g.ellipse(cx, cy, k * 9, k * 7, 0, 0, TAU); g.stroke(); }
      g.fillStyle = '#1c0f06'; g.beginPath(); g.ellipse(cx, cy, 6, 5, 0, 0, TAU); g.fill();
    } else if (kind === 'long') {
      g.strokeStyle = '#3aa84a'; g.lineWidth = 5; for (let k = 0; k < 8; k++) { const x = k * 64 + 20; g.beginPath(); g.moveTo(x, h - 20); g.bezierCurveTo(x + 30, h * 0.6, x - 30, h * 0.4, x + 6, 20); g.stroke(); }
      g.fillStyle = '#6fe08a'; for (let k = 0; k < 14; k++) { g.beginPath(); g.ellipse(r() * w, 30 + r() * (h - 60), 9, 4, r() * 3, 0, TAU); g.fill(); }
      g.fillStyle = '#fff'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.fillText('+', cx, cy + 14);
    } else if (kind === 'gold') {
      g.strokeStyle = 'rgba(140,80,0,.55)'; g.lineWidth = 3; for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(0, k * h / 3); g.lineTo(w, k * h / 3); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = 'bold 90px Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff7c0'; g.strokeStyle = '#a56a00'; g.lineWidth = 8; g.strokeText('+3', cx, cy); g.fillText('+3', cx, cy);
    }
  });
}

// materialen per speler
export function makePieceMats(css, i) {
  const rings = ringsTex(), ringsG = ringsTex('#ffe27a'), ringsL = ringsTex('#f0d8a0');
  const mk = (t, extra = {}) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, flatShading: false, ...extra });
  const cap = mk(rings), capG = mk(ringsG, { metalness: 0.5 }), capL = mk(ringsL);
  const m = { bark: [], knot: null, gold: null, long: null, tail: null };
  for (let v = 0; v < 4; v++) m.bark.push([mk(pieceTex('bark', css, v, 1, i + 1)), cap, cap]);
  m.bark.push([mk(pieceTex('bark', css, -1, 1, i + 7)), cap, cap]);
  m.knot = [mk(pieceTex('knot', css, 0, 1, i + 1)), cap, cap];
  m.gold = [mk(pieceTex('gold', css, 0, 3, i + 1), { metalness: 0.7, roughness: 0.3, emissive: 0xaa6a00, emissiveIntensity: 0.45 }), capG, capG];
  m.long = [mk(pieceTex('long', css, 0, 2, i + 1)), capL, capL];
  const t = pieceTex('tail', css, -1, 1, i + 3); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 30);
  m.tail = mk(t);
  return m;
}
const geoCache = {};
export function pieceGeo(units) {
  if (!geoCache[units]) { const g = new THREE.CylinderGeometry(TRUNK_R, TRUNK_R * 1.03, PIECE_H * units, 18, 1); g.rotateY(Math.PI); geoCache[units] = g; }
  return geoCache[units];
}

// ---------- gevaarstukken (gebakken tot 1 mesh; naar rechts gebouwd, links = x-spiegel) ----------
function bakeHaz(fn) { const g = new THREE.Group(); fn(g); return bakeGroup(g); }
const M = (c, o = {}) => mat(c, { flatShading: true, ...o });
let _haz = null;
export function hazardGeos() {
  if (_haz) return _haz;
  const R = TRUNK_R;
  const spikes = bakeHaz((g) => {
    g.add(mesh(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 7), M(0x6a4526), { pos: [R + 0.45, 0, 0], rot: [0, 0, Math.PI / 2] }));
    const sm = M(0xcdd3de, { metalness: 0.5 });
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; const y = Math.cos(a) * 0.42, z = Math.sin(a) * 0.42; g.add(mesh(new THREE.ConeGeometry(0.16, 0.85, 5), sm, { pos: [R + 0.95, y, z], rot: [Math.sin(a) * 0.5 + 0, 0, -Math.PI / 2 + Math.cos(a) * 0.35] })); }
    g.add(mesh(new THREE.ConeGeometry(0.2, 1.0, 5), sm, { pos: [R + 1.35, 0, 0], rot: [0, 0, -Math.PI / 2] }));
    g.add(mesh(new THREE.TorusGeometry(0.3, 0.07, 5, 9), M(0xc0302a), { pos: [R + 0.55, 0, 0], rot: [0, Math.PI / 2, 0] }));
  });
  const branch = bakeHaz((g) => {
    const wm = M(0x5a3a1c), lm = M(0x3f9e3a), lm2 = M(0x2f7e2c);
    g.add(mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.9, 6), wm, { pos: [R + 0.8, 0.05, 0], rot: [0, 0, Math.PI / 2 - 0.12] }));
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.14, 1.1, 5), wm, { pos: [R + 1.55, 0.45, 0.1], rot: [0, 0, Math.PI / 2 - 0.9] }));
    g.add(mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.9, 5), wm, { pos: [R + 1.35, -0.4, -0.1], rot: [0, 0, Math.PI / 2 + 0.8] }));
    for (const [x, y, z, s, c] of [[R + 1.85, 0.2, 0, 0.5, lm], [R + 1.5, 0.85, 0.2, 0.4, lm2], [R + 1.4, -0.7, -0.15, 0.38, lm], [R + 1.0, 0.5, 0.35, 0.34, lm2]]) g.add(mesh(new THREE.IcosahedronGeometry(s, 0), c, { pos: [x, y, z] }));
    const th = M(0x2a1a0a); for (let k = 0; k < 5; k++) g.add(mesh(new THREE.ConeGeometry(0.07, 0.4, 4), th, { pos: [R + 0.6 + k * 0.32, 0.22 + (k % 2) * -0.4, 0.12 * (k % 3 - 1)], rot: [0, 0, (k % 2 ? 2.4 : 0.7)] }));
  });
  const hive = bakeHaz((g) => {
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.3, 5), M(0x5a3a1c), { pos: [R + 0.5, 0.62, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.9, 5), M(0x5a3a1c), { pos: [R + 0.45, 0.4, 0], rot: [0, 0, Math.PI / 2] }));
    const cols = [0xf2b630, 0xd98a1a, 0xf2b630, 0xd98a1a, 0xf2b630];
    cols.forEach((c, k) => { const t = k / 4; const r = 0.55 * Math.sin(Math.PI * (0.18 + t * 0.7)) + 0.12; g.add(mesh(new THREE.CylinderGeometry(r * 0.92, r, 0.24, 9), M(c, { flatShading: false }), { pos: [R + 1.05, 0.25 - k * 0.2, 0] })); });
    g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), M(0x2a1a0a), { pos: [R + 1.05, -0.38, 0.38] }));
  });
  _haz = { spikes, branch, hive };
  return _haz;
}
export function bombGeo(kind) {
  return bakeHaz((g) => {
    const col = kind === 'green' ? 0x39c24a : 0xe03030;
    g.add(mesh(new THREE.SphereGeometry(0.6, 12, 9), M(0x1a1a22, { flatShading: false, metalness: 0.4, roughness: 0.4 }), { pos: [0, 0, TRUNK_R + 0.35] }));
    g.add(mesh(new THREE.TorusGeometry(0.58, 0.1, 5, 14), M(col), { pos: [0, 0.05, TRUNK_R + 0.35], rot: [0.2, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.25, 6), M(0x3a3a46), { pos: [0, 0.62, TRUNK_R + 0.35] }));
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 4), M(0xd8c898), { pos: [0.05, 0.9, TRUNK_R + 0.35], rot: [0, 0, 0.5] }));
    // koorden om de stam
    g.add(mesh(new THREE.TorusGeometry(TRUNK_R + 0.04, 0.07, 5, 18), M(0xb89a58), { pos: [0, -0.35, 0], rot: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.TorusGeometry(TRUNK_R + 0.04, 0.07, 5, 18), M(0xb89a58), { pos: [0, 0.35, 0], rot: [Math.PI / 2, 0, 0] }));
  });
}
export const hazMat = vcMat;

// ---------- de bosweide ----------
export function buildForest(ctx, { trunkX, names, css }) {
  const { scene, fx } = ctx; const rng = mulberry32(2025); const upd = [];
  // grond
  const gr = tex.grass(46, 34); scene.add(mesh(new THREE.PlaneGeometry(220, 150), new THREE.MeshStandardMaterial({ map: gr, roughness: 1 }), { cast: false, pos: [0, 0, -30], rot: [-Math.PI / 2, 0, 0] }));
  for (const x of trunkX) scene.add(mesh(new THREE.CircleGeometry(9.5, 28), new THREE.MeshStandardMaterial({ map: tex.dirt(5, 5), roughness: 1 }), { cast: false, pos: [x, 0.03, 1.5], rot: [-Math.PI / 2, 0, 0], scale: [1, 0.8, 1] }));
  // podia
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group(); g.position.set(trunkX[i], 0, 0); scene.add(g);
    g.add(mesh(new THREE.CylinderGeometry(4.6, 4.9, 0.5, 24), new THREE.MeshStandardMaterial({ map: tex.planks(3, 1, '#a9774a'), roughness: 0.9, flatShading: true }), { pos: [0, 0.25, 0] }));
    g.add(mesh(new THREE.TorusGeometry(4.7, 0.18, 6, 32), M(new THREE.Color(css[i]).getHex()), { cast: false, pos: [0, 0.52, 0], rot: [Math.PI / 2, 0, 0] }));
    // wortels
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.3; g.add(mesh(new THREE.ConeGeometry(0.4, 2.0, 5), M(0x6a4526), { cast: false, pos: [Math.cos(a) * 1.3, 0.75, Math.sin(a) * 1.3], rot: [Math.sin(a) * 1.25, 0, -Math.cos(a) * 1.25] })); }
    // houtsnippers op het podium (vast decor)
    for (let k = 0; k < 10; k++) g.add(mesh(new THREE.BoxGeometry(0.28, 0.06, 0.12), M(0xe0b878), { cast: false, pos: [(rng() - 0.5) * 7, 0.54, (rng() - 0.5) * 7], rot: [0, rng() * 3, 0] }));
  }
  // decor (gebakken): bomen, rotsen, struiken, paddenstoelen, bloemen, hekken, stronken, stapels
  const bakedInst = [];
  function inst(group, placements) {
    const geo = bakeGroup(group); const im = new THREE.InstancedMesh(geo, vcMat, placements.length); im.castShadow = false; im.receiveShadow = false;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    placements.forEach((p, k) => { e.set(0, p.ry || 0, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, p.y || 0, p.z), q, new THREE.Vector3(p.s || 1, p.sy || p.s || 1, p.s || 1)); im.setMatrixAt(k, m4); });
    im.frustumCulled = false; scene.add(im); return im;
  }
  const pines = [], oaks = [], birches = [];
  for (const [zr, n, x0, dx] of [[-15, 14, -66, 9.5], [-26, 14, -70, 10], [-40, 14, -80, 12], [-58, 14, -90, 14]]) {
    for (let k = 0; k < n; k++) {
      const x = x0 + k * dx + (rng() - 0.5) * 5, z = zr - rng() * 5;
      if (zr === -15 && Math.abs(x) < 16 && false) continue;
      const s = 0.85 + rng() * 0.75, r = rng();
      (r < 0.5 ? pines : r < 0.8 ? oaks : birches).push({ x, z, s: s * (1 + (-zr - 15) * 0.006), ry: rng() * 6 });
    }
  }
  inst(P.pine(11, 0x2c7a4b), pines); inst(P.tree(10, 0x4fae3e), oaks); inst(P.tree(9, 0xb0c83a, 0xe8e4d4), birches);
  // sneeuwtoppen/bergen
  for (const [x, z, r, h, c] of [[-70, -105, 42, 48, 0x6d7d99], [-20, -115, 55, 62, 0x7a8aa6], [40, -108, 46, 54, 0x687894], [95, -100, 40, 44, 0x73839f], [-115, -95, 38, 40, 0x6a7a96]]) {
    scene.add(mesh(new THREE.ConeGeometry(r, h, 7), M(c), { cast: false, receive: false, pos: [x, h / 2 - 1, z], rot: [0, x, 0] }));
    scene.add(mesh(new THREE.ConeGeometry(r * 0.36, h * 0.3, 7), M(0xf4f8ff), { cast: false, receive: false, pos: [x, h * 0.86 - 1, z], rot: [0, x, 0] }));
  }
  // kasteel in de berg
  { const t = P.tower(14, 3); t.position.set(-18, 34, -112); t.scale.setScalar(2.2); scene.add(t); const t2 = P.tower(9, 2.4); t2.position.set(-4, 30, -113); t2.scale.setScalar(2.2); scene.add(t2); }
  // losse props
  const decor = new THREE.Group();
  const place = (o, x, z, ry = 0, s = 1) => { o.position.set(x, 0, z); o.rotation.y = ry; o.scale.setScalar(s); decor.add(o); };
  for (let k = 0; k < 8; k++) place(P.rock(0.8 + rng() * 1.6), (rng() < 0.5 ? -1 : 1) * (14 + rng() * 26), -5 + rng() * 10 - 2, rng() * 6);
  for (let k = 0; k < 10; k++) place(P.bush(1.0 + rng() * 1.4, [0x3b9a45, 0x2f8a3c, 0x4eae4a][k % 3]), (rng() < 0.5 ? -1 : 1) * (12 + rng() * 38), -8 - rng() * 6, rng() * 6);
  for (let k = 0; k < 7; k++) place(P.mushroom(1.0 + rng() * 0.8, [0xe03a3a, 0xf0a030, 0xd05ac8][k % 3]), (rng() < 0.5 ? -1 : 1) * (11 + rng() * 14), 3 + rng() * 6, rng() * 6);
  for (const [x, z, c] of [[-14, 5, 0xff6fa5], [14, 6, 0xffe14a], [-20, -3, 0x8fb8ff], [20, -2, 0xff6fa5], [-9, 9, 0xffffff], [10, 9, 0xff9a3a], [26, 3, 0xffe14a], [-27, 4, 0xff6fa5]]) { const f = P.flowerPatch(c, 9, 1.6); f.position.set(x, 0, z); decor.add(f); }
  // stronken met bijl
  for (const [x, z] of [[-16, 3], [16.5, 2.5], [-24, -2]]) { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.9, 1.05, 0.9, 10), M(0x8b5a30), { pos: [0, 0.45, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.86, 0.86, 0.05, 10), M(0xe0b878), { pos: [0, 0.91, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.1, 5), M(0x6a4526), { pos: [0.1, 1.45, 0], rot: [0, 0, 0.25] })); g.add(mesh(new THREE.BoxGeometry(0.1, 0.32, 0.4), M(0xaab2c0, { metalness: 0.5 }), { pos: [0.28, 1.95, 0], rot: [0, 0, 0.25] })); g.position.set(x, 0, z); decor.add(g); }
  // houtstapel
  { const g = new THREE.Group(); const lm = M(0x9a6a3a), ce = M(0xe0b878); for (let r = 0; r < 4; r++) for (let k = 0; k < 6 - r; k++) { g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.6, 8), lm, { pos: [(k - (5 - r) / 2) * 0.82, 0.42 + r * 0.7, 0], rot: [0, 0, Math.PI / 2] })); } g.rotation.y = 0.1; g.position.set(-31, 0, -5); decor.add(g); }
  { const g = new THREE.Group(); const lm = M(0x9a6a3a); for (let r = 0; r < 3; r++) for (let k = 0; k < 5 - r; k++) g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.2, 8), lm, { pos: [(k - (4 - r) / 2) * 0.82, 0.42 + r * 0.7, 0], rot: [0, 0, Math.PI / 2] })); g.position.set(29, 0, -6); g.rotation.y = -0.2; decor.add(g); }
  // hek
  { const f = P.fence(14, 1.1); f.position.set(-29, 0, 7); f.rotation.y = 0.12; decor.add(f); const f2 = P.fence(12, 1.1); f2.position.set(27, 0, 8); f2.rotation.y = -0.1; decor.add(f2); }
  decor.updateMatrixWorld(true);
  const dg = bakeGroup(decor); const dm = new THREE.Mesh(dg, vcMat); dm.receiveShadow = true; scene.add(dm);
  // hut met rokende schoorsteen
  const cabin = P.houseSimple(9, 7, 4.2, { wall: '#e6d3a8', roof: '#8a3a2a' }); cabin.position.set(-33, 0, -16); cabin.rotation.y = 0.35; scene.add(cabin);
  const cabin2 = P.houseSimple(7, 6, 3.6, { wall: '#d9c394', roof: '#4a6a3a', thatch: true }); cabin2.position.set(34, 0, -17); cabin2.rotation.y = -0.4; scene.add(cabin2);
  const smokes = [new THREE.Vector3(-33 + 9 * 0.25 * Math.cos(0.35), 8, -16), new THREE.Vector3(34, 7, -17)];
  // banners
  names.forEach((nm, i) => {
    const t = canvasTex(256, 512, (g, w, h) => { g.fillStyle = css[i]; g.fillRect(0, 0, w, h - 60); g.beginPath(); g.moveTo(0, h - 60); g.lineTo(w / 2, h); g.lineTo(w, h - 60); g.fill(); g.strokeStyle = '#ffe9b0'; g.lineWidth = 8; g.strokeRect(14, 14, w - 28, h - 100); g.fillStyle = '#ffe9b0'; g.font = 'bold 64px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.fillText(nm.toUpperCase(), w / 2, 130, w - 40);
      // bijl-embleem
      g.save(); g.translate(w / 2, 300); g.rotate(-0.5); g.fillStyle = '#ffe9b0'; g.fillRect(-7, -90, 14, 190); g.beginPath(); g.moveTo(7, -85); g.lineTo(70, -110); g.lineTo(70, -20); g.lineTo(7, -45); g.fill(); g.restore(); });
    const pole = mesh(new THREE.CylinderGeometry(0.14, 0.18, 17, 6), M(0x5b3d24), { pos: [trunkX[i] * 1.0, 8.5, -7.5] }); scene.add(pole);
    scene.add(mesh(new THREE.BoxGeometry(5.0, 0.2, 0.2), M(0x5b3d24), { cast: false, pos: [trunkX[i], 16.4, -7.5] }));
    const cloth = mesh(new THREE.PlaneGeometry(4.4, 8.8, 4, 8), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 }), { cast: false, pos: [trunkX[i], 12, -7.45] }); scene.add(cloth);
    const base = cloth.geometry.attributes.position.array.slice();
    upd.push((T) => { const p = cloth.geometry.attributes.position; for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin(T * 2.4 + base[k * 3 + 1] * 0.5 + i) * 0.18 * ((4.4 - (base[k * 3 + 1] + 4.4)) / 8.8 + 0.1)); p.needsUpdate = true; });
  });
  // wolken
  const clouds = [];
  for (let k = 0; k < 6; k++) { const c = P.cloud(2.2 + rng() * 1.6); c.position.set(-70 + k * 27 + rng() * 10, 26 + rng() * 14, -70 - rng() * 20); scene.add(c); clouds.push(c); }
  // vlinders
  const flies = [0, 1, 2, 3].map((k) => { const b = new Butterfly([0xff9ad5, 0xffe14a, 0x9ad5ff, 0xffffff][k]); b.group.scale.setScalar(2.2); scene.add(b.group); return { b, ph: k * 1.7, cx: (k - 1.5) * 12, cz: 3 + k * 2 }; });
  // vogels
  const birds = [0, 1, 2].map((k) => { const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: 0x20202a, side: THREE.DoubleSide }); const wl = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), m), wr = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), m); wl.position.x = -0.55; wr.position.x = 0.55; g.add(wl, wr); scene.add(g); return { g, wl, wr, ph: k * 2, y: 22 + k * 3 }; });
  function update(T, dt) {
    for (const u of upd) u(T, dt);
    clouds.forEach((c, k) => { c.position.x += dt * (0.5 + k * 0.1); if (c.position.x > 100) c.position.x = -100; });
    flies.forEach((f) => { f.b.update(dt); const a = T * 0.5 + f.ph; f.b.group.position.set(f.cx + Math.sin(a * 1.3) * 7, 1.6 + Math.sin(a * 2.3) * 0.8 + 1.2, f.cz + Math.cos(a) * 3); f.b.group.rotation.y = a; });
    birds.forEach((b) => { const a = T * 0.18 + b.ph; b.g.position.set(Math.sin(a) * 55, b.y + Math.sin(T + b.ph) * 1, -40 + Math.cos(a * 0.6) * 10); const f = Math.sin(T * 9 + b.ph) * 0.6; b.wl.rotation.z = f; b.wr.rotation.z = -f; b.g.rotation.y = Math.cos(a) > 0 ? 0 : Math.PI; });
    if (Math.random() < dt * 5) for (const s of smokes) fx.particles.emit(s.x + (Math.random() - 0.5) * 0.4, s.y, s.z, 0.6 + Math.random() * 0.5, 1.3, 0, { life: 3.5, size: 0.9, color: 0xe8e8ee, gravity: -0.1, shrink: false });
    if (Math.random() < dt * 3) fx.particles.emit(-40 + Math.random() * 80, 18 + Math.random() * 6, -4 + Math.random() * 10, 1.2, -0.9, 0.2, { life: 6, size: 0.3, color: [0x7ccd55, 0xe8a030, 0xd8c050][Math.floor(Math.random() * 3)], gravity: 0.05, shrink: false });
  }
  return { update };
}
