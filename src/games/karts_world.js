import * as THREE from 'three';
import { mat, mesh, canvasTex, TAU, mulberry32, clamp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { HALF_W, WALL_M, pointAt } from './karts_track.js';

// De wereld van de Kasteel-Kartrace: weg, kerbs, heggen, brug, beek, kasteel, tribune, bomen.
const rngW = mulberry32(777);
const r = (a, b) => a + rngW() * (b - a);

function speckle(g, w, h, n, cols, s, rng) { for (let i = 0; i < n; i++) { g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(rng() * w, rng() * h, s * (0.5 + rng()), s * (0.5 + rng())); } }

function roadTex() {
  const rng = mulberry32(5);
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#8c8071'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 900, ['#7d7265', '#9a8e7e', '#6f6558', '#a59a89'], 3, rng);
    g.strokeStyle = 'rgba(40,32,24,.28)'; g.lineWidth = 1.5;
    for (let y = 0; y < 8; y++) { g.beginPath(); g.moveTo(0, y * 32); g.lineTo(w, y * 32); g.stroke(); for (let x = 0; x < 4; x++) { const ox = (y % 2) * 16; g.beginPath(); g.moveTo(x * 32 + ox, y * 32); g.lineTo(x * 32 + ox, y * 32 + 32); g.stroke(); } }
    g.fillStyle = 'rgba(255,248,225,.55)'; g.fillRect(5, 0, 4, h); g.fillRect(w - 9, 0, 4, h);
    g.fillStyle = '#f3ead0'; for (let y = 0; y < 2; y++) g.fillRect(w / 2 - 3, y * 128 + 8, 6, 52);
  }, { repeat: [1, 1] });
}
function iceTexture() {
  const rng = mulberry32(8);
  return canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#c9efff'); gr.addColorStop(1, '#8fd0f4'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 16; i++) { let x = rng() * w, y = rng() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 50; y += (rng() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 60; i++) g.fillRect(rng() * w, rng() * h, 2, 2);
    g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(5, 0, 4, h); g.fillRect(w - 9, 0, 4, h);
  }, { repeat: [1, 1] });
}
function mudTexture() {
  const rng = mulberry32(9);
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#5b4328'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 700, ['#4a351f', '#6b4f30', '#3c2a18'], 4, rng);
    for (let i = 0; i < 14; i++) { const x = rng() * w, y = rng() * h; g.fillStyle = 'rgba(120,95,60,.55)'; g.beginPath(); g.ellipse(x, y, 10 + rng() * 14, 5 + rng() * 8, 0, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(x - 3, y - 2, 4, 2, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(30,20,10,.45)'; for (let i = 0; i < 6; i++) g.fillRect(30 + (i % 2) * 40, i * 42, 10, 28);
  }, { repeat: [1, 1] });
}
function chevronTex(c1, c2) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2;
    for (let i = -1; i < 4; i++) { g.beginPath(); g.moveTo(0, i * 36 + 30); g.lineTo(w / 2, i * 36); g.lineTo(w, i * 36 + 30); g.lineTo(w, i * 36 + 52); g.lineTo(w / 2, i * 36 + 22); g.lineTo(0, i * 36 + 52); g.fill(); }
  }, { repeat: [1, 1] });
}
function checkerTexture(n = 8) {
  return canvasTex(128, 32, (g, w, h) => { const s = w / n; for (let x = 0; x < n; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * s, y * (h / 2), s, h / 2); } }, { repeat: [1, 1] });
}
export function questionTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(0.5, '#ff7a3a'); gr.addColorStop(1, '#d83a8a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.font = 'bold 92px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#5a1a4a'; g.strokeText('?', w / 2, h / 2 + 6); g.fillStyle = '#fff'; g.fillText('?', w / 2, h / 2 + 6);
  });
}
const emojiCache = new Map();
export function emojiTex(e) {
  let t = emojiCache.get(e);
  if (!t) { t = canvasTex(96, 96, (g, w, h) => { g.fillStyle = 'rgba(20,12,40,.55)'; g.beginPath(); g.arc(w / 2, h / 2, 44, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.stroke(); g.font = '56px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, w / 2, h / 2 + 4); }); emojiCache.set(e, t); }
  return t;
}

// lint van de weg langs het circuit: laterale offsets lat0..lat1, hoogte y
export function strip(C, i0, i1, lat0, lat1, y, vDiv = 8, colorFn = null) {
  const n = i1 - i0 + 1, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), nor = new Float32Array(n * 6), idx = [];
  for (let a = 0; a < n; a++) {
    const k = i0 + a, A = pointAt(C, k, lat0), B = pointAt(C, k, lat1);
    pos.set([A.x, y, A.z, B.x, y, B.z], a * 6); uv.set([0, k / vDiv, 1, k / vDiv], a * 4); nor.set([0, 1, 0, 0, 1, 0], a * 6);
    if (a < n - 1) { const b = a * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}
function kerbGeo(C, side) {
  const N = C.N, pos = [], col = [], nor = [], idx = []; const red = new THREE.Color(0xd8372c), white = new THREE.Color(0xf4f0e6);
  const l0 = side * HALF_W, l1 = side * (HALF_W + 0.6);
  for (let k = 0; k < N; k++) {
    const A = pointAt(C, k, l0), B = pointAt(C, k, l1), A2 = pointAt(C, k + 1, l0), B2 = pointAt(C, k + 1, l1);
    const base = pos.length / 3, c = (Math.floor(k / 2) % 2) ? red : white;
    for (const q of [A, B, A2, B2]) { pos.push(q.x, 0.07, q.z); nor.push(0, 1, 0); col.push(c.r, c.g, c.b); }
    if (side > 0) idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); else idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
  return g;
}

export function buildWorld(ctx, C) {
  const { scene } = ctx; const N = C.N;
  const upd = [];                        // update-functies (t, dt)
  const add = (o) => { scene.add(o); return o; };

  // ---- grond ----
  const ground = mesh(new THREE.PlaneGeometry(260, 190), new THREE.MeshStandardMaterial({ map: tex.grass(52, 38), roughness: 1 }), { cast: false });
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -20); add(ground);

  // ---- weg ----
  const polyOff = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
  const roadM = new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.95, side: THREE.DoubleSide, ...polyOff });
  add(mesh(strip(C, 0, N, -HALF_W, HALF_W, 0.03), roadM, { cast: false }));
  const zn = C.zones;
  const iceM = new THREE.MeshStandardMaterial({ map: iceTexture(), roughness: 0.12, metalness: 0.25, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  add(mesh(strip(C, zn.ice[0], zn.ice[1], -HALF_W, HALF_W, 0.04), iceM, { cast: false }));
  const mudM = new THREE.MeshStandardMaterial({ map: mudTexture(), roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  add(mesh(strip(C, zn.mud[0], zn.mud[1], -HALF_W, HALF_W, 0.04), mudM, { cast: false }));
  const plankT = tex.planks(1, 1, '#a9774a').clone(); plankT.needsUpdate = true; plankT.userData.keep = false;
  add(mesh(strip(C, zn.bridge[0], zn.bridge[1], -HALF_W - 0.2, HALF_W + 0.2, 0.09, 4), new THREE.MeshStandardMaterial({ map: plankT, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), { cast: false }));
  // kerbs
  const kerbM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  add(mesh(kerbGeo(C, 1), kerbM, { cast: false })); add(mesh(kerbGeo(C, -1), kerbM, { cast: false }));

  // turbopijlen
  const padM = new THREE.MeshBasicMaterial({ map: chevronTex('#1a3a8a', '#7fe8ff'), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  C.zones.pads.forEach((rg) => { const g = strip(C, rg[0] - 1, rg[1] + 1, -HALF_W * 0.7, HALF_W * 0.7, 0.1, 4); add(mesh(g, padM, { cast: false })); });

  // ---- hegge langs de weg (1 InstancedMesh) ----
  {
    const inb = (k) => k >= zn.bridge[0] - 1 && k <= zn.bridge[1] + 1;
    const geo = new THREE.IcosahedronGeometry(1.25, 0), im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), N * 2);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), col = new THREE.Color(); let n = 0;
    const greens = [0x2f7a34, 0x3a8c3c, 0x2a6f3a, 0x46993f];
    for (const side of [-1, 1]) for (let k = 0; k < N; k += 2) {
      if (inb(k)) continue; const p = pointAt(C, k, side * (HALF_W + WALL_M + 0.6));
      s3.set(r(0.9, 1.25), r(0.8, 1.15), r(0.9, 1.25)); q.setFromEuler(new THREE.Euler(r(0, 3), r(0, 3), r(0, 3)));
      m4.compose(new THREE.Vector3(p.x, 0.75, p.z), q, s3); im.setMatrixAt(n, m4); im.setColorAt(n, col.setHex(greens[Math.floor(rngW() * 4)])); n++;
    }
    im.count = n; im.castShadow = true; im.receiveShadow = true; add(im);
  }
  // ---- brug: stenen muurtjes + beek ----
  {
    const b0 = zn.bridge[0], b1 = zn.bridge[1], mid = pointAt(C, (b0 + b1) / 2, 0), ang = Math.atan2(mid.tx, mid.tz), len = b1 - b0 + 1;
    const sm = new THREE.MeshStandardMaterial({ map: tex.stone(2, 1), roughness: 1, flatShading: true });
    for (const s of [-1, 1]) {
      const m = mesh(new THREE.BoxGeometry(0.55, 0.95, len), sm, { pos: [0, 0.5, 0] }); const g = new THREE.Group(); g.add(m); m.position.x = s * (HALF_W + 0.55);
      g.position.set(mid.x, 0, mid.z); g.rotation.y = ang; add(g);
      for (const e of [-1, 1]) { const pil = mesh(new THREE.BoxGeometry(0.85, 1.5, 0.85), sm); pil.position.set(s * (HALF_W + 0.55), 0.75, e * len / 2); g.add(pil); const cap = mesh(new THREE.ConeGeometry(0.62, 0.5, 4), mat(0xb5483a), { pos: [s * (HALF_W + 0.55), 1.72, e * len / 2], rot: [0, Math.PI / 4, 0] }); g.add(cap); }
    }
    // beek: lint dat onder de brug doorloopt, naar de vijver in het grasveld
    const pts = [[-70, mid.z - 3], [-52, mid.z + 3], [-38, mid.z - 1], [mid.x, mid.z], [-20, mid.z + 1], [-14, mid.z - 1]];
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], 0, p[1])));
    const sp = curve.getPoints(60), pos = [], uv = [], idx = [];
    sp.forEach((p, i) => { const t = curve.getTangent(i / 60), nx = -t.z, nz = t.x, w = 2.3; pos.push(p.x - nx * w, 0.02, p.z - nz * w, p.x + nx * w, 0.02, p.z + nz * w); uv.push(0, i / 5, 1, i / 5); if (i < sp.length - 1) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); } });
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); wg.setIndex(idx); wg.computeVertexNormals();
    const wt = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#3d9be0'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; const rg = mulberry32(3); for (let i = 0; i < 10; i++) { const x = rg() * w, y = rg() * h; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 8, y - 6, x + 18, y + 6, x + 28, y); g.stroke(); } }, { repeat: [1, 1] });
    const water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ map: wt, roughness: 0.15, metalness: 0.2, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); water.receiveShadow = true; add(water);
    // vijver
    const pondT = wt.clone(); pondT.needsUpdate = true; pondT.repeat.set(3, 3);
    const pond = mesh(new THREE.CircleGeometry(5.2, 24), new THREE.MeshStandardMaterial({ map: pondT, roughness: 0.15, metalness: 0.2 }), { cast: false, pos: [-12, 0.03, mid.z - 1], rot: [-Math.PI / 2, 0, 0] }); add(pond);
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const rk = P.rock(r(0.35, 0.6), 0x8c8e96); rk.position.set(-12 + Math.cos(a) * 5.4, 0, mid.z - 1 + Math.sin(a) * 5.4); add(rk); }
    const lily = [[-10, 1], [-14, -2], [-12, 2.5]]; for (const [dx, dz] of lily) add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 8), mat(0x4aa84a), { cast: false, pos: [dx, 0.07, mid.z + dz] }));
    upd.push((t) => { wt.offset.y = -t * 0.5; pondT.offset.x = t * 0.05; pondT.offset.y = t * 0.03; });
    // vissenbord
    const sg = P.signpost(['Beek'], 2); sg.position.set(mid.x + 7, 0, mid.z - 5.5); sg.rotation.y = 0.3; add(sg);
  }

  // ---- startlijn + poort ----
  {
    const s = pointAt(C, 0, 0), ang = Math.atan2(s.tx, s.tz);
    const grp = new THREE.Group(); grp.position.set(s.x, 0, s.z); grp.rotation.y = ang; add(grp);
    const line = mesh(new THREE.PlaneGeometry(HALF_W * 2, 1.2), new THREE.MeshBasicMaterial({ map: checkerTexture(10), polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), { cast: false, pos: [0, 0.11, 0], rot: [-Math.PI / 2, 0, Math.PI / 2] });
    // de vlak ligt in x-richting van de weg: drehen zodat de lange kant dwars over de weg ligt
    line.rotation.set(-Math.PI / 2, 0, 0); line.scale.set(1, 1, 1); grp.add(line);
    const wood = mat(0x6b4a2e), stone = mat(0x9b9ca3);
    for (const sx of [-1, 1]) { grp.add(mesh(new THREE.BoxGeometry(0.8, 6.5, 0.8), mat(0x9b9ca3), { pos: [sx * (HALF_W + 1.2), 3.25, 0] })); grp.add(mesh(new THREE.ConeGeometry(0.75, 1.1, 4), mat(0xb5483a), { pos: [sx * (HALF_W + 1.2), 7.0, 0], rot: [0, Math.PI / 4, 0] })); }
    grp.add(mesh(new THREE.BoxGeometry(HALF_W * 2 + 3, 1.7, 0.5), new THREE.MeshStandardMaterial({ map: tex.sign('START  •  FINISH', { w: 512, h: 96, size: 52, bg: '#2a2a3a', fg: '#ffe14a', border: '#e8c24a' }), roughness: 0.8 }), { pos: [0, 6.3, 0] }));
    grp.add(mesh(new THREE.BoxGeometry(HALF_W * 2 + 3, 0.5, 0.52), new THREE.MeshStandardMaterial({ map: checkerTexture(24) }), { pos: [0, 5.2, 0] }));
    // vlaggetjes langs de start
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) { const bn = P.banner(i % 2 ? 0x3a78e0 : 0x2f9e5b, 2.6, 0.9); bn.position.set(sx * (HALF_W + 3.6), 0, -3 - i * 6); bn.rotation.y = sx > 0 ? 0 : Math.PI; add(bn); bn.parent !== scene && scene.add(bn); upd.push((t) => P.animateBanner(bn, t)); }
    grp.position.set(s.x, 0, s.z);
  }

  // ---- schans ----
  {
    const z = C.zones.ramp, i1 = z[1], p1 = pointAt(C, i1, 0), p0 = pointAt(C, z[0], 0), len = Math.hypot(p1.x - p0.x, p1.z - p0.z), H = 1.05;
    const mid = pointAt(C, (z[0] + z[1]) / 2, 0), ang = Math.atan2(mid.tx, mid.tz);
    const g = new THREE.Group(); g.position.set(mid.x, 0, mid.z); g.rotation.y = ang; add(g);
    const slope = Math.atan2(H, len);
    const slab = mesh(new THREE.BoxGeometry(HALF_W * 2 - 0.6, 0.25, len / Math.cos(slope)), new THREE.MeshStandardMaterial({ map: chevronTex('#d8372c', '#ffe14a'), roughness: 0.8 }), { pos: [0, H / 2, 0], rot: [-slope, 0, 0] }); g.add(slab);
    for (const sx of [-1, 1]) { const shp = new THREE.Shape(); shp.moveTo(0, 0); shp.lineTo(len, 0); shp.lineTo(len, H); shp.lineTo(0, 0); const side = mesh(new THREE.ExtrudeGeometry(shp, { depth: 0.3, bevelEnabled: false }), mat(0x6b4a2e)); side.rotation.y = -Math.PI / 2; side.position.set(sx * (HALF_W - 0.45) + (sx > 0 ? 0.15 : -0.15), 0, -len / 2); g.add(side); }
    // tegen botsen met de kleuren: twee fakkels
    for (const sx of [-1, 1]) { const f = mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.6, 6), mat(0x5b3d24), { pos: [sx * (HALF_W + 0.9), 0.8, len / 2] }); g.add(f); const fl = mesh(new THREE.ConeGeometry(0.25, 0.7, 6), new THREE.MeshBasicMaterial({ color: 0xffa020 }), { cast: false, pos: [sx * (HALF_W + 0.9), 1.9, len / 2] }); g.add(fl); upd.push((t) => { fl.scale.y = 1 + Math.sin(t * 14 + sx) * 0.2; }); }
  }

  // ---- kasteel in het grasveld (rechts-midden) ----
  const keep = new THREE.Group(); keep.position.set(8.5, 0, -6.2); add(keep);
  {
    const sm = new THREE.MeshStandardMaterial({ map: tex.stone(4, 1), roughness: 1, flatShading: true });
    keep.add(mesh(new THREE.BoxGeometry(11, 4.2, 4), sm, { pos: [0, 2.1, 0] }));
    for (let i = 0; i < 9; i++) keep.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 4.2), sm, { pos: [-5 + i * 1.25, 4.6, 0] }));
    for (const sx of [-1, 1]) { const t = P.tower(8.5, 1.5); t.position.set(sx * 6.2, 0, 0); keep.add(t); const bn = P.banner(sx > 0 ? 0x3a78e0 : 0x2f9e5b, 2.2, 1.2); bn.position.set(sx * 6.2, 12.4, 0); keep.add(bn); upd.push((t2) => P.animateBanner(bn, t2 + sx)); }
    const mid = P.tower(11, 1.7); mid.position.set(0, 4.2, -0.4); mid.scale.set(1, 1, 1); keep.add(mid);
    const gate = mesh(new THREE.BoxGeometry(2.2, 2.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 1 }), { pos: [0, 1.4, 2.05] }); keep.add(gate);
    keep.add(mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.4, 10, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x3a2412 }), { pos: [0, 2.8, 2.05], rot: [Math.PI / 2, 0, 0] }));
    for (const sx of [-1, 1]) keep.add(mesh(new THREE.BoxGeometry(0.7, 1.0, 0.15), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa838, emissiveIntensity: 0.7 }), { cast: false, pos: [sx * 3, 2.6, 2.05] }));
  }
  // windmolen in de linker-uitsparing van de bocht, toren (poorthuis) in de rechter
  const wm = P.windmill(0.7); wm.position.set(6, 0, 11); add(wm);
  upd.push((t) => { wm.userData.blades.rotation.z = t * 0.8; });
  { const t = P.tower(9, 1.6); t.position.set(-12, 0, -11.5); add(t); const bn = P.banner(0xd8372c, 2.4, 1.2); bn.position.set(-12, 10.5, -11.5); add(bn); upd.push((t2) => P.animateBanner(bn, t2)); }

  // ---- achterwand: kasteelmuur + torens + bergen ----
  {
    const sm = new THREE.MeshStandardMaterial({ map: tex.stone(18, 2), roughness: 1, flatShading: true });
    const wall = mesh(new THREE.BoxGeometry(150, 8, 2.4), sm, { pos: [0, 4, -36] }); add(wall);
    const cren = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.2, 2.6), sm, 90); const m4 = new THREE.Matrix4();
    for (let i = 0; i < 90; i++) { m4.makeTranslation(-74 + i * 1.66, 8.6, -36); cren.setMatrixAt(i, m4); } cren.castShadow = true; add(cren);
    [-60, -30, 0, 30, 60].forEach((x, i) => { const t = P.tower(13 + (i % 2) * 4, 2.6); t.position.set(x, 0, -37); add(t); const bn = P.banner([0xd8372c, 0x3a78e0, 0xe8c24a, 0x2f9e5b, 0xb04aa0][i], 2.6, 1.3); bn.position.set(x, 13 + (i % 2) * 4 + 6.2, -37); add(bn); upd.push((t2) => P.animateBanner(bn, t2 + i)); });
    // grote poort in het midden
    add(mesh(new THREE.BoxGeometry(7, 7, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 1 }), { pos: [15, 3.5, -34.7] }));
    const mt = mat(0x7f8aa0), sn = mat(0xf2f6ff);
    [[-70, -105, 26], [-30, -118, 34], [20, -112, 30], [60, -104, 24], [100, -96, 22]].forEach(([x, z, h]) => { const c = mesh(new THREE.ConeGeometry(h * 0.9, h, 6), mt, { cast: false, pos: [x, h / 2 - 1, z] }); add(c); add(mesh(new THREE.ConeGeometry(h * 0.33, h * 0.36, 6), sn, { cast: false, pos: [x, h * 0.83 - 1, z] })); });
    const cl = []; for (let i = 0; i < 5; i++) { const c = P.cloud(2.2); c.position.set(-60 + i * 30, r(26, 38), -70); add(c); cl.push(c); }
    upd.push((t) => cl.forEach((c, i) => { c.position.x = ((c.position.x + 70 + 0.4 * 0.016) % 150) - 70; }));
  }

  // ---- tribune met toeschouwers (achter de bovenrechte) ----
  const crowd = [];
  {
    const wm2 = new THREE.MeshStandardMaterial({ map: tex.planks(4, 1, '#8a5e36'), roughness: 0.9 });
    for (let row = 0; row < 3; row++) add(mesh(new THREE.BoxGeometry(26, 0.9, 1.6), wm2, { pos: [12, 0.45 + row * 0.9, -24.2 - row * 1.6] }));
    const kinds = ['jester', 'baker', 'guard', 'kid', 'princess', 'farmer', 'witch', 'dwarf', 'bard', 'captain'];
    for (let i = 0; i < 9; i++) {
      const c = makeNPC(kinds[i % kinds.length]); const row = i % 3; c.group.position.set(1 + i * 2.6 + (row ? 0.8 : 0), 0.9 * (row + 1) + 0.0, -24.2 - row * 1.6 + 0.0); c.group.scale.setScalar(0.95);
      c.pose = 'cheer'; c.faceDir(0, 1); c.t = i * 0.9; add(c.group); crowd.push(c);
    }
    for (let i = 0; i < 3; i++) { const bn = P.banner([0xd8372c, 0xe8c24a, 0x3a78e0][i], 2.4, 1.0); bn.position.set(0.5 + i * 12.5, 2.7, -28); add(bn); upd.push((t) => P.animateBanner(bn, t + i * 2)); }
  }

  // ---- bomen, rotsen en bloemen (instanced) ----
  {
    const near = (x, z, d) => { for (let k = 0; k < N; k += 3) { if (Math.hypot(C.X[k] - x, C.Z[k] - z) < d) return true; } return false; };
    const ok = (x, z) => !near(x, z, 11) && !(Math.abs(x - 8.5) < 10 && Math.abs(z + 6) < 7) && !(Math.hypot(x + 12, z - 6) < 9) && !(z < -21 && z > -40 && x > -2 && x < 28);
    const spots = []; let tries = 0;
    while (spots.length < 78 && tries++ < 4000) { const x = r(-78, 78), z = r(-30, 42); if (Math.abs(x) < 36 && z > -22 && z < 22 && near(x, z, 15)) continue; if (ok(x, z) && z > -33) spots.push([x, z]); }
    // infield-bomen op een paar vaste plekken
    [[-23, 8], [-20, -1], [20, 8], [18, -1], [-4, 0], [2, -2]].forEach((p) => { if (!near(p[0], p[1], 9)) spots.push(p); });
    const nT = spots.length, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 6), mat(0x6b4a2e), nT), lf1 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.0, 1), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), nT), lf2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), nT);
    const m4 = new THREE.Matrix4(), col = new THREE.Color(), greens = [0x3f9e3a, 0x2f8a4a, 0x56a83a, 0x2e7a3a, 0x7ab83a, 0xd88a3a];
    spots.forEach(([x, z], i) => {
      const s = r(0.8, 1.5); m4.compose(new THREE.Vector3(x, 1.3 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); trunk.setMatrixAt(i, m4);
      m4.compose(new THREE.Vector3(x, 3.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 0.9, s)); lf1.setMatrixAt(i, m4); lf1.setColorAt(i, col.setHex(greens[Math.floor(rngW() * greens.length)]));
      m4.compose(new THREE.Vector3(x + 0.8 * s, 4.7 * s, z + 0.3 * s), new THREE.Quaternion(), new THREE.Vector3(s, s, s)); lf2.setMatrixAt(i, m4); lf2.setColorAt(i, col);
    });
    for (const m of [trunk, lf1, lf2]) { m.castShadow = true; m.receiveShadow = true; add(m); }
    // bloemen
    const nF = 160, fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.18, 5, 4), new THREE.MeshStandardMaterial({ roughness: 0.8 }), nF); let f = 0; const fcols = [0xff6fa5, 0xffe14a, 0xffffff, 0x8fb8ff, 0xff8a3a];
    while (f < nF) { const k = Math.floor(rngW() * N), side = rngW() < 0.5 ? -1 : 1, p = pointAt(C, k, side * (HALF_W + WALL_M + r(2.2, 6))); m4.makeTranslation(p.x, 0.2, p.z); fl.setMatrixAt(f, m4); fl.setColorAt(f, col.setHex(fcols[Math.floor(rngW() * fcols.length)])); f++; }
    add(fl);
  }
  // fakkels langs het circuit (zonder licht)
  { for (let k = 6; k < N; k += 22) { const p = pointAt(C, k, (k % 44 ? 1 : -1) * (HALF_W + WALL_M + 1.3)); const lp = P.lampPost(0xffc060); lp.position.set(p.x, 0, p.z); add(lp); } }

  return {
    update(t, dt) { for (const f of upd) f(t, dt); for (const c of crowd) { c.update(dt); } },
    crowd,
    cheerCrowd() { for (const c of crowd) c.pose = 'cheer'; },
  };
}

// ---------------- de kart zelf ----------------
export function makeKartModel(color) {
  const g = new THREE.Group(), tilt = new THREE.Group(); g.add(tilt);
  const col = mat(color, { flatShading: false, roughness: 0.55 }), dark = mat(0x2a2a34, { roughness: 0.6 }), white = mat(0xf4f0e6), chrome = mat(0xc9ced8, { metalness: 0.7, roughness: 0.3 });
  const add = (m) => { tilt.add(m); return m; };
  add(mesh(new THREE.BoxGeometry(1.35, 0.28, 2.5), dark, { pos: [0, 0.38, 0] }));
  add(mesh(new THREE.BoxGeometry(1.5, 0.5, 1.7), col, { pos: [0, 0.72, -0.15] }));
  const nose = add(mesh(new THREE.CylinderGeometry(0.4, 0.68, 1.1, 4), col, { pos: [0, 0.62, 1.25], rot: [Math.PI / 2, Math.PI / 4, 0], scale: [1, 1, 0.65] }));
  add(mesh(new THREE.BoxGeometry(1.6, 0.18, 0.28), chrome, { pos: [0, 0.4, 1.85] }));
  add(mesh(new THREE.BoxGeometry(0.18, 0.06, 1.7), white, { pos: [0, 1.0, -0.15] }));
  add(mesh(new THREE.BoxGeometry(1.1, 0.55, 0.7), dark, { pos: [0, 0.9, -1.0] }));
  for (const sx of [-1, 1]) add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8), chrome, { pos: [sx * 0.35, 0.78, -1.55], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), dark, { pos: [sx * 0.6, 1.3, -1.25] }));
  add(mesh(new THREE.BoxGeometry(1.8, 0.1, 0.55), col, { pos: [0, 1.6, -1.3] }));
  add(mesh(new THREE.BoxGeometry(0.85, 0.3, 0.7), mat(0x4a3220), { pos: [0, 0.95, -0.25] }));
  const sw = add(mesh(new THREE.TorusGeometry(0.2, 0.04, 5, 12), dark, { pos: [0, 1.28, 0.55], rot: [-0.9, 0, 0] }));
  add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5), dark, { pos: [0, 1.1, 0.45], rot: [0.6, 0, 0] }));
  // antenne + wimpel
  add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 4), dark, { pos: [0.6, 1.9, -1.0] }));
  const flag = mesh(new THREE.ConeGeometry(0.25, 0.7, 3), col, { cast: false, pos: [0.6, 2.7, -1.3], rot: [-Math.PI / 2, 0, 0] }); add(flag);
  // wielen
  const wheels = [];
  for (const [sx, sz, rad, front] of [[-1, 0.95, 0.42, true], [1, 0.95, 0.42, true], [-1, -0.9, 0.5, false], [1, -0.9, 0.5, false]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.88, rad, sz); tilt.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = mesh(new THREE.CylinderGeometry(rad, rad, 0.42, 12), mat(0x1c1c22, { roughness: 1 }), { rot: [0, 0, Math.PI / 2] }); spin.add(tire);
    spin.add(mesh(new THREE.CylinderGeometry(rad * 0.55, rad * 0.55, 0.45, 8), white, { cast: false, rot: [0, 0, Math.PI / 2] }));
    spin.add(mesh(new THREE.BoxGeometry(0.47, 0.12, rad * 0.9), col, { cast: false }));
    wheels.push({ pivot, spin, front });
  }
  // vlammen
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = [-1, 1].map((sx) => { const f = mesh(new THREE.ConeGeometry(0.22, 1.4, 6), flameM, { cast: false, pos: [sx * 0.35, 0.78, -2.25], rot: [-Math.PI / 2, 0, 0] }); f.visible = false; tilt.add(f); return f; });
  return { root: g, tilt, wheels, flames, flameM, flag, sw, nose };
}
