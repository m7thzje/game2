import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp, lerp, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { skyTexture } from '../engine/lights.js';
import * as P from '../engine/props.js';
import { makeNPC } from '../engine/chars.js';
import { mergeStatic } from './golf_merge.js';
import { bounds, millBlades, CUP_R, WALL_T, WALL_H } from './golf_course.js';

// Omgeving en bouw van de banen van "Minigolf-Race": een zonnig speelhal-park op een heuvel voor een kasteel in de berg,
// met ballonnen, wolken, bomen en juichende toeschouwers. Elke baan is een vilt-vlak met houten randen.
const THEMES = {
  weide: { rail: 0x9a6a3a, trim: 0xfff2d0, felt: '#43b84e', felt2: '#3aa845', bump: [0xe03a3a, 0xffd23f, 0xe03a3a] },
  molen: { rail: 0x7a7a98, trim: 0xe8e8f4, felt: '#3fb5a0', felt2: '#36a590', bump: [0xff9a3a, 0xffffff, 0xff9a3a] },
  burcht: { rail: 0x5a4a78, trim: 0xe0524a, felt: '#4aa05a', felt2: '#409050', bump: [0x9a5aff, 0xff5ad8, 0x9a5aff] },
  goud: { rail: 0xb8892a, trim: 0xffe9a0, felt: '#2ea86a', felt2: '#279a5f', bump: [0xffd23f, 0xffffff, 0xffd23f] },
};
const hexCss = (h) => '#' + new THREE.Color(h).getHexString();

function feltTexture(t) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = t.felt; g.fillRect(0, 0, w, h);
    g.fillStyle = t.felt2; for (let i = 0; i < 4; i++) g.fillRect(0, i * 32 + 16, w, 16);
    const r = mulberry32(3); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [0.25, 0.25] });
}
function chevronTex(color) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = 'rgba(20,30,50,.55)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
    for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(10 + i * 28, 10); g.lineTo(28 + i * 28, 32); g.lineTo(10 + i * 28, 54); g.stroke(); }
  });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

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
  for (const sx of [-17, 17, 0]) { const tw = P.tower(sx === 0 ? 20 : 15, 3.2); tw.position.set(sx, 0, 0); castle.add(tw); }
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
  S.clouds = []; for (let i = 0; i < 6; i++) { const c = P.cloud(2 + rng() * 2); c.position.set(-90 + i * 36, 34 + rng() * 14, -70 - rng() * 30); root.add(c); S.clouds.push(c); }
  S.balloons = [];
  const bcols = [0xff4a6a, 0xffd23f, 0x4ac8ff, 0x7aff6a, 0xff8a3a, 0xc86aff, 0xff6ad0];
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group(); const col = bcols[i % bcols.length];
    g.add(mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.1, emissive: col, emissiveIntensity: 0.15 }), { cast: false, scale: [1, 1.2, 1] }));
    g.add(mesh(new THREE.ConeGeometry(0.22, 0.4, 6), mat(col), { cast: false, pos: [0, -1.5, 0], rot: [Math.PI, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.2, 3), mat(0xffffff), { cast: false, pos: [0, -3.2, 0] }));
    const side = i % 2 ? 1 : -1; g.userData = { x: side * (22 + (i % 5) * 5), z: -6 - (i % 4) * 7, y: 9 + (i * 3) % 9, ph: i * 1.3, col };
    root.add(g); S.balloons.push(g);
  }
  // toeschouwers (juichen bij een hole-in-one)
  S.fans = []; const kinds = ['princess', 'kid', 'guard', 'goblin', 'jester', 'bard'];
  kinds.forEach((k, i) => { const c = makeNPC(k); const g = new THREE.Group(); g.add(c.group); root.add(g); S.fans.push({ c, g, i, home: [0, 0, 0], cheer: 0 }); });
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
export function buildHole(ctx, C) {
  const def = C.def, T = THEMES[def.theme] || THEMES.weide, B = bounds(def);
  const root = new THREE.Group();
  const H = { group: root, T, B, bump: [], flag: null };
  // vilt
  const sh = new THREE.Shape(); def.poly.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z))); sh.closePath();
  const fg = new THREE.ShapeGeometry(sh); fg.rotateX(-Math.PI / 2);
  const feltMat = new THREE.MeshStandardMaterial({ map: feltTexture(T), roughness: 0.95 });
  root.add(mesh(fg, feltMat, { cast: false, pos: [0, 0, 0] }));
  // dikke onderrand rond de omtrek (zodat de baan als een plank boven het gras zweeft)
  const sh2 = new THREE.Shape(); def.poly.forEach(([x, z], i) => (i ? sh2.lineTo(x, z) : sh2.moveTo(x, z))); sh2.closePath();
  const slabG = new THREE.ExtrudeGeometry(sh2, { depth: 0.9, bevelEnabled: false }); slabG.rotateX(Math.PI / 2); slabG.translate(0, -0.01, 0);
  root.add(mesh(slabG, new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9, flatShading: true }), { cast: false, receive: false }));
  // randen (omtrek + tussenwanden)
  const railM = mat(T.rail, { flatShading: true }), trimM = mat(T.trim, { flatShading: true });
  const wallTh = WALL_T * 2 + 0.22;
  const addWall = (x1, z1, x2, z2, isPoly) => {
    const dx = x2 - x1, dz = z2 - z1, l = Math.hypot(dx, dz); if (l < 1e-3) return;
    const a = -Math.atan2(dz, dx);
    const b = mesh(new THREE.BoxGeometry(l + wallTh, WALL_H * 0.95, wallTh), railM, { pos: [(x1 + x2) / 2, WALL_H * 0.475, (z1 + z2) / 2], rot: [0, a, 0] }); root.add(b);
    const t2 = mesh(new THREE.BoxGeometry(l + wallTh, 0.1, wallTh * 0.78), trimM, { cast: false, pos: [(x1 + x2) / 2, WALL_H * 0.95 + 0.04, (z1 + z2) / 2], rot: [0, a, 0] }); root.add(t2);
  };
  C.walls.forEach((w, i) => addWall(w[0], w[1], w[2], w[3], i < C.polyWalls));
  // water
  H.waters = [];
  for (const w of C.water) {
    const wm = new THREE.MeshStandardMaterial({ map: tex.water((w[2] - w[0]) / 3, (w[3] - w[1]) / 3), color: 0x8ad0ff, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95, emissive: 0x2a6ab0, emissiveIntensity: 0.25 });
    const m = mesh(new THREE.PlaneGeometry(w[2] - w[0], w[3] - w[1]), wm, { cast: false, receive: false, pos: [(w[0] + w[2]) / 2, 0.035, (w[1] + w[3]) / 2], rot: [-Math.PI / 2, 0, 0] });
    root.add(m); H.waters.push({ m, wm });
    const e = mesh(new THREE.BoxGeometry(w[2] - w[0] + 0.1, 0.06, w[3] - w[1] + 0.1), mat(0x3a8ac0), { cast: false, receive: false, pos: [(w[0] + w[2]) / 2, 0.0, (w[1] + w[3]) / 2] }); // donkerder rand onder het water
    root.add(e);
  }
  for (const br of C.bridges) {
    const len = br[2] - br[0], wd = br[3] - br[1], cx = (br[0] + br[2]) / 2, cz = (br[1] + br[3]) / 2, plank = new THREE.MeshStandardMaterial({ map: tex.planks(len / 2, 1), roughness: 0.85 });
    root.add(mesh(new THREE.BoxGeometry(len + 0.2, 0.16, wd), plank, { cast: false, pos: [cx, 0.11, cz] }));
    for (const sx of [0, 1]) for (const sz of [-1, 1]) root.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 6), mat(0x5b3d24), { cast: false, pos: [br[sx ? 2 : 0], 0.25, cz + sz * (wd / 2)] }));
  }
  // schansen
  for (const rp of C.ramps) {
    const [x0, z0, x1, z1] = rp.r, ang = Math.atan2(rp.dir[1], rp.dir[0]), along = Math.abs(rp.dir[0]) > 0.5 ? x1 - x0 : z1 - z0, across = Math.abs(rp.dir[0]) > 0.5 ? z1 - z0 : x1 - x0;
    const sp = new THREE.Shape(); sp.moveTo(0, 0); sp.lineTo(along, 0); sp.lineTo(along, 0.62); sp.closePath();
    const g = new THREE.ExtrudeGeometry(sp, { depth: across, bevelEnabled: false }); g.translate(-along / 2, 0, -across / 2);
    const rm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffa23a, roughness: 0.5, emissive: 0xff7a10, emissiveIntensity: 0.25, flatShading: true })); rm.castShadow = true;
    const grp = new THREE.Group(); grp.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); grp.rotation.y = -ang; grp.add(rm);
    root.add(grp);
    const ct = chevronTex('#ffffff'); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(Math.max(1, Math.round(along / 1.2)), Math.max(1, Math.round(across / 1.2)));
    const dec = new THREE.Mesh(new THREE.PlaneGeometry(along, across), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, opacity: 0.9 })); dec.rotation.x = -Math.PI / 2; dec.rotation.z = ang; dec.position.set((x0 + x1) / 2 - rp.dir[0] * (along + 0.4), 0.04, (z0 + z1) / 2 - rp.dir[1] * (along + 0.4)); root.add(dec);
  }
  // boost-pads
  H.pads = [];
  for (const pd of C.pads) {
    const [x0, z0, x1, z1] = pd.r; const ct = chevronTex('#7aff9a'); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(Math.max(1, Math.round((x1 - x0) / 1.1)), Math.max(1, Math.round((z1 - z0) / 1.1)));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.045, (z0 + z1) / 2); root.add(m); H.pads.push({ m, ct, dir: pd.dir });
  }
  // gat + vlag
  const [cx, cz] = def.cup;
  root.add(mesh(new THREE.CircleGeometry(CUP_R, 24), new THREE.MeshBasicMaterial({ color: 0x0a0a12 }), { cast: false, receive: false, pos: [cx, 0.04, cz], rot: [-Math.PI / 2, 0, 0] }));
  root.add(mesh(new THREE.TorusGeometry(CUP_R + 0.06, 0.07, 6, 24), mat(0xffffff, { flatShading: false }), { cast: false, pos: [cx, 0.05, cz], rot: [Math.PI / 2, 0, 0] }));
  const pole = new THREE.Group(); pole.position.set(cx, 0, cz); root.add(pole);
  pole.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.1, 5), mat(0xf4f4f4), { cast: false, pos: [0, 1.55, 0] }));
  const fl = new THREE.BufferGeometry(); fl.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.3, -0.35, 0, 0, -0.75, 0], 3)); fl.computeVertexNormals();
  const flag = new THREE.Mesh(fl, new THREE.MeshBasicMaterial({ color: def.sudden ? 0xffd23f : 0xe8312a, side: THREE.DoubleSide })); flag.userData.dyn = true; flag.position.set(0, 3.05, 0); pole.add(flag); H.flag = flag;
  // pulserende ring rond het gat
  const hring = new THREE.Mesh(new THREE.RingGeometry(CUP_R + 0.2, CUP_R + 0.4, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); hring.userData.dyn = true; hring.rotation.x = -Math.PI / 2; hring.position.set(cx, 0.06, cz); root.add(hring); H.hring = hring;
  // tee-matjes
  H.tees = def.tee.map(([x, z], i) => { const m = mesh(new THREE.BoxGeometry(1.5, 0.05, 1.5), new THREE.MeshStandardMaterial({ color: i ? 0x3a78e0 : 0x2f9e5b, roughness: 0.6 }), { cast: false, pos: [x, 0.03, z] }); root.add(m); return m; });
  // bumpers: paddenstoelen
  C.bumpers.forEach((bp, i) => {
    const g = new THREE.Group(); g.userData.dyn = true; g.position.set(bp[0], 0, bp[1]); const col = T.bump[i % T.bump.length];
    g.add(mesh(new THREE.CylinderGeometry(bp[2] * 0.55, bp[2] * 0.7, 0.6, 10), mat(0xf4ecd8, { flatShading: false }), { pos: [0, 0.3, 0] }));
    const cap = mesh(new THREE.SphereGeometry(bp[2], 14, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, emissive: col, emissiveIntensity: 0.25 }), { pos: [0, 0.55, 0], scale: [1, 0.8, 1] }); g.add(cap);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.add(mesh(new THREE.SphereGeometry(bp[2] * 0.14, 6, 5), mat(0xffffff), { cast: false, pos: [Math.cos(a) * bp[2] * 0.62, 0.55 + bp[2] * 0.52, Math.sin(a) * bp[2] * 0.62] })); }
    const rg = new THREE.Mesh(new THREE.RingGeometry(bp[2] * 1.02, bp[2] * 1.3, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); rg.rotation.x = -Math.PI / 2; rg.position.y = 0.06; g.add(rg);
    root.add(g); H.bump.push({ g, cap, rg, hit: 0, bp });
  });
  // molen
  if (C.mill) {
    const m = C.mill; const g = new THREE.Group(); g.position.set(m.x, 0, m.z); root.add(g);
    const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(1, 1), color: 0xd8d0c0, roughness: 0.9, flatShading: true });
    g.add(mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.9, 10), stoneM, { pos: [0, 0.95, 0] }), mesh(new THREE.ConeGeometry(1.0, 1.1, 10), mat(0xc0402a), { pos: [0, 2.35, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.36, 0.6, 0.05), mat(0x4a2e1a), { cast: false, pos: [0, 0.3, 0.88] }));
    const rotor = new THREE.Group(); rotor.userData.dyn = true; rotor.position.y = 0.7; g.add(rotor); H.rotor = rotor;
    for (let k = 0; k < 4; k++) {
      const bl = new THREE.Group(); bl.rotation.y = -k * Math.PI / 2; rotor.add(bl);
      bl.add(mesh(new THREE.BoxGeometry(m.len, 0.3, m.w), mat(0x8a5a2b), { pos: [m.len / 2, 0, 0] }));
      bl.add(mesh(new THREE.BoxGeometry(m.len * 0.68, 0.06, 0.95), mat(k % 2 ? 0xffffff : 0xe8312a, { side: THREE.DoubleSide }), { cast: false, pos: [m.len * 0.6, 0.18, -0.5] }));
    }
    rotor.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 8), mat(0xd8a030), { pos: [0, 0.1, 0] }));
  }
  // vloer-sier: kleine stippen/bloemetjes op het vilt
  const rng = mulberry32(def.id * 17);
  const flowers = new THREE.Group(); root.add(flowers);
  for (let i = 0; i < 26; i++) { const x = B.x0 + rng() * B.w, z = B.z0 + rng() * B.d; if (!isInside(def.poly, x, z) || nearAnything(C, x, z, 1.4)) continue; flowers.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 6), mat([0xffffff, 0xffe14a, 0xff9ad0][i % 3]), { cast: false, receive: false, pos: [x, 0.03, z] })); }
  mergeStatic(root);
  // water-animatie / vlag
  H.update = (t, dt) => {
    for (const w of H.waters) { w.wm.map.offset.set(t * 0.03, t * 0.02); }
    for (const p of H.pads) { p.ct.offset.x -= dt * 0.8 * p.dir[0]; p.ct.offset.y -= dt * 0.8 * p.dir[1]; }
    if (H.flag) { H.flag.rotation.y = Math.sin(t * 5) * 0.25; H.flag.scale.x = 1 + Math.sin(t * 7) * 0.06; }
    H.hring.scale.setScalar(1 + Math.sin(t * 4) * 0.12); H.hring.material.opacity = 0.35 + Math.sin(t * 4) * 0.2;
    for (const b of H.bump) { b.hit = Math.max(0, b.hit - dt * 4); const s = 1 + b.hit * 0.22; b.cap.scale.set(s, 0.8 * (1 - b.hit * 0.18), s); b.rg.material.opacity = b.hit * 0.8; b.rg.scale.setScalar(1 + (1 - b.hit) * 0.5); }
    if (H.rotor && C.mill) H.rotor.rotation.y = -C.mill.ang;
  };
  return H;
}
function isInside(poly, x, z) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
function nearAnything(C, x, z, r) {
  for (const w of C.water) if (x > w[0] - r && x < w[2] + r && z > w[1] - r && z < w[3] + r) return true;
  for (const b of C.bumpers) if (Math.hypot(x - b[0], z - b[1]) < b[2] + r) return true;
  for (const t of C.def.tee) if (Math.hypot(x - t[0], z - t[1]) < 2) return true;
  if (Math.hypot(x - C.cup[0], z - C.cup[1]) < 2) return true;
  for (const w of C.walls) { const dx = w[2] - w[0], dz = w[3] - w[1], l2 = dx * dx + dz * dz; let u = l2 ? ((x - w[0]) * dx + (z - w[1]) * dz) / l2 : 0; u = clamp(u, 0, 1); if (Math.hypot(x - (w[0] + dx * u), z - (w[1] + dz * u)) < r) return true; }
  for (const q of [...C.ramps.map((q) => q.r), ...C.pads.map((q) => q.r)]) if (x > q[0] - r && x < q[2] + r && z > q[1] - r && z < q[3] + r) return true;
  if (C.mill && Math.hypot(x - C.mill.x, z - C.mill.z) < C.mill.len + 1) return true;
  return false;
}
