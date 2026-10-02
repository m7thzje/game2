import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, TAU } from './util.js';
import { tex } from './textures.js';

// Handige bouwstenen voor wereld en minigames. Alles retourneert een THREE.Group (voeten op y=0).
const G = () => new THREE.Group();
const add = (g, m) => { g.add(m); return m; };

export function tree(h = 4, leaf = 0x3f9e3a, trunk = 0x6b4a2e) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(0.22 * h / 4, 0.32 * h / 4, h * 0.5, 7), mat(trunk), { pos: [0, h * 0.25, 0] }));
  const lm = mat(leaf);
  add(g, mesh(new THREE.IcosahedronGeometry(h * 0.38, 1), lm, { pos: [0, h * 0.7, 0] }));
  add(g, mesh(new THREE.IcosahedronGeometry(h * 0.27, 1), lm, { pos: [h * 0.2, h * 0.52, h * 0.1] }));
  add(g, mesh(new THREE.IcosahedronGeometry(h * 0.25, 1), lm, { pos: [-h * 0.2, h * 0.55, -h * 0.1] }));
  return g;
}
export function pine(h = 5, leaf = 0x2c7a4b, snow = false) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(0.2 * h / 5, 0.28 * h / 5, h * 0.25, 6), mat(0x5b3d24), { pos: [0, h * 0.12, 0] }));
  for (let i = 0; i < 4; i++) {
    const r = h * (0.36 - i * 0.07), y = h * (0.25 + i * 0.2);
    add(g, mesh(new THREE.ConeGeometry(r, h * 0.34, 8), mat(leaf), { pos: [0, y + h * 0.1, 0] }));
    if (snow) add(g, mesh(new THREE.ConeGeometry(r * 0.75, h * 0.2, 8), mat(0xffffff), { pos: [0, y + h * 0.2, 0] }));
  }
  return g;
}
export function rock(size = 1, color = 0x8a8c94) {
  const m = mesh(new THREE.DodecahedronGeometry(size, 0), mat(color), { scale: [1, 0.7, 0.9] });
  m.position.y = size * 0.35; const g = G(); g.add(m); return g;
}
export function bush(size = 1, color = 0x3b9a45) {
  const g = G(); const m = mat(color);
  add(g, mesh(new THREE.IcosahedronGeometry(size * 0.6, 1), m, { pos: [0, size * 0.4, 0] }));
  add(g, mesh(new THREE.IcosahedronGeometry(size * 0.45, 1), m, { pos: [size * 0.5, size * 0.3, 0.1] }));
  add(g, mesh(new THREE.IcosahedronGeometry(size * 0.4, 1), m, { pos: [-size * 0.45, size * 0.28, -0.1] }));
  return g;
}
export function mushroom(size = 1, cap = 0xe03a3a) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(0.12 * size, 0.16 * size, 0.5 * size, 7), mat(0xf4ecd8), { pos: [0, 0.25 * size, 0] }));
  add(g, mesh(new THREE.SphereGeometry(0.45 * size, 10, 7, 0, TAU, 0, Math.PI / 2), mat(cap, { flatShading: false }), { pos: [0, 0.5 * size, 0] }));
  for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; add(g, mesh(new THREE.SphereGeometry(0.06 * size, 5, 4), mat(0xffffff), { cast: false, pos: [Math.cos(a) * 0.25 * size, 0.78 * size, Math.sin(a) * 0.25 * size] })); }
  return g;
}
export function flowerPatch(color = 0xff6fa5, n = 6, r = 0.8) {
  const g = G();
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, d = Math.random() * r;
    const f = G(); f.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    add(f, mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4), mat(0x3b8a3a), { cast: false, pos: [0, 0.15, 0] }));
    add(f, mesh(new THREE.SphereGeometry(0.08, 6, 5), mat([color, 0xffe14a, 0xffffff, 0x8fb8ff][i % 4]), { cast: false, pos: [0, 0.32, 0] }));
    g.add(f);
  }
  return g;
}
export function crate(size = 1, color = 0xb98a54) {
  const g = G(); const m = mat(color); const dm = mat(0x6b4a2e);
  add(g, mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#' + new THREE.Color(color).getHexString()), roughness: 0.9 }), { pos: [0, size / 2, 0] }));
  const t = size * 0.08;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(g, mesh(new THREE.BoxGeometry(t, size * 1.02, t), dm, { pos: [sx * size * 0.46, size / 2, sz * size * 0.46] }));
  for (const y of [0.04, 0.96]) { add(g, mesh(new THREE.BoxGeometry(size * 1.02, t, size * 1.02), dm, { pos: [0, y * size, 0] })); }
  return g;
}
export function barrel(size = 1) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(0.4 * size, 0.4 * size, 0.9 * size, 10), new THREE.MeshStandardMaterial({ map: tex.planks(2, 1), roughness: 0.9 }), { pos: [0, 0.45 * size, 0] }));
  for (const y of [0.2, 0.7]) add(g, mesh(new THREE.TorusGeometry(0.41 * size, 0.025 * size, 5, 14), mat(0x555555, { metalness: 0.5 }), { pos: [0, y * size, 0], rot: [Math.PI / 2, 0, 0] }));
  return g;
}
export function sack(size = 1, color = 0xc9b080) {
  const g = G(); add(g, mesh(new THREE.SphereGeometry(0.4 * size, 8, 6), mat(color), { pos: [0, 0.32 * size, 0], scale: [1, 0.9, 0.9] })); add(g, mesh(new THREE.ConeGeometry(0.15 * size, 0.2 * size, 6), mat(color), { pos: [0, 0.68 * size, 0] })); return g;
}
export function fence(len = 3, h = 0.9) {
  const g = G(); const m = mat(0x9b7348);
  const n = Math.max(2, Math.round(len / 1.0) + 1);
  for (let i = 0; i < n; i++) add(g, mesh(new THREE.BoxGeometry(0.14, h, 0.14), m, { pos: [-len / 2 + i * len / (n - 1), h / 2, 0] }));
  for (const y of [0.35, 0.7]) add(g, mesh(new THREE.BoxGeometry(len, 0.09, 0.07), m, { pos: [0, y * h / 0.9, 0] }));
  return g;
}
export function torch(color = 0xffa030) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.2, 6), mat(0x5b3d24), { pos: [0, 0.6, 0] }));
  add(g, mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.15, 6), mat(0x333333), { pos: [0, 1.22, 0] }));
  const f = mesh(new THREE.ConeGeometry(0.1, 0.3, 6), new THREE.MeshBasicMaterial({ color }), { cast: false, pos: [0, 1.45, 0] }); g.add(f); g.userData.flame = f;
  const l = new THREE.PointLight(color, 1.2, 9, 1.6); l.position.set(0, 1.6, 0); g.add(l); g.userData.light = l;
  return g;
}
export function lampPost(color = 0xffd27a) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 6), mat(0x2e2e3a, { metalness: 0.5 }), { pos: [0, 1.3, 0] }));
  add(g, mesh(new THREE.BoxGeometry(0.34, 0.4, 0.34), glow(color, 1.8), { cast: false, pos: [0, 2.75, 0] }));
  add(g, mesh(new THREE.ConeGeometry(0.28, 0.2, 4), mat(0x2e2e3a), { pos: [0, 3.05, 0], rot: [0, Math.PI / 4, 0] }));
  return g;
}
export function chest(open = false, color = 0x8a5a2b) {
  const g = G();
  add(g, mesh(new THREE.BoxGeometry(1, 0.55, 0.65), mat(color), { pos: [0, 0.28, 0] }));
  const lid = new THREE.Group(); lid.position.set(0, 0.55, -0.32); g.add(lid);
  lid.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 1, 8, 1, false, 0, Math.PI), mat(color), { pos: [0, 0, 0.32], rot: [0, 0, Math.PI / 2] }));
  add(g, mesh(new THREE.BoxGeometry(1.02, 0.1, 0.67), mat(0xe8c24a, { metalness: 0.6, roughness: 0.4 }), { pos: [0, 0.4, 0] }));
  add(g, mesh(new THREE.BoxGeometry(0.12, 0.16, 0.05), mat(0xe8c24a, { metalness: 0.6 }), { pos: [0, 0.5, 0.34] }));
  lid.rotation.x = open ? -1.8 : 0; g.userData.lid = lid;
  return g;
}
export function coin(r = 0.3) {
  const g = G();
  const m = mesh(new THREE.CylinderGeometry(r, r, r * 0.22, 14), glow(0xffcf3a, 0.6), { rot: [Math.PI / 2, 0, 0], pos: [0, r * 1.2, 0] });
  m.material = new THREE.MeshStandardMaterial({ color: 0xffcf3a, emissive: 0xffa500, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.25 });
  g.add(m);
  g.add(mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, r * 0.26, 14), new THREE.MeshStandardMaterial({ color: 0xffe680, metalness: 0.8, roughness: 0.3 }), { rot: [Math.PI / 2, 0, 0], pos: [0, r * 1.2, 0] }));
  g.userData.spin = m; return g;
}
export function gem(color = 0x58e0ff, r = 0.3) {
  const g = G();
  g.add(mesh(new THREE.OctahedronGeometry(r, 0), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.3, flatShading: true }), { pos: [0, r * 1.4, 0], scale: [0.8, 1.3, 0.8] }));
  return g;
}
export function crystal(color = 0x9d6bff, h = 1.6) {
  const g = G(); const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.2, transparent: true, opacity: 0.92, flatShading: true });
  add(g, mesh(new THREE.ConeGeometry(h * 0.22, h, 5), m, { pos: [0, h / 2, 0] }));
  add(g, mesh(new THREE.ConeGeometry(h * 0.14, h * 0.65, 5), m, { pos: [h * 0.22, h * 0.32, 0.05], rot: [0, 0, -0.35] }));
  add(g, mesh(new THREE.ConeGeometry(h * 0.12, h * 0.5, 5), m, { pos: [-h * 0.2, h * 0.25, 0.08], rot: [0, 0, 0.4] }));
  const l = new THREE.PointLight(color, 1.0, 10, 1.8); l.position.set(0, h * 0.6, 0); g.add(l);
  return g;
}
export function bread(kind = 'loaf') {
  const g = G(); const m = mat(0xd9954a, { flatShading: false });
  if (kind === 'loaf') { add(g, mesh(new THREE.CapsuleGeometry(0.16, 0.3, 4, 8), m, { pos: [0, 0.2, 0], rot: [0, 0, Math.PI / 2] })); for (let i = -1; i <= 1; i++) add(g, mesh(new THREE.BoxGeometry(0.03, 0.02, 0.2), mat(0xf0c070), { cast: false, pos: [i * 0.1, 0.35, 0], rot: [0, 0.5, 0] })); }
  else if (kind === 'bun') add(g, mesh(new THREE.SphereGeometry(0.22, 10, 8), m, { pos: [0, 0.2, 0], scale: [1, 0.75, 1] }));
  else if (kind === 'pretzel') add(g, mesh(new THREE.TorusKnotGeometry(0.14, 0.045, 24, 5, 2, 3), m, { pos: [0, 0.22, 0] }));
  else if (kind === 'croissant') add(g, mesh(new THREE.TorusGeometry(0.16, 0.08, 6, 10, Math.PI * 1.3), m, { pos: [0, 0.2, 0], rot: [Math.PI / 2, 0, 0] }));
  return g;
}
export function apple(color = 0xd83a2a) {
  const g = G(); add(g, mesh(new THREE.SphereGeometry(0.2, 10, 8), mat(color, { flatShading: false }), { pos: [0, 0.2, 0] })); add(g, mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.1, 4), mat(0x5b3d24), { pos: [0, 0.42, 0] })); add(g, mesh(new THREE.SphereGeometry(0.06, 5, 4), mat(0x3b9a45), { pos: [0.06, 0.42, 0], scale: [1.5, 0.4, 0.8] })); return g;
}
export function fish(color = 0x58a8e8) {
  const g = G(); const m = mat(color, { flatShading: false });
  add(g, mesh(new THREE.SphereGeometry(0.2, 10, 8), m, { scale: [1.8, 1, 0.7] }));
  add(g, mesh(new THREE.ConeGeometry(0.15, 0.25, 4), m, { pos: [-0.42, 0, 0], rot: [0, 0, Math.PI / 2] }));
  add(g, mesh(new THREE.SphereGeometry(0.035, 5, 4), mat(0x111111), { cast: false, pos: [0.25, 0.05, 0.1] }));
  return g;
}
export function cauldron(liquid = 0x7affb0) {
  const g = G();
  add(g, mesh(new THREE.SphereGeometry(0.8, 14, 10, 0, TAU, Math.PI * 0.2, Math.PI * 0.6), mat(0x2a2a30, { metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide, flatShading: false }), { pos: [0, 0.75, 0] }));
  add(g, mesh(new THREE.TorusGeometry(0.62, 0.07, 6, 18), mat(0x2a2a30, { metalness: 0.6 }), { pos: [0, 1.13, 0], rot: [Math.PI / 2, 0, 0] }));
  const l = mesh(new THREE.CircleGeometry(0.6, 16), new THREE.MeshStandardMaterial({ color: liquid, emissive: liquid, emissiveIntensity: 0.8 }), { cast: false, pos: [0, 1.05, 0], rot: [-Math.PI / 2, 0, 0] }); g.add(l); g.userData.liquid = l;
  for (const a of [0.8, 2.4, 4.0, 5.5]) add(g, mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), mat(0x2a2a30), { pos: [Math.cos(a) * 0.45, 0.15, Math.sin(a) * 0.45] }));
  return g;
}
export function signpost(texts = ['→'], h = 2.2) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(0.07, 0.09, h, 6), mat(0x6b4a2e), { pos: [0, h / 2, 0] }));
  texts.forEach((t, i) => {
    const p = mesh(new THREE.BoxGeometry(1.5, 0.4, 0.06), new THREE.MeshStandardMaterial({ map: tex.sign(t, { w: 256, h: 64, size: 28, bg: '#8a6238' }), roughness: 0.9 }), { pos: [0.5, h - 0.3 - i * 0.5, 0.0], rot: [0, (i % 2 ? -0.15 : 0.15), 0] });
    g.add(p);
  });
  return g;
}
export function banner(color = 0xd8372c, h = 2.4, w = 0.8, emblem = null) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(0.04, 0.05, h + 0.4, 6), mat(0x5b3d24), { pos: [0, (h + 0.4) / 2, 0] }));
  const cloth = mesh(new THREE.PlaneGeometry(w, h * 0.6, 4, 6), mat(color, { side: THREE.DoubleSide, flatShading: false }), { pos: [w / 2 + 0.05, h * 0.78, 0] });
  g.add(cloth); g.userData.cloth = cloth;
  g.userData.base = cloth.geometry.attributes.position.array.slice();
  return g;
}
export function animateBanner(g, t) {
  const c = g.userData.cloth; if (!c) return; const p = c.geometry.attributes.position, b = g.userData.base;
  for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.setZ(i, Math.sin(t * 3 + x * 4) * 0.08 * (x + 0.4)); }
  p.needsUpdate = true;
}
export function door(w = 1.2, h = 2.2, color = 0x6b4226) {
  // Pivot links; draai g.userData.leaf.rotation.y om te openen
  const g = G();
  add(g, mesh(new THREE.BoxGeometry(w + 0.3, h + 0.2, 0.2), mat(0x3d2a18), { pos: [0, h / 2 + 0.05, -0.1] }));
  add(g, mesh(new THREE.BoxGeometry(w, h, 0.08), new THREE.MeshStandardMaterial({ color: 0x050403 }), { pos: [0, h / 2, -0.02] })); // donkere opening
  const leaf = new THREE.Group(); leaf.position.set(-w / 2, 0, 0.02); g.add(leaf);
  const slab = mesh(new THREE.BoxGeometry(w, h, 0.09), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#' + new THREE.Color(color).getHexString()), roughness: 0.9 }), { pos: [w / 2, h / 2, 0.05] }); leaf.add(slab);
  leaf.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), mat(0xe8c24a, { metalness: 0.7 }), { pos: [w * 0.85, h * 0.48, 0.12] }));
  leaf.userData.dynamic = true; g.userData.leaf = leaf; g.userData.w = w; g.userData.h = h;
  return g;
}
export function windmill(scale = 1) {
  const g = G();
  add(g, mesh(new THREE.CylinderGeometry(1.5 * scale, 2.2 * scale, 6 * scale, 8), new THREE.MeshStandardMaterial({ map: tex.plaster(2, 2, '#f1e5c6'), roughness: 0.9, flatShading: true }), { pos: [0, 3 * scale, 0] }));
  add(g, mesh(new THREE.ConeGeometry(2 * scale, 2 * scale, 8), mat(0xb5483a), { pos: [0, 7 * scale, 0] }));
  add(g, mesh(new THREE.BoxGeometry(1 * scale, 1.6 * scale, 0.2), mat(0x5b3d24), { pos: [0, 0.8 * scale, 2.15 * scale] }));
  const hub = new THREE.Group(); hub.position.set(0, 6 * scale, 2 * scale); g.add(hub);
  hub.add(mesh(new THREE.CylinderGeometry(0.3 * scale, 0.3 * scale, 0.6, 8), mat(0x5b3d24), { rot: [Math.PI / 2, 0, 0] }));
  for (let i = 0; i < 4; i++) { const a = new THREE.Group(); a.rotation.z = i * Math.PI / 2; hub.add(a); a.add(mesh(new THREE.BoxGeometry(0.2 * scale, 4.5 * scale, 0.1), mat(0x5b3d24), { pos: [0, 2.3 * scale, 0.2] })); a.add(mesh(new THREE.BoxGeometry(1.0 * scale, 3.2 * scale, 0.05), mat(0xf4efe0), { pos: [0.55 * scale, 2.6 * scale, 0.26] })); }
  hub.userData.dynamic = true; g.userData.blades = hub; return g;
}
export function houseSimple(w = 5, d = 5, h = 3, { wall = '#efe2c4', roof = '#b5483a', thatch = false, doorColor = 0x6b4226 } = {}) {
  const g = G();
  add(g, mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex.plaster(w / 2, h / 2, wall), roughness: 0.95, flatShading: true }), { pos: [0, h / 2, 0] }));
  // houtskelet
  const beam = mat(0x4a3220);
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) add(g, mesh(new THREE.BoxGeometry(0.22, h, 0.22), beam, { pos: [x, h / 2, z] }));
  add(g, mesh(new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1), beam, { pos: [0, h, 0] }));
  add(g, mesh(new THREE.BoxGeometry(w + 0.1, 0.18, d + 0.1), beam, { pos: [0, 0.1, 0] }));
  // dak
  const rh = Math.max(1.6, w * 0.45);
  const rm = new THREE.MeshStandardMaterial({ map: thatch ? tex.thatch(2, 2) : tex.roof(3, 2, roof), roughness: 0.95, flatShading: true });
  const shape = new THREE.Shape(); shape.moveTo(-w / 2 - 0.5, 0); shape.lineTo(0, rh); shape.lineTo(w / 2 + 0.5, 0); shape.lineTo(-w / 2 - 0.5, 0);
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: d + 1.0, bevelEnabled: false });
  const roofMesh = mesh(roofGeo, rm, { pos: [0, h + 0.1, -d / 2 - 0.5] });
  g.add(roofMesh);
  // schoorsteen
  add(g, mesh(new THREE.BoxGeometry(0.6, 1.6, 0.6), mat(0x8a7a6a), { pos: [w * 0.25, h + rh * 0.7, -d * 0.2] }));
  // deur + ramen
  const dr = door(1.1, 2.0, doorColor); dr.position.set(0, 0.05, d / 2 + 0.02); g.add(dr); g.userData.door = dr;
  for (const sx of [-1, 1]) {
    const win = new THREE.Group(); win.position.set(sx * w * 0.32, h * 0.58, d / 2 + 0.02);
    win.add(mesh(new THREE.BoxGeometry(0.9, 0.9, 0.08), beam));
    win.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 0.1), glow(0xffd27a, 0.6), { cast: false }));
    win.add(mesh(new THREE.BoxGeometry(0.06, 0.74, 0.12), beam)); win.add(mesh(new THREE.BoxGeometry(0.74, 0.06, 0.12), beam));
    g.add(win); (g.userData.windows ||= []).push(win.children[1]);
  }
  g.userData.size = { w, d, h };
  return g;
}
export function tower(h = 12, r = 2.2) {
  const g = G(); const sm = new THREE.MeshStandardMaterial({ map: tex.stone(2, h / 3), roughness: 0.95, flatShading: true });
  add(g, mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 10), sm, { pos: [0, h / 2, 0] }));
  add(g, mesh(new THREE.CylinderGeometry(r * 1.25, r, 1.2, 10), sm, { pos: [0, h + 0.6, 0] }));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; add(g, mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), sm, { pos: [Math.cos(a) * r * 1.2, h + 1.6, Math.sin(a) * r * 1.2] })); }
  add(g, mesh(new THREE.ConeGeometry(r * 1.4, 3.5, 10), mat(0x3b58a8), { pos: [0, h + 3.2, 0] }));
  return g;
}
export function well() {
  const g = G(); const sm = mat(0x9b9ca3);
  add(g, mesh(new THREE.CylinderGeometry(1, 1.1, 0.9, 10), sm, { pos: [0, 0.45, 0] }));
  add(g, mesh(new THREE.CircleGeometry(0.85, 12), new THREE.MeshStandardMaterial({ color: 0x2c6fb0, emissive: 0x103050 }), { cast: false, pos: [0, 0.8, 0], rot: [-Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) add(g, mesh(new THREE.BoxGeometry(0.14, 2, 0.14), mat(0x6b4a2e), { pos: [sx * 0.95, 1.7, 0] }));
  add(g, mesh(new THREE.BoxGeometry(2.5, 0.12, 0.2), mat(0x6b4a2e), { pos: [0, 2.6, 0] }));
  add(g, mesh(new THREE.ConeGeometry(1.7, 0.9, 4), mat(0xb5483a), { pos: [0, 3.1, 0], rot: [0, Math.PI / 4, 0], scale: [1.4, 1, 0.8] }));
  return g;
}
export function campfire() {
  const g = G();
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; add(g, mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 5), mat(0x4a3220), { pos: [Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3], rot: [Math.sin(a) * 1.0, 0, -Math.cos(a) * 1.0] })); add(g, mesh(new THREE.DodecahedronGeometry(0.14), mat(0x777777), { pos: [Math.cos(a) * 0.65, 0.08, Math.sin(a) * 0.65] })); }
  const f = mesh(new THREE.ConeGeometry(0.28, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 }), { cast: false, pos: [0, 0.55, 0] }); g.add(f);
  const f2 = mesh(new THREE.ConeGeometry(0.16, 0.55, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 }), { cast: false, pos: [0, 0.45, 0] }); g.add(f2);
  g.userData.flame = f; g.userData.flame2 = f2;
  const l = new THREE.PointLight(0xff9a40, 2.2, 14, 1.5); l.position.set(0, 1, 0); g.add(l); g.userData.light = l;
  return g;
}
export function animateFire(g, t) {
  if (g.userData.flame) { const s = 1 + Math.sin(t * 13) * 0.12 + Math.sin(t * 7.3) * 0.08; g.userData.flame.scale.set(1, s, 1); g.userData.flame.rotation.y = t * 2; }
  if (g.userData.flame2) g.userData.flame2.scale.set(1, 1 + Math.sin(t * 17 + 1) * 0.15, 1);
  if (g.userData.light) g.userData.light.intensity = (g.userData.light.userData.base ??= g.userData.light.intensity) * (0.85 + Math.sin(t * 11) * 0.1 + Math.random() * 0.05);
}
export function hammer(color = 0x9a9a9a) {
  const g = G(); add(g, mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6), mat(0x8a5a2b), { pos: [0, 0.35, 0] })); add(g, mesh(new THREE.BoxGeometry(0.4, 0.22, 0.22), mat(color, { metalness: 0.6, roughness: 0.4 }), { pos: [0, 0.72, 0] })); return g;
}
export function sword() {
  const g = G(); add(g, mesh(new THREE.BoxGeometry(0.08, 0.8, 0.02), mat(0xdfe4ee, { metalness: 0.8, roughness: 0.2 }), { pos: [0, 0.55, 0] })); add(g, mesh(new THREE.BoxGeometry(0.3, 0.06, 0.06), mat(0xe8c24a, { metalness: 0.6 }), { pos: [0, 0.15, 0] })); add(g, mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5), mat(0x5b3d24), { pos: [0, 0.02, 0] })); return g;
}
export function bucket() {
  const g = G(); add(g, mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.4, 10, 1, true), mat(0x9b7348, { side: THREE.DoubleSide }), { pos: [0, 0.2, 0] })); add(g, mesh(new THREE.CircleGeometry(0.2, 10), mat(0x7a5530), { pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] })); add(g, mesh(new THREE.TorusGeometry(0.26, 0.015, 4, 10, Math.PI), mat(0x555555), { pos: [0, 0.4, 0] })); return g;
}
export function bridge(len = 8, w = 3) {
  const g = G(); const wm = new THREE.MeshStandardMaterial({ map: tex.planks(len / 2, 1), roughness: 0.9 });
  add(g, mesh(new THREE.BoxGeometry(len, 0.25, w), wm, { pos: [0, 0.4, 0] }));
  for (const sz of [-1, 1]) { add(g, mesh(new THREE.BoxGeometry(len, 0.1, 0.12), mat(0x5b3d24), { pos: [0, 1.25, sz * (w / 2 - 0.1)] })); for (let i = 0; i <= 4; i++) add(g, mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), mat(0x5b3d24), { pos: [-len / 2 + 0.2 + i * (len - 0.4) / 4, 0.85, sz * (w / 2 - 0.1)] })); }
  return g;
}
export function cloud(size = 1) {
  const g = G(); const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92, fog: false });
  for (const [x, y, z, r] of [[0, 0, 0, 1.4], [1.3, -0.2, 0.2, 1.1], [-1.3, -0.25, 0, 1.0], [0.4, 0.5, 0, 1.0], [2.2, -0.4, 0, 0.7], [-2.1, -0.4, 0, 0.7]]) add(g, mesh(new THREE.IcosahedronGeometry(r * size, 1), m, { cast: false, receive: false, pos: [x * size, y * size, z * size], scale: [1, 0.7, 1] }));
  return g;
}
export function shadowBlob(r = 0.5) {
  const t = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  return mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0] });
}
// grote platte vloer met textuur
export function floor(w, d, texture, y = 0) {
  return mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: texture, roughness: 1 }), { cast: false, pos: [0, y, 0], rot: [-Math.PI / 2, 0, 0] });
}
