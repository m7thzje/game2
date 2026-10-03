import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, makeBrother, PLAYER_COLORS } from '../engine/chars.js';
import { skyTexture } from '../engine/lights.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving van "Raket-Voetbal": een neon-stadion diep in de berg (Neonkelder). Gras-pitch met muren en schuine hoeken, twee doelen,
// boost-pads, tribunes met een juichend publiek, zwevend neon-grid, kristallen, zoeklichten en een scorescherm.

const LX = 17, LZ = 10.2, CH = 4.2, GW = 4.4, GD = 3.4, GH = 3.3;
// omtrek van het speelveld (tegen de klok in), inclusief de doelzakken; elk paar punten = een muur-segment
const OUT = [[-LX + CH, -LZ], [LX - CH, -LZ], [LX, -LZ + CH], [LX, -GW], [LX + GD, -GW], [LX + GD, GW], [LX, GW], [LX, LZ - CH], [LX - CH, LZ], [-LX + CH, LZ], [-LX, LZ - CH], [-LX, GW], [-LX - GD, GW], [-LX - GD, -GW], [-LX, -GW], [-LX, -LZ + CH]];
export const ARENA = { LX, LZ, CH, GW, GD, GH, OUT, SEG: OUT.map((p, i) => { const q = OUT[(i + 1) % OUT.length]; return [p[0], p[1], q[0], q[1]]; }) };
export const PADS = [[-LX + 4.2, -LZ + 3.1, 1], [LX - 4.2, -LZ + 3.1, 1], [-LX + 4.2, LZ - 3.1, 1], [LX - 4.2, LZ - 3.1, 1], [0, -LZ + 2.6, 0], [0, LZ - 2.6, 0], [-6.5, 0, 0], [6.5, 0, 0]];

const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

function pitchTexture(cols) {
  const W = 1536, H = Math.round(1536 * (2 * LZ) / (2 * (LX + GD)));
  return canvasTex(W, H, (g, w, h) => {
    const sx = w / (2 * (LX + GD)), sz = h / (2 * LZ), X = (x) => (x + LX + GD) * sx, Z = (z) => (z + LZ) * sz;
    // maaistrepen
    const n = 14; for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? '#1c7a52' : '#208a5a'; g.fillRect(i * w / n, 0, w / n + 1, h); }
    const r = mulberry32(8); for (let i = 0; i < 1800; i++) { g.fillStyle = r() < 0.5 ? 'rgba(10,70,40,.25)' : 'rgba(120,255,190,.12)'; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
    // doelzakken: donker
    g.fillStyle = '#0d2a30'; g.fillRect(0, 0, X(-LX), h); g.fillRect(X(LX), 0, w - X(LX), h);
    // doelgebieden in de kleur van de speler
    for (const s of [-1, 1]) { const c = cols[s < 0 ? 0 : 1]; const x0 = s < 0 ? X(-LX) : X(LX - 7), x1 = s < 0 ? X(-LX + 7) : X(LX); g.fillStyle = c.replace('1)', '.2)'); g.fillRect(x0, Z(-GW - 2.4), x1 - x0, (2 * GW + 4.8) * sz); }
    g.strokeStyle = 'rgba(210,255,240,.92)'; g.lineWidth = 7; g.shadowColor = 'rgba(120,255,220,.9)'; g.shadowBlur = 14;
    g.strokeRect(X(-LX) + 3, 3, X(LX) - X(-LX) - 6, h - 6);
    g.beginPath(); g.moveTo(X(0), 0); g.lineTo(X(0), h); g.stroke();
    g.beginPath(); g.ellipse(X(0), Z(0), 4.3 * sx, 4.3 * sz, 0, 0, TAU); g.stroke();
    for (const s of [-1, 1]) { const c = cols[s < 0 ? 0 : 1].replace('1)', '.95)'); g.strokeStyle = c; g.strokeRect(s < 0 ? X(-LX) : X(LX - 7), Z(-GW - 2.4), 7 * sx, (2 * GW + 4.8) * sz); }
    g.shadowBlur = 0; g.fillStyle = 'rgba(210,255,240,.92)'; g.beginPath(); g.ellipse(X(0), Z(0), 0.4 * sx, 0.4 * sz, 0, 0, TAU); g.fill();
    // bever-embleem in het midden
    g.font = `bold ${Math.round(3.2 * sz)}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,.1)'; g.fillText('NEONKELDER', X(0), Z(0));
  });
}
function gridTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0a0720'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,80,220,.85)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,220,255,.35)'; g.lineWidth = 2; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
  });
}
function rockTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(31); g.fillStyle = '#1b1236'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const l = 20 + r() * 40; g.fillStyle = `rgba(${l + 30},${l},${l + 80},${0.25 + r() * 0.3})`; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 30, 4 + r() * 16, r() * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(255,90,220,.2)'; g.lineWidth = 1.5; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
  });
}
function netTex() { return canvasTex(128, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(220,245,255,.8)'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); } for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); } }); }
function crystal(color, h = 3) {
  const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.93, flatShading: true });
  for (const [x, z, s, rz, rx] of [[0, 0, 1, 0, 0], [0.5, 0.2, 0.62, 0.35, 0.2], [-0.5, 0.1, 0.55, -0.4, -0.1], [0.15, -0.5, 0.45, 0.1, -0.5]]) g.add(mesh(new THREE.ConeGeometry(h * 0.16 * (0.6 + s * 0.6), h * s, 5), m, { cast: false, pos: [x * h * 0.5, h * s * 0.5, z * h * 0.5], rot: [rx, 0, rz] }));
  return g;
}

// ---------------- rolpoppetje op een bumper-kar ----------------
export function makeCar(i) {
  const colr = PLAYER_COLORS[i]; const g = new THREE.Group(); g.userData.dynamic = true;
  const body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshStandardMaterial({ color: colr, roughness: 0.45, metalness: 0.1, emissive: colr, emissiveIntensity: 0.22 });
  const dark = mat(0x23233a, { metalness: 0.5, roughness: 0.5 }), white = mat(0xf2f4ff, { flatShading: false, roughness: 0.4 }), glassM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  body.add(mesh(new THREE.BoxGeometry(1.5, 0.5, 2.3), paint, { pos: [0, 0.55, 0] }));
  body.add(mesh(new THREE.BoxGeometry(1.2, 0.35, 1.0), paint, { pos: [0, 0.9, -0.55] }));
  body.add(mesh(new THREE.BoxGeometry(1.7, 0.18, 0.5), white, { pos: [0, 1.2, -1.15] }));        // spoiler
  for (const sx of [-1, 1]) body.add(mesh(new THREE.BoxGeometry(0.12, 0.35, 0.3), dark, { cast: false, pos: [sx * 0.7, 1.0, -1.1] }));
  // bumpers (voor en achter): dikke witte rollen
  for (const z of [1.25, -1.25]) { body.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.9, 10), white, { pos: [0, 0.5, z], rot: [0, 0, Math.PI / 2] })); body.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), white, { cast: false, pos: [0.95, 0.5, z] })); body.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), white, { cast: false, pos: [-0.95, 0.5, z] })); }
  for (const sx of [-1, 1]) { body.add(mesh(new THREE.BoxGeometry(0.3, 0.16, 0.08), glassM, { cast: false, pos: [sx * 0.45, 0.62, 1.16] })); }
  const wheels = [];
  for (const [x, z] of [[0.82, 0.8], [-0.82, 0.8], [0.82, -0.8], [-0.82, -0.8]]) { const w = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.32, 12), dark, { pos: [x, 0.38, z], rot: [0, 0, Math.PI / 2] }); body.add(w); wheels.push(w); body.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8), white, { cast: false, pos: [x, 0.38, z], rot: [0, 0, Math.PI / 2] })); }
  // overrol-beugel
  for (const sx of [-1, 1]) body.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 5), dark, { cast: false, pos: [sx * 0.55, 1.25, -0.2], rot: [0.0, 0, 0] }));
  body.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.1, 5), dark, { cast: false, pos: [0, 1.75, -0.2], rot: [0, 0, Math.PI / 2] }));
  // het poppetje
  const c = makeBrother(i); c.group.scale.setScalar(0.62); c.group.position.set(0, 0.55, -0.15); c.pose = 'carry'; body.add(c.group);
  // vlam, glow, onderlicht
  const flame = new THREE.Group(); flame.position.set(0, 0.6, -1.5); body.add(flame);
  const fm = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const f1 = mesh(new THREE.ConeGeometry(0.4, 1.8, 8), fm, { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -0.9] }); flame.add(f1);
  const f2 = mesh(new THREE.ConeGeometry(0.22, 1.1, 8), new THREE.MeshBasicMaterial({ color: 0xffffcc, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -0.55] }); flame.add(f2); flame.visible = false;
  const under = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.8), new THREE.MeshBasicMaterial({ map: glowTex(), color: colr, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); under.rotation.x = -Math.PI / 2; under.position.y = 0.05; g.add(under);
  return { g, body, paint, wheels, flame, f1, f2, under, c };
}
export function makeBall() {
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, w, h);
    const r = mulberry32(3);
    for (let k = 0; k < 18; k++) { const x = (k % 6) * (w / 6) + (k > 5 ? w / 12 : 0) + w / 12, y = (Math.floor(k / 6) + 0.5) * (h / 3); g.fillStyle = k % 3 ? '#222a55' : '#ff4fd0'; g.beginPath(); for (let a = 0; a < 5; a++) { const an = a / 5 * TAU + 0.3; g.lineTo(x + Math.cos(an) * 17, y + Math.sin(an) * 17); } g.closePath(); g.fill(); }
    g.strokeStyle = 'rgba(30,40,90,.35)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(i * w / 6, 0); g.lineTo(i * w / 6 + 14, h); g.stroke(); }
  });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.05, emissive: 0x6a7aff, emissiveIntensity: 0.18 });
  return mesh(new THREE.SphereGeometry(1, 20, 14), m, { cast: true });
}
export function makeUfo() {
  const g = new THREE.Group(); g.userData.dynamic = true;
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8c0d8, metalness: 0.8, roughness: 0.3 });
  g.add(mesh(new THREE.SphereGeometry(1, 20, 10), metal, { cast: false, scale: [2.8, 0.55, 2.8] }));
  g.add(mesh(new THREE.TorusGeometry(2.45, 0.14, 6, 28), new THREE.MeshStandardMaterial({ color: 0x66ffcc, emissive: 0x33ffaa, emissiveIntensity: 1 }), { cast: false, rot: [Math.PI / 2, 0, 0], pos: [0, 0.05, 0] }));
  const dome = mesh(new THREE.SphereGeometry(1.3, 14, 10, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.55, roughness: 0.1, emissive: 0x2a9ac8, emissiveIntensity: 0.4 }), { cast: false, pos: [0, 0.25, 0] }); g.add(dome);
  const al = new THREE.Group(); al.position.set(0, 0.55, 0); g.add(al);
  al.add(mesh(new THREE.SphereGeometry(0.5, 10, 8), mat(0x7aff6a, { flatShading: false }), { cast: false, scale: [1, 1.2, 1] }));
  for (const sx of [-1, 1]) al.add(mesh(new THREE.SphereGeometry(0.16, 6, 5), mat(0x111111), { cast: false, pos: [sx * 0.2, 0.1, 0.4], scale: [1, 1.5, 0.6] }));
  const lights = new THREE.Group(); g.add(lights); const cols = [0xff4fd0, 0x4fe8ff, 0xffe14a, 0x7dff8a];
  for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; lights.add(mesh(new THREE.SphereGeometry(0.18, 6, 5), new THREE.MeshBasicMaterial({ color: cols[k % 4] }), { cast: false, pos: [Math.cos(a) * 2.6, -0.05, Math.sin(a) * 2.6] })); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 3.0, 1, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x9fffd8, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); beam.visible = false; g.add(beam);
  return { g, lights, beam, al };
}

export function buildArena(ctx, L, colorsCss) {
  const { scene, fx } = ctx;
  const rng = mulberry32(2025);
  const A = { fans: [], flashT: [0, 0], cheerT: 0, crystals: [], frame: 0 };
  const idx0 = scene.children.length;
  scene.background = skyTexture('#06031a', '#1a0a3a');
  scene.fog = new THREE.Fog(0x120830, 60, 150);

  // ---------------- grot ----------------
  const rt = rockTex(); rt.wrapS = rt.wrapT = THREE.RepeatWrapping; rt.repeat.set(10, 3);
  scene.add(mesh(new THREE.CylinderGeometry(78, 78, 70, 24, 1, true), new THREE.MeshStandardMaterial({ map: rt, color: 0xc8b8ff, side: THREE.BackSide, roughness: 1, flatShading: true }), { cast: false, receive: false, pos: [0, 22, 0] }));
  const gt = gridTex(); gt.wrapS = gt.wrapT = THREE.RepeatWrapping; gt.repeat.set(26, 26);
  A.grid = gt;
  scene.add(mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.4, metalness: 0.4, emissiveMap: gt, emissive: 0xffffff, emissiveIntensity: 0.55 }), { cast: false, pos: [0, -1.3, 0], rot: [-Math.PI / 2, 0, 0] }));
  const stal = mat(0x2a2050, { flatShading: true });
  for (let i = 0; i < 28; i++) { const a = rng() * TAU, rr = 26 + rng() * 38, len = 8 + rng() * 16, r = 1 + rng() * 2; scene.add(mesh(new THREE.ConeGeometry(r, len, 6), stal, { cast: false, receive: false, pos: [Math.cos(a) * rr, 44 - len / 2, Math.sin(a) * rr], rot: [Math.PI, 0, 0] })); }
  const cols = [0xff4fd0, 0x4fe8ff, 0xb08aff, 0x6bff9a, 0xffd86b];
  [[-34, -14], [-26, -30], [-8, -36], [10, -34], [28, -28], [36, -10], [-38, 6], [38, 12], [-30, 24], [30, 26], [0, -40], [-44, -2], [44, 0]].forEach(([x, z], i) => { const c = crystal(cols[i % cols.length], 3.5 + rng() * 5); c.position.set(x, -1.3, z); c.rotation.y = rng() * 6; scene.add(c); A.crystals.push(c); });

  // ---------------- pitch + platform ----------------
  const shape = new THREE.Shape(); OUT.forEach(([x, z], k) => (k ? shape.lineTo(x, -z) : shape.moveTo(x, -z))); shape.closePath();
  const pg = new THREE.ShapeGeometry(shape); pg.rotateX(-Math.PI / 2);
  { const pos = pg.attributes.position, uv = pg.attributes.uv; for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + LX + GD) / (2 * (LX + GD)), 1 - (pos.getZ(i) + LZ) / (2 * LZ)); uv.needsUpdate = true; }
  A.pitchTex = pitchTexture(colorsCss);
  const pitch = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: A.pitchTex, roughness: 0.75 })); pitch.position.y = 0.02; pitch.receiveShadow = true; scene.add(pitch);
  scene.add(mesh(new THREE.BoxGeometry(2 * (LX + GD) + 5, 1.2, 2 * LZ + 5), new THREE.MeshStandardMaterial({ color: 0x1a1634, metalness: 0.6, roughness: 0.4 }), { cast: false, pos: [0, -0.62, 0] }));
  scene.add(mesh(new THREE.BoxGeometry(2 * (LX + GD) + 5.5, 0.1, 2 * LZ + 5.5), mat(0xff4fd0, { emissive: 0xff4fd0, emissiveIntensity: 1.1 }), { cast: false, pos: [0, -0.6, 0] }));

  // ---------------- muren (instanced) + neon-strips ----------------
  const segs = ARENA.SEG, nS = segs.length;
  const wallI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4a4a7a, roughness: 0.5, metalness: 0.4 }), nS); wallI.castShadow = true; wallI.receiveShadow = true;
  const stripI = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), nS * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), eul = new THREE.Euler(), col = new THREE.Color();
  segs.forEach(([x1, z1, x2, z2], k) => {
    const dx = x2 - x1, dz = z2 - z1, len = Math.hypot(dx, dz), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2; let nx = -dz / len, nz = dx / len; if (nx * cx + nz * cz < 0) { nx = -nx; nz = -nz; }   // naar buiten
    q.setFromEuler(eul.set(0, -Math.atan2(dz, dx), 0));
    ps.set(cx + nx * 0.35, 0.8, cz + nz * 0.35); sc.set(len + 0.7, 1.6, 0.7); wallI.setMatrixAt(k, m4.compose(ps, q, sc));
    ps.set(cx + nx * 0.02, 1.62, cz + nz * 0.02); sc.set(len + 0.5, 0.14, 0.2); stripI.setMatrixAt(k, m4.compose(ps, q, sc));
    ps.set(cx - nx * 0.02 + nx * 0.0, 0.14, cz - nz * 0.02); sc.set(len, 0.12, 0.12); stripI.setMatrixAt(nS + k, m4.compose(ps, q, sc));
    const t = clamp((cx / LX + 1) / 2, 0, 1); const c = col.setRGB(lerp(0.2, 0.3, t), lerp(1, 0.55, t), lerp(0.55, 1, t)); const mid = Math.abs(cx) < LX - 5 && Math.abs(cz) > 5;
    stripI.setColorAt(k, mid ? col.setHex(k % 2 ? 0xff4fd0 : 0x4fe8ff) : c); stripI.setColorAt(nS + k, col.setHex(0xffffff));
  });
  wallI.userData.dynamic = true; stripI.userData.dynamic = true; wallI.frustumCulled = stripI.frustumCulled = false; scene.add(wallI, stripI);

  // ---------------- doelen ----------------
  A.goals = [];
  const netT = netTex(); netT.wrapS = netT.wrapT = THREE.RepeatWrapping;
  for (const sx of [-1, 1]) {
    const gg = new THREE.Group(); gg.position.set(sx * LX, 0, 0); gg.userData.dynamic = true; scene.add(gg);
    const colHex = PLAYER_COLORS[sx < 0 ? 0 : 1];
    const netM = new THREE.MeshBasicMaterial({ map: netT, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
    const t1 = netT.clone(); t1.repeat.set(GW / 2.4, 1); t1.needsUpdate = true; const t2 = netT.clone(); t2.repeat.set(GD / 2.4, 1); t2.needsUpdate = true;
    const backM = netM.clone(); backM.map = t1; const sideM = netM.clone(); sideM.map = t2;
    gg.add(mesh(new THREE.PlaneGeometry(2 * GW, GH), backM, { cast: false, receive: false, pos: [sx * GD, GH / 2, 0], rot: [0, Math.PI / 2, 0] }));
    for (const sz of [-1, 1]) gg.add(mesh(new THREE.PlaneGeometry(GD, GH), sideM, { cast: false, receive: false, pos: [sx * GD / 2, GH / 2, sz * GW] }));
    gg.add(mesh(new THREE.PlaneGeometry(GD, 2 * GW), sideM, { cast: false, receive: false, pos: [sx * GD / 2, GH, 0], rot: [-Math.PI / 2, 0, 0] }));
    const postM = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: colHex, emissiveIntensity: 0.6, roughness: 0.3 });
    for (const sz of [-1, 1]) { gg.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, GH + 0.2, 10), postM, { pos: [0, GH / 2, sz * GW] })); gg.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, GD, 8), postM, { cast: false, pos: [sx * GD / 2, GH, sz * GW], rot: [0, 0, Math.PI / 2] })); }
    gg.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 2 * GW + 0.6, 10), postM, { pos: [0, GH + 0.1, 0], rot: [Math.PI / 2, 0, 0] }));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(2 * GW, GH), new THREE.MeshBasicMaterial({ color: colHex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); fl.position.set(sx * 0.6, GH / 2, 0); fl.rotation.y = Math.PI / 2; gg.add(fl);
    const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: colHex, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); lamp.position.set(sx * 1.5, GH + 1.6, 0); lamp.scale.set(9, 5, 1); gg.add(lamp);
    A.goals.push({ g: gg, flash: fl, lamp });
  }

  // ---------------- boost-pads ----------------
  A.pads = PADS.map(([x, z, big]) => {
    const g = new THREE.Group(); g.position.set(x, 0.05, z);
    const r = big ? 1.5 : 1.05;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.82, r, 6), new THREE.MeshBasicMaterial({ color: big ? 0xffd23f : 0x4fe8ff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r * 0.78, 6), new THREE.MeshBasicMaterial({ color: big ? 0xffa020 : 0x2a9ac8, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.01;
    const bolt = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.9, r * 1.2), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(36, 4); c.lineTo(14, 36); c.lineTo(28, 36); c.lineTo(22, 60); c.lineTo(48, 26); c.lineTo(32, 26); c.closePath(); c.fill(); }), transparent: true, depthWrite: false, opacity: 0.95 })); bolt.rotation.x = -Math.PI / 2; bolt.position.y = 0.02;
    g.add(ring, fill, bolt); scene.add(g); return { g, ring, fill, bolt, x, z, big: !!big, r };
  });

  // ---------------- tribunes + fans ----------------
  const tierM = new THREE.MeshStandardMaterial({ map: tex.stone(14, 1), color: 0x6a6aa0, roughness: 1, flatShading: true });
  const stands = [];   // [x0, z0, dirx, dirz] eerste rij; rijen lopen weg van het veld
  for (let k = 0; k < 4; k++) { scene.add(mesh(new THREE.BoxGeometry(2 * (LX + GD) + 12, 1.9 + k * 1.3, 2.0), tierM, { cast: false, receive: false, pos: [0, -0.35 + k * 0.65, -LZ - 3.6 - k * 1.9] })); }
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) scene.add(mesh(new THREE.BoxGeometry(2.0, 1.9 + k * 1.3, 2 * LZ + 4), tierM, { cast: false, receive: false, pos: [sx * (LX + GD + 3.2 + k * 1.9), -0.35 + k * 0.65, 0] }));
  const fanSpots = [];
  for (let k = 0; k < 4; k++) for (let x = -LX - GD - 4; x <= LX + GD + 4; x += 1.25) fanSpots.push([x + (rng() - 0.5) * 0.4, 1.1 + k * 1.3, -LZ - 3.6 - k * 1.9 + (rng() - 0.5) * 0.3]);
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) for (let z = -LZ - 1; z <= LZ + 1; z += 1.3) fanSpots.push([sx * (LX + GD + 3.2 + k * 1.9) + (rng() - 0.5) * 0.3, 1.1 + k * 1.3, z + (rng() - 0.5) * 0.4]);
  const nF = fanSpots.length; const fcol = [0xff4fd0, 0x4fe8ff, 0xffd23f, 0x7dff8a, 0xb08aff, 0xff7a4a, 0xffffff, 0x35c46f, 0x4a8cff];
  const bodyI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.38, 0.95, 6), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), nF);
  const headI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.34, 0), new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), nF);
  const skins = [0xf4c9a0, 0x8fcf7a, 0xe8e4d4, 0xc88a5a, 0x9ad0ff, 0xd8a0ff];
  fanSpots.forEach(([x, y, z], k) => { bodyI.setColorAt(k, col.setHex(fcol[Math.floor(rng() * fcol.length)])); headI.setColorAt(k, col.setHex(skins[Math.floor(rng() * skins.length)])); A.fans.push({ x, y, z, ph: rng() * 6, cheer: 0 }); });
  bodyI.userData.dynamic = true; headI.userData.dynamic = true; bodyI.frustumCulled = headI.frustumCulled = false; scene.add(bodyI, headI); A.bodyI = bodyI; A.headI = headI;
  // een paar echte poppetjes vooraan
  A.crowd = [];
  const kinds = ['goblin', 'skeleton', 'jester', 'dwarf', 'bard', 'guard', 'princess', 'baker'];
  for (let k = 0; k < 9; k++) { const c = makeNPC(kinds[k % kinds.length]); c.group.scale.setScalar(1.35); const x = -22 + k * 5.5 + (rng() - 0.5); c.group.position.set(x, 0.6, -LZ - 3.0); c.faceDir(0, 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(c.group); A.crowd.push({ c, y: 0.6, ph: rng() * 6, cheer: 0 }); }

  // ---------------- zoeklichten + scorescherm ----------------
  A.beams = [];
  const beamM = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  [[-14, -12, 0xff4fd0], [14, -12, 0x4fe8ff], [-14, 12, 0x4fe8ff], [14, 12, 0xff4fd0]].forEach(([x, z, c], k) => {
    const b = new THREE.Mesh(new THREE.ConeGeometry(7, 34, 10, 1, true), beamM(c)); b.position.set(x * 0.7, 17, z * 0.6); b.userData.dynamic = true; scene.add(b); A.beams.push({ b, x, z, ph: k * 1.7 });
    const lamp = mesh(new THREE.CylinderGeometry(0.6, 1.0, 0.8, 8), mat(0x333355, { metalness: 0.6 }), { cast: false, pos: [x * 0.7, 34.2, z * 0.6] }); scene.add(lamp);
  });
  const sbC = document.createElement('canvas'); sbC.width = 768, sbC.height = 256; const sbG = sbC.getContext('2d'); const sbT = new THREE.CanvasTexture(sbC); sbT.colorSpace = THREE.SRGBColorSpace;
  const sb = new THREE.Group(); sb.position.set(0, 12.5, -LZ - 11); scene.add(sb);
  sb.add(mesh(new THREE.BoxGeometry(17, 5.2, 0.8), mat(0x1a1634, { metalness: 0.6 }), { cast: false }));
  sb.add(mesh(new THREE.PlaneGeometry(16.2, 4.5), new THREE.MeshBasicMaterial({ map: sbT, toneMapped: false }), { cast: false, receive: false, pos: [0, 0, 0.42] }));
  scene.add(mesh(new THREE.BoxGeometry(17.6, 0.22, 1.0), mat(0xff4fd0, { emissive: 0xff4fd0, emissiveIntensity: 1.2 }), { cast: false, pos: [0, 15.2, -LZ - 11] }));
  A.scoreboard = (names, score, secs, note) => {
    const g = sbG, w = 768, h = 256; g.fillStyle = '#0b0724'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ff4fd0'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 40px Fredoka, Arial Black, sans-serif';
    g.fillStyle = '#7dffb0'; g.fillText(names[0].toUpperCase(), 160, 46); g.fillStyle = '#8fb8ff'; g.fillText(names[1].toUpperCase(), w - 160, 46);
    g.font = 'bold 130px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#7dffb0'; g.fillText(String(score[0]), 160, 150); g.fillStyle = '#8fb8ff'; g.fillText(String(score[1]), w - 160, 150);
    g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.fillStyle = secs <= 10 ? '#ff7a6a' : '#ffffff';
    const mm = Math.floor(Math.max(0, secs) / 60), ss = Math.floor(Math.max(0, secs) % 60); g.fillText(note || `${mm}:${String(ss).padStart(2, '0')}`, w / 2, 70);
    g.font = 'bold 28px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#cfe0ff'; g.fillText('eerste tot 5', w / 2, 210);
    sbT.needsUpdate = true;
  };
  A.scoreboard(['Wes', 'Jor'], [0, 0], 80);

  // ---------------- sfeerlicht ----------------
  const l1 = new THREE.PointLight(0xff4fd0, 1.3, 70, 1.3); l1.position.set(-16, 10, -8); scene.add(l1);
  const l2 = new THREE.PointLight(0x4fe8ff, 1.3, 70, 1.3); l2.position.set(16, 10, 8); scene.add(l2);
  A.lights = [l1, l2];
  A.merged = mergeStatic(scene, idx0);

  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);
  A.cheer = (secs = 2.5) => { for (const f of A.fans) f.cheer = secs * (0.6 + Math.random() * 0.8); for (const q of A.crowd) q.cheer = secs * (0.7 + Math.random() * 0.6); };
  A.goalFlash = (side) => { A.flashT[side] = 1.3; };
  let sparkAcc = 0;
  A.update = (t, dt) => {
    A.frame++; A.grid.offset.y = (t * 0.02) % 1;
    A.crystals.forEach((c, i) => c.children.forEach((m, k) => { m.material.emissiveIntensity = 0.7 + Math.sin(t * 1.7 + i + k) * 0.25; }));
    A.beams.forEach((o) => { o.b.rotation.x = Math.sin(t * 0.5 + o.ph) * 0.12; o.b.rotation.z = Math.cos(t * 0.4 + o.ph) * 0.12; o.b.material.opacity = 0.06 + Math.sin(t * 1.2 + o.ph) * 0.02; });
    for (let i = 0; i < 2; i++) { A.flashT[i] = Math.max(0, A.flashT[i] - dt); const fl = A.goals[i].flash; fl.material.opacity = A.flashT[i] > 0 ? (Math.sin(t * 40) > 0 ? 0.75 : 0.2) * Math.min(1, A.flashT[i] * 2) : 0; A.goals[i].lamp.material.opacity = 0.5 + Math.sin(t * 2 + i) * 0.12 + A.flashT[i] * 0.4; }
    A.lights[0].intensity = 1.2 + Math.sin(t * 1.3) * 0.25; A.lights[1].intensity = 1.2 + Math.sin(t * 1.1 + 2) * 0.25;
    for (const q of A.crowd) { q.cheer = Math.max(0, q.cheer - dt); q.c.group.position.y = q.y + (q.cheer > 0 ? Math.abs(Math.sin(t * 8 + q.ph)) * 0.8 : Math.abs(Math.sin(t * 1.6 + q.ph)) * 0.05); q.c.pose = q.cheer > 0 ? 'cheer' : 'idle'; q.c.update(dt); }
    if (A.frame % 2 === 0) {
      A.fans.forEach((f, k) => {
        f.cheer = Math.max(0, f.cheer - dt * 2);
        const hop = f.cheer > 0 ? Math.abs(Math.sin(t * 9 + f.ph)) * 0.7 : Math.abs(Math.sin(t * 1.8 + f.ph)) * 0.05;
        tmpP.set(f.x, f.y + hop, f.z); tmpM.compose(tmpP, tmpQ, tmpS); A.bodyI.setMatrixAt(k, tmpM);
        tmpP.set(f.x, f.y + hop + 0.9, f.z); tmpM.compose(tmpP, tmpQ, tmpS); A.headI.setMatrixAt(k, tmpM);
      });
      A.bodyI.instanceMatrix.needsUpdate = true; A.headI.instanceMatrix.needsUpdate = true;
    }
    sparkAcc += dt * 6; while (sparkAcc > 1) { sparkAcc -= 1; fx.particles.emit((Math.random() - 0.5) * 70, 1 + Math.random() * 14, -20 + Math.random() * 40, 0, 0.3, 0, { life: 4, size: 0.18, color: Math.random() < 0.5 ? 0xff4fd0 : 0x4fe8ff, gravity: 0, shrink: false }); }
  };
  return A;
}
