import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp } from '../engine/util.js';
import { skyTexture } from '../engine/lights.js';
import { makeNPC } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { mergeStatic } from '../world/merge.js';

// Wereld van "Driehoek-Hockey": een afgeknotte driehoekige ijsvloer, drie doelen (links = slot 0, onder = slot 1, rechts = slot 2),
// een poolnacht met noorderlicht, sneeuwdennen, iglo's en een sneeuwpoppen-publiek.
export const TRI = { a: 9.5, GH: 4.0, BEV: 15.9, POCKET: 2.6, WALLH: 1.15, WT: 0.9 };
// uitwaartse normalen per muur/slot en de bijbehorende raaklijn (t = (n.z, -n.x))
export const NORM = [[-Math.sqrt(3) / 2, -0.5], [0, 1], [Math.sqrt(3) / 2, -0.5]];
export const TANG = NORM.map(([x, z]) => [z, -x]);
// afkapvlakken op de hoeken: [richting x, richting z] (afstand TRI.BEV)
export const VERT = [[-Math.sqrt(3) / 2, 0.5], [Math.sqrt(3) / 2, 0.5], [0, -1]];

// begrenzing als reeks halfvlakken {nx,nz,off,goal}: nOut·p <= off
export function planes() {
  const L = [];
  NORM.forEach(([nx, nz], i) => L.push({ nx, nz, off: TRI.a, goal: i }));
  VERT.forEach(([nx, nz]) => L.push({ nx, nz, off: TRI.BEV, goal: -1 }));
  return L;
}
// Sutherland-Hodgman: veelhoek van de arena
function arenaPolygon() {
  let poly = [[-60, -60], [60, -60], [60, 60], [-60, 60]];
  for (const pl of planes()) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const A = poly[i], B = poly[(i + 1) % poly.length];
      const da = pl.nx * A[0] + pl.nz * A[1] - pl.off, db = pl.nx * B[0] + pl.nz * B[1] - pl.off;
      if (da <= 0) out.push(A);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); }
    }
    poly = out;
  }
  return poly;
}
export const POLY = arenaPolygon();

function iceTexture(colorsCss) {
  const W = 1024, H = 1024, X0 = -18, X1 = 18, Z0 = -17, Z1 = 11;   // wereld -> pixels
  const sx = W / (X1 - X0), sz = H / (Z1 - Z0);
  const px = (x) => (x - X0) * sx, pz = (z) => (z - Z0) * sz;
  const t = canvasTex(W, H, (g) => {
    const r = mulberry32(11);
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#dff6ff'); gr.addColorStop(0.5, '#bfe8fb'); gr.addColorStop(1, '#a9dcf4'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.14})`; g.beginPath(); g.ellipse(r() * W, r() * H, 20 + r() * 90, 6 + r() * 30, r() * 3, 0, TAU); g.fill(); }
    g.lineCap = 'round';
    for (let i = 0; i < 80; i++) { g.strokeStyle = `rgba(255,255,255,${0.25 + r() * 0.4})`; g.lineWidth = 1 + r() * 2; let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 130; y += (r() - 0.5) * 90; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(90,160,210,.25)'; g.lineWidth = 1.5; let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 100; y += (r() - 0.5) * 100; g.lineTo(x, y); } g.stroke(); }
    // middencirkel + driehoeksembleem
    g.strokeStyle = 'rgba(40,110,190,.75)'; g.lineWidth = 8; g.beginPath(); g.ellipse(px(0), pz(0), 3.6 * sx, 3.6 * sz, 0, 0, TAU); g.stroke();
    g.lineWidth = 6; g.beginPath(); for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + Math.PI; const x = px(Math.sin(a) * 2.6), z = pz(Math.cos(a) * 2.6); if (k) g.lineTo(x, z); else g.moveTo(x, z); } g.closePath(); g.stroke();
    g.fillStyle = 'rgba(40,110,190,.85)'; g.beginPath(); g.ellipse(px(0), pz(0), 0.5 * sx, 0.5 * sz, 0, 0, TAU); g.fill();
    // doelgebieden in spelerskleur + doellijn
    NORM.forEach(([nx, nz], i) => {
      const tx = nz, tz = -nx; const col = colorsCss[i];
      const mx = nx * TRI.a, mz = nz * TRI.a;
      g.save(); g.translate(px(mx), pz(mz)); g.scale(sx, sz); g.rotate(0);
      g.beginPath(); const steps = 28; for (let k = 0; k <= steps; k++) { const a = Math.PI + k / steps * Math.PI; const ux = Math.cos(a) * 6.2, uw = -Math.sin(a) * 5.2; /* u langs muur, w naar binnen */ const wx = tx * ux - nx * uw, wz = tz * ux - nz * uw; k ? g.lineTo(wx, wz) : g.moveTo(wx, wz); }
      g.closePath(); g.fillStyle = col.replace('1)', '.2)'); g.fill(); g.strokeStyle = col; g.lineWidth = 0.22; g.stroke();
      g.restore();
    });
  });
  t.userData.keep = false;
  return { tex: t, X0, X1, Z0, Z1 };
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
function netTex() { return canvasTex(128, 128, (g, w, h) => { g.fillStyle = 'rgba(10,20,40,.55)'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(220,240,255,.9)'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); } }); }
function auroraTex() {
  return canvasTex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(60,255,160,0)'); gr.addColorStop(0.35, 'rgba(60,255,170,.7)'); gr.addColorStop(0.7, 'rgba(120,120,255,.45)'); gr.addColorStop(1, 'rgba(200,80,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(255,255,255,${0.04 + 0.06 * Math.abs(Math.sin(x * 0.07) * Math.sin(x * 0.013))})`; g.fillRect(x, 0, 2, h); }
  });
}

// bevestigt een kleine kroon van ijs (hoekkristallen)
function crystalCluster(color, h = 3) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, roughness: 0.2, transparent: true, opacity: 0.93, flatShading: true });
  for (const [x, z, s, rz, rx] of [[0, 0, 1, 0, 0], [0.5, 0.2, 0.62, 0.35, 0.2], [-0.5, 0.1, 0.55, -0.4, -0.1], [0.15, -0.5, 0.45, 0.1, -0.5]]) g.add(mesh(new THREE.ConeGeometry(h * 0.16 * (0.6 + s * 0.6), h * s, 5), m, { cast: false, pos: [x * h * 0.5, h * s * 0.5, z * h * 0.5], rot: [rx, 0, rz] }));
  return g;
}
function snowman() {
  const g = new THREE.Group(); const w = mat(0xf6fbff, { flatShading: false });
  g.add(mesh(new THREE.SphereGeometry(0.75, 10, 8), w, { cast: false, pos: [0, 0.7, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.55, 10, 8), w, { cast: false, pos: [0, 1.65, 0] }));
  const head = new THREE.Group(); head.position.y = 2.4; g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), w, { cast: false }));
  head.add(mesh(new THREE.ConeGeometry(0.08, 0.45, 5), mat(0xf28a1c), { cast: false, pos: [0, -0.02, 0.45], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), mat(0x111111), { cast: false, pos: [sx * 0.15, 0.1, 0.36] }));
  head.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.4, 8), mat(0x222233), { cast: false, pos: [0, 0.5, 0] }), mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.05, 10), mat(0x222233), { cast: false, pos: [0, 0.3, 0] }));
  const arms = [];
  for (const sx of [-1, 1]) { const a = new THREE.Group(); a.position.set(sx * 0.62, 1.7, 0); a.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 4), mat(0x6b4a2e), { cast: false, pos: [sx * 0.4, 0.1, 0], rot: [0, 0, -sx * 1.1] })); g.add(a); arms.push(a); }
  g.add(mesh(new THREE.TorusGeometry(0.46, 0.11, 6, 12), mat(0xd8372c, { flatShading: false }), { cast: false, pos: [0, 2.0, 0], rot: [Math.PI / 2, 0, 0] }));
  g.userData = { head, arms }; g.userData.dynamic = true;
  return g;
}

export function buildArena(ctx, colorsCss, colors) {
  const { scene } = ctx;
  const A = { t: 0, crowd: [], flash: [0, 0, 0] };
  const start = scene.children.length;
  scene.background = skyTexture('#050a22', '#12285a');
  scene.fog = new THREE.Fog(0x0c1a40, 60, 160);
  const rng = mulberry32(99);

  // sterren
  const sp = new Float32Array(260 * 3); for (let i = 0; i < 260; i++) { const a = rng() * TAU, e = 0.25 + rng() * 0.7; sp[i * 3] = Math.cos(a) * 140 * e; sp[i * 3 + 1] = 40 + rng() * 70; sp[i * 3 + 2] = -Math.abs(Math.sin(a)) * 140 * e - 20; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, sizeAttenuation: false, fog: false })); stars.userData.dynamic = true; scene.add(stars);
  // noorderlicht
  const au = auroraTex(); au.wrapS = THREE.RepeatWrapping; A.au = au;
  const aur = new THREE.Mesh(new THREE.PlaneGeometry(260, 50, 1, 1), new THREE.MeshBasicMaterial({ map: au, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide }));
  aur.position.set(0, 42, -90); aur.rotation.x = -0.18; aur.userData.dynamic = true; scene.add(aur); A.aur = aur;
  const aur2 = aur.clone(); aur2.position.set(-70, 36, -70); aur2.rotation.y = 0.7; aur2.material = aur.material.clone(); aur2.material.opacity = 0.5; aur2.userData.dynamic = true; scene.add(aur2);

  // sneeuwvlakte
  const snow = new THREE.Mesh(new THREE.CircleGeometry(150, 40), new THREE.MeshStandardMaterial({ color: 0xa9bfe0, roughness: 1 })); snow.rotation.x = -Math.PI / 2; snow.position.y = -0.55; snow.receiveShadow = true; scene.add(snow);
  // ijsvloer
  const ice = iceTexture(colorsCss);
  const shape = new THREE.Shape(POLY.map(([x, z]) => new THREE.Vector2(x, -z)));
  const fg = new THREE.ShapeGeometry(shape);
  const pos = fg.attributes.position, uv = fg.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - ice.X0) / (ice.X1 - ice.X0), 1 - ((-pos.getY(i)) - ice.Z0) / (ice.Z1 - ice.Z0));
  const floorM = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ice.tex, roughness: 0.38, metalness: 0.05, emissive: 0x4a7aa8, emissiveIntensity: 0.35, emissiveMap: ice.tex })); floorM.rotation.x = -Math.PI / 2; floorM.receiveShadow = true; scene.add(floorM);
  // sokkel onder de vloer
  const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false }), mat(0x7ab4d8)); slab.rotation.x = -Math.PI / 2; slab.position.y = -0.5; slab.receiveShadow = true; scene.add(slab);

  // muren (met gat voor de doelen)
  const wallM = new THREE.MeshStandardMaterial({ color: 0xcfeeff, roughness: 0.3, metalness: 0.05, flatShading: true });
  const wallCap = mat(0xffffff);
  const edgeOnPlane = (pl) => { const out = []; for (let i = 0; i < POLY.length; i++) { const A_ = POLY[i], B = POLY[(i + 1) % POLY.length]; const da = pl.nx * A_[0] + pl.nz * A_[1] - pl.off, db = pl.nx * B[0] + pl.nz * B[1] - pl.off; if (Math.abs(da) < 1e-3 && Math.abs(db) < 1e-3) out.push([A_, B]); } return out; };
  const addWallSeg = (ax, az, bx, bz, nx, nz, col) => {
    const len = Math.hypot(bx - ax, bz - az); if (len < 0.2) return;
    const cx = (ax + bx) / 2 + nx * TRI.WT / 2, cz = (az + bz) / 2 + nz * TRI.WT / 2, ang = Math.atan2(-(bz - az), bx - ax);
    const m = mesh(new THREE.BoxGeometry(len, TRI.WALLH, TRI.WT), wallM, { pos: [cx, TRI.WALLH / 2, cz], rot: [0, ang, 0] }); scene.add(m);
    scene.add(mesh(new THREE.BoxGeometry(len, 0.14, TRI.WT + 0.15), wallCap, { cast: false, pos: [cx, TRI.WALLH + 0.05, cz], rot: [0, ang, 0] }));
    if (col != null) scene.add(mesh(new THREE.BoxGeometry(len, 0.16, 0.1), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9 }), { cast: false, pos: [(ax + bx) / 2 - nx * 0.06, 0.35, (az + bz) / 2 - nz * 0.06], rot: [0, ang, 0] }));
  };
  planes().forEach((pl) => {
    for (const [P1, P2] of edgeOnPlane(pl)) {
      if (pl.goal < 0) { addWallSeg(P1[0], P1[1], P2[0], P2[1], pl.nx, pl.nz, null); continue; }
      const [tx, tz] = TANG[pl.goal]; const mx = pl.nx * TRI.a, mz = pl.nz * TRI.a;
      const u1 = (P1[0] - mx) * tx + (P1[1] - mz) * tz, u2 = (P2[0] - mx) * tx + (P2[1] - mz) * tz;
      const lo = Math.min(u1, u2), hi = Math.max(u1, u2), col = colors[pl.goal];
      addWallSeg(mx + tx * lo, mz + tz * lo, mx + tx * -TRI.GH, mz + tz * -TRI.GH, pl.nx, pl.nz, col);
      addWallSeg(mx + tx * TRI.GH, mz + tz * TRI.GH, mx + tx * hi, mz + tz * hi, pl.nx, pl.nz, col);
    }
  });
  // hoek-kristallen buiten de afkapping
  VERT.forEach(([vx, vz], k) => { const c = crystalCluster([0x7ad8ff, 0xb8f0ff, 0x9ac8ff][k], 3.4); c.position.set(vx * (TRI.BEV + 2.4), 0, vz * (TRI.BEV + 2.4)); scene.add(c); });

  // doelen: palen, net, gloeiende doellijn, avatar-sokkel
  const netT = netTex(); A.goals = [];
  NORM.forEach(([nx, nz], i) => {
    const [tx, tz] = TANG[i]; const col = colors[i], rotY = Math.atan2(-tz, tx);
    const g = new THREE.Group(); g.position.set(nx * TRI.a, 0, nz * TRI.a); g.rotation.y = rotY; scene.add(g);   // lokaal: x = langs de muur, z = uitwaarts
    const postM = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.4 });
    const dyn = new THREE.Group(); dyn.userData.dynamic = true; g.add(dyn);
    for (const s of [-1, 1]) {
      dyn.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, TRI.WALLH + 0.9, 10), postM, { pos: [s * TRI.GH, (TRI.WALLH + 0.9) / 2, TRI.WT / 2] }));
      dyn.add(mesh(new THREE.SphereGeometry(0.4, 10, 8), postM, { cast: false, pos: [s * TRI.GH, TRI.WALLH + 0.95, TRI.WT / 2] }));
    }
    dyn.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, TRI.GH * 2, 8), postM, { cast: false, pos: [0, TRI.WALLH + 0.8, TRI.WT / 2], rot: [0, 0, Math.PI / 2] }));
    const net = new THREE.Mesh(new THREE.BoxGeometry(TRI.GH * 2, 1.7, TRI.POCKET), new THREE.MeshBasicMaterial({ map: netT.clone(), transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false })); net.position.set(0, 0.85, TRI.WT + TRI.POCKET / 2 - 0.5); net.material.map.repeat.set(4, 1); net.material.map.needsUpdate = true; dyn.add(net);
    const floorG = new THREE.Mesh(new THREE.PlaneGeometry(TRI.GH * 2, TRI.POCKET + 0.6), new THREE.MeshBasicMaterial({ color: 0x0a1228 })); floorG.rotation.x = -Math.PI / 2; floorG.position.set(0, 0.02, TRI.WT + TRI.POCKET / 2 - 0.2); dyn.add(floorG);
    const lineM = new THREE.Mesh(new THREE.PlaneGeometry(TRI.GH * 2, 0.5), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); lineM.rotation.x = -Math.PI / 2; lineM.position.set(0, 0.06, 0); dyn.add(lineM);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(TRI.GH * 2.6, 2.4), new THREE.MeshBasicMaterial({ map: glowTex(), color: col, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); glow.position.set(0, 1.2, 0.2); dyn.add(glow);
    // gesloten staat: ijsblok of deur (zichtbaar als dicht)
    const block = new THREE.Mesh(new THREE.BoxGeometry(TRI.GH * 2 + 0.6, 2.4, TRI.POCKET + 1.2), new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x3a9ad8, emissiveIntensity: 0.5, roughness: 0.2, transparent: true, opacity: 0.95, flatShading: true })); block.position.set(0, 1.2, TRI.WT / 2 + (TRI.POCKET + 1.2) / 2 - 0.2); block.visible = false; dyn.add(block);
    const door = new THREE.Group(); door.visible = false; door.position.set(0, 0, TRI.WT / 2);
    const wood = mat(0x8a5a30), woodD = mat(0x5a3a1c);
    door.add(mesh(new THREE.BoxGeometry(TRI.GH * 2 + 0.6, 2.7, 0.8), woodD, { pos: [0, 1.35, 0] }));              // deurpaneel voor de goallijn
    for (let k = -2; k <= 2; k++) door.add(mesh(new THREE.BoxGeometry(1.5, 2.3, 0.1), wood, { cast: false, pos: [k * 1.65, 1.35, 0.45] }));
    door.add(mesh(new THREE.BoxGeometry(TRI.GH * 2 + 0.8, 0.3, TRI.POCKET + 1.0), wood, { pos: [0, 2.75, (TRI.POCKET + 1.0) / 2 - 0.2] }));   // dak over de goalruimte (goed zichtbaar van boven)
    for (let k = -2; k <= 2; k++) door.add(mesh(new THREE.BoxGeometry(0.16, 0.12, TRI.POCKET + 0.8), woodD, { cast: false, pos: [k * 1.65, 2.95, (TRI.POCKET + 1.0) / 2 - 0.2] }));
    door.add(mesh(new THREE.SphereGeometry(0.38, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.8, roughness: 0.3, emissive: 0x805000, emissiveIntensity: 0.5 }), { cast: false, pos: [1.9, 1.3, 0.65] }));
    dyn.add(door);
    // sokkel + avatar-plek achter het doel
    const sx = nx * (TRI.a + TRI.POCKET + 2.6), sz = nz * (TRI.a + TRI.POCKET + 2.6);
    scene.add(mesh(new THREE.CylinderGeometry(1.9, 2.3, 0.8, 14), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, roughness: 0.5 }), { cast: false, pos: [sx, 0.1, sz] }));
    A.goals.push({ g, dyn, block, door, glow, line: lineM, postM, avatarPos: [sx, 0.5, sz], col });
  });

  // omgeving: dennen, iglo's, rotsjes, sneeuwpoppen-publiek
  for (let i = 0; i < 26; i++) {
    const a = rng() * TAU, d = 31 + rng() * 34; const x = Math.sin(a) * d, z = Math.cos(a) * d - 3;
    const t = P.pine(4 + rng() * 5, 0x2c7a4b, true); t.position.set(x, -0.55, z); scene.add(t);
  }
  for (const [x, z, s] of [[-26, -14, 1.2], [25, -16, 1.0], [-3, 29, 1.1]]) {
    const ig = new THREE.Group(); ig.position.set(x, -0.55, z); ig.rotation.y = Math.atan2(-x, -z);
    ig.add(mesh(new THREE.SphereGeometry(2.6 * s, 14, 8, 0, TAU, 0, Math.PI / 2), mat(0xeaf6ff, { flatShading: false }), { cast: false }));
    ig.add(mesh(new THREE.BoxGeometry(1.5 * s, 1.5 * s, 1.8 * s), mat(0xeaf6ff), { cast: false, pos: [0, 0.75 * s, 2.3 * s] }));
    ig.add(mesh(new THREE.BoxGeometry(0.9 * s, 1.0 * s, 0.1), mat(0x141a30), { cast: false, pos: [0, 0.55 * s, 3.25 * s] }));
    scene.add(ig);
  }
  for (let i = 0; i < 12; i++) { const a = rng() * TAU, d = 24 + rng() * 14; const r = P.rock(0.8 + rng() * 1.2, 0x7a8aa8); r.position.set(Math.sin(a) * d, -0.55, Math.cos(a) * d - 3); scene.add(r); }
  // publiek: sneeuwpoppen en een paar figuren langs de randen
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.3; const d = 25 + (i % 3) * 2.2; const x = Math.sin(a) * d, z = Math.cos(a) * d - 2;
    const s = snowman(); s.position.set(x, -0.55, z); s.rotation.y = Math.atan2(-x, -(z + 2)); scene.add(s); A.crowd.push({ s, ph: rng() * 6 });
  }
  mergeStatic(scene, start);

  // dynamisch: bumper-kristallen (rijzen op), boost-kristal, doel-flits
  A.bumpers = VERT.map(([vx, vz]) => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(0.95, 1.2, 0.8, 10), new THREE.MeshStandardMaterial({ color: 0x9fe0ff, emissive: 0x2a8ad8, emissiveIntensity: 0.6, roughness: 0.2, transparent: true, opacity: 0.94, flatShading: true }), { pos: [0, 0.4, 0] }));
    for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; g.add(mesh(new THREE.ConeGeometry(0.28, 1.1 + (k % 2) * 0.6, 5), new THREE.MeshStandardMaterial({ color: 0xd8f6ff, emissive: 0x58c8ff, emissiveIntensity: 0.9, flatShading: true }), { cast: false, pos: [Math.cos(a) * 0.5, 1.2, Math.sin(a) * 0.5], rot: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] })); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.6, 24), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring); g.userData.ring = ring;
    g.visible = false; scene.add(g); return { g, hit: 0, on: false, t: 0 };
  });
  const boost = new THREE.Group();
  boost.add(mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff5a00, emissiveIntensity: 1.2, flatShading: true, roughness: 0.2 }), { pos: [0, 1.2, 0], scale: [0.8, 1.5, 0.8] }));
  const bring = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.35, 24), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })); bring.rotation.x = -Math.PI / 2; bring.position.y = 0.06; boost.add(bring);
  boost.visible = false; scene.add(boost); A.boost = boost;
  // laat het publiek juichen
  A.update = (t, dt) => {
    A.t = t; A.au.offset.x = t * 0.01; A.aur.material.opacity = 0.65 + Math.sin(t * 0.7) * 0.15;
    for (const c of A.crowd) { c.ph += dt; const k = A.cheerT > 0 ? Math.abs(Math.sin(c.ph * 9)) * 0.4 : Math.sin(c.ph * 1.3) * 0.05; c.s.userData.head.position.y = 2.4 + k * 0.3; c.s.userData.arms.forEach((a, j) => { a.rotation.z = (j ? -1 : 1) * (A.cheerT > 0 ? 1.0 + Math.sin(c.ph * 12) * 0.5 : 0.1); }); }
    A.cheerT = Math.max(0, (A.cheerT || 0) - dt);
    A.goals.forEach((G, i) => { G.glow.material.opacity = Math.max(0, A.flash[i]); A.flash[i] = Math.max(0, A.flash[i] - dt * 1.4); G.line.material.opacity = 0.4 + Math.sin(t * 3 + i) * 0.12 + A.flash[i] * 0.5; });
  };
  A.cheer = (s = 2) => { A.cheerT = s; };
  return A;
}
