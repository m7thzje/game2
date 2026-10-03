// De DEURENHAL (hal 4, geheim): een gekke hal vol deuren, zwevende deuren, deurknoppen en spiegels in goud en pastel.
// Elke kast is een eigen DEUR met een scherm erin. De Deurman is hier zelf de gastheer.
// Statisch decor via Deco (samengevoegd); de zwevende deuren, spiegels en de deurbel zijn dynamisch (klasse DeurHall).
import * as THREE from 'three';
import { canvasTex, TAU, mulberry32, mesh, mat, damp } from '../engine/util.js';
import { makeDeurman } from '../engine/chars.js';
import { audio } from '../engine/audio.js';
import { floatLabel } from './build.js';
import { Deco } from './arcade_deco.js';
import { rugCustom } from './arcade_decor.js';

const PI = Math.PI;
const p = (i) => 'p' + (((i % 3) + 3) % 3);
const col = (a, x, z, r) => a.colliders.push({ x, z, r });
const GOLD = 0xf2c230, PASTEL = [0xffb3d1, 0xb3e6c8, 0xa8d8ff, 0xfff0a0, 0xd8b8ff, 0xffcfa0];
const hexs = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------------------------------------------------------------- muurbehang vol deuren (4 deuren per tegel)
export function deurWall(repX) {
  const cols = ['#ff9ec8', '#8fdcb0', '#8cc8ff', '#ffe27a'];
  const t = canvasTex(1024, 512, (g, w, h) => {
    g.fillStyle = '#fff1f8'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffe0f0'; for (let i = 0; i < 32; i++) g.fillRect(i * 32, 0, 14, h);
    for (let i = 0; i < 4; i++) {
      const x0 = i * 256 + 28, dw = 200, y0 = 66, dh = 420, c = cols[i];
      g.fillStyle = '#e8b82a'; g.beginPath(); g.roundRect(x0 - 12, y0 - 12, dw + 24, dh + 12, [90, 90, 0, 0]); g.fill();
      g.fillStyle = c; g.beginPath(); g.roundRect(x0, y0, dw, dh, [78, 78, 0, 0]); g.fill();
      g.fillStyle = 'rgba(0,0,0,.14)'; for (const [px, py, pw, ph] of [[18, 150, 78, 110], [104, 150, 78, 110], [18, 280, 78, 120], [104, 280, 78, 120]]) { g.beginPath(); g.roundRect(x0 + px, y0 + py, pw, ph, 10); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x0 + dw / 2, y0 + 78, 40, 0, TAU); g.fill();
      g.fillStyle = '#e8b82a'; g.beginPath(); g.arc(x0 + dw - 26, y0 + 250, 14, 0, TAU); g.fill(); g.fillStyle = '#fff6c0'; g.beginPath(); g.arc(x0 + dw - 30, y0 + 245, 5, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect(x0 + dw / 2 - 26, y0 + 40, 52, 30, 6); g.fill(); g.fillStyle = '#7a4a24'; g.font = 'bold 24px Fredoka, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(7 + i * 13), x0 + dw / 2, y0 + 56);
    }
    g.fillStyle = '#e8b82a'; g.fillRect(0, h - 28, w, 10); g.fillStyle = '#c99a20'; g.fillRect(0, h - 18, w, 18);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repX, 1.5); return t;
}

// ---------------------------------------------------------------- kleden
export const DEUR_RUGS = {
  deurmat: (c1, c2, n) => rugCustom(n, (g, w, m, R) => {
    g.fillStyle = '#2a6ab0'; g.fillRect(0, 0, w, w); for (let i = 6; i >= 1; i--) { g.fillStyle = i % 2 ? '#4aa8e8' : '#bfe4ff'; g.beginPath(); g.arc(m, m, R * i / 6, 0, TAU); g.fill(); }
    g.fillStyle = '#7a4a24'; g.beginPath(); g.roundRect(m - 150, m - 70, 300, 140, 16); g.fill(); g.fillStyle = '#f6e6b8'; g.font = 'bold 60px Fredoka, Arial Black'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('WELKOM', m, m + 2);
  }),
  handtek: (c1, c2, n) => rugCustom(n, (g, w, m, R) => {
    g.fillStyle = '#fff0f6'; g.fillRect(0, 0, w, w); const rnd = mulberry32(8); g.strokeStyle = '#d8307a'; g.lineWidth = 6; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) { let x = rnd() * w * 0.6 + 40, y = rnd() * w * 0.8 + 20; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += 20 + rnd() * 30; y += (rnd() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = '#ffe14a'; g.lineWidth = 12; g.beginPath(); g.arc(m, m, R * 0.93, 0, TAU); g.stroke();
  }),
  deurrace: (c1, c2, n) => rugCustom(n, (g, w, m, R) => {
    g.fillStyle = '#1f6a40'; g.fillRect(0, 0, w, w); g.fillStyle = '#4fd88a'; for (let i = 0; i < 8; i += 2) g.fillRect(0, i * w / 8, w, w / 8);
    g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { if ((i + j) % 2) g.fillRect(i * w / 16, j * w / 16, w / 16, w / 16); }
    g.fillStyle = '#ffe14a'; for (let i = 0; i < 4; i++) { const y = w * (0.35 + i * 0.1); g.beginPath(); g.moveTo(m - 70, y); g.lineTo(m + 70, y); g.lineTo(m, y + 40); g.fill(); }
  }),
  deurdisco: (c1, c2, n) => rugCustom(n, (g, w, m, R) => {
    const cs = ['#b06aff', '#ff7ab0', '#5ad8ff', '#ffe14a']; for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = cs[(i * 3 + j * 5) % 4]; g.fillRect(i * w / 8 + 3, j * w / 8 + 3, w / 8 - 6, w / 8 - 6); }
    g.strokeStyle = '#fff'; g.lineWidth = 10; g.beginPath(); g.arc(m, m, R * 0.93, 0, TAU); g.stroke();
  }),
};

// ---------------------------------------------------------------- deur-kasten: de kast IS een deur met een scherm erin
function doorCab(D, { leaf, extras }) {
  D.box(5.6, 0.3, 2.8, 0, 0.15, 0.6, 0xf2d8e8);
  for (const sx of [-1, 1]) D.box(0.55, 7.2, 1.0, sx * 2.2, 3.9, 0, GOLD, null);
  D.box(5.3, 0.65, 1.0, 0, 7.55, 0, GOLD, null); D.tri(5.6, 1.3, 0, 7.9, 0, 0xffd96a, { kind: 'dbl', rz: PI }); D.sph(0.28, 0, 9.4, 0, 0xffffff, { kind: 'p1' }, 6);
  D.box(3.7, 6.9, 0.28, 0, 3.75, 0, leaf);
  const dk = new THREE.Color(leaf).multiplyScalar(0.72).getHex(); for (const sx of [-1, 1]) D.box(1.5, 2.3, 0.1, sx * 0.88, 2.0, 0.17, dk);
  D.box(3.1, 2.5, 0.2, 0, 5.3, 0.2, GOLD, null);
  D.sph(0.2, 1.5, 3.7, 0.36, GOLD, null, 8); D.cyl(0.07, 0.07, 0.3, 6, 1.5, 3.7, 0.25, GOLD, { rx: PI / 2 }); D.box(0.7, 0.45, 0.06, 0, 7.05, 0.2, 0xfff6c0);
  D.box(1.3, 0.22, 0.06, -0.3, 3.1, 0.2, 0x333340); D.box(3.4, 0.07, 0.9, 0, 0.34, 1.9, 0xff9ec8); D.box(3.5, 0.06, 0.5, 0, 0.33, 0.55, 0xfff0a0, { kind: 'p0' });   // brievenbus, deurmat, licht onder de deur
  for (let i = 0; i < 7; i++) D.sph(0.12, -1.8 + i * 0.6, 7.55, 0.55, 0xfff0a0, { kind: p(i) }, 5);
  extras && extras(D);
  return { scr: { x: 0, y: 5.3, z: 0.31, w: 2.7, h: 2.0, rx: -0.1 }, ix: 3.8, hit: [[-2.1, 0, 0.8], [-0.7, 0, 0.8], [0.7, 0, 0.8], [2.1, 0, 0.8]], lblY: 9.9 };
}
export const DOOR_CABS = {
  deurzegt: (D) => doorCab(D, { leaf: 0x4aa8e8, extras: (D) => { [[0xd8372c, -1.6], [0x2f9be0, -0.55], [0x2fae5b, 0.55], [0xffd23f, 1.6]].forEach(([c, x], i) => { D.cyl(0.42, 0.42, 0.14, 12, x, 0.42, 3.0, c); D.cyl(0.3, 0.3, 0.16, 12, x, 0.44, 3.0, c, { kind: p(i) }); });   // Simon-knoppen
    D.cyl(0.06, 0.06, 3.0, 5, 3.4, 1.5, 0.8, 0xcfa060); D.box(2.0, 1.2, 0.1, 3.4, 3.4, 0.8, 0xfff6c0); D.box(1.8, 0.1, 0.12, 3.4, 3.65, 0.86, 0xd8372c); D.box(1.2, 0.1, 0.12, 3.4, 3.35, 0.86, 0x2f6fe0); } }),
  handtekening: (D) => doorCab(D, { leaf: 0xff6fa5, extras: (D) => { D.at(3.5, 0, 1.0, 0, () => { D.cyl(0.14, 0.14, 4.2, 8, 0, 2.1, 0, 0x2a4ac8, { rz: 0.18 }); D.cone(0.14, 0.5, 8, -0.4, 4.35, 0, GOLD, { rz: 0.18 }); });
    D.box(1.5, 1.0, 0.8, -3.5, 0.5, 1.0, 0x7a2f5a); D.box(1.4, 0.06, 0.9, -3.5, 1.05, 1.0, 0xffffff, { rx: -0.2 }); D.box(1.2, 0.1, 0.1, -3.3, 1.12, 1.0, 0x2a4ac8); } }),
  deurenrace: (D) => doorCab(D, { leaf: 0x4fd88a, extras: (D) => { for (const sx of [-1, 1]) { D.cyl(0.05, 0.05, 3.2, 5, sx * 3.3, 1.6, 0.8, 0xdddddd); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) D.box(0.4, 0.4, 0.05, sx * 3.3 + sx * (0.25 + i * 0.4), 2.9 - j * 0.4, 0.8, (i + j) % 2 ? 0xffffff : 0x111111); for (let i = 0; i < 3; i++) D.tor(0.45, 0.22, sx * 3.4, 0.24 + i * 0.44, 2.4, 0x1a1a22, { rx: PI / 2 }, 12); }
    for (let i = 0; i < 3; i++) D.tri(0.9, 0.7, -0.9 + i * 0.9, 0.4, 1.9, 0xffe14a, { kind: p(i), rx: -PI / 2 }); } }),
  deurdisco: (D) => doorCab(D, { leaf: 0xb06aff, extras: (D) => { D.cyl(0.03, 0.03, 1.6, 4, 0, 10.2, 0.6, 0xcccccc); D.sph(0.7, 0, 9.0, 0.6, 0xdddddd, null, 8);
    for (const sx of [-1, 1]) { D.box(1.2, 2.6, 1.0, sx * 3.5, 1.3, 0.8, 0x10162c); for (const yy of [0.8, 1.9]) D.cyl(0.4, 0.4, 0.1, 12, sx * 3.5, yy, 1.32, yy > 1.5 ? 0xff2bd6 : 0x00e5ff, { kind: p(yy > 1.5 ? 1 : 2), rx: PI / 2 }); }
    for (let i = 0; i < 4; i++) D.box(0.8, 0.05, 0.8, -1.2 + i * 0.8, 0.34, 1.9, [0xff7ab0, 0x5ad8ff, 0xffe14a, 0xb06aff][i], { kind: p(i) }); } }),
};
DOOR_CABS.default = (D) => doorCab(D, { leaf: 0xffb3d1 });

// ---------------------------------------------------------------- zone-props
function cutout(D, x, z, yaw, pose) {   // kartonnen Deurman op een voetje
  D.at(x, 0, z, yaw, () => {
    D.box(1.2, 0.12, 0.8, 0, 0.06, 0, 0xb98a54); D.box(0.9, 1.9, 0.14, 0, 1.6, 0, 0x14141a); D.box(0.36, 1.3, 0.12, -0.2, 0.7, 0, 0x14141a); D.box(0.36, 1.3, 0.12, 0.2, 0.7, 0, 0x14141a);
    D.sph(0.42, 0, 3.0, 0.02, 0xf2f2ea, { sy: 1.2 }, 8); D.box(0.12, 0.7, 0.05, 0, 1.9, 0.09, 0xf6f0e0); D.box(0.1, 0.5, 0.05, 0, 1.75, 0.1, 0xc4182a);
    D.sph(0.06, -0.14, 3.1, 0.4, 0x111111, null, 4); D.sph(0.06, 0.14, 3.1, 0.4, 0x111111, null, 4); D.box(0.4, 0.07, 0.05, 0, 2.82, 0.4, 0x4a0c16);
    if (pose === 0) { D.box(0.18, 1.2, 0.12, -0.7, 2.3, 0, 0x14141a, { rz: -0.7 }); D.box(0.18, 1.2, 0.12, 0.7, 2.3, 0, 0x14141a, { rz: 0.7 }); }
    else if (pose === 1) { D.box(0.18, 1.3, 0.12, -0.65, 1.5, 0, 0x14141a, { rz: -0.15 }); D.box(0.18, 1.2, 0.12, 0.8, 2.6, 0, 0x14141a, { rz: 1.0 }); }
    else if (pose === 2) { D.box(0.18, 1.3, 0.12, -0.55, 1.45, 0, 0x14141a, { rz: -0.2 }); D.box(0.18, 1.3, 0.12, 0.55, 1.45, 0, 0x14141a, { rz: 0.2 }); }
    else { D.box(0.18, 1.2, 0.12, -0.75, 2.4, 0, 0x14141a, { rz: -1.0 }); D.box(0.18, 1.2, 0.12, 0.75, 2.4, 0, 0x14141a, { rz: 1.0 }); }
  });
}
export const DEUR_PROPS = {
  zeg(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      for (const sx of [-1, 1]) { D.box(2.0, 4.6, 0.2, sx * 7.4, 2.5, 1.0, GOLD, { ry: sx * 0.7 }); D.box(1.7, 4.2, 0.05, sx * 7.4 - sx * 0.1, 2.5, 1.12, 0xcfeaff, { ry: sx * 0.7, kind: 'glow' }); }
    });
    [[-4.8, 4.2, 0.3, 0], [-1.6, 5.4, 0.1, 1], [1.6, 5.4, -0.1, 2], [4.8, 4.2, -0.3, 3]].forEach(([x, zz, yaw, pose]) => { cutout(D, z.cx + x, z.cz + zz, yaw, pose); col(a, z.cx + x, z.cz + zz, 0.6); });
  },
  hand(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {   // fluwelen koord naar de deur
      for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const px = sx * 2.2, pz = 0.4 + i * 1.6; D.cyl(0.07, 0.1, 1.2, 6, px, 0.6, pz, GOLD, null); D.sph(0.15, px, 1.28, pz, GOLD, null, 6); if (i) D.box(0.07, 0.07, 1.6, px, 1.05, pz - 0.8, 0xd8372c); }
      D.box(2.6, 1.0, 1.3, 6.2, 0.5, 5.2, 0x7a2f5a); D.box(2.8, 0.12, 1.4, 6.2, 1.06, 5.2, 0xffd96a); for (let i = 0; i < 3; i++) D.box(0.6, 0.04, 0.8, 5.5 + i * 0.7, 1.15, 5.2, 0xffffff, { ry: i * 0.3 }); D.cyl(0.2, 0.25, 0.4, 8, 7.2, 1.3, 5.4, 0x2a4ac8);
      for (const [x, zz, ry] of [[-6.2, 4.4, 0.5], [-3.6, 6.4, 0.1], [6.8, 1.4, -0.6]]) D.at(x, 0, zz, ry, () => { D.box(0.12, 2.2, 0.12, -0.55, 1.1, -0.3, 0x6b4a2e, { rz: 0.1 }); D.box(0.12, 2.2, 0.12, 0.55, 1.1, -0.3, 0x6b4a2e, { rz: -0.1 }); D.box(1.5, 1.8, 0.14, 0, 2.2, 0, GOLD, null); D.box(1.2, 1.5, 0.05, 0, 2.2, 0.1, 0xfff6e8); D.sph(0.32, 0, 2.35, 0.14, 0xf2f2ea, { sy: 1.2 }, 6); D.box(0.7, 0.55, 0.05, 0, 1.7, 0.14, 0x14141a); });   // ingelijste Deurman-foto's
      for (let i = 0; i < 6; i++) D.sph(0.14, -2.6 + i * 1.04, 0.14, 8.2 - (i % 2) * 0.3, GOLD, { kind: p(i) }, 5);
    });
    col(a, z.cx + 6.2, z.cz + 5.2, 1.6); col(a, z.cx - 6.2, z.cz + 4.4, 0.7); col(a, z.cx - 3.6, z.cz + 6.4, 0.7); col(a, z.cx + 6.8, z.cz + 1.4, 0.7);
  },
  drace(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      [[-5.2, 3.6, 1.0, 0x4aa8e8], [-2.6, 5.2, 1.3, 0xff9ec8], [0, 3.8, 1.6, 0xfff0a0], [2.6, 5.4, 1.3, 0xb3e6c8], [5.2, 3.8, 1.0, 0xd8b8ff]].forEach(([x, zz, s, c]) => D.at(x, 0, zz, 0, () => {   // mini-deuren als hindernissen
        D.box(1.5 * s, 0.14, 0.9, 0, 0.07, 0, 0x6b4a2e); D.box(1.3 * s, 2.1 * s, 0.16, 0, 1.05 * s + 0.14, 0, c); D.box(1.5 * s, 0.14, 0.24, 0, 2.2 * s + 0.2, 0, GOLD, null); D.sph(0.1 * s, 0.4 * s, 1.1 * s, 0.14, GOLD, null, 6); }));
      for (const sx of [-1, 1]) { D.cyl(0.14, 0.16, 5.6, 8, sx * 7.4, 2.8, 0.2, 0xd8d8e0); D.box(14.8, 0.9, 0.06, 0, 5.4, 0.2, 0xffffff); }
      for (let i = 0; i < 14; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) D.box(1.057, 0.45, 0.07, -7.4 + 0.528 + i * 1.057, 5.65 - j * 0.45, 0.22, 0x111111);
      for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) D.tor(0.5, 0.24, sx * 7.9, 0.26 + i * 0.46, 4.0, 0x1a1a22, { rx: PI / 2 }, 12);
    });
    for (const [x, zz] of [[-5.2, 3.6], [-2.6, 5.2], [0, 3.8], [2.6, 5.4], [5.2, 3.8]]) col(a, z.cx + x, z.cz + zz, 0.5); col(a, z.cx - 7.4, z.cz + 0.2, 0.3); col(a, z.cx + 7.4, z.cz + 0.2, 0.3);
  },
  ddisco(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      for (let i = 0; i < 9; i++) D.box(1.1, 0.05, 1.1, -1.2 + (i % 3) * 1.2, 0.07, 3.6 + Math.floor(i / 3) * 1.2, [0xff7ab0, 0x5ad8ff, 0xffe14a, 0xb06aff][(i * 2 + Math.floor(i / 3)) % 4], { kind: p(i) });
      D.cyl(0.07, 0.07, 4.8, 6, -6.4, 2.4, 3.6, 0xcccccc, null); D.sph(0.9, -6.4, 5.4, 3.6, 0xdddddd, null, 8);
      for (const sx of [-1, 1]) { D.cyl(0.1, 0.12, 4.0, 6, sx * 7.4, 2.0, 5.8, 0x555566, null); D.cone(0.5, 0.9, 6, sx * 7.4, 4.3, 5.8, 0x222233, { rx: PI * 0.8 }); D.sph(0.2, sx * 7.4, 3.9, 6.1, sx > 0 ? 0xff2bd6 : 0x00e5ff, { kind: p(sx > 0 ? 1 : 2) }, 6); }
      D.box(2.2, 3.4, 1.2, 6.6, 1.7, 0.8, 0x10162c); for (const yy of [0.9, 2.3]) D.cyl(0.55, 0.55, 0.1, 12, 6.6, yy, 1.42, yy > 1.5 ? 0xff2bd6 : 0x00e5ff, { kind: p(yy > 1.5 ? 1 : 2), rx: PI / 2 });
      for (let i = 0; i < 5; i++) D.sph(0.14, -2.6 + i * 1.3, 0.14, 8.0 - (i % 2) * 0.3, [0xff7ab0, 0x5ad8ff, 0xffe14a][i % 3], { kind: p(i) }, 5);
    });
    col(a, z.cx - 6.4, z.cz + 3.6, 0.6); col(a, z.cx - 7.4, z.cz + 5.8, 0.4); col(a, z.cx + 7.4, z.cz + 5.8, 0.4); col(a, z.cx + 6.6, z.cz + 0.8, 1.3);
  },
};

// ---------------------------------------------------------------- vaste onderdelen van de hal
export function deurShell(a, D) { /* de deuren zelf zitten in het muurbehang; naamplaat zit op de boog (deurBack) */ }

export function deurCenter(a, D, CZ, C) {   // het Wiel op een gouden deurknop-sokkel, rondom mini-deuren
  D.cyl(4.5, 4.8, 0.5, 30, 0, 0.25, CZ, 0xffb3d1); D.cyl(3.8, 4.0, 0.7, 30, 0, 0.85, CZ, GOLD, null); D.cyl(1.1, 1.5, 0.6, 14, 0, 1.45, CZ, GOLD, null);
  D.tor(4.05, 0.14, 0, 1.2, CZ, 0xfff0a0, { rx: PI / 2, kind: 'p0' }, 30);
  for (let i = 0; i < 12; i++) {
    const an = i / 12 * TAU, x = Math.cos(an) * 6.1, z = CZ + Math.sin(an) * 6.1;
    D.at(x, 0, z, -an + PI / 2, () => { D.box(1.5, 0.14, 0.7, 0, 0.07, 0, 0xf2d8e8); D.box(1.1, 2.0, 0.14, 0, 1.1, 0, PASTEL[i % 6]); D.box(1.35, 0.14, 0.22, 0, 2.15, 0, GOLD, null); D.sph(0.1, 0.35, 1.1, 0.12, GOLD, null, 6); D.sph(0.08, 0, 2.35, 0, 0xfff0a0, { kind: p(i) }, 5); });
    col(a, x, z, 0.5);
  }
}

export function deurBack(a, D, zb) {   // podium van de Deurman: gouden deuropening met gloed, naamplaat, rond podium
  for (const sx of [-1, 1]) D.box(0.9, 10.4, 1.0, sx * 4.1, 5.2, zb + 0.6, GOLD, null);
  D.box(9.2, 1.5, 1.0, 0, 11.15, zb + 0.6, GOLD, null); D.tri(9.6, 1.7, 0, 11.9, zb + 0.6, 0xffd96a, { kind: 'dbl', rz: PI }); D.sph(0.35, 0, 13.9, zb + 0.6, 0xffffff, { kind: 'p1' }, 8);
  D.box(7.3, 10.4, 0.12, 0, 5.2, zb + 0.5, 0xfff6c0, { kind: 'p0' });
  for (let i = 0; i < 9; i++) D.sph(0.14, -3.8 + i * 0.95, 10.35, zb + 1.2, 0xfff0a0, { kind: p(i) }, 5);
  const t = canvasTex(512, 80, (g, w, h) => { g.fillStyle = '#7a3a8a'; g.fillRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 62px Fredoka, Arial Black, sans-serif'; g.lineWidth = 10; g.lineJoin = 'round'; g.strokeStyle = '#3a1050'; g.strokeText('DEURENHAL', w / 2, h / 2 + 3, w - 30); g.fillStyle = '#ffe9a0'; g.fillText('DEURENHAL', w / 2, h / 2 + 3, w - 30); });
  a.scene.add(mesh(new THREE.PlaneGeometry(8.4, 1.3), new THREE.MeshBasicMaterial({ map: t }), { cast: false, receive: false, pos: [0, 11.15, zb + 1.15] }));
  D.cyl(3.4, 3.7, 0.9, 26, 0, 0.45, zb + 3.7, 0xffb3d1); D.cyl(3.0, 3.2, 0.2, 26, 0, 0.95, zb + 3.7, GOLD, null);
  for (let i = 0; i < 16; i++) { const an = i / 16 * TAU; D.sph(0.15, Math.cos(an) * 3.55, 0.6, zb + 3.7 + Math.sin(an) * 3.55, 0xfff0a0, { kind: p(i) }, 5); }
  a.colliders.push({ x: 0, z: zb + 3.7, r: 3.5 });
  a.king = makeDeurman(1.3, { outfit: 'feest' }); a.king.group.position.set(0, 1.05, zb + 3.7);
}

// ---------------------------------------------------------------- dynamisch: zwevende deuren, spiegels, deurbel, grote deurknop
export class DeurHall {
  constructor(a) {
    this.a = a; this.t = 0; const sc = a.scene; this.spin = 0; this.peekT = 0; this.knobT = 0;
    // zwevende deuren: bladen (kleur per instantie) + gouden kozijn (vertexkleuren)
    this.spots = [[-9, -10, 9], [9, -10, 10.5], [0, -13.5, 11.5], [-10, 7, 8.6], [10, 7, 9.6], [-4, 15, 8], [5, 13.5, 10], [-24, 1, 9.6], [24, 1, 10.4]];
    const N = this.spots.length; const fr = new Deco();
    fr.box(0.2, 3.5, 0.34, -0.85, 0, 0, GOLD, null); fr.box(0.2, 3.5, 0.34, 0.85, 0, 0, GOLD, null); fr.box(1.9, 0.2, 0.34, 0, 1.65, 0, GOLD, null); fr.sph(0.13, 0.5, -0.1, 0.15, 0xfff0a0, null, 6);
    this.leaf = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 3.1, 0.14), new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true }), N);
    this.frame = new THREE.InstancedMesh(fr.merged('lit'), new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.4, metalness: 0.1, emissive: 0x4a3600 }), N);
    for (const m of [this.leaf, this.frame]) { m.frustumCulled = false; m.castShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sc.add(m); }
    this.spots.forEach((s, i) => this.leaf.setColorAt(i, new THREE.Color(PASTEL[i % 6]))); this.leaf.instanceColor.needsUpdate = true;
    this.fl = this.spots.map((s, i) => ({ x: s[0], z: s[1], y0: s[2], ph: i * 1.7, dir: i % 2 ? 1 : -1 }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1);
    // spiegels langs de zijmuren met een schuivend glansje (1 draw call)
    const mt = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#bfe4ff'); gr.addColorStop(0.5, '#f4fbff'); gr.addColorStop(1, '#9ac8f0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.65)'; for (const y of [30, 150]) { g.beginPath(); g.moveTo(0, y + 40); g.lineTo(w, y); g.lineTo(w, y + 22); g.lineTo(0, y + 62); g.fill(); } });
    mt.wrapS = mt.wrapT = THREE.RepeatWrapping; this.mirrorTex = mt; const zs = [-11.4, -3.2, 5.0, 13.2]; const Dm = new Deco();
    this.mir = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.9, 7), new THREE.MeshBasicMaterial({ map: mt }), zs.length * 2); this.mir.frustumCulled = false;
    let k = 0; for (const sx of [-1, 1]) for (const zz of zs) { this._e.set(0, -sx * PI / 2, 0); this._q.setFromEuler(this._e); this.mir.setMatrixAt(k++, this._m.compose(this._p.set(sx * (a.W / 2 - 0.12), 6.6, zz), this._q, this._s));
      Dm.at(sx * (a.W / 2 - 0.1), 6.6, zz, -sx * PI / 2, () => { Dm.box(0.3, 7.6, 0.24, -1.6, 0, 0, GOLD, null); Dm.box(0.3, 7.6, 0.24, 1.6, 0, 0, GOLD, null); Dm.box(3.5, 0.3, 0.24, 0, 3.7, 0, GOLD, null); Dm.box(3.5, 0.3, 0.24, 0, -3.7, 0, GOLD, null); }); }
    sc.add(this.mir); Dm.build(sc, { shadow: false });
    // deurbel-pilaar (linksvoor) met een mini-deurtje waar de Deurman uit kijkt
    this.bell = new THREE.Group(); this.bell.userData.dynamic = true; this.bell.position.set(-7.4, 0, 14.6); sc.add(this.bell);
    const B = new Deco(); B.box(1.4, 3.4, 1.0, 0, 1.7, 0, 0xffb3d1); B.box(1.7, 0.3, 1.3, 0, 3.55, 0, GOLD, null); B.box(1.7, 0.3, 1.3, 0, 0.15, 0, GOLD, null); B.cyl(0.2, 0.2, 0.12, 10, 0.4, 1.3, 0.55, 0xd8372c, { rx: PI / 2 }); B.sph(0.08, 0.4, 1.3, 0.62, 0xffffff, null, 5); B.box(0.5, 0.12, 0.04, -0.15, 1.9, 0.52, 0xfff6c0); B.build(this.bell);
    this.miniDoor = new THREE.Group(); this.miniDoor.position.set(-0.45, 0.4, 0.52); this.bell.add(this.miniDoor); this.miniDoor.add(mesh(new THREE.BoxGeometry(0.55, 0.9, 0.06), mat(0x4aa8e8), { pos: [0.275, 0.45, 0] }));
    this.peekLbl = floatLabel('👀', '', '#fff'); this.peekLbl.scale.set(1.6, 0.5, 1); this.peekLbl.position.set(-7.4, 4.2, 15.2); this.peekLbl.visible = false; sc.add(this.peekLbl);
    a.colliders.push({ x: -7.4, z: 14.6, r: 1.0 });
    // grote deurknop rechtsvoor: draaien = feest
    this.knob = new THREE.Group(); this.knob.userData.dynamic = true; this.knob.position.set(-25, 0, 17.6); sc.add(this.knob);
    const K = new Deco(); K.cyl(0.9, 1.1, 0.3, 14, 0, 0.15, 0, 0xffb3d1); K.cyl(0.35, 0.35, 1.3, 10, 0, 0.8, 0, GOLD, null); K.build(this.knob);
    this.kh = new THREE.Group(); this.kh.position.set(0, 1.8, 0); this.knob.add(this.kh); const KD = new Deco(); KD.sph(0.95, 0, 0, 0, GOLD, null, 10); KD.box(0.2, 0.2, 0.5, 0, 0, 0.8, 0xfff0a0, null); KD.build(this.kh);
    a.colliders.push({ x: -25, z: 17.6, r: 1.1 });
    const kl = floatLabel('🔔 Deurbel', 'ding-dong?', '#ffb3d1'); kl.scale.set(3.0, 0.95, 1); kl.position.set(-7.4, 5.4, 14.6); sc.add(kl);
    const kk = floatLabel('🚪 Gouden knop', 'draaien!', '#ffe14a'); kk.scale.set(3.0, 0.95, 1); kk.position.set(-25, 4.9, 17.6); sc.add(kk);
    a.eggs.push({ id: 'deurbel', type: 'deurbel', x: -7.4, z: 16.6, r: 2.2, label: 'Aanbellen (er is vast niemand thuis)' }, { id: 'klink', type: 'klink', x: -23.2, z: 17.6, r: 2.2, label: 'Aan de gouden deurknop draaien' });
  }
  peek() { this.peekT = 3.2; this.peekLbl.visible = true; audio.sfx('doorbell'); setTimeout(() => audio.sfx('squeak'), 600); }
  turn() { this.knobT = 1.2; this.spin = 4; audio.sfx('creak'); setTimeout(() => audio.sfx('doorbell'), 700); }
  update(dt, k = 0) {
    this.t += dt; const t = this.t; this.spin = Math.max(0, this.spin - dt); const sp = 1 + this.spin * 3.2; const m = this._m, q = this._q, e = this._e, pp = this._p, sv = this._s;
    this.fl.forEach((d, i) => { d.ang = (d.ang || d.ph) + dt * 0.35 * d.dir * sp; e.set(0, d.ang, Math.sin(t * 0.5 + d.ph) * 0.14); q.setFromEuler(e); m.compose(pp.set(d.x, d.y0 + Math.sin(t * 0.8 + d.ph) * 0.55, d.z), q, sv.setScalar(1.4)); this.leaf.setMatrixAt(i, m); this.frame.setMatrixAt(i, m); });
    this.leaf.instanceMatrix.needsUpdate = true; this.frame.instanceMatrix.needsUpdate = true;
    this.mirrorTex.offset.y = (t * 0.06) % 1;
    if (this.peekT > 0) { this.peekT -= dt; const o = Math.min(1, (3.2 - this.peekT) * 2.4); this.miniDoor.rotation.y = -1.9 * (this.peekT > 0.5 ? o : this.peekT * 2); this.peekLbl.position.y = 4.2 + Math.sin(t * 6) * 0.08; if (this.peekT <= 0) { this.miniDoor.rotation.y = 0; this.peekLbl.visible = false; } }
    if (this.knobT > 0) { this.knobT -= dt; this.kh.rotation.z = (1 - Math.max(0, this.knobT) / 1.2) * 1.6; } else this.kh.rotation.z = damp(this.kh.rotation.z, 0, 4, dt);
  }
}

// ---------------------------------------------------------------- de Deurman-meme-teksten van de gastheer
export const DEUR_HOST = {
  hello: ['Klop klop. Wie is daar? Ik. De Deurman. Ik woon hier.', 'Welkom in mijn hal! Alle deuren zijn open. Behalve die ene. Die klemt.', 'Doe maar gewoon open. Ik bedoel: doe maar gewoon spelen.', 'Ik heb een deur. Jullie hebben een deur. Wij hebben allemaal deuren. Wat een fijne dag.'],
  wins: ['{w} wint! {w} krijgt een gouden deurknop. {l} krijgt een deurmat. Dat is ook heel mooi.', '{w} was sneller dan een deur die dichtvalt. {l}... ook goed bezig. Een beetje.', 'Deur. Open. Dicht. {w} wint. Dat was het.', 'Ik zag {w} winnen. Ik zag {l} niet winnen. Ik zie alles. Het is een deur-ding.', '{w} wint! Ik wil een high-five, maar mijn handen zitten in de deur.'],
  draw: ['Gelijkspel! Dat is net een deur die half openstaat. Mooi in balans.', 'Gelijk! Dan houden we de deur gewoon nog even open.'],
};
