import * as THREE from 'three';
import { mesh, TAU } from '../engine/util.js';
import { makeBrother } from '../engine/chars.js';

// Draak in zijaanzicht voor de Wolkenrace (kijkt naar +x). Eigen model zodat de vleugels van opzij goed leesbaar zijn.
const SH = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, flatShading: true, ...o });
const COL = [{ body: 0x2fbf5f, belly: 0xf3e29a, wing: 0x8df0a8, acc: 0xffd23f }, { body: 0x3a7cff, belly: 0xf3e29a, wing: 0x9cc8ff, acc: 0xff7ad9 }];

let _wingGeo = null;
function wingGeo() {
  if (_wingGeo) return _wingGeo;
  const s = new THREE.Shape();   // vleugel naar boven (+y), vleermuis-achtig, scharnier in de oorsprong
  s.moveTo(0.15, 0); s.lineTo(0.05, 1.5); s.lineTo(-0.15, 2.0); s.lineTo(-0.5, 1.4); s.lineTo(-0.85, 1.9); s.lineTo(-1.0, 1.1); s.lineTo(-1.45, 1.4); s.lineTo(-1.35, 0.5); s.lineTo(-0.9, 0); s.closePath();
  _wingGeo = new THREE.ShapeGeometry(s); return _wingGeo;
}

export function makeDragon(i) {
  const c = COL[i]; const root = new THREE.Group(), g = new THREE.Group(); root.add(g);
  const bm = SH(c.body), bl = SH(c.belly), ac = SH(c.acc);
  const put = (geo, m, p, s, r, parent = g) => { const o = mesh(geo, m, { cast: false, receive: false, pos: p, scale: s, rot: r }); parent.add(o); return o; };
  put(new THREE.CapsuleGeometry(0.52, 1.5, 4, 10), bm, [0, 0, 0], null, [0, 0, Math.PI / 2]);
  put(new THREE.SphereGeometry(0.45, 10, 8), bl, [0.05, -0.2, 0.18], [1.9, 0.7, 0.9]);
  // nek + kop
  const neck = new THREE.Group(); neck.position.set(0.8, 0.25, 0); neck.rotation.z = 0.75; g.add(neck);
  put(new THREE.CapsuleGeometry(0.28, 0.65, 3, 8), bm, [0, 0.35, 0], null, null, neck);
  const head = new THREE.Group(); head.position.set(0, 0.85, 0); neck.add(head); head.rotation.z = -0.75;
  put(new THREE.SphereGeometry(0.46, 12, 10), bm, [0, 0, 0], [1.05, 0.95, 0.95], null, head);
  put(new THREE.BoxGeometry(0.62, 0.3, 0.46), bm, [0.5, -0.1, 0], null, null, head);
  const jaw = new THREE.Group(); jaw.position.set(0.25, -0.22, 0); head.add(jaw); put(new THREE.BoxGeometry(0.58, 0.14, 0.4), bl, [0.28, 0, 0], null, null, jaw);
  for (const s of [-1, 1]) {
    put(new THREE.SphereGeometry(0.15, 8, 6), SH(0xffffff, { roughness: 0.3 }), [0.17, 0.17, s * 0.36], null, null, head); put(new THREE.SphereGeometry(0.075, 6, 5), SH(0x151515), [0.23, 0.17, s * 0.46], null, null, head);
    put(new THREE.ConeGeometry(0.1, 0.5, 6), SH(0xf5ecd0), [-0.2, 0.46, s * 0.22], null, [0, 0, 0.6], head);
    put(new THREE.SphereGeometry(0.05, 5, 4), SH(0x151515), [0.78, 0.0, s * 0.12], null, null, head);
  }
  // rugpunten
  for (let k = 0; k < 5; k++) put(new THREE.ConeGeometry(0.14 - k * 0.012, 0.36, 5), ac, [0.55 - k * 0.3, 0.52 - k * 0.03, 0]);
  // staart
  const tail = []; let prev = g, px = -1.0, py = 0;
  for (let k = 0; k < 6; k++) { const seg = new THREE.Group(); seg.position.set(px, py, 0); prev.add(seg); const r = 0.42 * (1 - k * 0.13); put(new THREE.ConeGeometry(r, 0.7, 7), bm, [-0.3, 0, 0], null, [0, 0, Math.PI / 2], seg); tail.push(seg); prev = seg; px = -0.55; py = 0; }
  put(new THREE.ConeGeometry(0.28, 0.5, 3), ac, [-0.8, 0, 0], [1, 1, 0.3], [0, 0, Math.PI / 2], prev);
  // pootjes
  for (const s of [-1, 1]) { put(new THREE.CapsuleGeometry(0.12, 0.35, 3, 6), bm, [0.25 + s * 0.3, -0.5, s * 0.3], null, [0, 0, 0.5]); }
  // vleugels (plat vlak, draait om z)
  const wings = [];
  for (const [z, col, ph] of [[-0.38, SH(c.wing, { side: THREE.DoubleSide, transparent: true, opacity: 0.9 }), 0.12], [0.42, SH(c.wing, { side: THREE.DoubleSide }), 0]]) {
    const p = new THREE.Group(); p.position.set(0.15, 0.35, z); g.add(p);
    const w = new THREE.Mesh(wingGeo(), col); w.castShadow = false; p.add(w);
    if (z > 0) { const edge = new THREE.Mesh(wingGeo(), SH(c.acc, { side: THREE.DoubleSide })); edge.scale.set(1.02, 1.02, 1); edge.position.z = -0.01; p.add(edge); w.position.z = 0.015; }
    wings.push({ p, ph });
  }
  // poppetje op de rug
  const rider = makeBrother(i); const holder = new THREE.Group(); holder.add(rider.group); holder.scale.setScalar(0.34); holder.position.set(0.2, 0.52, 0); holder.rotation.y = Math.PI / 2; g.add(holder); rider.pose = 'sit'; rider.group.position.y = 0;
  // schild-bol, sterren (duizelig), vuur-kegel
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1.7, 16, 12), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.28, depthWrite: false })); shield.visible = false; root.add(shield);
  const stars = new THREE.Group(); stars.visible = false; root.add(stars);
  for (let k = 0; k < 4; k++) stars.add(mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [Math.cos(k / 4 * TAU) * 0.9, 1.5, Math.sin(k / 4 * TAU) * 0.9] }));
  return { root, g, wings, tail, head, neck, jaw, rider, shield, stars, bodyColor: c.body };
}

// animeert een draak. s = { flapT (0..1 of -1), vy, fire, dizzy, heavy, t }
export function animateDragon(D, dt, s) {
  const t = s.t;
  // vleugels: rust -> slag
  for (const w of D.wings) {
    let a;
    if (s.flapT >= 0) { const u = clamp01(s.flapT + w.ph); a = 0.9 - 1.25 * Math.sin(u * TAU) + (s.flapT < 0.5 ? 0 : 0.1); } else a = 0.85 + Math.sin(t * 2.2 + w.ph * 5) * 0.12 - clampN(s.vy, -8, 8) * 0.03;
    w.p.rotation.z = a;
  }
  D.tail.forEach((seg, k) => { seg.rotation.z = Math.sin(t * 5 - k * 0.8) * 0.16 - s.vy * 0.012 * (k < 2 ? 1 : 0.4); });
  D.head.rotation.z = -0.75 + Math.sin(t * 3) * 0.04 + (s.dizzy > 0 ? Math.sin(t * 14) * 0.3 : 0); D.neck.rotation.z = 0.75 - clampN(s.vy, -10, 10) * 0.025;
  D.jaw.rotation.z = -(s.fire ? 0.55 : s.dizzy > 0 ? 0.3 : 0.05 + Math.sin(t * 3) * 0.03);
  D.g.rotation.z = damp1(D.g.rotation.z, clampN(s.vy * 0.045, -0.5, 0.45) + (s.dizzy > 0 ? Math.sin(t * 20) * 0.15 : 0), 10, dt);
  D.g.position.y = Math.sin(t * 2.4) * 0.05;
  D.stars.visible = s.dizzy > 0; if (s.dizzy > 0) D.stars.rotation.y += dt * 7;
  D.rider.pose = s.dizzy > 0 ? 'scared' : s.fire ? 'cheer' : s.cheer ? 'cheer' : 'sit'; D.rider.update(dt);
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
const damp1 = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));
