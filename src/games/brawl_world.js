import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, rand } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { mergeStatic } from './quickdraw_merge.js';
import { STAGES } from './brawl_data.js';

// Omgeving van "Smash-Arena": een zwevend eiland bij zonsondergang boven de wolken, met een kasteelberg op de achtergrond,
// drijvende eilandjes, wolken, lantaarns en vlaggen. Statische delen worden samengevoegd (weinig draw calls).

// Speelveld (wereld-eenheden). Vechters staan op z = 0, camera kijkt vanaf +z naar het podium.
// Elk podium levert hetzelfde "stage"-object: { solid, plats, BLAST, mood, camBase(), resp(i), start(i), itemX(), step(dt,T), update(t,dt), fdx, fdy, wind }
//  solid = { hw, top, bot } of null (vaste blok waar je tegenaan botst); plats = zachte platforms (spring er van onderaf doorheen): { x, y, w, on, dx, dy }
const ISLE = { HW: 9.0, TOP: 0, BOT: -3.5 };
export const mkPlat = (x, y, w, o = {}) => ({ x, y, w, on: true, soft: true, dx: 0, dy: 0, py: y, ...o });

export function gradTex(stops) {
  return canvasTex(16, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, c]) => gr.addColorStop(o, c));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
export const glowTex = () => canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });

// Een klein drijvend eiland (rots-lathe + gras + boompje of torentje)
function miniIsland(rng, big = 1, castle = false) {
  const g = new THREE.Group();
  const r = (3 + rng() * 2.5) * big;
  const prof = [[0, 0], [r, 0], [r * 0.96, -0.5 * big], [r * 0.7, -2.0 * big], [r * 0.35, -3.8 * big], [0, -5 * big]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(mesh(new THREE.LatheGeometry(prof, 9), mat(0x6a4c78), { cast: false, receive: false, scale: [1, 1, 0.6] }));
  g.add(mesh(new THREE.CylinderGeometry(r * 0.98, r * 0.98, 0.35, 9), mat(0x6cc058), { cast: false, receive: false, pos: [0, 0.05, 0], scale: [1, 1, 0.6] }));
  if (castle) {
    const t1 = P.tower(5 * big, 1.0 * big); t1.position.set(-r * 0.4, 0.2, 0); g.add(t1);
    const t2 = P.tower(7 * big, 1.2 * big); t2.position.set(0, 0.2, -0.2); g.add(t2);
    const t3 = P.tower(4 * big, 0.9 * big); t3.position.set(r * 0.45, 0.2, 0.1); g.add(t3);
  } else {
    for (let i = 0; i < 2; i++) { const t = P.tree(2.2 + rng() * 1.6, i ? 0xf08ab0 : 0x4fb05a); t.position.set((rng() - 0.5) * r * 1.2, 0.2, (rng() - 0.5) * 1.0); g.add(t); }
  }
  return g;
}

const _crystalM = {};
const crystalMat = (c) => _crystalM[c] || (_crystalM[c] = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, roughness: 0.25, flatShading: true }));
function crystalSpikes(rng, n, spread) {
  const g = new THREE.Group(); const cols = [0x6fe8ff, 0xff7fd0, 0xb08cff, 0x8affb0];
  for (let i = 0; i < n; i++) {
    const c = cols[i % cols.length], h = 1.2 + rng() * 2.2;
    g.add(mesh(new THREE.ConeGeometry(0.28 + rng() * 0.2, h, 5), crystalMat(c), { cast: false, receive: false, pos: [(rng() - 0.5) * spread, -h / 2, (rng() - 0.5) * 2], rot: [Math.PI + (rng() - 0.5) * 0.4, 0, (rng() - 0.5) * 0.5] }));
  }
  return g;
}

// Wolken (1 draw call, geinstantieerd). Geeft update(dt) terug. flow = extra snelheid (voor het draken-podium)
export function makeClouds(scene, rng, { N = 16, flow = 1, lows = true, tint = [0xffd0dc, 0xffe6c8, 0xe8c0ff], near = 0xfff2f6 } = {}) {
  const PUF = 5, geo = new THREE.IcosahedronGeometry(1, 1);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: 0.86 }), N * PUF);
  im.frustumCulled = false; im.renderOrder = -1;
  const cl = [], col = new THREE.Color(), d = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const nr = i % 4 === 0, z = nr ? -8 - rng() * 5 : -24 - rng() * 50, sc = nr ? 1.5 + rng() * 0.9 : 2.4 + rng() * 3.2;
    cl.push({ x: (rng() - 0.5) * 150, y: nr ? -12 - rng() * 5 : (i % 2 ? -17 + rng() * 15 : 17 + rng() * 12), z, sc, sp: (0.25 + rng() * 0.5) * (nr ? 1.4 : 1) * flow, ph: rng() * 6 });
    for (let k = 0; k < PUF; k++) { col.set(nr ? near : tint[i % tint.length]); im.setColorAt(i * PUF + k, col); }
  }
  scene.add(im);
  return {
    im,
    update(dt) {
      for (let i = 0; i < cl.length; i++) {
        const o = cl[i]; o.x += o.sp * dt; if (o.x > 85) o.x = -85; if (o.x < -85) o.x = 85;
        for (let k = 0; k < PUF; k++) { d.position.set(o.x + (k - 2) * o.sc * 0.8, o.y + Math.sin(k * 1.7 + o.ph) * o.sc * 0.25, o.z); d.scale.set(o.sc * (1.2 - Math.abs(k - 2) * 0.18), o.sc * 0.7, o.sc * 0.8); d.updateMatrix(); im.setMatrixAt(i * PUF + k, d.matrix); }
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

export function buildIsland(ctx, api) {
  const { scene } = ctx;
  const rng = mulberry32(4242);
  const W = { banners: [], flames: [], lanterns: null, far: null };
  scene.background = gradTex([[0, '#1b2766'], [0.35, '#6a3f9a'], [0.62, '#e0689a'], [0.85, '#ffa064'], [1, '#ffd27a']]);
  scene.fog = new THREE.Fog(0xe08aa8, 70, 230);
  const ST = ISLE;

  // zon + gloed
  const gt = glowTex();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xffc070, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.scale.set(70, 70, 1); sun.position.set(-30, 4, -120); scene.add(sun);
  const sun2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xfff0c0, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun2.scale.set(26, 26, 1); sun2.position.set(-30, 4, -119); scene.add(sun2);

  // sterretjes hoog in de lucht
  { const n = 70, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = (rng() - 0.5) * 220; p[i * 3 + 1] = 28 + rng() * 60; p[i * 3 + 2] = -100 - rng() * 20; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8 }))); }

  // ---- achtergrond: kasteelberg + drijvende eilandjes (samengevoegd) ----
  const far = new THREE.Group(); W.far = far; scene.add(far);
  {
    const mount = new THREE.Group();
    const prof = [[0, 14], [3, 11], [7, 5], [13, 0], [15, -3], [11, -9], [6, -16], [0, -24]].map(([x, y]) => new THREE.Vector2(x, y));
    mount.add(mesh(new THREE.LatheGeometry(prof, 8), mat(0x5b4a86), { cast: false, receive: false }));
    mount.add(mesh(new THREE.ConeGeometry(3.2, 3.5, 8), mat(0xffffff), { cast: false, receive: false, pos: [0, 14.5, 0] }));
    for (const [x, z, h, r] of [[-3.5, 1, 6, 1.4], [0, 2, 9, 1.8], [3.6, 1, 5.5, 1.3], [-1.2, 5.2, 4, 1.1], [1.8, 5, 4.6, 1.2]]) { const t = P.tower(h, r); t.position.set(x, 8.5 - (Math.abs(x) * 0.5), z); mount.add(t); }
    mount.position.set(-6, -3, -62); mount.scale.setScalar(1.15); far.add(mount);
    [[-34, 6, -52, 1.1, false], [30, 9, -46, 1.0, true], [46, -2, -70, 1.5, false], [-52, -4, -75, 1.4, true], [14, -9, -58, 0.8, false], [-20, 14, -80, 1.2, false]].forEach(([x, y, z, s, c]) => { const m = miniIsland(rng, s, c); m.position.set(x, y, z); far.add(m); });
    mergeStatic(far);
  }

  // ---- hoofdeiland ----
  const isle = new THREE.Group(); scene.add(isle);
  const R = ST.HW + 0.6;
  const topProf = [[R, -0.6], [R, 0], [0, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const rockProf = [[R, -0.6], [R * 0.99, -1.4], [R * 0.9, -3.5], [R * 0.62, -6.2], [R * 0.3, -8.6], [0, -10.5]].map(([x, y]) => new THREE.Vector2(x, y));
  const grassM = new THREE.MeshStandardMaterial({ map: tex.grass(6, 2), roughness: 1, flatShading: true, side: THREE.DoubleSide });
  const topM = mesh(new THREE.LatheGeometry(topProf, 28), grassM, { cast: false, receive: true, scale: [1, 1, 0.42] }); isle.add(topM);
  const rockT = tex.stone(5, 2);
  isle.add(mesh(new THREE.LatheGeometry(rockProf, 20), new THREE.MeshStandardMaterial({ map: rockT, color: 0xb8a4d8, roughness: 1, flatShading: true, side: THREE.DoubleSide }), { cast: false, receive: true, scale: [1, 1, 0.42] }));
  // kristallen onder het eiland
  const cs = crystalSpikes(rng, 9, R * 1.2); cs.position.set(0, -3.8, 1.2); isle.add(cs);
  const cs2 = crystalSpikes(rng, 6, R * 0.8); cs2.position.set(0, -7.2, 0.3); isle.add(cs2);
  // decor op het eiland (achterkant)
  const decor = (o, x, z, s = 1, ry = 0) => { o.position.set(x, 0.1, z); o.scale.setScalar(s); o.rotation.y = ry; isle.add(o); return o; };
  decor(P.tree(4.6, 0x4fb05a), -8.2, -1.7); decor(P.tree(3.6, 0xf08ab0), 8.0, -1.5); decor(P.tree(3.2, 0x58c0a8), -4.4, -2.0); decor(P.pine(4, 0x2c8a5b), 4.0, -1.9);
  decor(P.bush(1.2, 0x3bb060), -2.3, -1.4); decor(P.bush(1.0, 0xf07aa8), 2.4, -1.5); decor(P.bush(1.4, 0x3b9a45), 6.6, -1.2);
  decor(P.mushroom(0.9, 0xe03a3a), -6.8, -1.0); decor(P.mushroom(1.1, 0xb06bff), 7.4, -0.9); decor(P.flowerPatch(0xff6fa5, 8, 1.4), -0.6, -1.2); decor(P.flowerPatch(0xffe14a, 6, 1.1), 4.9, -1.0);
  decor(P.rock(0.9, 0x9a98a8), 1.0, -2.3); decor(P.crate(0.9), -5.4, -1.8);
  // fakkels (zonder echte lichten: alleen een gloeiend vlammetje)
  for (const sx of [-1, 1]) {
    const t = new THREE.Group(); t.position.set(sx * (ST.HW - 0.6), 0.1, -1.2);
    t.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.7, 6), mat(0x5b3d24), { pos: [0, 0.85, 0] }), mesh(new THREE.CylinderGeometry(0.2, 0.1, 0.22, 6), mat(0x333333), { pos: [0, 1.75, 0] }));
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 6), new THREE.MeshBasicMaterial({ color: 0xffa030 })); f.position.y = 2.15; f.userData.dyn = true; t.add(f); W.flames.push(f);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.38, 6), new THREE.MeshBasicMaterial({ color: 0xffe880 })); f2.position.y = 2.07; f2.userData.dyn = true; t.add(f2); W.flames.push(f2);
    isle.add(t);
  }
  // vlaggen op de achterhoeken
  for (const [sx, col] of [[-1, 0x2f9e5b], [1, 0x3a78e0]]) { const b = P.banner(col, 3.2, 1.1); b.position.set(sx * (ST.HW - 1.8), 0.1, -2.4); b.userData.dyn = true; isle.add(b); W.banners.push(b); }
  // platforms: houten planken met gouden uiteinden en een wolkje eronder
  const plankM = new THREE.MeshStandardMaterial({ map: tex.planks(3, 1), roughness: 0.9 });
  const plats = [mkPlat(-6.4, 3.8, 5.0), mkPlat(6.4, 3.8, 5.0), mkPlat(0, 7.6, 5.0)];
  for (const p of plats) {
    const g = new THREE.Group(); g.position.set(p.x, p.y, 0);
    g.add(mesh(new THREE.BoxGeometry(p.w, 0.4, 2.6), plankM, { cast: false, pos: [0, -0.2, 0] }));
    g.add(mesh(new THREE.BoxGeometry(p.w + 0.3, 0.12, 2.8), mat(0xe8c24a, { metalness: 0.5, roughness: 0.4 }), { cast: false, pos: [0, -0.02, 0] }));
    for (const sx of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.34, 1.2, 5), mat(0x6a4c78), { cast: false, pos: [sx * (p.w / 2 - 0.5), -0.95, 0], rot: [Math.PI, 0, 0] }));
    g.add(mesh(new THREE.ConeGeometry(0.4, 1.7, 5), new THREE.MeshStandardMaterial({ color: 0x8affd8, emissive: 0x3ac8a8, emissiveIntensity: 0.7, roughness: 0.3, flatShading: true }), { cast: false, pos: [0, -1.2, 0], rot: [Math.PI, 0, 0] }));
    isle.add(g);
  }
  mergeStatic(isle);

  const clouds = makeClouds(scene, rng);
  // ---- lantaarns die omhoog zweven ----
  {
    const N = 14, im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd070, fog: false }), N);
    im.frustumCulled = false; const ls = [];
    for (let i = 0; i < N; i++) ls.push({ x: (rng() - 0.5) * 60, y: -14 + rng() * 40, z: -2 - rng() * 12, s: 0.8 + rng() * 0.8, ph: rng() * 6 });
    scene.add(im); W.lanterns = { im, ls, d: new THREE.Object3D() };
  }

  const S = {
    kind: 'island', ...STAGES.island, solid: { hw: ST.HW, top: ST.TOP, bot: ST.BOT }, mainP: { x: 0, y: 0, w: ST.HW * 2, solid: true, on: true, dx: 0, dy: 0, py: 0 }, plats, BLAST: { x: 27, bot: -15, top: 24 },
    mood: { hemi: 0xffd0e8, ground: 0x7a5a9a, hemiI: 1.25, sun: 0xffc890, sunI: 2.0, sunPos: [-10, 26, 22], fogNear: 70, fogFar: 230 },
    fdx: 0, fdy: 0, wind: 0,
    camBase: () => ({ x0: -ST.HW - 1.5, x1: ST.HW + 1.5, y0: -3.2, y1: 10.6 }),
    resp: (i) => ({ x: i ? 3.6 : -3.6, y: 10.5 }), start: (i) => ({ x: i ? 5 : -5, y: 0 }),
    itemX: () => rand(-7.5, 7.5),
    step() {},
    update(t, dt) {
      clouds.update(dt);
      const L = W.lanterns;
      for (let i = 0; i < L.ls.length; i++) { const o = L.ls[i]; o.y += o.s * dt; if (o.y > 30) o.y = -16; L.d.position.set(o.x + Math.sin(t * 0.7 + o.ph) * 0.8, o.y, o.z); L.d.scale.setScalar(0.9 + Math.sin(t * 3 + o.ph) * 0.12); L.d.updateMatrix(); L.im.setMatrixAt(i, L.d.matrix); }
      L.im.instanceMatrix.needsUpdate = true;
      W.far.position.y = Math.sin(t * 0.35) * 0.6;
      for (let i = 0; i < W.flames.length; i++) { const f = W.flames[i]; f.scale.y = 1 + Math.sin(t * 13 + i * 2) * 0.16 + Math.sin(t * 7.3) * 0.08; f.rotation.y = t * 2; }
      for (const b of W.banners) P.animateBanner(b, t);
      sun2.material.opacity = 0.9 + Math.sin(t * 0.8) * 0.08;
    },
  };
  return S;
}
