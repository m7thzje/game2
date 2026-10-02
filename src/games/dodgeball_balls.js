import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, clamp } from '../engine/util.js';
import { glowSprite } from './dodgeball_world.js';

// Visuals van de ballen in het Vuurbal-Duel: vuurbal, gouden bal (met vleugeltjes), bom-bal en de reuzenpompoen.

export const BALL_R = { fire: 0.55, gold: 0.62, bomb: 0.62, pumpkin: 1.2 };

let fireTex = null, pumpTex = null, pumpEmis = null; const digitTex = {};
function getFireTex() {
  if (fireTex) return fireTex;
  fireTex = canvasTex(256, 128, (g, w, h) => {
    const r = mulberry32(3);
    g.fillStyle = '#d8340c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = ['#ff7a1c', '#ffb02e', '#ffe070', '#8d1d06'][i % 4]; g.globalAlpha = 0.55; g.beginPath(); g.ellipse(r() * w, r() * h, 4 + r() * 22, 3 + r() * 9, r() * 3, 0, TAU); g.fill(); }
    g.globalAlpha = 1; g.strokeStyle = '#5a0e02'; g.lineWidth = 3;
    for (let i = 0; i < 9; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  });
  fireTex.userData.keep = true; return fireTex;
}
function getPumpTex() {
  if (pumpTex) return [pumpTex, pumpEmis];
  const draw = (emis) => canvasTex(512, 256, (g, w, h) => {
    if (emis) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    else {
      g.fillStyle = '#e8801c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? 'rgba(160,70,0,.28)' : 'rgba(255,170,60,.25)'; g.fillRect(i * w / 16, 0, w / 16, h); }
    }
    // gezicht: sfeerdeel van de bol dat naar +z kijkt = u ≈ 0.25 (Three: u=0 bij -x..)
    const cx = w * 0.25, cy = h * 0.52;
    const fill = emis ? '#ffe070' : '#2a1204';
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(cx - 70, cy - 40); g.lineTo(cx - 25, cy - 58); g.lineTo(cx - 20, cy - 12); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + 70, cy - 40); g.lineTo(cx + 25, cy - 58); g.lineTo(cx + 20, cy - 12); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx - 8, cy - 2); g.lineTo(cx + 8, cy - 2); g.lineTo(cx, cy + 14); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx - 80, cy + 22); g.quadraticCurveTo(cx, cy + 90, cx + 80, cy + 22); g.lineTo(cx + 62, cy + 20); g.quadraticCurveTo(cx, cy + 52, cx - 62, cy + 20); g.closePath(); g.fill();
    g.fillStyle = emis ? '#000' : '#fff3c0';
    for (const tx of [-34, 0, 34]) { g.beginPath(); g.moveTo(cx + tx - 8, cy + 46); g.lineTo(cx + tx + 8, cy + 46); g.lineTo(cx + tx, cy + 62 - Math.abs(tx) * 0.2); g.closePath(); if (!emis) g.fill(); }
  });
  pumpTex = draw(false); pumpEmis = draw(true); pumpTex.userData.keep = pumpEmis.userData.keep = true;
  return [pumpTex, pumpEmis];
}
function getDigit(n) {
  if (digitTex[n]) return digitTex[n];
  const t = canvasTex(64, 64, (g, w, h) => { g.font = 'bold 54px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 9; g.strokeStyle = '#220000'; g.lineJoin = 'round'; g.strokeText(String(n), w / 2, h / 2 + 3); g.fillStyle = '#ffe14a'; g.fillText(String(n), w / 2, h / 2 + 3); });
  t.userData.keep = true; digitTex[n] = t; return t;
}

const _v = new THREE.Vector3();

// Maak een bal. Geeft { group, r, tick(t, dt, vx, vy, vz, o) } terug.
export function createBall(type) {
  const r = BALL_R[type];
  const group = new THREE.Group();
  const spin = new THREE.Group(); group.add(spin);
  const o = { type, r, group, spin, flames: null, glow: null, extra: {} };

  if (type === 'fire') {
    const ft = getFireTex();
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshStandardMaterial({ map: ft, emissive: 0xff5a10, emissiveMap: ft, emissiveIntensity: 1.1, roughness: 0.6 })));
    const fl = new THREE.Group(); group.add(fl); o.flames = fl;
    const mk = (rad, len, col, op) => { const gg = new THREE.ConeGeometry(rad, len, 7); gg.translate(0, len / 2, 0); gg.rotateX(-Math.PI / 2); const m = new THREE.Mesh(gg, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })); fl.add(m); return m; };
    o.fl = [mk(r * 0.95, r * 3.2, 0xff3a10, 0.55), mk(r * 0.7, r * 2.4, 0xff9a20, 0.7), mk(r * 0.4, r * 1.6, 0xffe070, 0.85)];
    o.glow = glowSprite(0xff7a30, r * 6.5, 0.8); group.add(o.glow);
  } else if (type === 'gold') {
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.85, roughness: 0.25, emissive: 0xb87800, emissiveIntensity: 0.7 })));
    spin.add(mesh(new THREE.TorusGeometry(r * 0.98, 0.05, 5, 20), mat(0xfff3b0, { metalness: 0.7, roughness: 0.3, emissive: 0xffd23f }), { cast: false }));
    const ring2 = mesh(new THREE.TorusGeometry(r * 0.98, 0.05, 5, 20), mat(0xfff3b0, { metalness: 0.7, roughness: 0.3, emissive: 0xffd23f }), { cast: false, rot: [Math.PI / 2, 0, 0] }); spin.add(ring2);
    const wm = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0b0, emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.6 });
    const wg = new THREE.ConeGeometry(0.28, 1.1, 4); wg.translate(0, 0.55, 0);
    o.wings = [1, -1].map((sd) => { const p = new THREE.Group(); p.position.set(sd * r * 0.8, 0.1, 0); const w = new THREE.Mesh(wg, wm); w.rotation.z = -sd * 1.25; w.scale.set(1, 1, 0.25); p.add(w); group.add(p); return { p, sd }; });
    o.glow = glowSprite(0xffd23f, r * 7, 0.85); group.add(o.glow);
  } else if (type === 'bomb') {
    spin.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshStandardMaterial({ color: 0x1c1c26, metalness: 0.5, roughness: 0.35 })));
    spin.add(mesh(new THREE.TorusGeometry(r * 0.99, 0.07, 5, 20), mat(0xd8372c, { emissive: 0x802010 }), { cast: false, rot: [Math.PI / 2, 0, 0] }));
    spin.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 8), mat(0x555560, { metalness: 0.6 }), { pos: [0, r * 0.95, 0] }));
    spin.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.4, 5), mat(0xc9a05a), { cast: false, pos: [0.05, r * 1.15 + 0.1, 0], rot: [0, 0, -0.3] }));
    o.spark = glowSprite(0xffd060, 0.8, 1); o.spark.position.set(0.15, r * 1.3 + 0.18, 0); spin.add(o.spark);
    // gezichtje met boze ogen
    for (const sd of [1, -1]) spin.add(mesh(new THREE.SphereGeometry(0.1, 7, 5), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [sd * 0.22, 0.12, r * 0.9], scale: [1, 1.3, 0.5] }));
    o.glow = glowSprite(0xff3a2a, r * 6, 0.0); group.add(o.glow);
    o.digit = new THREE.Sprite(new THREE.SpriteMaterial({ map: getDigit(3), transparent: true, depthTest: false })); o.digit.scale.set(1.3, 1.3, 1); o.digit.position.y = r + 1.5; o.digit.renderOrder = 18; group.add(o.digit);
  } else if (type === 'pumpkin') {
    const [pt, pe] = getPumpTex();
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: pt, emissive: 0xffa020, emissiveMap: pe, emissiveIntensity: 1.6, roughness: 0.75 }));
    body.scale.set(1.1, 0.92, 1.1); spin.add(body);
    spin.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.5, 6), mat(0x4a7a2a), { pos: [0, r * 0.9, 0], rot: [0.25, 0, 0.2] }));
    spin.add(mesh(new THREE.TorusGeometry(0.2, 0.05, 5, 8, 4.5), mat(0x4a7a2a), { cast: false, pos: [0.25, r * 0.92, 0.05], rot: [0, 1.0, 0] }));
    o.glow = glowSprite(0xffa030, r * 4.2, 0.5); group.add(o.glow);
    body.userData.faceU = 0.25;
  }

  // per frame bijwerken. (vx,vy,vz) = snelheid, o2.rest = ligt stil, o2.heat 0..1 (opladen), o2.fuse = seconden bom, o2.live
  o.tick = (t, dt, vx, vy, vz, o2 = {}) => {
    const sp = Math.hypot(vx, vy, vz);
    if (type === 'fire') {
      _v.set(-vx * 0.12, 1 + (-vy * 0.12), -vz * 0.12);
      if (o2.held) _v.set(0, 1, 0);
      _v.normalize();
      o.flames.lookAt(group.position.x - _v.x, group.position.y - _v.y, group.position.z - _v.z);
      const len = 0.8 + clamp(sp / 14, 0, 1.2) + (o2.heat || 0) * 0.9;
      o.fl.forEach((m, i) => { m.scale.set(1, 1, len * (1 + Math.sin(t * 26 + i * 2) * 0.16)); });
      spin.rotation.x += dt * (2 + sp * 0.4); spin.rotation.y += dt * 1.5;
      o.glow.material.opacity = 0.6 + (o2.heat || 0) * 0.3 + Math.sin(t * 20) * 0.08;
    } else if (type === 'gold') {
      spin.rotation.y += dt * 4; spin.rotation.x += dt * 1.5;
      o.wings.forEach((w) => { w.p.rotation.z = w.sd * (0.2 + Math.sin(t * 22) * 0.55); });
      o.glow.material.opacity = 0.65 + Math.sin(t * 9) * 0.2;
    } else if (type === 'bomb') {
      spin.rotation.y += dt * 0.8 * (1 + sp * 0.2); spin.rotation.x += dt * sp * 0.25;
      const f = o2.fuse == null ? 3 : o2.fuse;
      const dg = clamp(Math.ceil(f), 1, 3); if (o.digit.material.map !== getDigit(dg)) { o.digit.material.map = getDigit(dg); o.digit.material.needsUpdate = true; }
      const blink = Math.sin(t * (6 + (3 - f) * 7)) > 0 ? 1 : 0;
      o.glow.material.opacity = (0.15 + (3 - f) / 3 * 0.55) * (0.35 + blink * 0.65);
      o.spark.material.opacity = 0.6 + Math.random() * 0.4; o.spark.scale.setScalar(0.7 + Math.random() * 0.5);
      const s = 1 + (f < 1.2 ? Math.sin(t * 40) * 0.06 : 0); spin.scale.setScalar(s);
    } else if (type === 'pumpkin') {
      if (o2.rest || o2.held) { const k = 1 - Math.exp(-6 * dt); spin.rotation.x -= spin.rotation.x * k; spin.rotation.z -= spin.rotation.z * k; }
      else { spin.rotation.x += vz * dt / r; spin.rotation.z -= vx * dt / r; }
      o.glow.material.opacity = 0.4 + Math.sin(t * 6) * 0.1;
    }
  };
  return o;
}
