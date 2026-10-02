import * as THREE from 'three';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui, Menu } from '../engine/ui.js';
import { S, persist } from '../save.js';
import { Particles } from '../engine/particles.js';
import { Character, makeBrother, makeDeurman, makeNPC } from '../engine/chars.js';
import { setupLights } from '../engine/lights.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { h, mesh, mat, glow, rand, TAU, canvasTex, smoothstep, lerp, damp } from '../engine/util.js';
import * as STORY from './story.js';
import { DOORKNOBS } from './layout.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Het concert van DutchTuber! Eindscène van het spel.
export class EndingMode {
  static async create(app, opts) { return new EndingMode(app, opts); }
  constructor(app, opts) {
    this.app = app; this.t = 0; this.shot = null; this.shake = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
    this.fx = new Particles(3500); this.scene.add(this.fx.points); this.fx.setViewportHeight(innerHeight);
    const L = setupLights(this.scene, 'night', { shadow: 30, center: [0, 0, 0], fogNear: 40, fogFar: 160 }); L.sun.intensity = 0.9; L.hemi.intensity = 1.1;
    const gl = new THREE.PointLight(0xffd9a0, 90, 40, 1.6); gl.position.set(0, 7, 38); this.scene.add(gl); const gl2 = new THREE.PointLight(0xff7ad5, 40, 30, 1.6); gl2.position.set(0, 5, 31); this.scene.add(gl2);
    this.beams = [];
    this.knobs = DOORKNOBS.filter((k) => S.collected[k.id]).length; this.allKnobs = this.knobs >= DOORKNOBS.length; this.vip = S.vip || this.allKnobs;
    this.build();
    this.camera.position.set(0, 3, 40); this.camera.lookAt(0, 3, 30);
  }
  build() {
    const sc = this.scene;
    // sterren
    const sg = new THREE.BufferGeometry(); const sp = []; for (let i = 0; i < 700; i++) { const a = rand(0, TAU), e = rand(0.15, 1.4); sp.push(Math.cos(a) * Math.cos(e) * 300, Math.sin(e) * 300, Math.sin(a) * Math.cos(e) * 300); }
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
    const moon = new THREE.Mesh(new THREE.SphereGeometry(8, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false })); moon.position.set(-90, 100, -150); sc.add(moon);
    // plein
    sc.add(mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: tex.cobble(30, 30), roughness: 1 }), { cast: false, rot: [-Math.PI / 2, 0, 0] }));
    // poortgebied
    const gate = new THREE.Group(); const sm = new THREE.MeshStandardMaterial({ map: tex.stone(3, 2), roughness: 0.95 });
    for (const sx of [-1, 1]) { gate.add(mesh(new THREE.BoxGeometry(6, 14, 4), sm, { pos: [sx * 7, 7, 0] })); const t = P.tower(18, 2.6); t.position.set(sx * 12, 0, 0); gate.add(t); }
    gate.add(mesh(new THREE.BoxGeometry(20, 4, 4), sm, { pos: [0, 12, 0] }));
    this.doorL = mesh(new THREE.BoxGeometry(4.2, 9, 0.5), mat(0x4a3220), { pos: [-2.1, 4.5, 0] }); this.doorR = mesh(new THREE.BoxGeometry(4.2, 9, 0.5), mat(0x4a3220), { pos: [2.1, 4.5, 0] });
    this.pivotL = new THREE.Group(); this.pivotL.position.set(-4.2, 0, 0); this.doorL.position.set(2.1, 4.5, 0); this.pivotL.add(this.doorL); this.pivotR = new THREE.Group(); this.pivotR.position.set(4.2, 0, 0); this.doorR.position.set(-2.1, 4.5, 0); this.pivotR.add(this.doorR);
    gate.add(this.pivotL, this.pivotR); gate.add(mesh(new THREE.PlaneGeometry(14, 2), new THREE.MeshStandardMaterial({ map: tex.sign('DutchTuber LIVE', { w: 1024, h: 150, size: 100, bg: '#5a1fd1', fg: '#ffe14a' }) }), { cast: false, pos: [0, 12, 2.05] }));
    for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const l = mesh(new THREE.SphereGeometry(0.4, 8, 6), glow([0xff5a5a, 0xffd23f, 0x5ab4ff, 0x7be07b][i], 1.5), { cast: false, pos: [sx * 4.5, 1.5 + i * 2.2, 2.3] }); gate.add(l); }
    gate.position.set(0, 0, 28); sc.add(gate);
    // knoppen aan de poort? (de Deurman)
    this.deur = makeDeurman(1.0); this.deur.group.position.set(0, 0, 31.5); this.deur.group.rotation.y = Math.PI; this.deur.targetYaw = this.deur.yaw = Math.PI; sc.add(this.deur.group);
    if (this.knobs > 0) { for (let i = 0; i < this.knobs; i++) { const k = mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffa500, emissiveIntensity: 1, metalness: 0.9 }), { cast: false, pos: [-0.5 + i * 0.14, 1.55, 0.3] }); this.deur.torso.add(k); } }
    this.bros = [0, 1].map((i) => { const c = makeBrother(i); c.group.position.set(i ? 1.3 : -1.3, 0, 38); c.yaw = c.targetYaw = Math.PI; sc.add(c.group); return c; });
    // podium
    const st = new THREE.Group();
    st.add(mesh(new THREE.BoxGeometry(34, 2.2, 14), new THREE.MeshStandardMaterial({ map: tex.planks(8, 2, '#3a2a52'), roughness: 0.6 }), { pos: [0, 1.1, 0] }));
    const trussM = mat(0x2a2a34, { metalness: 0.7, roughness: 0.4 });
    for (const sx of [-16, 16]) st.add(mesh(new THREE.BoxGeometry(0.8, 17, 0.8), trussM, { pos: [sx, 10, -5] }));
    st.add(mesh(new THREE.BoxGeometry(33, 0.9, 1), trussM, { pos: [0, 18.5, -5] }));
    // LED-scherm
    this.ledCanvas = document.createElement('canvas'); this.ledCanvas.width = 512; this.ledCanvas.height = 256; this.ledTex = new THREE.CanvasTexture(this.ledCanvas); this.ledTex.colorSpace = THREE.SRGBColorSpace;
    st.add(mesh(new THREE.PlaneGeometry(26, 11), new THREE.MeshBasicMaterial({ map: this.ledTex, fog: false }), { cast: false, pos: [0, 9.5, -6.6] }));
    for (let i = 0; i < 6; i++) { const col = [0xff3d81, 0x3dc8ff, 0xffe14a, 0x7bff7b, 0xb05aff, 0xff8a1c][i]; const lamp = mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.2, 8), glow(col, 1.5), { cast: false, pos: [-12.5 + i * 5, 18, -4.2] }); st.add(lamp); const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 4.2, 26, 14, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.geometry.translate(0, -13, 0); cone.position.set(-12.5 + i * 5, 17.6, -4.2); st.add(cone); this.beams.push({ cone, ph: i * 1.1 }); }
    st.add(mesh(new THREE.BoxGeometry(7, 1.4, 2.5), mat(0x1a1a22), { pos: [0, 2.9, -3.8] })); st.add(mesh(new THREE.BoxGeometry(5, 0.4, 0.4), glow(0xff3d81, 1.2), { cast: false, pos: [0, 3.7, -2.5] }));
    for (const sx of [-1, 1]) { st.add(mesh(new THREE.BoxGeometry(3, 6, 2), mat(0x1a1a22), { pos: [sx * 11, 5.2, -2] })); st.add(mesh(new THREE.CircleGeometry(1.0, 12), mat(0x333340), { cast: false, pos: [sx * 11, 6.5, -0.97] })); st.add(mesh(new THREE.CircleGeometry(0.8, 12), mat(0x333340), { cast: false, pos: [sx * 11, 3.9, -0.97] })); }
    st.position.set(0, 0, -12); sc.add(st); this.stage = st;
    // DutchTuber
    this.star = new Character({ scale: 1.15, skin: 0xf2c29b, hair: 0xffd23f, hairStyle: 'spiky', shirt: 0x7a2fd4, sleeve: 0x7a2fd4, tunic: 0x7a2fd4, pants: 0x222233, boots: 0xff3d81, glasses: 0x111111, scarf: 0xff3d81, belt: 0xffd23f });
    this.star.group.position.set(0, 2.2, -14); this.star.yaw = this.star.targetYaw = 0; sc.add(this.star.group);
    const mic = new THREE.Group(); mic.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 6), mat(0x222222), { pos: [0, 0, 0] })); mic.add(mesh(new THREE.SphereGeometry(0.1, 8, 6), mat(0xaaaaaa, { metalness: 0.8 }), { pos: [0, 0.2, 0] })); this.star.hold(mic, 'r'); this.star.pose = 'dance';
    // band
    this.band = [[-8, 'bard'], [8, 'jester']].map(([x, k]) => { const c = makeNPC(k); c.group.position.set(x, 2.2, -16); c.yaw = c.targetYaw = 0; c.pose = 'dance'; sc.add(c.group); return c; });
    // publiek (instanced)
    const N = 170; const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.35, 0.8, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N); const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
    this.crowd = []; const col = new THREE.Color();
    for (let i = 0; i < N; i++) { const x = rand(-22, 22), z = rand(-3, 20); if (Math.abs(x) < 3.5 && z > 20 - 6) { i--; continue; } this.crowd.push({ x, z: z - 12 + 10, ph: rand(0, 6), a: rand(0.6, 1.4) }); col.setHSL(Math.random(), 0.65, 0.5); body.setColorAt(i, col); col.setHSL(0.07 + Math.random() * 0.06, 0.55, 0.65); head.setColorAt(i, col); }
    body.castShadow = true; sc.add(body, head); this.body = body; this.head = head; this.D = new THREE.Object3D();
    // zaklampen/lichtstokken in publiek
    this.sticks = new Particles(600, { additive: true }); sc.add(this.sticks.points); this.sticks.setViewportHeight(innerHeight);
    this.confetti = [];
    // vuurwerkachtergrond: kasteel
    const k = P.tower(30, 5); k.position.set(-46, 0, -60); sc.add(k); const k2 = P.tower(24, 4.4); k2.position.set(50, 0, -64); sc.add(k2);
    for (const [x, z] of [[-26, 6], [26, 8], [-30, 24], [30, 22]]) { const l = P.lampPost(0xffc86a); l.position.set(x, 0, z); sc.add(l); }
    for (let i = 0; i < 12; i++) { const t = P.pine(rand(9, 14)); const a = i / 12 * Math.PI + Math.PI * 0.0; t.position.set(Math.cos(a) * 60 + rand(-4, 4), 0, -Math.sin(a) * 40 - 25); sc.add(t); }
  }
  enter() { ui.hudEl.innerHTML = ''; ui.clearScreens(); this.run(); }
  exit() { ui.clearScreens(); ui.setVignette(0); }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); this.sticks.setViewportHeight(hh); }

  // ---- cameraschot: from -> to over duration seconden, kijkt naar look(from->to)
  cam(from, to, look0, look1, dur) { this.shot = { from, to, look0, look1, dur, t: 0 }; }
  async run() {
    audio.music('tense'); await ui.fade(0, 900);
    this.cam([0, 4.5, 50], [0, 5, 44], [0, 4.5, 31], [0, 4.5, 31], 9);
    await wait(1500);
    await ui.say(STORY.GATE_TALK, { creepy: false });
    if (this.allKnobs) {
      await ui.say(STORY.GATE_ALL_KNOBS);
      audio.sfx('star'); this.knobGlow();
    } else await ui.say(STORY.GATE_FEW_KNOBS);
    // poort gaat open
    audio.sfx('creak', { rate: 0.6 }); this.gateOpen = 1; await wait(2400);
    this.cam([0, 4, 38], [0, 3.5, 12], [0, 5, 28], [0, 6, -8], 5);
    await wait(2200); await ui.fade(1, 600);
    // CONCERT
    this.gateOpen = 2; this.deur.group.position.set(-13, 0, 4); this.deur.targetYaw = this.deur.yaw = 0.3;
    this.bros[0].group.position.set(-1.8, 0, 6); this.bros[1].group.position.set(1.8, 0, 6); this.bros.forEach((b) => { b.yaw = b.targetYaw = 0; b.pose = 'cheer'; });
    audio.music('concert');
    this.concert = true; this.cam([0, 6, 18], [0, 4, 12], [0, 6, -4], [0, 6, -4], 6); await ui.fade(0, 700);
    ui.hud.showBig('🎤', 1500);
    await wait(1800);
    await ui.say([{ who: 'DutchTuber', text: 'HEITJESVEEN! ZIJN JULLIE KLAAR?!' }]);
    this.boom(); audio.sfx('win'); this.cheer();
    this.cam([-14, 5, 14], [14, 5, 14], [0, 5, -2], [0, 5, -2], 9); await wait(3500);
    for (let i = 0; i < 8; i++) { setTimeout(() => this.firework(), i * 700); }
    this.cam([0, 14, 22], [0, 8, 6], [0, 7, -8], [0, 5, -10], 8); await wait(5000);
    await ui.say([{ who: 'DutchTuber', text: 'Deze is voor de twee broers vooraan! Ik hoorde dat jullie keihard hebben gewerkt voor een kaartje!' }]);
    this.cam([-3, 3.5, 9], [3, 3.5, 9], [0, 3.5, 6], [0, 3.5, 6], 6); audio.sfx('sparkle'); await wait(3500);
    await ui.say([{ who: 'Jor', text: 'Wes! Hij kijkt naar ons! HIJ ZWAAIT!' }, { who: 'Wes', text: '(zwaait terug) ...Zie je de Deurman ook?' }, { who: 'Jor', text: 'Hij danst. Op de beat.' }]);
    this.deur.dance = true;
    this.cam([-10, 2.5, 8], [-14, 2.5, 7], [-13, 3, 4], [-13, 3, 4], 8); for (let i = 0; i < 5; i++) setTimeout(() => this.firework(), i * 500); await wait(5500);
    this.cam([0, 22, 30], [0, 30, 40], [0, 6, -4], [0, 10, -8], 10); for (let i = 0; i < 14; i++) setTimeout(() => this.firework(), i * 450); this.confettiBurst(); await wait(7500);
    if (this.vip) {
      await ui.fade(1, 700); this.concert = false; this.backstage(); await ui.fade(0, 700);
      await ui.say([{ who: 'DutchTuber', text: 'Jullie zijn dus Wes en Jor! De Deurman vertelde me alles. Hij is mijn grootste fan, wist je dat?' }, { who: 'Deurman', text: '...Handtekening.', creepy: true }, { who: 'DutchTuber', text: 'Natuurlijk, Deurman. Voor jou en de broers. Deze poster is gesigneerd door iedereen.' }, { who: 'Wes', text: 'Dit is de mooiste dag van mijn leven.' }]);
      audio.sfx('win');
    }
    await ui.fade(1, 900); this.concert = false; this.epilogue();
    await ui.fade(0, 900);
    await ui.say(STORY.AFTER_CONCERT);
    this.endCard();
  }
  knobGlow() { for (let i = 0; i < 80; i++) setTimeout(() => this.fx.emit(this.deur.group.position.x + rand(-1, 1), rand(0.5, 3.5), this.deur.group.position.z + rand(-1, 1), rand(-1, 1), rand(1, 3), rand(-1, 1), { life: 1.4, size: 0.35, color: [0xffd23f, 0xffffff, 0xffa500][i % 3], gravity: -0.5 }), i * 18); }
  boom() { for (const x of [-12, 12]) this.fx.burst(x, 8, -14, { count: 80, colors: [0xff3d81, 0xffe14a, 0x3dc8ff], speed: 9, size: 0.45, life: 1.4, gravity: 4 }); this.shake = 0.5; }
  cheer() { audio.sfx('win'); for (let i = 0; i < 6; i++) setTimeout(() => audio.sfx('pop', { rate: 0.7 + Math.random() * 0.6 }), i * 120); }
  firework() {
    const x = rand(-26, 26), y = rand(30, 52), z = rand(-40, -20); const cols = [[0xff3d81, 0xffffff], [0xffe14a, 0xff8a1c], [0x3dc8ff, 0xffffff], [0x7bff7b, 0xffe14a], [0xb05aff, 0xff3d81]][Math.floor(Math.random() * 5)];
    audio.sfx('explode', { vol: 0.35, rate: 1.3 }); this.fx.burst(x, y, z, { count: 90, colors: cols, speed: 14, size: 1.4, life: 1.8, gravity: 5, spread: 1.4, up: 0.6 });
    this.fx.burst(x, y, z, { count: 30, color: 0xffffff, speed: 6, size: 1.0, life: 1.0, gravity: 3 });
  }
  confettiBurst() { for (let i = 0; i < 400; i++) setTimeout(() => this.fx.emit(rand(-18, 18), rand(16, 30), rand(-10, 20), rand(-1, 1), rand(-1, -3), rand(-1, 1), { life: 5, size: 0.5, color: [0xff3d81, 0xffe14a, 0x3dc8ff, 0x7bff7b, 0xb05aff][i % 5], gravity: 0.5, shrink: false }), i * 6); }
  backstage() {
    this.stage.visible = true; this.camera.position.set(-4, 4, -2); this.star.group.position.set(-1.2, 2.2, -14); this.star.pose = 'wave';
    this.cam([-5, 4.4, -6], [-3.5, 4.2, -8], [0, 3.8, -14], [0, 3.8, -14], 10);
    this.bros[0].group.position.set(-3, 2.2, -11.2); this.bros[1].group.position.set(-1.6, 2.2, -11); this.bros.forEach((b) => { b.yaw = b.targetYaw = Math.PI; b.group.rotation.y = Math.PI; b.pose = 'cheer'; });
    this.deur.group.position.set(3, 2.2, -12); this.deur.yaw = this.deur.targetYaw = Math.PI;
    this.star.yaw = this.star.targetYaw = 0.9;
  }
  epilogue() {
    this.concert = false; this.beams.forEach((b) => (b.cone.visible = false));
    this.cam([-6, 3.5, 56], [-1, 3.2, 48], [0, 5, 32], [0, 4, 32], 14);
    audio.music('hub_night'); this.gateOpen = 1;
    this.bros[0].group.position.set(-1.5, 0, 40); this.bros[1].group.position.set(1.5, 0, 40); this.bros.forEach((b) => { b.yaw = b.targetYaw = 0; b.pose = 'idle'; });
    this.deur.group.position.set(0, 0, 33); this.deur.yaw = this.deur.targetYaw = Math.PI; this.deur.dance = false;
    this.stage.visible = false;
  }
  endCard() {
    S.flags.ended = true; persist();
    const menu = new Menu([
      { label: 'Verder spelen in het dorp', onSelect: async () => { ui.activeMenus = []; await ui.fade(1, 600); await this.app.goHub({}); ui.fade(0, 600); } },
      { label: 'Naar het titelscherm', onSelect: async () => { ui.activeMenus = []; await ui.fade(1, 600); await this.app.goMenu(); ui.fade(0, 600); } },
    ]);
    const done = Object.keys(S.jobs).length; const stars = Object.values(S.jobs).reduce((a, j) => a + j.bestStars, 0);
    const card = h('div', { class: 'card' }, h('h1', { style: { fontSize: '54px' } }, 'EINDE'), h('p', { style: { textAlign: 'center' }, html: `Wes en Jor zagen <b>DutchTuber LIVE</b>${this.vip ? ' — en ontmoetten hem backstage' : ''}!<br>🪙 ${S.totalEarned} heitjes verdiend · 🔨 ${done}/14 klussen · ⭐ ${stars}/42 sterren<br>✨ ${this.knobs}/8 gouden deurknoppen${this.allKnobs ? ' — De Deurman is dolblij!' : ''}<br>👁️ Deurman gezien: ${S.sightings}× · verjaagd: ${S.banished || 0}×` }), menu.el, h('div', { class: 'small-note' }, 'Bedankt voor het spelen!'));
    ui.overlay(card); ui.activeMenus.push(menu);
  }

  update(dt) {
    this.t += dt; const t = this.t;
    // camera
    if (this.shot) {
      const s = this.shot; s.t += dt; const k = smoothstep(0, 1, Math.min(1, s.t / s.dur));
      const p = s.from.map((v, i) => lerp(v, s.to[i], k)), l = s.look0.map((v, i) => lerp(v, s.look1[i], k));
      this.camera.position.set(p[0], p[1], p[2]); if (this.shake > 0.01) { this.camera.position.x += (Math.random() - .5) * this.shake; this.camera.position.y += (Math.random() - .5) * this.shake; this.shake *= 0.9; } this.camera.lookAt(l[0], l[1], l[2]);
    }
    // poort
    if (this.gateOpen === 1) { this.pivotL.rotation.y = damp(this.pivotL.rotation.y, 1.5, 2, dt); this.pivotR.rotation.y = damp(this.pivotR.rotation.y, -1.5, 2, dt); }
    this.deur.update(dt); if (this.deur.dance) { this.deur.group.rotation.y += Math.sin(t * 8) * 0.03; this.deur.torso.rotation.z = Math.sin(t * 8) * 0.12; this.deur.arms[0].rotation.z = 1.2 + Math.sin(t * 8) * 0.5; this.deur.arms[1].rotation.z = -1.2 - Math.sin(t * 8 + 1) * 0.5; this.deur.group.position.y = Math.abs(Math.sin(t * 8)) * 0.3; }
    this.bros.forEach((b) => b.update(dt)); this.star.update(dt); this.band.forEach((b) => b.update(dt));
    if (this.concert) {
      // LED-scherm
      this.ledT = (this.ledT || 0) - dt;
      if (this.ledT <= 0) {
        this.ledT = 0.06; const g = this.ledCanvas.getContext('2d'); const w = 512, hh = 256;
        const gr = g.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, `hsl(${(t * 60) % 360},90%,50%)`); gr.addColorStop(1, `hsl(${(t * 60 + 120) % 360},90%,45%)`); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
        g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 9; i++) { const a = t * 1.5 + i * 0.7; g.beginPath(); g.moveTo(w / 2, hh / 2); g.arc(w / 2, hh / 2, 400, a, a + 0.25); g.fill(); }
        g.fillStyle = '#fff'; g.font = 'bold 74px Fredoka, Arial Black'; g.textAlign = 'center'; g.strokeStyle = '#2a0a50'; g.lineWidth = 12; g.strokeText('DutchTuber', w / 2, 125); g.fillText('DutchTuber', w / 2, 125);
        g.font = 'bold 46px Fredoka, Arial'; g.fillStyle = '#ffe14a'; g.strokeText('LIVE in Heitjesveen', w / 2, 190); g.fillText('LIVE in Heitjesveen', w / 2, 190); this.ledTex.needsUpdate = true;
      }
      this.beams.forEach((b, i) => { b.cone.visible = true; b.cone.rotation.z = Math.sin(t * 1.4 + b.ph) * 0.6; b.cone.rotation.x = Math.cos(t * 1.1 + b.ph) * 0.4; });
      this.crowd.forEach((c, i) => { const y = 0.9 + Math.abs(Math.sin(t * 6 * c.a + c.ph)) * 0.6; this.D.position.set(c.x, y, c.z); this.D.rotation.set(0, 0, 0); this.D.scale.set(1, 1, 1); this.D.updateMatrix(); this.body.setMatrixAt(i, this.D.matrix); this.D.position.set(c.x, y + 0.9, c.z); this.D.updateMatrix(); this.head.setMatrixAt(i, this.D.matrix); });
      this.body.instanceMatrix.needsUpdate = true; this.head.instanceMatrix.needsUpdate = true;
      if (Math.random() < 0.5) this.sticks.emit(rand(-22, 22), rand(2, 4), rand(-6, 16), 0, 0.2, 0, { life: 0.5, size: 0.35, color: [0xff3d81, 0x3dc8ff, 0xffe14a, 0x7bff7b][Math.floor(Math.random() * 4)], gravity: 0 });
      this.star.group.position.x = Math.sin(t * 0.9) * 5; this.star.yaw = this.star.targetYaw = 0 + Math.sin(t * 0.9) * 0.2;
    }
    this.fx.update(dt); this.sticks.update(dt);
  }
  render(renderer) { renderer.render(this.scene, this.camera); }
}
