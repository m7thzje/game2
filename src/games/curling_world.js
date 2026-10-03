import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, TAU, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { mergeStatic } from '../world/merge.js';

// Wereld van "Curling-Chaos": een ijsvloer in een bevroren zee, sneeuwbanken, pinguïn-publiek, scorebord, dieren (ijsbeer, pinguïn, zeehond).
// De baan loopt langs de z-as: werpen vanaf de hack (z = +HACK) richting het huis (z = HZ); de camera staat aan de hack-kant.

export const SH = { HW: 5.5, Z0: 13.2, Z1: -13.2, HACK: 10, HZ: -7.5, HOG: 1.0, HR: 3.9, BACK: -12.2, SR: 0.68 };

function iceTexture() {
  const W = 704, H = 1690, k = 64;      // 64 px per wereld-eenheid
  return canvasTex(W, H, (g, w, h) => {
    const r = mulberry32(11);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#e6f7ff'); gr.addColorStop(0.5, '#cdeeff'); gr.addColorStop(1, '#b9e4fb'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${0.06 + r() * 0.14})`; g.beginPath(); g.ellipse(r() * w, r() * h, 20 + r() * 90, 5 + r() * 24, r() * 3, 0, TAU); g.fill(); }
    g.lineCap = 'round';
    for (let i = 0; i < 90; i++) { g.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.4})`; g.lineWidth = 1 + r() * 2; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let q = 0; q < 5; q++) { x += (r() - 0.5) * 40; y += 40 + r() * 100; g.lineTo(x, y); } g.stroke(); }
    const zy = (z) => (z - SH.Z1) * k, cx = w / 2;   // bovenkant van de canvas = achterkant van de baan (-z)
    // huis
    const hy = zy(SH.HZ);
    const ring = (rad, col) => { g.fillStyle = col; g.beginPath(); g.arc(cx, hy, rad * k, 0, TAU); g.fill(); };
    ring(SH.HR, '#3a78e0'); ring(SH.HR * 0.68, '#f6fbff'); ring(SH.HR * 0.36, '#e5484d'); ring(SH.HR * 0.13, '#f6fbff');
    g.strokeStyle = 'rgba(20,40,90,.5)'; g.lineWidth = 3; for (const f of [1, 0.68, 0.36, 0.13]) { g.beginPath(); g.arc(cx, hy, SH.HR * f * k, 0, TAU); g.stroke(); }
    // lijnen: middenlijn, tee-lijn, hog-lijn (rood), achterlijn, hack-lijn
    g.strokeStyle = 'rgba(20,40,90,.45)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx, zy(SH.HACK + 2)); g.lineTo(cx, zy(SH.Z1 + 0.6)); g.moveTo(cx - SH.HR * k * 1.15, hy); g.lineTo(cx + SH.HR * k * 1.15, hy); g.stroke();
    g.strokeStyle = 'rgba(229,72,77,.85)'; g.lineWidth = 12; g.beginPath(); g.moveTo(0, zy(SH.HOG)); g.lineTo(w, zy(SH.HOG)); g.stroke();
    g.strokeStyle = 'rgba(58,120,224,.8)'; g.lineWidth = 8; g.beginPath(); g.moveTo(0, zy(SH.BACK)); g.lineTo(w, zy(SH.BACK)); g.stroke();
    g.fillStyle = 'rgba(40,40,60,.55)'; for (const sx of [-0.45, 0.45]) { g.beginPath(); g.roundRect(cx + sx * k - 16, zy(SH.HACK + 0.9) - 6, 32, 12, 4); g.fill(); }
    // snuisterijen: sneeuwvlok bij de hack
    g.save(); g.translate(cx, zy(SH.HACK + 1.9)); g.strokeStyle = 'rgba(80,140,210,.45)'; g.lineWidth = 6; for (let q = 0; q < 6; q++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -70); g.moveTo(0, -40); g.lineTo(18, -58); g.moveTo(0, -40); g.lineTo(-18, -58); g.stroke(); } g.restore();
  });
}
const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

// ---- steen (graniet + gekleurde handgreep) ----
export function makeStone(r = SH.SR) {
  const g = new THREE.Group(); const pts = [[0.0, 0.0], [0.8, 0.0], [1.0, 0.12], [1.0, 0.3], [0.85, 0.5], [0.45, 0.58], [0.0, 0.58]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: 0x8e939c, roughness: 0.55, metalness: 0.1 })); body.castShadow = true; g.add(body);
  const band = mesh(new THREE.CylinderGeometry(1.01, 1.01, 0.1, 20), mat(0x4e525c, { flatShading: false }), { cast: false, pos: [0, 0.2, 0] }); g.add(band);
  const hm = new THREE.MeshStandardMaterial({ color: 0x35c46f, roughness: 0.4, emissive: 0x000000 });
  const handle = new THREE.Group(); handle.position.y = 0.58;
  handle.add(mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.14, 14), hm, { cast: false, pos: [0, 0.07, 0] }), mesh(new THREE.BoxGeometry(0.95, 0.12, 0.2), hm, { cast: false, pos: [0, 0.2, 0] }), mesh(new THREE.SphereGeometry(0.14, 8, 6), hm, { cast: false, pos: [0.48, 0.2, 0] }), mesh(new THREE.SphereGeometry(0.14, 8, 6), hm, { cast: false, pos: [-0.48, 0.2, 0] }));
  g.add(handle);
  // bom-lont (alleen zichtbaar bij bomsteen)
  const fuse = new THREE.Group(); fuse.visible = false; fuse.position.y = 0.95;
  fuse.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 5), mat(0x3a2a1a), { cast: false, pos: [0, 0.0, 0] }), mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffa020 }), { cast: false, pos: [0, 0.32, 0] }));
  g.add(fuse);
  g.scale.set(r, r, r);
  return { g, body, handle, hm, fuse, bodyMat: body.material };
}

export function makeBroom() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 5), mat(0x8a5a2b), { cast: false, pos: [0, 0.75, 0] }));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), mat(0xe8c24a), { cast: false, pos: [0, 0.02, 0] }));
  return g;
}

// ---- dieren ----
const mk = (geo, color, o = {}) => mesh(geo, mat(color, { flatShading: false }), { cast: false, ...o });
export function makePenguin() {
  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  body.add(mk(new THREE.SphereGeometry(0.42, 12, 10), 0x16181f, { pos: [0, 0.6, 0], scale: [1, 1.35, 0.9] }), mk(new THREE.SphereGeometry(0.34, 10, 8), 0xf4f6fa, { pos: [0, 0.55, 0.12], scale: [1, 1.3, 0.8] }));
  const head = new THREE.Group(); head.position.set(0, 1.28, 0.02); body.add(head);
  head.add(mk(new THREE.SphereGeometry(0.27, 12, 10), 0x16181f), mk(new THREE.ConeGeometry(0.08, 0.24, 5), 0xf2a33a, { pos: [0, -0.03, 0.3], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) { head.add(mk(new THREE.SphereGeometry(0.07, 6, 5), 0xffffff, { pos: [sx * 0.11, 0.07, 0.22] }), mk(new THREE.SphereGeometry(0.035, 5, 4), 0x000000, { pos: [sx * 0.11, 0.07, 0.27] })); }
  const fl = [];
  for (const sx of [-1, 1]) { const f = mk(new THREE.SphereGeometry(0.16, 6, 5), 0x16181f, { pos: [sx * 0.42, 0.7, 0], scale: [0.35, 1.5, 0.8] }); f.rotation.z = -sx * 0.4; body.add(f); fl.push(f); body.add(mk(new THREE.BoxGeometry(0.2, 0.06, 0.3), 0xf2a33a, { pos: [sx * 0.17, 0.03, 0.12] })); }
  g.userData = { body, head, fl, dynamic: true }; return g;
}
export function makeBear() {
  const g = new THREE.Group(); const fur = 0xf4f8ff; const body = new THREE.Group(); g.add(body);
  body.add(mk(new THREE.SphereGeometry(0.8, 14, 10), fur, { pos: [0, 0.95, 0], scale: [1, 0.85, 1.45] }));
  const head = new THREE.Group(); head.position.set(0, 1.25, 1.05); body.add(head);
  head.add(mk(new THREE.SphereGeometry(0.46, 12, 10), fur), mk(new THREE.SphereGeometry(0.24, 10, 8), 0xe9eef8, { pos: [0, -0.1, 0.38], scale: [1, 0.8, 1.1] }), mk(new THREE.SphereGeometry(0.1, 8, 6), 0x181820, { pos: [0, -0.02, 0.6] }));
  for (const sx of [-1, 1]) head.add(mk(new THREE.SphereGeometry(0.15, 8, 6), fur, { pos: [sx * 0.34, 0.4, -0.06] }), mk(new THREE.SphereGeometry(0.06, 6, 5), 0x181820, { pos: [sx * 0.17, 0.12, 0.4] }));
  const legs = [];
  for (const [x, z] of [[0.38, 0.55], [-0.38, 0.55], [0.38, -0.55], [-0.38, -0.55]]) { const l = new THREE.Group(); l.position.set(x, 0.55, z); l.add(mk(new THREE.CylinderGeometry(0.2, 0.22, 0.6, 8), fur, { pos: [0, -0.28, 0] })); body.add(l); legs.push(l); }
  g.userData = { body, head, legs, dynamic: true }; return g;
}
export function makeSeal() {
  const g = new THREE.Group(); const sk = 0x8a8f9c; const body = new THREE.Group(); g.add(body);
  body.add(mk(new THREE.SphereGeometry(0.7, 14, 10), sk, { pos: [0, 0.5, 0], scale: [1, 1.5, 1] }));
  const head = new THREE.Group(); head.position.set(0, 1.55, 0.12); body.add(head);
  head.add(mk(new THREE.SphereGeometry(0.44, 12, 10), sk), mk(new THREE.SphereGeometry(0.2, 8, 6), 0xc8ccd6, { pos: [0, -0.12, 0.36], scale: [1.2, 0.8, 0.8] }), mk(new THREE.SphereGeometry(0.1, 8, 6), 0x181820, { pos: [0, 0.0, 0.52] }));
  for (const sx of [-1, 1]) {
    head.add(mk(new THREE.SphereGeometry(0.1, 8, 6), 0xffffff, { pos: [sx * 0.19, 0.12, 0.36] }), mk(new THREE.SphereGeometry(0.05, 6, 5), 0x000000, { pos: [sx * 0.19, 0.12, 0.44] }));
    for (let k = 0; k < 3; k++) head.add(mk(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 3), 0xffffff, { pos: [sx * 0.32, -0.12 + k * 0.05, 0.5], rot: [0, 0, Math.PI / 2 + (k - 1) * 0.2] }));
  }
  const fl = []; for (const sx of [-1, 1]) { const f = mk(new THREE.SphereGeometry(0.2, 8, 6), 0x70747f, { pos: [sx * 0.72, 0.8, 0.1], scale: [1.4, 0.3, 0.8] }); body.add(f); fl.push(f); }
  g.userData = { body, head, fl, dynamic: true }; return g;
}
export function makeHill() {
  const g = new THREE.Group(); const snow = new THREE.MeshStandardMaterial({ map: tex.snow(3, 3), roughness: 0.8, color: 0xffffff });
  g.add(mesh(new THREE.SphereGeometry(1, 20, 12, 0, TAU, 0, Math.PI / 2), snow, { cast: true, scale: [1, 0.42, 1] }));
  g.add(mesh(new THREE.TorusGeometry(1.0, 0.07, 6, 28), new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x58b8ff, emissiveIntensity: 0.5 }), { cast: false, pos: [0, 0.03, 0], rot: [Math.PI / 2, 0, 0] }));
  // een sneeuwpopje op de top
  const sm = mat(0xffffff, { flatShading: false });
  g.add(mesh(new THREE.SphereGeometry(0.17, 10, 8), sm, { pos: [0, 0.5, 0] }), mesh(new THREE.SphereGeometry(0.11, 10, 8), sm, { pos: [0, 0.72, 0] }), mesh(new THREE.ConeGeometry(0.03, 0.14, 5), mat(0xf28a1c), { cast: false, pos: [0, 0.72, 0.12], rot: [Math.PI / 2, 0, 0] }), mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8), mat(0x222233), { cast: false, pos: [0, 0.84, 0] }));
  g.userData.dynamic = true; return g;
}
export function makeHole() {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x0c3a78 }), { cast: false, receive: false, pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.RingGeometry(1.0, 1.25, 24), new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.9 }), { cast: false, receive: false, pos: [0, 0.035, 0], rot: [-Math.PI / 2, 0, 0] }));
  g.userData.dynamic = true; return g;
}

export function buildWorld(ctx) {
  const { scene, fx } = ctx; const rng = mulberry32(31337); const W = { penguins: [], clouds: [] };
  const first = scene.children.length;
  const { HW, Z0, Z1 } = SH; const len = Z0 - Z1;
  // zee
  scene.add(mesh(new THREE.PlaneGeometry(300, 260), new THREE.MeshStandardMaterial({ map: tex.water(30, 26), color: 0x4f9ad6, roughness: 0.3, metalness: 0.1 }), { cast: false, pos: [0, -0.6, -20], rot: [-Math.PI / 2, 0, 0] }));
  // ijsvloer (bovenkant met huis-textuur)
  const topM = new THREE.MeshStandardMaterial({ map: iceTexture(), roughness: 0.08, metalness: 0.12 }), sideM = new THREE.MeshStandardMaterial({ color: 0xa8dcf6, roughness: 0.3 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * HW, 0.7, len), [sideM, sideM, topM, sideM, sideM, sideM]); slab.position.set(0, -0.35, (Z0 + Z1) / 2); slab.receiveShadow = true; scene.add(slab);
  // sneeuwbanken: gevulde, ronde randen
  const snowM = new THREE.MeshStandardMaterial({ map: tex.snow(1, 8), roughness: 0.9, color: 0xffffff });
  for (const sx of [-1, 1]) {
    scene.add(mesh(new THREE.CapsuleGeometry(0.62, len - 1.4, 6, 12).rotateX(Math.PI / 2), snowM, { pos: [sx * (HW + 0.55), 0.3, (Z0 + Z1) / 2], scale: [1, 1.0, 1] }));
    scene.add(mesh(new THREE.CapsuleGeometry(0.28, len - 1.2, 5, 8).rotateX(Math.PI / 2), mat(0xe05050, { flatShading: false }), { cast: false, pos: [sx * (HW - 0.02), 0.22, (Z0 + Z1) / 2] }));
  }
  scene.add(mesh(new THREE.CapsuleGeometry(0.62, 2 * HW - 0.4, 6, 12).rotateZ(Math.PI / 2), snowM, { pos: [0, 0.3, Z0 + 0.5] }));
  // ijsschotsen in het water
  for (let i = 0; i < 26; i++) { const a = rng(), x = (rng() < 0.5 ? -1 : 1) * (HW + 3 + rng() * 40), z = Z0 - rng() * 70; const s = 1.2 + rng() * 3.2; scene.add(mesh(new THREE.CylinderGeometry(s, s * 1.1, 0.6, 5 + Math.floor(a * 3)), mat(0xe8f6ff), { cast: false, pos: [x, -0.4, z], rot: [0, rng() * 3, 0] })); }
  for (let i = 0; i < 8; i++) { const x = (rng() - 0.5) * 18, z = Z1 - 3 - rng() * 14, s = 1.5 + rng() * 2.5; scene.add(mesh(new THREE.CylinderGeometry(s, s * 1.1, 0.6, 6), mat(0xe8f6ff), { cast: false, pos: [x, -0.4, z] })); }
  // sneeuwterrassen met toeschouwers (penguins) langs de zijkanten
  const terr = new THREE.MeshStandardMaterial({ map: tex.snow(4, 2), roughness: 1 });
  for (const sx of [-1, 1]) for (let r = 0; r < 3; r++) {
    const w = 3.2; scene.add(mesh(new THREE.BoxGeometry(w, 0.8 + r * 0.9, 24), terr, { cast: false, pos: [sx * (HW + 3.0 + r * w), (0.8 + r * 0.9) / 2 - 0.5, 0.5] }));
  }
  // decor: dennen met sneeuw, rotsen, iglo's
  for (let i = 0; i < 24; i++) { const sx = i % 2 ? 1 : -1; const t = P.pine(5 + rng() * 5, 0x2c6a52, true); t.position.set(sx * (19 + rng() * 14), 1.6, 12 - rng() * 36); scene.add(t); }
  for (let i = 0; i < 8; i++) { const ig = new THREE.Group(); ig.add(mesh(new THREE.SphereGeometry(1.6, 14, 8, 0, TAU, 0, Math.PI / 2), mat(0xf4fbff, { flatShading: false }), { pos: [0, 0, 0] }), mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.4, 10, 1, false, 0, Math.PI).rotateZ(0), mat(0x20304a), { cast: false, pos: [0, 0.5, 1.4], rot: [0, 0, 0] })); ig.position.set((i % 2 ? 1 : -1) * (16 + rng() * 10), 0.6, -4 - (i >> 1) * 7); ig.rotation.y = (i % 2 ? -1 : 1) * 1.1; scene.add(ig); }
  // achtergrond: kasteel-torens, bergen
  const dist = [[-34, -48, 20], [-10, -52, 14], [14, -50, 17], [38, -46, 22], [0, -62, 26]];
  for (const [x, z, h] of dist) { const t = P.tower(h, 3.4); t.position.set(x, 0, z); scene.add(t); const b = P.banner(x % 2 ? 0x3a78e0 : 0xe5484d, 3, 1.5); b.position.set(x, h + 5.2, z); scene.add(b); (W.banners = W.banners || []).push(b); }
  scene.add(mesh(new THREE.BoxGeometry(100, 10, 3), new THREE.MeshStandardMaterial({ map: tex.stone(12, 2), roughness: 0.95, flatShading: true, color: 0xcfd6e0 }), { cast: false, pos: [0, 5, -48] }));
  [[-80, -100, 34], [-30, -120, 42], [40, -118, 38], [95, -90, 32]].forEach(([x, z, r]) => { scene.add(mesh(new THREE.ConeGeometry(r, r * 1.5, 7), mat(0x9fb4d8), { cast: false, receive: false, pos: [x, r * 0.75, z] })); scene.add(mesh(new THREE.ConeGeometry(r * 0.4, r * 0.62, 7), mat(0xffffff), { cast: false, receive: false, pos: [x, r * 1.25, z] })); });
  // lichtsnoer boven de baan
  for (const sx of [-1, 1]) for (let k = 0; k < 12; k++) { const z = 12 - k * 2.2; scene.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: [0xff6a6a, 0xffe14a, 0x6ad8ff, 0x8dff9a][k % 4] }), { cast: false, pos: [sx * (HW + 0.6), 4.6 - Math.sin(k / 11 * Math.PI) * -0.3, z] })); }
  for (const sx of [-1, 1]) for (const z of [12.5, 6, 0, -6, -12]) scene.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.8, 6), mat(0x6b4a2e), { cast: false, pos: [sx * (HW + 0.6), 2.4, z] }));
  mergeStatic(scene, first);

  // wolken
  for (let k = 0; k < 6; k++) { const c = P.cloud(2 + rng() * 2); c.position.set(-90 + k * 36 + rng() * 10, 36 + rng() * 14, -70 - rng() * 40); scene.add(c); W.clouds.push({ c, v: 0.5 + rng() * 0.6 }); }

  // publiek (penguins, geïnstancet)
  const N = 54;
  const body = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1a1c24, roughness: 0.7 }), N);
  const belly = new THREE.InstancedMesh(new THREE.SphereGeometry(0.34, 8, 6), new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.8 }), N);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1a1c24, roughness: 0.7 }), N);
  const beak = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.26, 5).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2a33a, roughness: 0.6 }), N);
  const scarf = new THREE.InstancedMesh(new THREE.TorusGeometry(0.3, 0.07, 5, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
  const cc = new THREE.Color(); const sc = [0xe5484d, 0xffd23f, 0x3a78e0, 0x6bd86b, 0xff8fc8, 0xb06bff];
  let ci = 0;
  for (const sx of [-1, 1]) for (let r = 0; r < 3; r++) for (let k = 0; k < 8; k++) {
    if (ci >= N - 6) break;
    const z = 9 - k * 2.9 + (r % 2) * 1.2 + (rng() - 0.5) * 0.5, x = sx * (HW + 2.8 + r * 3.2 + (rng() - 0.5) * 0.8), y = 0.8 + r * 0.9 - 0.5 + 0.35;
    W.penguins.push({ x, y, z, ph: rng() * 6, cheer: 0, face: -sx, s: 0.95 + rng() * 0.3 }); scarf.setColorAt(ci, cc.setHex(sc[Math.floor(rng() * sc.length)])); ci++;
  }
  for (let k = 0; ci < N; k++, ci++) { W.penguins.push({ x: -5.5 + k * 2.2, y: 0.1, z: Z1 - 1.8, ph: rng() * 6, cheer: 0, face: 0, s: 1.0 }); scarf.setColorAt(ci, cc.setHex(sc[k % sc.length])); }
  for (const m of [body, belly, head, beak, scarf]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
  const dm = new THREE.Object3D();
  W.updatePenguins = (t) => {
    W.penguins.forEach((q, i) => {
      const hop = q.cheer > 0 ? Math.abs(Math.sin(t * 9 + q.ph)) * 0.6 : Math.abs(Math.sin(t * 1.6 + q.ph)) * 0.05, y = q.y + 0.55 + hop, yaw = q.face > 0 ? Math.PI / 2 : q.face < 0 ? -Math.PI / 2 : 0; const s = q.s;
      const tilt = q.cheer > 0 ? Math.sin(t * 8 + q.ph) * 0.14 : 0;
      dm.position.set(q.x, y, q.z); dm.rotation.set(0, yaw, tilt); dm.scale.set(s, s * 1.4, s * 0.95); dm.updateMatrix(); body.setMatrixAt(i, dm.matrix);
      dm.scale.set(s, s * 1.3, s * 0.9); dm.position.set(q.x + Math.sin(yaw) * 0.2 * s, y - 0.04, q.z + Math.cos(yaw) * 0.2 * s); dm.updateMatrix(); belly.setMatrixAt(i, dm.matrix);
      dm.scale.set(s, s, s); dm.position.set(q.x, y + 0.72 * s, q.z); dm.updateMatrix(); head.setMatrixAt(i, dm.matrix);
      dm.position.set(q.x + Math.sin(yaw) * 0.3 * s, y + 0.7 * s, q.z + Math.cos(yaw) * 0.3 * s); dm.updateMatrix(); beak.setMatrixAt(i, dm.matrix);
      dm.position.set(q.x, y + 0.5 * s, q.z); dm.updateMatrix(); scarf.setMatrixAt(i, dm.matrix);
    });
    body.instanceMatrix.needsUpdate = belly.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = beak.instanceMatrix.needsUpdate = scarf.instanceMatrix.needsUpdate = true;
  };
  W.cheer = (secs, frac = 1) => { for (const q of W.penguins) if (Math.random() < frac) q.cheer = secs * (0.6 + Math.random() * 0.8); };
  W.tick = (dt) => { for (const q of W.penguins) q.cheer = Math.max(0, q.cheer - dt); };
  W.updatePenguins(0);

  // scorebord achter het huis
  const cv = document.createElement('canvas'); cv.width = 768; cv.height = 300; const g = cv.getContext('2d');
  const stex = new THREE.CanvasTexture(cv); stex.colorSpace = THREE.SRGBColorSpace;
  const sb = new THREE.Group(); sb.position.set(0, 3.9, Z1 - 2.6); sb.scale.setScalar(0.9); scene.add(sb);
  sb.add(mesh(new THREE.BoxGeometry(12.6, 4.9, 0.6), mat(0x2a3a6a, { metalness: 0.3 }), { cast: false }), mesh(new THREE.PlaneGeometry(12, 4.3), new THREE.MeshBasicMaterial({ map: stex, toneMapped: false }), { cast: false, receive: false, pos: [0, 0, 0.32] }));
  for (const dx of [-5.2, 5.2]) sb.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 8, 5), mat(0x6b4a2e), { cast: false, pos: [dx, -4, 0] }));
  W.board = (names, cols, ends, score, cur, endMul) => {
    g.fillStyle = '#0c1430'; g.fillRect(0, 0, 768, 300); g.strokeStyle = '#ffd86b'; g.lineWidth = 8; g.strokeRect(5, 5, 758, 290);
    g.textBaseline = 'middle'; g.textAlign = 'center';
    g.font = 'bold 34px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#cfe0ff'; g.fillText('CURLING-CHAOS', 384, 36);
    const x0 = 250, cw = 74; g.font = 'bold 28px Fredoka, Arial Black, sans-serif';
    for (let e = 0; e < 4; e++) { g.fillStyle = e === cur ? '#ffe14a' : '#8fa0c8'; g.fillText(e === 3 ? 'x2' : String(e + 1), x0 + e * cw + cw / 2, 82); }
    g.fillStyle = '#ffffff'; g.fillText('TOT', x0 + 4 * cw + 50, 82);
    for (let p = 0; p < 2; p++) {
      const y = 148 + p * 80; g.textAlign = 'left'; g.font = 'bold 44px Fredoka, Arial Black, sans-serif'; g.fillStyle = cols[p]; g.fillText(names[p], 24, y); g.textAlign = 'center';
      for (let e = 0; e < 4; e++) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x0 + e * cw + 4, y - 30, cw - 8, 60); const v = ends[e] ? ends[e][p] : null; if (v != null) { g.font = 'bold 44px Fredoka, Arial Black, sans-serif'; g.fillStyle = v > 0 ? cols[p] : '#6a7498'; g.fillText(String(v), x0 + e * cw + cw / 2, y); } }
      g.font = 'bold 62px Fredoka, Arial Black, sans-serif'; g.fillStyle = cols[p]; g.fillText(String(score[p]), x0 + 4 * cw + 50, y);
    }
    stex.needsUpdate = true;
  };
  W.board(['Wes', 'Jor'], ['#7dffb0', '#8fb8ff'], [], [0, 0], 0);

  W.update = (t, dt) => {
    for (const c of W.clouds) { c.c.position.x += c.v * dt; if (c.c.position.x > 110) c.c.position.x = -110; }
    if (W.banners) for (const b of W.banners) P.animateBanner(b, t);
    W.updatePenguins(t); W.tick(dt);
    if (Math.random() < dt * 14) fx.particles.emit((Math.random() - 0.5) * 70, 24, -30 + Math.random() * 60, (Math.random() - 0.5) * 0.4, -1.6 - Math.random(), 0, { life: 8, size: 0.14 + Math.random() * 0.1, color: 0xffffff, gravity: 0, shrink: false });
  };
  return W;
}
