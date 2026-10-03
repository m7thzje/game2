import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU, rand } from '../engine/util.js';
import { makeDeurman } from '../engine/chars.js';

// Kermisplein bij nacht voor "Verkleed-Verstoppertje": voorwerpen (instanced per soort, ook de verkleedde verstopper is zo'n instantie),
// kraampjes, draaimolen, reuzenrad, huizen met de poort van de Deurman, lantaarns en slingers. Alles procedureel en samengevoegd.

export const PLAZA = { X: 19, Z: 12 };          // halve afmetingen van het loopbare plein

// ---- geometrie samenvoegen met vertex-kleuren ----
export const part = (geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => ({ geo, color, pos: [x, y, z], rot: [rx, ry, rz], scale: [sx, sy, sz] });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
export function mergeParts(parts) {
  const gs = parts.map((p) => { const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone(); _m.compose(_v.set(...p.pos), _q.setFromEuler(_e.set(...p.rot)), _s.set(...p.scale)); g.applyMatrix4(_m); return g; });
  const n = gs.reduce((a, g) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3); let o = 0;
  gs.forEach((g, gi) => { const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); _c.set(parts[gi].color); for (let i = 0; i < k; i++) { col[(o + i) * 3] = _c.r; col[(o + i) * 3 + 1] = _c.g; col[(o + i) * 3 + 2] = _c.b; } o += k; g.dispose(); });
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mg.computeBoundingSphere(); return mg;
}
const cyl = (r0, r1, h, seg = 10) => new THREE.CylinderGeometry(r0, r1, h, seg);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, a = 10, b = 8) => new THREE.SphereGeometry(r, a, b);
const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);

// ---- voorwerp-soorten waar de verstopper zich als kan verkleden ----
export const KINDS = {
  barrel: { name: 'ton', icon: '🛢️', r: 0.55, parts: () => [part(cyl(0.46, 0.46, 1.0, 10), 0x9a6a38, 0, 0.5), part(cyl(0.5, 0.5, 0.5, 10), 0xa87440, 0, 0.5), part(cyl(0.52, 0.52, 0.08, 10), 0x3a3a44, 0, 0.22), part(cyl(0.52, 0.52, 0.08, 10), 0x3a3a44, 0, 0.78), part(cyl(0.42, 0.42, 0.04, 10), 0xc99a60, 0, 1.01)] },
  crate: { name: 'kist', icon: '📦', r: 0.6, parts: () => [part(box(1.0, 0.95, 1.0), 0xb98a54, 0, 0.475), part(box(1.05, 0.12, 0.12), 0x6b4a2e, 0, 0.9, 0.5), part(box(1.05, 0.12, 0.12), 0x6b4a2e, 0, 0.9, -0.5), part(box(0.12, 0.12, 1.05), 0x6b4a2e, 0.5, 0.9, 0), part(box(0.12, 0.12, 1.05), 0x6b4a2e, -0.5, 0.9, 0), part(box(1.02, 0.1, 1.02), 0x6b4a2e, 0, 0.1), part(box(0.1, 1.0, 1.02), 0x7a5a38, 0.48, 0.5), part(box(0.1, 1.0, 1.02), 0x7a5a38, -0.48, 0.5)] },
  sack: { name: 'zak', icon: '🎒', r: 0.5, parts: () => [part(sph(0.5, 10, 8), 0xc9b080, 0, 0.5, 0, 0, 0, 0, 1, 1.1, 1), part(cone(0.22, 0.4, 7), 0xb89c68, 0, 1.12), part(box(0.5, 0.06, 0.06), 0x8a6a3a, 0, 0.92)] },
  hay: { name: 'hooibaal', icon: '🌾', r: 0.65, parts: () => [part(cyl(0.55, 0.55, 1.1, 12), 0xe0c060, 0, 0.55, 0, 0, 0, Math.PI / 2), part(cyl(0.56, 0.56, 0.06, 12), 0xb89030, 0.25, 0.55, 0, 0, 0, Math.PI / 2), part(cyl(0.56, 0.56, 0.06, 12), 0xb89030, -0.25, 0.55, 0, 0, 0, Math.PI / 2)] },
  knight: { name: 'ridder-standbeeld', icon: '🗿', r: 0.6, parts: () => [part(box(0.9, 0.45, 0.9), 0x8a8a96, 0, 0.225), part(cyl(0.26, 0.34, 0.8, 8), 0xa6a6b4, 0, 0.85), part(sph(0.22, 8, 6), 0xb6b6c4, 0, 1.45), part(cyl(0.2, 0.24, 0.16, 8), 0x8a8a96, 0, 1.58), part(cone(0.08, 0.3, 5), 0xc23a3a, 0, 1.8), part(box(0.1, 0.9, 0.05), 0x70707c, 0.42, 1.05), part(box(0.3, 0.06, 0.06), 0x70707c, 0.42, 0.78), part(box(0.1, 0.5, 0.36), 0x70707c, -0.4, 0.95)] },
  jester: { name: 'nar-standbeeld', icon: '🤡', r: 0.55, parts: () => [part(cyl(0.45, 0.5, 0.4, 8), 0x7a6aa0, 0, 0.2), part(cyl(0.2, 0.32, 0.8, 8), 0xd8357f, 0, 0.8), part(sph(0.22, 8, 6), 0xf6d2b5, 0, 1.4), part(cone(0.12, 0.5, 6), 0x2f6fe0, -0.2, 1.75, 0, 0, 0, 0.9), part(cone(0.12, 0.5, 6), 0xd8357f, 0.2, 1.75, 0, 0, 0, -0.9), part(sph(0.07, 5, 4), 0xff3030, 0, 1.4, 0.22), part(sph(0.06, 5, 4), 0xffe14a, -0.4, 2.0), part(sph(0.06, 5, 4), 0xffe14a, 0.4, 2.0)] },
  pumpkin: { name: 'pompoen', icon: '🎃', r: 0.55, parts: () => [part(sph(0.55, 10, 8), 0xe8791c, 0, 0.42, 0, 0, 0, 0, 1.1, 0.8, 1.1), part(cyl(0.07, 0.1, 0.25, 5), 0x4a7a2a, 0, 0.88), part(sph(0.45, 8, 6), 0xd86a14, 0.25, 0.4, 0.15, 0, 0, 0, 0.7, 0.8, 0.7)] },
  cake: { name: 'taartenkar', icon: '🎂', r: 0.6, parts: () => [part(cyl(0.2, 0.26, 0.4, 8), 0x6a4a2e, 0, 0.2), part(cyl(0.6, 0.6, 0.3, 14), 0xf8b8d0, 0, 0.55), part(cyl(0.45, 0.45, 0.3, 14), 0xffffff, 0, 0.85), part(cyl(0.3, 0.3, 0.25, 12), 0xf8b8d0, 0, 1.1), part(sph(0.1, 6, 5), 0xd82a3a, 0, 1.3), part(cyl(0.04, 0.04, 0.2, 4), 0xffe14a, 0.15, 1.35)] },
  bucket: { name: 'emmer', icon: '🪣', r: 0.45, parts: () => [part(cyl(0.42, 0.3, 0.8, 10), 0x7a8aa0, 0, 0.4), part(cyl(0.44, 0.44, 0.06, 10), 0x5a6a80, 0, 0.8), part(new THREE.TorusGeometry(0.36, 0.03, 4, 12, Math.PI), 0x333340, 0, 0.8, 0, 0, 0, 0)] },
  clown: { name: 'kermisclown', icon: '🤪', r: 0.6, parts: () => [part(box(0.9, 1.3, 0.12), 0x3a78e0, 0, 0.8), part(sph(0.4, 10, 8), 0xf6d2b5, 0, 1.75, 0.06, 0, 0, 0, 1, 1, 0.5), part(sph(0.12, 6, 5), 0xff2a2a, 0, 1.72, 0.25), part(sph(0.22, 6, 5), 0xff7a1a, -0.4, 1.95, 0, 0, 0, 0, 1, 1, 0.5), part(sph(0.22, 6, 5), 0xff7a1a, 0.4, 1.95, 0, 0, 0, 0, 1, 1, 0.5), part(box(0.5, 0.16, 0.05), 0xd8372c, 0, 1.45, 0.12), part(box(0.12, 0.5, 0.12), 0x6b4a2e, -0.3, 0.25), part(box(0.12, 0.5, 0.12), 0x6b4a2e, 0.3, 0.25)] },
  pot: { name: 'bloempot', icon: '🪴', r: 0.5, parts: () => [part(cyl(0.45, 0.3, 0.6, 10), 0xc8693a, 0, 0.3), part(cyl(0.48, 0.48, 0.1, 10), 0xb85a2a, 0, 0.62), part(sph(0.46, 8, 6), 0x3b9a45, 0, 0.95, 0, 0, 0, 0, 1, 0.8, 1), part(sph(0.1, 5, 4), 0xff6fa5, 0.25, 1.25, 0.1), part(sph(0.1, 5, 4), 0xffe14a, -0.2, 1.3, -0.1), part(sph(0.1, 5, 4), 0xffffff, 0.0, 1.38, 0.2)] },
  hen: { name: 'gouden kip', icon: '🐔', r: 0.55, parts: () => [part(box(0.8, 0.4, 0.8), 0x8a7a5a, 0, 0.2), part(sph(0.4, 8, 6), 0xf2c230, 0, 0.75, 0, 0, 0, 0, 0.9, 0.9, 1.15), part(sph(0.2, 7, 5), 0xf2c230, 0, 1.15, 0.38), part(cone(0.07, 0.2, 4), 0xd8372c, 0, 1.12, 0.6, Math.PI / 2), part(box(0.05, 0.2, 0.2), 0xd8372c, 0, 1.38, 0.38), part(cone(0.2, 0.4, 4), 0xf2c230, 0, 0.95, -0.4, -1.0)] },
};
export const KIND_IDS = Object.keys(KINDS);
const KIND_COUNT = { barrel: 6, crate: 6, sack: 4, hay: 4, knight: 3, jester: 3, pumpkin: 4, cake: 3, bucket: 4, clown: 3, pot: 4, hen: 3 };

function groundTexture() {
  return canvasTex(1024, 672, (g, w, h) => {
    const r = mulberry32(21);
    g.fillStyle = '#6e6560'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 26) for (let x = -20; x < w; x += 32) { const o = ((y / 26) % 2) * 16; const l = 96 + Math.floor(r() * 50); g.fillStyle = `rgb(${l + 8},${l},${l - 8})`; g.beginPath(); g.roundRect(x + o + 1, y + 1, 29, 23, 6); g.fill(); g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(x + o + 4, y + 4, 10, 3); }
    // groot ster-patroon rond de draaimolen + paden
    const X = (x) => (x + PLAZA.X + 2) / (2 * PLAZA.X + 4) * w, Z = (z) => (z + PLAZA.Z + 2) / (2 * PLAZA.Z + 4) * h;
    g.strokeStyle = 'rgba(255,214,120,.35)'; g.lineWidth = 8; g.beginPath(); g.arc(X(0), Z(0), 3.9 * w / (2 * PLAZA.X + 4), 0, TAU); g.stroke();
    g.lineWidth = 4; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(X(Math.cos(a) * 4.2), Z(Math.sin(a) * 4.2)); g.lineTo(X(Math.cos(a) * 9), Z(Math.sin(a) * 9)); g.stroke(); }
    // confetti en gemorste popcorn
    for (let i = 0; i < 260; i++) { g.fillStyle = ['#ff6fa5', '#ffe14a', '#6fd8ff', '#8dff9a', '#ffffff'][i % 5]; g.globalAlpha = 0.35 + r() * 0.3; g.fillRect(r() * w, r() * h, 5, 3); }
    g.globalAlpha = 1;
  });
}

export function buildPlaza(ctx, L, seed = 7) {
  const { scene } = ctx; const rng = mulberry32(seed);
  const root = new THREE.Group(); scene.add(root);
  const W = { root, blockers: [], props: [], kinds: {}, glows: [] };
  const stdMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  const basicMat = new THREE.MeshBasicMaterial({ vertexColors: true });

  // ---- grond ----
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2 * PLAZA.X + 4, 2 * PLAZA.Z + 4), new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; root.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(220, 160), new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 1 })); outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; root.add(outer);

  // ---- voorwerpen (InstancedMesh per soort) ----
  const counts = {}; for (const k of KIND_IDS) counts[k] = KIND_COUNT[k];
  const spare = 3;                                     // extra instanties voor de verstopper en lokvogels
  for (const k of KIND_IDS) {
    const geo = mergeParts(KINDS[k].parts()); const im = new THREE.InstancedMesh(geo, stdMat, counts[k] + spare); im.count = 0; im.frustumCulled = false; root.add(im);
    W.kinds[k] = { im, cap: counts[k] + spare, used: 0, free: [] };
  }
  // draaimolen, kramen: eerst de blokkades vastleggen, dan de voorwerpen daaromheen
  W.blockers.push({ x: 0, z: 0, r: 3.5 });
  const stallSpots = [[-14, -10.6, 0], [-8.4, -10.6, 0], [8.4, -10.6, 0], [14, -10.6, 0], [-17.2, -3.6, 1], [-17.2, 3.8, 1], [17.2, -3.6, 1], [17.2, 3.8, 1]];
  for (const [x, z, rot] of stallSpots) { if (rot) { W.blockers.push({ x, z: z - 1, r: 1.2 }, { x, z: z + 1, r: 1.2 }); } else { W.blockers.push({ x: x - 1, z, r: 1.2 }, { x: x + 1, z, r: 1.2 }); } }
  const lampSpots = [[-11, -7], [11, -7], [-11, 7], [11, 7], [0, -8], [0, 9]];
  for (const [x, z] of lampSpots) W.blockers.push({ x, z, r: 0.5 });
  W.lampSpots = lampSpots; W.stallSpots = stallSpots;

  // plaats voorwerpen in clusters van twee soorten (zo valt de verstopper tussen soortgenoten)
  const placed = [];
  const free = (x, z, rr) => Math.abs(x) < PLAZA.X - 1.2 && Math.abs(z) < PLAZA.Z - 1.0 && !W.blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + rr) && !placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + rr + 0.35);
  const remaining = { ...counts }; const kindPool = () => KIND_IDS.filter((k) => remaining[k] > 0);
  let guard = 0;
  while (kindPool().length && guard++ < 400) {
    const pool = kindPool(); const k1 = pool[Math.floor(rng() * pool.length)]; const k2 = pool[Math.floor(rng() * pool.length)];
    const cx = (rng() * 2 - 1) * (PLAZA.X - 3.5), cz = (rng() * 2 - 1) * (PLAZA.Z - 2.5); if (W.blockers.some((b) => Math.hypot(b.x - cx, b.z - cz) < b.r + 0.8)) continue;
    for (const k of [k1, k1, k2, k2, k1]) {
      if (remaining[k] <= 0) continue;
      for (let t = 0; t < 10; t++) {
        const x = cx + (rng() - 0.5) * 5.4, z = cz + (rng() - 0.5) * 4.4, s = 0.92 + rng() * 0.2;
        if (!free(x, z, KINDS[k].r * s)) continue;
        const p = { kind: k, x, z, rot: rng() * TAU, s, r: KINDS[k].r * s, shake: 0, hit: 0 }; placed.push(p); remaining[k]--; break;
      }
    }
  }
  for (const p of placed) { const K = W.kinds[p.kind]; p.idx = K.used++; K.im.count = K.used; W.props.push(p); }
  const dummy = new THREE.Object3D();
  W.writeProp = (p, t) => {
    const K = W.kinds[p.kind]; dummy.position.set(p.x, 0, p.z); dummy.rotation.set(0, p.rot, 0); const wob = p.shake > 0 ? Math.sin(p.shake * 40) * p.shake * 0.35 : 0;
    dummy.rotation.z = wob; dummy.rotation.x = wob * 0.6; const sy = p.s * (p.breath ? 1 + Math.sin(t * 3.2) * 0.022 : 1); dummy.scale.set(p.s, sy, p.s); dummy.position.y = p.lift || 0; dummy.updateMatrix(); K.im.setMatrixAt(p.idx, dummy.matrix); K.im.instanceMatrix.needsUpdate = true;
  };
  // extra instanties (verstopper / lokvogel): vraag een slot, geef het weer terug
  W.addInstance = (kind, x, z, s = 1) => {
    const K = W.kinds[kind]; let idx; if (K.free.length) idx = K.free.pop(); else if (K.used < K.cap) idx = K.used++; else return null; K.im.count = Math.max(K.im.count, idx + 1);
    const p = { kind, x, z, rot: rng() * TAU, s, r: KINDS[kind].r * s, shake: 0, hit: 0, idx, extra: true }; W.writeProp(p, 0); return p;
  };
  W.removeInstance = (p) => { if (!p) return; const K = W.kinds[p.kind]; dummy.scale.set(0, 0, 0); dummy.position.set(0, -50, 0); dummy.updateMatrix(); K.im.setMatrixAt(p.idx, dummy.matrix); K.im.instanceMatrix.needsUpdate = true; K.free.push(p.idx); };
  for (const p of W.props) W.writeProp(p, 0);

  // ---- vaste decors: kramen, huizen, lantaarns, wiel ----
  const lit = [], glow = [];
  const stripe = [[0xd8372c, 0xffffff], [0x2f6fe0, 0xffe14a], [0x2f9e5b, 0xffffff], [0xd8357f, 0xffe14a], [0x8a4ad8, 0xffffff]];
  stallSpots.forEach(([x, z, rot], i) => {
    const sub = []; const [c1, c2] = stripe[i % stripe.length];
    sub.push(part(box(3.4, 0.95, 1.0), 0x7a5230, 0, 0.48, 0.5));            // toonbank
    sub.push(part(box(3.5, 0.1, 1.2), 0xb98a54, 0, 1.0, 0.5));
    for (const sx of [-1.65, 1.65]) { sub.push(part(box(0.14, 2.7, 0.14), 0x6b4a2e, sx, 1.35, -0.45)); sub.push(part(box(0.14, 2.3, 0.14), 0x6b4a2e, sx, 1.15, 1.2)); }
    for (let k = 0; k < 8; k++) sub.push(part(box(0.44, 0.07, 2.0), k % 2 ? c2 : c1, -1.54 + k * 0.44, 2.62 - 0.2, 0.4, 0.28));   // gestreept dak
    sub.push(part(box(3.5, 0.5, 0.06), c1, 0, 2.2, 1.35));
    for (const sx of [-1.65, 1.65]) sub.push(part(sph(0.13, 6, 5), 0xfff0b0, sx, 2.75, -0.45));
    const goods = [[0xff6fa5, 0.3], [0xffe14a, 0.28], [0x6fd8ff, 0.3], [0x8dff9a, 0.26]]; goods.forEach(([c, r], k) => sub.push(part(sph(r, 7, 5), c, -1.1 + k * 0.75, 1.3, 0.5)));
    const sm = mergeParts(sub.map((p) => ({ ...p, pos: [p.pos[0], p.pos[1], p.pos[2]] })));
    const m = new THREE.Mesh(sm, stdMat); m.position.set(x, 0, z); m.rotation.y = rot ? (x < 0 ? Math.PI / 2 : -Math.PI / 2) : 0; root.add(m);
  });
  // huizen langs de noordkant (met gloeiende ramen) + zijkanten
  const houseCols = [0xc8a888, 0xb88a8a, 0x9aa8c0, 0xc8b878, 0xa8c0a0, 0xd0a0b0, 0xb0b0c8];
  const bx = [-16.5, -10.5, -4.8, 4.8, 10.5, 16.5];
  bx.forEach((x, i) => {
    const hgt = 5.5 + (i % 3) * 1.6, wd = 5.2;
    lit.push(part(box(wd, hgt, 4.2), houseCols[i % 7], x, hgt / 2, -15.6), part(cone(wd * 0.78, 2.4, 4), [0x9a3a2a, 0x4a5a8a, 0x3a6a4a][i % 3], x, hgt + 1.2, -15.6, 0, Math.PI / 4));
    for (let wy = 0; wy < 2; wy++) for (const wx of [-1.4, 1.4]) glow.push(part(box(0.7, 0.9, 0.1), wy ? 0xffd070 : 0xffb050, x + wx, 2.6 + wy * 2.2, -13.45));
  });
  for (const sx of [-1, 1]) for (const z of [-5, 3, 11]) { const hgt = 4.5 + ((z + 5) % 3); lit.push(part(box(3.4, hgt, 5.4), houseCols[(z + 9) % 7], sx * 23.5, hgt / 2, z), part(cone(3.8, 2.0, 4), 0x7a3a3a, sx * 23.5, hgt + 1, z, 0, Math.PI / 4)); glow.push(part(box(0.1, 0.9, 0.7), 0xffc060, sx * 21.75, 2.4, z)); }
  // draaimolen (draait): vloer, paal, dak, paardjes
  const car = [part(cyl(3.0, 3.1, 0.35, 20), 0x8a5a2e, 0, 0.18), part(cyl(0.35, 0.45, 3.3, 10), 0xd8c070, 0, 1.8), part(cone(3.5, 1.2, 20), 0xd8372c, 0, 3.7), part(cyl(3.5, 3.5, 0.2, 20), 0xffffff, 0, 3.05), part(sph(0.28, 8, 6), 0xffd23f, 0, 4.4)];
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, rr = 2.1; car.push(part(cyl(0.05, 0.05, 2.6, 5), 0xe8d890, Math.cos(a) * rr, 1.6, Math.sin(a) * rr), part(box(0.34, 0.55, 0.9), [0xffffff, 0xe8a830, 0x8a5a2e, 0xd8357f][i % 4], Math.cos(a) * rr, 1.2, Math.sin(a) * rr, 0, -a + Math.PI / 2), part(sph(0.2, 6, 5), [0xffffff, 0xe8a830, 0x8a5a2e, 0xd8357f][i % 4], Math.cos(a) * rr + Math.cos(a + 1.57) * 0.45, 1.6, Math.sin(a) * rr - Math.sin(a + 1.57) * 0.45)); }
  W.carousel = new THREE.Mesh(mergeParts(car), stdMat); root.add(W.carousel);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; glow.push(part(sph(0.12, 5, 4), i % 2 ? 0xffe14a : 0xff6fa5, Math.cos(a) * 3.45, 3.15, Math.sin(a) * 3.45)); }
  // lantaarns
  for (const [x, z] of lampSpots) { lit.push(part(cyl(0.06, 0.09, 3.2, 6), 0x2a2a30, x, 1.6, z), part(box(0.34, 0.4, 0.34), 0x3a3a44, x, 3.3, z)); glow.push(part(sph(0.2, 6, 5), 0xfff0b0, x, 3.3, z)); }
  root.add(new THREE.Mesh(mergeParts(lit), stdMat));
  root.add(new THREE.Mesh(mergeParts(glow), basicMat));
  // halo-sprites van lantaarns
  const haloTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,230,160,.9)'); gr.addColorStop(0.5, 'rgba(255,190,90,.3)'); gr.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  for (const [x, z] of lampSpots) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(5, 5, 1); s.position.set(x, 3.3, z); root.add(s); W.glows.push(s); }

  // reuzenrad (draait langzaam) achter de huizen
  const wheel = []; const WR = 8.5;
  wheel.push(part(new THREE.TorusGeometry(WR, 0.12, 5, 40), 0xe8e8f0), part(new THREE.TorusGeometry(WR * 0.6, 0.08, 5, 32), 0xe8e8f0));
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; wheel.push(part(box(WR, 0.06, 0.06), 0xd0d0e0, Math.cos(a) * WR / 2, Math.sin(a) * WR / 2, 0, 0, 0, a), part(box(1.0, 0.8, 0.8), [0xd8372c, 0x2f6fe0, 0xffd23f, 0x2f9e5b][i % 4], Math.cos(a) * WR, Math.sin(a) * WR - 0.1, 0), part(sph(0.18, 5, 4), 0xfff0a0, Math.cos(a) * WR * 1.03, Math.sin(a) * WR * 1.03, 0.2)); }
  W.wheel = new THREE.Mesh(mergeParts(wheel), basicMat); W.wheel.position.set(-9, 11, -24); root.add(W.wheel);
  const wstand = mesh(new THREE.BoxGeometry(0.5, 11, 0.5), mat(0x555566), { cast: false, pos: [-9, 5, -24.2] }); root.add(wstand);
  // hekken langs de zuidrand (instanced)
  const fenceN = 26; const posts = new THREE.InstancedMesh(box(0.14, 1.0, 0.14), mat(0x6b4a2e), fenceN); const ropes = new THREE.InstancedMesh(box(1, 0.06, 0.06), mat(0xd8c070), fenceN);
  for (let i = 0; i < fenceN; i++) { const x = -PLAZA.X + 0.6 + i * ((2 * PLAZA.X - 1.2) / (fenceN - 1)); dummy.position.set(x, 0.5, PLAZA.Z + 1.0); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix); dummy.position.set(x + (2 * PLAZA.X - 1.2) / (fenceN - 1) / 2, 0.85, PLAZA.Z + 1.0); dummy.scale.set((2 * PLAZA.X - 1.2) / (fenceN - 1), 1, 1); dummy.updateMatrix(); ropes.setMatrixAt(i, dummy.matrix); }
  ropes.count = fenceN - 1; root.add(posts, ropes);
  // slingers met lampjes
  const bulbN = 64; const bulbs = new THREE.InstancedMesh(sph(0.13, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbN); let bi = 0; const bc = new THREE.Color();
  for (const x0 of [-11, 11]) for (let i = 0; i < 32; i++) { const t = i / 31; dummy.position.set(x0 + (t - 0.5) * 0.6, 5.6 - Math.sin(t * Math.PI) * 1.1, -9.8 + t * 19.6); dummy.scale.set(1, 1, 1); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); bulbs.setMatrixAt(bi, dummy.matrix); bulbs.setColorAt(bi, bc.set([0xffe14a, 0xff6fa5, 0x6fd8ff, 0x8dff9a][i % 4])); bi++; }
  root.add(bulbs);

  // ---- de poort van de Deurman (noordmuur, midden) ----
  const gate = new THREE.Group(); gate.position.set(0, 0, -13.5); root.add(gate);
  gate.add(mesh(box(2.8, 3.6, 0.3), mat(0x050508), { cast: false, pos: [0, 1.8, -0.2] }));
  gate.add(mesh(box(3.2, 0.3, 0.5), mat(0x5a4a3a), { cast: false, pos: [0, 3.75, 0] }), mesh(box(0.3, 3.6, 0.5), mat(0x5a4a3a), { cast: false, pos: [-1.55, 1.8, 0] }), mesh(box(0.3, 3.6, 0.5), mat(0x5a4a3a), { cast: false, pos: [1.55, 1.8, 0] }));
  const doors = [-1, 1].map((sd) => { const p = new THREE.Group(); p.position.set(sd * 1.4, 0, 0.15); const d = mesh(box(1.4, 3.5, 0.12), mat(0x6b4226), { cast: false, pos: [-sd * 0.7, 1.75, 0] }); p.add(d); gate.add(p); return { p, sd }; });
  const dm = makeDeurman(1.05); dm.group.position.set(0, 0, -0.9); dm.group.rotation.y = 0; dm.group.visible = false; gate.add(dm.group);
  W.gate = { g: gate, doors, deurman: dm, open: 0, target: 0 };

  W.update = (t, dt) => {
    W.carousel.rotation.y += dt * 0.5; W.wheel.rotation.z -= dt * 0.12;
    for (const g of W.glows) g.material.opacity = 0.75 + Math.sin(t * 5 + g.position.x) * 0.1;
    const G = W.gate; G.open = damp(G.open, G.target, 6, dt);
    for (const d of G.doors) d.p.rotation.y = -d.sd * G.open * 1.75;
    G.deurman.group.visible = G.open > 0.35; G.deurman.update(dt);
    // verstopper-instanties met schudden/ademen worden door de game via writeProp bijgewerkt
  };
  L.hemi.intensity = 0.8; L.hemi.color.set(0x8a9ad0); L.hemi.groundColor.set(0x3a2a3a); L.sun.intensity = 0.55; L.sun.color.set(0xa0b0ff);
  return W;
}
