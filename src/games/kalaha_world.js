import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';

// Omgeving van "Edelsteen-Kalaha": een kermiskraam bij nacht. Houten kist-bord op een tafel, gloeilampjes, vlaggetjes,
// een reuzenrad en tenten op de achtergrond. Alles procedureel; weinig draw calls (instancing + samengevoegde geometrie).

export const DX = 1.8, ROWZ = 1.15, STX = 6.9, PIT_R = 0.84, TOP_Y = 0.86, FLOOR_Y = 0.05;
export const GROUND_Y = -3.7;
const BW = 17.8, BD = 6.3;       // bordafmetingen

// middelpunt van kuiltje/schatkamer i (0..13)
export function pitPos(i) {
  if (i < 6) return { x: (2.5 - i) * DX, z: ROWZ };
  if (i === 6) return { x: -STX, z: 0 };
  if (i === 13) return { x: STX, z: 0 };
  return { x: (i - 7 - 2.5) * DX, z: -ROWZ };
}

function rrect(p, x, y, w, h, r) {
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r); p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
}
// voegt geometrieën samen tot één mesh-geometrie met vertexkleuren: items = [[geo, hex]]
export function mergeColored(items) {
  const gs = items.map(([g, c]) => { const n = g.index ? g.toNonIndexed() : g.clone(); return [n, new THREE.Color(c)]; });
  const cnt = gs.reduce((a, [g]) => a + g.attributes.position.count, 0);
  const pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), col = new Float32Array(cnt * 3); let o = 0;
  for (const [g, c] of gs) {
    const k = g.attributes.position.count; pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < k; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += k; g.dispose();
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return mg;
}
const xf = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => { const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s]))); g.applyMatrix4(m); return g; };

function woodTex() {
  return canvasTex(512, 256, (g, w, h) => {
    const r = mulberry32(21);
    g.fillStyle = '#6b3d1e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const y = r() * h; g.strokeStyle = `rgba(${r() < 0.5 ? '40,20,8' : '150,95,50'},${0.12 + r() * 0.2})`; g.lineWidth = 1 + r() * 3; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 64) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 4 + (r() - 0.5) * 3); g.stroke(); }
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(30,14,4,.4)'; g.beginPath(); g.ellipse(r() * w, r() * h, 8 + r() * 12, 4 + r() * 5, 0, 0, TAU); g.fill(); }
  }, { repeat: [0.11, 0.2] });
}
function gingham() {
  return canvasTex(128, 128, (g) => { g.fillStyle = '#fff6e6'; g.fillRect(0, 0, 128, 128); g.fillStyle = 'rgba(214,56,60,.85)'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); g.fillStyle = 'rgba(214,56,60,.45)'; g.fillRect(64, 0, 64, 64); g.fillRect(0, 64, 64, 64); }, { repeat: [9, 4] });
}
function feltTex() {   // vilt-bodem met gekleurde kuiltjes (Wes groen, Jor blauw) en rode schatkamers
  const PX = 64;
  return canvasTex(Math.round(BW * PX), Math.round(BD * PX), (g, w, h) => {
    g.fillStyle = '#1c0e06'; g.fillRect(0, 0, w, h);
    const X = (x) => w / 2 + x * PX, Z = (z) => h / 2 + z * PX;
    for (let i = 0; i < 14; i++) {
      const p = pitPos(i);
      if (i === 6 || i === 13) {
        const gr = g.createLinearGradient(X(p.x), Z(-2.4), X(p.x), Z(2.4)); gr.addColorStop(0, '#5a0f2a'); gr.addColorStop(0.5, '#a01e46'); gr.addColorStop(1, '#5a0f2a');
        g.fillStyle = gr; g.beginPath(); g.roundRect(X(p.x - 1.2), Z(-2.45), 2.4 * PX, 4.9 * PX, 1.05 * PX); g.fill();
      } else {
        const c0 = i < 6 ? ['#3fd17f', '#0e5a30'] : ['#5b9bff', '#1a3f94'];
        const gr = g.createRadialGradient(X(p.x), Z(p.z), 4, X(p.x), Z(p.z), PIT_R * PX); gr.addColorStop(0, c0[0]); gr.addColorStop(0.75, c0[1]); gr.addColorStop(1, '#050505');
        g.fillStyle = gr; g.beginPath(); g.arc(X(p.x), Z(p.z), (PIT_R + 0.05) * PX, 0, TAU); g.fill();
      }
    }
  });
}
function numTex(n, css) {
  return canvasTex(96, 96, (g, w, h) => {
    g.font = 'bold 66px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 12; g.strokeStyle = 'rgba(20,8,30,.92)'; g.lineJoin = 'round'; g.strokeText(String(n), w / 2, h / 2 + 3); g.fillStyle = css; g.fillText(String(n), w / 2, h / 2 + 3);
  });
}
function signTex(text) {
  return canvasTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#d8372c'); gr.addColorStop(1, '#8f1c24'); g.fillStyle = gr; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 38); g.fill();
    g.lineWidth = 12; g.strokeStyle = '#ffd24a'; g.stroke();
    g.fillStyle = '#ffd24a'; for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(40 + i * 37.5, 26, 7, 0, TAU); g.arc(40 + i * 37.5, h - 26, 7, 0, TAU); g.fill(); }
    g.font = 'bold 118px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 16; g.strokeStyle = '#4a0d12'; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 6, w - 90); g.fillStyle = '#fff2c0'; g.fillText(text, w / 2, h / 2 + 6, w - 90);
  });
}

export function buildWorld(ctx, L) {
  const { scene } = ctx;
  const W = { counts: [], numCache: new Map(), t: 0 };
  const rng = mulberry32(4242);
  scene.background = new THREE.Color(0x0a0a22);
  scene.fog = new THREE.Fog(0x120d30, 55, 120);

  // ---------------- grond + tafel ----------------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), new THREE.MeshStandardMaterial({ map: tex.cobble(36, 36), color: 0x8a7a80, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = GROUND_Y; ground.receiveShadow = true; scene.add(ground);
  const rug = new THREE.Mesh(new THREE.CircleGeometry(19, 48), new THREE.MeshStandardMaterial({ roughness: 1, map: canvasTex(512, 512, (g, w, h) => {
    const c = w / 2; const cols = ['#8a1f2e', '#e8b84a', '#2a4a9a', '#e8412c', '#fff0c8'];
    for (let r = 11; r >= 0; r--) { g.fillStyle = cols[r % cols.length]; g.beginPath(); g.arc(c, c, c * (r + 1) / 12, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(255,240,200,.55)'; g.lineWidth = 3; for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; g.beginPath(); g.moveTo(c + Math.cos(a) * c * 0.35, c + Math.sin(a) * c * 0.35); g.lineTo(c + Math.cos(a) * c * 0.98, c + Math.sin(a) * c * 0.98); g.stroke(); }
  }) }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = GROUND_Y + 0.03; rug.receiveShadow = true; scene.add(rug);
  const cloth = new THREE.MeshStandardMaterial({ map: gingham(), roughness: 1 });
  const tw = 10.4, td = 5.2;
  scene.add(mesh(new THREE.BoxGeometry(tw * 2, 0.5, td * 2), cloth, { pos: [0, -0.25, 0] }));
  const skirt = mesh(new THREE.BoxGeometry(tw * 2 - 0.4, 2.6, td * 2 - 0.4), new THREE.MeshStandardMaterial({ color: 0xc92f3a, roughness: 1 }), { pos: [0, -1.8, 0], cast: false });
  scene.add(skirt);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) scene.add(mesh(new THREE.CylinderGeometry(0.35, 0.45, GROUND_Y + 3.1 < 0 ? 0.5 - GROUND_Y - 0.5 : 1, 8), mat(0x5a3a1e), { pos: [sx * (tw - 0.8), GROUND_Y / 2 - 0.2, sz * (td - 0.8)], cast: false }));

  // ---------------- bord (kist) ----------------
  const wood = new THREE.MeshStandardMaterial({ map: woodTex(), color: 0xffffff, roughness: 0.7, metalness: 0 });
  const sh = new THREE.Shape(); rrect(sh, -BW / 2, -BD / 2, BW, BD, 1.0);
  for (let i = 0; i < 14; i++) {
    const p = pitPos(i); const hole = new THREE.Path();
    if (i === 6 || i === 13) rrect(hole, p.x - 1.2, -2.4, 2.4, 4.8, 1.05); else hole.absarc(p.x, -p.z, PIT_R, 0, TAU, true);
    sh.holes.push(hole);
  }
  const bgeo = new THREE.ExtrudeGeometry(sh, { depth: TOP_Y - 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 1, curveSegments: 18 });
  bgeo.rotateX(-Math.PI / 2); bgeo.translate(0, 0.06, 0);
  const board = new THREE.Mesh(bgeo, wood); board.castShadow = true; board.receiveShadow = true; scene.add(board);
  const felt = new THREE.Mesh(new THREE.PlaneGeometry(BW, BD), new THREE.MeshStandardMaterial({ map: feltTex(), roughness: 1 }));
  felt.rotation.x = -Math.PI / 2; felt.position.y = FLOOR_Y; felt.receiveShadow = true; scene.add(felt);
  // gouden randjes + hoekknoppen
  const gold = [];
  for (let i = 0; i < 14; i++) {
    const p = pitPos(i);
    if (i === 6 || i === 13) { const s2 = new THREE.Shape(); rrect(s2, p.x - 1.3, -2.5, 2.6, 5.0, 1.1); const h2 = new THREE.Path(); rrect(h2, p.x - 1.2, -2.4, 2.4, 4.8, 1.0); s2.holes.push(h2); gold.push([xf(new THREE.ShapeGeometry(s2, 12), 0, TOP_Y + 0.012, 0, -Math.PI / 2), 0xf2c230]); }
    else gold.push([xf(new THREE.RingGeometry(PIT_R + 0.0, PIT_R + 0.1, 28), p.x, TOP_Y + 0.012, p.z, -Math.PI / 2), 0xf2c230]);
  }
  { const s3 = new THREE.Shape(); rrect(s3, -BW / 2 + 0.28, -BD / 2 + 0.28, BW - 0.56, BD - 0.56, 0.8); const h3 = new THREE.Path(); rrect(h3, -BW / 2 + 0.4, -BD / 2 + 0.4, BW - 0.8, BD - 0.8, 0.7); s3.holes.push(h3); gold.push([xf(new THREE.ShapeGeometry(s3, 10), 0, TOP_Y + 0.012, 0, -Math.PI / 2), 0xf2c230]); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gold.push([xf(new THREE.SphereGeometry(0.38, 10, 8), sx * (BW / 2 - 0.5), TOP_Y + 0.1, sz * (BD / 2 - 0.5)), 0xf2c230]);
  const goldMesh = new THREE.Mesh(mergeColored(gold), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.35, emissive: 0x6a4a08, emissiveIntensity: 0.5 }));
  goldMesh.receiveShadow = true; scene.add(goldMesh);

  // ---------------- tellers (sprites met getal) ----------------
  W.numTex = (n, i) => { const css = (i === 6 || i === 13) ? '#ffe14a' : i < 6 ? '#8dffb5' : '#a9cbff'; const k = n + '|' + css; let t = W.numCache.get(k); if (!t) { t = numTex(n, css); W.numCache.set(k, t); } return t; };
  for (let i = 0; i < 14; i++) {
    const p = pitPos(i); const store = i === 6 || i === 13;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.numTex(4, i), transparent: true, depthTest: false }));
    const sc = store ? 1.25 : 0.88; sp.scale.set(sc, sc, 1); sp.renderOrder = 12;
    const side = (i < 6 || i === 6) ? 1 : -1;
    sp.position.set(p.x, TOP_Y + 0.35, store ? side * (BD / 2 - 0.1) * (i === 6 ? 1 : -1) : p.z + (i < 6 ? 1 : -1) * 1.5);
    scene.add(sp); W.counts[i] = { sp, n: -1 };
  }
  W.setCount = (i, n) => { const c = W.counts[i]; if (c.n === n) return; c.n = n; c.sp.material.map = W.numTex(n, i); };

  // ---------------- edelstenen (één InstancedMesh) ----------------
  W.GEMS = 54;
  const gg = new THREE.IcosahedronGeometry(1, 0); gg.scale(1, 0.85, 1);
  const gm = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 140, specular: 0xffffff, flatShading: true, emissive: 0x2a2a2a });
  W.gemMesh = new THREE.InstancedMesh(gg, gm, W.GEMS); W.gemMesh.frustumCulled = false; W.gemMesh.castShadow = true;
  W.gemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pal = [0xff3a5c, 0x34e08a, 0x3a8cff, 0xffc233, 0xc86bff, 0x34e6e6, 0xff8a3a, 0xff7ad0];
  W.gemColors = [];
  for (let g = 0; g < W.GEMS; g++) { const c = new THREE.Color(pal[g % pal.length]); W.gemColors.push(c); W.gemMesh.setColorAt(g, c); }
  scene.add(W.gemMesh);
  W.setGemColor = (g, hex) => { W.gemMesh.setColorAt(g, W.gemColors[g].set(hex)); W.gemMesh.instanceColor.needsUpdate = true; };

  // ---------------- handschoenen, cursors ----------------
  W.gloves = [0, 1].map((i) => {
    const col = i ? 0x4a8cff : 0x35c46f; const it = [[xf(new THREE.SphereGeometry(0.42, 10, 8), 0, 0, 0, 0, 0, 0, [1, 0.85, 1]), 0xffffff]];
    for (let k = 0; k < 4; k++) it.push([xf(new THREE.CapsuleGeometry(0.1, 0.34, 3, 6), (k - 1.5) * 0.19, -0.42, 0.04), 0xffffff]);
    it.push([xf(new THREE.CapsuleGeometry(0.1, 0.26, 3, 6), 0.4, -0.12, 0.1, 0, 0, -0.9), 0xffffff]);
    it.push([xf(new THREE.CylinderGeometry(0.4, 0.44, 0.3, 10), 0, 0.42, 0), col]);
    const m = new THREE.Mesh(mergeColored(it), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true }));
    m.castShadow = true; const g = new THREE.Group(); g.add(m); g.visible = false; scene.add(g); return g;
  });
  W.cursor = [0, 1].map((i) => {
    const col = i ? 0x4a8cff : 0x35e27a; const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(PIT_R + 0.02, PIT_R + 0.28, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = TOP_Y + 0.03; g.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 4), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, flatShading: true })); arrow.rotation.x = Math.PI; arrow.position.y = 2.7; g.add(arrow);
    g.userData = { ring, arrow }; g.visible = false; scene.add(g); return g;
  });
  const mk = (color, r0, r1) => { const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 28), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return m; };
  W.landRing = mk(0xffe14a, 0.45, 0.62); W.thiefRing = mk(0xff4a4a, PIT_R + 0.02, PIT_R + 0.14);
  W.bars = [0, 1].map((i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: i ? 0x4a8cff : 0x35e27a })); m.position.set(0, 0.1, (i ? -1 : 1) * (BD / 2 + 0.6)); m.visible = false; scene.add(m); return m; });

  // ---------------- krukjes: krukken/stoelen/kraam-details ----------------
  // krukken voor de broers (x = -12.6 / +12.6)
  W.stools = [0, 1].map((i) => { const g = new THREE.Group(); g.add(mesh(new THREE.CylinderGeometry(0.9, 0.8, 0.28, 12), mat(0xc8873a), { pos: [0, 0, 0] })); g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6), mat(0x6a4a2a), { pos: [0, -1.3, 0], cast: false })); g.add(mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 10), mat(0x6a4a2a), { pos: [0, -2.4, 0], cast: false })); g.position.set((i ? 1 : -1) * 11.7, -1.15, 1.0); scene.add(g); return g; });

  // ---------------- gloeilampjes + vlaggetjes ----------------
  // kabels tussen palen: bogen met lampjes
  const poles = [[-15, -2], [15, -2], [-15, -12], [15, -12], [0, -12.5]]; const arcs = [[0, 2], [1, 3], [2, 4], [4, 3]];
  for (const [px, pz] of poles) scene.add(mesh(new THREE.CylinderGeometry(0.16, 0.2, 9.5 - GROUND_Y, 6), mat(0x4a3320), { pos: [px, (9.5 + GROUND_Y) / 2, pz], cast: false }));
  const bulbs = []; const flags = [];
  for (const [a, b] of arcs) {
    const A = poles[a], B = poles[b]; const n = Math.round(Math.hypot(A[0] - B[0], A[1] - B[1]) / 1.4);
    for (let k = 1; k < n; k++) { const u = k / n; bulbs.push([lerp(A[0], B[0], u), 9.5 - Math.sin(u * Math.PI) * 1.7 - 0.2, lerp(A[1], B[1], u)]); }
    const nf = Math.round(n * 0.7);
    for (let k = 0; k < nf; k++) { const u = (k + 0.5) / nf; flags.push([lerp(A[0], B[0], u), 9.5 - Math.sin(u * Math.PI) * 1.7 - 0.55, lerp(A[1], B[1], u), Math.atan2(B[0] - A[0], B[1] - A[1])]); }
  }
  W.bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), bulbs.length); W.bulbMesh.frustumCulled = false;
  const dm = new THREE.Object3D(); const bcols = [0xffe08a, 0xff8ab0, 0x8ae0ff, 0xb8ff8a, 0xffb060];
  bulbs.forEach((p, k) => { dm.position.set(...p); dm.updateMatrix(); W.bulbMesh.setMatrixAt(k, dm.matrix); W.bulbMesh.setColorAt(k, new THREE.Color(bcols[k % bcols.length])); }); scene.add(W.bulbMesh);
  W.bulbBase = bulbs.map((_, k) => new THREE.Color(bcols[k % bcols.length]));
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.38, 0, 0, 0.38, 0, 0, 0, -0.75, 0], 3)); fg.computeVertexNormals();
  const fm = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }), flags.length);
  const fcol = [0xe8412c, 0xffd23f, 0x3a9ae8, 0x58c96a, 0xff6fb5];
  flags.forEach((p, k) => { dm.position.set(p[0], p[1], p[2]); dm.rotation.set(0, p[3] + Math.PI / 2, 0); dm.updateMatrix(); fm.setMatrixAt(k, dm.matrix); fm.setColorAt(k, new THREE.Color(fcol[k % fcol.length])); }); scene.add(fm);

  // ---------------- naambord boven het kraam ----------------
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(13, 3.25), new THREE.MeshBasicMaterial({ map: signTex('EDELSTEEN-KALAHA'), transparent: true, fog: false })); sign.position.set(0, 10.2, -12.4); scene.add(sign); W.sign = sign;
  const awn = mesh(new THREE.BoxGeometry(34, 0.3, 4), new THREE.MeshStandardMaterial({ map: canvasTex(256, 32, (g) => { for (let i = 0; i < 16; i++) { g.fillStyle = i % 2 ? '#fff4e0' : '#d8372c'; g.fillRect(i * 16, 0, 16, 32); } }, { repeat: [3, 1] }), roughness: 1 }), { pos: [0, 8.4, -11.5], rot: [0.25, 0, 0], cast: false }); scene.add(awn);

  // ---------------- achtergrond: reuzenrad, draaimolen, tentjes, sterren ----------------
  { // reuzenrad
    const g = new THREE.Group(); const R = 10; const it = [];
    for (const z of [-0.6, 0.6]) it.push([xf(new THREE.TorusGeometry(R, 0.16, 5, 40), 0, 0, z), 0xe8e8f0], [xf(new THREE.TorusGeometry(R * 0.55, 0.1, 5, 32), 0, 0, z), 0xd8d8e8]);
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; it.push([xf(new THREE.BoxGeometry(0.12, R * 2, 0.12), 0, 0, 0, 0, 0, a), 0xcfcfe0]); }
    it.push([xf(new THREE.CylinderGeometry(0.8, 0.8, 1.6, 10), 0, 0, 0, Math.PI / 2), 0xffd24a]);
    const wheel = new THREE.Mesh(mergeColored(it), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x333344, emissiveIntensity: 0.6 })); g.add(wheel);
    const cab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 1.2, 1.3), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x222222 }), 12); const cc = [0xe8412c, 0xffd23f, 0x3a9ae8, 0x58c96a];
    for (let k = 0; k < 12; k++) cab.setColorAt(k, new THREE.Color(cc[k % 4]));
    const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 5, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), 36);
    for (let k = 0; k < 36; k++) { const a = k / 36 * TAU; dm.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.75); dm.rotation.set(0, 0, 0); dm.updateMatrix(); lights.setMatrixAt(k, dm.matrix); lights.setColorAt(k, new THREE.Color(bcols[k % 5])); } g.add(lights);
    const leg = [[xf(new THREE.BoxGeometry(0.5, R + 3, 0.5), -4.5, -R / 2 - 1.5, 0, 0, 0, -0.38), 0x8a6a4a], [xf(new THREE.BoxGeometry(0.5, R + 3, 0.5), 4.5, -R / 2 - 1.5, 0, 0, 0, 0.38), 0x8a6a4a]];
    const stand = new THREE.Mesh(mergeColored(leg), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
    const root = new THREE.Group(); root.add(stand); root.add(g); root.add(cab); g.position.y = 0; root.position.set(-17, R + 1.5 + GROUND_Y + 3.5, -30); scene.add(root);
    W.wheel = { g, cab, R, dm: new THREE.Object3D() };
  }
  { // draaimolen-tent: kegel met strepen
    const tent = (x, z, r, h, c1, c2) => { const g = new THREE.Group(); const tx = canvasTex(128, 32, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? c1 : c2; c.fillRect(i * 16, 0, 16, 32); } }, { repeat: [3, 1] });
      g.add(mesh(new THREE.CylinderGeometry(r, r, h * 0.45, 14), new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }), { pos: [0, h * 0.225, 0], cast: false }));
      g.add(mesh(new THREE.ConeGeometry(r * 1.15, h * 0.55, 14), new THREE.MeshStandardMaterial({ map: tx, roughness: 1 }), { pos: [0, h * 0.45 + h * 0.275, 0], cast: false }));
      g.add(mesh(new THREE.SphereGeometry(0.3, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffe14a }), { cast: false, pos: [0, h + 0.2, 0] }));
      g.position.set(x, GROUND_Y, z); scene.add(g); };
    tent(15, -26, 6, 11, '#2f6fe0', '#fff4e0'); tent(-3, -34, 5, 10, '#d8357f', '#ffe9a8'); tent(26, -14, 4.5, 8, '#58c96a', '#fff4e0'); tent(-26, -14, 4.5, 8, '#ffb02e', '#6a2fd4'); tent(6, -42, 7, 14, '#d8372c', '#fff4e0');
  }
  { const n = 70, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = (rng() - 0.5) * 140; p[i * 3 + 1] = 28 + rng() * 40; p[i * 3 + 2] = -45 - rng() * 30; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }))); }
  // strooisel op de grond: kratten, tonnen
  for (const [x, z, k] of [[-17, 6, 0], [-18.5, 3, 1], [18, 5, 0], [19, 2, 1], [-19, -6, 0], [20, -7, 1]]) { const m = k ? mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.7, 10), mat(0x8a5a2e), { pos: [x, GROUND_Y + 0.85, z] }) : mesh(new THREE.BoxGeometry(1.7, 1.7, 1.7), mat(0xb98a54), { pos: [x, GROUND_Y + 0.85, z], rot: [0, x, 0] }); scene.add(m); }

  // ---------------- update ----------------
  const col = new THREE.Color();
  W.update = (t, dt) => {
    W.t = t;
    W.wheel.g.rotation.z = t * 0.12;
    for (let k = 0; k < 12; k++) { const a = k / 12 * TAU + W.wheel.g.rotation.z; W.wheel.dm.position.set(Math.cos(a) * W.wheel.R, Math.sin(a) * W.wheel.R - 1.0, 0); W.wheel.dm.rotation.set(0, 0, 0); W.wheel.dm.updateMatrix(); W.wheel.cab.setMatrixAt(k, W.wheel.dm.matrix); }
    W.wheel.cab.instanceMatrix.needsUpdate = true;
    for (let k = 0; k < W.bulbBase.length; k += 1) { const tw2 = 0.55 + 0.45 * Math.sin(t * 3 + k * 1.7); col.copy(W.bulbBase[k]).multiplyScalar(0.5 + tw2 * 0.7); W.bulbMesh.setColorAt(k, col); }
    W.bulbMesh.instanceColor.needsUpdate = true;
  };
  return W;
}
