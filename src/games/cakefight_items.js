import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp } from '../engine/util.js';
import { MB, glowSprite } from './dodgeball_world.js';

// Taarten, slagroomplassen en de slagroom-op-het-hoofd van het Taartengevecht.

export const CAKES = {
  cream:    { id: 'cream',    name: 'Slagroomtaart',  pts: 1, speed: 20, range: 12, arc: 1.3, R: 1.4, hitR: 0.75, stun: 0.75, kb: 6,  col: 0xfff4ee, col2: 0xff9ac0, hold: 'carry',   slow: 1.0 },
  pudding:  { id: 'pudding',  name: 'Pudding',        pts: 1, speed: 15, range: 10, arc: 2.0, R: 1.15, hitR: 0.75, stun: 1.0, kb: 4,  col: 0xffd24a, col2: 0x7a4a1a, hold: 'carry',   slow: 0.95 },
  bride:    { id: 'bride',    name: 'Bruidstaart',    pts: 3, speed: 8.5, range: 9,  arc: 4.2, R: 3.3, hitR: 1.3,  stun: 1.7, kb: 10, col: 0xfff8f0, col2: 0xff9ac0, hold: 'hands_up', slow: 0.6 },
  confetti: { id: 'confetti', name: 'Confettitaart',  pts: 2, speed: 14, range: 11, arc: 2.4, R: 2.7, hitR: 0.75, stun: 1.0, kb: 8,  col: 0xff7ab8, col2: 0xffe14a, hold: 'carry',   slow: 0.95 },
  gold:     { id: 'gold',     name: 'Gouden Taart',   pts: 1, speed: 24, range: 13, arc: 1.0, R: 1.6, hitR: 0.8,  stun: 1.2, kb: 7,  col: 0xffd23f, col2: 0xfff3b0, hold: 'carry',   slow: 1.0 },
};

export function makeCake(type) {
  const g = new THREE.Group(); const o = { type, group: g };
  const sm = (c, op = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, flatShading: false, ...op });
  const add = (geo, m, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const q = new THREE.Mesh(geo, m); q.position.set(x, y, z); q.scale.set(sx, sy, sz); q.castShadow = true; g.add(q); return q; };
  if (type === 'cream') {
    add(new THREE.CylinderGeometry(0.58, 0.46, 0.22, 16), sm(0xd8a868, { flatShading: true }), 0, 0.11, 0);
    add(new THREE.SphereGeometry(0.5, 14, 10), sm(0xfffaf4), 0, 0.3, 0, 1.05, 0.62, 1.05);
    for (let k = 0; k < 7; k++) { const a = k / 7 * TAU; add(new THREE.SphereGeometry(0.12, 8, 6), sm(0xffffff), Math.cos(a) * 0.4, 0.22, Math.sin(a) * 0.4); }
    add(new THREE.ConeGeometry(0.2, 0.34, 8), sm(0xffffff), 0, 0.68, 0);
    add(new THREE.SphereGeometry(0.11, 8, 6), sm(0xd8172c, { roughness: 0.2 }), 0, 0.88, 0);
  } else if (type === 'pudding') {
    add(new THREE.CylinderGeometry(0.46, 0.55, 0.55, 16), sm(0xffd24a, { roughness: 0.25 }), 0, 0.3, 0);
    add(new THREE.CylinderGeometry(0.47, 0.47, 0.1, 16), sm(0x7a4a1a, { roughness: 0.2 }), 0, 0.6, 0);
    add(new THREE.SphereGeometry(0.1, 8, 6), sm(0xd8172c, { roughness: 0.2 }), 0, 0.72, 0);
    for (const sd of [-1, 1]) add(new THREE.SphereGeometry(0.07, 6, 5), sm(0x15121a), sd * 0.14, 0.35, 0.46, 1, 1.2, 0.5);
    o.wob = true;
  } else if (type === 'bride') {
    add(new THREE.CylinderGeometry(1.05, 1.1, 0.5, 20), sm(0xfff8f0), 0, 0.25, 0); add(new THREE.CylinderGeometry(0.78, 0.82, 0.46, 18), sm(0xffe4ee), 0, 0.73, 0); add(new THREE.CylinderGeometry(0.5, 0.54, 0.42, 16), sm(0xfff8f0), 0, 1.17, 0);
    for (let k = 0; k < 14; k++) { const a = k / 14 * TAU; add(new THREE.SphereGeometry(0.1, 7, 5), sm(0xff7aa8), Math.cos(a) * 1.07, 0.5, Math.sin(a) * 1.07); }
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU; add(new THREE.SphereGeometry(0.08, 7, 5), sm(0xff7aa8), Math.cos(a) * 0.8, 0.95, Math.sin(a) * 0.8); }
    add(new THREE.CapsuleGeometry(0.06, 0.2, 3, 6), sm(0x222233), -0.1, 1.55, 0); add(new THREE.CapsuleGeometry(0.06, 0.2, 3, 6), sm(0xffffff), 0.1, 1.55, 0);
    add(new THREE.SphereGeometry(0.07, 6, 5), sm(0xf4c9a0), -0.1, 1.76, 0); add(new THREE.SphereGeometry(0.07, 6, 5), sm(0xf4c9a0), 0.1, 1.76, 0);
    o.glow = glowSprite(0xffd0e8, 4.2, 0.35); o.glow.position.y = 0.9; g.add(o.glow);
  } else if (type === 'confetti') {
    add(new THREE.CylinderGeometry(0.58, 0.58, 0.5, 16), sm(0xff7ab8), 0, 0.25, 0);
    add(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16), sm(0x7ad8ff), 0, 0.2, 0); add(new THREE.CylinderGeometry(0.6, 0.6, 0.1, 16), sm(0xffe14a), 0, 0.4, 0);
    add(new THREE.SphereGeometry(0.52, 12, 8, 0, TAU, 0, Math.PI / 2), sm(0xffffff), 0, 0.5, 0, 1, 0.5, 1);
    const cs = [0xff3a5a, 0x3aa0ff, 0x6ad86a, 0xffe14a, 0xb06aff];
    o.candles = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; const cx = Math.cos(a) * 0.3, cz = Math.sin(a) * 0.3; add(new THREE.CylinderGeometry(0.04, 0.04, 0.34, 6), sm(cs[k]), cx, 0.82, cz); const fl = add(new THREE.ConeGeometry(0.06, 0.16, 5), new THREE.MeshBasicMaterial({ color: 0xffd060 }), cx, 1.05, cz); o.candles.push(fl); }
    const fuse = add(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3a2a }), 0, 0.72, 0); o.fuseM = fuse;
    o.glow = glowSprite(0xff7ab8, 3.2, 0.0); o.glow.position.y = 0.6; g.add(o.glow);
  } else if (type === 'gold') {
    add(new THREE.CylinderGeometry(0.58, 0.5, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.9, roughness: 0.25, emissive: 0x805000, emissiveIntensity: 0.6 }), 0, 0.25, 0);
    add(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff3b0, metalness: 0.8, roughness: 0.3, emissive: 0xb88000, emissiveIntensity: 0.7 }), 0, 0.55, 0, 1, 0.6, 1);
    o.glow = glowSprite(0xffd23f, 3.4, 0.7); o.glow.position.y = 0.5; g.add(o.glow);
  }
  g.traverse((q) => { if (q.isMesh) q.castShadow = true; });
  return o;
}

// platte, glanzende plassen (cirkelvormige splat-textuur)
let _splat = null;
export function splatTexture() {
  if (_splat) return _splat;
  _splat = canvasTex(128, 128, (g, w, h) => {
    const r = mulberry32(11); g.translate(w / 2, h / 2);
    const n = 18, rad = []; for (let i = 0; i <= n; i++) rad.push(i === n ? rad[0] : 40 + r() * 16 + (i % 3 === 0 ? 8 : 0));
    const path = (grow) => { g.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * TAU, q = rad[i] + grow; const x = Math.cos(a) * q, y = Math.sin(a) * q; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.closePath(); };
    g.fillStyle = 'rgba(110,50,60,.40)'; path(5); g.fill();      // donkere rand: wit-op-wit blijft zichtbaar
    g.fillStyle = '#ffffff'; path(0); g.fill();
    for (let i = 0; i < 7; i++) { const a = r() * TAU; g.beginPath(); g.arc(Math.cos(a) * (50 + r() * 6), Math.sin(a) * (50 + r() * 6), 6 + r() * 6, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(200,120,140,.16)'; g.beginPath(); g.arc(8, 8, 28, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.ellipse(-14, -16, 14, 7, -0.6, 0, TAU); g.fill();
  });
  _splat.userData.keep = true; return _splat;
}

// slagroom op het hoofd en lijf van een poppetje
const SPLAT_COLORS = {
  cream: [0xfffaf2, 0xfff0f4], pudding: [0xffd24a, 0xffc030], bride: [0xffffff, 0xffd0e4], confetti: [0xff7ab8, 0x7ad8ff, 0xffe14a, 0x8dff9a, 0xb06aff], gold: [0xffd23f, 0xfff3b0],
};
export function makeSplats(c) {
  const s = c.s || 1; const hr = 0.3 * s * (c.spec.headScale || 1);
  const set = { blobs: [], n: 0, t: 0, type: 'cream', cherry: null, drip: [] };
  const geo = new THREE.SphereGeometry(1, 10, 8);
  // [parent, x, y, z, rx, ry, rz]
  const defs = [
    [c.head, 0, 0.04 * s + hr * 0.78, -0.01 * s, hr * 1.05, hr * 0.62, hr * 1.05],            // muts van slagroom
    [c.head, 0, 0.0, hr * 0.78, hr * 0.78, hr * 0.7, hr * 0.42],                                // gezicht
    [c.torso, 0, 0.4 * s, 0.26 * s, 0.26 * s, 0.22 * s, 0.14 * s],                               // borst
    [c.head, hr * 0.8, 0.12 * s, hr * 0.4, hr * 0.42, hr * 0.38, hr * 0.38],
    [c.head, -hr * 0.8, 0.0, hr * 0.5, hr * 0.4, hr * 0.36, hr * 0.38],
    [c.torso, 0.2 * s, 0.25 * s, 0.24 * s, 0.17 * s, 0.15 * s, 0.1 * s],
    [c.torso, -0.2 * s, 0.5 * s, 0.22 * s, 0.15 * s, 0.14 * s, 0.1 * s],
    [c.head, 0.05 * s, hr * 1.1, hr * 0.3, hr * 0.36, hr * 0.3, hr * 0.36],
  ];
  defs.forEach(([parent, x, y, z, rx, ry, rz], i) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.3 })); m.position.set(x, y, z); m.userData.base = [rx, ry, rz]; m.visible = false; m.castShadow = false; parent.add(m);
    set.blobs.push({ m, grow: 1, on: false });
  });
  // druipers
  for (const [dx, dz] of [[0.18, 0.12], [-0.2, 0.14], [0.0, 0.26]]) {
    const d = new THREE.Mesh(new THREE.CapsuleGeometry(0.035 * s, 0.14 * s, 3, 6), new THREE.MeshStandardMaterial({ color: 0xfffaf2, roughness: 0.3 })); d.position.set(dx * s, 0.04 * s + hr * 0.5 - 0.05, dz * s + hr * 0.5); d.visible = false; c.head.add(d); set.drip.push(d);
  }
  set.cherry = new THREE.Mesh(new THREE.SphereGeometry(0.075 * s, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd8172c, roughness: 0.2 })); set.cherry.position.set(0, 0.04 * s + hr * 1.45, -0.01 * s); set.cherry.visible = false; c.head.add(set.cherry);
  // tutu-achtig verhaal: confetti op de muts
  set.hit = (type) => {
    const cnt = { cream: 3, pudding: 3, bride: 6, confetti: 4, gold: 3 }[type] || 3;
    set.type = type; const cols = SPLAT_COLORS[type] || SPLAT_COLORS.cream;
    const was = set.n; set.n = Math.min(set.blobs.length, Math.max(set.n, 0) + cnt); set.t = type === 'bride' ? 9 : 7;
    set.blobs.forEach((b, i) => {
      if (i < set.n) { const fresh = !b.on; b.on = true; b.m.visible = true; if (fresh || i >= was) b.grow = 0; b.m.material.color.set(cols[i % cols.length]); if (type === 'pudding' && i === 0) b.m.material.color.set(0x7a4a1a); }
    });
    set.drip.forEach((d) => { d.visible = true; d.material.color.set(cols[0]); });
    set.cherry.visible = type === 'cream' || type === 'bride' || type === 'pudding'; set.cherry.material.color.set(type === 'bride' ? 0xff7aa8 : 0xd8172c);
  };
  set.clear = () => { set.n = 0; set.t = 0; set.blobs.forEach((b) => { b.on = false; b.m.visible = false; }); set.drip.forEach((d) => { d.visible = false; }); set.cherry.visible = false; };
  set.update = (dt) => {
    if (set.n <= 0) return;
    set.t -= dt; const fade = clamp(set.t / 1.6, 0, 1);
    if (set.t <= 0) { set.clear(); return; }
    set.blobs.forEach((b) => { if (!b.on) return; b.grow = Math.min(1, b.grow + dt * 7); const k = (b.grow < 1 ? 1 + Math.sin(b.grow * Math.PI) * 0.25 : 1) * b.grow * (0.3 + 0.7 * fade); const [rx, ry, rz] = b.m.userData.base; b.m.scale.set(rx * k, ry * k, rz * k); });
    set.drip.forEach((d, i) => { d.scale.y = (0.7 + Math.sin(performance.now() * 0.004 + i * 2) * 0.3) * fade; d.scale.x = d.scale.z = fade; });
    set.cherry.scale.setScalar(fade);
  };
  return set;
}
