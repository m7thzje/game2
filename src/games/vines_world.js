import * as THREE from 'three';
import { mat, mesh, glow, canvasTex, TAU, mulberry32, clamp, lerp, damp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { Dragon, PLAYER_COLORS } from '../engine/chars.js';
import * as P from '../engine/props.js';

// Lianen-Zwaaien: wereld, lianen, krokodillen, eenden, apen en een draak.

export const C = {
  N: 7,                 // aantal lianen
  X0: 4,                // x van de eerste liaan
  DX: 9.0,              // afstand tussen lianen
  VL: 6.0,              // lengte van een liaan
  PY: 10.8,             // hoogte van het ophangpunt
  LZ: [3.0, -3.0],      // z van de twee banen
  OFF: [0, 4.0],        // de achterste baan staat iets verschoven (scheelt overlap op het scherm)
  GOAL_U: 66.6,         // x van de overkant (in baan-coordinaten)
  BANK_Y: 4.0,          // hoogte van de oevers
  WATER_Y: 0,
};
export const vineX = (k) => C.X0 + k * C.DX;

const rngW = mulberry32(777);
const r = (a, b) => a + rngW() * (b - a);

// ---------------------------------------------------------------- liaan
export function makeVine(kind) {
  const g = new THREE.Group();
  const col = kind === 'gold' ? 0xffc928 : kind === 'rotten' ? 0x6a4c3c : 0x3d8f3a;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.1, C.VL, 6), kind === 'gold' ? new THREE.MeshStandardMaterial({ color: col, emissive: 0xff9a00, emissiveIntensity: 0.7, metalness: 0.5, roughness: 0.35, flatShading: true }) : mat(col));
  rope.position.y = -C.VL / 2; rope.castShadow = true; g.add(rope);
  const puffCol = kind === 'gold' ? 0xffe27a : kind === 'rotten' ? 0x8a6aa0 : 0x5cc24c;
  const pm = kind === 'gold' ? new THREE.MeshStandardMaterial({ color: puffCol, emissive: 0xffa500, emissiveIntensity: 0.6, flatShading: true }) : mat(puffCol);
  const puffs = [];
  for (let k = 0; k < 6; k++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 + (k % 2) * 0.08, 0), pm);
    p.position.set((k % 2 ? 1 : -1) * 0.2, -0.9 - k * 0.85, 0.05); p.scale.set(1.4, 0.8, 1); p.rotation.z = (k % 2 ? 1 : -1) * 0.6; g.add(p); puffs.push(p);
  }
  // handvat: knoop + lus
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), kind === 'gold' ? pm : mat(kind === 'rotten' ? 0x4a3228 : 0x2f6f2c)); knot.position.y = -C.VL; knot.castShadow = true; g.add(knot);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.06, 5, 12), mat(kind === 'gold' ? 0xffe27a : 0xc9a46a)); loop.position.y = -C.VL + 0.45; g.add(loop);
  if (kind === 'rotten') {
    for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb78cff, emissive: 0x6a3ad0, emissiveIntensity: 0.8 })); m.position.set(k % 2 ? 0.12 : -0.12, -1.6 - k * 1.1, 0.12); m.rotation.z = k % 2 ? -1.2 : 1.2; g.add(m); }
  }
  g.userData = { rope, puffs, knot, pm, kind };
  return g;
}

// ---------------------------------------------------------------- dieren
export function makeCroc(scale = 1) {
  const g = new THREE.Group(); const inner = new THREE.Group(); inner.scale.setScalar(scale); g.add(inner);
  const skin = mat(0x4a9a3a, { flatShading: true }), dark = mat(0x2f6b2c, { flatShading: true }), belly = mat(0xd8d27a);
  inner.add(mesh(new THREE.SphereGeometry(1, 10, 8), skin, { scale: [1.9, 0.4, 0.66], cast: false }));
  const tail = mesh(new THREE.ConeGeometry(0.42, 2.3, 6), skin, { pos: [-2.8, -0.02, 0], rot: [0, 0, Math.PI / 2], cast: false }); inner.add(tail);
  const head = new THREE.Group(); head.position.set(1.55, 0.02, 0); inner.add(head);
  head.add(mesh(new THREE.BoxGeometry(1.4, 0.28, 0.62), skin, { pos: [0.7, 0.08, 0], cast: false }));
  const jaw = new THREE.Group(); jaw.position.set(0.0, -0.08, 0); head.add(jaw);
  jaw.add(mesh(new THREE.BoxGeometry(1.3, 0.14, 0.56), belly, { pos: [0.65, -0.04, 0], cast: false }));
  for (let k = 0; k < 6; k++) { for (const sz of [-1, 1]) { jaw.add(mesh(new THREE.ConeGeometry(0.045, 0.16, 4), mat(0xffffff), { cast: false, pos: [0.25 + k * 0.19, 0.07, sz * 0.24] })); head.add(mesh(new THREE.ConeGeometry(0.045, 0.16, 4), mat(0xffffff), { cast: false, pos: [0.25 + k * 0.19, -0.06, sz * 0.26], rot: [Math.PI, 0, 0] })); } }
  for (const sz of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), skin, { cast: false, pos: [0.25, 0.3, sz * 0.2] }));
    head.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [0.3, 0.36, sz * 0.24] }));
    head.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [0.37, 0.37, sz * 0.27] }));
  }
  for (let k = 0; k < 6; k++) inner.add(mesh(new THREE.ConeGeometry(0.13, 0.28, 4), dark, { cast: false, pos: [-1.2 + k * 0.45, 0.34 - Math.abs(k - 2.5) * 0.02, 0] }));
  g.userData = { jaw, tail, head, inner, t: Math.random() * 10 };
  return g;
}
export function makeDuck(hat = false) {
  const g = new THREE.Group();
  const yel = mat(0xffd83a, { flatShading: false });
  g.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), yel, { pos: [0, 0.35, 0], scale: [1.2, 0.9, 1], cast: false }));
  g.add(mesh(new THREE.ConeGeometry(0.2, 0.4, 5), yel, { pos: [-0.62, 0.55, 0], rot: [0, 0, 1.9], cast: false }));
  const head = new THREE.Group(); head.position.set(0.45, 0.85, 0); g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.3, 10, 8), yel, { cast: false }));
  head.add(mesh(new THREE.BoxGeometry(0.28, 0.1, 0.26), mat(0xff8a1a), { pos: [0.3, -0.04, 0], cast: false }));
  for (const sz of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(0x111111), { pos: [0.18, 0.1, sz * 0.15], cast: false }));
  if (hat) { head.add(mesh(new THREE.ConeGeometry(0.28, 0.6, 7), mat(0x6a3fb0), { pos: [-0.02, 0.5, 0], rot: [0, 0, 0.15], cast: false })); head.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 10), mat(0x6a3fb0), { pos: [0, 0.24, 0], cast: false })); head.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), glow(0xffe14a, 1), { pos: [0.02, 0.55, 0.12], cast: false })); }
  g.userData = { head, t: Math.random() * 10 };
  return g;
}
export function makeMonkey() {
  const g = new THREE.Group();
  const fur = mat(0x7a4a28, { flatShading: false }), face = mat(0xecc79e, { flatShading: false }), belly = mat(0xc99a6a, { flatShading: false });
  g.add(mesh(new THREE.SphereGeometry(0.62, 10, 8), fur, { pos: [0, 0.62, 0], scale: [1, 1.05, 0.9] }));
  g.add(mesh(new THREE.SphereGeometry(0.42, 8, 6), belly, { pos: [0, 0.56, 0.3], scale: [1, 1.1, 0.5], cast: false }));
  const head = new THREE.Group(); head.position.set(0, 1.5, 0.05); g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.46, 12, 10), fur));
  head.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), face, { pos: [0, -0.04, 0.26], scale: [1.1, 0.85, 0.55], cast: false }));
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.19, 8, 6), fur, { pos: [sx * 0.5, 0.05, -0.02] })); head.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), mat(0xf4a0a0), { pos: [sx * 0.55, 0.05, 0.08], cast: false }));
    head.add(mesh(new THREE.SphereGeometry(0.09, 8, 6), mat(0xffffff, { flatShading: false }), { pos: [sx * 0.14, 0.1, 0.42], cast: false })); head.add(mesh(new THREE.SphereGeometry(0.045, 6, 5), mat(0x111111), { pos: [sx * 0.14, 0.1, 0.5], cast: false }));
  }
  head.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), mat(0x3a2418), { pos: [0, -0.06, 0.52], cast: false }));
  const arms = [-1, 1].map((sx) => { const a = new THREE.Group(); a.position.set(sx * 0.62, 1.05, 0.05); g.add(a); a.add(mesh(new THREE.CapsuleGeometry(0.13, 0.6, 3, 6), fur, { pos: [0, -0.35, 0] })); a.add(mesh(new THREE.SphereGeometry(0.15, 6, 5), face, { pos: [0, -0.78, 0], cast: false })); return a; });
  for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), fur, { pos: [sx * 0.4, 0.2, 0.35], scale: [1, 0.8, 1.3], cast: false }));
  const tail = []; let prev = g;
  for (let k = 0; k < 6; k++) { const s = new THREE.Group(); s.position.set(0, k === 0 ? 0.3 : 0.3, k === 0 ? -0.5 : -0.1); prev.add(s); s.add(mesh(new THREE.CapsuleGeometry(0.08, 0.28, 3, 5), fur, { pos: [0, 0.14, 0], cast: false })); tail.push(s); prev = s; if (k) s.position.set(0, 0.34, 0); }
  g.userData = { head, arms, tail, t: Math.random() * 10, throwT: 0 };
  return g;
}
export function makeBanana() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.TorusGeometry(0.34, 0.1, 6, 10, Math.PI * 0.75), new THREE.MeshStandardMaterial({ color: 0xffe14a, emissive: 0x806000, emissiveIntensity: 0.4, flatShading: true }), { cast: false, rot: [0, 0, Math.PI * 0.62] }));
  g.add(mesh(new THREE.SphereGeometry(0.075, 5, 4), mat(0x4a3220), { cast: false, pos: [-0.1, 0.32, 0] }));
  return g;
}

// ---------------------------------------------------------------- de wereld
export function buildJungle(ctx) {
  const { scene, fx } = ctx;
  const root = new THREE.Group(); scene.add(root);
  const anim = [];
  const add = (m, parent = root) => { parent.add(m); return m; };
  const L = C.LZ, OFF = C.OFF;

  // lucht
  scene.background = canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b5f86'); gr.addColorStop(0.45, '#6cc4b6'); gr.addColorStop(0.8, '#cfeeb8'); gr.addColorStop(1, '#f2f6c8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  scene.fog = new THREE.Fog(0xa5dcbf, 42, 150);

  // bladeren (instanced)
  const NL = 520; const leafI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), NL);
  leafI.castShadow = false; leafI.receiveShadow = true; leafI.frustumCulled = false; root.add(leafI);
  let leafN = 0; const dummy = new THREE.Object3D(); const lc = new THREE.Color();
  const GREENS = [0x2f8a3a, 0x3fa64a, 0x57c04a, 0x2a7a46, 0x6ad04c, 0x1f9a6a];
  function leaf(x, y, z, s, color, sy = 0.75) {
    if (leafN >= NL) return;
    dummy.position.set(x, y, z); dummy.scale.set(s, s * sy, s); dummy.rotation.set(rngW() * 3, rngW() * 3, rngW() * 3); dummy.updateMatrix();
    leafI.setMatrixAt(leafN, dummy.matrix); lc.set(color ?? GREENS[Math.floor(rngW() * GREENS.length)]); leafI.setColorAt(leafN, lc); leafN++;
  }

  // oevers
  const grassTop = new THREE.MeshStandardMaterial({ map: tex.grass(8, 4), roughness: 1, flatShading: true });
  const cliffSide = new THREE.MeshStandardMaterial({ map: tex.stone(4, 3), color: 0x9fb08a, roughness: 1, flatShading: true });
  const bankMats = [cliffSide, cliffSide, grassTop, cliffSide, cliffSide, cliffSide];
  function bank(x0, x1, z0, z1, top) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 14, z1 - z0), bankMats);
    b.position.set((x0 + x1) / 2, top - 7, (z0 + z1) / 2); b.receiveShadow = true; b.castShadow = false; root.add(b); return b;
  }
  const LX = 0.9, GX = C.GOAL_U;
  bank(-34, LX, 0, 16, C.BANK_Y); bank(-34, LX + OFF[1], -16, 0, C.BANK_Y);
  bank(GX, GX + 36, 0, 16, C.BANK_Y + 0.2); bank(GX + OFF[1], GX + 36, -16, 0, C.BANK_Y + 0.2);
  // rand-details: struiken, rotsen, paddestoelen die gloeien
  const shroomCols = [0x7fffd0, 0xc08cff, 0xff8ad0];
  function shrooms(x0, x1, y) {
    for (let k = 0; k < 11; k++) {
      const x = r(x0, x1), z = r(-9, 9) + (k % 2 ? 3 : -3), s = r(0.6, 1.5), col = shroomCols[k % 3];
      const g = new THREE.Group(); g.position.set(x, y, z); root.add(g);
      g.add(mesh(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.7 * s, 6), mat(0xf4ecd8), { cast: false, pos: [0, 0.35 * s, 0] }));
      const cap = mesh(new THREE.SphereGeometry(0.46 * s, 9, 6, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.8, roughness: 0.4 }), { cast: false, pos: [0, 0.68 * s, 0] }); g.add(cap);
      anim.push((t) => { cap.material.emissiveIntensity = 0.65 + Math.sin(t * 1.6 + k * 1.7) * 0.3; });
    }
  }
  shrooms(-22, -3, C.BANK_Y); shrooms(GX + 4, GX + 24, C.BANK_Y + 0.2);
  for (const [x, z, s] of [[-6, 6, 1.4], [-12, -4, 1.8], [-3, 9, 1.0], [-18, 4, 2.0], [GX + 8, 6, 1.7], [GX + 14, -6, 2.1], [GX + 5, 11, 1.1]]) { const rk = P.rock(s, 0x7a8c78); rk.position.set(x, x < 0 ? C.BANK_Y : C.BANK_Y + 0.2, z); root.add(rk); }

  // start-bord en finish-poort
  const sp = P.signpost(['START →'], 3.4); sp.position.set(-1.6, C.BANK_Y, 5.2); sp.rotation.y = -0.3; root.add(sp);
  const sp2 = P.signpost(['START →'], 3.4); sp2.position.set(0.6 + OFF[1], C.BANK_Y, -5.2); sp2.rotation.y = -0.2; root.add(sp2);
  const finX = GX + 3.3;
  for (const px of [finX - 2.2, finX + 6.2]) add(mesh(new THREE.CylinderGeometry(0.22, 0.28, 7.6, 7), mat(0x6b4a2e), { pos: [px, C.BANK_Y + 3.8, 5.6] }));
  add(mesh(new THREE.BoxGeometry(8.9, 1.9, 0.3), new THREE.MeshStandardMaterial({ map: tex.sign('🏁 OVERKANT 🏁', { w: 512, h: 128, size: 58, bg: '#b8325a', fg: '#fff2b0' }), roughness: 0.8 }), { cast: false, pos: [finX + 2, C.BANK_Y + 7.0, 5.6] }));
  const chest = P.chest(true); chest.scale.setScalar(1.6); chest.position.set(finX + 5, C.BANK_Y + 0.2, 0); root.add(chest);
  for (let k = 0; k < 14; k++) { const c = P.coin(0.3); c.position.set(finX + 4 + Math.random() * 2.2, C.BANK_Y + 0.4 + k * 0.05, (Math.random() - 0.5) * 2.4); root.add(c); anim.push((t) => { c.rotation.y = t * 2 + k; }); }
  const flags = [];
  for (const [x, z, col] of [[finX - 1, -5.6, 0xff4d6d], [finX + 7, -5.6, 0x4dd0ff], [finX - 1, 3.5, 0xffd23f]]) { const b = P.banner(col, 3, 1.6); b.position.set(x + (z < 0 ? OFF[1] : 0), C.BANK_Y, z); b.scale.setScalar(1.3); root.add(b); flags.push(b); }
  // goudgloed bij de overkant
  const gl = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,230,120,.8)'); gr.addColorStop(1, 'rgba(255,200,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  gl.position.set(finX + 5, C.BANK_Y + 3, 0.5); root.add(gl);

  // takken waaraan de lianen hangen + reuzenbomen op de achtergrond
  const bark = mat(0x5a4230), bark2 = mat(0x6b5038);
  const x0 = -8, x1 = GX + 8;
  for (const lane of [0, 1]) {
    const z = L[lane], off = OFF[lane];
    let px = x0 + off, py = C.PY + 0.35;
    const segs = 11;
    for (let k = 1; k <= segs; k++) {
      const nx = x0 + off + (x1 - x0) * k / segs, ny = C.PY + 0.35 + Math.sin(k * 1.3 + lane) * 0.25;
      const len = Math.hypot(nx - px, ny - py);
      const seg = mesh(new THREE.CylinderGeometry(0.34, 0.4, len + 0.2, 7), k % 2 ? bark : bark2, { cast: false, pos: [(px + nx) / 2, (py + ny) / 2, z] });
      seg.rotation.z = Math.atan2(-(nx - px), ny - py);
      root.add(seg);
      for (let j = 0; j < 2; j++) leaf(px + (nx - px) * (0.3 + j * 0.45), py + (ny - py) * 0.5 + 0.7 + rngW() * 0.5, z + (rngW() - 0.5) * 1.4, r(0.7, 1.25));
      if (k % 2 === 0) leaf(px + (nx - px) * 0.5, py + (ny - py) * 0.5 - 0.4, z + (rngW() - 0.5) * 1.2, r(0.5, 0.8));
      px = nx; py = ny;
    }
  }
  // middentak (voor de apen) + steunen
  for (let k = 0; k < 9; k++) {
    const x = x0 + 2 + k * ((x1 - x0 - 4) / 8);
    add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 7, 7), bark, { cast: false, pos: [x, C.PY + 2.0, -0.4], rot: [0.0, 0, 0] }));
  }
  add(mesh(new THREE.CylinderGeometry(0.6, 0.6, x1 - x0, 8), bark2, { cast: false, pos: [(x0 + x1) / 2, C.PY + 1.0, -0.4], rot: [0, 0, Math.PI / 2] }));
  for (let k = 0; k < 26; k++) leaf(x0 + k * ((x1 - x0) / 25) + r(-1, 1), C.PY + 1.9 + r(-0.4, 1.2), r(-3.4, -1.2), r(1.1, 1.8));
  // reuzenbomen
  for (let k = 0; k < 11; k++) {
    const x = -14 + k * 9.2 + r(-2, 2), z = -17 - r(0, 6), h = 30 + r(0, 8), rad = r(1.5, 2.4);
    add(mesh(new THREE.CylinderGeometry(rad * 0.75, rad * 1.1, h, 8), mat(0x5a4636), { cast: false, pos: [x, h / 2 - 2, z] }));
    for (let j = 0; j < 4; j++) { const a = j / 4 * TAU; add(mesh(new THREE.ConeGeometry(rad * 0.5, 3.4, 5), mat(0x5a4636), { cast: false, pos: [x + Math.cos(a) * rad * 1.1, 0.4, z + Math.sin(a) * rad * 1.1], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] })); }
    for (let j = 0; j < 6; j++) leaf(x + r(-4, 4), h - 4 + r(-2, 3), z + r(-3, 3), r(3, 5.5), k % 3 === 1 ? 0x1f9a8a : undefined, 0.8);
  }
  leafI.count = leafN; leafI.instanceMatrix.needsUpdate = true; if (leafI.instanceColor) leafI.instanceColor.needsUpdate = true;

  // rotswand met watervallen
  const wall = mesh(new THREE.BoxGeometry(160, 40, 4), new THREE.MeshStandardMaterial({ map: tex.stone(30, 8), color: 0x6f9a86, roughness: 1, flatShading: true }), { cast: false, pos: [30, 14, -26] }); root.add(wall);
  const fallTex = canvasTex(64, 256, (g, w, h) => { g.fillStyle = 'rgba(255,255,255,0)'; g.fillRect(0, 0, w, h); const rr = mulberry32(5); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + rr() * 0.5})`; g.fillRect(rr() * w, rr() * h, 2 + rr() * 5, 14 + rr() * 60); } }, { repeat: [1, 1] });
  fallTex.wrapS = fallTex.wrapT = THREE.RepeatWrapping;
  const falls = [];
  for (const wx of [12, 40, 70]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(5, 30), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, color: 0xd8f8ff, depthWrite: false, opacity: 0.85 }));
    f.position.set(wx, 12, -23.8); root.add(f); falls.push(f);
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(10, 5), new THREE.MeshBasicMaterial({ map: canvasTex(64, 32, (g) => { const gr = g.createRadialGradient(32, 16, 1, 32, 16, 30); gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 32); }), transparent: true, depthWrite: false })); mist.position.set(wx, -1, -22); root.add(mist);
  }
  // lichtbundels
  const rayTex = canvasTex(32, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,250,200,0)'); gr.addColorStop(0.5, 'rgba(255,250,200,.55)'); gr.addColorStop(1, 'rgba(255,250,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const g2 = g.createLinearGradient(0, 0, 0, h); });
  const rays = [];
  for (let k = 0; k < 7; k++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(r(3, 6), 26), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.22, fog: false })); m.position.set(-6 + k * 11 + r(-3, 3), 11, -8 - r(0, 6)); m.rotation.z = 0.28; root.add(m); rays.push(m); }

  // rivier
  const wtex = tex.water(36, 7).clone(); wtex.needsUpdate = true;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 60), new THREE.MeshStandardMaterial({ map: wtex, color: 0x7fe0cc, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0.93 }));
  water.rotation.x = -Math.PI / 2; water.position.set(30, C.WATER_Y, -6); water.receiveShadow = true; root.add(water);
  const wtex2 = tex.water(20, 4).clone(); wtex2.needsUpdate = true;
  const water2 = new THREE.Mesh(new THREE.PlaneGeometry(220, 60), new THREE.MeshBasicMaterial({ map: wtex2, color: 0xd8fff0, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  water2.rotation.x = -Math.PI / 2; water2.position.set(30, C.WATER_Y + 0.04, -6); root.add(water2);
  // waterlelies
  for (let k = 0; k < 20; k++) {
    const g = new THREE.Group(); g.position.set(r(2, 62), 0.03, r(-6.5, 7)); root.add(g);
    g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 10), mat(0x3fa04a, { flatShading: false }), { cast: false, receive: false, scale: [1, 1, 1] }));
    if (k % 3 === 0) { const fl = mesh(new THREE.SphereGeometry(0.22, 7, 5), mat([0xff7ac0, 0xffffff, 0xffd23f][k % 3 === 0 ? (k / 3) % 3 : 0]), { cast: false, pos: [0.15, 0.15, 0] }); g.add(fl); }
    anim.push((t) => { g.position.y = 0.03 + Math.sin(t * 1.3 + k) * 0.03; });
  }
  // dieren
  const crocs = [], ducks = [];
  const crocPos = [[8, -0.5], [19, 3.5], [27, -4.5], [36, 1.0], [45, -3.2], [53, 4.0], [15, -6.5], [41, 7.0]];
  crocPos.forEach(([x, z], k) => {
    const c = makeCroc(0.85 + (k % 3) * 0.12); c.position.set(x, -0.18, z); c.rotation.y = k % 2 ? 0 : Math.PI; root.add(c);
    crocs.push({ g: c, home: x, z, dir: k % 2 ? 1 : -1, t: Math.random() * 10, snap: 0, sink: 0, mode: 'patrol', tx: 0 });
  });
  for (let k = 0; k < 11; k++) {
    const d = makeDuck(k % 3 === 0); d.position.set(r(0, 62), 0, r(-7, 7)); d.rotation.y = rngW() < 0.5 ? 0 : Math.PI; root.add(d);
    ducks.push({ g: d, t: Math.random() * 10, spd: r(0.3, 0.8) * (d.rotation.y === 0 ? 1 : -1), hop: 0, vy: 0 });
  }
  // chompers (duiken op bij de speler die in het water valt)
  const chompers = [0, 1].map(() => { const c = makeCroc(1.25); c.visible = false; root.add(c); return { g: c, t: 0, state: 'idle', x: 0, z: 0 }; });

  // rimpelringen
  const ripples = [];
  const ringGeo = new THREE.RingGeometry(0.5, 0.65, 28);
  for (let k = 0; k < 14; k++) { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; root.add(m); ripples.push({ m, t: 9, size: 1, delay: 0 }); }
  function ripple(x, z, size = 1, delay = 0) { const q = ripples.find((a) => a.t >= 1.2) || ripples[0]; q.t = -delay; q.size = size; q.m.position.set(x, C.WATER_Y + 0.06, z); q.m.visible = true; }

  // apen
  const monkeys = [];
  [14, 32, 50].forEach((x, k) => {
    const m = makeMonkey(); m.position.set(x, C.PY + 1.6, -0.4); m.rotation.y = 0; m.scale.setScalar(1.05); root.add(m);
    monkeys.push({ g: m, x, state: 'idle', t: 0, cool: 0 });
  });
  // bananen
  const bananas = [];
  for (let k = 0; k < 4; k++) { const b = makeBanana(); b.visible = false; root.add(b); bananas.push({ g: b, on: false, t: 0, dur: 1.5, sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0, lane: 0, miss: false }); }

  // draak
  const dragon = new Dragon(0x4fa86a, 1.7); dragon.group.visible = false; dragon.group.rotation.y = -Math.PI / 2; root.add(dragon.group);
  const dr = { on: false, t: 0, dur: 9, startX: 0, endX: 0, fire: 0 };

  // vuurvliegjes
  let flyT = 0;

  function update(t, dt, camX) {
    wtex.offset.x = (t * 0.012) % 1; wtex.offset.y = (t * 0.004) % 1;
    wtex2.offset.x = (-t * 0.02) % 1; wtex2.offset.y = (t * 0.01) % 1;
    fallTex.offset.y = (-t * 0.9) % 1;
    for (const a of anim) a(t);
    flags.forEach((b) => P.animateBanner(b, t));
    rays.forEach((m, k) => { m.material.opacity = 0.14 + Math.sin(t * 0.5 + k * 1.3) * 0.08; });
    // krokodillen
    crocs.forEach((c) => {
      c.t += dt; const g = c.g, u = g.userData;
      if (c.mode === 'patrol') {
        const dx = Math.sin(c.t * 0.16 + c.home) * 6; g.position.x = c.home + dx;
        g.rotation.y = Math.cos(c.t * 0.16 + c.home) >= 0 ? 0 : Math.PI;
        g.position.y = -0.2 + Math.sin(c.t * 1.2 + c.home) * 0.04 - c.sink;
        u.jaw.rotation.z = -(0.1 + Math.max(0, Math.sin(c.t * 0.5 + c.home * 3)) * 0.08) - c.snap * 0.7;
        u.tail.rotation.y = Math.sin(c.t * 1.6) * 0.3;
      }
      c.snap = Math.max(0, c.snap - dt * 2); c.sink = Math.max(0, c.sink - dt * 0.6);
    });
    // eenden
    ducks.forEach((d, k) => {
      d.t += dt; const g = d.g;
      if (d.hop > 0) { d.hop -= dt; d.vy -= 22 * dt; g.position.y = Math.max(0, g.position.y + d.vy * dt); if (g.position.y <= 0) { g.position.y = 0; d.hop = 0; } }
      else g.position.y = Math.sin(d.t * 2 + k) * 0.05;
      g.position.x += d.spd * dt; if (g.position.x > 66) g.position.x = -2; if (g.position.x < -2) g.position.x = 66;
      g.userData.head.rotation.z = Math.sin(d.t * 3 + k) * 0.1; g.rotation.z = Math.sin(d.t * 1.7 + k) * 0.05;
    });
    // chompers
    chompers.forEach((c) => {
      if (c.state === 'idle') return;
      c.t += dt; const g = c.g, u = g.userData;
      if (c.state === 'rise') { const k = clamp(c.t / 0.4, 0, 1); g.position.y = lerp(-1.6, 0.1, k); u.jaw.rotation.z = -0.9 * k; if (k >= 1) { c.state = 'wait'; c.t = 0; } }
      else if (c.state === 'wait') { u.jaw.rotation.z = -0.9 + Math.sin(c.t * 14) * 0.1; g.position.y = 0.1 + Math.sin(c.t * 5) * 0.05; }
      else if (c.state === 'chomp') { const k = clamp(c.t / 0.18, 0, 1); u.jaw.rotation.z = lerp(-0.9, 0.05, k); if (c.t > 0.5) { c.state = 'sink'; c.t = 0; } }
      else if (c.state === 'sink') { const k = clamp(c.t / 0.6, 0, 1); g.position.y = lerp(0.1, -1.8, k); if (k >= 1) { c.state = 'idle'; g.visible = false; } }
    });
    // rimpels
    for (const q of ripples) { if (q.t >= 1.2) { q.m.visible = false; continue; } q.t += dt; if (q.t < 0) { q.m.visible = false; continue; } q.m.visible = true; const k = q.t / 1.2; q.m.scale.setScalar((0.6 + k * 4.5) * q.size); q.m.material.opacity = (1 - k) * 0.7; }
    // apen
    monkeys.forEach((m, k) => {
      m.t += dt; const u = m.g.userData; m.cool = Math.max(0, m.cool - dt);
      u.tail.forEach((s, j) => { s.rotation.x = 0.3 + Math.sin(m.t * 2 + j * 0.6 + k) * 0.25; });
      u.head.rotation.y = Math.sin(m.t * 0.8 + k) * 0.3; u.head.rotation.x = Math.sin(m.t * 1.3) * 0.05;
      if (m.state === 'throw') { m.throwT += dt; const q = m.throwT; u.arms[1].rotation.x = q < 0.3 ? lerp(0, -2.6, q / 0.3) : lerp(-2.6, 0.4, clamp((q - 0.3) / 0.2, 0, 1)); if (q > 0.8) { m.state = 'idle'; } }
      else { u.arms[1].rotation.x = damp(u.arms[1].rotation.x, Math.sin(m.t * 1.3 + k) * 0.1, 8, dt); u.arms[0].rotation.x = Math.sin(m.t * 1.1 + k * 2) * 0.12; }
      if (m.alert > 0) { m.alert -= dt; u.arms[0].rotation.x = -2.5 + Math.sin(m.t * 18) * 0.3; }
    });
    // draak
    if (dr.on) {
      dr.t += dt; const k = dr.t / dr.dur; dragon.update(dt);
      dragon.group.position.set(lerp(dr.startX, dr.endX, k), 9.2 + Math.sin(dr.t * 1.4) * 0.9, -9);
      if (k >= 1) { dr.on = false; dragon.group.visible = false; }
      if (dr.fire > 0) { dr.fire -= dt; const p = dragon.group.position; if (Math.random() < 0.9) fx.particles.emit(p.x - 3.4, p.y - 0.2, p.z + 0.2, -6 - Math.random() * 3, -1.5 - Math.random() * 2, (Math.random() - 0.5) * 2, { life: 0.8, size: 0.9, color: Math.random() < 0.5 ? 0xff7a1a : 0xffd23f, gravity: -1 }); }
    }
    // vuurvliegjes
    flyT -= dt; if (flyT <= 0) { flyT = 0.08; fx.particles.emit(camX + (Math.random() - 0.5) * 50, 1.5 + Math.random() * 8, -8 + Math.random() * 14, (Math.random() - 0.5) * 0.5, 0.2 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3, { life: 4, size: 0.18, color: Math.random() < 0.5 ? 0xe8ff7a : 0x9fffe0, gravity: 0 }); }
  }
  function startDragon(camX, dur = 9) { if (dr.on) return false; dr.on = true; dr.t = 0; dr.dur = dur; dr.startX = camX + 46; dr.endX = camX - 46; dr.fire = 0; dragon.group.visible = true; return true; }
  return { update, ripple, crocs, ducks, chompers, monkeys, bananas, dragon, dragonState: dr, startDragon, root };
}
