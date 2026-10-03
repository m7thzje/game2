import * as THREE from 'three';
import { canvasTex, mulberry32, TAU } from '../engine/util.js';

// Gedeelde bouwstenen voor de banen van "Minigolf-Race": thema's, texturen, materialen en geometrieen worden maar een keer gemaakt
// en door alle holes hergebruikt (weinig geheugen, weinig draw calls: gelijke materialen worden door golf_merge samengevoegd).
export const THEMES = {
  weide: { rail: 0x9a6a3a, trim: 0xfff2d0, felt: '#43b84e', felt2: '#3aa845', bump: [0xe03a3a, 0xffd23f, 0xe03a3a] },
  molen: { rail: 0x7a7a98, trim: 0xe8e8f4, felt: '#3fb5a0', felt2: '#36a590', bump: [0xff9a3a, 0xffffff, 0xff9a3a] },
  burcht: { rail: 0x5a4a78, trim: 0xe0524a, felt: '#4aa05a', felt2: '#409050', bump: [0x9a5aff, 0xff5ad8, 0x9a5aff] },
  goud: { rail: 0xb8892a, trim: 0xffe9a0, felt: '#2ea86a', felt2: '#279a5f', bump: [0xffd23f, 0xffffff, 0xffd23f] },
  hoek: { rail: 0x8a6a3a, trim: 0xfff2d0, felt: '#4cbb55', felt2: '#42a84c', bump: [0xff6fa5, 0xffd23f, 0xff6fa5] },
  zand: { rail: 0xb5653a, trim: 0xffe3b0, felt: '#4ab552', felt2: '#40a54a', bump: [0xff8a3a, 0xffe14a, 0xff8a3a] },
  schans: { rail: 0x3a6ea8, trim: 0xffffff, felt: '#46b86a', felt2: '#3ca85e', bump: [0xffa23a, 0xffffff, 0xffa23a] },
  ijs: { rail: 0x7ac0e8, trim: 0xffffff, felt: '#7fcbe0', felt2: '#72bdd4', bump: [0x4ac8ff, 0xffffff, 0x4ac8ff] },
  fabriek: { rail: 0x6a6a78, trim: 0xffd23f, felt: '#4a9a82', felt2: '#418c75', bump: [0xff9a3a, 0xffd23f, 0xff9a3a] },
  portal: { rail: 0x4a3a78, trim: 0xc8a0ff, felt: '#3a8a94', felt2: '#327c86', bump: [0xc86aff, 0x4ac8ff, 0xc86aff] },
  deur: { rail: 0x8a5a2a, trim: 0xffe14a, felt: '#4ab04a', felt2: '#42a042', bump: [0xe03a3a, 0xffffff, 0xe03a3a] },
  hamer: { rail: 0x7a3a3a, trim: 0xffffff, felt: '#58a84a', felt2: '#4e9a42', bump: [0xffd23f, 0xe03a3a, 0xffd23f] },
  drie: { rail: 0x2a7a5a, trim: 0xfff2d0, felt: '#4cba58', felt2: '#42aa4e', bump: [0xff6fa5, 0xffd23f, 0xff6fa5] },
  kermis: { rail: 0xe0524a, trim: 0xffffff, felt: '#46b8a8', felt2: '#3ca898', bump: [0xff6ad0, 0xffe14a, 0xff6ad0] },
  spiegel: { rail: 0xa8bce0, trim: 0xffffff, felt: '#68a8d8', felt2: '#5c9ccc', bump: [0xffffff, 0x8fb8ff, 0xffffff] },
  labyrint: { rail: 0x2a6a3a, trim: 0x5ab84a, felt: '#7aba5a', felt2: '#6eae50', bump: [0xff9a3a, 0xffffff, 0xff9a3a] },
  gracht: { rail: 0x8a8aa0, trim: 0xe0524a, felt: '#4aa058', felt2: '#409050', bump: [0x9a5aff, 0xff5ad8, 0x9a5aff] },
  zweef: { rail: 0x6a3ab8, trim: 0xffd23f, felt: '#3a8a78', felt2: '#327c6c', bump: [0xffd23f, 0xff6ad0, 0xffd23f] },
};
export const hexCss = (h) => '#' + new THREE.Color(h).getHexString();

const _c = new Map();
export const cached = (k, f) => { let v = _c.get(k); if (v === undefined) { v = f(); _c.set(k, v); } return v; };
export const bmat = (color, o = {}) => cached('b' + color + JSON.stringify(o), () => new THREE.MeshBasicMaterial({ color, ...o }));
export const smat = (color, o = {}) => cached('s' + color + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }));

// ---------------- texturen ----------------
export function feltTex(t) {
  return cached('felt' + t.felt, () => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = t.felt; g.fillRect(0, 0, w, h);
    g.fillStyle = t.felt2; for (let i = 0; i < 4; i++) g.fillRect(0, i * 32 + 16, w, 16);
    const r = mulberry32(3); for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(255,255,255,${0.03 + r() * 0.06})`; g.fillRect(r() * w, r() * h, 2, 2); }
  }, { repeat: [0.25, 0.25] }));
}
export function chevTex(color) {
  return cached('chev' + color, () => {
    const t = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = 'rgba(20,30,50,.55)'; g.fillRect(0, 0, w, h);
      g.strokeStyle = color; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 0; i < 2; i++) { g.beginPath(); g.moveTo(10 + i * 28, 10); g.lineTo(28 + i * 28, 32); g.lineTo(10 + i * 28, 54); g.stroke(); }
    }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  });
}
export function iceTex() {
  return cached('ice', () => { const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d6f3ff'; g.fillRect(0, 0, w, h);
    const r = mulberry32(5);
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`; g.lineWidth = 1 + r() * 2; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18 + r() * 30, y - 10 - r() * 18); g.stroke(); }
    for (let i = 0; i < 9; i++) { g.strokeStyle = 'rgba(120,190,225,.55)'; g.lineWidth = 1; let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
}
export function sandTex() {
  return cached('sand', () => { const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ecd28a'; g.fillRect(0, 0, w, h);
    const r = mulberry32(9);
    for (let i = 0; i < 420; i++) { g.fillStyle = ['#d8bc70', '#f6e3a6', '#c9ac60'][i % 3]; g.fillRect(r() * w, r() * h, 2 + r() * 2, 2); }
    g.strokeStyle = 'rgba(160,120,50,.35)'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); const y = 12 + i * 26; g.moveTo(0, y); g.bezierCurveTo(30, y - 6, 80, y + 6, w, y); g.stroke(); }
  }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
}
export function swirlTex() {
  return cached('swirl', () => canvasTex(128, 128, (g, w, h) => {
    g.translate(w / 2, h / 2); const gr = g.createRadialGradient(0, 0, 4, 0, 0, 62); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.7, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-64, -64, 128, 128);
    g.strokeStyle = 'rgba(20,0,40,.9)'; g.lineWidth = 7; g.lineCap = 'round';
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let i = 0; i <= 30; i++) { const a = k * TAU / 3 + i * 0.17, rr = 6 + i * 1.65; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); }
  }));
}
export function glowTexture() { return cached('glow', () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })); }
export function hazardTex() {
  return cached('hazard', () => { const t = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ffd23f'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2a38'; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 8, 0); g.lineTo(i * 16 + 8 + 64, 64); g.lineTo(i * 16 + 64, 64); g.fill(); }
  }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; });
}

// ---------------- geometrie-helpers ----------------
export function scaleUV(g, su, sv) { const uv = g.attributes.uv; if (!uv) return g; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return g; }
// vlak plaatje op de grond: midden (cx,cz), `along` lang in richting ang, `across` breed; uv-tegels van `cell` eenheden
export function flatQuad(cx, cz, along, across, ang, y, cell = 1.1) {
  const g = new THREE.PlaneGeometry(along, across); g.rotateX(-Math.PI / 2); g.rotateY(-ang); g.translate(cx, y, cz);
  return scaleUV(g, Math.max(1, Math.round(along / cell)), Math.max(1, Math.round(across / cell)));
}
export function boxUV(w, h, d, cell = 3) { return scaleUV(new THREE.BoxGeometry(w, h, d), Math.max(1, w / cell), Math.max(1, d / cell)); }
const _hemi = { g: null };
export const capGeo = () => _hemi.g || (_hemi.g = new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2));
export const ringGeo = () => cached('ringgeo', () => { const g = new THREE.RingGeometry(1.02, 1.3, 24); g.rotateX(-Math.PI / 2); return g; });
export const isInside = (poly, x, z) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
