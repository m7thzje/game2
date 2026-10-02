import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, TAU, h } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { makeNPC } from '../engine/chars.js';
import { groundY, onBridge } from './terrain.js';

// Wereld-context waaraan alle bouwfuncties dingen toevoegen
export function makeWorldCtx(scene, particles) {
  const W = {
    scene, particles,
    colliders: [], interact: [], doors: [], glowMats: [], lamps: [], updaters: [], npcs: [], chimneys: [], jobNpc: {}, labels: [], torches: [], campfires: [],
    waterfx: [], decor: [],
  };
  W.put = (obj, x, z, yaw = 0, lift = 0) => { obj.position.set(x, groundY(x, z) + lift, z); obj.rotation.y = yaw; scene.add(obj); return obj; };
  W.circle = (x, z, r) => W.colliders.push({ t: 'c', x, z, r });
  W.box = (x, z, w, d, yaw = 0) => W.colliders.push({ t: 'b', x, z, hw: w / 2, hd: d / 2, c: Math.cos(yaw), s: Math.sin(yaw) });
  W.add = (obj) => { scene.add(obj); return obj; };
  // rotatie van lokaal -> wereld rond y
  W.local = (x, z, yaw, lx, lz) => [x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
  W.house = (x, z, yaw, w, d, hh, o = {}) => {
    const g = P.houseSimple(w, d, hh, o); W.put(g, x, z, yaw);
    W.box(x, z, w + 0.6, d + 0.6, yaw);
    const [dx, dz] = W.local(x, z, yaw, 0, d / 2 + 0.3);
    W.doors.push({ x: dx, z: dz, yaw, leaf: g.userData.door.userData.leaf, owner: o.name || 'huis', h: hh, w, d, hx: x, hz: z, ry: groundY(x, z) });
    if (g.userData.windows) for (const wm of g.userData.windows) { wm.material = wm.material.clone(); W.glowMats.push(wm.material); }
    const rh = Math.max(1.6, w * 0.45);
    const [cx2, cz2] = W.local(x, z, yaw, w * 0.25, -d * 0.2);
    W.chimneys.push({ x: cx2, y: groundY(x, z) + hh + rh * 0.7 + 1, z: cz2 });
    return g;
  };
  W.npc = (kind, x, z, yaw, o = {}) => {
    const c = makeNPC(kind, o.spec); c.group.position.set(x, groundY(x, z) + (o.lift || 0), z); c.yaw = c.targetYaw = yaw; c.group.rotation.y = yaw; scene.add(c.group);
    c.home = { x, z, yaw }; c.lookR = o.lookR ?? 9; c.idle = o.idle || 'idle'; W.npcs.push(c); return c;
  };
  W.sign = (text, w, hgt, x, y, z, yaw = 0, o = {}) => {
    const m = mesh(new THREE.BoxGeometry(w, hgt, 0.15), [mat(0x3a2412), mat(0x3a2412), mat(0x3a2412), mat(0x3a2412), new THREE.MeshStandardMaterial({ map: tex.sign(text, { w: 256 * w / hgt > 640 ? 640 : Math.round(256 * w / hgt), h: 256, size: o.size || 60, bg: o.bg || '#6b3f1c', fg: o.fg || '#ffe9b0' }), roughness: 0.9 }), new THREE.MeshStandardMaterial({ map: tex.sign(text, { w: 256 * w / hgt > 640 ? 640 : Math.round(256 * w / hgt), h: 256, size: o.size || 60, bg: o.bg || '#6b3f1c', fg: o.fg || '#ffe9b0' }), roughness: 0.9 })], { pos: [x, y, z], rot: [0, yaw, 0] });
    return m;
  };
  return W;
}

export function stripedTex(c1 = '#e8453c', c2 = '#fff3d6', n = 8) {
  const t = canvasTex(256, 64, (g, w, hh) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * w / n, 0, w / n + 1, hh); } });
  t.wrapS = THREE.RepeatWrapping; t.userData.keep = true; return t;
}

export function stall(c1 = '#e8453c', c2 = '#fff3d6', goods = 'apples') {
  const g = new THREE.Group();
  const wood = mat(0x7a5530);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 5), wood, { pos: [sx * 1.4, 1.3, sz * 0.8] }));
  g.add(mesh(new THREE.BoxGeometry(3.0, 0.9, 1.2), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1), roughness: 0.9 }), { pos: [0, 0.45, 0.2] }));
  const canopy = mesh(new THREE.BoxGeometry(3.4, 0.12, 2.1), new THREE.MeshStandardMaterial({ map: stripedTex(c1, c2, 6) }), { pos: [0, 2.7, 0], rot: [0.12, 0, 0] }); g.add(canopy);
  const fr = mesh(new THREE.BoxGeometry(3.4, 0.4, 0.05), new THREE.MeshStandardMaterial({ map: stripedTex(c1, c2, 12) }), { pos: [0, 2.45, 1.0] }); g.add(fr);
  for (let i = 0; i < 6; i++) {
    const it = goods === 'apples' ? P.apple([0xd83a2a, 0x7ac143, 0xf0b429][i % 3]) : goods === 'fish' ? P.fish([0x58a8e8, 0xe8a858][i % 2]) : P.bread(['loaf', 'bun', 'pretzel'][i % 3]);
    it.position.set(-1.1 + i * 0.45, 0.9, 0.2 + ((i % 2) - 0.5) * 0.3); it.scale.setScalar(goods === 'fish' ? 0.6 : 1); g.add(it);
  }
  return g;
}
export function tent(r = 4, hgt = 5, c1 = '#8a3fd8', c2 = '#ffd23f') {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, hgt * 0.45, 12, 1, true), new THREE.MeshStandardMaterial({ map: stripedTex(c1, c2, 6), side: THREE.DoubleSide }), { pos: [0, hgt * 0.225, 0] }));
  const m = new THREE.MeshStandardMaterial({ map: stripedTex(c1, c2, 6), flatShading: true }); m.map.repeat.set(2, 1);
  g.add(mesh(new THREE.ConeGeometry(r * 1.12, hgt * 0.6, 12), m, { pos: [0, hgt * 0.45 + hgt * 0.3, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.4, 4), mat(0x5b3d24), { pos: [0, hgt + 0.5, 0] }));
  const flag = mesh(new THREE.PlaneGeometry(1.2, 0.7), mat(0xe8412c, { side: THREE.DoubleSide }), { pos: [0.6, hgt + 1.0, 0] }); g.add(flag); g.userData.flag = flag;
  return g;
}
export function bench() {
  const g = new THREE.Group(); const w = mat(0x8a5a2b);
  g.add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.5), w, { pos: [0, 0.5, 0] })); g.add(mesh(new THREE.BoxGeometry(1.8, 0.4, 0.08), w, { pos: [0, 0.85, -0.22], rot: [-0.15, 0, 0] }));
  for (const sx of [-0.8, 0.8]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 0.45), w, { pos: [sx, 0.25, 0] }));
  return g;
}
export function table(len = 2.2) {
  const g = new THREE.Group(); const w = mat(0x9a6a38);
  g.add(mesh(new THREE.BoxGeometry(len, 0.1, 1.0), w, { pos: [0, 0.9, 0] }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), w, { pos: [sx * (len / 2 - 0.15), 0.45, sz * 0.38] }));
  return g;
}
export function mug() { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.2, 8), mat(0xc89a52), { pos: [0, 0.1, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 8), mat(0xffffff), { pos: [0, 0.2, 0] })); g.add(mesh(new THREE.TorusGeometry(0.06, 0.015, 4, 8), mat(0xc89a52), { pos: [0.11, 0.1, 0] })); return g; }
export function cart() {
  const g = new THREE.Group(); const w = mat(0x8a5a2b);
  g.add(mesh(new THREE.BoxGeometry(2.2, 0.15, 1.4), w, { pos: [0, 0.7, 0] }));
  for (const sz of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(2.2, 0.5, 0.1), w, { pos: [0, 1.0, sz * 0.65] }));
  for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.1, 0.5, 1.4), w, { pos: [sx * 1.05, 1.0, 0] }));
  for (const sz of [-1, 1]) { const wh = new THREE.Group(); wh.position.set(0.5, 0.45, sz * 0.8); wh.add(mesh(new THREE.TorusGeometry(0.42, 0.07, 6, 14), w, { rot: [0, 0, 0] })); for (let i = 0; i < 4; i++) wh.add(mesh(new THREE.BoxGeometry(0.85, 0.06, 0.06), w, { rot: [0, 0, i * Math.PI / 4] })); g.add(wh); }
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 5), w, { pos: [-1.7, 0.7, 0], rot: [0, 0, 1.45] }));
  return g;
}
export function milkCan() { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.7, 8), mat(0xbfc7d6, { metalness: 0.6, roughness: 0.4 }), { pos: [0, 0.35, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.15, 8), mat(0xbfc7d6, { metalness: 0.6 }), { pos: [0, 0.78, 0] })); return g; }
export function scarecrow() {
  const g = new THREE.Group(); const wd = mat(0x6b4a2e);
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 5), wd, { pos: [0, 1.1, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), wd, { pos: [0, 1.6, 0], rot: [0, 0, Math.PI / 2] }));
  g.add(mesh(new THREE.SphereGeometry(0.25, 8, 6), mat(0xe8d09a), { pos: [0, 2.2, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 10), mat(0x8a6a2e), { pos: [0, 2.4, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.3, 8), mat(0x8a6a2e), { pos: [0, 2.55, 0] }));
  g.add(mesh(new THREE.BoxGeometry(0.7, 0.8, 0.3), mat(0x9a3a2a), { pos: [0, 1.5, 0] }));
  g.userData.arms = g; return g;
}
export function dummy() { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.8, 5), mat(0x6b4a2e), { pos: [0, 0.9, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8), mat(0xc9a86a), { pos: [0, 1.4, 0] })); g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xc9a86a), { pos: [0, 2.05, 0] })); g.add(mesh(new THREE.BoxGeometry(1.2, 0.12, 0.12), mat(0x6b4a2e), { pos: [0, 1.6, 0] })); return g; }
export function target() { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 5), mat(0x6b4a2e), { pos: [0, 0.65, 0] })); const cols = [0xffffff, 0x222222, 0x3a78e0, 0xd8372c, 0xffd23f]; cols.forEach((c, i) => g.add(mesh(new THREE.CylinderGeometry(0.7 - i * 0.14, 0.7 - i * 0.14, 0.06 + i * 0.002, 14), mat(c), { pos: [0, 1.5, 0.05 + i * 0.01], rot: [Math.PI / 2, 0, 0], cast: false }))); return g; }
export function wheelbarrow() { const g = new THREE.Group(); g.add(mesh(new THREE.BoxGeometry(1.1, 0.35, 0.7), mat(0x8a5a2b), { pos: [0, 0.6, 0] })); g.add(mesh(new THREE.TorusGeometry(0.25, 0.06, 5, 10), mat(0x333333), { pos: [0.65, 0.3, 0] })); g.add(mesh(new THREE.BoxGeometry(1.0, 0.06, 0.06), mat(0x6b4a2e), { pos: [-0.9, 0.55, 0.25], rot: [0, 0, 0.2] })); g.add(mesh(new THREE.BoxGeometry(1.0, 0.06, 0.06), mat(0x6b4a2e), { pos: [-0.9, 0.55, -0.25], rot: [0, 0, 0.2] })); return g; }
export function snowman() { const g = new THREE.Group(); const s = mat(0xffffff, { flatShading: false }); g.add(mesh(new THREE.SphereGeometry(0.7, 10, 8), s, { pos: [0, 0.7, 0] })); g.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), s, { pos: [0, 1.65, 0] })); g.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), s, { pos: [0, 2.3, 0] })); g.add(mesh(new THREE.ConeGeometry(0.07, 0.35, 5), mat(0xff8a1c), { pos: [0, 2.3, 0.4], rot: [Math.PI / 2, 0, 0] })); for (const sx of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.04, 4, 3), mat(0x111111), { cast: false, pos: [sx * 0.12, 2.4, 0.3] })); g.add(mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.3, 8), mat(0x222222), { pos: [0, 2.7, 0] })); return g; }
export function brazier() { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.5, 8), mat(0x333338, { metalness: 0.6 }), { pos: [0, 1.0, 0] })); for (const a of [0, 2, 4]) g.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), mat(0x333338), { pos: [Math.cos(a) * 0.25, 0.5, Math.sin(a) * 0.25] })); const f = mesh(new THREE.ConeGeometry(0.3, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xffa020 }), { cast: false, pos: [0, 1.5, 0] }); g.add(f); g.userData.flame = f; return g; }
export function cabbageRows(w, d, kind = 'cabbage') {
  const g = new THREE.Group(); const cm = [mat(0x6ac04a, { flatShading: false }), mat(0xff8a1c)];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) { if (kind === 'cabbage') g.add(mesh(new THREE.SphereGeometry(0.32, 6, 5), cm[(i + j) % 5 === 0 ? 0 : 0], { cast: false, pos: [(i - w / 2) * 1.8 + 0.9, 0.25, (j - d / 2) * 1.4], scale: [1, 0.8, 1] })); else g.add(mesh(new THREE.ConeGeometry(0.1, 0.4, 4), cm[1], { cast: false, pos: [(i - w / 2) * 1.8 + 0.9, 0.2, (j - d / 2) * 1.4], rot: [Math.PI, 0, 0] })); }
  return g;
}
export function floatLabel(text, sub = '', color = '#ffe14a') {
  const t = canvasTex(512, 160, (g, w, hh) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 60px Fredoka, Arial Black, sans-serif'; g.lineWidth = 12; g.lineJoin = 'round'; g.strokeStyle = 'rgba(25,10,35,.95)'; g.strokeText(text, w / 2, 52, w - 20); g.fillStyle = color; g.fillText(text, w / 2, 52, w - 20);
    if (sub) { g.font = 'bold 54px Fredoka, Arial, sans-serif'; g.strokeText(sub, w / 2, 118, w - 20); g.fillStyle = '#fff'; g.fillText(sub, w / 2, 118, w - 20); }
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(5.2, 1.62, 1); sp.renderOrder = 15;
  return sp;
}
export function questMark() {
  const t = canvasTex(64, 128, (g) => { g.font = 'bold 110px Fredoka, Arial Black'; g.textAlign = 'center'; g.fillStyle = '#ffd23f'; g.strokeStyle = '#4a2a00'; g.lineWidth = 10; g.strokeText('!', 32, 100); g.fillText('!', 32, 100); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(0.9, 1.8, 1); return sp;
}
