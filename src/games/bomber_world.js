import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, Butterfly } from '../engine/chars.js';
import { skyTexture } from '../engine/lights.js';

// Omgeving van "Boem-Man Arena": een steenvlonder boven een lavameer in een vulkaan-kerker,
// kasteelmuur met fakkels en vlaggen, toeschouwers (goblins, skeletten...) op richels, vleermuizen.
// Alles vast = geïnstancet of samengevoegd; kratten, stenen en vlammen zijn InstancedMeshes (1 draw call per soort).

export const B = { COLS: 13, ROWS: 11, CELL: 2 };
export const cx = (c) => (c - 6) * B.CELL;
export const cz = (r) => (r - 5) * B.CELL;
const Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function setI(im, i, x, y, z, sx = 1, sy = sx, sz = sx, ry = 0) { _p.set(x, y, z); _q.setFromAxisAngle(Y, ry); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); }
function inst(geo, material, n, { cast = true, receive = true, dyn = false } = {}) {
  const m = new THREE.InstancedMesh(geo, material, n); m.castShadow = cast; m.receiveShadow = receive; m.frustumCulled = false;
  if (dyn) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < n; i++) setI(m, i, 0, -50, 0, 0);
  return m;
}

// vloer: tegels van 64px per cel, startvelden in spelerskleur, gouden ster in het midden
function floorTexture() {
  const S = 64;
  return canvasTex(B.COLS * S, B.ROWS * S, (g, w, h) => {
    const r = mulberry32(31);
    for (let rr = 0; rr < B.ROWS; rr++) for (let c = 0; c < B.COLS; c++) {
      const x = c * S, y = rr * S, dk = (c + rr) % 2;
      g.fillStyle = dk ? '#5a4d72' : '#675a82'; g.fillRect(x, y, S, S);
      for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.06})`; g.fillRect(x + r() * S, y + r() * S, 2 + r() * 8, 2 + r() * 6); }
      g.strokeStyle = 'rgba(20,10,40,.55)'; g.lineWidth = 3; g.strokeRect(x + 1.5, y + 1.5, S - 3, S - 3);
      g.strokeStyle = 'rgba(255,255,255,.10)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 4, y + S - 4); g.lineTo(x + 4, y + 4); g.lineTo(x + S - 4, y + 4); g.stroke();
      if (r() < 0.12) { g.strokeStyle = 'rgba(15,5,30,.5)'; g.lineWidth = 2; g.beginPath(); let px = x + r() * S, py = y + r() * S; g.moveTo(px, py); for (let k = 0; k < 3; k++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 30; g.lineTo(px, py); } g.stroke(); }
    }
    // startvelden
    const pad = (c, rr, col) => { const x = c * S, y = rr * S; g.fillStyle = col; g.fillRect(x, y, S, S); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 4; g.strokeRect(x + 8, y + 8, S - 16, S - 16); };
    for (const [c, rr] of [[0, 0], [1, 0], [0, 1]]) pad(c, rr, 'rgba(60,220,120,.38)');
    for (const [c, rr] of [[12, 10], [11, 10], [12, 9]]) pad(c, rr, 'rgba(80,150,255,.38)');
    // ster in het midden (gouden krat staat erop)
    g.translate(6.5 * S, 5.5 * S); g.fillStyle = 'rgba(255,215,80,.35)'; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, rad = i % 2 ? 14 : 34; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); } g.fill();
  });
}
function crateTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#b9854e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#c4915a' : '#a97a45'; g.fillRect(8, 8 + i * 28, w - 16, 26); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(8, 33 + i * 28, w - 16, 2); }
    g.strokeStyle = '#6b4a2e'; g.lineWidth = 9; g.strokeRect(5, 5, w - 10, h - 10);
    g.lineWidth = 7; g.beginPath(); g.moveTo(10, 10); g.lineTo(w - 10, h - 10); g.moveTo(w - 10, 10); g.lineTo(10, h - 10); g.stroke();
    g.fillStyle = '#d9c27a'; for (const [x, y] of [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10], [w / 2, h / 2]]) { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
  });
}
function pillarTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#8c8a9c'; g.fillRect(0, 0, w, h); const r = mulberry32(5);
    for (let y = 0; y < h; y += 32) { const off = (y / 32) % 2 ? 32 : 0; for (let x = -off; x < w; x += 64) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.04 + r() * 0.08})`; g.fillRect(x, y, 64, 32); g.strokeStyle = 'rgba(25,20,40,.6)'; g.lineWidth = 3; g.strokeRect(x + 1, y + 1, 64, 32); } }
  });
}
function rockTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(19); g.fillStyle = '#2a1a2a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 170; i++) { const l = 22 + r() * 40; g.fillStyle = `rgba(${l + 40},${l},${l + 10},${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 30, 4 + r() * 16, r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(255,120,40,.22)'; g.lineWidth = 2; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); } g.stroke(); }
  });
}
const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

// iconen voor power-ups (getekend, geen emoji's nodig)
export const ITEM_COL = { range: '#ff8a2a', bomb: '#7a8cff', speed: '#4af0a0', shield: '#5ad8ff', mega: '#ff4a8a', gold: '#ffd23f' };
export function itemTexture(type) {
  return canvasTex(128, 128, (g) => {
    const col = ITEM_COL[type];
    g.translate(64, 64);
    const gr = g.createRadialGradient(0, 0, 8, 0, 0, 62); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.6, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.fill();
    g.fillStyle = '#1b1030'; g.strokeStyle = '#1b1030'; g.lineWidth = 6; g.lineJoin = 'round'; g.lineCap = 'round';
    if (type === 'range') { g.beginPath(); g.moveTo(0, -36); g.bezierCurveTo(30, -10, 30, 30, 0, 34); g.bezierCurveTo(-30, 30, -30, -6, 0, -36); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(0, 14, 11, 0, TAU); g.fill(); }
    else if (type === 'bomb') { g.beginPath(); g.arc(-4, 8, 26, 0, TAU); g.fill(); g.lineWidth = 7; g.beginPath(); g.moveTo(12, -10); g.quadraticCurveTo(26, -28, 36, -22); g.stroke(); g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(37, -23, 7, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.fillRect(-18, 0, 7, 7); }
    else if (type === 'speed') { g.beginPath(); g.moveTo(8, -38); g.lineTo(-22, 6); g.lineTo(-2, 6); g.lineTo(-10, 38); g.lineTo(24, -8); g.lineTo(2, -8); g.closePath(); g.fill(); }
    else if (type === 'shield') { g.beginPath(); g.moveTo(0, -36); g.lineTo(30, -24); g.quadraticCurveTo(32, 18, 0, 38); g.quadraticCurveTo(-32, 18, -30, -24); g.closePath(); g.fill(); g.fillStyle = col; g.beginPath(); g.moveTo(0, -22); g.lineTo(17, -14); g.quadraticCurveTo(18, 10, 0, 22); g.closePath(); g.fill(); }
    else if (type === 'mega') { g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = i % 2 ? 16 : 38; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.fillStyle = '#ffe14a'; g.beginPath(); g.arc(0, 0, 11, 0, TAU); g.fill(); }
    else { g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 16 : 38; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); }
  });
}

export function buildWorld(ctx, L) {
  const { scene } = ctx;
  const rng = mulberry32(4242);
  const W = { t: 0, cheerT: 0, spect: [], bats: [], flames: [] };
  scene.background = skyTexture('#14060c', '#4a1a14');
  scene.fog = new THREE.Fog(0x2a0e10, 46, 120);
  L.hemi.color.set(0xffd8b0); L.hemi.groundColor.set(0xff5a1a); L.hemi.intensity = 1.25;
  L.sun.color.set(0xffe2c0); L.sun.intensity = 1.55; L.sun.position.set(-10, 34, 14);
  const AX = B.COLS * B.CELL, AZ = B.ROWS * B.CELL;       // 26 x 22

  // ---------------- grot + lava ----------------
  const rockT = rockTexture(); rockT.wrapS = rockT.wrapT = THREE.RepeatWrapping; rockT.repeat.set(9, 3);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(78, 78, 70, 24, 1, true), new THREE.MeshStandardMaterial({ map: rockT, color: 0xd0a8a0, side: THREE.BackSide, roughness: 1, flatShading: true, emissive: 0x2a0a04, emissiveIntensity: 0.6 })); shell.position.y = 20; scene.add(shell);
  const lavaT = tex.lava(14, 14);
  const lava = new THREE.Mesh(new THREE.PlaneGeometry(230, 230), new THREE.MeshBasicMaterial({ map: lavaT, color: 0xffb070, fog: false })); lava.rotation.x = -Math.PI / 2; lava.position.y = -4.2; scene.add(lava); W.lava = lava;
  // lavaschijnsel (zacht licht rond het platform)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(70, 60), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xff6a20, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = -3.6; scene.add(glow);
  // stalactieten (plafond) + stenen pilaren in de lava
  const stalM = new THREE.MeshStandardMaterial({ color: 0x4a2a30, roughness: 0.9, flatShading: true });
  const stal = inst(new THREE.ConeGeometry(1, 1, 6), stalM, 40, { cast: false });
  for (let i = 0; i < 40; i++) { const a = rng() * TAU, rr = 26 + rng() * 40, len = 6 + rng() * 14, r = 0.9 + rng() * 1.8; setI(stal, i, Math.cos(a) * rr, 40 - len / 2, Math.sin(a) * rr - 6, r, len, r); }
  stal.rotation.x = Math.PI; scene.add(stal);

  // ---------------- platform ----------------
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.85 });
  const floor = mesh(new THREE.PlaneGeometry(AX, AZ), floorMat, { cast: false, pos: [0, 0, 0], rot: [-Math.PI / 2, 0, 0] }); scene.add(floor);
  const baseM = new THREE.MeshStandardMaterial({ map: tex.stone(8, 2), color: 0x9a8aa8, roughness: 0.95, flatShading: true });
  scene.add(mesh(new THREE.BoxGeometry(AX + 3, 3.4, AZ + 3), baseM, { cast: false, pos: [0, -1.72, 0] }));
  scene.add(mesh(new THREE.BoxGeometry(AX + 3.3, 0.18, AZ + 3.3), mat(0xe8c24a, { metalness: 0.7, roughness: 0.35 }), { cast: false, pos: [0, -0.02, 0] }));
  // steunpilaren onder het platform
  for (const [x, z] of [[-10, -8], [10, -8], [-10, 8], [10, 8], [0, 0]]) scene.add(mesh(new THREE.CylinderGeometry(1.6, 2.1, 6, 8), baseM, { cast: false, pos: [x, -6.2, z] }));
  // lage muur + kantelen rondom (samengevoegd tot één mesh)
  {
    const geos = []; const addBox = (w, h, d, x, y, z) => { const gg = new THREE.BoxGeometry(w, h, d); gg.translate(x, y, z); geos.push(gg); };
    const ex = AX / 2 + 0.6, ez = AZ / 2 + 0.6;
    addBox(AX + 2.4, 1.6, 1.2, 0, 0.8, -ez); addBox(AX + 2.4, 1.6, 1.2, 0, 0.8, ez); addBox(1.2, 1.6, AZ + 1.2, -ex, 0.8, 0); addBox(1.2, 1.6, AZ + 1.2, ex, 0.8, 0);
    for (let i = -6; i <= 6; i++) { addBox(1.3, 0.7, 1.2, i * 2, 1.9, -ez); addBox(1.3, 0.7, 1.2, i * 2, 1.9, ez); }
    for (let i = -5; i <= 5; i++) { addBox(1.2, 0.7, 1.3, -ex, 1.9, i * 2); addBox(1.2, 0.7, 1.3, ex, 1.9, i * 2); }
    const merged = mergeGeos(geos);
    scene.add(mesh(merged, new THREE.MeshStandardMaterial({ map: tex.stone(1, 1), color: 0xa89ab8, roughness: 0.9, flatShading: true }), { cast: false }));
  }

  // ---------------- pilaren, kratten, stenen, vlammen ----------------
  const pillarGeo = new THREE.BoxGeometry(1.92, 2.6, 1.92), capGeo = new THREE.BoxGeometry(2.08, 0.4, 2.08);
  const pc = []; for (let r = 0; r < B.ROWS; r++) for (let c = 0; c < B.COLS; c++) if (c % 2 === 1 && r % 2 === 1) pc.push([c, r]);
  const pil = inst(pillarGeo, new THREE.MeshStandardMaterial({ map: pillarTexture(), roughness: 0.9, flatShading: true }), pc.length);
  const cap = inst(capGeo, mat(0x5a4a78), pc.length);
  pc.forEach(([c, r], i) => { setI(pil, i, cx(c), 1.3, cz(r)); setI(cap, i, cx(c), 2.75, cz(r)); });
  scene.add(pil, cap);
  const N = B.COLS * B.ROWS;
  W.crates = inst(new THREE.BoxGeometry(1.74, 1.74, 1.74), new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.9 }), N, { dyn: true }); scene.add(W.crates);
  W.stones = inst(new THREE.BoxGeometry(1.98, 2.0, 1.98), new THREE.MeshStandardMaterial({ map: tex.stone(1, 1), color: 0x8a7a9a, roughness: 0.95, flatShading: true }), N, { dyn: true }); scene.add(W.stones);
  W.flameO = inst(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a, fog: false }), N, { cast: false, receive: false, dyn: true });
  W.flameI = inst(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe880, fog: false }), N, { cast: false, receive: false, dyn: true });
  scene.add(W.flameO, W.flameI);
  // waarschuwingsvlakken voor vallende stenen
  W.warn = inst(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.55, depthWrite: false, fog: false }), 24, { cast: false, receive: false, dyn: true });
  for (let i = 0; i < 24; i++) { _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); _m.compose(_p.set(0, -50, 0), _q, _s.set(0, 0, 0)); W.warn.setMatrixAt(i, _m); }
  scene.add(W.warn);
  // gouden krat (apart, glimt)
  const gold = new THREE.Group();
  gold.add(mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), new THREE.MeshStandardMaterial({ color: 0xffc830, emissive: 0xff9a10, emissiveIntensity: 0.55, metalness: 0.85, roughness: 0.25 })));
  gold.add(mesh(new THREE.BoxGeometry(1.9, 0.3, 1.9), new THREE.MeshStandardMaterial({ color: 0xfff0a0, metalness: 0.9, roughness: 0.2 }), { cast: false, pos: [0, 0, 0] }));
  const gs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); gs.scale.set(5, 5, 1); gold.add(gs);
  gold.visible = false; scene.add(gold); W.gold = gold;

  // ---------------- kasteelmuur, fakkels, vlaggen ----------------
  const wallZ = -AZ / 2 - 8;
  const wallM = new THREE.MeshStandardMaterial({ map: tex.bricks(14, 3), color: 0xb09a98, roughness: 0.95, flatShading: true });
  scene.add(mesh(new THREE.BoxGeometry(90, 22, 3), wallM, { cast: false, pos: [0, 5, wallZ - 1.5] }));
  { const geos = []; for (let i = -20; i <= 20; i++) { const g = new THREE.BoxGeometry(1.6, 1.4, 3); g.translate(i * 2.2, 16.7, wallZ - 1.5); geos.push(g); }
    scene.add(mesh(mergeGeos(geos), wallM, { cast: false })); }
  // grote boogramen met gloed
  for (const x of [-22, -7.5, 7.5, 22]) {
    const wd = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 7), new THREE.MeshBasicMaterial({ map: canvasTex(64, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd86a'); gr.addColorStop(1, '#ff6a20'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, h); g.lineTo(0, 40); g.arc(w / 2, 40, w / 2, Math.PI, 0); g.lineTo(w, h); g.fill(); g.fillStyle = '#2a1018'; g.fillRect(w / 2 - 2, 0, 4, h); g.fillRect(0, 70, w, 4); }), transparent: true, fog: false }));
    wd.position.set(x, 8.5, wallZ + 0.05); scene.add(wd);
  }
  // fakkels (geïnstancet) + vlammen
  const tpos = []; for (const x of [-15, 0, 15]) tpos.push([x, 3.2, wallZ + 0.4]);
  for (const sz of [-1, 1]) for (const z of [-7, 7]) tpos.push([sz * (AX / 2 + 2.4), 2.2, z]);
  W.torchPos = tpos;
  const torchPole = inst(new THREE.CylinderGeometry(0.1, 0.15, 2.4, 6), mat(0x4a3022), tpos.length, { cast: false });
  W.torchFlame = inst(new THREE.ConeGeometry(0.4, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0xffa030, fog: false }), tpos.length, { cast: false, receive: false, dyn: true });
  tpos.forEach(([x, y, z], i) => { setI(torchPole, i, x, y - 0.4, z); });
  scene.add(torchPole, W.torchFlame);
  W.torchGlow = tpos.map(([x, y, z]) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xff9a30, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(x, y + 1.0, z); s.scale.set(4.5, 4.5, 1); scene.add(s); return s; });
  // vlaggen (één mesh per vlag, wapperen via vertex-trucje: we draaien ze gewoon licht)
  W.banners = [];
  for (const [x, col] of [[-11, 0x2f9e5b], [11, 0x3a78e0], [-3.6, 0xc83a3a], [3.6, 0xc83a3a]]) {
    const bn = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 6, 1, 6), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8, map: canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, h - 34, w, 8); g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 9 : 22; g.lineTo(w / 2 + Math.cos(a) * r, 52 + Math.sin(a) * r); } g.fill(); }) }));
    bn.position.set(x, 10.5, wallZ + 0.3); bn.userData.base = bn.geometry.attributes.position.array.slice(); scene.add(bn); W.banners.push(bn);
  }

  // ---------------- richels met toeschouwers ----------------
  const ledgeM = new THREE.MeshStandardMaterial({ map: tex.stone(6, 1), color: 0x8a7a8a, roughness: 0.95, flatShading: true });
  const specs = [
    ['goblin', -17.5, 2.1, -9], ['skeleton', -17.2, 2.1, -4.5], ['dwarf', -17.4, 2.1, 0.5], ['jester', -17.3, 2.1, 5.5],
    ['guard', 17.5, 2.1, -8], ['witch', 17.3, 2.1, -3], ['goblin', 17.4, 2.1, 2.5], ['skeleton', 17.2, 2.1, 7.5],
    ['jester', -9, 1.9, -17.8], ['dwarf', 9, 1.9, -17.8], ['goblin', -2, 1.9, -18.5], ['skeleton', 3.5, 1.9, -18.5],
  ];
  for (const sx of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(5, 2.4, 24), ledgeM, { cast: false, pos: [sx * 20.5, 0.9, 0] }));
  scene.add(mesh(new THREE.BoxGeometry(34, 2.4, 4.5), ledgeM, { cast: false, pos: [0, 0.75, -19.2] }));
  for (const [kind, x, y, z] of specs) {
    const c = makeNPC(kind, { scale: 1.2 }); c.group.position.set(x, y, z); c.faceTowards(0, 0); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(c.group);
    W.spect.push({ c, base: y, ph: rng() * 6 });
  }
  // vleermuizen
  for (let i = 0; i < 6; i++) { const b = new Butterfly(0x2a1428); b.group.scale.setScalar(4); scene.add(b.group); W.bats.push({ b, r: 14 + rng() * 14, a: rng() * TAU, h: 6 + rng() * 8, sp: 0.25 + rng() * 0.3 }); }
  // draak (gimmick): hangt buiten beeld tot hij vliegt
  W.update = (dt, flameCtl) => {
    W.t += dt; const t = W.t;
    lavaT.offset.set(t * 0.012, t * 0.007);
    glow.material.opacity = 0.5 + Math.sin(t * 1.3) * 0.08;
    W.torchPos.forEach(([x, y, z], i) => { const f = 1 + Math.sin(t * 11 + i * 2.1) * 0.15 + Math.sin(t * 23 + i) * 0.08; setI(W.torchFlame, i, x, y + 1.1, z, 0.9 * f, 1.15 * f, 0.9 * f, t + i); W.torchGlow[i].material.opacity = 0.55 + Math.sin(t * 9 + i) * 0.15; });
    W.torchFlame.instanceMatrix.needsUpdate = true;
    for (const bn of W.banners) { const p = bn.geometry.attributes.position, b0 = bn.userData.base; for (let k = 0; k < p.count; k++) { const yy = b0[k * 3 + 1]; p.setZ(k, Math.sin(t * 2.2 + yy * 0.7 + bn.position.x) * 0.18 * (1 - (yy + 3) / 6)); } p.needsUpdate = true; }
    W.cheerT = Math.max(0, W.cheerT - dt);
    for (const s of W.spect) { s.c.pose = W.cheerT > 0 ? 'cheer' : 'idle'; s.c.update(dt); }
    for (const o of W.bats) { o.a += dt * o.sp; o.b.group.position.set(Math.cos(o.a) * o.r, o.h + Math.sin(o.a * 3) * 1.2, Math.sin(o.a) * o.r * 0.8 - 6); o.b.group.rotation.y = -o.a; o.b.update(dt); }
  };
  W.cheer = (s = 2) => { W.cheerT = Math.max(W.cheerT, s); };
  return W;
}

function mergeGeos(geos) {
  let n = 0; for (const g of geos) n += g.index ? g.index.count : g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
  for (const g0 of geos) { const g = g0.index ? g0.toNonIndexed() : g0; const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2); o += k; }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return mg;
}
