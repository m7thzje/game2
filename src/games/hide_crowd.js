import * as THREE from 'three';
import { mulberry32, TAU, canvasTex, damp, dampAngle, clamp } from '../engine/util.js';

// Levend dorpsvolk voor het kermisplein: 18 dorpelingen als InstancedMesh (6 draw calls). Ze slenteren, kletsen, zwaaien,
// ontwijken voorwerpen en elkaar, en bevriezen als de Deurman kijkt. Eén instantie per lichaamsdeel, matrix per frame.

export const NPC_H = 1.7;
export function makeCrowd(scene, n, B, obstacles, seed = 3) {
  const rng = mulberry32(seed);
  const std = () => new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.9 });
  const geoBody = new THREE.CylinderGeometry(0.22, 0.3, 0.62, 8); geoBody.translate(0, 0.86, 0);
  const geoHead = new THREE.SphereGeometry(0.21, 9, 7); geoHead.translate(0, 1.38, 0);
  const geoLeg = new THREE.BoxGeometry(0.15, 0.56, 0.17); geoLeg.translate(0, -0.28, 0);
  const geoArm = new THREE.BoxGeometry(0.11, 0.5, 0.11); geoArm.translate(0, -0.25, 0);
  const geoCone = new THREE.ConeGeometry(0.2, 0.46, 7); geoCone.translate(0, 1.78, 0);
  const geoCap = new THREE.SphereGeometry(0.25, 8, 5, 0, TAU, 0, Math.PI / 2); geoCap.scale(1, 0.55, 1); geoCap.translate(0, 1.5, 0);
  const geoBrim = new THREE.CylinderGeometry(0.36, 0.36, 0.04, 9); geoBrim.translate(0, 1.52, 0);
  const nCone = Math.round(n * 0.4), nCap = n - nCone;
  const mk = (geo, count) => { const im = new THREE.InstancedMesh(geo, std(), count); im.frustumCulled = false; im.castShadow = false; scene.add(im); return im; };
  const body = mk(geoBody, n), head = mk(geoHead, n), legs = mk(geoLeg, n * 2), arms = mk(geoArm, n * 2), hatA = mk(geoCone, nCone), hatB = mk(geoCap, nCap), brim = mk(geoBrim, nCap);
  const shirts = [0xc86a5a, 0x5a8ac8, 0x6ac88a, 0xc8b05a, 0xa06ac8, 0xe8e0d0, 0xd88aa8, 0x7a9a5a, 0xc87a3a, 0x5ac8c0];
  const skins = [0xf2c29b, 0xe0a47a, 0xc88a60, 0xf6d2b5, 0x9a6a46];
  const hats = [0x8a3a3a, 0x3a5a8a, 0xe8c24a, 0x2a2a30, 0x6a4a8a, 0x3a8a5a, 0xe8e0d0];
  const col = new THREE.Color();
  const npcs = [];
  let ca = 0, cb = 0;
  for (let i = 0; i < n; i++) {
    const cone = i % 5 < 2; const hi = cone ? ca++ : cb++;
    const o = { i, x: 0, z: 0, yaw: rng() * TAU, ph: rng() * 6, sp: 0, vx: 0, vz: 0, tx: 0, tz: 0, wait: rng() * 3, state: 'wait', wave: 0, hop: 0, scale: 0.88 + rng() * 0.22, r: 0.42, cone, hi, stuck: 0, spd: 1.0 + rng() * 0.8, look: 0, big: rng() < 0.18 };
    if (o.big) o.scale *= 1.12;
    const sh = shirts[Math.floor(rng() * shirts.length)]; body.setColorAt(i, col.set(sh)); arms.setColorAt(i * 2, col.set(sh)); arms.setColorAt(i * 2 + 1, col.set(sh));
    head.setColorAt(i, col.set(skins[Math.floor(rng() * skins.length)]));
    legs.setColorAt(i * 2, col.set(0x4a3a2e)); legs.setColorAt(i * 2 + 1, col.set(0x4a3a2e));
    const hc = hats[Math.floor(rng() * hats.length)]; if (cone) hatA.setColorAt(hi, col.set(hc)); else { hatB.setColorAt(hi, col.set(hc)); brim.setColorAt(hi, col.set(hc)); }
    // beginpositie: ergens op het plein buiten de obstakels
    for (let t = 0; t < 30; t++) { o.x = (rng() * 2 - 1) * (B.X - 2); o.z = (rng() * 2 - 1) * (B.Z - 1.5); if (!hitsObs(o.x, o.z, 0.8)) break; }
    npcs.push(o);
  }
  function hitsObs(x, z, pad) { for (const b of obstacles.blockers) if (Math.hypot(b.x - x, b.z - z) < b.r + pad) return true; for (const p of obstacles.props) if (Math.hypot(p.x - x, p.z - z) < p.r + pad) return true; return false; }
  function pickTarget(o) { for (let t = 0; t < 20; t++) { o.tx = (rng() * 2 - 1) * (B.X - 1.5); o.tz = (rng() * 2 - 1) * (B.Z - 1.2); if (!hitsObs(o.tx, o.tz, 0.9)) return; } }

  const base = new THREE.Matrix4(), loc = new THREE.Matrix4(), out = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const put = (im, idx, lx, ly, lz, rx) => { loc.makeRotationX(rx); loc.setPosition(lx, ly, lz); out.multiplyMatrices(base, loc); im.setMatrixAt(idx, out); };
  const api = {
    npcs,
    update(dt, freeze, avoid, tt) {
      for (const o of npcs) {
        o.hop = Math.max(0, o.hop - dt * 2);
        if (freeze) { o.sp = damp(o.sp, 0, 14, dt); o.vx = o.vz = 0; }
        else if (o.state === 'wait') {
          o.sp = damp(o.sp, 0, 8, dt); o.wait -= dt; if (o.wave > 0) o.wave -= dt;
          o.yaw += Math.sin(tt * 0.9 + o.i) * dt * 0.4;
          if (o.wait <= 0) { pickTarget(o); o.state = 'walk'; o.stuck = 0; }
          else if (o.wave <= 0 && rng() < dt * 0.12) o.wave = 1.6;
        } else {
          let dx = o.tx - o.x, dz = o.tz - o.z; const d = Math.hypot(dx, dz);
          if (d < 0.7) { o.state = 'wait'; o.wait = 0.8 + rng() * 3.2; continue; }
          let ax = dx / d, az = dz / d;
          const rep = (ox, oz, rr, k) => { const ex = o.x - ox, ez = o.z - oz, e = Math.hypot(ex, ez); const lim = rr + o.r + 0.5; if (e < lim && e > 1e-4) { const f = (lim - e) / lim * k; ax += ex / e * f; az += ez / e * f; } };
          for (const b of obstacles.blockers) rep(b.x, b.z, b.r, 2.6);
          for (const p of obstacles.props) rep(p.x, p.z, p.r, 2.2);
          for (const m of npcs) if (m !== o) rep(m.x, m.z, m.r, 1.2);
          for (const a of avoid) rep(a.x, a.z, a.r, 2.6);
          const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
          const spd = o.spd * (o.big ? 0.85 : 1);
          o.vx = damp(o.vx, ax * spd, 6, dt); o.vz = damp(o.vz, az * spd, 6, dt);
          o.x += o.vx * dt; o.z += o.vz * dt; o.x = clamp(o.x, -B.X + 0.8, B.X - 0.8); o.z = clamp(o.z, -B.Z + 0.8, B.Z - 0.8);
          const sp = Math.hypot(o.vx, o.vz); o.sp = damp(o.sp, clamp(sp / 1.8, 0, 1), 8, dt);
          if (sp > 0.1) o.yaw = dampAngle(o.yaw, Math.atan2(o.vx, o.vz), 8, dt);
          o.stuck += dt; if (o.stuck > 7) { pickTarget(o); o.stuck = 0; }
        }
        o.ph += dt * (3 + o.sp * 6) * (o.sp > 0.05 ? 1 : 0);
        const hopY = o.hop > 0 ? Math.abs(Math.sin(o.hop * 6)) * 0.5 : 0;
        pos.set(o.x, hopY + Math.abs(Math.sin(o.ph)) * 0.04 * o.sp, o.z); q.setFromAxisAngle(up, o.yaw); sc.setScalar(o.scale); base.compose(pos, q, sc);
        const sw = Math.sin(o.ph) * 0.85 * o.sp;
        body.setMatrixAt(o.i, base); head.setMatrixAt(o.i, base);
        put(legs, o.i * 2, 0.12, 0.58, 0, sw); put(legs, o.i * 2 + 1, -0.12, 0.58, 0, -sw);
        const wv = o.wave > 0 ? -2.7 + Math.sin(tt * 12) * 0.3 : -sw * 0.9; const sc2 = o.hop > 0 ? -2.8 : 0;
        put(arms, o.i * 2, 0.33, 1.1, 0, o.hop > 0 ? sc2 : sw * 0.9); put(arms, o.i * 2 + 1, -0.33, 1.1, 0, o.hop > 0 ? sc2 : wv);
        if (o.cone) hatA.setMatrixAt(o.hi, base); else { hatB.setMatrixAt(o.hi, base); brim.setMatrixAt(o.hi, base); }
      }
      for (const im of [body, head, legs, arms, hatA, hatB, brim]) im.instanceMatrix.needsUpdate = true;
    },
    hop(o) { o.hop = 0.9; },
    nearest(x, z, reach) { let best = null, bd = 1e9; for (const o of npcs) { const d = Math.hypot(o.x - x, o.z - z) - o.r; if (d < reach && d < bd) { bd = d; best = o; } } return best ? { o: best, d: bd } : null; },
    dispose() { for (const im of [body, head, legs, arms, hatA, hatB, brim]) { scene.remove(im); im.geometry.dispose(); im.material.dispose(); } },
  };
  return api;
}
