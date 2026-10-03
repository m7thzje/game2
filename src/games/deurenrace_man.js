import * as THREE from 'three';
import { mat, mesh } from '../engine/util.js';
import { makeDeurman } from '../engine/chars.js';

// Lieve Deurman voor de Deuren-duels: de gewone makeDeurman() met een vrolijk gezicht eroverheen
// (grote ogen, te brede glimlach, blosjes) en optioneel een feesthoedje. Ook een los "kijkhoofd" voor uit de deur.
const SKIN = 0xe9e9e4;

// punt op het hoofd-ellipsoïde (halve assen 0.18/0.25/0.2 × s) bij (x,y), een tikje naar buiten
function surf(x, y, s, off = 0.004) {
  const q = 1 - (x / (0.18 * s)) ** 2 - (y / (0.25 * s)) ** 2;
  return 0.2 * s * Math.sqrt(Math.max(0.02, q)) + off * s;
}
// gevulde sikkel tussen een bovenrand (yTop) en een onderrand (smile-kromme), vastgeplakt op het gezicht
function crescent(s, w, yTop, yBot, k, color, off) {
  const N = 18, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N * 2 - 1, x = u * w * s, yb = (yBot + k * u * u) * s, yt = yTop * s - (1 - u * u) * 0.0 * s;
    pos.push(x, yt, surf(x, yt, s, off), x, yb, surf(x, yb, s, off));
    if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
}
function smileTube(s, w, y0, k, r, color) {
  const pts = []; for (let i = 0; i <= 14; i++) { const u = i / 14 * 2 - 1, x = u * w * s, y = (y0 + k * u * u) * s; pts.push(new THREE.Vector3(x, y, surf(x, y, s, 0.012))); }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, r * s, 5), new THREE.MeshBasicMaterial({ color }));
}

// plakt een vrolijk gezicht op een hoofd-groep (oorsprong = hoofdmidden, hoofd kijkt naar +z)
export function faceMask(head, s) {
  const plate = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s * 1.025, 22, 14, Math.PI / 2 - 1.0, 2.0, 0.28, 2.3), new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.6 }));
  plate.scale.set(0.9, 1.25, 1); head.add(plate);
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), black = new THREE.MeshBasicMaterial({ color: 0x111118 });
  for (const sd of [1, -1]) {
    const ex = sd * 0.068 * s, ey = 0.06 * s, ez = surf(ex, ey, s, 0.012);
    const e = mesh(new THREE.SphereGeometry(0.05 * s, 10, 8), white, { cast: false, pos: [ex, ey, ez], scale: [1, 1.25, 0.45] }); head.add(e);
    head.add(mesh(new THREE.SphereGeometry(0.027 * s, 8, 6), black, { cast: false, pos: [ex + sd * 0.004 * s, ey - 0.004 * s, ez + 0.02 * s], scale: [1, 1.2, 0.5] }));
    head.add(mesh(new THREE.SphereGeometry(0.009 * s, 5, 4), white, { cast: false, pos: [ex + 0.01 * s, ey + 0.012 * s, ez + 0.032 * s] }));
    // wenkbrauw (vrolijk omhoog)
    const bx = sd * 0.07 * s, by = 0.135 * s;
    head.add(mesh(new THREE.BoxGeometry(0.075 * s, 0.014 * s, 0.01 * s), black, { cast: false, pos: [bx, by, surf(bx, by, s, 0.01)], rot: [0, 0, sd * -0.18] }));
    // blosje
    const cx = sd * 0.115 * s, cy = -0.035 * s;
    head.add(mesh(new THREE.CircleGeometry(0.03 * s, 8), new THREE.MeshBasicMaterial({ color: 0xff9aa8, side: THREE.DoubleSide }), { cast: false, pos: [cx, cy, surf(cx, cy, s, 0.008)], rot: [0, sd * 0.6, 0] }));
  }
  // grote brede glimlach met tanden
  const mouth = new THREE.Group(); head.add(mouth);
  mouth.add(crescent(s, 0.125, -0.07, -0.092, 0.075, 0x6a1a26, 0.008));
  mouth.add(crescent(s, 0.105, -0.07, -0.085, 0.042, 0xffffff, 0.012));
  mouth.add(smileTube(s, 0.128, -0.093, 0.076, 0.009, 0x2a0c14));
  head.userData.mouth = mouth;
  return head;
}
export function partyHat(s, c1 = 0xff4fa8, c2 = 0xffe14a) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(0.11 * s, 0.3 * s, 8), mat(c1, { flatShading: false }), { cast: false, pos: [0, 0.15 * s, 0] }));
  g.add(mesh(new THREE.SphereGeometry(0.035 * s, 6, 5), mat(c2), { cast: false, pos: [0, 0.31 * s, 0] }));
  g.rotation.z = -0.25; return g;
}

// De lieve Deurman (volledig lichaam)
export function friendlyDeurman(scale = 1, { hat = false, suit = null } = {}) {
  const dm = makeDeurman(scale);
  if (suit != null) {          // een kleurig (disco-)pak i.p.v. het zwarte
    const sm = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.45, metalness: 0.3, emissive: suit, emissiveIntensity: 0.18 });
    dm.group.traverse((o) => { if (o.isMesh && o.material && o.material.color && o.material.color.getHex() === 0x0c0c10) o.material = sm; });
  }
  if (dm.eyeGlow) for (const e of dm.eyeGlow) e.visible = false;
  faceMask(dm.head, scale);
  if (hat) { const h = partyHat(scale); h.position.set(0.03 * scale, 0.22 * scale, 0); dm.head.add(h); }
  return dm;
}

// Los hoofd + hals + zwaaiende hand, om uit een deur te steken (oorsprong = onderkant hals)
export function deurmanHead(scale = 1) {
  const g = new THREE.Group(), s = scale;
  const suit = mat(0x1a1a22, { roughness: 0.9, flatShading: false });
  g.add(mesh(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.7 * s, 8), suit, { cast: false, pos: [0, 0.35 * s, 0] }));
  g.add(mesh(new THREE.BoxGeometry(0.05 * s, 0.3 * s, 0.02 * s), mat(0xf0f0f0), { cast: false, pos: [0, 0.42 * s, 0.1 * s] }));
  const head = new THREE.Group(); head.position.y = 0.88 * s; g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.2 * s, 16, 12), mat(SKIN, { flatShading: false, roughness: 0.6 }), { cast: false, scale: [0.9, 1.25, 1] }));
  faceMask(head, s);
  // zwaaiende hand
  const hand = new THREE.Group(); hand.position.set(0.32 * s, 0.55 * s, 0.1 * s); g.add(hand);
  hand.add(mesh(new THREE.SphereGeometry(0.075 * s, 8, 6), mat(SKIN, { flatShading: false }), { cast: false }));
  for (let f = 0; f < 4; f++) hand.add(mesh(new THREE.CapsuleGeometry(0.014 * s, 0.14 * s, 2, 4), mat(SKIN, { flatShading: false }), { cast: false, pos: [(f - 1.5) * 0.034 * s, 0.14 * s, 0], rot: [0, 0, (f - 1.5) * -0.12] }));
  g.userData.head = head; g.userData.hand = hand;
  return g;
}
