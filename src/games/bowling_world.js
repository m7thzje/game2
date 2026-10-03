import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, mulberry32, TAU } from '../engine/util.js';

// Omgeving van "Reuzen-Bowling": een circustent met twee banen naast elkaar, een rood fluwelen gordijn met gouden franje,
// twinkelende lampjes, vlaggetjes, ballonnen en een groot scorebord. Plus de kegel-modellen (kabouter/kip/knuffelmonster).

export const LW = 2.0;                 // halve baanbreedte
export const GUT = 0.62;               // goot-breedte
export const CX = [-3.3, 3.3];         // baan-middens
export const HEAD = -11.5;             // z van de voorste kegel
export const ROW = 0.92, SPC = 1.06;   // rij-afstand en kegel-afstand
export const PIT_Z = -16.2;            // einde baan
export const FOUL = 0;

// kegelposities (0 = voorste kegel)
export const PIN_HOME = (() => { const a = []; for (let r = 0; r < 4; r++) for (let c = 0; c <= r; c++) a.push({ x: (c - r / 2) * SPC, z: HEAD - r * ROW }); return a; })();

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
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
const xf = (g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) => { _e.set(rx, ry, rz); _q.setFromEuler(_e); _s.set(...(Array.isArray(s) ? s : [s, s, s])); _m.compose(_v.set(x, y, z), _q, _s); g.applyMatrix4(_m); return g; };

// ---------------- kegels ----------------
const LATHE = [[0.0, 0], [0.3, 0], [0.34, 0.1], [0.4, 0.42], [0.37, 0.7], [0.27, 0.95], [0.19, 1.12], [0.0, 1.16]];
export const PIN_TYPES = ['kabouter', 'kip', 'monster'];
export function pinGeo(type, gold) {
  const G = (c, g2) => (gold ? g2 : c);
  const it = []; const body = (c) => xf(new THREE.LatheGeometry(LATHE.map(([r, y]) => new THREE.Vector2(r, y)), 14), 0, 0, 0);
  if (type === 'kabouter') {
    it.push([body(), G(0x2f6fe0, 0xffd23f)]);
    it.push([xf(new THREE.CylinderGeometry(0.405, 0.405, 0.1, 14), 0, 0.5, 0), G(0xffe14a, 0xffb020)]);
    it.push([xf(new THREE.SphereGeometry(0.29, 12, 10), 0, 1.38, 0), G(0xf6c9a0, 0xffe58a)]);
    it.push([xf(new THREE.ConeGeometry(0.34, 0.85, 10), 0, 1.98, -0.02, -0.12), G(0xe8372c, 0xffb020)]);
    it.push([xf(new THREE.ConeGeometry(0.24, 0.6, 8), 0, 1.0, 0.2, Math.PI + 0.25), G(0xffffff, 0xfff0b0)]);
    it.push([xf(new THREE.SphereGeometry(0.075, 8, 6), 0, 1.37, 0.29), G(0xff8aa0, 0xffb020)]);
    for (const s of [-1, 1]) it.push([xf(new THREE.SphereGeometry(0.04, 6, 5), s * 0.1, 1.5, 0.25), 0x151515]);
  } else if (type === 'kip') {
    it.push([body(), G(0xffffff, 0xffd23f)]);
    it.push([xf(new THREE.SphereGeometry(0.3, 12, 10), 0, 1.36, 0), G(0xffffff, 0xffe27a)]);
    for (let k = 0; k < 3; k++) it.push([xf(new THREE.SphereGeometry(0.1, 7, 6), (k - 1) * 0.12, 1.7 + (k === 1 ? 0.05 : 0), 0.02), G(0xe8372c, 0xffa010)]);
    it.push([xf(new THREE.ConeGeometry(0.1, 0.3, 6), 0, 1.33, 0.36, Math.PI / 2), G(0xffb02e, 0xff9010)]);
    it.push([xf(new THREE.SphereGeometry(0.09, 7, 6), 0, 1.15, 0.22), G(0xe8372c, 0xffa010)]);
    for (const s of [-1, 1]) {
      it.push([xf(new THREE.SphereGeometry(0.04, 6, 5), s * 0.11, 1.44, 0.26), 0x151515]);
      it.push([xf(new THREE.SphereGeometry(1, 8, 6), s * 0.4, 0.66, 0, 0, 0, -s * 0.5, [0.1, 0.3, 0.22]), G(0xeeeeee, 0xffc830)]);
    }
    for (let k = -1; k <= 1; k++) it.push([xf(new THREE.ConeGeometry(0.1, 0.5, 5), k * 0.14, 0.9, -0.35, -0.9, 0, -k * 0.3), G(0xf2f2f2, 0xffb830)]);
  } else {
    it.push([xf(new THREE.IcosahedronGeometry(1, 1), 0, 0.5, 0, 0, 0, 0, [0.4, 0.72, 0.4]), G(0x8a4ad8, 0xffd23f)]);
    it.push([body(), G(0x8a4ad8, 0xffd23f)]);
    it.push([xf(new THREE.IcosahedronGeometry(0.34, 1), 0, 1.36, 0), G(0xa05af0, 0xffe27a)]);
    it.push([xf(new THREE.SphereGeometry(0.2, 10, 8), 0, 0.55, 0.28, 0, 0, 0, [1, 1.3, 0.5]), G(0xd8b8ff, 0xfff0b0)]);
    it.push([xf(new THREE.SphereGeometry(0.15, 10, 8), 0, 1.44, 0.28), 0xffffff]); it.push([xf(new THREE.SphereGeometry(0.075, 8, 6), 0, 1.44, 0.4), 0x151515]);
    for (const s of [-1, 1]) {
      it.push([xf(new THREE.ConeGeometry(0.08, 0.4, 5), s * 0.2, 1.8, 0, 0, 0, -s * 0.35), G(0xff8a2a, 0xffa010)]);
      it.push([xf(new THREE.ConeGeometry(0.04, 0.12, 4), s * 0.07, 1.2, 0.33, Math.PI), 0xffffff]);
      it.push([xf(new THREE.SphereGeometry(0.14, 8, 6), s * 0.42, 0.78, 0.05), G(0x8a4ad8, 0xffd23f)]);
    }
  }
  return mergeColored(it);
}
export function crownGeo() {
  const it = []; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; it.push([xf(new THREE.ConeGeometry(0.07, 0.24, 4), Math.cos(a) * 0.17, 0.0, Math.sin(a) * 0.17), 0xffd23f]); }
  it.push([xf(new THREE.CylinderGeometry(0.19, 0.17, 0.1, 10), 0, -0.1, 0), 0xffb020]);
  return mergeColored(it);
}

// ---------------- bal ----------------
export function ballTexture(css, css2) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = css; g.fillRect(0, 0, w, h);
    g.strokeStyle = css2; g.lineWidth = 14; g.lineCap = 'round';
    for (let k = 0; k < 4; k++) { g.beginPath(); for (let x = 0; x <= w; x += 8) { const y = h * (0.15 + k * 0.23) + Math.sin(x * 0.05 + k * 1.3) * 14; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 0; k < 14; k++) { g.beginPath(); g.arc((k * 97) % w, (k * 53) % h, 3, 0, TAU); g.fill(); }
  });
}

function bannerTex(text, c1, c2) {
  return canvasTex(1024, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 40); g.fill();
    g.lineWidth = 12; g.strokeStyle = '#ffd24a'; g.stroke();
    g.font = 'bold 120px Fredoka, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 16; g.strokeStyle = '#3a0a10'; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 6, w - 90); g.fillStyle = '#fff2c0'; g.fillText(text, w / 2, h / 2 + 6, w - 90);
  });
}
function laneTex() {
  const W = 256, H = 1024; // 4 breed x 18.6 lang
  return canvasTex(W, H, (g, w, h) => {
    const r = mulberry32(5);
    g.fillStyle = '#e8c07a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 20; i++) { g.fillStyle = i % 2 ? 'rgba(180,120,50,.18)' : 'rgba(255,230,170,.2)'; g.fillRect(i * w / 20, 0, w / 20, h); g.strokeStyle = 'rgba(110,70,30,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(i * w / 20, 0); g.lineTo(i * w / 20, h); g.stroke(); }
    for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(120,80,30,${0.05 + r() * 0.12})`; g.lineWidth = 1; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y + 20 + r() * 40); g.stroke(); }
    const zy = (z) => h * (z + 17) / 18.6;    // z -> pixel (bovenkant van de textuur = einde baan z=-17, onderkant = z=+1.6)
    // foullijn
    g.fillStyle = '#d8372c'; g.fillRect(0, zy(0) - 5, w, 10);
    // pijltjes (de klassieke driehoekjes)
    g.fillStyle = 'rgba(120,40,20,.75)';
    for (let k = -3; k <= 3; k++) { const x = w / 2 + k * w * 0.1, y = zy(-4.8 - Math.abs(k) * 0.6); g.beginPath(); g.moveTo(x, y - 28); g.lineTo(x - 10, y + 12); g.lineTo(x + 10, y + 12); g.fill(); }
    for (let k = -3; k <= 3; k++) { const x = w / 2 + k * w * 0.11, y = zy(-1.2); g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
    // kegelvak
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, zy(-10.4), w, zy(-15.2) - zy(-10.4));
    for (const p of PIN_HOME) { g.fillStyle = 'rgba(40,20,10,.35)'; g.beginPath(); g.arc(w / 2 + p.x * w / 4.0, zy(p.z), 7, 0, TAU); g.fill(); }
  });
}
function curtainTex() {
  return canvasTex(512, 256, (g, w, h) => {
    for (let i = 0; i < 16; i++) { const gr = g.createLinearGradient(i * 32, 0, i * 32 + 32, 0); gr.addColorStop(0, '#5a0a1c'); gr.addColorStop(0.5, '#b01835'); gr.addColorStop(1, '#5a0a1c'); g.fillStyle = gr; g.fillRect(i * 32, 0, 32, h); }
    g.fillStyle = '#ffd24a'; g.fillRect(0, h - 26, w, 12); for (let i = 0; i < 64; i++) g.fillRect(i * 8 + 2, h - 14, 3, 14);
  });
}
function stripeTex(c1, c2, n = 16) { return canvasTex(256, 64, (g, w, h) => { for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * w / n, 0, w / n + 1, h); } }, { repeat: [3, 1] }); }

export function buildWorld(ctx) {
  const { scene } = ctx;
  const W = { t: 0 };
  const rng = mulberry32(99);
  scene.background = new THREE.Color(0x1a0f2a); scene.fog = new THREE.Fog(0x1a0f2a, 45, 110);

  // vloer: ruitjes + tent
  const floorT = canvasTex(128, 128, (g) => { g.fillStyle = '#7a3a2a'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#e8c890'; g.fillRect(0, 0, 64, 64); g.fillRect(64, 64, 64, 64); }, { repeat: [24, 24] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.9, color: 0xb0a0a8 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -0.31, -8); floor.receiveShadow = true; scene.add(floor);
  const tent = new THREE.Mesh(new THREE.CylinderGeometry(34, 34, 22, 24, 1, true), new THREE.MeshStandardMaterial({ map: stripeTex('#fff0d8', '#d8372c', 24), side: THREE.BackSide, roughness: 1 })); tent.position.set(0, 10, -8); scene.add(tent);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(34, 12, 24, 1, true), new THREE.MeshStandardMaterial({ map: stripeTex('#fff0d8', '#2f6fe0', 24), side: THREE.BackSide, roughness: 1 })); roof.position.set(0, 27, -8); scene.add(roof);

  // banen
  const lt = laneTex();
  W.laneMats = [];
  for (let i = 0; i < 2; i++) {
    const cx = CX[i];
    const lane = new THREE.Mesh(new THREE.BoxGeometry(LW * 2, 0.3, 18.6), [mat(0x8a5a2a), mat(0x8a5a2a), new THREE.MeshStandardMaterial({ map: lt, roughness: 0.35, metalness: 0.05 }), mat(0x8a5a2a), mat(0x8a5a2a), mat(0x8a5a2a)]);
    lane.position.set(cx, -0.15, -7.7); lane.receiveShadow = true; scene.add(lane);
    for (const s of [-1, 1]) {
      const g = mesh(new THREE.BoxGeometry(GUT, 0.2, 18.6), mat(0x241628), { cast: false, pos: [cx + s * (LW + GUT / 2), -0.3, -7.7] }); scene.add(g);
      scene.add(mesh(new THREE.BoxGeometry(0.16, 0.34, 18.6), mat(0x4a2a1a), { cast: false, pos: [cx + s * (LW + GUT + 0.08), -0.15, -7.7] }));
    }
    // kegelput (donker) + achterkussen
    scene.add(mesh(new THREE.BoxGeometry(LW * 2 + GUT * 2, 0.2, 3.2), mat(0x120a18), { cast: false, pos: [cx, -0.34, -17.5] }));
    scene.add(mesh(new THREE.BoxGeometry(LW * 2 + GUT * 2, 1.8, 0.6), mat(0x6a1428), { pos: [cx, 0.6, -19.0] }));
  }
  // middenstuk: terugloop-buis + versiering
  scene.add(mesh(new THREE.BoxGeometry(1.0, 0.5, 18.6), mat(0x5a3a22), { pos: [0, -0.05, -7.7] }));
  scene.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 17.8, 10), mat(0xd8372c), { pos: [0, 0.4, -7.7], rot: [Math.PI / 2, 0, 0], cast: false }));
  // buitenranden
  for (const s of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(1.4, 0.6, 18.6), mat(0x5a3a22), { pos: [s * (CX[1] + LW + GUT + 0.9), 0, -7.7] }));

  // gordijn + clown-boog
  const curt = new THREE.Mesh(new THREE.PlaneGeometry(36, 14), new THREE.MeshStandardMaterial({ map: curtainTex(), roughness: 1 })); curt.position.set(0, 7, -20.5); scene.add(curt);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.75), new THREE.MeshBasicMaterial({ map: bannerTex('REUZEN-BOWLING', '#2f6fe0', '#1a3a94'), transparent: true, fog: false })); sign.position.set(0, 8.6, -20.3); scene.add(sign);
  // marquee: lampjes boven elke baan
  const bulbs = [];
  for (const cx of CX) for (let k = 0; k <= 20; k++) { const a = Math.PI * k / 20; bulbs.push([cx + Math.cos(a) * 3.4, 1.0 + Math.sin(a) * 3.6, -19.7]); }
  W.bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), bulbs.length); W.bulbMesh.frustumCulled = false;
  const dm = new THREE.Object3D(); const bc = [0xffe08a, 0xff8ab0, 0x8ae0ff, 0xb8ff8a, 0xffb060]; W.bulbBase = bulbs.map((_, k) => new THREE.Color(bc[k % 5]));
  bulbs.forEach((p, k) => { dm.position.set(...p); dm.updateMatrix(); W.bulbMesh.setMatrixAt(k, dm.matrix); W.bulbMesh.setColorAt(k, W.bulbBase[k]); }); scene.add(W.bulbMesh);
  // vlaggetjes tussen palen boven de banen
  const flags = []; for (let row = 0; row < 3; row++) { const z = -2 - row * 7; for (let k = 0; k < 26; k++) { const u = k / 25; const x = lerp(-13, 13, u); flags.push([x, 8.3 - Math.sin(u * Math.PI) * 1.4 - row * 0.2, z]); } }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.34, 0, 0, 0.34, 0, 0, 0, -0.7, 0], 3)); fg.computeVertexNormals();
  const fm = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 1 }), flags.length); const fc = [0xe8412c, 0xffd23f, 0x3a9ae8, 0x58c96a, 0xff6fb5];
  flags.forEach((p, k) => { dm.position.set(...p); dm.rotation.set(0, 0, Math.sin(k) * 0.1); dm.updateMatrix(); fm.setMatrixAt(k, dm.matrix); fm.setColorAt(k, new THREE.Color(fc[k % 5])); }); scene.add(fm);
  // ballonnen
  const bal = new THREE.InstancedMesh(new THREE.SphereGeometry(0.7, 8, 7), new THREE.MeshStandardMaterial({ roughness: 0.4 }), 18);
  for (let k = 0; k < 18; k++) { const side = k % 2 ? 1 : -1; dm.position.set(side * (9.5 + rng() * 5), 3 + rng() * 5, -4 - rng() * 14); dm.rotation.set(0, 0, 0); dm.scale.set(1, 1.2, 1); dm.updateMatrix(); bal.setMatrixAt(k, dm.matrix); bal.setColorAt(k, new THREE.Color(fc[k % 5])); } scene.add(bal); dm.scale.set(1, 1, 1);

  // scorebord boven het midden
  W.sbCanvas = document.createElement('canvas'); W.sbCanvas.width = 1024; W.sbCanvas.height = 320;
  W.sbTex = new THREE.CanvasTexture(W.sbCanvas); W.sbTex.colorSpace = THREE.SRGBColorSpace;
  const sb = new THREE.Mesh(new THREE.PlaneGeometry(9.6, 3.0), new THREE.MeshBasicMaterial({ map: W.sbTex, fog: false })); sb.position.set(0, 5.7, -19.9); scene.add(sb);
  scene.add(mesh(new THREE.BoxGeometry(10.0, 3.4, 0.2), mat(0x2a1a10), { cast: false, pos: [0, 5.7, -20.05] }));

  W.update = (t, dt) => {
    W.t = t;
    for (let k = 0; k < W.bulbBase.length; k++) { const tw = 0.55 + 0.45 * Math.sin(t * 3 + k * 0.9); const c = W.bulbBase[k]; W.bulbMesh.setColorAt(k, _c.copy(c).multiplyScalar(0.45 + tw * 0.8)); }
    W.bulbMesh.instanceColor.needsUpdate = true;
  };
  return W;
}
const _c = new THREE.Color();
