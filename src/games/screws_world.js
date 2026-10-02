import * as THREE from 'three';
import { mat, mesh, canvasTex, TAU, mulberry32, lerp } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';

// Bouwstenen voor Schroef-Duel: kasteelkelder/werkplaats, gigantische schroeven, stenen kooien.

export const R_CORE = 1.35, R_RIDGE = 1.95, PITCH = 1.7;

// ---------------- helix-geometrie (draad) ----------------
export function helixGeo({ len, pitch = PITCH, r0 = R_CORE, r1 = R_RIDGE, w = 0.9, steps = 18 }) {
  const turns = len / pitch, N = Math.ceil(turns * steps);
  const pos = [], col = [], idx = [];
  const lo = new THREE.Color(0.72, 0.72, 0.72), hi = new THREE.Color(1.15, 1.15, 1.15);
  for (let k = 0; k <= N; k++) {
    const th = k / steps * TAU, y = -len + pitch * th / TAU;
    const c = Math.cos(th), s = Math.sin(th);
    pos.push(r0 * c, y - w / 2, r0 * s, r1 * c, y, r1 * s, r0 * c, y + w / 2, r0 * s);
    col.push(lo.r, lo.g, lo.b, hi.r, hi.g, hi.b, lo.r, lo.g, lo.b);
  }
  for (let k = 0; k < N; k++) {
    const a0 = k * 3, a1 = (k + 1) * 3;
    idx.push(a0, a1, a1 + 1, a0, a1 + 1, a0 + 1, a0 + 1, a1 + 1, a1 + 2, a0 + 1, a1 + 2, a0 + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---------------- een reuzenschroef ----------------
// Retourneert { group, spinner, head, mats, collars, setRust(k) }. Oorsprong = bovenkant van de schroefkop (standplek).
export function buildScrew(i, { shaftLen, collarDepths, color }) {
  const wood = i === 1;
  const group = new THREE.Group(); const spinner = new THREE.Group(); group.add(spinner);
  const shaftMat = new THREE.MeshStandardMaterial(wood
    ? { color: 0xc58a4e, roughness: 0.85, metalness: 0, flatShading: true, vertexColors: true, side: THREE.DoubleSide }
    : { color: 0xb9c2d0, roughness: 0.35, metalness: 0.7, flatShading: true, vertexColors: true, side: THREE.DoubleSide });
  const coreMat = new THREE.MeshStandardMaterial(wood ? { color: 0x9a6a3a, roughness: 0.9, flatShading: true } : { color: 0x8e97a6, roughness: 0.4, metalness: 0.7, flatShading: true });
  const headMat = new THREE.MeshStandardMaterial(wood ? { color: 0xffffff, map: tex.planks(1, 1, '#b8844c'), roughness: 0.85, flatShading: true } : { color: 0xaeb7c6, roughness: 0.32, metalness: 0.78, flatShading: true });
  const shaft = new THREE.Mesh(helixGeo({ len: shaftLen }), shaftMat); shaft.position.y = -1.0; shaft.castShadow = true; spinner.add(shaft);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(R_CORE * 0.99, R_CORE * 0.99, shaftLen, 14), coreMat); core.position.y = -1.0 - shaftLen / 2; spinner.add(core);
  // kop: schijf + kegel eronder (verzonken kop)
  const head = new THREE.Group(); spinner.add(head);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.95, 2.7, 0.5, 30), headMat); top.position.y = -0.25; top.castShadow = true; top.receiveShadow = true; head.add(top);
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 1.4, 0.52, 30), headMat); cone.position.y = -0.76; cone.castShadow = true; head.add(cone);
  const slotM = mat(0x16100c);
  if (wood) {
    head.add(mesh(new THREE.BoxGeometry(5.2, 0.14, 0.34), slotM, { pos: [0, 0.01, 0], cast: false }));
    head.add(mesh(new THREE.BoxGeometry(0.34, 0.14, 5.2), slotM, { pos: [0, 0.015, 0], cast: false }));
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; head.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 6), mat(0x4a2e17), { cast: false, pos: [Math.cos(a) * 2.4, 0.02, Math.sin(a) * 2.4] })); }
  } else {
    head.add(mesh(new THREE.BoxGeometry(5.4, 0.16, 0.4), slotM, { pos: [0, 0.01, 0], cast: false }));
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU + 0.2; head.add(mesh(new THREE.SphereGeometry(0.19, 8, 6), mat(0xd7dde8, { metalness: 0.8, roughness: 0.3 }), { cast: false, pos: [Math.cos(a) * 2.45, 0.02, Math.sin(a) * 2.45], scale: [1, 0.55, 1] })); }
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.88, 0.11, 6, 40), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.5 })); rim.rotation.x = Math.PI / 2; rim.position.y = -0.04; head.add(rim);
  // roestkragen (roestvlekken) op de draad
  const collars = collarDepths.map((s) => {
    const g = new THREE.Group(); g.position.y = -1.0 - s;
    const rm = new THREE.MeshStandardMaterial({ color: 0x7a2a10, emissive: 0x3a0e04, emissiveIntensity: 0.5, roughness: 1, flatShading: true });
    const tor = new THREE.Mesh(new THREE.TorusGeometry(R_RIDGE + 0.05, 0.5, 5, 11), rm); tor.rotation.x = Math.PI / 2; tor.castShadow = true; g.add(tor);
    for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + s; g.add(mesh(new THREE.DodecahedronGeometry(0.42, 0), rm, { cast: false, pos: [Math.cos(a) * (R_RIDGE + 0.35), (k % 2 ? 0.25 : -0.25), Math.sin(a) * (R_RIDGE + 0.35)], scale: [1, 0.8, 1] })); }
    spinner.add(g); return { g, s };
  });
  const rustCol = new THREE.Color(0x9a4a1c), baseS = shaftMat.color.clone(), baseH = headMat.color.clone(), baseC = coreMat.color.clone();
  function setRust(k) {
    shaftMat.color.copy(baseS).lerp(rustCol, k * 0.7); headMat.color.copy(baseH).lerp(rustCol, k * 0.55); coreMat.color.copy(baseC).lerp(rustCol, k * 0.7);
  }
  return { group, spinner, head, collars, setRust, mats: { shaftMat, headMat, coreMat }, wood };
}

// ---------------- stenen kooi (pilaar) rond de schroef ----------------
export function buildCage(height, blockH) {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ map: tex.stone(1, height / 6), roughness: 0.95, flatShading: true, color: 0xd8cfc4 });
  const stoneW = new THREE.MeshStandardMaterial({ map: tex.stone(3, 1), roughness: 0.95, flatShading: true, color: 0xd8cfc4 });
  const D = 4.3;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const p = mesh(new THREE.BoxGeometry(0.62, height, 0.62), stone, { pos: [sx * D, height / 2, sz * D] }); g.add(p);
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), stoneW, { pos: [sx * D, 0.25, sz * D] }));
    g.add(mesh(new THREE.BoxGeometry(1.1, 0.5, 1.1), stoneW, { pos: [sx * D, height - 0.25, sz * D] }));
  }
  // dwarsbalken (alleen zijkanten + achterkant, geen voorkant zodat het poppetje zichtbaar blijft)
  for (let y = 6.5; y < height - 3; y += 6.5) {
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.6, 0.6, D * 2), stoneW, { pos: [sx * D, y, 0] }));
    g.add(mesh(new THREE.BoxGeometry(D * 2, 0.6, 0.6), stoneW, { pos: [0, y, -D] }));
  }
  // bovenkant: alleen puntdakjes op de hoekpalen (open, zodat raaf en moersleutels goed zichtbaar blijven)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(1.0, 1.8, 4), mat(0x7a2e2e), { pos: [sx * D, height + 0.9, sz * D], rot: [0, Math.PI / 4, 0] }));
  g.add(mesh(new THREE.BoxGeometry(D * 2, 0.7, 0.7), stoneW, { pos: [0, height - 0.35, -D] }));
  // voet: blok met "moer"
  g.add(mesh(new THREE.CylinderGeometry(3.7, 4.0, blockH - 0.5, 22), new THREE.MeshStandardMaterial({ map: tex.stone(3, 1), roughness: 0.95, flatShading: true, color: 0xcfc6bb }), { pos: [0, (blockH - 0.5) / 2, 0] }));
  const nutM = new THREE.MeshStandardMaterial({ color: 0x7c8493, metalness: 0.75, roughness: 0.4, flatShading: true });
  g.add(mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.55, 6), nutM, { pos: [0, blockH - 0.5 + 0.275, 0] }));
  const hole = new THREE.Mesh(new THREE.RingGeometry(R_RIDGE + 0.04, R_RIDGE + 0.5, 28), new THREE.MeshBasicMaterial({ color: 0x0a0604, side: THREE.DoubleSide })); hole.rotation.x = -Math.PI / 2; hole.position.y = blockH + 0.02; g.add(hole);
  return g;
}

// ---------------- kelder ----------------
function glowTex() {
  return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,200,110,.95)'); gr.addColorStop(0.35, 'rgba(255,150,50,.35)'); gr.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
}
function bannerTex(name, css, flip) {
  return canvasTex(256, 640, (g, w, h) => {
    g.fillStyle = '#2a1812'; g.fillRect(0, 0, w, h);
    g.fillStyle = css; g.fillRect(12, 0, w - 24, h - 70);
    g.beginPath(); g.moveTo(12, h - 70); g.lineTo(w / 2, h - 10); g.lineTo(w - 12, h - 70); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(12, 0, 22, h - 70); g.fillRect(w - 34, 0, 22, h - 70);
    g.strokeStyle = '#ffe9b0'; g.lineWidth = 8; g.strokeRect(24, 14, w - 48, h - 100);
    // schroef-embleem
    g.save(); g.translate(w / 2, 220); g.fillStyle = '#ffe9b0'; g.beginPath(); g.ellipse(0, -80, 62, 20, 0, 0, TAU); g.fill(); g.fillStyle = css; g.fillRect(-52, -86, 104, 10);
    g.fillStyle = '#ffe9b0'; g.fillRect(-24, -70, 48, 200);
    g.strokeStyle = css; g.lineWidth = 8; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(-26, -40 + k * 30); g.lineTo(26, -22 + k * 30); g.stroke(); }
    g.restore();
    g.fillStyle = '#ffe9b0'; g.font = 'bold 64px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name.toUpperCase(), w / 2, 470, w - 60);
  });
}

export function buildCellar(ctx, { colX, names, css }) {
  const { scene, fx } = ctx;
  const firstChild = scene.children.length;
  const rng = mulberry32(77);
  const upd = [];
  const WALL_Z = -14;
  // vloer + muren
  const floorTex = tex.cobble(14, 8);
  scene.add(mesh(new THREE.PlaneGeometry(110, 60), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1, color: 0xb3a79a }), { cast: false, pos: [0, 0, -4], rot: [-Math.PI / 2, 0, 0] }));
  const wallM = new THREE.MeshStandardMaterial({ map: tex.stone(16, 14), roughness: 1, color: 0x9d9186, flatShading: true });
  scene.add(mesh(new THREE.PlaneGeometry(130, 90), wallM, { cast: false, pos: [0, 43, WALL_Z] }));
  for (const sx of [-1, 1]) scene.add(mesh(new THREE.PlaneGeometry(40, 90), wallM, { cast: false, pos: [sx * 52, 43, WALL_Z + 20], rot: [0, -sx * Math.PI / 2, 0] }));
  // bogen (donkere nissen) in twee rijen
  const archShape = new THREE.Shape(); archShape.moveTo(-3, 0); archShape.lineTo(-3, 7); archShape.absarc(0, 7, 3, Math.PI, 0, true); archShape.lineTo(3, 0); archShape.lineTo(-3, 0);
  const archGeo = new THREE.ShapeGeometry(archShape, 12);
  const archM = new THREE.MeshBasicMaterial({ color: 0x120c0a });
  const frameM = mat(0x6e6258);
  const grateM = mat(0x2b2b30, { metalness: 0.5 });
  for (const row of [2, 22, 42]) for (const x of [-27, 0, 27]) {
    const a = new THREE.Mesh(archGeo, archM); a.position.set(x, row, WALL_Z + 0.06); scene.add(a);
    scene.add(mesh(new THREE.BoxGeometry(0.7, 8, 0.5), frameM, { pos: [x - 3.3, row + 4, WALL_Z + 0.2] }));
    scene.add(mesh(new THREE.BoxGeometry(0.7, 8, 0.5), frameM, { pos: [x + 3.3, row + 4, WALL_Z + 0.2] }));
    scene.add(mesh(new THREE.TorusGeometry(3.3, 0.35, 5, 14, Math.PI), frameM, { pos: [x, row + 7, WALL_Z + 0.2] }));
    for (let k = -2; k <= 2; k++) scene.add(mesh(new THREE.BoxGeometry(0.16, 7.6, 0.16), grateM, { cast: false, pos: [x + k * 1.1, row + 3.8, WALL_Z + 0.4] }));
    scene.add(mesh(new THREE.BoxGeometry(6.4, 0.16, 0.16), grateM, { cast: false, pos: [x, row + 4.6, WALL_Z + 0.4] }));
  }
  // balken
  const beamM = new THREE.MeshStandardMaterial({ map: tex.planks(10, 1, '#6a4524'), roughness: 0.95, flatShading: true });
  for (const y of [11, 31, 51]) {
    scene.add(mesh(new THREE.BoxGeometry(118, 0.9, 1.4), beamM, { pos: [0, y, WALL_Z + 0.7] }));
    for (const x of [-38, -13, 13, 38]) scene.add(mesh(new THREE.BoxGeometry(0.9, 6, 1.0), beamM, { cast: false, pos: [x, y - 3, WALL_Z + 0.6], rot: [0, 0, x < 0 ? -0.5 : 0.5] }));
  }
  // banieren achter de kooien
  names.forEach((nm, i) => {
    for (const y of [15, 36]) {
      const b = mesh(new THREE.PlaneGeometry(5.6, 14), new THREE.MeshStandardMaterial({ map: bannerTex(nm, css[i]), roughness: 0.9 }), { cast: false, pos: [colX[i] + (i ? 1 : -1) * 0.0, y, WALL_Z + 0.9] });
      scene.add(b); b.userData.base = y; b.userData.ph = i * 2 + y;
      upd.push((T) => { b.rotation.z = Math.sin(T * 0.9 + b.userData.ph) * 0.02; });
    }
  });
  // fakkels + gloed
  const gt = glowTex(); const flames = [];
  const fm = new THREE.MeshBasicMaterial({ color: 0xffa83a }), fm2 = new THREE.MeshBasicMaterial({ color: 0xffe590 });
  const gm = new THREE.SpriteMaterial({ map: gt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.8 });
  for (const y of [5, 13, 21, 29, 37, 45]) for (const x of [-14, 14]) {
    const g = new THREE.Group(); g.position.set(x, y, WALL_Z + 0.5); scene.add(g);
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.18, 0.9), mat(0x2e2e3a, { metalness: 0.5 }), { cast: false, pos: [0, -0.4, 0.3] }));
    g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 5), mat(0x5b3d24), { cast: false, pos: [0, 0.1, 0.5], rot: [0.0, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(0.28, 0.14, 0.3, 6), mat(0x2b2b30), { cast: false, pos: [0, 0.85, 0.5] }));
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.85, 6), fm); f.position.set(0, 1.3, 0.5); g.add(f);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.55, 6), fm2); f2.position.set(0, 1.2, 0.5); g.add(f2);
    const sp = new THREE.Sprite(gm); sp.scale.set(7, 7, 1); sp.position.set(0, 1.3, 0.9); g.add(sp);
    flames.push({ f, f2, sp, ph: rng() * 9 });
  }
  upd.push((T) => { for (const q of flames) { const s = 1 + Math.sin(T * 13 + q.ph) * 0.14 + Math.sin(T * 7.3 + q.ph * 2) * 0.1; q.f.scale.set(1, s, 1); q.f.rotation.y = T * 2; q.f2.scale.set(1, 1 + Math.sin(T * 17 + q.ph) * 0.18, 1); q.sp.scale.setScalar(6.4 + Math.sin(T * 9 + q.ph) * 0.7); } });
  // tandwielen
  const cogs = [];
  const cogM = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, metalness: 0.65, roughness: 0.5, flatShading: true });
  function cog(x, y, r, n, dir, z = WALL_Z + 1.6) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    g.add(mesh(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 1.0, Math.max(16, n * 2)), cogM, { rot: [Math.PI / 2, 0, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.2, 1.5, 10), mat(0x4a3a22, { metalness: 0.5 }), { rot: [Math.PI / 2, 0, 0] }));
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(r * 0.3, r * 0.26, 1.0), cogM, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
    for (let k = 0; k < n; k++) { const a = k / n * TAU; q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a); m4.compose(new THREE.Vector3(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 0), q, s1); im.setMatrixAt(k, m4); }
    im.castShadow = false; g.add(im);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI; g.add(mesh(new THREE.BoxGeometry(r * 1.5, r * 0.12, 0.5), cogM, { cast: false, pos: [0, 0, 0.3], rot: [0, 0, a] })); }
    scene.add(g); cogs.push({ g, dir, ph: rng() * 6 });
  }
  cog(-31, 20, 6, 16, 1); cog(-20.5, 27.5, 4, 11, -1); cog(31, 40, 7, 18, -1); cog(21, 31, 4.4, 12, 1); cog(-30, 47, 5, 14, -1); cog(30, 10, 3.6, 10, 1);
  upd.push((T, dt) => { for (const c of cogs) c.g.rotation.z += dt * 0.18 * c.dir; });
  // ketting met lantaarns
  const chains = [];
  const linkGeo = new THREE.TorusGeometry(0.24, 0.07, 5, 8); const linkM = mat(0x25252c, { metalness: 0.6 });
  for (const [x, z, len, yTop] of [[-21, -9, 24, 70], [21, -9, 30, 70], [-4, -11, 20, 70], [4, -11, 36, 70], [-40, -8, 26, 70], [40, -8, 34, 70]]) {
    const piv = new THREE.Group(); piv.position.set(x, yTop, z); scene.add(piv);
    const n = Math.floor(len / 0.5); const im = new THREE.InstancedMesh(linkGeo, linkM, n); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let k = 0; k < n; k++) { e.set(0, k % 2 ? Math.PI / 2 : 0, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(0, -k * 0.5, 0), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(k, m4); }
    piv.add(im);
    const lan = new THREE.Group(); lan.position.y = -len; piv.add(lan);
    lan.add(mesh(new THREE.BoxGeometry(1.1, 1.5, 1.1), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa030, emissiveIntensity: 1.1 }), { cast: false, pos: [0, -0.9, 0] }));
    lan.add(mesh(new THREE.ConeGeometry(0.95, 0.7, 4), mat(0x2e2e3a), { cast: false, pos: [0, 0.0, 0], rot: [0, Math.PI / 4, 0] }));
    const sp = new THREE.Sprite(gm); sp.scale.set(6, 6, 1); sp.position.y = -0.9; lan.add(sp);
    chains.push({ piv, ph: rng() * 9, amp: 0.025 + rng() * 0.02 });
  }
  // kroonluchter
  { const cg = new THREE.Group(); cg.position.set(0, 41, -6); scene.add(cg);
    cg.add(mesh(new THREE.TorusGeometry(5, 0.28, 6, 28), mat(0x2e2e3a, { metalness: 0.6 }), { rot: [Math.PI / 2, 0, 0] }));
    for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; cg.add(mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 6), mat(0xf4ecd8), { cast: false, pos: [Math.cos(a) * 5, 0.6, Math.sin(a) * 5] })); const fl = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), fm); fl.position.set(Math.cos(a) * 5, 1.3, Math.sin(a) * 5); cg.add(fl); flames.push({ f: fl, f2: fl, sp: { scale: { setScalar() {} } }, ph: k }); }
    for (const a of [0, 2.1, 4.2]) { const ch = mesh(new THREE.CylinderGeometry(0.06, 0.06, 20, 4), mat(0x25252c), { cast: false, pos: [Math.cos(a) * 2.5, 10, Math.sin(a) * 2.5], rot: [Math.sin(a) * 0.12, 0, -Math.cos(a) * 0.12] }); cg.add(ch); }
    chains.push({ piv: cg, ph: 1.3, amp: 0.03, chand: true, y0: 41 });
  }
  // vleermuizen (cirkelen boven de camera)
  const bats = [];
  const batM = new THREE.MeshBasicMaterial({ color: 0x120d12, side: THREE.DoubleSide });
  const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.4, 0.5, 0.2, 1.1, -0.3, 0.1, 1.1, -0.3, 0.1, 1.4, 0.5, 0.2, 2.0, -0.1, 0.0], 3));
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), batM));
    const wl = new THREE.Mesh(wingGeo, batM), wr = new THREE.Mesh(wingGeo, batM); wr.scale.x = -1; g.add(wl, wr); scene.add(g);
    bats.push({ g, wl, wr, ph: k * 2.1, rad: 7 + k * 3, sp: 0.5 + k * 0.17, cx: (k - 1) * 12, dy: 6 + k * 2.2 });
  }
  // vloerdecoratie
  const put = (obj, x, z, ry = 0, s = 1) => { obj.position.set(x, 0, z); obj.rotation.y = ry; obj.scale.setScalar(s); scene.add(obj); return obj; };
  put(P.barrel(1.5), -17.5, -6, 0.3); put(P.barrel(1.5), -19.2, -5.2, 1.1); put(P.barrel(1.5), -18.2, -7.4, 0.7);
  put(P.crate(2.2), 17.8, -6.5, 0.2); put(P.crate(1.7), 20, -5.5, -0.4); { const c = P.crate(1.5); put(c, 18.6, -6.4, 0.5); c.position.y = 2.2; }
  put(P.sack(1.7), -22.5, -3.5, 0, 1); put(P.sack(1.5), 23.5, -3, 0, 1);
  put(P.barrel(1.5), 24, -6.5, 0.1);
  // aambeeld
  { const a = new THREE.Group(); const am = mat(0x3b3f4a, { metalness: 0.7, roughness: 0.4 });
    a.add(mesh(new THREE.BoxGeometry(1.4, 1.0, 1.2), mat(0x5b3d24), { pos: [0, 0.5, 0] }));
    a.add(mesh(new THREE.BoxGeometry(1.0, 0.5, 0.9), am, { pos: [0, 1.15, 0] }));
    a.add(mesh(new THREE.BoxGeometry(2.6, 0.55, 1.1), am, { pos: [0, 1.65, 0] }));
    a.add(mesh(new THREE.ConeGeometry(0.55, 1.1, 5), am, { pos: [1.75, 1.65, 0], rot: [0, 0, -Math.PI / 2] }));
    put(a, -13.5, 6, 0.4, 1.3);
    const hm = P.hammer(); hm.position.set(-13.2, 2.5, 6.3); hm.rotation.set(0, 0.4, Math.PI / 2 + 0.3); hm.scale.setScalar(1.6); scene.add(hm); }
  // werkbank met gereedschap
  { const b = new THREE.Group(); const pm = new THREE.MeshStandardMaterial({ map: tex.planks(2, 1, '#8a5a30'), roughness: 0.9, flatShading: true });
    b.add(mesh(new THREE.BoxGeometry(7, 0.4, 2.4), pm, { pos: [0, 2.6, 0] }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), mat(0x5b3d24), { pos: [sx * 3.2, 1.3, sz * 0.9] }));
    b.add(mesh(new THREE.BoxGeometry(6.4, 0.25, 1.9), pm, { pos: [0, 0.9, 0] }));
    const t1 = P.hammer(); t1.position.set(-2, 2.8, 0.2); t1.rotation.set(Math.PI / 2, 0.5, 0); t1.scale.setScalar(1.4); b.add(t1);
    const t2 = P.bucket(); t2.position.set(2.4, 2.8, 0); t2.scale.setScalar(1.4); b.add(t2);
    put(b, 14.5, -9.5, 0, 1); }
  // gereedschapsrek aan de muur met moersleutels
  { const r = new THREE.Group(); r.add(mesh(new THREE.BoxGeometry(9, 0.5, 0.5), mat(0x5b3d24), { cast: false }));
    for (let k = 0; k < 6; k++) { const w = wrench(0xa9b2c0); w.position.set(-3.6 + k * 1.45, -0.6 - (k % 2) * 0.3, 0.2); w.scale.setScalar(0.8 + (k % 3) * 0.12); w.rotation.z = (k - 2.5) * 0.04; r.add(w); }
    r.position.set(-8.5, 6.5, WALL_Z + 0.5); scene.add(r); }
  // de bel (rinkelt bij de winnaar)
  const bell = new THREE.Group(); bell.position.set(0, 0, -7); scene.add(bell);
  { const fm4 = mat(0x5b3d24);
    bell.add(mesh(new THREE.BoxGeometry(0.7, 8.4, 0.7), fm4, { pos: [-3.4, 4.2, 0] })); bell.add(mesh(new THREE.BoxGeometry(0.7, 8.4, 0.7), fm4, { pos: [3.4, 4.2, 0] }));
    bell.add(mesh(new THREE.BoxGeometry(8.4, 0.7, 0.7), fm4, { pos: [0, 8.2, 0] }));
    for (const sx of [-1, 1]) bell.add(mesh(new THREE.BoxGeometry(0.4, 3.0, 0.4), fm4, { cast: false, pos: [sx * 2.4, 1.6, 0], rot: [0, 0, sx * 0.7] }));
    const swing = new THREE.Group(); swing.position.set(0, 7.9, 0); bell.add(swing); bell.userData.swing = swing;
    const pts = []; for (let k = 0; k <= 12; k++) { const t = k / 12; pts.push(new THREE.Vector2(0.35 + 1.5 * Math.pow(t, 1.9) + (t > 0.9 ? 0.2 : 0), -t * 2.8)); }
    const bg = new THREE.LatheGeometry(pts, 18);
    swing.add(mesh(bg, new THREE.MeshStandardMaterial({ color: 0xe0a82e, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide, emissive: 0x402800, emissiveIntensity: 0.3 }), { pos: [0, -0.3, 0] }));
    swing.add(mesh(new THREE.SphereGeometry(0.28, 8, 6), mat(0x3a2a14), { cast: false, pos: [0, -3.2, 0] }));
    swing.add(mesh(new THREE.TorusGeometry(0.3, 0.07, 5, 10), mat(0x2b2b30), { cast: false, pos: [0, 0.1, 0] }));
    bell.userData.amp = 0; bell.userData.t = 0; }
  function ringBell() { bell.userData.amp = 0.55; bell.userData.t = 0; }
  upd.push((T, dt) => { const b = bell.userData; b.t += dt; b.amp *= Math.exp(-dt * 0.9); b.swing.rotation.z = Math.sin(b.t * 7) * b.amp; });

  let quakeAmt = 0;
  function update(T, dt, camY, quake = 0) {
    quakeAmt = quake;
    for (const u of upd) u(T, dt);
    for (const c of chains) { const a = c.amp + quake * 0.1; c.piv.rotation.z = Math.sin(T * 0.8 + c.ph) * a + (quake ? Math.sin(T * 17 + c.ph) * quake * 0.03 : 0); c.piv.rotation.x = Math.cos(T * 0.6 + c.ph) * a * 0.6; }
    for (const b of bats) {
      const a = T * b.sp + b.ph; b.g.position.set(b.cx + Math.cos(a) * b.rad, camY + b.dy + Math.sin(a * 1.7) * 1.5, -6 + Math.sin(a) * 3);
      b.g.rotation.y = Math.atan2(-Math.sin(a) * b.rad, Math.cos(a) * 3);
      const f = Math.sin(T * 22 + b.ph) * 0.9; b.wl.rotation.z = f; b.wr.rotation.z = -f;
    }
    // stofdeeltjes in de lucht
    if (Math.random() < dt * 14) fx.particles.emit((Math.random() - 0.5) * 40, camY + (Math.random() - 0.3) * 18, -4 + Math.random() * 14, (Math.random() - 0.5) * 0.3, -0.25, 0, { life: 3.2, size: 0.14, color: 0xffd9a0, gravity: 0, shrink: false });
  }
  // decor werpt geen schaduwen (spaart de schaduw-pass); schroeven, kooien en poppetjes wel
  for (let k = firstChild; k < scene.children.length; k++) scene.children[k].traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = false; });
  return { update, ringBell, WALL_Z };
}

// moersleutel-model (ook voor de power-up)
export function wrench(color = 0xc9d0dc, scale = 1) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.28, flatShading: true, emissive: color, emissiveIntensity: 0.12 });
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.9, 0.2), m); h.position.y = -0.2; g.add(h);
  const open = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.2, 5, 10, Math.PI * 1.55), m); open.position.y = 0.95; open.rotation.z = Math.PI / 2 + 0.75 + Math.PI / 2; g.add(open);
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 6), m); tail.rotation.x = Math.PI / 2; tail.position.y = -1.2; g.add(tail);
  g.scale.setScalar(scale);
  g.userData.mat = m;
  return g;
}
