import * as THREE from 'three';
import { mat, mesh, canvasTex, clamp, lerp, damp, mulberry32, TAU, rand, smoothstep } from '../engine/util.js';
import { tex } from '../engine/textures.js';
import { makeDeurman, Animal } from '../engine/chars.js';
import { mergeStatic } from '../world/merge.js';

// Omgeving van "Deurman Zegt": een quizshow-podium met gouden lampjes, rode gordijnen, een enorm deurkozijn voor de Deurman
// en een publiek van levende deurtjes (instanced). Plus de Deurman-acteur (poses), de tekstballon en de kip.

export const FONT = 'Fredoka, Arial Black, sans-serif';
const DOOR_COLS = [0x8a5a2e, 0xc0432f, 0x3a78e0, 0x2f9e5b, 0x8f4ad8, 0xe0a82a, 0x2aa8a0, 0xd8457f, 0x6b4226];

// ---------------------------------------------------------------- Deurman-acteur
const ARM_UP = -2.85;
// Elke modus geeft doelwaarden voor lichaamsdelen (u = tijd in de modus)
const POSES = {
  idle: (t) => ({ al: [Math.sin(t * 0.9) * 0.05, 0.05], ar: [Math.sin(t * 0.8 + 1) * 0.05, -0.05], tx: 0.06, hz: Math.sin(t * 0.7) * 0.05 }),
  say: (t) => ({ al: [-0.2, 0.15], ar: [-1.0 + Math.sin(t * 7) * 0.15, -0.5], tx: 0.12, hx: Math.sin(t * 14) * 0.1, hz: Math.sin(t * 3) * 0.1 }),
  jump: (t, u) => ({ al: [ARM_UP, 0.3], ar: [ARM_UP, -0.3], y: 1.5 * Math.sin(Math.PI * clamp(u, 0, 1)), legs: [-0.5, 0.4], tx: -0.1 }),
  duck: () => ({ al: [-0.6, 0.6], ar: [-0.6, -0.6], sy: 0.55, sx: 1.2, tx: 0.3, hx: 0.3 }),
  spin: (t, u) => ({ al: [-0.4, 1.2], ar: [-0.4, -1.2], yaw: TAU * smoothstep(0, 1, clamp(u, 0, 1)) }),
  wave: (t) => ({ al: [0.05, 0.1], ar: [-2.6, -0.5 + Math.sin(t * 12) * 0.5], tx: 0.0, hz: 0.15 }),
  hoera: (t) => ({ al: [ARM_UP + Math.sin(t * 12) * 0.2, 0.2], ar: [ARM_UP - Math.sin(t * 12) * 0.2, -0.2], y: Math.abs(Math.sin(t * 8)) * 0.35, hx: -0.15 }),
  sit: () => ({ al: [-1.2, 0.2], ar: [-1.2, -0.2], legs: [-1.5, -1.5], sink: 1, tx: 0.0 }),
  sleep: (t) => ({ al: [0.1, 0.1], ar: [0.1, -0.1], tx: 0.35 + Math.sin(t * 1.4) * 0.03, hx: 0.95, hz: 0.12 }),
  laugh: (t) => ({ al: [-0.9, 0.2], ar: [-0.9, -0.2], tx: -0.15 + Math.sin(t * 22) * 0.06, hx: -0.35, tz: Math.sin(t * 17) * 0.06, y: Math.abs(Math.sin(t * 11)) * 0.12 }),
  shrug: (t) => ({ al: [-0.2, 0.95], ar: [-0.2, -0.95], hz: Math.sin(t * 5) * 0.25, tx: 0.0, y: 0 }),
  cheer: (t) => ({ al: [ARM_UP - Math.sin(t * 10) * 0.4, 0.3], ar: [ARM_UP + Math.sin(t * 10) * 0.4, -0.3], y: Math.abs(Math.sin(t * 6)) * 0.5, tz: Math.sin(t * 6) * 0.07 }),
  sulk: (t) => ({ al: [-1.0, 0.7], ar: [-1.0, -0.7], hx: 0.45, tx: 0.25 }),
};
const MOVE_POSE = { A: 'jump', B: 'duck', L: 'spin', R: 'wave', U: 'hoera', D: 'sit' };

export class DeurmanActor {
  constructor(scale) {
    this.s = scale;
    this.d = makeDeurman(scale);
    this.root = new THREE.Group(); this.root.add(this.d.group);
    this.d.eyeGlow.forEach((e) => { e.visible = false; });
    // eigen mini-accessoires: hoge hoed, strikje en gouden naamkaartje
    const hat = new THREE.Group(); hat.position.y = 0.27 * scale; this.d.head.add(hat);
    hat.add(mesh(new THREE.CylinderGeometry(0.34 * scale, 0.34 * scale, 0.04 * scale, 18), mat(0x111118), { pos: [0, 0, 0] }));
    hat.add(mesh(new THREE.CylinderGeometry(0.21 * scale, 0.23 * scale, 0.38 * scale, 16), mat(0x111118), { pos: [0, 0.2 * scale, 0] }));
    hat.add(mesh(new THREE.CylinderGeometry(0.235 * scale, 0.235 * scale, 0.07 * scale, 16), mat(0xe03a5a), { pos: [0, 0.08 * scale, 0] }));
    hat.add(mesh(new THREE.OctahedronGeometry(0.06 * scale, 0), mat(0xffd23f, { metalness: 0.5, emissive: 0x6a4800 }), { pos: [0.16 * scale, 0.09 * scale, 0.17 * scale] }));
    const bow = new THREE.Group(); bow.position.set(0, 0.97 * scale, 0.235 * scale); this.d.torso.add(bow);
    for (const sd of [1, -1]) bow.add(mesh(new THREE.ConeGeometry(0.09 * scale, 0.17 * scale, 4), mat(0xe03a5a), { cast: false, pos: [sd * 0.1 * scale, 0, 0], rot: [0, 0, sd * Math.PI / 2] }));
    bow.add(mesh(new THREE.SphereGeometry(0.035 * scale, 6, 5), mat(0xffd23f), { cast: false }));
    this.mode = 'idle'; this.mt = 0; this.dur = 0; this.next = 'idle'; this.t = 0;
    this.cur = { al: [0, 0], ar: [0, 0], tx: 0, tz: 0, hx: 0.1, hz: 0, y: 0, sy: 1, sx: 1, yaw: 0, legs: [0, 0], sink: 0 };
    this.zT = 0; this.baseY = 0;
  }
  // start een modus voor `dur` seconden (0 = blijvend); daarna terug naar `next`
  play(mode, dur = 0, next = 'idle') { if (!POSES[mode]) mode = 'idle'; this.mode = mode; this.mt = 0; this.dur = dur; this.next = next; }
  move(m, dur = 0.8) { this.play(MOVE_POSE[m], dur, 'idle'); }
  update(dt) {
    this.t += dt; this.mt += dt;
    if (this.dur > 0 && this.mt >= this.dur) { this.mode = this.next; this.mt = 0; this.dur = 0; this.next = 'idle'; }
    const u = this.dur > 0 ? this.mt / this.dur : 0;
    const p = POSES[this.mode](this.t, u);
    const c = this.cur, k = this.mode === 'jump' || this.mode === 'spin' ? 30 : 13;
    const tg = { al: p.al || [0, 0.05], ar: p.ar || [0, -0.05], tx: p.tx ?? 0.06, tz: p.tz ?? 0, hx: p.hx ?? 0.1, hz: p.hz ?? 0, y: p.y ?? 0, sy: p.sy ?? 1, sx: p.sx ?? 1, yaw: p.yaw ?? 0, legs: p.legs || [0, 0], sink: p.sink || 0 };
    c.al[0] = damp(c.al[0], tg.al[0], k, dt); c.al[1] = damp(c.al[1], tg.al[1], k, dt);
    c.ar[0] = damp(c.ar[0], tg.ar[0], k, dt); c.ar[1] = damp(c.ar[1], tg.ar[1], k, dt);
    c.tx = damp(c.tx, tg.tx, k, dt); c.tz = damp(c.tz, tg.tz, k, dt); c.hx = damp(c.hx, tg.hx, k, dt); c.hz = damp(c.hz, tg.hz, k, dt);
    c.y = this.mode === 'jump' ? tg.y : damp(c.y, tg.y, 20, dt);
    c.sy = damp(c.sy, tg.sy, 22, dt); c.sx = damp(c.sx, tg.sx, 22, dt);
    c.yaw = this.mode === 'spin' ? tg.yaw : damp(c.yaw, 0, 12, dt);
    c.legs[0] = damp(c.legs[0], tg.legs[0], k, dt); c.legs[1] = damp(c.legs[1], tg.legs[1], k, dt); c.sink = damp(c.sink, tg.sink, 12, dt);
    const d = this.d; d.update(dt);
    d.arms[0].rotation.x = c.al[0]; d.arms[0].rotation.z = c.al[1]; d.arms[1].rotation.x = c.ar[0]; d.arms[1].rotation.z = c.ar[1];
    d.torso.rotation.x = c.tx; d.torso.rotation.z = c.tz; d.head.rotation.x = c.hx; d.head.rotation.z = c.hz + d.tilt * 0.5;
    d.legs[0].rotation.x = c.legs[0]; d.legs[1].rotation.x = c.legs[1];
    this.root.position.y = this.baseY + c.y - c.sink * (1.35 * this.s - 0.25);
    this.root.scale.set(c.sx, c.sy, c.sx); this.root.rotation.y = c.yaw;
    d.eyeGlow.forEach((e) => { e.visible = false; });   // geen laser-ogen: dit is een vrolijke quiz
  }
}

// ---------------------------------------------------------------- tekstballon (canvas)
const STY = {
  say: { fill: '#fffbe8', line: '#ffb800', head: '#c47a00', word: '#2a1a4a' },
  plain: { fill: '#ffffff', line: '#8a93a8', head: '#6a7488', word: '#2a2a3a' },
  chicken: { fill: '#fff0d8', line: '#ff7a2a', head: '#d8571a', word: '#7a2a0a' },
  sleep: { fill: '#e3ecff', line: '#7a8cff', head: '#5a68c8', word: '#3a4290' },
  good: { fill: '#e9ffe6', line: '#3ac45a', head: '#2a9a44', word: '#14502a' },
  bad: { fill: '#ffe8e8', line: '#e0453a', head: '#b02a22', word: '#6a1410' },
};
function makeBubble() {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 340;
  const g = cv.getContext('2d');
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 4.12), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
  m.renderOrder = 30;
  const draw = ({ header = '', word = '', sub = '', style = 'plain', pop = 0 }) => {
    const s = STY[style] || STY.plain;
    g.clearRect(0, 0, 1024, 340);
    const sc = 1 + pop * 0.04; g.save(); g.translate(512, 150); g.scale(sc, sc); g.translate(-512, -150);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.roundRect(26, 24, 980, 250, 50); g.fill();
    g.fillStyle = s.fill; g.strokeStyle = s.line; g.lineWidth = 12; g.beginPath(); g.roundRect(14, 12, 980, 250, 50); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(470, 258); g.lineTo(512, 326); g.lineTo(556, 258); g.closePath(); g.fillStyle = s.fill; g.fill(); g.strokeStyle = s.line; g.stroke();
    g.fillStyle = s.fill; g.fillRect(480, 252, 66, 14);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (header) { g.font = `bold 50px ${FONT}`; g.fillStyle = s.head; g.fillText(header, 504, 62, 900); }
    if (word) {
      let fs = 130; g.font = `bold ${fs}px ${FONT}`; const w = g.measureText(word).width; if (w > 900) { fs = Math.floor(fs * 900 / w); g.font = `bold ${fs}px ${FONT}`; }
      g.lineWidth = 12; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineJoin = 'round'; g.strokeText(word, 504, header ? 156 : 130, 940);
      g.fillStyle = s.word; g.fillText(word, 504, header ? 156 : 130, 940);
    }
    if (sub) { g.font = `bold 44px ${FONT}`; g.fillStyle = s.head; g.fillText(sub, 504, 226, 920); }
    g.restore();
    t.needsUpdate = true;
  };
  return { mesh: m, draw };
}

// ---------------------------------------------------------------- het podium
export function buildStage(ctx, L) {
  const { scene } = ctx;
  const S = {};
  const r = mulberry32(77);
  // vloer: houten podium met een grote ster
  const floorTex = tex.planks(7, 4, '#8a5a34');
  const floor = mesh(new THREE.BoxGeometry(46, 0.6, 26), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.8 }), { cast: false, pos: [0, -0.3, 0] }); scene.add(floor);
  const starTex = canvasTex(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.translate(w / 2, h / 2);
    g.fillStyle = 'rgba(255,214,80,.28)'; g.strokeStyle = 'rgba(255,225,120,.7)'; g.lineWidth = 8; g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 90 : 230; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke();
    g.beginPath(); g.arc(0, 0, 245, 0, TAU); g.stroke();
  });
  const star = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: starTex, transparent: true, depthWrite: false })); star.rotation.x = -Math.PI / 2; star.position.set(0, 0.03, 0.5); scene.add(star); S.star = star;
  // achterwand + balustrade
  const wallTex = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1c1040'); gr.addColorStop(1, '#3a1a60'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,${200 + r() * 55 | 0},${120 + r() * 100 | 0},${0.25 + r() * 0.5})`; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.4, 0, TAU); g.fill(); }
  });
  const wall = mesh(new THREE.PlaneGeometry(90, 34), new THREE.MeshBasicMaterial({ map: wallTex }), { cast: false, receive: false, pos: [0, 12, -24] }); scene.add(wall);
  scene.add(mesh(new THREE.BoxGeometry(46, 1.6, 0.7), mat(0x7a1a2a, { flatShading: false }), { pos: [0, 0.8, -9.6] }));
  scene.add(mesh(new THREE.BoxGeometry(46, 0.18, 0.95), mat(0xe8b830, { metalness: 0.5, roughness: 0.4, flatShading: false }), { pos: [0, 1.65, -9.6] }));
  // tribune-trappen achter de balustrade
  for (let k = 0; k < 3; k++) scene.add(mesh(new THREE.BoxGeometry(46, 1.6 + k * 1.9, 2.2), mat(k % 2 ? 0x3a1f4a : 0x2e1840, { flatShading: false }), { pos: [0, (1.6 + k * 1.9) / 2 - 0.0, -11 - k * 2.2] }));
  // gordijnen
  for (const sd of [-1, 1]) {
    scene.add(mesh(new THREE.BoxGeometry(5, 26, 1.2), mat(0x8a1428, { flatShading: false }), { cast: false, pos: [sd * 21, 11, -4] }));
    for (let k = 0; k < 6; k++) scene.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 25, 8), mat(k % 2 ? 0xa81c34 : 0x7a1022, { flatShading: false }), { cast: false, pos: [sd * (18.8 + k * 0.9), 11, -3.2] }));
    scene.add(mesh(new THREE.BoxGeometry(6, 1.0, 1.6), mat(0xe8b830, { metalness: 0.5, flatShading: false }), { cast: false, pos: [sd * 20, 21.5, -3.4] }));
  }
  scene.add(mesh(new THREE.BoxGeometry(48, 2.2, 1.4), mat(0x8a1428, { flatShading: false }), { cast: false, pos: [0, 22, -4.5] }));
  // het enorme deurkozijn waar de Deurman voor staat
  const fr = new THREE.Group(); fr.position.set(0, 0, -8.4);
  const wood = mat(0x4a2a14, { flatShading: false });
  fr.add(mesh(new THREE.BoxGeometry(0.9, 9.2, 0.9), wood, { pos: [-3.4, 4.6, 0] }), mesh(new THREE.BoxGeometry(0.9, 9.2, 0.9), wood, { pos: [3.4, 4.6, 0] }), mesh(new THREE.BoxGeometry(7.7, 0.9, 0.9), wood, { pos: [0, 9.2, 0] }));
  fr.add(mesh(new THREE.BoxGeometry(5.9, 8.8, 0.2), new THREE.MeshBasicMaterial({ map: canvasTex(8, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6a2a8a'); gr.addColorStop(0.55, '#d8509a'); gr.addColorStop(1, '#ff9a4a'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }), { cast: false, receive: false, pos: [0, 4.4, -0.4] }));
  const glowTex = canvasTex(128, 256, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h * 0.55, 4, w / 2, h * 0.55, h * 0.55); gr.addColorStop(0, 'rgba(255,200,140,.55)'); gr.addColorStop(1, 'rgba(255,160,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  fr.add(mesh(new THREE.PlaneGeometry(5.9, 8.8), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false }), { cast: false, receive: false, pos: [0, 4.4, -0.28] }));
  const leaf = new THREE.Group(); leaf.position.set(-2.95, 0, 0.3); leaf.rotation.y = 1.25; leaf.userData.dynamic = true;
  leaf.add(mesh(new THREE.BoxGeometry(5.9, 8.6, 0.25), new THREE.MeshStandardMaterial({ map: tex.planks(1, 2, '#6b4226'), roughness: 0.9 }), { pos: [2.95, 4.3, 0] }));
  leaf.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(0xe8c24a, { metalness: 0.7 }), { pos: [5.3, 4.2, 0.2] }));
  fr.add(leaf); S.leaf = leaf; scene.add(fr);
  // podia: Deurman (hoog) en twee spelers
  const pod = new THREE.Group(); pod.position.set(0, 0, -3.6);
  pod.add(mesh(new THREE.CylinderGeometry(3.2, 3.5, 1.2, 24), mat(0x7a1a2a, { flatShading: false }), { pos: [0, 0.6, 0] }));
  pod.add(mesh(new THREE.CylinderGeometry(3.3, 3.3, 0.14, 24), mat(0xe8b830, { metalness: 0.6, roughness: 0.35, flatShading: false }), { pos: [0, 1.22, 0] }));
  pod.add(mesh(new THREE.TorusGeometry(3.45, 0.12, 6, 36), mat(0xffd23f, { emissive: 0x6a4800, flatShading: false }), { cast: false, pos: [0, 1.0, 0], rot: [Math.PI / 2, 0, 0] }));
  scene.add(pod);
  const colors = [0x2f9e5b, 0x3a78e0]; S.pods = [];
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Group(); g.position.set(i ? 6.4 : -6.4, 0, 1.2);
    g.add(mesh(new THREE.CylinderGeometry(2.3, 2.5, 0.5, 20), mat(colors[i], { flatShading: false }), { pos: [0, 0.25, 0] }));
    g.add(mesh(new THREE.CylinderGeometry(2.25, 2.25, 0.08, 20), new THREE.MeshStandardMaterial({ color: colors[i], emissive: colors[i], emissiveIntensity: 0.55 }), { cast: false, pos: [0, 0.52, 0] }));
    g.add(mesh(new THREE.TorusGeometry(2.4, 0.1, 6, 30), mat(0xffd23f, { emissive: 0x6a4800, flatShading: false }), { cast: false, pos: [0, 0.4, 0], rot: [Math.PI / 2, 0, 0] }));
    scene.add(g); S.pods.push(g);
  }
  // lampjes-slingers boven het podium
  const bulbN = 46, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbN * 2);
  const dm = new THREE.Object3D(); const bc = [0xffd23f, 0xff5a7a, 0x6fd8ff, 0x8dff9a, 0xffa030];
  for (let k = 0; k < bulbN; k++) for (let row = 0; row < 2; row++) {
    const u = k / (bulbN - 1), x = lerp(-19, 19, u), y = (row ? 19.2 : 17.2) - Math.sin(u * Math.PI) * 1.0 * (row ? 1 : 0.6) - (row ? 0 : 0.4);
    dm.position.set(x, y, -7.4 + row * 0.6); dm.updateMatrix(); bulbs.setMatrixAt(k * 2 + row, dm.matrix); bulbs.setColorAt(k * 2 + row, new THREE.Color(bc[(k + row * 2) % bc.length]));
  }
  scene.add(bulbs); S.bulbs = bulbs;
  // lichtbundels (additief)
  const beamTex = canvasTex(32, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  S.beams = [];
  [[-9, 0xffd23f], [9, 0x6fd8ff], [0, 0xff7ab8]].forEach(([x, col], k) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 2.6, 17, 14, 1, true), new THREE.MeshBasicMaterial({ map: beamTex, color: col, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    b.position.set(x * 0.85, 9.5, -2 + k * 0.5); b.rotation.z = -x * 0.012; b.userData.ph = k * 2; scene.add(b); S.beams.push(b);
  });
  S.lightsExtra = [new THREE.PointLight(0xffb060, 1.4, 40, 1.4), new THREE.PointLight(0x9a7aff, 1.1, 40, 1.4)];
  S.lightsExtra[0].position.set(-10, 9, 6); S.lightsExtra[1].position.set(10, 9, 6); S.lightsExtra.forEach((l) => scene.add(l));

  // ---- publiek van deurtjes (instanced: 6 draw calls) ----
  const spots = [];
  for (let row = 0; row < 3; row++) for (let k = 0; k < 15; k++) {
    const x = -17.4 + k * 2.5 + (row % 2) * 0.9; if (Math.abs(x) < 4.2 || Math.abs(x) > 19.5) continue;
    spots.push({ x, y: 1.6 + row * 1.9 + 1.55, z: -10.4 - row * 2.2, ph: r() * TAU, cheer: 0, gasp: 0, look: (r() - 0.5), col: DOOR_COLS[(r() * DOOR_COLS.length) | 0], sp: 5 + r() * 3 });
  }
  const N = spots.length;
  const leafI = new THREE.InstancedMesh(new THREE.BoxGeometry(1.7, 3.0, 0.25), new THREE.MeshStandardMaterial({ roughness: 0.85 }), N);
  const knobI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshStandardMaterial({ color: 0xe8c24a, metalness: 0.7, roughness: 0.4 }), N);
  const eyeI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), N * 2);
  const pupI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshBasicMaterial({ color: 0x15121a }), N * 2);
  const mouthI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3d1b1b }), N);
  const panI = new THREE.InstancedMesh(new THREE.BoxGeometry(1.2, 1.0, 0.3), new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  spots.forEach((d, k) => { const c = new THREE.Color(d.col); leafI.setColorAt(k, c); panI.setColorAt(k, c.clone().multiplyScalar(0.72)); });
  for (const im of [leafI, knobI, eyeI, pupI, mouthI, panI]) { im.frustumCulled = false; scene.add(im); }
  const M = new THREE.Matrix4(), Mb = new THREE.Matrix4(), Ml = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const put = (im, idx, lx, ly, lz, sx, sy, sz) => { Ml.compose(v.set(lx, ly, lz), q.identity(), sc.set(sx, sy, sz)); M.multiplyMatrices(Mb, Ml); im.setMatrixAt(idx, M); };
  S.audCheer = (secs = 1.6) => { for (const d of spots) d.cheer = secs * (0.6 + Math.random() * 0.8); };
  S.audGasp = (secs = 1.2) => { for (const d of spots) d.gasp = secs * (0.6 + Math.random() * 0.8); };
  let at = 0;
  S.updateAudience = (t, dt) => {
    at += dt;
    spots.forEach((d, k) => {
      d.cheer = Math.max(0, d.cheer - dt); d.gasp = Math.max(0, d.gasp - dt);
      const cheering = d.cheer > 0, gasp = d.gasp > 0;
      const bob = cheering ? Math.abs(Math.sin(at * d.sp + d.ph)) * 0.55 : gasp ? 0.12 : Math.sin(at * 1.5 + d.ph) * 0.04;
      const wob = cheering ? Math.sin(at * d.sp * 0.7 + d.ph) * 0.14 : gasp ? Math.sin(at * 30 + d.ph) * 0.02 : Math.sin(at * 0.9 + d.ph) * 0.02;
      e.set(0, 0, wob); q.setFromEuler(e);
      Mb.compose(v.set(d.x, d.y + bob, d.z), q, sc.set(1, gasp ? 1.07 : 1, 1));
      leafI.setMatrixAt(k, Mb);
      put(panI, k, 0, 0.15, 0.12, 1, 1, 1);
      put(knobI, k, 0.62, -0.75, 0.2, 1, 1, 1);
      for (let s = 0; s < 2; s++) {
        const sx = s ? 0.4 : -0.4, bl = (Math.sin(at * 0.7 + d.ph * 3) > 0.985) ? 0.15 : 1;
        put(eyeI, k * 2 + s, sx, 0.78, 0.16, gasp ? 1.25 : 1, (gasp ? 1.25 : 1) * bl, 0.6);
        put(pupI, k * 2 + s, sx + d.look * 0.12, 0.78 - (gasp ? 0 : 0.02), 0.26, 1, bl, 0.6);
      }
      put(mouthI, k, 0, 0.18, 0.2, gasp ? 0.9 : cheering ? 1.8 : 1.5, gasp ? 1.5 : cheering ? 1.3 : 0.5, 0.4);
    });
    for (const im of [leafI, knobI, eyeI, pupI, mouthI, panI]) im.instanceMatrix.needsUpdate = true;
  };
  S.updateAudience(0, 0.001);

  // dansende lampjes / bundels
  S.update = (t, dt) => {
    S.beams.forEach((b, k) => { b.rotation.z = Math.sin(t * 0.6 + b.userData.ph) * 0.18; b.material.opacity = 0.26 + Math.sin(t * 1.7 + k) * 0.06; });
    S.lightsExtra[0].intensity = 1.3 + Math.sin(t * 1.3) * 0.25; S.lightsExtra[1].intensity = 1.0 + Math.sin(t * 1.1 + 2) * 0.25;
    S.star.material.opacity = 0.8 + Math.sin(t * 2) * 0.2;
    S.updateAudience(t, dt);
  };
  mergeStatic(scene, 0);
  return S;
}

// ---------------------------------------------------------------- bubbels en kip
export function makeBubbleSprite(scene) { const b = makeBubble(); b.mesh.position.set(0, 9.5, -2.5); b.mesh.scale.setScalar(0.88); scene.add(b.mesh); return b; }

export function makeChicken(scene) {
  const a = new Animal('chicken'); const g = new THREE.Group(); g.add(a.group); g.scale.setScalar(2.6); g.position.set(-26, 0, 6.2); g.visible = false; g.userData.dynamic = true; scene.add(g);
  return { a, g, mode: 'off', t: 0, x: -26, hop: 0 };
}
