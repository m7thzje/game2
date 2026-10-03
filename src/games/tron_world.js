import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, mulberry32, TAU } from '../engine/util.js';
import { skyTexture } from '../engine/lights.js';

// Omgeving van "Lichtspoor-Duel": een neon-arena (40 x 30 cellen) in een kasteel van licht. Vloer met gloeiend raster,
// krimpende lava-muren, kasteeltorens aan de horizon, zwevende neonvormen. Sporen, obstakels en vuur zijn InstancedMeshes.

export const T = { W: 40, H: 30, CAP: 1700 };
export const cellX = (c) => c - T.W / 2 + 0.5, cellZ = (r) => r - T.H / 2 + 0.5;
const Y = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
export function setI(im, i, x, y, z, sx = 1, sy = sx, sz = sx, ry = 0, flat = false) { _p.set(x, y, z); if (flat) _q.setFromAxisAngle(Y, ry).multiply(_qx); else _q.setFromAxisAngle(Y, ry); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); im.setMatrixAt(i, _m); }
export function inst(geo, material, n, { cast = false, dyn = true } = {}) {
  const m = new THREE.InstancedMesh(geo, material, n); m.castShadow = cast; m.receiveShadow = false; m.frustumCulled = false;
  if (dyn) m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < n; i++) setI(m, i, 0, -50, 0, 0);
  return m;
}
export const NEON = [0x3dff8f, 0x3ab4ff];                // spoorkleuren: Wes groen, Jor blauw
export const NEON_CSS = ['#3dff8f', '#3ab4ff'];

function floorTexture() {
  const S = 32;
  return canvasTex(T.W * S, T.H * S, (g, w, h) => {
    const bg = g.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.62); bg.addColorStop(0, '#1a1040'); bg.addColorStop(1, '#07031a'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // startzones in spelerskleur
    for (const [x0, col] of [[0, '61,255,143'], [w, '58,180,255']]) { const gr = g.createLinearGradient(x0, 0, x0 === 0 ? w * 0.3 : w * 0.7, 0); gr.addColorStop(0, `rgba(${col},.28)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(x0 === 0 ? 0 : w * 0.7, 0, w * 0.3, h); }
    g.lineWidth = 1.5;
    for (let c = 0; c <= T.W; c++) { g.strokeStyle = c % 5 === 0 ? 'rgba(200,110,255,.8)' : 'rgba(150,80,240,.38)'; g.beginPath(); g.moveTo(c * S, 0); g.lineTo(c * S, h); g.stroke(); }
    for (let r = 0; r <= T.H; r++) { g.strokeStyle = r % 5 === 0 ? 'rgba(200,110,255,.8)' : 'rgba(150,80,240,.38)'; g.beginPath(); g.moveTo(0, r * S); g.lineTo(w, r * S); g.stroke(); }
    // middencirkel + chevrons
    g.strokeStyle = 'rgba(255,120,220,.65)'; g.lineWidth = 5; g.beginPath(); g.arc(w / 2, h / 2, 5 * S, 0, TAU); g.stroke(); g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 5.6 * S, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(255,120,220,.5)'; for (let k = 0; k < 8; k++) { g.save(); g.translate(w / 2, h / 2); g.rotate(k / 8 * TAU); g.fillRect(5.9 * S, -4, 22, 8); g.restore(); }
    for (const [x, dir, col] of [[3.5 * S, 1, 'rgba(61,255,143,.8)'], [w - 3.5 * S, -1, 'rgba(58,180,255,.8)']]) { g.strokeStyle = col; g.lineWidth = 6; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + dir * (k * 22), h / 2 - 30); g.lineTo(x + dir * (k * 22 + 18), h / 2); g.lineTo(x + dir * (k * 22), h / 2 + 30); g.stroke(); } }
  });
}
function obstTexture() {
  return canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#1b1230'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff8a2a'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6); g.strokeStyle = 'rgba(255,200,90,.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(8, 8); g.lineTo(w - 8, h - 8); g.moveTo(w - 8, 8); g.lineTo(8, h - 8); g.stroke(); });
}
function barrierTexture() {
  return canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#2a0a10'; g.fillRect(0, 0, w, h); g.fillStyle = '#ff4a1a'; for (let k = -2; k < 6; k++) { g.beginPath(); g.moveTo(k * 22, 0); g.lineTo(k * 22 + 12, 0); g.lineTo(k * 22 + 12 + h, h); g.lineTo(k * 22 + h, h); g.fill(); } g.fillStyle = 'rgba(255,230,120,.85)'; g.fillRect(0, 0, w, 6); });
}
const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
function windowsTexture() {
  return canvasTex(64, 128, (g, w, h) => { g.fillStyle = '#120a28'; g.fillRect(0, 0, w, h); const r = mulberry32(8); for (let y = 8; y < h - 8; y += 14) for (let x = 6; x < w - 6; x += 14) if (r() < 0.55) { g.fillStyle = ['#ffd86a', '#ff6ad8', '#6ad8ff', '#a06aff'][(r() * 4) | 0]; g.fillRect(x, y, 7, 9); } });
}
export function itemTexture(type) {
  const col = { eraser: '#ff7ad8', gap: '#ffe14a', charge: '#4af0ff' }[type];
  return canvasTex(128, 128, (g) => {
    g.translate(64, 64);
    const gr = g.createRadialGradient(0, 0, 8, 0, 0, 62); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.6, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.fill();
    g.fillStyle = '#150a30'; g.strokeStyle = '#150a30'; g.lineWidth = 8; g.lineCap = 'round'; g.lineJoin = 'round';
    if (type === 'eraser') { g.save(); g.rotate(-0.6); g.fillRect(-30, -14, 60, 28); g.fillStyle = col; g.fillRect(-30, -14, 22, 28); g.restore(); g.lineWidth = 6; g.beginPath(); g.moveTo(-34, 30); g.lineTo(34, 30); g.stroke(); }
    else if (type === 'gap') { g.beginPath(); g.moveTo(-40, 8); g.lineTo(-16, 8); g.moveTo(16, 8); g.lineTo(40, 8); g.stroke(); g.beginPath(); g.arc(0, -4, 22, Math.PI * 1.05, Math.PI * 1.95); g.stroke(); g.lineWidth = 5; g.beginPath(); g.moveTo(24, -20); g.lineTo(26, -4); g.lineTo(10, -8); g.stroke(); }
    else { g.beginPath(); g.moveTo(8, -38); g.lineTo(-22, 6); g.lineTo(-2, 6); g.lineTo(-10, 38); g.lineTo(24, -8); g.lineTo(2, -8); g.closePath(); g.fill(); }
  });
}

export function buildWorld(ctx, L) {
  const { scene } = ctx; const rng = mulberry32(2024);
  const W = { t: 0, cheerT: 0, shapes: [] };
  scene.background = skyTexture('#05010f', '#241046');
  scene.fog = new THREE.Fog(0x120830, 70, 190);
  L.hemi.color.set(0xb0a0ff); L.hemi.groundColor.set(0x301050); L.hemi.intensity = 1.0;
  L.sun.color.set(0xd8c8ff); L.sun.intensity = 1.0; L.sun.position.set(-10, 40, 14);
  const AX = T.W, AZ = T.H;

  // ---------------- vloer ----------------
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.35, metalness: 0.3 });
  scene.add(mesh(new THREE.PlaneGeometry(AX, AZ), floorMat, { cast: false, rot: [-Math.PI / 2, 0, 0] }));
  const gridT = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#0a0420'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(140,70,255,.5)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h); }, { repeat: [60, 60] });
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshBasicMaterial({ map: gridT, color: 0x9070ff, fog: true })); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.4; scene.add(outer); W.outer = outer; W.gridT = gridT;
  // sokkel
  scene.add(mesh(new THREE.BoxGeometry(AX + 6, 1.2, AZ + 6), mat(0x20143c, { metalness: 0.5, roughness: 0.4 }), { cast: false, pos: [0, -0.62, 0] }));
  const rim = new THREE.Mesh(new THREE.BoxGeometry(AX + 6.4, 0.14, AZ + 6.4), new THREE.MeshBasicMaterial({ color: 0xc060ff })); rim.position.y = -0.3; scene.add(rim);

  // ---------------- barrière (krimpt): 4 dozen ----------------
  const barT = barrierTexture(); barT.wrapS = barT.wrapT = THREE.RepeatWrapping;
  const barM = new THREE.MeshStandardMaterial({ map: barT, emissive: 0xff3a10, emissiveIntensity: 0.4, color: 0x907070, roughness: 0.5 });
  W.bars = [0, 1, 2, 3].map(() => { const b = mesh(new THREE.BoxGeometry(1, 0.9, 1), barM, { cast: false }); scene.add(b); return b; });
  W.barT = barT;
  W.setBounds = (x0, x1, z0, z1) => {          // wereldcoördinaten van het speelveld
    const E = 8, h = 0.45;
    W.bars[0].position.set((x0 - E / 2 - 0.0), h, 0); W.bars[0].scale.set(E, 1, AZ + 2 * E + 4);
    W.bars[1].position.set((x1 + E / 2), h, 0); W.bars[1].scale.set(E, 1, AZ + 2 * E + 4);
    W.bars[2].position.set(0, h, z0 - E / 2); W.bars[2].scale.set(AX + 2 * E + 4, 1, E);
    W.bars[3].position.set(0, h, z1 + E / 2); W.bars[3].scale.set(AX + 2 * E + 4, 1, E);
    barT.repeat.set(Math.max(1, (z1 - z0) / 4), 1);
  };
  W.setBounds(-AX / 2, AX / 2, -AZ / 2, AZ / 2);
  // gloeiende rand langs de binnenkant
  W.edgeGlow = [0, 1, 2, 3].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff5a20, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.y = 0.04; scene.add(m); return m; });
  W.setEdge = (x0, x1, z0, z1, pulse) => {
    const w = 2.2 + pulse * 0.8;
    W.edgeGlow[0].position.x = x0 + w / 2; W.edgeGlow[0].position.z = (z0 + z1) / 2; W.edgeGlow[0].scale.set(w, z1 - z0, 1);
    W.edgeGlow[1].position.x = x1 - w / 2; W.edgeGlow[1].position.z = (z0 + z1) / 2; W.edgeGlow[1].scale.set(w, z1 - z0, 1);
    W.edgeGlow[2].position.x = (x0 + x1) / 2; W.edgeGlow[2].position.z = z0 + w / 2; W.edgeGlow[2].scale.set(x1 - x0, w, 1);
    W.edgeGlow[3].position.x = (x0 + x1) / 2; W.edgeGlow[3].position.z = z1 - w / 2; W.edgeGlow[3].scale.set(x1 - x0, w, 1);
  };
  W.setEdge(-AX / 2, AX / 2, -AZ / 2, AZ / 2, 0);

  // ---------------- obstakels, sporen, vuur ----------------
  W.obst = inst(new THREE.BoxGeometry(0.96, 1.5, 0.96), new THREE.MeshStandardMaterial({ map: obstTexture(), emissive: 0x2a1060, emissiveIntensity: 0.6, color: 0x7a5ab8, roughness: 0.5, metalness: 0.3 }), 480, { cast: true }); scene.add(W.obst);
  W.obstTop = inst(new THREE.BoxGeometry(0.98, 0.08, 0.98), new THREE.MeshBasicMaterial({ color: 0xffb040 }), 480); scene.add(W.obstTop);
  W.trail = [0, 1].map((i) => {
    const wall = inst(new THREE.BoxGeometry(1.0, 0.8, 0.22), new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON[i]).multiplyScalar(0.55), transparent: true, opacity: 0.8 }), T.CAP);
    const top = inst(new THREE.BoxGeometry(1.0, 0.1, 0.34), new THREE.MeshBasicMaterial({ color: new THREE.Color(NEON[i]).lerp(new THREE.Color(0xffffff), 0.4) }), T.CAP);
    const glow = inst(new THREE.PlaneGeometry(1.0, 1.3), new THREE.MeshBasicMaterial({ color: NEON[i], transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false }), T.CAP);
    scene.add(wall, top, glow); return { wall, top, glow };
  });
  W.fire = inst(new THREE.ConeGeometry(0.5, 1.6, 7), new THREE.MeshBasicMaterial({ color: 0xff8a1a }), 200); W.fireI = inst(new THREE.ConeGeometry(0.3, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0xffe880 }), 200); scene.add(W.fire, W.fireI);
  W.lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); W.lane.rotation.x = -Math.PI / 2; W.lane.position.y = 0.06; W.lane.visible = false; scene.add(W.lane);

  // ---------------- kasteeltorens aan de horizon ----------------
  const wt = windowsTexture(); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(2, 3);
  const NT = 34;
  const towers = inst(new THREE.CylinderGeometry(1, 1.15, 1, 10, 1, true), new THREE.MeshBasicMaterial({ map: wt, color: 0xb8a0ff, fog: true }), NT, { dyn: false });
  const roofs = inst(new THREE.ConeGeometry(1.3, 1, 10), new THREE.MeshBasicMaterial({ color: 0x5a2aa0, fog: true }), NT, { dyn: false });
  const rings = inst(new THREE.TorusGeometry(1.3, 0.1, 5, 14), new THREE.MeshBasicMaterial({ color: 0xff5ad8, fog: false }), NT, { dyn: false });
  for (let i = 0; i < NT; i++) {
    const a = i / NT * TAU + rng() * 0.12, rr = 62 + rng() * 26, hgt = 14 + rng() * 26, rad = 2.6 + rng() * 2.6, x = Math.cos(a) * rr, z = Math.sin(a) * rr * 0.85 - 6;
    setI(towers, i, x, hgt / 2 - 0.4, z, rad, hgt, rad); setI(roofs, i, x, hgt + rad * 0.9 - 0.4, z, rad, rad * 1.8, rad); setI(rings, i, x, hgt + 0.2, z, rad * 1.02, rad * 1.02, rad * 1.02, 0, true);
  }
  scene.add(towers, roofs, rings);
  // zwevende neonvormen
  const shapeGeo = [new THREE.OctahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 0)];
  W.shapeM = [0xff5ad8, 0x5ad8ff, 0xffe05a, 0xa06aff].map((c) => new THREE.MeshBasicMaterial({ color: c, wireframe: true, fog: false }));
  for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(shapeGeo[i % 3], W.shapeM[i % 4]); const a = rng() * TAU, rr = 34 + rng() * 40; m.position.set(Math.cos(a) * rr, 8 + rng() * 22, Math.sin(a) * rr * 0.8 - 8); m.scale.setScalar(1.2 + rng() * 2.4); scene.add(m); W.shapes.push({ m, sp: 0.2 + rng() * 0.6, ph: rng() * 6, y0: m.position.y }); }
  // sterren
  { const n = 260, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rng() * TAU, e = 0.15 + rng() * 1.1, rr = 130; pos[i * 3] = Math.cos(a) * Math.cos(e) * rr; pos[i * 3 + 1] = Math.sin(e) * rr * 0.8 + 10; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * rr * 0.8 - 20; }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); scene.add(new THREE.Points(gg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false }))); }
  // grote glim-lampen op de hoeken van het veld
  W.lamps = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = mesh(new THREE.CylinderGeometry(0.2, 0.3, 4, 6), mat(0x2a1a4a, { metalness: 0.6 }), { cast: false, pos: [sx * (AX / 2 + 2.2), 2, sz * (AZ / 2 + 2.2)] }); scene.add(pole);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: sx < 0 ? 0x3dff8f : 0x3ab4ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.set(sx * (AX / 2 + 2.2), 4.4, sz * (AZ / 2 + 2.2)); s.scale.set(6, 6, 1); scene.add(s); W.lamps.push(s);
  }
  W.update = (dt) => {
    W.t += dt; const t = W.t;
    W.gridT.offset.set(0, (t * 0.02) % 1);
    W.barT.offset.x = (t * 0.2) % 1;
    for (const s of W.shapes) { s.m.rotation.x += dt * s.sp; s.m.rotation.y += dt * s.sp * 0.7; s.m.position.y = s.y0 + Math.sin(t * 0.6 + s.ph) * 1.2; }
    W.lamps.forEach((l, i) => { l.material.opacity = 0.65 + Math.sin(t * 3 + i) * 0.15; });
    floorMat.emissiveIntensity = 0;
  };
  return W;
}
