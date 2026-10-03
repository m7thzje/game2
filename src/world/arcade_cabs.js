// Kasten en kraampjes voor de speelhallen. Alles wordt in lokale coordinaten (voorkant = +z) in een Deco gezet (samengevoegd),
// alleen het scherm (cab.scr) is een eigen mesh zodat de Deurman er een andere texture op kan zetten.
// Elke bouwfunctie geeft { scr: {x,y,z,w,h,rx}, ix: afstand van het speelpunt voor de kast, hit: [[dx,dz,r],...] colliders (lokaal), lblY }
const PI = Math.PI;
const dark = 0x14102a;
const p = (i) => 'p' + (i % 3);

// ---------------------------------------------------------------- arcadekasten
export function cabUpright(D, trim, body = 0x2a1a46) {
  D.box(3.0, 0.35, 2.3, 0, 0.18, 0, trim);
  D.box(3.0, 4.6, 2.0, 0, 2.65, -0.15, body);
  D.box(3.3, 0.55, 2.4, 0, 5.25, 0, trim);
  D.box(0.12, 4.0, 1.7, -1.56, 2.7, -0.1, trim); D.box(0.12, 4.0, 1.7, 1.56, 2.7, -0.1, trim);
  D.box(2.75, 2.15, 0.25, 0, 3.55, 0.95, dark);
  D.box(3.1, 0.5, 1.5, 0, 1.9, 1.45, 0x1a1030, { rx: -0.3 });
  D.cyl(0.06, 0.06, 0.5, 6, -0.8, 2.3, 1.55, 0xcccccc, { kind: 'metal' }); D.sph(0.17, -0.8, 2.62, 1.55, 0xd8372c);
  [0x5ad8ff, 0xffe14a, 0x7bff7b].forEach((c, b) => D.cyl(0.14, 0.14, 0.1, 8, 0.3 + b * 0.5, 2.14, 1.68, c, { kind: 'glow', rx: -0.3 }));
  for (let i = 0; i < 5; i++) D.sph(0.13, -1.2 + i * 0.6, 5.28, 1.22, 0xfff0a0, { kind: p(i) });
  return { scr: { x: 0, y: 3.55, z: 1.1, w: 2.5, h: 1.9, rx: -0.1 }, ix: 3.3, hit: [[-0.8, 0, 1.15], [0.8, 0, 1.15]], lblY: 7.3 };
}
export function cabSit(D, trim, body = 0x20283a) {   // racekast: scherm achter, stoeltje + stuur ervoor
  D.box(3.5, 0.4, 3.4, 0, 0.2, 0.7, trim);
  D.box(3.3, 3.9, 0.8, 0, 2.35, -0.9, body); D.box(3.5, 0.5, 1.1, 0, 4.5, -0.9, trim);
  D.box(2.9, 2.2, 0.2, 0, 3.15, -0.45, dark);
  D.box(1.4, 0.45, 1.1, 0, 0.95, 2.1, 0x1a1030); D.box(1.4, 1.2, 0.25, 0, 1.7, 2.6, 0x1a1030); D.box(0.5, 0.45, 0.2, 0, 2.5, 2.6, trim);
  D.cyl(0.07, 0.07, 1.3, 6, 0, 1.0, 1.0, 0xcccccc, { kind: 'metal', rx: 0.5 });
  D.tor(0.45, 0.07, 0, 1.75, 0.8, 0x222233, { rx: 1.0 }, 12);
  for (const sx of [-1, 1]) D.box(0.18, 1.2, 1.4, sx * 1.55, 0.9, 0.9, trim);
  for (let i = 0; i < 5; i++) D.sph(0.13, -1.2 + i * 0.6, 4.55, -0.28, 0xfff0a0, { kind: p(i) });
  return { scr: { x: 0, y: 3.15, z: -0.33, w: 2.7, h: 2.0, rx: -0.08 }, ix: 3.9, hit: [[0, -0.4, 1.7], [0, 1.4, 0.9]], lblY: 6.8 };
}
export function cabTable(D, trim) {   // tafelkast: scherm plat op tafel (airhockey, memory, vier-op-een-rij...)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.cyl(0.14, 0.2, 1.3, 6, sx * 1.4, 0.65, sz * 1.0, trim);
  D.box(3.5, 0.25, 2.7, 0, 1.35, 0, trim);
  D.box(3.1, 0.3, 2.3, 0, 1.5, 0, dark);
  for (let i = 0; i < 6; i++) { D.sph(0.1, -1.5 + i * 0.6, 1.62, 1.28, 0xfff0a0, { kind: p(i) }); D.sph(0.1, -1.5 + i * 0.6, 1.62, -1.28, 0xfff0a0, { kind: p(i + 1) }); }
  D.cyl(0.07, 0.07, 1.3, 6, 1.7, 1.9, -1.2, 0xcccccc, { kind: 'metal' }); D.sph(0.22, 1.7, 2.6, -1.2, trim, { kind: 'glow' });
  return { scr: { x: 0, y: 1.68, z: 0, w: 2.8, h: 2.05, rx: -PI / 2 + 0.38 }, ix: 3.0, hit: [[0, 0, 1.9]], lblY: 4.4 };
}

// ---------------------------------------------------------------- kraampjes (Kermis)
function awning(D, c1, c2, w = 4.6, y = 4.9, z = -0.2, tilt = 0.32, depth = 3.0, n = 7) {
  const sw = w / n;
  for (let i = 0; i < n; i++) D.box(sw, 0.12, depth, -w / 2 + sw / 2 + i * sw, y, z + 0.4, i % 2 ? c2 : c1, { rx: tilt, kind: 'dbl' });
  for (let i = 0; i < n; i++) D.tri(sw, 0.35, -w / 2 + sw / 2 + i * sw, y - depth * Math.sin(tilt) / 2 + 0.05, z + 0.4 + depth / 2, i % 2 ? c1 : c2, { kind: 'dbl' });
}
function stallFrame(D, c1, c2, o = {}) {
  const w = o.w ?? 4.6;
  D.box(w, 1.15, 1.4, 0, 0.58, 0.5, o.counter ?? 0x9a6a38);
  D.box(w + 0.2, 0.14, 1.6, 0, 1.2, 0.5, o.top ?? 0xf6f0e0);
  D.box(w, 4.2, 0.2, 0, 2.1, -1.4, o.back ?? 0x7a5530);
  for (const sx of [-1, 1]) D.cyl(0.1, 0.1, 4.7, 6, sx * (w / 2 - 0.05), 2.35, 1.3, 0xcfa060);
  awning(D, c1, c2, w);
  // bordje op het dak (scherm) met pootjes
  D.box(3.3, 0.14, 0.14, 0, 5.4, -0.9, 0x5b3d24); D.box(0.14, 0.9, 0.14, -1.5, 5.8, -0.95, 0x5b3d24); D.box(0.14, 0.9, 0.14, 1.5, 5.8, -0.95, 0x5b3d24);
  D.box(3.3, 2.5, 0.14, 0, 6.65, -1.0, 0x3a2412);
  for (let i = 0; i < 8; i++) D.sph(0.12, -1.5 + i * 0.43, 8.0, -0.9, 0xfff0a0, { kind: p(i) });
  return { scr: { x: 0, y: 6.65, z: -0.9, w: 3.1, h: 2.3, rx: -0.2 }, ix: 3.3, hit: [[-1.2, 0.2, 1.4], [1.2, 0.2, 1.4]], lblY: 9.0 };
}

export const STALLS = {
  bake(D, c) {   // taartenkraam met een reuzentaart
    const r = stallFrame(D, 0xff7ab0, 0xf6f0e0, { counter: 0xf1c58a });
    D.cyl(0.95, 1.0, 0.5, 14, -0.9, 1.5, 0.5, 0xffb3d1); D.cyl(0.65, 0.7, 0.45, 14, -0.9, 1.97, 0.5, 0xfff0d8); D.cyl(0.4, 0.45, 0.4, 12, -0.9, 2.4, 0.5, 0xffb3d1); D.sph(0.2, -0.9, 2.78, 0.5, 0xd8372c);
    for (let i = 0; i < 3; i++) { D.cyl(0.4, 0.38, 0.2, 10, 0.5 + i * 0.7, 1.4, 0.7, [0xd49a58, 0xf1c58a, 0xb86a2f][i]); D.sph(0.09, 0.5 + i * 0.7, 1.55, 0.7, 0xd8372c); }
    D.cone(0.42, 0.7, 10, 1.8, 5.35, 0.3, 0xffffff); D.cyl(0.5, 0.5, 0.35, 12, 1.8, 5.1, 0.3, 0xffffff);   // koksmuts op het dak
    return r;
  },
  quiz(D, c) {   // quiz-podium met twee katheders en een spot
    D.cyl(2.7, 2.8, 0.45, 20, 0, 0.23, 0.6, 0x7a2fd4); D.ring(2.35, 2.55, 0, 0.5, 0.6, 0xffe14a, { kind: 'p0' }, 24);
    for (const [sx, col] of [[-1.2, 0x2f6fe0], [1.2, 0xd8372c]]) { D.box(1.1, 1.3, 0.8, sx, 1.1, 1.4, col); D.box(1.2, 0.12, 0.9, sx, 1.78, 1.4, 0xf6f0e0, { rx: -0.3 }); D.cyl(0.2, 0.2, 0.12, 10, sx, 1.9, 1.35, 0xffe14a, { kind: 'p' + (sx > 0 ? 1 : 2) }); }
    D.box(0.5, 1.7, 0.4, 0, 1.3, -0.6, 0x20283a); D.cyl(0.08, 0.08, 1.4, 6, 0, 2.9, -0.6, 0xcccccc, { kind: 'metal' }); D.sph(0.28, 0, 3.7, -0.6, 0x222233); D.cyl(0.04, 0.04, 0.3, 4, 0, 3.4, -0.6, 0xcccccc);
    D.box(5.0, 4.2, 0.25, 0, 2.55, -1.5, 0x20184a);
    for (let i = 0; i < 12; i++) { D.sph(0.14, -2.3 + i * 0.42, 4.7, -1.35, 0xfff0a0, { kind: p(i) }); D.sph(0.14, -2.3 + i * 0.42, 0.55, -1.35, 0xfff0a0, { kind: p(i + 1) }); }
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) D.sph(0.14, sx * 2.5, 0.9 + i * 0.9, -1.35, 0xfff0a0, { kind: p(i) });
    return { scr: { x: 0, y: 3.05, z: -1.33, w: 4.2, h: 3.0, rx: -0.08 }, ix: 3.8, hit: [[0, 0.4, 2.5]], lblY: 6.8 };
  },
  claw(D, c) {   // grijpkast met een kip erin
    D.box(4.0, 1.5, 3.0, 0, 0.75, 0, 0xd8372c); D.box(4.2, 0.3, 3.2, 0, 1.55, 0, 0xffe14a);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.box(0.22, 3.0, 0.22, sx * 1.9, 3.2, sz * 1.4, 0xffe14a);
    D.box(4.2, 0.3, 3.2, 0, 4.85, 0, 0xd8372c);
    D.box(3.6, 0.1, 0.1, 0, 4.6, -0.5, 0x888899, { kind: 'metal' }); D.cyl(0.04, 0.04, 1.3, 4, 0.6, 3.9, -0.5, 0xcccccc); D.cone(0.26, 0.4, 5, 0.6, 3.1, -0.5, 0xcccccc, { rx: PI });
    const pl = [0xff7ab0, 0x7bff7b, 0x5ad8ff, 0xffa030, 0xb05aff, 0xffe14a, 0xff5a5a];
    for (let i = 0; i < 12; i++) { const a = i * 2.4; D.sph(0.38, Math.cos(a) * 1.3, 1.95 + (i % 3) * 0.28, Math.sin(a) * 0.9, pl[i % 7], { kind: 'lit' }); }
    // de kip
    D.sph(0.5, -0.9, 2.15, 0.2, 0xf8f4ea, { sx: 0.9, sy: 0.9, sz: 1.2 }); D.sph(0.26, -0.9, 2.75, 0.5, 0xf8f4ea); D.cone(0.1, 0.28, 4, -0.9, 2.72, 0.78, 0xf2a33a, { rx: PI / 2 }); D.box(0.08, 0.22, 0.3, -0.9, 3.03, 0.5, 0xd83a2a); D.sph(0.05, -1.0, 2.82, 0.7, 0x111111, null, 5); D.sph(0.05, -0.8, 2.82, 0.7, 0x111111, null, 5);
    for (let i = 0; i < 6; i++) D.sph(0.13, -1.8 + i * 0.72, 5.1, 1.5, 0xfff0a0, { kind: p(i) });
    // bordje
    D.box(0.14, 1.2, 0.14, -1.4, 5.6, 0, 0x5b3d24); D.box(0.14, 1.2, 0.14, 1.4, 5.6, 0, 0x5b3d24); D.box(3.2, 2.5, 0.14, 0, 6.8, 0.0, 0x3a2412);
    return { scr: { x: 0, y: 6.8, z: 0.1, w: 3.0, h: 2.3, rx: -0.2 }, ix: 3.5, hit: [[0, 0, 2.5]], lblY: 9.0 };
  },
  bowling(D, c) {   // bowlingbaan met kegels
    D.box(2.5, 0.2, 5.6, 0, 0.12, -1.2, 0xe8c27a); for (const sx of [-1, 1]) D.box(0.3, 0.3, 5.6, sx * 1.4, 0.2, -1.2, 0x2f9be0);
    const pins = [[0, -3.4], [-0.3, -3.8], [0.3, -3.8], [-0.6, -4.2], [0, -4.2], [0.6, -4.2]];
    for (const [px, pz] of pins) { D.cyl(0.14, 0.2, 0.5, 6, px, 0.45, pz, 0xffffff); D.sph(0.17, px, 0.85, pz, 0xffffff, null, 6); D.box(0.3, 0.07, 0.3, px, 0.7, pz, 0xd8372c); }
    D.box(2.8, 1.5, 0.3, 0, 0.75, -4.9, 0x3a2412); D.box(3.6, 0.14, 1.5, 0, 1.2, 1.3, 0xf6f0e0); D.box(3.4, 0.9, 1.3, 0, 0.5, 1.3, 0x2f9be0);
    for (const [bx, col] of [[-1.2, 0xd8372c], [-0.4, 0x2f6fe0], [0.4, 0x2fae5b]]) D.sph(0.32, bx, 1.6, 1.3, col, null, 8);
    for (const sx of [-1, 1]) D.cyl(0.1, 0.1, 4.6, 6, sx * 1.9, 2.3, 1.7, 0xcfa060);
    D.box(4.4, 0.35, 0.4, 0, 4.7, 1.7, 0xd8372c); for (let i = 0; i < 7; i++) D.sph(0.12, -1.8 + i * 0.6, 4.7, 1.95, 0xfff0a0, { kind: p(i) });
    D.box(0.14, 1.2, 0.14, -1.4, 5.3, 1.6, 0x5b3d24); D.box(0.14, 1.2, 0.14, 1.4, 5.3, 1.6, 0x5b3d24); D.box(3.2, 2.5, 0.14, 0, 6.5, 1.6, 0x3a2412);
    return { scr: { x: 0, y: 6.5, z: 1.7, w: 3.0, h: 2.3, rx: -0.2 }, ix: 3.8, hit: [[0, 1.3, 1.9], [0, -2.5, 1.5]], lblY: 8.7 };
  },
  ducks(D, c) {   // eendenvijver
    D.cyl(2.5, 2.6, 0.7, 22, 0, 0.35, 0, 0xd8372c); D.cyl(2.2, 2.2, 0.72, 22, 0, 0.36, 0, 0x4aa8e8); D.cyl(2.3, 2.3, 0.1, 22, 0, 0.72, 0, 0xf6f0e0, null);
    D.disc(2.1, 0, 0.78, 0, 0x6ac0f0, { kind: 'glow' });
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + 0.4, r = 0.6 + (i % 3) * 0.55; const x = Math.cos(a) * r, z = Math.sin(a) * r; D.sph(0.26, x, 0.98, z, 0xffe14a, { sy: 0.8 }); D.sph(0.16, x + 0.1, 1.28, z + 0.12, 0xffe14a); D.cone(0.06, 0.16, 4, x + 0.2, 1.26, z + 0.2, 0xff8a1c, { rx: PI / 2 }); }
    D.cyl(0.1, 0.1, 4.2, 6, -2.5, 2.1, 0.6, 0xcfa060); D.cyl(0.1, 0.1, 4.2, 6, 2.5, 2.1, 0.6, 0xcfa060);
    D.box(5.4, 0.3, 0.3, 0, 4.2, 0.6, 0x2f9be0); for (let i = 0; i < 8; i++) D.sph(0.12, -2.4 + i * 0.68, 4.2, 0.82, 0xfff0a0, { kind: p(i) });
    D.box(3.2, 2.5, 0.14, 0, 5.8, 0.6, 0x3a2412); D.box(0.14, 1.4, 0.14, -1.4, 4.6, 0.6, 0x5b3d24); D.box(0.14, 1.4, 0.14, 1.4, 4.6, 0.6, 0x5b3d24);
    return { scr: { x: 0, y: 5.8, z: 0.7, w: 3.0, h: 2.3, rx: -0.2 }, ix: 4.3, hit: [[0, 0, 2.7]], lblY: 8.0 };
  },
  catapult(D, c) {   // kasteel-miniatuur met katapult
    D.box(4.4, 2.6, 1.6, 0, 1.3, -1.2, 0xa8a8b4);
    for (let i = 0; i < 6; i++) D.box(0.5, 0.45, 0.5, -2.0 + i * 0.8, 2.85, -0.5, 0xa8a8b4);
    for (const sx of [-1, 1]) { D.cyl(0.8, 0.9, 4.0, 10, sx * 2.5, 2.0, -1.2, 0x9898a6); D.cone(1.0, 1.2, 10, sx * 2.5, 4.6, -1.2, 0xd8372c); D.box(0.7, 0.9, 0.2, sx * 2.5, 2.9, -0.35, 0x20283a); }
    D.box(0.08, 1.0, 0.08, 2.5, 5.8, -1.2, 0x5b3d24); D.tri(0.9, 0.5, 2.85, 6.25, -1.2, 0xffd23f, { kind: 'dbl', rz: PI });
    D.box(1.2, 1.8, 0.2, 0, 0.95, -0.38, 0x3a2412);
    // katapult
    D.box(1.6, 0.25, 2.2, 0.0, 0.35, 1.5, 0x8a5a2b); for (const sx of [-1, 1]) { D.cyl(0.35, 0.35, 0.18, 10, sx * 0.9, 0.38, 2.4, 0x5b3d24, { rz: PI / 2 }); D.box(0.2, 1.5, 0.2, sx * 0.55, 0.95, 1.5, 0x8a5a2b); }
    D.box(0.2, 0.2, 2.8, 0, 1.6, 1.4, 0x8a5a2b, { rx: 0.55 }); D.cyl(0.4, 0.3, 0.3, 8, 0, 2.5, 0.35, 0x5b3d24); D.sph(0.28, 0, 2.8, 0.35, 0x8a8a96, null, 6);
    for (let i = 0; i < 4; i++) D.sph(0.28, 1.4 + (i % 2) * 0.5, 0.3 + (i > 1 ? 0.5 : 0), 1.9 + (i > 1 ? 0.3 : 0.0), 0x8a8a96, null, 6);
    D.box(3.4, 0.14, 0.14, 0, 5.1, -0.1, 0x5b3d24);
    return { scr: { x: 0, y: 3.6, z: -0.38, w: 2.4, h: 1.8, rx: -0.05 }, ix: 3.9, hit: [[0, -1.2, 2.2], [-2.5, -1.2, 1.0], [2.5, -1.2, 1.0], [0, 1.6, 1.2]], lblY: 7.0 };
  },
  code(D, c) {   // waarzegger-tent met kristallen bol
    D.cone(2.6, 4.6, 10, 0, 2.3, -1.4, 0x5b2a9a, { kind: 'dbl' }); D.cyl(2.6, 2.6, 0.12, 10, 0, 0.06, -1.4, 0xffd23f);
    D.box(1.5, 2.4, 0.1, 0, 1.2, -0.25, 0x3a1060, { kind: 'dbl', rx: -0.15 });
    for (let i = 0; i < 7; i++) D.sph(0.13, -1.9 + i * 0.63, 0.15, 0.5, 0xffd23f, { kind: p(i) });
    D.box(1.8, 1.0, 1.2, 0, 0.5, 1.7, 0x3a1060); D.box(2.0, 0.1, 1.3, 0, 1.05, 1.7, 0xffd23f);
    D.cyl(0.25, 0.4, 0.3, 8, 0, 1.25, 1.7, 0xffd23f, { kind: 'metal' }); D.sph(0.55, 0, 1.9, 1.7, 0xc9a0ff, { kind: 'p0' }, 12);
    for (let i = 0; i < 5; i++) D.box(0.22, 0.22, 0.04, -1.8 + i * 0.9, 3.6 - Math.abs(i - 2) * 0.4, 0.6, 0xffe14a, { kind: 'p' + (i % 3), rz: i });
    D.cone(0.1, 0.9, 4, 0, 5.2, -1.4, 0xffd23f); D.sph(0.2, 0, 5.75, -1.4, 0xffd23f, { kind: 'glow' });
    D.box(0.14, 1.5, 0.14, -1.5, 3.9, 2.5, 0x5b3d24); D.box(0.14, 1.5, 0.14, 1.5, 3.9, 2.5, 0x5b3d24); D.box(3.2, 2.4, 0.14, 0, 4.9, 2.5, 0x3a2412);
    return { scr: { x: 0, y: 4.9, z: 2.6, w: 3.0, h: 2.25, rx: -0.2 }, ix: 4.2, hit: [[0, -1.4, 2.3], [0, 1.7, 1.2]], lblY: 7.0 };
  },
  hide(D, c) {   // verkleedkamer met spiegel en hoeden
    D.box(4.6, 4.2, 0.2, 0, 2.1, -1.4, 0x7a2f5a); D.box(4.8, 0.4, 1.0, 0, 4.4, -0.9, 0xff7ab0);
    D.box(1.7, 3.2, 0.25, -1.4, 1.9, -1.2, 0xb0b8c8, { kind: 'metal' }); D.box(1.5, 3.0, 0.1, -1.4, 1.9, -1.05, 0xcfeaff, { kind: 'glow' }); D.box(1.9, 3.4, 0.2, -1.4, 1.9, -1.3, 0xffd23f);
    D.box(0.12, 4.0, 0.12, 1.4, 2.0, -0.6, 0x5b3d24); D.box(1.6, 0.1, 0.1, 1.4, 2.8, -0.6, 0x5b3d24);
    D.cyl(0.07, 0.07, 3.0, 6, 0.4, 1.5, 0.6, 0x5b3d24);
    const hats = [[0xd8372c, 0], [0x2f6fe0, 1], [0xffd23f, 0], [0x7bff7b, 1]]; hats.forEach(([col, k], i) => { if (k) D.cone(0.3, 0.7, 6, 0.4, 3.3 - i * 0.55 + 0.2, 0.6, col); else D.cyl(0.26, 0.3, 0.3, 8, 0.4, 3.1 - i * 0.5, 0.6, col); D.cyl(0.42, 0.42, 0.05, 10, 0.4, 3.0 - i * 0.5 - 0.1, 0.6, col); });
    for (let i = 0; i < 4; i++) { D.box(0.5, 1.0, 0.1, 1.0 + i * 0.4, 2.2, -0.6, [0xd8372c, 0x2f9be0, 0xffd23f, 0x7bff7b][i], { rz: 0.04 * i }); }
    D.box(1.4, 1.1, 1.0, 1.4, 0.55, 0.3, 0x7a2f5a); D.box(1.5, 0.1, 1.1, 1.4, 1.15, 0.3, 0xff7ab0);
    for (let i = 0; i < 6; i++) D.sph(0.12, -2.1 + i * 0.84, 4.62, 0.4, 0xfff0a0, { kind: p(i) });
    D.box(0.14, 1.2, 0.14, -1.2, 5.3, -0.9, 0x5b3d24); D.box(0.14, 1.2, 0.14, 1.2, 5.3, -0.9, 0x5b3d24); D.box(3.2, 2.5, 0.14, 0, 6.5, -0.95, 0x3a2412);
    return { scr: { x: 0, y: 6.5, z: -0.85, w: 3.0, h: 2.3, rx: -0.2 }, ix: 3.4, hit: [[0, -0.8, 2.3]], lblY: 8.7 };
  },
  heist(D, c) {   // bankkluis met lasers
    D.box(4.2, 3.8, 2.2, 0, 1.9, -0.9, 0x6a707e, { kind: 'metal' }); D.box(4.4, 0.4, 2.4, 0, 3.9, -0.9, 0x4a4f5c, { kind: 'metal' });
    D.cyl(1.2, 1.2, 0.3, 16, 0, 1.9, 0.3, 0x9aa0ae, { kind: 'metal', rx: PI / 2 }); D.cyl(0.4, 0.4, 0.4, 10, 0, 1.9, 0.55, 0xffd23f, { kind: 'metal', rx: PI / 2 });
    for (let i = 0; i < 6; i++) D.box(0.08, 0.5, 0.08, Math.cos(i * 1.05) * 0.85, 1.9 + Math.sin(i * 1.05) * 0.85, 0.5, 0xffd23f, { rz: i * 1.05 });
    for (let i = 0; i < 8; i++) { D.box(0.7, 0.28, 0.35, -2.2 + (i % 4) * 0.62 - 0.0, 0.14 + Math.floor(i / 4) * 0.3, 1.5, 0xffd23f, { kind: 'metal' }); }
    for (let i = 0; i < 3; i++) D.sph(0.38, 1.6 + i * 0.4, 0.38, 1.4 + (i % 2) * 0.4, 0x8a6a3a, { sy: 1.2 });
    for (let i = 0; i < 4; i++) D.box(2.6, 0.04, 0.04, -0.2, 0.5 + i * 0.55, 1.9 - i * 0.18, 0xff2a1a, { kind: 'p' + (i % 3), rz: (i % 2 ? 1 : -1) * 0.15 });
    for (const sx of [-1, 1]) D.cyl(0.08, 0.08, 4.4, 6, sx * 2.4, 2.2, 2.0, 0xcccccc, { kind: 'metal' });
    D.box(0.14, 1.2, 0.14, -1.4, 4.9, -0.9, 0x5b3d24); D.box(0.14, 1.2, 0.14, 1.4, 4.9, -0.9, 0x5b3d24); D.box(3.2, 2.4, 0.14, 0, 6.3, -0.95, 0x3a2412);
    return { scr: { x: 0, y: 6.3, z: -0.85, w: 3.0, h: 2.25, rx: -0.2 }, ix: 3.7, hit: [[0, -0.8, 2.4], [0, 1.4, 1.2]], lblY: 8.5 };
  },
  pinball(D, c) {   // reuzen-flipperkast
    D.box(4.0, 0.3, 4.2, 0, 1.6, 0.6, 0x20283a, { rx: 0.0 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.box(0.35, 1.5, 0.35, sx * 1.75, 0.75, 0.6 + sz * 1.8, 0xd8372c);
    D.box(3.6, 0.2, 3.7, 0, 1.95, 0.7, 0x3a78e0, { rx: -0.12 });
    for (const [bx, bz, col] of [[-0.9, 0.0, 0xff5ad8], [0.9, -0.2, 0xffe14a], [0.0, 0.9, 0x5ad8ff], [-1.1, 1.6, 0x7bff7b], [1.1, 1.4, 0xff8a1c]]) { D.cyl(0.35, 0.35, 0.3, 10, bx, 2.2, bz + 0.6, 0xffffff); D.cyl(0.25, 0.25, 0.34, 10, bx, 2.22, bz + 0.6, col, { kind: 'glow' }); }
    for (const sx of [-1, 1]) D.box(1.1, 0.12, 0.28, sx * 0.55, 2.15, 2.3, 0xf6f0e0, { ry: sx * 0.5 });
    D.sph(0.14, 0.6, 2.15, 0.2, 0xcccccc, { kind: 'metal' });
    D.box(3.8, 4.6, 0.7, 0, 3.9, -1.5, 0x20283a); D.box(4.0, 0.5, 0.9, 0, 6.35, -1.5, 0xd8372c);
    for (let i = 0; i < 7; i++) D.sph(0.13, -1.8 + i * 0.6, 6.4, -0.98, 0xfff0a0, { kind: p(i) });
    return { scr: { x: 0, y: 4.2, z: -1.1, w: 3.2, h: 2.4, rx: -0.12 }, ix: 4.0, hit: [[0, 0.3, 2.4], [0, -1.5, 1.6]], lblY: 8.1 };
  },
  kalaha(D, c) {   // kalaha-tafel onder een prieeltje
    D.box(4.4, 0.35, 2.0, 0, 1.2, 0.6, 0x8a5a2b); D.box(4.0, 0.2, 1.7, 0, 1.45, 0.6, 0xc08a50);
    for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) { D.disc(0.26, -1.55 + i * 0.62, 1.56, 0.6 + sz * 0.42, 0x5b3d24, null, 10); if ((i + (sz > 0 ? 1 : 0)) % 2 === 0) D.sph(0.13, -1.55 + i * 0.62, 1.65, 0.6 + sz * 0.42, [0xff5ad8, 0x5ad8ff, 0x7bff7b, 0xffe14a][i % 4], null, 6); }
    D.cyl(0.4, 0.4, 0.18, 10, -2.0, 1.56, 0.6, 0x5b3d24); D.cyl(0.4, 0.4, 0.18, 10, 2.0, 1.56, 0.6, 0x5b3d24); D.sph(0.2, -2.0, 1.75, 0.6, 0xffd23f, null, 6); D.sph(0.2, 2.0, 1.75, 0.6, 0xffd23f, null, 6);
    for (const sx of [-1, 1]) { D.cyl(0.25, 0.3, 1.0, 8, sx * 1.4, 0.5, 2.0, 0xd8372c); D.cyl(0.35, 0.35, 0.12, 8, sx * 1.4, 1.05, 2.0, 0xf6f0e0); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) D.cyl(0.09, 0.09, 4.4, 6, sx * 2.4, 2.2, 0.6 + sz * 1.3, 0xcfa060);
    D.box(5.2, 0.2, 3.4, 0, 4.5, 0.6, 0x7a2fd4); D.cone(2.9, 0.9, 4, 0, 5.1, 0.6, 0xffd23f, { ry: PI / 4, sx: 1.0, sz: 0.7, kind: 'dbl' });
    for (let i = 0; i < 7; i++) D.sph(0.12, -2.4 + i * 0.8, 4.4, 2.3, 0xfff0a0, { kind: p(i) });
    D.box(3.2, 2.4, 0.14, 0, 6.8, 0.6, 0x3a2412);
    return { scr: { x: 0, y: 6.8, z: 0.7, w: 3.0, h: 2.25, rx: -0.2 }, ix: 3.8, hit: [[0, 0.6, 2.4]], lblY: 9.0 };
  },
  flappy(D, c) {   // wolkenrace: wolken op palen en een paarse draak
    D.cyl(2.5, 2.6, 0.35, 18, 0, 0.18, 0.2, 0x7ad0ff); D.ring(2.0, 2.3, 0, 0.4, 0.2, 0xffffff, { kind: 'p1' }, 20);
    for (const [px, py, pz, s] of [[-1.8, 3.3, 0.6, 0.9], [1.9, 4.1, 0.2, 1.0], [0.1, 5.0, -0.8, 1.1]]) { D.cyl(0.07, 0.07, py, 6, px, py / 2, pz, 0xcfa060); for (let i = 0; i < 4; i++) D.sph(0.5 * s, px + (i - 1.5) * 0.45 * s, py + (i % 2) * 0.2, pz, 0xffffff, { sy: 0.75 }, 8); }
    // draak
    const dc = 0x7a2fd4; for (let i = 0; i < 6; i++) D.sph(0.45 - i * 0.04, -0.6 - i * 0.55, 1.0 + Math.sin(i * 0.9) * 0.35, 0.4 + Math.cos(i) * 0.1, dc, null, 8);
    D.sph(0.5, 0.5, 1.35, 0.5, dc); D.sph(0.38, 1.0, 1.85, 0.5, dc); D.box(0.5, 0.3, 0.6, 1.4, 1.8, 0.5, dc); for (const sz of [-1, 1]) { D.sph(0.08, 1.2, 2.05, 0.5 + sz * 0.22, 0xffffff, null, 5); D.cone(0.08, 0.35, 4, 1.0, 2.3, 0.5 + sz * 0.25, 0xf5ecd0); }
    for (const sz of [-1, 1]) D.tri(1.4, 1.0, 0.0, 1.9, 0.5 + sz * 0.5, 0xc08cff, { kind: 'dbl', ry: sz * 1.2, rz: PI });
    D.box(0.14, 1.2, 0.14, -2.0, 5.3, -1.4, 0x5b3d24); D.box(0.14, 1.2, 0.14, 2.0, 5.3, -1.4, 0x5b3d24); D.box(3.2, 2.4, 0.14, 0, 6.5, -1.45, 0x3a2412);
    return { scr: { x: 0, y: 6.5, z: -1.35, w: 3.0, h: 2.25, rx: -0.2 }, ix: 4.2, hit: [[0, 0.2, 2.6]], lblY: 8.7 };
  },
};
// Reservekraam voor spellen die later aan de Kermis worden toegevoegd
STALLS.default = (D, c) => stallFrame(D, c, 0xf6f0e0);
