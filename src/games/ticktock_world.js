import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';

// Omgeving en onderdelen van "Klokkentoren-Sprong": een gigantische wijzerplaat boven een afgrond vol tandwielen,
// wijzers (als lage muren), koekoekshuisjes, een tijdstop-ster en een pendule.

export const PLATE_R = 9.7;
const ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

// ---------------- tandwielen ----------------
export function gearGeo(R, teeth, depth, { toothH = 0.13, inner = 0, holes = 0, holeR = 0.16, holeAt = 0.62 } = {}) {
  const shape = new THREE.Shape();
  const step = TAU / teeth, r0 = R * (1 - toothH);
  let first = true;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [aa, rr] of [[a + step * 0.04, r0], [a + step * 0.2, R], [a + step * 0.52, R], [a + step * 0.68, r0]]) {
      const x = Math.cos(aa) * rr, y = Math.sin(aa) * rr;
      if (first) { shape.moveTo(x, y); first = false; } else shape.lineTo(x, y);
    }
  }
  shape.closePath();
  if (inner > 0) { const h = new THREE.Path(); h.absarc(0, 0, inner, 0, TAU, true); shape.holes.push(h); }
  for (let k = 0; k < holes; k++) {
    const a = k / holes * TAU; const h = new THREE.Path();
    h.absarc(Math.cos(a) * R * holeAt, Math.sin(a) * R * holeAt, R * holeR, 0, TAU, true); shape.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 8 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function gearMat(color, emissive = 0x000000) { return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.45, flatShading: true, emissive, emissiveIntensity: 0.4 }); }

// ---------------- prisma (platte vorm met hoogte) ----------------
// punten [x, voorwaarts]; voorwaarts = -z in de lokale ruimte; hoogte langs +y
export function prismGeo(pts, hh, bevel = 0.05) {
  const s = new THREE.Shape(); pts.forEach(([x, f], i) => (i ? s.lineTo(x, f) : s.moveTo(x, f))); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.01, hh - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, bevel, 0);
  return g;
}

export const HAND_DEF = {
  hour: { len: 6.9, tail: 1.4, w: 1.0, hh: 0.85, base: 0.4, tip: 1.4 },
  minute: { len: 9.0, tail: 1.8, w: 0.75, hh: 0.75, base: 0.72, tip: 1.6 },
  second: { len: 9.3, tail: 2.2, w: 0.5, hh: 0.65, base: 1.25, tip: 1.2 },
  gold: { len: 9.3, tail: 1.2, w: 4.4, hh: 1.75, base: 0.24, tip: 3.8 },
};
function handPts(kind) {
  const d = HAND_DEF[kind], a = d.w / 2, L = d.len;
  if (kind === 'hour') return [[-0.35, -1.4], [0.35, -1.4], [a * 0.9, -0.4], [a, 0.5], [a, 4.4], [a * 1.55, 5.2], [0, L], [-a * 1.55, 5.2], [-a, 4.4], [-a, 0.5], [-a * 0.9, -0.4]];
  if (kind === 'minute') return [[-0.3, -1.8], [0.3, -1.8], [a * 0.8, -0.8], [a, 0.2], [a * 0.8, L - 2.4], [a * 1.5, L - 1.5], [0, L], [-a * 1.5, L - 1.5], [-a * 0.8, L - 2.4], [-a, 0.2], [-a * 0.8, -0.8]];
  if (kind === 'second') return [[-0.2, -1.3], [0.2, -1.3], [a * 0.5, 0], [a * 0.5, L - 1.4], [a * 1.3, L - 1.2], [0, L], [-a * 1.3, L - 1.2], [-a * 0.5, L - 1.4], [-a * 0.5, 0]];
  return [[-1.0, -1.2], [1.0, -1.2], [a, 0.5], [a, 3.0], [1.35, 6.3], [0, L], [-1.35, 6.3], [-a, 3.0], [-a, 0.5]];
}

export function makeHand(kind) {
  const d = HAND_DEF[kind]; const g = new THREE.Group();
  const pts = handPts(kind);
  const body = { hour: 0x2d3d86, minute: 0xc08a2c, second: 0xe0242a, gold: 0xffc93a }[kind];
  const top = { hour: 0x7f9bff, minute: 0xffdd7a, second: 0xff8a7a, gold: 0xffe888 }[kind];
  const m = kind === 'gold'
    ? new THREE.MeshStandardMaterial({ color: body, emissive: 0x7a4a00, emissiveIntensity: 0.55, metalness: 0.75, roughness: 0.28, flatShading: true })
    : new THREE.MeshStandardMaterial({ color: body, emissive: body, emissiveIntensity: kind === 'second' ? 0.5 : 0.18, metalness: 0.4, roughness: 0.45, flatShading: true });
  const b = new THREE.Mesh(prismGeo(pts, d.hh), m); b.castShadow = false; b.receiveShadow = false; g.add(b);
  // lichtere bovenlaag (inset)
  const inset = pts.map(([x, f]) => [x * (kind === 'gold' ? 0.42 : 0.55), f * 0.9]);
  const t = new THREE.Mesh(prismGeo(inset, 0.1, 0.0), new THREE.MeshStandardMaterial({ color: top, emissive: top, emissiveIntensity: 0.25, metalness: 0.3, roughness: 0.4, flatShading: true }));
  t.position.y = d.hh - 0.02; g.add(t);
  // gevaarstrepen onderaan
  const stripeM = mat(0x15101c);
  const n = Math.floor((d.len - 1) / 1.1);
  for (let i = 0; i < n; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(d.w * 1.02 + (kind === 'hour' ? 0.02 : 0.06), 0.14, 0.36), stripeM);
    s.position.set(0, 0.1, -(0.8 + i * 1.1)); g.add(s);
  }
  if (kind === 'second') { // tegengewicht
    const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, d.hh, 12), m); cw.position.set(0, d.hh / 2, 1.8); g.add(cw);
    const cw2 = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.14, 10), mat(0xfff0f0)); cw2.position.set(0, d.hh + 0.05, 1.8); g.add(cw2);
  }
  if (kind === 'hour' || kind === 'minute') { // sierrand: edelsteentjes
    const gm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: kind === 'hour' ? 0x66aaff : 0xffe28a, emissiveIntensity: 0.9 });
    for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), gm); s.position.set(0, d.hh + 0.18, -(1.8 + i * (d.len - 3.4) / 2.2)); s.scale.y = 1.4; g.add(s); }
  }
  if (kind === 'gold') {
    const gm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff5a3a, emissiveIntensity: 1.0, roughness: 0.2 });
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), gm); s.position.set(0, d.hh + 0.3, -(1.6 + i * 1.7)); s.scale.y = 1.4; g.add(s); }
    const sun = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.12, 14), mat(0xfff6c0, { emissive: 0xffc030, emissiveIntensity: 0.6 })); sun.position.set(0, d.hh + 0.05, -7.0); g.add(sun);
  }
  g.userData.body = b; g.userData.mat = m;
  return g;
}
export function makeGhost(kind) {
  const d = HAND_DEF[kind];
  const m = new THREE.MeshBasicMaterial({ color: kind === 'hour' ? 0x2a4cff : kind === 'minute' ? 0xff7a00 : kind === 'second' ? 0xff1a2a : 0xff8a00, transparent: true, opacity: 0.55, depthWrite: false });
  const g = new THREE.Mesh(prismGeo(handPts(kind), 0.06, 0), m); g.position.y = 0.04; g.visible = false; g.renderOrder = 3;
  g.userData.base = d; return g;
}

// ---------------- dial-texture ----------------
function dialTexture() {
  return canvasTex(1024, 1024, (g, w, h) => {
    const cx = w / 2, R = w / 2;
    const gr = g.createRadialGradient(cx, cx, 20, cx, cx, R); gr.addColorStop(0, '#fff6dc'); gr.addColorStop(0.75, '#f2deb0'); gr.addColorStop(1, '#d3b070');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = mulberry32(5);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(110,70,20,${0.02 + r() * 0.05})`; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 14, 0, TAU); g.fill(); }
    // ringen
    g.strokeStyle = '#4a2c10'; g.lineWidth = 7; g.beginPath(); g.arc(cx, cx, R * 0.985, 0, TAU); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(cx, cx, R * 0.88, 0, TAU); g.stroke(); g.beginPath(); g.arc(cx, cx, R * 0.64, 0, TAU); g.stroke();
    // minuutstreepjes
    for (let i = 0; i < 60; i++) {
      const a = i / 60 * TAU, big = i % 5 === 0, r1 = R * 0.88, r2 = R * (big ? 0.80 : 0.845);
      g.strokeStyle = '#3a2008'; g.lineWidth = big ? 6 : 2.5; g.beginPath(); g.moveTo(cx + Math.sin(a) * r1, cx - Math.cos(a) * r1); g.lineTo(cx + Math.sin(a) * r2, cx - Math.cos(a) * r2); g.stroke();
    }
    // romeinse cijfers
    g.fillStyle = '#2a1608'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU, rr = R * 0.715;
      g.save(); g.translate(cx + Math.sin(a) * rr, cx - Math.cos(a) * rr); g.rotate(a);
      g.font = 'bold 74px Georgia, "Times New Roman", serif'; g.shadowColor = 'rgba(255,255,255,.5)'; g.shadowBlur = 2;
      g.fillText(ROMAN[i], 0, 0); g.restore();
    }
    // decoratief sterrenpatroon in het midden
    g.strokeStyle = 'rgba(120,70,20,.55)'; g.lineWidth = 3;
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; g.beginPath(); g.moveTo(cx + Math.sin(a) * R * 0.1, cx - Math.cos(a) * R * 0.1); g.lineTo(cx + Math.sin(a + 0.13) * R * 0.5, cx - Math.cos(a + 0.13) * R * 0.5); g.stroke(); }
    g.fillStyle = 'rgba(120,70,20,.2)';
    for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * TAU; g.beginPath(); g.arc(cx + Math.sin(a) * R * 0.5, cx - Math.cos(a) * R * 0.5, 22, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(70,40,10,.6)'; g.font = 'italic bold 44px Georgia, serif';
    g.save(); g.translate(cx, cx - R * 0.32); g.fillText('TIK  &  TAK', 0, 0); g.restore();
    g.save(); g.translate(cx, cx + R * 0.34); g.fillText('Klokkenmakerij Kasteelberg', 0, 0); g.restore();
  });
}
function glowTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }

// ---------------- koekoeks-huisje ----------------
export function makeCuckoo() {
  const g = new THREE.Group();
  const wood = mat(0x7a4a26), dark = mat(0x3a2210), roof = mat(0xa8322a), trim = mat(0xe8c14a, { metalness: 0.5, roughness: 0.45 });
  const body = mesh(new THREE.BoxGeometry(2.8, 2.6, 2.0), wood, { pos: [0, 1.0, 0] }); g.add(body);
  // dak (driehoekig prisma met overstek) + houten gevel
  { const sh = new THREE.Shape(); sh.moveTo(-2.05, 0); sh.lineTo(2.05, 0); sh.lineTo(0, 1.55); sh.closePath();
    const rg = new THREE.ExtrudeGeometry(sh, { depth: 2.9, bevelEnabled: false }); rg.translate(0, 0, -1.45);
    g.add(mesh(rg, roof, { pos: [0, 2.28, 0] }));
    const gb = new THREE.Shape(); gb.moveTo(-1.45, 0); gb.lineTo(1.45, 0); gb.lineTo(0, 1.25); gb.closePath();
    const gg = new THREE.ExtrudeGeometry(gb, { depth: 0.08, bevelEnabled: false });
    g.add(mesh(gg, mat(0x9a6034), { pos: [0, 2.3, 1.02], cast: false })); }
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.22, 3.0), trim, { pos: [0, 3.85, 0] }));
  // gevel (kijkt naar +z lokaal): deur-opening
  g.add(mesh(new THREE.BoxGeometry(1.1, 1.15, 0.1), mat(0x0a0608), { pos: [0, 1.15, 1.02], cast: false }));
  const doors = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 0.58, 1.15, 1.06); g.add(piv);
    piv.add(mesh(new THREE.BoxGeometry(0.58, 1.15, 0.07), mat(0xc8782c), { pos: [-sx * 0.29, 0, 0] }));
    doors.push(piv);
  }
  // kleine klok boven de deur
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), new THREE.MeshBasicMaterial({ color: 0xfff1c8 })); face.position.set(0, 2.15, 1.03); g.add(face);
  g.add(mesh(new THREE.TorusGeometry(0.44, 0.06, 5, 16), trim, { pos: [0, 2.15, 1.04], cast: false }));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.3, 0.03), dark, { pos: [0, 2.25, 1.06], cast: false, rot: [0, 0, 0.5] }));
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.22, 0.03), dark, { pos: [0.08, 2.1, 1.06], cast: false, rot: [0, 0, -1.3] }));
  // sokkel/steun naar de plaat
  g.add(mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), mat(0x55402a), { pos: [0, -0.5, 0] }));
  // vogel
  const bird = new THREE.Group(); bird.position.set(0, 1.0, 0.9); g.add(bird);
  const red = mat(0xd8372c, { flatShading: false }), cream = mat(0xfff0d0, { flatShading: false });
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 1, 8), red); neck.rotation.x = Math.PI / 2; neck.castShadow = false; bird.add(neck);
  const head = new THREE.Group(); bird.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.52, 12, 9), red, { cast: false }));
  head.add(mesh(new THREE.SphereGeometry(0.4, 10, 8), cream, { cast: false, pos: [0, -0.18, 0.12], scale: [0.95, 0.7, 0.9] }));
  head.add(mesh(new THREE.ConeGeometry(0.2, 0.7, 6), mat(0xffb020, { flatShading: false }), { cast: false, pos: [0, -0.04, 0.62], rot: [Math.PI / 2, 0, 0] }));
  for (const sx of [-1, 1]) {
    head.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [sx * 0.24, 0.2, 0.34] }));
    head.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [sx * 0.25, 0.2, 0.44] }));
    head.add(mesh(new THREE.ConeGeometry(0.1, 0.4, 4), red, { cast: false, pos: [sx * 0.12, 0.56, -0.05], rot: [-0.3, 0, -sx * 0.4] }));
  }
  bird.visible = false;
  g.userData = { doors, bird, neck, head };
  g.traverse((o) => { if (o.isMesh && o.castShadow === undefined) o.castShadow = false; });
  return g;
}

// ---------------- tijdstop-ster ----------------
export function makeStar(color = 0xffd23a) {
  const g = new THREE.Group();
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, r = i % 2 ? 0.55 : 1.15; (i ? s.lineTo : s.moveTo).call(s, Math.cos(a) * r, Math.sin(a) * r); }
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
  geo.translate(0, 0, -0.17);
  const star = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, emissive: 0xffa000, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3, flatShading: true }));
  g.add(star);
  // klokje op de ster
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.42, 14), new THREE.MeshBasicMaterial({ color: 0xfffbe8 })); face.position.z = 0.32; g.add(face);
  const h1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.02), new THREE.MeshBasicMaterial({ color: 0x222222 })); h1.position.set(0, 0.1, 0.34); g.add(h1);
  const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0x222222 })); h2.position.set(0.1, 0, 0.34); g.add(h2);
  g.userData = { star };
  return g;
}

// ---------------- de toren ----------------
export function buildTower(ctx, rng) {
  const { scene } = ctx;
  const W = { anim: [], lamps: [], arena: new THREE.Group(), shafts: [], flameMeshes: [], pend: null, weights: [] };
  scene.fog = new THREE.Fog(0x1c1236, 60, 190);
  scene.background = new THREE.Color(0x120a22);

  // ---- muren ----
  const wallTex = tex.stone(36, 10).clone(); wallTex.needsUpdate = true; wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(36, 10);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(62, 62, 220, 48, 1, true), new THREE.MeshStandardMaterial({ map: wallTex, color: 0x6c5c96, side: THREE.BackSide, roughness: 1, flatShading: true }));
  wall.position.y = 30; scene.add(wall);
  // bogen met maanlicht in de achterwand
  const glow = glowTex();
  const winM = new THREE.MeshBasicMaterial({ color: 0xbfd2ff, fog: false });
  const frameM = mat(0x2a2038);
  for (const [ang, y, s] of [[-0.62, 26, 1], [-0.2, 30, 1.25], [0.25, 28, 1.1], [0.66, 25, 0.95], [-1.1, 22, 0.8], [1.12, 23, 0.85]]) {
    const R = 61; const grp = new THREE.Group(); grp.position.set(Math.sin(ang) * R, y, -Math.cos(ang) * R); grp.rotation.y = -ang; scene.add(grp);
    const w = 7 * s, h = 14 * s;
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(-w / 2, h * 0.65); sh.absarc(0, h * 0.65, w / 2, Math.PI, 0, true); sh.lineTo(w / 2, 0); sh.closePath();
    const win = new THREE.Mesh(new THREE.ShapeGeometry(sh), winM); win.position.z = 0.2; grp.add(win);
    // kozijn
    for (const dx of [-0.01]) grp.add(mesh(new THREE.BoxGeometry(0.4, h * 0.65, 0.3), frameM, { cast: false, pos: [dx, h * 0.33, 0.3] }));
    grp.add(mesh(new THREE.BoxGeometry(w, 0.4, 0.3), frameM, { cast: false, pos: [0, h * 0.42, 0.3] }));
    const hal = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0x9fb8ff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); hal.scale.set(w * 3.2, h * 1.7, 1); hal.position.set(0, h * 0.5, 1.0); grp.add(hal);
  }
  // lichtbundels
  for (const [x, z, r] of [[-14, -30, 0.5], [3, -34, -0.1], [20, -28, -0.55]]) {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 6, 70, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xaec4ff, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    cone.position.set(x, 22, z); cone.rotation.z = r * 0.4; cone.rotation.x = 0.2; scene.add(cone); W.shafts.push(cone);
  }

  // ---- tandwielen ----
  const bronze = [0xb7863a, 0x9a6c2c, 0x7a5224, 0x5c3c1c, 0x45301a];
  const addGear = (parent, x, y, z, R, teeth, depth, color, speed, axis, o = {}) => {
    const geo = gearGeo(R, teeth, depth, { holes: o.holes ?? 6, holeR: o.holeR ?? 0.15, inner: o.inner || 0, toothH: o.toothH ?? 0.12 });
    const m = new THREE.Mesh(geo, gearMat(color, o.emissive ?? 0x120800)); m.castShadow = false;
    const gr = new THREE.Group(); gr.position.set(x, y, z); gr.add(m);
    // naaf
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.12, R * 0.12, depth * 1.5, 10), gearMat(0xd4a548)); hub.rotation.x = Math.PI / 2; gr.add(hub);
    if (axis === 'y') gr.rotation.x = -Math.PI / 2;
    parent.add(gr);
    W.anim.push({ spin: m, hub, speed, axis, o: gr });
    return gr;
  };
  // ring-tandwiel om de plaat (waar de gevallen broers op stuiteren)
  { const geo = gearGeo(18.5, 44, 1.6, { inner: 11.6, holes: 0, toothH: 0.075 }); const m = new THREE.Mesh(geo, gearMat(0xa8782f, 0x1a0e00)); m.rotation.x = -Math.PI / 2; m.position.y = -5.2; scene.add(m); W.anim.push({ spin: m, speed: 0.07, axis: 'ringY' }); W.ring = m;
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; const bolt = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 8), mat(0xd9b050, { metalness: 0.6 }), { cast: false, rot: [Math.PI / 2, 0, 0], pos: [Math.cos(a) * 15, Math.sin(a) * 15, 0.8] }); m.add(bolt); }
  }
  // diepere tandwielen (horizontaal)
  const deep = [[-20, -13, -4, 13, 26, 1, 0.1], [17, -17, 4, 14, 28, 2, -0.09], [-4, -24, -14, 19, 34, 2, 0.07], [26, -27, -18, 15, 28, 3, -0.11], [-30, -21, -22, 20, 36, 3, 0.06], [3, -38, 8, 24, 40, 4, -0.05], [-18, -33, 14, 14, 26, 4, 0.1], [34, -10, 10, 11, 22, 1, 0.12]];
  for (const [x, y, z, R, t, ci, sp] of deep) addGear(scene, x, y, z, R, t, 1.4, bronze[ci], sp, 'y');
  // verticale tandwielen op de achterwand en zijkanten
  const back = [[-26, 6, -40, 13, 26, 0, 0.16], [-4, 24, -46, 17, 32, 1, -0.12], [24, 10, -42, 12, 24, 0, 0.19], [-40, 30, -30, 15, 28, 2, -0.1], [40, 28, -26, 14, 26, 1, 0.12], [8, -8, -48, 10, 20, 2, -0.2], [-12, 44, -40, 9, 18, 0, 0.22]];
  for (const [x, y, z, R, t, ci, sp] of back) addGear(scene, x, y, z, R, t, 1.6, bronze[ci], sp, 'z', { holes: 8 });
  // as onder de plaat
  scene.add(mesh(new THREE.CylinderGeometry(1.5, 1.5, 80, 12), mat(0x6b4c26, { metalness: 0.5 }), { cast: false, pos: [0, -42, 0] }));
  for (const y of [-8, -16, -26]) scene.add(mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.8, 12), mat(0xcaa04a, { metalness: 0.6 }), { cast: false, pos: [0, y, 0] }));

  // ---- pendule achter de plaat ----
  {
    const pg = new THREE.Group(); pg.position.set(0, 44, -26); scene.add(pg);
    const rod = mesh(new THREE.BoxGeometry(0.5, 36, 0.4), mat(0x7a5224, { metalness: 0.4 }), { cast: false, pos: [0, -18, 0] }); pg.add(rod);
    const disc = new THREE.Group(); disc.position.y = -36; pg.add(disc);
    disc.add(mesh(new THREE.CylinderGeometry(5.5, 5.5, 1.0, 28), mat(0xffc93a, { metalness: 0.7, roughness: 0.3, emissive: 0x663800 }), { cast: false, rot: [Math.PI / 2, 0, 0] }));
    disc.add(mesh(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 20), mat(0xb8862a, { metalness: 0.6 }), { cast: false, rot: [Math.PI / 2, 0, 0] }));
    disc.add(mesh(new THREE.SphereGeometry(1.4, 12, 10), new THREE.MeshStandardMaterial({ color: 0xff5a3a, emissive: 0xff2a10, emissiveIntensity: 0.8 }), { cast: false, pos: [0, 0, 0.8] }));
    W.pend = pg;
  }
  // gewichten (dennenappels) die aan kettingen hangen
  for (const [x, z, y0, ph] of [[-30, -10, 36, 0], [31, -12, 40, 2], [-21, -34, 40, 1]]) {
    const gr = new THREE.Group(); gr.position.set(x, y0, z); scene.add(gr);
    gr.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 40, 5), mat(0x3a3a46, { metalness: 0.6 }), { cast: false, pos: [0, -20, 0] }));
    const cone = mesh(new THREE.ConeGeometry(2.4, 6.5, 8), mat(0x6b4a22, { flatShading: true }), { cast: false, pos: [0, -43, 0], rot: [Math.PI, 0, 0] }); gr.add(cone);
    for (let k = 0; k < 6; k++) gr.add(mesh(new THREE.BoxGeometry(3.6 - k * 0.3, 0.32, 3.6 - k * 0.3), mat(0x8a5e2c), { cast: false, pos: [0, -40.5 - k * 0.95 * 0.8, 0], rot: [0, k * 0.5, 0] }));
    W.weights.push({ gr, ph });
  }
  // fakkels langs de muur (alleen vlam + gloed, geen echte lichten)
  for (let i = 0; i < 9; i++) {
    const ang = -1.35 + i * 0.34; const R = 58;
    const gr = new THREE.Group(); gr.position.set(Math.sin(ang) * R, 14 + (i % 2) * 6, -Math.cos(ang) * R); gr.rotation.y = Math.PI - ang; scene.add(gr);
    gr.add(mesh(new THREE.CylinderGeometry(0.4, 0.55, 5, 6), mat(0x3a2a22), { cast: false }));
    gr.add(mesh(new THREE.CylinderGeometry(0.9, 0.5, 1, 8), mat(0x222222), { cast: false, pos: [0, 2.7, 0] }));
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.4, 6), new THREE.MeshBasicMaterial({ color: 0xffa030, fog: false })); fl.position.y = 4; gr.add(fl); W.flameMeshes.push(fl);
    const hal = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff9a40, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); hal.scale.set(9, 9, 1); hal.position.y = 4; gr.add(hal);
  }

  // ---- de arena zelf (kantelbaar) ----
  const A = W.arena; scene.add(A);
  const brass = new THREE.MeshStandardMaterial({ color: 0xd2a23c, roughness: 0.4, metalness: 0.65, flatShading: true });
  const plateSide = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R, PLATE_R, 1.3, 56), [brass, mat(0x1c1220), mat(0x1c1220)]); plateSide.position.y = -0.65; plateSide.receiveShadow = true; A.add(plateSide);
  A.add(mesh(new THREE.CylinderGeometry(PLATE_R * 0.98, 2.4, 4.6, 28), mat(0x7a5224, { metalness: 0.4 }), { cast: false, pos: [0, -3.6, 0] }));
  for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; A.add(mesh(new THREE.BoxGeometry(0.5, 4.2, 0.5), mat(0xc79a3a, { metalness: 0.6 }), { cast: false, pos: [Math.sin(a) * 6.2, -3.4, -Math.cos(a) * 6.2], rot: [-Math.cos(a) * 0.62, 0, -Math.sin(a) * 0.62] })); }
  const dial = new THREE.Mesh(new THREE.CircleGeometry(PLATE_R - 0.3, 64), new THREE.MeshStandardMaterial({ map: dialTexture(), roughness: 0.85 }));
  dial.rotation.x = -Math.PI / 2; dial.position.y = 0.012; dial.receiveShadow = true; A.add(dial); W.dial = dial;
  A.add(mesh(new THREE.TorusGeometry(PLATE_R - 0.08, 0.3, 8, 72), brass, { cast: false, pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0] }));
  // uurlampjes in de rand
  for (let h = 0; h < 12; h++) {
    const a = h / 12 * TAU; const bm = new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffb830, emissiveIntensity: 0.5, roughness: 0.3 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(h % 3 === 0 ? 0.42 : 0.3, 10, 8), bm); lamp.position.set(Math.sin(a) * (PLATE_R - 0.08), 0.34, -Math.cos(a) * (PLATE_R - 0.08)); A.add(lamp);
    W.lamps.push({ mesh: lamp, m: bm, f: 0 });
  }
  // middenkap
  A.add(mesh(new THREE.CylinderGeometry(0.95, 1.15, 0.45, 16), brass, { cast: false, pos: [0, 0.2, 0] }));
  A.add(mesh(new THREE.SphereGeometry(0.55, 12, 10), mat(0xffe27a, { metalness: 0.7, roughness: 0.25 }), { cast: false, pos: [0, 0.5, 0] }));
  // Hickory Dickory Dock: een muisje rent langs de rand van de klok
  {
    const m = new THREE.Group(); const grey = mat(0xb9b2c4, { flatShading: false }), pink = mat(0xf2a0b8, { flatShading: false });
    m.add(mesh(new THREE.SphereGeometry(0.42, 10, 8), grey, { cast: false, pos: [0, 0.3, 0], scale: [0.8, 0.7, 1.25] }));
    m.add(mesh(new THREE.SphereGeometry(0.26, 8, 6), grey, { cast: false, pos: [0, 0.34, -0.55], scale: [0.9, 0.9, 1.1] }));
    m.add(mesh(new THREE.ConeGeometry(0.07, 0.24, 5), pink, { cast: false, pos: [0, 0.3, -0.84], rot: [-Math.PI / 2, 0, 0] }));
    for (const sx of [-1, 1]) { m.add(mesh(new THREE.CircleGeometry(0.17, 8), pink, { cast: false, pos: [sx * 0.2, 0.6, -0.45], rot: [0, sx * 0.4, 0] })); m.add(mesh(new THREE.SphereGeometry(0.04, 5, 4), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [sx * 0.11, 0.42, -0.74] })); }
    const tail = mesh(new THREE.CylinderGeometry(0.02, 0.05, 1.1, 5), pink, { cast: false, pos: [0, 0.2, 0.9], rot: [Math.PI / 2 - 0.3, 0, 0] }); m.add(tail);
    A.add(m); W.mouse = { g: m, tail };
  }
  // vleermuizen die rondvliegen
  W.bats = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Group(); const bm = new THREE.MeshBasicMaterial({ color: 0x120a1e, side: THREE.DoubleSide });
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.8, 0.4, -0.3, 1.5, -0.1, 0.5, 0, 0, 0, 1.5, -0.1, 0.5, 0.4, -0.2, 0.6], 3));
    const wings = []; for (const sx of [-1, 1]) { const pv = new THREE.Group(); const w = new THREE.Mesh(wg, bm); w.scale.x = sx; pv.add(w); b.add(pv); wings.push({ pv, sx }); }
    b.add(mesh(new THREE.SphereGeometry(0.25, 6, 5), bm, { cast: false, scale: [0.8, 0.8, 1.4] }));
    b.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 3), new THREE.MeshBasicMaterial({ color: 0xff3a3a })).translateX(0.1).translateY(0.07).translateZ(-0.3));
    b.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 4, 3), new THREE.MeshBasicMaterial({ color: 0xff3a3a })).translateX(-0.1).translateY(0.07).translateZ(-0.3));
    b.scale.setScalar(1.5 + (i % 3) * 0.4); scene.add(b);
    W.bats.push({ g: b, wings, r: 22 + (i % 4) * 7, y: 10 + (i * 5) % 22, sp: (i % 2 ? 1 : -1) * (0.25 + (i % 3) * 0.08), ph: i * 1.7, cz: -14 - (i % 3) * 6 });
  }
  W.glowTex = glow;
  return W;
}

export function updateTower(W, T, dt) {
  if (W.mouse) { const a = T * 0.42, R = PLATE_R + 0.02; const x = Math.sin(a) * R, z = -Math.cos(a) * R; W.mouse.g.position.set(x, 0.42 + Math.abs(Math.sin(T * 14)) * 0.07, z); W.mouse.g.rotation.y = -a - Math.PI; W.mouse.tail.rotation.z = Math.sin(T * 10) * 0.4; }
  for (const b of W.bats || []) { const a = T * b.sp + b.ph; b.g.position.set(Math.cos(a) * b.r, b.y + Math.sin(T * 0.9 + b.ph) * 2, b.cz + Math.sin(a) * b.r * 0.55); b.g.rotation.y = -a + (b.sp > 0 ? 0 : Math.PI); const f = Math.sin(T * 11 + b.ph) * 0.8; for (const w of b.wings) w.pv.rotation.z = w.sx * f; }
  for (const a of W.anim) {
    if (a.axis === 'ringY') { a.spin.rotation.z += a.speed * dt; continue; }
    a.spin.rotation.z += a.speed * dt; if (a.hub) a.hub.rotation.y += 0;
  }
  if (W.pend) W.pend.rotation.z = Math.sin(T * 1.9) * 0.16;
  for (const w of W.weights) { w.gr.rotation.z = Math.sin(T * 0.9 + w.ph) * 0.025; w.gr.rotation.x = Math.sin(T * 0.7 + w.ph * 2) * 0.02; }
  for (let i = 0; i < W.flameMeshes.length; i++) { const f = W.flameMeshes[i]; f.scale.y = 1 + Math.sin(T * 11 + i * 2.1) * 0.18 + Math.sin(T * 17 + i) * 0.1; f.scale.x = f.scale.z = 1 + Math.sin(T * 13 + i) * 0.1; }
  for (const l of W.lamps) { l.f = Math.max(0, l.f - dt * 1.4); l.m.emissiveIntensity = 0.5 + l.f * 3.2; l.mesh.scale.setScalar(1 + l.f * 0.35); }
  W.shafts.forEach((s, i) => { s.material.opacity = 0.04 + Math.sin(T * 0.4 + i * 2) * 0.012; });
}
