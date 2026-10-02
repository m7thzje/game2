import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, rand, TAU, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, Butterfly } from '../engine/chars.js';
import * as P from '../engine/props.js';

// De heksenhut van Hendrika: 3D interieur voor "Toverdrank Memory" (potion.js).
// buildHut(scene, fx) -> { update(t, dt, st), pedestals[], cauldron, ... }

export const ING = [
  { id: 'up', name: 'Maankristal', color: 0x58b8ff, css: '#58b8ff', freq: 329.63 },
  { id: 'left', name: 'Vliegenzwam', color: 0xff4f86, css: '#ff4f86', freq: 261.63 },
  { id: 'right', name: 'Gouden vlinder', color: 0xffd24a, css: '#ffd24a', freq: 392.0 },
  { id: 'down', name: 'Heksenoog', color: 0x6aff7a, css: '#6aff7a', freq: 440.0 },
];
export const PED_POS = [[0, -4.7], [-5.6, 0.2], [5.6, 0.2], [0, 4.7]];
export const POT_Y = 2.5;

const SPH = new THREE.SphereGeometry(1, 12, 9);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const BOX = new THREE.BoxGeometry(1, 1, 1);

let _glowTex = null;
function glowTex() {
  if (_glowTex) return _glowTex;
  _glowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  _glowTex.userData.keep = true;
  return _glowTex;
}
function halo(color, size, opacity = 0.7) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity }));
  s.scale.setScalar(size); s.renderOrder = 5; return s;
}

function webTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.strokeStyle = 'rgba(235,235,255,.75)'; g.lineWidth = 1.4;
    const n = 7;
    for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * w * 1.05, Math.sin(a) * h * 1.05); g.stroke(); }
    for (let r = 1; r <= 7; r++) {
      const rr = r * 36; g.beginPath();
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI / 2; const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (i === 0) g.moveTo(x, y); else { const a0 = ((i - 0.5) / n) * Math.PI / 2; g.quadraticCurveTo(Math.cos(a0) * rr * 0.9, Math.sin(a0) * rr * 0.9, x, y); }
      }
      g.stroke();
    }
  });
}

function runeTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const c = w / 2; g.translate(c, c);
    g.shadowColor = '#b070ff'; g.shadowBlur = 14; g.strokeStyle = 'rgba(190,140,255,.9)'; g.lineWidth = 4;
    for (const r of [248, 236, 188]) { g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
    g.lineWidth = 3;
    // ster
    g.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * 2 * TAU / 5; const x = Math.cos(a) * 186, y = Math.sin(a) * 186; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); g.stroke();
    // runen
    const r = mulberry32(5); g.lineWidth = 3; g.lineCap = 'round';
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU; g.save(); g.rotate(a); g.translate(0, -212); g.beginPath();
      const k = 2 + Math.floor(r() * 3); g.moveTo(0, -9); for (let j = 0; j < k; j++) g.lineTo((r() - 0.5) * 12, -9 + (j + 1) * 18 / k); g.stroke(); g.restore();
    }
    // knopen op de vier richtingen
    g.lineWidth = 4;
    for (const [x, y] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) { g.beginPath(); g.arc(x * 188, y * 188, 20, 0, TAU); g.stroke(); }
  });
}

function swirlTexture() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
    const r = mulberry32(8);
    for (let arm = 0; arm < 4; arm++) {
      for (let k = 0; k < 90; k++) {
        const a = arm * TAU / 4 + k * 0.09, rad = 6 + k * 1.35;
        g.fillStyle = k % 2 ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.22)';
        g.beginPath(); g.arc(128 + Math.cos(a) * rad, 128 + Math.sin(a) * rad, 5 + k * 0.06, 0, TAU); g.fill();
      }
    }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 5, 0, TAU); g.fill(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.center.set(0.5, 0.5); return t;
}

// ----------------------------------------------------------------- ingrediënten
function makeCrystal() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0x58b8ff, emissive: 0x2a90ff, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.93, flatShading: true });
  const shard = (x, z, r, h, tilt, rz) => {
    const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.set(tilt, 0, rz);
    s.add(mesh(new THREE.CylinderGeometry(r * 0.85, r, h * 0.7, 6), m, { cast: false, pos: [0, h * 0.35, 0] }));
    s.add(mesh(new THREE.ConeGeometry(r * 0.85, h * 0.35, 6), m, { cast: false, pos: [0, h * 0.7 + h * 0.175, 0] }));
    g.add(s);
  };
  shard(0, 0, 0.3, 1.5, 0, 0); shard(0.38, 0.05, 0.2, 0.95, 0, -0.4); shard(-0.36, 0.1, 0.18, 0.85, 0, 0.45); shard(0.05, 0.38, 0.14, 0.6, 0.5, 0);
  return { group: g, mats: [[m, 0.6, 2.2]], lift: 0.1, tick(t) { g.rotation.y = t * 0.5; } };
}
function makeShroom() {
  const g = new THREE.Group();
  const cap = new THREE.MeshStandardMaterial({ color: 0xff4f86, emissive: 0xff2a70, emissiveIntensity: 0.45, roughness: 0.5 });
  const stem = mat(0xf4ecd8, { flatShading: false });
  const spot = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4 });
  const mk = (x, z, s) => {
    const m = new THREE.Group(); m.position.set(x, 0, z); m.scale.setScalar(s);
    m.add(mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.8, 8), stem, { cast: false, pos: [0, 0.4, 0] }));
    m.add(mesh(new THREE.SphereGeometry(0.8, 14, 8, 0, TAU, 0, Math.PI / 2), cap, { cast: false, pos: [0, 0.75, 0], scale: [1, 0.85, 1] }));
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, rr = 0.42 + (i % 2) * 0.2; const sp = mesh(SPH, spot, { cast: false, pos: [Math.cos(a) * rr, 0.75 + Math.sqrt(Math.max(0.01, 0.64 - rr * rr)) * 0.85 + 0.02, Math.sin(a) * rr], scale: [0.11, 0.05, 0.11] }); m.add(sp); }
    g.add(m);
  };
  mk(0, 0, 1); mk(0.75, 0.2, 0.5); mk(-0.65, -0.1, 0.42);
  return { group: g, mats: [[cap, 0.45, 2.0], [spot, 0.4, 1.5]], lift: 0.05, tick(t) { g.rotation.y = Math.sin(t * 0.6) * 0.4; g.scale.y = 1 + Math.sin(t * 2) * 0.03; } };
}
function makeButterflyJar() {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.1, depthWrite: false });
  g.add(mesh(new THREE.SphereGeometry(0.95, 18, 10, 0, TAU, 0, Math.PI / 2), glass, { cast: false, pos: [0, 0.05, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.1, 18), mat(0xc9a040, { metalness: 0.5 }), { cast: false, pos: [0, 0, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xe8c24a, { metalness: 0.6 }), { cast: false, pos: [0, 0.98, 0] }));
  const b = new Butterfly(0xffd24a); b.group.scale.setScalar(3.4);
  const bm = new THREE.MeshStandardMaterial({ color: 0xffd24a, emissive: 0xffa800, emissiveIntensity: 0.5 });
  b.w.forEach((w) => { w.p.children[0].material = new THREE.MeshBasicMaterial({ color: 0xffd24a, side: THREE.DoubleSide }); });
  const body = mesh(new THREE.CapsuleGeometry(0.03, 0.14, 2, 5), mat(0x3a2a10), { cast: false, rot: [Math.PI / 2, 0, 0] }); b.group.add(body);
  g.add(b.group);
  const h = halo(0xffd24a, 2.6, 0.3); h.position.y = 0.6; g.add(h);
  return {
    group: g, mats: [[bm, 0.5, 1.5]], lift: 0.05,
    tick(t, dt, lit) { b.t += dt * (1 + lit * 2.5); b.update(0); b.update(dt); const a = t * (1.2 + lit * 2.5); b.group.position.set(Math.cos(a) * 0.4, 0.6 + Math.sin(t * 2.3) * 0.15, Math.sin(a) * 0.4); b.group.rotation.y = -a; h.material.opacity = 0.25 + lit * 0.6; },
  };
}
function makeEye() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0e0, emissive: 0x335533, emissiveIntensity: 0.3, roughness: 0.3, flatShading: false });
  const iris = new THREE.MeshStandardMaterial({ color: 0x6aff7a, emissive: 0x2cd84a, emissiveIntensity: 0.7, flatShading: false });
  const eyeG = new THREE.Group(); eyeG.position.y = 0.75; eyeG.rotation.x = -0.55; g.add(eyeG);
  eyeG.add(mesh(new THREE.SphereGeometry(0.6, 18, 14), white, { cast: false }));
  const look = new THREE.Group(); eyeG.add(look);
  const ir = mesh(new THREE.CircleGeometry(0.3, 18), iris, { cast: false, pos: [0, 0, 0.598] }); look.add(ir);
  look.add(mesh(new THREE.CircleGeometry(0.14, 14), new THREE.MeshBasicMaterial({ color: 0x050805 }), { cast: false, pos: [0, 0, 0.603] }));
  // aderen
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; eyeG.add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.35, 3), mat(0xd04a5a), { cast: false, pos: [Math.cos(a) * 0.42, Math.sin(a) * 0.42, 0.38], rot: [0, 0, a + Math.PI / 2] })); }
  const lidM = new THREE.MeshStandardMaterial({ color: 0x7a4a8a, roughness: 0.7, flatShading: false });
  const lid = new THREE.Group(); eyeG.add(lid);
  lid.add(mesh(new THREE.SphereGeometry(0.66, 16, 8, 0, TAU, 0, Math.PI / 2), lidM, { cast: false }));
  const lashes = new THREE.Group(); lid.add(lashes);
  for (let i = 0; i < 7; i++) { const a = -0.8 + i * 0.27; lashes.add(mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.28, 3), mat(0x1a0c20), { cast: false, pos: [Math.sin(a) * 0.66, 0.0, Math.cos(a) * 0.66 + 0.03], rot: [Math.PI / 2 + 0.2, 0, -a * 0.6] })); }
  // stam
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.18, 0.5, 6), mat(0xa0405a, { flatShading: false }), { cast: false, pos: [0, 0.22, 0] }));
  const o = {
    group: g, mats: [[iris, 0.7, 2.0], [white, 0.3, 1.0]], lift: 0.05,
    tick(t, dt, lit) {
      const open = 0.85 + lit * 0.5 + (Math.sin(t * 0.7) > 0.96 ? -0.3 : 0);
      lid.rotation.x = damp(lid.rotation.x, -open, 14, dt);
      look.rotation.y = Math.sin(t * 0.8) * 0.5; look.rotation.x = Math.cos(t * 0.6) * 0.25 - lit * 0.0;
      eyeG.position.y = 0.75 + Math.sin(t * 2) * 0.04; ir.scale.setScalar(1 + lit * 0.25);
    },
  };
  return o;
}
const ITEM_MAKERS = [makeCrystal, makeShroom, makeButterflyJar, makeEye];

function makePedestal(idx) {
  const ing = ING[idx]; const g = new THREE.Group();
  const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(1, 1), color: 0xc0b4d0, roughness: 0.95, flatShading: true });
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.28, 1.3, 8), stoneM, { pos: [0, 0.65, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(1.25, 1.0, 0.24, 8), stoneM, { pos: [0, 1.42, 0] }));
  const ringM = new THREE.MeshStandardMaterial({ color: ing.color, emissive: ing.color, emissiveIntensity: 0.4 });
  g.add(mesh(new THREE.TorusGeometry(1.05, 0.07, 6, 28), ringM, { cast: false, pos: [0, 1.56, 0], rot: [Math.PI / 2, 0, 0] }));
  // marker-ring op de vloer (kleur = wie moet drukken)
  const markM = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const mark = mesh(new THREE.RingGeometry(1.55, 2.0, 36), markM, { cast: false, receive: false, pos: [0, 0.07, 0], rot: [-Math.PI / 2, 0, 0] });
  g.add(mark);
  const light = new THREE.PointLight(ing.color, 0, 16, 1.5); light.position.set(0, 3.4, 0.5); g.add(light);
  const item = ITEM_MAKERS[idx]();
  item.group.position.y = 1.6 + item.lift; g.add(item.group);
  const hal = halo(ing.color, 4.2, 0); hal.position.y = 2.6; g.add(hal);
  const p = { idx, group: g, item, ringM, markM, mark, light, hal, lit: 0, hold: 0, x: PED_POS[idx][0], z: PED_POS[idx][1], markColors: null, markT: 0 };
  g.position.set(p.x, 0, p.z);
  return p;
}

// ----------------------------------------------------------------- de hut
export function buildHut(scene, fx) {
  const R = mulberry32(77);
  const animators = [];
  const add = (o) => { scene.add(o); return o; };

  // --- vloer, muren
  const floor = mesh(new THREE.PlaneGeometry(52, 40), new THREE.MeshStandardMaterial({ map: tex.planks(12, 9, '#7a5638'), color: 0xb0a0b8, roughness: 1 }), { cast: false, pos: [0, 0, 4], rot: [-Math.PI / 2, 0, 0] }); add(floor);
  const wallM = new THREE.MeshStandardMaterial({ map: tex.stone(13, 3), color: 0x9a86a8, roughness: 1, flatShading: true });
  add(mesh(new THREE.BoxGeometry(56, 14, 0.8), wallM, { cast: false, pos: [0, 7, -9.2] }));
  const sideM = new THREE.MeshStandardMaterial({ map: tex.planks(6, 3, '#6a4a30'), color: 0xa89aae, roughness: 1 });
  for (const sx of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.8, 14, 40), sideM, { cast: false, pos: [sx * 24, 7, 4] }));
  // plint
  add(mesh(new THREE.BoxGeometry(56, 0.7, 0.5), mat(0x4a3220), { cast: false, pos: [0, 0.35, -8.6] }));
  // balken
  const beamM = new THREE.MeshStandardMaterial({ map: tex.planks(8, 1, '#4a3220'), roughness: 0.95 });
  for (const z of [-8.3, -2.5]) add(mesh(new THREE.BoxGeometry(56, 0.6, 0.7), beamM, { cast: false, pos: [0, 8.7, z] }));
  for (const x of [-16, -8, 0, 8, 16]) add(mesh(new THREE.BoxGeometry(0.6, 0.6, 7), beamM, { cast: false, pos: [x, 8.7, -5.4] }));
  for (const x of [-17, 17]) add(mesh(new THREE.BoxGeometry(0.9, 9, 0.9), beamM, { cast: false, pos: [x, 4.5, -8.3] }));

  // --- runencirkel
  const runes = mesh(new THREE.PlaneGeometry(15, 15), new THREE.MeshBasicMaterial({ map: runeTexture(), transparent: true, depthWrite: false, opacity: 0.7, blending: THREE.AdditiveBlending }), { cast: false, receive: false, pos: [0, 0.04, 0.2], rot: [-Math.PI / 2, 0, 0] });
  runes.scale.y = 0.82; add(runes);
  const rug = mesh(new THREE.CircleGeometry(7.2, 40), new THREE.MeshStandardMaterial({ map: tex.carpet(4, 4), color: 0x6a3a8a, roughness: 1 }), { cast: false, pos: [0, 0.02, 0.2], rot: [-Math.PI / 2, 0, 0] });
  rug.scale.y = 0.82; add(rug);

  // --- maanraam
  const win = new THREE.Group(); win.position.set(0, 5.6, -8.75); scene.add(win);
  win.add(mesh(new THREE.CircleGeometry(2.1, 28), new THREE.MeshBasicMaterial({ color: 0x1c2858 }), { cast: false }));
  const moon = mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }), { cast: false, pos: [0.5, 0.4, 0.02] }); win.add(moon);
  win.add(mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: 0x1c2858 }), { cast: false, pos: [0.85, 0.55, 0.03] }));
  for (let i = 0; i < 12; i++) win.add(mesh(new THREE.CircleGeometry(0.04 + R() * 0.04, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [(R() - 0.5) * 3.4, (R() - 0.5) * 3.4, 0.03] }));
  win.add(mesh(new THREE.TorusGeometry(2.15, 0.17, 6, 28), mat(0x3d2a18), { cast: false, pos: [0, 0, 0.05] }));
  win.add(mesh(BOX, mat(0x3d2a18), { cast: false, pos: [0, 0, 0.06], scale: [4.2, 0.14, 0.12] }));
  win.add(mesh(BOX, mat(0x3d2a18), { cast: false, pos: [0, 0, 0.06], scale: [0.14, 4.2, 0.12] }));
  const wh = halo(0x8aa8ff, 9, 0.28); wh.position.set(0, 0, 0.3); win.add(wh);

  // --- planken met potten
  const shelfM = new THREE.MeshStandardMaterial({ map: tex.planks(4, 1, '#6b4a2e'), roughness: 0.95 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0xdfeeff, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false });
  const liquidCols = [0x6aff7a, 0xff4fd8, 0x58b8ff, 0xffb347, 0xb070ff, 0xff5a5a, 0x9affea];
  const liquidMats = liquidCols.map((c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.4 }));
  const jarLiq = [];
  function jar(x, y, z, s = 1, mi = Math.floor(R() * liquidMats.length)) {
    const gm = mesh(CYL, glassM, { cast: false, receive: false, pos: [x, y + 0.45 * s, z], scale: [0.34 * s, 0.9 * s, 0.34 * s] });
    const lq = mesh(CYL, liquidMats[mi], { cast: false, receive: false, pos: [x, y + 0.34 * s, z], scale: [0.29 * s, 0.62 * s, 0.29 * s] });
    const cork = mesh(CYL, mat(0x8a6238), { cast: false, pos: [x, y + 0.95 * s, z], scale: [0.2 * s, 0.14 * s, 0.2 * s] });
    scene.add(lq, gm, cork);
    if (R() < 0.5) { const bub = mesh(SPH, mat(0xffffff, { flatShading: false }), { cast: false, receive: false, pos: [x, y + 0.5 * s, z], scale: 0.07 * s }); bub.userData = { y0: y + 0.2 * s, h: 0.5 * s, ph: R() * 6 }; scene.add(bub); jarLiq.push(bub); }
  }
  function bottle(x, y, z, mi) {
    const m = liquidMats[mi];
    scene.add(mesh(new THREE.SphereGeometry(1, 10, 8), m, { cast: false, pos: [x, y + 0.32, z], scale: [0.32, 0.32, 0.32] }));
    scene.add(mesh(CYL, m, { cast: false, pos: [x, y + 0.7, z], scale: [0.09, 0.38, 0.09] }));
    scene.add(mesh(CYL, mat(0x8a6238), { cast: false, pos: [x, y + 0.93, z], scale: [0.11, 0.1, 0.11] }));
  }
  function skull(x, y, z, ry = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; const bone = mat(0xe8e0c8, { flatShading: false });
    g.add(mesh(SPH, bone, { cast: false, pos: [0, 0.33, 0], scale: [0.3, 0.3, 0.3] }));
    g.add(mesh(BOX, bone, { cast: false, pos: [0, 0.13, 0.1], scale: [0.26, 0.14, 0.2] }));
    for (const sx of [-1, 1]) g.add(mesh(SPH, mat(0x0a0608), { cast: false, pos: [sx * 0.1, 0.36, 0.25], scale: [0.075, 0.09, 0.05] }));
    g.add(mesh(SPH, new THREE.MeshBasicMaterial({ color: 0x9affea }), { cast: false, pos: [-0.1, 0.36, 0.27], scale: 0.025 }));
    g.add(mesh(SPH, new THREE.MeshBasicMaterial({ color: 0x9affea }), { cast: false, pos: [0.1, 0.36, 0.27], scale: 0.025 }));
    scene.add(g);
  }
  function books(x, y, z) {
    const cols = [0x8a2a3a, 0x2a5a8a, 0x3a7a4a, 0x7a4a8a, 0xb8842a]; let yy = y;
    const n = 2 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) { const hh = 0.14 + R() * 0.08; scene.add(mesh(BOX, mat(cols[Math.floor(R() * cols.length)]), { cast: false, pos: [x + (R() - 0.5) * 0.08, yy + hh / 2, z], rot: [0, (R() - 0.5) * 0.4, 0], scale: [0.7 - i * 0.04, hh, 0.5] })); yy += hh; }
  }
  function candleStatic(x, y, z) {
    scene.add(mesh(CYL, mat(0xf2e8c8), { cast: false, pos: [x, y + 0.25, z], scale: [0.1, 0.5, 0.1] }));
    const f = mesh(new THREE.ConeGeometry(0.07, 0.2, 5), new THREE.MeshBasicMaterial({ color: 0xffc040 }), { cast: false, pos: [x, y + 0.6, z] }); scene.add(f);
    const h = halo(0xffa840, 1.4, 0.6); h.position.set(x, y + 0.62, z); scene.add(h); animators.push((t) => { const k = 1 + Math.sin(t * 11 + x * 7) * 0.12; f.scale.set(1, k, 1); h.scale.setScalar(1.4 * k); });
  }
  function mortar(x, y, z) {
    scene.add(mesh(new THREE.CylinderGeometry(0.34, 0.22, 0.3, 10), mat(0x55505c, { metalness: 0.2 }), { cast: false, pos: [x, y + 0.15, z] }));
    scene.add(mesh(CYL, mat(0x8a6238), { cast: false, pos: [x + 0.12, y + 0.4, z], rot: [0, 0, 0.5], scale: [0.05, 0.55, 0.05] }));
  }
  function crystalBall(x, y, z) {
    scene.add(mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.18, 8), mat(0x3d2a18), { cast: false, pos: [x, y + 0.09, z] }));
    const b = mesh(SPH, new THREE.MeshStandardMaterial({ color: 0xb070ff, emissive: 0x8040ff, emissiveIntensity: 0.9, transparent: true, opacity: 0.85, roughness: 0.1 }), { cast: false, pos: [x, y + 0.55, z], scale: 0.4 }); scene.add(b);
    const h = halo(0xb070ff, 2.6, 0.5); h.position.set(x, y + 0.55, z); scene.add(h);
    animators.push((t) => { h.material.opacity = 0.4 + Math.sin(t * 2) * 0.15; });
  }
  // planken links en rechts van het raam
  const shelves = [];
  for (const [x0, x1] of [[-15.5, -3.6], [3.6, 15.5]]) for (const y of [2.5, 4.9]) {
    const w = x1 - x0; add(mesh(new THREE.BoxGeometry(w, 0.18, 1.1), shelfM, { cast: false, pos: [(x0 + x1) / 2, y, -8.2] }));
    for (let i = 0; i <= 3; i++) add(mesh(new THREE.BoxGeometry(0.16, 0.5, 0.9), beamM, { cast: false, pos: [x0 + 0.5 + i * (w - 1) / 3, y - 0.34, -8.25] }));
    shelves.push([x0, x1, y]);
  }
  const kinds = ['jar', 'jar', 'bottle', 'books', 'jar', 'skull', 'mortar', 'candle', 'jar', 'bottle', 'ball'];
  shelves.forEach(([x0, x1, y], si) => {
    let x = x0 + 0.9;
    while (x < x1 - 0.8) {
      const k = kinds[Math.floor(R() * kinds.length)]; const yy = y + 0.09; const z = -8.1 + (R() - 0.5) * 0.2;
      if (k === 'jar') { jar(x, yy, z, 0.9 + R() * 0.5); x += 1.1; }
      else if (k === 'bottle') { bottle(x, yy, z, Math.floor(R() * liquidMats.length)); x += 0.9; }
      else if (k === 'books') { books(x, yy, z); x += 1.0; }
      else if (k === 'skull') { skull(x, yy, z, (R() - 0.5) * 0.8); x += 1.0; }
      else if (k === 'mortar') { mortar(x, yy, z); x += 1.0; }
      else if (k === 'candle') { candleStatic(x, yy, z); x += 0.8; }
      else if (k === 'ball' && si % 2 === 1) { crystalBall(x, yy, z); x += 1.1; }
      else { jar(x, yy, z, 1); x += 1.1; }
    }
  });
  // hangende kruiden
  for (const x of [-14, -10.5, -6.5, 6.5, 10.5, 14]) {
    const g = new THREE.Group(); g.position.set(x, 8.4, -8.2);
    g.add(mesh(CYL, mat(0x5b3d24), { cast: false, pos: [0, -0.5, 0], scale: [0.02, 1, 0.02] }));
    const col = [0x6aa84a, 0x9a7ab0, 0xb89a4a][Math.floor(R() * 3)];
    g.add(mesh(new THREE.ConeGeometry(0.35, 1.0, 6), mat(col), { cast: false, pos: [0, -1.4, 0], rot: [Math.PI, 0, 0] }));
    g.add(mesh(new THREE.ConeGeometry(0.28, 0.8, 5), mat(col), { cast: false, pos: [0.12, -1.3, 0.1], rot: [Math.PI, 0.5, 0.15] }));
    scene.add(g); const ph = R() * 6; animators.push((t) => { g.rotation.z = Math.sin(t * 0.8 + ph) * 0.05; });
  }
  // spinnenwebben
  const webT = webTexture();
  const webM = new THREE.MeshBasicMaterial({ map: webT, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.8 });
  const web = (x, y, z, sx, sy, s = 5) => { const w = mesh(new THREE.PlaneGeometry(s, s), webM, { cast: false, receive: false, pos: [x + sx * s / 2, y - sy * s / 2, z], scale: [sx, sy, 1] }); scene.add(w); };
  web(-17.5, 8.6, -8.7, 1, 1, 6.5); web(17.5, 8.6, -8.7, -1, 1, 6.5); web(-3.4, 8.6, -8.7, 1, 1, 3.2);
  // spin aan een draad
  const spider = new THREE.Group(); spider.position.set(-3.1, 6.5, -8.3);
  spider.add(mesh(SPH, mat(0x120a18, { flatShading: false }), { cast: false, scale: [0.2, 0.18, 0.24] }));
  spider.add(mesh(SPH, mat(0x120a18, { flatShading: false }), { cast: false, pos: [0, 0.02, 0.24], scale: 0.13 }));
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) spider.add(mesh(CYL, mat(0x120a18), { cast: false, pos: [sx * 0.24, -0.02, (i - 1.5) * 0.09], rot: [0, 0, sx * 0.9 + (i % 2) * 0.2], scale: [0.015, 0.4, 0.015] }));
  for (const sx of [-1, 1]) spider.add(mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xff3030 }), { cast: false, pos: [sx * 0.05, 0.05, 0.34], scale: 0.025 }));
  const thread = mesh(CYL, new THREE.MeshBasicMaterial({ color: 0xdde0ff, transparent: true, opacity: 0.5 }), { cast: false, receive: false }); scene.add(thread, spider);
  animators.push((t) => { const y = 6.2 + Math.sin(t * 0.5) * 1.1 + Math.sin(t * 1.9) * 0.1; spider.position.y = y; spider.rotation.y = Math.sin(t) * 0.5; const len = 8.6 - y; thread.scale.set(0.012, len, 0.012); thread.position.set(-3.1, y + len / 2, -8.3); });

  // --- kleine rommel op de vloer
  const place = (o, x, z, ry = 0) => { o.position.set(x, 0, z); o.rotation.y = ry; scene.add(o); return o; };
  place(P.barrel(1.5), -13.2, -6.5); place(P.barrel(1.3), -11.6, -7.0, 1); place(P.crate(1.4), -15, -6.3, 0.3); place(P.sack(1.5), -12.4, -4.6, 0.4);
  place(P.barrel(1.4), 13.4, -6.3); place(P.crate(1.2), 15, -6.0, 0.2); place(P.crate(1.0), 13.9, -4.6, 0.7); place(P.sack(1.3, 0xb89a70), 11.8, -6.6);
  place(P.mushroom(1.4, 0x9a5ad8), -11, -4.2); place(P.mushroom(1.0, 0xe03a3a), -10.2, -3.6); place(P.mushroom(1.2, 0x58b8ff), 10.8, -3.8);
  // bezem
  const broom = new THREE.Group(); broom.position.set(-8.6, 0, -8.0); broom.rotation.set(0, 0, 0.18);
  broom.add(mesh(CYL, mat(0x8a6238), { cast: false, pos: [0, 2.6, 0], scale: [0.06, 5.2, 0.06] }));
  broom.add(mesh(new THREE.ConeGeometry(0.4, 1.3, 8), mat(0xc9a54a), { cast: false, pos: [0, 0.65, 0], rot: [Math.PI, 0, 0] })); scene.add(broom);
  // boekenstapel + open spreukenboek
  for (let i = 0; i < 4; i++) scene.add(mesh(BOX, mat([0x8a2a3a, 0x2a5a8a, 0x3a7a4a, 0x7a4a8a][i]), { cast: false, pos: [-7.2 + (i % 2) * 0.1, 0.18 + i * 0.3, -6.7], rot: [0, i * 0.4, 0], scale: [1.5, 0.3, 1.1] }));
  const book = new THREE.Group(); book.position.set(7.6, 0.9, -6.2);
  scene.add(mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.9, 8), mat(0x4a3220), { cast: false, pos: [7.6, 0.45, -6.2] }));
  for (const sx of [-1, 1]) book.add(mesh(BOX, mat(0xefe2c4), { cast: false, pos: [sx * 0.42, 0.05, 0], rot: [0, 0, sx * -0.25], scale: [0.8, 0.07, 0.95] }));
  const bookGlow = halo(0xb070ff, 2.4, 0.5); bookGlow.position.y = 0.5; book.add(bookGlow); scene.add(book);
  animators.push((t) => { bookGlow.material.opacity = 0.35 + Math.sin(t * 2.2) * 0.2; });

  // --- ketel
  const cauldron = new THREE.Group(); scene.add(cauldron);
  const potProfile = [[0.01, 0.35], [0.85, 0.4], [1.5, 0.85], [1.95, 1.5], [2.12, 2.1], [1.98, 2.6], [1.84, 2.62], [1.8, 2.3], [1.6, 1.4], [0.8, 0.6]].map(([r, y]) => new THREE.Vector2(r, y));
  const potM = new THREE.MeshStandardMaterial({ color: 0x2c2834, metalness: 0.65, roughness: 0.42, side: THREE.DoubleSide });
  cauldron.add(mesh(new THREE.LatheGeometry(potProfile, 28), potM, { pos: [0, 0, 0] }));
  cauldron.add(mesh(new THREE.TorusGeometry(1.93, 0.13, 8, 32), potM, { pos: [0, 2.62, 0], rot: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; cauldron.add(mesh(SPH, mat(0x5a5664, { metalness: 0.5, flatShading: false }), { cast: false, pos: [Math.cos(a) * 2.12, 2.0, Math.sin(a) * 2.12], scale: 0.07 })); }
  for (const sx of [-1, 1]) cauldron.add(mesh(new THREE.TorusGeometry(0.34, 0.06, 6, 12), potM, { cast: false, pos: [sx * 2.2, 2.35, 0], rot: [0, Math.PI / 2, 0] }));
  for (const a of [0.5, 2.6, 4.7]) cauldron.add(mesh(CYL, potM, { pos: [Math.cos(a) * 1.05, 0.2, Math.sin(a) * 1.05], scale: [0.14, 0.5, 0.14] }));
  const liqTex = swirlTexture();
  const liqM = new THREE.MeshStandardMaterial({ map: liqTex, color: 0x6aff9a, emissive: 0x6aff9a, emissiveMap: liqTex, emissiveIntensity: 0.85, roughness: 0.3, side: THREE.DoubleSide });
  const liqGeo = new THREE.RingGeometry(0.02, 1.84, 40, 9);
  const liquid = mesh(liqGeo, liqM, { cast: false, receive: false, pos: [0, 2.5, 0], rot: [-Math.PI / 2, 0, 0] }); cauldron.add(liquid);
  const liqRad = Float32Array.from({ length: liqGeo.attributes.position.count }, (_, i) => Math.hypot(liqGeo.attributes.position.getX(i), liqGeo.attributes.position.getY(i)));
  // vuur onder de ketel
  const logM = mat(0x4a3220); const fireParts = [];
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; cauldron.add(mesh(CYL, logM, { cast: false, pos: [Math.cos(a) * 0.5, 0.1, Math.sin(a) * 0.5], rot: [Math.PI / 2, 0, a + 1.57], scale: [0.11, 1.3, 0.11] })); }
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; const f = mesh(new THREE.ConeGeometry(0.2 - (i % 2) * 0.05, 0.75, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffe070 : 0xff8a20, transparent: true, opacity: 0.92 }), { cast: false, receive: false, pos: [Math.cos(a) * 0.45, 0.5, Math.sin(a) * 0.45] }); f.userData.ph = i * 1.7; cauldron.add(f); fireParts.push(f); }
  const fireLight = new THREE.PointLight(0xff8a30, 1.6, 12, 1.6); fireLight.position.set(0, 0.8, 1.6); cauldron.add(fireLight);
  const potLight = new THREE.PointLight(0x6aff9a, 2.4, 20, 1.5); potLight.position.set(0, 4.2, 0.6); cauldron.add(potLight);
  const potHalo = halo(0x6aff9a, 6.5, 0.35); potHalo.position.set(0, 3.0, 0); cauldron.add(potHalo);
  // lepel
  const ladle = new THREE.Group(); ladle.position.set(0, 2.55, 0); cauldron.add(ladle);
  const lsw = new THREE.Group(); lsw.rotation.z = 0.42; ladle.add(lsw);
  lsw.add(mesh(CYL, mat(0x8a6238), { cast: false, pos: [0, 0.4, 0], scale: [0.07, 3.6, 0.07] }));
  lsw.add(mesh(new THREE.SphereGeometry(0.28, 10, 7, 0, TAU, 0, Math.PI / 2), mat(0x8a6238, { side: THREE.DoubleSide }), { cast: false, pos: [0, -1.4, 0], rot: [Math.PI, 0, 0] }));
  ladle.position.x = 0.6; ladle.userData.rest = true;
  // bellen
  const bubM = new THREE.MeshStandardMaterial({ color: 0xaaffcc, emissive: 0x6aff9a, emissiveIntensity: 0.6, transparent: true, opacity: 0.7, roughness: 0.1 });
  const bubbles = [];
  for (let i = 0; i < 14; i++) { const b = mesh(SPH, bubM, { cast: false, receive: false, scale: 0.01 }); cauldron.add(b); bubbles.push({ m: b, t: -rand(0, 2), life: rand(0.7, 1.4), x: 0, z: 0, s: 0.2 }); }

  // --- voetstukken
  const pedestals = [0, 1, 2, 3].map((i) => { const p = makePedestal(i); scene.add(p.group); return p; });

  // --- kaarsen die zweven
  const candles = [];
  const candlePos = [[-11.5, 6.6, -6], [-7.6, 7.8, -6.8], [-3.6, 7.0, -7], [3.6, 7.4, -7], [7.8, 6.4, -6.2], [11.8, 7.6, -5.4], [-13.5, 5.2, -2], [13.5, 5.0, -1.5]];
  candlePos.forEach(([x, y, z], i) => {
    const c = new THREE.Group(); c.position.set(x, y, z);
    c.add(mesh(CYL, mat(0xf2e8c8), { cast: false, pos: [0, 0, 0], scale: [0.16, 0.9 - (i % 3) * 0.2, 0.16] }));
    c.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.06, 8), mat(0xd8b050, { metalness: 0.6 }), { cast: false, pos: [0, -0.5, 0] }));
    const f = mesh(new THREE.ConeGeometry(0.1, 0.34, 6), new THREE.MeshBasicMaterial({ color: 0xffc848 }), { cast: false, pos: [0, 0.65 - (i % 3) * 0.1, 0] }); c.add(f);
    const h = halo(0xffa840, 2.2, 0.55); h.position.copy(f.position); c.add(h);
    scene.add(c); candles.push({ c, f, h, ph: rand(0, 6), x, y, z });
  });

  // --- uil
  const owl = new THREE.Group(); owl.position.set(10.3, 0, -3.8); scene.add(owl);
  owl.add(mesh(CYL, mat(0x5b3d24), { pos: [0, 1.6, 0], scale: [0.14, 3.2, 0.14] }));
  owl.add(mesh(CYL, mat(0x5b3d24), { pos: [0, 3.25, 0], rot: [0, 0, Math.PI / 2], scale: [0.1, 1.5, 0.1] }));
  owl.add(mesh(CYL, mat(0x5b3d24), { pos: [0, 0.1, 0], scale: [0.6, 0.2, 0.6] }));
  const oBody = new THREE.Group(); oBody.position.set(0, 3.3, 0); owl.add(oBody);
  const fea = mat(0xa98258, { flatShading: false }), fea2 = mat(0x84623e, { flatShading: false }), cream = mat(0xe8d8b8, { flatShading: false });
  oBody.add(mesh(SPH, fea, { cast: false, pos: [0, 0.9, 0], scale: [0.8, 1.05, 0.75] }));
  oBody.add(mesh(SPH, cream, { cast: false, pos: [0, 0.8, 0.45], scale: [0.55, 0.8, 0.35] }));
  for (const sx of [-1, 1]) oBody.add(mesh(SPH, fea2, { cast: false, pos: [sx * 0.72, 0.9, -0.05], rot: [0, 0, sx * 0.15], scale: [0.2, 0.85, 0.5] }));
  oBody.add(mesh(BOX, fea2, { cast: false, pos: [0, 0.15, -0.45], rot: [0.5, 0, 0], scale: [0.5, 0.15, 0.9] }));
  for (const sx of [-1, 1]) oBody.add(mesh(BOX, mat(0xe8a030), { cast: false, pos: [sx * 0.25, 0.02, 0.2], scale: [0.2, 0.08, 0.3] }));
  const oHead = new THREE.Group(); oHead.position.set(0, 2.05, 0.05); oBody.add(oHead);
  oHead.add(mesh(SPH, fea, { cast: false, scale: [0.82, 0.7, 0.72] }));
  for (const sx of [-1, 1]) {
    oHead.add(mesh(SPH, cream, { cast: false, pos: [sx * 0.3, 0.02, 0.4], scale: [0.34, 0.36, 0.12] }));
    oHead.add(mesh(SPH, new THREE.MeshStandardMaterial({ color: 0xffd23a, emissive: 0xffa800, emissiveIntensity: 0.6 }), { cast: false, pos: [sx * 0.3, 0.04, 0.5], scale: 0.2 }));
    oHead.add(mesh(new THREE.ConeGeometry(0.16, 0.45, 5), fea2, { cast: false, pos: [sx * 0.5, 0.55, 0], rot: [0, 0, -sx * 0.3] }));
  }
  const pupils = [-1, 1].map((sx) => { const p = mesh(SPH, new THREE.MeshBasicMaterial({ color: 0x050303 }), { cast: false, pos: [sx * 0.3, 0.04, 0.66], scale: [0.09, 0.13, 0.05] }); oHead.add(p); return p; });
  oHead.add(mesh(new THREE.ConeGeometry(0.1, 0.3, 4), mat(0xe8902a), { cast: false, pos: [0, -0.12, 0.7], rot: [Math.PI / 2 + 0.4, 0, 0] }));
  owl.rotation.y = -0.55;

  // --- kleine spreukenbliepjes die in de lucht zweven
  let moteT = 0, steamT = 0;
  const tint = new THREE.Color(0x6aff9a), tintTo = new THREE.Color(0x6aff9a);
  const tmpC = new THREE.Color();
  const hut = {
    pedestals, cauldron, ladle, owl, oHead, liqM, potLight, potHalo, potM,
    boil: 1, stirSpeed: 0, ladleAng: 0, coughT: 0, heave: 0, owlLook: 0, hootT: 0,
    tintBase: new THREE.Color(0x6aff9a),
    setTint(c, hold = 0.5) { tintTo.set(c); hut._tintHold = hold; },
    cough() { hut.coughT = 0.55; },
    update(t, dt, st = {}) {
      // ketelvloeistof
      hut._tintHold = (hut._tintHold || 0) - dt;
      const target = hut._tintHold > 0 ? tintTo : (st.baseColor || hut.tintBase);
      tint.lerp(target, 1 - Math.exp(-(hut._tintHold > 0 ? 14 : 3) * dt));
      liqM.color.copy(tint); liqM.emissive.copy(tint); potLight.color.copy(tint); potHalo.material.color.copy(tint);
      liqTex.rotation += dt * (0.25 + hut.stirSpeed * 1.8);
      liqM.emissiveIntensity = 0.75 + Math.sin(t * 3) * 0.12 + (st.glow || 0);
      potLight.intensity = 2.2 + Math.sin(t * 2.3) * 0.4 + (st.glow || 0) * 2;
      potHalo.material.opacity = 0.3 + (st.glow || 0) * 0.5;
      // oppervlak golft
      const pos = liqGeo.attributes.position; const amp = 0.05 + hut.boil * 0.07 + hut.heave * 0.4;
      for (let i = 0; i < pos.count; i++) { const r = liqRad[i]; pos.setZ(i, (Math.sin(r * 4.5 - t * (3 + hut.stirSpeed * 6)) * 0.5 + Math.sin(pos.getX(i) * 3 + t * 2.1) * 0.35) * amp + hut.heave * (1 - r / 1.84) * 0.55); }
      pos.needsUpdate = true;
      hut.heave = damp(hut.heave, 0, 4, dt);
      // hoesten
      let sq = 1;
      if (hut.coughT > 0) { hut.coughT -= dt; const k = hut.coughT / 0.55; sq = 1 + Math.sin(k * Math.PI * 4) * 0.12 * k; }
      cauldron.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      // lepel
      hut.stirSpeed = damp(hut.stirSpeed, st.stirring ? 1 : 0, st.stirring ? 6 : 2, dt);
      const swirl = st.stirring ? 1 : 0;
      hut.ladleAng += dt * (0.6 + hut.stirSpeed * 7);
      ladle.position.set(Math.cos(hut.ladleAng) * 0.9 * (0.25 + 0.75 * hut.stirSpeed) , 2.55, Math.sin(hut.ladleAng) * 0.9 * (0.25 + 0.75 * hut.stirSpeed));
      ladle.rotation.y = -hut.ladleAng + swirl * 0.0;
      // vuur
      fireParts.forEach((f) => { const s = 1 + Math.sin(t * 13 + f.userData.ph) * 0.2; f.scale.set(1, s, 1); f.rotation.y = t * 2 + f.userData.ph; });
      fireLight.intensity = 1.5 + Math.sin(t * 12) * 0.3 + Math.random() * 0.2;
      // bellen
      bubbles.forEach((b) => {
        b.t += dt;
        if (b.t < 0) { b.m.scale.setScalar(0.001); return; }
        if (b.t > b.life) { if (b.s > 0.001 && b.life > 0) { fx.particles.burst(cauldron.position.x + b.x, 2.65, b.z, { count: 3, speed: 1, size: 0.12, color: tint.getHex(), life: 0.4, gravity: 4 }); } b.t = -rand(0, 0.6 / (0.4 + hut.boil + hut.stirSpeed * 2)); b.life = rand(0.6, 1.3); const a = rand(0, TAU), r = Math.sqrt(Math.random()) * 1.45; b.x = Math.cos(a) * r; b.z = Math.sin(a) * r; b.s = rand(0.1, 0.3) * (1 + hut.heave); return; }
        const k = b.t / b.life; b.m.position.set(b.x, 2.52 + Math.sin(k * Math.PI) * 0.08, b.z); b.m.scale.setScalar(b.s * Math.sin(k * Math.PI * 0.5 + 0.2) * (k > 0.85 ? 1.3 : 1));
      });
      bubM.color.copy(tint).lerp(new THREE.Color(0xffffff), 0.5); bubM.emissive.copy(tint);
      // stoom + magische deeltjes
      steamT -= dt;
      if (steamT <= 0) { steamT = 0.11 / (0.5 + hut.boil * 0.5 + hut.stirSpeed * 2); tmpC.copy(tint).lerp(new THREE.Color(0xffffff), 0.5); const a = rand(0, TAU), r = rand(0, 1.4); fx.particles.emit(Math.cos(a) * r, 2.7, Math.sin(a) * r, rand(-0.2, 0.2), rand(0.8, 1.6), rand(-0.2, 0.2), { life: rand(1.4, 2.4), size: rand(0.6, 1.0), color: tmpC.getHex(), gravity: -0.1, shrink: false }); }
      moteT -= dt;
      if (moteT <= 0) { moteT = 0.12; fx.particles.emit(rand(-14, 14), rand(0.5, 7), rand(-7, 5), rand(-0.2, 0.2), rand(0.3, 0.8), rand(-0.2, 0.2), { life: rand(2.2, 3.6), size: rand(0.12, 0.26), color: [0xb070ff, 0x9affea, 0xffe9a0, 0xff9ae0][Math.floor(Math.random() * 4)], gravity: 0 }); }
      runes.material.opacity = 0.5 + Math.sin(t * 1.5) * 0.15 + (st.runeGlow || 0) * 0.4;
      // voetstukken
      for (const p of pedestals) {
        if (p.hold > 0) { p.hold -= dt; p.lit = 1; } else p.lit = Math.max(0, p.lit - dt * 3.2);
        const L = p.lit; const ing = ING[p.idx];
        p.light.intensity = L * 5; p.hal.material.opacity = 0.08 + L * 0.8; p.hal.scale.setScalar(4 + L * 1.5);
        p.ringM.emissiveIntensity = 0.35 + L * 2.5;
        p.item.mats.forEach(([m, base, gain]) => { m.emissiveIntensity = base + L * gain; });
        p.item.tick(t + p.idx * 1.3, dt, L);
        p.item.group.position.y = 1.6 + p.item.lift + Math.sin(t * 1.6 + p.idx * 1.9) * 0.08 + L * 0.25;
        p.item.group.scale.setScalar(1 + L * 0.25);
        // marker-ring
        if (p.markColors) {
          p.markT += dt; const c = p.markColors[Math.floor(p.markT * 6) % p.markColors.length];
          p.markM.color.set(c); p.markM.opacity = 0.55 + Math.sin(p.markT * 9) * 0.3; p.mark.scale.setScalar(1 + Math.sin(p.markT * 9) * 0.05);
        } else p.markM.opacity = damp(p.markM.opacity, 0, 10, dt);
      }
      // kaarsen
      for (const c of candles) { const k = 1 + Math.sin(t * 12 + c.ph) * 0.12 + Math.sin(t * 7.3 + c.ph * 2) * 0.08; c.f.scale.set(1, k, 1); c.h.scale.setScalar(2.2 * k); c.c.position.y = c.y + Math.sin(t * 0.9 + c.ph) * 0.3; c.c.position.x = c.x + Math.sin(t * 0.37 + c.ph) * 0.35; c.c.rotation.z = Math.sin(t * 0.7 + c.ph) * 0.08; }
      // uil
      const lookT = clamp(hut.owlLook, -1, 1);
      oHead.rotation.y = damp(oHead.rotation.y, lookT * 1.1 - Math.sin(t * 0.4) * 0.15 * (1 - Math.abs(lookT)), 6, dt);
      oBody.position.y = 3.3 + Math.sin(t * 1.3) * 0.02;
      const blink = Math.sin(t * 0.9 + 1) > 0.985 ? 0.15 : 1; pupils.forEach((p) => { p.scale.y = 0.13 * blink; });
      oBody.rotation.z = Math.sin(t * 0.6) * 0.03;
      for (const a of animators) a(t);
      for (const j of jarLiq) { const k = (t * 0.4 + j.userData.ph) % 1; j.position.y = j.userData.y0 + k * j.userData.h; j.scale.setScalar(0.04 + 0.04 * Math.sin(k * Math.PI)); }
    },
  };
  return hut;
}

export function makeHendrika() {
  const c = makeNPC('witch', { scale: 1.1 });
  return c;
}
