// Decor voor de speelhallen: kleden, zonebord, zone-props, hal-schil (ramen, pilaren, spandoeken, vlaggetjes) en middenplein-onderdelen.
// Alles gaat via Deco (samengevoegd). Functies krijgen de ArcadeMode (a) zodat ze colliders / levende onderdelen kunnen registreren.
import * as THREE from 'three';
import { canvasTex, TAU, mulberry32 } from '../engine/util.js';

const PI = Math.PI;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const col = (a, x, z, r) => a.colliders.push({ x, z, r });

// ---------------------------------------------------------------- texturen
export function rugTexture(kind, c1, c2, name = '') {
  const rnd = mulberry32(c1 ^ (c2 << 3) ^ kind.length * 77);
  return canvasTex(512, 512, (g, w) => {
    const m = w / 2, R = w / 2; g.save(); g.beginPath(); g.arc(m, m, R, 0, TAU); g.clip();
    const rings = (cols, n) => { for (let i = n; i >= 1; i--) { g.fillStyle = cols[i % cols.length]; g.beginPath(); g.arc(m, m, R * i / n, 0, TAU); g.fill(); } };
    const star = (x, y, r, rot = 0) => { g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r; const a = rot + i * PI / 5 - PI / 2; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    if (kind === 'target') { rings([hex(c2), hex(c1)], 7); g.fillStyle = '#ffd23f'; star(m, m, 56); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; for (let i = 1; i <= 7; i++) { g.beginPath(); g.arc(m, m, R * i / 7, 0, TAU); g.stroke(); } }
    else if (kind === 'stars') { g.fillStyle = '#16225a'; g.fillRect(0, 0, w, w); g.strokeStyle = hex(c2); g.lineWidth = 6; for (const k of [0.92, 0.72]) { g.beginPath(); g.arc(m, m, R * k, 0, TAU); g.stroke(); } g.fillStyle = hex(c1); g.beginPath(); g.arc(m, m, R * 0.5, 0, TAU); g.fill(); g.fillStyle = hex(c2); star(m, m, 110); for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, r = R * (i % 2 ? 0.62 : 0.82); star(m + Math.cos(a) * r, m + Math.sin(a) * r, 16 + (i % 3) * 5, a); } }
    else if (kind === 'track') {
      g.fillStyle = '#2a2d36'; g.fillRect(0, 0, w, w); g.fillStyle = hex(c1); g.beginPath(); g.arc(m, m, R, 0, TAU); g.arc(m, m, R * 0.9, 0, TAU, true); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 12; g.setLineDash([34, 26]); g.beginPath(); g.ellipse(m, m, R * 0.78, R * 0.52, 0, 0, TAU); g.stroke(); g.strokeStyle = '#ffd23f'; g.beginPath(); g.ellipse(m, m, R * 0.46, R * 0.22, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#fff' : '#111'; g.fillRect(m + R * 0.52 + j * 22, m - 88 + i * 22, 22, 22); }
      g.fillStyle = '#ffd23f'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(m - R * 0.72 + i * 26, m - 24); g.lineTo(m - R * 0.72 + i * 26 + 18, m); g.lineTo(m - R * 0.72 + i * 26, m + 24); g.lineTo(m - R * 0.72 + i * 26 + 8, m); g.fill(); }
    }
    else if (kind === 'dots') { g.fillStyle = '#4a1a8a'; g.fillRect(0, 0, w, w); const cs = ['#ff5ad8', '#ffe14a', '#5ad8ff', '#7bff7b', '#ff8a1c']; for (let i = 0; i < 70; i++) { g.fillStyle = cs[i % 5]; g.beginPath(); g.arc(rnd() * w, rnd() * w, 14 + rnd() * 26, 0, TAU); g.fill(); } g.strokeStyle = hex(c2); g.lineWidth = 14; g.beginPath(); g.arc(m, m, R * 0.94, 0, TAU); g.stroke(); }
    else if (kind === 'led') { g.fillStyle = '#080e26'; g.fillRect(0, 0, w, w); g.strokeStyle = 'rgba(0,229,255,.7)'; g.lineWidth = 3; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * w / 8, 0); g.lineTo(i * w / 8, w); g.moveTo(0, i * w / 8); g.lineTo(w, i * w / 8); g.stroke(); } g.strokeStyle = hex(c1); g.lineWidth = 14; for (const k of [0.94, 0.62, 0.3]) { g.beginPath(); g.arc(m, m, R * k, 0, TAU); g.stroke(); } g.fillStyle = hex(c2); g.beginPath(); g.arc(m, m, 28, 0, TAU); g.fill(); }
    else if (kind === 'ring') { g.fillStyle = '#3a0c16'; g.fillRect(0, 0, w, w); g.strokeStyle = hex(c2); g.lineWidth = 12; g.beginPath(); g.arc(m, m, R * 0.92, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,74,58,.55)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(m, m); g.arc(m, m, R * 0.9, i * TAU / 12, (i + 0.5) * TAU / 12); g.fill(); } }
    else if (kind === 'puzzle') { const cs = ['#7bff00', '#00e5ff', '#ffe14a', '#ff2bd6', '#ff8a1c', '#b05aff']; g.fillStyle = '#0c2a18'; g.fillRect(0, 0, w, w); for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) { g.fillStyle = cs[(i * 3 + j * 5) % 6]; g.globalAlpha = 0.85; g.fillRect(i * w / 6 + 6, j * w / 6 + 6, w / 6 - 12, w / 6 - 12); g.beginPath(); g.arc(i * w / 6 + w / 12, j * w / 6 + 6, 14, 0, TAU); g.fill(); g.globalAlpha = 1; } g.strokeStyle = hex(c2); g.lineWidth = 12; g.beginPath(); g.arc(m, m, R * 0.95, 0, TAU); g.stroke(); }
    else if (kind === 'court') { g.fillStyle = '#126b3a'; g.fillRect(0, 0, w, w); g.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 8; i += 2) g.fillRect(i * w / 8, 0, w / 8, w); g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(w * 0.1, w * 0.26, w * 0.8, w * 0.48); g.beginPath(); g.moveTo(m, w * 0.26); g.lineTo(m, w * 0.74); g.stroke(); g.beginPath(); g.arc(m, m, w * 0.1, 0, TAU); g.stroke(); g.strokeRect(w * 0.1, w * 0.38, w * 0.12, w * 0.24); g.strokeRect(w * 0.78, w * 0.38, w * 0.12, w * 0.24); g.strokeStyle = hex(c1); g.lineWidth = 14; g.beginPath(); g.arc(m, m, R * 0.95, 0, TAU); g.stroke(); }
    else { g.fillStyle = '#d4b274'; g.fillRect(0, 0, w, w); for (let i = 0; i < 700; i++) { g.fillStyle = ['#b8955a', '#f0d898', '#c9a463'][i % 3]; g.fillRect(rnd() * w, rnd() * w, 5 + rnd() * 9, 2 + rnd() * 2); } g.strokeStyle = hex(c1); g.lineWidth = 14; g.setLineDash([28, 18]); g.beginPath(); g.arc(m, m, R * 0.93, 0, TAU); g.stroke(); g.setLineDash([]); g.strokeStyle = hex(c2); g.lineWidth = 6; g.beginPath(); g.arc(m, m, R * 0.8, 0, TAU); g.stroke(); }
    g.restore(); g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 6; g.beginPath(); g.arc(m, m, R - 3, 0, TAU); g.stroke();
    if (name) { g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 66px Fredoka, Arial Black, sans-serif'; g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = 'rgba(20,8,40,.9)'; g.strokeText(name.toUpperCase(), m, w * 0.885, w * 0.7); g.fillStyle = '#fff'; g.fillText(name.toUpperCase(), m, w * 0.885, w * 0.7); }
  });
}
// groot zwevend zonebord (sprite)
export function zoneSign(z) {
  const t = canvasTex(1024, 320, (g, w, h) => {
    const rr = (x, y, ww, hh, r) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); };
    g.fillStyle = 'rgba(0,0,0,.35)'; rr(14, 22, w - 28, h - 30, 56); g.fill();
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, hex(z.color)); gr.addColorStop(1, hex(z.color2)); g.fillStyle = gr; rr(10, 8, w - 20, h - 28, 56); g.fill();
    g.fillStyle = 'rgba(20,8,40,.82)'; rr(34, 30, w - 68, h - 72, 40); g.fill();
    g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = '150px serif'; g.fillText(z.icon, 150, 150);
    g.font = 'bold 118px Fredoka, Arial Black, sans-serif'; g.lineWidth = 14; g.lineJoin = 'round'; g.strokeStyle = 'rgba(25,10,35,.95)'; g.strokeText(z.name, 600, 128, 700); g.fillStyle = '#fff'; g.fillText(z.name, 600, 128, 700);
    g.font = 'bold 50px Fredoka, Arial, sans-serif'; g.fillStyle = hex(z.color2 === 0x1a1a22 ? z.color : z.color2); g.fillText(z.sub, 600, 220, 700);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(7.0, 2.2, 1); sp.renderOrder = 14;
  return sp;
}

// ---------------------------------------------------------------- hulpjes
export function bunting(D, x0, y0, z0, x1, y1, z1, cols, n = 14, sag = 1.0, size = 0.7) {
  const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ry = -Math.atan2(dz, dx);
  let px = x0, py = y0, pz = z0;
  for (let i = 0; i <= n; i++) {
    const t = i / n; const x = x0 + dx * t, z = z0 + dz * t, y = y0 + (y1 - y0) * t - Math.sin(t * PI) * sag;
    D.at((px + x) / 2, (py + y) / 2, (pz + z) / 2, ry, () => D.box(len / n + 0.04, 0.05, 0.05, 0, 0, 0, 0x5b3d24, { rz: Math.atan2(y - py, len / n) }));
    if (i > 0 && i < n) D.at(x, y - 0.02, z, ry, () => D.tri(size, size * 1.15, 0, 0, 0, cols[i % cols.length], { kind: 'dbl' }));
    px = x; py = y; pz = z;
  }
}
export function lampString(D, x0, y0, z0, x1, y1, z1, n = 18, sag = 1.0) {
  for (let i = 0; i <= n; i++) { const t = i / n; D.sph(0.2, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * PI) * sag, z0 + (z1 - z0) * t, [0xffd23f, 0xff7ab0, 0x7be0ff, 0xffa030][i % 4], { kind: 'p' + (i % 3) }, 6); }
}
const flagPole = (D, x, z, c1, c2 = 0xf6f0e0, h = 6.2) => { D.cyl(0.08, 0.1, h, 6, x, h / 2, z, 0xcfa060); D.sph(0.16, x, h + 0.1, z, 0xffd23f, { kind: 'glow' }, 6); D.tri(1.6, 1.0, x + 0.8, h - 0.1, z, c1, { kind: 'dbl', rz: PI / 2 }); D.tri(1.1, 0.7, x + 0.55, h - 1.05, z, c2, { kind: 'dbl', rz: PI / 2 }); };

// ---------------------------------------------------------------- zone-props
export const ZONE_PROPS = {
  arena(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.box(1.5, 1.0, 1.5, 0, 0.5, 1.4, 0xffd23f); D.box(1.5, 0.7, 1.5, -1.6, 0.35, 1.4, 0xc0c0c8); D.box(1.5, 0.5, 1.5, 1.6, 0.25, 1.4, 0xcd7f32);
      D.cyl(0.35, 0.2, 0.5, 8, 0, 1.25, 1.4, 0xffd23f, { kind: 'metal' }); D.sph(0.28, 0, 1.7, 1.4, 0xffd23f, { kind: 'p1' }, 8);
      for (const [i, t] of [[0, '1'], [-1.6, '2'], [1.6, '3']].map((q) => q)) D.box(0.3, 0.3, 0.05, i, 0.55 - (i === 0 ? 0 : 0.15), 2.2, 0xffffff);
      flagPole(D, -7.6, -0.4, 0xd8372c); flagPole(D, 7.6, -0.4, 0x2f6fe0);
      for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) D.sph(0.36, 5.4 + i * 0.75 + r * 0.37, 0.36 + r * 0.6, 4.4, [0xd8372c, 0xffe14a, 0x2f6fe0][(i + r) % 3], null, 8);
      D.tor(0.9, 0.12, -4.6, 0.12, 3.8, 0xc9a86a, { rx: PI / 2 }, 12); D.tor(0.65, 0.12, -4.6, 0.24, 3.8, 0xc9a86a, { rx: PI / 2 }, 12);
      D.box(0.2, 0.2, 1.8, -5.8, 0.12, 4.7, 0xc9a86a, { ry: 0.6 });
      for (let i = 0; i < 8; i++) D.sph(0.17, Math.cos(i / 8 * TAU) * 6.7, 0.17, Math.sin(i / 8 * TAU) * 6.7 + 0.5, 0xffffff, { kind: 'p' + (i % 3) }, 6);
    });
    col(a, z.cx - 1.6, z.cz + 1.4, 0.95); col(a, z.cx, z.cz + 1.4, 0.95); col(a, z.cx + 1.6, z.cz + 1.4, 0.95); col(a, z.cx + 5.8, z.cz + 4.4, 0.9);
  },
  denk(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.cyl(1.35, 1.35, 0.16, 14, 0, 1.15, 5.6, 0x7a4a24); D.cyl(0.2, 0.3, 1.1, 8, 0, 0.55, 5.6, 0x5b3d24); D.cyl(0.5, 0.5, 0.1, 10, 0, 0.05, 5.6, 0x5b3d24);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) D.box(0.36, 0.04, 0.36, -0.54 + i * 0.36, 1.25, 5.06 + j * 0.36, (i + j) % 2 ? 0x1a1a22 : 0xf6f0e0);
      for (const [px, pz, c] of [[-0.54, 5.06, 0xf6f0e0], [0.18, 5.42, 0x1a1a22], [0.54, 5.78, 0xf6f0e0], [-0.18, 6.14, 0x1a1a22]]) { D.cyl(0.1, 0.13, 0.3, 6, px, 1.42, pz, c); D.sph(0.1, px, 1.64, pz, c, null, 6); }
      for (const sx of [-1, 1]) { D.cyl(0.4, 0.4, 0.75, 8, sx * 2.1, 0.38, 5.6, 0x2f6fe0); }
      D.cyl(0.08, 0.1, 4.6, 6, 0, 2.3, 8.2, 0xcfa060); D.sph(0.7, 0, 5.2, 8.2, 0xffee90, { kind: 'p1' }, 10); D.cyl(0.2, 0.25, 0.3, 8, 0, 4.55, 8.2, 0x888899);
      for (const sx of [-1, 1]) { D.cyl(0.07, 0.09, 3.6, 6, sx * 7.0, 1.8, 3.0, 0xcfa060); D.sph(0.32, sx * 7.0, 3.8, 3.0, 0xffe14a, { kind: 'p' + (sx > 0 ? 0 : 2) }, 8); }
      D.sph(0.7, -8.2, 1.2, 5.0, 0x2f9be0, null, 10); D.tor(0.8, 0.07, -8.2, 1.2, 5.0, 0xcfa060, { rx: 1.2 }, 14); D.box(0.9, 0.2, 0.9, -8.2, 0.1, 5.0, 0x5b3d24);
      for (let i = 0; i < 3; i++) D.box(0.9 - i * 0.1, 0.22, 0.65, 6.4, 0.12 + i * 0.22, 5.4, [0xd8372c, 0x2f9be0, 0xffd23f][i], { ry: i * 0.4 });
    });
    col(a, z.cx, z.cz + 5.6, 1.5); col(a, z.cx, z.cz + 8.2, 0.4);
  },
  race(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      for (const sx of [-1, 1]) {   // startvlaggen aan de uiteinden van de rij
        D.cyl(0.14, 0.16, 6.0, 8, sx * 10.2, 3.0, -8.4, 0xd8d8e0);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) D.box(0.5, 0.5, 0.05, sx * (10.2 - 0.35 - i * 0.5), 5.6 - j * 0.5, -8.4, (i + j) % 2 ? 0xffffff : 0x111111);
        D.sph(0.22, sx * 10.2, 6.2, -8.4, sx > 0 ? 0x2fff6a : 0xff2a1a, { kind: 'p' + (sx > 0 ? 0 : 2) }, 8);
      }
      for (const [px, pz] of [[-9.5, 6.2], [9.5, 6.2], [-9.8, -7.2], [9.8, -7.2]]) { for (let i = 0; i < 3; i++) { D.tor(0.5, 0.24, px, 0.26 + i * 0.5, pz, 0x1a1a22, { rx: PI / 2 }, 12); } D.tor(0.5, 0.245, px, 0.26, pz, 0xf6f0e0, { rx: PI / 2 }, 12, 1.2); }
      for (let i = 0; i < 5; i++) { D.cone(0.28, 0.7, 6, -6 + i * 3, 0.35, 5.6 - Math.sin(i) * 0.4, 0xff8a1c); D.cyl(0.34, 0.34, 0.08, 6, -6 + i * 3, 0.04, 5.6 - Math.sin(i) * 0.4, 0xf6f0e0); }
      D.box(2.2, 0.9, 1.2, 7.4, 0.55, -8.4, 0xd8372c); D.box(2.4, 0.12, 1.3, 7.4, 1.05, -8.4, 0xf6f0e0); D.cyl(0.3, 0.3, 0.2, 8, 8.4, 0.3, -7.7, 0x222233, { rz: PI / 2 }); D.cyl(0.3, 0.3, 0.2, 8, 6.4, 0.3, -7.7, 0x222233, { rz: PI / 2 });
    });
    col(a, z.cx + 7.4, z.cz - 8.4, 1.3);
  },
  gek(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.sph(1.25, 0, 1.25, 3.4, 0xffe14a, { sy: 0.9 }, 10); D.sph(0.75, 0.2, 2.65, 3.9, 0xffe14a, null, 10); D.cone(0.28, 0.65, 5, 0.2, 2.6, 4.65, 0xff8a1c, { rx: PI / 2 }); D.sph(0.14, 0.0, 2.9, 4.5, 0x111111, null, 5); D.sph(0.14, 0.45, 2.9, 4.5, 0x111111, null, 5); D.cone(0.5, 0.8, 4, 0.0, 1.4, 2.2, 0xffe14a, { rx: -1.9 });
      for (const [px, pz, rz, c, h] of [[-7.8, 4.2, 0.35, 0xff5ad8, 4.4], [6.6, 5.6, -0.3, 0x5ad8ff, 3.6], [-3.6, 7.2, 0.15, 0x7bff7b, 3.2]]) { D.cyl(0.07, 0.07, h, 5, px, h / 2, pz, 0xcfa060, { rz }); D.sph(0.4, px - Math.sin(rz) * h * 0.55, h + 0.2, pz, c, { kind: 'p' + (c % 3) }, 5); }
      for (const sx of [-1, 1]) { D.box(1.9, 3.4, 0.14, sx * 8.4, 1.8, 3.2, 0xb0b8c8, { kind: 'metal', ry: sx * 0.9, rz: sx * 0.08 }); D.box(1.7, 3.2, 0.05, sx * 8.4 - sx * 0.1, 1.8, 3.28, 0xcfeaff, { kind: 'glow', ry: sx * 0.9 }); }
      D.cyl(0.04, 0.04, 1.4, 4, 4.5, 0.7, 6.5, 0xcccccc, { kind: 'metal' }); D.cyl(0.25, 0.25, 0.1, 8, 4.5, 1.45, 6.5, 0xd8372c); D.sph(0.4, 4.5, 2.1, 6.5, 0xff8a1c, null, 8);
      for (let i = 0; i < 6; i++) D.cone(0.2, 0.5, 5, -6 + i * 2.4, 0.25, 9.0 + (i % 2) * 0.5, [0xff5ad8, 0xffe14a, 0x5ad8ff][i % 3], { rz: (i % 3 - 1) * 0.5 });
    });
    col(a, z.cx, z.cz + 3.4, 1.5); col(a, z.cx - 7.8, z.cz + 4.2, 0.3);
    // easter egg: de rode knop
    a.eggs.push({ id: 'knop', type: 'knop', x: z.cx + 8.4, z: z.cz + 4.6, r: 2.4, label: 'Op de rode knop drukken (stond er niet "niet doen"?)' });
    D.at(z.cx + 8.4, 0, z.cz + 6.2, 0, () => { D.cyl(0.5, 0.6, 1.1, 10, 0, 0.55, 0, 0x777788, { kind: 'metal' }); D.cyl(0.36, 0.36, 0.2, 10, 0, 1.2, 0, 0xff2a1a, { kind: 'p0' }); D.box(0.9, 0.5, 0.05, 0, 1.5, -0.55, 0xffffff, { rx: -0.6 }); });
    col(a, z.cx + 8.4, z.cz + 6.2, 0.7);
  },
  dans(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      for (const sx of [-1, 1]) { D.box(1.5, 3.7, 1.4, sx * 7.4, 1.85, -1.4, 0x10162c); for (const [yy, c] of [[1.2, 0x00e5ff], [2.7, 0xff2bd6]]) { D.cyl(0.55, 0.55, 0.1, 12, sx * 7.4, yy, -0.68, c, { kind: 'p' + (yy > 2 ? 1 : 0), rx: PI / 2 }); } }
      D.cyl(0.07, 0.07, 5.2, 6, 0, 2.6, 3.4, 0xcccccc, { kind: 'metal' }); D.sph(0.95, 0, 5.8, 3.4, 0xdddddd, { kind: 'metal' }, 6);
      D.tor(2.6, 0.12, 0, 2.8, 6.8, 0xff2bd6, { kind: 'p0' }, 20, PI); D.cyl(0.12, 0.12, 2.8, 6, -2.6, 1.4, 6.8, 0x222233); D.cyl(0.12, 0.12, 2.8, 6, 2.6, 1.4, 6.8, 0x222233);
      for (let i = 0; i < 9; i++) D.box(0.9, 0.04, 0.9, -1.8 + (i % 3) * 1.8, 0.07, 1.4 + Math.floor(i / 3) * 1.8, [0xff2bd6, 0x00e5ff, 0xffe14a][(i * 2 + Math.floor(i / 3)) % 3], { kind: 'p' + (i % 3) });
    });
    col(a, z.cx, z.cz + 3.4, 0.5); col(a, z.cx - 7.4, z.cz - 1.4, 0.9); col(a, z.cx + 7.4, z.cz - 1.4, 0.9); col(a, z.cx - 2.6, z.cz + 6.8, 0.3); col(a, z.cx + 2.6, z.cz + 6.8, 0.3);
  },
  ring(a, D, z) {
    D.at(z.cx, 0, z.cz + 2.4, 0, () => {
      D.box(5.8, 0.3, 5.8, 0, 0.15, 0, 0x2a2f55); D.box(5.4, 0.34, 5.4, 0, 0.17, 0, 0xc02a2a); D.box(5.8, 0.34, 0.2, 0, 0.17, 2.8, 0xf6f0e0); D.box(0.2, 0.34, 5.8, -2.8, 0.17, 0, 0xf6f0e0); D.box(0.2, 0.34, 5.8, 2.8, 0.17, 0, 0xf6f0e0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { D.cyl(0.17, 0.17, 2.3, 8, sx * 2.8, 1.35, sz * 2.8, 0xcfd2dc, { kind: 'metal' }); D.box(0.4, 0.8, 0.4, sx * 2.8, 1.0, sz * 2.8, sz < 0 ? 0xd8372c : 0x2f6fe0); }
      const rc = [0xf6f0e0, 0xff2a1a, 0x2f6fe0];
      for (let i = 0; i < 3; i++) { D.box(5.6, 0.07, 0.07, 0, 0.9 + i * 0.5, -2.8, rc[i], { kind: 'p' + i }); D.box(0.07, 0.07, 5.6, -2.8, 0.9 + i * 0.5, 0, rc[i], { kind: 'p' + i }); D.box(0.07, 0.07, 5.6, 2.8, 0.9 + i * 0.5, 0, rc[i], { kind: 'p' + i }); }
      D.cyl(0.35, 0.35, 0.28, 10, -2.8, 2.55, -2.8, 0xffd23f, { kind: 'metal' }); D.sph(0.1, -2.8, 2.78, -2.8, 0xffd23f, { kind: 'glow' }, 5);
    });
    col(a, z.cx - 2.8, z.cz + 2.4 - 2.8, 0.4); col(a, z.cx + 2.8, z.cz + 2.4 - 2.8, 0.4); col(a, z.cx - 2.8, z.cz + 2.4 + 2.8, 0.4); col(a, z.cx + 2.8, z.cz + 2.4 + 2.8, 0.4);
    for (let i = 0; i < 5; i++) { a.colliders.push({ x: z.cx - 2.4 + i * 1.2, z: z.cz + 2.4 - 2.8, r: 0.35 }); }
    a.eggs.push({ id: 'gong', type: 'gong', x: z.cx - 4.4, z: z.cz + 4.2, r: 1.9, label: 'Gong slaan' });
    D.at(z.cx - 4.4, 0, z.cz + 5.2, 0, () => { D.cyl(0.06, 0.06, 2.8, 6, -0.8, 1.4, 0, 0x5b3d24); D.cyl(0.06, 0.06, 2.8, 6, 0.8, 1.4, 0, 0x5b3d24); D.box(1.8, 0.1, 0.1, 0, 2.7, 0, 0x5b3d24); D.cyl(0.65, 0.65, 0.09, 16, 0, 1.7, 0, 0xffd23f, { kind: 'metal', rx: PI / 2 }); });
    col(a, z.cx - 4.4, z.cz + 5.2, 1.0);
  },
  puzzel(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.at(-6.3, 0, 4.6, 0.5, () => { D.box(3.0, 0.55, 1.2, 0, 0.45, 0, 0x2a2f6a); D.box(3.0, 1.0, 0.35, 0, 1.0, -0.6, 0x2a2f6a); for (const sx of [-1, 1]) D.box(0.3, 0.85, 1.2, sx * 1.5, 0.65, 0, 0x3a3f8a); });
      D.sph(0.8, 5.6, 0.5, 4.7, 0xff2bd6, { sy: 0.65 }, 8); D.sph(0.7, 7.3, 0.45, 3.4, 0x7bff00, { sy: 0.65 }, 8); D.sph(0.7, 6.8, 0.45, 6.2, 0x00e5ff, { sy: 0.65 }, 8);
      D.cyl(0.95, 0.95, 0.16, 12, 0, 0.62, 5.2, 0x1a1a3a); D.cyl(0.15, 0.2, 0.6, 8, 0, 0.3, 5.2, 0x333355); D.sph(0.28, 0, 1.0, 5.2, 0xfff0a0, { kind: 'p1' }, 8);
      for (const [i, c] of [[0, 0xff2bd6], [1, 0x00e5ff], [2, 0xffe14a]]) D.box(0.5, 0.5, 0.5, -0.5 + i * 0.5, 0.95 + (i === 1 ? 0.5 : 0), 5.2 - 0.0, c, { ry: i * 0.5 });
      D.cyl(0.08, 0.08, 4.4, 6, 8.8, 2.2, 0.8, 0xcccccc, { kind: 'metal' });
      [[0xff2bd6, 0, 4.6], [0x00e5ff, 0.55, 5.4], [0x7bff00, -0.5, 6.1], [0xffe14a, 0.2, 6.8]].forEach(([c, ox, y], i) => D.box(0.9, 0.9, 0.9, 8.8 + ox, y, 0.8, c, { kind: 'p' + (i % 3), ry: i * 0.6, rx: i * 0.3 }));
    });
    col(a, z.cx - 6.3, z.cz + 4.6, 1.5); col(a, z.cx + 5.6, z.cz + 4.7, 0.8); col(a, z.cx + 7.3, z.cz + 3.4, 0.7); col(a, z.cx, z.cz + 5.2, 1.0); col(a, z.cx + 8.8, z.cz + 0.8, 0.4);
  },
  sport(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      for (const sx of [-1, 1]) {
        D.at(sx * 7.6, 0, 2.2, sx * -PI / 2, () => { for (const px of [-1.7, 1.7]) D.cyl(0.09, 0.09, 2.4, 6, px, 1.2, 0, 0xf6f0e0); D.cyl(0.09, 0.09, 3.5, 6, 0, 2.4, 0, 0xf6f0e0, { rz: PI / 2 }); for (let i = 0; i < 8; i++) D.box(0.03, 2.3, 0.03, -1.5 + i * 0.43, 1.2, -0.9, 0xcfd2dc); for (let i = 0; i < 4; i++) D.box(3.4, 0.03, 0.03, 0, 0.5 + i * 0.6, -0.9, 0xcfd2dc); for (const px of [-1.7, 1.7]) D.box(0.03, 2.4, 1.0, px, 1.2, -0.45, 0xcfd2dc); });
        col(a, z.cx + sx * 7.6, z.cz + 0.5, 0.35); col(a, z.cx + sx * 7.6, z.cz + 3.9, 0.35);
      }
      for (let i = 0; i < 5; i++) D.sph(0.3, 4.6 + (i % 3) * 0.55, 0.3 + (i > 2 ? 0.5 : 0), 7.4, i % 2 ? 0xffffff : 0xffe14a, null, 8);
      D.cyl(0.08, 0.1, 4.2, 6, -4.4, 2.1, 7.0, 0xcccccc, { kind: 'metal' }); D.box(3.0, 1.1, 0.25, -4.4, 4.6, 7.0, 0x10162c); D.box(2.8, 0.9, 0.05, -4.4, 4.6, 7.15, 0x3a2412, { kind: 'p1' });
      for (let i = 0; i < 4; i++) { D.box(5.2, 0.4 + i * 0.4, 0.8, -3.0, (0.4 + i * 0.4) / 2, -9.4 - i * 0.8, [0x2a3a66, 0x32447a][i % 2]); }
    });
    col(a, z.cx + 4.9, z.cz + 7.4, 1.0);
  },
  eten(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.box(2.6, 0.14, 1.2, 0, 1.15, 5.0, 0xb98a54); for (const sz of [-1, 1]) { D.box(2.6, 0.12, 0.5, 0, 0.7, 5.0 + sz * 1.0, 0x9a6a38); } for (const sx of [-1, 1]) D.box(0.14, 1.1, 1.0, sx * 1.1, 0.55, 5.0, 0x7a5530);
      D.cyl(0.05, 0.05, 3.6, 5, 0, 2.9, 5.0, 0xcfa060); D.cone(1.7, 0.7, 8, 0, 4.8, 5.0, 0xe8372c, { kind: 'dbl' });
      D.box(1.5, 2.6, 1.4, -7.8, 1.3, 4.0, 0xd8372c); D.box(1.3, 1.5, 1.2, -7.8, 3.3, 4.0, 0xffe9b0); for (let i = 0; i < 9; i++) D.sph(0.2, -8.2 + (i % 3) * 0.4, 2.8 + Math.floor(i / 3) * 0.45, 4.3, i % 2 ? 0xfff6c8 : 0xffe9a0, null, 5); D.cone(0.8, 0.5, 4, -7.8, 4.3, 4.0, 0xffe14a, { ry: PI / 4 });
      D.cyl(0.4, 0.34, 0.9, 8, 7.8, 0.45, 4.6, 0x3a78e0); D.cyl(0.43, 0.43, 0.12, 8, 7.8, 0.96, 4.6, 0x2a58b0);
      for (let i = 0; i < 3; i++) D.box(1.4, 0.9, 0.9, 6.0 + i * 0.9, 0.45 + (i === 1 ? 0.9 : 0), 7.2, 0xe0c060);
    });
    col(a, z.cx, z.cz + 5.0, 1.5); col(a, z.cx - 7.8, z.cz + 4.0, 1.0); col(a, z.cx + 7.8, z.cz + 4.6, 0.5);
  },
  gooi(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.box(1.5, 0.5, 1.5, 6.6, 0.25, 4.2, 0x8a5a2b); D.cyl(0.18, 0.18, 7.6, 8, 6.6, 4.3, 4.2, 0xf6f0e0); for (let i = 0; i < 9; i++) D.box(0.45, 0.07, 0.07, 6.6, 1.0 + i * 0.7, 4.52, i % 3 === 0 ? 0xd8372c : 0x1a1a22);
      D.sph(0.45, 6.6, 8.2, 4.2, 0xffd23f, { kind: 'p0' }, 8); D.box(0.9, 0.5, 0.9, 6.6, 0.75, 5.4, 0x5b3d24); D.box(0.2, 1.2, 0.2, 6.0, 1.3, 5.4, 0x5b3d24, { rz: 0.7 }); D.cyl(0.4, 0.4, 0.9, 8, 5.4, 1.15, 5.6, 0x888899, { rz: PI / 2 });
      for (const [px, pz, h] of [[-7.2, 4.4, 1], [-5.6, 5.8, 2], [-6.4, 7.2, 1]]) for (let i = 0; i < h; i++) D.box(1.5, 0.8, 0.9, px, 0.4 + i * 0.8, pz, 0xe0c060, { ry: pz * 0.2 });
      for (let i = 0; i < 4; i++) { D.cyl(0.4, 0.4, 0.5, 8, -1.0 + i * 0.7, 0.25 + (i % 2) * 0.5, 7.8, [0xd8372c, 0xffd23f, 0x2f9be0, 0x7bff7b][i]); }
    });
    col(a, z.cx + 6.6, z.cz + 4.2, 1.0); col(a, z.cx - 6.2, z.cz + 5.8, 1.5);
  },
  tent(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      for (const sx of [-1, 1]) { D.cyl(0.08, 0.1, 4.0, 6, sx * 8.0, 2.0, 3.6, 0x5b3d24); D.sph(0.4, sx * 8.0, 4.2, 3.6, 0xffd23f, { kind: 'p' + (sx > 0 ? 0 : 1) }, 8); D.cone(0.5, 0.5, 6, sx * 8.0, 4.7, 3.6, 0x7a2fd4); }
      D.tor(1.1, 0.16, 0, 5.2, 6.6, 0xffd23f, { kind: 'p2' }, 14, PI * 1.5);
      D.cyl(0.8, 0.8, 0.8, 10, -6.0, 0.4, 6.4, 0x8a5a2b); D.cyl(0.82, 0.82, 0.08, 10, -6.0, 0.3, 6.4, 0x333340); D.cyl(0.82, 0.82, 0.08, 10, -6.0, 0.6, 6.4, 0x333340);
      D.box(2.4, 0.5, 0.8, 6.0, 0.5, 6.4, 0x6a3a8a); D.box(2.4, 0.9, 0.2, 6.0, 1.1, 6.7, 0x6a3a8a);
      for (let i = 0; i < 5; i++) D.sph(0.13, -2.4 + i * 1.2, 0.14, 8.0 - (i % 2) * 0.3, 0xffd23f, { kind: 'p' + (i % 3) }, 5);
    });
    col(a, z.cx - 8.0, z.cz + 3.6, 0.35); col(a, z.cx + 8.0, z.cz + 3.6, 0.35); col(a, z.cx - 6.0, z.cz + 6.4, 0.9); col(a, z.cx + 6.0, z.cz + 6.4, 1.3);
  },
  gok(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.box(2.3, 3.7, 1.3, 0, 1.85, 4.6, 0xd8372c); D.box(2.5, 0.4, 1.5, 0, 3.9, 4.6, 0xffd23f); D.box(1.9, 1.0, 0.1, 0, 2.7, 5.28, 0x14102a);
      [0xff5a5a, 0xffe14a, 0x7bff7b].forEach((c, i) => D.sph(0.28, -0.6 + i * 0.6, 2.7, 5.35, c, { kind: 'p' + i }, 6));
      D.cyl(0.07, 0.07, 1.4, 6, 1.45, 2.6, 4.6, 0xcccccc, { kind: 'metal' }); D.sph(0.24, 1.45, 3.4, 4.6, 0xff2a1a);
      for (let i = 0; i < 5; i++) D.sph(0.12, -1.0 + i * 0.5, 4.2, 5.3, 0xfff0a0, { kind: 'p' + (i % 3) }, 5);
      for (let i = 0; i < 4; i++) D.cyl(0.4, 0.4, 0.1, 10, -4.8 + (i % 2) * 0.2, 0.06 + i * 0.1, 6.6 + (i % 2) * 0.1, 0xffd23f, { kind: 'metal' });
      D.box(0.9, 0.9, 0.9, 5.4, 0.45, 6.2, 0xffffff, { ry: 0.5 }); D.box(0.9, 0.9, 0.9, 6.7, 0.45, 5.0, 0xffffff, { ry: 1.1 });
      for (const [px, pz] of [[5.4, 6.2], [6.7, 5.0]]) D.sph(0.09, px, 0.92, pz, 0x111111, null, 4);
      for (const sx of [-1, 1]) { D.cyl(0.07, 0.07, 3.4, 6, sx * 8.0, 1.7, 2.4, 0xcfa060); D.sph(0.35, sx * 8.0, 3.6, 2.4, 0xff7ab0, { kind: 'p' + (sx > 0 ? 1 : 2) }, 8); }
    });
    col(a, z.cx, z.cz + 4.6, 1.3); col(a, z.cx + 5.4, z.cz + 6.2, 0.7); col(a, z.cx + 6.7, z.cz + 5.0, 0.7); col(a, z.cx - 4.8, z.cz + 6.6, 0.6);
  },
};

// ---------------------------------------------------------------- hal-schil
export function shell(a, D) {
  const W = a.W, Dp = a.Dp, id = a.hallId, T = a.theme; const rnd = mulberry32(100 + id);
  // ramen (geen mist) + bogen
  const cols = T.trim;
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) {
    D.at(sx * (W / 2 - 0.12), 0, -Dp / 2 + 5.5 + i * 10, -sx * PI / 2, () => {
      D.pln(2.8, 6.2, 0, 9.6, 0, cols[(i + (sx > 0 ? 3 : 0)) % 6], { kind: 'win' }); D.tor(1.4, 0.2, 0, 12.7, 0.05, 0x3a3a50, { kind: 'lit' }, 10, PI);
      D.box(0.3, 6.4, 0.3, -1.5, 9.6, 0.1, 0x3a3a50); D.box(0.3, 6.4, 0.3, 1.5, 9.6, 0.1, 0x3a3a50); D.box(3.2, 0.3, 0.3, 0, 6.4, 0.1, 0x3a3a50);
    });
  }
  // lichtjes op vloer: confetti-restjes
  for (let i = 0; i < 160; i++) { const x = (rnd() - 0.5) * (W - 4), zz = (rnd() - 0.5) * (Dp - 3); D.disc(0.07 + rnd() * 0.12, x, 0.045, zz, [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b, 0xff8a1c][i % 5], { ry: rnd() * 6 }, 5); }
  // vlaggetjes en lichtsnoeren over de hal
  const bc = [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b, 0xff8a1c, 0xb05aff];
  if (id !== 1) for (const zz of [-6, 6, 16]) bunting(D, -W / 2 + 0.5, 11.5, zz, W / 2 - 0.5, 11.5, zz, bc, 26, 1.8, 0.9);
  else for (const zz of [-8, 15]) lampString(D, -W / 2 + 0.5, 11.2, zz, W / 2 - 0.5, 11.2, zz, 30, 1.4);
  if (id === 2) for (const zz of [0, 11]) lampString(D, -W / 2 + 0.5, 12, zz, W / 2 - 0.5, 12, zz, 30, 1.2);
}
