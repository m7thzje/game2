import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, clamp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { MB, glowSprite } from './dodgeball_world.js';
import { drawDeurFace } from '../engine/chars.js';

// De wereld van de Sneeuwballen-Slag: ronde sneeuwarena, drie sneeuwforten (driehoek), bomen en sneeuwmannen als dekking,
// een Deurman-sneeuwpop in het midden, een yeti-model, sneeuwvlokken, stapels sneeuwballen en de pickup-visuals.
export const RA = 12.6, FORT_R = 8.9, FORT_ANG = [150, 30, -90];   // slot 0 linksonder, slot 1 rechtsonder, slot 2 boven
export const pol = (r, deg) => [Math.cos(deg * Math.PI / 180) * r, Math.sin(deg * Math.PI / 180) * r];
const SNOW = 0xf4f9ff, SHADE = 0xc9dcef;

export function buildWorld(ctx) {
  const { scene, players } = ctx, n = players.length;
  const root = new THREE.Group(); scene.add(root);
  const rng = mulberry32(2024);
  const circles = [], walls = [];   // botsers: cirkels {x,z,r,h,kind} en blokken {x,z,ang,hl,ht,h,hp,kind}

  // ---- grond ----
  const st = tex.snow(9, 9);
  root.add(mesh(new THREE.CircleGeometry(RA + 1.6, 56), new THREE.MeshStandardMaterial({ map: st, roughness: 1 }), { cast: false, pos: [0, 0, 0], rot: [-Math.PI / 2, 0, 0] }));
  root.add(mesh(new THREE.PlaneGeometry(260, 260), mat(0xd3e4f4), { cast: false, pos: [0, -0.05, 0], rot: [-Math.PI / 2, 0, 0] }));
  const bank = mesh(new THREE.TorusGeometry(RA + 1.5, 0.75, 6, 56), mat(SNOW), { cast: false, pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.55] }); root.add(bank);
  // ijsplekken (alleen sfeer) + sporen
  for (let k = 0; k < 3; k++) { const a = -30 + k * 120, [x, z] = pol(6.2, a + 12); root.add(mesh(new THREE.CircleGeometry(1.6 + k * 0.2, 20), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.7 }), { cast: false, receive: false, pos: [x, 0.02, z], rot: [-Math.PI / 2, 0, 0], scale: [1, 1.4, 1] })); }

  // ---- bomen buiten de arena (samengevoegd, 1 mesh) ----
  const mb = new MB();
  const pineAt = (x, z, h, tilt = 0) => {
    mb.cyl(0.22 * h / 5, 0.3 * h / 5, h * 0.25, 0x5b3d24, x, h * 0.12, z, 6);
    for (let i = 0; i < 4; i++) { const r = h * (0.36 - i * 0.07), y = h * (0.25 + i * 0.2); mb.cone(r, h * 0.34, 0x2a6e4a, x, y + h * 0.1, z, 8); mb.cone(r * 0.78, h * 0.22, 0xffffff, x, y + h * 0.2, z, 8); }
  };
  for (let k = 0; k < 90; k++) { const a = rng() * 360, r = RA + 3.2 + rng() * 14, [x, z] = pol(r, a); if (z > 1 && Math.abs(x) < 24) continue; if (z > 9) continue; pineAt(x, z, 4 + rng() * 3.2); }
  // sneeuwmannetjes langs de rand (publiek)
  const crowdMan = (x, z, col) => { mb.sph(0.62, 0xffffff, x, 0.55, z, 1, 0.9, 1, 8, 6); mb.sph(0.46, 0xffffff, x, 1.35, z, 1, 1, 1, 8, 6); mb.sph(0.34, 0xffffff, x, 1.95, z, 1, 1, 1, 8, 6); mb.cone(0.07, 0.3, 0xff8a1a, x, 1.95, z + 0.34, 5, Math.PI / 2); mb.cyl(0.4, 0.4, 0.12, col, x, 1.55, z, 8); };
  for (let k = 0; k < 9; k++) { const c = [0xe5484d, 0xffd23f, 0x4ac8ff][k % 3]; const [x, z] = pol(RA + 2.6, -170 + k * 10); crowdMan(x, z, c); const [x2, z2] = pol(RA + 2.6, -10 + k * 10); if (z2 < 6) crowdMan(x2, z2 - 0.5, c); }

  // ---- forten ----
  const fort = [];   // {x,z,dx,dz (richting naar het midden)}
  for (let i = 0; i < n; i++) {
    const [fx, fz] = pol(FORT_R, FORT_ANG[i]), l = Math.hypot(fx, fz), dx = -fx / l, dz = -fz / l, wx = -dz, wz = dx, col = players[i].color;
    fort.push({ x: fx, z: fz, dx, dz, col });
    const addWall = (cx, cz, axX, axZ, hl, ht, h) => {
      const ang = Math.atan2(axZ, axX);
      walls.push({ x: cx, z: cz, ang, hl, ht, h, hp: 99, kind: 'fort', owner: i });
      // blokjes
      const cnt = Math.round(hl * 2 / 0.8);
      for (let q = 0; q < cnt; q++) { const t = -hl + (q + 0.5) * (hl * 2 / cnt); for (let lv = 0; lv < 2; lv++) mb.box(hl * 2 / cnt * 0.97, 0.78, ht * 2, lv ? SHADE : SNOW, cx + axX * t, 0.4 + lv * 0.74, cz + axZ * t, -ang); }
      mb.sph(0.5, SNOW, cx + axX * hl, 1.55, cz + axZ * hl, 1, 0.8, 1, 8, 6); mb.sph(0.5, SNOW, cx - axX * hl, 1.55, cz - axZ * hl, 1, 0.8, 1, 8, 6);
    };
    addWall(fx - dx * 2.5, fz - dz * 2.5, wx, wz, 2.9, 0.5, 1.5);
    addWall(fx + wx * 2.8 - dx * 0.5, fz + wz * 2.8 - dz * 0.5, dx, dz, 1.9, 0.5, 1.5);
    addWall(fx - wx * 2.8 - dx * 0.5, fz - wz * 2.8 - dz * 0.5, dx, dz, 1.9, 0.5, 1.5);
    // vlag + munitie-stapel
    mb.cyl(0.06, 0.06, 3.6, 0x6b4a2e, fx - dx * 2.0, 1.8, fz - dz * 2.0, 5);
    mb.box(1.2, 0.8, 0.05, col, fx - dx * 2.0 + wx * 0.6, 3.2, fz - dz * 2.0 + wz * 0.6, Math.atan2(wx, wz) + Math.PI / 2 * 0);
    for (let q = 0; q < 6; q++) { const a = q * 1.05, rr = q < 4 ? 0.42 : 0, yy = q < 4 ? 0.3 : 0.75; mb.sph(0.3, 0xffffff, fx - dx * 1.5 + Math.cos(a) * rr, yy, fz - dz * 1.5 + Math.sin(a) * rr, 1, 1, 1, 8, 6); }
    // gekleurde vloer
    root.add(mesh(new THREE.CircleGeometry(3.0, 28), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.32, depthWrite: false }), { cast: false, receive: false, pos: [fx + dx * 0.2, 0.03, fz + dz * 0.2], rot: [-Math.PI / 2, 0, 0] }));
  }

  // ---- dekking (3-voudig symmetrisch rond het midden) ----
  const sectors = [-30, 90, 210];   // in het midden tussen twee forten
  const cover = [[6.5, -17, 'snowman'], [6.9, 15, 'pine'], [10.3, 0, 'pine'], [3.8, -4, 'rock'], [10.8, -37, 'rock'], [10.8, 39, 'pine']];
  for (const s0 of sectors) for (const [r, da, kind] of cover) {
    const [x, z] = pol(r, s0 + da);
    if (kind === 'pine') { pineAt(x, z, 5.4); circles.push({ x, z, r: 0.85, h: 4.6, kind: 'tree' }); }
    else if (kind === 'rock') { mb.add(new THREE.DodecahedronGeometry(1.05, 0), 0x9aa6b5, x, 0.55, z, 0, rng() * 3, 0, 1, 0.75, 0.9); mb.add(new THREE.DodecahedronGeometry(0.8, 0), 0xffffff, x, 1.0, z, 0, 0, 0, 1, 0.5, 0.8); circles.push({ x, z, r: 1.0, h: 1.3, kind: 'rock' }); }
    else { mb.sph(0.95, 0xffffff, x, 0.8, z, 1, 0.9, 1, 9, 7); mb.sph(0.72, 0xffffff, x, 2.0, z, 1, 1, 1, 9, 7); mb.sph(0.52, 0xffffff, x, 2.95, z, 1, 1, 1, 9, 7); mb.cone(0.08, 0.42, 0xff8a1a, x, 2.95, z + 0.5, 5, Math.PI / 2); mb.cyl(0.38, 0.38, 0.5, 0x2a2a34, x, 3.55, z, 8); mb.cyl(0.56, 0.56, 0.07, 0x2a2a34, x, 3.3, z, 8); mb.cyl(0.62, 0.62, 0.14, [0xe5484d, 0x4ac8ff, 0xffd23f][sectors.indexOf(s0)], x, 2.45, z, 9); circles.push({ x, z, r: 0.95, h: 3.0, kind: 'snowman' }); }
  }
  const decor = mb.build({ cast: true, receive: true }); root.add(decor);

  // ---- sneeuwstapels (munitie op de grond), geinstantieerd ----
  const pileSpots = []; for (const s0 of sectors) for (const da of [-24, 28]) { const [x, z] = pol(5.0, s0 + da); pileSpots.push({ x, z, on: true, t: 0 }); }
  const pileIM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 8, 6), mat(0xffffff), pileSpots.length * 4);
  const pm = new THREE.Matrix4(), pq = new THREE.Quaternion(), pp = new THREE.Vector3(), ps = new THREE.Vector3();
  const pileOff = [[0, 0.3, 0.35], [0.4, 0.28, -0.2], [-0.4, 0.28, -0.15], [0, 0.78, 0]];
  const setPile = (i, on) => { pileSpots[i].on = on; for (let q = 0; q < 4; q++) { pp.set(pileSpots[i].x + pileOff[q][0], pileOff[q][1], pileSpots[i].z + pileOff[q][2]); ps.setScalar(on ? 1 : 0.0001); pm.compose(pp, pq, ps); pileIM.setMatrixAt(i * 4 + q, pm); } pileIM.instanceMatrix.needsUpdate = true; };
  pileSpots.forEach((_, i) => setPile(i, true));
  root.add(pileIM);

  // ---- Deurman-sneeuwpop in het midden ----
  const dm = new THREE.Group(); root.add(dm);
  { const w = mat(0xffffff);
    dm.add(mesh(new THREE.SphereGeometry(1.15, 12, 9), w, { pos: [0, 1.0, 0], scale: [1, 0.9, 1] }));
    dm.add(mesh(new THREE.SphereGeometry(0.88, 12, 9), w, { pos: [0, 2.35, 0] }));
    dm.add(mesh(new THREE.SphereGeometry(0.8, 12, 9), w, { pos: [0, 3.5, 0] }));
    for (const sx of [-1, 1]) dm.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), mat(0x5b3d24), { pos: [sx * 1.4, 2.7, 0], rot: [0, 0, sx * -0.9] }));
    const ft = canvasTex(256, 256, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
      drawDeurFace(g, 128, 150, 118, { hat: 'party', open: 0.7, eye: 1.2, look: [0, 0.3] });
      g.fillStyle = '#ffffff'; g.fillRect(0, 214, 256, 42);
    });
    dm.add(mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ map: ft }), { cast: false, receive: false, pos: [0, 3.62, 0.78], rot: [-0.6, 0, 0] }));
    dm.add(mesh(new THREE.TorusGeometry(0.9, 0.08, 5, 14), mat(0xff4aa8), { pos: [0, 2.8, 0], rot: [Math.PI / 2, 0, 0] }));
  }
  dm.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  circles.push({ x: 0, z: 0, r: 1.15, h: 4.2, kind: 'deurman' });
  const dmGlow = glowSprite(0xff4aa8, 5, 0.35); dmGlow.position.set(0, 3, 0); root.add(dmGlow);

  // ---- yeti ----
  const yeti = new THREE.Group(); root.add(yeti);
  const yb = { arms: [], legs: [] };
  { const fur = mat(0xe6f0fa), dark = mat(0x2a2236), furS = mat(0xcfe0f2);
    yb.body = new THREE.Group(); yeti.add(yb.body);
    yb.body.add(mesh(new THREE.SphereGeometry(1.3, 12, 9), fur, { pos: [0, 2.2, 0], scale: [1.15, 1.25, 1] }));
    yb.body.add(mesh(new THREE.SphereGeometry(0.85, 10, 8), furS, { pos: [0, 1.7, 0.7], scale: [1, 1.1, 0.7] }));
    yb.head = new THREE.Group(); yb.head.position.set(0, 3.9, 0.15); yb.body.add(yb.head);
    yb.head.add(mesh(new THREE.SphereGeometry(0.85, 12, 9), fur, { scale: [1.15, 1, 1] }));
    yb.head.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(0x9fc4e8), { pos: [0, -0.12, 0.62], scale: [1.2, 0.8, 0.6] }));
    for (const sx of [-1, 1]) {
      yb.head.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(0xffffff, { emissive: 0x111111 }), { pos: [sx * 0.35, 0.2, 0.74], cast: false }));
      yb.head.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), dark, { pos: [sx * 0.35, 0.18, 0.88], cast: false }));
      yb.head.add(mesh(new THREE.BoxGeometry(0.4, 0.09, 0.1), dark, { pos: [sx * 0.35, 0.45, 0.8], rot: [0, 0, sx * -0.4], cast: false }));
      yb.head.add(mesh(new THREE.ConeGeometry(0.16, 0.6, 6), mat(0xf4f0e0), { pos: [sx * 0.6, 0.85, 0], rot: [0, 0, sx * -0.4] }));
    }
    yb.head.add(mesh(new THREE.BoxGeometry(0.62, 0.2, 0.1), dark, { pos: [0, -0.28, 0.9], cast: false }));
    for (let q = 0; q < 4; q++) yb.head.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 4), mat(0xffffff), { pos: [-0.21 + q * 0.14, -0.2, 0.94], rot: [Math.PI, 0, 0], cast: false }));
    for (const sx of [-1, 1]) {
      const a = new THREE.Group(); a.position.set(sx * 1.55, 3.1, 0); yb.body.add(a);
      a.add(mesh(new THREE.CapsuleGeometry(0.42, 1.5, 4, 8), fur, { pos: [0, -1.0, 0] })); a.add(mesh(new THREE.SphereGeometry(0.55, 8, 6), furS, { pos: [0, -2.0, 0.1] })); yb.arms.push(a);
      const l = new THREE.Group(); l.position.set(sx * 0.65, 1.2, 0); yeti.add(l);
      l.add(mesh(new THREE.CapsuleGeometry(0.45, 0.6, 4, 8), fur, { pos: [0, -0.5, 0] })); l.add(mesh(new THREE.BoxGeometry(0.8, 0.3, 1.1), furS, { pos: [0, -1.0, 0.2] })); yb.legs.push(l);
    }
  }
  yeti.scale.setScalar(0.85); yeti.visible = false;

  // ---- sneeuwvlokken ----
  const NF = 420, fpos = new Float32Array(NF * 3), fph = new Float32Array(NF);
  for (let i = 0; i < NF; i++) { fpos[i * 3] = (rng() - 0.5) * 56; fpos[i * 3 + 1] = rng() * 20; fpos[i * 3 + 2] = (rng() - 0.5) * 44; fph[i] = rng() * 6; }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const fmat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.28, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
  const flakes = new THREE.Points(fg, fmat); flakes.frustumCulled = false; root.add(flakes);
  let ft2 = 0;
  const flakeUpdate = (dt, storm, wx, wz) => {
    ft2 += dt; fmat.opacity = 0.7 + 0.25 * storm; fmat.size = 0.26 + 0.14 * storm;
    const fall = 2.2 + 10 * storm;
    for (let i = 0; i < NF; i++) {
      fpos[i * 3] += (Math.sin(ft2 * 0.8 + fph[i]) * 0.4 + wx * (0.15 + 1.1 * storm)) * dt; fpos[i * 3 + 1] -= fall * dt * (0.7 + (i % 5) * 0.12); fpos[i * 3 + 2] += (wz * (0.15 + 1.1 * storm)) * dt;
      if (fpos[i * 3 + 1] < 0) { fpos[i * 3 + 1] = 18 + Math.random() * 3; fpos[i * 3] = (Math.random() - 0.5) * 56; fpos[i * 3 + 2] = (Math.random() - 0.5) * 44; }
      if (fpos[i * 3] > 28) fpos[i * 3] -= 56; else if (fpos[i * 3] < -28) fpos[i * 3] += 56; if (fpos[i * 3 + 2] > 22) fpos[i * 3 + 2] -= 44; else if (fpos[i * 3 + 2] < -22) fpos[i * 3 + 2] += 44;
    }
    fg.attributes.position.needsUpdate = true;
  };

  // ---- power-up visuals (pool van 3) ----
  const pick = [];
  for (let q = 0; q < 3; q++) {
    const g = new THREE.Group(); g.visible = false; root.add(g);
    const ice = mesh(new THREE.IcosahedronGeometry(0.75, 0), new THREE.MeshStandardMaterial({ color: 0x7ad8ff, emissive: 0x2a8ac8, emissiveIntensity: 0.8, roughness: 0.2, flatShading: true }), { pos: [0, 1.6, 0], cast: false });
    const giant = new THREE.Group(); giant.position.y = 1.7;
    giant.add(mesh(new THREE.SphereGeometry(0.95, 12, 9), mat(0xffffff), { cast: false })); giant.add(mesh(new THREE.TorusGeometry(0.98, 0.08, 5, 16), mat(0x6a8ab8), { cast: false, rot: [Math.PI / 2, 0, 0.4] }));
    const sc = new THREE.Group(); sc.position.y = 1.2;
    sc.add(mesh(new THREE.BoxGeometry(0.9, 0.4, 1.6), mat(0xff8a1a), { cast: false })); sc.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 2.0), mat(0x333344), { pos: [0.32, -0.3, 0], cast: false })); sc.add(mesh(new THREE.BoxGeometry(0.2, 0.12, 2.0), mat(0x333344), { pos: [-0.32, -0.3, 0], cast: false })); sc.add(mesh(new THREE.BoxGeometry(0.7, 0.1, 0.1), mat(0x333344), { pos: [0, 0.5, 0.5], cast: false }));
    const halo = mesh(new THREE.TorusGeometry(1.1, 0.07, 5, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }), { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], cast: false, receive: false });
    const beam = mesh(new THREE.CylinderGeometry(0.45, 0.6, 6, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }), { pos: [0, 3.5, 0], cast: false, receive: false });
    g.add(ice, giant, sc, halo, beam);
    pick.push({ g, ice, giant, sc, halo, beam, on: false, type: null, x: 0, z: 0, t: 0 });
  }

  // ---- ijsblok (voor uitgeschakelde / bevroren spelers) ----
  const iceMat = new THREE.MeshStandardMaterial({ color: 0xa8e4ff, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2, flatShading: true });
  const iceBlocks = []; for (let i = 0; i < n; i++) { const b = mesh(new THREE.BoxGeometry(1.9, 3.2, 1.9), iceMat, { cast: false, receive: false, pos: [0, 1.6, 0] }); b.visible = false; scene.add(b); iceBlocks.push(b); }

  return { root, circles, walls, fort, pileSpots, setPile, dm, dmGlow, yeti, yb, flakeUpdate, pick, iceBlocks, bank };
}
