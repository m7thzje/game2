import * as THREE from 'three';
import { mat, glow, mesh, canvasTex, mulberry32, TAU, lerp, clamp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving van "Handtekening-Jacht": een kermisplein met draaimolen in het midden, kraampjes, reuzenrad, ballonnen, lampjes en juichende kinderen.
export const AR = { X: 19.5, Z: 11 };          // halve speelveldgrootte
// cirkelvormige obstakels (symmetrisch): draaimolen, popcorn-karretjes, lantaarnpalen
export const OBS = [{ x: 0, z: 0, r: 3.0 },
  ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => ({ x: a * 13.5, z: b * 6.2, r: 1.25 })),
  ...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => ({ x: a * 7.2, z: b * 7.6, r: 0.5 }))];

function stripeTex(c1, c2, n = 6) {
  return canvasTex(128, 64, (g, w, h) => { const sw = w / n; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c2 : c1; g.fillRect(i * sw, 0, sw + 1, h); } g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, h - 10, w, 10); });
}
function floorTexture() {
  const W = 1344, H = 768; const r = mulberry32(31);
  return canvasTex(W, H, (g, w, h) => {
    g.fillStyle = '#ead7a8'; g.fillRect(0, 0, w, h);
    const sx = w / 44, sz = h / 25;   // pixels per wereld-eenheid
    // tegels
    const T = 48;
    for (let y = 0; y < h; y += T) for (let x = 0; x < w; x += T) { const v = ((x / T + y / T) & 1); g.fillStyle = v ? 'rgba(255,255,255,.14)' : 'rgba(150,110,60,.07)'; g.fillRect(x, y, T, T); }
    g.strokeStyle = 'rgba(120,90,50,.12)'; g.lineWidth = 2; for (let x = 0; x < w; x += T) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += T) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    // gekleurde ring rond de draaimolen
    g.save(); g.translate(w / 2, h / 2);
    for (let k = 0; k < 24; k++) { g.fillStyle = k % 2 ? 'rgba(255,90,120,.35)' : 'rgba(80,170,255,.35)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 5.2 * sx, k / 24 * TAU, (k + 1) / 24 * TAU); g.closePath(); g.fill(); }
    g.fillStyle = '#ead7a8'; g.beginPath(); g.arc(0, 0, 3.3 * sx, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120,60,150,.5)'; g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 5.2 * sx, 0, TAU); g.stroke(); g.restore();
    // rand-pad
    g.strokeStyle = 'rgba(200,70,70,.35)'; g.lineWidth = 14; g.strokeRect(1.2 * sx, 1.2 * sz, w - 2.4 * sx, h - 2.4 * sz);
    // confetti, sterretjes en krijt-handtekeningen
    for (let i = 0; i < 260; i++) { g.fillStyle = ['#ff6fa5', '#6fd8ff', '#ffe14a', '#8dff9a', '#c9a0ff'][i % 5]; g.globalAlpha = 0.5; g.fillRect(r() * w, r() * h, 6 + r() * 8, 3 + r() * 4); }
    g.globalAlpha = 0.3; g.lineWidth = 4; g.lineCap = 'round';
    for (let i = 0; i < 22; i++) { g.strokeStyle = ['#5a7ae0', '#e0558a', '#3aa88a'][i % 3]; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += 14 + r() * 14; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
    g.globalAlpha = 1;
  });
}

export function buildPlaza(ctx) {
  const { scene } = ctx; const A = {}; const r = mulberry32(11);
  // grond: speelveld + gras eromheen
  const grass = mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ map: tex.grass(30, 22), roughness: 1 }), { cast: false, pos: [0, -0.04, -6], rot: [-Math.PI / 2, 0, 0] }); scene.add(grass);
  const ground = mesh(new THREE.PlaneGeometry(44, 25), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.95 }), { cast: false, pos: [0, 0, 0], rot: [-Math.PI / 2, 0, 0] }); scene.add(ground);
  // hek rond het plein (snoepstrepen)
  const fenceTex = stripeTex('#ff5a7a', '#ffffff', 22); fenceTex.wrapS = THREE.RepeatWrapping;
  const fm = new THREE.MeshStandardMaterial({ map: fenceTex, roughness: 0.7 });
  const fb = (w, d, x, z) => scene.add(mesh(new THREE.BoxGeometry(w, 0.9, d), fm, { pos: [x, 0.45, z] }));
  fb(41.6, 0.35, 0, -AR.Z - 1.2); fb(41.6, 0.35, 0, AR.Z + 1.2); fb(0.35, 25, -AR.X - 1.2, 0); fb(0.35, 25, AR.X + 1.2, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) scene.add(mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.5, 8), mat(0xffd23f, { metalness: 0.4 }), { pos: [x * (AR.X + 1.2), 0.75, z * (AR.Z + 1.2)] }));

  // ---- kraampjes (achter en aan de zijkanten) ----
  const stallDef = [['POPCORN', '#e8452c', '#fff1d0'], ['KOEKJES', '#3a78e0', '#fff1d0'], ['BALLEN', '#2f9e5b', '#fff1d0'], ['LOTERIJ', '#8f4ad8', '#ffe14a'], ['SNOEP', '#e0458f', '#fff1d0'], ['FOTO', '#e0a82a', '#3a1a10'], ['DEURTJES', '#6b4226', '#ffe14a'], ['LIMO', '#2aa8a0', '#fff1d0']];
  const stall = (x, z, rot, k) => {
    const [name, c1, fg] = stallDef[k % stallDef.length]; const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot;
    g.add(mesh(new THREE.BoxGeometry(4.6, 2.2, 2.6), mat(new THREE.Color(c1).getHex(), { flatShading: false }), { pos: [0, 1.1, 0] }));
    g.add(mesh(new THREE.BoxGeometry(4.0, 0.14, 1.0), mat(0xf0e0c0), { pos: [0, 1.3, 1.6] }));
    const aw = mesh(new THREE.BoxGeometry(5.2, 0.14, 2.4), new THREE.MeshStandardMaterial({ map: stripeTex(c1, '#ffffff', 8), roughness: 0.8 }), { pos: [0, 3.0, 0.9], rot: [0.28, 0, 0] }); g.add(aw);
    for (const sd of [1, -1]) g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 6), mat(0xe8e0d0), { pos: [sd * 2.45, 1.5, 1.95] }));
    g.add(mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshBasicMaterial({ map: tex.sign(name, { bg: c1, fg, w: 256, h: 80, size: 40, font: 'Fredoka, Arial Black, sans-serif', border: '#ffffff' }) }), { cast: false, receive: false, pos: [0, 3.55, 0.3], rot: [-0.15, 0, 0] }));
    scene.add(g);
  };
  for (let k = 0; k < 7; k++) stall(-18 + k * 6, -15.2, 0, k);
  for (let k = 0; k < 2; k++) { stall(-24, -4 + k * 8, Math.PI / 2, k + 2); stall(24, -4 + k * 8, -Math.PI / 2, k + 5); }
  // bomen / struiken achter alles
  for (let k = 0; k < 14; k++) { const t = P.tree(5 + r() * 3, [0x3f9e3a, 0x2f8e4a, 0x58b04a][k % 3]); t.position.set(-36 + k * 5.6, 0, -22 - r() * 3); scene.add(t); }

  // ---- popcorn-karretjes en lantaarnpalen (obstakels) ----
  OBS.slice(1, 5).forEach((o, k) => {
    const g = new THREE.Group(); g.position.set(o.x, 0, o.z); g.rotation.y = o.x < 0 ? 0.5 : -0.5;
    g.add(mesh(new THREE.BoxGeometry(1.8, 1.0, 1.3), mat(0xd83a2a, { flatShading: false }), { pos: [0, 0.75, 0] }));
    g.add(mesh(new THREE.BoxGeometry(1.7, 0.8, 1.2), new THREE.MeshStandardMaterial({ color: 0xfff1c0, transparent: true, opacity: 0.6 }), { pos: [0, 1.65, 0] }));
    for (let i = 0; i < 9; i++) g.add(mesh(new THREE.SphereGeometry(0.14, 6, 5), mat(0xfff6d8), { cast: false, pos: [(i % 3 - 1) * 0.45, 1.45 + (i % 2) * 0.2, (Math.floor(i / 3) - 1) * 0.3] }));
    g.add(mesh(new THREE.ConeGeometry(1.4, 0.7, 8), new THREE.MeshStandardMaterial({ map: stripeTex('#ffd23f', '#e8452c', 8), flatShading: true }), { pos: [0, 2.35, 0] }));
    for (const sd of [1, -1]) g.add(mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.14, 10), mat(0x2a2a2a), { pos: [sd * 0.8, 0.33, 0.45], rot: [0, 0, Math.PI / 2] }));
    scene.add(g);
  });
  OBS.slice(5).forEach((o) => { const lp = P.lampPost(0xffe6a0); lp.position.set(o.x, 0, o.z); lp.scale.setScalar(1.15); scene.add(lp); });

  // ---- lampjes-slinger langs de achterhek en ballonnen ----
  const nb = 44, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), nb); const dm = new THREE.Object3D(); const bc = [0xffd23f, 0xff5a7a, 0x6fd8ff, 0x8dff9a];
  for (let k = 0; k < nb; k++) { const u = k / (nb - 1); dm.position.set(lerp(-AR.X - 1.2, AR.X + 1.2, u), 2.1 + Math.abs(Math.sin(u * Math.PI * 6)) * 0.35, -AR.Z - 1.2); dm.updateMatrix(); bulbs.setMatrixAt(k, dm.matrix); bulbs.setColorAt(k, new THREE.Color(bc[k % 4])); }
  scene.add(bulbs);
  const balN = 18, bal = new THREE.InstancedMesh(new THREE.SphereGeometry(0.62, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.4 }), balN); const balD = [];
  for (let k = 0; k < balN; k++) { const side = k % 3; const x = side === 0 ? -22 + r() * 44 : side === 1 ? -23.5 - r() * 3 : 23.5 + r() * 3; const z = side === 0 ? -13 - r() * 2 : -9 + r() * 22; balD.push({ x, z, y: 5 + r() * 4, ph: r() * TAU }); bal.setColorAt(k, new THREE.Color([0xff4a6a, 0xffd23f, 0x4ac8ff, 0x6fe87a, 0xc58aff][k % 5])); }
  bal.frustumCulled = false; scene.add(bal);

  // ---- draaimolen (draait) ----
  const car = new THREE.Group(); car.userData.dynamic = true; scene.add(car);
  car.add(mesh(new THREE.CylinderGeometry(3.0, 3.1, 0.5, 24), new THREE.MeshStandardMaterial({ map: stripeTex('#ffd23f', '#e8452c', 12), flatShading: true }), { pos: [0, 0.25, 0] }));
  car.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 4.2, 8), mat(0xe8e0d0), { pos: [0, 2.3, 0] }));
  const canopy = mesh(new THREE.ConeGeometry(3.6, 1.7, 16), new THREE.MeshStandardMaterial({ map: stripeTex('#8f4ad8', '#ffe14a', 8), flatShading: true }), { pos: [0, 4.9, 0] }); car.add(canopy);
  car.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), glow(0xffe14a, 1.4), { cast: false, pos: [0, 5.9, 0] }));
  const horses = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU, hg = new THREE.Group(); hg.position.set(Math.cos(a) * 2.25, 1.4, Math.sin(a) * 2.25); hg.rotation.y = -a;
    hg.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 5), mat(0xffd23f, { metalness: 0.6 }), { pos: [0, 0.9, 0] }));
    const col = [0xffffff, 0xff9ac8, 0x8fd8ff, 0xffe14a][k % 4];
    hg.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.4), mat(col), { pos: [0, 0, 0] }), mesh(new THREE.BoxGeometry(0.3, 0.55, 0.3), mat(col), { pos: [0.5, 0.3, 0], rot: [0, 0, -0.4] }), mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), mat(0x6a3a22), { pos: [0.15, -0.5, 0.1] }));
    for (const sd of [1, -1]) hg.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [0.64, 0.38, sd * 0.13] }));
    car.add(hg); horses.push(hg);
  }
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; car.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), glow([0xffd23f, 0xff5a7a, 0x6fd8ff][k % 3], 1.5), { cast: false, pos: [Math.cos(a) * 3.3, 4.1, Math.sin(a) * 3.3] })); }

  // ---- reuzenrad (draait traag) ----
  const wheel = new THREE.Group(); wheel.userData.dynamic = true; wheel.position.set(-13, 10.5, -25); scene.add(wheel);
  wheel.add(mesh(new THREE.TorusGeometry(9, 0.28, 6, 44), mat(0xe8e0d0, { flatShading: false }), { cast: false }));
  wheel.add(mesh(new THREE.TorusGeometry(4.5, 0.18, 6, 32), mat(0xffd23f, { flatShading: false }), { cast: false }));
  const gond = [];
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * TAU; if (k < 6) wheel.add(mesh(new THREE.BoxGeometry(18, 0.14, 0.14), mat(0xe8e0d0), { cast: false, rot: [0, 0, a] }));
    const gg = new THREE.Group(); gg.position.set(Math.cos(a) * 9, Math.sin(a) * 9, 0);
    gg.add(mesh(new THREE.BoxGeometry(1.5, 1.1, 1.3), mat([0xff4a6a, 0xffd23f, 0x4ac8ff, 0x6fe87a][k % 4]), { cast: false, pos: [0, -0.9, 0] }), mesh(new THREE.BoxGeometry(1.7, 0.15, 1.5), mat(0xffffff), { cast: false, pos: [0, -0.28, 0] }));
    wheel.add(gg); gond.push(gg);
  }
  const wl = new THREE.Group(); wl.position.set(-13, 0, -25);
  for (const sd of [1, -1]) wl.add(mesh(new THREE.BoxGeometry(0.6, 11.5, 0.6), mat(0x8a5a2e), { cast: false, pos: [sd * 3.6, 5.2, 0], rot: [0, 0, -sd * 0.35] }));
  scene.add(wl);
  wheel.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.2, 10), mat(0xffd23f, { metalness: 0.4 }), { cast: false, rot: [Math.PI / 2, 0, 0] }));

  // ---- juichende kinderen langs de hek ----
  A.kids = [];
  [[-16, 13.4], [-5, 13.6], [6, 13.4], [17, 13.6], [-23, 6], [23.5, -2]].forEach(([x, z], k) => {
    const c = makeNPC('kid', { shirt: [0xff6a8a, 0xffd23f, 0x4ac8ff, 0x6fe87a, 0xc58aff, 0xff9a3a][k], hair: [0x3a2a1a, 0xe8b84a, 0x7a4a24, 0x222222, 0xc0602a, 0x5a3a22][k] });
    c.group.position.set(x, 0, z); c.group.scale.setScalar(1.5); c.faceDir(x > 20 ? -1 : x < -20 ? 1 : 0, -1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(c.group); A.kids.push({ c, ph: r() * 6, cheer: 0 });
  });

  mergeStatic(scene, 0);   // alles wat niet beweegt samenvoegen
  A.cheer = (s = 2) => { for (const k of A.kids) k.cheer = s * (0.6 + Math.random() * 0.8); };
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), SC = new THREE.Vector3(1, 1, 1);
  A.update = (t, dt) => {
    car.rotation.y = t * 0.55; horses.forEach((h, k) => { h.position.y = 1.4 + Math.sin(t * 2.2 + k * 1.3) * 0.35; });
    wheel.rotation.z = -t * 0.06; gond.forEach((g) => { g.rotation.z = t * 0.06; });
    balD.forEach((b, k) => { V.set(b.x + Math.sin(t * 0.4 + b.ph) * 0.5, b.y + Math.sin(t * 0.8 + b.ph) * 0.4, b.z); M.compose(V, Q, SC); bal.setMatrixAt(k, M); }); bal.instanceMatrix.needsUpdate = true;
    for (const k of A.kids) { k.cheer = Math.max(0, k.cheer - dt); k.c.pose = k.cheer > 0 ? 'cheer' : 'idle'; k.c.update(dt); }
  };
  A.update(0, 0.016);
  return A;
}
