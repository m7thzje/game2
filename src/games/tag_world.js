import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { skyTexture } from '../engine/lights.js';
import { mergeStatic } from './quickdraw_merge.js';

// Omgeving en bouwstenen van "Bommentikkertje": een binnenplaats van het bergkasteel bij maanlicht met kantelen, torens, fakkels en obstakels.

export const ARENA = { AX: 15, AZ: 8.6 };
const VC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });

// voegt alle meshes van een groep samen tot één mesh met vertexkleuren (1 draw call per object)
export function bake(group, { cast = true, receive = true } = {}) {
  group.updateMatrixWorld(true);
  const P = [], N = [], C = [], v = new THREE.Vector3(), nm = new THREE.Matrix3();
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry, pa = g.attributes.position, na = g.attributes.normal, c = o.material.color || new THREE.Color(1, 1, 1);
    nm.getNormalMatrix(o.matrixWorld);
    const em = o.material.emissive && o.material.emissiveIntensity > 0.2 ? o.material.emissive : null;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld); P.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
      if (em) C.push(Math.min(1.6, c.r + em.r), Math.min(1.6, c.g + em.g), Math.min(1.6, c.b + em.b)); else C.push(c.r, c.g, c.b);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, VC); m.castShadow = cast; m.receiveShadow = receive; return m;
}
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, ...o });
const add = (g, geo, c, pos, rot, scale, o) => { const m = new THREE.Mesh(geo, M(c, o)); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (scale) m.scale.set(...scale); g.add(m); return m; };

// ---------------- obstakels ----------------
export const KINDS = {
  pillar: { r: 1.05, name: 'zuil', col: 0xc9bfe0, build() {
    const g = new THREE.Group();
    add(g, new THREE.BoxGeometry(2.0, 0.5, 2.0), 0x8a7fa0, [0, 0.25, 0]); add(g, new THREE.CylinderGeometry(0.75, 0.85, 2.8, 10), 0xc9bfe0, [0, 1.9, 0]);
    for (const y of [0.9, 2.9]) add(g, new THREE.TorusGeometry(0.82, 0.08, 5, 12), 0xd8b24a, [0, y, 0], [Math.PI / 2, 0, 0], null, { metalness: 0.5, roughness: 0.4 });
    add(g, new THREE.BoxGeometry(2.0, 0.45, 2.0), 0x8a7fa0, [0, 3.5, 0]); add(g, new THREE.SphereGeometry(0.42, 8, 6), 0xff5a8a, [0, 4.0, 0], null, null, { emissive: 0xff2a60, emissiveIntensity: 0.5 });
    return g;
  } },
  barrels: { r: 1.05, name: 'tonnen', col: 0xb07a45, build() {
    const g = new THREE.Group();
    for (const [x, z, s] of [[-0.45, 0.2, 1], [0.5, 0.25, 0.95], [0.0, -0.5, 1.05]]) {
      add(g, new THREE.CylinderGeometry(0.46 * s, 0.4 * s, 1.15 * s, 10), 0xb07a45, [x, 0.58 * s, z]);
      for (const y of [0.25, 0.9]) add(g, new THREE.TorusGeometry(0.45 * s, 0.04, 5, 14), 0x4a4a55, [x, y * s, z], [Math.PI / 2, 0, 0], null, { metalness: 0.5 });
    }
    add(g, new THREE.CylinderGeometry(0.4, 0.36, 0.9, 10), 0x9a6a3a, [0.0, 1.55, -0.1]); add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), 0xff3a2a, [0, 2.2, -0.1], null, null, { emissive: 0xff2010, emissiveIntensity: 0.6 });
    return g;
  } },
  crates: { r: 1.1, name: 'kisten', col: 0xc79a5a, build() {
    const g = new THREE.Group();
    const box = (x, y, z, s, c, ry) => { add(g, new THREE.BoxGeometry(s, s, s), c, [x, y + s / 2, z], [0, ry, 0]); for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, new THREE.BoxGeometry(s * 0.1, s * 1.02, s * 0.1), 0x6b4a2a, [x + Math.cos(ry) * sx * s * 0.45 - Math.sin(ry) * sz * s * 0.45, y + s / 2, z + Math.sin(ry) * sx * s * 0.45 + Math.cos(ry) * sz * s * 0.45], [0, ry, 0]); };
    box(0, 0, 0, 1.6, 0xc79a5a, 0.1); box(0.1, 1.6, 0, 1.1, 0xd8ae6a, -0.3);
    return g;
  } },
  bush: { r: 1.25, name: 'struik', col: 0x4ab04a, build() {
    const g = new THREE.Group();
    for (const [x, y, z, r, c] of [[0, 0.9, 0, 1.15, 0x3f9e3f], [0.7, 0.7, 0.3, 0.8, 0x4ab04a], [-0.6, 0.75, -0.3, 0.85, 0x3a8f3a], [0.1, 1.5, -0.1, 0.7, 0x58c058]]) add(g, new THREE.IcosahedronGeometry(r, 1), c, [x, y, z]);
    for (const [x, y, z] of [[0.5, 1.4, 0.7], [-0.8, 1.1, 0.5], [0.9, 0.6, -0.6]]) add(g, new THREE.SphereGeometry(0.16, 6, 5), 0xff7ab8, [x, y, z]);
    return g;
  } },
  fountain: { r: 1.9, name: 'fontein', col: 0x9fb8d8, build() {
    const g = new THREE.Group();
    add(g, new THREE.CylinderGeometry(1.9, 2.1, 0.7, 14), 0x9a98b0, [0, 0.35, 0]); add(g, new THREE.CylinderGeometry(1.6, 1.6, 0.1, 14), 0x4aa8e8, [0, 0.72, 0], null, null, { emissive: 0x2a78c0, emissiveIntensity: 0.6 });
    add(g, new THREE.CylinderGeometry(0.3, 0.4, 1.8, 8), 0xb8b6cc, [0, 1.4, 0]); add(g, new THREE.CylinderGeometry(0.95, 0.5, 0.35, 12), 0xb8b6cc, [0, 2.3, 0]);
    add(g, new THREE.SphereGeometry(0.4, 8, 6), 0xd8f4ff, [0, 2.75, 0], null, null, { emissive: 0x6acaff, emissiveIntensity: 0.8 });
    return g;
  } },
};
export function makeObstacle(kind) { const m = bake(KINDS[kind].build()); m.userData.kind = kind; return m; }

// ---------------- losse bouwstenen ----------------
export function makeBomb() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.46, 14, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.35, metalness: 0.4 }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0xc8a040, metalness: 0.7, roughness: 0.3 })); cap.position.y = 0.46;
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 5), new THREE.MeshStandardMaterial({ color: 0xcdb38a })); fuse.position.set(0.06, 0.7, 0); fuse.rotation.z = -0.4;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff })); shine.position.set(-0.17, 0.2, 0.34);
  const spark = glowSprite(0xffc040, 0.9, 1); spark.position.set(0.14, 0.9, 0);
  const glow = glowSprite(0xff3a1a, 2.4, 0.0); glow.position.y = 0;
  g.add(body, cap, fuse, shine, spark, glow); g.userData = { body, spark, glow };
  return g;
}
export function makePeel() {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + 0.4; add(g, new THREE.SphereGeometry(0.4, 7, 5), 0xffd92a, [Math.cos(a) * 0.32, 0.1, Math.sin(a) * 0.32], [0, -a, 0.5], [1.3, 0.28, 0.5]); }
  add(g, new THREE.SphereGeometry(0.15, 6, 5), 0xd8a820, [0, 0.16, 0]); add(g, new THREE.CylinderGeometry(0.04, 0.05, 0.22, 5), 0x6a4a1a, [0, 0.32, 0]);
  return bake(g, { receive: false });
}
export function makeGift(ribbon) {
  const g = new THREE.Group();
  add(g, new THREE.BoxGeometry(1.0, 0.8, 1.0), 0xf4f0ff, [0, 0.4, 0]);
  add(g, new THREE.BoxGeometry(1.04, 0.82, 0.22), ribbon, [0, 0.4, 0], null, null, { emissive: ribbon, emissiveIntensity: 0.3 }); add(g, new THREE.BoxGeometry(0.22, 0.82, 1.04), ribbon, [0, 0.4, 0], null, null, { emissive: ribbon, emissiveIntensity: 0.3 });
  for (const s of [-1, 1]) add(g, new THREE.SphereGeometry(0.2, 6, 5), ribbon, [s * 0.2, 0.9, 0], null, [1.2, 0.8, 0.8], { emissive: ribbon, emissiveIntensity: 0.3 });
  return bake(g, { receive: false });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
let _gt = null;
export function glowSprite(color, size, op = 0.8) { _gt = _gt || glowTex(); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _gt, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(size, size, 1); return s; }
export function makeUfo() {
  const g = new THREE.Group();
  const pts = [[0, -0.5], [0.7, -0.4], [1.9, -0.05], [2.4, 0.1], [1.9, 0.3], [0.9, 0.45], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: 0xaab4d0, metalness: 0.7, roughness: 0.3, flatShading: true })); g.add(hull);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 14, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7affc0, emissive: 0x2ac080, emissiveIntensity: 0.7, transparent: true, opacity: 0.85 })); dome.position.y = 0.45; g.add(dome);
  const alien = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x66dd44 })); alien.position.y = 0.75; g.add(alien);
  const lights = []; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; const l = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshBasicMaterial({ color: k % 2 ? 0xffe14a : 0xff5ad8 })); l.position.set(Math.cos(a) * 2.1, 0.12, Math.sin(a) * 2.1); g.add(l); lights.push(l); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 2.2, 1, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x9affc8, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); beam.visible = false; g.add(beam);
  g.userData = { hull, lights, beam, alien };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o !== beam; } });
  return g;
}
export function scorchTexture() { return canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(10,6,8,.92)'); gr.addColorStop(0.55, 'rgba(20,10,10,.75)'); gr.addColorStop(0.8, 'rgba(255,120,30,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }); }

// ---------------- vloer ----------------
function floorTexture(colors, starts) {
  const { AX, AZ } = ARENA, W = 1024, H = Math.round(1024 * AZ / AX);
  return canvasTex(W, H, (g, w, h) => {
    const r = mulberry32(8), px = w / (2 * AX), pz = h / (2 * AZ);
    g.fillStyle = '#4a4560'; g.fillRect(0, 0, w, h);
    // flagstones van 2 x 2 met willekeurige tint
    for (let x = 0; x < 2 * AX; x += 2) for (let z = 0; z < 2 * AZ; z += 2) { const l = 0.85 + r() * 0.3; g.fillStyle = `rgb(${Math.round(84 * l)},${Math.round(78 * l)},${Math.round(108 * l)})`; g.fillRect(x * px + 1.5, z * pz + 1.5, 2 * px - 3, 2 * pz - 3); }
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 2 + r() * 8, 2 + r() * 6); }
    g.strokeStyle = 'rgba(20,16,30,.45)'; g.lineWidth = 1.5; for (let i = 0; i < 70; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    // gouden rand met patroon
    g.fillStyle = 'rgba(30,22,40,.9)'; const b = 0.55; g.fillRect(0, 0, w, b * pz); g.fillRect(0, h - b * pz, w, b * pz); g.fillRect(0, 0, b * px, h); g.fillRect(w - b * px, 0, b * px, h);
    g.fillStyle = '#d8a830'; for (let x = 0; x < 2 * AX; x += 1) { if (x % 2) continue; g.fillRect(x * px, 0.1 * pz, px, 0.3 * pz); g.fillRect(x * px, h - 0.4 * pz, px, 0.3 * pz); }
    // middencirkel met bom
    g.save(); g.translate(w / 2, h / 2); g.scale(1, pz / px);
    g.strokeStyle = 'rgba(255,200,80,.85)'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 4.0 * px, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 3.55 * px, 0, TAU); g.stroke();
    for (let k = 0; k < 16; k++) { const a = k / 16 * TAU; g.save(); g.rotate(a); g.fillStyle = 'rgba(255,200,80,.8)'; g.beginPath(); g.moveTo(3.55 * px, 0); g.lineTo(4.0 * px, -0.16 * px); g.lineTo(4.0 * px, 0.16 * px); g.closePath(); g.fill(); g.restore(); }
    g.restore();
    // startcirkels in spelerskleur
    starts.forEach(([sx, sz], i) => {
      g.save(); g.translate(w / 2 + sx * px, h / 2 + sz * pz); g.scale(1, pz / px);
      const gr = g.createRadialGradient(0, 0, 4, 0, 0, 2.6 * px); gr.addColorStop(0, colors[i].replace('1)', '.5)')); gr.addColorStop(1, colors[i].replace('1)', '0)')); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 2.6 * px, 0, TAU); g.fill();
      g.strokeStyle = colors[i]; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 1.9 * px, 0, TAU); g.stroke();
      g.lineWidth = 4; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 1.3 * px, Math.sin(a) * 1.3 * px); g.lineTo(Math.cos(a + 0.5) * 1.3 * px, Math.sin(a + 0.5) * 1.3 * px); g.stroke(); }
      g.restore();
    });
  });
}

// ---------------- hele omgeving ----------------
export function buildArena(ctx, colorsCss, colorsHex, starts = [[-11.2, 0], [11.2, 0]]) {
  const { scene, fx } = ctx; const { AX, AZ } = ARENA; const rng = mulberry32(99);
  const W = { t: 0, torches: [], banners: [] };
  scene.background = skyTexture('#06081c', '#2a2552'); scene.fog = new THREE.Fog(0x181a3a, 55, 150);
  const root = new THREE.Group(); scene.add(root);
  const stoneT = tex.stone(1, 1);
  // vloer
  const floorT = floorTexture(colorsCss, starts);
  const floor = mesh(new THREE.PlaneGeometry(2 * AX, 2 * AZ), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.85 }), { cast: false, pos: [0, 0, 0], rot: [-Math.PI / 2, 0, 0] }); scene.add(floor);
  // buitengrond
  const ground = mesh(new THREE.CircleGeometry(120, 24), new THREE.MeshStandardMaterial({ map: tex.cobble(30, 30), color: 0x6a6a90, roughness: 1 }), { cast: false, pos: [0, -0.02, 0], rot: [-Math.PI / 2, 0, 0] }); scene.add(ground);
  // muren: laag vooraan, hoger opzij en achter met kantelen
  const wallM = M(0x8d8aa8), topM = M(0x6a6788);
  const wall = (x, z, w, d, h) => { root.add(mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex.stone(w / 3, h / 3), color: 0xaaa6c8, roughness: 0.95, flatShading: true }), { pos: [x, h / 2, z] })); };
  wall(0, AZ + 0.5, 2 * AX + 2, 1, 1.0); wall(-AX - 0.5, 0, 1, 2 * AZ, 1.8); wall(AX + 0.5, 0, 1, 2 * AZ, 1.8);
  wall(0, -AZ - 1.0, 2 * AX + 4, 2, 4.2);
  for (let x = -AX - 1; x <= AX + 1; x += 2) root.add(mesh(new THREE.BoxGeometry(1.1, 0.7, 1.4), wallM, { pos: [x, 4.55, -AZ - 1.0] }));
  for (let z = -AZ + 1; z <= AZ - 1; z += 2) for (const sx of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(1.2, 0.5, 1.1), wallM, { pos: [sx * (AX + 0.5), 2.05, z] }));
  for (let x = -AX; x <= AX; x += 2) root.add(mesh(new THREE.BoxGeometry(1.1, 0.4, 1.2), wallM, { pos: [x, 1.2, AZ + 0.5] }));
  // lichtgevende ramen in de achterwand
  const winM = new THREE.MeshBasicMaterial({ color: 0xffc860 });
  for (let k = -3; k <= 3; k++) { if (k === 0) continue; root.add(mesh(new THREE.BoxGeometry(1.0, 1.8, 0.2), winM, { cast: false, receive: false, pos: [k * 4.2, 2.6, -AZ - 0.0] })); root.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 10, 1, false, 0, Math.PI), winM, { cast: false, receive: false, pos: [k * 4.2, 3.5, -AZ - 0.0], rot: [Math.PI / 2, 0, 0] })); }
  // grote poort in het midden achter
  root.add(mesh(new THREE.BoxGeometry(4.2, 3.6, 0.4), M(0x2a1a14), { cast: false, pos: [0, 1.8, -AZ - 0.02] })); root.add(mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.4, 14, 1, false, 0, Math.PI), M(0x2a1a14), { cast: false, pos: [0, 3.6, -AZ - 0.02], rot: [Math.PI / 2, 0, 0] }));
  root.add(mesh(new THREE.BoxGeometry(4.6, 0.3, 0.5), M(0xd8b24a, { metalness: 0.6, roughness: 0.4 }), { cast: false, pos: [0, 0.15, -AZ + 0.1] }));
  // torens op de hoeken
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const t = new THREE.Group(); t.position.set(sx * (AX + 2.4), 0, sz * (AZ + 2.0)); const h = sz < 0 ? 9 : 4.5; t.add(mesh(new THREE.CylinderGeometry(1.8, 2.0, h, 10), new THREE.MeshStandardMaterial({ map: tex.stone(2, h / 3), color: 0xb0acd0, flatShading: true, roughness: 0.95 }), { pos: [0, h / 2, 0] })); t.add(mesh(new THREE.CylinderGeometry(2.3, 1.8, 0.9, 10), wallM, { pos: [0, h + 0.2, 0] })); t.add(mesh(new THREE.ConeGeometry(2.4, 3.4, 10), M(sx < 0 ? 0x2a8a5a : 0x3a62c8), { pos: [0, h + 2.4, 0] })); if (sz < 0) for (let k = 0; k < 2; k++) t.add(mesh(new THREE.BoxGeometry(0.5, 1.0, 0.2), winM, { cast: false, pos: [0, h * (0.5 + k * 0.28), 1.8] })); root.add(t); }
  // bergen in de verte
  for (let k = 0; k < 12; k++) { const a = Math.PI * (1.05 + k / 11 * 0.9), r = 70 + rng() * 20, h = 18 + rng() * 22; root.add(mesh(new THREE.ConeGeometry(14 + rng() * 10, h, 6), M(0x1c1a3a, { roughness: 1 }), { cast: false, receive: false, pos: [Math.cos(a) * r * 1.3, h / 2 - 1, Math.sin(a) * r - 10], rot: [0, rng() * 3, 0] })); }
  mergeStatic(root);

  // fakkels (instanced vlammen) en spandoeken
  const tp = []; for (const x of [-12, -6, 6, 12]) tp.push([x, 3.2, -AZ + 0.3]); for (const sx of [-1, 1]) for (const z of [-5, 0, 5]) tp.push([sx * (AX + 0.1), 2.7, z]);
  const fm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xffa030 }), tp.length); fm.frustumCulled = false; scene.add(fm);
  const stick = new THREE.Group(); for (const p of tp) { stick.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.9, 5), M(0x4a3322), { cast: false, pos: [p[0], p[1] - 0.45, p[2]] })); stick.add(mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.2, 6), M(0x333340, { metalness: 0.5 }), { cast: false, pos: [p[0], p[1] - 0.05, p[2]] })); } scene.add(stick); mergeStatic(stick);
  const gl = []; for (const p of tp.filter((_, i) => i % 2 === 0)) { const s = glowSprite(0xff8a30, 5.5, 0.45); s.position.set(p[0], p[1] + 0.3, p[2]); scene.add(s); gl.push(s); }
  W.torches = tp;
  // spandoeken: slot 0 links, slot 1 rechts; bij 3 spelers hangt het derde (Juul) in het midden
  const three = colorsHex.length > 2;
  [-1, 1].forEach((sd, i) => { for (const [x, ci] of [[sd * 8.5, i], [sd * 3.3, three ? 2 : i]]) { const g = new THREE.Group(); g.position.set(x, 3.4, -AZ + 0.25); g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5), M(0x4a3322), { cast: false, rot: [0, 0, Math.PI / 2], pos: [0, 1.5, 0] })); const cl = mesh(new THREE.PlaneGeometry(1.5, 2.8, 4, 6), new THREE.MeshStandardMaterial({ color: colorsHex[ci], side: THREE.DoubleSide, roughness: 0.8 }), { cast: false, pos: [0, 0.1, 0.05] }); g.add(cl); g.userData.cloth = cl; g.userData.base = cl.geometry.attributes.position.array.slice(); scene.add(g); W.banners.push(g); } });
  // sterren
  { const n = 260, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rng() * TAU, e = 0.12 + rng() * 0.5, r = 150; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r + 10; p[i * 3 + 2] = -Math.abs(Math.sin(a)) * Math.cos(e) * r - 20; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 })));
    const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 24), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false })); moon.position.set(-40, 62, -120); scene.add(moon); const mg = glowSprite(0xfff4d0, 55, 0.5); mg.position.copy(moon.position); mg.material.fog = false; scene.add(mg); }

  const o = new THREE.Object3D();
  W.update = (t, dt) => {
    W.t = t;
    tp.forEach((p, i) => { const s = 1 + Math.sin(t * 11 + i * 2.1) * 0.15 + Math.sin(t * 6.3 + i) * 0.1; o.position.set(p[0], p[1] + 0.35 * s, p[2]); o.scale.set(1, s, 1); o.rotation.y = t * 2 + i; o.updateMatrix(); fm.setMatrixAt(i, o.matrix); });
    fm.instanceMatrix.needsUpdate = true; gl.forEach((s, i) => { s.material.opacity = 0.4 + Math.sin(t * 9 + i) * 0.06; });
    for (const b of W.banners) { const c = b.userData.cloth, p = c.geometry.attributes.position, bs = b.userData.base; for (let i = 0; i < p.count; i++) { const y = (1.4 - bs[i * 3 + 1]) / 2.8; p.setZ(i, Math.sin(t * 2.6 + y * 3 + b.position.x) * 0.16 * y); } p.needsUpdate = true; }
    if (Math.random() < dt * 4) fx.particles.emit((Math.random() - 0.5) * 2 * AX, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 2 * AZ, (Math.random() - 0.5) * 0.4, 0.3, (Math.random() - 0.5) * 0.4, { life: 3, size: 0.18, color: 0xfff0a0, gravity: -0.05 });
    if (Math.random() < dt * 3) { const p = tp[Math.floor(Math.random() * tp.length)]; fx.particles.emit(p[0], p[1] + 0.8, p[2], (Math.random() - 0.5), 1.5, (Math.random() - 0.5), { life: 1.2, size: 0.2, color: 0xffb040, gravity: -0.5 }); }
  };
  return W;
}
