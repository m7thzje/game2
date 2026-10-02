import * as THREE from 'three';
import { mat, mesh, glow, canvasTex, mulberry32, TAU, rand, lerp } from '../engine/util.js';
import { tex } from '../engine/textures.js';

// Schiettent: de kermiskraam in de Speelhal van het kasteel + alle doelwit-modellen.
// Wereld: x rechts, y omhoog, z naar de camera. Het schietvlak (de doelwitten) ligt op z = 0.
export const ROWS = [
  { y: 1.9, dir: 1, speed: 2.5 },
  { y: 4.0, dir: -1, speed: 3.3 },
  { y: 6.1, dir: 1, speed: 4.2 },
];
export const BOUNDS = { x: 12.3, y0: 1.2, y1: 10.0 };

// ------------------------------------------------------------------ gebakken geometrie (veel onderdelen -> 1 mesh)
const S = (r, w = 12, h = 9) => new THREE.SphereGeometry(r, w, h);
const _o = new THREE.Object3D();
function bake(parts) {
  const gs = [];
  for (const [geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _o.position.set(pos[0], pos[1], pos[2]); _o.rotation.set(rot[0], rot[1], rot[2]);
    if (typeof scale === 'number') _o.scale.setScalar(scale); else _o.scale.set(scale[0], scale[1], scale[2]);
    _o.updateMatrix(); g.applyMatrix4(_o.matrix);
    const c = new THREE.Color(color); const n = g.attributes.position.count; const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.deleteAttribute('uv'); gs.push(g);
  }
  const total = gs.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3); let o = 0;
  for (const g of gs) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
const MB = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.02 });
let CACHE = null;
function geos() {
  if (CACHE) return CACHE;
  const C = {};
  const duck = (body = 0xffd83a, wingC = 0xffc21a, k = 1) => [
    [S(0.52 * k, 14, 10), body, [0, 0.62 * k, 0], [0, 0, 0], [1, 0.88, 1.22]],
    [new THREE.ConeGeometry(0.2 * k, 0.45 * k, 6), body, [0, 0.84 * k, -0.64 * k], [-0.9, 0, 0]],
    [S(0.3 * k, 12, 9), body, [0, 1.22 * k, 0.4 * k]],
    [new THREE.ConeGeometry(0.13 * k, 0.34 * k, 6), 0xff8a1a, [0, 1.15 * k, 0.76 * k], [Math.PI / 2, 0, 0], [1.4, 1, 0.7]],
    [S(0.055 * k, 6, 5), 0x16121a, [0.14 * k, 1.3 * k, 0.62 * k]], [S(0.055 * k, 6, 5), 0x16121a, [-0.14 * k, 1.3 * k, 0.62 * k]],
    [S(0.075 * k, 6, 5), 0xff9a8a, [0.21 * k, 1.17 * k, 0.56 * k]], [S(0.075 * k, 6, 5), 0xff9a8a, [-0.21 * k, 1.17 * k, 0.56 * k]],
    [new THREE.CylinderGeometry(0.46 * k, 0.5 * k, 0.12, 12), 0xb98a54, [0, 0.06, 0]],
  ];
  C.duck = bake(duck());
  C.baby = bake(duck(0xfff07a, 0xffe14a, 0.58));
  C.gold = bake(duck(0xffcb1f, 0xffe46a, 0.92));
  C.wing = bake([[S(0.3, 10, 8), 0xffc21a, [0, 0, 0], [0, 0, 0], [0.28, 0.62, 1.0]]]);
  C.wingGold = bake([[S(0.3, 10, 8), 0xffee88, [0, 0, 0], [0, 0, 0], [0.28, 0.62, 1.0]]]);
  // dikke mama-eend
  C.fat = bake([
    [S(0.78, 16, 12), 0xffd83a, [0, 0.86, 0], [0, 0, 0], [1.2, 0.95, 1.25]],
    [S(0.5, 12, 9), 0xfff0b0, [0, 0.8, 0.62], [0, 0, 0], [1, 0.9, 0.55]],
    [new THREE.ConeGeometry(0.28, 0.55, 6), 0xffd83a, [0, 1.2, -0.95], [-0.9, 0, 0]],
    [S(0.38, 12, 9), 0xffd83a, [0, 1.75, 0.5]],
    [new THREE.ConeGeometry(0.17, 0.4, 6), 0xff8a1a, [0, 1.68, 0.92], [Math.PI / 2, 0, 0], [1.4, 1, 0.7]],
    [S(0.065, 6, 5), 0x16121a, [0.17, 1.86, 0.78]], [S(0.065, 6, 5), 0x16121a, [-0.17, 1.86, 0.78]],
    [S(0.09, 6, 5), 0xff9a8a, [0.26, 1.7, 0.72]], [S(0.09, 6, 5), 0xff9a8a, [-0.26, 1.7, 0.72]],
    [S(0.2, 8, 6), 0xff6fa5, [0.08, 2.12, 0.42], [0, 0, 0], [1.3, 0.7, 1]], [S(0.2, 8, 6), 0xff6fa5, [-0.2, 2.1, 0.42], [0, 0, 0], [1.3, 0.7, 1]], [S(0.1, 6, 5), 0xffe14a, [-0.06, 2.13, 0.46]],
    [new THREE.CylinderGeometry(0.62, 0.7, 0.14, 14), 0xb98a54, [0, 0.07, 0]],
  ]);
  C.wingFat = bake([[S(0.4, 10, 8), 0xffc21a, [0, 0, 0], [0, 0, 0], [0.3, 0.7, 1.1]]]);
  // konijn
  const bun = (fur = 0xf4f0ee) => [
    [S(0.5, 14, 10), fur, [0, 0.58, 0], [0, 0, 0], [0.92, 1.0, 1.0]],
    [S(0.34, 12, 9), fur, [0, 1.25, 0.28]],
    [S(0.17, 8, 6), 0xffffff, [0, 0.55, -0.52]],
    [S(0.07, 6, 5), 0xff7a9a, [0, 1.2, 0.58]],
    [S(0.055, 6, 5), 0x16121a, [0.13, 1.33, 0.52]], [S(0.055, 6, 5), 0x16121a, [-0.13, 1.33, 0.52]],
    [S(0.2, 8, 6), fur, [0.28, 0.14, 0.32], [0, 0, 0], [0.8, 0.6, 1.4]], [S(0.2, 8, 6), fur, [-0.28, 0.14, 0.32], [0, 0, 0], [0.8, 0.6, 1.4]],
    [new THREE.CylinderGeometry(0.4, 0.45, 0.1, 12), 0xb98a54, [0, 0.05, 0]],
  ];
  C.bunny = bake(bun()); C.bunny2 = bake(bun(0xcdb8a3));
  C.ears = bake([
    [new THREE.CapsuleGeometry(0.1, 0.55, 3, 8), 0xf4f0ee, [0.14, 0.38, 0], [0, 0, -0.12]], [new THREE.CapsuleGeometry(0.1, 0.55, 3, 8), 0xf4f0ee, [-0.14, 0.38, 0], [0, 0, 0.12]],
    [new THREE.CapsuleGeometry(0.05, 0.4, 3, 6), 0xff9ab0, [0.14, 0.38, 0.06], [0, 0, -0.12]], [new THREE.CapsuleGeometry(0.05, 0.4, 3, 6), 0xff9ab0, [-0.14, 0.38, 0.06], [0, 0, 0.12]],
  ]);
  C.ears2 = bake([
    [new THREE.CapsuleGeometry(0.1, 0.55, 3, 8), 0xcdb8a3, [0.14, 0.38, 0], [0, 0, -0.12]], [new THREE.CapsuleGeometry(0.1, 0.55, 3, 8), 0xcdb8a3, [-0.14, 0.38, 0], [0, 0, 0.12]],
    [new THREE.CapsuleGeometry(0.05, 0.4, 3, 6), 0xff9ab0, [0.14, 0.38, 0.06], [0, 0, -0.12]], [new THREE.CapsuleGeometry(0.05, 0.4, 3, 6), 0xff9ab0, [-0.14, 0.38, 0.06], [0, 0, 0.12]],
  ]);
  // draakje
  C.dragon = bake([
    [S(0.5, 14, 10), 0x8f4ad8, [0, 0.7, 0], [0, 0, 0], [0.9, 0.9, 1.25]],
    [S(0.38, 12, 8), 0xffd97a, [0, 0.62, 0.3], [0, 0, 0], [0.8, 0.9, 0.7]],
    [S(0.3, 12, 9), 0x8f4ad8, [0, 1.3, 0.5]], [new THREE.BoxGeometry(0.3, 0.2, 0.34), 0x9b5ae6, [0, 1.2, 0.8]],
    [S(0.045, 6, 5), 0x16121a, [0.05, 1.28, 0.97]], [S(0.045, 6, 5), 0x16121a, [-0.05, 1.28, 0.97]],
    [S(0.07, 6, 5), 0xffe14a, [0.16, 1.4, 0.68]], [S(0.07, 6, 5), 0xffe14a, [-0.16, 1.4, 0.68]],
    [S(0.03, 4, 3), 0x16121a, [0.16, 1.4, 0.74]], [S(0.03, 4, 3), 0x16121a, [-0.16, 1.4, 0.74]],
    [new THREE.ConeGeometry(0.07, 0.3, 5), 0xf5ecd0, [0.15, 1.65, 0.38], [-0.4, 0, -0.3]], [new THREE.ConeGeometry(0.07, 0.3, 5), 0xf5ecd0, [-0.15, 1.65, 0.38], [-0.4, 0, 0.3]],
    [new THREE.ConeGeometry(0.28, 1.0, 7), 0x8f4ad8, [0, 0.55, -0.95], [-Math.PI / 2 - 0.25, 0, 0]],
    [new THREE.ConeGeometry(0.1, 0.25, 4), 0xff6fa5, [0, 1.2, -0.3]], [new THREE.ConeGeometry(0.1, 0.25, 4), 0xff6fa5, [0, 1.12, -0.6]], [new THREE.ConeGeometry(0.1, 0.25, 4), 0xff6fa5, [0, 0.95, -0.9], [-0.5, 0, 0]],
    [new THREE.CylinderGeometry(0.4, 0.45, 0.1, 12), 0xb98a54, [0, 0.05, 0]],
  ]);
  C.dwing = bake([[new THREE.ConeGeometry(0.5, 1.0, 3), 0xc08cff, [0.0, 0.5, 0], [0, 0, 0], [0.18, 1, 1.6]]]);
  // bom
  C.bomb = bake([
    [S(0.64, 16, 12), 0x23232c, [0, 0.74, 0]],
    [new THREE.TorusGeometry(0.64, 0.07, 6, 18), 0xd8372c, [0, 0.74, 0], [Math.PI / 2, 0, 0]],
    [new THREE.CylinderGeometry(0.2, 0.24, 0.24, 8), 0x8a8a96, [0, 1.38, 0]],
    [new THREE.CylinderGeometry(0.04, 0.04, 0.34, 5), 0x7a5a2e, [0.06, 1.62, 0], [0, 0, -0.35]],
    [S(0.11, 8, 6), 0xffffff, [0.2, 0.75, 0.56], [0, 0, 0], [1, 1.3, 0.6]], [S(0.11, 8, 6), 0xffffff, [-0.2, 0.75, 0.56], [0, 0, 0], [1, 1.3, 0.6]],
    [S(0.05, 6, 5), 0xd8372c, [0.2, 0.74, 0.62]], [S(0.05, 6, 5), 0xd8372c, [-0.2, 0.74, 0.62]],
    [new THREE.BoxGeometry(0.28, 0.07, 0.05), 0x050508, [0.2, 0.92, 0.6], [0, 0, -0.45]], [new THREE.BoxGeometry(0.28, 0.07, 0.05), 0x050508, [-0.2, 0.92, 0.6], [0, 0, 0.45]],
    [new THREE.BoxGeometry(0.34, 0.07, 0.05), 0xe8e0d0, [0, 0.46, 0.62]],
    [S(0.1, 6, 5), 0xffffff, [-0.26, 0.98, 0.4], [0, 0, 0], [1, 0.5, 0.5]],
  ]);
  // clown
  C.clown = bake([
    [new THREE.CylinderGeometry(0.38, 0.5, 1.0, 12), 0xe8353c, [0, 0.5, 0]],
    [new THREE.CylinderGeometry(0.385, 0.385, 0.5, 12, 1, false, 0, Math.PI), 0xffe14a, [0, 0.62, 0]],
    [S(0.07, 6, 5), 0x3d82ff, [0, 0.8, 0.4]], [S(0.07, 6, 5), 0x3d82ff, [0, 0.55, 0.42]], [S(0.07, 6, 5), 0x3d82ff, [0, 0.3, 0.47]],
    [new THREE.TorusGeometry(0.34, 0.1, 6, 14), 0xffffff, [0, 1.05, 0], [Math.PI / 2, 0, 0]],
    [S(0.4, 14, 10), 0xfdf0e0, [0, 1.55, 0]],
    [S(0.13, 8, 6), 0xe8353c, [0, 1.5, 0.38]],
    [S(0.07, 6, 5), 0x16121a, [0.16, 1.66, 0.34]], [S(0.07, 6, 5), 0x16121a, [-0.16, 1.66, 0.34]],
    [new THREE.TorusGeometry(0.15, 0.03, 5, 12, Math.PI), 0xe8353c, [0, 1.38, 0.35], [0, 0, Math.PI]],
    [S(0.2, 8, 6), 0xff8a1a, [0.42, 1.65, 0]], [S(0.2, 8, 6), 0xff8a1a, [-0.42, 1.65, 0]],
    [new THREE.ConeGeometry(0.22, 0.5, 8), 0x3d82ff, [0, 2.0, 0], [0, 0, 0.1]], [S(0.08, 6, 5), 0xffe14a, [0.03, 2.28, 0]],
    [new THREE.CapsuleGeometry(0.09, 0.5, 3, 6), 0xe8353c, [0.55, 0.95, 0], [0, 0, -0.7]], [new THREE.CapsuleGeometry(0.09, 0.5, 3, 6), 0xe8353c, [-0.55, 0.95, 0], [0, 0, 0.7]],
    [S(0.11, 6, 5), 0xffffff, [0.8, 1.2, 0]], [S(0.11, 6, 5), 0xffffff, [-0.8, 1.2, 0]],
  ]);
  C.spring = bake(Array.from({ length: 5 }, (_, i) => [new THREE.TorusGeometry(0.22, 0.04, 5, 12), 0x9a9aa6, [0, 0.1 + i * 0.12, 0], [Math.PI / 2, 0, 0]]));
  // spook-eend
  C.ghost = bake([
    ...duck(0xffffff, 0xffffff, 1.15).slice(0, 4).map((p) => p),
    [S(0.1, 6, 5), 0x16121a, [0.16, 1.5, 0.72]], [S(0.1, 6, 5), 0x16121a, [-0.16, 1.5, 0.72]],
    [new THREE.ConeGeometry(0.4, 0.9, 8), 0xffffff, [0, 0.2, 0], [Math.PI, 0, 0], [1.3, 1, 1.3]],
  ]);
  // reuzen-koningseend
  C.king = bake([
    ...duck(0xffd83a, 0xffc21a, 1).map(([g, c, p, r, s]) => [g, c, p, r, s]),
    [new THREE.CylinderGeometry(0.28, 0.24, 0.2, 8, 1, true), 0xf2c230, [0, 1.58, 0.4]],
    ...Array.from({ length: 5 }, (_, i) => [new THREE.ConeGeometry(0.06, 0.2, 4), 0xf2c230, [Math.cos(i / 5 * TAU) * 0.26, 1.76, 0.4 + Math.sin(i / 5 * TAU) * 0.26]]),
    [S(0.06, 6, 5), 0xe8353c, [0, 1.62, 0.68]],
    [new THREE.BoxGeometry(1.1, 0.9, 0.06), 0xc0243a, [0, 0.7, -0.62], [0.25, 0, 0]],
  ]);
  return (CACHE = C);
}

// ------------------------------------------------------------------ doelwit-modellen
const matMain = MB;
let _mats = null;
function mats() {
  if (_mats) return _mats;
  _mats = {
    main: matMain(),
    gold: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.7, emissive: 0xff9a10, emissiveIntensity: 0.45 }),
  };
  return _mats;
}
const mk = (geo, material) => { const m = new THREE.Mesh(geo, material); return m; };
function flapper(geo, material, x, y, z, side) { const p = new THREE.Group(); p.position.set(x, y, z); const m = mk(geo, material); m.position.set(side * 0.06, -0.14, 0); p.add(m); return p; }

export function buildModel(kind) {
  const G = geos(), M = mats(); const g = new THREE.Group(); const o = { group: g, wings: [], kind };
  if (kind === 'duck' || kind === 'baby' || kind === 'gold') {
    g.add(mk(G[kind], kind === 'gold' ? M.gold : M.main));
    const k = kind === 'baby' ? 0.58 : kind === 'gold' ? 0.92 : 1;
    for (const s of [1, -1]) { const w = flapper(kind === 'gold' ? G.wingGold : G.wing, kind === 'gold' ? M.gold : M.main, s * 0.47 * k, 0.8 * k, -0.05, s); w.scale.setScalar(k); g.add(w); o.wings.push([w, s]); }
  } else if (kind === 'fat') {
    g.add(mk(G.fat, M.main));
    for (const s of [1, -1]) { const w = flapper(G.wingFat, M.main, s * 0.9, 1.1, -0.1, s); g.add(w); o.wings.push([w, s]); }
  } else if (kind === 'bunny') {
    const alt = Math.random() < 0.4; g.add(mk(alt ? G.bunny2 : G.bunny, M.main));
    const ears = new THREE.Group(); ears.position.set(0, 1.45, 0.2); ears.add(mk(alt ? G.ears2 : G.ears, M.main)); g.add(ears); o.ears = ears;
  } else if (kind === 'dragon') {
    g.add(mk(G.dragon, M.main));
    for (const s of [1, -1]) { const p = new THREE.Group(); p.position.set(s * 0.4, 1.0, -0.1); const m = mk(G.dwing, M.main); m.rotation.z = -s * 1.2; m.position.set(s * 0.5, 0.2, 0); p.add(m); g.add(p); o.wings.push([p, s]); }
    o.mouth = new THREE.Vector3(0, 1.2, 1.0);
  } else if (kind === 'bomb') {
    g.add(mk(G.bomb, M.main));
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffb02a })); spark.position.set(0.17, 1.82, 0); g.add(spark); o.spark = spark;
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 24), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); halo.position.set(0, 0.75, -0.1); g.add(halo); o.halo = halo;
  } else if (kind === 'clown') {
    const body = new THREE.Group(); body.add(mk(G.clown, M.main)); g.add(body); o.body = body;
    const sp = mk(G.spring, M.main); g.add(sp); o.spring = sp;
  } else if (kind === 'ghost') {
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xcfe8ff, emissive: 0x6fa8ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.6, depthWrite: false, roughness: 0.4 });
    g.add(mk(G.ghost, gm)); o.mat = gm;
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 9), new THREE.MeshBasicMaterial({ color: 0x9ac8ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })); aura.position.y = 0.9; g.add(aura); o.aura = aura;
  } else if (kind === 'king') {
    const kg = new THREE.Group(); kg.add(mk(G.king, M.gold)); kg.scale.setScalar(2.5); g.add(kg); o.inner = kg;
    for (const s of [1, -1]) { const w = flapper(G.wing, M.gold, s * 0.47, 0.8, -0.05, s); kg.add(w); o.wings.push([w, s]); }
  }
  return o;
}

// ------------------------------------------------------------------ pinwheel + bordjes
function bullseye(a = '#e8353c', b = '#ffffff') {
  return canvasTex(128, 128, (g, w, h) => {
    const cols = [a, b, a, b, '#ffd24a'];
    for (let i = 0; i < 5; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2 - i * 12, 0, TAU); g.fill(); }
    g.strokeStyle = '#4a2a10'; g.lineWidth = 4; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); g.stroke();
  });
}
export function buildPinwheel() {
  const g = new THREE.Group(); const hub = new THREE.Group(); g.add(hub);
  const cols = [0xe8353c, 0xffd24a, 0x3d82ff, 0x35c46f];
  cols.forEach((c, i) => {
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; hub.add(arm);
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0.55, 0.15); sh.lineTo(0.2, 1.9); sh.lineTo(-0.15, 1.9); sh.lineTo(0, 0);
    arm.add(new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.6 })));
    arm.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 5), mat(0xb98a54), { cast: false, pos: [0, 0.9, 0.02] }));
  });
  hub.add(mesh(new THREE.SphereGeometry(0.28, 12, 8), mat(0xf2c230, { metalness: 0.7, roughness: 0.3 }), { cast: false, pos: [0, 0, 0.12] }));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 7, 6), mat(0x6b4a2e), { cast: false, pos: [0, -3.5, -0.2] }));
  const bt = bullseye(); const discs = [];
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), [mat(0x6b4a2e), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }), mat(0x6b4a2e)]);
    d.rotation.x = Math.PI / 2; const holder = new THREE.Group(); holder.add(d); hub.add(holder); discs.push({ holder, mesh: d });
  }
  return { group: g, hub, discs };
}
export function buildPlate() {
  const g = new THREE.Group(); const spin = new THREE.Group(); g.add(spin);
  const front = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#f2c230'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); c.fill();
    c.fillStyle = '#e8353c'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 14, 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 28, 0, TAU); c.fill();
    c.fillStyle = '#3d82ff'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 40, 0, TAU); c.fill();
    c.fillStyle = '#ffd24a'; c.beginPath(); for (let k = 0; k < 10; k++) { const a = k / 10 * TAU - Math.PI / 2, r = k % 2 ? 7 : 16; c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); } c.fill();
    c.strokeStyle = '#4a2a10'; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); c.stroke();
  });
  const back = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#b8bfd0'; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); c.fill();
    c.strokeStyle = '#6a7088'; c.lineWidth = 6; c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 14, 0, TAU); c.stroke();
    c.fillStyle = '#6a7088'; c.font = 'bold 54px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('✦', w / 2, h / 2 + 3);
  });
  const d = new THREE.Mesh(new THREE.CylinderGeometry(0.88, 0.88, 0.14, 24), [mat(0x8a6a3a), new THREE.MeshStandardMaterial({ map: front, roughness: 0.5, metalness: 0.2 }), new THREE.MeshStandardMaterial({ map: back, roughness: 0.4, metalness: 0.4 })]);
  d.rotation.x = Math.PI / 2; spin.add(d);
  g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 4), mat(0x9a9aa6), { cast: false, pos: [0, 2.9, 0] }));
  g.add(mesh(new THREE.TorusGeometry(0.1, 0.03, 5, 8), mat(0x9a9aa6), { cast: false, pos: [0, 0.95, 0] }));
  return { group: g, spin };
}

// ------------------------------------------------------------------ de kraam zelf
function backdropCanvas() {
  return canvasTex(1024, 512, (g, w, h) => {
    const r = mulberry32(11);
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#5d3ea0'); sky.addColorStop(0.45, '#c25fa8'); sky.addColorStop(0.75, '#ffa56b'); sky.addColorStop(1, '#ffd08a'); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`; g.fillRect(r() * w, r() * h * 0.45, 2, 2); }
    g.fillStyle = '#fff6d0'; g.beginPath(); g.arc(820, 110, 52, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,246,208,.18)'; g.beginPath(); g.arc(820, 110, 84, 0, TAU); g.fill();
    for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(255,255,255,.35)'; const x = r() * w, y = 80 + r() * 160; for (let k = 0; k < 4; k++) { g.beginPath(); g.ellipse(x + k * 26, y + (k % 2) * 6, 34, 14, 0, 0, TAU); g.fill(); } }
    const mount = (base, amp, col, seed) => { const rr = mulberry32(seed); g.fillStyle = col; g.beginPath(); g.moveTo(0, h); let y = base; for (let x = 0; x <= w; x += 32) { y = base - rr() * amp; g.lineTo(x, y); } g.lineTo(w, h); g.fill(); };
    mount(330, 120, '#8b5fb0', 3); mount(380, 90, '#6a4694', 7);
    // kasteel op de heuvel
    const cx = 300, cy = 330; g.fillStyle = '#4a2f78'; g.beginPath(); g.ellipse(cx, cy + 70, 260, 70, 0, 0, TAU); g.fill();
    g.fillStyle = '#3a2564';
    g.fillRect(cx - 90, cy - 30, 180, 90);
    for (const [tx, tw, th] of [[-120, 44, 150], [-60, 36, 190], [60, 36, 190], [120, 44, 150], [0, 54, 230]]) { g.fillRect(cx + tx - tw / 2, cy + 60 - th, tw, th); g.beginPath(); g.moveTo(cx + tx - tw / 2 - 6, cy + 60 - th); g.lineTo(cx + tx, cy + 60 - th - 54); g.lineTo(cx + tx + tw / 2 + 6, cy + 60 - th); g.fill(); }
    g.fillStyle = '#ffdd7a'; for (const [wx, wy] of [[-120, 20], [-60, -10], [60, -10], [120, 20], [0, -50], [0, 0], [-30, 30], [30, 30]]) g.fillRect(cx + wx - 4, cy + wy, 8, 14);
    g.fillStyle = '#e8353c'; g.fillRect(cx - 2, cy + 60 - 230 - 90, 3, 36); g.beginPath(); g.moveTo(cx + 1, cy - 260); g.lineTo(cx + 24, cy - 250); g.lineTo(cx + 1, cy - 240); g.fill();
    // dennen
    g.fillStyle = '#2a1a50';
    for (let i = 0; i < 26; i++) { const x = r() * w, y = 420 + r() * 70, s = 24 + r() * 26; if (Math.abs(x - cx) < 150) continue; g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * 0.55, y); g.lineTo(x - s * 0.55, y); g.fill(); }
    // draak-silhouet
    g.fillStyle = '#2a1a50'; g.save(); g.translate(560, 200); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(30, -30, 70, -10); g.quadraticCurveTo(40, 0, 90, 20); g.quadraticCurveTo(30, 12, 0, 0); g.fill(); g.beginPath(); g.moveTo(30, -4); g.lineTo(60, -50); g.lineTo(50, -6); g.fill(); g.restore();
  });
}
function stripeCanvas(c1, c2, n = 16) {
  return canvasTex(512, 64, (g, w, h) => { const sw = w / n; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * sw, 0, sw + 1, h); } g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(0, h - 8, w, 8); });
}
function beltCanvas(dir) {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#5b3a1e'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a5a2b'; g.fillRect(0, 4, w, h - 8);
    g.strokeStyle = '#f2c230'; g.lineWidth = 7; g.lineJoin = 'round';
    for (let i = 0; i < 2; i++) { const x = i * 64 + 14; g.beginPath(); if (dir > 0) { g.moveTo(x, 12); g.lineTo(x + 26, h / 2); g.lineTo(x, h - 12); } else { g.moveTo(x + 26, 12); g.lineTo(x, h / 2); g.lineTo(x + 26, h - 12); } g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 0, w, 4); g.fillRect(0, h - 4, w, 4);
  });
}

export function buildStall(ctx) {
  const { scene, fx } = ctx; const anim = [];
  const add = (o) => { scene.add(o); return o; };
  // vloer + achterwand
  add(mesh(new THREE.PlaneGeometry(80, 40), new THREE.MeshStandardMaterial({ map: tex.planks(16, 8, '#8a6238'), roughness: 1 }), { cast: false, receive: false, pos: [0, 0, 6], rot: [-Math.PI / 2, 0, 0] }));
  const bd = new THREE.Mesh(new THREE.PlaneGeometry(46, 23), new THREE.MeshBasicMaterial({ map: backdropCanvas(), fog: false })); bd.position.set(0, 6.3, -6); add(bd);
  // zijwanden
  const wood = new THREE.MeshStandardMaterial({ map: tex.planks(4, 2, '#7a4a28'), roughness: 1 });
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(14, 13), wood); w.position.set(s * 13.4, 6.5, 1); w.rotation.y = -s * Math.PI / 2; add(w);
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(20, 13), wood); w2.position.set(s * 17.5, 6.5, -4.5); w2.rotation.y = 0; add(w2);
  }
  // gordijnen
  for (const s of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(2.6, 10.6, 14, 1); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 4.2) * 0.22 + (p.getY(i) < 0 ? 0 : 0));
    geo.computeVertexNormals();
    const c = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb01c3a, side: THREE.DoubleSide, roughness: 0.8 })); c.position.set(s * 12.2, 5.7, 1.2); add(c);
    add(mesh(new THREE.TorusGeometry(0.7, 0.07, 6, 12), mat(0xf2c230, { metalness: 0.6 }), { cast: false, pos: [s * 11.2, 4.4, 1.5], rot: [0, 0, 0] }));
    add(mesh(new THREE.ConeGeometry(0.22, 0.7, 6), mat(0xf2c230, { metalness: 0.6 }), { cast: false, pos: [s * 11.2, 3.7, 1.5], rot: [Math.PI, 0, 0] }));
  }
  // luifel
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(27, 2.6), new THREE.MeshStandardMaterial({ map: stripeCanvas('#7a3ab8', '#ffd24a', 18), roughness: 0.9, side: THREE.DoubleSide })); awn.position.set(0, 11.8, 3.2); add(awn);
  const sc = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.75, 12, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x7a3ab8 : 0xffd24a, roughness: 0.9, side: THREE.DoubleSide }));
    m.position.set(-12.75 + i * 1.5, 10.55, 3.2); add(m);
  }
  const roof = new THREE.Mesh(new THREE.PlaneGeometry(27, 9), new THREE.MeshStandardMaterial({ map: stripeCanvas('#7a3ab8', '#ffd24a', 18), roughness: 0.9, side: THREE.DoubleSide })); roof.position.set(0, 14.0, -0.5); roof.rotation.x = -0.7; add(roof);
  // uithangbord
  const sign = canvasTex(1024, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#7a4a28'); gr.addColorStop(1, '#5b3a1e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#f2c230'; g.lineWidth = 12; g.strokeRect(10, 10, w - 20, h - 20);
    g.font = 'bold 104px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.lineJoin = 'round'; g.strokeStyle = '#3a1e08'; g.strokeText('SCHIETTENT', w / 2 + 30, h / 2 + 4); g.fillStyle = '#ffe14a'; g.fillText('SCHIETTENT', w / 2 + 30, h / 2 + 4);
    g.font = '90px serif'; g.fillText('🦆', 140, h / 2 + 6); g.fillText('🦆', w - 140, h / 2 + 6);
  });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 1.78), new THREE.MeshStandardMaterial({ map: sign, roughness: 0.7 })); sg.position.set(0, 11.6, 3.45); add(sg);
  // lampjes
  const NB = 34; const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), NB); bulbs.frustumCulled = false; add(bulbs);
  const bc = [0xff4a6a, 0xffd24a, 0x4aff9a, 0x4aa8ff, 0xff8a3a]; const _bm = new THREE.Matrix4(), _bcCol = new THREE.Color();
  for (let i = 0; i < NB; i++) { const u = i / (NB - 1); const x = -13 + u * 26; const y = 9.7 - Math.sin(u * Math.PI * 4) * 0.0 - 0.0 + Math.abs(Math.sin(u * Math.PI * 6)) * -0.0; _bm.makeTranslation(x, 10.05 + Math.sin(u * Math.PI * 5) * 0.12, 3.5); bulbs.setMatrixAt(i, _bm); bulbs.setColorAt(i, _bcCol.setHex(bc[i % bc.length])); }
  anim.push((t) => { for (let i = 0; i < NB; i++) { const f = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.7); bulbs.setColorAt(i, _bcCol.setHex(bc[(i + Math.floor(t * 1.5)) % bc.length]).multiplyScalar(0.6 + f * 0.7)); } bulbs.instanceColor.needsUpdate = true; });
  // kraam-teller (balie)
  const front = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#7a3ab8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#ffd24a' : '#e8353c'; g.beginPath(); g.moveTo(i * 64, h); g.lineTo(i * 64 + 32, 14); g.lineTo(i * 64 + 64, h); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(0, 0, w, 10);
  });
  add(mesh(new THREE.BoxGeometry(27.5, 1.5, 0.6), new THREE.MeshStandardMaterial({ map: front, roughness: 0.8 }), { cast: false, pos: [0, 0.75, 8.2] }));
  add(mesh(new THREE.BoxGeometry(27.9, 0.22, 2.4), mat(0xb98a54), { cast: false, pos: [0, 1.55, 7.4] }));
  add(mesh(new THREE.BoxGeometry(27.9, 0.1, 2.5), mat(0xf2c230, { metalness: 0.6, roughness: 0.4 }), { cast: false, pos: [0, 1.7, 7.4] }));
  // score-bord
  const board = { c: document.createElement('canvas'), t: null, vals: [-1, -1] };
  board.c.width = 512; board.c.height = 128; board.t = new THREE.CanvasTexture(board.c); board.t.colorSpace = THREE.SRGBColorSpace;
  const bm = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.55), new THREE.MeshBasicMaterial({ map: board.t })); bm.position.set(0, 0.95, 8.54); add(bm);
  board.draw = (names, vals, cols) => {
    if (board.vals[0] === vals[0] && board.vals[1] === vals[1]) return; board.vals = vals.slice();
    const g = board.c.getContext('2d'); g.fillStyle = '#2a1608'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#f2c230'; g.lineWidth = 8; g.strokeRect(4, 4, 504, 120);
    g.textBaseline = 'middle'; g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.fillStyle = cols[0]; g.textAlign = 'left'; g.fillText(names[0], 24, 38); g.fillStyle = cols[1]; g.textAlign = 'right'; g.fillText(names[1], 488, 38);
    g.font = 'bold 62px Fredoka, Arial Black, sans-serif'; g.fillStyle = cols[0]; g.textAlign = 'left'; g.fillText(String(vals[0]), 40, 88); g.fillStyle = cols[1]; g.textAlign = 'right'; g.fillText(String(vals[1]), 472, 88);
    g.fillStyle = '#ffe14a'; g.textAlign = 'center'; g.font = 'bold 54px serif'; g.fillText('🦆', 256, 66); board.t.needsUpdate = true;
  };
  // banden
  const belts = [];
  ROWS.forEach((row, ri) => {
    const bt = beltCanvas(row.dir); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(25 / 1.2 / 2, 1);
    const side = mat(0x5b3a1e); const front2 = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.8 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(25, 0.7, 1.4), [side, side, mat(0x3a2410), side, front2, side]); b.position.set(0, row.y - 0.38, 0.1); add(b);
    add(mesh(new THREE.BoxGeometry(25.4, 0.12, 1.6), mat(0xf2c230, { metalness: 0.6, roughness: 0.4 }), { cast: false, pos: [0, row.y - 0.0, 0.1] }));
    const cogs = []; for (const s of [-1, 1]) { const c = mesh(new THREE.CylinderGeometry(0.62, 0.62, 1.5, 10), mat(0x9a9aa6, { metalness: 0.5 }), { cast: false, pos: [s * 12.6, row.y - 0.38, 0.1], rot: [0, 0, Math.PI / 2] }); c.rotation.x = Math.PI / 2; add(c); cogs.push(c); }
    belts.push({ tex: bt, row, cogs });
  });
  // achterschot in de rijen (houten plank met golf)
  ROWS.forEach((row) => add(mesh(new THREE.BoxGeometry(25, 0.16, 0.3), mat(0x3a2410), { cast: false, pos: [0, row.y + 1.7, -0.5] })));
  // kermis-gloed: zachte lichtvlekken
  const glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,230,160,.55)'); gr.addColorStop(1, 'rgba(255,230,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  for (const x of [-9, 0, 9]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(9, 5, 1); s.position.set(x, 10.1, 1); add(s); }
  // klaprozen/lantaarns aan de zijkant
  const lanterns = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 13.0, 9.8, 2.6);
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4), mat(0x555566), { cast: false, pos: [0, 0.6, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.75, 0.55), glow(0xffc86a, 1.6), { cast: false, pos: [0, -0.1, 0] }));
    g.add(mesh(new THREE.ConeGeometry(0.45, 0.35, 4), mat(0x7a3ab8), { cast: false, pos: [0, 0.38, 0], rot: [0, Math.PI / 4, 0] }));
    add(g); lanterns.push(g);
  }
  // wimpels aan de zijwand
  const flags = [];
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 3), new THREE.MeshStandardMaterial({ color: [0xe8353c, 0xffd24a, 0x3d82ff, 0x35c46f][i % 4], roughness: 0.8, side: THREE.DoubleSide }));
    m.rotation.z = Math.PI; m.position.set(s * 13.2, 8.4 - Math.abs(Math.sin(i / 6 * Math.PI)) * -0.0 - i * 0.0, 5.5 - i * 1.4); m.rotation.y = Math.PI / 2; add(m); flags.push(m);
  }
  let spT = 0;
  anim.push((t, dt) => {
    for (const b of belts) { b.tex.offset.x -= b.row.dir * b.row.speed * dt / 1.2 / 2 * 1.0; for (const c of b.cogs) c.rotation.y += b.row.dir * b.row.speed * dt / 0.62; }
    lanterns.forEach((g, i) => { g.rotation.z = Math.sin(t * 1.1 + i * 3) * 0.08; });
    flags.forEach((m, i) => { m.rotation.x = Math.sin(t * 3 + i) * 0.2; });
    spT -= dt; if (spT <= 0) { spT = 0.22; fx.particles.emit(rand(-12, 12), rand(1.5, 9.5), rand(-1.5, 2), rand(-0.15, 0.15), rand(0.1, 0.4), 0, { life: 3, size: 0.14, color: [0xffe9a0, 0xffffff, 0xffc0e0][Math.floor(Math.random() * 3)], gravity: -0.02, shrink: true }); }
  });
  return { update(t, dt) { for (const f of anim) f(t, dt); }, board, belts };
}
