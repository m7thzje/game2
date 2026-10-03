import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { skyTexture } from '../engine/lights.js';
import { W, H, CELL, TUNNEL_ROWS } from './pacduel_maze.js';
import { mergeStatic } from './golf_merge.js';

// Omgeving van "Spookjacht-Duel": een neon-doolhof op een zwevend platform in een spookachtige kelder
// (pilaren met fakkels, grafzerken, pompoenen, vleermuizen, dwaallichtjes, tunnel-deuren).
export const cx2w = (x) => (x - (W - 1) / 2) * CELL;
export const cz2w = (z) => (z - (H - 1) / 2) * CELL;
export const WALL_H = 1.0;
export const COL_L = 0x2ef2a8, COL_R = 0x5a8cff, COL_C = 0xff5ad8;

function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
function swirlTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2); g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { g.strokeStyle = ['#d9a8ff', '#7ae8ff', '#ff7ad8'][k]; g.lineWidth = 7 - k; g.beginPath(); for (let a = 0; a < 11; a += 0.2) { const r = 4 + a * 5.4; const an = a + k * 2.1; g.lineTo(Math.cos(an) * r, Math.sin(an) * r); } g.stroke(); }
    const gr = g.createRadialGradient(0, 0, 2, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
  });
}

function floorTexture(maze, names, colors) {
  const S = 44;
  return canvasTex(W * S, H * S, (g, w, h) => {
    const r = mulberry32(5);
    g.fillStyle = '#0a0518'; g.fillRect(0, 0, w, h);
    for (const [x, z] of maze.cells) {
      const px = x * S, pz = z * S;
      const gr = g.createLinearGradient(px, pz, px + S, pz + S); gr.addColorStop(0, '#241659'); gr.addColorStop(1, '#170d3c');
      g.fillStyle = gr; g.beginPath(); g.roundRect(px + 2, pz + 2, S - 4, S - 4, 7); g.fill();
      g.strokeStyle = x < 10 ? 'rgba(46,242,168,.30)' : x > 10 ? 'rgba(90,140,255,.34)' : 'rgba(255,90,216,.34)'; g.lineWidth = 1.5; g.beginPath(); g.roundRect(px + 4, pz + 4, S - 8, S - 8, 6); g.stroke();
      if (r() < 0.2) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(px + 6 + r() * 20, pz + 6 + r() * 20, 6, 4); }
    }
    // startplekken in de kleur van de speler
    maze.starts.forEach((s, i) => {
      const px = (s[0] + 0.5) * S, pz = (s[1] + 0.5) * S;
      g.strokeStyle = colors[i]; g.lineWidth = 4; g.beginPath(); g.arc(px, pz, S * 0.34, 0, TAU); g.stroke();
      g.fillStyle = colors[i]; g.globalAlpha = 0.22; g.beginPath(); g.arc(px, pz, S * 0.34, 0, TAU); g.fill(); g.globalAlpha = 1;
    });
    // spookjes-huisje in het midden
    const gx = (maze.ghost[0] + 0.5) * S, gz = (maze.ghost[1] + 0.5) * S;
    g.strokeStyle = 'rgba(255,140,230,.8)'; g.lineWidth = 3; g.setLineDash([6, 5]); g.beginPath(); g.arc(gx, gz, S * 0.62, 0, TAU); g.stroke(); g.setLineDash([]);
  });
}

function makePumpkin() {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 0.55, roughness: 0.6, flatShading: false });
  g.add(mesh(new THREE.SphereGeometry(0.62, 12, 9), m, { scale: [1.15, 0.9, 1.15], pos: [0, 0.55, 0] }));
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.25, 5), mat(0x3a7a2a), { cast: false, pos: [0, 1.1, 0] }));
  const dark = new THREE.MeshBasicMaterial({ color: 0x2a0a00 });
  for (const sx of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.12, 0.2, 3), dark, { cast: false, pos: [sx * 0.24, 0.68, 0.62], rot: [Math.PI / 2, 0, 0] }));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), dark, { cast: false, pos: [0, 0.38, 0.66] }));
  return g;
}
function makeBat() {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: 0x150a22, side: THREE.DoubleSide });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), m));
  g.userData.wings = [-1, 1].map((sd) => { const p = new THREE.Group(); const w = new THREE.Mesh(wingGeo(), m); w.scale.x = sd; p.add(w); g.add(p); return { p, sd }; });
  return g;
}
let _wg = null;
function wingGeo() { if (_wg) return _wg; const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15, 0, 0, -0.15, 0.9, 0.1, -0.1, 0.9, 0.1, -0.1, 0.5, 0, 0.3, 0, 0, 0.15], 3)); return (_wg = gg); }

export function buildWorld(ctx, maze, names, colorsCss) {
  const { scene } = ctx;
  const root = new THREE.Group(); scene.add(root);
  const rng = mulberry32(31);
  const Wd = {};
  scene.background = skyTexture('#05020e', '#241048');
  scene.fog = new THREE.Fog(0x120828, 55, 140);
  const PW = W * CELL, PH = H * CELL;

  // ---------------- platform, vloer, rand ----------------
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(maze, names, colorsCss), roughness: 0.55, metalness: 0.15 });
  const floor = mesh(new THREE.PlaneGeometry(PW, PH), floorMat, { cast: false, pos: [0, 0.01, 0], rot: [-Math.PI / 2, 0, 0] }); root.add(floor);
  root.add(mesh(new THREE.BoxGeometry(PW + 2.6, 1.4, PH + 2.6), new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 0.8 }), { cast: false, pos: [0, -0.72, 0] }));
  Wd.rimMat = new THREE.MeshBasicMaterial({ color: 0xff5ad8 });
  for (const sz of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(PW + 2.7, 0.14, 0.2), Wd.rimMat, { cast: false, pos: [0, 0.0, sz * (PH / 2 + 1.25)] }));
  for (const sx of [-1, 1]) root.add(mesh(new THREE.BoxGeometry(0.2, 0.14, PH + 2.7), Wd.rimMat, { cast: false, pos: [sx * (PW / 2 + 1.25), 0.0, 0] }));
  // grotvloer eromheen
  const ground = mesh(new THREE.PlaneGeometry(220, 160), new THREE.MeshStandardMaterial({ map: tex.cobble(36, 26), color: 0x6a5a9a, roughness: 1 }), { cast: false, pos: [0, -1.5, 0], rot: [-Math.PI / 2, 0, 0] }); root.add(ground);

  // ---------------- muren (instanced) ----------------
  const walls = [];
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) if (maze.wall[z * W + x]) walls.push([x, z]);
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, WALL_H, CELL), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.2 }), walls.length);
  const capTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#5a4a9a'); gr.addColorStop(1, '#3a2a70'); g.fillStyle = gr; g.beginPath(); g.roundRect(9, 9, w - 18, h - 18, 14); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3; g.beginPath(); g.moveTo(24, 36); g.lineTo(60, 36); g.stroke();
  });
  const cap = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL * 0.96, 0.1, CELL * 0.96), new THREE.MeshBasicMaterial({ map: capTex, color: 0xffffff }), walls.length);
  const dm = new THREE.Object3D(), cc = new THREE.Color();
  walls.forEach(([x, z], i) => {
    dm.position.set(cx2w(x), WALL_H / 2, cz2w(z)); dm.updateMatrix(); body.setMatrixAt(i, dm.matrix);
    dm.position.y = WALL_H + 0.02; dm.updateMatrix(); cap.setMatrixAt(i, dm.matrix);
    cc.setHex(x < 10 ? COL_L : x > 10 ? COL_R : COL_C);
    cap.setColorAt(i, cc); body.setColorAt(i, cc.clone().multiplyScalar(0.3));
  });
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false; cap.frustumCulled = false;
  root.add(body, cap);

  // ---------------- tunnel-deuren ----------------
  const doorMat = new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#7a4a28'), roughness: 0.8 });
  const frameMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
  const swirlT = swirlTex();
  Wd.gates = [];
  for (const row of TUNNEL_ROWS) for (const side of [0, 1]) {
    const x = side ? W - 1 : 0, g = new THREE.Group(); g.position.set(cx2w(x), 0, cz2w(row));
    g.add(mesh(new THREE.BoxGeometry(CELL * 0.96, WALL_H * 1.05, CELL * 0.96), doorMat, { pos: [0, WALL_H * 0.5, 0] }));
    g.add(mesh(new THREE.BoxGeometry(CELL * 0.9, 0.1, CELL * 0.9), frameMat, { cast: false, pos: [0, WALL_H * 1.07, 0] }));
    g.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23f }), { cast: false, pos: [(side ? -1 : 1) * CELL * 0.49, WALL_H * 0.55, 0] }));
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 1.5, CELL * 1.5), new THREE.MeshBasicMaterial({ map: swirlT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    sw.rotation.x = -Math.PI / 2; sw.position.set(cx2w(x) + (side ? 0.35 : -0.35), 0.06, cz2w(row));
    root.add(g, sw);
    Wd.gates.push({ row, side, x, g, sw, open: 0, target: 0 });
  }
  Wd.setGate = (row, open) => { for (const gt of Wd.gates) if (gt.row === row) gt.target = open ? 1 : 0; };
  Wd.gateOpenness = (row) => { const gt = Wd.gates.find((q) => q.row === row); return gt ? gt.open : 0; };

  // ---------------- decor ----------------
  const deco = new THREE.Group(); root.add(deco);
  const stoneM = new THREE.MeshStandardMaterial({ map: tex.stone(2, 3), color: 0x8a7ab8, roughness: 0.9, flatShading: true });
  Wd.flames = [];
  const flameM = new THREE.MeshBasicMaterial({ color: 0xff9a30 }), flameM2 = new THREE.MeshBasicMaterial({ color: 0xffe070 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const px = sx * (PW / 2 + 3.2), pz = sz * (PH / 2 + 2.6);
    deco.add(mesh(new THREE.CylinderGeometry(1.0, 1.25, 0.8, 8), stoneM, { pos: [px, -0.6, pz] }));
    deco.add(mesh(new THREE.CylinderGeometry(0.75, 0.9, 6.5, 8), stoneM, { pos: [px, 2.6, pz] }));
    deco.add(mesh(new THREE.CylinderGeometry(1.1, 0.8, 0.7, 8), stoneM, { pos: [px, 6.2, pz] }));
    deco.add(mesh(new THREE.CylinderGeometry(0.5, 0.35, 0.3, 8), mat(0x2e2e3a), { pos: [px, 6.7, pz] }));
    const f = mesh(new THREE.ConeGeometry(0.4, 1.1, 6), flameM, { cast: false, pos: [px, 7.3, pz] }); const f2 = mesh(new THREE.ConeGeometry(0.22, 0.8, 6), flameM2, { cast: false, pos: [px, 7.2, pz] });
    deco.add(f, f2); Wd.flames.push(f, f2);
  }
  // grafzerken
  const stoneG = mat(0x7a7a96, { flatShading: true });
  for (let i = 0; i < 11; i++) {
    const side = i % 2 ? 1 : -1, px = side * (PW / 2 + 4 + rng() * 14), pz = (rng() - 0.5) * 40;
    const gg = new THREE.Group(); gg.position.set(px, -1.5, pz); gg.rotation.y = (rng() - 0.5) * 0.7; gg.rotation.z = (rng() - 0.5) * 0.18;
    gg.add(mesh(new THREE.BoxGeometry(1.1, 1.6, 0.3), stoneG, { pos: [0, 0.8, 0] }), mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 10), stoneG, { pos: [0, 1.6, 0], rot: [Math.PI / 2, 0, 0] }), mesh(new THREE.BoxGeometry(0.12, 0.7, 0.05), mat(0x4a4a66), { cast: false, pos: [0, 1.0, 0.17] }), mesh(new THREE.BoxGeometry(0.5, 0.12, 0.05), mat(0x4a4a66), { cast: false, pos: [0, 1.15, 0.17] }));
    deco.add(gg);
  }
  // pompoenen rond het platform (gloeien)
  Wd.pumpkins = [];
  for (let i = 0; i < 7; i++) {
    const p = makePumpkin(); const a = i / 7 * TAU + 0.4; const rx = PW / 2 + 5 + rng() * 5, rz = PH / 2 + 4 + rng() * 3;
    p.position.set(Math.cos(a) * rx, -1.5, Math.sin(a) * rz); p.rotation.y = -a + Math.PI / 2 + (rng() - 0.5); p.scale.setScalar(0.9 + rng() * 0.7); deco.add(p); Wd.pumpkins.push(p);
  }
  // spandoeken
  const bannerCols = [0x2ef2a8, 0xff5ad8, 0x5a8cff];
  for (let i = 0; i < 3; i++) {
    const bx = (i - 1) * 16, g = new THREE.Group(); g.position.set(bx, 0, -PH / 2 - 4.5);
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.6, 5), mat(0x3a3a50), { cast: false, pos: [0, 5.5, 0], rot: [0, 0, Math.PI / 2] }));
    const bm = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5), new THREE.MeshBasicMaterial({ color: bannerCols[i], side: THREE.DoubleSide })); bm.position.set(0, 3.2, 0); g.add(bm);
    g.add(mesh(new THREE.CircleGeometry(0.9, 12), new THREE.MeshBasicMaterial({ color: 0x120828, side: THREE.DoubleSide }), { cast: false, pos: [0, 3.5, 0.02] }));
    deco.add(g);
  }
  mergeStatic(deco);
  // vleermuizen
  Wd.bats = [];
  for (let i = 0; i < 6; i++) { const b = makeBat(); b.userData.ph = rng() * TAU; b.userData.r = 14 + rng() * 14; b.userData.h = 6 + rng() * 6; b.userData.sp = 0.25 + rng() * 0.3; root.add(b); Wd.bats.push(b); }
  // dwaallichtjes
  const N = 18, wp = new Float32Array(N * 3), wph = [];
  for (let i = 0; i < N; i++) { wph.push([rng() * TAU, 0.3 + rng() * 0.5, 2 + rng() * 3]); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  const wisps = new THREE.Points(wg, new THREE.PointsMaterial({ map: glowTex(), color: 0x9affd8, size: 1.6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })); wisps.frustumCulled = false; root.add(wisps);

  // neon-bord onder het doolhof
  const sign = canvasTex(1024, 128, (g, w, h) => {
    g.font = 'bold 84px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = '#ff5ad8'; g.shadowBlur = 24; g.fillStyle = '#ffd6f6'; g.fillText('SPOOKJACHT  NEONKELDER', w / 2, h / 2 + 4);
    g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = '#ff5ad8'; g.strokeText('SPOOKJACHT  NEONKELDER', w / 2, h / 2 + 4);
  });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(PW * 0.7, PW * 0.7 / 8), new THREE.MeshBasicMaterial({ map: sign, transparent: true, depthWrite: false }));
  sg.rotation.x = -Math.PI / 2; sg.position.set(0, 0.04, PH / 2 + 4.2); root.add(sg);

  Wd.update = (t, dt) => {
    Wd.rimMat.color.setHSL((t * 0.08) % 1, 0.9, 0.62);
    for (const f of Wd.flames) { f.scale.set(1 + Math.sin(t * 9 + f.position.x) * 0.1, 1 + Math.sin(t * 13 + f.position.z) * 0.18, 1); }
    for (const b of Wd.bats) {
      const u = b.userData, a = t * u.sp + u.ph;
      b.position.set(Math.cos(a) * u.r * 1.3, u.h + Math.sin(a * 3) * 0.8, Math.sin(a) * u.r * 0.8 - 4); b.rotation.y = -a + Math.PI;
      const fl = Math.sin(t * 14 + u.ph) * 0.9; for (const w of u.wings) w.p.rotation.z = w.sd * fl;
    }
    for (let i = 0; i < N; i++) { const [ph, sp, r] = wph[i]; const a = t * sp * 0.4 + ph; wp[i * 3] = Math.cos(a) * (PW / 2 + 6 + r * 3); wp[i * 3 + 1] = 1.2 + Math.sin(t * sp * 2 + ph) * 0.8 + r * 0.4; wp[i * 3 + 2] = Math.sin(a * 1.3) * (PH / 2 + 4 + r * 2); }
    wg.attributes.position.needsUpdate = true;
    for (const p of Wd.pumpkins) p.children[0].material.emissiveIntensity = 0.5 + Math.sin(t * 3 + p.position.x) * 0.2;
    for (const gt of Wd.gates) {
      gt.open += (gt.target - gt.open) * (1 - Math.exp(-6 * dt));
      gt.g.position.y = -1.3 * smoothstep(0, 1, gt.open); gt.g.visible = gt.open < 0.98;
      gt.sw.material.opacity = 0.9 * smoothstep(0.3, 1, gt.open); gt.sw.rotation.z = -t * (gt.side ? -1.5 : 1.5);
    }
  };
  return Wd;
}
