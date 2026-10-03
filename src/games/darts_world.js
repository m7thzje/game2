import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, Animal, makeDeurman } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving van "Pijlen-Poeha": een gezellige taverne met een reusachtig dartbord, krijtborden, een bar, een jankend haardvuur,
// een publiek van dorpelingen (instanced), een kip en de Deurman als bord-schuiver. Plus de pijl-renderer (2 draw calls voor alle pijlen).

export const DB = { BR: 3.0, CY: 5.3, FR: 1.22 };   // BR = straal tot en met het dubbelvak, CY = hoogte van het midden, FR = bordfactor
export const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
export const RINGS = { bullIn: 0.04, bullOut: 0.09, tripIn: 0.55, tripOut: 0.64, dblIn: 0.91, dblOut: 1.0 };

const COL = { black: '#1f1a1d', cream: '#f4e4b9', red: '#d8372f', green: '#2f9d4b', wire: '#cfd3dc' };

function boardTexture() {
  return canvasTex(1024, 1024, (g) => {
    const k = 410; g.translate(512, 512);
    g.fillStyle = '#17110d'; g.beginPath(); g.arc(0, 0, 505, 0, TAU); g.fill();
    g.strokeStyle = COL.wire; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, 500, 0, TAU); g.stroke();
    const bands = [[RINGS.bullOut, RINGS.tripIn, COL.black, COL.cream], [RINGS.tripIn, RINGS.tripOut, COL.red, COL.green], [RINGS.tripOut, RINGS.dblIn, COL.black, COL.cream], [RINGS.dblIn, RINGS.dblOut, COL.red, COL.green]];
    for (let i = 0; i < 20; i++) {
      const a0 = (-90 + i * 18 - 9) * Math.PI / 180, a1 = a0 + Math.PI / 10;
      for (const [r0, r1, c0, c1] of bands) { g.fillStyle = i % 2 ? c1 : c0; g.beginPath(); g.arc(0, 0, r1 * k, a0, a1); g.arc(0, 0, r0 * k, a1, a0, true); g.closePath(); g.fill(); }
    }
    g.strokeStyle = COL.wire; g.lineWidth = 3;
    for (let i = 0; i < 20; i++) { const a = (-90 + i * 18 - 9) * Math.PI / 180; g.beginPath(); g.moveTo(Math.cos(a) * RINGS.bullOut * k, Math.sin(a) * RINGS.bullOut * k); g.lineTo(Math.cos(a) * k, Math.sin(a) * k); g.stroke(); }
    for (const r of [RINGS.bullOut, RINGS.tripIn, RINGS.tripOut, RINGS.dblIn, RINGS.dblOut]) { g.beginPath(); g.arc(0, 0, r * k, 0, TAU); g.stroke(); }
    g.fillStyle = COL.green; g.beginPath(); g.arc(0, 0, RINGS.bullOut * k, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = COL.red; g.beginPath(); g.arc(0, 0, RINGS.bullIn * k, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#fff6d6'; g.font = 'bold 58px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 20; i++) { const a = (-90 + i * 18) * Math.PI / 180; g.fillText(String(ORDER[i]), Math.cos(a) * 1.11 * k, Math.sin(a) * 1.11 * k + 3); }
  });
}
const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

// ---- pijl-geometrie (vertexkleuren, tip wijst naar -z, vleugels achter) ----
function mergeParts(parts) {
  const pos = [], nor = [], col = [];
  for (const [geo, color, m4] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(m4); g.computeVertexNormals();
    const c = new THREE.Color(color), p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); }
    g.dispose();
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); bg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return bg;
}
export const DART_LEN = 1.55;
function dartGeos() {
  const R = new THREE.Matrix4().makeRotationX(Math.PI / 2), T = (z) => new THREE.Matrix4().makeTranslation(0, 0, z);
  const body = mergeParts([
    [new THREE.ConeGeometry(0.035, 0.38, 6), 0xdfe3ea, T(0.19).multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))],
    [new THREE.CylinderGeometry(0.085, 0.085, 0.62, 7), 0xd8a63a, T(0.68).multiply(R)],
    [new THREE.CylinderGeometry(0.04, 0.04, 0.42, 7), 0x2a2a34, T(1.18).multiply(R)],
  ]);
  // vleugels: 4 vinnen in kruisvorm
  const pos = [], nor = [];
  const pts = [[0, 1.08], [0.4, 1.38], [0.4, 1.55], [0, 1.55]];
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2, cx = Math.cos(a), cy = Math.sin(a);
    for (const tri of [[0, 1, 2], [0, 2, 3]]) for (const i of tri) { const [r, z] = pts[i]; pos.push(cx * r, cy * r, z); nor.push(-cy, cx, 0); }
  }
  const fl = new THREE.BufferGeometry(); fl.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fl.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return { body, flight: fl };
}
export function makeDarts(scene, cap = 28) {
  const { body, flight } = dartGeos();
  const bodyM = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.6 }), cap);
  const flM = new THREE.InstancedMesh(flight, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }), cap);
  for (const m of [bodyM, flM]) { m.frustumCulled = false; m.castShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), c = new THREE.Color();
  for (let i = 0; i < cap; i++) { bodyM.setMatrixAt(i, zero); flM.setMatrixAt(i, zero); flM.setColorAt(i, c.set(0xffffff)); }
  const free = []; for (let i = cap - 1; i >= 0; i--) free.push(i);
  return {
    alloc() { return free.length ? free.pop() : -1; },
    release(i) { if (i < 0) return; bodyM.setMatrixAt(i, zero); flM.setMatrixAt(i, zero); bodyM.instanceMatrix.needsUpdate = flM.instanceMatrix.needsUpdate = true; free.push(i); },
    set(i, m4, color) { if (i < 0) return; bodyM.setMatrixAt(i, m4); flM.setMatrixAt(i, m4); if (color != null) flM.setColorAt(i, c.set(color)); bodyM.instanceMatrix.needsUpdate = flM.instanceMatrix.needsUpdate = true; if (color != null && flM.instanceColor) flM.instanceColor.needsUpdate = true; },
    geos: { body, flight },
  };
}

// ---- krijtbord met scores ----
function chalkBoard(w3, h3, css) {
  const W = 512, H = 380, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const grp = new THREE.Group();
  grp.add(mesh(new THREE.BoxGeometry(w3 + 0.5, h3 + 0.5, 0.3), mat(0x6a3d1c, { flatShading: false }), { cast: false }));
  grp.add(mesh(new THREE.PlaneGeometry(w3, h3), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }), { cast: false, receive: false, pos: [0, 0, 0.16] }));
  const draw = (name, score, target, last, darts, trailing) => {
    g.fillStyle = '#1b3328'; g.fillRect(0, 0, W, H);
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, 'rgba(255,255,255,.06)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.font = 'bold 60px Fredoka, Arial Black, sans-serif'; g.fillStyle = css; g.fillText(name, W / 2, 56);
    g.font = 'bold 170px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#fff6d6'; g.fillText(String(score), W / 2, 190);
    // voortgangsbalk naar het doel
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(36, 272, W - 72, 26); g.fillStyle = css; g.fillRect(36, 272, (W - 72) * clamp(score / target, 0, 1), 26);
    g.strokeStyle = '#fff6d6'; g.lineWidth = 3; g.strokeRect(36, 272, W - 72, 26);
    g.font = 'bold 34px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#d7e8c8'; g.fillText(`doel: ${target}`, W / 2, 322);
    // pijltjes over
    for (let k = 0; k < 3; k++) { g.fillStyle = k < darts ? css : 'rgba(255,255,255,.2)'; g.beginPath(); g.moveTo(W - 50 - k * 34, 340); g.lineTo(W - 40 - k * 34, 366); g.lineTo(W - 60 - k * 34, 366); g.closePath(); g.fill(); }
    g.textAlign = 'left'; g.font = 'bold 30px Fredoka, Arial Black, sans-serif'; g.fillStyle = trailing ? '#ffd86b' : '#d7e8c8'; g.fillText(last || '', 30, 356);
    t.needsUpdate = true;
  };
  return { group: grp, draw };
}

export function buildTavern(ctx, L, css, hooks = {}) {
  const { scene } = ctx; const { BR, CY, FR } = DB;
  const rng = mulberry32(2025);
  const A = { crowd: [], flames: [], torches: [], t: 0, cheerT: 0, groanT: 0, dirty: [true, true], scoreboards: [], gold: [] };
  scene.background = new THREE.Color(0x1a0f0a); scene.fog = new THREE.Fog(0x24140c, 28, 70);
  const start = scene.children.length;

  // ---------------- ruimte ----------------
  const woodT = tex.planks(10, 5, '#8a5a34');
  const wall = mesh(new THREE.PlaneGeometry(60, 26), new THREE.MeshStandardMaterial({ map: woodT, color: 0xd8b890, roughness: 0.95 }), { cast: false, pos: [0, 9, -0.7] }); scene.add(wall);
  for (let x = -24; x <= 24; x += 8) scene.add(mesh(new THREE.BoxGeometry(0.7, 22, 0.5), mat(0x3e2412, { flatShading: false }), { cast: false, pos: [x, 9, -0.55] }));
  scene.add(mesh(new THREE.BoxGeometry(60, 0.5, 0.5), mat(0x3e2412, { flatShading: false }), { cast: false, pos: [0, 1.2, -0.45] }));
  scene.add(mesh(new THREE.BoxGeometry(60, 0.5, 0.5), mat(0x3e2412, { flatShading: false }), { cast: false, pos: [0, 12.5, -0.45] }));
  const floorT = tex.planks(14, 8, '#6a4224');
  scene.add(mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: floorT, color: 0xc8a888, roughness: 0.85 }), { cast: false, pos: [0, 0, 18], rot: [-Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) scene.add(mesh(new THREE.PlaneGeometry(40, 26), new THREE.MeshStandardMaterial({ map: tex.bricks(6, 4), color: 0xb89880, roughness: 1 }), { cast: false, pos: [sx * 22, 9, 16], rot: [0, -sx * Math.PI / 2, 0] }));
  scene.add(mesh(new THREE.PlaneGeometry(60, 40), mat(0x2a180c, { flatShading: false }), { cast: false, receive: false, pos: [0, 15, 12], rot: [Math.PI / 2, 0, 0] }));
  for (let z = -2; z <= 26; z += 7) scene.add(mesh(new THREE.BoxGeometry(60, 0.8, 0.8), mat(0x3a2210, { flatShading: false }), { cast: false, pos: [0, 14.6, z] }));

  // ---------------- bord-kast ----------------
  const back = mesh(new THREE.CylinderGeometry(BR * FR + 0.45, BR * FR + 0.55, 0.5, 40), new THREE.MeshStandardMaterial({ map: tex.planks(2, 2, '#4a2a16'), roughness: 0.9 }), { cast: false, pos: [0, CY, -0.4], rot: [Math.PI / 2, 0, 0] }); scene.add(back);
  const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 0.7, roughness: 0.35 }), 20); const m4 = new THREE.Matrix4();
  for (let i = 0; i < 20; i++) { const a = i / 20 * TAU; m4.makeTranslation(Math.cos(a) * (BR * FR + 0.22), CY + Math.sin(a) * (BR * FR + 0.22), -0.1); studs.setMatrixAt(i, m4); } scene.add(studs);
  A.cabinet = back;

  // het bord zelf (beweegt/draait)
  const board = new THREE.Group(); board.position.set(0, CY, 0); board.userData.dynamic = true; scene.add(board); A.board = board;
  board.add(mesh(new THREE.CircleGeometry(BR * FR, 48), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.8 }), { cast: false, pos: [0, 0, 0.02] }));
  board.add(mesh(new THREE.CylinderGeometry(BR * FR, BR * FR, 0.5, 40), mat(0x201410, { flatShading: false }), { cast: false, pos: [0, 0, -0.27], rot: [Math.PI / 2, 0, 0] }));
  // gouden vakken (dubbelring), per sector een overlay
  const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthWrite: false });
  const goldGlow = new THREE.MeshBasicMaterial({ color: 0xffc830, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < 20; i++) {
    const th = (90 - i * 18 - 9) * Math.PI / 180;
    const m = new THREE.Mesh(new THREE.RingGeometry(RINGS.dblIn * BR, RINGS.dblOut * BR, 6, 1, th, Math.PI / 10), goldMat); m.position.z = 0.04; m.visible = false; board.add(m);
    const gl = new THREE.Mesh(new THREE.RingGeometry(RINGS.dblIn * BR - 0.1, RINGS.dblOut * BR + 0.14, 6, 1, th, Math.PI / 10), goldGlow); gl.position.z = 0.05; gl.visible = false; board.add(gl);
    A.gold.push([m, gl]);
  }
  A.setGold = (set) => { for (let i = 0; i < 20; i++) { const on = set.has(i); A.gold[i][0].visible = on; A.gold[i][1].visible = on; } };

  // ---------------- krijtborden ----------------
  for (const i of [0, 1]) {
    const cb = chalkBoard(3.9, 2.85, css[i]); cb.group.position.set((i ? 1 : -1) * 7.4, 6.8, -0.4); cb.group.rotation.y = (i ? -1 : 1) * 0.1; scene.add(cb.group);
    A.scoreboards.push(cb);
    scene.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 4), mat(0x3a2412), { cast: false, pos: [(i ? 1 : -1) * 7.4 - 1.5, 9.2, -0.5] }));
  }
  const sc = (i, ...a) => { A.scoreboards[i].draw(...a); };
  A.drawScore = sc;
  // uithangbord
  const sg = mesh(new THREE.PlaneGeometry(6.2, 1.5), new THREE.MeshBasicMaterial({ map: tex.sign('PIJLEN-POEHA', { bg: '#5b3a1e', fg: '#ffe9b0', w: 512, h: 124, size: 62, font: 'Fredoka, Arial Black, sans-serif' }), toneMapped: false }), { cast: false, receive: false, pos: [0, 10.15, -0.45] }); scene.add(sg);

  // ---------------- decor ----------------
  // haard links (steen + vuur)
  { const f = new THREE.Group(); f.position.set(-13.2, 0, -0.4);
    f.add(mesh(new THREE.BoxGeometry(5, 5, 1.2), new THREE.MeshStandardMaterial({ map: tex.bricks(2, 2), color: 0xa89888, roughness: 1 }), { cast: false, pos: [0, 2.5, 0] }));
    f.add(mesh(new THREE.BoxGeometry(2.6, 2.4, 0.4), mat(0x120a06, { flatShading: false }), { cast: false, pos: [0, 1.4, 0.55] }));
    f.add(mesh(new THREE.BoxGeometry(5.6, 0.4, 1.5), mat(0x4a2a14), { cast: false, pos: [0, 5.1, 0.1] }));
    scene.add(f);
    const fire = P.campfire(); fire.position.set(-13.2, 0.4, 0.2); fire.scale.setScalar(0.9); fire.userData.dynamic = true; scene.add(fire); A.flames.push(fire);
  }
  // torens/fakkels naast het bord
  for (const sx of [-1, 1]) { const t = P.torch(0xffa030); t.position.set(sx * 5.6, 6.8, -0.1); t.scale.setScalar(1.3); t.rotation.z = -sx * 0.25; t.userData.dynamic = true; t.userData.light.intensity = 2.4; t.userData.light.distance = 24; t.userData.light.position.set(0, 1.6, 3); scene.add(t); A.torches.push(t); }
  // schild + zwaarden links, gewei rechts, banners
  { const sh = new THREE.Group(); sh.position.set(-10.2, 7.2, -0.4);
    sh.add(mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.25, 6), mat(0xb8392e, { flatShading: false }), { cast: false, rot: [Math.PI / 2, 0, 0] }));
    sh.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 6), mat(0xf0d070, { flatShading: false, metalness: 0.5 }), { cast: false, rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0.04] }));
    for (const s of [-1, 1]) { const sw = P.sword(); sw.scale.setScalar(2.4); sw.position.set(0, -0.8, 0.2); sw.rotation.z = s * 0.9; sh.add(sw); }
    scene.add(sh); }
  { const an = new THREE.Group(); an.position.set(10.6, 8.2, -0.3);
    an.add(mesh(new THREE.BoxGeometry(1.3, 1.5, 0.3), mat(0x6a4020), { cast: false }));
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) an.add(mesh(new THREE.ConeGeometry(0.1, 1.0 - k * 0.15, 5), mat(0xeadcc0), { cast: false, pos: [s * (0.9 + k * 0.4), 0.8 + k * 0.25, 0.2], rot: [0, 0, -s * (0.5 + k * 0.1)] }));
    scene.add(an); }
  A.banners = [];
  for (const [x, c] of [[-16.5, 0xd8372c], [16.5, 0x2e6fd8], [-4.6, 0xe8a82c], [4.6, 0x3a9a4a]]) { const b = P.banner(c, 3, 1.1); b.position.set(x, x > 5 || x < -5 ? 6.4 : 8.8, -0.2); b.scale.setScalar(x > 5 || x < -5 ? 1.2 : 0.7); b.userData.dynamic = true; scene.add(b); A.banners.push(b); }

  // bar rechts
  { const bar = new THREE.Group(); bar.position.set(14.2, 0, 1.6);
    bar.add(mesh(new THREE.BoxGeometry(6.6, 2.2, 1.9), new THREE.MeshStandardMaterial({ map: tex.planks(3, 1, '#7a4a28'), roughness: 0.85 }), { pos: [0, 1.1, 0] }));
    bar.add(mesh(new THREE.BoxGeometry(7.0, 0.22, 2.3), mat(0x3a2010, { flatShading: false }), { pos: [0, 2.3, 0] }));
    scene.add(bar);
    const mugG = new THREE.CylinderGeometry(0.2, 0.17, 0.42, 8), mugM = new THREE.MeshStandardMaterial({ color: 0xc89a4a, roughness: 0.6, metalness: 0.3 });
    const mugs = new THREE.InstancedMesh(mugG, mugM, 14); const mm = new THREE.Matrix4();
    for (let i = 0; i < 7; i++) { mm.makeTranslation(11.3 + i * 0.8, 2.62, 1.3 + (i % 2) * 0.5); mugs.setMatrixAt(i, mm); mm.makeTranslation(-9 - i * 0.7, 2.7, 2.6 + (i % 3) * 0.3); mugs.setMatrixAt(7 + i, mm); }
    scene.add(mugs);
    scene.add(mesh(new THREE.BoxGeometry(2.2, 0.15, 0.7), mat(0x3a2010), { cast: false, pos: [14.5, 5.6, -0.35] }), mesh(new THREE.BoxGeometry(2.2, 0.15, 0.7), mat(0x3a2010), { cast: false, pos: [14.5, 4.2, -0.35] }));
  }
  for (const [x, z, s] of [[-16, 3.5, 1.5], [-17.5, 1.5, 1.3], [17, 6, 1.4], [-6.5, 11, 1.2]]) { const b = P.barrel(s); b.position.set(x, 0, z); scene.add(b); }
  { const cr = P.crate(1.3); cr.position.set(-15, 0, 5.5); scene.add(cr); const cr2 = P.crate(1); cr2.position.set(-15.2, 1.3, 5.6); cr2.rotation.y = 0.5; scene.add(cr2); }
  // ronde tafels met kaarsen
  const tbl = (x, z) => { const t = new THREE.Group(); t.position.set(x, 0, z);
    t.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.18, 14), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#8a5a30'), roughness: 0.85 }), { pos: [0, 2.0, 0] }));
    t.add(mesh(new THREE.CylinderGeometry(0.18, 0.4, 2.0, 7), mat(0x4a2a14), { pos: [0, 1.0, 0] }));
    t.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 6), mat(0xf3ead8), { cast: false, pos: [0.3, 2.3, 0.1] }));
    const fl = mesh(new THREE.ConeGeometry(0.08, 0.22, 5), new THREE.MeshBasicMaterial({ color: 0xffc040 }), { cast: false, pos: [0.3, 2.62, 0.1] }); t.add(fl); fl.userData.flick = true; A.flames.push({ userData: { flame: fl } });
    scene.add(t); };
  tbl(-9.6, 4.2); tbl(10.2, 6.4);

  // ---------------- gebouwen samenvoegen ----------------
  mergeStatic(scene, start, { cell: 60 });

  // ---------------- publiek (instanced) ----------------
  const N = 16;
  const std = () => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
  const gBody = new THREE.CylinderGeometry(0.24, 0.32, 0.64, 8); gBody.translate(0, 0.9, 0);
  const gHead = new THREE.SphereGeometry(0.23, 9, 7); gHead.translate(0, 1.48, 0);
  const gLeg = new THREE.BoxGeometry(0.34, 0.6, 0.2); gLeg.translate(0, 0.3, 0);
  const gArm = new THREE.BoxGeometry(0.12, 0.52, 0.12); gArm.translate(0, -0.25, 0);
  const gHat = new THREE.ConeGeometry(0.22, 0.5, 7); gHat.translate(0, 1.95, 0);
  const gCap = new THREE.SphereGeometry(0.27, 8, 5, 0, TAU, 0, Math.PI / 2); gCap.scale(1, 0.6, 1); gCap.translate(0, 1.55, 0);
  const mk = (geo, n) => { const im = new THREE.InstancedMesh(geo, std(), n); im.frustumCulled = false; im.userData.dynamic = true; scene.add(im); return im; };
  const nHat = Math.ceil(N / 2), nCap = N - nHat;
  const iBody = mk(gBody, N), iHead = mk(gHead, N), iLeg = mk(gLeg, N), iArm = mk(gArm, N * 2), iHat = mk(gHat, nHat), iCap = mk(gCap, nCap);
  const shirts = [0xc86a5a, 0x5a8ac8, 0x6ac88a, 0xc8b05a, 0xa06ac8, 0xe8e0d0, 0xd88aa8, 0x7a9a5a, 0xc87a3a, 0x5ac8c0], skins = [0xf2c29b, 0xe0a47a, 0xc88a60, 0xf6d2b5, 0x9a6a46], hats = [0x8a3a3a, 0x3a5a8a, 0xe8c24a, 0x2a2a30, 0x6a4a8a, 0x3a8a5a];
  const cc = new THREE.Color(); let ha = 0, hb = 0;
  const spots = [[-8.6, 1.2], [-10.4, 2.3], [-11.8, 0.6], [-13.8, 2.6], [-9.2, 6.5], [-12.0, 4.4], [-16.2, 1.0], [-7.0, 0.4], [8.4, 1.0], [10.2, 2.4], [12.0, 5.0], [8.8, 7.4], [13.4, 4.2], [11.2, 8.4], [16.0, 3.4], [7.2, 0.3]];
  for (let i = 0; i < N; i++) {
    const [x, z] = spots[i]; const cone = i % 2 === 0; const hi = cone ? ha++ : hb++; const sh = shirts[Math.floor(rng() * shirts.length)];
    iBody.setColorAt(i, cc.set(sh)); iArm.setColorAt(i * 2, cc.set(sh)); iArm.setColorAt(i * 2 + 1, cc.set(sh));
    iHead.setColorAt(i, cc.set(skins[Math.floor(rng() * skins.length)])); iLeg.setColorAt(i, cc.set(0x4a3a2e));
    (cone ? iHat : iCap).setColorAt(hi, cc.set(hats[Math.floor(rng() * hats.length)]));
    A.crowd.push({ x, z, ph: rng() * 6, sc: 0.95 + rng() * 0.2, cone, hi, cheer: 0, yaw: Math.atan2(-x * 0.25, 9) });
  }
  const dm = new THREE.Object3D(), dm2 = new THREE.Object3D();
  A.cheer = (a = 1) => { A.cheerT = Math.max(A.cheerT, a); };
  A.groan = (a = 1) => { A.groanT = Math.max(A.groanT, a); };
  const updCrowd = (t, dt) => {
    A.cheerT = Math.max(0, A.cheerT - dt); A.groanT = Math.max(0, A.groanT - dt);
    A.crowd.forEach((c, i) => {
      const ch = A.cheerT > 0 ? Math.min(1, A.cheerT * 2) : 0, gr = A.groanT > 0 ? Math.min(1, A.groanT * 2) : 0;
      const hop = ch * Math.abs(Math.sin(t * 9 + c.ph)) * 0.28 + Math.sin(t * 2 + c.ph) * 0.02;
      dm.position.set(c.x, hop, c.z); dm.rotation.set(gr * 0.2, c.yaw, 0); dm.scale.setScalar(c.sc); dm.updateMatrix();
      iBody.setMatrixAt(i, dm.matrix); iHead.setMatrixAt(i, dm.matrix); iLeg.setMatrixAt(i, dm.matrix);
      (c.cone ? iHat : iCap).setMatrixAt(c.hi, dm.matrix);
      for (const s of [-1, 1]) {
        dm2.position.set(c.x, hop, c.z); dm2.rotation.set(0, c.yaw, 0); dm2.updateMatrix();
        const up = ch * (-2.7 + Math.sin(t * 12 + c.ph + s) * 0.5) + (1 - ch) * (Math.sin(t * 2 + c.ph + s) * 0.12 - 0.05);
        const arm = new THREE.Object3D(); arm.position.set(s * 0.36 * c.sc, 1.15 * c.sc, 0); arm.rotation.set(up, 0, s * (0.15 + ch * 0.4)); arm.scale.setScalar(c.sc); arm.updateMatrix();
        dm2.matrix.multiply(arm.matrix); iArm.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), dm2.matrix);
      }
    });
    for (const m of [iBody, iHead, iLeg, iArm, iHat, iCap]) m.instanceMatrix.needsUpdate = true;
  };
  for (const m of [iBody, iHead, iArm, iHat, iCap, iLeg]) if (m.instanceColor) m.instanceColor.needsUpdate = true;

  // ---------------- herbergier achter de bar ----------------
  const inn = makeNPC('innkeeper'); inn.group.scale.setScalar(1.45); inn.group.position.set(14.6, 0, -0.2); inn.faceDir(-0.3, 1); inn.yaw = inn.targetYaw; scene.add(inn.group); A.innkeeper = inn; inn.pose = 'carry';

  // ---------------- de kip ----------------
  const chk = new Animal('chicken'); const cg = new THREE.Group(); cg.add(chk.group); cg.scale.setScalar(2.5); cg.visible = false; scene.add(cg);
  const wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.22, 0.46, 0); w.add(mesh(new THREE.SphereGeometry(0.2, 6, 5), mat(0xf2ecdc, { flatShading: false }), { cast: false, pos: [s * 0.18, 0, -0.02], scale: [1.3, 0.35, 0.9] })); chk.group.add(w); return w; });
  A.chicken = { g: cg, a: chk, wings, on: false, x: 0, y: 0, dir: 1, t: 0, baseY: 5, hit: 0, vx: 0, vy: 0 };
  A.chicken.start = (dir, y) => { const c = A.chicken; c.on = true; c.dir = dir; c.x = -dir * 12; c.y = y; c.baseY = y; c.t = 0; c.hit = 0; cg.visible = true; cg.rotation.set(0, 0, 0); };
  A.chicken.stop = () => { A.chicken.on = false; cg.visible = false; };
  A.chicken.update = (dt, slow = 1) => {
    const c = A.chicken; if (!c.on) return; c.t += dt;
    if (c.hit > 0) { c.hit += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy -= 6 * dt; cg.rotation.z += dt * 12 * c.dir; cg.rotation.y += dt * 4; if (c.hit > 1.4) c.stop(); }
    else { c.x += c.dir * 4.4 * dt; c.y = c.baseY + Math.sin(c.t * 4.4) * 0.55; if (Math.abs(c.x) > 13) c.stop(); }
    cg.position.set(c.x, c.y, 1.9); chk.speed = 1; chk.targetYaw = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2; chk.update(dt);
    const f = Math.sin(c.t * 22); wings[0].rotation.z = -0.5 + f * 0.9; wings[1].rotation.z = 0.5 - f * 0.9; cg.position.y += 0.3;
  };
  A.chicken.knock = () => { const c = A.chicken; c.hit = 0.01; c.vx = c.dir * 3 + (Math.random() - 0.5) * 3; c.vy = 5; };

  // ---------------- de Deurman (schuift het bord) ----------------
  const dman = makeDeurman(2.1); const dg = new THREE.Group(); dg.add(dman.group); dg.visible = false; scene.add(dg);
  A.deurman = { g: dg, d: dman, side: 1 };
  A.deurman.pose = (side, enter, push) => {
    const dm_ = A.deurman; dm_.side = side; dg.visible = enter > 0.001;
    dg.position.set(side * lerp(15.5, 8.6, enter), 0, 0.6 - push * 0.2); dman.targetYaw = Math.atan2(-side, 0.4); dman.speed = enter > 0.01 && enter < 0.99 ? 1 : 0; dman.update(0.016);
    dman.arms[side > 0 ? 0 : 1].rotation.z = 0; dman.arms.forEach((a, k) => { const sd = k === 0 ? 1 : -1; a.rotation.x = -1.2 * push - 0.3 * enter; a.rotation.z = (sd === side ? 0.0 : 0.15) + push * (sd === side ? 0.5 * side : 0); });
    dman.eyeGlow.forEach((e) => { e.visible = true; });
  };

  // ---------------- animatie ----------------
  A.update = (t, dt) => {
    A.t = t;
    updCrowd(t, dt);
    for (const f of A.flames) P.animateFire(f, t);
    for (const f of A.flames) if (f.userData.flame && f.userData.flame.userData.flick) f.userData.flame.scale.y = 1 + Math.sin(t * 13 + f.userData.flame.position.x) * 0.25;
    for (const tt of A.torches) P.animateFire(tt, t);
    for (const b of A.banners) P.animateBanner(b, t);
    // goudglans
    const pulse = 0.5 + Math.sin(t * 7) * 0.5; goldMat.color.setHSL(0.13, 1, 0.5 + pulse * 0.12); goldGlow.opacity = 0.12 + pulse * 0.18;
    // herbergier poetst mokken
    A.innkeeper.update(dt); A.innkeeper.pose = Math.sin(t * 0.7) > 0.7 ? 'wave' : 'carry';
  };
  return A;
}
