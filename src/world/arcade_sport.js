// De SPORTHAL (hal 3): gymzaal/stadion in een kasteel. Alles via Deco (samengevoegd), dus weinig draw calls.
// Bevat: vloer + muur, sportkasten (mini-arena's), zone-props, middenpodium (Wiel), coach-podium van Trainer Tim, tribunes, kleden.
import * as THREE from 'three';
import { canvasTex, TAU, mulberry32, mesh } from '../engine/util.js';
import { makeNPC } from '../engine/chars.js';
import { rugCustom } from './arcade_decor.js';
import { cabUpright } from './arcade_cabs.js';

const PI = Math.PI;
const p = (i) => 'p' + (((i % 3) + 3) % 3);
const col = (a, x, z, r) => a.colliders.push({ x, z, r });

// ---------------------------------------------------------------- vloer + muur
export function sportFloor(W, Dp) {
  const S = 18, w = W * S, h = Dp * S; const X = (x) => (x + W / 2) * S, Z = (z) => (z + Dp / 2) * S;
  return canvasTex(w, h, (g) => {
    const rnd = mulberry32(33);
    for (let i = 0; i < W * 2; i++) { g.fillStyle = ['#d9a566', '#cf9a5a', '#e0b070', '#d4a060'][i % 4]; g.fillRect(i * S / 2, 0, S / 2 + 1, h); }
    g.fillStyle = 'rgba(80,40,10,.10)'; for (let i = 0; i < W * 2; i++) g.fillRect(i * S / 2, 0, 1.5, h);
    for (let i = 0; i < 600; i++) { g.fillStyle = 'rgba(90,50,20,.07)'; g.fillRect(rnd() * w, rnd() * h, 8 + rnd() * 20, 2); }
    // speelveld-lijnen: buitenrand, middenlijn, middencirkel rond het Wiel, boogjes
    g.strokeStyle = '#fffbe8'; g.lineWidth = 0.22 * S;
    g.strokeRect(X(-25.5), Z(-17.5), 51 * S, 35 * S);
    g.beginPath(); g.moveTo(X(0), Z(-17.5)); g.lineTo(X(0), Z(17.5)); g.stroke();
    g.beginPath(); g.arc(X(0), Z(3), 8 * S, 0, TAU); g.stroke();
    g.strokeStyle = '#ffd23f'; g.beginPath(); g.arc(X(-25.5), Z(3), 11 * S, -PI / 2, PI / 2); g.stroke(); g.beginPath(); g.arc(X(25.5), Z(3), 11 * S, PI / 2, PI * 1.5); g.stroke();
    g.fillStyle = 'rgba(47,111,224,.35)'; g.fillRect(X(-27.8), Z(-19.8), 55.6 * S, 1.9 * S); g.fillRect(X(-27.8), Z(17.9), 55.6 * S, 2 * S);
  });
}
export function sportWall() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f1e6c8'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f6fe0'; g.fillRect(0, h * 0.5, w, h * 0.12); g.fillStyle = '#d8372c'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, h * 0.62); g.lineTo(i * w / 4, h); g.stroke(); } g.beginPath(); g.moveTo(0, h * 0.8); g.lineTo(w, h * 0.8); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.05)'; for (let i = 0; i < 8; i++) g.fillRect(0, i * h / 16, w, 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(7, 1); return t;
}

// ---------------------------------------------------------------- kleden
export const SPORT_RUGS = {
  parket: (c1, c2, n) => rugCustom(n, (g, w, m, R) => {
    for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#e2b274' : '#d09a5a'; g.fillRect(i * w / 16, 0, w / 16 + 1, w); }
    g.fillStyle = 'rgba(47,174,91,.82)'; g.beginPath(); g.arc(m, m, R * 0.8, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 9; g.beginPath(); g.arc(m, m, R * 0.8, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(m, m - R * 0.8); g.lineTo(m, m + R * 0.8); g.stroke(); g.beginPath(); g.arc(m, m, R * 0.2, 0, TAU); g.stroke();
    g.strokeStyle = '#ffe14a'; g.lineWidth = 10; g.beginPath(); g.arc(m, m, R * 0.94, 0, TAU); g.stroke();
  }),
  mik: (c1, c2, n) => rugCustom(n, (g, w, m, R) => {
    const cs = ['#1a1a22', '#f6f0e0', '#e8372c', '#f6f0e0', '#2fae5b', '#e8372c']; for (let i = 6; i >= 1; i--) { g.fillStyle = cs[i - 1]; g.beginPath(); g.arc(m, m, R * i / 6, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(m, m); g.lineTo(m + Math.cos(i * TAU / 12) * R, m + Math.sin(i * TAU / 12) * R); g.stroke(); }
  }),
  ijs: (c1, c2, n) => rugCustom(n, (g, w, m, R) => {
    const gr = g.createRadialGradient(m, m, 10, m, m, R); gr.addColorStop(0, '#f2fbff'); gr.addColorStop(1, '#a8dcf4'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
    const rnd = mulberry32(5); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; for (let i = 0; i < 18; i++) { let x = rnd() * w, y = rnd() * w; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 110; y += (rnd() - 0.5) * 110; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = '#2f6fe0'; g.lineWidth = 10; g.beginPath(); g.arc(m, m, R * 0.93, 0, TAU); g.stroke();
  }),
  kantine: (c1, c2, n) => rugCustom(n, (g, w, m, R) => {
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f6f0e0' : '#ffa030'; g.fillRect(i * w / 8, j * w / 8, w / 8 + 1, w / 8 + 1); }
    g.strokeStyle = '#d8372c'; g.lineWidth = 12; g.beginPath(); g.arc(m, m, R * 0.93, 0, TAU); g.stroke();
  }),
};

// ---------------------------------------------------------------- sportkasten (mini-arena's). Lokaal: voorkant = +z.
// scorebord-paneel met scherm; geeft de scr-spec
function board(D, x, y, z, w, h, trim, rx = -0.15) {
  D.box(w + 0.45, h + 0.45, 0.22, x, y, z - 0.08, 0x14102a, { rx }); D.box(w + 0.6, 0.18, 0.3, x, y + h / 2 + 0.28, z - 0.05, trim, { rx });
  const n = Math.max(3, Math.round(w / 0.45)); for (let i = 0; i < n; i++) D.sph(0.1, x - w / 2 + 0.2 + i * (w - 0.4) / (n - 1), y + h / 2 + 0.42, z + 0.08, 0xfff0a0, { kind: p(i) }, 5);
  return { x, y, z: z + 0.06, w, h, rx };
}
const wood = 0x8a5a2b, net = 0xdfe6f0, orange = 0xff8a1c;
export const SPORT_CABS = {
  penalty(D, c) {   // doelwand met kartonnen keeper en een bal op de stip
    D.box(5.6, 0.25, 4.8, 0, 0.13, 0.3, 0x2fae5b); D.box(5.6, 0.04, 0.12, 0, 0.27, 2.55, 0xffffff); D.disc(0.14, 0, 0.3, 1.5, 0xffffff, null, 10);
    for (const sx of [-1, 1]) D.cyl(0.1, 0.1, 2.9, 8, sx * 2.2, 1.6, -1.0, 0xffffff);
    D.cyl(0.1, 0.1, 4.5, 8, 0, 3.05, -1.0, 0xffffff, { rz: PI / 2 });
    for (let i = 0; i < 10; i++) D.box(0.03, 2.8, 0.03, -2.0 + i * 0.44, 1.6, -2.2, net);
    for (let j = 0; j < 6; j++) D.box(4.4, 0.03, 0.03, 0, 0.35 + j * 0.5, -2.2, net);
    for (const sx of [-1, 1]) for (let j = 0; j < 5; j++) D.box(0.03, 0.03, 1.2, sx * 2.2, 0.5 + j * 0.55, -1.6, net);
    for (let i = 0; i < 6; i++) D.box(0.03, 0.03, 1.2, -2.0 + i * 0.8, 2.95, -1.6, net);
    D.box(0.9, 1.3, 0.25, 0.4, 1.3, -0.9, orange); D.sph(0.32, 0.4, 2.2, -0.9, 0xf4c9a0); D.box(2.4, 0.26, 0.2, 0.4, 1.8, -0.9, orange, { rz: 0.14 }); D.box(0.3, 0.8, 0.2, 0.15, 0.5, -0.9, 0x2f6fe0); D.box(0.3, 0.8, 0.2, 0.65, 0.5, -0.9, 0x2f6fe0);
    D.sph(0.3, -0.7, 0.58, 1.5, 0xffffff); for (const [dx, dy, dz] of [[0, 0.28, 0.05], [-0.25, 0.1, 0.16], [0.22, 0.05, 0.18]]) D.sph(0.1, -0.7 + dx, 0.58 + dy, 1.5 + dz, 0x222233, null, 4);
    for (const sx of [-1, 1]) D.cyl(0.07, 0.07, 3.3, 6, sx * 1.5, 3.4, -1.3, 0x8888a0, { kind: 'metal' });
    return { scr: board(D, 0, 5.4, -1.3, 3.4, 2.5, c), ix: 3.9, hit: [[-2.2, -1.0, 0.35], [2.2, -1.0, 0.35], [0.4, -0.9, 0.7]], lblY: 8.2 };
  },
  basket(D, c) {   // basketpaal met bord, mandje en ballenkar
    D.cyl(2.3, 2.4, 0.22, 22, 0, 0.12, 0.2, 0xc88a4a); D.ring(1.9, 2.1, 0, 0.26, 0.2, 0xf6f0e0, null, 24);
    D.cyl(0.14, 0.14, 5.6, 8, 0, 2.8, -1.7, 0x8888a0, { kind: 'metal' }); D.box(0.2, 0.2, 1.4, 0, 5.4, -1.0, 0x8888a0);
    D.box(2.7, 1.8, 0.12, 0, 5.6, -0.3, 0xffffff); D.box(1.0, 0.75, 0.05, 0, 5.3, -0.22, 0xd8372c); D.box(2.8, 0.1, 0.14, 0, 6.52, -0.3, 0xd8372c); D.box(2.8, 0.1, 0.14, 0, 4.7, -0.3, 0xd8372c);
    D.tor(0.55, 0.06, 0, 4.9, 0.35, 0xff6a1a, { rx: PI / 2 }, 14); D.cone(0.5, 0.8, 8, 0, 4.45, 0.35, 0xf6f0e0, { rx: PI, kind: 'dbl' });
    D.box(1.5, 0.9, 1.0, 2.6, 0.55, 0.7, 0x2f6fe0); for (let i = 0; i < 3; i++) D.sph(0.3, 2.2 + i * 0.4, 1.2, 0.7, orange, null, 8);
    D.sph(0.3, -1.4, 0.4, 2.0, orange, null, 8);
    D.cyl(0.07, 0.07, 2.6, 6, -2.9, 1.3, -0.2, 0x8888a0, { kind: 'metal' });
    return { scr: board(D, -2.9, 3.5, -0.2, 2.5, 1.9, c), ix: 3.8, hit: [[0, -1.7, 0.5], [2.6, 0.7, 0.9], [-2.9, -0.2, 0.3]], lblY: 8.4 };
  },
  pingpong(D, c) {   // tafeltennistafel met net, batjes en scherm erachter
    D.box(4.6, 0.2, 2.5, 0, 1.35, 0, 0x1d5fb0); D.box(4.6, 0.03, 0.05, 0, 1.47, 0, 0xffffff); D.box(4.6, 0.03, 0.04, 0, 1.47, 1.2, 0xffffff); D.box(4.6, 0.03, 0.04, 0, 1.47, -1.2, 0xffffff); D.box(0.05, 0.03, 2.5, 0, 1.47, 0, 0xffffff);
    D.box(0.05, 0.4, 2.7, 0, 1.75, 0, 0xf6f0e0); for (const sz of [-1, 1]) D.box(0.1, 0.55, 0.1, 0, 1.7, sz * 1.35, 0x888899);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.cyl(0.1, 0.12, 1.3, 6, sx * 2.0, 0.65, sz * 0.95, 0x555566);
    for (const [bx, bz, r] of [[1.6, 0.5, 0.6], [-1.7, -0.5, -0.5]]) D.at(bx, 1.5, bz, r, () => { D.cyl(0.32, 0.32, 0.05, 12, 0, 0.08, 0, bx > 0 ? 0xd8372c : 0x222233, { rx: PI / 2 }); D.box(0.08, 0.4, 0.06, 0, -0.2, 0, wood); });
    D.sph(0.1, -0.7, 1.6, 0.3, 0xffffff, null, 6);
    for (const sx of [-1, 1]) D.cyl(0.08, 0.08, 3.4, 6, sx * 1.8, 1.7, -2.05, 0x555566, { kind: 'metal' });
    return { scr: board(D, 0, 3.7, -2.0, 3.3, 2.4, c), ix: 3.5, hit: [[-1.3, 0, 1.4], [1.3, 0, 1.4]], lblY: 7.0 };
  },
  darts(D, c) {   // dartbord op houten paneel, oche-lijn, schermpje ernaast
    D.box(3.9, 3.9, 0.3, -1.0, 3.4, -1.0, wood); for (const sx of [-1, 1]) D.box(0.25, 1.5, 0.25, -1.0 + sx * 1.5, 0.75, -1.0, 0x6b4a2e);
    [[1.6, 0x111111], [1.45, 0xd8372c], [1.25, 0xf1e2b5], [1.0, 0x2fae5b], [0.78, 0xf1e2b5], [0.36, 0x2fae5b], [0.17, 0xd8372c]].forEach(([r, cc], i) => D.cyl(r, r, 0.1, 26, -1.0, 3.4, -0.8 + i * 0.02, cc, { rx: PI / 2 }));
    for (const [dx, dy, cc] of [[0.4, 0.3, 0xd8372c], [-0.5, -0.2, 0x2f6fe0], [0.1, -0.7, 0xffd23f]]) { D.cone(0.05, 0.55, 5, -1.0 + dx, 3.4 + dy, -0.5, cc, { rx: -PI / 2 }); D.box(0.2, 0.2, 0.03, -1.0 + dx, 3.4 + dy, -0.25, cc); }
    D.box(2.4, 0.04, 0.2, 0, 0.06, 2.6, 0xffe14a);
    D.cyl(0.25, 0.22, 0.45, 8, 2.9, 0.23, 1.4, 0xc88a4a); D.cyl(0.2, 0.2, 0.3, 8, 2.9, 0.6, 1.4, 0xffd23f);   // kroeg-krukje met bierglas
    for (const sx of [-1, 1]) D.cyl(0.08, 0.08, 3.0, 6, 2.5 + sx * 1.1, 1.5, -0.9, 0x555566, { kind: 'metal' });
    return { scr: board(D, 2.5, 3.6, -0.9, 2.4, 1.8, c), ix: 3.7, hit: [[-1.0, -1.0, 1.9], [2.5, -0.9, 0.5]], lblY: 7.0 };
  },
  boog(D, c) {   // schietschijf op driepoot, hooibalen, pijlenkoker
    D.box(5.8, 0.2, 4.8, 0, 0.1, 0, 0x55b84a);
    D.at(-1.0, 0, -1.7, 0, () => {
      for (const sx of [-1, 1]) D.box(0.2, 3.8, 0.2, sx * 1.1, 1.8, 0.1, wood, { rz: sx * -0.18 }); D.box(0.2, 3.0, 0.2, 0, 1.5, -0.7, wood, { rx: -0.2 });
      [[1.7, 0xf6f0e0], [1.4, 0x1a1a22], [1.1, 0x2f6fe0], [0.8, 0xd8372c], [0.45, 0xffd23f]].forEach(([r, cc], i) => D.cyl(r, r, 0.14, 24, 0, 3.4, 0.2 + i * 0.02, cc, { rx: PI / 2 }));
      for (const [dx, dy, cc] of [[0.5, 0.4, 0xd8372c], [-0.3, -0.5, 0x2fae5b], [0.1, 0.1, 0xffd23f]]) { D.cone(0.05, 0.9, 5, dx, 3.4 + dy, 0.6, 0xcccccc, { rx: -PI / 2 }); D.box(0.2, 0.2, 0.04, dx, 3.4 + dy, 1.0, cc); }
    });
    for (let i = 0; i < 3; i++) D.cyl(0.55, 0.55, 1.1, 10, 2.5, 0.55 + (i === 2 ? 0.95 : 0), 0.9 + (i % 2 ? 0.9 : -0.1) * (i === 2 ? 0 : 1), 0xe0c060, { rz: PI / 2 });
    D.cyl(0.28, 0.22, 1.2, 8, 2.1, 0.8, 2.0, 0x6b4a2e, { rz: 0.2 }); for (let i = 0; i < 3; i++) D.box(0.06, 0.5, 0.06, 2.0 + i * 0.1, 1.6, 2.0, [0xd8372c, 0xffd23f, 0x2f6fe0][i]);
    D.tor(0.8, 0.05, -2.3, 1.6, 1.8, wood, { ry: PI / 2 }, 12, PI);
    for (const sx of [-1, 1]) D.cyl(0.08, 0.08, 3.0, 6, 1.1 + sx * 1.0, 1.5, -1.0, 0x555566, { kind: 'metal' });
    return { scr: board(D, 1.1, 3.8, -1.0, 2.2, 1.65, c), ix: 3.8, hit: [[-1.0, -1.6, 1.3], [2.5, 0.6, 1.0]], lblY: 7.0 };
  },
  curling(D, c) {   // ijsbaantje met huis, stenen en bezem
    D.box(3.2, 0.18, 8.2, 0, 0.1, -1.0, 0xcdefff); for (const sx of [-1, 1]) D.box(0.25, 0.55, 8.2, sx * 1.75, 0.3, -1.0, 0xd8372c);
    D.box(3.2, 0.19, 0.12, 0, 0.11, -0.2, 0xd8372c);
    [[1.35, 0x2f6fe0], [0.95, 0xf6f0e0], [0.55, 0xd8372c], [0.2, 0xf6f0e0]].forEach(([r, cc], i) => D.disc(r, 0, 0.21 + i * 0.01, -3.7, cc, null, 24));
    for (let i = 0; i < 3; i++) { const sx = -0.9 + i * 0.9, sz = 1.8 - (i % 2) * 0.5, cc = i % 2 ? 0xd8372c : 0xffd23f; D.cyl(0.4, 0.42, 0.22, 12, sx, 0.3, sz, 0x9a9aa6, { kind: 'metal' }); D.cyl(0.38, 0.38, 0.1, 12, sx, 0.46, sz, cc); D.box(0.4, 0.07, 0.1, sx, 0.56, sz, cc); }
    D.cyl(0.04, 0.04, 2.4, 5, 2.4, 1.2, 1.5, wood, { rz: 0.4 }); D.box(0.7, 0.18, 0.3, 1.8, 0.2, 1.5, 0xe0c060);
    for (const sx of [-1, 1]) D.cyl(0.08, 0.08, 3.0, 6, sx * 2.1, 1.5, -4.9, 0x555566, { kind: 'metal' });
    return { scr: board(D, 0, 3.7, -4.9, 3.6, 2.7, c), ix: 4.6, hit: [[-2.1, -4.9, 0.4], [2.1, -4.9, 0.4]], lblY: 7.3 };
  },
};
SPORT_CABS.default = (D, c) => cabUpright(D, c);

// ---------------------------------------------------------------- zone-props
export const SPORT_PROPS = {
  balsport(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      for (const sx of [-1, 1]) { D.cyl(0.05, 0.05, 2.4, 5, sx * 7.7, 1.2, 0.6, 0xffffff); D.tri(0.9, 0.6, sx * 7.7 + 0.45, 2.35, 0.6, sx > 0 ? 0xffd23f : 0xd8372c, { kind: 'dbl', rz: PI / 2 }); }
      for (let i = 0; i < 6; i++) D.cone(0.26, 0.55, 8, -4.6 + i * 1.8, 0.28, 6.6 + (i % 2) * 0.5, orange);   // slalom
      D.box(2.6, 0.2, 0.8, 5.8, 0.75, 5.8, wood); for (const sx of [-1, 1]) D.box(0.14, 0.7, 0.7, 5.8 + sx * 1.1, 0.35, 5.8, 0x6b4a2e);
      for (let i = 0; i < 3; i++) D.cyl(0.14, 0.12, 0.45, 8, 5.0 + i * 0.5, 1.1, 5.8, [0x2f9be0, 0xd8372c, 0xffd23f][i]);
      D.cyl(0.5, 0.45, 1.3, 10, 7.0, 0.65, 4.6, 0x2f9be0); D.sph(0.5, 7.0, 1.6, 4.6, 0xcfeaff, { sy: 0.6 }, 8);   // waterkoeler
      D.sph(0.95, -3.4, 0.8, 5.6, 0xd8372c, { sy: 0.85 }, 10); for (let i = 0; i < 7; i++) D.sph(0.27, -3.4 + Math.cos(i * 1.7) * 0.7, 1.0 + (i % 3) * 0.4, 5.6 + Math.sin(i * 1.7) * 0.7, i % 2 ? 0xffffff : 0xffe14a, null, 6);   // ballenzak
      D.box(0.14, 0.9, 0.14, -0.4, 0.45, 8.0, 0xf6f0e0); D.box(0.14, 0.9, 0.14, 1.4, 0.45, 8.0, 0xf6f0e0); D.box(1.9, 0.12, 0.12, 0.5, 0.95, 8.0, 0xd8372c);   // horde
    });
    col(a, z.cx - 3.4, z.cz + 5.6, 1.1); col(a, z.cx + 7.0, z.cz + 4.6, 0.6); col(a, z.cx + 5.8, z.cz + 5.8, 1.0);
    a.eggs.push({ id: 'bal', type: 'bal', x: z.cx - 3.4, z: z.cz + 7.4, r: 2.1, label: 'Tegen de ballenzak schoppen' });
  },
  mikken(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.cyl(1.0, 1.0, 0.15, 12, -5.4, 1.0, 5.4, wood); D.cyl(0.14, 0.18, 1.0, 6, -5.4, 0.5, 5.4, 0x6b4a2e); for (const sz of [-1, 1]) { D.cyl(0.4, 0.4, 0.15, 8, -5.4 + sz * 1.5, 0.55, 5.4, 0xd8372c); D.cyl(0.07, 0.07, 0.55, 5, -5.4 + sz * 1.5, 0.28, 5.4, 0x6b4a2e); }
      D.cyl(0.18, 0.18, 0.4, 8, -5.1, 1.27, 5.3, 0xc88a4a); D.cyl(0.14, 0.14, 0.25, 8, -5.1, 1.62, 5.3, 0xffd23f); D.cyl(0.18, 0.18, 0.4, 8, -5.8, 1.27, 5.6, 0xc88a4a);
      for (let i = 0; i < 3; i++) D.cyl(0.6, 0.6, 1.0, 10, 5.2 + (i % 2) * 1.3, 0.5 + (i === 2 ? 0.95 : 0), 5.0 + (i === 1 ? 1.0 : 0), 0xe0c060, { rz: PI / 2 });
      D.cyl(0.07, 0.07, 3.6, 6, 7.4, 1.8, 2.4, 0xcfa060); D.tri(1.6, 1.0, 8.2, 3.5, 2.4, 0xd8372c, { kind: 'dbl', rz: PI / 2 }); D.sph(0.15, 7.4, 3.7, 2.4, 0xffd23f, { kind: 'glow' }, 6);
      D.cyl(0.5, 0.6, 0.35, 10, 0.5, 0.18, 7.6, 0xe8b82a, { kind: 'metal' }); D.cyl(0.2, 0.3, 0.7, 8, 0.5, 0.7, 7.6, 0xe8b82a, { kind: 'metal' }); D.cyl(0.55, 0.25, 0.65, 10, 0.5, 1.4, 7.6, 0xe8b82a, { kind: 'metal' }); D.sph(0.2, 0.5, 1.9, 7.6, 0xffffff, { kind: 'p1' }, 6);
    });
    col(a, z.cx - 5.4, z.cz + 5.4, 1.3); col(a, z.cx + 5.8, z.cz + 5.4, 1.4); col(a, z.cx + 0.5, z.cz + 7.6, 0.6);
  },
  kantine(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      D.box(5.6, 1.2, 1.5, 0, 0.6, -1.0, 0xe8372c); D.box(5.9, 0.2, 1.8, 0, 1.3, -1.0, 0xf6f0e0);
      for (let i = 0; i < 7; i++) D.box(0.8, 0.1, 2.0, -2.4 + i * 0.8, 4.2, -1.0, i % 2 ? 0xf6f0e0 : 0xe8372c, { rx: 0.3, kind: 'dbl' });
      for (const sx of [-1, 1]) D.cyl(0.09, 0.09, 4.2, 6, sx * 2.8, 2.1, -0.2, 0xcfa060);
      for (let i = 0; i < 3; i++) D.cyl(0.14, 0.14, 0.9, 6, -1.0 + i * 0.9, 1.9, -1.1, [0xd8372c, 0xe8b82a, 0xd8372c][i], { rz: PI / 2 });   // worstjes
      D.box(1.2, 2.4, 0.9, -4.4, 1.2, -1.2, 0xdfe6f0, { kind: 'metal' }); D.box(0.9, 0.05, 0.05, -4.4, 1.7, -0.7, 0x888899);   // koelkast
      D.cyl(0.9, 0.9, 0.12, 12, 3.4, 1.1, 3.9, wood); D.cyl(0.1, 0.14, 1.0, 6, 3.4, 0.55, 3.9, 0x6b4a2e);
      for (const [bx, bz] of [[2.2, 3.9], [4.6, 3.9], [3.4, 5.1]]) { D.cyl(0.35, 0.35, 0.12, 8, bx, 0.6, bz, 0x2f6fe0); D.cyl(0.07, 0.07, 0.55, 5, bx, 0.3, bz, 0x555566); }
      D.box(0.7, 0.1, 0.4, 3.0, 1.22, 3.9, 0xf1c58a); D.cyl(0.35, 0.3, 0.2, 8, 3.8, 1.26, 3.8, 0xd8372c); D.sph(0.1, 3.8, 1.42, 3.8, 0xffd23f, null, 6);
      D.cyl(0.35, 0.3, 0.9, 8, -6.2, 0.45, 4.6, 0x2fae5b); D.cyl(0.4, 0.4, 0.08, 8, -6.2, 0.94, 4.6, 0x1f7a3f);   // prullenbak
      for (let i = 0; i < 5; i++) D.sph(0.14, -2.4 + i * 1.2, 0.14, 7.8 - (i % 2) * 0.3, 0xffd23f, { kind: p(i) }, 5);
    });
    col(a, z.cx, z.cz - 1.0, 2.6); col(a, z.cx - 4.4, z.cz - 1.2, 0.9); col(a, z.cx + 3.4, z.cz + 3.9, 1.0); col(a, z.cx - 6.2, z.cz + 4.6, 0.5);
    a.eggs.push({ id: 'fluit', type: 'fluit', x: z.cx + 3.4, z: z.cz + 6.2, r: 2.3, label: 'Het gouden scheidsrechtersfluitje pakken' });
  },
  ijsbaan(a, D, z) {
    D.at(z.cx, 0, z.cz, 0, () => {
      for (const sx of [-1, 1]) { const x = sx * 6.2; D.sph(0.55, x, 0.5, 5.2, 0x1a1a22, { sy: 1.3 }, 8); D.sph(0.4, x, 0.95, 5.35, 0xf6f0e0, { sy: 0.9 }, 8); D.sph(0.3, x, 1.35, 5.3, 0x1a1a22, null, 8); D.cone(0.1, 0.25, 4, x, 1.32, 5.62, orange, { rx: PI / 2 }); D.sph(0.05, x - 0.1, 1.42, 5.55, 0xffffff, null, 4); D.sph(0.05, x + 0.1, 1.42, 5.55, 0xffffff, null, 4); }   // pinguin-standbeelden
      D.sph(1.5, 6.4, 0.6, 3.0, 0xf6f0e0, { sy: 0.7 }, 10); D.sph(1.0, 5.4, 0.45, 3.4, 0xf6f0e0, { sy: 0.7 }, 10);   // sneeuwbulten
      for (let i = 0; i < 4; i++) D.box(0.9, 0.9, 0.9, -5.6 + (i % 2) * 1.0, 0.45 + (i > 1 ? 0.9 : 0), 4.4 + (i % 2) * 0.5, 0xb8e4fa, { ry: i * 0.5, kind: 'metal' });   // ijsblokken
      D.cyl(0.5, 0.5, 0.8, 10, -6.6, 0.4, 1.0, 0x8a5a2b); D.cyl(0.45, 0.45, 0.06, 10, -6.6, 0.82, 1.0, 0x5a3a22); for (let i = 0; i < 3; i++) D.sph(0.12, -6.6 + (i - 1) * 0.25, 1.0, 1.0, 0xffffff, { kind: p(i) }, 5);   // chocolademelk-ton
      D.cyl(0.06, 0.06, 3.2, 5, 0, 1.6, 7.6, 0xcfa060); D.tri(1.8, 1.0, 0.9, 3.0, 7.6, 0x5ad8ff, { kind: 'dbl', rz: PI / 2 });
    });
    col(a, z.cx - 6.2, z.cz + 5.2, 0.8); col(a, z.cx + 6.2, z.cz + 5.2, 0.8); col(a, z.cx + 6.4, z.cz + 3.0, 1.3); col(a, z.cx - 5.4, z.cz + 4.6, 1.0);
  },
};

// ---------------------------------------------------------------- hal-schil: ribstoelen, tribunes, bord
export function sportShell(a, D) {
  const W = a.W, zb = -a.Dp / 2; const rnd = mulberry32(77);
  for (const sx of [-1, 1]) for (const zz of [-14, 0, 15]) D.at(sx * (W / 2 - 0.3), 0, zz, -sx * PI / 2, () => {   // ribstoelen langs de muren
    for (const px of [-2.6, 2.6]) D.box(0.3, 6.6, 0.3, px, 3.3, 0, wood); for (let i = 0; i < 12; i++) D.cyl(0.05, 0.05, 5.2, 5, 0, 0.6 + i * 0.5, 0.04, 0xe0d0a8, { rz: PI / 2 });
  });
  for (const sx of [-1, 1]) {   // tribune met supporters in de achterhoeken
    const x = sx * (W / 2 - 2.9);
    for (let r = 0; r < 4; r++) {
      const z = zb + 3.2 - r * 0.85, hh = (r + 1) * 0.5; D.box(5.2, hh, 0.9, x, hh / 2, z, r % 2 ? 0x3a3a52 : 0x2c2c40);
      for (let k = 0; k < 4; k++) { const fx = x - 1.8 + k * 1.2 + (rnd() - 0.5) * 0.3, c = [0xd8372c, 0x2f6fe0, 0xffd23f, 0x2fae5b, 0xf6f0e0][(r + k) % 5];
        D.cyl(0.26, 0.3, 0.55, 6, fx, hh + 0.3, z, c); D.sph(0.22, fx, hh + 0.78, z, [0xf4c9a0, 0xc98e63, 0x8d5a3a, 0xf7d2ae][(r * 3 + k) % 4], null, 6);
        if ((r + k) % 3 === 0) { D.cyl(0.04, 0.04, 0.7, 4, fx + 0.25, hh + 1.1, z, 0xcfa060); D.tri(0.5, 0.35, fx + 0.5, hh + 1.45, z, c, { kind: 'dbl', rz: PI / 2 }); } }
    }
    col(a, x - 1.2, zb + 2.0, 1.4); col(a, x + 1.2, zb + 2.0, 1.4);
  }
  // groot bord boven de coach
  const t = canvasTex(512, 128, (g, w, h) => { g.fillStyle = '#1d4fa8'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8372c'; g.fillRect(0, h - 22, w, 22); g.strokeStyle = '#ffe14a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 86px Fredoka, Arial Black, sans-serif'; g.lineWidth = 12; g.lineJoin = 'round'; g.strokeStyle = '#0a1a4a'; g.strokeText('SPORTHAL', w / 2, h / 2 - 6, w - 40); g.fillStyle = '#fff'; g.fillText('SPORTHAL', w / 2, h / 2 - 6, w - 40); });
  a.scene.add(mesh(new THREE.PlaneGeometry(9.5, 2.4), new THREE.MeshBasicMaterial({ map: t }), { cast: false, receive: false, pos: [0, 10.4, zb + 0.2] }));
}

// ---------------------------------------------------------------- midden: podium met het Wiel
export function sportCenter(a, D, CZ, C) {
  D.cyl(5.7, 5.9, 0.5, 30, 0, 0.25, CZ, 0xd8372c); D.cyl(4.9, 5.1, 0.5, 30, 0, 0.75, CZ, 0xf6f0e0); D.cyl(4.2, 4.4, 0.4, 30, 0, 1.2, CZ, 0x2f6fe0); D.cyl(1.2, 1.5, 0.5, 12, 0, 1.45, CZ, 0xe8b82a, { kind: 'metal' });
  for (let i = 0; i < 20; i++) { const an = i / 20 * TAU; D.sph(0.17, Math.cos(an) * 5.35, 0.62, CZ + Math.sin(an) * 5.35, 0xfff0a0, { kind: p(i) }, 6); }
  for (let i = 0; i < 4; i++) { const an = (i + 0.5) / 4 * TAU, x = Math.cos(an) * 7.4, z = CZ + Math.sin(an) * 6.4; D.cyl(0.09, 0.12, 5.2, 6, x, 2.6, z, 0xcfa060); D.sph(0.2, x, 5.3, z, 0xffd23f, { kind: 'glow' }, 6); D.tri(1.7, 1.1, x + 0.85, 5.0, z, [0xd8372c, 0x2f6fe0, 0x2fae5b, 0xffd23f][i], { kind: 'dbl', rz: PI / 2 }); D.tri(1.3, 0.8, x + 0.65, 3.95, z, 0xf6f0e0, { kind: 'dbl', rz: PI / 2 }); }
  // stalen trofee-schaal boven het Wiel (hoog, zodat het Wiel zichtbaar blijft)
  D.cyl(0.1, 0.1, 2.0, 6, 0, 9.0, CZ, 0xe8b82a, { kind: 'metal' }); D.cyl(0.9, 0.35, 0.9, 12, 0, 10.4, CZ, 0xe8b82a, { kind: 'metal' }); D.sph(0.3, 0, 11.1, CZ, 0xffffff, { kind: 'p1' }, 8);
  for (const sx of [-1, 1]) D.tor(0.55, 0.08, sx * 0.95, 10.4, CZ, 0xe8b82a, { kind: 'metal', rz: sx > 0 ? -PI / 2 : PI / 2 }, 8, PI);
}

// ---------------------------------------------------------------- coach-podium van Trainer Tim
export function sportBack(a, D, zb) {
  D.box(7.4, 1.0, 3.2, 0, 0.5, zb + 3.4, 0xd8372c); D.box(7.6, 0.18, 3.4, 0, 1.05, zb + 3.4, 0xf6f0e0); D.box(7.5, 0.2, 0.2, 0, 0.9, zb + 5.1, 0x2f6fe0);
  D.box(5.4, 3.4, 0.15, 0, 3.6, zb + 1.3, 0xf6f0e0); D.box(5.7, 0.2, 0.25, 0, 5.4, zb + 1.3, 0x8a5a2b); D.box(5.7, 0.2, 0.25, 0, 1.9, zb + 1.3, 0x8a5a2b); for (const sx of [-1, 1]) D.box(0.2, 3.7, 0.25, sx * 2.8, 3.6, zb + 1.3, 0x8a5a2b);
  const t = canvasTex(512, 256, (g, w, h) => { g.fillStyle = '#f9f6ea'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2fae5b'; g.lineWidth = 4; g.strokeRect(20, 20, w - 40, h - 40); g.beginPath(); g.moveTo(w / 2, 20); g.lineTo(w / 2, h - 20); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 40, 0, TAU); g.stroke();
    g.font = 'bold 40px Fredoka, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#d8372c'; for (const [x, y] of [[110, 90], [150, 170], [220, 120], [180, 70]]) g.fillText('X', x, y); g.fillStyle = '#2f6fe0'; for (const [x, y] of [[330, 100], [380, 160], [300, 180], [420, 80]]) g.fillText('O', x, y);
    g.strokeStyle = '#ff8a1c'; g.lineWidth = 5; g.setLineDash([12, 8]); g.beginPath(); g.moveTo(110, 90); g.quadraticCurveTo(190, 20, 300, 100); g.stroke(); g.setLineDash([]); g.fillStyle = '#7a4a24'; g.font = 'bold 28px Fredoka, Arial'; g.fillText('PLAN: winnen. (hopelijk)', w / 2, h - 36); });
  a.scene.add(mesh(new THREE.PlaneGeometry(5.0, 3.0), new THREE.MeshBasicMaterial({ map: t }), { cast: false, receive: false, pos: [0, 3.6, zb + 1.42] }));
  // grote gouden fluit rechts + ballen en hoedjes links
  D.at(5.6, 0, zb + 3.6, -0.4, () => { D.cyl(0.8, 0.8, 0.9, 14, 0, 1.45, 0, 0xe8b82a, { kind: 'metal', rz: PI / 2 }); D.cyl(0.35, 0.35, 0.9, 10, 0.9, 1.45, 0, 0xe8b82a, { kind: 'metal', rz: PI / 2 }); D.tor(0.3, 0.07, -0.95, 1.9, 0, 0xe8b82a, { kind: 'metal' }, 10); D.cyl(0.3, 0.3, 0.2, 10, 0, 0.55, 0, 0x555566); });
  for (let i = 0; i < 5; i++) D.sph(0.3, -5.4 + (i % 3) * 0.55, 0.32 + (i > 2 ? 0.5 : 0), zb + 4.4 + (i > 2 ? 0.2 : 0), i % 2 ? 0xffffff : orange, null, 8);
  for (let i = 0; i < 3; i++) D.cone(0.26, 0.55, 8, -4.4 + i * 0.8, 0.28, zb + 6.4, orange);
  a.colliders.push({ x: 0, z: zb + 3.4, r: 3.4 });
  a.king = makeNPC('guard', { hat: 'cap', hatColor: 0xf6f0e0, shirt: 0xd8372c, sleeve: 0xd8372c, pants: 0x2f6fe0, hair: 0x3a2a1a, beard: 'stache', scale: 1.28, bodyW: 1.35 });
  a.king.group.position.set(0, 1.15, zb + 3.7);
}

// ---------------------------------------------------------------- dynamisch: stuiterende ballen (1 draw call)
export class SportHall {
  constructor(a) {
    this.a = a; this.t = 0; const g = new THREE.SphereGeometry(0.42, 12, 10);
    this.im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ roughness: 0.5, flatShading: false }), 3); this.im.frustumCulled = false; this.im.castShadow = false; this.im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    [0xff7a1a, 0xffffff, 0xffe14a].forEach((c, i) => this.im.setColorAt(i, new THREE.Color(c))); this.im.instanceColor.needsUpdate = true; a.scene.add(this.im);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.bz = a.zones[0];
  }
  update(dt, k = 0) {
    this.t += dt; const t = this.t, m = this._m, q = this._q, e = this._e, p = this._p, s = this._s, z = this.bz;
    // 0: basketbal dribbelt (stuitert met een platte klap), 1: voetbal rolt een rondje, 2: volleybal wordt over de hal gespeeld
    const b = Math.abs(Math.sin(t * 4.2)); const sq = 1 - Math.max(0, 0.25 - b) * 1.2;
    m.compose(p.set(z.cx + 2.6, 0.45 + b * 1.7, z.cz + 3.4), q.identity(), s.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq))); this.im.setMatrixAt(0, m);
    const an = t * 0.9; e.set(t * 3, 0, an * 2); q.setFromEuler(e); m.compose(p.set(z.cx - 1.6 + Math.cos(an) * 2.2, 0.42, z.cz + 4.6 + Math.sin(an) * 1.5), q, s.set(1, 1, 1)); this.im.setMatrixAt(1, m);
    const ph = (t / 3.6) % 2, dir = ph < 1 ? 1 : -1, u = ph % 1; e.set(t * 2, t, 0); q.setFromEuler(e);
    m.compose(p.set((dir > 0 ? -1 : 1) * (-9 + 18 * u), 1.4 + Math.sin(u * Math.PI) * 6.5, 11.5), q, s.set(1, 1, 1)); this.im.setMatrixAt(2, m);
    this.im.instanceMatrix.needsUpdate = true;
  }
}
