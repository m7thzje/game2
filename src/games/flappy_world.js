import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, TAU, mulberry32 } from '../engine/util.js';

// Wereld van de Wolkenrace: parcours (voor beide banen identiek), banen met geïnstancede wolken-pilaren, munten, vogels, stormwolken,
// windvlagen, power-ups en parallax-achtergronden (zonsondergang boven, schemering onder).
export const FL = { L: 760, H: 10.5, X0: -9, Y0: [0.6, -11.1], HW: 24, DZ: 28 };
const { L, H } = FL;
export const POW = {
  shield: { name: 'SCHILD', icon: '🛡️', col: '#6fd8ff', hex: 0x6fd8ff, w: 3 },
  magnet: { name: 'MAGNEET', icon: '🧲', col: '#ff6a6a', hex: 0xff6a6a, w: 3 },
  giant: { name: 'REUS!', icon: '🦖', col: '#8dff6a', hex: 0x8dff6a, w: 2 },
  zap: { name: 'BLIKSEM', icon: '⚡', col: '#ffe14a', hex: 0xffe14a, w: 2.5 },
};
const POW_IDS = Object.keys(POW);

// ---------------- parcours ----------------
export function makeCourse(rng) {
  const pillars = [], coins = [], birds = [], winds = [], storms = [], pows = [], treas = [];
  let x = 42, cy = H / 2, np = 0;
  const free = (cx, cyv) => {   // staat deze plek vrij van vaste obstakels?
    for (const p of pillars) { if (Math.abs(p.x - cx) < 2.4 && (cyv < p.gy0 + 0.75 || cyv > p.gy1 - 0.75)) return false; }
    for (const s of storms) if (Math.hypot(s.x - cx, s.y - cyv) < s.r + 0.7) return false;
    return true;
  };
  const coin = (cx, cyv, t = -1) => { if (cyv > 1.5 && cyv < H - 0.9 && (t >= 0 || free(cx, cyv))) coins.push({ x: cx, y: cyv, t }); };
  const trail = (x0, kind, y0, n, dx, amp) => { for (let k = 0; k < n; k++) { const u = k / Math.max(1, n - 1); const yy = kind === 'sine' ? y0 + Math.sin(u * TAU) * amp : kind === 'arc' ? y0 + Math.sin(u * Math.PI) * amp : y0; coin(x0 + k * dx, yy); } };
  let lastKind = '';
  while (x < L - 46) {
    const t = x / L; let r = rng(); let kind = r < 0.46 ? 'pillars' : r < 0.60 ? 'birds' : r < 0.72 ? 'wind' : r < 0.82 ? 'storm' : r < 0.90 ? 'treasure' : 'coins';
    if (t < 0.12 && (kind === 'storm' || kind === 'birds')) kind = 'pillars';
    if (kind === lastKind && kind !== 'pillars') kind = 'pillars'; lastKind = kind;
    if (kind === 'pillars') {
      const n = 2 + Math.floor(rng() * 3); const gap = lerp(5.6, 4.3, t) + rng() * 0.3;
      for (let k = 0; k < n; k++) {
        const nc = clamp(cy + (rng() - 0.5) * 6.8, gap / 2 + 1.5, H - gap / 2 - 1.3); const weak = rng() < 0.22 && t > 0.08;
        const g2 = weak ? gap - 0.9 : gap;
        const p = { x, gy0: nc - g2 / 2, gy1: nc + g2 / 2, w: 3.0, brTop: weak && rng() < 0.5, brBot: false, id: np++ }; if (weak && !p.brTop) p.brBot = true;
        pillars.push(p);
        // munten in en tussen de pilaren
        coin(x, nc); const nx = x + 15; for (let q = 1; q <= 3; q++) { const u = q / 4; if (k < n - 1) coin(x + 15 * u, lerp(nc, nc, u) + Math.sin(u * Math.PI) * (rng() < 0.5 ? 0.8 : -0.8)); }
        cy = nc; x += 15;
      }
      x += 10;
    } else if (kind === 'birds') {
      const n = 2 + Math.floor(rng() * 2);
      for (let k = 0; k < n; k++) { const by = 2.4 + rng() * (H - 5.2); birds.push({ x: x + k * 8, y0: by, amp: 1.2 + rng() * 1.6, per: 1.8 + rng() * 1.4, ph: rng() * 6.28, col: [0x3a2a22, 0x4a3a5a, 0x2a4a3a][k % 3] }); }
      trail(x - 4, 'sine', H / 2, 9, 1.4, 2.2); x += n * 8 + 8;
    } else if (kind === 'wind') {
      const dir = rng() < 0.5 ? 1 : -1; const len = 16 + rng() * 4; winds.push({ x0: x, x1: x + len, dir });
      for (let k = 0; k < 8; k++) { const u = k / 7; coin(x + 2 + u * (len - 4), dir > 0 ? 2.5 + u * 5 : 7.5 - u * 5); } x += len + 10;
    } else if (kind === 'storm') {
      const sy = 3 + rng() * (H - 6); storms.push({ x, y: sy, r: 2.2 }); trail(x - 8, 'arc', sy > H / 2 ? sy - 2.6 : sy + 2.6, 6, 1.3, 0.8); trail(x + 3, 'arc', sy > H / 2 ? sy - 2.6 : sy + 2.6, 6, 1.3, 0.8); x += 15;
    } else if (kind === 'treasure') {
      const ty = 3 + rng() * (H - 6); const ti = treas.length; treas.push({ x, y: ty, r: 1.5 });
      for (let k = 0; k < 5; k++) coin(x + (k - 2) * 0.55, ty + (k % 2 ? 0.3 : -0.3), ti); trail(x - 6, 'line', ty, 3, 1.5, 0); x += 14;
    } else { const ky = rng() < 0.5 ? 'sine' : 'arc'; trail(x, ky, 2.6 + rng() * (H - 6), 12, 1.3, 2.0); x += 20; }
    // power-up elke ~110 eenheden
    if (!pows.length || x - pows[pows.length - 1].x > 105 + rng() * 25) {
      let tot = 0; for (const id of POW_IDS) tot += POW[id].w; let rr = rng() * tot, type = POW_IDS[0]; for (const id of POW_IDS) { rr -= POW[id].w; if (rr <= 0) { type = id; break; } }
      let py = 3 + rng() * (H - 6.5), px = x + 4; for (let tries = 0; tries < 8 && !free(px, py); tries++) { px += 2; py = 3 + rng() * (H - 6.5); } pows.push({ x: px, y: py, type }); x += 12;
    }
    x += 6 + rng() * 6;
  }
  coins.sort((a, b) => a.x - b.x);
  return { pillars, coins, birds, winds, storms, pows, treas };
}

// ---------------- plaatjes ----------------
function puffTex(top, shade, seed, W2 = 512, H2 = 160, n = 11, rmin = 18, rmax = 46, base = 0.0) {
  return canvasTex(W2, H2, (g, w, h) => {
    const r = mulberry32(seed);
    const blob = (cx, cy, rr) => { for (const dx of [-w, 0, w]) { g.beginPath(); g.arc(cx + dx, cy, rr, 0, TAU); g.fill(); } };
    g.fillStyle = shade; for (let k = 0; k < n; k++) blob(r() * w, h * (0.55 + r() * 0.3) + 5, rmin + r() * (rmax - rmin));
    g.fillStyle = top; for (let k = 0; k < n; k++) { const cx = r() * w; blob(cx, h * (0.5 + r() * 0.3), rmin + r() * (rmax - rmin) * 0.9); }
    if (base > 0) { g.fillStyle = top; g.fillRect(0, h * (1 - base), w, h * base); }
  });
}
function gradTex(top, bot) { return canvasTex(8, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); }
function rainbowTex() { return canvasTex(1024, 256, (g, w, h) => { const cols = ['#ff5a5a', '#ffa93a', '#ffe14a', '#6fe05a', '#4aa8ff', '#9a6bff']; for (let a = 0; a < 2; a++) { const cx = a * 560 + 230; cols.forEach((c, k) => { g.strokeStyle = c; g.globalAlpha = 0.5; g.lineWidth = 12; g.beginPath(); g.arc(cx, 330, 240 - k * 12, Math.PI, 0); g.stroke(); }); } g.globalAlpha = 1; }); }
function discTex(c0, c1) { return canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, c0); gr.addColorStop(0.55, c0); gr.addColorStop(0.6, c1); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }); }
function arrowTex() { return canvasTex(128, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineCap = 'round'; g.lineWidth = 7; for (let k = 0; k < 4; k++) { const y = k * 64 + 10; g.beginPath(); g.moveTo(24, y + 36); g.lineTo(64, y + 6); g.lineTo(104, y + 36); g.stroke(); } g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 4; for (let k = 0; k < 6; k++) { const x = 14 + k * 20; g.beginPath(); g.moveTo(x, 20 + (k % 3) * 30); g.lineTo(x, 80 + (k % 3) * 30); g.stroke(); } }); }
function iconTex(icon) { return canvasTex(128, 128, (g, w, h) => { g.font = '84px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, 64, 70); }); }

const SRC = {};
function srcTex(key, make) { return SRC[key] || (SRC[key] = make()); }
function layerTex(src, rx, rpt) { const t = src.clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.repeat.set(rx, 1); t.userData.keep = false; return t; }

// ---------------- modellen ----------------
const SH = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, ...o });
export function makeBird(col) {
  const g = new THREE.Group();
  const bm = SH(col, { roughness: 0.7 });
  g.add(mesh(new THREE.SphereGeometry(0.55, 10, 8), bm, { cast: false, receive: false, scale: [1.25, 0.9, 0.9] }));
  g.add(mesh(new THREE.SphereGeometry(0.34, 9, 7), bm, { cast: false, receive: false, pos: [-0.62, 0.3, 0] }));
  g.add(mesh(new THREE.ConeGeometry(0.16, 0.5, 5), SH(0xffa31a), { cast: false, receive: false, pos: [-1.05, 0.28, 0], rot: [0, 0, Math.PI / 2] }));
  for (const s of [-1, 1]) { g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), SH(0xffffff), { cast: false, receive: false, pos: [-0.72, 0.42, s * 0.22] })); g.add(mesh(new THREE.SphereGeometry(0.05, 5, 4), SH(0x101010), { cast: false, receive: false, pos: [-0.78, 0.42, s * 0.28] })); }
  g.add(mesh(new THREE.ConeGeometry(0.28, 0.9, 4), bm, { cast: false, receive: false, pos: [0.95, 0.05, 0], rot: [0, 0, -Math.PI / 2 - 0.3] }));
  const wings = [-1, 1].map((s) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.7), SH(col === 0x3a2a22 ? 0x5a4236 : 0x6a5a7a, { side: THREE.DoubleSide })); const p = new THREE.Group(); p.position.set(0.05, 0.25, s * 0.35); w.position.set(0.2, 0, s * 0.35); w.rotation.x = Math.PI / 2; p.add(w); g.add(p); return { p, w, s }; });
  return { group: g, wings };
}
export function makePowerBubble(type) {
  const g = new THREE.Group(); const P = POW[type];
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), new THREE.MeshBasicMaterial({ color: P.hex, transparent: true, opacity: 0.38, depthWrite: false })));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 6, 20), new THREE.MeshBasicMaterial({ color: 0xffffff })); g.add(ring);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: srcTex('icon' + type, () => iconTex(P.icon)), transparent: true, depthTest: false })); sp.scale.set(1.15, 1.15, 1); sp.renderOrder = 12; g.add(sp);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: srcTex('halo' + type, () => discTex('rgba(255,255,255,.55)', 'rgba(255,255,255,.2)')), color: P.hex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.scale.set(3.4, 3.4, 1); g.add(halo);
  return { group: g, ring, halo };
}

// ---------------- baan ----------------
const blobGeo = new THREE.IcosahedronGeometry(1, 1);
const blobMat = new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true, emissive: 0x9a9ab4, emissiveIntensity: 0.9 });
const tmp = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color() };
function setInst(im, k, x, y, z, sx, sy, sz, ry = 0) { tmp.e.set(0, ry, 0); tmp.q.setFromEuler(tmp.e); tmp.m.compose(tmp.p.set(x, y, z), tmp.q, tmp.s.set(sx, sy, sz)); im.setMatrixAt(k, tmp.m); }
function blobsFor(list, col1, col2) {   // list: [{x,y,r,z}] -> InstancedMesh
  const im = new THREE.InstancedMesh(blobGeo, blobMat, Math.max(1, list.length)); im.castShadow = false; im.receiveShadow = false;
  list.forEach((b, k) => { setInst(im, k, b.x, b.y, b.z || 0, b.r, b.r * 0.92, b.r * 0.9, k); tmp.c.setHex(col1).lerp(tmp.c.clone().setHex(col2), b.sh ?? 0); im.setColorAt(k, tmp.c); b.idx = k; });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; im.computeBoundingSphere(); im.frustumCulled = true; return im;
}
export function pillarBlobs(p, out) {   // blobs voor boven- en onderblok -> out.top / out.bot (arrays van {x,y,r,z})
  const r0 = 1.6;
  const mk = (from, to, dir, arr, seed) => {
    const n = Math.max(2, Math.ceil(Math.abs(to - from) / 1.25)); const rr = mulberry32(p.id * 31 + seed);
    for (let k = 0; k <= n; k++) { const u = k / n; const y = from + (to - from) * u; arr.push({ x: p.x + (rr() - 0.5) * 0.5, y, r: r0 + rr() * 0.25, z: (rr() - 0.5) * 0.8, sh: 0.15 + 0.5 * (1 - u) * 0.6 }); }
    const capY = from; arr.push({ x: p.x, y: capY - dir * 0.15, r: 2.0, z: 0.2, sh: 0 }, { x: p.x - 1.05, y: capY + dir * 0.35, r: 1.25, z: 0.4, sh: 0.1 }, { x: p.x + 1.05, y: capY + dir * 0.35, r: 1.25, z: -0.2, sh: 0.1 });
  };
  out.top = []; out.bot = []; mk(p.gy1 + 0.2, H + 1.3, -1, out.top, 1); mk(p.gy0 - 0.2, -0.8, 1, out.bot, 2);
  // kop-blobs liggen aan de gat-kant: gespiegeld voor de onderkant
}

export function buildLane(ctx, i, course, rng) {
  const { scene } = ctx; const y0 = FL.Y0[i];
  const root = new THREE.Group(); root.position.y = y0; scene.add(root);
  const group = new THREE.Group(); root.add(group);   // verschuift met de voortgang

  // ---- achtergrond (parallax): staat in 'bg' (verschuift niet; textures scrollen) ----
  const bgGroup = new THREE.Group(); root.add(bgGroup);
  const lay = [];
  const kz = (z) => (FL.DZ - z) / FL.DZ, projY = (yl, z) => (y0 + yl) * kz(z) - y0;
  const addLayer = (src, z, f, period, yc, hS, opacity = 1) => {   // yc/hS: lokale schermcoördinaten (t.o.v. baan-oorsprong)
    const k = kz(z); const w = FL.HW * 2.4; const t = layerTex(src, w / period, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * k, hS * k), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity, fog: false }));
    m.position.set(0, projY(yc, z), z); m.renderOrder = -10 + Math.round(z); bgGroup.add(m); lay.push({ t, f, period, w }); return m;
  };
  const skyTop = i ? '#6f5bd8' : '#ff8f5a', skyBot = i ? '#ffb4e4' : '#ffe9ae';
  { const k = kz(-62); const sky = new THREE.Mesh(new THREE.PlaneGeometry(FL.HW * 2.4 * k, (H + 1.2) * k), new THREE.MeshBasicMaterial({ map: gradTex(skyTop, skyBot), fog: false, depthWrite: false })); sky.position.set(0, projY(H / 2, -62), -62); sky.renderOrder = -30; bgGroup.add(sky); }
  { const k = kz(-40); const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: discTex(i ? '#fff6e0' : '#fff2b0', i ? 'rgba(255,200,240,.5)' : 'rgba(255,170,90,.5)'), transparent: true, depthWrite: false, fog: false })); const sz = (i ? 9 : 12) * k; sunS.scale.set(sz, sz, 1); sunS.position.set((i ? 13 : 15) * k, projY(H * 0.6, -40), -40); sunS.renderOrder = -25; bgGroup.add(sunS); }
  addLayer(srcTex('rain', rainbowTex), -46, 0.04, 58, H * 0.46, H * 1.1, 0.9);
  addLayer(srcTex('farc' + i, () => puffTex(i ? '#f3d8ff' : '#fff0d2', i ? '#c9a4ff' : '#ffc890', 11, 512, 160, 12, 30, 0.0)), -30, 0.12, 36, H * 0.36, 5.5, 0.85);
  addLayer(srcTex('midc' + i, () => puffTex(i ? '#ffe9fb' : '#fff8e6', i ? '#e2b6ff' : '#ffd6a0', 23, 512, 192, 9, 36, 0.0)), -14, 0.4, 30, H * 0.7, 7.5, 0.9);
  // wolkenzee onder (vloer) en wolkenplafond boven: schuiven 1:1 met de wereld
  const fh = i ? 3.6 : 2.1, fb = i ? 0.6 : 0.12, ch = i ? 2.1 : 4.1, cb = i ? 0.12 : 0.5;
  const floorSrc = srcTex('floor' + i, () => puffTex('#ffffff', i ? '#e0c8ff' : '#ffd9b0', 5, 512, 128, 12, 30, fb));
  const ceilSrc = srcTex('ceil' + i, () => puffTex('#ffffff', i ? '#d6b8ff' : '#ffcf9a', 8, 512, 128, 12, 30, cb));
  const fl = addLayer(floorSrc, -0.4, 1.0, 22, 1.5 - fh / 2, fh, 1); fl.renderOrder = 3;
  const cl = addLayer(ceilSrc, -0.4, 1.0, 22, H - 1.5 + ch / 2, ch, 1); cl.scale.y = -1; cl.renderOrder = 3;

  // ---- pilaren (geïnstanceerd per chunk) ----
  const CH = 80; const chunks = new Map();
  const getChunk = (c) => { let o = chunks.get(c); if (!o) { o = { solid: [], brk: [], pil: [] }; chunks.set(c, o); } return o; };
  for (const p of course.pillars) { const o = {}; pillarBlobs(p, o); p.blobs = o; const ch = getChunk(Math.floor(p.x / CH)); ch.pil.push(p); }
  const pillarInst = new Map();   // pillar id -> { top: [{im,idx}], bot: [...] }
  for (const [c, ch] of chunks) {
    const sol = [], brk = []; const refs = [];
    for (const p of ch.pil) { for (const side of ['top', 'bot']) { const br = side === 'top' ? p.brTop : p.brBot; for (const b of p.blobs[side]) { (br ? brk : sol).push(b); b._br = br; b._side = side; b._p = p; } } }
    const imS = blobsFor(sol, 0xffffff, 0xc4d0ff); const imB = blobsFor(brk, 0xffc4d8, 0xff9ab8);
    group.add(imS); if (brk.length) group.add(imB);
    for (const b of sol) { const k = b._p.id; (pillarInst.get(k) || pillarInst.set(k, { top: [], bot: [] }).get(k))[b._side].push({ im: imS, idx: b.idx }); }
    for (const b of brk) { const k = b._p.id; (pillarInst.get(k) || pillarInst.set(k, { top: [], bot: [] }).get(k))[b._side].push({ im: imB, idx: b.idx }); }
  }
  // ---- stormwolken ----
  const stormB = []; course.storms.forEach((s, k) => { const rr = mulberry32(k * 7 + 3); for (let q = 0; q < 6; q++) stormB.push({ x: s.x + (rr() - 0.5) * 2.6, y: s.y + (rr() - 0.5) * 1.4, r: 1.0 + rr() * 0.7, z: (rr() - 0.5) * 0.6, sh: rr() * 0.5, si: k }); });
  const stormIM = blobsFor(stormB, 0x5a5878, 0x2c2a44); group.add(stormIM); stormIM.frustumCulled = false;
  const stormFlash = course.storms.map((s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: srcTex('halo_w', () => discTex('rgba(255,255,255,.9)', 'rgba(255,255,255,.4)')), color: 0xfff2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(6, 6, 1); sp.position.set(s.x, s.y, 1); sp.material.opacity = 0; group.add(sp); return sp; });
  // ---- schatwolken (breekbaar, met munten erachter) ----
  const treasB = []; course.treas.forEach((s, k) => { for (let q = 0; q < 4; q++) { const a = q / 4 * TAU; treasB.push({ x: s.x + Math.cos(a) * 0.6, y: s.y + Math.sin(a) * 0.6, r: 0.95, z: 0.6, sh: q * 0.1, ti: k }); } treasB.push({ x: s.x, y: s.y, r: 1.1, z: 0.9, sh: 0, ti: k }); });
  const treasIM = blobsFor(treasB, 0xffd0e0, 0xffa0c0); group.add(treasIM); treasIM.frustumCulled = false;
  // ---- munten ----
  const NC = course.coins.length; const coinG = new THREE.CylinderGeometry(0.42, 0.42, 0.14, 16); coinG.rotateX(Math.PI / 2);
  const coinIM = new THREE.InstancedMesh(coinG, new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xff9a10, emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.3 }), Math.max(1, Math.min(NC, 90))); coinIM.frustumCulled = false; group.add(coinIM);
  // ---- windvlaktes ----
  const windMeshes = course.winds.map((w) => { const t = srcTex('arrow', arrowTex).clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; const len = w.x1 - w.x0; t.repeat.set(len / 5, H / 6); const m = new THREE.Mesh(new THREE.PlaneGeometry(len, H), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.55, depthWrite: false, color: w.dir > 0 ? 0xbfffd0 : 0xffd0e0, fog: false })); m.position.set((w.x0 + w.x1) / 2, H / 2, -0.8); m.renderOrder = 1; group.add(m); return { m, t, dir: w.dir }; });
  // ---- vogels ----
  const birds = course.birds.map((b) => { const m = makeBird(b.col); m.group.position.set(b.x, b.y0, 0); m.group.visible = false; group.add(m.group); return m; });
  // ---- power-ups ----
  const pows = course.pows.map((p) => { const m = makePowerBubble(p.type); m.group.position.set(p.x, p.y, 0); m.group.visible = false; group.add(m.group); return m; });
  // finishlijn
  const fin = new THREE.Mesh(new THREE.PlaneGeometry(1.6, H + 1.4), new THREE.MeshBasicMaterial({ map: canvasTex(32, 256, (g, w, h) => { for (let r = 0; r < 16; r++) for (let c = 0; c < 2; c++) { g.fillStyle = (r + c) % 2 ? '#111' : '#fff'; g.fillRect(c * 16, r * 16, 16, 16); } }), transparent: true, opacity: 0.9 }));
  fin.position.set(L, H / 2, -0.3); group.add(fin);
  const finPost = mesh(new THREE.BoxGeometry(0.3, H + 2, 0.3), mat(0xffffff), { cast: false, pos: [L - 0.9, H / 2, 0] }); group.add(finPost);

  // dynamische status per baan
  const st = {
    coinAlive: new Uint8Array(NC).fill(1), coinFx: new Float32Array(NC), coinFy: new Float32Array(NC), coinFly: new Uint8Array(NC),
    pil: course.pillars.map(() => ({ top: true, bot: true })), bird: course.birds.map(() => ({ s: 0, t: 0, x: 0, y: 0, vy: 0, rot: 0 })), storm: course.storms.map(() => true), treas: course.treas.map(() => true), pow: course.pows.map(() => true),
  };
  let vis = [];   // zichtbare munt-indexen (voor tests)
  function destroyPillarPart(pi, side) { st.pil[pi][side] = false; const list = pillarInst.get(course.pillars[pi].id)[side]; for (const r of list) { setInst(r.im, r.idx, 0, -99, 0, 0.001, 0.001, 0.001); r.im.instanceMatrix.needsUpdate = true; } }
  function destroyStorm(k) { st.storm[k] = false; for (const b of stormB) if (b.si === k) { setInst(stormIM, b.idx, 0, -99, 0, 0.001, 0.001, 0.001); } stormIM.instanceMatrix.needsUpdate = true; }
  function destroyTreas(k) { st.treas[k] = false; for (const b of treasB) if (b.ti === k) { setInst(treasIM, b.idx, 0, -99, 0, 0.001, 0.001, 0.001); } treasIM.instanceMatrix.needsUpdate = true; }
  // per frame: wereld verschuiven, coins renderen (venster), vogels/powerups tonen, achtergrond scrollen
  let cLo = 0;
  function render(progress, t, dt) {
    group.position.x = -progress;
    for (const l of lay) l.t.offset.x = (progress * l.f) / l.period;
    // munten: venster [progress-26, progress+26]
    while (cLo < NC && course.coins[cLo].x < progress - 26) cLo++;
    let n = 0; const mx = coinIM.count; vis.length = 0;
    for (let k = cLo; k < NC && n < 90; k++) {
      const c = course.coins[k]; if (c.x > progress + 28) break; if (!st.coinAlive[k]) continue; if (c.t >= 0 && st.treas[c.t]) continue;
      const fly = st.coinFly[k]; const px = fly ? st.coinFx[k] : c.x, py = fly ? st.coinFy[k] : c.y;
      tmp.e.set(0, t * 3.2 + k * 0.7, 0); tmp.q.setFromEuler(tmp.e); tmp.m.compose(tmp.p.set(px, py + Math.sin(t * 2 + k) * 0.08, 0), tmp.q, tmp.s.set(1, 1, 1)); coinIM.setMatrixAt(n++, tmp.m);
    }
    coinIM.count = n; coinIM.instanceMatrix.needsUpdate = true;
    // vogels
    course.birds.forEach((b, k) => { const s = st.bird[k], m = birds[k]; const inWin = b.x > progress - 22 && b.x < progress + 28; if (s.s === 2 || !inWin) { m.group.visible = false; return; } m.group.visible = true;
      const wing = Math.sin(t * 14 + k * 2) * 0.9; for (const w of m.wings) w.p.rotation.x = w.s * wing; });
    course.pows.forEach((p, k) => { const m = pows[k]; const inWin = st.pow[k] && p.x > progress - 22 && p.x < progress + 28; m.group.visible = inWin; if (inWin) { m.group.position.y = p.y + Math.sin(t * 2.4 + k) * 0.25; m.ring.rotation.z += dt * 2; m.ring.rotation.x = 1.2 + Math.sin(t * 2) * 0.2; m.halo.material.opacity = 0.6 + Math.sin(t * 5 + k) * 0.25; } });
    for (const w of windMeshes) w.t.offset.y -= dt * 1.1 * w.dir * 0.5;
    course.storms.forEach((s, k) => { const f = stormFlash[k]; const near = s.x > progress - 24 && s.x < progress + 28 && st.storm[k]; f.material.opacity = near ? Math.max(0, Math.sin(t * 3.1 + k * 4) * 3 - 2.4) : 0; });
    // vogels zitten in de baan-groep op hun eigen positie (door de logica gezet)
  }
  return { i, y0, root, group, st, birdsM: birds, powsM: pows, coinIM, stormIM, render, destroyPillarPart, destroyStorm, destroyTreas, bg: bgGroup, vis };
}
