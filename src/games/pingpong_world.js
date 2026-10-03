import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeDeurman } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { mergeStatic } from '../world/merge.js';
import { PP } from './pingpong_phys.js';

// Omgeving van "Tafeltennis-Tornado": de kasteel-Sporthal. Parketvloer, ribladders, tribune met juichend publiek (instanced),
// vlaggetjes die in de wind wapperen, basketbalbord, matten, een scoreboard en een Deurman als lijnrechter. De tafel is een kantelbare groep.

const { L, W, TOP, NET } = PP;

function parquetTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#9a6234'; g.fillRect(0, 0, w, h);
    const r = mulberry32(31); const rows = 16, pw = 128;
    for (let y = 0; y < rows; y++) { const oy = y * (h / rows); let x = -(r() * pw);
      while (x < w) { const l = 150 + Math.floor(r() * 40); g.fillStyle = `rgb(${l + 40},${l - 10},${l - 70})`; g.fillRect(x + 1, oy + 1, pw - 2, h / rows - 2);
        g.strokeStyle = 'rgba(80,40,10,.18)'; g.lineWidth = 1; for (let k = 0; k < 3; k++) { const yy = oy + 4 + r() * (h / rows - 8); g.beginPath(); g.moveTo(x + 4, yy); g.lineTo(x + pw - 6, yy + (r() - 0.5) * 3); g.stroke(); }
        x += pw * (0.7 + r() * 0.6); } }
  });
}
function courtLines() {
  return canvasTex(1024, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 9; g.strokeRect(20, 20, w - 40, h - 40);
    g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2, h - 20); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 90, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,214,70,.7)'; g.beginPath(); g.arc(20, h / 2, 150, -Math.PI / 2, Math.PI / 2); g.stroke(); g.beginPath(); g.arc(w - 20, h / 2, 150, Math.PI / 2, Math.PI * 1.5); g.stroke();
  });
}
function tableTex() {
  return canvasTex(1024, 560, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2557b8'); gr.addColorStop(1, '#1d489c'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = mulberry32(8); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${0.02 + r() * 0.04})`; g.fillRect(r() * w, r() * h, 3, 2); }
    g.strokeStyle = '#fff'; g.lineWidth = 9; g.strokeRect(9, 9, w - 18, h - 18);
    g.lineWidth = 5; g.beginPath(); g.moveTo(10, h / 2); g.lineTo(w - 10, h / 2); g.stroke();
    g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h - 10); g.stroke();
  });
}
function netTex() {
  return canvasTex(256, 32, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0)'; g.clearRect(0, 0, w, h); g.fillStyle = '#f4f4f8'; g.fillRect(0, 0, w, 7);
    g.strokeStyle = 'rgba(235,240,255,.85)'; g.lineWidth = 2; for (let x = 0; x <= w; x += 8) { g.beginPath(); g.moveTo(x, 7); g.lineTo(x, h); g.stroke(); } for (let y = 9; y <= h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
}
const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

export function buildHall(ctx, L_, css) {
  const { scene } = ctx; const rng = mulberry32(909);
  const A = { t: 0, cheerT: 0, groanT: 0, flags: [], crowd: [], bumpers: [], windK: 0, wdir: [0, 0], streaks: [] };
  scene.background = new THREE.Color(0x9fb4d0); scene.fog = new THREE.Fog(0xaab8d4, 40, 95);
  const start = scene.children.length;

  // ---------------- hal ----------------
  const parq = parquetTex(); parq.wrapS = parq.wrapT = THREE.RepeatWrapping; parq.repeat.set(10, 7);
  scene.add(mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshStandardMaterial({ map: parq, roughness: 0.5, metalness: 0.05 }), { cast: false, pos: [0, 0, 8], rot: [-Math.PI / 2, 0, 0] }));
  const lines = new THREE.Mesh(new THREE.PlaneGeometry(46, 23), new THREE.MeshBasicMaterial({ map: courtLines(), transparent: true, opacity: 0.8, depthWrite: false, fog: true }));
  lines.rotation.x = -Math.PI / 2; lines.position.set(0, 0.02, 1); scene.add(lines);
  const wallM = new THREE.MeshStandardMaterial({ map: tex.bricks(14, 3), color: 0xe6d4b8, roughness: 1 });
  scene.add(mesh(new THREE.PlaneGeometry(90, 24), wallM, { cast: false, pos: [0, 12, -15], }));
  scene.add(mesh(new THREE.PlaneGeometry(90, 3.2), mat(0x2a4f8a, { flatShading: false }), { cast: false, receive: false, pos: [0, 1.6, -14.95] }));
  for (const sx of [-1, 1]) scene.add(mesh(new THREE.PlaneGeometry(60, 24), wallM, { cast: false, pos: [sx * 30, 12, 5], rot: [0, -sx * Math.PI / 2, 0] }));
  scene.add(mesh(new THREE.PlaneGeometry(90, 70), mat(0x3a3a4a, { flatShading: false }), { cast: false, receive: false, pos: [0, 24, 5], rot: [Math.PI / 2, 0, 0] }));
  // ramen (hoog, boogvormig): gloeiende ruiten
  const winM = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, fog: false });
  for (let i = -3; i <= 3; i++) { const g = new THREE.Group(); g.position.set(i * 9.5, 14.5, -14.8);
    g.add(mesh(new THREE.PlaneGeometry(3.6, 5), winM, { cast: false, receive: false })); g.add(mesh(new THREE.CircleGeometry(1.8, 14, 0, Math.PI), winM, { cast: false, receive: false, pos: [0, 2.5, 0] }));
    g.add(mesh(new THREE.BoxGeometry(0.2, 7, 0.2), mat(0x3a3028), { cast: false, pos: [0, 1.2, 0.05] })); g.add(mesh(new THREE.BoxGeometry(3.6, 0.2, 0.2), mat(0x3a3028), { cast: false, pos: [0, 0.4, 0.05] })); scene.add(g); }
  // ribladders links en rechts
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const g = new THREE.Group(); g.position.set(sx * (17 + k * 2.6), 0, -14.6);
    for (const px of [-0.9, 0.9]) g.add(mesh(new THREE.BoxGeometry(0.16, 9, 0.2), mat(0xb4783e), { cast: false, pos: [px, 4.5, 0] }));
    for (let r = 0; r < 16; r++) g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 5), mat(0xd29a58), { cast: false, pos: [0, 0.6 + r * 0.52, 0.05], rot: [0, 0, Math.PI / 2] })); scene.add(g); }
  // basketbalborden
  for (const sx of [-1, 1]) { const g = new THREE.Group(); g.position.set(sx * 11, 8.2, -14.2);
    g.add(mesh(new THREE.BoxGeometry(3.2, 2.2, 0.12), new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.4 }), { cast: false }));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.8, 0.14), mat(0xd8372c, { flatShading: false }), { cast: false, pos: [0, -0.2, 0.02] }));
    g.add(mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 16), mat(0xe8641c, { flatShading: false }), { cast: false, pos: [0, -0.75, 0.75], rot: [Math.PI / 2, 0, 0] })); scene.add(g); }
  // tribune met drie rijen
  for (let r = 0; r < 4; r++) scene.add(mesh(new THREE.BoxGeometry(46, 0.7 + r * 0.8, 1.9), new THREE.MeshStandardMaterial({ map: tex.planks(8, 1, '#8a5a30'), roughness: 0.9 }), { cast: false, pos: [0, (0.7 + r * 0.8) / 2, -9 - r * 1.9] }));
  // matten en kisten, banken in de voorgrond
  const matC = [0x3a78e0, 0xd8372c, 0x35c46f, 0xffc83a];
  for (let i = 0; i < 4; i++) scene.add(mesh(new THREE.BoxGeometry(4.2, 0.45, 2.4), mat(matC[i], { flatShading: false }), { cast: false, pos: [-17.5 + (i % 2) * 0.4, 0.23 + Math.floor(i / 2) * 0.46, 8.5], rot: [0, (i % 2) * 0.1, 0] }));
  for (let i = 0; i < 3; i++) scene.add(mesh(new THREE.BoxGeometry(4.2, 0.45, 2.4), mat(matC[(i + 1) % 4], { flatShading: false }), { cast: false, pos: [17 + (i % 2) * 0.5, 0.23 + Math.floor(i / 2) * 0.46, 9] }));
  for (const [x, z] of [[-9.5, 9.5], [9.5, 9.5]]) { scene.add(mesh(new THREE.BoxGeometry(5.5, 0.18, 1.0), mat(0x8a5a30), { cast: false, pos: [x, 1.0, z] })); for (const sx of [-2.4, 2.4]) scene.add(mesh(new THREE.BoxGeometry(0.2, 1.0, 0.9), mat(0x4a2a14), { cast: false, pos: [x + sx, 0.5, z] })); }
  const cone = (x, z) => scene.add(mesh(new THREE.ConeGeometry(0.4, 0.9, 8), mat(0xff7a1a, { flatShading: false }), { cast: false, pos: [x, 0.45, z] }));
  [[-13, 6.5], [13, 6.8], [-4, 10.5], [4.5, 10.8]].forEach(([x, z]) => cone(x, z));
  const bg = P.barrel(1.0); bg.position.set(-20, 0, 3); scene.add(bg);

  // vlaggetjes / banners (wapperen in de wind)
  const flagCols = [0xd8372c, 0xffd23f, 0x2f9e5b, 0x3a78e0, 0xe8641c, 0xd86fd8];
  for (let i = 0; i < 12; i++) { const b = P.banner(flagCols[i % 6], 3.2, 1.2); b.position.set(-22 + i * 4, 9.0, -14.3); b.userData.dynamic = true; scene.add(b); A.flags.push(b); }
  // slingers boven de tafel
  const bunting = new THREE.InstancedMesh(new THREE.ConeGeometry(0.28, 0.6, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }), 36); const m4 = new THREE.Matrix4(), cc = new THREE.Color();
  for (let i = 0; i < 36; i++) { const x = -16 + i * 0.92; const y = 12.2 - Math.sin((x + 16) / 33 * Math.PI) * -1.6 - 1.2; m4.compose(new THREE.Vector3(x, y, -4.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)), new THREE.Vector3(1, 1, 1)); bunting.setMatrixAt(i, m4); bunting.setColorAt(i, cc.set(flagCols[i % 6])); }
  scene.add(bunting);

  // ---------------- de tafel (kantelbaar) ----------------
  const tg = new THREE.Group(); tg.position.set(0, TOP, 0); scene.add(tg); A.tableG = tg; tg.userData.dynamic = true;
  const topTex = tableTex();
  tg.add(mesh(new THREE.BoxGeometry(2 * L, 0.3, 2 * W), [mat(0x16306a, { flatShading: false }), mat(0x16306a, { flatShading: false }), new THREE.MeshStandardMaterial({ map: topTex, roughness: 0.35, metalness: 0.05 }), mat(0x16306a, { flatShading: false }), mat(0x16306a, { flatShading: false }), mat(0x16306a, { flatShading: false })], { pos: [0, -0.15, 0] }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { tg.add(mesh(new THREE.BoxGeometry(0.4, TOP - 0.3, 0.4), mat(0x2a2f3a, { flatShading: false, metalness: 0.5 }), { pos: [sx * (L - 0.9), -(TOP - 0.3) / 2 - 0.3, sz * (W - 0.7)] })); }
  // net
  const netM = new THREE.Mesh(new THREE.PlaneGeometry(2 * W + 0.7, NET + 0.1), new THREE.MeshBasicMaterial({ map: netTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false })); netM.rotation.y = Math.PI / 2; netM.position.set(0, (NET + 0.1) / 2 - 0.02, 0); tg.add(netM);
  for (const sz of [-1, 1]) tg.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, NET + 0.35, 6), mat(0x888c98, { metalness: 0.6, flatShading: false }), { pos: [0, (NET + 0.35) / 2, sz * (W + 0.38)] }));
  // bumpers (paddenstoelvormig, verborgen tot ze verschijnen)
  for (let i = 0; i < 4; i++) { const g = new THREE.Group(); g.visible = false;
    g.add(mesh(new THREE.CylinderGeometry(0.5, 0.58, 0.32, 14), mat(0xffd23f, { flatShading: false, metalness: 0.3 }), { pos: [0, 0.16, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.4, 0.5, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xff3a5a, emissive: 0xff1a3a, emissiveIntensity: 0.6, roughness: 0.3 }), { cast: false, pos: [0, 0.42, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffe0e0, emissiveIntensity: 0.7 }), { cast: false, pos: [0, 0.58, 0] }));
    tg.add(g); A.bumpers.push(g); }

  // ---------------- publiek ----------------
  const N = 36;
  const std = () => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
  const gBody = new THREE.CylinderGeometry(0.28, 0.36, 0.7, 8); gBody.translate(0, 0.95, 0);
  const gHead = new THREE.SphereGeometry(0.27, 9, 7); gHead.translate(0, 1.55, 0);
  const gArm = new THREE.BoxGeometry(0.13, 0.55, 0.13); gArm.translate(0, -0.26, 0);
  const gHat = new THREE.ConeGeometry(0.25, 0.55, 7); gHat.translate(0, 2.05, 0);
  const mk = (geo, n) => { const im = new THREE.InstancedMesh(geo, std(), n); im.frustumCulled = false; im.userData.dynamic = true; scene.add(im); return im; };
  const iBody = mk(gBody, N), iHead = mk(gHead, N), iArm = mk(gArm, N * 2), iHat = mk(gHat, N);
  const shirts = [0xc86a5a, 0x5a8ac8, 0x6ac88a, 0xc8b05a, 0xa06ac8, 0xe8e0d0, 0xd88aa8, 0x7a9a5a, 0xc87a3a, 0x5ac8c0], skins = [0xf2c29b, 0xe0a47a, 0xc88a60, 0xf6d2b5, 0x9a6a46], hats = [0x8a3a3a, 0x3a5a8a, 0xe8c24a, 0x2a2a30, 0x6a4a8a, 0x3a8a5a];
  for (let i = 0; i < N; i++) {
    const row = Math.floor(i / 12), x = -13.5 + (i % 12) * 2.45 + (rng() - 0.5) * 0.8 + row * 0.6, sh = shirts[Math.floor(rng() * shirts.length)];
    const y = (0.7 + row * 0.8), z = -9 - row * 1.9;
    iBody.setColorAt(i, cc.set(sh)); iArm.setColorAt(i * 2, cc.set(sh)); iArm.setColorAt(i * 2 + 1, cc.set(sh)); iHead.setColorAt(i, cc.set(skins[Math.floor(rng() * skins.length)])); iHat.setColorAt(i, cc.set(hats[Math.floor(rng() * hats.length)]));
    A.crowd.push({ x, y, z, ph: rng() * 6, sc: 1.1 + rng() * 0.2, hat: rng() < 0.5 });
  }
  const dm = new THREE.Object3D(), dm2 = new THREE.Object3D(), arm = new THREE.Object3D(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  A.cheer = (a = 1) => { A.cheerT = Math.max(A.cheerT, a); }; A.groan = (a = 1) => { A.groanT = Math.max(A.groanT, a); };
  const updCrowd = (t, dt) => {
    A.cheerT = Math.max(0, A.cheerT - dt); A.groanT = Math.max(0, A.groanT - dt);
    const ch = A.cheerT > 0 ? Math.min(1, A.cheerT * 2) : 0;
    A.crowd.forEach((c, i) => {
      const hop = ch * Math.abs(Math.sin(t * 9 + c.ph)) * 0.3 + Math.sin(t * 1.6 + c.ph) * 0.02;
      dm.position.set(c.x, c.y + hop, c.z); dm.rotation.set(0, 0, 0); dm.scale.setScalar(c.sc); dm.updateMatrix();
      iBody.setMatrixAt(i, dm.matrix); iHead.setMatrixAt(i, dm.matrix); iHat.setMatrixAt(i, c.hat ? dm.matrix : zero);
      for (const s of [-1, 1]) {
        arm.position.set(s * 0.4 * c.sc, 1.25 * c.sc, 0); arm.rotation.set(ch * (-2.7 + Math.sin(t * 12 + c.ph + s) * 0.5) + (1 - ch) * (Math.sin(t * 2 + c.ph + s) * 0.1 - 0.05), 0, s * (0.15 + ch * 0.4)); arm.scale.setScalar(c.sc); arm.updateMatrix();
        dm2.position.set(c.x, c.y + hop, c.z); dm2.rotation.set(0, 0, 0); dm2.updateMatrix(); dm2.matrix.multiply(arm.matrix); iArm.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), dm2.matrix);
      }
    });
    for (const m of [iBody, iHead, iArm, iHat]) m.instanceMatrix.needsUpdate = true;
  };
  for (const m of [iBody, iHead, iArm, iHat]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  A.drawScore = () => {};   // de score staat in de HUD

  // ---------------- lijnrechter (Deurman) ----------------
  const dman = makeDeurman(1.9); const dg = new THREE.Group(); dg.add(dman.group); dg.position.set(-1.2, 0, -7.0); scene.add(dg); dman.group.rotation.y = 0; A.judge = { g: dg, d: dman, stare: 0, aim: [0, 0] };
  // vlag in zijn hand (rechterarm)
  const flag = new THREE.Group(); flag.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), mat(0x6a4a2a), { cast: false, pos: [0, 0.5, 0] })); flag.add(mesh(new THREE.BoxGeometry(0.5, 0.35, 0.03), mat(0xffd23f), { cast: false, pos: [0.25, 0.9, 0] }));
  dman.arms[1].add(flag); flag.position.set(0, -1.7 * 1.9 * 0.5 - 0.1, 0.1); flag.scale.setScalar(1.7);
  A.judge.update = (t, dt, ball) => {
    const j = A.judge; j.stare = Math.max(0, j.stare - dt);
    // kijkt de bal na (hoofd draait), tenzij hij STAART: dan kijkt hij recht in de camera
    const tx = j.stare > 0 ? 0 : clamp(ball.x * 0.06, -0.8, 0.8); dman.targetYaw = damp(dman.targetYaw, tx, 6, dt);
    dman.head.rotation.y = damp(dman.head.rotation.y, j.stare > 0 ? 0 : clamp(ball.x * 0.08, -0.7, 0.7), 8, dt);
    dman.update(dt); dman.head.rotation.x = j.stare > 0 ? 0.25 : 0.1;
    dman.eyeGlow.forEach((e) => { e.scale.setScalar(j.stare > 0 ? 3.2 + Math.sin(t * 30) * 0.8 : 1); });
    dman.arms[1].rotation.x = j.stare > 0 ? -1.4 : Math.sin(t * 1.2) * 0.05;
  };

  mergeStatic(scene, start, { cell: 80 });

  // ---------------- wind-streepjes ----------------
  const stM = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, opacity: 0, depthWrite: false, color: 0xffffff });
  for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.07), stM.clone()); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); A.streaks.push({ m, x: rng() * 30 - 15, z: rng() * 14 - 7, y: 2.6 + rng() * 3.5, sp: 0.8 + rng() * 0.6 }); }
  A.update = (t, dt, windX, windZ) => {
    A.t = t; updCrowd(t, dt);
    const wk = Math.hypot(windX, windZ) / 9; A.windK = damp(A.windK, wk, 3, dt);
    for (const f of A.flags) { P.animateBanner(f, t * (1 + A.windK * 2.2)); }
    for (const s of A.streaks) {
      const on = A.windK > 0.05; s.m.visible = on; if (!on) continue;
      s.x += windX * s.sp * dt * 2.2; s.z += windZ * s.sp * dt * 2.2; if (s.x > 17) s.x = -17; if (s.x < -17) s.x = 17; if (s.z > 8) s.z = -8; if (s.z < -8) s.z = 8;
      s.m.position.set(s.x, s.y, s.z); s.m.rotation.z = Math.atan2(windZ, windX) * -1; s.m.material.opacity = Math.min(0.55, A.windK * 0.8);
    }
  };
  return A;
}
