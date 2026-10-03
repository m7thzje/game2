import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, Animal, makeBrother } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { TB, flipperTip } from './pinball_table.js';

// Omgeving en 3D-meshes van "Flipper-Duel": een fantasy-flipperkast (drakenkasteel) in een stenen speelhal.
// De muren/bumpers komen rechtstreeks uit dezelfde tabel als de natuurkunde, dus wat je ziet is wat botst.

const K = 46;                                   // texture-pixels per eenheid
const PZ0 = -15.2, PZ1 = 16.6;                  // speelvlak loopt van z=-15.2 .. 16.6
export const RAMP_EXIT = [{ x: -8.5, z: -9.4 }, { x: 8.5, z: -9.4 }];
export const rampCurve = (side) => {            // 3D-pad van de brug (ingang) naar de linker/rechter uitgang
  const e = RAMP_EXIT[side];
  return new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.9, 5.0), new THREE.Vector3(0, 2.0, 2.6), new THREE.Vector3(e.x * 0.45, 3.0, -3.5), new THREE.Vector3(e.x, 1.2, e.z)]);
};

function fieldTexture() {
  const W = 22 * K, H = Math.round((PZ1 - PZ0) * K);
  const X = (x) => (x + 11) * K, Z = (z) => (z - PZ0) * K;
  return canvasTex(W, H, (g, w, h) => {
    const r = mulberry32(11);
    // gras-/kasteelgrond
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5b4a6a'); gr.addColorStop(0.22, '#6a8f58'); gr.addColorStop(0.7, '#79a85c'); gr.addColorStop(1, '#4a6a48'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,90,30' : '150,200,100'},${0.08 + r() * 0.12})`; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 12, 2 + r() * 6, r() * 3, 0, TAU); g.fill(); }
    // slingerend kasteelpad van onder naar de draak
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = (lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(X(0), Z(15)); g.bezierCurveTo(X(-5), Z(9), X(5), Z(2), X(0), Z(-4)); g.bezierCurveTo(X(-3), Z(-6), X(2), Z(-8), X(0), Z(-10)); g.stroke(); };
    path(4.6 * K, '#6a5a44'); path(4.0 * K, '#c9b68a');
    for (let i = 0; i < 200; i++) { const t = r(); const y = Z(15 - t * 25); g.fillStyle = `rgba(${120 + r() * 60},${100 + r() * 50},${70 + r() * 40},.35)`; g.beginPath(); g.ellipse(X(Math.sin(t * 6) * 1.2 + (r() - 0.5) * 3.2), y, 6 + r() * 10, 4 + r() * 6, r() * 3, 0, TAU); g.fill(); }
    // slotgracht (blauw) links en rechts bovenin + brug-vlak
    for (const m of [-1, 1]) { g.fillStyle = 'rgba(70,150,220,.85)'; g.beginPath(); g.ellipse(X(m * 9.2), Z(-1.5), 1.2 * K, 3.2 * K, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3; for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(X(m * 9.2), Z(-3 + i * 1.6), 14, 0.2, 2.9); g.stroke(); } }
    // drakenhol: donkere cirkel met gloed rond de draak
    const dg = g.createRadialGradient(X(0), Z(-10.6), 1.2 * K, X(0), Z(-10.6), 5.6 * K); dg.addColorStop(0, 'rgba(255,150,40,.85)'); dg.addColorStop(0.35, 'rgba(120,40,20,.8)'); dg.addColorStop(1, 'rgba(40,20,40,0)'); g.fillStyle = dg; g.beginPath(); g.arc(X(0), Z(-10.6), 5.6 * K, 0, TAU); g.fill();
    // goudstukken-hoop rond de schatkist
    for (let i = 0; i < 120; i++) { const a = r() * TAU, d = r() * 3.2; g.fillStyle = r() < 0.5 ? '#ffd23f' : '#ffb020'; g.beginPath(); g.arc(X(Math.cos(a) * d * 1.6), Z(-13.2 + Math.sin(a) * d * 0.5), 3 + r() * 3, 0, TAU); g.fill(); }
    // kleurzones onder de flippers: Wes groen links, Jor blauw rechts
    for (const [m, col] of [[-1, '53,196,111'], [1, '74,140,255']]) {
      const gg = g.createRadialGradient(X(m * 4), Z(12.5), 10, X(m * 4), Z(12.5), 6.5 * K); gg.addColorStop(0, `rgba(${col},.55)`); gg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gg; g.fillRect(X(m > 0 ? 0 : -11), Z(7), 11 * K, 10 * K);
    }
    // afvoer (donkere kuil) onderaan
    const ag = g.createLinearGradient(0, Z(14.3), 0, h); ag.addColorStop(0, 'rgba(10,0,10,0)'); ag.addColorStop(0.25, 'rgba(20,5,25,.95)'); ag.addColorStop(1, '#100410'); g.fillStyle = ag; g.fillRect(0, Z(14.3), w, h - Z(14.3));
    // gouden ringen rond de torens en de draak, pijltjes, sterretjes
    g.strokeStyle = 'rgba(255,215,90,.8)'; g.lineWidth = 5;
    for (const [x, z, rr] of [[-4.4, -6.3, 1.6], [4.4, -6.3, 1.6], [0, -3, 1.6], [0, -10.6, 2.5]]) { g.beginPath(); g.arc(X(x), Z(z), rr * K, 0, TAU); g.stroke(); g.setLineDash([8, 10]); g.beginPath(); g.arc(X(x), Z(z), (rr + 0.4) * K, 0, TAU); g.stroke(); g.setLineDash([]); }
    g.fillStyle = 'rgba(255,225,90,.8)';
    for (const m of [-1, 1]) for (let i = 0; i < 3; i++) { const x = X(m * 2.2), z = Z(8.4 + i * 1.5); g.beginPath(); g.moveTo(x, z - 14); g.lineTo(x + 12, z + 6); g.lineTo(x - 12, z + 6); g.closePath(); g.fill(); }
    g.font = 'bold 34px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.55)';
    g.save(); g.translate(X(0), Z(9.2)); g.fillText('DRAKENKASTEEL', 0, 0); g.restore();
    // brugplanken
    g.fillStyle = '#8a5a2e'; g.fillRect(X(-1.4), Z(3.4), 2.8 * K, 3.4 * K); g.strokeStyle = '#4a2a10'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(X(-1.4), Z(3.6 + i * 0.42)); g.lineTo(X(1.4), Z(3.6 + i * 0.42)); g.stroke(); }
    // sterretjes en bloemen
    for (let i = 0; i < 90; i++) { const x = r() * w, y = r() * h; if (y > Z(14) ) continue; g.fillStyle = ['#fff6a8', '#ffd1e8', '#ffffff', '#b8e0ff'][i % 4]; g.beginPath(); g.arc(x, y, 2 + r() * 2, 0, TAU); g.fill(); }
  });
}


export function buildWorld(ctx, T, L) {
  const { scene, camera } = ctx;
  const root = new THREE.Group(); scene.add(root);
  const ws = {};   // alles wat de game nodig heeft

  // ---------- speelhal: vloer, pilaren, fakkels, banieren ----------
  const hall = new THREE.Mesh(new THREE.PlaneGeometry(160, 120), new THREE.MeshStandardMaterial({ map: tex.stone(26, 20), color: 0x6a6486, roughness: 1 }));
  hall.rotation.x = -Math.PI / 2; hall.position.set(0, -1.4, -10); hall.receiveShadow = true; root.add(hall);
  const flames = [];
  const flameTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,240,170,1)'); gr.addColorStop(0.4, 'rgba(255,150,40,.7)'); gr.addColorStop(1, 'rgba(255,80,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const pillarGeo = new THREE.CylinderGeometry(1.5, 1.8, 16, 10), pillarMat = mat(0x7d7894);
  const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, 8); pillars.castShadow = false; let pi = 0; const mx = new THREE.Matrix4();
  for (const sx of [-1, 1]) for (const z of [-26, -10, 8, 26]) {
    mx.makeTranslation(sx * 27, 6.6, z); pillars.setMatrixAt(pi++, mx);
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); fl.scale.set(4.2, 4.2, 1); fl.position.set(sx * 25.3, 5.2, z); root.add(fl); flames.push(fl);
    const br = P.banner([0xc23a3a, 0x3a5ac2, 0xd8a030, 0x2f9e5b][(pi + 1) % 4], 5.5, 2.2); br.position.set(sx * 25.0, 1.0, z + 2.3); br.rotation.y = -sx * Math.PI / 2; root.add(br);
  }
  root.add(pillars);
  // achterwand met grote ramen (maanlicht)
  const wallBack = mesh(new THREE.BoxGeometry(110, 34, 2), mat(0x4a4666), { cast: false, pos: [0, 14, -42] }); root.add(wallBack);
  const winMat = new THREE.MeshBasicMaterial({ color: 0x8fb0ff });
  for (let i = -3; i <= 3; i++) { const wn = mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.4, 14, 1, false, 0, Math.PI), winMat, { cast: false, pos: [i * 13, 14, -40.9], rot: [Math.PI / 2, 0, 0] }); wn.scale.set(1, 1, 1); root.add(wn); const wb = mesh(new THREE.BoxGeometry(4.4, 7, 0.4), winMat, { cast: false, pos: [i * 13, 10.5, -40.9] }); root.add(wb); }

  // ---------- kast: frame, speelvlak, muren ----------
  const table = new THREE.Group(); root.add(table); ws.table = table;
  const woodM = new THREE.MeshStandardMaterial({ map: tex.planks(6, 1, '#6b3f1d'), roughness: 0.8 });
  const frame = [[0, -0.6, PZ0 - 0.9, 24.4, 1.6, 1.8], [0, -0.6, PZ1 + 0.4, 24.4, 1.6, 1.4], [-11.6, -0.6, 0.7, 1.8, 1.6, 33.8], [11.6, -0.6, 0.7, 1.8, 1.6, 33.8]];
  for (const [x, y, z, w, hh, d] of frame) table.add(mesh(new THREE.BoxGeometry(w, hh, d), woodM, { pos: [x, y, z] }));
  table.add(mesh(new THREE.BoxGeometry(23.4, 1.6, 34), mat(0x3a2410), { cast: false, pos: [0, -1.5, 0.7] }));
  const fieldTex = fieldTexture();
  const field = mesh(new THREE.PlaneGeometry(22, PZ1 - PZ0), new THREE.MeshStandardMaterial({ map: fieldTex, roughness: 0.8 }), { cast: false, pos: [0, 0, (PZ0 + PZ1) / 2], rot: [-Math.PI / 2, 0, 0] });
  table.add(field);
  // muren (instanced)
  const walls = T.walls.filter((w) => w.kind === 'wall');
  const wallIM = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), walls.length); wallIM.castShadow = true; wallIM.receiveShadow = true;
  const col = new THREE.Color(); const q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const place = (im, i, w, th, hh, y, colr) => {
    const dx = w.bx - w.ax, dz = w.bz - w.az, l = Math.hypot(dx, dz);
    q.setFromAxisAngle(up, -Math.atan2(dz, dx)); sc.set(l + th * 0.9, hh, th); ps.set((w.ax + w.bx) / 2, y, (w.az + w.bz) / 2); mx.compose(ps, q, sc); im.setMatrixAt(i, mx); if (colr != null) im.setColorAt(i, col.set(colr));
  };
  walls.forEach((w, i) => place(wallIM, i, w, w.outer || w.arch ? 0.7 : 0.4, w.outer || w.arch ? 1.3 : 0.85, w.outer || w.arch ? 0.65 : 0.42, w.arch ? (i % 2 ? 0x8d8274 : 0x9b9080) : w.outer ? 0x8a7f72 : 0xb5a58a));
  table.add(wallIM);
  // kantelen op de buitenmuur (kasteelmuur): kleine blokjes
  const cren = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.55, 0.8), mat(0xa09484), 90); let ci = 0;
  for (const w of walls) if (w.arch || w.outer) { const n = Math.max(1, Math.round(Math.hypot(w.bx - w.ax, w.bz - w.az) / 1.6)); for (let k = 0; k < n && ci < 90; k++) { const t = (k + 0.5) / n; q.setFromAxisAngle(up, -Math.atan2(w.bz - w.az, w.bx - w.ax)); ps.set(lerp(w.ax, w.bx, t), 1.5, lerp(w.az, w.bz, t)); sc.set(1, 1, 1); mx.compose(ps, q, sc); cren.setMatrixAt(ci++, mx); } }
  cren.count = ci; table.add(cren);
  // sling-banden (rubber) en doelen (schilden)
  const slings = T.walls.filter((w) => w.kind === 'sling'); ws.slings = [];
  for (const w of slings) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.9, 0.34), new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0xff2a10, emissiveIntensity: 0.35, roughness: 0.5 })); m.castShadow = true;
    const dx = w.bx - w.ax, dz = w.bz - w.az; m.scale.x = Math.hypot(dx, dz) + 0.3; m.position.set((w.ax + w.bx) / 2, 0.45, (w.az + w.bz) / 2); m.rotation.y = -Math.atan2(dz, dx); table.add(m);
    // gevulde driehoek eronder
    const tri = new THREE.Shape(); const sgn = w.ax < 0 ? 1 : -1;
    tri.moveTo(w.ax, -w.az); tri.lineTo(w.ax, -(w.az + 3.2)); tri.lineTo(w.bx, -w.bz); tri.closePath();
    const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.8, bevelEnabled: false }); tg.rotateX(-Math.PI / 2); // x blijft x, z = -shape.y... gecorrigeerd hieronder
    const tm = new THREE.Mesh(tg, mat(0x6a5a8a)); tm.castShadow = true; tm.position.y = 0; table.add(tm);
    ws.slings.push({ m, side: w.side, flash: 0 });
  }
  const tgts = T.walls.filter((w) => w.kind === 'target'); ws.targets = [];
  for (const w of tgts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 1.15), new THREE.MeshStandardMaterial({ color: w.side ? 0x3a78e0 : 0x2f9e5b, emissive: 0x000000, roughness: 0.4, metalness: 0.4 })); m.castShadow = true;
    m.position.set(w.ax + (w.side ? -0.05 : 0.05), 0.5, (w.az + w.bz) / 2); table.add(m);
    ws.targets.push({ m, id: w.id, lit: false, flash: 0 });
  }
  // palen
  const posts = T.circles.filter((c) => c.kind === 'post'); const postIM = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10), mat(0xd8c070, { metalness: 0.4 }), posts.length); postIM.castShadow = true;
  posts.forEach((c, i) => { ps.set(c.x, 0.5, c.z); sc.set(c.r, 1.0, c.r); q.identity(); mx.compose(ps, q, sc); postIM.setMatrixAt(i, mx); }); table.add(postIM);

  // ---------- bumpers: kasteeltorens ----------
  ws.bumpers = T.bumpers.map((c, i) => {
    const g = new THREE.Group(); g.position.set(c.x, 0, c.z);
    const bm = new THREE.MeshStandardMaterial({ color: [0xc8b79a, 0xc8b79a, 0xd8c8a8][i], roughness: 0.8, emissive: 0xff8a20, emissiveIntensity: 0 });
    g.add(mesh(new THREE.CylinderGeometry(0.95, 1.1, 1.4, 10), bm, { pos: [0, 0.7, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(1.12, 1.0, 0.3, 10), bm, { pos: [0, 1.5, 0] }));
    const roof = mesh(new THREE.ConeGeometry(1.15, 1.2, 10), new THREE.MeshStandardMaterial({ color: [0xd8372c, 0x3a78e0, 0xe8a830][i], roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 }), { pos: [0, 2.3, 0] }); g.add(roof);
    const flag = mesh(new THREE.BoxGeometry(0.5, 0.3, 0.04), mat(0xffe14a), { cast: false, pos: [0.28, 3.1, 0] }); g.add(flag, mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 4), mat(0x6a4a2a), { cast: false, pos: [0, 2.95, 0] }));
    const win = mesh(new THREE.BoxGeometry(0.3, 0.45, 0.1), new THREE.MeshBasicMaterial({ color: 0xffd060 }), { cast: false, pos: [0, 0.8, 1.0] }); g.add(win);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.55, 28), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    table.add(g); return { g, bm, roof, ring, flag, hit: 0, c };
  });

  // ---------- draak + schatkist ----------
  const dg = new THREE.Group(); dg.position.set(0, 0, -10.6); table.add(dg);
  const dMat = new THREE.MeshStandardMaterial({ color: 0x4aa83a, roughness: 0.6, flatShading: true, emissive: 0xff5a10, emissiveIntensity: 0 });
  const dBel = mat(0xe8c86a);
  dg.add(mesh(new THREE.CylinderGeometry(1.9, 2.0, 0.5, 14), mat(0x8a6a4a), { pos: [0, 0.25, 0] }));
  dg.add(mesh(new THREE.SphereGeometry(1.35, 12, 8), dMat, { pos: [0, 1.1, -0.2], scale: [1, 0.85, 1.1] }));
  const neck = new THREE.Group(); neck.position.set(0, 1.5, 0.6); dg.add(neck);
  neck.add(mesh(new THREE.CapsuleGeometry(0.5, 0.9, 3, 8), dMat, { pos: [0, 0.35, 0.3], rot: [0.5, 0, 0] }));
  const head = new THREE.Group(); head.position.set(0, 0.85, 0.85); neck.add(head);
  head.add(mesh(new THREE.BoxGeometry(1.25, 0.85, 1.1), dMat, { pos: [0, 0, 0] }));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.3, 0.25); head.add(jaw); jaw.add(mesh(new THREE.BoxGeometry(1.0, 0.25, 1.1), dMat, { pos: [0, 0, 0.45] }));
  head.add(mesh(new THREE.BoxGeometry(0.95, 0.5, 0.9), dMat, { pos: [0, 0.05, 0.8] }));
  for (const sd of [1, -1]) {
    head.add(mesh(new THREE.ConeGeometry(0.12, 0.7, 5), mat(0xf5ecd0), { pos: [sd * 0.5, 0.65, -0.2], rot: [-0.6, 0, sd * 0.2] }));
    head.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [sd * 0.4, 0.28, 0.45] }));
    head.add(mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0x000000 }), { cast: false, pos: [sd * 0.4, 0.28, 0.6] }));
    for (let k = 0; k < 3; k++) jaw.add(mesh(new THREE.ConeGeometry(0.07, 0.25, 4), mat(0xffffff), { cast: false, pos: [sd * (0.2 + k * 0.17), 0.2, 0.85], rot: [Math.PI, 0, 0] }));
    const wing = new THREE.Group(); wing.position.set(sd * 0.8, 1.6, -0.6); dg.add(wing);
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5, 0, 0, -0.5, sd * 3.0, 0.9, -0.9, 0, 0, 0.5, sd * 3.0, 0.9, -0.9, sd * 3.6, 0.5, 0.6, 0, 0, 0.5, sd * 3.6, 0.5, 0.6, sd * 1.8, 0.2, 0.9], 3)); wg.computeVertexNormals();
    wing.add(new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x8a4ad8, side: THREE.DoubleSide, flatShading: true, roughness: 0.7 })));
    ws['wing' + (sd > 0 ? 'R' : 'L')] = wing;
  }
  // staart rond de hoop
  const tail = []; for (let k = 0; k < 6; k++) { const a = 2.3 + k * 0.42; const tm = mesh(new THREE.ConeGeometry(0.5 - k * 0.06, 0.9, 6), dMat, { pos: [Math.cos(a) * 1.6, 0.5, -Math.sin(a) * 1.6], rot: [0, a, 1.2] }); dg.add(tm); tail.push(tm); }
  // schatkist achter de draak
  const chest = new THREE.Group(); chest.position.set(0, 0, -13.7); table.add(chest);
  chest.add(mesh(new THREE.BoxGeometry(1.6, 0.8, 1.0), mat(0x8a5a2b), { pos: [0, 0.4, 0] }));
  const lid = new THREE.Group(); lid.position.set(0, 0.8, -0.5); chest.add(lid); lid.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.6, 10, 1, false, 0, Math.PI), mat(0xa06a30), { pos: [0, 0, 0.5], rot: [0, 0, Math.PI / 2] }));
  chest.add(mesh(new THREE.BoxGeometry(0.25, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [0, 0.7, 0.52] }));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.5, 7, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); beam.position.set(0, 3.8, 0); chest.add(beam);
  const gold = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa010, emissiveIntensity: 0.5, metalness: 0.8, roughness: 0.3 })); gold.position.set(0, 0.85, 0.1); chest.add(gold);
  ws.dragon = { g: dg, neck, head, jaw, dMat, tail, hit: 0, open: 0 };
  ws.chest = { g: chest, lid, beam, gold, lit: 0 };
  // lichten: gloed van de draak en de schat (twee vaste puntlichten)
  const lDrag = new THREE.PointLight(0xff7a20, 0, 16, 2); lDrag.position.set(0, 3, -9); table.add(lDrag);
  const lChest = new THREE.PointLight(0xffd23f, 0, 14, 2); lChest.position.set(0, 3, -13); table.add(lChest);
  ws.lights = { lDrag, lChest };

  // ---------- kip (bewegend doel) ----------
  const chick = new Animal('chicken'); chick.group.scale.setScalar(1.9); chick.group.position.set(0, 0, T.chicken.z); table.add(chick.group); ws.chicken = chick;
  ws.chickenFlap = 0;

  // ---------- spinners ----------
  ws.spinners = T.sensors.filter((s) => s.kind === 'spinner').map((s) => {
    const g = new THREE.Group(); g.position.set(s.x, 0.6, s.z); const bar = mesh(new THREE.BoxGeometry(0.15, 0.5, 1.9), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.6, roughness: 0.3, emissive: 0x553300, emissiveIntensity: 0.4 }), { pos: [0, 0, 0] });
    g.add(bar, mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.0, 5), mat(0x888888), { pos: [0, -0.2, 0] })); table.add(g); return { g, bar, rot: 0, spin: 0, s };
  });
  // outlane-redding lampjes
  ws.savers = T.sensors.filter((s) => s.kind === 'outlane').map((s) => { const m = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: 0x9fff9f, transparent: true, opacity: 0.9, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.set(s.x, 0.06, s.z - 0.8); table.add(m); return { m, s }; });

  // ---------- ophaalbrug (ramp) + rails ----------
  const rampG = new THREE.Group(); table.add(rampG);
  const plank = mesh(new THREE.BoxGeometry(2.6, 0.18, 3.6), new THREE.MeshStandardMaterial({ map: tex.planks(1, 2, '#9a6a36'), roughness: 0.8 }), { pos: [0, 0.78, 4.6], rot: [-0.34, 0, 0] }); rampG.add(plank);
  for (const sd of [1, -1]) { rampG.add(mesh(new THREE.BoxGeometry(0.16, 0.5, 3.7), mat(0x6a4a2a), { pos: [sd * 1.35, 1.0, 4.6], rot: [-0.34, 0, 0] })); rampG.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.2, 6), mat(0x7a5a3a), { pos: [sd * 1.35, 1.1, 3.0] })); }
  for (const side of [0, 1]) {
    const cur = rampCurve(side); const tube = new THREE.Mesh(new THREE.TubeGeometry(cur, 28, 0.11, 6, false), new THREE.MeshStandardMaterial({ color: 0xd8c070, metalness: 0.7, roughness: 0.3, transparent: true, opacity: 0.55 }));
    tube.castShadow = false; table.add(tube);
    const e = RAMP_EXIT[side]; table.add(mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 14), mat(0xd8c070, { metalness: 0.6 }), { cast: false, pos: [e.x, 1.2, e.z], rot: [Math.PI / 2, 0, 0] }));
  }
  ws.rampGlow = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 24), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); ws.rampGlow.rotation.x = -Math.PI / 2; ws.rampGlow.position.set(0, 0.07, 5.6); table.add(ws.rampGlow);

  // ---------- flippers ----------
  ws.flippers = T.flippers.map((f) => {
    const g = new THREE.Group(); const base = f.side ? 0x3a78e0 : 0x2f9e5b;
    const bodyM = new THREE.MeshStandardMaterial({ color: base, roughness: 0.35, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0 });
    const geo = new THREE.CylinderGeometry(f.r1, f.r0, 1, 12); geo.rotateZ(Math.PI / 2); geo.translate(0.5, 0, 0);   // lengte 1 langs +x, dik bij de pivot
    const body = new THREE.Mesh(geo, bodyM); body.castShadow = true; body.scale.set(f.len, 1.0, 1.0); body.position.y = 0.5; g.add(body);
    const cap = mesh(new THREE.SphereGeometry(f.r1, 8, 6), bodyM, { pos: [f.len, 0.5, 0] }); g.add(cap);
    const stripe = mesh(new THREE.BoxGeometry(f.len * 0.7, 0.05, 0.12), mat(0xffffff), { cast: false, pos: [f.len * 0.45, 0.5 + f.r0 * 0.95, 0] }); g.add(stripe);
    g.position.set(f.px, 0, f.pz); table.add(g); return { g, f, body, cap, bodyM, stripe };
  });

  // ---------- ballen ----------
  const ballGeo = new THREE.SphereGeometry(TB.BR, 18, 14), haloTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const mkTag = (txt, colr) => canvasTex(160, 64, (g, w, h) => { g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 9; g.strokeStyle = 'rgba(10,10,30,.95)'; g.lineJoin = 'round'; g.strokeText(txt, w / 2, h / 2); g.fillStyle = colr; g.fillText(txt, w / 2, h / 2); });
  const names = ctx.players.map((p) => p.name);
  ws.tagTex = [mkTag(names[0], '#7dffb0'), mkTag(names[1], '#9fc4ff'), mkTag('Wie pakt mij?', '#ffe98a')];
  ws.ownerCol = [0x35e07a, 0x4a9cff, 0xffe070];
  ws.balls = Array.from({ length: 6 }, () => {
    const mt = new THREE.MeshStandardMaterial({ color: 0xe8ecf4, metalness: 0.85, roughness: 0.18, emissive: 0xffe070, emissiveIntensity: 0.55 });
    const g = new THREE.Mesh(ballGeo, mt); g.castShadow = true; g.visible = false; scene.add(g);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: haloTex, color: 0xffe070, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })); halo.rotation.x = -Math.PI / 2; halo.visible = false; scene.add(halo);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: ws.tagTex[2], transparent: true, depthTest: false })); tag.scale.set(3.4, 1.36, 1); tag.renderOrder = 16; tag.visible = false; scene.add(tag);
    const shadow = P.shadowBlob(0.9); shadow.visible = false; scene.add(shadow);
    return { g, mt, halo, tag, shadow, own: -2 };
  });

  // ---------- power-up item ----------
  const iconTex = (draw) => canvasTex(128, 128, (g, w, h) => { g.translate(64, 64); const gr = g.createRadialGradient(0, 0, 8, 0, 0, 60); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,.1)'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 60, 0, TAU); g.fill(); draw(g); });
  ws.itemTex = {
    multi: iconTex((g) => { g.fillStyle = '#ffb000'; for (const [x, y] of [[-20, 14], [20, 14], [0, -20]]) { g.beginPath(); g.arc(x, y, 17, 0, TAU); g.fill(); g.strokeStyle = '#7a4a00'; g.lineWidth = 4; g.stroke(); } }),
    x2: iconTex((g) => { g.font = 'bold 62px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d83aa8'; g.strokeStyle = '#4a0a3a'; g.lineWidth = 8; g.strokeText('x2', 0, 4); g.fillText('x2', 0, 4); }),
    big: iconTex((g) => { g.strokeStyle = '#1a8ad8'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(-34, 14); g.lineTo(34, -14); g.stroke(); g.strokeStyle = '#8fe0ff'; g.lineWidth = 5; g.stroke(); }),
  };
  ws.item = new THREE.Sprite(new THREE.SpriteMaterial({ map: ws.itemTex.multi, transparent: true, depthTest: false })); ws.item.scale.set(2.6, 2.6, 1); ws.item.renderOrder = 14; ws.item.visible = false; scene.add(ws.item);
  ws.itemRing = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); ws.itemRing.rotation.x = -Math.PI / 2; ws.itemRing.visible = false; scene.add(ws.itemRing);

  ws.drawBoard = () => {};

  // ---------- toeschouwers en poppetjes naast de kast ----------
  ws.pups = [-1, 1].map((m, i) => {
    const c = makeBrother(i); const holder = new THREE.Group(); const k = 3.4 / c.height; holder.add(c.group); holder.scale.setScalar(k); holder.position.set(m * 16.6, 0.2, 12.2); holder.rotation.y = 0; root.add(holder);
    c.faceDir(-m, 0); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw;
    root.add(mesh(new THREE.CylinderGeometry(2.0, 2.3, 1.4, 14), mat(i ? 0x3a5aa8 : 0x2a7a4a), { cast: false, pos: [m * 16.6, -0.5, 12.2] }));
    // grote arcade-knop
    const btn = mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.35, 14), new THREE.MeshStandardMaterial({ color: i ? 0x4a8cff : 0x35c46f, emissive: 0x000000, roughness: 0.3 }), { pos: [m * 14.0, 0.45, 12.2] }); root.add(btn);
    root.add(mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.4, 14), mat(0x333344), { cast: false, pos: [m * 14.0, 0.2, 12.2] }));
    return { c, holder, btn, m, i };
  });
  ws.crowd = [];
  [['jester', -19.5, 3], ['witch', -19.0, -4], ['baker', 19.5, 4], ['captain', 19.0, -5], ['elder', -21.5, -12], ['dwarf', 21.5, -12]].forEach(([kind, x, z], n) => {
    const c = makeNPC(kind); const holder = new THREE.Group(); const k = 3.0 / c.height * (kind === 'dwarf' ? 0.75 : 1); holder.add(c.group); holder.scale.setScalar(k); holder.position.set(x, -0.4, z); root.add(holder);
    c.faceDir(x < 0 ? 1 : -1, 0.2); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; ws.crowd.push({ c, holder, ph: n });
  });
  // gloed-zonnetjes in de lucht (stofdeeltjes) via fx in game; hier niets

  // ---------- licht ----------
  L.hemi.color.set(0xbfb8ff); L.hemi.groundColor.set(0x4a3a2a); L.hemi.intensity = 1.1;
  L.sun.color.set(0xfff0d0); L.sun.intensity = 1.9; L.sun.position.set(-8, 30, 10);
  ws.shake = new THREE.Vector3();
  ws.update = (t, dt) => {
    for (const f of flames) { f.material.opacity = 0.8 + Math.sin(t * 9 + f.position.z) * 0.15; f.scale.setScalar(4.0 + Math.sin(t * 11 + f.position.x + f.position.z) * 0.5); }
    ws.crowd.forEach((o) => { o.c.pose = o.cheer > 0 ? 'cheer' : 'idle'; if (o.cheer > 0) o.cheer -= dt; o.c.update(dt); });
    for (const o of ws.pups) o.c.update(dt);
  };
  return ws;
}
