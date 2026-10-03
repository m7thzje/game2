import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp, lerp, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { skyTexture } from '../engine/lights.js';
import * as P from '../engine/props.js';
import { makeNPC } from '../engine/chars.js';
import { mergeStatic, disposeGroup } from './golf_merge.js';
import { S as SAVE } from '../save.js';
const S0q = () => (SAVE && SAVE.settings && SAVE.settings.quality) || 'high';
import { bounds, CUP_R, WALL_T, WALL_H } from './golf_course.js';
import { THEMES, cached, bmat, smat, feltTex, chevTex, iceTex, sandTex, swirlTex, hazardTex, scaleUV, flatQuad, boxUV, capGeo, ringGeo, isInside } from './golf_gfx.js';

// Omgeving en bouw van de banen van "Minigolf-Race": een zonnig speelhal-park op een heuvel voor een kasteel in de berg,
// met ballonnen, wolken, bomen en juichende toeschouwers. Elke baan is een vilt-vlak met houten randen.
// Prestaties: gedeelde materialen/texturen (golf_gfx), statische meshes samengevoegd (golf_merge), bumpers/portalen als instanced mesh.

// ---------------- omgeving ----------------
export function buildScenery(ctx) {
  const { scene } = ctx; const rng = mulberry32(88);
  const S = {};
  scene.background = skyTexture('#4fa8ff', '#ffe6bf');
  scene.fog = new THREE.Fog(0xf3e7d2, 75, 190);
  const root = new THREE.Group(); scene.add(root);
  const grass = mesh(new THREE.PlaneGeometry(420, 320), new THREE.MeshStandardMaterial({ map: tex.grass(60, 46), color: 0xa6d886, roughness: 1 }), { cast: false, pos: [0, -0.5, -20], rot: [-Math.PI / 2, 0, 0] }); root.add(grass);
  // heuvels en bergen
  const hillM = [mat(0x4f9a46, { flatShading: false }), mat(0x3f8a4a, { flatShading: false }), mat(0x5aa84e, { flatShading: false })];
  for (let i = 0; i < 16; i++) {
    const a = -2.7 + i / 15 * 2.3 + (rng() - 0.5) * 0.15, rr = 55 + rng() * 25, s = 10 + rng() * 14;
    root.add(mesh(new THREE.SphereGeometry(s, 12, 8), hillM[i % 3], { cast: false, receive: false, pos: [Math.cos(a) * rr * 1.6, -s * 0.55, Math.sin(a) * rr - 12], scale: [1.6, 0.7, 1.2] }));
  }
  const rockM = mat(0x8a86a0, { flatShading: true }), snowM = mat(0xffffff, { flatShading: true });
  for (let i = 0; i < 6; i++) {
    const x = -90 + i * 36 + (rng() - 0.5) * 10, h = 38 + rng() * 26, r = 20 + rng() * 10;
    root.add(mesh(new THREE.ConeGeometry(r, h, 7), rockM, { cast: false, receive: false, pos: [x, h / 2 - 2, -125 - rng() * 20] }));
    root.add(mesh(new THREE.ConeGeometry(r * 0.42, h * 0.32, 7), snowM, { cast: false, receive: false, pos: [x, h * 0.84 - 2, -125 - rng() * 0.001] }));
  }
  // kasteel op de heuvel achterin
  const castle = new THREE.Group(); castle.position.set(-30, 0, -92); root.add(castle);
  const wallM = mat(0xcfc8e0, { flatShading: true }), roofM = mat(0x3b58a8, { flatShading: true });
  castle.add(mesh(new THREE.BoxGeometry(34, 11, 7), wallM, { cast: false, pos: [0, 5.5, 0] }));
  for (let i = 0; i < 12; i++) castle.add(mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), wallM, { cast: false, pos: [-15 + i * 2.7, 11.8, 3.2] }));
  castle.add(mesh(new THREE.BoxGeometry(5, 8, 5), wallM, { cast: false, pos: [0, 15, 0] }), mesh(new THREE.BoxGeometry(5.5, 6, 1), mat(0x4a2e1a), { cast: false, pos: [0, 3, 3.6] }));
  const twM = cached('twstone', () => new THREE.MeshStandardMaterial({ map: tex.stone(2, 4), roughness: 0.95, flatShading: true })), twR = mat(0x3b58a8);
  for (const sx of [-17, 17, 0]) { const h = sx === 0 ? 20 : 15, r = 3.2; castle.add(mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 10), twM, { cast: false, pos: [sx, h / 2, 0] }), mesh(new THREE.CylinderGeometry(r * 1.25, r, 1.2, 10), twM, { cast: false, pos: [sx, h + 0.6, 0] }), mesh(new THREE.ConeGeometry(r * 1.4, 3.5, 10), twR, { cast: false, pos: [sx, h + 3.2, 0] })); for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; castle.add(mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), twM, { cast: false, pos: [sx + Math.cos(a) * r * 1.2, h + 1.6, Math.sin(a) * r * 1.2] })); } }
  S.castle = castle;
  // bomen (samengevoegd)
  const trees = new THREE.Group(); root.add(trees);
  for (let i = 0; i < 34; i++) {
    const side = i % 2 ? 1 : -1, x = side * (24 + rng() * 40), z = -16 - rng() * 40 + (rng() < 0.35 ? 30 : 0);
    const t = rng() < 0.55 ? P.pine(5 + rng() * 5, 0x2c7a4b) : P.tree(4 + rng() * 3, rng() < 0.5 ? 0x3f9e3a : 0x5ab048);
    t.position.set(x, -0.5, z); t.rotation.y = rng() * TAU; trees.add(t);
  }
  for (let i = 0; i < 14; i++) { const t = P.pine(7 + rng() * 6, 0x2a7048); t.position.set(-80 + i * 12 + rng() * 6, -0.5, -60 - rng() * 20); trees.add(t); }
  mergeStatic(trees);
  // struiken en bloemen langs de randen
  const deco = new THREE.Group(); root.add(deco);
  for (let i = 0; i < 18; i++) { const b = P.bush(1.2 + rng() * 1.2, rng() < 0.5 ? 0x3b9a45 : 0x4fae4a); b.position.set((rng() < 0.5 ? -1 : 1) * (22 + rng() * 14), -0.5, -10 + rng() * 26); deco.add(b); }
  for (let i = 0; i < 16; i++) { const f = P.flowerPatch([0xff6fa5, 0xffe14a, 0xffffff, 0x8fb8ff][i % 4], 7, 1.2); f.position.set((rng() < 0.5 ? -1 : 1) * (19 + rng() * 14), -0.5, -12 + rng() * 28); deco.add(f); }
  mergeStatic(deco);
  // wolken + ballonnen
  S.clouds = []; for (let i = 0; i < 6; i++) { const c = P.cloud(2 + rng() * 2); c.position.set(-90 + i * 36, 34 + rng() * 14, -70 - rng() * 30); c.userData.dyn = true; mergeStatic(c, { local: true }); root.add(c); S.clouds.push(c); }
  S.balloons = [];
  const bcols = [0xff4a6a, 0xffd23f, 0x4ac8ff, 0x7aff6a, 0xff8a3a, 0xc86aff, 0xff6ad0];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group(); const col = bcols[i % bcols.length]; g.userData.dyn = true;
    const bm = smat(col, { roughness: 0.25, metalness: 0.1, emissive: col, emissiveIntensity: 0.15 });
    g.add(mesh(new THREE.SphereGeometry(1.1, 12, 10), bm, { cast: false, scale: [1, 1.2, 1] }));
    g.add(mesh(new THREE.ConeGeometry(0.22, 0.4, 6), bm, { cast: false, pos: [0, -1.5, 0], rot: [Math.PI, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 3.2, 3), bm, { cast: false, pos: [0, -3.2, 0] }));
    mergeStatic(g, { local: true });
    const side = i % 2 ? 1 : -1; g.userData = { x: side * (22 + (i % 5) * 5), z: -6 - (i % 4) * 7, y: 9 + (i * 3) % 9, ph: i * 1.3, col };
    root.add(g); S.balloons.push(g);
  }
  // toeschouwers (juichen bij een hole-in-one)
  S.fans = []; const kinds = ['princess', 'kid', 'guard', 'goblin', 'jester', 'bard'];
  const nFans = S0q() === 'low' ? 2 : 4;   // toeschouwers kosten veel draw calls: minder op een zwakke computer
  kinds.slice(0, nFans).forEach((k, i) => { const c = makeNPC(k); const g = new THREE.Group(); g.userData.dyn = true; g.add(c.group); c.group.traverse((o) => { o.castShadow = false; }); root.add(g); S.fans.push({ c, g, i, home: [0, 0, 0], cheer: 0 }); });
  mergeStatic(root);   // heuvels, bergen, kasteel: statisch samengevoegd
  S.placeFans = (b) => {
    S.fans.forEach((f, i) => {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      f.g.position.set(b.cx + side * (b.w / 2 + 2.4 + k * 1.8), 0, b.cz - b.d / 2 + 1 + k * 3.2 + (i % 2) * 1.4); f.g.scale.setScalar(1.7 / f.c.height * 1.3);
      f.c.faceDir(-side * 0.6, 1); f.c.yaw = f.c.targetYaw; f.c.group.rotation.y = f.c.yaw;
    });
  };
  S.cheer = (n = 2.4) => { for (const f of S.fans) f.cheer = n + (f.i % 3) * 0.25; };
  S.update = (t, dt) => {
    for (const c of S.clouds) { c.position.x += dt * 0.6; if (c.position.x > 120) c.position.x = -120; }
    for (const g of S.balloons) { const u = g.userData; g.position.set(u.x + Math.sin(t * 0.3 + u.ph) * 1.2, u.y + Math.sin(t * 0.8 + u.ph) * 0.8, u.z); g.rotation.z = Math.sin(t * 0.7 + u.ph) * 0.08; }
    for (const f of S.fans) { f.cheer = Math.max(0, f.cheer - dt); f.c.pose = f.cheer > 0 ? 'cheer' : 'idle'; f.c.update(dt); }
  };
  return S;
}

// ---------------- een baan ----------------
const waterMat = () => cached('water', () => new THREE.MeshStandardMaterial({ map: tex.water(1, 1), color: 0x8ad0ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95, emissive: 0x2a6ab0, emissiveIntensity: 0.25 }));
const chevMat = (color) => cached('chevmat' + color, () => new THREE.MeshBasicMaterial({ map: chevTex(color), transparent: true, depthWrite: false, opacity: 0.9 }));
const woodMat = () => cached('wood', () => new THREE.MeshStandardMaterial({ map: tex.planks(1, 1), roughness: 0.85 }));
const stoneMat = () => cached('stone', () => new THREE.MeshStandardMaterial({ map: tex.stone(1, 1), color: 0xd8d0c0, roughness: 0.9, flatShading: true }));
const tmpO = new THREE.Object3D();

export function buildHole(ctx, C) {
  const def = C.def, T = THEMES[def.theme] || THEMES.weide, B = bounds(def);
  const root = new THREE.Group();
  const H = { group: root, T, B, bump: [], flag: null, pads: [], belts: [], lifts: [], dynV: [], swirlV: [], own: [] };
  const add = (m) => { root.add(m); return m; };
  const own = (x) => { H.own.push(x); return x; };
  const stripe = (i, a, b) => (i % 2 ? a : b);
  // vilt
  const sh = new THREE.Shape(); def.poly.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z))); sh.closePath();
  const fg = new THREE.ShapeGeometry(sh); fg.rotateX(-Math.PI / 2);
  add(mesh(fg, cached('feltm' + T.felt, () => new THREE.MeshStandardMaterial({ map: feltTex(T), roughness: 0.95 })), { cast: false }));
  // dikke onderrand rond de omtrek (zodat de baan als een plank boven het gras zweeft)
  const sh2 = new THREE.Shape(); def.poly.forEach(([x, z], i) => (i ? sh2.lineTo(x, z) : sh2.moveTo(x, z))); sh2.closePath();
  const slabG = new THREE.ExtrudeGeometry(sh2, { depth: 0.9, bevelEnabled: false }); slabG.rotateX(Math.PI / 2); slabG.translate(0, -0.01, 0);
  add(mesh(slabG, cached('slab', () => new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9, flatShading: true })), { cast: false, receive: false }));
  // randen (omtrek + tussenwanden)
  const railM = mat(T.rail, { flatShading: true }), trimM = mat(T.trim, { flatShading: true });
  const wallTh = WALL_T * 2 + 0.22, bw = [];
  C.walls.forEach((w) => {
    const x1 = w[0], z1 = w[1], x2 = w[2], z2 = w[3], dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz); if (l < 1e-3) return;
    const a = -Math.atan2(dz, dx);
    add(mesh(new THREE.BoxGeometry(l + wallTh, WALL_H * 0.95, wallTh), railM, { pos: [(x1 + x2) / 2, WALL_H * 0.475, (z1 + z2) / 2], rot: [0, a, 0] }));
    add(mesh(new THREE.BoxGeometry(l + wallTh, 0.1, wallTh * 0.78), trimM, { cast: false, pos: [(x1 + x2) / 2, WALL_H * 0.95 + 0.04, (z1 + z2) / 2], rot: [0, a, 0] }));
  });
  // zand en ijs
  for (const s of C.sand) add(mesh(boxUV(s[2] - s[0], 0.06, s[3] - s[1], 3.5), cached('sandm', () => new THREE.MeshStandardMaterial({ map: sandTex(), roughness: 1 })), { cast: false, pos: [(s[0] + s[2]) / 2, 0.03, (s[1] + s[3]) / 2] }));
  for (const s of C.ice) add(mesh(boxUV(s[2] - s[0], 0.05, s[3] - s[1], 6), cached('icem', () => new THREE.MeshStandardMaterial({ map: iceTex(), roughness: 0.08, metalness: 0.15, emissive: 0x3a6a8a, emissiveIntensity: 0.18 })), { cast: false, pos: [(s[0] + s[2]) / 2, 0.025, (s[1] + s[3]) / 2] }));
  // water
  for (const w of C.water) {
    const g = new THREE.PlaneGeometry(w[2] - w[0], w[3] - w[1]); g.rotateX(-Math.PI / 2); g.translate((w[0] + w[2]) / 2, 0.035, (w[1] + w[3]) / 2); scaleUV(g, (w[2] - w[0]) / 3, (w[3] - w[1]) / 3);
    add(new THREE.Mesh(g, waterMat()));
    add(mesh(new THREE.BoxGeometry(w[2] - w[0] + 0.1, 0.06, w[3] - w[1] + 0.1), mat(0x3a8ac0), { cast: false, receive: false, pos: [(w[0] + w[2]) / 2, 0.0, (w[1] + w[3]) / 2] }));
  }
  for (const br of C.bridges) {
    const len = br[2] - br[0], wd = br[3] - br[1], cx = (br[0] + br[2]) / 2, cz = (br[1] + br[3]) / 2;
    add(mesh(scaleUV(new THREE.BoxGeometry(len + 0.2, 0.16, wd), len / 2, 1), woodMat(), { cast: false, pos: [cx, 0.11, cz] }));
    for (const sx of [0, 1]) for (const sz of [-1, 1]) add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), mat(0x5b3d24), { cast: false, pos: [br[sx ? 2 : 0], 0.25, cz + sz * (wd / 2)] }));
  }
  // ophaalbruggen (bewegend)
  C.lifts.forEach((l) => {
    const len = l.r[2] - l.r[0], wd = l.r[3] - l.r[1], cz = (l.r[1] + l.r[3]) / 2;
    const g = new THREE.Group(); g.userData.dyn = true; g.position.set(l.r[2], 0.11, cz); add(g);
    const pm = own(new THREE.MeshStandardMaterial({ map: tex.planks(1, 1), roughness: 0.85, emissive: 0xff2010, emissiveIntensity: 0 }));
    const plank = mesh(scaleUV(new THREE.BoxGeometry(len, 0.16, wd), len / 2, 1), pm, { cast: true, pos: [-len / 2, 0, 0] }); g.add(plank);
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(len, 0.3, 0.12), mat(0x5b3d24), { pos: [-len / 2, 0.2, sx * (wd / 2 - 0.05)] }));
    for (const sz of [-1, 1]) for (const px of [0.3, len - 0.3]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), mat(0x5b3d24), { cast: false, pos: [-px, 0.14, sz * (wd / 2)] }));
    mergeStatic(g, { local: true }); H.lifts.push({ l, g, pm, th: 0 });
  });
  // schansen
  for (const rp of C.ramps) {
    const [x0, z0, x1, z1] = rp.r, ang = Math.atan2(rp.dir[1], rp.dir[0]), along = Math.abs(rp.dir[0]) > 0.5 ? x1 - x0 : z1 - z0, across = Math.abs(rp.dir[0]) > 0.5 ? z1 - z0 : x1 - x0;
    const sp = new THREE.Shape(); sp.moveTo(0, 0); sp.lineTo(along, 0); sp.lineTo(along, 0.62); sp.closePath();
    const g = new THREE.ExtrudeGeometry(sp, { depth: across, bevelEnabled: false }); g.translate(-along / 2, 0, -across / 2);
    const rm = new THREE.Mesh(g, smat(0xffa23a, { roughness: 0.5, emissive: 0xff7a10, emissiveIntensity: 0.25, flatShading: true })); rm.castShadow = true;
    const grp = new THREE.Group(); grp.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); grp.rotation.y = -ang; grp.add(rm); add(grp);
    add(new THREE.Mesh(flatQuad((x0 + x1) / 2 - rp.dir[0] * (along + 0.4), (z0 + z1) / 2 - rp.dir[1] * (along + 0.4), along, across, ang, 0.04, 1.2), chevMat('#ffffff')));
  }
  // boost-pads en lopende banden (de pijltjes schuiven mee)
  const animTex = (r, dir, color, speed, kind) => {
    const [x0, z0, x1, z1] = r, ang = Math.atan2(dir[1], dir[0]), along = Math.abs(dir[0]) > 0.5 ? x1 - x0 : z1 - z0, across = Math.abs(dir[0]) > 0.5 ? z1 - z0 : x1 - x0;
    const ct = own(chevTex(color).clone()); ct.needsUpdate = true;
    const m = new THREE.Mesh(flatQuad((x0 + x1) / 2, (z0 + z1) / 2, along, across, ang, 0.045, 1.1), own(new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false }))); m.userData.dyn = true; add(m);
    return { m, ct, speed, kind };
  };
  for (const pd of C.pads) H.pads.push(animTex(pd.r, pd.dir, '#7aff9a', 0.8));
  for (const bl of C.belts) {
    H.belts.push(animTex(bl.r, bl.dir, '#ffcf5a', bl.speed / 1.1));
    const [x0, z0, x1, z1] = bl.r, hz = hazardTex(); const hm = cached('hazm', () => new THREE.MeshStandardMaterial({ map: hz, roughness: 0.6 }));
    if (Math.abs(bl.dir[0]) > 0.5) { for (const zz of [z0, z1]) add(mesh(scaleUV(new THREE.BoxGeometry(x1 - x0, 0.12, 0.3), (x1 - x0) / 0.9, 1), hm, { cast: false, pos: [(x0 + x1) / 2, 0.06, zz + (zz === z0 ? 0.15 : -0.15)] })); }
    else { for (const xx of [x0, x1]) add(mesh(scaleUV(new THREE.BoxGeometry(0.3, 0.12, z1 - z0), 1, (z1 - z0) / 0.9), hm, { cast: false, pos: [xx + (xx === x0 ? 0.15 : -0.15), 0.06, (z0 + z1) / 2] })); }
  }
  // gat + vlag (een groepje, want het gat kan bewegen)
  const [cx, cz] = def.cup;
  if (def.cupMove) {
    const cm = def.cupMove, len = cm.amp * 2 + 3.2, ang = Math.atan2(cm.az, cm.ax);
    add(mesh(new THREE.BoxGeometry(len, 0.07, 2.8), smat(0xd8a030, { metalness: 0.4, roughness: 0.4 }), { cast: false, pos: [cx, 0.035, cz], rot: [0, -ang, 0] }));
    for (const s of [-1, 1]) add(mesh(new THREE.BoxGeometry(len + 0.3, 0.16, 0.12), smat(0xffe9a0, { metalness: 0.5 }), { cast: false, pos: [cx - Math.sin(ang) * s * 1.45, 0.08, cz + Math.cos(ang) * s * 1.45], rot: [0, -ang, 0] }));
  }
  const cupG = new THREE.Group(); cupG.userData.dyn = true; cupG.position.set(cx, 0, cz); add(cupG); H.cupG = cupG;
  const white = mat(0xffffff, { flatShading: false });
  cupG.add(mesh(new THREE.CircleGeometry(CUP_R, 24), bmat(0x0a0a12), { cast: false, receive: false, pos: [0, 0.04, 0], rot: [-Math.PI / 2, 0, 0] }));
  cupG.add(mesh(new THREE.TorusGeometry(CUP_R + 0.06, 0.07, 6, 24), white, { cast: false, pos: [0, 0.05, 0], rot: [Math.PI / 2, 0, 0] }));
  cupG.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 5), white, { cast: false, pos: [0, 1.55, 0] }));
  mergeStatic(cupG, { local: true });
  const fl = cached('flaggeo', () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.3, -0.35, 0, 0, -0.75, 0], 3)); g.computeVertexNormals(); return g; });
  const flag = new THREE.Mesh(fl, bmat(def.sudden ? 0xffd23f : 0xe8312a, { side: THREE.DoubleSide })); flag.position.set(0, 3.05, 0); cupG.add(flag); H.flag = flag;
  const hring = new THREE.Mesh(cached('hringgeo', () => { const g = new THREE.RingGeometry(CUP_R + 0.2, CUP_R + 0.4, 28); g.rotateX(-Math.PI / 2); return g; }), own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
  hring.position.set(0, 0.06, 0); cupG.add(hring); H.hring = hring;
  // tee-matjes
  def.tee.forEach(([x, z], i) => add(mesh(new THREE.BoxGeometry(1.5, 0.05, 1.5), smat(i ? 0x3a78e0 : 0x2f9e5b), { cast: false, pos: [x, 0.03, z] })));
  // bumpers: paddenstoelen (stam + stippen samengevoegd, kappen als een instanced mesh)
  if (C.bumpers.length) {
    const n = C.bumpers.length, capM = cached('bumpcap', () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x3a3a3a })), rm = cached('bumpring', () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    const caps = new THREE.InstancedMesh(capGeo(), capM, n), rings = new THREE.InstancedMesh(ringGeo(), rm, n); caps.frustumCulled = rings.frustumCulled = false; caps.castShadow = true; caps.userData.dyn = rings.userData.dyn = true;
    C.bumpers.forEach((bp, i) => {
      add(mesh(new THREE.CylinderGeometry(bp[2] * 0.55, bp[2] * 0.7, 0.6, 10), mat(0xf4ecd8, { flatShading: false }), { pos: [bp[0], 0.3, bp[1]] }));
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; add(mesh(new THREE.SphereGeometry(bp[2] * 0.14, 6, 5), mat(0xffffff), { cast: false, pos: [bp[0] + Math.cos(a) * bp[2] * 0.62, 0.55 + bp[2] * 0.52, bp[1] + Math.sin(a) * bp[2] * 0.62] })); }
      caps.setColorAt(i, new THREE.Color(T.bump[i % T.bump.length])); H.bump.push({ bp, hit: 0 });
    });
    caps.instanceColor.needsUpdate = true; for (let i = 0; i < n; i++) rings.setColorAt(i, new THREE.Color(0, 0, 0));
    add(caps); add(rings); H.caps = caps; H.rings = rings;
  }
  // pilaren
  for (const pl of C.pillars) {
    add(mesh(new THREE.CylinderGeometry(pl[2], pl[2] * 1.08, 1.0, 14), stoneMat(), { pos: [pl[0], 0.5, pl[1]] }));
    add(mesh(new THREE.ConeGeometry(pl[2] * 1.5, 1.1, 14), smat(def.theme === 'kermis' ? 0xff4a6a : 0xc0402a), { pos: [pl[0], 1.55, pl[1]] }));
    add(mesh(new THREE.SphereGeometry(0.18, 8, 6), smat(0xffd23f, { emissive: 0xffd23f, emissiveIntensity: 0.5 }), { cast: false, pos: [pl[0], 2.2, pl[1]] }));
  }
  // draaikolk / carrousel
  for (const sw of C.swirls) {
    const cols = [T.rail, 0xffffff, T.bump[0]];
    add(mesh(new THREE.CylinderGeometry(sw.r, sw.r, 0.1, 36), smat(cols[0]), { cast: false, pos: [sw.x, 0.05, sw.z] }));
    add(mesh(new THREE.CylinderGeometry(sw.r * 0.8, sw.r * 0.8, 0.12, 36), smat(cols[1]), { cast: false, pos: [sw.x, 0.06, sw.z] }));
    add(mesh(new THREE.CylinderGeometry(sw.r * 0.6, sw.r * 0.6, 0.14, 36), smat(cols[2]), { cast: false, pos: [sw.x, 0.07, sw.z] }));
    const g = new THREE.Group(); g.userData.dyn = true; g.position.set(sw.x, 0, sw.z); add(g);
    const nh = 6, hc = [0xffe14a, 0xff6ad0, 0x4ac8ff, 0x8dff9a, 0xff9a3a, 0xc86aff];
    for (let k = 0; k < nh; k++) {
      const a = k / nh * TAU, rr = sw.r * 0.8, hx = Math.cos(a) * rr, hz = Math.sin(a) * rr;
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 5), smat(0xffffff), { cast: false, pos: [hx, 0.75, hz] }));
      g.add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.4), smat(hc[k % 6]), { pos: [hx, 0.9, hz], rot: [0, -a + Math.PI / 2, 0] }));
      g.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), smat(hc[k % 6]), { pos: [hx - Math.sin(a) * 0.5 * -1, 1.15, hz + Math.cos(a) * 0.5 * -1] }));
    }
    mergeStatic(g, { local: true }); H.swirlV.push({ sw, g });
  }
  // portalen: donkere schijf + gekleurde rand (vast), draaiende spiraal (instanced)
  if (C.portals.length) {
    const n = C.portals.length, pm = cached('portalswirl', () => new THREE.MeshBasicMaterial({ map: swirlTex(), transparent: true, depthWrite: false }));
    const pg = cached('portalgeo', () => { const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2); return g; });
    const inst = new THREE.InstancedMesh(pg, pm, n); inst.frustumCulled = false; inst.userData.dyn = true;
    C.portals.forEach((e, i) => {
      add(mesh(new THREE.CircleGeometry(e.r * 1.1, 20), bmat(0x120a24), { cast: false, receive: false, pos: [e.x, 0.05, e.z], rot: [-Math.PI / 2, 0, 0] }));
      add(mesh(new THREE.TorusGeometry(e.r * 1.1, 0.1, 6, 20), smat(e.col, { emissive: e.col, emissiveIntensity: 0.7, flatShading: false }), { cast: false, pos: [e.x, 0.09, e.z], rot: [Math.PI / 2, 0, 0] }));
      inst.setColorAt(i, new THREE.Color(e.col));
    });
    inst.instanceColor.needsUpdate = true; add(inst); H.portalI = inst;
  }
  // beweeglijke delen
  for (const d of C.dyn) {
    if (d.visual === 'mill') {
      add(mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.9, 10), stoneMat(), { pos: [d.x, 0.95, d.z] }));
      add(mesh(new THREE.ConeGeometry(1.0, 1.1, 10), mat(0xc0402a), { pos: [d.x, 2.35, d.z] }));
      add(mesh(new THREE.BoxGeometry(0.36, 0.6, 0.05), mat(0x4a2e1a), { cast: false, pos: [d.x, 0.3, d.z + 0.88] }));
      const rotor = new THREE.Group(); rotor.userData.dyn = true; rotor.position.set(d.x, 0.7, d.z); add(rotor);
      for (let k = 0; k < 4; k++) {
        const bl = new THREE.Group(); bl.rotation.y = -k * Math.PI / 2; rotor.add(bl);
        bl.add(mesh(new THREE.BoxGeometry(d.len, 0.3, d.th * 2), mat(0x8a5a2b), { pos: [d.len / 2, 0, 0] }));
        bl.add(mesh(new THREE.BoxGeometry(d.len * 0.68, 0.06, 0.95), mat(k % 2 ? 0xffffff : 0xe8312a, { side: THREE.DoubleSide }), { cast: false, pos: [d.len * 0.6, 0.18, -0.5] }));
      }
      rotor.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 8), mat(0xd8a030), { pos: [0, 0.1, 0] }));
      mergeStatic(rotor, { local: true }); H.dynV.push({ d, g: rotor, kind: 'spin' });
    } else if (d.kind === 'spin') {
      const g = new THREE.Group(); g.userData.dyn = true; g.position.set(d.x, 0, d.z); add(g);
      g.add(mesh(new THREE.CylinderGeometry(d.hub + 0.1, d.hub + 0.25, 0.6, 12), smat(0x9a5aff), { pos: [0, 0.3, 0] }));
      for (let k = 0; k < d.n; k++) {
        const a = k * TAU / d.n, bl = new THREE.Group(); bl.rotation.y = -a; g.add(bl);
        bl.add(mesh(new THREE.BoxGeometry(d.len, 0.4, d.th * 2), smat(stripe(k, 0xffd23f, 0xff6ad0)), { pos: [d.len / 2, 0.5, 0] }));
        bl.add(mesh(new THREE.SphereGeometry(d.th * 1.5, 8, 6), smat(0xffffff), { pos: [d.len, 0.5, 0] }));
      }
      mergeStatic(g, { local: true }); H.dynV.push({ d, g, kind: 'spin' });
    } else if (d.kind === 'swing') {
      add(mesh(new THREE.CylinderGeometry(d.hub * 1.15, d.hub * 1.3, 1.2, 12), smat(0x6a6a78), { pos: [d.x, 0.6, d.z] }));
      const g = new THREE.Group(); g.userData.dyn = true; g.position.set(d.x, 0, d.z); add(g);
      g.add(mesh(new THREE.BoxGeometry(d.len, 0.3, d.th * 1.6), smat(0x8a5a2b), { pos: [d.len / 2, 0.62, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(d.head, d.head, 0.95, 16), smat(0xe8312a), { pos: [d.len, 0.5, 0] }));
      g.add(mesh(new THREE.CylinderGeometry(d.head * 1.05, d.head * 1.05, 0.14, 16), smat(0xffffff), { pos: [d.len, 0.5, 0] }));
      g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), smat(0xffd23f), { pos: [0, 1.25, 0] }));
      mergeStatic(g, { local: true }); H.dynV.push({ d, g, kind: 'swing' });
    } else if (d.kind === 'slide') {
      const g = new THREE.Group(); g.userData.dyn = true; g.rotation.y = -d.ang; g.position.set(d.px, 0, d.pz); add(g);
      g.add(mesh(new THREE.BoxGeometry(d.len, 0.9, d.th * 1.7), smat(0x8a5a2b), { pos: [0, 0.45, 0] }));
      const ns = Math.max(4, Math.round(d.len / 0.8));
      for (let k = 0; k < ns; k++) g.add(mesh(new THREE.BoxGeometry(d.len / ns, 0.1, d.th * 2.3), smat(k % 2 ? 0x2a2a38 : 0xffd23f), { cast: false, pos: [-d.len / 2 + (k + 0.5) * d.len / ns, 0.93, 0] }));
      mergeStatic(g, { local: true }); H.dynV.push({ d, g, kind: 'slide' });
    }
  }
  // vloer-sier: kleine stippen/bloemetjes op het vilt
  const rng = mulberry32(def.id * 17);
  for (let i = 0; i < 22; i++) { const x = B.x0 + rng() * B.w, z = B.z0 + rng() * B.d; if (!isInside(def.poly, x, z) || nearAnything(C, x, z, 1.5)) continue; add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 6), mat([0xffffff, 0xffe14a, 0xff9ad0][i % 3]), { cast: false, receive: false, pos: [x, 0.03, z] })); }
  decor(root, def, B, T, rng, add);
  mergeStatic(root);
  // animatie
  const dmx = new THREE.Object3D(), col = new THREE.Color();
  H.update = (t, dt) => {
    waterMat().map.offset.set(t * 0.03, t * 0.02);
    for (const p of H.pads) p.ct.offset.x -= dt * p.speed;
    for (const p of H.belts) p.ct.offset.x -= dt * p.speed;
    H.flag.rotation.y = Math.sin(t * 5) * 0.25; H.flag.scale.x = 1 + Math.sin(t * 7) * 0.06;
    H.hring.scale.setScalar(1 + Math.sin(t * 4) * 0.12); H.hring.material.opacity = 0.35 + Math.sin(t * 4) * 0.2;
    if (C.cupMove) cupG.position.set(C.cup[0], 0, C.cup[1]);
    if (H.caps) {
      H.bump.forEach((b, i) => {
        b.hit = Math.max(0, b.hit - dt * 4); const s = 1 + b.hit * 0.22, r = b.bp[2];
        dmx.position.set(b.bp[0], 0.55, b.bp[1]); dmx.scale.set(r * s, r * 0.8 * (1 - b.hit * 0.18), r * s); dmx.updateMatrix(); H.caps.setMatrixAt(i, dmx.matrix);
        const k = b.hit * 0.8; col.setRGB(k, k, k); H.rings.setColorAt(i, col); const rs = r * (1 + (1 - b.hit) * 0.5); dmx.position.set(b.bp[0], 0.06, b.bp[1]); dmx.scale.set(rs, 1, rs); dmx.updateMatrix(); H.rings.setMatrixAt(i, dmx.matrix);
      });
      H.caps.instanceMatrix.needsUpdate = H.rings.instanceMatrix.needsUpdate = true; H.rings.instanceColor.needsUpdate = true;
    }
    for (const v of H.dynV) { if (v.kind === 'slide') v.g.position.set(v.d.px, 0, v.d.pz); else v.g.rotation.y = -v.d.cur; }
    for (const v of H.swirlV) v.g.rotation.y = -v.sw.w * C.t;
    if (H.portalI) { C.portals.forEach((e, i) => { dmx.position.set(e.x, 0.075, e.z); dmx.rotation.set(0, t * (i % 2 ? 2.2 : -2.2) + i, 0); const s = e.r * 2.5 * (1 + Math.sin(t * 3 + i) * 0.06); dmx.scale.set(s, 1, s); dmx.updateMatrix(); H.portalI.setMatrixAt(i, dmx.matrix); }); dmx.rotation.set(0, 0, 0); H.portalI.instanceMatrix.needsUpdate = true; }
    for (const v of H.lifts) {
      const up = !v.l.down; v.th = lerp(v.th, up ? 1.25 : 0, 1 - Math.exp(-dt * 7)); v.g.rotation.z = -v.th - (v.l.warn ? Math.sin(t * 40) * 0.03 : 0);
      v.pm.emissiveIntensity = v.l.warn ? 0.35 + Math.sin(t * 16) * 0.35 : 0;
    }
  };
  H.dispose = () => { disposeGroup(root); for (const o of H.own) if (o && o.dispose) o.dispose(); };
  return H;
}

// ---------------- sier langs de rand (per thema, klein en samengevoegd) ----------------
function decor(root, def, B, T, rng, add) {
  const th = def.theme, zb = B.z0 - 2.2, items = [];
  const sph = (r, c, x, y, z, o = {}) => add(mesh(new THREE.SphereGeometry(r, 8, 6), smat(c, o), { pos: [x, y, z] }));
  const cyl = (r, h, c, x, y, z, o = {}) => add(mesh(new THREE.CylinderGeometry(r, r, h, 8), smat(c, o), { pos: [x, y, z] }));
  const cone = (r, h, c, x, y, z, o = {}) => add(mesh(new THREE.ConeGeometry(r, h, 8), smat(c, o), { pos: [x, y, z] }));
  const box = (w, h, d, c, x, y, z, o = {}) => add(mesh(new THREE.BoxGeometry(w, h, d), smat(c, o), { pos: [x, y, z] }));
  const row = (n, fn) => { for (let i = 0; i < n; i++) { const x = B.x0 + 2 + (B.w - 4) * (i + 0.5 + (rng() - 0.5) * 0.5) / n, z = zb - rng() * 1.2; fn(x, z, i); } };
  if (th === 'ijs') row(5, (x, z, i) => { sph(0.9, 0xffffff, x, 0.9, z); sph(0.65, 0xffffff, x, 2.0, z); sph(0.1, 0x222222, x - 0.2, 2.1, z + 0.55); sph(0.1, 0x222222, x + 0.2, 2.1, z + 0.55); cone(0.12, 0.6, 0xff8a2a, x, 1.95, z + 0.8).rotation.x = Math.PI / 2; cyl(0.5, 0.5, i % 2 ? 0xe03a3a : 0x3a78e0, x, 2.7, z); });
  else if (th === 'zand') row(5, (x, z, i) => { cyl(0.28, 2.2 + (i % 2), 0x3a9a48, x, 1.1, z); cyl(0.2, 0.9, 0x3a9a48, x + 0.5, 1.4, z); cyl(0.2, 0.7, 0x3a9a48, x - 0.5, 1.1, z); sph(0.2, 0xff6fa5, x, 2.3 + (i % 2), z); });
  else if (th === 'fabriek') row(5, (x, z, i) => { if (i % 2) { cyl(0.5, 1.0, 0x8a5a2a, x, 0.5, z); cyl(0.52, 0.1, 0x555566, x, 0.3, z); cyl(0.52, 0.1, 0x555566, x, 0.75, z); } else { box(1.1, 1.1, 1.1, 0xb98a54, x, 0.55, z); box(1.2, 0.12, 1.2, 0x6b4a2e, x, 0.1, z); box(1.2, 0.12, 1.2, 0x6b4a2e, x, 1.05, z); } cyl(0.35, 3 + (i % 3), 0x6a6a78, x + 1.4, 1.6, z - 1.0); cyl(0.4, 0.3, 0xffd23f, x + 1.4, 3.1 + (i % 3), z - 1.0); });
  else if (th === 'portal' || th === 'spiegel' || th === 'zweef') row(6, (x, z, i) => { const c = [0xc86aff, 0x4ac8ff, 0xff6ad0, 0xffd23f][(th === 'zweef' ? i + 1 : i) % 4]; const h = 1.5 + (i % 3) * 0.6; cone(0.4, h, c, x, h / 2, z, { emissive: c, emissiveIntensity: 0.6, roughness: 0.2 }); cone(0.25, h * 0.6, c, x + 0.5, h * 0.3, z + 0.2, { emissive: c, emissiveIntensity: 0.6 }); });
  else if (th === 'kermis') row(6, (x, z, i) => { const c = [0xff4a6a, 0xffe14a, 0x4ac8ff][i % 3]; cyl(0.1, 3, 0xffffff, x, 1.5, z); sph(0.5, c, x, 3.2, z, { emissive: c, emissiveIntensity: 0.3 }); cone(0.5, 0.6, c === 0xffe14a ? 0xff4a6a : 0xffe14a, x, 3.9, z); });
  else if (th === 'gracht' || th === 'burcht') {
    const tw = (x, z, h = 4.2, r = 1.2) => { cyl(r, h, 0xb9b4c8, x, h / 2, z); cyl(r * 1.25, 0.9, 0xa49fb8, x, h + 0.4, z); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; box(0.6, 0.6, 0.6, 0xa49fb8, x + Math.cos(a) * r * 1.2, h + 1.1, z + Math.sin(a) * r * 1.2); } cone(r * 1.35, 2.6, 0x3b58a8, x, h + 2.7, z); };
    if (th === 'gracht') tw(9, -7.8, 3.6, 1.0);
    row(th === 'gracht' ? 2 : 3, (x, z) => tw(x, z - 0.8, 2.6 + rng() * 1.2, 0.85));
  } else if (th === 'labyrint') row(6, (x, z, i) => { box(2.6, 1.6 + (i % 2) * 0.5, 1.1, 0x2f8a3a, x, 0.9, z); sph(0.6, 0x3f9e3a, x, 2.0 + (i % 2) * 0.5, z); });
  else if (th === 'deur' || th === 'hamer') row(5, (x, z, i) => { if (i % 2) { cyl(0.5, 1.0, 0x8a5a2a, x, 0.5, z); cyl(0.52, 0.1, 0x555566, x, 0.3, z); } else { box(1.1, 1.1, 1.1, 0xb98a54, x, 0.55, z); box(1.2, 0.12, 1.2, 0x6b4a2e, x, 1.05, z); } });
  else if (th === 'goud') row(6, (x, z, i) => { cyl(0.6, 0.12, 0xffd23f, x, 0.3 + i % 3 * 0.15, z, { metalness: 0.6, emissive: 0xffa000, emissiveIntensity: 0.3 }); cyl(0.6, 0.12, 0xffd23f, x, 0.06, z); });
  else row(5, (x, z, i) => { const b = P.bush(1.4 + (i % 3) * 0.4, i % 2 ? 0x3b9a45 : 0x4fae4a); b.position.set(x, 0, z); root.add(b); sph(0.2, [0xff6fa5, 0xffe14a, 0xffffff][i % 3], x + 1.2, 0.2, z + 0.9); });
}
function nearAnything(C, x, z, r) {
  for (const w of C.water) if (x > w[0] - r && x < w[2] + r && z > w[1] - r && z < w[3] + r) return true;
  for (const b of C.bumpers) if (Math.hypot(x - b[0], z - b[1]) < b[2] + r) return true;
  for (const b of C.pillars) if (Math.hypot(x - b[0], z - b[1]) < b[2] + r) return true;
  for (const t of C.def.tee) if (Math.hypot(x - t[0], z - t[1]) < 2) return true;
  if (Math.hypot(x - C.def.cup[0], z - C.def.cup[1]) < 2.2) return true;
  if (C.cupMove) { const m = C.cupMove; if (Math.abs(x - C.def.cup[0]) < 1.9 && Math.abs(z - C.def.cup[1]) < m.amp + 1.9) return true; }
  for (const w of C.walls) { const dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz; let u = l2 ? ((x - w[0]) * dx + (z - w[1]) * dz) / l2 : 0; u = clamp(u, 0, 1); if (Math.hypot(x - (w[0] + dx * u), z - (w[1] + dz * u)) < r) return true; }
  for (const q of [...C.ramps.map((q) => q.r), ...C.pads.map((q) => q.r), ...C.belts.map((q) => q.r), ...C.sand, ...C.ice]) if (x > q[0] - r && x < q[2] + r && z > q[1] - r && z < q[3] + r) return true;
  for (const s of C.swirls) if (Math.hypot(x - s.x, z - s.z) < s.r + r) return true;
  for (const p of C.portals) if (Math.hypot(x - p.x, z - p.z) < p.r + r + 0.5) return true;
  for (const d of C.dyn) if (Math.hypot(x - d.x, z - d.z) < (d.len || 3) + 1.5) return true;
  return false;
}
