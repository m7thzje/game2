import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, TAU, mulberry32 } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { makeDeurman } from '../engine/chars.js';
import { mergeStatic } from '../world/merge.js';

// Wereld van "Boogschieten-Battle": toernooiveld voor een kasteel, schietbanen, doelen, tribune met toeschouwers, wind-vlaggen.
// Alle schietcoördinaten leven in één "doelvlak" (x = zijwaarts, y = hoogte) op z = ZT; bonusdoelen (ballonnen, kip, draak) op z = ZB.

export const AX = [-6.5, 6.5];        // x van de schutters
export const ZA = 1.6;                // z van de schutters
export const TXC = [-7, 7];           // x van de doelen (midden)
export const TY = 3.9;                // hoogte doel-midden
export const TR = 2.8;                // straal doelschijf
export const ZT = -20, ZB = -16.5;    // doelvlak, bonusvlak
export const RINGS = [[0.18, 10, 'BULLSEYE'], [0.36, 8, 'GOED'], [0.58, 6, ''], [0.78, 4, ''], [1.0, 2, '']];

// ---- samengevoegde pijl (één mesh met vertexkleuren) ----
export function mergeColored(parts) {
  let tot = 0; const gs = parts.map(([geo, color, m]) => { const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m); tot += g.attributes.position.count; return [g, new THREE.Color(color)]; });
  const pos = new Float32Array(tot * 3), nor = new Float32Array(tot * 3), col = new Float32Array(tot * 3); let o = 0;
  for (const [g, c] of gs) { const n = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; } o += n; g.dispose(); }
  const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3)); mg.computeBoundingSphere(); return mg;
}
export function arrowGeometry() {
  const parts = [];
  parts.push([new THREE.CylinderGeometry(0.04, 0.04, 1.5, 6).rotateX(Math.PI / 2), 0xd6a860]);
  parts.push([new THREE.ConeGeometry(0.11, 0.34, 6).rotateX(Math.PI / 2).translate(0, 0, 0.9), 0xb8bec6]);
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Matrix4().makeRotationZ(k * TAU / 3);
    parts.push([new THREE.BoxGeometry(0.03, 0.34, 0.4).translate(0, 0.17, -0.58), k === 0 ? 0xe8403a : 0xffffff, m]);
  }
  return mergeColored(parts);
}

function targetTexture() {
  return canvasTex(512, 512, (g, w, h) => {
    const cx = w / 2, cy = h / 2, R = w / 2 - 2;
    const cols = ['#f6f1e6', '#1d1d22', '#2d7fe0', '#e23b30', '#ffd23f'];
    const rad = [1, 0.78, 0.58, 0.36, 0.18];
    rad.forEach((r, i) => { g.fillStyle = cols[i]; g.beginPath(); g.arc(cx, cy, R * r, 0, TAU); g.fill(); g.strokeStyle = i === 1 ? '#aaa' : '#222'; g.lineWidth = 3; g.stroke(); });
    g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 14, cy); g.lineTo(cx + 14, cy); g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 14); g.stroke();
  });
}
const cloudTex = () => canvasTex(128, 128, (g) => {
  for (let i = 0; i < 14; i++) { const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 22 + Math.random() * 18; const gr = g.createRadialGradient(x, y, 2, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(235,235,245,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
});
function nameTex(name, css) {
  return canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 60px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(20,10,30,.9)'; c.lineJoin = 'round'; c.strokeText(name, w / 2, hh / 2); c.fillStyle = css; c.fillText(name, w / 2, hh / 2); });
}

// ---- doel (met paal, hooibaal, naamsbord, rookwolk) ----
export function makeTarget(i, name, css, color) {
  const root = new THREE.Group(); const T = { root, puffs: [], pole: null };
  root.add(mesh(new THREE.CylinderGeometry(TR * 1.08, TR * 1.08, 0.8, 22).rotateX(Math.PI / 2), mat(0xd9b45a, { roughness: 1 }), { pos: [0, 0, -0.45] }));
  const faceM = new THREE.MeshStandardMaterial({ map: targetTexture(), roughness: 0.9 });
  root.add(mesh(new THREE.CircleGeometry(TR, 40), faceM, { cast: false, pos: [0, 0, 0.03] }));
  root.add(mesh(new THREE.TorusGeometry(TR * 1.03, 0.16, 6, 36), mat(0x6b4a2e), { cast: false, pos: [0, 0, 0.05] }));
  // gekleurde rand-ring in spelerskleur
  root.add(mesh(new THREE.TorusGeometry(TR * 1.2, 0.1, 6, 36), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }), { cast: false, pos: [0, 0, 0.0] }));
  T.pole = mesh(new THREE.BoxGeometry(0.5, 1, 0.5), mat(0x7a5230), { pos: [0, -3, -0.5] }); root.add(T.pole);
  const lbl = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex(name, css), transparent: true, depthTest: false })); lbl.scale.set(3.6, 1.35, 1); lbl.position.set(0, TR + 1.35, 0.3); lbl.renderOrder = 12; root.add(lbl);
  // rookwolk (voor de plof-pijl)
  const ct = cloudTex();
  for (let k = 0; k < 7; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, opacity: 0 })); sp.renderOrder = 11;
    const a = k / 7 * TAU; sp.userData = { ox: Math.cos(a) * (k ? 1.5 : 0), oy: Math.sin(a) * (k ? 1.3 : 0), ph: k * 1.3, base: 4.4 + (k % 2) * 0.8 };
    root.add(sp); T.puffs.push(sp);
  }
  T.setSmoke = (v, t) => { for (const sp of T.puffs) { const u = sp.userData; sp.material.opacity = clamp(v, 0, 1) * 0.97; const s = u.base * (0.6 + 0.4 * clamp(v * 2, 0, 1)) * (1 + Math.sin(t * 2 + u.ph) * 0.05); sp.scale.set(s, s, 1); sp.position.set(u.ox + Math.sin(t * 1.3 + u.ph) * 0.2, u.oy + Math.cos(t * 1.1 + u.ph) * 0.15, 0.5); sp.visible = v > 0.01; } };
  T.setSmoke(0, 0);
  return T;
}

// ---- boog (geheel in wereldcoördinaten bestuurd; +z van de rig = schietrichting) ----
export function makeBow(color) {
  const rig = new THREE.Group(); const bow = new THREE.Group(); bow.rotation.y = -Math.PI / 2; rig.add(bow);
  const wood = mat(0x8a5a2b, { flatShading: false });
  bow.add(mesh(new THREE.TorusGeometry(1.15, 0.07, 6, 18, Math.PI).rotateZ(-Math.PI / 2), wood, { cast: false }));
  bow.add(mesh(new THREE.BoxGeometry(0.16, 0.5, 0.16), mat(color, { flatShading: false }), { cast: false }));
  const string = mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.3, 4), mat(0xf4f0e0), { cast: false, pos: [0, 0, 0] }); bow.add(string);
  const nock = new THREE.Group(); rig.add(nock);    // pijl-houder, schuift naar achteren bij het spannen
  return { rig, bow, string, nock };
}

export function buildWorld(ctx, L) {
  const { scene, fx } = ctx; const rng = mulberry32(2024);
  const W = { crowd: null, flags: [], clouds: [], bannerList: [] };
  const first = scene.children.length;
  // grond + gemaaide banen
  const grass = tex.grass(40, 28);
  scene.add(mesh(new THREE.PlaneGeometry(260, 190), new THREE.MeshStandardMaterial({ map: grass, color: 0xbfe39a, roughness: 1 }), { cast: false, pos: [0, 0, -40], rot: [-Math.PI / 2, 0, 0] }));
  const lane = new THREE.MeshStandardMaterial({ map: tex.grass(3, 8), color: 0xe8ffb8, roughness: 1 });
  for (const x of TXC) scene.add(mesh(new THREE.PlaneGeometry(6.2, 28), lane, { cast: false, pos: [x * 0.95, 0.02, -8.5], rot: [-Math.PI / 2, 0, 0] }));
  // schietlijn + platforms
  for (const x of AX) { scene.add(mesh(new THREE.BoxGeometry(4, 0.3, 3.4), new THREE.MeshStandardMaterial({ map: tex.planks(2, 1), roughness: 0.9 }), { pos: [x, 0.15, ZA] })); }
  scene.add(mesh(new THREE.BoxGeometry(30, 0.04, 0.2), mat(0xffffff), { cast: false, pos: [0, 0.03, ZA - 2.2] }));
  // afstandsmarkering op de baan
  for (const x of TXC) for (const z of [-4, -10, -15]) scene.add(mesh(new THREE.BoxGeometry(3.6, 0.03, 0.12), mat(0xffffff), { cast: false, pos: [x * 0.95, 0.04, z] }));
  // hooi-achterwand + hek achter de doelen
  const fenceZ = ZT - 3.2;
  for (let k = -9; k <= 9; k++) { const f = P.fence(3, 1.1); f.position.set(k * 3, 0, fenceZ); scene.add(f); }
  for (let k = 0; k < 7; k++) { const b = mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12).rotateZ(Math.PI / 2), mat(0xd9b45a), { pos: [-20 + k * 6.7 + (k % 2) * 0.8, 0.7, fenceZ + 0.9] }); scene.add(b); }
  // tribunes met toeschouwers (geïnstancet)
  const plank = new THREE.MeshStandardMaterial({ map: tex.planks(10, 1), roughness: 0.95, color: 0xd8b890 });
  const tiers = [[-27, 1.0], [-29.3, 2.0], [-31.6, 3.0]];
  for (const [z, y] of tiers) scene.add(mesh(new THREE.BoxGeometry(60, y, 2.3), plank, { cast: false, pos: [0, y / 2, z] }));
  // dak/pavilioen-wimpels
  const bunt = [0xe5484d, 0xffd23f, 0x3a78e0, 0x6bd86b, 0xff8fc8];
  for (let k = 0; k < 26; k++) { const x = -24 + k * 1.85; const y = 9.2 - Math.sin((k / 25) * Math.PI) * -0 - Math.sin(k / 25 * Math.PI) * 1.4 + 1.4; scene.add(mesh(new THREE.ConeGeometry(0.55, 1.1, 3).rotateZ(Math.PI), mat(bunt[k % 5]), { cast: false, pos: [x, y, -25.5] })); }
  for (const x of [-24.5, 24.5]) scene.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 11, 6), mat(0x6b4a2e), { pos: [x, 5.5, -25.5] }));
  // vlaggen op het veld (laten de wind zien)
  for (const x of [-12.5, 0, 12.5]) {
    const b = P.banner(x === 0 ? 0xffd23f : 0xe5484d, 3.4, 1.8); b.position.set(x, 0, ZT + 1.6); scene.add(b); W.flags.push(b);
  }
  // kasteel op de achtergrond
  const wallM = new THREE.MeshStandardMaterial({ map: tex.stone(12, 2), roughness: 0.95, flatShading: true, color: 0xcfc6bd });
  scene.add(mesh(new THREE.BoxGeometry(110, 11, 4), wallM, { cast: false, pos: [0, 5.5, -64] }));
  for (let k = -26; k <= 26; k++) scene.add(mesh(new THREE.BoxGeometry(1.4, 1.5, 1.6), wallM, { cast: false, pos: [k * 2.1, 11.75, -64] }));
  for (const [x, h] of [[-38, 22], [-16, 17], [16, 17], [38, 22], [0, 26]]) {
    const t = P.tower(h, 3.4); t.position.set(x, 0, x === 0 ? -68 : -63); scene.add(t);
    const bn = P.banner(x % 2 ? 0x3a78e0 : 0xe5484d, 3, 1.5); bn.position.set(x, h + 5.3, x === 0 ? -68 : -63); scene.add(bn); W.bannerList.push(bn);
  }
  scene.add(mesh(new THREE.BoxGeometry(9, 9, 3), mat(0x4a3a2a), { cast: false, pos: [0, 4.5, -61.6] }));
  // heuvels, bergen, bomen
  const hillM = [mat(0x7cc060, { flatShading: false }), mat(0x68b050, { flatShading: false })];
  [[-70, -80, 34], [60, -86, 40], [-20, -95, 30], [20, -110, 44], [-95, -60, 28], [100, -50, 30]].forEach(([x, z, r], i) => scene.add(mesh(new THREE.SphereGeometry(r, 16, 10), hillM[i % 2], { cast: false, receive: false, pos: [x, -r * 0.62, z], scale: [1.5, 0.8, 1] })));
  [[-110, -130, 32], [-40, -140, 40], [50, -145, 36], [115, -120, 30]].forEach(([x, z, r]) => { scene.add(mesh(new THREE.ConeGeometry(r, r * 1.5, 7), mat(0x8a9ac0), { cast: false, receive: false, pos: [x, r * 0.75, z] })); scene.add(mesh(new THREE.ConeGeometry(r * 0.38, r * 0.6, 7), mat(0xffffff), { cast: false, receive: false, pos: [x, r * 1.25, z] })); });
  for (let k = 0; k < 34; k++) {
    const side = k % 2 ? 1 : -1, x = side * (27 + rng() * 26), z = -rng() * 55 + 6;
    const t = rng() < 0.5 ? P.pine(5 + rng() * 4, 0x2c7a4b) : P.tree(5 + rng() * 3, rng() < 0.5 ? 0x4aa83a : 0x6cbc3a);
    t.position.set(x, 0, z); t.rotation.y = rng() * 6; scene.add(t);
  }
  for (let k = 0; k < 22; k++) { const b = P.bush(0.8 + rng() * 0.8); b.position.set((rng() - 0.5) * 70, 0, -22 - rng() * 3 + (k % 3)); if (Math.abs(b.position.x) < 20 && b.position.z > fenceZ - 0.5) b.position.x += 22 * Math.sign(b.position.x || 1); scene.add(b); }
  for (let k = 0; k < 16; k++) { const f = P.flowerPatch([0xff6fa5, 0xffe14a, 0xffffff, 0xb06bff][k % 4], 6, 1); f.position.set((rng() - 0.5) * 40, 0.02, -2 - rng() * 14); if (Math.abs(f.position.x) < 12) f.position.x += 14 * Math.sign(f.position.x || 1); scene.add(f); }
  mergeStatic(scene, first);

  // wolken (dynamisch)
  for (let k = 0; k < 7; k++) { const c = P.cloud(2 + rng() * 2); c.position.set(-80 + k * 28 + rng() * 10, 30 + rng() * 14, -70 - rng() * 40); scene.add(c); W.clouds.push({ c, v: 0.6 + rng() * 0.8 }); }

  // ---- toeschouwers (3 InstancedMeshes) ----
  const N = 66, body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.55, 1.15, 8), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
  const hat = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4, 0.7, 7), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
  const shirts = [0xe5484d, 0x3a78e0, 0xffd23f, 0x6bd86b, 0xb06bff, 0xff8f3a, 0xff8fc8, 0x58c8e8], skins = [0xf2c29b, 0xe0a47c, 0xf7d2ae, 0xc98a60, 0x7fbf4a];
  W.crowdData = [];
  let ci = 0; const cc = new THREE.Color();
  for (const [z, y] of tiers) for (let k = 0; k < 22; k++) {
    const x = -25.5 + k * 2.32 + (rng() - 0.5) * 0.6; body.setColorAt(ci, cc.setHex(shirts[Math.floor(rng() * shirts.length)])); head.setColorAt(ci, cc.setHex(skins[Math.floor(rng() * skins.length)])); hat.setColorAt(ci, cc.setHex(shirts[Math.floor(rng() * shirts.length)]));
    W.crowdData.push({ x, y: y + 0.6, z: z + 0.1, ph: rng() * 6, s: 0.85 + rng() * 0.35, hat: rng() < 0.55, cheer: 0 }); ci++;
  }
  for (const m of [body, head, hat]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); }
  W.crowd = { body, head, hat };
  const dm = new THREE.Object3D();
  W.updateCrowd = (t) => {
    W.crowdData.forEach((q, i) => {
      const hop = q.cheer > 0 ? Math.abs(Math.sin(t * 9 + q.ph)) * 0.7 : Math.abs(Math.sin(t * 1.5 + q.ph)) * 0.06;
      const y = q.y + hop, s = q.s;
      dm.position.set(q.x, y, q.z); dm.rotation.set(0, 0, q.cheer > 0 ? Math.sin(t * 7 + q.ph) * 0.12 : 0); dm.scale.set(s, s, s); dm.updateMatrix(); body.setMatrixAt(i, dm.matrix);
      dm.position.set(q.x, y + 0.95 * s, q.z); dm.updateMatrix(); head.setMatrixAt(i, dm.matrix);
      dm.position.set(q.x, y + 1.5 * s, q.z); dm.scale.set(q.hat ? s : 0.001, q.hat ? s : 0.001, q.hat ? s : 0.001); dm.updateMatrix(); hat.setMatrixAt(i, dm.matrix);
    });
    body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = hat.instanceMatrix.needsUpdate = true;
  };
  W.cheerCrowd = (secs, frac = 1) => { for (const q of W.crowdData) if (Math.random() < frac) q.cheer = secs * (0.6 + Math.random() * 0.8); };
  W.tickCrowd = (dt) => { for (const q of W.crowdData) q.cheer = Math.max(0, q.cheer - dt); };
  W.updateCrowd(0);

  // de Deurman, kijkt toe vanaf de bovenste tribune-rij
  const dman = makeDeurman(1.5); dman.group.position.set(18.2, 3.0, -31.2); dman.faceDir(0, 1); scene.add(dman.group); W.deurman = dman;

  // ---- wind-symbool ----
  const wc = document.createElement('canvas'); wc.width = 320; wc.height = 100; const wg = wc.getContext('2d');
  const wtex = new THREE.CanvasTexture(wc); wtex.colorSpace = THREE.SRGBColorSpace;
  const wspr = new THREE.Sprite(new THREE.SpriteMaterial({ map: wtex, transparent: true, depthTest: false })); wspr.scale.set(7.2, 2.25, 1); wspr.position.set(0, 11.3, ZT + 1); wspr.renderOrder = 14; scene.add(wspr);
  let lastW = 99;
  W.drawWind = (w) => {
    const q = Math.round(w * 2) / 2; if (q === lastW) return; lastW = q;
    wg.clearRect(0, 0, 320, 100);
    wg.fillStyle = 'rgba(20,24,50,.62)'; wg.beginPath(); wg.roundRect(6, 8, 308, 84, 22); wg.fill();
    wg.font = 'bold 26px Fredoka, Arial Black, sans-serif'; wg.fillStyle = '#cfe6ff'; wg.textAlign = 'left'; wg.textBaseline = 'middle'; wg.fillText('WIND', 24, 50);
    const n = Math.abs(q), dir = q >= 0 ? 1 : -1;
    wg.fillStyle = n > 2.2 ? '#ff9a6a' : n > 1 ? '#ffe14a' : '#9fffb0';
    if (n < 0.3) { wg.font = 'bold 30px Fredoka, Arial Black, sans-serif'; wg.fillText('windstil', 112, 52); }
    else for (let k = 0; k < Math.min(5, Math.ceil(n)); k++) { const x = 190 + dir * (k * 22 - 20) + (dir < 0 ? 30 : 0); wg.beginPath(); if (dir > 0) { wg.moveTo(x - 10, 34); wg.lineTo(x + 12, 50); wg.lineTo(x - 10, 66); } else { wg.moveTo(x + 10, 34); wg.lineTo(x - 12, 50); wg.lineTo(x + 10, 66); } wg.closePath(); wg.fill(); }
    wtex.needsUpdate = true;
  };
  W.drawWind(0);

  // ---- lichtjes: zachte zonnestralen/glinsters via deeltjes in update ----
  let leafT = 0;
  W.update = (t, dt, wind) => {
    for (const f of W.flags) { P.animateBanner(f, t); f.rotation.y = wind >= 0 ? 0 : Math.PI; const c = f.userData.cloth; if (c) c.scale.x = 0.35 + Math.min(1, Math.abs(wind) / 3) * 0.9; }
    for (const b of W.bannerList) P.animateBanner(b, t);
    for (const c of W.clouds) { c.c.position.x += c.v * dt * (1 + wind * 0.1); if (c.c.position.x > 110) c.c.position.x = -110; if (c.c.position.x < -110) c.c.position.x = 110; }
    leafT += dt * (3 + Math.abs(wind) * 3);
    while (leafT > 1) { leafT -= 1; fx.particles.emit((Math.random() - 0.5) * 36, 2 + Math.random() * 9, ZT + 3 + Math.random() * 18, wind * 1.6 + (Math.random() - 0.5) * 0.6, -0.3 - Math.random() * 0.4, (Math.random() - 0.5) * 0.4, { life: 4, size: 0.2, color: Math.random() < 0.6 ? 0xa8e05a : 0xffffff, gravity: 0.05, shrink: false }); }
    W.updateCrowd(t);
  };
  return W;
}
