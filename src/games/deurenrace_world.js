import * as THREE from 'three';
import { mat, mesh, canvasTex, mulberry32, TAU, lerp, damp } from '../engine/util.js';
import { skyTexture } from '../engine/lights.js';
import { mergeStatic } from '../world/merge.js';
import { friendlyDeurman } from './deurenrace_man.js';

// Omgeving van de Deurenrace: een kasteelgang met honderden kleurige deuren. Twee banen naast elkaar (z loopt naar -z),
// per baan rijen muren met 3-4 deuren, orbs (item-blokken), vlaggetjes, fakkels en een finishboog met de Deurman erachter.
export const ROWS = 14, LW = 10.4, T = 0.8, RS = 10, Z0 = -10, WALLH = 4.4, DOORH = 3.2;
export const LANE_CX = [-5.7, 5.7];
export const rowZ = (r) => Z0 - r * RS;
export const FINISH_Z = rowZ(ROWS - 1) - 11;
export const START_Z = 2.8;
export const PALETTE = [0xff5a5a, 0xffa43a, 0xffe14a, 0x5ad86a, 0x3ad0e8, 0x5a8cff, 0xb06bff, 0xff6ac0];
export const WALLS = [0xf7d6a8, 0xbfe6c9, 0xbfd8f5, 0xf5c4d8, 0xe6d3f7];
export const kraakPhase = (t, r) => (t * 0.7 + r * 1.3) % 3;     // < 0.5 = de echte deur kraakt/schudt
export const doorGeo = (n) => { const slotW = LW / n; const leafW = Math.min(2.4, slotW - 0.7); return { slotW, leafW, gapHalf: leafW / 2 + 0.05 }; };
export const doorX = (p, n, d) => LANE_CX[p] - LW / 2 + (d + 0.5) * (LW / n);

const glowCache = {};
function glowTex() { return glowCache.g || (glowCache.g = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); })); }
function doorTex() {
  return canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,.07)'; for (let i = 0; i < 4; i++) g.fillRect(i * 32, 0, 2, h);
    g.fillStyle = '#1a0f14'; g.beginPath(); g.arc(64, 54, 7, 0, 7); g.fill(); g.strokeStyle = '#d9b23a'; g.lineWidth = 3; g.stroke();
    for (const y of [16, 138]) { g.fillStyle = '#e4e4e4'; g.fillRect(16, y, 96, 100); g.strokeStyle = '#c4c4c4'; g.lineWidth = 4; g.strokeRect(16, y, 96, 100); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(16, y, 96, 5); }
  });
}
function tileTex(c1, c2) {
  const t = canvasTex(128, 128, (g, w, h) => { g.fillStyle = c1; g.fillRect(0, 0, w, h); g.fillStyle = c2; g.fillRect(0, 0, w / 2, h / 2); g.fillRect(w / 2, h / 2, w / 2, h / 2); g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.userData.keep = true; return t;
}
function labelTex(txt, col, w = 256, h = 128, size = 80, bg = null) {
  return canvasTex(w, h, (g, W, H) => {
    if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(4, 4, W - 8, H - 8, 22) : g.rect(4, 4, W - 8, H - 8); g.fill(); g.lineWidth = 6; g.strokeStyle = 'rgba(20,10,30,.8)'; g.stroke(); }
    g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = 'rgba(20,6,40,.95)'; g.strokeText(txt, W / 2, H / 2 + 3, W - 16); g.fillStyle = col; g.fillText(txt, W / 2, H / 2 + 3, W - 16);
  });
}
function scratchTex() {
  return canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,240,200,.95)'; g.lineCap = 'round'; for (let i = 0; i < 4; i++) { g.lineWidth = 5 - i * 0.5; g.beginPath(); g.moveTo(26 + i * 24, 10 + (i % 2) * 6); g.quadraticCurveTo(34 + i * 24, 64, 22 + i * 26, 118 - (i % 2) * 8); g.stroke(); } });
}
function boxTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffe14a'); gr.addColorStop(0.5, '#ff6ac0'); gr.addColorStop(1, '#3ad0e8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.font = 'bold 96px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = '#3a1060'; g.strokeText('?', w / 2, h / 2 + 6); g.fillStyle = '#fff'; g.fillText('?', w / 2, h / 2 + 6);
  });
}

export function buildWorld(ctx, rows) {
  const { scene } = ctx;
  const rng = mulberry32(4242);
  const W = { doors: [[], []], orbs: [[], []], t: 0, deurman: null };
  scene.background = skyTexture('#1a0d33', '#3b2158');
  scene.fog = new THREE.Fog(0x2a1648, 48, 118);
  const first = scene.children.length;
  const zA = START_Z + 30, zB = FINISH_Z - 16, wallLen = zA - zB, midZ = (zA + zB) / 2;

  // ---- vloer ----
  scene.add(mesh(new THREE.PlaneGeometry(90, wallLen + 40), mat(0x2b1f3d), { cast: false, pos: [0, -0.02, midZ], rot: [-Math.PI / 2, 0, 0] }));
  for (let p = 0; p < 2; p++) {
    const tx = p ? tileTex('#6fa0ff', '#8fb8ff') : tileTex('#5fd48a', '#82e6a6'); tx.repeat.set(LW / 3.4, wallLen / 3.4);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(LW, wallLen), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.75 })); f.rotation.x = -Math.PI / 2; f.position.set(LANE_CX[p], 0, midZ); f.receiveShadow = true; scene.add(f);
    // loper in de kleur van de speler (gouden rand)
    scene.add(mesh(new THREE.BoxGeometry(0.16, 0.04, wallLen), mat(p ? 0x2f6fe0 : 0x2f9e5b), { cast: false, pos: [LANE_CX[p] - LW / 2 + 0.3, 0.03, midZ] }));
    scene.add(mesh(new THREE.BoxGeometry(0.16, 0.04, wallLen), mat(p ? 0x2f6fe0 : 0x2f9e5b), { cast: false, pos: [LANE_CX[p] + LW / 2 - 0.3, 0.03, midZ] }));
  }
  // startlijn + finishlijn (dambord)
  const chk = canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 16, j * 16, 16, 16); } });
  const startL = new THREE.Mesh(new THREE.PlaneGeometry(LW * 2 + 1, 1.2), new THREE.MeshBasicMaterial({ map: chk })); startL.rotation.x = -Math.PI / 2; startL.position.set(0, 0.05, START_Z - 1.2); scene.add(startL);
  const finL = new THREE.Mesh(new THREE.PlaneGeometry(LW * 2 + 1, 1.6), new THREE.MeshBasicMaterial({ map: chk })); finL.rotation.x = -Math.PI / 2; finL.position.set(0, 0.05, FINISH_Z); scene.add(finL);

  // ---- buitenmuren + middenmuur ----
  const wallM = mat(0x5a3f7a), wallM2 = mat(0x6b4a8e), capM = mat(0xe8c24a, { metalness: 0.4, roughness: 0.5 });
  const outerX = LANE_CX[1] + LW / 2 + 0.5;
  for (const [x, w, h, m] of [[-outerX, 1, 7, wallM], [outerX, 1, 7, wallM], [0, 1.0, 3.4, wallM2]]) {
    const len = x === 0 ? zA - (FINISH_Z - 1) : wallLen, zc = x === 0 ? (zA + FINISH_Z - 1) / 2 : midZ;      // de middenmuur stopt bij de finish
    scene.add(mesh(new THREE.BoxGeometry(w, h, len), m, { cast: false, pos: [x, h / 2, zc] }));
    scene.add(mesh(new THREE.BoxGeometry(w + 0.3, 0.25, len), capM, { cast: false, pos: [x, h + 0.1, zc] }));
  }
  // achterwand met reuzendeur (waar de Deurman staat) en voorwand
  const backZ = FINISH_Z - 14;
  scene.add(mesh(new THREE.BoxGeometry(outerX * 2 + 1, 12, 1), wallM, { cast: false, pos: [0, 6, backZ] }));
  const bigDoor = new THREE.Mesh(new THREE.PlaneGeometry(9, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a0 })); bigDoor.position.set(0, 5, backZ + 0.55); scene.add(bigDoor);
  const rays = new THREE.Mesh(new THREE.PlaneGeometry(16, 12), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xfff0b0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending })); rays.position.set(0, 5, backZ + 0.7); scene.add(rays);
  scene.add(mesh(new THREE.BoxGeometry(10.4, 0.8, 0.8), capM, { cast: false, pos: [0, 10.2, backZ + 0.6] }));
  for (const sx of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(0.7, 10, 0.8), capM, { cast: false, pos: [sx * 4.85, 5, backZ + 0.6] }));
  scene.add(mesh(new THREE.BoxGeometry(outerX * 2 + 1, 12, 1), wallM, { cast: false, pos: [0, 6, START_Z + 26] }));

  // ---- rijen muren per baan ----
  const numTex = [];
  for (let r = 0; r < ROWS; r++) numTex.push(labelTex(String(r + 1), '#ffe14a', 128, 128, 90, 'rgba(60,20,90,.9)'));
  const trimM = mat(0xfff0d0);
  const leafGeo = {}, doorMats = PALETTE.map((c) => new THREE.MeshStandardMaterial({ map: doorTex(), color: c, roughness: 0.75 }));
  const knobM = mat(0xffd24a, { metalness: 0.7, roughness: 0.3 });
  const knobG = new THREE.SphereGeometry(0.1, 8, 6);
  const crossTex = labelTex('NEP!', '#ff5a5a', 192, 96, 60, 'rgba(255,255,255,.92)');
  const crossGeo = new THREE.PlaneGeometry(1.5, 0.75), crossM = new THREE.MeshBasicMaterial({ map: crossTex, transparent: true, depthWrite: false });
  const scratchT = scratchTex(), scratchM = new THREE.MeshBasicMaterial({ map: scratchT, transparent: true, depthWrite: false, opacity: 0.9 });
  const lightM = new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffe9a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 });
  for (let p = 0; p < 2; p++) {
    for (let r = 0; r < ROWS; r++) {
      const row = rows[r], n = row.n, z = rowZ(r), { slotW, leafW } = doorGeo(n), openW = leafW + 0.24;
      const wm = mat(WALLS[(r + p * 0) % WALLS.length]);
      const xl = LANE_CX[p] - LW / 2, xr = LANE_CX[p] + LW / 2;
      // pilaren tussen de deuropeningen
      let xPrev = xl;
      for (let d = 0; d <= n; d++) {
        const xEnd = d < n ? doorX(p, n, d) - openW / 2 : xr;
        if (xEnd - xPrev > 0.01) scene.add(mesh(new THREE.BoxGeometry(xEnd - xPrev, WALLH, T), wm, { cast: false, pos: [(xEnd + xPrev) / 2, WALLH / 2, z] }));
        if (d < n) xPrev = doorX(p, n, d) + openW / 2;
      }
      W.doors[p][r] = [];
      for (let d = 0; d < n; d++) {
        const cx = doorX(p, n, d), hinge = (d + r) % 2 ? 1 : -1;
        // latei + kozijn
        scene.add(mesh(new THREE.BoxGeometry(openW, WALLH - DOORH - 0.1, T), wm, { cast: false, pos: [cx, DOORH + 0.1 + (WALLH - DOORH - 0.1) / 2, z] }));
        scene.add(mesh(new THREE.BoxGeometry(0.14, DOORH + 0.12, T + 0.12), trimM, { cast: false, pos: [cx - openW / 2 + 0.03, (DOORH + 0.12) / 2, z] }));
        scene.add(mesh(new THREE.BoxGeometry(0.14, DOORH + 0.12, T + 0.12), trimM, { cast: false, pos: [cx + openW / 2 - 0.03, (DOORH + 0.12) / 2, z] }));
        scene.add(mesh(new THREE.BoxGeometry(openW + 0.2, 0.16, T + 0.12), trimM, { cast: false, pos: [cx, DOORH + 0.12, z] }));
        // draaiende deur (dynamisch)
        const pivot = new THREE.Group(); pivot.userData.dynamic = true;
        pivot.position.set(cx + hinge * (leafW / 2), 0, z + T / 2 - 0.12);     // scharnier: hinge -1 = links, +1 = rechts
        const gk = leafGeo[leafW] || (leafGeo[leafW] = new THREE.BoxGeometry(leafW, DOORH, 0.14));
        const col = row.colors[d];
        const leaf = new THREE.Mesh(gk, doorMats[col]); leaf.position.set(-hinge * leafW / 2, DOORH / 2, 0); leaf.castShadow = false; leaf.receiveShadow = true; pivot.add(leaf);
        const knob = new THREE.Mesh(knobG, knobM); knob.position.set(-hinge * (leafW - 0.28), DOORH * 0.45, 0.12); pivot.add(knob);
        scene.add(pivot);
        const door = { g: pivot, leaf, hinge, cx, leafW, open: 0, target: 0, shake: 0, shakeT: 0, peek: 0, mark: null, real: d === row.real, fake: d === row.real ? null : row.fakes[d], p, r, d };
        // markering "NEP!" (verschijnt als je een nepdeur ontdekt)
        const mk = new THREE.Mesh(crossGeo, crossM); mk.position.set(cx, DOORH * 0.55, z + T / 2 + 0.07); mk.visible = false; mk.rotation.z = (rng() - 0.5) * 0.3; scene.add(mk); mk.userData.dynamic = true; door.mark = mk;
        W.doors[p][r].push(door);
        // hints bij de echte deur
        if (door.real && row.clue === 'krassen') { const s = new THREE.Mesh(new THREE.PlaneGeometry(leafW * 0.8, 1.5), scratchM); s.rotation.x = -Math.PI / 2; s.position.set(cx, 0.06, z + T / 2 + 0.9); scene.add(s); s.userData.dynamic = true; }
        if (door.real && row.clue === 'licht') {
          const l1 = new THREE.Mesh(new THREE.PlaneGeometry(leafW * 1.3, 0.5), lightM); l1.position.set(cx, 0.22, z + T / 2 + 0.08); scene.add(l1); l1.userData.dynamic = true;
          const l2 = new THREE.Mesh(new THREE.PlaneGeometry(leafW * 1.2, 2.2), lightM); l2.rotation.x = -Math.PI / 2; l2.position.set(cx, 0.07, z + T / 2 + 1.1); scene.add(l2); l2.userData.dynamic = true;
        }
      }
      // rijnummer-bord boven de muur
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: numTex[r], transparent: true })); sg.position.set(LANE_CX[p], WALLH + 0.9, z + T / 2 + 0.1); sg.userData.dynamic = true; scene.add(sg);
      scene.add(mesh(new THREE.BoxGeometry(LW, 0.25, T + 0.2), mat(p ? 0x3a78e0 : 0x2f9e5b), { cast: false, pos: [LANE_CX[p], WALLH + 0.12, z] }));
    }
  }

  // ---- decor-deuren op de muren (instanced): honderden deuren ----
  const decor = [];
  for (const [x, ry, face] of [[-outerX + 0.55, Math.PI / 2, 0], [outerX - 0.55, -Math.PI / 2, 0], [-0.55, -Math.PI / 2, 0], [0.55, Math.PI / 2, 0]]) {
    for (let z = START_Z + 2; z > backZ + 3; z -= 3.3) { if (Math.abs(x) < 1 && z < FINISH_Z - 1) continue; decor.push({ x, z, ry, big: rng() < 0.25 }); }
  }
  const ND = decor.length;
  const dLeaf = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 2.8, 0.12), new THREE.MeshStandardMaterial({ map: doorTex(), roughness: 0.8 }), ND);
  const dFrame = new THREE.InstancedMesh(new THREE.BoxGeometry(1.75, 3.1, 0.1), mat(0x2a1a22), ND);
  const dKnob = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 6, 5), knobM, ND);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), c4 = new THREE.Color();
  const decorPlace = (i, open = 0) => {
    const d = decor[i], k = d.big ? 1.15 : 1, c = Math.cos(d.ry), sn = Math.sin(d.ry); q.setFromEuler(e.set(0, d.ry, 0));
    const at = (lx, lz) => v3.set(d.x + lx * c + lz * sn, 0, d.z - lx * sn + lz * c);
    at(0, 0); m4.compose(v3.setY(1.55 * k), q, s3.set(k, k, 1)); dFrame.setMatrixAt(i, m4);
    at(0, 0.07); m4.compose(v3.setY(1.5 * k), q, s3.set(k * (1 - open * 0.85), k, 1)); dLeaf.setMatrixAt(i, m4);
    at(0.5 * k * (1 - open * 0.85), 0.16); m4.compose(v3.setY(1.45 * k), q, s3.set(k, k, k)); dKnob.setMatrixAt(i, m4);
  };
  for (let i = 0; i < ND; i++) { decorPlace(i); dLeaf.setColorAt(i, c4.setHex(PALETTE[Math.floor(rng() * PALETTE.length)])); }
  dLeaf.frustumCulled = dFrame.frustumCulled = dKnob.frustumCulled = false;
  scene.add(dFrame, dLeaf, dKnob);
  W.decorOpen = { i: -1, t: 0 };

  // ---- fakkels (instanced vlammen) + wandhouders ----
  const torchZ = []; for (let z = START_Z; z > backZ + 2; z -= 7) torchZ.push(z);
  const NT = torchZ.length * 2;
  const flames = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.55, 6), new THREE.MeshBasicMaterial({ color: 0xffaa33 }), NT); flames.frustumCulled = false;
  const cups = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.1, 0.3, 6), mat(0x333333), NT);
  const glows = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffb04a, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), NT); glows.frustumCulled = false;
  torchZ.forEach((z, i) => { for (let s = 0; s < 2; s++) { const x = s ? outerX - 0.7 : -outerX + 0.7, k = i * 2 + s; m4.compose(v3.set(x, 4.9, z - 1.65), q.identity(), s3.set(1, 1, 1)); flames.setMatrixAt(k, m4); m4.compose(v3.set(x, 4.55, z - 1.65), q.identity(), s3.set(1, 1, 1)); cups.setMatrixAt(k, m4); m4.compose(v3.set(x, 5.0, z - 1.65), q.identity(), s3.set(1, 1, 1)); glows.setMatrixAt(k, m4); } });
  scene.add(flames, cups, glows); W.flames = flames; W.flameN = NT; W.flameM = { m4, v3, q, s3 };
  W.torchPos = [];
  torchZ.forEach((z) => { W.torchPos.push([-outerX + 0.7, z - 1.65], [outerX - 0.7, z - 1.65]); });

  // ---- vlaggetjes + lantaarns boven de banen ----
  const flagsN = 130, flags = new THREE.InstancedMesh(new THREE.ConeGeometry(0.34, 0.8, 3), new THREE.MeshBasicMaterial({ color: 0xffffff }), flagsN);
  let fi = 0;
  for (let z = START_Z + 2; z > backZ + 4 && fi < flagsN - 2; z -= 4.3) for (const x of [-LW / 2 - 0.4, 0, LW / 2 + 0.4]) { m4.compose(v3.set(x, 6.7 + Math.sin(z) * 0.2, z), q.setFromEuler(e.set(Math.PI, 0.3, 0)), s3.set(1, 1, 1)); flags.setMatrixAt(fi, m4); flags.setColorAt(fi, c4.setHex(PALETTE[(fi * 3 + 1) % PALETTE.length])); fi++; }
  flags.count = fi; flags.frustumCulled = false; scene.add(flags);
  // touwtjes met lampjes (statisch)
  scene.add(mesh(new THREE.BoxGeometry(0.06, 0.06, wallLen), mat(0x222222), { cast: false, pos: [0, 7.1, midZ] }));
  scene.add(mesh(new THREE.BoxGeometry(0.06, 0.06, wallLen), mat(0x222222), { cast: false, pos: [LANE_CX[1], 7.1, midZ] }));
  scene.add(mesh(new THREE.BoxGeometry(0.06, 0.06, wallLen), mat(0x222222), { cast: false, pos: [LANE_CX[0], 7.1, midZ] }));

  // ---- start- en finishboog ----
  const archM = mat(0xff6ac0), archM2 = mat(0x3ad0e8);
  const arch = (z, txt, big) => {
    for (const sx of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(0.9, 8.5, 0.9), sx > 0 ? archM2 : archM, { cast: false, pos: [sx * (outerX - 0.55), 4.25, z] }));
    scene.add(mesh(new THREE.BoxGeometry(outerX * 2, 1.3, 0.7), mat(0xffe14a), { cast: false, pos: [0, 8.4, z] }));
    const sgn = new THREE.Mesh(new THREE.PlaneGeometry(big ? 11 : 9, big ? 2.2 : 1.8), new THREE.MeshBasicMaterial({ map: labelTex(txt, '#ffffff', 1024, 192, 130, null), transparent: true, depthWrite: false })); sgn.position.set(0, 8.4, z + 0.4); scene.add(sgn);
  };
  arch(FINISH_Z - 0.5, 'FINISH!', true);
  const startSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: labelTex('DEURENRACE', '#ffe14a', 1024, 192, 130), transparent: true, depthWrite: false })); startSign.rotation.x = -Math.PI / 2; startSign.position.set(0, 0.07, START_Z + 5.2); scene.add(startSign);

  mergeStatic(scene, first);

  // ---- orbs (item-blokken): per baan 2 per gat tussen de muren ----
  const bt = boxTex(); const boxM = new THREE.MeshStandardMaterial({ map: bt, emissive: 0x553366, emissiveIntensity: 0.5, roughness: 0.4 });
  const boxG = new THREE.BoxGeometry(0.95, 0.95, 0.95), ringG = new THREE.TorusGeometry(0.75, 0.05, 6, 20);
  for (let p = 0; p < 2; p++) {
    W.orbs[p] = rows.orbs.map((o) => {
      const g = new THREE.Group(); g.userData.dynamic = true; g.position.set(LANE_CX[p] + o.dx, 1.2, o.z);
      const b = new THREE.Mesh(boxG, boxM); b.castShadow = false; g.add(b);
      const ring = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = Math.PI / 2; g.add(ring);
      scene.add(g);
      return { g, b, ring, x: LANE_CX[p] + o.dx, z: o.z, kind: o.kind, alive: true, ph: rng() * 6, pop: 0 };
    });
  }

  // ---- kijkgat-gloed (per baan), Deurman bij de finish ----
  W.glow = [0, 1].map(() => {
    const g = new THREE.Group(); g.visible = false;
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(3, 4.4), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0x6aff9a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 })));
    const ar = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 4), new THREE.MeshBasicMaterial({ color: 0x6aff9a })); ar.rotation.x = Math.PI; ar.position.y = 3.1; g.add(ar); g.userData.arrow = ar;
    scene.add(g); return g;
  });
  const dm = friendlyDeurman(1.0, { hat: true }); const hold = new THREE.Group(); hold.add(dm.group); hold.position.set(0, 0, FINISH_Z - 7); hold.scale.setScalar(1.6); scene.add(hold); W.deurman = dm;
  W.finishDeurman = hold;

  // ---- per frame ----
  W.update = (dt, t, camZ) => {
    W.t = t;
    // deuren (ver weg: niet tekenen, spaart draw calls)
    for (let p = 0; p < 2; p++) for (let r = 0; r < ROWS; r++) { const vis = Math.abs(rowZ(r) - camZ) < 62; for (const d of W.doors[p][r]) {
      if (d.g.visible !== vis) d.g.visible = vis; if (!vis) continue;
      const tg = Math.max(d.target, d.peek);
      d.open = damp(d.open, tg, d.target > 0 ? 9 : 7, dt);
      if (d.shakeT > 0) d.shakeT -= dt;
      let sh = d.shakeT > 0 ? Math.sin(t * 55) * 0.06 * Math.min(1, d.shakeT * 3) : 0;
      if (d.real && d.target === 0 && rows[r].clue === 'kraak' && kraakPhase(t, r) < 0.5) sh += Math.sin(t * 38) * 0.035;
      d.g.rotation.y = d.hinge * (d.open * 1.75) + sh;
    } }
    // orbs
    for (let p = 0; p < 2; p++) for (const o of W.orbs[p]) {
      if (o.alive) { const v = Math.abs(o.z - camZ) < 62; if (o.g.visible !== v) o.g.visible = v; if (!v) continue; }
      if (!o.alive) { if (o.g.visible) { o.pop += dt * 4; o.g.scale.setScalar(Math.max(0.001, 1 - o.pop)); if (o.pop >= 1) o.g.visible = false; } continue; }
      o.g.position.y = 1.25 + Math.sin(t * 2.4 + o.ph) * 0.18; o.b.rotation.y = t * 1.6 + o.ph; o.b.rotation.x = Math.sin(t + o.ph) * 0.3; o.ring.rotation.z = t * 2;
    }
    // fakkels flikkeren
    const { m4, v3, q, s3 } = W.flameM;
    for (let i = 0; i < W.flameN; i++) { const pp = W.torchPos[i]; const f = 1 + Math.sin(t * 13 + i * 2.1) * 0.15 + Math.sin(t * 7.7 + i) * 0.1; m4.compose(v3.set(pp[0], 4.95, pp[1]), q.identity(), s3.set(1, f, 1)); W.flames.setMatrixAt(i, m4); }
    W.flames.instanceMatrix.needsUpdate = true;
    // decor-deur die open klapt
    const dO = W.decorOpen; dO.t -= dt;
    if (dO.i >= 0) { const u = Math.max(0, dO.t) / 0.9; decorPlace(dO.i, Math.sin(Math.PI * (1 - u))); dLeaf.instanceMatrix.needsUpdate = dKnob.instanceMatrix.needsUpdate = true; if (dO.t <= 0) { decorPlace(dO.i, 0); dO.i = -1; dO.t = 0.5 + Math.random() * 1.2; } }
    else if (dO.t <= 0) { const i = Math.floor(Math.random() * ND); if (Math.abs(decor[i].z - camZ) < 40) { dO.i = i; dO.t = 0.9; } else dO.t = 0.05; }
    // finish-Deurman danst
    const dd = W.deurman; dd.speed = 0; dd.update(dt);
    dd.arms[0].rotation.x = -2.9 + Math.sin(t * 5) * 0.3; dd.arms[1].rotation.x = -2.9 - Math.sin(t * 5) * 0.3; dd.arms[0].rotation.z = 0.5; dd.arms[1].rotation.z = -0.5;
    W.finishDeurman.position.y = Math.abs(Math.sin(t * 4)) * 0.3;
  };
  return W;
}
