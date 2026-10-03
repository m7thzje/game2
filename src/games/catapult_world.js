import * as THREE from 'three';
import { mat, mesh, clamp, lerp, damp, TAU, canvasTex, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { Dragon, makeNPC } from '../engine/chars.js';
import { MATS } from './catapult_phys.js';

// Visuele bouwstenen voor "Kasteelbelegering": landschap, katapult, instanced kasteelblokken, projectielen, draak, ballonkist.

export const GROUND_Y = 0;

// ---------------- landschap ----------------
export function buildLandscape(scene) {
  const upd = [];
  // grond
  const ground = mesh(new THREE.PlaneGeometry(260, 70), new THREE.MeshStandardMaterial({ map: tex.grass(52, 14), roughness: 1 }), { cast: false, pos: [0, 0, -8], rot: [-Math.PI / 2, 0, 0] });
  scene.add(ground);
  // zandpad vooraan
  scene.add(mesh(new THREE.PlaneGeometry(260, 5), new THREE.MeshStandardMaterial({ map: tex.dirt(52, 1), roughness: 1 }), { cast: false, pos: [0, 0.02, 9.5], rot: [-Math.PI / 2, 0, 0] }));
  // heuvels (platgeslagen bollen) en bergen
  const hillM = [mat(0x5fa84a), mat(0x4f9a46), mat(0x6bb552)];
  const rnd = mulberry32(21);
  for (let i = 0; i < 9; i++) {
    const r = 12 + rnd() * 14;
    scene.add(mesh(new THREE.IcosahedronGeometry(r, 1), hillM[i % 3], { cast: false, receive: false, pos: [-100 + i * 26 + rnd() * 8, -r * 0.55, -34 - rnd() * 10], scale: [1.6, 0.8, 1] }));
  }
  const mt = [mat(0x8a96b8, { fog: true }), mat(0x7a86a8)];
  for (let i = 0; i < 6; i++) {
    const h = 24 + rnd() * 20;
    const m = mesh(new THREE.ConeGeometry(14 + rnd() * 8, h, 6), mt[i % 2], { cast: false, receive: false, pos: [-85 + i * 34 + rnd() * 8, h / 2 - 3, -75 - rnd() * 10] });
    scene.add(m);
    scene.add(mesh(new THREE.ConeGeometry(5, h * 0.25, 6), mat(0xffffff), { cast: false, receive: false, pos: [m.position.x, h - 3 - h * 0.1, m.position.z] }));
  }
  // bomen en dorpshuisjes op de achtergrond
  for (let i = 0; i < 12; i++) {
    const x = -62 + i * 11 + rnd() * 5; if (Math.abs(x) < 4) continue;
    const t = i % 3 === 0 ? P.pine(7 + rnd() * 3, 0x2c7a4b) : P.tree(6 + rnd() * 3, [0x3f9e3a, 0x4fae3f, 0x5ac04a][i % 3]);
    t.position.set(x, 0, -17 - rnd() * 9); scene.add(t);
  }
  for (const [x, z, s] of [[-52, -22, 1], [-8, -24, 1.2], [14, -21, 1], [50, -24, 1.1]]) {
    const hse = P.houseSimple(5 * s, 4 * s, 3 * s, { roof: ['#b5483a', '#4a6aa8', '#8a5aa0', '#c0842a'][Math.floor(rnd() * 4)] });
    hse.position.set(x, 0, z); hse.rotation.y = (rnd() - 0.5) * 0.4; scene.add(hse);
  }
  // wolken
  const clouds = [];
  for (let i = 0; i < 5; i++) {
    const c = P.cloud(2.2 + rnd() * 1.5); c.position.set(-80 + i * 40, 36 + rnd() * 14, -45 - rnd() * 15); scene.add(c);
    clouds.push({ c, sp: 0.7 + rnd() * 0.8 });
  }
  upd.push((dt, wind) => { for (const k of clouds) { k.c.position.x += (k.sp + wind * 0.5) * dt; if (k.c.position.x > 110) k.c.position.x = -110; if (k.c.position.x < -110) k.c.position.x = 110; } });
  // windstrepen
  const N = 46; const wp = new Float32Array(N * 3); const wl = new Float32Array(N);
  for (let i = 0; i < N; i++) { wp[i * 3] = (rnd() - 0.5) * 100; wp[i * 3 + 1] = 4 + rnd() * 30; wp[i * 3 + 2] = 2 + rnd() * 6; wl[i] = rnd(); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  const wpts = new THREE.Points(wg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.55, transparent: true, opacity: 0.55, depthWrite: false })); wpts.frustumCulled = false; scene.add(wpts);
  upd.push((dt, wind) => {
    for (let i = 0; i < N; i++) { wp[i * 3] += wind * 3.2 * dt + (wind === 0 ? 0.5 * dt : 0); wp[i * 3 + 1] += Math.sin(wl[i] * 6 + wp[i * 3] * 0.2) * dt * 0.8; if (wp[i * 3] > 55) wp[i * 3] = -55; if (wp[i * 3] < -55) wp[i * 3] = 55; }
    wg.attributes.position.needsUpdate = true;
  });
  return { update(dt, wind) { for (const f of upd) f(dt, wind); } };
}

// vlag op een paal die met de wind meewappert
export function makeFlag(color) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.2, 6), mat(0x4a3220), { pos: [0, 1.6, 0] }));
  const cloth = new THREE.Group(); cloth.position.set(0, 2.9, 0); g.add(cloth);
  const m = mesh(new THREE.PlaneGeometry(1.6, 0.9, 6, 1), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.8 }), { cast: false, pos: [0.8, 0, 0] });
  cloth.add(m); g.userData.cloth = cloth; g.userData.m = m;
  g.userData.anim = (t, wind) => { const k = clamp(Math.abs(wind) / 8, 0.1, 1); cloth.scale.x = Math.sign(wind || 1); cloth.rotation.z = -0.1 - (1 - k) * 0.6 + Math.sin(t * 7 + wind) * 0.05 * k; m.scale.x = 0.55 + k * 0.45; m.position.x = 0.8 * m.scale.x; };
  return g;
}

// ---------------- katapult ----------------
export function makeCatapult(color) {
  const g = new THREE.Group();
  const wood = mat(0x8a5a2e), dark = mat(0x5b3a1e), acc = mat(color);
  // frame
  g.add(mesh(new THREE.BoxGeometry(4.2, 0.35, 0.35), wood, { pos: [0, 0.9, 0.7] }), mesh(new THREE.BoxGeometry(4.2, 0.35, 0.35), wood, { pos: [0, 0.9, -0.7] }));
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 1.7), dark, { pos: [-1.8, 0.9, 0] }), mesh(new THREE.BoxGeometry(0.3, 0.3, 1.7), dark, { pos: [1.8, 0.9, 0] }));
  // twee A-benen om de arm
  for (const z of [0.7, -0.7]) { g.add(mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), wood, { pos: [0.5, 2.0, z], rot: [0, 0, 0.18] }), mesh(new THREE.BoxGeometry(0.3, 2.2, 0.3), wood, { pos: [-0.5, 2.0, z], rot: [0, 0, -0.18] })); }
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 1.8, 8), acc, { pos: [0, 3.0, 0], rot: [Math.PI / 2, 0, 0] }));
  // wielen
  for (const [x, z] of [[-1.5, 1.0], [1.5, 1.0], [-1.5, -1.0], [1.5, -1.0]]) g.add(mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.22, 12), dark, { pos: [x, 0.62, z], rot: [Math.PI / 2, 0, 0] }), mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 6), acc, { pos: [x, 0.62, z * 1.02], rot: [Math.PI / 2, 0, 0] }));
  // arm (draait om de as)
  const arm = new THREE.Group(); arm.position.set(0, 3.0, 0); g.add(arm);
  arm.add(mesh(new THREE.BoxGeometry(4.0, 0.3, 0.4), wood, { pos: [1.5, 0, 0.25] }), mesh(new THREE.BoxGeometry(4.0, 0.3, 0.4), wood, { pos: [1.5, 0, -0.25] }));
  const bucket = new THREE.Group(); bucket.position.set(3.4, 0.05, 0); arm.add(bucket);
  bucket.add(mesh(new THREE.CylinderGeometry(0.62, 0.45, 0.5, 10, 1, true), mat(0x6a4020, { side: THREE.DoubleSide }), { pos: [0, 0.2, 0] }), mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 10), dark, { pos: [0, -0.04, 0] }));
  arm.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 1.1), mat(0x7a7a84, { metalness: 0.3 }), { pos: [-1.9, -0.2, 0] }));
  g.userData.arm = arm; g.userData.bucket = bucket; g.userData.pivot = new THREE.Vector3(0, 3.0, 0);
  // vlaggetje in spelerskleur
  const fl = makeFlag(color); fl.scale.setScalar(0.55); fl.position.set(-1.9, 0.9, 0); g.add(fl); g.userData.flag = fl;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------- instanced kasteelblokken ----------------
const BLOCK_DEPTH = 2.6;
export class BlockField {
  constructor(scene, maxPer = 64) {
    this.maxPer = maxPer;
    const mk = (m, k) => { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, maxPer); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.count = 0; scene.add(im); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); return im; };
    this.mesh = {
      wood: mk(new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#b07a48'), roughness: 0.95 })),
      stone: mk(new THREE.MeshStandardMaterial({ map: tex.bricks(1, 1), roughness: 0.95 })),
      glass: mk(new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x2a8ad8, emissiveIntensity: 0.25, transparent: true, opacity: 0.55, roughness: 0.1 })),
    };
    this.glassMat = this.mesh.glass.material; this.glassMat.depthWrite = false;
    this.n = { wood: 0, stone: 0, glass: 0 };
    this._axis = new THREE.Vector3(0, 0, 1); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler(); this._c = new THREE.Color();
  }
  // geeft (mat, idx) terug voor een nieuw blok
  alloc(matName) { const idx = this.n[matName]++; this.mesh[matName].count = this.n[matName]; return idx; }
  set(matName, idx, x, y, ang, w, h, color, z = 0) {
    const im = this.mesh[matName];
    this._q.setFromAxisAngle(this._axis, ang);
    this._p.set(x, y, z); this._s.set(w, h, BLOCK_DEPTH * (matName === 'glass' ? 0.5 : 1));
    this._m.compose(this._p, this._q, this._s); im.setMatrixAt(idx, this._m);
    im.setColorAt(idx, color); im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
  hide(matName, idx) { const im = this.mesh[matName]; this._m.makeScale(0, 0, 0); im.setMatrixAt(idx, this._m); im.instanceMatrix.needsUpdate = true; }
}

// ---------------- projectielen ----------------
export const AMMO = [
  { id: 'stone', name: 'Steen', icon: 'S', col: '#b8bcc8', r: 0.8, mass: 8, e: 0.12, windK: 0.35, dmg: 1.0, cd: 2.5 },
  { id: 'cake', name: 'Taart', icon: 'T', col: '#ff8ac0', r: 0.9, mass: 3, e: 0, windK: 1.0, dmg: 0.25, cd: 3.0 },
  { id: 'fire', name: 'Vuurbal', icon: 'V', col: '#ff8a2a', r: 0.75, mass: 2.6, e: 0.05, windK: 0.7, dmg: 0.45, cd: 3.0 },
  { id: 'chicken', name: 'Kip', icon: 'K', col: '#fff3d0', r: 0.8, mass: 3, e: 0.8, windK: 1.3, dmg: 0.5, cd: 2.5 },
];
export function makeProjMesh(type) {
  const g = new THREE.Group();
  if (type === 'stone') {
    g.add(mesh(new THREE.DodecahedronGeometry(0.8, 0), mat(0x8c909c), { }), mesh(new THREE.DodecahedronGeometry(0.5, 0), mat(0xa4a8b4), { pos: [0.3, 0.3, 0.5] }));
  } else if (type === 'cake') {
    g.add(mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.5, 14), mat(0xe8b878, { flatShading: false }), { pos: [0, -0.2, 0] }), mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.32, 14), mat(0xff8ac0, { flatShading: false }), { pos: [0, 0.2, 0] }), mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0xd8212a, { flatShading: false }), { pos: [0, 0.5, 0] }));
  } else if (type === 'fire') {
    const m = new THREE.MeshStandardMaterial({ color: 0xff6a10, emissive: 0xff4a00, emissiveIntensity: 1.2, flatShading: true });
    g.add(mesh(new THREE.IcosahedronGeometry(0.72, 1), m, { cast: false }), mesh(new THREE.ConeGeometry(0.5, 1.4, 6), new THREE.MeshBasicMaterial({ color: 0xffc23a }), { cast: false, pos: [-0.7, 0, 0], rot: [0, 0, Math.PI / 2] }));
    g.userData.tail = g.children[1];
  } else {
    const w = mat(0xfff6e0, { flatShading: false });
    g.add(mesh(new THREE.SphereGeometry(0.7, 10, 8), w, { scale: [1, 0.9, 0.9] }), mesh(new THREE.SphereGeometry(0.4, 8, 6), w, { pos: [0.65, 0.5, 0] }), mesh(new THREE.ConeGeometry(0.17, 0.4, 4), mat(0xf2a33a), { pos: [1.05, 0.5, 0], rot: [0, 0, -Math.PI / 2] }), mesh(new THREE.BoxGeometry(0.14, 0.34, 0.1), mat(0xd83a2a), { pos: [0.65, 0.95, 0] }), mesh(new THREE.ConeGeometry(0.35, 0.8, 4), mat(0xe8e0d0), { pos: [-0.8, 0.35, 0], rot: [0, 0, Math.PI / 2 + 0.5] }));
    for (const z of [0.3, -0.3]) g.add(mesh(new THREE.SphereGeometry(0.07, 5, 4), mat(0x111111), { cast: false, pos: [0.85, 0.62, z] }));
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------- koning ----------------
export function makeKing(color) {
  const c = makeNPC('captain', { scale: 0.78, hat: 'crown', cape: color, beard: 'full', hair: 0xdddddd, beardColor: 0xe8e8e8, shirt: 0x7a2a8a, sleeve: 0x7a2a8a, pants: 0x4a2a5a });
  const holder = new THREE.Group(); holder.add(c.group);
  c.group.position.y = -0.9;       // voeten op de onderkant van de doos (middelpunt = 0)
  return { holder, c };
}

// ---------------- draak en ballonkist ----------------
export function makeFlyingDragon() { const d = new Dragon(0xd8402a, 0.8); const g = new THREE.Group(); g.add(d.group); return { g, d }; }
export function makeBalloonChest() {
  const g = new THREE.Group();
  const bm = new THREE.MeshStandardMaterial({ color: 0xff5a8a, roughness: 0.4, flatShading: false });
  const ball = mesh(new THREE.SphereGeometry(1.5, 14, 10), bm, { pos: [0, 3.2, 0], scale: [1, 1.2, 1] }); g.add(ball);
  for (const a of [-0.5, 0.5]) { g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 3), mat(0xffffff), { cast: false, pos: [a * 0.9, 1.3, 0], rot: [0, 0, a * 0.55] })); }
  const chest = P.chest(false, 0xc9892a); chest.scale.setScalar(1.3); chest.position.y = -0.4; g.add(chest);
  g.add(mesh(new THREE.TorusGeometry(1.2, 0.08, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.6 }), { cast: false, pos: [0, 1.4, 0] }));
  return g;
}

// ---------------- sprites ----------------
export function labelSprite(text, color = '#fff', w = 3.6) {
  const t = canvasTex(256, 96, (g, W, H) => { g.font = 'bold 56px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 11; g.strokeStyle = 'rgba(20,10,30,.92)'; g.lineJoin = 'round'; g.strokeText(text, W / 2, H / 2, W - 12); g.fillStyle = color; g.fillText(text, W / 2, H / 2, W - 12); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(w, w * 96 / 256, 1); s.renderOrder = 14; return s;
}
export function windSprite() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d');
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false })); s.scale.set(7.5, 2.8, 1); s.renderOrder = 14;
  s.userData.draw = (wind) => {
    g.clearRect(0, 0, 256, 96); g.font = 'bold 34px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const dir = Math.sign(wind), n = Math.round(Math.abs(wind));
    g.lineWidth = 8; g.strokeStyle = 'rgba(20,20,50,.9)'; g.lineJoin = 'round'; g.fillStyle = '#e8f6ff';
    g.strokeText('WIND', 128, 22); g.fillText('WIND', 128, 22);
    // pijl met aantal streepjes
    g.save(); g.translate(128, 62); if (dir < 0) g.scale(-1, 1);
    const len = 30 + n * 11; g.fillStyle = n < 1 ? '#aab' : n < 4 ? '#8fe0ff' : n < 7 ? '#ffe14a' : '#ff7a4a'; g.strokeStyle = 'rgba(20,20,50,.9)'; g.lineWidth = 6;
    if (n < 1) { g.beginPath(); g.arc(0, 0, 9, 0, 7); g.fill(); g.stroke(); }
    else { g.beginPath(); g.moveTo(-len / 2, -6); g.lineTo(len / 2 - 14, -6); g.lineTo(len / 2 - 14, -15); g.lineTo(len / 2 + 8, 0); g.lineTo(len / 2 - 14, 15); g.lineTo(len / 2 - 14, 6); g.lineTo(-len / 2, 6); g.closePath(); g.stroke(); g.fill(); }
    g.restore(); tx.needsUpdate = true;
  };
  return s;
}
export function ammoSprite(playerCss) {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 128; const g = cv.getContext('2d');
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthTest: false })); s.scale.set(2.2, 2.2, 1); s.renderOrder = 14;
  s.userData.draw = (ammo, mega) => {
    g.clearRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(20,10,30,.8)'; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.fill();
    g.strokeStyle = mega ? '#ffe14a' : playerCss; g.lineWidth = 8; g.stroke();
    g.fillStyle = ammo.col; g.font = 'bold 60px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ammo.icon, 64, 70);
    tx.needsUpdate = true;
  };
  return s;
}
