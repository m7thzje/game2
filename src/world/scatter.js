import * as THREE from 'three';
import { mulberry32, smoothstep, fbm, TAU } from '../engine/util.js';
import { heightAt, isWater, WATER_Y } from './terrain.js';
import { KEEPOUT, PATHS, ICE, SWAMP, riverX, WORLD, BOARD, HOME } from './layout.js';

// ---- helper: voeg meerdere geometrieen samen tot één met vertexkleuren ----
export function mergeGeos(parts) {
  const pos = [], nor = [], col = [];
  for (const { geo, color, m } of parts) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (m) g.applyMatrix4(m);
    const p = g.attributes.position, n = g.attributes.normal;
    const c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const M4 = (x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx, ry = 0, rx = 0, rz = 0) => {
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  return m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
};

function oakGeo() {
  return mergeGeos([
    { geo: new THREE.CylinderGeometry(0.28, 0.42, 2.6, 7), color: 0x6b4a2e, m: M4(0, 1.3, 0) },
    { geo: new THREE.IcosahedronGeometry(1.9, 1), color: 0x46a63e, m: M4(0, 3.9, 0) },
    { geo: new THREE.IcosahedronGeometry(1.35, 1), color: 0x3b9438, m: M4(1.2, 3.1, 0.5) },
    { geo: new THREE.IcosahedronGeometry(1.25, 1), color: 0x52b447, m: M4(-1.2, 3.3, -0.4) },
    { geo: new THREE.IcosahedronGeometry(1.0, 1), color: 0x4aa83f, m: M4(0.2, 5.1, 0.4) },
  ]);
}
function pineGeo(snow = false) {
  const parts = [{ geo: new THREE.CylinderGeometry(0.22, 0.38, 2.2, 6), color: 0x5b3d24, m: M4(0, 1.1, 0) }];
  for (let i = 0; i < 4; i++) {
    const r = 2.1 - i * 0.42, y = 2.0 + i * 1.35;
    parts.push({ geo: new THREE.ConeGeometry(r, 2.2, 8), color: i % 2 ? 0x2c7a4b : 0x24694a, m: M4(0, y + 1.0, 0) });
    if (snow) parts.push({ geo: new THREE.ConeGeometry(r * 0.78, 1.5, 8), color: 0xf2f8ff, m: M4(0, y + 1.45, 0) });
  }
  return mergeGeos(parts);
}
function bushGeo() { return mergeGeos([{ geo: new THREE.IcosahedronGeometry(0.9, 1), color: 0x3f9e3c, m: M4(0, 0.6, 0, 1, 0.8, 1) }, { geo: new THREE.IcosahedronGeometry(0.65, 1), color: 0x56b84a, m: M4(0.7, 0.45, 0.2) }, { geo: new THREE.IcosahedronGeometry(0.6, 1), color: 0x35903a, m: M4(-0.6, 0.4, -0.2) }]); }
function rockGeo() { return mergeGeos([{ geo: new THREE.DodecahedronGeometry(1, 0), color: 0x8e9098, m: M4(0, 0.5, 0, 1, 0.7, 0.85) }, { geo: new THREE.DodecahedronGeometry(0.6, 0), color: 0x7c7e86, m: M4(0.8, 0.25, 0.3) }]); }
function flowerGeo() {
  const parts = [{ geo: new THREE.CylinderGeometry(0.02, 0.025, 0.35, 4), color: 0x3b8a3a, m: M4(0, 0.17, 0) }];
  for (let i = 0; i < 5; i++) parts.push({ geo: new THREE.SphereGeometry(0.07, 5, 4), color: 0xffffff, m: M4(Math.cos(i / 5 * TAU) * 0.08, 0.37, Math.sin(i / 5 * TAU) * 0.08) });
  parts.push({ geo: new THREE.SphereGeometry(0.05, 5, 4), color: 0xffd23f, m: M4(0, 0.38, 0) });
  return mergeGeos(parts);
}
function tuftGeo() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(0.35, 0.55); g.translate(0, 0.27, 0);
    parts.push({ geo: g, color: i === 1 ? 0x5fb447 : 0x4ea03c, m: M4(0, 0, 0, 1, 1, 1, i * Math.PI / 3) });
  }
  const geo = mergeGeos(parts);
  // verloop donker->licht
  const p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) { const k = 0.55 + p.getY(i) * 0.9; c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k); }
  return geo;
}
function mushGeo() { return mergeGeos([{ geo: new THREE.CylinderGeometry(0.1, 0.14, 0.5, 6), color: 0xf4ecd8, m: M4(0, 0.25, 0) }, { geo: new THREE.SphereGeometry(0.4, 8, 6, 0, TAU, 0, Math.PI / 2), color: 0xd8403a, m: M4(0, 0.5, 0) }, { geo: new THREE.SphereGeometry(0.06, 4, 3), color: 0xffffff, m: M4(0.18, 0.78, 0.1) }, { geo: new THREE.SphereGeometry(0.06, 4, 3), color: 0xffffff, m: M4(-0.12, 0.82, -0.14) }]); }
function reedGeo() { const parts = []; for (let i = 0; i < 5; i++) parts.push({ geo: new THREE.CylinderGeometry(0.015, 0.03, 1.4, 4), color: 0x7a9a45, m: M4(Math.cos(i * 1.7) * 0.12, 0.7, Math.sin(i * 1.7) * 0.12, 1, 0.7 + i * 0.12, 1, 0, Math.sin(i) * 0.15, Math.cos(i) * 0.15) }); parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 0.3, 5), color: 0x5a3a20, m: M4(0.05, 1.2, 0.0) }); return mergeGeos(parts); }

function inst(scene, geo, count, { flat = true, shadow = true, rough = 0.9, material = null } = {}) {
  const m = material || new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: flat, roughness: rough, side: material ? THREE.FrontSide : THREE.DoubleSide });
  const im = new THREE.InstancedMesh(geo, m, count); im.castShadow = shadow; im.receiveShadow = true; im.count = 0;
  scene.add(im); return im;
}
const D = new THREE.Object3D(); const C = new THREE.Color();
function put(im, x, y, z, s, ry, tint, sy = s) {
  D.position.set(x, y, z); D.rotation.set(0, ry, 0); D.scale.set(s, sy, s); D.updateMatrix();
  im.setMatrixAt(im.count, D.matrix); if (tint) { C.setHSL(tint[0], tint[1], tint[2]); im.setColorAt(im.count, C); } else { C.setRGB(1, 1, 1); im.setColorAt(im.count, C); }
  im.count++;
}

function distToPath(x, z) {
  let best = 1e9;
  for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1]; const dx = bx - ax, dz = bz - az; const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t)); if (d < best) best = d;
  }
  return best;
}
export function blockedByLayout(x, z, margin = 0) {
  for (const k of KEEPOUT) if (Math.hypot(x - k.x, z - k.z) < k.r + margin) return true;
  return false;
}

// Zaait de hele wereld met vegetatie. Retourneert colliders voor bomen en rotsen.
export function scatterWorld(scene, quality = 'high') {
  const rng = mulberry32(2024); const R = () => rng();
  const colliders = [];
  const MAXOAK = 300, MAXPINE = 520, MAXSNOW = 90, MAXBUSH = 260, MAXROCK = 220, MAXFLOWER = quality === 'low' ? 300 : 900, MAXTUFT = quality === 'low' ? 1200 : 4200, MAXMUSH = 90, MAXREED = 160;
  const oaks = inst(scene, oakGeo(), MAXOAK), pines = inst(scene, pineGeo(false), MAXPINE), snows = inst(scene, pineGeo(true), MAXSNOW);
  const bushes = inst(scene, bushGeo(), MAXBUSH), rocks = inst(scene, rockGeo(), MAXROCK), flowers = inst(scene, flowerGeo(), MAXFLOWER, { shadow: false });
  const tufts = inst(scene, tuftGeo(), MAXTUFT, { shadow: false }), mush = inst(scene, mushGeo(), MAXMUSH), reeds = inst(scene, reedGeo(), MAXREED, { shadow: false });
  const half = WORLD / 2 - 6;
  let tries = 0;
  while ((oaks.count < MAXOAK || pines.count < MAXPINE) && tries++ < 30000) {
    const x = (R() - 0.5) * 2 * half, z = (R() - 0.5) * 2 * half; const r = Math.hypot(x, z);
    if (r > 128) continue;
    if (blockedByLayout(x, z, 1.5) || isWater(x, z) || distToPath(x, z) < 3.2) continue;
    const y = heightAt(x, z); if (y < -0.4 || y > 26) continue;
    const dens = 0.5 + fbm(x * 0.04 + 3, z * 0.04 - 8, 3) * 1.4;
    const swamp = Math.exp(-((x - SWAMP.x) ** 2 + (z - SWAMP.z) ** 2) / 900);
    const mount = smoothstep(55, 100, r);
    const snowy = Math.hypot(x - ICE.x, z - ICE.z) < 34;
    if (R() > dens * (0.18 + mount * 0.9 + swamp * 0.9)) continue;
    const tint = [0.28 + R() * 0.06, 0.45 + R() * 0.15, 0.4 + R() * 0.15];
    if (snowy && snows.count < MAXSNOW) { const s = 0.9 + R() * 0.8; put(snows, x, y, z, s, R() * TAU); colliders.push({ x, z, r: 0.7 * s }); continue; }
    if (mount > 0.35 || (swamp > 0.2 && R() < 0.5)) { if (pines.count >= MAXPINE) continue; const s = 0.9 + R() * 1.1; put(pines, x, y, z, s, R() * TAU, [0.38 + R() * 0.05, 0.4, 0.3 + R() * 0.12]); colliders.push({ x, z, r: 0.7 * s }); }
    else { if (oaks.count >= MAXOAK) continue; const s = 0.8 + R() * 0.9; put(oaks, x, y, z, s, R() * TAU, tint); colliders.push({ x, z, r: 0.8 * s }); }
  }
  tries = 0;
  while ((bushes.count < MAXBUSH || rocks.count < MAXROCK) && tries++ < 20000) {
    const x = (R() - 0.5) * 2 * half, z = (R() - 0.5) * 2 * half; if (Math.hypot(x, z) > 130) continue;
    if (blockedByLayout(x, z, 0.5) || isWater(x, z) || distToPath(x, z) < 2.6) continue; const y = heightAt(x, z); if (y < -0.4) continue;
    if (R() < 0.5 && bushes.count < MAXBUSH) { const s = 0.7 + R() * 0.8; put(bushes, x, y, z, s, R() * TAU, [0.27 + R() * 0.08, 0.5, 0.35 + R() * 0.15]); colliders.push({ x, z, r: 0.7 * s }); }
    else if (rocks.count < MAXROCK) { const s = 0.6 + R() * (Math.hypot(x, z) > 70 ? 2.8 : 1.2); put(rocks, x, y - 0.1, z, s, R() * TAU, [0.62, 0.05, 0.45 + R() * 0.2]); colliders.push({ x, z, r: 0.9 * s }); }
  }
  // bloemen in clusters
  tries = 0; const FC = [[0.95, 0.8, 0.65], [0.13, 0.95, 0.6], [0.6, 0.85, 0.7], [0.0, 0.0, 1.0], [0.8, 0.7, 0.65]];
  while (flowers.count < MAXFLOWER && tries++ < 10000) {
    const cx = (R() - 0.5) * 2 * 110, cz = (R() - 0.5) * 2 * 110; if (isWater(cx, cz) || Math.hypot(cx, cz) > 100 || distToPath(cx, cz) < 2) continue;
    if (blockedByLayout(cx, cz, -3) && R() < 0.8) continue;
    const col = FC[Math.floor(R() * FC.length)];
    for (let k = 0; k < 9 && flowers.count < MAXFLOWER; k++) { const x = cx + (R() - 0.5) * 6, z = cz + (R() - 0.5) * 6; if (isWater(x, z) || blockedByLayout(x, z, -1)) continue; const y = heightAt(x, z); if (y < -0.3 || y > 8) continue; put(flowers, x, y, z, 0.8 + R() * 0.8, R() * TAU, k % 3 === 0 ? [0.14, 0.9, 0.62] : col); }
  }
  // grastuften
  tries = 0;
  while (tufts.count < MAXTUFT && tries++ < 40000) {
    const x = (R() - 0.5) * 2 * 115, z = (R() - 0.5) * 2 * 115; if (isWater(x, z) || distToPath(x, z) < 2.4) continue;
    if (Math.hypot(x - ICE.x, z - ICE.z) < ICE.r + 6) continue; const y = heightAt(x, z); if (y < -0.3 || y > 14) continue;
    if (Math.hypot(x, z) < 15 && Math.hypot(x, z) > 0) continue;
    put(tufts, x, y, z, 0.8 + R() * 0.9, R() * TAU, [0.27 + R() * 0.07, 0.5, 0.4 + R() * 0.15], 0.8 + R() * 0.9);
  }
  // paddenstoelen en riet in het moeras / rivier
  for (let i = 0; i < 900 && mush.count < MAXMUSH; i++) {
    const x = SWAMP.x + (R() - 0.5) * 50, z = SWAMP.z + (R() - 0.5) * 50; if (isWater(x, z) || Math.hypot(x - SWAMP.x, z - SWAMP.z) > 25 || blockedByLayout(x, z, 0.5)) continue;
    const s = 0.7 + R() * 1.6; put(mush, x, heightAt(x, z), z, s, R() * TAU, [0.0 + R() * 0.08, 0.6, 0.5]); if (s > 1.7) colliders.push({ x, z, r: 0.35 * s });
  }
  for (let i = 0; i < 2000 && reeds.count < MAXREED; i++) {
    const z = (R() - 0.5) * 220; const x = riverX(z) + (R() < 0.5 ? -1 : 1) * (6 + R() * 2.2); if (isWater(x, z) || blockedByLayout(x, z, 0)) continue;
    put(reeds, x, heightAt(x, z), z, 0.8 + R() * 0.7, R() * TAU);
  }
  for (const im of [oaks, pines, snows, bushes, rocks, flowers, tufts, mush, reeds]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
  return { colliders };
}
