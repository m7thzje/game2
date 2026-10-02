import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, smoothstep, fbm, mulberry32, TAU, glow } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { makeNPC, Butterfly } from '../engine/chars.js';

// Wereld van "Karretje uit de Modder": een lang pad (langs +x) van modderstuk, via een omgevallen
// boomstam, een steile glibberhelling omhoog naar de dorpspoort van Zonnebeek.

export const LOG_X = 33.5;       // x van de boomstam
export const S3A = 40, S3B = 68; // begin / einde van de helling
export const SH = 8.5;           // hoogte van de helling
export const GATE_X = 80;        // dorpspoort
export const ROAD_W = 8.4;

export const roadY = (x) => SH * smoothstep(S3A, S3B, x);
export const roadSlope = (x) => (roadY(x + 0.25) - roadY(x - 0.25)) / 0.5;

function hills(x, z) {
  if (z > -5.5) return 0;
  const t = smoothstep(-5.5, -26, z);
  const n = clamp(fbm(x * 0.045 + 10, z * 0.05) * 0.9 + 0.5, 0, 1);
  return t * (3 + 11 * n);
}
export function groundY(x, z) {
  let y = roadY(x) + hills(x, z);
  const az = Math.abs(z);
  if (az > 4.6) { y += fbm(x * 0.3, z * 0.3) * 0.25; if (az < 6) y -= 0.18 * Math.sin((az - 4.6) / 1.4 * Math.PI); }
  if (z > 22) y -= smoothstep(22, 45, z) * 2.5;
  return y;
}

// ---------- texturen ----------
function mudTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(5);
    g.fillStyle = '#5a3d24'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = ['rgba(60,38,18,.45)', 'rgba(110,76,44,.4)', 'rgba(40,26,12,.4)'][i % 3];
      g.beginPath(); g.ellipse(r() * w, r() * h, 6 + r() * 26, 3 + r() * 10, r() * 0.6, 0, TAU); g.fill();
    }
    // wielsporen
    for (const fy of [0.34, 0.66]) {
      const gr = g.createLinearGradient(0, h * fy - 16, 0, h * fy + 16);
      gr.addColorStop(0, 'rgba(30,18,8,0)'); gr.addColorStop(0.5, 'rgba(30,18,8,.55)'); gr.addColorStop(1, 'rgba(30,18,8,0)');
      g.fillStyle = gr; g.fillRect(0, h * fy - 16, w, 32);
    }
    // plassen met hemelreflectie
    for (const [px, py, rx, ry] of [[60, 70, 34, 13], [190, 170, 40, 15], [120, 220, 26, 9], [210, 40, 22, 8]]) {
      const gr = g.createRadialGradient(px, py, 2, px, py, rx);
      gr.addColorStop(0, '#9db8c8'); gr.addColorStop(0.65, '#5f7a8c'); gr.addColorStop(1, 'rgba(60,45,30,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(px, py, rx, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(px - rx * 0.2, py - ry * 0.25, rx * 0.4, ry * 0.3, 0, 3.4, 5.6); g.stroke();
    }
    for (let i = 0; i < 400; i++) { g.fillStyle = r() < 0.5 ? 'rgba(20,12,4,.3)' : 'rgba(150,110,70,.3)'; g.fillRect(r() * w, r() * h, 2, 2); }
  });
}
function clayTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = mulberry32(9);
    g.fillStyle = '#93663a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = r() < 0.5 ? 'rgba(70,45,22,.35)' : 'rgba(190,145,90,.28)'; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 30, 3 + r() * 8, r() * 3, 0, TAU); g.fill(); }
    g.lineCap = 'round';
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.2})`; g.lineWidth = 2 + r() * 3; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y + (r() - 0.5) * 12, x + 50 + r() * 30, y + (r() - 0.5) * 8); g.stroke(); }
    for (const fy of [0.34, 0.66]) { const gr = g.createLinearGradient(0, h * fy - 14, 0, h * fy + 14); gr.addColorStop(0, 'rgba(40,24,10,0)'); gr.addColorStop(0.5, 'rgba(40,24,10,.35)'); gr.addColorStop(1, 'rgba(40,24,10,0)'); g.fillStyle = gr; g.fillRect(0, h * fy - 14, w, 28); }
  });
}
export function barkTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const r = mulberry32(3);
    g.fillStyle = '#6b4a2e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.strokeStyle = r() < 0.5 ? 'rgba(40,24,10,.6)' : 'rgba(150,110,70,.4)'; g.lineWidth = 1 + r() * 3; const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 8, h); g.stroke(); }
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(90,150,60,.55)'; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 8, 3 + r() * 3, 0, 0, TAU); g.fill(); }
  }, { repeat: [3, 1] });
}
export function ringsTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d9b27a'; g.fillRect(0, 0, w, h);
    for (let i = 1; i < 9; i++) { g.strokeStyle = i % 2 ? '#a9763e' : '#c79a5e'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, i * 7, 0, TAU); g.stroke(); }
    g.fillStyle = '#7a4a22'; g.beginPath(); g.arc(w / 2, h / 2, 4, 0, TAU); g.fill();
  });
}

// ---------- lint: een strook weg ----------
function ribbon(x0, x1, w, map, { uRep = 4, vRep = 4, yoff = 0.05, camber = 0.06, uOnly = false, rough = 0.95, metal = 0 } = {}) {
  const n = Math.max(2, Math.round((x1 - x0) / 1.2));
  const g = new THREE.PlaneGeometry(x1 - x0, w, n, 6);
  g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, 0);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, roadY(x) + yoff + camber * (1 - (z / (w / 2)) ** 2));
    uv.setXY(i, uv.getX(i) * (x1 - x0) / uRep, uOnly ? uv.getY(i) : uv.getY(i) * w / vRep);
  }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: metal }));
  m.receiveShadow = true;
  return m;
}

// ---------- instanced helpers ----------
function instanced(geo, material, items, { cast = true } = {}) {
  const im = new THREE.InstancedMesh(geo, material, items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
  items.forEach((it, i) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
    p.set(it.x, it.y, it.z);
    if (typeof it.s === 'number') s.set(it.s, it.s, it.s); else s.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    m4.compose(p, q, s); im.setMatrixAt(i, m4);
    if (it.c !== undefined) { c.set(it.c); im.setColorAt(i, c); }
  });
  im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false;
  return im;
}

function fenceRun(scene, x0, x1, z, rng, gaps = []) {
  const posts = [], rails = [];
  const step = 1.3;
  for (let x = x0; x <= x1; x += step) {
    if (gaps.some(([a, b]) => x > a && x < b)) continue;
    const y = groundY(x, z);
    posts.push({ x, y: y + 0.5, z, sx: 1, sy: 1, sz: 1, ry: rng() * 0.3, rz: (rng() - 0.5) * 0.08 });
    if (!gaps.some(([a, b]) => x + step > a && x < b)) {
      const y2 = groundY(x + step / 2, z);
      const dy = groundY(x + step, z) - y;
      rails.push({ x: x + step / 2, y: y2 + 0.7, z, rz: Math.atan2(dy, step), s: 1 }, { x: x + step / 2, y: y2 + 0.32, z, rz: Math.atan2(dy, step), s: 1 });
    }
  }
  const wood = mat(0x9b7348);
  scene.add(instanced(new THREE.BoxGeometry(0.16, 1.0, 0.16), wood, posts));
  scene.add(instanced(new THREE.BoxGeometry(step + 0.02, 0.1, 0.07), mat(0xb08856), rails));
}

export function buildWorld(ctx, rng) {
  const { scene, fx } = ctx;
  const anim = [];
  const world = { anim, butterflies: [], smoke: [], npcs: {}, flames: [] };

  // ---- terrein ----
  {
    const W = 200, D = 100;
    const g = new THREE.PlaneGeometry(W, D, 100, 50);
    g.rotateX(-Math.PI / 2); g.translate(45, 0, 0);
    const pos = g.attributes.position, uv = g.attributes.uv; const cols = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = groundY(x, z); pos.setY(i, y);
      let v = 0.82 + 0.3 * clamp(fbm(x * 0.1, z * 0.1) + 0.5, 0, 1);
      let r = v, gg = v, b = v;
      const hh = y - roadY(x);
      if (hh > 6) { const k = clamp((hh - 6) / 10, 0, 0.5); r += k * 0.1; gg -= k * 0.05; b += k * 0.12; }
      // modderige randen bij het modderstuk
      const near = smoothstep(11, 5, Math.abs(z)) * smoothstep(34, 28, x);
      r += near * 0.35; gg -= near * 0.28; b -= near * 0.4;
      // sneeuwklokjes... niet: lichter gras bovenop de heuvel
      cols[i * 3] = r; cols[i * 3 + 1] = gg; cols[i * 3 + 2] = b;
      uv.setXY(i, uv.getX(i) * W / 6, uv.getY(i) * D / 6);
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    g.computeVertexNormals();
    const t = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex.grass(1, 1), vertexColors: true, roughness: 1 }));
    t.receiveShadow = true; scene.add(t);
  }

  // ---- weg ----
  scene.add(ribbon(-14, 31, ROAD_W, mudTexture(), { uRep: ROAD_W, uOnly: true, rough: 0.55, metal: 0.05, yoff: 0.03 }));
  scene.add(ribbon(30.9, S3A + 1, ROAD_W, tex.dirt(1, 1), { uRep: 4, vRep: 4 }));
  scene.add(ribbon(S3A, S3B + 0.4, ROAD_W, clayTexture(), { uRep: ROAD_W, uOnly: true, rough: 0.28, metal: 0.05, yoff: 0.045 }));
  scene.add(ribbon(S3B, 125, ROAD_W + 1.2, tex.cobble(1, 1), { uRep: 3.5, vRep: 3.5, yoff: 0.06 }));
  // plassen als glimmende vlakken (alleen decor)
  const puddleM = new THREE.MeshStandardMaterial({ color: 0x6d8ea3, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.85 });
  world.puddles = [];
  for (let i = 0; i < 9; i++) {
    const x = 3 + i * 3.2 + rng() * 1.5, z = (rng() - 0.5) * 6;
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.6 + rng() * 0.8, 14), puddleM);
    p.rotation.x = -Math.PI / 2; p.scale.set(1.6, 1, 0.8 + rng() * 0.5); p.position.set(x, roadY(x) + 0.075, z); p.receiveShadow = true; scene.add(p);
    world.puddles.push(p);
  }

  // glibberige plekken op de helling
  const slickM = new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.4, depthWrite: false });
  world.slicks = [];
  for (let i = 0; i < 16; i++) {
    const x = S3A + 2 + i * 1.7 + rng() * 1.2, z = (rng() - 0.5) * 6.4;
    const g = new THREE.CircleGeometry(0.8 + rng() * 0.9, 14); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, slickM); m.scale.set(1.9, 1, 1 + rng() * 0.5); m.position.set(x, roadY(x) + 0.1, z); m.rotation.z = Math.atan(roadSlope(x)); m.receiveShadow = true;
    scene.add(m); world.slicks.push(m);
  }

  // ---- bomen (instanced) ----
  const trunks = [], round = [], round2 = [], cones = [], cones2 = [];
  const leafCols = [0x3f9e3a, 0x4aa844, 0x378f3a, 0x58b04a, 0x2f8a46];
  const pineCols = [0x2c7a4b, 0x2f8556, 0x276f44];
  const treeSpots = [];
  for (let x = -34; x < 130; x += 3.4 + rng() * 2) {
    for (const zs of [-1]) {
      const z = -9.5 - rng() * 22;
      treeSpots.push([x + rng() * 2, z]);
    }
    if (rng() < 0.5) treeSpots.push([x + rng() * 3, -10 - rng() * 6]);
  }
  for (const [x, z] of treeSpots) {
    const y = groundY(x, z); const s = 0.7 + rng() * 0.75;
    const pine = rng() < 0.4;
    trunks.push({ x, y: y + 1.2 * s, z, sx: s, sy: s, sz: s });
    if (pine) {
      const c = pineCols[Math.floor(rng() * 3)];
      for (let k = 0; k < 3; k++) cones.push({ x, y: y + (2.0 + k * 1.35) * s, z, s: s * (2.0 - k * 0.5), c });
    } else {
      const c = leafCols[Math.floor(rng() * leafCols.length)];
      round.push({ x, y: y + 3.4 * s, z, s: s * 1.9, c, ry: rng() * 3 });
      round2.push({ x: x + s * 0.9, y: y + 2.7 * s, z: z + s * 0.4, s: s * 1.3, c, ry: rng() * 3 });
    }
  }
  scene.add(instanced(new THREE.CylinderGeometry(0.25, 0.38, 2.6, 6), mat(0x6b4a2e), trunks));
  scene.add(instanced(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff), round));
  scene.add(instanced(new THREE.IcosahedronGeometry(1, 0), mat(0xffffff), round2));
  scene.add(instanced(new THREE.ConeGeometry(1, 1.8, 7), mat(0xffffff), cones));

  // verre bergen
  const mts = [];
  for (let i = 0; i < 10; i++) mts.push({ x: -30 + i * 18 + rng() * 6, y: 10 + rng() * 6, z: -105 - rng() * 12, sx: 1, sy: 1, sz: 1, s: 1, c: i % 2 ? 0x8fa6c4 : 0x9db4cc });
  mts.forEach((m) => { m.sx = 22 + rng() * 12; m.sy = 30 + rng() * 14; m.sz = m.sx; m.y = m.sy * 0.5 - 4; });
  scene.add(instanced(new THREE.ConeGeometry(1, 1, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, fog: true }), mts, { cast: false }));

  // ---- struiken / stenen / bloemen langs de weg (laag, zodat het zicht vrij blijft) ----
  const bushes = [], rocks = [], flowerHeads = [], stems = [];
  for (let x = -14; x < 118; x += 2.2 + rng() * 2.5) {
    for (const side of [-1, 1]) {
      if (rng() < 0.45) continue;
      const z = side * (6.2 + rng() * 6);
      if (side > 0 && Math.abs(z) < 6.8) continue;
      const y = groundY(x, z);
      if (rng() < 0.5) bushes.push({ x, y: y + 0.4, z, s: 0.5 + rng() * 0.5, c: leafCols[Math.floor(rng() * 5)], sy: 0.8 });
      else rocks.push({ x, y: y + 0.2, z, s: 0.35 + rng() * 0.6, c: [0x8a8c94, 0x9a9ca4, 0x7d8088][Math.floor(rng() * 3)], ry: rng() * 3, sy: 0.6 });
    }
  }
  scene.add(instanced(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff), bushes));
  scene.add(instanced(new THREE.DodecahedronGeometry(1, 0), mat(0xffffff), rocks));
  const fcol = [0xff6fa5, 0xffe14a, 0xffffff, 0x8fb8ff, 0xff9a3a];
  for (let i = 0; i < 260; i++) {
    const x = -16 + rng() * 130, side = rng() < 0.5 ? -1 : 1; const z = side * (5.4 + rng() * 9);
    if (x > S3A - 2 && x < S3B + 2 && Math.abs(z) < 7) continue;
    const y = groundY(x, z);
    stems.push({ x, y: y + 0.15, z, sy: 1, s: 1 });
    flowerHeads.push({ x, y: y + 0.34, z, s: 0.1 + rng() * 0.06, c: fcol[Math.floor(rng() * fcol.length)] });
  }
  scene.add(instanced(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), mat(0x3b8a3a), stems, { cast: false }));
  scene.add(instanced(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), flowerHeads, { cast: false }));

  // paddenstoelen en nog wat kleur
  for (let i = 0; i < 9; i++) { const x = -8 + i * 13 + rng() * 5; const z = (rng() < 0.5 ? -1 : 1) * (5.8 + rng() * 2); const m = P.mushroom(0.9 + rng() * 0.6, [0xe03a3a, 0xf0a030, 0xd85aa8][i % 3]); m.position.set(x, groundY(x, z), z); scene.add(m); }

  // hekken
  fenceRun(scene, -12, 28, -5.8, rng);
  fenceRun(scene, -12, 30, 6.4, rng, [[6, 10], [20, 24]]);
  fenceRun(scene, 38, 70, -5.6, rng, [[52, 54]]);
  fenceRun(scene, 40, 70, 6.2, rng, [[48, 52], [60, 63]]);
  fenceRun(scene, 70, 76, -5.8, rng); fenceRun(scene, 70, 76, 6.2, rng);

  // ---- wolken ----
  world.clouds = [];
  for (let i = 0; i < 9; i++) { const c = P.cloud(1.6 + rng() * 1.5); c.position.set(-20 + i * 16 + rng() * 6, 38 + rng() * 14, -60 - rng() * 30); scene.add(c); world.clouds.push(c); }

  // ---- start: schuur, hooibalen, bord ----
  {
    const shed = P.houseSimple(7, 6, 3.4, { wall: '#d9c39a', roof: '#8a5a3a', thatch: true });
    shed.position.set(-17, groundY(-17, -11), -11); shed.rotation.y = 0.35; scene.add(shed);
    const sign = P.signpost(['Dorp ->', 'Modderpad']); sign.position.set(-6, 0, 5.4); sign.rotation.y = -0.4; scene.add(sign);
    for (const [x, z] of [[-9, -5], [-10.4, -4.6], [-9.6, -5.2]]) { const b = mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.0, 10), mat(0xd9b84a), { pos: [x, 0.5, z], rot: [Math.PI / 2, 0, 0.3] }); scene.add(b); }
    const b1 = P.barrel(); b1.position.set(-8, 0, 6.6); scene.add(b1);
    const koen = makeNPC('carter'); koen.group.position.set(-6.5, 0, -2.4); koen.group.rotation.y = 1.2; koen.targetYaw = 1.2; koen.pose = 'point'; scene.add(koen.group);
    world.npcs.koen = koen;
  }

  // ---- boomstam-omgeving: hinge-stronk, derrick-katrol ----
  // (de stam zelf wordt in mudcart.js gebouwd zodat die kan bewegen)
  {
    const stump = mesh(new THREE.CylinderGeometry(0.95, 1.2, 1.4, 9), new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 1, flatShading: true }), { pos: [LOG_X, 0.7, -5.2] });
    scene.add(stump);
    scene.add(mesh(new THREE.CylinderGeometry(0.97, 0.97, 0.06, 9), new THREE.MeshStandardMaterial({ map: ringsTexture() }), { pos: [LOG_X, 1.42, -5.2], cast: false }));
    const t = P.tree(7.5); t.position.set(LOG_X - 5, groundY(LOG_X - 5, -7), -7); scene.add(t);
    const t2 = P.tree(6.5); t2.position.set(LOG_X + 7, groundY(LOG_X + 7, -7.5), -7.5); scene.add(t2);
    const r1 = P.rock(1.4); r1.position.set(LOG_X + 3.2, 0, 5.8); scene.add(r1);
    const r2 = P.rock(0.9); r2.position.set(LOG_X - 8, 0, -4.5); scene.add(r2);
  }

  // ---- helling: waarschuwingsborden, bloemen, takken ----
  {
    const w1 = P.signpost(['GLAD!']); w1.position.set(S3A - 1.5, 0, 5.3); w1.rotation.y = -0.35; scene.add(w1);
    const w2 = P.signpost(['Dorp 40m']); w2.position.set(S3B - 6, roadY(S3B - 6), 5.5); w2.rotation.y = -0.3; scene.add(w2);
    for (let i = 0; i < 6; i++) { const x = S3A + 3 + i * 4.6; const b = P.barrel(0.8); b.position.set(x, roadY(x), (i % 2 ? 5.3 : -5.1)); scene.add(b); }
  }

  // ---- de dorpspoort ----
  const gate = new THREE.Group(); gate.position.set(GATE_X, roadY(GATE_X), 0); gate.scale.setScalar(0.8); scene.add(gate);
  {
    const stone = new THREE.MeshStandardMaterial({ map: tex.stone(2, 3), roughness: 0.95, flatShading: true });
    for (const sz of [-1, 1]) {
      const pil = mesh(new THREE.BoxGeometry(3, 8.5, 3.2), stone, { pos: [0, 4.25, sz * 4.2] }); gate.add(pil);
      for (let k = 0; k < 3; k++) gate.add(mesh(new THREE.BoxGeometry(1, 0.9, 1), stone, { pos: [-1 + k * 1, 9, sz * 4.2 + (k - 1) * 1.05] }));
      const tw = mesh(new THREE.ConeGeometry(2.4, 3.6, 8), mat(0x3b58a8), { pos: [0.0, 11, sz * 4.2 + 6 * 0], scale: [1, 1, 1] }); tw.position.set(0, 10.4, sz * 4.2); gate.add(tw);
      // vlag
      const flag = P.banner(sz > 0 ? 0xd8372c : 0x2f6fe0, 2.6, 1.2); flag.position.set(1.7, 7.4, sz * 4.2); flag.rotation.y = Math.PI / 2; flag.scale.setScalar(0.8); gate.add(flag); anim.push((t) => P.animateBanner(flag, t));
      // fakel
      const torch = new THREE.Group(); torch.position.set(-1.9, 2.6, sz * 3.4);
      torch.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 6), mat(0x5b3d24), { pos: [0, 0.65, 0] }));
      const fl = mesh(new THREE.ConeGeometry(0.2, 0.55, 6), new THREE.MeshBasicMaterial({ color: 0xffa020 }), { cast: false, pos: [0, 1.5, 0] }); torch.add(fl);
      const fl2 = mesh(new THREE.ConeGeometry(0.11, 0.38, 6), new THREE.MeshBasicMaterial({ color: 0xffe070 }), { cast: false, pos: [0, 1.45, 0] }); torch.add(fl2);
      gate.add(torch); world.flames.push(fl, fl2);
    }
    // boog + bovenbouw
    const arch = mesh(new THREE.TorusGeometry(3.5, 0.55, 8, 18, Math.PI), stone, { pos: [0, 5.6, 0], rot: [0, Math.PI / 2, 0] }); gate.add(arch);
    gate.add(mesh(new THREE.BoxGeometry(2.4, 3.2, 12.6), stone, { pos: [0, 8.3, 0] }));
    for (let k = -3; k <= 3; k++) gate.add(mesh(new THREE.BoxGeometry(1.2, 0.9, 1.2), stone, { pos: [0, 10.35, k * 1.8] }));
    const board = mesh(new THREE.BoxGeometry(0.3, 2.0, 7.2), new THREE.MeshStandardMaterial({ map: tex.sign('Welkom in\nZonnebeek', { w: 512, h: 128, size: 40, bg: '#6b3f1c' }), roughness: 0.9 }), { pos: [-1.35, 8.3, 0] });
    // het bord moet naar -x kijken: plaat draaien
    board.geometry = new THREE.PlaneGeometry(7.2, 2.0); board.rotation.y = -Math.PI / 2; board.position.set(-1.25, 8.3, 0); gate.add(board);
    // deuren (scharnieren links en rechts)
    world.doors = [];
    for (const sz of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0.2, 0, sz * 3.1);
      const leaf = mesh(new THREE.BoxGeometry(0.25, 5.1, 3.1), new THREE.MeshStandardMaterial({ map: tex.planks(1, 2, '#7a4a26'), roughness: 0.9 }), { pos: [0, 2.6, -sz * 1.55] });
      pivot.add(leaf);
      for (const y of [1.2, 3.9]) pivot.add(mesh(new THREE.BoxGeometry(0.3, 0.2, 3.0), mat(0x333338, { metalness: 0.5 }), { pos: [0, y, -sz * 1.55] }));
      gate.add(pivot); world.doors.push({ pivot, sz });
    }
  }
  world.gate = gate;

  // ---- het dorp erachter ----
  {
    const wall = ['#f6e7c8', '#e8d6a8', '#d8e2c4', '#f0d8c0'];
    const roof = ['#b5483a', '#3b58a8', '#8a5a3a', '#a8443a'];
    let k = 0;
    for (let x = GATE_X + 10; x < GATE_X + 46; x += 9.5) {
      for (const sz of [-1, 1]) {
        const w = 6 + (k % 3), hh = 3.4 + (k % 2) * 0.8;
        const h = P.houseSimple(w, 6, hh, { wall: wall[(k + 1) % 4], roof: roof[k % 4], thatch: k % 5 === 2 });
        const hx = x + (sz > 0 ? 2.5 : 0), hz = sz * (12 + (k % 3));
        h.position.set(hx, roadY(hx), hz); h.rotation.y = sz > 0 ? Math.PI : 0; scene.add(h);
        world.smoke.push([hx + 1.5, roadY(hx) + hh + 4.2, hz - sz * 1.0]);
        k++;
      }
    }
    const wm = P.windmill(1.3); wm.position.set(GATE_X + 28, roadY(GATE_X), -32); scene.add(wm); world.windmill = wm;
    const tw = P.tower(18, 3.2); tw.position.set(GATE_X + 22, roadY(GATE_X), 36); scene.add(tw);
    const wl = P.well(); wl.position.set(GATE_X + 16, roadY(GATE_X), -7); scene.add(wl);
    for (let i = 0; i < 6; i++) { const l = P.lampPost(); l.position.set(GATE_X + 8 + i * 8, roadY(GATE_X), (i % 2 ? 5.6 : -5.6)); scene.add(l); }
    for (const [i, kind] of ['guard', 'guard', 'baker', 'kid', 'elder', 'princess', 'farmer', 'dwarf'].entries()) {
      const n = makeNPC(kind);
      const gx = GATE_X + 7 + (i % 4) * 2.2, gz = (i < 4 ? -1 : 1) * (i % 2 ? 3.4 : 5.2) * (i === 0 || i === 1 ? 0.9 : 1);
      n.group.position.set(i < 2 ? GATE_X + 3 : gx, roadY(GATE_X), i < 2 ? (i ? 3.9 : -3.9) : gz); n.targetYaw = n.yaw = -Math.PI / 2 + (rng() - 0.5) * 0.5; n.pose = i % 2 ? 'wave' : 'idle';
      scene.add(n.group); (world.crowd ||= []).push(n);
    }
  }

  // vlinders
  for (let i = 0; i < 7; i++) { const b = new Butterfly([0xff9ad5, 0xffe14a, 0x9ad5ff][i % 3]); b.group.position.set(i * 14 - 5, 1.5, (i % 2 ? 1 : -1) * (6 + (i % 3))); b.home = b.group.position.clone(); b.ph = i * 1.7; scene.add(b.group); world.butterflies.push(b); }

  world.update = (t, dt, camX) => {
    for (const f of anim) f(t);
    if (world.windmill) world.windmill.userData.blades.rotation.z += dt * 0.6;
    for (const c of world.clouds) { c.position.x += dt * 0.6; if (c.position.x > 150) c.position.x = -50; }
    for (const b of world.butterflies) {
      b.update(dt); const a = b.ph + t * 0.6;
      b.group.position.set(b.home.x + Math.sin(a) * 3.5, b.home.y + 0.5 * Math.sin(t * 2 + b.ph), b.home.z + Math.cos(a * 1.3) * 2);
      b.group.rotation.y = a;
    }
    const fs = 1 + Math.sin(t * 13) * 0.14; for (const f of world.flames) f.scale.set(1, fs, 1);
    for (const n of world.crowd || []) n.update(dt);
    if (world.npcs.koen) world.npcs.koen.update(dt);
    if (camX > 50 && Math.random() < dt * 5) { const s = world.smoke[Math.floor(Math.random() * world.smoke.length)]; if (s) fx.particles.emit(s[0], s[1], s[2], 0.4, 1.0, 0.1, { life: 2.2, size: 1.3, color: 0xdddddd, gravity: -0.1 }); }
  };
  return world;
}
