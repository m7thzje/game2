import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, fbm, mulberry32, TAU } from '../engine/util.js';
import { makeBrother, PLAYER_COLORS } from '../engine/chars.js';

// Omgeving en onderdelen van "Mijnkar-Race": kristalmijn-tunnel die voorbij schuift (bochten/hellingen via vertex-vervorming),
// twee spoorbanen met elk 3 rails, mijnkarren, hindernissen (vonkjes, rotsen, gaten, turbo-pads, vuur, brokkelmuur).

export const LANES = 3;
export const LANE_X = [[-7, -5, -3], [3, 5, 7]];
export const laneX = (p, l) => LANE_X[p][l];
export const NS = 44, S0 = -14, SEG = 2.5;    // strips: NS segmenten van SEG meter, beginnend bij s = S0 (achter de kar)
export const VIEW = S0 + NS * SEG;             // ~96 m vooruit

// ---------------- teksturen ----------------
function rockTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      // herhalend via sin-ruis (tegelbaar)
      const u = x / w * TAU, v = y / h * TAU;
      const n = fbm(Math.cos(u) * 2.2 + 5, Math.sin(u) * 2.2 + Math.cos(v) * 2.2 + 3, 4) * 0.5 + 0.5 + fbm(Math.sin(v) * 3 + 9, Math.cos(v) * 3 + Math.sin(u) * 3, 3) * 0.3;
      const k = clamp(n, 0, 1);
      const i = (y * w + x) * 4;
      img.data[i] = 62 + k * 80; img.data[i + 1] = 52 + k * 64; img.data[i + 2] = 104 + k * 110; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const r = mulberry32(12);
    // gloeiende kristaladers
    for (let i = 0; i < 26; i++) {
      const hue = [180, 290, 150, 320][i % 4]; g.strokeStyle = `hsla(${hue},90%,${60 + r() * 20}%,${0.35 + r() * 0.4})`; g.lineWidth = 1 + r() * 2.4; g.lineCap = 'round';
      let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 90; y += (r() - 0.5) * 90; g.lineTo(x, y); } g.stroke();
    }
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(210,230,255,${0.1 + r() * 0.3})`; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [1, 1] });
}
function floorTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(3);
    g.fillStyle = '#3a3050'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { const l = 50 + r() * 50; g.fillStyle = `rgb(${l},${l - 4},${l + 22})`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 5); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(160,210,255,.25)'; g.fillRect(r() * w, r() * h, 2, 2); }
  });
}
function sleeperTex() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#251e2e'; g.fillRect(0, 0, w, h);
    // een dwarsligger per tegel (herhaling = 1.6 m)
    g.fillStyle = '#8a5c34'; g.fillRect(6, 38, w - 12, 50);
    g.fillStyle = '#6a4424'; g.fillRect(6, 38, w - 12, 8); g.fillRect(6, 82, w - 12, 6);
    g.strokeStyle = 'rgba(40,20,5,.5)'; g.lineWidth = 1.5; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(10, 50 + k * 9); g.lineTo(w - 10, 50 + k * 9 + (k % 2 ? 2 : -2)); g.stroke(); }
    g.fillStyle = '#d0c8b8'; for (const x of [20, w - 20]) { g.beginPath(); g.arc(x, 63, 4, 0, TAU); g.fill(); }
  });
}
function padTex() {
  return canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(0,255,200,0.15)'); gr.addColorStop(1, 'rgba(60,200,255,0.5)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 3; k++) {
      const y = 190 - k * 70;
      g.strokeStyle = k === 2 ? '#ffffff' : k === 1 ? '#a8fff0' : '#5cf0d0'; g.lineWidth = 16; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(14, y + 36); g.lineTo(w / 2, y); g.lineTo(w - 14, y + 36); g.stroke();
    }
    g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
}
export function warnTex(kind = 'fire') {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffd23a'; g.strokeStyle = '#3a1000'; g.lineWidth = 9; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(64, 10); g.lineTo(120, 112); g.lineTo(8, 112); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#c4161c'; g.beginPath(); g.moveTo(64, 38); g.bezierCurveTo(92, 66, 90, 100, 64, 102); g.bezierCurveTo(38, 100, 36, 70, 52, 56); g.bezierCurveTo(54, 66, 60, 68, 64, 38); g.fill();
    g.fillStyle = '#ff9a1c'; g.beginPath(); g.moveTo(64, 66); g.bezierCurveTo(76, 80, 76, 98, 64, 98); g.bezierCurveTo(52, 96, 52, 82, 64, 66); g.fill();
  });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
function pitTex() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#05030a'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, 5, w / 2, h / 2, h * 0.55); gr.addColorStop(0, 'rgba(255,120,30,.95)'); gr.addColorStop(0.4, 'rgba(180,40,20,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#05030a'; g.beginPath(); g.moveTo(0, 0);
    for (let x = 0; x <= w; x += 12) g.lineTo(x, 8 + ((x / 12) % 2) * 9); g.lineTo(w, 0); g.fill();
    g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 12) g.lineTo(x, h - 8 - ((x / 12) % 2) * 9); g.lineTo(w, h); g.fill();
  });
}
function wallTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(21);
    g.fillStyle = '#4a3a2a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.2})`; g.fillRect(r() * w, r() * h, 6 + r() * 40, 2 + r() * 6); }
    for (let i = 0; i < 400; i++) { const l = 50 + r() * 50; g.fillStyle = `rgba(${l},${l - 12},${l - 30},0.4)`; g.fillRect(r() * w, r() * h, 2 + r() * 4, 2 + r() * 4); }
    g.strokeStyle = '#2a1a0c'; g.lineWidth = 6; g.strokeRect(0, 0, w, h);
  });
}

// ---------------- bocht/helling ----------------
export function makeBend() {
  const B = { cx: 0, ky: 0, t: 0 };
  B.update = (t, intensity = 1) => {
    B.t = t;
    B.cx = (0.0036 * Math.sin(t * 0.21) + 0.0017 * Math.sin(t * 0.47 + 1.3)) * intensity;
    B.ky = (0.0013 * Math.sin(t * 0.16 + 0.6) + 0.0009 * Math.sin(t * 0.39 + 2.1)) * intensity;
  };
  B.bx = (s) => 0.5 * B.cx * s * s;
  B.hy = (s) => 0.5 * B.ky * s * s;
  return B;
}

// ---------------- strips (vervormde linten) ----------------
function makeStrip(halfW, color, { map = null, emissive = 0x000000, emi = 0, metal = 0, rough = 0.8, repU = 1, cols = 1, transparent = false, normal = [0, 1, 0] } = {}) {
  const nv = (NS + 1) * (cols + 1), pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), nor = new Float32Array(nv * 3), idx = [];
  for (let k = 0; k < nv; k++) { nor[k * 3] = normal[0]; nor[k * 3 + 1] = normal[1]; nor[k * 3 + 2] = normal[2]; }
  for (let j = 0; j <= NS; j++) for (let c = 0; c <= cols; c++) { uv[(j * (cols + 1) + c) * 2] = c / cols * repU; }
  for (let j = 0; j < NS; j++) for (let c = 0; c < cols; c++) { const a = j * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1; idx.push(a, b, d, b, e, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setIndex(idx);
  const m = new THREE.MeshStandardMaterial({ color, map, emissive, emissiveIntensity: emi, metalness: metal, roughness: rough, side: THREE.DoubleSide, transparent, flatShading: false });
  const s = new THREE.Mesh(g, m); s.frustumCulled = false; s.receiveShadow = false; s.userData = { halfW, cols };
  return s;
}
// Zet de strip: middelpunt x0, y0 (+ bend), z-referentie z0 (cart), afstand d (voor uv), uvScale
function setStrip(S, B, x0, y0, z0, d, vScale, bendX = 1, bendY = 1, halfW = null, dx = 0) {
  const g = S.geometry, p = g.attributes.position.array, uv = g.attributes.uv.array, cols = S.userData.cols, hw = halfW ?? S.userData.halfW;
  for (let j = 0; j <= NS; j++) {
    const s = S0 + j * SEG; const bx = B.bx(s) * bendX, hy = B.hy(s) * bendY;
    for (let c = 0; c <= cols; c++) {
      const k = j * (cols + 1) + c; const x = x0 + dx + bx + (c / cols - 0.5) * 2 * hw;
      p[k * 3] = x; p[k * 3 + 1] = y0 + hy; p[k * 3 + 2] = z0 - s;
      uv[k * 2 + 1] = (d + s) * vScale;
    }
  }
  g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
}

function setProfile(S, B, prof, d, zc, vs) {
  const g = S.geometry, p = g.attributes.position.array, uv = g.attributes.uv.array, cols = S.userData.cols;
  for (let j = 0; j <= NS; j++) {
    const s = S0 + j * SEG; const bx = B.bx(s), hy = B.hy(s);
    for (let c = 0; c <= cols; c++) { const k = j * (cols + 1) + c; p[k * 3] = prof[c][0] + bx; p[k * 3 + 1] = prof[c][1] + hy; p[k * 3 + 2] = zc - s; uv[k * 2 + 1] = (d + s) * vs; }
  }
  g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
}

// ---------------- kar ----------------
export function makeCart(i) {
  const g = new THREE.Group(); const inner = new THREE.Group(); g.add(inner);
  const wood = mat(0x8a5a30), dark = mat(0x3a2412), metal = mat(0x7d8696, { metalness: 0.7, roughness: 0.4 }), col = mat(PLAYER_COLORS[i]);
  // bak
  inner.add(mesh(new THREE.BoxGeometry(1.7, 0.18, 2.3), dark, { pos: [0, 0.38, 0] }));
  inner.add(mesh(new THREE.BoxGeometry(0.14, 0.95, 2.3), wood, { pos: [-0.8, 0.85, 0] }));
  inner.add(mesh(new THREE.BoxGeometry(0.14, 0.95, 2.3), wood, { pos: [0.8, 0.85, 0] }));
  inner.add(mesh(new THREE.BoxGeometry(1.7, 0.95, 0.14), wood, { pos: [0, 0.85, -1.08] }));
  inner.add(mesh(new THREE.BoxGeometry(1.7, 0.95, 0.14), wood, { pos: [0, 0.85, 1.08] }));
  for (const z of [-0.5, 0.5]) inner.add(mesh(new THREE.BoxGeometry(1.78, 0.14, 0.12), metal, { pos: [0, 0.6, z] }));
  inner.add(mesh(new THREE.BoxGeometry(1.84, 0.12, 2.38), col, { pos: [0, 1.34, 0] }));
  for (const sx of [-1, 1]) { inner.add(mesh(new THREE.BoxGeometry(0.05, 0.26, 1.2), col, { pos: [sx * 0.88, 0.9, 0], cast: false })); }
  // wielen
  const wheels = [];
  for (const sx of [-1, 1]) for (const z of [-0.78, 0.78]) {
    const w = new THREE.Group(); w.position.set(sx * 0.78, 0.3, z); inner.add(w);
    w.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), metal, { rot: [0, 0, Math.PI / 2] }));
    w.add(mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), mat(0xffd27a), { cast: false, pos: [sx * 0.1, 0, 0] }));
    wheels.push(w);
  }
  // voorlamp met kristal
  const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: i ? 0x6fd0ff : 0x7dffa0, emissiveIntensity: 1.2 })); lamp.position.set(0, 1.1, -1.25); lamp.scale.y = 1.5; inner.add(lamp);
  const flag = new THREE.Group(); flag.position.set(0.7, 1.3, 0.9); inner.add(flag);
  flag.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5), mat(0x444444), { pos: [0, 0.55, 0], cast: false }));
  const cloth = mesh(new THREE.BoxGeometry(0.02, 0.32, 0.55), col, { pos: [0, 1.0, 0.28], cast: false }); flag.add(cloth);
  // poppetje
  const c = makeBrother(i); c.group.position.set(0, 0.35, 0.05); c.group.scale.setScalar(0.92); inner.add(c.group); c.pose = 'push';
  g.userData = { inner, wheels, c, lamp, flag, cloth };
  return g;
}

// ---------------- obstakelmodellen ----------------
export function makeSpark() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x58e0ff, emissiveIntensity: 1.6, flatShading: true })); g.add(core);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 0), new THREE.MeshBasicMaterial({ color: 0x78e8ff, transparent: true, opacity: 0.28, wireframe: true })); g.add(shell);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x7ae8ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(3.6, 3.6, 1); g.add(glow);
  const bolts = []; for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.08, 1.7, 3), new THREE.MeshBasicMaterial({ color: 0xffffff })); b.userData.a = k * 2.1; g.add(b); bolts.push(b); }
  g.userData = { core, shell, glow, bolts };
  return g;
}
export function makeRock() {
  const g = new THREE.Group();
  const swing = new THREE.Group(); g.add(swing);
  swing.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 5), mat(0x555a66, { metalness: 0.6 }), { cast: false, pos: [0, -0.5, 0] }));   // ketting (schaalt in y)
  const rock = new THREE.Group(); swing.add(rock);
  rock.add(mesh(new THREE.DodecahedronGeometry(1.15, 0), mat(0x6c6478), { cast: false, scale: [1, 0.92, 1] }));
  for (let k = 0; k < 4; k++) { const a = k * 1.6 + 0.4; rock.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 5), new THREE.MeshStandardMaterial({ color: [0xff6fd8, 0x6fe8ff, 0xa0ff8a, 0xffe14a][k], emissive: [0xff2aa8, 0x1ab8e0, 0x4ad04a, 0xd0a000][k], emissiveIntensity: 0.9, flatShading: true }), { cast: false, pos: [Math.cos(a) * 0.9, 0.4 - k * 0.2, Math.sin(a) * 0.9], rot: [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2] })); }
  rock.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [-0.35, 0.2, 1.05] }));
  rock.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [0.35, 0.2, 1.05] }));
  rock.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [-0.35, 0.2, 1.15] }));
  rock.add(mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [0.35, 0.2, 1.15] }));
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.08; g.add(shadow);
  g.userData = { swing, rock, chain: swing.children[0], shadow };
  return g;
}
export function makePit() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1), new THREE.MeshBasicMaterial({ map: pitTex(), transparent: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.09; g.add(m);
  const lipM = mat(0x6a4a2a);
  const l1 = mesh(new THREE.BoxGeometry(2.1, 0.22, 0.3), lipM, { cast: false, pos: [0, 0.1, 0] }), l2 = mesh(new THREE.BoxGeometry(2.1, 0.22, 0.3), lipM, { cast: false, pos: [0, 0.1, 0] });
  g.add(l1, l2);
  const warn = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.5), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.55, depthWrite: false })); warn.rotation.x = -Math.PI / 2; warn.position.y = 0.11; g.add(warn);
  g.userData = { plane: m, l1, l2, warn };
  return g;
}
export function makePad() {
  const g = new THREE.Group();
  const t = padTex();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 4.2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.95, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.position.y = 0.1; g.add(m);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0x5cf0d0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(4.5, 2.4, 1); glow.position.y = 0.5; g.add(glow);
  g.userData = { plane: m, tex: t };
  return g;
}
export function makeFire() {
  const g = new THREE.Group();
  const flames = [];
  for (let k = 0; k < 7; k++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 6), new THREE.MeshBasicMaterial({ color: k % 2 ? 0xffd23a : 0xff7a1a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    f.position.set((Math.random() - 0.5) * 1.3, 1.2, (k - 3) * 1.4); f.userData.ph = Math.random() * 6; g.add(f); flames.push(f);
  }
  const base = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 10.5), new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); base.rotation.x = -Math.PI / 2; base.position.y = 0.1; g.add(base);
  const warn = new THREE.Sprite(new THREE.SpriteMaterial({ map: warnTex(), transparent: true, depthTest: false })); warn.scale.set(2.2, 2.2, 1); warn.position.y = 3.2; warn.renderOrder = 18; g.add(warn);
  g.userData = { flames, base, warn };
  return g;
}
export function makeWall() {
  const g = new THREE.Group();
  const rockM = mat(0x5e566c);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    const r = mesh(new THREE.DodecahedronGeometry(0.62 + ((a + b) % 2) * 0.1, 0), rockM, { cast: false, pos: [(a - 1) * 0.62, 0.5 + b * 0.95, ((a + b) % 2) * 0.12], scale: [1, 0.95, 0.7] }); r.rotation.set(a, b, a + b); g.add(r);
  }
  const vein = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  for (let k = 0; k < 5; k++) g.add(mesh(new THREE.BoxGeometry(0.1, 1.0, 0.05), vein, { cast: false, pos: [(k - 2) * 0.5, 0.8 + (k % 3) * 0.7, 0.5], rot: [0, 0, 0.5 - k * 0.3] }));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.8), new THREE.MeshBasicMaterial({ map: canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#2a1a08'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffd23a'; c.lineWidth = 6; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = '#ffd23a'; c.font = 'bold 44px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('SNELWEG ⚡', w / 2, h / 2 + 2); }) }));
  sign.position.set(0, 3.7, 0.2); g.add(sign);
  g.userData = { sign };
  return g;
}

// ---------------- hele wereld ----------------
export function buildMine(ctx, rng) {
  const { scene } = ctx;
  const B = makeBend();
  const M = { B, tracks: [], decor: {}, fx: [] };
  scene.fog = new THREE.Fog(0x140c2a, 38, 125);
  scene.background = new THREE.Color(0x0e0820);

  // vloer, muren, plafond
  const fT = floorTex(); fT.wrapS = fT.wrapT = THREE.RepeatWrapping;
  const wT = rockTex(); wT.wrapS = wT.wrapT = THREE.RepeatWrapping;
  const FLOOR_P = [[-32, -0.04], [-12, -0.04], [-4, -0.04], [0, -0.04], [4, -0.04], [12, -0.04], [32, -0.04]];
  const WALL_L = [[-17.5, -1], [-17.2, 4], [-16.2, 9], [-14.8, 13], [-13, 16]], WALL_R = WALL_L.map(([x, y]) => [-x, y]).reverse().reverse();
  const CEIL_P = [[-13, 16], [-7, 14.4], [0, 13.8], [7, 14.4], [13, 16]];
  const floor = makeStrip(30, 0xffffff, { map: fT, rough: 1, cols: 6, repU: 10 }); scene.add(floor); M.floor = floor;
  const wallL = makeStrip(9, 0xffffff, { map: wT, rough: 1, cols: 4, repU: 3, normal: [-0.9, 0.2, 0] }); const wallR = makeStrip(9, 0xffffff, { map: wT, rough: 1, cols: 4, repU: 3, normal: [-0.9, 0.2, 0] }); const ceil = makeStrip(22, 0xffffff, { map: wT, rough: 1, cols: 4, repU: 4, normal: [0, 1, 0] });
  scene.add(wallL, wallR, ceil); M.walls = { wallL, wallR, ceil };
  // dubbele muur vormen (verticaal): we gebruiken de strips als kolommen met eigen x/y-verloop in setWalls

  // sporen
  const sleeperT = sleeperTex(); sleeperT.wrapS = sleeperT.wrapT = THREE.RepeatWrapping;
  const railM = { color: 0xcfd6e6, metal: 0.85, rough: 0.28, emissive: 0x4a5a78, emi: 0.35 };
  for (let p = 0; p < 2; p++) {
    const slots = [];
    for (let l = 0; l < LANES; l++) {
      const sl = makeStrip(0.86, 0xffffff, { map: sleeperT, rough: 0.9, repU: 1 }); scene.add(sl);
      const r1 = makeStrip(0.07, railM.color, railM), r2 = makeStrip(0.07, railM.color, railM); scene.add(r1, r2);
      slots.push({ sl, r1, r2 });
    }
    M.tracks.push(slots);
  }
  // scheidingsrichel in het midden (lage rotswand met kristallen)
  const ridgeM = { rough: 0.9, emissive: 0x2a1850, emi: 0.5, cols: 1 };
  const ridgeL = makeStrip(1, 0x7a6aa0, { ...ridgeM, normal: [-0.8, 0.6, 0] }), ridgeR = makeStrip(1, 0x7a6aa0, { ...ridgeM, normal: [-0.8, -0.6, 0] }), ridgeTop = makeStrip(1, 0x8a78c0, { ...ridgeM, cols: 1 });
  scene.add(ridgeL, ridgeR, ridgeTop);
  // ---- geïnstantieerd decor ----
  const N_CRY = 110, N_BOUL = 70, N_STAL = 70, N_BEAM = 9;
  const mkInst = (geo, material, n) => { const im = new THREE.InstancedMesh(geo, material, n); im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); return im; };
  const cryGeo = new THREE.ConeGeometry(0.5, 2.4, 5); cryGeo.translate(0, 1.2, 0);
  const cry = mkInst(cryGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), N_CRY);
  const boul = mkInst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x6a5e86, roughness: 1, flatShading: true }), N_BOUL);
  const stalGeo = new THREE.ConeGeometry(0.6, 3.2, 5); stalGeo.translate(0, -1.6, 0);
  const stal = mkInst(stalGeo, new THREE.MeshStandardMaterial({ color: 0x5a4e78, roughness: 1, flatShading: true }), N_STAL);
  const post = mkInst(new THREE.BoxGeometry(0.5, 11, 0.5), mat(0x6a4426), N_BEAM * 2);
  const beam = mkInst(new THREE.BoxGeometry(23.5, 0.6, 0.6), mat(0x7a4e2c), N_BEAM);
  const lamps = mkInst(new THREE.SphereGeometry(0.34, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc060 }), N_BEAM * 2);
  const lampGlow = []; // sprites per lamp (aantal beperkt)
  const gT = glowTex();
  for (let k = 0; k < 6; k++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gT, color: 0xff9a40, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); s.scale.set(6, 6, 1); scene.add(s); lampGlow.push(s); }
  const CC = [0x58e0ff, 0xff5ad8, 0x8aff6a, 0xb08aff, 0xffd23a];
  const cryInfo = [], boulInfo = [], stalInfo = [];
  const side = () => (rng() < 0.5 ? -1 : 1);
  const wallX = (y) => { const P = [[-1, 17.5], [4, 17.2], [9, 16.2], [13, 14.8], [16, 13]]; for (let k = 0; k < P.length - 1; k++) if (y <= P[k + 1][0]) return lerp(P[k][1], P[k + 1][1], clamp((y - P[k][0]) / (P[k + 1][0] - P[k][0]), 0, 1)); return 13; };
  for (let k = 0; k < N_CRY; k++) { const sd = side(); const c = new THREE.Color(CC[Math.floor(rng() * CC.length)]); cry.setColorAt(k, c); { const y = rng() * 11; cryInfo.push({ b: rng() * 130, x: sd * (wallX(y) - 0.3), y, sc: 0.7 + rng() * 1.3, rz: sd * (0.9 + rng() * 0.5), ry: rng() * 6, kind: rng() < 0.22 ? 'floor' : 'wall' }); } if (cryInfo[k].kind === 'floor') { cryInfo[k].x = (rng() < 0.5 ? -1 : 1) * (9.5 + rng() * 4); cryInfo[k].y = 0; cryInfo[k].rz = (rng() - 0.5) * 0.4; } }
  for (let k = 0; k < N_BOUL; k++) { const sd = side(); const y = rng() * 9; const sc = 0.8 + rng() * 2.2; boulInfo.push({ b: rng() * 130, x: sd * (wallX(y) - sc * 0.5), y, sc, ry: rng() * 6 }); }
  for (let k = 0; k < N_STAL; k++) { stalInfo.push({ b: rng() * 130, x: (rng() - 0.5) * 24, y: 13.4 + rng() * 0.6, sc: 0.35 + rng() * 0.9 }); }
  M.inst = { cry, boul, stal, post, beam, lamps, lampGlow, cryInfo, boulInfo, stalInfo, N_BEAM };
  boul.setColorAt(0, new THREE.Color(1, 1, 1)); stal.setColorAt(0, new THREE.Color(1, 1, 1));

  const endGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: gT, color: 0x9fb4ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); endGlow.scale.set(60, 40, 1); scene.add(endGlow);
  const dummy = new THREE.Object3D(); const LOOP = 140;
  M.updateDecor = (d, t, zc = 0) => {
    // vloer/muren/plafond volgen de gedeelde afstand d
    setProfile(floor, B, FLOOR_P, d, zc, 1 / 6);
    setProfile(wallL, B, WALL_L, d, zc, 1 / 14); setProfile(wallR, B, WALL_R, d, zc, 1 / 14); setProfile(ceil, B, CEIL_P, d, zc, 1 / 14);
    setProfile(ridgeL, B, [[-1.9, 0], [-1.0, 1.15]], d, zc, 1 / 6); setProfile(ridgeR, B, [[1.9, 0], [1.0, 1.15]], d, zc, 1 / 6); setProfile(ridgeTop, B, [[-1.0, 1.15], [1.0, 1.15]], d, zc, 1 / 6);
    const sv = (b) => { let s = (b - d) % LOOP; if (s < 0) s += LOOP; return s + S0 - 8; };
    for (let k = 0; k < N_CRY; k++) {
      const c = cryInfo[k]; const s = sv(c.b); const o = dummy; o.position.set(c.x + B.bx(s), c.y + B.hy(s), zc - s); o.rotation.set(0, c.ry, c.rz); o.scale.setScalar(c.sc * (s > 85 ? clamp((100 - s) / 15, 0.01, 1) : 1)); o.updateMatrix(); cry.setMatrixAt(k, o.matrix);
    }
    for (let k = 0; k < N_BOUL; k++) { const c = boulInfo[k]; const s = sv(c.b); dummy.position.set(c.x + B.bx(s), c.y + B.hy(s), zc - s); dummy.rotation.set(c.ry, c.ry * 2, 0); dummy.scale.set(c.sc, c.sc * 0.8, c.sc); dummy.updateMatrix(); boul.setMatrixAt(k, dummy.matrix); }
    for (let k = 0; k < N_STAL; k++) { const c = stalInfo[k]; const s = sv(c.b); dummy.position.set(c.x + B.bx(s), c.y + B.hy(s), zc - s); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(c.sc); dummy.updateMatrix(); stal.setMatrixAt(k, dummy.matrix); }
    const SP = 16;
    for (let k = 0; k < N_BEAM; k++) {
      let s = ((k * SP - d) % (N_BEAM * SP)); if (s < 0) s += N_BEAM * SP; s += S0 - 4;
      const bx = B.bx(s), hy = B.hy(s);
      for (let q = 0; q < 2; q++) { dummy.position.set((q ? 11.4 : -11.4) + bx, 5.5 + hy, zc - s); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); post.setMatrixAt(k * 2 + q, dummy.matrix); }
      dummy.position.set(bx, 10.8 + hy, zc - s); dummy.updateMatrix(); beam.setMatrixAt(k, dummy.matrix);
      for (let q = 0; q < 2; q++) { dummy.position.set((q ? 9.2 : -9.2) + bx, 9.2 + hy + Math.sin(t * 1.3 + k + q) * 0.05, zc - s); dummy.updateMatrix(); lamps.setMatrixAt(k * 2 + q, dummy.matrix); }
      if (k < lampGlow.length) { lampGlow[k].position.set((k % 2 ? 9.2 : -9.2) + bx, 9.2 + hy, zc - s); lampGlow[k].visible = s > -5 && s < 70; }
    }
    endGlow.position.set(B.bx(VIEW) * 0.9, 5 + B.hy(VIEW) * 0.9, zc - VIEW - 5);
    for (const im of [cry, boul, stal, post, beam, lamps]) im.instanceMatrix.needsUpdate = true; if (cry.instanceColor) cry.instanceColor.needsUpdate = true;
  };
  M.updateTrack = (p, d, zc) => {
    for (let l = 0; l < LANES; l++) {
      const sl = M.tracks[p][l]; const x = laneX(p, l);
      setStrip(sl.sl, B, x, 0.01, zc, d, 1 / 1.6);
      setStrip(sl.r1, B, x - 0.62, 0.06, zc, d, 1 / 8); setStrip(sl.r2, B, x + 0.62, 0.06, zc, d, 1 / 8);
    }
  };
  M.setTrackVisible = (p, v) => { for (const sl of M.tracks[p]) { sl.sl.visible = v; sl.r1.visible = v; sl.r2.visible = v; } };
  return M;
}

// ---------------- start-station en finish-poort ----------------
export function makeFinishArch(w = 7.4) {
  const g = new THREE.Group();
  const posts = mat(0x8a5a30);
  for (const x of [-w / 2, w / 2]) g.add(mesh(new THREE.BoxGeometry(0.8, 8, 0.8), posts, { pos: [x, 4, 0] }));
  g.add(mesh(new THREE.BoxGeometry(w + 0.8, 1.0, 0.8), posts, { pos: [0, 8, 0] }));
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(w - 1, 2.6), new THREE.MeshBasicMaterial({ map: canvasTex(512, 128, (c, ww, hh) => {
    const n = 16; for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * ww / n, j * 22, ww / n, 22); }
    c.fillStyle = '#c4161c'; c.fillRect(0, 44, ww, hh - 44); c.fillStyle = '#ffe14a'; c.font = 'bold 74px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeStyle = '#3a0a0a'; c.lineWidth = 8; c.strokeText('FINISH', ww / 2, 88); c.fillText('FINISH', ww / 2, 88);
  }), side: THREE.DoubleSide })); banner.position.set(0, 6.4, 0.05); g.add(banner);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.4), new THREE.MeshBasicMaterial({ map: canvasTex(256, 64, (c, ww, hh) => { for (let i = 0; i < 32; i++) for (let j = 0; j < 8; j++) { c.fillStyle = (i + j) % 2 ? '#111' : '#fff'; c.fillRect(i * ww / 32, j * hh / 8, ww / 32, hh / 8); } }), transparent: true, opacity: 0.9 })); line.rotation.x = -Math.PI / 2; line.position.y = 0.12; g.add(line);
  return g;
}
export function makeStation() {
  const g = new THREE.Group();
  const posts = mat(0x8a5a30), roof = mat(0x6a2a2a);
  for (const x of [-9, 9]) for (const z of [-4, 6]) g.add(mesh(new THREE.BoxGeometry(0.6, 7, 0.6), posts, { pos: [x, 3.5, z] }));
  g.add(mesh(new THREE.BoxGeometry(19.5, 0.5, 0.5), posts, { pos: [0, 7.1, -4] }));
  for (let k = 0; k < 9; k++) g.add(mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshBasicMaterial({ color: [0xffd23a, 0xff6fa5, 0x6fe8ff, 0x8aff6a][k % 4] }), { cast: false, pos: [-8.8 + k * 2.2, 6.6 + Math.sin(k) * 0.15, -3.9] }));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.2), new THREE.MeshBasicMaterial({ map: canvasTex(512, 112, (c, w, h) => { c.fillStyle = '#2a1a0c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#ffd23a'; c.lineWidth = 7; c.strokeRect(5, 5, w - 10, h - 10); c.fillStyle = '#ffd23a'; c.font = 'bold 54px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('MIJN KRISTALBERG', w / 2, h / 2 + 3); }) }));
  sign.position.set(0, 5.6, -4.1); g.add(sign);
  const start = new THREE.Mesh(new THREE.PlaneGeometry(17.5, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 })); start.rotation.x = -Math.PI / 2; start.position.set(0, 0.12, 2.2); g.add(start);
  return g;
}
