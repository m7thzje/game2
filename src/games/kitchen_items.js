import * as THREE from 'three';
import { mat, mesh, canvasTex, TAU } from '../engine/util.js';

// Ingrediënten, recepten, 3D-modelletjes van eten en kleine UI-sprites voor "Taverne-keuken".

export const ING = {
  ui: { name: 'Ui', icon: '🧅', chop: 1.2 },
  wortel: { name: 'Wortel', icon: '🥕', chop: 1.2 },
  vlees: { name: 'Vlees', icon: '🥩', chop: 1.8 },
  brood: { name: 'Brood', icon: '🍞', chop: 0.8 },
  kaas: { name: 'Kaas', icon: '🧀', chop: 0.8 },
};
export const RECIPES = {
  soep: { id: 'soep', name: 'Groentesoep', icon: '🥣', ing: ['ui', 'wortel'], cooker: 'pot', color: 0xf0a030, css: '#f0a030' },
  stoof: { id: 'stoof', name: 'Stoofpot', icon: '🍲', ing: ['vlees', 'wortel'], cooker: 'pot', color: 0x8a3f22, css: '#a8502c' },
  broodje: { id: 'broodje', name: 'Kaasbroodjes', icon: '🧀', ing: ['brood', 'kaas'], cooker: 'pan', color: 0xffd23f, css: '#e8b020' },
};
export const RECIPE_IDS = Object.keys(RECIPES);

// ---- kleine geometrie-cache ----
const _g = new Map();
function geo(key, fn) { let g = _g.get(key); if (!g) { g = fn(); _g.set(key, g); } return g; }
const M = (c, o) => mat(c, { flatShading: false, ...o });
const sph = (r) => geo('s' + r, () => new THREE.SphereGeometry(r, 10, 8));
const cyl = (rt, rb, h, n = 10) => geo(`c${rt}_${rb}_${h}_${n}`, () => new THREE.CylinderGeometry(rt, rb, h, n));
const box = (w, h, d) => geo(`b${w}_${h}_${d}`, () => new THREE.BoxGeometry(w, h, d));
const cone = (r, h, n = 6) => geo(`k${r}_${h}_${n}`, () => new THREE.ConeGeometry(r, h, n));
const tor = (r, t) => geo(`t${r}_${t}`, () => new THREE.TorusGeometry(r, t, 6, 16));

const PILE = [[-0.13, 0, -0.06], [0.12, 0, -0.08], [0.0, 0, 0.12], [-0.1, 0.08, 0.04], [0.1, 0.08, 0.06], [0.01, 0.15, -0.02]];

export function ingMesh(kind, chopped = false) {
  const g = new THREE.Group();
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = false; g.add(m); return m; };
  if (!chopped) {
    if (kind === 'ui') {
      add(mesh(sph(0.26), M(0xd9a040), { cast: false, scale: [1, 0.88, 1] }), 0, 0.25, 0);
      add(mesh(cone(0.09, 0.2, 6), M(0xb98428), { cast: false }), 0, 0.5, 0);
      add(mesh(cyl(0.02, 0.05, 0.08, 5), M(0xe8d8b0), { cast: false }), 0, 0.02, 0);
    } else if (kind === 'wortel') {
      for (let i = 0; i < 2; i++) {
        const c = add(mesh(cone(0.11, 0.62, 7), M(0xf08a1c), { cast: false, rot: [0, 0, -Math.PI / 2] }), 0.0, 0.12 + i * 0.2, i * 0.08 - 0.04);
        c.rotation.y = i * 0.5;
        for (let k = 0; k < 3; k++) add(mesh(cone(0.04, 0.22, 4), M(0x4caa3a), { cast: false, rot: [0, 0, 1.25 - k * 0.35] }), -0.33, 0.14 + i * 0.2 + k * 0.01, i * 0.08 - 0.04 + (k - 1) * 0.04);
      }
    } else if (kind === 'vlees') {
      add(mesh(sph(0.26), M(0xc9524b), { cast: false, scale: [1.25, 0.85, 0.95] }), 0, 0.23, 0);
      add(mesh(cyl(0.05, 0.05, 0.7, 6), M(0xf4ecd8), { cast: false, rot: [0, 0, Math.PI / 2] }), 0.1, 0.3, 0);
      add(mesh(sph(0.09), M(0xf4ecd8), { cast: false }), 0.45, 0.3, 0.05);
      add(mesh(sph(0.09), M(0xf4ecd8), { cast: false }), 0.45, 0.3, -0.05);
      add(mesh(sph(0.12), M(0xe88a80), { cast: false, scale: [1.3, 0.5, 1] }), -0.1, 0.4, 0.08);
    } else if (kind === 'brood') {
      add(mesh(geo('loaf', () => new THREE.CapsuleGeometry(0.19, 0.5, 4, 8)), M(0xd9954a), { cast: false, rot: [0, 0, Math.PI / 2] }), 0, 0.22, 0);
      for (let i = -1; i <= 1; i++) add(mesh(box(0.03, 0.03, 0.22), M(0xf0c070), { cast: false, rot: [0, 0.6, 0] }), i * 0.16, 0.41, 0);
    } else if (kind === 'kaas') {
      add(mesh(cyl(0.34, 0.34, 0.26, 3), M(0xffd23f), { cast: false, rot: [0, 0.5, 0] }), 0, 0.15, 0);
      for (const [x, z] of [[0.05, 0.1], [-0.1, -0.05], [0.12, -0.1]]) add(mesh(sph(0.045), M(0xd9a010), { cast: false, scale: [1, 0.3, 1] }), x, 0.285, z);
    }
  } else {
    const n = kind === 'vlees' ? 5 : 6;
    for (let i = 0; i < n; i++) {
      const [x, y, z] = PILE[i];
      let m;
      if (kind === 'ui') m = mesh(tor(0.075, 0.028), M(0xf2dfa8), { cast: false, rot: [Math.PI / 2, 0, i] });
      else if (kind === 'wortel') m = mesh(cyl(0.085, 0.085, 0.05, 8), M(0xf08a1c), { cast: false, rot: [0.2 * i, 0, 0.3 * i] });
      else if (kind === 'vlees') m = mesh(box(0.15, 0.12, 0.15), M(0xb53f3f), { cast: false, rot: [0, i, 0] });
      else if (kind === 'brood') m = mesh(box(0.2, 0.05, 0.2), M(0xefc27a), { cast: false, rot: [0, i * 0.7, 0] });
      else m = mesh(box(0.13, 0.1, 0.13), M(0xffd23f), { cast: false, rot: [0, i, 0] });
      add(m, x * 1.1, 0.07 + y, z * 1.1);
    }
  }
  return g;
}

// gerecht zonder bord (voor in de pan / op het bord)
export function dishMesh(dish) {
  const g = new THREE.Group();
  const add = (m, x = 0, y = 0, z = 0) => { m.position.set(x, y, z); m.castShadow = false; g.add(m); return m; };
  if (dish === 'soep' || dish === 'stoof') {
    const col = RECIPES[dish].color;
    add(mesh(geo('bowl', () => new THREE.SphereGeometry(0.3, 14, 8, 0, TAU, Math.PI / 2, Math.PI / 2)), M(dish === 'soep' ? 0xe9e2d0 : 0x6d4a32, { side: THREE.DoubleSide }), { cast: false }), 0, 0.34, 0);
    add(mesh(geo('liq', () => new THREE.CircleGeometry(0.28, 14)), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, roughness: 0.4 }), { cast: false, rot: [-Math.PI / 2, 0, 0] }), 0, 0.32, 0);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.7 + 0.4;
      if (dish === 'soep') add(mesh(cyl(0.05, 0.05, 0.03, 7), M(i % 2 ? 0xf08a1c : 0xf2dfa8), { cast: false }), Math.cos(a) * 0.14, 0.34, Math.sin(a) * 0.14);
      else add(mesh(box(0.1, 0.08, 0.1), M(0xa8503a), { cast: false, rot: [0, a, 0] }), Math.cos(a) * 0.13, 0.35, Math.sin(a) * 0.13);
    }
    add(mesh(cone(0.04, 0.12, 4), M(0x4caa3a), { cast: false }), 0.06, 0.4, -0.03); // peterselie
  } else if (dish === 'broodje') {
    for (const sx of [-1, 1]) {
      const s = new THREE.Group(); s.position.set(sx * 0.2, 0.05, sx * 0.04); s.rotation.y = sx * 0.3; g.add(s);
      const a = (m, y) => { m.position.y = y; m.castShadow = false; s.add(m); };
      a(mesh(cyl(0.2, 0.22, 0.1, 10), M(0xd9954a), { cast: false }), 0.06);
      a(mesh(cyl(0.235, 0.235, 0.05, 10), M(0xffd23f), { cast: false }), 0.14);
      a(mesh(geo('bun', () => new THREE.SphereGeometry(0.2, 10, 6, 0, TAU, 0, Math.PI / 2)), M(0xe0a458), { cast: false, scale: [1, 0.7, 1] }), 0.17);
      a(mesh(box(0.28, 0.012, 0.03), M(0x6b3a14), { cast: false, rot: [0, 0.6, 0] }), 0.31); // grillstreep
    }
  }
  return g;
}

export function plateMesh(dish = null) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.46, 0.4, 0.06, 16), M(0xf4f1e8, { roughness: 0.4 }), { cast: false, pos: [0, 0.03, 0] }));
  g.add(mesh(tor(0.43, 0.025), M(0x4a78c8), { cast: false, pos: [0, 0.06, 0], rot: [Math.PI / 2, 0, 0] }));
  if (dish) { const d = dishMesh(dish); d.position.y = 0.05; g.add(d); }
  return g;
}

export function itemMesh(item) {
  if (!item) return null;
  return item.k === 'plate' ? plateMesh(item.dish) : ingMesh(item.k, item.chopped);
}

// ---- sprites ----
const _tex = new Map();
function cached(key, fn) { let t = _tex.get(key); if (!t) { t = fn(); t.userData.keep = true; _tex.set(key, t); } return t; }
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function emojiTex(emoji, size = 96) {
  return cached('e' + emoji + size, () => canvasTex(size, size, (g, w, h) => {
    g.font = `${w * 0.72}px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji, w / 2, h / 2 + w * 0.04);
  }));
}
export function emojiSprite(emoji, scale = 1, size = 96) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(emoji, size), transparent: true, depthTest: false }));
  s.scale.set(scale, scale, 1); s.renderOrder = 25; return s;
}
// krat-label: icoon + naam
export function labelTex(emoji, text) {
  return cached('l' + emoji + text, () => canvasTex(160, 160, (g, w, h) => {
    g.fillStyle = 'rgba(30,16,8,.78)'; g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, 22); g.fill();
    g.strokeStyle = '#ffcf3a'; g.lineWidth = 5; g.stroke();
    g.font = `84px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(emoji, w / 2, 70);
    g.font = 'bold 30px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#fff4d0'; g.fillText(text, w / 2, 126, w - 24);
  }));
}
export function labelSprite(emoji, text, scale = 1.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(emoji, text), transparent: true, depthTest: false }));
  s.scale.set(scale, scale, 1); s.renderOrder = 24; return s;
}
// tekstballon met gerechtsicoon
export function bubbleTex(emoji) {
  return cached('bub' + emoji, () => canvasTex(128, 144, (g, w, h) => {
    g.fillStyle = '#fff6dc'; g.strokeStyle = '#5a3a1a'; g.lineWidth = 7;
    g.beginPath(); g.roundRect(8, 8, w - 16, 100, 26); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(w / 2 - 14, 104); g.lineTo(w / 2, 136); g.lineTo(w / 2 + 14, 104); g.closePath(); g.fillStyle = '#fff6dc'; g.fill(); g.beginPath(); g.moveTo(w / 2 - 14, 106); g.lineTo(w / 2, 136); g.lineTo(w / 2 + 14, 106); g.stroke();
    g.fillStyle = '#fff6dc'; g.fillRect(w / 2 - 12, 100, 24, 8);
    g.font = `66px ${EMOJI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#000'; g.fillText(emoji, w / 2, 62);
  }));
}
export function bubbleSprite(emoji, scale = 1.5) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTex(emoji), transparent: true, depthTest: false }));
  s.scale.set(scale * 0.89, scale, 1); s.center.set(0.5, 0); s.renderOrder = 26; return s;
}

// voortgangsbalkje (sprites, kijkt altijd naar de camera)
export function makeBar(w = 1.3, h = 0.17) {
  const g = new THREE.Group();
  const bg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x1b0f08, transparent: true, opacity: 0.88, depthTest: false }));
  bg.scale.set(w + 0.12, h + 0.12, 1); bg.renderOrder = 30; g.add(bg);
  const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x6bd36b, depthTest: false }));
  fg.center.set(0, 0.5); fg.position.x = -w / 2; fg.scale.set(0.001, h, 1); fg.renderOrder = 31; g.add(fg);
  const bar = {
    group: g, w, h,
    set(f, color) { f = Math.max(0, Math.min(1, f)); fg.scale.x = Math.max(0.001, w * f); if (color != null) fg.material.color.setHex(color); },
  };
  return bar;
}
