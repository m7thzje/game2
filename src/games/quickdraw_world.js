import * as THREE from 'three';
import { mat, mesh, glow, canvasTex, clamp, lerp, damp, rand, pick, TAU, mulberry32, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { makeNPC, Animal, Dragon, makeDeurman } from '../engine/chars.js';
import { mergeStatic } from './quickdraw_merge.js';

// Het fantasy-dorp bij zonsondergang voor "Snelle Vingers: Duel bij Zonsondergang".
// buildWorld(ctx) -> { update(t,dt), chicken(), bell(), crow(), deurman(), hiccup(), fire(), say(), panel, audience, ... }

const FONT = 'bold {S}px Fredoka, Arial Black, Arial, sans-serif';
export const font = (s) => FONT.replace('{S}', s);

// ---------- kleine canvas-sprites (tekstballonnen, bordjes) ----------
const bubbleCache = new Map();
function bubbleTex(text, color) {
  const key = text + color;
  let t = bubbleCache.get(key);
  if (!t) {
    t = canvasTex(512, 200, (g, w, h) => {
      g.fillStyle = '#fffdf4'; g.strokeStyle = '#2a1830'; g.lineWidth = 9; g.lineJoin = 'round';
      g.beginPath(); g.roundRect(10, 10, w - 20, h - 62, 38); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 28, h - 53); g.lineTo(w / 2, h - 8); g.lineTo(w / 2 + 28, h - 53); g.closePath(); g.fillStyle = '#fffdf4'; g.fill(); g.stroke();
      g.fillStyle = '#fffdf4'; g.fillRect(w / 2 - 24, h - 58, 48, 10);
      g.fillStyle = color; g.font = font(text.length > 12 ? 52 : 66); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, (h - 62) / 2 + 10, w - 60);
    });
    bubbleCache.set(key, t);
  }
  return t;
}

export function makeSprite(texture, w, h) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, fog: false }));
  sp.scale.set(w, h, 1); sp.renderOrder = 18; return sp;
}

// canvas die je kunt hertekenen
export function liveCanvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const o = { c, g, t, w, h, redraw(...a) { g.clearRect(0, 0, w, h); draw(g, w, h, ...a); t.needsUpdate = true; } };
  return o;
}

function crowMesh() {
  const g = new THREE.Group(); const m = mat(0x1a1722, { flatShading: false });
  g.add(mesh(new THREE.SphereGeometry(0.26, 8, 6), m, { scale: [1, 0.9, 1.55] }));
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.3); g.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), m));
  head.add(mesh(new THREE.ConeGeometry(0.06, 0.24, 4), mat(0xe8a52c), { cast: false, pos: [0, -0.02, 0.2], rot: [Math.PI / 2, 0, 0] }));
  for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.035, 5, 4), new THREE.MeshBasicMaterial({ color: 0xfff2a0 }), { cast: false, pos: [s * 0.1, 0.05, 0.1] }));
  g.add(mesh(new THREE.BoxGeometry(0.22, 0.04, 0.45), m, { pos: [0, 0.02, -0.48], rot: [0.3, 0, 0] }));
  const wings = [];
  for (const s of [-1, 1]) { const p = new THREE.Group(); p.position.set(s * 0.2, 0.08, 0); const wing = mesh(new THREE.BoxGeometry(0.62, 0.035, 0.5), m, { pos: [s * 0.31, 0, -0.05] }); p.add(wing); g.add(p); wings.push({ p, s }); }
  g.userData = { wings, head, flap: 0 };
  return g;
}

function bellMesh() {
  const pts = [[0.06, 0.95], [0.16, 0.9], [0.26, 0.62], [0.36, 0.3], [0.5, 0.05], [0.54, -0.05], [0.46, -0.05]].map(([x, y]) => new THREE.Vector2(x, y));
  const geo = new THREE.LatheGeometry(pts, 14);
  const m = new THREE.MeshStandardMaterial({ color: 0xe8b830, metalness: 0.75, roughness: 0.3, emissive: 0x4a3000, emissiveIntensity: 0.4, side: THREE.DoubleSide });
  const g = new THREE.Group(); g.add(new THREE.Mesh(geo, m));
  g.add(mesh(new THREE.SphereGeometry(0.12, 8, 6), mat(0x3a2a18), { pos: [0, -0.02, 0] }));
  g.children.forEach((c) => { c.castShadow = true; });
  return g;
}

function hayBale(x, z, ry) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.1, 12), mat(0xd8b24a, { flatShading: false }), { pos: [0, 0.7, 0], rot: [0, 0, Math.PI / 2] }));
  for (const y of [-0.3, 0.3]) g.add(mesh(new THREE.TorusGeometry(0.71, 0.03, 4, 14), mat(0x7a5a2a), { pos: [y, 0.7, 0], rot: [0, Math.PI / 2, 0] }));
  g.position.set(x, 0, z); g.rotation.y = ry; return g;
}

function wanted() {
  const t = canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#e8d3a0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6a4a22'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#4a2a12'; g.font = font(54); g.textAlign = 'center'; g.fillText('GEZOCHT', w / 2, 66);
    g.font = font(26); g.fillText('voor te snel trekken', w / 2, 98);
    g.fillStyle = '#35c46f'; g.beginPath(); g.arc(78, 170, 38, 0, TAU); g.fill();
    g.fillStyle = '#4a8cff'; g.beginPath(); g.arc(178, 170, 38, 0, TAU); g.fill();
    g.fillStyle = '#f4c9a0'; g.beginPath(); g.arc(78, 174, 26, 0, TAU); g.arc(178, 174, 26, 0, TAU); g.fill();
    g.fillStyle = '#222'; for (const x of [70, 86, 170, 186]) { g.beginPath(); g.arc(x, 170, 3.5, 0, TAU); g.fill(); }
    g.fillStyle = '#4a2a12'; g.font = font(30); g.fillText('WES & JOR', w / 2, 248); g.font = font(24); g.fillText('1000 heitjes', w / 2, 284);
  });
  return mesh(new THREE.PlaneGeometry(1.5, 1.9), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }), { cast: false });
}

export function buildWorld(ctx) {
  const { scene, audio, fx } = ctx;
  const rng = mulberry32(4242);
  const ups = [];
  const W = { ups };
  const V = new THREE.Vector3();

  // ---------------- hemel, zon, bergen ----------------
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(10, 36), new THREE.MeshBasicMaterial({ color: 0xffe0a0, fog: false }));
  sunDisc.position.set(-16, 11, -96); scene.add(sunDisc);
  for (const [r, o] of [[16, 0.22], [26, 0.12], [40, 0.07]]) {
    const gl = new THREE.Mesh(new THREE.CircleGeometry(r, 30), new THREE.MeshBasicMaterial({ color: 0xff9a50, transparent: true, opacity: o, fog: false, depthWrite: false }));
    gl.position.set(-16, 11, -97); scene.add(gl);
  }
  const clouds = [];
  const cc = [0xff8a6a, 0xffb07a, 0xd070a0, 0x8a5aa8, 0xff9a7a, 0xffc890, 0xb8609a];
  for (let i = 0; i < 9; i++) {
    const c = mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ color: cc[i % cc.length], fog: false, transparent: true, opacity: 0.85 }), { cast: false, receive: false, scale: [rand(10, 20), rand(0.8, 1.5), rand(2, 4)] });
    c.position.set(-70 + i * 17 + rand(-4, 4), rand(24, 52), -92 - rand(0, 8)); c.userData.dyn = true; scene.add(c); clouds.push(c);
  }
  ups.push((t, dt) => { for (const c of clouds) { c.position.x += dt * 0.35; if (c.position.x > 90) c.position.x = -90; } });
  const mtnCols = [0x4a3566, 0x3e2d5c, 0x56406f, 0x34264e];
  for (let i = 0; i < 9; i++) {
    const r = rand(18, 30), h = rand(15, 28);
    const m = mesh(new THREE.ConeGeometry(r, h, 7), mat(mtnCols[i % 4]), { cast: false, receive: false, pos: [-100 + i * 26 + rand(-6, 6), h / 2 - 1, -80 - (i % 3) * 7] });
    scene.add(m);
    if (h > 22) { const snow = mesh(new THREE.ConeGeometry(r * 0.3, h * 0.28, 7), mat(0xf4e6e0), { cast: false, receive: false, pos: [m.position.x, m.position.y + h * 0.36, m.position.z] }); scene.add(snow); }
  }
  // verre burcht op de heuvel
  { const hill = mesh(new THREE.ConeGeometry(16, 9, 8), mat(0x3a4a3a), { cast: false, receive: false, pos: [40, 4, -58] }); scene.add(hill);
    const cs = new THREE.Group(); cs.position.set(40, 8.5, -58);
    for (const [x, h] of [[-3, 7], [0, 10], [3, 6.5]]) { const t = P.tower(h, 1.4); t.position.x = x; cs.add(t); }
    cs.add(mesh(new THREE.BoxGeometry(9, 4, 2.4), mat(0x6a6478), { pos: [0, 2, 0] }));
    cs.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } }); scene.add(cs); }
  // ver weg-draak (silhouet, cirkelt)
  const farDragon = new THREE.Group(); farDragon.userData.dyn = true; scene.add(farDragon);
  { const dm = new THREE.MeshBasicMaterial({ color: 0x2a1c44, fog: true, side: THREE.DoubleSide });
    farDragon.add(mesh(new THREE.CapsuleGeometry(0.7, 3.2, 3, 8), dm, { cast: false, receive: false, rot: [Math.PI / 2, 0, 0] }));
    farDragon.add(mesh(new THREE.ConeGeometry(0.5, 3.0, 5), dm, { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0], pos: [0, 0, -3.6] }));
    farDragon.add(mesh(new THREE.CapsuleGeometry(0.28, 1.6, 3, 6), dm, { cast: false, receive: false, rot: [0.8, 0, 0], pos: [0, 0.9, 2.3] }));
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.8, 0, 0, -1, 4.6, 0.4, -1.4, 0, 0, 0.8, 4.6, 0.4, -1.4, 6.2, 0.7, 0.4], 3));
    farDragon.userData.wings = [1, -1].map((sd) => { const p = new THREE.Group(); const w = new THREE.Mesh(wg, dm); w.scale.x = sd; p.add(w); p.position.set(sd * 0.5, 0.5, 0.2); farDragon.add(p); return { p, sd }; }); }
  ups.push((t, dt) => { const a = t * 0.18; const f = Math.sin(t * 3.2); for (const w of farDragon.userData.wings) w.p.rotation.z = w.sd * (f * 0.6 + 0.1); farDragon.position.set(22 + Math.cos(a) * 20, 21 + Math.sin(t * 0.6) * 2, -62 + Math.sin(a) * 10); farDragon.rotation.y = -a + Math.PI; farDragon.rotation.z = -0.25; });

  // ---------------- grond ----------------
  const ground = mesh(new THREE.PlaneGeometry(260, 200), new THREE.MeshStandardMaterial({ map: tex.dirt(70, 55), roughness: 1 }), { cast: false });
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -20); scene.add(ground);
  const plaza = mesh(new THREE.CircleGeometry(10.5, 44), new THREE.MeshStandardMaterial({ map: tex.cobble(5, 5), roughness: 1 }), { cast: false, pos: [0, 0.03, -0.5], rot: [-Math.PI / 2, 0, 0] });
  scene.add(plaza);
  const road = mesh(new THREE.PlaneGeometry(7, 40), new THREE.MeshStandardMaterial({ map: tex.sand(3, 16), roughness: 1 }), { cast: false, pos: [0, 0.02, 24], rot: [-Math.PI / 2, 0, 0] });
  scene.add(road);
  // rode kruisjes waar de broers staan
  for (const x of [-3.8, 3.8]) {
    const x1 = mesh(new THREE.BoxGeometry(1.4, 0.04, 0.2), new THREE.MeshBasicMaterial({ color: 0xc42a2a }), { cast: false, receive: false, pos: [x, 0.07, 0], rot: [0, 0.785, 0] });
    const x2 = mesh(new THREE.BoxGeometry(1.4, 0.04, 0.2), new THREE.MeshBasicMaterial({ color: 0xc42a2a }), { cast: false, receive: false, pos: [x, 0.07, 0], rot: [0, -0.785, 0] });
    scene.add(x1, x2);
  }

  // ---------------- de taverne ----------------
  const tavern = new THREE.Group(); tavern.position.set(0, 0, -9); scene.add(tavern);
  const plaster = new THREE.MeshStandardMaterial({ map: tex.plaster(5, 2, '#efd9b0'), roughness: 0.95, flatShading: true });
  const stone = new THREE.MeshStandardMaterial({ map: tex.stone(5, 1), roughness: 1, flatShading: true });
  const beam = mat(0x3e2a1a);
  tavern.add(mesh(new THREE.BoxGeometry(15.4, 1.0, 7.4), stone, { pos: [0, 0.5, 0] }));
  tavern.add(mesh(new THREE.BoxGeometry(15, 3.4, 7), plaster, { pos: [0, 2.7, 0] }));            // y 1 .. 4.4
  tavern.add(mesh(new THREE.BoxGeometry(11.6, 2.5, 6.4), plaster, { pos: [0, 5.65, -0.2] }));    // y 4.4 .. 6.9
  for (const x of [-7.4, -3.7, 3.7, 7.4]) tavern.add(mesh(new THREE.BoxGeometry(0.28, 3.5, 0.28), beam, { pos: [x, 2.7, 3.55] }));
  for (const x of [-5.7, -2.9, 2.9, 5.7]) tavern.add(mesh(new THREE.BoxGeometry(0.24, 2.5, 0.24), beam, { pos: [x, 5.65, 3.05] }));
  tavern.add(mesh(new THREE.BoxGeometry(15.2, 0.3, 0.34), beam, { pos: [0, 4.42, 3.55] }));
  tavern.add(mesh(new THREE.BoxGeometry(11.8, 0.26, 0.3), beam, { pos: [0, 6.9, 3.05] }));
  // dak (gevel naar voren)
  const rm = new THREE.MeshStandardMaterial({ map: tex.roof(3, 2, '#8a3a42'), roughness: 0.95, flatShading: true });
  { const sh = new THREE.Shape(); sh.moveTo(-6.6, 0); sh.lineTo(0, 2.0); sh.lineTo(6.6, 0); sh.closePath();
    const roof = mesh(new THREE.ExtrudeGeometry(sh, { depth: 7.6, bevelEnabled: false }), rm, { pos: [0, 6.9, -4.0] }); tavern.add(roof); }
  // lagere dakjes links/rechts
  for (const s of [-1, 1]) { const r = mesh(new THREE.BoxGeometry(2.6, 0.22, 7.8), rm, { pos: [s * 6.55, 4.9, 0], rot: [0, 0, -s * 0.28] }); tavern.add(r); }
  tavern.add(mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), mat(0x7a6a5a), { pos: [3.6, 8.3, -1.8] }));
  // deur + zwaaideurtjes (saloon)
  tavern.add(mesh(new THREE.BoxGeometry(2.7, 2.9, 0.3), mat(0x1a0e08), { pos: [0, 2.45, 3.45] }));
  tavern.add(mesh(new THREE.BoxGeometry(2.9, 0.22, 0.4), beam, { pos: [0, 3.95, 3.55] }));
  const saloon = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.userData.dyn = true; piv.position.set(s * 1.3, 0, 3.7 - 9); scene.add(piv);
    const leaf = mesh(new THREE.BoxGeometry(1.25, 1.25, 0.1), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#9a6a3a'), roughness: 0.9 }), { pos: [-s * 0.62, 1.9, 0] });
    for (let k = 0; k < 4; k++) leaf.add(mesh(new THREE.BoxGeometry(0.06, 1.0, 0.04), mat(0x5a3a1c), { cast: false, pos: [-0.45 + k * 0.3, 0, 0.07] }));
    piv.add(leaf); saloon.push({ piv, s, v: 0 });
  }
  // ramen met warm licht
  for (const x of [-5.2, 5.2]) {
    const w = new THREE.Group(); w.position.set(x, 2.8, 3.55); tavern.add(w);
    w.add(mesh(new THREE.BoxGeometry(1.7, 1.5, 0.16), beam));
    w.add(mesh(new THREE.BoxGeometry(1.4, 1.2, 0.2), new THREE.MeshStandardMaterial({ color: 0xffc060, emissive: 0xffa030, emissiveIntensity: 1.0 }), { cast: false }));
    w.add(mesh(new THREE.BoxGeometry(0.07, 1.3, 0.26), beam)); w.add(mesh(new THREE.BoxGeometry(1.5, 0.07, 0.26), beam));
  }
  // uithangbord
  tavern.add(mesh(new THREE.BoxGeometry(4.4, 0.95, 0.14), new THREE.MeshStandardMaterial({ map: tex.sign('De Gouden Draak', { w: 512, h: 112, size: 52, bg: '#6a3a1a', fg: '#ffd96a' }), roughness: 0.9 }), { pos: [0, 4.0, 3.72] }));
  // lantaarns bij de deur
  const lanterns = [];
  for (const x of [-2.2, 2.2]) { const l = mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb040, emissiveIntensity: 1.6 }), { cast: false, pos: [x, 3.3, 3.8 - 9] }); l.userData.dyn = true; scene.add(l); lanterns.push(l); }
  const doorLight = new THREE.PointLight(0xffa850, 1.6, 14, 1.6); doorLight.position.set(0, 2.6, 6.2); tavern.add(doorLight);
  ups.push((t) => { doorLight.intensity = 1.5 + Math.sin(t * 9) * 0.12 + Math.sin(t * 5.3) * 0.1; lanterns.forEach((l, i) => { l.material.emissiveIntensity = 1.5 + Math.sin(t * 11 + i * 2) * 0.25; }); });

  // Deurman-raam (boven, midden)
  const WIN = { x: 0, y: 5.65, z: -9 + 3.05 };
  const frame = new THREE.Group(); frame.position.set(WIN.x, WIN.y, WIN.z); tavern.parent.add(frame);
  frame.add(mesh(new THREE.BoxGeometry(3.3, 2.3, 0.2), beam));
  frame.add(mesh(new THREE.BoxGeometry(2.9, 1.95, 0.24), new THREE.MeshStandardMaterial({ color: 0x0a0608, emissive: 0x2a0c0c, emissiveIntensity: 0.7 }), { cast: false, pos: [0, 0, 0.02] }));
  const shutters = [];
  for (const s of [-1, 1]) { const piv = new THREE.Group(); piv.userData.dyn = true; piv.position.set(s * 1.5, 0, 0.14); frame.add(piv); piv.add(mesh(new THREE.BoxGeometry(1.46, 1.95, 0.06), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#3a6a4a'), roughness: 0.9 }), { pos: [-s * 0.73, 0, 0] })); shutters.push({ piv, s }); }
  const DS = 2.0;
  const deur = makeDeurman(DS);
  const deurPivot = new THREE.Group(); deurPivot.userData.dyn = true; deurPivot.position.set(WIN.x, WIN.y - 0.1, WIN.z - 0.1); scene.add(deurPivot);
  deur.group.position.set(0, -2.43 * DS + 0.2, -0.55); deurPivot.add(deur.group); deurPivot.scale.setScalar(0.001); deurPivot.visible = false;
  const deurLight = new THREE.PointLight(0xff4020, 0, 9, 2); deurLight.position.set(0, WIN.y, WIN.z + 1.2); scene.add(deurLight);
  let deurT = -1;

  // ---------------- draak op het dak ----------------
  const dragon = new Dragon(0x2f9a52, 1.1); dragon.group.userData.dyn = true; dragon.group.position.set(0.0, 9.7, -9.6); dragon.group.rotation.y = 0.85; scene.add(dragon.group);
  const dragonHead = dragon.neck.children.find((c) => c.isGroup);
  let roar = 0, hik = 0, fireT = 0;
  const fireLight = new THREE.PointLight(0xff8a30, 0, 40, 1.4); fireLight.position.set(0, 12, -6); scene.add(fireLight);
  const dragonEye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 5), new THREE.MeshBasicMaterial({ color: 0xff3a1a })); dragonHead.add(dragonEye); dragonEye.visible = false;

  // ---------------- huizen, vaten, rommel ----------------
  const hL = P.houseSimple(7, 6, 4.4, { wall: '#e8d6b0', roof: '#7a3a5a' }); hL.position.set(-15.5, 0, -7.5); hL.rotation.y = 0.5; scene.add(hL);
  const hR = P.houseSimple(6, 5, 4, { wall: '#d8e4d0', roof: '#b0702a', thatch: true }); hR.position.set(15.2, 0, -7); hR.rotation.y = -0.55; scene.add(hR);
  const hL2 = P.houseSimple(6, 6, 5, { wall: '#efe2c4', roof: '#4a6aa0' }); hL2.position.set(-26, 0, -18); hL2.rotation.y = 0.3; scene.add(hL2);
  const hR2 = P.houseSimple(7, 6, 4.6, { wall: '#e4d4c0', roof: '#a04a3a' }); hR2.position.set(26, 0, -17); hR2.rotation.y = -0.35; scene.add(hR2);
  { const wm = P.windmill(1.1); wm.position.set(-38, 0, -34); wm.rotation.y = 0.5; scene.add(wm); const hub = wm.userData.blades; hub.userData.dyn = true; ups.push((t, dt) => { hub.rotation.z += dt * 0.5; }); }
  for (const [x, z, s] of [[-8.6, -4.6, 1], [-9.6, -3.6, 0.9], [-8.9, -3.4, 0.8]]) { const b = P.barrel(s); b.position.set(x, 0, z); scene.add(b); }
  { const b = P.barrel(1); b.position.set(-8.8, 0.9, -4.2); b.scale.setScalar(0.85); scene.add(b); }
  for (const [x, z, s] of [[8.4, -4.4, 1.1], [9.6, -4.6, 0.9]]) { const c = P.crate(s); c.position.set(x, 0, z); c.rotation.y = x * 0.2; scene.add(c); }
  { const c = P.crate(0.8); c.position.set(8.8, 1.1, -4.4); c.rotation.y = 0.5; scene.add(c); }
  scene.add(hayBale(11.4, -3.2, 0.3), hayBale(12.6, -2.6, -0.5)); const hb = hayBale(11.9, -2.9, 0.1); hb.position.y = 1.35; hb.scale.setScalar(0.9); scene.add(hb);
  for (const x of [-6.4, 6.4]) { const lp = P.lampPost(); lp.position.set(x, 0, -5.4); const lm = lp.children[1].material; scene.add(lp); ups.push((t) => { const m = lm; if (m) m.emissiveIntensity = 1.8 + Math.sin(t * 8 + x) * 0.3; }); }
  { const pst = new THREE.Group(); pst.position.set(5.9, 0, -4.6); pst.add(mesh(new THREE.CylinderGeometry(0.06, 0.07, 2, 5), mat(0x5a3a1c), { pos: [0, 1, 0] })); const w = wanted(); w.position.set(0, 2.2, 0.1); pst.add(w); pst.rotation.y = -0.3; pst.position.x = 7.6; scene.add(pst); }
  // drinkbak
  { const tr = mesh(new THREE.BoxGeometry(2.4, 0.6, 0.8), mat(0x6a4a2a), { pos: [-5.6, 0.3, -4.1] }); scene.add(tr); scene.add(mesh(new THREE.BoxGeometry(2.1, 0.06, 0.55), new THREE.MeshStandardMaterial({ color: 0x3a8ad0, emissive: 0x103050, emissiveIntensity: 0.4 }), { cast: false, pos: [-5.6, 0.58, -4.1] })); }
  // kar
  { const cart = new THREE.Group(); cart.position.set(-12.5, 0, -2.0); cart.rotation.y = 0.6;
    cart.add(mesh(new THREE.BoxGeometry(3.2, 0.3, 1.8), mat(0x7a5530), { pos: [0, 1.0, 0] }));
    for (const s of [-1, 1]) { cart.add(mesh(new THREE.BoxGeometry(3.2, 0.7, 0.1), mat(0x7a5530), { pos: [0, 1.4, s * 0.85] })); const wh = mesh(new THREE.TorusGeometry(0.62, 0.08, 6, 14), mat(0x4a3018), { pos: [0.2, 0.62, s * 1.0] }); cart.add(wh); for (let k = 0; k < 4; k++) cart.add(mesh(new THREE.BoxGeometry(1.24, 0.07, 0.07), mat(0x4a3018), { cast: false, pos: [0.2, 0.62, s * 1.0], rot: [0, 0, k * 0.785] })); }
    cart.add(mesh(new THREE.BoxGeometry(2.2, 0.8, 1.2), mat(0xc9a050), { pos: [0, 1.5, 0] }));
    scene.add(cart); }
  // bomen / dennen verderop
  for (let i = 0; i < 18; i++) { const side = i % 2 ? 1 : -1; const t = i % 3 ? P.pine(rand(6, 10), 0x1f4d3a) : P.tree(rand(5, 7), 0x4a7a3a); t.position.set(side * rand(19, 52), 0, -rand(8, 48)); scene.add(t); }
  // bloemetjes / struikjes
  for (const [x, z] of [[-9.5, 1.5], [10.5, 2], [-13.5, 4], [14, 5]]) { const f = P.flowerPatch(0xff6fa5, 6, 1); f.position.set(x, 0, z); scene.add(f); }
  for (const [x, z] of [[-11, 3], [12.5, 0.5], [-16, 0]]) { const b = P.bush(1.3, 0x4a7a3a); b.position.set(x, 0, z); scene.add(b); }

  // ---------------- kraaien ----------------
  const crows = [];
  const perches = [[-6.2, 4.95, -9.0, 0.3], [-5.0, 4.95, -9.0, -0.4], [6.1, 4.95, -9.0, 0.2], [-6.4, 3.0, -5.4, 0.0], [3.9, 9.7, -9.0, 0.1]];
  perches.forEach(([x, y, z, ry], i) => {
    const c = crowMesh(); c.userData.dyn = true; c.position.set(x, y + 0.3, z); c.rotation.y = ry; scene.add(c);
    crows.push({ g: c, home: new THREE.Vector3(x, y + 0.3, z), ry, state: 'sit', t: 0, dir: i % 2 ? 1 : -1, peck: rand(0, 6) });
  });
  function crowUpdate(k, dt) {
    const c = k.g, d = c.userData;
    if (k.state === 'sit') { k.peck += dt; d.head.rotation.x = Math.max(0, Math.sin(k.peck * 1.3)) * 0.5; for (const w of d.wings) w.p.rotation.z = -w.s * 0.9; return; }
    k.t += dt;
    d.flap += dt * 22;
    for (const w of d.wings) w.p.rotation.z = w.s * Math.sin(d.flap) * 0.9;
    d.head.rotation.x = 0;
    if (k.state === 'out') {
      const u = k.t / 2.4;
      c.position.set(k.home.x + k.dir * (u * 26), k.home.y + Math.sin(u * 3) * 0.6 + u * 14, k.home.z + u * 4 - u * u * 6);
      c.rotation.y = k.dir * 1.4; c.rotation.z = k.dir * -0.2;
      if (u >= 1) { k.state = 'away'; k.t = 0; c.visible = false; }
    } else if (k.state === 'away') { if (k.t > 5) { k.state = 'back'; k.t = 0; c.visible = true; } }
    else if (k.state === 'back') {
      const u = clamp(k.t / 2.0, 0, 1), e = 1 - (1 - u) * (1 - u);
      c.position.set(k.home.x + k.dir * (1 - e) * 22, k.home.y + (1 - e) * 9, k.home.z + (1 - e) * 5);
      c.rotation.y = k.dir > 0 ? -1.4 + e * (k.ry + 1.4) : 1.4 + e * (k.ry - 1.4); c.rotation.z = 0;
      if (u >= 1) { k.state = 'sit'; c.position.copy(k.home); c.rotation.set(0, k.ry, 0); }
    }
  }
  ups.push((t, dt) => crows.forEach((k) => crowUpdate(k, dt)));
  W.crow = () => {
    const k = crows.find((q) => q.state === 'sit' && q.home.y < 6) || crows.find((q) => q.state === 'sit');
    if (!k) return 1.2;
    k.state = 'out'; k.t = 0; W.say('KRAA! KRAA!', k.home.x, k.home.y + 1.6, k.home.z + 0.5, { dur: 1.3, color: '#2a1a38' });
    // schreeuw
    for (let i = 0; i < 2; i++) { audio.tone(520, 0.2, { type: 'sawtooth', vol: 0.16, slide: 260, filter: 2200, delay: i * 0.26 }); audio.noise(0.16, { type: 'bandpass', freq: 1500, freq2: 900, q: 3, vol: 0.14, delay: i * 0.26 }); }
    return 1.4;
  };

  // ---------------- kip ----------------
  const chicken = new Animal('chicken'); chicken.group.userData.dyn = true; chicken.group.scale.setScalar(1.7); chicken.group.visible = false; scene.add(chicken.group);
  let chT = -1;
  W.chicken = () => {
    chT = 0; chicken.group.visible = true; chicken.speed = 1;
    const dir = Math.random() < 0.5 ? 1 : -1; chicken.dir = dir; chicken.targetYaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2; chicken.yaw = chicken.targetYaw;
    for (let i = 0; i < 5; i++) {
      const f = 760 + Math.random() * 220;
      audio.tone(f, 0.07, { type: 'square', vol: 0.1, slide: f * 0.55, delay: i * 0.19, filter: 2600 });
      audio.noise(0.05, { type: 'bandpass', freq: 2200, vol: 0.05, delay: i * 0.19 });
    }
    return 1.7;
  };
  ups.push((t, dt) => {
    chicken.update(dt);
    if (chT >= 0) {
      chT += dt; const u = chT / 1.7, x = lerp(-13, 13, u) * chicken.dir;
      chicken.group.position.set(x, Math.abs(Math.sin(chT * 14)) * 0.25, 3.2);
      if (chT < 1.3 && Math.floor(chT * 5.3) !== Math.floor((chT - dt) * 5.3)) W.say(pick(['KO-KO-KOK!', 'KAKELKAKEL!', 'KO-KO-KODAK!']), x, 2.8, 3.4, { dur: 0.6, scale: 0.8, color: '#a02a2a' });
      if (u >= 1) { chT = -1; chicken.group.visible = false; chicken.speed = 0; }
    }
  });

  // ---------------- bel ----------------
  const bellPost = new THREE.Group(); bellPost.userData.dyn = true; bellPost.position.set(-8.4, 0, 0.6); scene.add(bellPost);
  bellPost.add(mesh(new THREE.CylinderGeometry(0.14, 0.2, 5.4, 6), mat(0x5a3a1c), { pos: [0, 2.7, 0] }));
  bellPost.add(mesh(new THREE.BoxGeometry(2.2, 0.2, 0.25), mat(0x5a3a1c), { pos: [0.8, 5.3, 0] }));
  bellPost.add(mesh(new THREE.BoxGeometry(0.2, 1.1, 0.2), mat(0x5a3a1c), { pos: [0.5, 4.9, 0], rot: [0, 0, 0.8] }));
  const bellPiv = new THREE.Group(); bellPiv.position.set(1.3, 5.2, 0); bellPost.add(bellPiv);
  const bell = bellMesh(); bell.position.y = -1.1; bell.scale.setScalar(0.85); bellPiv.add(bell);
  let bellAmp = 0, bellT = 0;
  W.bell = () => {
    bellAmp = 0.8; bellT = 0;
    for (let i = 0; i < 4; i++) { audio.tone(i % 2 ? 659 : 880, 0.9, { type: 'sine', vol: 0.2, delay: i * 0.38, send: 0.3 }); audio.tone((i % 2 ? 659 : 880) * 2.01, 0.5, { type: 'sine', vol: 0.07, delay: i * 0.38 }); }
    W.say('DING DONG!', bellPost.position.x + 1.3, 7.3, 0.7, { dur: 1.3, color: '#a67a10' });
    return 1.5;
  };
  ups.push((t, dt) => { bellT += dt; bellAmp = Math.max(0, bellAmp - dt * 0.5); bellPiv.rotation.z = Math.sin(bellT * 8) * bellAmp; });

  // ---------------- Deurman ----------------
  W.deurman = () => { deurT = 0; deurPivot.visible = true; audio.sfx('creak', { vol: 0.8 }); audio.sfx('heartbeat', { vol: 0.7 }); W.say('Niet bewegen!', -3.4, 7.5, -4.4, { dur: 1.8, color: '#8a1a1a', scale: 1.7 }); return 2.0; };
  ups.push((t, dt) => {
    if (deurT >= 0) {
      deurT += dt;
      const u = clamp(deurT / 0.35, 0, 1), out = deurT < 1.65 ? u : clamp(1 - (deurT - 1.65) / 0.3, 0, 1);
      deurPivot.scale.setScalar(Math.max(0.001, out));
      for (const s of shutters) s.piv.rotation.y = s.s * out * 1.9;
      deur.update(dt); deur.torso.rotation.x = 0.5 + Math.sin(deurT * 3) * 0.05; deur.head.rotation.z = Math.sin(deurT * 6) * 0.25; deurLight.intensity = out * 2.2;
      if (deurT > 2.0) { deurT = -1; deurPivot.visible = false; deurLight.intensity = 0; for (const s of shutters) s.piv.rotation.y = 0; }
    }
  });

  // ---------------- draak: hik (nep) en vuur (echt) ----------------
  W.hiccup = () => {
    hik = 0.9; W.say('hik!', 1.2, 12.0, -7.6, { dur: 0.9, scale: 1.1, color: '#2a7a3a' });
    audio.tone(330, 0.12, { type: 'sine', vol: 0.18, slide: 760 }); audio.tone(520, 0.1, { type: 'sine', vol: 0.12, slide: 980, delay: 0.1 });
    return 1.0;
  };
  W.fire = (dur = 1.1) => {
    fireT = dur; roar = dur + 0.5; fireLight.intensity = 6;
    audio.noise(dur, { type: 'lowpass', freq: 2400, freq2: 200, vol: 0.5, attack: 0.03 });
    audio.tone(130, dur, { type: 'sawtooth', vol: 0.3, slide: 55, filter: 800 }); audio.tone(98, dur, { type: 'sawtooth', vol: 0.2, slide: 45, filter: 600 });
    [523, 659, 784, 1047].forEach((f, i) => { audio.tone(f, i === 3 ? 0.7 : 0.16, { type: 'sawtooth', vol: 0.17, delay: i * 0.11, filter: 2400, send: 0.2 }); audio.tone(f * 2, i === 3 ? 0.7 : 0.16, { type: 'square', vol: 0.05, delay: i * 0.11 }); });
  };
  ups.push((t, dt) => {
    dragon.update(dt);
    hik = Math.max(0, hik - dt); roar = Math.max(0, roar - dt);
    const wingOpen = roar > 0 ? 0.55 : 0.0;
    dragon.wings.forEach((w) => { w.p.rotation.z = w.sd * (roar > 0 ? 0.25 + Math.sin(t * 9) * 0.4 : 0.5 + Math.sin(t * 2) * 0.06); });
    dragon.group.position.y = 9.7 + (roar > 0 ? 0.3 : 0) + Math.sin(t * 1.5) * 0.03;
    dragon.neck.rotation.x = roar > 0 ? -1.0 + Math.sin(t * 30) * 0.03 : hik > 0 ? -0.55 + Math.sin(hik * 30) * 0.2 : -0.12 + Math.sin(t * 1.6) * 0.08;
    dragonEye.visible = roar > 0;
    if (hik > 0.4 && Math.random() < 0.7) { dragonHead.getWorldPosition(V); fx.particles.emit(V.x, V.y + 0.3, V.z + 0.3, rand(-0.6, 0.6), rand(1.5, 3), rand(0.5, 1.5), { life: 0.6, size: 0.45, color: pick([0xffd8a0, 0xb0b0b0, 0xffa040]), gravity: -1 }); }
    if (fireT > 0) {
      fireT -= dt; dragonHead.getWorldPosition(V);
      for (let i = 0; i < 9; i++) {
        const c = pick([0xff3a10, 0xff7a10, 0xffb020, 0xffe060, 0xffffff]);
        fx.particles.emit(V.x + rand(-0.3, 0.3), V.y + 0.2, V.z + 0.2, rand(0.5, 5), rand(4.5, 10), rand(3, 8), { life: rand(0.7, 1.3), size: rand(0.7, 1.5), color: c, gravity: -1.5 });
      }
      fireLight.intensity = 3 + Math.random() * 4;
    } else fireLight.intensity = damp(fireLight.intensity, 0, 6, dt);
  });
  W.dragonHead = () => { dragonHead.getWorldPosition(V); return V; };

  // ---------------- tuimelende struik ----------------
  const weed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, wireframe: true, roughness: 1 }));
  weed.castShadow = true; weed.userData.dyn = true; scene.add(weed);
  const weed2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: 0x9a7a44, wireframe: true, roughness: 1 })); weed.add(weed2);
  let weedT = 4, weedDir = 1, weedOn = false, weedX = 0;
  ups.push((t, dt) => {
    weedT -= dt;
    if (!weedOn && weedT < 0) { weedOn = true; weedDir = Math.random() < 0.5 ? 1 : -1; weedX = -weedDir * 14; weedT = 0; }
    if (weedOn) {
      weedX += weedDir * dt * 4.2; const bounce = Math.abs(Math.sin(weedX * 1.1)) * 0.5;
      weed.position.set(weedX, 0.75 + bounce, 4.3); weed.rotation.z -= weedDir * dt * 5.5; weed.rotation.y += dt * 2;
      if (Math.abs(weedX) > 14) { weedOn = false; weedT = rand(7, 12); weed.position.y = -9; }
    } else weed.position.y = -9;
  });

  // ---------------- zwaaideurtjes bewegen (wind + gaten) ----------------
  W.saloonKick = (v = 3) => saloon.forEach((s) => { s.v += v * s.s; });
  ups.push((t, dt) => {
    for (const s of saloon) { s.v += (-s.piv.rotation.y * 40 - s.v * 1.8) * dt; s.piv.rotation.y += s.v * dt; s.piv.rotation.y = clamp(s.piv.rotation.y, -1.3, 1.3); }
    if (Math.random() < dt * 0.15) W.saloonKick(0.6);
  });

  // ---------------- publiek ----------------
  W.audience = [];
  const crowd = [
    ['witch', -10.6, -2.2, 0], ['baker', -9.2, -3.3, 0], ['dwarf', -11.6, -0.4, 0], ['jester', -12.6, -3.0, 0],
    ['bard', 10.2, -2.4, 0], ['guard', 9.0, -3.5, 0], ['kid', 11.2, -0.6, 0], ['princess', 12.4, -3.1, 0],
  ];
  crowd.forEach(([kind, x, z], i) => {
    const c = makeNPC(kind); c.group.userData.dyn = true; c.group.position.set(x, 0, z); c.group.scale.setScalar(1.12); scene.add(c.group);
    c.faceDir(-x, 4 - z); c.yaw = c.targetYaw;
    W.audience.push({ c, base: [x, z], t: rand(0, 6), pose: 'idle', hold: 0, hop: 0 });
  });
  // wie er in de buurt van de taverne zit
  { const sk = makeNPC('skeleton'); sk.group.userData.dyn = true; sk.group.position.set(4.9, 0.55, -4.3); sk.group.scale.setScalar(1.0); sk.pose = 'sit'; scene.add(sk.group); sk.faceDir(-0.3, 1); sk.yaw = sk.targetYaw;
    scene.add(mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.55, 8), mat(0x6a4a2a), { pos: [4.9, 0.28, -4.5] }));
    W.skeleton = sk; }
  W.react = (pose, dur = 1.2, who = null) => { for (const a of W.audience) { if (who && !who.includes(a.c)) continue; a.pose = pose; a.hold = dur + Math.random() * 0.5; if (pose === 'cheer') a.hop = 1; } };
  ups.push((t, dt) => {
    for (const a of W.audience) {
      a.t += dt; a.hold -= dt; if (a.hold < 0) a.pose = 'idle';
      a.c.pose = a.pose; a.c.update(dt);
    }
    W.skeleton.update(dt);
  });

  // ---------------- zwevende tekstballonnen ----------------
  const says = [];
  W.say = (text, x, y, z, { dur = 1.2, scale = 1, color = '#2a1830' } = {}) => {
    const sp = makeSprite(bubbleTex(text, color), 3.2 * scale, 1.25 * scale); sp.position.set(x, y, z); scene.add(sp);
    says.push({ sp, t: 0, dur, s: scale, y0: y });
  };
  ups.push((t, dt) => {
    for (let i = says.length - 1; i >= 0; i--) {
      const s = says[i]; s.t += dt; const u = s.t / s.dur;
      const pop = Math.min(1, s.t / 0.14); const k = 1 + (1 - pop) * 0.5 * Math.sin(pop * Math.PI);
      s.sp.scale.set(3.2 * s.s * pop * k, 1.25 * s.s * pop * k, 1); s.sp.position.y = s.y0 + Math.min(0.6, s.t * 0.8);
      s.sp.material.opacity = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
      if (u >= 1) { scene.remove(s.sp); s.sp.material.dispose(); says.splice(i, 1); }
    }
  });

  // ---------------- het grote signaalbord (midden, boven de duellisten) ----------------
  const panel = liveCanvas(512, 512, () => {});
  const panelMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), new THREE.MeshBasicMaterial({ map: panel.t, transparent: true, depthTest: false, fog: false }));
  panelMesh.userData.dyn = true; panelMesh.position.set(0, 5.4, 0.5); panelMesh.renderOrder = 17; panelMesh.visible = false; scene.add(panelMesh);
  W.panelMesh = panelMesh; W.panelTex = panel;

  // ---------------- sfeer-stof ----------------
  ups.push((t, dt) => { if (Math.random() < dt * 5) fx.particles.emit(14, rand(0.1, 1.2), rand(-6, 6), rand(-4.5, -3), rand(-0.1, 0.4), rand(-0.5, 0.5), { life: 4, size: 0.28, color: 0xe8b890, gravity: 0, shrink: false }); });

  W.mergedCount = mergeStatic(scene);
  W.update = (t, dt) => { for (const f of ups) f(t, dt); };
  W.deurmanEye = () => deurPivot.visible;
  W.disposeExtra = () => {};
  return W;
}
