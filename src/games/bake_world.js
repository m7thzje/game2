import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { bakeGeo } from './claw_world.js';
import { mergeStatic } from '../world/merge.js';

// Decor + modellen van "Taartenbakkers-Battle": een gestreepte kermis-bakkerstent met twee keukenstations.
// Stationcoördinaten: speler i staat op x = sd * p (sd = -1 voor Wes, +1 voor Jor), p = afstand tot het midden.

export const KINDS = ['deeg', 'room', 'choco', 'aardbei', 'glazuur', 'kers'];
export const KIND = {
  deeg: { name: 'deeg', col: '#f0dca0', h: 0.36 }, room: { name: 'room', col: '#fff6e4', h: 0.3 }, choco: { name: 'chocola', col: '#6a3a1e', h: 0.32 },
  aardbei: { name: 'aardbei', col: '#e8283a', h: 0.3 }, glazuur: { name: 'glazuur', col: '#ff7ac0', h: 0.17 }, kers: { name: 'kers', col: '#d01030', h: 0.55 },
};
export const ST = {
  crateP: { deeg: 9.6, room: 8.35, choco: 7.1, aardbei: 5.85, glazuur: 4.6, kers: 3.35 }, crateZ: -3.1,
  plateP: 6.0, plateZ: 1.0, ovenP: 11.3, ovenZ: -3.0, ovenStandZ: -1.2, wallZ: -4.7, pMin: 1.1, pMax: 12.3, zMin: -2.3, zMax: 3.0,
};
const S = (r, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const C = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);
const K = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);
export const matVC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
export const matVCs = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 });

// ---- lagen van de taart (oorsprong = onderkant, midden) ----
const geoCache = {};
function berry(parts, x, y, z, s = 1) { parts.push({ g: K(0.2 * s, 0.34 * s, 7), c: 0xe8283a, p: [x, y + 0.17 * s, z], r: [Math.PI, 0, 0] }, { g: K(0.12 * s, 0.1 * s, 5), c: 0x3aa84a, p: [x, y + 0.36 * s, z] }); }
export function layerGeo(kind) {
  if (geoCache[kind]) return geoCache[kind];
  const P = [];
  if (kind === 'deeg') P.push({ g: C(1.05, 1.08, 0.34, 22), c: 0xffffff, p: [0, 0.17, 0] }, { g: new THREE.TorusGeometry(1.0, 0.1, 6, 22), c: 0xffffff, p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0] });
  else if (kind === 'room') {
    P.push({ g: C(1.0, 1.0, 0.28, 22), c: 0xfff6e4, p: [0, 0.14, 0] }, { g: S(0.36, 10, 6), c: 0xffffff, p: [0, 0.3, 0], s: [1, 0.55, 1] });
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; P.push({ g: S(0.17, 7, 5), c: 0xffffff, p: [Math.cos(a) * 0.9, 0.28, Math.sin(a) * 0.9] }); }
  } else if (kind === 'choco') {
    P.push({ g: C(1.0, 1.0, 0.3, 22), c: 0x5b301a, p: [0, 0.15, 0] }, { g: C(0.86, 0.86, 0.04, 20), c: 0x8a5232, p: [0, 0.31, 0] });
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; P.push({ g: S(0.1, 6, 5), c: 0x4a2412, p: [Math.cos(a) * 1.0, 0.1 + (k % 3) * 0.06, Math.sin(a) * 1.0], s: [1, 1.6, 1] }); }
  } else if (kind === 'aardbei') {
    P.push({ g: C(1.0, 1.0, 0.2, 22), c: 0xffb0c0, p: [0, 0.1, 0] });
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; berry(P, Math.cos(a) * 0.62, 0.2, Math.sin(a) * 0.62); } berry(P, 0, 0.2, 0, 1.1);
  } else if (kind === 'glazuur') {
    P.push({ g: C(1.03, 1.03, 0.16, 22), c: 0xff7ac0, p: [0, 0.08, 0] });
    for (let k = 0; k < 9; k++) { const a = k / 9 * TAU; P.push({ g: S(0.13, 6, 5), c: 0xff7ac0, p: [Math.cos(a) * 1.02, 0.04 - (k % 2) * 0.05, Math.sin(a) * 1.02], s: [1, 1.5, 1] }, { g: S(0.05, 5, 4), c: 0xffffff, p: [Math.cos(a) * 0.5, 0.17, Math.sin(a) * 0.5] }); }
  } else if (kind === 'kers') {
    P.push({ g: S(0.34, 9, 6), c: 0xffffff, p: [0, 0.1, 0], s: [1, 0.6, 1] }, { g: S(0.28, 12, 9), c: 0xd01030, p: [0, 0.42, 0] }, { g: S(0.06, 6, 5), c: 0xffffff, p: [-0.1, 0.52, 0.17] }, { g: C(0.025, 0.025, 0.4, 5), c: 0x4a8a2a, p: [0.08, 0.78, 0], r: [0, 0, -0.5] });
  }
  return (geoCache[kind] = bakeGeo(P));
}
export function itemGeo(kind) {
  const k = 'i' + kind; if (geoCache[k]) return geoCache[k];
  const P = [];
  if (kind === 'deeg') P.push({ g: S(0.36, 10, 8), c: 0xf0dca0, p: [0, 0.3, 0], s: [1.1, 0.8, 1] }, { g: S(0.22, 8, 6), c: 0xf8ecc0, p: [0.25, 0.25, 0.1] }, { g: S(0.12, 6, 5), c: 0xffffff, p: [-0.15, 0.55, 0.1] });
  else if (kind === 'room') P.push({ g: C(0.36, 0.28, 0.3, 12), c: 0x8ac8ee, p: [0, 0.15, 0] }, { g: S(0.34, 10, 8), c: 0xffffff, p: [0, 0.38, 0], s: [1, 0.8, 1] }, { g: K(0.12, 0.25, 6), c: 0xffffff, p: [0, 0.68, 0] });
  else if (kind === 'choco') for (let k = 0; k < 3; k++) P.push({ g: B(0.7, 0.13, 0.36), c: 0x5b301a, p: [(k - 1) * 0.06, 0.07 + k * 0.14, (k - 1) * 0.04], r: [0, (k - 1) * 0.3, 0] }, { g: B(0.5, 0.02, 0.2), c: 0x8a5232, p: [(k - 1) * 0.06, 0.15 + k * 0.14, (k - 1) * 0.04], r: [0, (k - 1) * 0.3, 0] });
  else if (kind === 'aardbei') { berry(P, -0.2, 0.05, 0, 1.3); berry(P, 0.2, 0.05, 0.05, 1.3); berry(P, 0, 0.35, 0, 1.3); }
  else if (kind === 'glazuur') P.push({ g: C(0.2, 0.24, 0.5, 10), c: 0xff7ac0, p: [0, 0.25, 0] }, { g: K(0.16, 0.26, 8), c: 0xffffff, p: [0, 0.62, 0] }, { g: C(0.07, 0.07, 0.14, 6), c: 0xffffff, p: [0, 0.8, 0] }, { g: new THREE.TorusGeometry(0.22, 0.03, 5, 12), c: 0xffe14a, p: [0, 0.3, 0], r: [Math.PI / 2, 0, 0] });
  else if (kind === 'kers') for (const sd of [-1, 1]) P.push({ g: S(0.2, 10, 8), c: 0xd01030, p: [sd * 0.2, 0.22, 0] }, { g: C(0.02, 0.02, 0.45, 5), c: 0x4a8a2a, p: [sd * 0.1, 0.62, 0], r: [0, 0, sd * 0.4] }, { g: S(0.05, 5, 4), c: 0xffffff, p: [sd * 0.14, 0.3, 0.14] });
  else if (kind === 'gold') {
    const sh = new THREE.Shape(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.2 : 0.46, a = k / 10 * TAU + Math.PI / 2; k ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    P.push({ g: new THREE.ExtrudeGeometry(sh, { depth: 0.14, bevelEnabled: false }), c: 0xffcf3a, p: [0, 0.5, -0.07] });
  }
  return (geoCache[k] = bakeGeo(P));
}
export function sprinkleGeo() { return B(0.16, 0.05, 0.05); }

// ---- canvas-iconen (voor het bonnetje) ----
export function drawIcon(g, kind, x, y, s) {
  g.save(); g.translate(x, y); g.scale(s, s); g.lineWidth = 0.07; g.strokeStyle = '#3a2410'; g.lineJoin = 'round';
  const circ = (cx, cy, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); g.stroke(); };
  if (kind === 'deeg') { circ(0, 0, 0.9, '#f0dca0'); circ(-0.3, -0.25, 0.14, '#d8c080'); circ(0.3, 0.1, 0.12, '#d8c080'); circ(-0.1, 0.4, 0.1, '#d8c080'); }
  else if (kind === 'room') { circ(-0.45, 0.2, 0.45, '#fff'); circ(0.45, 0.2, 0.45, '#fff'); circ(0, -0.25, 0.5, '#fff'); circ(0, 0.3, 0.45, '#fff'); }
  else if (kind === 'choco') { g.fillStyle = '#6a3a1e'; g.beginPath(); g.roundRect(-0.8, -0.6, 1.6, 1.2, 0.15); g.fill(); g.stroke(); g.strokeStyle = '#9a6a42'; for (const a of [-0.27, 0.27]) { g.beginPath(); g.moveTo(a * 2, -0.6); g.lineTo(a * 2, 0.6); g.stroke(); } g.beginPath(); g.moveTo(-0.8, 0); g.lineTo(0.8, 0); g.stroke(); }
  else if (kind === 'aardbei') { g.fillStyle = '#e8283a'; g.beginPath(); g.moveTo(-0.7, -0.4); g.quadraticCurveTo(0, -0.8, 0.7, -0.4); g.quadraticCurveTo(0.5, 0.5, 0, 0.9); g.quadraticCurveTo(-0.5, 0.5, -0.7, -0.4); g.fill(); g.stroke(); g.fillStyle = '#3aa84a'; g.beginPath(); g.moveTo(-0.4, -0.5); g.lineTo(0, -0.9); g.lineTo(0.4, -0.5); g.lineTo(0, -0.35); g.fill(); g.stroke(); g.fillStyle = '#ffe9a0'; for (const [a, b] of [[-0.2, 0], [0.25, 0.1], [0, 0.45], [-0.1, 0.2]]) g.fillRect(a, b, 0.07, 0.07); }
  else if (kind === 'glazuur') { g.fillStyle = '#ff7ac0'; g.beginPath(); g.moveTo(-0.85, -0.3); g.lineTo(0.85, -0.3); g.lineTo(0.85, 0.1); g.quadraticCurveTo(0.7, 0.3, 0.6, 0.1); g.lineTo(0.6, 0.55); g.quadraticCurveTo(0.45, 0.7, 0.3, 0.55); g.lineTo(0.3, 0.1); g.quadraticCurveTo(0, 0.4, -0.3, 0.1); g.lineTo(-0.6, 0.7); g.quadraticCurveTo(-0.75, 0.8, -0.85, 0.6); g.closePath(); g.fill(); g.stroke(); }
  else if (kind === 'kers') { circ(0, 0.3, 0.55, '#d01030'); g.strokeStyle = '#3a8a2a'; g.lineWidth = 0.12; g.beginPath(); g.moveTo(0, -0.2); g.quadraticCurveTo(0.1, -0.7, 0.45, -0.9); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(-0.2, 0.15, 0.1, 0, TAU); g.fill(); }
  else if (kind === 'gold') { g.fillStyle = '#ffcf3a'; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.4 : 0.95, a = k / 10 * TAU - Math.PI / 2; g[k ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke(); }
  g.restore();
}
const lblCache = new Map();
export function labelTex(text, color = '#ffffff', w = 512, h = 64, size = 40) {
  const k = text + color + w; let t = lblCache.get(k);
  if (!t) { t = canvasTex(w, h, (g, ww, hh) => { g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 9; g.strokeStyle = 'rgba(30,10,5,.92)'; g.lineJoin = 'round'; g.strokeText(text, ww / 2, hh / 2, ww - 10); g.fillStyle = color; g.fillText(text, ww / 2, hh / 2, ww - 10); }); lblCache.set(k, t); }
  return t;
}

function stripeTex() { return canvasTex(256, 128, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff0d4' : '#e04a4a'; g.fillRect(i * 32, 0, 32, h); } g.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 8; i++) g.fillRect(i * 32 + 28, 0, 4, h); }, { repeat: [5, 1] }); }
function signTex() {
  return canvasTex(1024, 200, (g, w, h) => {
    g.fillStyle = '#7a3a1e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffe14a'; g.lineWidth = 10; g.strokeRect(12, 12, w - 24, h - 24);
    g.font = 'bold 96px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = '#3a1608'; g.lineJoin = 'round'; g.strokeText('TAARTENBAKKERS-BATTLE', w / 2, h / 2 + 4, w - 60); g.fillStyle = '#ffe9a0'; g.fillText('TAARTENBAKKERS-BATTLE', w / 2, h / 2 + 4, w - 60);
  });
}

// ---- het podium ----
export function buildStage(ctx) {
  const { scene } = ctx; const start = scene.children.length; const rng = mulberry32(31);
  const R = { ovens: [], plates: [], bulbs: null, bulbN: 0, jury: null, juryPos: [0, 0.55, 5.4], custPos: [0, 0.9, -3.9] };
  scene.background = new THREE.Color(0x3a1c2c); scene.fog = new THREE.Fog(0x3a1c2c, 50, 120);
  const wood = mat(0xa9774a, { flatShading: false }), dwood = mat(0x7a4a2a, { flatShading: false }), marble = mat(0xf4f0ea, { flatShading: false, roughness: 0.3 }), red = mat(0xd8372c, { flatShading: false }), gold = mat(0xe8c24a, { flatShading: false, metalness: 0.6, roughness: 0.35 }), cream = mat(0xfff0d4, { flatShading: false }), steel = mat(0xb8bcc8, { flatShading: false, metalness: 0.7, roughness: 0.3 });
  const add = (g, m, x, y, z, o = {}) => { const k = mesh(g, m, { cast: o.cast ?? false, receive: true, pos: [x, y, z], rot: o.rot }); scene.add(k); return k; };
  // vloer
  const ft = tex.checker(16, 8, '#fbe9d2', '#e9b9a8');
  add(new THREE.PlaneGeometry(48, 26), new THREE.MeshStandardMaterial({ map: ft, roughness: 0.8 }), 0, 0, 0.5, { rot: [-Math.PI / 2, 0, 0] });
  for (const sd of [-1, 1]) add(B(12.4, 0.03, 8), mat(sd < 0 ? 0xc8ecd4 : 0xc8d8f4, { flatShading: false }), sd * 6.8, 0.02, 0.0);
  // achterwand (gestreept) + zijwanden + tentdak-rand
  const wallM = new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.9 });
  add(new THREE.PlaneGeometry(40, 7.4), wallM, 0, 3.7, ST.wallZ);
  for (const sd of [-1, 1]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(14, 7.4), wallM); w.position.set(sd * 20, 3.7, -3); w.rotation.y = -sd * 1.2; scene.add(w); }
  for (let k = 0; k < 20; k++) add(C(1.0, 1.0, 0.1, 10, 1), k % 2 ? red : cream, -19 + k * 2, 6.9, ST.wallZ + 0.5, { rot: [Math.PI / 2, 0, 0] });
  add(B(40, 0.5, 1.0), red, 0, 7.3, ST.wallZ + 0.4);
  add(B(40, 1.1, 0.4), dwood, 0, 0.55, ST.wallZ + 0.2);
  // uithangbord
  add(new THREE.PlaneGeometry(10.5, 2.05), new THREE.MeshBasicMaterial({ map: signTex() }), 0, 6.1, ST.wallZ + 0.12);
  // klantenraam in het midden (houten lijst + gordijnen)
  add(B(0.4, 4.6, 0.5), dwood, -2.6, 2.9, ST.wallZ + 0.3); add(B(0.4, 4.6, 0.5), dwood, 2.6, 2.9, ST.wallZ + 0.3); add(B(5.6, 0.45, 0.5), dwood, 0, 5.3, ST.wallZ + 0.3);
  add(B(5.2, 4.0, 0.1), mat(0xffe9b0, { flatShading: false }), 0, 3.1, ST.wallZ + 0.05);
  for (const sd of [-1, 1]) add(B(1.2, 4.6, 0.3), red, sd * 3.5, 3.1, ST.wallZ + 0.3);
  add(B(5.4, 1.0, 1.5), wood, 0, 0.5, R.custPos[2] - 0.2); add(B(5.6, 0.14, 1.7), marble, 0, 1.05, R.custPos[2] - 0.2);
  // balies met kasten per station
  for (const sd of [-1, 1]) {
    const cx = sd * 7.0; add(B(11.0, 1.4, 1.6), wood, cx, 0.7, ST.crateZ - 0.1); add(B(11.2, 0.14, 1.8), marble, cx, 1.45, ST.crateZ - 0.1);
    for (let k = 0; k < 6; k++) add(B(1.5, 0.9, 0.04), dwood, cx - 4.4 + k * 1.76, 0.7, ST.crateZ + 0.72);
    // kratjes met voorraad (statisch)
    for (const kind of KINDS) {
      const p = ST.crateP[kind], x = sd * p;
      add(B(1.0, 0.45, 0.9), dwood, x, 1.68, ST.crateZ); add(B(1.08, 0.08, 0.98), wood, x, 1.9, ST.crateZ);
      const g = itemGeo(kind); for (let q = 0; q < 2; q++) { const m = new THREE.Mesh(g, matVC); m.position.set(x + (q - 0.5) * 0.4, 1.9 + q * 0.0, ST.crateZ + (q ? 0.1 : -0.1)); m.scale.setScalar(0.85); m.castShadow = true; scene.add(m); }
    }
    // taartentafel + bordje
    const px = sd * ST.plateP, pz = ST.plateZ;
    add(C(0.4, 0.55, 0.85, 12), dwood, px, 0.42, pz, { cast: true }); add(C(1.8, 1.8, 0.14, 24), wood, px, 0.9, pz, { cast: true }); add(C(1.5, 1.5, 0.08, 24), mat(0xcfe8f4, { flatShading: false }), px, 1.0, pz); add(new THREE.TorusGeometry(1.5, 0.05, 6, 24), gold, px, 1.04, pz, { rot: [Math.PI / 2, 0, 0] });
    // oven
    const ox = sd * ST.ovenP, oz = ST.ovenZ;
    add(B(2.6, 3.0, 1.8), mat(0x5a5a68, { flatShading: false }), ox, 1.5, oz, { cast: true }); add(B(2.7, 0.3, 1.9), steel, ox, 3.05, oz); add(C(0.3, 0.3, 1.4, 8), steel, ox + sd * 0.7, 3.9, oz - 0.2);
    for (const dx of [-0.8, 0, 0.8]) add(C(0.12, 0.12, 0.15, 8), red, ox + dx, 2.7, oz + 0.95, { rot: [Math.PI / 2, 0, 0] });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ color: 0x2a1408, emissive: 0xff6a1a, emissiveIntensity: 0.4 })); win.position.set(ox, 1.5, oz + 0.92); win.userData.dynamic = true; scene.add(win);
    add(B(1.7, 0.12, 0.1), steel, ox, 2.05, oz + 0.95); add(B(1.7, 0.12, 0.1), steel, ox, 0.95, oz + 0.95); add(B(0.12, 1.2, 0.1), steel, ox - 0.8, 1.5, oz + 0.95); add(B(0.12, 1.2, 0.1), steel, ox + 0.8, 1.5, oz + 0.95);
    R.ovens.push({ win, x: ox, z: oz }); R.plates.push({ x: px, z: pz });
    // bloemzakken op de scheidingsbank
    for (let k = 0; k < 2; k++) add(S(0.42, 8, 6), mat(0xf4ecd8, { flatShading: false }), sd * 0.45, 1.65, -2.2 + k * 0.55, { cast: true });
  }
  // scheidingsbank in het midden
  add(B(1.6, 1.3, 7.8), wood, 0, 0.65, -0.5, { cast: true }); add(B(1.8, 0.14, 8.0), marble, 0, 1.35, -0.5);
  add(B(1.8, 0.4, 0.4), gold, 0, 1.3, 3.5);
  // jury-dais + troon
  const [jx, jy, jz] = R.juryPos;
  add(C(2.4, 2.6, 0.55, 20), red, jx, 0.27, jz, { cast: true }); add(new THREE.TorusGeometry(2.4, 0.08, 6, 24), gold, jx, 0.56, jz, { rot: [Math.PI / 2, 0, 0] });
  add(B(1.9, 0.5, 1.6), dwood, jx, jy + 0.5, jz - 0.2, { cast: true }); add(B(1.9, 2.4, 0.35), red, jx, jy + 1.6, jz - 1.0, { cast: true }); add(B(2.1, 0.2, 0.4), gold, jx, jy + 2.9, jz - 1.0);
  for (const sd of [-1, 1]) { add(B(0.3, 0.9, 1.4), dwood, jx + sd * 1.05, jy + 0.9, jz - 0.2); add(S(0.2, 8, 6), gold, jx + sd * 1.05, jy + 1.5, jz - 0.9); }
  // slingers, vlaggetjes en lampjes
  const fl = []; const pal = [0xff3a8a, 0xffd23f, 0x58d6ff, 0x7aff7a, 0xff8a1c];
  for (const [z, y0, n] of [[ST.wallZ + 0.6, 6.3, 30], [-1, 7.0, 30]]) for (let k = 0; k < n; k++) { const x = -17 + k * (34 / (n - 1)); fl.push({ g: new THREE.CircleGeometry(0.28, 3), c: pal[k % 5], p: [x, y0 - Math.sin(k / (n - 1) * Math.PI * 3) * 0.5 - 0.3, z], r: [0, 0, Math.PI] }); }
  const flags = new THREE.Mesh(bakeGeo(fl), new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 })); scene.add(flags);
  const bp = []; for (let k = 0; k < 36; k++) bp.push([-17 + k * (34 / 35), 6.55 + Math.sin(k / 35 * Math.PI * 3) * -0.4, -3.9]);
  for (let k = 0; k < 24; k++) bp.push([-17 + k * (34 / 23), 7.2 - Math.sin(k / 23 * Math.PI * 3) * 0.4, 5.5]);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), bp.length); const _m = new THREE.Matrix4();
  bp.forEach((p, i) => { _m.makeTranslation(...p); bulbs.setMatrixAt(i, _m); bulbs.setColorAt(i, new THREE.Color(pal[i % 5])); }); bulbs.userData.dynamic = true; bulbs.frustumCulled = false; scene.add(bulbs); R.bulbs = bulbs; R.bulbN = bp.length;
  // ballonnen en publiek-silhouet (zwarte rand onderaan)
  for (let k = 0; k < 12; k++) { const x = (k - 5.5) * 3.2 + rng(), y = 5 + rng() * 1.6; add(S(0.5, 8, 6), mat(pal[k % 5], { flatShading: false }), x, y, ST.wallZ + 0.9, {}).scale.y = 1.2; }
  mergeStatic(scene, start);
  return R;
}
