import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving en bouwstenen van "Torenbouw-Duel": een bouwplaats voor een kasteel in de bergen, met kranen, wolken, bergen en een half afgebouwd kasteel.
export const SX = { TX: 8.2, BH: 1.0, DZ: 3.2 };

// Voegt dozen [x,y,z, w,h,d, rotZ?] samen tot één geometrie (voor kraanmasten en bogen)
export function boxGeo(list) {
  const parts = list.map(([x, y, z, w, h, d, rz = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)), new THREE.Vector3(1, 1, 1)));
    return g;
  });
  const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g of parts) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; g.dispose(); }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return mg;
}

// Steenblok-textuur (wit-achtig zodat de instance-kleur het blok inkleurt): afgeschuinde rand, voegen en een glanslijn
export function blockTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const r = mulberry32(11);
    g.fillStyle = '#f4f0e8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const l = 200 + Math.floor(r() * 55); g.fillStyle = `rgba(${l},${l - 4},${l - 12},.5)`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 3); }
    g.strokeStyle = 'rgba(80,60,50,.22)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 64); g.lineTo(w, 64); g.moveTo(40, 8); g.lineTo(40, 64); g.moveTo(88, 64); g.lineTo(88, h - 8); g.stroke();
    // afgeschuinde rand
    g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, w, 6); g.fillRect(0, 0, 6, h);
    g.fillStyle = 'rgba(60,40,40,.45)'; g.fillRect(0, h - 7, w, 7); g.fillRect(w - 7, 0, 7, h);
    g.strokeStyle = 'rgba(40,25,30,.55)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
  });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
export { glowTex };

// Kraan-onderdelen (gedeelde geometrie): mastsegment van 2 hoog, en de giek (lengte JIB)
export const JIB = 13.5;
export function mastSegGeo() {
  const L = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) L.push([sx * 0.55, 1, sz * 0.55, 0.12, 2, 0.12]);
  L.push([0, 0.04, 0.55, 1.2, 0.08, 0.08], [0, 0.04, -0.55, 1.2, 0.08, 0.08], [0, 1.96, 0.55, 1.2, 0.08, 0.08], [0, 1.96, -0.55, 1.2, 0.08, 0.08]);
  L.push([0, 1, 0.55, 1.5, 0.07, 0.07, 0.73], [0, 1, 0.55, 1.5, 0.07, 0.07, -0.73], [0, 1, -0.55, 1.5, 0.07, 0.07, 0.73]);
  return boxGeo(L);
}
export function jibGeo() {
  const L = [[JIB / 2, 0.55, 0, JIB, 0.12, 0.12], [JIB / 2, -0.35, 0, JIB, 0.12, 0.12]];
  const n = 10, s = JIB / n;
  for (let k = 0; k < n; k++) { L.push([k * s + s / 2, 0.1, 0, 1.15, 0.07, 0.07, (k % 2 ? 1 : -1) * 0.78]); L.push([k * s, 0.1, 0, 0.07, 0.95, 0.07]); }
  L.push([JIB, 0.1, 0, 0.07, 0.95, 0.07]);
  return boxGeo(L);
}

// Gezicht (cartoon-meeuw) voor de gimmick: wit lijf, gele snavel, flapperende vleugels
export function makeGull() {
  const g = new THREE.Group(); g.userData.dynamic = true;
  const white = new THREE.MeshStandardMaterial({ color: 0xf8f8ff, roughness: 0.8 }), gray = new THREE.MeshStandardMaterial({ color: 0xaab4c8, roughness: 0.8 });
  const body = mesh(new THREE.SphereGeometry(0.5, 10, 8), white, { scale: [0.9, 0.8, 1.5] }); g.add(body);
  g.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), white, { pos: [0, 0.3, 0.75] }));
  g.add(mesh(new THREE.ConeGeometry(0.11, 0.5, 6), mat(0xffb020, { flatShading: false }), { pos: [0, 0.25, 1.2], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), { pos: [sx * 0.16, 0.42, 0.95] }));
  g.add(mesh(new THREE.ConeGeometry(0.28, 0.8, 4), gray, { pos: [0, 0.05, -0.95], rot: [-Math.PI / 2, 0, 0] }));
  const wings = [];
  for (const sx of [-1, 1]) {
    const p = new THREE.Group(); p.position.set(sx * 0.35, 0.15, 0.1); g.add(p);
    p.add(mesh(new THREE.BoxGeometry(1.7, 0.08, 0.8), gray, { pos: [sx * 0.85, 0, 0] }));
    p.add(mesh(new THREE.BoxGeometry(0.5, 0.07, 0.5), mat(0x3a3a4a), { pos: [sx * 1.6, 0, 0.1] }));
    wings.push({ p, sx });
  }
  g.userData.wings = wings;
  return g;
}

// Hele omgeving. Retourneert { update(t, dt), clouds }
export function buildWorld(ctx) {
  const { scene } = ctx;
  const rng = mulberry32(4242);
  const idx0 = scene.children.length;
  const stone = mat(0xcfc7b6), stoneD = mat(0xa79f8f), roofM = mat(0xc4463a);
  const A = {};

  // ---------- grond ----------
  const ground = mesh(new THREE.PlaneGeometry(520, 360), new THREE.MeshStandardMaterial({ map: tex.grass(70, 50), roughness: 1 }), { cast: false, pos: [0, 0, -60], rot: [-Math.PI / 2, 0, 0] }); scene.add(ground);
  for (const sx of [-1, 1]) {   // aangestampte bouwplaats rond elke toren
    scene.add(mesh(new THREE.PlaneGeometry(15, 11), new THREE.MeshStandardMaterial({ map: tex.dirt(4, 3), roughness: 1 }), { cast: false, pos: [sx * 9.2, 0.02, 0.5], rot: [-Math.PI / 2, 0, 0] }));
  }
  scene.add(mesh(new THREE.PlaneGeometry(9, 70), new THREE.MeshStandardMaterial({ map: tex.dirt(2, 14), roughness: 1 }), { cast: false, pos: [0, 0.015, -12], rot: [-Math.PI / 2, 0, 0] }));
  // heuvels
  const hillCols = [0x5fae4a, 0x4f9a46, 0x6cba52, 0x58a04a];
  for (let i = 0; i < 16; i++) {
    const x = -150 + i * 20 + rng() * 10, r = 18 + rng() * 22;
    scene.add(mesh(new THREE.SphereGeometry(r, 10, 6, 0, TAU, 0, Math.PI / 2), mat(hillCols[i % 4]), { cast: false, receive: false, pos: [x, -1, -75 - rng() * 30], scale: [1.4, 0.55, 1] }));
  }
  // bergen met sneeuw
  const mCols = [0x7a8aaa, 0x6c7c9c, 0x8a98b4];
  for (let i = 0; i < 9; i++) {
    const x = -170 + i * 44 + rng() * 16, h = 70 + rng() * 60, r = 38 + rng() * 22, z = -165 - rng() * 30;
    scene.add(mesh(new THREE.ConeGeometry(r, h, 7), mat(mCols[i % 3]), { cast: false, receive: false, pos: [x, h / 2 - 2, z] }));
    scene.add(mesh(new THREE.ConeGeometry(r * 0.38, h * 0.3, 7), mat(0xf4f8ff), { cast: false, receive: false, pos: [x, h * 0.85 - 2, z] }));
  }
  // half afgebouwd kasteel op de achtergrond (met steigers)
  const cz = -40;
  scene.add(mesh(new THREE.BoxGeometry(46, 7, 3), stone, { cast: false, pos: [0, 3.5, cz] }));
  for (let k = 0; k < 20; k++) scene.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 1.2), stone, { cast: false, pos: [-21 + k * 2.2, 7.6, cz] }));
  for (const [x, h] of [[-23, 16], [-8, 11], [10, 13], [24, 17]]) {
    scene.add(mesh(new THREE.CylinderGeometry(3.2, 3.6, h, 10), stone, { cast: false, pos: [x, h / 2, cz] }));
    if (h > 12) {   // afgebouwde torens krijgen een dak, de rest is nog 'in aanbouw'
      scene.add(mesh(new THREE.ConeGeometry(4.3, 5.5, 10), roofM, { cast: false, pos: [x, h + 2.7, cz] }));
    } else for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; scene.add(mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), stone, { cast: false, pos: [x + Math.cos(a) * 3.2, h + 0.6, cz + Math.sin(a) * 3.2], rot: [0, -a, 0] })); }
    for (let w = 0; w < 3; w++) scene.add(mesh(new THREE.BoxGeometry(0.7, 1.3, 0.3), mat(0x2a2236), { cast: false, pos: [x, 4 + w * 3.5, cz + 3.5], scale: 1 }));
  }
  // steiger tegen de lage torens
  for (const x of [-8, 10]) {
    for (let k = 0; k < 4; k++) { scene.add(mesh(new THREE.BoxGeometry(0.2, 12, 0.2), mat(0x9a6c3a), { cast: false, pos: [x - 4 + k * 2.6, 6, cz + 5] })); }
    for (let k = 0; k < 4; k++) scene.add(mesh(new THREE.BoxGeometry(8, 0.25, 1.4), mat(0xb98a54), { cast: false, pos: [x, 2.5 + k * 3, cz + 5] }));
  }
  // bomen en rotsen
  for (let i = 0; i < 26; i++) {
    const sx = i % 2 ? 1 : -1, x = sx * (24 + rng() * 55), z = -4 - rng() * 38;
    const t = rng() < 0.5 ? P.tree(4 + rng() * 3) : P.pine(5 + rng() * 4); t.position.set(x, 0, z); t.rotation.y = rng() * 6; scene.add(t);
  }
  for (let i = 0; i < 8; i++) { const r = P.rock(1 + rng() * 2); r.position.set((rng() - 0.5) * 120, 0, -6 - rng() * 30); scene.add(r); }
  // bouwplaats-rekwisieten
  for (const sx of [-1, 1]) {
    const cr = [[sx * 13.4, 2.6, 0.9], [sx * 12.2, 3.3, 0.8], [sx * 4.0, 3.2, 1.0]];
    for (const [x, z, s] of cr) { const c = P.crate(s); c.position.set(x, 0, z); c.rotation.y = rng(); scene.add(c); }
    const b = P.barrel(1); b.position.set(sx * 3.6, 0, 4.3); scene.add(b);
    const s = P.sack(1); s.position.set(sx * 14.4, 0, 4.1); scene.add(s);
    const f = P.fence(7); f.position.set(sx * 9.2, 0, 5.8); scene.add(f);
  }
  mergeStatic(scene, idx0);

  // ---------- wolken (instanced, drijven langzaam) ----------
  const puffs = [];
  for (let i = 0; i < 26; i++) {
    const cx = (rng() - 0.5) * 220, cy = 10 + rng() * 140, cz = -22 - rng() * 110, s = 3 + rng() * 5, sp = 0.4 + rng() * 0.9;
    const n = 5 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) puffs.push({ cx, cy, cz, sp, ox: (k - n / 2) * s * 0.8, oy: (rng() - 0.3) * s * 0.4, r: s * (0.7 + rng() * 0.5) * (k === 0 || k === n - 1 ? 0.7 : 1) });
  }
  const cloudIM = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), puffs.length);
  cloudIM.frustumCulled = false; scene.add(cloudIM);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), vp = new THREE.Vector3(), vs = new THREE.Vector3();
  A.update = (t) => {
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i]; let x = p.cx + t * p.sp; x = ((x + 130) % 260 + 260) % 260 - 130;
      vp.set(x + p.ox, p.cy + p.oy, p.cz); vs.set(p.r * 1.3, p.r * 0.75, p.r * 0.9); m4.compose(vp, q, vs); cloudIM.setMatrixAt(i, m4);
    }
    cloudIM.instanceMatrix.needsUpdate = true;
  };
  A.update(0);
  return A;
}
