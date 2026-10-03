import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, mulberry32, TAU } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeNPC, makeDeurman, Animal } from '../engine/chars.js';
import * as P from '../engine/props.js';
import { skyTexture } from '../engine/lights.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving van "Mand-Mania": een straatveldje achter in een steegje bij zonsondergang. Bakstenen muur met graffiti, hek met publiek,
// lantaarns, skyline met verlichte raampjes, twee manden met bord en net, een Deurman als scheidsrechter en een scorebord.
export const BK = { HX: 9.6, BB: 10.75, RR: 0.95, RT: 0.11, RIMY: 4.4, BR: 0.4, PLX: 10.9, WALLX: 11.4, ZP: [0.75, -0.75] };
const { HX, BB, RR, RIMY } = BK;

const glowTex = () => canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 1, 32, 32, 31); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });

// vloer: asfalt met geschilderd veld (wereld x -18..18, z -7..9)
const FX0 = -18, FX1 = 18, FZ0 = -7, FZ1 = 9;
function courtTexture(cols) {
  const W = 1800, H = 800, sx = W / (FX1 - FX0), sz = H / (FZ1 - FZ0), X = (x) => (x - FX0) * sx, Z = (z) => (z - FZ0) * sz;
  return canvasTex(W, H, (g) => {
    g.fillStyle = '#5c5c6a'; g.fillRect(0, 0, W, H); g.strokeStyle = 'rgba(20,20,35,.35)'; g.lineWidth = 3; for (let x = 0; x < W; x += 75) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 75) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    const r = mulberry32(9); for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(20,20,30,.28)' : 'rgba(200,200,220,.13)'; g.fillRect(r() * W, r() * H, 2 + r() * 4, 2 + r() * 3); }
    for (let i = 0; i < 24; i++) { g.strokeStyle = 'rgba(15,15,25,.4)'; g.lineWidth = 2; g.beginPath(); let x = r() * W, y = r() * H; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 120; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }   // scheuren
    // geschilderd veld
    g.fillStyle = '#2f5f9e'; g.fillRect(X(-12), Z(-4.6), 24 * sx, 9.2 * sz);
    for (const s of [-1, 1]) { g.fillStyle = cols[s > 0 ? 0 : 1].replace('1)', '.5)'); const x0 = s > 0 ? X(HX - 4.2) : X(-HX - 1.5); g.fillRect(x0, Z(-1.9), 5.7 * sx, 3.8 * sz); }   // verfvak in de kleur van de aanvaller
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 8; g.lineJoin = 'round';
    g.strokeRect(X(-12), Z(-4.6), 24 * sx, 9.2 * sz); g.beginPath(); g.moveTo(X(0), Z(-4.6)); g.lineTo(X(0), Z(4.6)); g.stroke();
    g.beginPath(); g.ellipse(X(0), Z(0), 2.2 * sx, 2.2 * sz, 0, 0, TAU); g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(X(s * HX), Z(0), 6.4 * sx, 4.3 * sz, 0, s > 0 ? Math.PI - 1.15 : -1.15, s > 0 ? Math.PI + 1.15 : 1.15); g.stroke(); g.strokeRect(s > 0 ? X(HX - 4.2) : X(-HX - 1.5), Z(-1.9), 5.7 * sx, 3.8 * sz); }
    g.fillStyle = 'rgba(255,255,255,.2)'; g.font = `bold ${Math.round(2.2 * sz)}px Fredoka, Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('MAND-MANIA', X(0), Z(0));
  });
}
function wallArt() {
  return canvasTex(2048, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineJoin = 'round'; g.lineCap = 'round'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const tag = (t, x, y, size, c, rot = 0) => { g.save(); g.translate(x, y); g.rotate(rot); g.font = `bold ${size}px Fredoka, Arial Black, sans-serif`; g.lineWidth = size * 0.16; g.strokeStyle = 'rgba(10,10,30,.85)'; g.strokeText(t, 0, 0); g.fillStyle = c; g.fillText(t, 0, 0); g.restore(); };
    tag('MAND-MANIA', 1024, 190, 190, '#ffd23f', -0.03); tag('WES', 330, 330, 110, '#7dffb0', -0.12); tag('JOR', 1720, 330, 110, '#8fb8ff', 0.1);
    tag('KIP RULEZ', 520, 80, 64, '#ff7ab8', 0.08); tag('DEURMAN WAS HIER', 1560, 62, 56, '#ffffff', -0.05); tag('21!', 1024, 400, 90, '#ff6a4a', 0.04);
    g.fillStyle = '#ff4a6a'; for (const [x, y, s] of [[160, 150, 46], [1880, 190, 56], [820, 400, 36]]) { g.beginPath(); g.moveTo(x, y + s * 0.3); g.bezierCurveTo(x - s, y - s * 0.6, x - s * 0.2, y - s, x, y - s * 0.3); g.bezierCurveTo(x + s * 0.2, y - s, x + s, y - s * 0.6, x, y + s * 0.3); g.fill(); }
    g.fillStyle = '#7a4ad8'; g.beginPath(); g.arc(1300, 380, 52, 0, TAU); g.fill(); g.fillStyle = '#fff'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(1300 + sx * 20, 370, 15, 0, TAU); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(1300 + sx * 20, 372, 6, 0, TAU); g.fill(); g.fillStyle = '#fff'; }
    g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.arc(1300, 394, 22, 0.2, Math.PI - 0.2); g.stroke();
  });
}
function fenceTex() { return canvasTex(128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(210,220,235,.85)'; g.lineWidth = 3; for (let i = -2; i < 6; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 128, 128); g.moveTo(i * 32 + 128, 0); g.lineTo(i * 32, 128); g.stroke(); } }); }
function netTex() { return canvasTex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4; for (let i = -1; i < 6; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16 + 40, 64); g.moveTo(i * 16 + 40, 0); g.lineTo(i * 16, 64); g.stroke(); } }); }

// ---------------- voorwerpen ----------------
export function makeBallMesh() {
  const t = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#e8702a'; g.fillRect(0, 0, w, h); const r = mulberry32(2); for (let i = 0; i < 500; i++) { g.fillStyle = r() < 0.5 ? 'rgba(120,40,0,.18)' : 'rgba(255,200,140,.15)'; g.fillRect(r() * w, r() * h, 2, 2); }
    g.strokeStyle = '#2a1408'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (const x of [0, w / 2, w]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (const x of [w / 4, w * 0.75]) { g.beginPath(); g.ellipse(x, h / 2, w * 0.2, h * 0.52, 0, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.ellipse(x, h / 2, w * 0.2, h * 0.52, 0, -Math.PI * 0.5, Math.PI * 0.5); g.stroke(); }
  });
  return mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.05 }), { cast: true });
}
export function iconTex(id) {
  return canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#1a1030'; g.lineWidth = 6;
    if (id === 'giant') { g.fillStyle = '#e8702a'; g.beginPath(); g.arc(64, 70, 44, 0, TAU); g.fill(); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(20, 70); g.lineTo(108, 70); g.moveTo(64, 26); g.lineTo(64, 114); g.stroke(); g.fillStyle = '#fff'; g.strokeStyle = '#1a1030'; g.lineWidth = 5; g.beginPath(); g.moveTo(64, 2); g.lineTo(46, 26); g.lineTo(82, 26); g.closePath(); g.fill(); g.stroke(); }
    else if (id === 'boots') { g.fillStyle = '#e8402a'; g.beginPath(); g.moveTo(34, 20); g.lineTo(70, 20); g.lineTo(70, 64); g.lineTo(104, 80); g.lineTo(104, 104); g.lineTo(34, 104); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(40, 106); g.lineTo(70, 126); g.lineTo(100, 106); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillRect(36, 28, 32, 10); }
    else { g.fillStyle = '#ffd23f'; g.beginPath(); g.ellipse(64, 40, 48, 16, 0, 0, TAU); g.fill(); g.stroke(); g.strokeStyle = '#8a8aa0'; g.lineWidth = 7; g.beginPath(); for (let i = 0; i < 4; i++) { const x = 28 + i * 24; g.moveTo(x, 56); g.lineTo(x + 8, 70); g.lineTo(x - 8, 84); g.lineTo(x, 100); } g.stroke(); g.strokeStyle = '#1a1030'; g.lineWidth = 6; g.beginPath(); g.moveTo(20, 108); g.lineTo(108, 108); g.stroke(); }
  });
}
export function makeTrampoline() {
  const g = new THREE.Group(); g.userData.dynamic = true;
  const top = mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.12, 20), mat(0x2a2a3a, { flatShading: false }), { pos: [0, 0.75, 0] }); g.add(top);
  const ring = mesh(new THREE.TorusGeometry(1.15, 0.1, 6, 24), mat(0xffd23f, { emissive: 0x6a4a00, flatShading: false }), { cast: false, pos: [0, 0.78, 0], rot: [Math.PI / 2, 0, 0] }); g.add(ring);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 5), mat(0xbfc4d4, { metalness: 0.6 }), { cast: false, pos: [Math.cos(a) * 1.0, 0.38, Math.sin(a) * 1.0] })); }
  const star = mesh(new THREE.CircleGeometry(0.55, 5), new THREE.MeshBasicMaterial({ color: 0xff4a6a }), { cast: false, receive: false, pos: [0, 0.82, 0], rot: [-Math.PI / 2, 0, 0] }); g.add(star);
  g.userData.top = top; g.userData.ring = ring; g.userData.star = star; return g;
}

export function buildCourt(ctx, L, colorsCss) {
  const { scene, fx } = ctx; const rng = mulberry32(4242); const idx0 = scene.children.length;
  const C = { frame: 0, hoops: [], crowd: [], hoopOff: 0 };
  scene.background = skyTexture('#2b2468', '#ff9a6a'); scene.fog = new THREE.Fog(0x6a4a7a, 60, 160);

  // vloer + stoeprand
  C.floorTex = courtTexture(colorsCss);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FX1 - FX0, FZ1 - FZ0), new THREE.MeshStandardMaterial({ map: C.floorTex, roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (FZ0 + FZ1) / 2); floor.receiveShadow = true; scene.add(floor);
  scene.add(mesh(new THREE.PlaneGeometry(200, 160), mat(0x2e2a3e, { flatShading: false }), { cast: false, receive: false, pos: [0, -0.05, -30], rot: [-Math.PI / 2, 0, 0] }));

  // achtermuur + graffiti
  const wallT = tex.bricks(14, 3); const wm = new THREE.MeshStandardMaterial({ map: wallT, color: 0xb89a88, roughness: 1 });
  scene.add(mesh(new THREE.BoxGeometry(46, 11, 0.6), wm, { cast: false, pos: [0, 5.5, -7.3] }));
  scene.add(mesh(new THREE.BoxGeometry(46, 0.5, 1.0), mat(0x6a5a60), { cast: false, pos: [0, 11.1, -7.3] }));
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 7.5), new THREE.MeshBasicMaterial({ map: wallArt(), transparent: true, depthWrite: false })); m.position.set(0, 6.0, -6.98); scene.add(m); }
  for (const sx of [-1, 1]) scene.add(mesh(new THREE.BoxGeometry(0.6, 11, 12), wm, { cast: false, pos: [sx * 23, 5.5, -2] }));
  // hek met publiek
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(24.4, 3.6), new THREE.MeshBasicMaterial({ map: (() => { const t = fenceTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 3.6); return t; })(), transparent: true, depthWrite: false, side: THREE.DoubleSide })); f.position.set(0, 1.8, -5.3); scene.add(f);
    for (let x = -12; x <= 12; x += 3.05) scene.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.7, 6), mat(0x8a8fa0, { metalness: 0.5 }), { cast: false, pos: [x, 1.85, -5.3] }));
    scene.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 24.4, 6), mat(0x8a8fa0, { metalness: 0.5 }), { cast: false, pos: [0, 3.7, -5.3], rot: [0, 0, Math.PI / 2] })); }
  const kinds = ['goblin', 'kid', 'jester', 'dwarf', 'bard', 'skeleton', 'baker', 'witch', 'kid'];
  kinds.forEach((kind, k) => { const c = makeNPC(kind); const sc = 1.25; c.group.scale.setScalar(sc); const x = -11 + k * 2.75; c.group.position.set(x + (rng() - 0.5), 0.55, -6.1); c.faceDir(0.2 * (x > 0 ? -1 : 1), 1); c.yaw = c.targetYaw; c.group.rotation.y = c.yaw; scene.add(c.group); const crate = mesh(new THREE.BoxGeometry(1.2, 0.55, 1.0), mat(0x9a6a3a), { cast: false, pos: [c.group.position.x, 0.27, -6.1] }); scene.add(crate); C.crowd.push({ c, y: 0.55, ph: rng() * 6, cheer: 0 }); });
  { const hen = new Animal('chicken'); hen.group.scale.setScalar(1.8); hen.group.position.set(13.2, 0, -4.2); hen.targetYaw = -Math.PI / 2 - 0.5; hen.yaw = hen.targetYaw; scene.add(hen.group); C.hen = hen; }

  // skyline met verlichte raampjes
  { const bm = mat(0x1e1838, { flatShading: true }); const winPos = []; for (let i = 0; i < 18; i++) { const w = 4 + rng() * 5, h = 10 + rng() * 22, x = -60 + i * 7 + rng() * 3, z = -26 - rng() * 12; scene.add(mesh(new THREE.BoxGeometry(w, h, 4), bm, { cast: false, receive: false, pos: [x, h / 2 - 1, z] })); for (let k = 0; k < Math.floor(h / 2.2); k++) for (let j = 0; j < 2; j++) if (rng() < 0.45) winPos.push([x - w / 2 + 1.2 + j * (w - 2.4), 1 + k * 2.2 + 0.4, z + 2.05]); }
    const wi = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshBasicMaterial({ color: 0xffd98a, fog: false }), winPos.length); const m4 = new THREE.Matrix4(); winPos.forEach((p, k) => wi.setMatrixAt(k, m4.makeTranslation(...p))); wi.userData.dynamic = true; wi.frustumCulled = false; scene.add(wi); }
  { const c = P.cloud(2.2); c.position.set(-20, 26, -50); scene.add(c); const c2 = P.cloud(3); c2.position.set(30, 32, -60); scene.add(c2); C.clouds = [c, c2]; }

  // lantaarns, rommel, boombox
  C.lamps = [];
  for (const sx of [-1, 1]) { const x = sx * 7.2; scene.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 8.4, 6), mat(0x3a3a50, { metalness: 0.5 }), { cast: false, pos: [x, 4.2, -5.6] })); scene.add(mesh(new THREE.BoxGeometry(1.4, 0.3, 0.6), mat(0x3a3a50), { cast: false, pos: [x - sx * 0.5, 8.4, -5.6] }));
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd48a, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.set(8, 8, 1); sp.position.set(x - sx * 0.6, 8.1, -5.4); scene.add(sp); C.lamps.push(sp);
    const pl = new THREE.PointLight(0xffc880, 1.0, 40, 1.4); pl.position.set(x - sx * 0.6, 7.6, -3); scene.add(pl); }
  scene.add(mesh(new THREE.BoxGeometry(2.4, 1.5, 1.2), mat(0x2f6a4a), { pos: [-14.2, 0.75, -4.2] })); scene.add(mesh(new THREE.BoxGeometry(2.6, 0.2, 1.3), mat(0x2a5a40), { cast: false, pos: [-14.2, 1.55, -4.2] }));
  scene.add(mesh(new THREE.CylinderGeometry(0.45, 0.4, 1.0, 8), mat(0x8a8fa0, { metalness: 0.5 }), { pos: [14.2, 0.5, -3.6] }));
  { const bx = new THREE.Group(); bx.position.set(-12.2, 0.0, 4.6); bx.add(mesh(new THREE.BoxGeometry(1.5, 0.8, 0.6), mat(0x2a2a3a), { pos: [0, 0.4, 0] })); const sp = []; for (const sx of [-1, 1]) { const s = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0xff7a4a, emissive: 0xff4a1a, emissiveIntensity: 0.5 }), { cast: false, pos: [sx * 0.42, 0.4, 0.33], rot: [Math.PI / 2, 0, 0] }); bx.add(s); sp.push(s); } bx.userData.dynamic = true; scene.add(bx); C.boom = sp; }

  // manden
  const bbT = canvasTex(128, 96, (g, w, h) => { g.fillStyle = 'rgba(210,235,255,.55)'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6); g.strokeStyle = '#e8402a'; g.lineWidth = 6; g.strokeRect(w * 0.3, h * 0.38, w * 0.4, h * 0.46); });
  const netM = new THREE.MeshBasicMaterial({ map: (() => { const t = netTex(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t; })(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  for (const k of [0, 1]) {
    const s = k === 0 ? 1 : -1; const g = new THREE.Group(); g.position.set(s * BB, 0, 0); scene.add(g);
    const st = new THREE.Group(); g.add(st); st.userData.dynamic = true;               // beweegt mee met de mand
    const pole = mesh(new THREE.CylinderGeometry(0.22, 0.26, RIMY + 1.4, 8), mat(0x4a4a62, { metalness: 0.5 }), { pos: [s * 1.25, (RIMY + 1.4) / 2, 0] }); g.add(pole);
    g.add(mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), mat(0xf2c230), { cast: false, pos: [s * 1.25, 0.8, 0] }));
    const arm = mesh(new THREE.BoxGeometry(1.3, 0.2, 0.2), mat(0x4a4a62, { metalness: 0.5 }), { cast: false, pos: [s * 0.62, 0, 0] }); st.add(arm);
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 3.4), [mat(0xffffff), mat(0xffffff), mat(0xffffff), mat(0xffffff), new THREE.MeshStandardMaterial({ map: bbT, transparent: true, roughness: 0.2 }), new THREE.MeshStandardMaterial({ map: bbT, transparent: true, roughness: 0.2 })]); board.castShadow = false; st.add(board);
    const rimG = new THREE.Group(); rimG.position.set(-s * (RR + 0.2 + 0.0) , 0, 0); st.add(rimG);
    const rimM = new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xaa2a00, emissiveIntensity: 0.6, roughness: 0.4 });
    rimG.add(mesh(new THREE.TorusGeometry(RR, BK.RT, 8, 28), rimM, { cast: false, rot: [Math.PI / 2, 0, 0] }));
    rimG.add(mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), rimM, { cast: false, pos: [s * (RR + 0.1), 0, 0] }));
    const net = new THREE.Mesh(new THREE.CylinderGeometry(RR, RR * 0.55, 1.25, 12, 1, true), netM); net.position.y = -0.62; rimG.add(net);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe14a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.set(6, 6, 1); glow.position.y = -0.4; rimG.add(glow);
    C.hoops.push({ k, s, g, st, rimG, net, glow, swish: 0 });
  }

  // trampoline-bakken en orbs worden in het spel zelf gemaakt. Scheidsrechter: de Deurman
  const ref = makeDeurman(1.2); ref.group.position.set(0, 0, -4.4); ref.group.rotation.y = Math.PI; ref.pose = 'idle'; scene.add(ref.group); C.ref = ref; ref.group.userData.dynamic = true; C.refLook = 0; C.refAng = Math.PI; C.refAlert = 0;
  const eye = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(256, 96, (c, w, hh) => { c.font = 'bold 54px Fredoka, Arial Black, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = 'rgba(30,0,0,.95)'; c.lineJoin = 'round'; c.strokeText('DEURMAN KIJKT!', w / 2, hh / 2, w - 10); c.fillStyle = '#ff4a3a'; c.fillText('DEURMAN KIJKT!', w / 2, hh / 2, w - 10); }), transparent: true, depthTest: false })); eye.scale.set(5.4, 2.0, 1); eye.position.set(0, 5.8, -4.3); eye.renderOrder = 15; eye.visible = false; scene.add(eye); C.refSign = eye;

  // scorebord
  const sbC = document.createElement('canvas'); sbC.width = 768; sbC.height = 256; const sbG = sbC.getContext('2d'); const sbT = new THREE.CanvasTexture(sbC); sbT.colorSpace = THREE.SRGBColorSpace;
  const sb = new THREE.Group(); sb.position.set(0, 10.7, -6.7); scene.add(sb);
  sb.add(mesh(new THREE.BoxGeometry(9.6, 3.2, 0.5), mat(0x1a1634, { metalness: 0.6 }), { cast: false })); sb.add(mesh(new THREE.PlaneGeometry(9.1, 2.8), new THREE.MeshBasicMaterial({ map: sbT, toneMapped: false }), { cast: false, receive: false, pos: [0, 0, 0.27] }));
  const CSS = ['#7dffb0', '#8fb8ff'];
  C.scoreboard = (names, score, secs, note) => {
    const g = sbG, w = 768, h = 256; g.fillStyle = '#0b0724'; g.fillRect(0, 0, w, h); g.strokeStyle = '#ffd23f'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 40px Fredoka, Arial Black, sans-serif'; g.fillStyle = CSS[0]; g.fillText(names[0].toUpperCase(), 160, 46); g.fillStyle = CSS[1]; g.fillText(names[1].toUpperCase(), w - 160, 46);
    g.font = 'bold 130px Fredoka, Arial Black, sans-serif'; g.fillStyle = CSS[0]; g.fillText(String(score[0]), 160, 150); g.fillStyle = CSS[1]; g.fillText(String(score[1]), w - 160, 150);
    const mm = Math.floor(Math.max(0, secs) / 60), ss = Math.floor(Math.max(0, secs) % 60); g.font = 'bold 62px Fredoka, Arial Black, sans-serif'; g.fillStyle = secs <= 15 ? '#ff7a6a' : '#fff'; g.fillText(note || `${mm}:${String(ss).padStart(2, '0')}`, w / 2, 86);
    g.font = 'bold 28px Fredoka, Arial Black, sans-serif'; g.fillStyle = '#cfe0ff'; g.fillText('eerste tot 21', w / 2, 200); sbT.needsUpdate = true;
  };
  C.scoreboard(['Wes', 'Jor'], [0, 0], 90);

  C.merged = mergeStatic(scene, idx0);

  // ---- bediening ----
  C.setHoopOff = (dy) => { C.hoopOff = dy; for (const h of C.hoops) h.st.position.y = RIMY + dy; };
  C.setHoopOff(0);
  C.cheer = (secs = 2.5) => { for (const q of C.crowd) q.cheer = secs * (0.7 + Math.random() * 0.6); };
  C.swish = (k, strength = 1) => { C.hoops[k].swish = strength; C.hoops[k].glow.material.opacity = 0.8; };
  let tt = 0;
  C.update = (t, dt) => {
    C.frame++; tt = t;
    for (const q of C.crowd) { q.cheer = Math.max(0, q.cheer - dt); q.c.group.position.y = q.y + (q.cheer > 0 ? Math.abs(Math.sin(t * 8 + q.ph)) * 0.7 : Math.abs(Math.sin(t * 1.6 + q.ph)) * 0.05); q.c.pose = q.cheer > 0 ? 'cheer' : 'idle'; q.c.update(dt); }
    if (C.hen) { C.hen.update(dt); C.hen.group.position.y = Math.abs(Math.sin(t * 3)) * 0.1; }
    for (const h of C.hoops) { h.swish = Math.max(0, h.swish - dt * 2.2); h.net.scale.set(1 + h.swish * 0.18 * Math.sin(t * 30), 1 + h.swish * 0.3 * Math.abs(Math.sin(t * 22)), 1 + h.swish * 0.18 * Math.sin(t * 30)); h.glow.material.opacity = Math.max(0, h.glow.material.opacity - dt * 1.6); }
    for (const [i, s] of (C.boom || []).entries()) s.scale.setScalar(1 + Math.max(0, Math.sin(t * 9 + i)) * 0.18);
    // scheidsrechter draait zich om als hij kijkt
    const want = Math.PI * (1 - clamp(C.refLook, 0, 1)); C.refAng += (want - C.refAng) * (1 - Math.exp(-7 * dt)); C.ref.group.rotation.y = C.refAng + Math.sin(t * 1.3) * 0.04; C.ref.pose = C.refLook >= 1 ? 'point' : 'idle'; C.ref.update(dt);
    C.refSign.visible = C.refLook >= 1 && Math.sin(t * 14) > -0.4; for (const e of C.ref.eyeGlow || []) e.visible = C.refLook >= 1;
    for (const sp of C.lamps) sp.material.opacity = 0.8 + Math.sin(t * 3 + sp.position.x) * 0.05;
    if (C.clouds) C.clouds.forEach((c, i) => { c.position.x += dt * (0.4 + i * 0.2); if (c.position.x > 70) c.position.x = -70; });
  };
  return C;
}
