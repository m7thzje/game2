import * as THREE from 'three';
import { mat, glow, mesh, clamp, damp, dampAngle, TAU, canvasTex, lerp } from './util.js';

// ============================================================================
// Character: lowpoly poppetje met procedurele animatie. Kijkt naar +z (lokaal).
//   const c = new Character({ ... }); scene.add(c.group);
//   elke frame:  c.speed = 0..1;  c.faceDir(dx, dz);  c.update(dt);
//   c.pose = 'idle'|'cheer'|'sad'|'carry'|'push'|'scared'|'wave'|'point';  c.swing();  c.jump();
// ============================================================================
const BAKED = {};
export class Character {
  constructor(spec = {}) {
    const s = spec.scale ?? 1;
    const W = spec.bodyW ?? 1;
    this.spec = spec; this.s = s;
    const skin = spec.skin ?? 0xf2c29b;
    const shirt = spec.shirt ?? 0x3b7dd8, pants = spec.pants ?? 0x5b4636, boots = spec.boots ?? 0x3a2a1e;
    const root = new THREE.Group(); this.group = root; root.userData.dynamic = true;
    const body = new THREE.Group(); root.add(body); this.body = body;
    const legLen = 0.6 * s, torsoH = 0.62 * s;
    this.legLen = legLen; this.height = legLen + torsoH + 0.62 * s;

    // benen
    const mkLeg = (side) => {
      const g = new THREE.Group(); g.position.set(side * 0.15 * s * W, legLen, 0);
      g.add(mesh(new THREE.CapsuleGeometry(0.105 * s, legLen - 0.28 * s, 3, 8), mat(pants), { pos: [0, -legLen / 2 + 0.05 * s, 0] }));
      const boot = mesh(new THREE.BoxGeometry(0.22 * s, 0.16 * s, 0.34 * s), mat(boots), { pos: [0, -legLen + 0.08 * s, 0.04 * s] });
      g.add(boot);
      body.add(g); return g;
    };
    this.legL = mkLeg(1); this.legR = mkLeg(-1);

    // romp
    const torsoG = new THREE.Group(); torsoG.position.y = legLen; body.add(torsoG); this.torso = torsoG;
    torsoG.add(mesh(new THREE.CylinderGeometry(0.27 * s * W, 0.31 * s * W, torsoH, 10), mat(shirt), { pos: [0, torsoH / 2, 0] }));
    if (spec.tunic) { // rokje onderaan
      torsoG.add(mesh(new THREE.CylinderGeometry(0.31 * s * W, 0.42 * s * W, 0.28 * s, 10, 1, true), mat(spec.tunic, { side: THREE.DoubleSide }), { pos: [0, 0.06 * s, 0] }));
    }
    torsoG.add(mesh(new THREE.CylinderGeometry(0.315 * s * W, 0.315 * s * W, 0.08 * s, 10), mat(spec.belt ?? 0x4a2e17), { pos: [0, 0.14 * s, 0] }));
    torsoG.add(mesh(new THREE.BoxGeometry(0.1 * s, 0.1 * s, 0.03 * s), mat(0xe8c24a, { metalness: 0.6, roughness: 0.4 }), { pos: [0, 0.14 * s, 0.31 * s * W] }));
    if (spec.apron) torsoG.add(mesh(new THREE.BoxGeometry(0.4 * s * W, 0.5 * s, 0.05 * s), mat(spec.apron), { pos: [0, 0.3 * s, 0.28 * s * W] }));
    if (spec.scarf) {
      torsoG.add(mesh(new THREE.TorusGeometry(0.2 * s, 0.07 * s, 6, 12), mat(spec.scarf), { pos: [0, torsoH - 0.02 * s, 0], rot: [Math.PI / 2, 0, 0] }));
      const tail = mesh(new THREE.BoxGeometry(0.1 * s, 0.4 * s, 0.04 * s), mat(spec.scarf), { pos: [0.1 * s, torsoH - 0.25 * s, -0.22 * s] });
      torsoG.add(tail); this.scarfTail = tail;
    }
    if (spec.backpack) {
      torsoG.add(mesh(new THREE.BoxGeometry(0.34 * s, 0.4 * s, 0.18 * s), mat(spec.backpack), { pos: [0, 0.4 * s, -0.3 * s * W] }));
      torsoG.add(mesh(new THREE.BoxGeometry(0.36 * s, 0.1 * s, 0.2 * s), mat(0x3a2a1e), { pos: [0, 0.6 * s, -0.3 * s * W] }));
    }
    if (spec.cape) {
      const cape = mesh(new THREE.BoxGeometry(0.5 * s * W, 0.8 * s, 0.04 * s), mat(spec.cape, { side: THREE.DoubleSide }), { pos: [0, torsoH - 0.35 * s, -0.3 * s * W] });
      cape.geometry.translate(0, 0, 0); torsoG.add(cape); this.cape = cape;
    }

    // armen
    const mkArm = (side) => {
      const g = new THREE.Group(); g.position.set(side * (0.33 * s * W + 0.02), torsoH - 0.1 * s, 0); torsoG.add(g);
      g.add(mesh(new THREE.CapsuleGeometry(0.085 * s, 0.32 * s, 3, 8), mat(spec.sleeve ?? shirt), { pos: [0, -0.2 * s, 0] }));
      const hand = mesh(new THREE.SphereGeometry(0.095 * s, 8, 6), mat(skin), { pos: [0, -0.45 * s, 0] });
      g.add(hand);
      const holder = new THREE.Group(); holder.position.set(0, -0.45 * s, 0.04 * s); g.add(holder);
      g.userData.holder = holder;
      return g;
    };
    this.armL = mkArm(1); this.armR = mkArm(-1);
    this.handR = this.armR.userData.holder; this.handL = this.armL.userData.holder;

    // hoofd
    const headG = new THREE.Group(); headG.position.y = torsoH + 0.3 * s; torsoG.add(headG); this.head = headG;
    const hr = 0.3 * s * (spec.headScale ?? 1);
    headG.add(mesh(new THREE.SphereGeometry(hr, 16, 12), mat(skin, { flatShading: false }), { pos: [0, 0.04 * s, 0] }));
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x15121a, roughness: 0.3 });
    const eyeY = 0.08 * s, eyeZ = hr * 0.88;
    this.eyes = [];
    for (const sd of [1, -1]) {
      const e = new THREE.Group(); e.position.set(sd * 0.105 * s, eyeY + 0.04 * s, eyeZ);
      e.add(mesh(new THREE.SphereGeometry(0.052 * s * (spec.eyeScale ?? 1), 8, 6), spec.eyeColor ? mat(spec.eyeColor) : eyeMat, { cast: false, scale: [1, 1.2, 0.6] }));
      e.add(mesh(new THREE.SphereGeometry(0.016 * s, 6, 4), mat(0xffffff, { flatShading: false, roughness: 0.3 }), { cast: false, pos: [0.015 * s, 0.025 * s, 0.03 * s] }));
      headG.add(e); this.eyes.push(e);
      headG.add(mesh(new THREE.CircleGeometry(0.045 * s, 6), mat(0xf4a0a0, { side: THREE.DoubleSide }), { cast: false, pos: [sd * 0.19 * s, eyeY - 0.04 * s, hr * 0.85], rot: [0, sd * 0.45, 0] }));
    }
    if (spec.glasses) {
      for (const sd of [1, -1]) headG.add(mesh(new THREE.TorusGeometry(0.075 * s, 0.01 * s, 5, 12), mat(spec.glasses), { cast: false, pos: [sd * 0.105 * s, eyeY + 0.04 * s, eyeZ + 0.03 * s] }));
    }
    // neus + mond
    const noseS = spec.nose ?? 1;
    headG.add(mesh(new THREE.SphereGeometry(0.045 * s * noseS, 8, 6), mat(skin, { flatShading: false }), { cast: false, pos: [0, 0.02 * s, hr * 0.98], scale: [1, 1, 1 + (noseS - 1) * 0.8] }));
    this.mouth = mesh(new THREE.TorusGeometry(0.06 * s, 0.012 * s, 5, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x3d1b1b }), { cast: false, pos: [0, -0.06 * s, hr * 0.9], rot: [0, 0, Math.PI] });
    headG.add(this.mouth);
    if (spec.ears === 'pointy') for (const sd of [1, -1]) headG.add(mesh(new THREE.ConeGeometry(0.07 * s, 0.28 * s, 4), mat(skin), { pos: [sd * hr * 1.05, 0.08 * s, 0], rot: [0, 0, -sd * 1.35] }));
    else for (const sd of [1, -1]) headG.add(mesh(new THREE.SphereGeometry(0.05 * s, 6, 5), mat(skin), { cast: false, pos: [sd * hr * 0.98, 0.02 * s, 0] }));

    // haar
    const hairC = spec.hair ?? 0x5a3a22, style = spec.hairStyle ?? 'short';
    const hm = mat(hairC, { flatShading: false });
    if (style === 'short' || style === 'long' || style === 'bun') {
      headG.add(mesh(new THREE.SphereGeometry(hr * 1.06, 14, 8, 0, TAU, 0, style === 'long' ? 2.0 : 1.75), hm, { pos: [0, 0.05 * s, -0.01 * s], rot: [-0.25, 0, 0] }));
      if (style === 'long') headG.add(mesh(new THREE.CapsuleGeometry(hr * 0.9, 0.3 * s, 3, 8), hm, { pos: [0, -0.12 * s, -hr * 0.45], scale: [1, 1, 0.55] }));
      if (style === 'bun') headG.add(mesh(new THREE.SphereGeometry(0.12 * s, 8, 6), hm, { pos: [0, hr * 1.12, -0.05 * s] }));
    } else if (style === 'spiky') {
      headG.add(mesh(new THREE.SphereGeometry(hr * 1.04, 12, 8, 0, TAU, 0, 1.55), hm, { pos: [0, 0.06 * s, -0.02 * s], rot: [-0.3, 0, 0] }));
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * TAU, rr = hr * 0.7;
        headG.add(mesh(new THREE.ConeGeometry(0.09 * s, 0.26 * s, 5), hm, { pos: [Math.cos(a) * rr, 0.04 * s + hr * 0.82 + (i % 2) * 0.03 * s, Math.sin(a) * rr - 0.04 * s], rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] }));
      }
    } else if (style === 'mohawk') {
      for (let i = 0; i < 6; i++) headG.add(mesh(new THREE.ConeGeometry(0.07 * s, 0.25 * s, 5), hm, { pos: [0, 0.2 * s + hr * 0.6 - Math.abs(i - 2.5) * 0.03, (i - 2.5) * 0.08 * s] }));
    }
    // baard
    if (spec.beard) {
      const bm = mat(spec.beardColor ?? hairC, { flatShading: false });
      if (spec.beard === 'full') headG.add(mesh(new THREE.SphereGeometry(hr * 0.85, 10, 8), bm, { pos: [0, -0.14 * s, hr * 0.3], scale: [1, 1.2, 0.85] }));
      else if (spec.beard === 'long') { headG.add(mesh(new THREE.ConeGeometry(hr * 0.9, 0.7 * s, 8), bm, { pos: [0, -0.4 * s, hr * 0.45], rot: [Math.PI + 0.1, 0, 0] })); }
      else headG.add(mesh(new THREE.CapsuleGeometry(0.02 * s, 0.16 * s, 3, 6), bm, { pos: [0, -0.02 * s, hr * 1.0], rot: [0, 0, Math.PI / 2] }));
    }
    // hoed
    if (spec.hat) this._hat(spec.hat, spec.hatColor ?? 0xcc3333, spec.hatColor2 ?? 0xffd24a, hr, s, headG);

    // staat
    this.speed = 0; this.pose = 'idle'; this.air = false; this.t = Math.random() * 10; this.phase = 0;
    this.swingT = 0; this.jumpT = 0; this.yaw = 0; this.targetYaw = 0; this.squash = 0; this.blinkT = 2 + Math.random() * 3;
    this.mood = 'happy';
    this.bake();
  }
  // Voegt de vaste onderdelen per lichaamsdeel samen tot één mesh (veel minder draw calls)
  bake() {
    const skip = new Set([this.mouth, this.scarfTail, this.cape]);
    for (const g of [this.legL, this.legR, this.torso, this.head, this.armL, this.armR, ...this.eyes]) {
      const buckets = new Map();
      for (const c of [...g.children]) {
        if (!c.isMesh || skip.has(c)) continue;
        const m = c.material; if (!m || Array.isArray(m) || m.isMeshBasicMaterial || m.transparent) continue;
        c.updateMatrix();
        const key = (m.flatShading ? 'f' : 's') + ((m.metalness || 0) > 0.3 ? 'm' : '') + (m.side === THREE.DoubleSide ? 'd' : '');
        (buckets.get(key) || buckets.set(key, []).get(key)).push(c);
      }
      for (const [key, list] of buckets) {
        if (list.length < 2) { list.forEach((c) => (c.castShadow = true)); continue; }
        const geos = list.map((c) => { const gg = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone(); gg.applyMatrix4(c.matrix); return [gg, c.material.color]; });
        const n = geos.reduce((a, [gg]) => a + gg.attributes.position.count, 0);
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
        for (const [gg, color] of geos) { const k = gg.attributes.position.count; pos.set(gg.attributes.position.array, o * 3); nor.set(gg.attributes.normal.array, o * 3); for (let i = 0; i < k; i++) { col[(o + i) * 3] = color.r; col[(o + i) * 3 + 1] = color.g; col[(o + i) * 3 + 2] = color.b; } o += k; gg.dispose(); }
        const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
        let bm = BAKED[key]; if (!bm) bm = BAKED[key] = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: key.includes('f'), metalness: key.includes('m') ? 0.6 : 0, roughness: key.includes('m') ? 0.4 : 0.85, side: key.includes('d') ? THREE.DoubleSide : THREE.FrontSide });
        const merged = new THREE.Mesh(mg, bm); merged.castShadow = true; merged.receiveShadow = false; g.add(merged);
        list.forEach((c) => { g.remove(c); c.geometry.dispose(); });
      }
    }
  }
  _hat(kind, c, c2, hr, s, head) {
    const top = 0.04 * s + hr * 0.9;
    const M = (g, col, o = {}) => mesh(g, mat(col, { flatShading: false, ...o }));
    const add = (m, x, y, z, rx = 0, ry = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.set(rx, ry, rz); head.add(m); return m; };
    switch (kind) {
      case 'cap': add(M(new THREE.SphereGeometry(hr * 1.08, 14, 8, 0, TAU, 0, 1.45), c), 0, 0.07 * s, 0, -0.1); add(M(new THREE.BoxGeometry(hr * 1.3, 0.03 * s, hr * 0.8), c), 0, top - 0.18 * s, hr * 0.95); break;
      case 'capback': add(M(new THREE.SphereGeometry(hr * 1.08, 14, 8, 0, TAU, 0, 1.45), c), 0, 0.07 * s, 0, -0.1); add(M(new THREE.BoxGeometry(hr * 1.3, 0.03 * s, hr * 0.8), c), 0, top - 0.18 * s, -hr * 0.95); break;
      case 'wizard': add(M(new THREE.ConeGeometry(hr * 0.95, 0.85 * s, 10), c), 0, top + 0.3 * s, 0, -0.12); add(M(new THREE.CylinderGeometry(hr * 1.6, hr * 1.6, 0.04 * s, 14), c), 0, top - 0.1 * s, 0); add(M(new THREE.TorusGeometry(hr * 0.93, 0.035 * s, 5, 14), c2), 0, top - 0.04 * s, 0, Math.PI / 2); break;
      case 'chef': add(M(new THREE.CylinderGeometry(hr * 0.85, hr * 0.8, 0.22 * s, 12), 0xffffff), 0, top + 0.0, 0); add(M(new THREE.SphereGeometry(hr * 1.05, 12, 8), 0xffffff), 0, top + 0.22 * s, 0, 0, 0, 0); break;
      case 'straw': add(M(new THREE.CylinderGeometry(hr * 1.9, hr * 1.9, 0.03 * s, 16), 0xe6c565), 0, top - 0.1 * s, 0); add(M(new THREE.CylinderGeometry(hr * 0.85, hr * 0.95, 0.2 * s, 12), 0xe6c565), 0, top, 0); add(M(new THREE.CylinderGeometry(hr * 0.96, hr * 0.96, 0.05 * s, 12), c), 0, top - 0.06 * s, 0); break;
      case 'helmet': add(M(new THREE.SphereGeometry(hr * 1.1, 14, 8, 0, TAU, 0, 1.6), 0xb7bcc6, { metalness: 0.7, roughness: 0.35 }), 0, 0.05 * s, 0); add(M(new THREE.BoxGeometry(0.05 * s, 0.22 * s, 0.03 * s), 0xb7bcc6, { metalness: 0.7 }), 0, 0.05 * s, hr * 1.05); add(M(new THREE.ConeGeometry(0.06 * s, 0.35 * s, 6), c), 0, top + 0.18 * s, -0.05 * s, -0.4); break;
      case 'hood': add(M(new THREE.SphereGeometry(hr * 1.15, 14, 10, 0, TAU, 0, 2.15), c), 0, 0.02 * s, -0.04 * s, -0.15); break;
      case 'crown': add(M(new THREE.CylinderGeometry(hr * 0.75, hr * 0.7, 0.14 * s, 10, 1, true), 0xf2c230, { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }), 0, top + 0.02 * s, 0); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; add(M(new THREE.ConeGeometry(0.04 * s, 0.14 * s, 4), 0xf2c230, { metalness: 0.7 }), Math.cos(a) * hr * 0.73, top + 0.14 * s, Math.sin(a) * hr * 0.73); } break;
      case 'beanie': add(M(new THREE.SphereGeometry(hr * 1.1, 14, 8, 0, TAU, 0, 1.5), c), 0, 0.06 * s, 0, -0.1); add(M(new THREE.SphereGeometry(0.08 * s, 8, 6), c2), 0, top + 0.08 * s, 0); break;
      case 'jester': add(M(new THREE.SphereGeometry(hr * 1.06, 12, 8, 0, TAU, 0, 1.3), c), 0, 0.06 * s, 0); add(M(new THREE.ConeGeometry(0.1 * s, 0.5 * s, 6), c), -hr * 0.8, top + 0.12 * s, 0, 0, 0, 0.9); add(M(new THREE.ConeGeometry(0.1 * s, 0.5 * s, 6), c2), hr * 0.8, top + 0.12 * s, 0, 0, 0, -0.9); add(M(new THREE.SphereGeometry(0.06 * s, 6, 5), 0xffe14a), -hr * 1.35, top + 0.3 * s, 0); add(M(new THREE.SphereGeometry(0.06 * s, 6, 5), 0xffe14a), hr * 1.35, top + 0.3 * s, 0); break;
      case 'bard': add(M(new THREE.CylinderGeometry(hr * 1.4, hr * 1.4, 0.03 * s, 14), c), 0, top - 0.08 * s, 0); add(M(new THREE.ConeGeometry(hr * 0.85, 0.3 * s, 10), c), 0, top + 0.08 * s, 0, 0, 0, 0); add(M(new THREE.CapsuleGeometry(0.02 * s, 0.4 * s, 3, 5), c2), -hr * 0.4, top + 0.25 * s, -0.1 * s, 0.3, 0, 0.8); break;
      case 'horns': add(M(new THREE.SphereGeometry(hr * 1.1, 14, 8, 0, TAU, 0, 1.4), 0x9a9a9a, { metalness: 0.6 }), 0, 0.06 * s, 0); for (const sd of [1, -1]) add(M(new THREE.ConeGeometry(0.06 * s, 0.35 * s, 6), 0xf5ecd0), sd * hr * 1.0, top - 0.04 * s, 0, 0, 0, -sd * 0.9); break;
      case 'knot': add(M(new THREE.TorusGeometry(hr * 1.0, 0.04 * s, 5, 14), c), 0, top - 0.2 * s, 0, Math.PI / 2 + 0.1); break;
      default: break;
    }
  }
  setColors({ shirt, hat }) { /* eenvoudig: niet nodig */ }
  faceDir(dx, dz) { if (Math.abs(dx) + Math.abs(dz) > 0.001) this.targetYaw = Math.atan2(dx, dz); }
  faceTowards(x, z) { this.faceDir(x - this.group.position.x, z - this.group.position.z); }
  swing() { this.swingT = 0.01; }
  jump() { this.jumpT = 0.01; this.squash = -0.2; }
  hold(obj, hand = 'r') { const h = hand === 'r' ? this.handR : this.handL; h.add(obj); return obj; }
  setMood(m) { this.mood = m; }
  update(dt) {
    this.t += dt;
    const sp = clamp(this.speed, 0, 1);
    this.yaw = dampAngle(this.yaw, this.targetYaw, 14, dt);
    this.group.rotation.y = this.yaw;
    this.phase += dt * (5 + sp * 9) * (sp > 0.05 ? 1 : 0);
    const sw = Math.sin(this.phase) * 0.95 * sp;
    let lx = sw, rx = -sw, alx = -sw * 0.9, arx = sw * 0.9, alz = 0.08, arz = -0.08;
    let lean = sp * 0.12, headX = 0, headZ = 0, bodyY = Math.abs(Math.sin(this.phase)) * 0.07 * this.s * sp + Math.sin(this.t * 2) * 0.01 * this.s;
    const P = this.pose;
    if (P === 'cheer') { alx = -2.9 + Math.sin(this.t * 14) * 0.4; arx = -2.9 - Math.sin(this.t * 14) * 0.4; alz = 0.3; arz = -0.3; bodyY += Math.abs(Math.sin(this.t * 7)) * 0.18 * this.s; headX = -0.15; }
    else if (P === 'sad') { alx = 0.1; arx = 0.1; alz = 0.05; arz = -0.05; headX = 0.45; lean = 0.2; bodyY -= 0.02; }
    else if (P === 'carry') { alx = -1.35; arx = -1.35; alz = -0.12; arz = 0.12; }
    else if (P === 'push') { alx = -1.45; arx = -1.45; alz = -0.1; arz = 0.1; lean = 0.35; }
    else if (P === 'scared') { alx = -1.9; arx = -1.9; alz = 0.5; arz = -0.5; headX = -0.2; bodyY += Math.sin(this.t * 40) * 0.015; }
    else if (P === 'wave') { arx = -2.7; arz = -0.5 + Math.sin(this.t * 9) * 0.35; }
    else if (P === 'point') { arx = -1.5; arz = -0.1; }
    else if (P === 'sit') { lx = -1.4; rx = -1.4; bodyY = -this.legLen * 0.42; alx = -0.6; arx = -0.6; }
    else if (P === 'hands_up') { alx = -3.0; arx = -3.0; alz = 0.15; arz = -0.15; }
    else if (P === 'dance') { const b = Math.sin(this.t * 8); alx = -2.2 + b; arx = -2.2 - b; alz = 0.5; arz = -0.5; lx = b * 0.5; rx = -b * 0.5; bodyY += Math.abs(b) * 0.1 * this.s; this.torso.rotation.z = b * 0.12; }
    if (P !== 'dance') this.torso.rotation.z = damp(this.torso.rotation.z, 0, 10, dt);
    // lucht
    if (this.air) { lx = -0.7; rx = 0.5; alx = -2.3; arx = -2.3; alz = 0.5; arz = -0.5; }
    // slag
    if (this.swingT > 0) {
      this.swingT += dt; const k = this.swingT / 0.32;
      if (k >= 1) this.swingT = 0; else { arx = k < 0.35 ? lerp(-0.5, -3.0, k / 0.35) : lerp(-3.0, 0.7, (k - 0.35) / 0.65); arz = -0.1; lean = k < 0.35 ? -0.1 : 0.3; }
    }
    // squash / jump
    this.squash = damp(this.squash, 0, 9, dt);
    const sq = this.squash;
    this.body.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    const k = 18;
    this.legL.rotation.x = damp(this.legL.rotation.x, lx, k, dt); this.legR.rotation.x = damp(this.legR.rotation.x, rx, k, dt);
    this.armL.rotation.x = damp(this.armL.rotation.x, alx, k, dt); this.armR.rotation.x = damp(this.armR.rotation.x, arx, this.swingT > 0 ? 40 : k, dt);
    this.armL.rotation.z = damp(this.armL.rotation.z, alz, k, dt); this.armR.rotation.z = damp(this.armR.rotation.z, arz, k, dt);
    this.torso.rotation.x = damp(this.torso.rotation.x, lean, 10, dt);
    this.head.rotation.x = damp(this.head.rotation.x, headX, 10, dt);
    this.body.position.y = bodyY;
    if (this.scarfTail) this.scarfTail.rotation.x = 0.2 + sp * 0.6 + Math.sin(this.t * 6) * 0.1 * sp;
    if (this.cape) this.cape.rotation.x = 0.1 + sp * 0.5 + Math.sin(this.t * 5) * 0.06;
    // knipperen
    this.blinkT -= dt;
    const bl = this.blinkT < 0 && this.blinkT > -0.12 ? 0.1 : 1;
    if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4;
    for (const e of this.eyes) e.scale.y = damp(e.scale.y, P === 'cheer' ? 0.35 : bl, 30, dt);
    this.mouth.rotation.z = P === 'sad' || P === 'scared' ? 0 : Math.PI;
    this.mouth.scale.set(P === 'scared' ? 1.3 : 1, P === 'cheer' ? 1.5 : 1, 1);
  }
}

export const BROTHER_SPECS = [
  { // Wes, de oudste
    scale: 1.0, skin: 0xf4c9a0, shirt: 0x2f9e5b, sleeve: 0xf2efe0, tunic: 0x2f9e5b, pants: 0x6b4a2e, boots: 0x4a2e17, belt: 0x5b3a1e,
    hair: 0x7a4a24, hairStyle: 'spiky', scarf: 0xd8372c, backpack: 0x8a5a2e, hat: null,
  },
  { // Jor, de jongste
    scale: 0.82, skin: 0xf7d2ae, shirt: 0x3a78e0, sleeve: 0x3a78e0, pants: 0x3d4a73, boots: 0x6b4a2e, belt: 0x3a2a1e,
    hair: 0xe8b84a, hairStyle: 'short', hat: 'capback', hatColor: 0xffc93c, eyeScale: 1.2, headScale: 1.1, cape: 0xe5484d,
  },
];
export const PLAYER_COLORS = [0x2f9e5b, 0x3a78e0];
export const PLAYER_CSS = ['#35c46f', '#4a8cff'];
export function makeBrother(i) { return new Character(BROTHER_SPECS[i]); }

// ---------- NPC presets ----------
export const NPC_SPECS = {
  baker: { scale: 1.1, bodyW: 1.35, shirt: 0xf5f5f5, apron: 0xffffff, pants: 0x6a5a4a, hat: 'chef', hair: 0x2a1a10, beard: 'stache', skin: 0xf0b890 },
  farmer: { scale: 1.05, bodyW: 1.2, shirt: 0x9a3030, pants: 0x3d5a8a, hat: 'straw', hatColor: 0xcc4444, beard: 'full', hair: 0xb87a3a, nose: 1.4 },
  witch: { scale: 0.95, shirt: 0x5b2a86, tunic: 0x5b2a86, pants: 0x3b1a56, hat: 'wizard', hatColor: 0x4a1f78, hatColor2: 0xffd24a, skin: 0x8fcf7a, nose: 2.2, hair: 0x222222, hairStyle: 'long', cape: 0x2d1450 },
  carter: { scale: 1.1, bodyW: 1.4, shirt: 0x8a6a3a, pants: 0x4a3a2a, hat: 'cap', hatColor: 0x556b2f, hair: 0x3a2a1a, beard: 'full', skin: 0xe2b08a },
  fisher: { scale: 1.0, shirt: 0x2e6f8e, sleeve: 0xdcd0b0, pants: 0x4a5a3a, hat: 'straw', hatColor: 0x2e6f8e, beard: 'long', hair: 0xcfcfcf, boots: 0x2b3b2b },
  foreman: { scale: 1.05, bodyW: 1.25, shirt: 0xb8742a, pants: 0x4b4b57, hat: 'helmet', hatColor: 0xd0452c, hair: 0x2a2a2a, beard: 'stache', skin: 0xd9a27a },
  dwarf: { scale: 0.7, bodyW: 1.45, shirt: 0x7a3a3a, tunic: 0x7a3a3a, pants: 0x44403a, hat: 'helmet', hatColor: 0xe0a030, hair: 0xd97a2a, beard: 'long', nose: 1.8, skin: 0xe8a98a },
  innkeeper: { scale: 1.0, bodyW: 1.3, shirt: 0xc4a84a, apron: 0xe8e0d0, pants: 0x4a3a2a, hair: 0x8a4a22, hairStyle: 'bun', skin: 0xf2c3a0 },
  jester: { scale: 0.95, shirt: 0xd8357f, sleeve: 0x2f6fe0, pants: 0x2f6fe0, hat: 'jester', hatColor: 0xd8357f, hatColor2: 0x2f6fe0, boots: 0xffe14a, nose: 1.3, skin: 0xf6d2b5 },
  shepherd: { scale: 1.0, shirt: 0x7a8a4a, pants: 0x5a4a3a, hat: 'beanie', hatColor: 0xc9b46a, hatColor2: 0xb04a3a, hair: 0x6a4a2a, cape: 0x6b4a2a },
  bard: { scale: 1.0, shirt: 0xa8325a, sleeve: 0xf0d89a, pants: 0x2e2e48, hat: 'bard', hatColor: 0x2a6a58, hatColor2: 0xe8412c, hair: 0x2a1c14, hairStyle: 'long', glasses: 0x333333 },
  captain: { scale: 1.2, bodyW: 1.3, shirt: 0x9aa4b4, sleeve: 0x9aa4b4, pants: 0x3a3a52, hat: 'helmet', hatColor: 0xcc2222, beard: 'stache', hair: 0x6a6a6a, cape: 0xcc2222 },
  mason: { scale: 1.0, bodyW: 1.2, shirt: 0xb0a090, pants: 0x5a5046, hat: 'knot', hatColor: 0xeeeeee, hair: 0x5a3a2a, beard: 'full', skin: 0xdba383 },
  sumo: { scale: 1.1, bodyW: 1.9, shirt: 0xe0e0e0, pants: 0x1d6aa5, hat: 'knot', hatColor: 0x222222, hair: 0x111111, skin: 0xf0b990 },
  kid: { scale: 0.7, shirt: 0xe8a33d, pants: 0x4a6a9a, hair: 0x3a2a1a, hairStyle: 'short' },
  elder: { scale: 0.95, shirt: 0x6c7a99, tunic: 0x6c7a99, pants: 0x4a4a5a, hat: 'wizard', hatColor: 0x6c7a99, hatColor2: 0xffffff, beard: 'long', hair: 0xf0f0f0, glasses: 0xd4a84a },
  guard: { scale: 1.15, bodyW: 1.2, shirt: 0x4a5a8a, pants: 0x3a3a52, hat: 'helmet', hatColor: 0x4a5a8a, hair: 0x4a3a2a },
  princess: { scale: 0.95, shirt: 0xf08ac8, tunic: 0xf08ac8, pants: 0xf08ac8, hat: 'crown', hair: 0xf2d28a, hairStyle: 'long' },
  goblin: { scale: 0.62, bodyW: 1.1, skin: 0x7fbf4a, ears: 'pointy', shirt: 0x6b4a2a, pants: 0x4a3420, nose: 1.8, eyeColor: 0xffe14a, eyeScale: 1.3, hair: 0x2a3a1a, hairStyle: 'mohawk' },
  skeleton: { scale: 1.0, skin: 0xe8e4d4, shirt: 0xd8d4c4, pants: 0xd8d4c4, boots: 0xd8d4c4, eyeColor: 0x000000, hairStyle: 'none' },
};
export function makeNPC(kind, overrides = {}) { return new Character({ ...(NPC_SPECS[kind] || NPC_SPECS.kid), ...overrides }); }

// ============================================================================
// De DEURMAN. Lang, bleek, glimlach te breed. Staat altijd in deuropeningen.
// ============================================================================
let _faceTex = null;
function faceTexture() {
  if (_faceTex) return _faceTex;
  _faceTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e9e9e6'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, 170); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(60,60,70,.55)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // hol oogkassen
    for (const sx of [-1, 1]) {
      const cx = w / 2 + sx * 52, cy = 104;
      const og = g.createRadialGradient(cx, cy, 3, cx, cy, 40); og.addColorStop(0, '#000'); og.addColorStop(0.65, '#050505'); og.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = og; g.beginPath(); g.ellipse(cx, cy, 30, 40, sx * 0.15, 0, 7); g.fill();
      g.fillStyle = '#ff2a1a'; g.beginPath(); g.arc(cx + sx * 1, cy + 3, 2.5, 0, 7); g.fill();
    }
    // brede glimlach
    g.strokeStyle = '#000'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(40, 160); g.bezierCurveTo(90, 235, 166, 235, 216, 160); g.stroke();
    g.fillStyle = '#080808'; g.beginPath(); g.moveTo(44, 162); g.bezierCurveTo(90, 228, 166, 228, 212, 162); g.bezierCurveTo(166, 190, 90, 190, 44, 162); g.fill();
    g.strokeStyle = '#d8d8d0'; g.lineWidth = 2;
    for (let i = 0; i < 17; i++) { const t = i / 16; const x = 52 + t * 152; const y = 176 + Math.sin(t * Math.PI) * 28; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x, y + 8); g.stroke(); }
    // smalle neus
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(w / 2, 125); g.lineTo(w / 2 - 4, 152); g.stroke();
  });
  _faceTex.userData.keep = true;
  return _faceTex;
}
export function drawScareFace(g, w, h, t, intensity = 1) {
  // volledig scherm gezicht voor jumpscare
  g.save();
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  const s = Math.min(w, h) * (1.05 + t * 0.6);
  const sx = (Math.random() - 0.5) * 18 * intensity, sy = (Math.random() - 0.5) * 18 * intensity;
  g.translate(w / 2 + sx, h / 2 + sy);
  // hoofd
  const hg = g.createRadialGradient(0, -s * 0.05, s * 0.1, 0, 0, s * 0.62);
  hg.addColorStop(0, '#f4f4ef'); hg.addColorStop(0.7, '#cfcfca'); hg.addColorStop(1, '#2a2a2e');
  g.fillStyle = hg; g.beginPath(); g.ellipse(0, 0, s * 0.42, s * 0.58, 0, 0, 7); g.fill();
  // ogen
  for (const sx2 of [-1, 1]) {
    const ex = sx2 * s * 0.17, ey = -s * 0.14;
    const eg = g.createRadialGradient(ex, ey, 2, ex, ey, s * 0.16); eg.addColorStop(0, '#000'); eg.addColorStop(0.7, '#000'); eg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = eg; g.beginPath(); g.ellipse(ex, ey, s * 0.12, s * 0.17, sx2 * 0.18, 0, 7); g.fill();
    g.fillStyle = `rgba(255,${30 + Math.random() * 40},20,.95)`; g.beginPath(); g.arc(ex, ey + s * 0.01, s * 0.012 + Math.random() * 2, 0, 7); g.fill();
  }
  // mond: veel te breed, openvallend
  const open = 0.5 + Math.min(1, t * 2) * 0.5;
  g.fillStyle = '#020202'; g.beginPath(); g.moveTo(-s * 0.36, s * 0.14);
  g.bezierCurveTo(-s * 0.2, s * (0.14 + 0.5 * open), s * 0.2, s * (0.14 + 0.5 * open), s * 0.36, s * 0.14);
  g.bezierCurveTo(s * 0.2, s * 0.2, -s * 0.2, s * 0.2, -s * 0.36, s * 0.14); g.fill();
  g.strokeStyle = '#e9e9e2'; g.lineWidth = Math.max(2, s * 0.006);
  for (let i = 0; i < 26; i++) { const k = i / 25; const x = -s * 0.34 + k * s * 0.68; const y = s * (0.16 + Math.sin(k * Math.PI) * 0.05); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 3, y + s * 0.07 + Math.random() * s * 0.03); g.stroke(); }
  g.restore();
  // glitch strepen + ruis
  g.save();
  for (let i = 0; i < 14 * intensity; i++) {
    const y = Math.random() * h, hh = 2 + Math.random() * 20; const dx = (Math.random() - .5) * 90 * intensity;
    g.drawImage(g.canvas, 0, y, w, hh, dx, y, w, hh);
  }
  g.globalAlpha = 0.18; g.fillStyle = '#ff0000'; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.5;
  for (let i = 0; i < 220; i++) { g.fillStyle = Math.random() < .5 ? '#fff' : '#000'; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 14, 1 + Math.random() * 3); }
  g.restore();
}

export class Deurman {
  constructor(scale = 1) {
    const s = scale;
    const root = new THREE.Group(); this.group = root; this.s = s;
    const suit = mat(0x0c0c10, { roughness: 0.9, flatShading: false });
    const skin = mat(0xe4e4e0, { roughness: 0.6, flatShading: false });
    // lange benen
    this.legs = [];
    for (const sd of [1, -1]) {
      const l = new THREE.Group(); l.position.set(sd * 0.14 * s, 1.35 * s, 0); root.add(l);
      l.add(mesh(new THREE.CapsuleGeometry(0.07 * s, 1.15 * s, 3, 8), suit, { pos: [0, -0.7 * s, 0] }));
      l.add(mesh(new THREE.BoxGeometry(0.14 * s, 0.1 * s, 0.32 * s), mat(0x050505), { pos: [0, -1.34 * s, 0.07 * s] }));
      this.legs.push(l);
    }
    this.torso = new THREE.Group(); this.torso.position.y = 1.35 * s; root.add(this.torso);
    this.torso.add(mesh(new THREE.CylinderGeometry(0.2 * s, 0.24 * s, 0.95 * s, 10), suit, { pos: [0, 0.48 * s, 0] }));
    this.torso.add(mesh(new THREE.BoxGeometry(0.08 * s, 0.7 * s, 0.02 * s), mat(0xf0f0f0), { pos: [0, 0.55 * s, 0.215 * s] }));
    this.torso.add(mesh(new THREE.BoxGeometry(0.07 * s, 0.55 * s, 0.025 * s), mat(0x6a0a0a), { pos: [0, 0.5 * s, 0.225 * s] }));
    // te lange armen
    this.arms = [];
    for (const sd of [1, -1]) {
      const a = new THREE.Group(); a.position.set(sd * 0.27 * s, 0.9 * s, 0); this.torso.add(a);
      a.add(mesh(new THREE.CapsuleGeometry(0.05 * s, 1.5 * s, 3, 8), suit, { pos: [0, -0.8 * s, 0] }));
      for (let f = 0; f < 4; f++) a.add(mesh(new THREE.CapsuleGeometry(0.012 * s, 0.32 * s, 2, 4), skin, { pos: [(f - 1.5) * 0.028 * s, -1.74 * s, 0.01 * s] }));
      this.arms.push(a);
    }
    this.head = new THREE.Group(); this.head.position.y = 1.08 * s; this.torso.add(this.head);
    const hm = mesh(new THREE.SphereGeometry(0.2 * s, 18, 14), skin, { scale: [0.9, 1.25, 1] }); this.head.add(hm);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.2 * s * 1.01, 24, 16, Math.PI / 2 - 0.95, 1.9, 0.3, 2.2), new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: false }));
    face.scale.set(0.9, 1.25, 1); this.head.add(face);
    // ogen gloeien rood als hij kijkt
    this.eyeGlow = [];
    for (const sd of [1, -1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.014 * s, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
      e.position.set(sd * 0.057 * s * 1.0, 0.07 * s, 0.195 * s); this.head.add(e); this.eyeGlow.push(e);
    }
    this.t = Math.random() * 10; this.speed = 0; this.twitchT = 1; this.tilt = 0; this.tiltTarget = 0; this.yaw = 0; this.targetYaw = 0; this.glitch = 0;
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  faceDir(dx, dz) { if (Math.abs(dx) + Math.abs(dz) > 0.001) this.targetYaw = Math.atan2(dx, dz); }
  update(dt) {
    this.t += dt; const sp = this.speed;
    this.yaw = dampAngle(this.yaw, this.targetYaw, 5, dt); this.group.rotation.y = this.yaw;
    const ph = this.t * 3.2;
    this.legs[0].rotation.x = Math.sin(ph) * 0.35 * sp; this.legs[1].rotation.x = -Math.sin(ph) * 0.35 * sp;
    this.arms[0].rotation.x = Math.sin(this.t * 0.9) * 0.05 - Math.sin(ph) * 0.12 * sp; this.arms[1].rotation.x = Math.sin(this.t * 0.8 + 1) * 0.05 + Math.sin(ph) * 0.12 * sp;
    this.arms[0].rotation.z = 0.04 + Math.sin(this.t * 0.6) * 0.03; this.arms[1].rotation.z = -0.04 - Math.sin(this.t * 0.7) * 0.03;
    this.torso.rotation.x = 0.06 + Math.sin(this.t * 0.7) * 0.02;
    this.twitchT -= dt;
    if (this.twitchT < 0) { this.tiltTarget = (Math.random() - 0.5) * 0.9; this.twitchT = 0.4 + Math.random() * 2.5; }
    this.tilt = damp(this.tilt, this.tiltTarget, 30, dt);
    this.head.rotation.z = this.tilt; this.head.rotation.x = 0.1;
    this.group.position.y += 0;
    if (this.glitch > 0) { this.glitch -= dt; this.group.scale.set(1 + (Math.random() - .5) * 0.15, 1 + (Math.random() - .5) * 0.1, 1); this.group.visible = Math.random() > 0.15; }
    else { this.group.scale.set(1, 1, 1); this.group.visible = true; }
  }
}
export function makeDeurman(scale = 1) { return new Deurman(scale); }

// ============================================================================
// Dieren, draken, slijmerds
// ============================================================================
export class Animal {
  constructor(kind) {
    this.kind = kind; const g = new THREE.Group(); this.group = g; g.userData.dynamic = true; this.t = Math.random() * 10; this.speed = 0; this.yaw = Math.random() * 6; this.targetYaw = this.yaw; this.peck = 0;
    if (kind === 'chicken') {
      g.add(mesh(new THREE.SphereGeometry(0.28, 10, 8), mat(0xf6f1e4, { flatShading: false }), { pos: [0, 0.38, 0], scale: [0.85, 0.9, 1.15] }));
      this.head = new THREE.Group(); this.head.position.set(0, 0.62, 0.26); g.add(this.head);
      this.head.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(0xf6f1e4)));
      this.head.add(mesh(new THREE.ConeGeometry(0.05, 0.14, 4), mat(0xf2a33a), { pos: [0, -0.01, 0.15], rot: [Math.PI / 2, 0, 0] }));
      this.head.add(mesh(new THREE.BoxGeometry(0.04, 0.1, 0.12), mat(0xd83a2a), { pos: [0, 0.14, 0.0] }));
      for (const sd of [1, -1]) this.head.add(mesh(new THREE.SphereGeometry(0.022, 5, 4), mat(0x111111), { cast: false, pos: [sd * 0.08, 0.03, 0.09] }));
      g.add(mesh(new THREE.ConeGeometry(0.12, 0.3, 4), mat(0xe8e0d0), { pos: [0, 0.45, -0.3], rot: [-1.0, 0, 0] }));
      this.legs = [1, -1].map((sd) => { const l = mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.2, 4), mat(0xf2a33a), { pos: [sd * 0.08, 0.1, 0.02] }); g.add(l); return l; });
    } else if (kind === 'sheep') {
      const wool = mat(0xf4f1ea, { flatShading: false });
      for (let i = 0; i < 9; i++) g.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), wool, { pos: [(i % 3 - 1) * 0.22, 0.65 + (i > 5 ? 0.18 : 0), (Math.floor(i / 3) - 1) * 0.22] }));
      this.head = new THREE.Group(); this.head.position.set(0, 0.7, 0.55); g.add(this.head);
      this.head.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(0x2a2a2a), { scale: [1, 1, 1.2] }));
      for (const sd of [1, -1]) { this.head.add(mesh(new THREE.SphereGeometry(0.06, 5, 4), mat(0x2a2a2a), { pos: [sd * 0.17, 0.05, -0.02], scale: [1.6, 0.5, 1] })); this.head.add(mesh(new THREE.SphereGeometry(0.025, 5, 4), mat(0xffffff), { cast: false, pos: [sd * 0.08, 0.06, 0.15] })); }
      this.legs = [[.2, .25], [-.2, .25], [.2, -.25], [-.2, -.25]].map(([x, z]) => { const l = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 5), mat(0x2a2a2a), { pos: [x, 0.17, z] }); g.add(l); return l; });
    } else if (kind === 'cow') {
      const wh = mat(0xf2f2ee, { flatShading: false }), bl = mat(0x2b2b2b);
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.7, 1.3), wh, { pos: [0, 0.85, 0] }));
      g.add(mesh(new THREE.BoxGeometry(0.72, 0.4, 0.5), bl, { pos: [0, 0.95, 0.15] }));
      g.add(mesh(new THREE.BoxGeometry(0.4, 0.3, 0.3), bl, { pos: [0.2, 1.0, -0.4] }));
      this.head = new THREE.Group(); this.head.position.set(0, 1.05, 0.8); g.add(this.head);
      this.head.add(mesh(new THREE.BoxGeometry(0.4, 0.4, 0.45), wh));
      this.head.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 0.15), mat(0xf0a8a8), { pos: [0, -0.1, 0.25] }));
      for (const sd of [1, -1]) { this.head.add(mesh(new THREE.ConeGeometry(0.04, 0.18, 4), mat(0xeeeeee), { pos: [sd * 0.18, 0.28, 0], rot: [0, 0, -sd * 0.5] })); this.head.add(mesh(new THREE.SphereGeometry(0.03, 5, 4), mat(0x111111), { cast: false, pos: [sd * 0.14, 0.07, 0.2] })); }
      this.legs = [[.25, .5], [-.25, .5], [.25, -.5], [-.25, -.5]].map(([x, z]) => { const l = mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), wh, { pos: [x, 0.25, z] }); g.add(l); return l; });
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  update(dt) {
    this.t += dt; this.yaw = dampAngle(this.yaw, this.targetYaw, 6, dt); this.group.rotation.y = this.yaw;
    const sp = this.speed;
    this.group.position.y = Math.abs(Math.sin(this.t * 10)) * 0.05 * sp * (this.kind === 'chicken' ? 1.5 : 0.5);
    if (this.legs) this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.t * 9 + i * 1.6) * 0.6 * sp; });
    if (this.head) {
      if (this.kind === 'chicken') this.head.rotation.x = sp < 0.1 ? (Math.sin(this.t * 1.7) > 0.7 ? 0.8 : 0) : Math.sin(this.t * 10) * 0.2;
      else this.head.rotation.x = sp < 0.1 ? Math.max(0, Math.sin(this.t * 0.6)) * 0.7 : 0;
    }
  }
}

export class Slime {
  constructor(color = 0x58d86b, size = 1) {
    const g = new THREE.Group(); this.group = g; this.size = size; this.t = Math.random() * 6; this.squash = 0;
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.88, flatShading: false, emissive: color, emissiveIntensity: 0.15 });
    this.blob = new THREE.Mesh(new THREE.SphereGeometry(0.5 * size, 16, 12, 0, TAU, 0, Math.PI * 0.62), m); this.blob.castShadow = true; g.add(this.blob);
    this.blob.add(mesh(new THREE.CylinderGeometry(0.5 * size * 0.95, 0.5 * size * 1.0, 0.0001, 16), m, { cast: false }));
    for (const sd of [1, -1]) {
      this.blob.add(mesh(new THREE.SphereGeometry(0.09 * size, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [sd * 0.17 * size, 0.28 * size, 0.38 * size] }));
      this.blob.add(mesh(new THREE.SphereGeometry(0.045 * size, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }), { cast: false, pos: [sd * 0.17 * size, 0.28 * size, 0.46 * size] }));
    }
  }
  update(dt, hopSpeed = 1) { this.t += dt * hopSpeed; const k = Math.sin(this.t * 5); this.blob.scale.set(1 - k * 0.08, 1 + k * 0.12, 1 - k * 0.08); }
}

export class Dragon {
  constructor(color = 0x7a2fd4, scale = 1) {
    const g = new THREE.Group(); this.group = g; this.t = 0;
    const m = mat(color, { flatShading: false }), belly = mat(0xe8c86a, { flatShading: false });
    g.add(mesh(new THREE.CapsuleGeometry(0.7 * scale, 2.0 * scale, 4, 10), m, { rot: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.CapsuleGeometry(0.55 * scale, 1.6 * scale, 4, 10), belly, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.2 * scale, 0.1] }));
    this.neck = new THREE.Group(); this.neck.position.set(0, 0.3 * scale, 1.6 * scale); g.add(this.neck);
    this.neck.add(mesh(new THREE.CapsuleGeometry(0.28 * scale, 1.0 * scale, 3, 8), m, { rot: [0.9, 0, 0], pos: [0, 0.4 * scale, 0.3 * scale] }));
    const head = new THREE.Group(); head.position.set(0, 0.95 * scale, 0.8 * scale); this.neck.add(head);
    head.add(mesh(new THREE.BoxGeometry(0.55 * scale, 0.4 * scale, 0.9 * scale), m, { pos: [0, 0, 0.2 * scale] }));
    for (const sd of [1, -1]) { head.add(mesh(new THREE.ConeGeometry(0.08 * scale, 0.5 * scale, 5), mat(0xf5ecd0), { pos: [sd * 0.2 * scale, 0.3 * scale, -0.1 * scale], rot: [-0.6, 0, 0] })); head.add(mesh(new THREE.SphereGeometry(0.07 * scale, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd23f }), { cast: false, pos: [sd * 0.2 * scale, 0.1 * scale, 0.45 * scale] })); }
    this.tail = []; let prev = g, py = 0, pz = -1.9 * scale;
    for (let i = 0; i < 6; i++) { const seg = new THREE.Group(); seg.position.set(0, py, pz); prev.add(seg); const r = 0.5 * scale * (1 - i * 0.14); seg.add(mesh(new THREE.ConeGeometry(r, 1.0 * scale, 6), m, { rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -0.45 * scale] })); this.tail.push(seg); prev = seg; py = 0; pz = -0.9 * scale; }
    this.wings = [];
    const wingGeo = new THREE.BufferGeometry(); const w = scale;
    wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.5 * w, 0, 0, -0.6 * w, 2.6 * w, 0.2 * w, -0.9 * w, 0, 0, 0.5 * w, 2.6 * w, 0.2 * w, -0.9 * w, 3.6 * w, 0.4 * w, 0.2 * w, 0, 0, 0.5 * w, 3.6 * w, 0.4 * w, 0.2 * w, 1.8 * w, 0.1 * w, 0.9 * w], 3));
    wingGeo.computeVertexNormals();
    const wm = new THREE.MeshStandardMaterial({ color: 0xc08cff, side: THREE.DoubleSide, roughness: 0.7, flatShading: true });
    for (const sd of [1, -1]) { const p = new THREE.Group(); p.position.set(sd * 0.5 * scale, 0.5 * scale, 0.3 * scale); const wing = new THREE.Mesh(wingGeo, wm); wing.scale.x = sd; wing.castShadow = true; p.add(wing); g.add(p); this.wings.push({ p, sd }); }
  }
  update(dt) {
    this.t += dt; const f = Math.sin(this.t * 3.2);
    for (const w of this.wings) w.p.rotation.z = w.sd * (f * 0.7 + 0.1);
    this.tail.forEach((s, i) => { s.rotation.y = Math.sin(this.t * 2 - i * 0.7) * 0.28; s.rotation.x = Math.sin(this.t * 2 - i * 0.5) * 0.1; });
    this.neck.rotation.x = -0.3 + Math.sin(this.t * 1.6) * 0.1;
    this.group.position.y += 0;
  }
}

export class Butterfly {
  constructor(color = 0xff9ad5) {
    const g = new THREE.Group(); this.group = g; this.t = Math.random() * 10;
    const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    this.w = [1, -1].map((sd) => { const p = new THREE.Group(); const w = new THREE.Mesh(new THREE.CircleGeometry(0.12, 6), m); w.position.x = sd * 0.1; w.rotation.x = -Math.PI / 2; p.add(w); g.add(p); return { p, sd }; });
  }
  update(dt) { this.t += dt; const f = Math.sin(this.t * 22) * 0.9; for (const w of this.w) w.p.rotation.z = w.sd * (0.3 + f); }
}
