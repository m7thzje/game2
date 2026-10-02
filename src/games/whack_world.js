import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, fbm, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { makeNPC, Animal, Butterfly } from '../engine/chars.js';

// Moestuin van Boer Boris: 4 kolommen x 3 rijen gaten, hekken, groente, vogelverschrikker, gnoomen, dieren.

export const HX = [-4.65, -1.55, 1.55, 4.65];
export const HZ = [-3.1, 0, 3.1];

function instanced(geo, material, items, { cast = true } = {}) {
  const im = new THREE.InstancedMesh(geo, material, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e); p.set(it.x, it.y, it.z);
    if (typeof it.s === 'number') s.set(it.s, it.s, it.s); else s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    m4.compose(p, q, s); im.setMatrixAt(i, m4);
    if (it.c !== undefined) { c.set(it.c); im.setColorAt(i, c); }
  });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false;
  return im;
}

function soilTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(4);
    g.fillStyle = '#6a4a2c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      const y = i * 32;
      const gr = g.createLinearGradient(0, y, 0, y + 32);
      gr.addColorStop(0, '#7b5834'); gr.addColorStop(0.5, '#5a3d22'); gr.addColorStop(1, '#7b5834');
      g.fillStyle = gr; g.fillRect(0, y, w, 32);
    }
    for (let i = 0; i < 700; i++) { g.fillStyle = r() < 0.5 ? 'rgba(30,18,8,.35)' : 'rgba(170,130,90,.3)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 2); }
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(120,120,120,.5)'; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 3, 2 + r() * 2, 0, 0, TAU); g.fill(); }
  }, { repeat: [5, 4] });
}

export function buildGarden(ctx, rng) {
  const { scene, fx } = ctx;
  const W = { anim: [], gnomes: [], worms: [], animals: [], crows: [], butterflies: [], npcs: {} };

  // ---- grond ----
  const ground = mesh(new THREE.PlaneGeometry(220, 160), new THREE.MeshStandardMaterial({ map: tex.grass(44, 32), roughness: 1 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -20] });
  scene.add(ground);
  // veld (verhoogd bed)
  const FW = 14.4, FD = 11.2, FZ = 0;
  const soilMat = new THREE.MeshStandardMaterial({ map: soilTexture(), roughness: 1 });
  const bed = new THREE.Mesh(new THREE.BoxGeometry(FW, 0.3, FD), [mat(0x4a3220), mat(0x4a3220), soilMat, mat(0x4a3220), mat(0x4a3220), mat(0x4a3220)]);
  bed.position.set(0, -0.0, FZ); bed.receiveShadow = true; scene.add(bed);
  // plankenrand
  const plank = new THREE.MeshStandardMaterial({ map: tex.planks(3, 1, '#a9774a'), roughness: 0.9 });
  for (const [px, pz, sx, sz] of [[0, FZ - FD / 2 - 0.2, FW + 0.8, 0.5], [0, FZ + FD / 2 + 0.2, FW + 0.8, 0.5], [-FW / 2 - 0.2, FZ, 0.5, FD], [FW / 2 + 0.2, FZ, 0.5, FD]]) scene.add(mesh(new THREE.BoxGeometry(sx, 0.55, sz), plank, { pos: [px, 0.12, pz] }));

  // ---- gaten ----
  const holeMat = new THREE.MeshStandardMaterial({ color: 0x1b0f08, roughness: 1 });
  const moundMat = mat(0x5b3e24, { flatShading: false });
  W.holes = []; const pebbles = [];
  for (let r = 0; r < HZ.length; r++) for (let c = 0; c < HX.length; c++) {
    const g = new THREE.Group(); g.position.set(HX[c], 0.16, HZ[r]); scene.add(g);
    const d = mesh(new THREE.CircleGeometry(0.92, 18), holeMat, { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0.02, 0] }); g.add(d);
    const m = mesh(new THREE.TorusGeometry(1.0, 0.3, 8, 18), moundMat, { rot: [Math.PI / 2, 0, 0], pos: [0, 0.02, 0], scale: [1, 1, 0.55] }); g.add(m);
    for (let k = 0; k < 4; k++) { const a = rng() * TAU; pebbles.push({ x: HX[c] + Math.cos(a) * 1.25, y: 0.22, z: HZ[r] + Math.sin(a) * 1.25, s: 0.1 + rng() * 0.08, c: 0x8a8a90 }); }
    W.holes.push({ c, r, x: HX[c], z: HZ[r], g, mound: m, shake: 0 });
  }

  scene.add(instanced(new THREE.DodecahedronGeometry(1, 0), mat(0xffffff), pebbles, { cast: false }));

  // ---- hekken (instanced) ----
  const posts = [], rails = [];
  function fence(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 1.4), ang = Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i <= n; i++) { const t = i / n; posts.push({ x: lerp(x0, x1, t), y: 0.55, z: lerp(z0, z1, t), ry: rng() * 0.4, rz: (rng() - 0.5) * 0.06 }); }
    for (const y of [0.35, 0.8]) rails.push({ x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, ry: -ang, sx: len / 1.4 });
  }
  fence(-10.6, -7.5, 10.6, -7.5);
  fence(-10.6, -7.5, -10.6, 6.4); fence(10.6, -7.5, 10.6, 6.4);
  fence(-10.6, 6.4, -8.2, 6.4); fence(8.2, 6.4, 10.6, 6.4);
  scene.add(instanced(new THREE.BoxGeometry(0.18, 1.1, 0.18), mat(0x8b6a40), posts));
  scene.add(instanced(new THREE.BoxGeometry(1.4, 0.1, 0.08), mat(0xb08856), rails));

  // ---- groente (instanced) ----
  const cab = [], pump = [], carrotTop = [], carrotRoot = [], corn = [], cobs = [], lettuce = [];
  for (let i = 0; i < 16; i++) { const x = -9.8 + i * 1.3 + rng() * 0.3; cab.push({ x, y: 0.34, z: -6.85 + rng() * 0.2, sx: 0.55, sy: 0.45, sz: 0.55, c: i % 3 ? 0x6cc04a : 0x4a9a3a }); }
  for (let i = 0; i < 16; i++) { const x = -9.6 + i * 1.3 + rng() * 0.3; lettuce.push({ x, y: 0.28, z: -6.35 + rng() * 0.15, s: 0.34, c: i % 2 ? 0x9be06a : 0x7ed05a }); }
  for (let i = 0; i < 6; i++) pump.push({ x: -9.6 + i * 0.9 + rng() * 0.3, y: 0.4, z: 6.9 - rng() * 0.2, sx: 0.5, sy: 0.38, sz: 0.5, c: 0xf08a1c });
  for (let i = 0; i < 6; i++) pump.push({ x: 6.2 + i * 0.5, y: 0.4, z: 7.0 + (i % 2) * 0.2, sx: 0.5, sy: 0.38, sz: 0.5, c: 0xff9a2c });
  for (let k = 0; k < 20; k++) { const x = -11.2 + (k % 4) * 0.55 + (k > 9 ? 22 - 0 : 0) * 0 + 0.0; const side = k < 10 ? -1 : 1; const px = side * (8.5 + (k % 5) * 0.4), pz = -4 + Math.floor((k % 10) / 5) * 4.5 + rng() * 0.6 + (side > 0 ? 0 : 0.3); carrotTop.push({ x: px, y: 0.28, z: pz, s: 0.2, c: 0x4fa83a }); carrotRoot.push({ x: px, y: 0.15, z: pz, sy: 0.7, sx: 0.8, sz: 0.8, rx: Math.PI, c: 0xff7a1a }); }
  for (let k = 0; k < 14; k++) { const x = -10.6 + (k % 7) * 0.7; const z = 4.7 + Math.floor(k / 7) * 0.9 + rng() * 0.2; if (x > -8) continue; corn.push({ x: -9.2 - (k % 3) * 0.4, y: 1.3, z: -5 + (k % 7) * 1.5, sy: 1, s: 1 }); }
  for (let k = 0; k < 9; k++) { const px = 9.0 + (k % 3) * 0.55, pz = -6.5 + Math.floor(k / 3) * 3.0; corn.push({ x: px, y: 1.3, z: pz, sy: 1, s: 1 }); cobs.push({ x: px + 0.08, y: 1.5, z: pz, sy: 1, s: 1 }); }
  scene.add(instanced(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff), cab));
  scene.add(instanced(new THREE.IcosahedronGeometry(1, 0), mat(0xffffff), lettuce));
  scene.add(instanced(new THREE.SphereGeometry(1, 10, 8), mat(0xffffff, { flatShading: false }), pump));
  scene.add(instanced(new THREE.ConeGeometry(1, 2.4, 5), mat(0xffffff), carrotTop, { cast: false }));
  scene.add(instanced(new THREE.ConeGeometry(0.5, 1.4, 6), mat(0xffffff), carrotRoot, { cast: false }));
  scene.add(instanced(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 5), mat(0x7fa83a), corn));
  scene.add(instanced(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), mat(0xf2d24a), cobs));
  // koolbladeren (lichte kleur op de koppen) overgeslagen: de kleurvariatie doet het werk

  // ---- vogelverschrikker ----
  {
    const g = new THREE.Group(); g.position.set(-8.8, 0.2, -6.0); g.rotation.y = 0.6; scene.add(g);
    const sway = new THREE.Group(); g.add(sway);
    sway.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 3.6, 6), mat(0x6b4a2e), { pos: [0, 1.8, 0] }));
    sway.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.0, 6), mat(0x6b4a2e), { pos: [0, 2.5, 0], rot: [0, 0, Math.PI / 2] }));
    sway.add(mesh(new THREE.CylinderGeometry(0.5, 0.62, 1.2, 8), mat(0x3b7dd8), { pos: [0, 2.2, 0] }));
    sway.add(mesh(new THREE.BoxGeometry(0.34, 0.3, 0.06), mat(0xd8372c), { pos: [0.1, 2.3, 0.55] }));
    sway.add(mesh(new THREE.SphereGeometry(0.46, 10, 8), mat(0xe6c98a, { flatShading: false }), { pos: [0, 3.2, 0] }));
    for (const sx of [-1, 1]) sway.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), mat(0x222222), { cast: false, pos: [sx * 0.17, 3.28, 0.4] }));
    sway.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), mat(0x222222), { cast: false, pos: [0, 3.08, 0.44], rot: [0, 0, Math.PI / 2] }));
    sway.add(mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.07, 14), mat(0xe6c565), { pos: [0, 3.55, 0] }));
    sway.add(mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.45, 10), mat(0xe6c565), { pos: [0, 3.8, 0] }));
    sway.add(mesh(new THREE.CylinderGeometry(0.51, 0.51, 0.1, 10), mat(0xc43d2e), { pos: [0, 3.66, 0] }));
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) sway.add(mesh(new THREE.ConeGeometry(0.05, 0.4, 4), mat(0xe6c565), { pos: [sx * (1.55 + k * 0.07), 2.5 - k * 0.12, 0], rot: [0, 0, sx * (1.3 + k * 0.4)] }));
    // kraai erop
    const crow = new THREE.Group(); crow.position.set(1.0, 2.62, 0); sway.add(crow);
    crow.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(0x16161c), { pos: [0, 0.18, 0], scale: [1, 0.9, 1.5] }));
    const ch = new THREE.Group(); ch.position.set(0, 0.36, 0.26); crow.add(ch);
    ch.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x16161c)));
    ch.add(mesh(new THREE.ConeGeometry(0.05, 0.22, 4), mat(0xf2a33a), { pos: [0, -0.02, 0.17], rot: [Math.PI / 2, 0, 0] }));
    ch.add(mesh(new THREE.SphereGeometry(0.025, 5, 4), mat(0xffffff), { cast: false, pos: [0.06, 0.03, 0.09] }));
    crow.add(mesh(new THREE.ConeGeometry(0.1, 0.35, 4), mat(0x16161c), { pos: [0, 0.14, -0.35], rot: [-1.2, 0, 0] }));
    W.anim.push((t) => { sway.rotation.z = Math.sin(t * 1.3) * 0.045; sway.rotation.x = Math.sin(t * 0.9 + 1) * 0.03; ch.rotation.y = Math.sin(t * 0.7) * 0.5; ch.rotation.x = Math.max(0, Math.sin(t * 1.9)) * 0.35; crow.position.y = 2.62 + Math.max(0, Math.sin(t * 0.8 + 2) - 0.85) * 1.2; });
    W.scarecrow = g; W.crow = crow;
  }

  // ---- boerderij, silo, molen ----
  {
    const barn = P.houseSimple(12, 8, 5, { wall: '#c9503a', roof: '#6b4a3a' }); barn.position.set(-19, 0, -16); barn.rotation.y = 0.5; scene.add(barn);
    const house = P.houseSimple(8, 6, 3.6, { wall: '#f1e5c6', roof: '#b5483a', thatch: true }); house.position.set(17, 0, -15); house.rotation.y = -0.4; scene.add(house);
    const wm = P.windmill(1.6); wm.position.set(5, 0, -34); scene.add(wm); W.windmill = wm;
    const silo = mesh(new THREE.CylinderGeometry(2.1, 2.1, 9, 12), new THREE.MeshStandardMaterial({ map: tex.plaster(2, 2, '#d9d4c8'), roughness: 0.9 }), { pos: [-26, 4.5, -12] }); scene.add(silo);
    scene.add(mesh(new THREE.ConeGeometry(2.3, 2.5, 12), mat(0x8a4a3a), { pos: [-26, 10.2, -12] }));
    for (let i = 0; i < 5; i++) { const b = mesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 10), mat(0xd9b84a), { pos: [-13 + i * 1.7 + (i > 2 ? 0.9 : 0), 0.6 + (i === 3 || i === 4 ? 0.9 : 0), -11.5], rot: [Math.PI / 2, 0, 0.1 * i] }); scene.add(b); }
    // wiel kruiwagen
    const cb = new THREE.Group(); cb.position.set(9.4, 0, 5.0); cb.rotation.y = 0.5; scene.add(cb);
    cb.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 0.9), mat(0x3b7dd8), { pos: [0, 0.7, 0] }));
    cb.add(mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10), mat(0x333333), { pos: [0.85, 0.35, 0], rot: [Math.PI / 2, 0, 0] }));
    for (const sz of [-1, 1]) cb.add(mesh(new THREE.BoxGeometry(1.2, 0.07, 0.07), mat(0x8b6a40), { pos: [-1.0, 0.75, sz * 0.4], rot: [0, 0, 0.2] }));
    for (let i = 0; i < 4; i++) cb.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), mat(i % 2 ? 0xd83a2a : 0xf08a1c, { flatShading: false }), { pos: [-0.3 + i * 0.3, 1.0, (i % 2 - 0.5) * 0.3] }));
    const tr = P.barrel(1.1); tr.position.set(-9.0, 0, 5.2); scene.add(tr);
    const bk = P.bucket(); bk.position.set(-8.0, 0, 5.8); scene.add(bk);
    const sg = P.signpost(['Boer Boris', 'Moestuin']); sg.position.set(6.8, 0, 8.2); sg.rotation.y = -0.4; scene.add(sg);
  }

  // ---- bomen rondom (instanced) ----
  {
    const tr = [], cr = [], cr2 = [];
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 1.15 + Math.PI * 0.925; // boog achter het veld
      const x = Math.cos(a) * (36 + rng() * 16), z = -10 + Math.sin(a) * (30 + rng() * 14) * 0.9 - 6;
      if (Math.abs(x) < 4 && z > -40) continue;
      const s = 0.9 + rng() * 0.9; const c = [0x3f9e3a, 0x4aa844, 0x378f3a, 0x58b04a][i % 4];
      tr.push({ x, y: 1.3 * s, z, s }); cr.push({ x, y: 3.7 * s, z, s: s * 2.0, c, ry: rng() * 3 }); cr2.push({ x: x + s * 1.0, y: 2.9 * s, z: z + s * 0.5, s: s * 1.4, c, ry: rng() * 3 });
    }
    for (let i = 0; i < 14; i++) { const side = i % 2 ? 1 : -1; const x = side * (22 + rng() * 14), z = -2 + rng() * -12; const s = 0.8 + rng() * 0.8; const c = [0x3f9e3a, 0x4aa844][i % 2]; tr.push({ x, y: 1.3 * s, z, s }); cr.push({ x, y: 3.7 * s, z, s: s * 2.0, c }); cr2.push({ x: x + s, y: 2.9 * s, z: z + 0.5, s: s * 1.4, c }); }
    scene.add(instanced(new THREE.CylinderGeometry(0.28, 0.4, 2.6, 6), mat(0x6b4a2e), tr));
    scene.add(instanced(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff), cr));
    scene.add(instanced(new THREE.IcosahedronGeometry(1, 0), mat(0xffffff), cr2));
  }

  // ---- bloemen + struiken rond het veld ----
  {
    const stems = [], heads = [], bushes = [];
    const fc = [0xff6fa5, 0xffe14a, 0xffffff, 0x8fb8ff, 0xff9a3a, 0xc88cff];
    for (let i = 0; i < 300; i++) {
      const x = (rng() - 0.5) * 50, z = -12 + rng() * 26;
      if (Math.abs(x) < 11.4 && z > -8.6 && z < 7.2) continue;
      stems.push({ x, y: 0.2, z, s: 1 }); heads.push({ x, y: 0.42, z, s: 0.12 + rng() * 0.08, c: fc[Math.floor(rng() * fc.length)] });
    }
    for (let i = 0; i < 22; i++) { const x = (rng() - 0.5) * 46, z = -10 + rng() * 22; if (Math.abs(x) < 11.6 && z > -8.6 && z < 7.4) continue; bushes.push({ x, y: 0.5, z, s: 0.6 + rng() * 0.7, sy: 0.8, c: [0x3b9a45, 0x4aa844, 0x2f8a46][i % 3] }); }
    scene.add(instanced(new THREE.CylinderGeometry(0.014, 0.014, 0.4, 4), mat(0x3b8a3a), stems, { cast: false }));
    scene.add(instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), heads, { cast: false }));
    scene.add(instanced(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff), bushes));
  }

  // ---- dieren ----
  for (const [kind, x, z] of [['cow', -12, -17], ['cow', -6, -20], ['sheep', 3, -18], ['sheep', 9, -21], ['sheep', 13, -17], ['cow', 21, -10]]) {
    const a = new Animal(kind); a.group.position.set(x, 0, z); a.base = new THREE.Vector3(x, 0, z); a.ph = rng() * 6; a.group.scale.setScalar(1.25); scene.add(a.group); W.animals.push(a);
  }
  for (const [x, z] of [[13.5, 4], [-13.8, 2], [14.5, 7]]) { const a = new Animal('chicken'); a.group.position.set(x, 0, z); a.base = new THREE.Vector3(x, 0, z); a.ph = rng() * 6; a.group.scale.setScalar(1.3); a.chicken = true; scene.add(a.group); W.animals.push(a); }

  // ---- gnoomen ----
  function gnome(x, z, ry, hat = 0xd8372c) {
    const n = makeNPC('dwarf', { hatColor: hat, hat: 'wizard', hatColor2: 0xffe14a, scale: 0.75 }); n.group.position.set(x, 0, z); n.targetYaw = n.yaw = ry; scene.add(n.group); W.gnomes.push(n); return n;
  }
  W.gA = gnome(-9.2, 2.6, 0.6, 0xd8372c); W.gA.pose = 'wave';
  W.gB = gnome(9.3, -5.0, -1.2, 0x3b7dd8);
  // zittend op paddenstoel/stronk
  {
    const stump = mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.55, 8), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#8a6238') }), { pos: [W.gB.group.position.x, 0.28, W.gB.group.position.z] }); scene.add(stump);
    W.gB.pose = 'sit'; W.gB.group.position.y = 0.55;
  }
  // wandelende gnoom met gieter
  W.gW = gnome(-7, -6.9, 0, 0x2f9e5b); { const b = P.bucket(); b.scale.setScalar(0.8); W.gW.hold(b, 'r'); b.rotation.x = 0; b.position.set(0, -0.25, 0.1); }
  W.gW.walk = { t: rng() * 10 };
  // gnoom in de struiken
  W.gP = gnome(9.8, 1.6, -1.9, 0xf08a1c);
  const bush = P.bush(1.6); bush.position.set(10.4, 0, 2.1); scene.add(bush);
  // gnomenhuisje (paddenstoel)
  {
    const g = new THREE.Group(); g.position.set(-12.2, 0, -2.5); g.rotation.y = 0.5; scene.add(g);
    const m = P.mushroom(2.1, 0xd8372c); g.add(m);
    g.add(mesh(new THREE.BoxGeometry(0.55, 0.9, 0.12), mat(0x6b4226), { pos: [0, 0.5, 0.52] }));
    g.add(mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa040, emissiveIntensity: 0.6 }), { cast: false, pos: [0.5, 0.9, 0.5] }));
  }

  // ---- Boer Boris ----
  {
    const b = makeNPC('farmer'); b.group.position.set(12.3, 0, -1.0); b.targetYaw = b.yaw = -1.2; scene.add(b.group); W.npcs.boris = b; b.react = 0;
    const fork = new THREE.Group(); fork.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), mat(0x8a5a2b), { pos: [0, 0.1, 0] })); for (const sx of [-1, 0, 1]) fork.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 4), mat(0x888894, { metalness: 0.6 }), { pos: [sx * 0.1, 1.3, 0] }));
    b.hold(fork, 'r'); fork.position.set(0, 0.7, 0);
  }

  // ---- wormen ----
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group(); const segs = [];
    for (let k = 0; k < 6; k++) { const s = mesh(new THREE.SphereGeometry(0.13 - k * 0.008, 6, 5), mat(k === 0 ? 0xe88a9a : 0xf2a0ae, { flatShading: false }), { cast: false }); g.add(s); segs.push(s); }
    const hx = [-3.1, 0, 3.1, -6.2, 6.2, 0][i], hz = [1.55, -1.55, -1.55, 1.55, -1.55, 4.7][i];
    g.position.set(hx + (i % 2 ? 0.4 : -0.4), 0.2, hz); g.rotation.y = rng() * TAU; scene.add(g);
    W.worms.push({ g, segs, ph: rng() * 6, hideT: 2 + rng() * 8 });
  }
  // vlinders + bijtjes
  for (let i = 0; i < 6; i++) { const b = new Butterfly([0xff9ad5, 0xffe14a, 0x9ad5ff][i % 3]); b.group.scale.setScalar(1.6); b.home = new THREE.Vector3((rng() - 0.5) * 24, 2.2 + rng() * 1.5, -6 + rng() * 14); b.ph = rng() * 6; scene.add(b.group); W.butterflies.push(b); }
  // wolken
  W.clouds = []; for (let i = 0; i < 7; i++) { const c = P.cloud(2 + rng() * 1.5); c.position.set(-60 + i * 22 + rng() * 8, 36 + rng() * 10, -50 - rng() * 20); scene.add(c); W.clouds.push(c); }

  // ---------------- reacties ----------------
  W.cheerGnomes = (dur = 1.4) => { for (const g of [W.gA, W.gP, W.gW]) g.cheerT = dur; };
  W.borisReact = (pose, dur = 1.2) => { W.npcs.boris.pose = pose; W.npcs.boris.react = dur; };

  W.update = (t, dt) => {
    for (const f of W.anim) f(t);
    for (const c of W.clouds) { c.position.x += dt * 0.7; if (c.position.x > 90) c.position.x = -90; }
    if (W.windmill) W.windmill.userData.blades.rotation.z += dt * 0.5;
    for (const b of W.butterflies) { b.update(dt); const a = b.ph + t * 0.5; b.group.position.set(b.home.x + Math.sin(a) * 3, b.home.y + Math.sin(t * 2 + b.ph) * 0.4, b.home.z + Math.cos(a * 1.2) * 2.2); b.group.rotation.y = a + Math.PI / 2; }
    for (const a of W.animals) {
      const wob = a.chicken ? 1.6 : 0.8; const ph = a.ph + t * (a.chicken ? 0.5 : 0.12);
      const nx = a.base.x + Math.sin(ph) * wob, nz = a.base.z + Math.cos(ph * 0.8) * wob * 0.6;
      const dx = nx - a.group.position.x, dz = nz - a.group.position.z; const sp = Math.hypot(dx, dz) / Math.max(dt, 1e-3);
      a.group.position.x = nx; a.group.position.z = nz; a.speed = Math.min(1, sp * (a.chicken ? 0.35 : 0.9)); if (sp > 0.05) a.targetYaw = Math.atan2(dx, dz); a.update(dt);
    }
    for (const g of W.gnomes) {
      if (g === W.gW) { const w = g.walk; w.t += dt; const x = Math.sin(w.t * 0.35) * 7.5; const dx = x - g.group.position.x; g.group.position.x = x; g.group.position.z = -6.9; g.speed = Math.min(1, Math.abs(dx) / dt * 0.5); if (Math.abs(dx) > 1e-4) g.faceDir(dx, 0); }
      if (g.cheerT > 0) { g.cheerT -= dt; g.pose = 'cheer'; } else if (g === W.gA) g.pose = 'wave'; else if (g === W.gB) g.pose = 'sit'; else if (g === W.gP) { g.pose = Math.sin(t * 0.8) > 0.6 ? 'wave' : 'idle'; } else g.pose = 'idle';
      g.update(dt);
    }
    const b = W.npcs.boris; if (b.react > 0) { b.react -= dt; if (b.react <= 0) b.pose = 'idle'; } b.update(dt);
    for (const w of W.worms) {
      w.ph += dt * 3; w.hideT -= dt; const hide = w.hideT < 0 ? clamp(1 + w.hideT * 0.6, 0, 1) : 1; if (w.hideT < -1.6) w.hideT = 3 + Math.random() * 8;
      w.segs.forEach((s, k) => { s.position.set(Math.sin(w.ph - k * 0.7) * 0.18, 0.06 * hide + Math.sin(w.ph * 1.3 - k) * 0.03 * hide - (1 - hide) * 0.2, -k * 0.18); s.scale.setScalar(hide > 0.05 ? 1 : 0.01); });
    }
    for (const h of W.holes) { if (h.shake > 0) { h.shake = Math.max(0, h.shake - dt * 3); h.g.position.y = 0.16 + Math.sin(h.shake * 40) * 0.05 * h.shake; } }
  };
  return W;
}
