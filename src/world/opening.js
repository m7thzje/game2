import * as THREE from 'three';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { S, persist } from '../save.js';
import { Particles } from '../engine/particles.js';
import { makeBrother, makeDeurman } from '../engine/chars.js';
import { setupLights } from '../engine/lights.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { h, mesh, mat, glow, canvasTex, rand, TAU, damp, lerp, smoothstep } from '../engine/util.js';
import { mergeStatic } from './merge.js';

// ============================================================================
// Opening (±40 s): knop-knop-knop -> de Deurman bezorgt een uitnodiging -> reis naar de berg -> poort SPEELHAL gaat aan.
// Overslaan: houd een actieknop 1 s ingedrukt, tik 2x snel op je B-knop, of druk Esc. Daarna: app.goArcade({ intro: true }).
// Dit bestand bevat ook buildGate(): de berg met de Speelhal-poort (ook gebruikt als achtergrond van het titelscherm).
// ============================================================================
const SKIP = Symbol('skip');
const NEON = [0xff2bd6, 0x00e5ff, 0xffe14a];

// ---- kleine propjes voor de Deurman (grappig!) ----
export function partyHat(s = 1, c = 0xff3d81, c2 = 0xffe14a) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.ConeGeometry(0.13 * s, 0.36 * s, 10), mat(c), { pos: [0, 0.18 * s, 0], cast: false }));
  for (const y of [0.09, 0.2]) g.add(mesh(new THREE.TorusGeometry(0.13 * s * (1 - y / 0.36 * 0.97) + 0.004, 0.012 * s, 4, 12), mat(c2), { pos: [0, y * s, 0], rot: [Math.PI / 2, 0, 0], cast: false }));
  g.add(mesh(new THREE.SphereGeometry(0.04 * s, 8, 6), mat(c2), { pos: [0, 0.38 * s, 0], cast: false }));
  return g;
}
export function envelope(s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(0.34 * s, 0.24 * s, 0.03 * s), mat(0xf6efd8), { cast: false }));
  g.add(mesh(new THREE.ConeGeometry(0.17 * s, 0.12 * s, 3), mat(0xe8dcb8), { pos: [0, 0.07 * s, 0.018 * s], rot: [0, 0, Math.PI], cast: false }));
  g.add(mesh(new THREE.CylinderGeometry(0.035 * s, 0.035 * s, 0.02 * s, 8), mat(0xd8372c), { pos: [0, 0.0, 0.03 * s], rot: [Math.PI / 2, 0, 0], cast: false }));
  return g;
}
export function flower(s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.01 * s, 0.012 * s, 0.4 * s, 5), mat(0x3f9e3a), { pos: [0, 0.2 * s, 0], cast: false }));
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; g.add(mesh(new THREE.SphereGeometry(0.05 * s, 6, 5), mat(0xff6fa5), { pos: [Math.cos(a) * 0.065 * s, 0.42 * s, Math.sin(a) * 0.065 * s], cast: false })); }
  g.add(mesh(new THREE.SphereGeometry(0.045 * s, 6, 5), mat(0xffe14a), { pos: [0, 0.42 * s, 0], cast: false }));
  return g;
}

// ---- de berg met de poort ----
const signTex = (on) => canvasTex(1024, 220, (g, w, hh) => {
  g.fillStyle = on ? '#1a0a2e' : '#120a1c'; g.fillRect(0, 0, w, hh);
  g.strokeStyle = on ? '#00e5ff' : '#2a3a4a'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, hh - 16);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 150px Fredoka, Arial Black, sans-serif';
  if (on) { g.shadowColor = '#ff2bd6'; g.shadowBlur = 36; g.fillStyle = '#ffd6f6'; g.fillText('SPEELHAL', w / 2, hh / 2 + 6, w - 60); g.fillText('SPEELHAL', w / 2, hh / 2 + 6, w - 60); } else { g.fillStyle = '#3a2a4a'; g.fillText('SPEELHAL', w / 2, hh / 2 + 6, w - 60); }
});
const gradTex = (stops, w = 8, hh = 128) => canvasTex(w, hh, (g) => { const gr = g.createLinearGradient(0, 0, 0, hh); stops.forEach(([o, c]) => gr.addColorStop(o, c)); g.fillStyle = gr; g.fillRect(0, 0, w, hh); });

// Bouwt berg, poort, pad, bomen en lantaarns in `scene`. Retourneert { z, setSign(on), flicker(), update(dt, t), open, ...}
export function buildGate(scene, { gz = -30, trees = 22, clear = [] } = {}) {
  const first = scene.children.length;
  const G = { z: gz, open: 0, doorTarget: 0, signOn: false, flick: 0 };
  scene.add(mesh(new THREE.CircleGeometry(150, 40), new THREE.MeshStandardMaterial({ map: tex.grass(40, 40), color: 0x7a9a96 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, -0.02, 0] }));
  scene.add(mesh(new THREE.PlaneGeometry(4.2, 90), new THREE.MeshStandardMaterial({ map: tex.dirt(1, 18), color: 0xb8a8a0 }), { cast: false, pos: [0, 0.02, gz + 38], rot: [-Math.PI / 2, 0, 0] }));
  // berg + sneeuw
  const rockM = new THREE.MeshStandardMaterial({ color: 0x424a7c, roughness: 1, flatShading: true });
  scene.add(mesh(new THREE.ConeGeometry(26, 46, 7), rockM, { cast: false, pos: [0, 23, gz - 36] }));
  scene.add(mesh(new THREE.ConeGeometry(8.5, 12, 7), mat(0xe8eefc, { flatShading: true }), { cast: false, pos: [0, 41, gz - 36] }));
  for (const [x, z, r, hh] of [[-40, gz - 22, 22, 26], [42, gz - 24, 24, 30], [-16, gz - 44, 20, 34]]) scene.add(mesh(new THREE.ConeGeometry(r, hh, 6), rockM, { cast: false, pos: [x, hh / 2, z] }));
  // poortgebouw
  const sm = new THREE.MeshStandardMaterial({ map: tex.stone(3, 2), roughness: 0.95, flatShading: true });
  for (const sx of [-1, 1]) { scene.add(mesh(new THREE.BoxGeometry(7, 12, 4), sm, { pos: [sx * 7.5, 6, gz] })); const t = P.tower(17, 2.5); t.position.set(sx * 12.8, 0, gz); scene.add(t); }
  scene.add(mesh(new THREE.BoxGeometry(22, 4, 4), sm, { pos: [0, 11, gz] }));
  scene.add(mesh(new THREE.BoxGeometry(22, 1.2, 4.6), mat(0x2a2150), { pos: [0, 13.4, gz] }));
  // gloed binnen + lichtbundel op de grond
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 9.2), new THREE.MeshBasicMaterial({ map: gradTex([[0, '#fff2a8'], [0.5, '#ff7ad5'], [1, '#7a2fd4']]) })); inner.position.set(0, 4.6, gz - 1.8); scene.add(inner);
  G.beam = new THREE.Mesh(new THREE.PlaneGeometry(10, 26), new THREE.MeshBasicMaterial({ map: gradTex([[0, 'rgba(255,230,160,0)'], [1, 'rgba(255,230,160,1)']], 8, 64), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); G.beam.rotation.x = -Math.PI / 2; G.beam.position.set(0, 0.06, gz + 15); scene.add(G.beam);
  // deuren (dynamisch: draaien open)
  const doorM = new THREE.MeshStandardMaterial({ color: 0x6a3fc0, emissive: 0x3a1a90, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.6 });
  G.piv = [-1, 1].map((sx) => { const p = new THREE.Group(); p.position.set(sx * 4.2, 0, gz + 0.6); p.userData.dynamic = true; const leaf = mesh(new THREE.BoxGeometry(4.2, 9, 0.5), doorM, { pos: [-sx * 2.1, 4.5, 0] }); p.add(leaf); p.add(mesh(new THREE.BoxGeometry(3.4, 0.25, 0.1), glow(NEON[0], 1.4), { cast: false, pos: [-sx * 2.1, 6.5, 0.3] }), mesh(new THREE.BoxGeometry(3.4, 0.25, 0.1), glow(NEON[1], 1.4), { cast: false, pos: [-sx * 2.1, 2.5, 0.3] })); scene.add(p); return p; });
  // bord: twee texturen (uit/aan) + looplichtjes eromheen
  G.offTex = signTex(false); G.onTex = signTex(true);
  G.sign = new THREE.Mesh(new THREE.PlaneGeometry(15, 3.2), new THREE.MeshBasicMaterial({ map: G.offTex })); G.sign.position.set(0, 11, gz + 2.06); scene.add(G.sign);
  G.bulbs = [0, 1, 2].map((k) => { const grp = new THREE.Group(); grp.visible = false; scene.add(grp); return grp; });
  const bulbM = NEON.map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const bg = new THREE.SphereGeometry(0.17, 6, 4);
  let n = 0; const put = (x, y) => { const m = new THREE.Mesh(bg, bulbM[n % 3]); m.position.set(x, y, gz + 2.1); G.bulbs[n % 3].add(m); n++; };
  for (let x = -7.5; x <= 7.5; x += 1.25) { put(x, 12.75); put(x, 9.25); } for (let y = 9.75; y < 12.5; y += 1) { put(-7.75, y); put(7.75, y); }
  // het voetpad: lantaarns in neonkleuren (emissief, geen echte lichten)
  for (let i = 0; i < 7; i++) for (const sx of [-1, 1]) { const l = P.lampPost(NEON[(i + (sx > 0 ? 1 : 0)) % 3]); l.position.set(sx * 3.4, 0, gz + 10 + i * 9); scene.add(l); }
  for (let i = 0; i < trees; i++) { const a = rand(0, TAU), d = rand(9, 46); const x = Math.cos(a) * d * 1.3, z = gz + 14 + Math.sin(a) * d; if ((Math.abs(x) < 5 && z < gz + 80) || clear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r)) { i--; continue; } const t = i % 3 ? P.pine(rand(5, 10)) : P.tree(rand(5, 8)); t.position.set(x, 0, z); scene.add(t); }
  for (const [x, z, c] of [[-5, gz + 20, 0xff6fa5], [5.5, gz + 26, 0xffe14a], [-6, gz + 34, 0xffffff], [6, gz + 9, 0x7bd8ff]]) { const f = P.flowerPatch(c, 8, 1.2); f.position.set(x, 0, z); scene.add(f); }
  // sterren + maan
  const sp = []; for (let i = 0; i < 500; i++) { const a = rand(0, TAU), e = rand(0.12, 1.3); sp.push(Math.cos(a) * Math.cos(e) * 280, Math.sin(e) * 280, Math.sin(a) * Math.cos(e) * 280); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
  scene.add(mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }), { cast: false, pos: [-70, 90, -190] }));
  mergeStatic(scene, first, { cell: 60 });
  G.setSign = (on) => { G.signOn = on; G.sign.material.map = on ? G.onTex : G.offTex; G.bulbs.forEach((b) => (b.visible = on && b === G.bulbs[0])); };
  G.flicker = () => { G.flick = 1.6; };   // bord flikkert aan
  G.openDoors = (v = true) => { G.doorTarget = v ? 1 : 0; };
  G.update = (dt, t) => {
    if (G.flick > 0) { G.flick -= dt; const on = Math.random() < 0.45 + (1.6 - G.flick) * 0.3; if (on !== G.signOn) { G.setSign(on); audio.sfx('click2', { vol: 0.5 }); } if (G.flick <= 0) { G.setSign(true); audio.sfx('powerup'); } }
    if (G.signOn) { const k = Math.floor(t * 4); G.bulbs.forEach((b, i) => (b.visible = (k + i) % 3 === 0)); }
    G.open = damp(G.open, G.doorTarget, 1.8, dt);
    G.piv[0].rotation.y = 1.55 * G.open; G.piv[1].rotation.y = -1.55 * G.open;
    G.beam.material.opacity = 0.55 * smoothstep(0.1, 0.9, G.open);
  };
  return G;
}

export class OpeningMode {
  constructor(app, opts = {}) {
    this.app = app; this.opts = opts; this.t = 0; this.shot = null; this.shake = 0; this.dead = false; this.skipped = false; this.hold = 0; this.lastB = -9; this.confettiT = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
    this.fx = new Particles(1500); this.scene.add(this.fx.points); this.fx.setViewportHeight(innerHeight);
    const L = setupLights(this.scene, 'night', { shadows: false, fogNear: 40, fogFar: 200 }); this.sun = L.sun; this.hemi = L.hemi;
    this.roomG = new THREE.Group(); this.scene.add(this.roomG); this.outG = new THREE.Group(); this.scene.add(this.outG);
    this.buildRoom(this.roomG);
    this.gate = buildGate(this.outG);
    // personages: Wes, Jor (met hun hoedjes) en de Deurman (feesthoedje, envelop, bloemetje)
    this.bros = [0, 1].map((i) => { const c = makeBrother(i); this.scene.add(c.group); return c; });
    this.deur = makeDeurman(0.82); this.scene.add(this.deur.group);
    this.hat = partyHat(0.82); this.hat.position.set(0.02, 0.2, 0); this.hat.rotation.z = 0.18; this.deur.head.add(this.hat);
    this.env = envelope(0.82); this.env.position.set(0, -1.42, 0.1); this.env.rotation.set(0, 0, 0.3); this.deur.arms[0].add(this.env);
    this.flw = flower(0.82); this.flw.position.set(0, -1.42, 0.06); this.deur.arms[1].add(this.flw);
    this.deurShown = false; this.deurMode = 'hold'; this.walk = 0; this.doorOpen = 0; this.doorTarget = 0;
    this.skipEl = h('div', { style: { position: 'absolute', right: '14px', top: '12px', padding: '5px 12px', borderRadius: '12px', background: 'rgba(20,12,30,.7)', border: '2px solid rgba(255,255,255,.25)', fontSize: '14px', zIndex: 40 } }, h('div', { html: 'Overslaan: houd <b>F</b> / <b>Enter</b> ingedrukt (of Esc)' }), h('div', { style: { height: '6px', borderRadius: '4px', background: '#2a1a3a', marginTop: '3px', overflow: 'hidden' } }, this.skipBar = h('i', { style: { display: 'block', height: '100%', width: '0%', background: '#ffe14a' } })));
    this.setScene('room');
    this.camera.position.set(0, 2.6, 7); this.camera.lookAt(0, 1, 0);
  }
  // ---- scene a/b: het huisje (poppenhuis-doorsnede, voorkant open) ----
  buildRoom(R) {
    const wood = new THREE.MeshStandardMaterial({ map: tex.planks(4, 3, '#a9774a'), roughness: 0.9 });
    const wall = new THREE.MeshStandardMaterial({ map: tex.planks(3, 2, '#7a5a3a'), roughness: 0.95 });
    const bx = (w, hh, d, x, y, z, m = wall) => R.add(mesh(new THREE.BoxGeometry(w, hh, d), m, { pos: [x, y, z], cast: false }));
    R.add(mesh(new THREE.PlaneGeometry(12, 10), wood, { cast: false, rot: [-Math.PI / 2, 0, 0] }));
    bx(4.7, 5, 0.4, -3.65, 2.5, -5); bx(4.7, 5, 0.4, 3.65, 2.5, -5); bx(2.6, 1.6, 0.4, 0, 4.2, -5);   // achtermuur met deuropening
    bx(0.4, 5, 10, -6.2, 2.5, 0); bx(0.4, 5, 10, 6.2, 2.5, 0);
    const fr = mat(0x2e1c0e); for (const sx of [-1, 1]) bx(0.2, 3.5, 0.5, sx * 1.4, 1.75, -5, fr); bx(3.0, 0.2, 0.5, 0, 3.5, -5, fr);
    this.doorPiv = new THREE.Group(); this.doorPiv.position.set(-1.3, 0, -4.95); this.doorPiv.add(mesh(new THREE.BoxGeometry(2.6, 3.4, 0.12), new THREE.MeshStandardMaterial({ map: tex.planks(1, 1, '#6b4226'), roughness: 0.9 }), { pos: [1.3, 1.7, 0], cast: false })); this.doorPiv.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), mat(0xe8c24a, { metalness: 0.7 }), { pos: [2.3, 1.6, 0.1], cast: false })); R.add(this.doorPiv);
    // buiten voor de deur: een stukje gras en donkere bomen
    R.add(mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshStandardMaterial({ map: tex.grass(14, 10), color: 0x6a8a86 }), { cast: false, rot: [-Math.PI / 2, 0, 0], pos: [0, -0.01, -26] }));
    for (const [x, z] of [[-6, -12], [5, -14], [-12, -18], [11, -19], [0, -22]]) { const t = P.pine(rand(7, 10)); t.position.set(x, 0, z); R.add(t); }
    // raam (maanlicht) links, kruisjes
    R.add(mesh(new THREE.PlaneGeometry(2.4, 2.2), new THREE.MeshBasicMaterial({ map: gradTex([[0, '#2a4a9a'], [1, '#7aa0e8']]) }), { cast: false, pos: [-5.98, 2.8, -1.5], rot: [0, Math.PI / 2, 0] }));
    bx(0.1, 2.4, 0.1, -5.9, 2.8, -1.5, fr); bx(0.1, 0.1, 2.4, -5.9, 2.8, -1.5, fr);
    R.add(mesh(new THREE.CircleGeometry(0.4, 14), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), { cast: false, pos: [-5.9, 3.2, -0.8], rot: [0, Math.PI / 2, 0] }));
    // poster 'SPEELHAL' (al lang gesloten...) rechts
    R.add(mesh(new THREE.PlaneGeometry(2.0, 2.4), new THREE.MeshStandardMaterial({ map: tex.sign('SPEELHAL\nGESLOTEN\nsinds heel lang', { w: 256, h: 300, size: 40, bg: '#3a2a5a', fg: '#ffd6f6' }), roughness: 0.9 }), { cast: false, pos: [5.97, 2.9, -1.5], rot: [0, -Math.PI / 2, 0] }));
    // kleed + kaartjes
    R.add(mesh(new THREE.CircleGeometry(2.7, 28), mat(0x8a3a4a), { cast: false, pos: [0, 0.02, 0.8], rot: [-Math.PI / 2, 0, 0] }));
    R.add(mesh(new THREE.RingGeometry(2.1, 2.4, 28), mat(0xe8c24a), { cast: false, pos: [0, 0.03, 0.8], rot: [-Math.PI / 2, 0, 0] }));
    const cc = [0xff6fa5, 0x5ad8ff, 0xffe14a, 0x7bff7b, 0xb05aff, 0xff8a1c]; for (let i = 0; i < 8; i++) R.add(mesh(new THREE.BoxGeometry(0.3, 0.02, 0.42), mat(cc[i % 6]), { cast: false, pos: [(i % 4 - 1.5) * 0.45, 0.05, 0.8 + (i < 4 ? -0.3 : 0.35)], rot: [0, rand(-0.4, 0.4), 0] }));
    // tafeltje met lamp (warm licht), stapelbed, kist, ton
    bx(1.6, 0.12, 1.0, 3.6, 1.0, -1.2, mat(0x6b4a2e)); for (const [dx, dz] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) bx(0.12, 1.0, 0.12, 3.6 + dx, 0.5, -1.2 + dz, mat(0x4a3220));
    R.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.15, 8), mat(0x333338), { cast: false, pos: [3.6, 1.12, -1.2] })); R.add(mesh(new THREE.ConeGeometry(0.34, 0.4, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd27a, side: THREE.DoubleSide }), { cast: false, pos: [3.6, 1.45, -1.2] }));
    this.lamp = new THREE.PointLight(0xffc880, 55, 18, 1.5); this.lamp.position.set(3.6, 1.9, -0.6); R.add(this.lamp);
    this.rim = new THREE.PointLight(0x8fa8ff, 40, 16, 1.6); this.rim.position.set(0, 3.4, -3.8); R.add(this.rim);
    bx(2.2, 0.35, 4.2, -4.8, 0.9, -2.6, mat(0x6b4a2e)); bx(2.0, 0.25, 4.0, -4.8, 1.2, -2.6, mat(0x3a78e0)); bx(2.2, 0.35, 4.2, -4.8, 2.5, -2.6, mat(0x6b4a2e)); bx(2.0, 0.25, 4.0, -4.8, 2.8, -2.6, mat(0x2f9e5b)); for (const [dx, dz] of [[-1, -2], [1, -2], [-1, 2], [1, 2]]) bx(0.15, 3.0, 0.15, -4.8 + dx, 1.5, -2.6 + dz, mat(0x4a3220));
    const ch = P.chest(false); ch.position.set(4.8, 0, 2.2); ch.rotation.y = -0.4; R.add(ch); const ba = P.barrel(1.1); ba.position.set(5.2, 0, 0.2); R.add(ba);
  }
  setScene(w) {
    const room = w === 'room'; this.roomG.visible = room; this.outG.visible = !room;
    this.sun.intensity = room ? 0.25 : 1.5; this.hemi.intensity = room ? 0.7 : 1.4;
    this.scene.fog.near = room ? 30 : 40; this.where = w;
  }
  enter() {
    ui.hudEl.innerHTML = ''; ui.clearScreens(); ui.activeMenus = []; ui.hudEl.append(this.skipEl);
    this.deur.group.rotation.y = 0; if (S.settings.quickStart) { this.skipped = true; this.dead = true; this.finish(); return; }
    this.run();
  }
  exit() { this.dead = true; ui.clearScreens(); ui.hudEl.innerHTML = ''; ui.setVignette(0); if (this.invite) this.invite.remove(); try { this.fx.dispose(); } catch (e) { /* al weg */ } }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); }

  // ---- hulpjes: alles wat wacht stopt (SKIP) zodra het filmpje is overgeslagen ----
  async say(lines, o) { await ui.say(lines, o); if (this.dead) throw SKIP; }
  wait(ms) { return new Promise((res, rej) => { const t0 = performance.now(); const iv = setInterval(() => { if (this.dead || performance.now() - t0 >= ms) { clearInterval(iv); this.dead ? rej(SKIP) : res(); } }, 40); }); }
  async fade(to, ms) { await ui.fade(to, ms); if (this.dead) throw SKIP; }
  cam(from, to, look0, look1, dur) { this.shot = { from, to, look0, look1, dur, t: 0 }; }
  skip() { if (this.dead) return; this.skipped = true; this.dead = true; ui.say([]); }
  async finish() {
    if (this.finishing) return; this.finishing = true;
    S.flags.opening_seen = true; persist();
    ui.say([]); if (this.invite) { this.invite.remove(); this.invite = null; }
    await ui.fade(1, 450); this.app.goArcade({ intro: true });
  }
  async run() {
    try { await this.sceneA(); await this.sceneB(); await this.sceneC(); await this.sceneD(); this.dead = true; this.skipped = true; }
    catch (e) { if (e !== SKIP) { console.error('opening', e); this.skipped = true; } }
    if (this.skipped) this.finish();
  }

  // a: nacht, het huisje, Wes en Jor spelen memory, er wordt geklopt
  async sceneA() {
    this.stage = 'a';
    audio.music('menu');
    const [w, j] = this.bros; w.group.position.set(-1.35, 0, 0.8); j.group.position.set(1.35, 0, 0.8); w.yaw = w.targetYaw = Math.PI / 2; j.yaw = j.targetYaw = -Math.PI / 2; w.pose = j.pose = 'sit';
    this.cam([0.5, 2.9, 7.2], [-0.3, 2.3, 5.2], [0, 0.9, 0], [0, 0.9, 0], 9);
    await this.fade(0, 900);
    await this.say([{ text: 'Een gewone avond in Heitjesveen. Buiten is het donker. Binnen is het gezellig.' }, { who: 'Jor', text: 'Ik heb gewonnen!' }, { who: 'Wes', text: 'Dit is Memory. Jij hebt gewoon alle kaartjes omgedraaid.' }, { who: 'Jor', text: 'Dat noem ik een strategie.' }]);
    await this.wait(500);
    audio.sfx('knock'); this.shake = 0.25; w.pose = j.pose = 'scared';
    await this.wait(1300);
    await this.say([{ text: 'KLOP. KLOP. KLOP.' }, { who: 'Jor', text: '...Wes. Dat was de deur.' }, { who: 'Wes', text: 'Tocht.' }, { who: 'Jor', text: 'Tocht klopt niet.' }, { who: 'Wes', text: 'Deze wel.' }]);
  }
  // b: de Deurman staat in de deur met een envelop en een bloemetje
  async sceneB() {
    this.stage = 'b';
    const [w, j] = this.bros;
    w.group.position.set(-1.5, 0, 0.2); j.group.position.set(1.5, 0, 0.2); w.yaw = w.targetYaw = Math.PI - 0.25; j.yaw = j.targetYaw = Math.PI + 0.25; w.pose = j.pose = 'scared';
    this.cam([0, 2.0, 5.0], [0, 1.9, 2.8], [0, 1.9, -5], [0, 1.9, -5], 12);
    audio.sfx('knock', { vol: 0.9 }); this.shake = 0.3; await this.wait(900);
    audio.sfx('creak'); this.doorTarget = 1; await this.wait(1700);
    this.deur.group.position.set(0, 0, -5.55); this.deur.yaw = this.deur.targetYaw = 0; this.deurShown = true; this.deurMode = 'hold'; audio.sfx('sparkle');
    await this.wait(1100);
    await this.say([{ who: 'Deurman', text: '...Bezorging.' }, { who: 'Deurman', text: 'Voor Wes en Jor. Ik wil een handtekening terug.' }, { who: 'Wes', text: 'Een handtekening? Waarvoor precies?' }, { who: 'Deurman', text: '...Ontvangstbewijs. Ik heb een stempelkaart. Nog twee bezorgingen en ik krijg een gratis deur.' }]);
    w.pose = j.pose = 'idle'; this.env.visible = false; this.deurMode = 'wave'; audio.sfx('pop');
    this.invite = h('div', { style: { position: 'absolute', left: '50%', top: '7vh', transform: 'translateX(-50%) rotate(-2deg)', width: 'min(560px,88vw)', padding: '18px 26px', background: 'linear-gradient(135deg,#fff8dc,#f3e2a8)', border: '6px double #b8860b', borderRadius: '10px', color: '#3a1f5a', textAlign: 'center', boxShadow: '0 8px 0 rgba(0,0,0,.45)', zIndex: 30, fontFamily: 'Fredoka, sans-serif' } },
      h('div', { style: { fontFamily: 'MedievalSharp, serif', fontSize: '30px', color: '#7a2fd4' } }, 'UITNODIGING'), h('div', { style: { fontSize: '24px', fontWeight: 700, margin: '8px 0' } }, 'Koning Klopper nodigt jullie uit voor de GROTE HEROPENING van de Speelhal!'), h('div', { style: { fontSize: '17px' } }, 'Er zijn duels. Er is taart. Er is geen bedtijd.'), h('div', { style: { fontSize: '14px', marginTop: '8px', opacity: 0.7 } }, 'P.S. Graag handtekening terug. De Deurman wacht.'));
    ui.screens.append(this.invite);
    await this.say([{ who: 'Jor', text: 'Koning Klopper nodigt ons uit voor de GROTE HEROPENING van de Speelhal!' }, { who: 'Wes', text: 'De Speelhal? Die is toch al jaren dicht?' }, { who: 'Jor', text: 'Er staat: "Nieuwe duels. Nieuwe hallen. Taart."' }, { who: 'Wes', text: 'Taart?!' }, { who: 'Jor', text: 'WE GAAN!' }]);
    w.pose = 'cheer'; j.pose = 'cheer'; audio.sfx('win'); this.deurMode = 'dance';
    await this.say([{ who: 'Wes', text: '(krabbelt een handtekening) ...Alsjeblieft, Deurman.' }, { who: 'Deurman', text: '...Dank u. Ik loop mee. Ik moet toch die kant op.' }, { who: 'Jor', text: 'Hoe weet je welke kant wij op gaan?' }, { who: 'Deurman', text: '...Ik ben altijd al die kant op.' }]);
    if (this.invite) { this.invite.remove(); this.invite = null; }
  }
  // c: de reis over het pad naar de berg; de poort gaat aan met een flikker, de deuren zwaaien open
  async sceneC() {
    this.stage = 'c';
    await this.fade(1, 500);
    this.setScene('out'); this.deurShown = true; this.deurMode = 'walk'; this.hat.visible = true;
    const [w, j] = this.bros; this.walkZ = 40; this.walk = 0.9;
    this.placeTrio(); w.pose = j.pose = 'idle';
    this.cam([3.2, 2.4, 45], [-3.2, 3.0, 27], [0, 1.6, 36], [0, 2.2, 14], 6.2); audio.music('concert');
    ui.hud.toast('Over het pad, langs de lantaarns, de berg op...', 3200);
    await this.fade(0, 600); await this.wait(5000);
    // aankomst: de poort is nog uit
    this.walk = 0; this.walkZ = this.gate.z + 14; this.placeTrio(); this.deur.speed = 0; this.bros.forEach((b) => (b.speed = 0));
    this.cam([0, 6, this.gate.z + 34], [0, 6.6, this.gate.z + 30], [0, 1.5, this.gate.z], [0, 2.5, this.gate.z], 9);
    await this.say([{ who: 'Jor', text: 'Is dat het? Het bord doet helemaal niks.' }, { who: 'Wes', text: 'Misschien moet er een heitje in.' }, { who: 'Deurman', text: '...Ik heb een knop.' }]);
    this.deurMode = 'reach'; await this.wait(900);
    audio.sfx('click'); this.gate.flicker(); this.shake = 0.08;
    await this.wait(2300);
    this.gate.openDoors(true); audio.sfx('creak', { rate: 0.6 }); await this.wait(900);
    audio.sfx('win'); this.confettiT = 5; this.cam([0, 5, this.gate.z + 26], [0, 6.5, this.gate.z + 21], [0, 3.5, this.gate.z + 4], [0, 4.5, this.gate.z + 2], 8);
    for (let i = 0; i < 5; i++) setTimeout(() => { if (!this.dead) { audio.sfx('pop', { rate: 0.8 + Math.random() * 0.5 }); this.fx.burst(rand(-7, 7), rand(5, 12), this.gate.z + rand(3, 9), { count: 36, colors: [0xff5ad8, 0xffe14a, 0x5ad8ff, 0x7bff7b], speed: 8, size: 0.5, life: 1.5, gravity: 3 }); } }, i * 380);
    // de broers draaien zich om en juichen
    this.walkZ = this.gate.z + 11; this.placeTrio(); this.bros.forEach((b) => { b.yaw = b.targetYaw = 0; b.pose = 'cheer'; }); this.deur.yaw = this.deur.targetYaw = 0; this.deurMode = 'wave';
    await this.wait(1500);
    await this.say([{ who: 'Koning Klopper', text: 'WELKOM, WELKOM! Kom binnen, kom binnen! De taart wordt koud!' }]);
  }
  // d: naar de hoofdhal
  async sceneD() { this.stage = 'd'; await this.fade(1, 700); }
  placeTrio() {
    const z = this.walkZ, [w, j] = this.bros;
    w.group.position.set(-1.3, 0, z); j.group.position.set(1.3, 0, z + 0.3); this.deur.group.position.set(0, 0, z + 2.2);
    for (const c of [w, j, this.deur]) c.yaw = c.targetYaw = Math.PI;
  }

  update(dt) {
    this.t += dt; const t = this.t;
    // overslaan: 1 s ingedrukt houden (A of B), dubbel-tik op B, of Esc
    let hl = false; for (const p of input.p) { if (p.a || p.b) hl = true; if (p.bP) { if (t - this.lastB < 0.45) this.skip(); this.lastB = t; } }
    if (!hl) this.holdT0 = 0; else if (!this.holdT0) this.holdT0 = performance.now(); this.hold = this.holdT0 ? (performance.now() - this.holdT0) / 1000 : 0;   // echte tijd: ook bij lage fps 1 s
    this.skipBar.style.width = Math.min(100, this.hold * 100) + '%'; if (this.hold >= 1) this.skip(); if (input.pressed('Escape')) this.skip();
    // camera
    if (this.shot) {
      const s = this.shot; s.t += dt; const k = smoothstep(0, 1, Math.min(1, s.t / s.dur));
      const p = s.from.map((v, i) => lerp(v, s.to[i], k)), l = s.look0.map((v, i) => lerp(v, s.look1[i], k));
      this.camera.position.set(p[0], p[1], p[2]); if (this.shake > 0.005) { this.camera.position.x += (Math.random() - 0.5) * this.shake; this.camera.position.y += (Math.random() - 0.5) * this.shake; this.shake *= 0.9; }
      this.camera.lookAt(l[0], l[1], l[2]);
    }
    // deur van het huisje + poort
    this.doorOpen = damp(this.doorOpen, this.doorTarget, 3, dt); this.doorPiv.rotation.y = 1.7 * this.doorOpen;
    this.gate.update(dt, t);
    // lopen over het pad
    if (this.walk > 0) { this.walkZ -= this.walk * 6.5 * dt; this.placeTrio(); this.bros.forEach((b) => (b.speed = 1)); this.deur.speed = 1; }
    this.bros.forEach((b) => b.update(dt));
    // de Deurman: gebaren
    const d = this.deur; d.update(dt); d.group.visible = this.deurShown; if (this.deurMode !== 'dance') d.torso.rotation.z = 0;
    const m = this.deurMode, ar = d.arms;
    if (m === 'hold') { ar[0].rotation.x = -1.2 + Math.sin(t * 2) * 0.03; ar[1].rotation.x = -1.1; ar[0].rotation.z = 0.15; ar[1].rotation.z = -0.15; d.group.position.y = 0; d.torso.rotation.x = 0.2; }
    else if (m === 'wave') { ar[1].rotation.z = -2.7 + Math.sin(t * 9) * 0.35; ar[1].rotation.x = 0; ar[0].rotation.x = -0.4; this.flw.visible = false; }
    else if (m === 'dance') { const b = Math.sin(t * 8); d.torso.rotation.z = b * 0.12; ar[0].rotation.z = 1.2 + b * 0.5; ar[1].rotation.z = -1.2 - Math.sin(t * 8 + 1) * 0.5; ar[0].rotation.x = ar[1].rotation.x = 0; d.group.position.y = Math.abs(b) * 0.2; }
    else if (m === 'reach') { ar[1].rotation.z = damp(ar[1].rotation.z, -3.0, 5, dt); ar[1].rotation.x = 0; ar[0].rotation.x = 0; this.flw.visible = false; }
    if (m === 'walk') this.flw.visible = true;
    // confetti
    if (this.confettiT > 0) { this.confettiT -= dt; for (let i = 0; i < 3; i++) this.fx.emit(rand(-12, 12), rand(12, 18), this.gate.z + rand(2, 16), rand(-1, 1), rand(-2, -4), rand(-1, 1), { life: 4, size: 0.4, color: [0xff3d81, 0xffe14a, 0x3dc8ff, 0x7bff7b, 0xb05aff][Math.floor(Math.random() * 5)], gravity: 0.5, shrink: false }); }
    this.fx.update(dt);
  }
  render(renderer) { renderer.render(this.scene, this.camera); }
}
