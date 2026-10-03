import * as THREE from 'three';
import { input } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui, Menu } from '../engine/ui.js';
import { S, persist } from '../save.js';
import { Particles } from '../engine/particles.js';
import { makeBrother, makeDeurman, makeNPC } from '../engine/chars.js';
import { setupLights } from '../engine/lights.js';
import { tex } from '../engine/textures.js';
import * as P from '../engine/props.js';
import { h, mesh, mat, glow, rand, TAU, canvasTex, smoothstep, lerp } from '../engine/util.js';
import { ARCADE_HALLS } from '../games/index.js';
import { isUnlocked, rank, stickers } from '../engine/progress.js';
import { partyHat } from './opening.js';
import { nPlayers, activeIds, activeInputs, pname, standTxt, Menu3 } from './players3.js';

const SKIP = Symbol('skip');

// ============================================================================
// Het Grote Slotfeest: feest in de hoofdhal met Koning Klopper, DJ Dobber, Kermis-Kees en alle bezoekers.
// De Deurman danst op de beat en krijgt een handtekening (diploma). Daarna credits met jullie statistieken.
// Start via Koning Klopper (rang Speelhal-Legende): app.goEnding(). Daarna kun je gewoon doorspelen.
// ============================================================================
export class EndingMode {
  static async create(app, opts) { return new EndingMode(app, opts); }
  constructor(app, opts = {}) {
    this.app = app; this.t = 0; this.shot = null; this.shake = 0; this.dead = false; this.skipHold = 0; this.beams = []; this.love = 0; this.fireT = 0;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 400);
    this.fx = new Particles(3500); this.scene.add(this.fx.points); this.fx.setViewportHeight(innerHeight);
    const L = setupLights(this.scene, 'indoor', { shadows: false, center: [0, 0, 0], fogNear: 70, fogFar: 220 }); L.sun.intensity = 0.9; L.hemi.intensity = 1.5;
    this.scene.background = new THREE.Color(0x140a24); this.scene.fog.color.set(0x140a24);
    this.lights = [0xff5ad8, 0x5ad8ff, 0xffe14a].map((c) => { const l = new THREE.PointLight(c, 120, 40, 1.5); l.position.set(0, 9, 0); this.scene.add(l); return l; });
    this.build();
    this.camera.position.set(0, 12, 34); this.camera.lookAt(0, 4, -10);
  }
  build() {
    const sc = this.scene;
    // sterren boven de open hal (vuurwerk!) en de maan
    const sp = []; for (let i = 0; i < 500; i++) { const a = rand(0, TAU), e = rand(0.25, 1.4); sp.push(Math.cos(a) * Math.cos(e) * 300, Math.sin(e) * 300, Math.sin(a) * Math.cos(e) * 300); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sc.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false })));
    sc.add(mesh(new THREE.SphereGeometry(8, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff6d0, fog: false }), { cast: false, pos: [-90, 110, -170] }));
    // hal: vloer, muren, loper
    sc.add(mesh(new THREE.PlaneGeometry(62, 46), new THREE.MeshStandardMaterial({ map: tex.checker(12, 9, '#cbbfdc', '#6a4a8a'), roughness: 0.35, metalness: 0.15 }), { cast: false, rot: [-Math.PI / 2, 0, 0] }));
    const wm = new THREE.MeshStandardMaterial({ map: tex.stone(8, 2), roughness: 0.95, flatShading: true });
    sc.add(mesh(new THREE.BoxGeometry(64, 16, 1.4), wm, { cast: false, pos: [0, 8, -23.7] }), mesh(new THREE.BoxGeometry(1.4, 16, 48), wm, { cast: false, pos: [-31.7, 8, 0] }), mesh(new THREE.BoxGeometry(1.4, 16, 48), wm, { cast: false, pos: [31.7, 8, 0] }));
    for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const b = P.banner([0x7a2fd4, 0xd8372c, 0x2f6fe0][i % 3], 6.5, 1.8); b.position.set(sx * 30.4, 5.5, -14 + i * 9); b.rotation.y = -sx * Math.PI / 2; sc.add(b); (this.banners ||= []).push(b); }
    // podium + achterwand met LED-scherm
    sc.add(mesh(new THREE.BoxGeometry(36, 1.4, 13), new THREE.MeshStandardMaterial({ map: tex.planks(8, 2, '#4a2a72'), roughness: 0.6 }), { pos: [0, 0.7, -16.5] }));
    this.ledCanvas = Object.assign(document.createElement('canvas'), { width: 512, height: 192 }); this.ledTex = new THREE.CanvasTexture(this.ledCanvas); this.ledTex.colorSpace = THREE.SRGBColorSpace;
    sc.add(mesh(new THREE.PlaneGeometry(26, 9.75), new THREE.MeshBasicMaterial({ map: this.ledTex, fog: false }), { cast: false, pos: [0, 8.5, -22.9] }));
    const truss = mat(0x2a2a34, { metalness: 0.7, roughness: 0.4 });
    sc.add(mesh(new THREE.BoxGeometry(34, 0.6, 0.6), truss, { cast: false, pos: [0, 14, -12] }));
    for (let i = 0; i < 6; i++) {
      const col = [0xff3d81, 0x3dc8ff, 0xffe14a, 0x7bff7b, 0xb05aff, 0xff8a1c][i]; const x = -12.5 + i * 5;
      sc.add(mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.0, 8), glow(col, 1.5), { cast: false, pos: [x, 13.4, -12] }));
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 4, 24, 14, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.geometry.translate(0, -12, 0); cone.position.set(x, 13.2, -12); sc.add(cone); this.beams.push({ cone, ph: i * 1.1 });
    }
    // troon
    const gold = mat(0xe8b82a, { metalness: 0.6, roughness: 0.4 });
    sc.add(mesh(new THREE.BoxGeometry(2.8, 0.6, 2.2), gold, { pos: [0, 1.7, -19.4] }), mesh(new THREE.BoxGeometry(2.8, 4.4, 0.5), gold, { pos: [0, 3.9, -20.4] }));
    this.king = makeNPC('captain', { hat: 'crown', hatColor: 0xffd23f, beard: 'full', hair: 0xf0f0f0, beardColor: 0xf0f0f0, cape: 0x7a2fd4, shirt: 0xd8357f, sleeve: 0xd8357f, scale: 1.25, bodyW: 1.5 });
    this.king.group.position.set(0, 1.4, -16.8); this.king.yaw = this.king.targetYaw = 0; this.king.pose = 'wave'; sc.add(this.king.group);
    // DJ Dobber met draaitafel, Kermis-Kees met ballonnen
    sc.add(mesh(new THREE.BoxGeometry(7, 1.8, 2.6), mat(0x10162c), { pos: [-10, 2.3, -18.4] }), mesh(new THREE.BoxGeometry(7.2, 0.15, 2.8), glow(0x00e5ff, 1.2), { cast: false, pos: [-10, 3.25, -18.4] }));
    for (const sx of [-1, 1]) sc.add(mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.18, 18), mat(0x222222), { pos: [-10 + sx * 2, 3.4, -18.2] }));
    this.dj = makeNPC('jester', { scale: 1.2 }); this.dj.group.position.set(-10, 1.4, -16.4); this.dj.yaw = this.dj.targetYaw = 0; this.dj.pose = 'dance'; sc.add(this.dj.group);
    this.kees = makeNPC('innkeeper', { scale: 1.2 }); this.kees.group.position.set(10, 1.4, -16.4); this.kees.yaw = this.kees.targetYaw = 0; this.kees.pose = 'wave'; sc.add(this.kees.group);
    this.balloons = []; [0xff5a5a, 0xffe14a, 0x5ab4ff, 0x7bff7b, 0xff7ab0, 0xb05aff].forEach((c, i) => { const b = new THREE.Group(); b.add(mesh(new THREE.SphereGeometry(0.55, 10, 8), glow(c, 0.6), { cast: false, pos: [0, 0, 0] }), mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.6, 3), mat(0xdddddd), { cast: false, pos: [0, -1.4, 0] })); b.position.set(12.4 + (i % 3) * 0.9 - 0.9, 4.6 + (i % 2) * 1.0, -16.8 + (i % 2) * 0.8); b.userData.ph = i; sc.add(b); this.balloons.push(b); });
    // feestende dorpelingen en bezoekers
    this.guests = ['bard', 'witch', 'baker', 'farmer', 'dwarf', 'princess', 'kid', 'sumo'].map((k, i) => { const c = makeNPC(k); const a = (i / 8) * Math.PI - Math.PI; c.group.position.set(Math.cos(a) * 12 + (i % 2 ? 1 : -1) * 2, 0, 3 + Math.abs(Math.sin(a)) * 6 - 4 + (i % 3)); c.yaw = c.targetYaw = Math.PI + Math.cos(a) * 0.4; c.pose = 'dance'; sc.add(c.group); return c; });
    const N = 150; const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.35, 0.8, 3, 8), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N); const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
    this.crowd = []; const col = new THREE.Color();
    for (let i = 0; i < N; i++) { const x = rand(-27, 27), z = rand(-8, 19); if (Math.abs(x) < 5 && z > -2 && z < 9) { i--; continue; } this.crowd.push({ x, z, ph: rand(0, 6), a: rand(0.6, 1.4) }); col.setHSL(Math.random(), 0.65, 0.5); body.setColorAt(i, col); col.setHSL(0.07 + Math.random() * 0.06, 0.55, 0.65); head.setColorAt(i, col); }
    sc.add(body, head); this.body = body; this.head = head; this.D = new THREE.Object3D();
    // de broers en de Deurman (met feesthoedje) op de dansvloer
    this.bros = activeIds().map((i) => { const c = makeBrother(i); c.group.position.set(nPlayers() === 3 ? [-3.4, 0, 3.4][i] : i ? 2.4 : -2.4, 0, nPlayers() === 3 && i === 2 ? 1.2 : 2); c.yaw = c.targetYaw = Math.PI; c.pose = 'cheer'; sc.add(c.group); return c; });
    this.deur = makeDeurman(0.92); this.deur.group.position.set(0, 0, 4); this.deur.yaw = this.deur.targetYaw = 0; sc.add(this.deur.group);
    const hat = partyHat(0.92); hat.position.set(0.02, 0.23, 0); hat.rotation.z = 0.18; this.deur.head.add(hat);
    sc.add(mesh(new THREE.RingGeometry(5.2, 5.6, 36), new THREE.MeshBasicMaterial({ color: 0xffe14a, transparent: true, opacity: 0.6, depthWrite: false }), { cast: false, receive: false, pos: [0, 0.06, 3], rot: [-Math.PI / 2, 0, 0] }));
    this.disco = mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.1, flatShading: true, emissive: 0x444466, emissiveIntensity: 0.6 }), { cast: false, pos: [0, 12, 0] }); sc.add(this.disco);
    this.confetti = 0;
  }
  enter() { ui.hudEl.innerHTML = ''; ui.clearScreens(); ui.activeMenus = []; this.run(); }
  exit() { this.dead = true; ui.clearScreens(); ui.hudEl.innerHTML = ''; ui.setVignette(0); try { this.fx.dispose(); } catch (e) { /* al weg */ } }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); }

  // ---- hulpjes: alles wat wacht stopt (SKIP) zodra het feest is overgeslagen ----
  async say(lines) { await ui.say(lines); if (this.dead) throw SKIP; }
  wait(ms) { return new Promise((res, rej) => { const t0 = performance.now(); const iv = setInterval(() => { if (this.dead || performance.now() - t0 >= ms) { clearInterval(iv); this.dead ? rej(SKIP) : res(); } }, 40); }); }
  cam(from, to, look0, look1, dur) { this.shot = { from, to, look0, look1, dur, t: 0 }; }
  async run() {
    try {
      audio.music('concert'); await ui.fade(0, 900);
      // 1. de hoofdhal vol feest
      this.cam([0, 12, 36], [0, 8, 24], [0, 4, -10], [0, 5, -12], 9); this.boom(); this.confetti = 6;
      await this.wait(1500);
      await this.say([{ who: 'Koning Klopper', text: 'WELKOM bij het GROTE SLOTFEEST! Jullie zijn Speelhal-LEGENDES! Iedereen die ooit won, verloor of in het Wiel van Gekte viel is hier. Behalve de kip. Die staat in de grijpkraan.' }]);
      audio.sfx('win'); this.cheer();
      await this.say([{ who: 'DJ Dobber', text: 'En nu een nummer dat ik net verzonnen heb! Het heet "Boem Boem Boem". Het heeft drie woorden en ik ben er trots op.' }, { who: 'Kermis-Kees', text: 'Gratis kauwgom voor iedereen! Behalve voor wie de grijpkraan-kip aanraakte. Jij weet wie je bent.' }]);
      // 2. langs het publiek
      this.cam([-16, 4, 14], [16, 4, 14], [0, 3, -2], [0, 3, -2], 9); this.firework(); await this.wait(2500); this.firework(); this.cheer(); await this.wait(2500);
      // 3. de Deurman danst op de beat
      this.deur.dance = true; this.cam([-5, 3.2, 9], [1, 2.6, 8], [0, 2, 3.5], [0, 2.2, 3.5], 10);
      await this.say([{ who: 'Jor', text: 'Wes. De Deurman danst.' }, { who: 'Wes', text: 'Op de beat.' }, { who: 'Jor', text: 'Hij zwaait ook met zijn feesthoedje. Dat is... schattig?' }, { who: 'Wes', text: 'Hij is gewoon de grootste fan van onze Speelhal. Een hele lange fan.' }, ...(nPlayers() === 3 ? [{ who: 'Juul', text: 'Ik heb hem net een hoedje gegeven. Hij had er al een. Nu heeft hij er twee.' }] : [])]);
      // 4. het diploma met handtekening
      this.deur.dance = false; this.bros.forEach((b, i) => { b.group.position.set(i === 2 ? -2.1 : i ? -1.5 : -2.7, 0, i === 2 ? 6.2 : i ? 5.0 : 4.0); b.yaw = b.targetYaw = Math.PI / 2; b.pose = 'idle'; }); this.deur.group.position.set(0.7, 0, 4.5); this.deur.yaw = this.deur.targetYaw = -Math.PI / 2;
      this.cam([-2, 2.4, 11.5], [-0.8, 2.3, 9.5], [-0.8, 1.8, 4.5], [-0.8, 2.1, 4.5], 9);
      this.diploma = this.makeDiploma(); ui.screens.append(this.diploma); audio.sfx('sparkle');
      await this.say([{ who: 'Wes', text: 'Deurman, dit is voor jou: het officiële DEURMAN-DIPLOMA. Door ons ' + (nPlayers() === 3 ? 'alle drie' : 'allebei') + ' getekend.' }, { who: 'Deurman', text: '...Handtekening?' }, { who: 'Jor', text: nPlayers() === 3 ? 'Drie zelfs. Eentje met een kronkel.' : 'Twee zelfs. Eentje met een kronkel.' }]);
      this.love = 5; audio.sfx('star'); this.deur.dance = true;
      await this.say([{ who: 'Deurman', text: '...Dank u. Dit is de mooiste dag van mijn deurleven.' }, { who: 'Koning Klopper', text: 'Hij huilt! Iemand, een zakdoek!' }, { who: 'Deurman', text: '...Ik huil niet. Dat is deurolie.' }]);
      this.diploma.remove(); this.diploma = null;
      audio.sfx('win'); this.confetti = 5; this.cheer();
      // 5. finale: vuurwerk, dansen, credits
      this.bros.forEach((b) => (b.pose = 'cheer')); this.deur.group.position.set(0, 0, 3.5); this.deur.yaw = this.deur.targetYaw = 0;
      this.cam([0, 5, 20], [0, 11, 33], [0, 5, 0], [0, 7, -6], 14); this.fireT = 14;
      await this.say([{ who: 'Koning Klopper', text: 'En nu: DOORFEESTEN! Wie als laatste stopt met dansen is een stoel!' }]);
      await this.credits();
    } catch (e) { if (e !== SKIP) console.error('slotfeest', e); }
    if (!this.dead) this.endCard();
  }
  makeDiploma() {
    return h('div', { style: { position: 'absolute', left: '50%', top: '6vh', transform: 'translateX(-50%) rotate(2deg)', width: 'min(520px,86vw)', padding: '16px 24px', background: 'linear-gradient(135deg,#fff8dc,#f3e2a8)', border: '6px double #b8860b', borderRadius: '10px', color: '#3a1f5a', textAlign: 'center', boxShadow: '0 8px 0 rgba(0,0,0,.45)', zIndex: 30, fontFamily: 'Fredoka, sans-serif' } },
      h('div', { style: { fontFamily: 'MedievalSharp, serif', fontSize: '30px', color: '#7a2fd4' } }, 'DEURMAN-DIPLOMA'), h('div', { style: { fontSize: '19px', margin: '6px 0' } }, 'Hierbij wordt de Deurman officieel benoemd tot'), h('div', { style: { fontSize: '26px', fontWeight: 700 } }, 'GROOTSTE FAN VAN DE SPEELHAL'),
      h('div', { style: { fontFamily: 'MedievalSharp, serif', fontSize: '28px', marginTop: '8px', color: '#1d9a52' } }, `${pname(0)}  &  `, h('span', { style: { color: '#2f6fe0' } }, pname(1)), ...(nPlayers() === 3 ? [`  &  `, h('span', { style: { color: '#e87a1e' } }, pname(2))] : [])), h('div', { style: { fontSize: '13px', opacity: 0.7 } }, '(met kronkel)'));
  }
  boom() { for (const x of [-12, 12]) this.fx.burst(x, 8, -14, { count: 80, colors: [0xff3d81, 0xffe14a, 0x3dc8ff], speed: 9, size: 0.45, life: 1.4, gravity: 4 }); this.shake = 0.4; audio.sfx('explode', { vol: 0.4 }); }
  cheer() { audio.sfx('win'); for (let i = 0; i < 6; i++) setTimeout(() => !this.dead && audio.sfx('pop', { rate: 0.7 + Math.random() * 0.6 }), i * 120); }
  firework() {
    const x = rand(-26, 26), y = rand(24, 44), z = rand(-40, -20); const cols = [[0xff3d81, 0xffffff], [0xffe14a, 0xff8a1c], [0x3dc8ff, 0xffffff], [0x7bff7b, 0xffe14a], [0xb05aff, 0xff3d81]][Math.floor(Math.random() * 5)];
    audio.sfx('explode', { vol: 0.3, rate: 1.3 }); this.fx.burst(x, y, z, { count: 90, colors: cols, speed: 14, size: 1.4, life: 1.8, gravity: 5, spread: 1.4, up: 0.6 });
    this.fx.burst(x, y, z, { count: 30, color: 0xffffff, speed: 6, size: 1.0, life: 1.0, gravity: 3 });
  }
  // ---- credits met jullie statistieken ----
  stats() {
    const A = S.arcade, ids = activeIds(); const r = rank(); const hats = (S.cosmetics && S.cosmetics.owned || []).reduce((a, o) => a + Math.max(0, ((o && o.hat) || []).length - 1), 0);
    const built = ARCADE_HALLS.filter((x) => isUnlocked(x.id)).length;
    return { r, rows: [
      ['Rang', `${r.icon} ${r.name}`], ['Duels gespeeld', A.plays], ['Winst', ids.length === 3 ? standTxt(A.wins, ids, ' · ') : `${pname(0)} ${A.wins[0] || 0} – ${A.wins[1] || 0} ${pname(1)}`], ['Gelijkspel', A.draws], ['Toernooien gewonnen', ids.length === 3 ? standTxt(A.tourneys, ids, ' · ') : `${pname(0)} ${A.tourneys[0] || 0} – ${A.tourneys[1] || 0} ${pname(1)}`],
      ['Dagduels', (S.daily && S.daily.total) || 0], ['Hallen gebouwd', `${built} van ${ARCADE_HALLS.length}`], ['Heitjes verdiend', S.totalEarned], ['Hoeden gekocht', hats], ['Deurman-stickers', stickers().length], ['Speeltijd', `${Math.max(1, Math.round(S.playTime / 60))} min`],
    ] };
  }
  credits() {
    const st = this.stats();
    const blk = (...kids) => h('div', { style: { margin: '0 0 46px', padding: '10px 16px', background: 'rgba(20,10,40,.55)', borderRadius: '14px', textShadow: '0 2px 0 #000' } }, ...kids);
    const T = (t, sz = 20, c = '#ffe14a') => h('div', { style: { fontSize: sz + 'px', color: c, fontFamily: sz > 24 ? 'MedievalSharp, serif' : 'Fredoka, sans-serif', fontWeight: 700 } }, t);
    this.creditEl = h('div', { style: { position: 'absolute', right: '3vw', top: 0, width: 'min(430px,92vw)', textAlign: 'center', fontSize: '18px', willChange: 'transform', zIndex: 20, pointerEvents: 'none' } },
      blk(T('Wes & Jor:', 40), T('De Speelhal', 44), T('Het Grote Slotfeest', 22, '#fff')),
      blk(T('Met in de hoofdrollen', 17, '#fff'), T(activeIds().map(pname).join(' & '), 30), T('Koning Klopper · DJ Dobber · Kermis-Kees', 18, '#fff'), T('en alle bezoekers van de Speelhal', 16, '#d8c8ff'), T('De Deurman als zichzelf (hij vroeg om een handtekening)', 16, '#d8c8ff')),
      blk(T('Jullie Speelhal in cijfers', 24), ...st.rows.map(([k, v]) => h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '18px', color: '#fff' } }, h('span', {}, k), h('b', { style: { color: '#ffe14a' } }, String(v))))),
      blk(T('Bedankt voor het spelen!', 28), T('De deuren blijven open. Dat zegt de Deurman.', 16, '#d8c8ff')));
    ui.screens.append(this.creditEl); this.cy = innerHeight; this.creditsOn = true;
    return new Promise((res, rej) => { this._creditsDone = res; this._creditsFail = rej; });
  }
  endCard() {
    S.flags.ended = true; S.flags.slotfeest = true; persist(); this.creditsOn = false; if (this.creditEl) this.creditEl.remove(); if (this.diploma) this.diploma.remove();
    ui.say([]);
    const menu = new Menu3([
      { label: 'Doorspelen in de Speelhal', onSelect: async () => { ui.activeMenus = []; await ui.fade(1, 600); await this.app.goArcade({}); } },
      { label: 'Naar het titelscherm', onSelect: async () => { ui.activeMenus = []; await ui.fade(1, 600); await this.app.goMenu(); ui.fade(0, 600); } },
    ]);
    const st = this.stats();
    const card = h('div', { class: 'card', style: { width: 'min(560px,94vw)' } }, h('h1', { style: { fontSize: '48px' } }, 'FEEST!'), h('p', { style: { textAlign: 'center' }, html: `${nPlayers() === 3 ? 'Wes, Jor en Juul' : 'Wes en Jor'} zijn <b>${st.r.icon} ${st.r.name}</b> van de Speelhal!<br>🎮 ${S.arcade.plays} duels · 🪙 ${S.totalEarned} heitjes · 🚪 ${stickers().length} Deurman-stickers` }), menu.el, h('div', { class: 'small-note' }, 'Bedankt voor het spelen! Je kunt gewoon doorspelen.'));
    ui.overlay(card); ui.activeMenus.push(menu); this.ended = true;
  }

  update(dt) {
    this.t += dt; const t = this.t;
    // overslaan naar de credits-einde: 1 s een actieknop vasthouden
    let hl = false; for (const p of activeInputs()) if (p.a || p.b) hl = true; if (!(hl && this.creditsOn)) this.holdT0 = 0; else if (!this.holdT0) this.holdT0 = performance.now(); this.skipHold = this.holdT0 ? (performance.now() - this.holdT0) / 1000 : 0; if (this.skipHold > 1 && this.creditsOn) { this.creditsOn = false; this._creditsDone && this._creditsDone(); }
    if (this.shot) {
      const s = this.shot; s.t += dt; const k = smoothstep(0, 1, Math.min(1, s.t / s.dur));
      const p = s.from.map((v, i) => lerp(v, s.to[i], k)), l = s.look0.map((v, i) => lerp(v, s.look1[i], k));
      this.camera.position.set(p[0], p[1], p[2]); if (this.shake > 0.01) { this.camera.position.x += (Math.random() - .5) * this.shake; this.camera.position.y += (Math.random() - .5) * this.shake; this.shake *= 0.9; } this.camera.lookAt(l[0], l[1], l[2]);
    }
    // de Deurman: schattig dansen op de beat (zwaaiende lange armen, huppelend)
    const d = this.deur; d.update(dt);
    if (d.dance) { d.group.rotation.y += Math.sin(t * 8) * 0.03; d.torso.rotation.z = Math.sin(t * 8) * 0.12; d.arms[0].rotation.z = 1.2 + Math.sin(t * 8) * 0.5; d.arms[1].rotation.z = -1.2 - Math.sin(t * 8 + 1) * 0.5; d.group.position.y = Math.abs(Math.sin(t * 8)) * 0.3; }
    else { d.torso.rotation.z = 0; d.group.position.y = 0; }
    this.bros.forEach((b) => b.update(dt)); this.king.update(dt); this.dj.update(dt); this.kees.update(dt); this.guests.forEach((g) => g.update(dt));
    // koning wiebelt op de beat
    this.king.group.position.y = 1.4 + Math.abs(Math.sin(t * 4)) * 0.08;
    // licht, scherm, ballonnen, banieren
    this.lights.forEach((l, i) => { const a = t * 0.8 + i * TAU / 3; l.position.set(Math.cos(a) * 14, 9, 2 + Math.sin(a) * 8); });
    this.disco.rotation.y += dt * 0.9;
    this.beams.forEach((b) => { b.cone.rotation.z = Math.sin(t * 1.4 + b.ph) * 0.6; b.cone.rotation.x = Math.cos(t * 1.1 + b.ph) * 0.4; });
    this.balloons.forEach((b) => { b.position.y += Math.sin(t * 1.5 + b.userData.ph) * 0.004; b.rotation.z = Math.sin(t + b.userData.ph) * 0.1; });
    (this.banners || []).forEach((b, i) => P.animateBanner(b, t + i));
    this.ledT = (this.ledT || 0) - dt;
    if (this.ledT <= 0) {
      this.ledT = 0.08; const g = this.ledCanvas.getContext('2d'); const w = 512, hh = 192;
      const gr = g.createLinearGradient(0, 0, w, hh); gr.addColorStop(0, `hsl(${(t * 60) % 360},90%,50%)`); gr.addColorStop(1, `hsl(${(t * 60 + 120) % 360},90%,45%)`); g.fillStyle = gr; g.fillRect(0, 0, w, hh);
      g.fillStyle = 'rgba(255,255,255,.12)'; for (let i = 0; i < 9; i++) { const a = t * 1.5 + i * 0.7; g.beginPath(); g.moveTo(w / 2, hh / 2); g.arc(w / 2, hh / 2, 400, a, a + 0.25); g.fill(); }
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.strokeStyle = '#2a0a50'; g.lineWidth = 10; g.font = 'bold 56px Fredoka, Arial Black'; g.strokeText('HET GROTE', w / 2, 70); g.fillText('HET GROTE', w / 2, 70); g.font = 'bold 74px Fredoka, Arial Black'; g.strokeText('SLOTFEEST', w / 2, 142); g.fillText('SLOTFEEST', w / 2, 142);
      g.font = 'bold 26px Fredoka, Arial'; g.fillStyle = '#ffe14a'; g.fillText('Wes & Jor: De Speelhal', w / 2, 178); this.ledTex.needsUpdate = true;
    }
    // publiek springt
    this.crowd.forEach((c, i) => { const y = 0.9 + Math.abs(Math.sin(t * 6 * c.a + c.ph)) * 0.6; this.D.position.set(c.x, y, c.z); this.D.rotation.set(0, 0, 0); this.D.scale.set(1, 1, 1); this.D.updateMatrix(); this.body.setMatrixAt(i, this.D.matrix); this.D.position.set(c.x, y + 0.9, c.z); this.D.updateMatrix(); this.head.setMatrixAt(i, this.D.matrix); });
    this.body.instanceMatrix.needsUpdate = true; this.head.instanceMatrix.needsUpdate = true;
    // confetti, vuurwerk, hartjes
    if (this.confetti > 0) { this.confetti -= dt; for (let i = 0; i < 4; i++) this.fx.emit(rand(-26, 26), rand(14, 20), rand(-12, 18), rand(-1, 1), rand(-2, -4), rand(-1, 1), { life: 5, size: 0.45, color: [0xff3d81, 0xffe14a, 0x3dc8ff, 0x7bff7b, 0xb05aff][Math.floor(Math.random() * 5)], gravity: 0.5, shrink: false }); }
    if (this.fireT > 0) { this.fireT -= dt; if (Math.random() < dt * 1.6) this.firework(); }
    if (this.love > 0) { this.love -= dt; if (Math.random() < 0.5) this.fx.emit(d.group.position.x + rand(-0.8, 0.8), 3 + rand(0, 1.5), d.group.position.z + rand(-0.4, 0.4), rand(-0.3, 0.3), rand(1, 2.2), 0, { life: 1.6, size: 0.55, color: [0xff5a9a, 0xff8ac0, 0xffb0d8][Math.floor(Math.random() * 3)], gravity: -0.3 }); }
    this.fx.update(dt);
    // credits scrollen
    if (this.creditsOn && this.creditEl) { this.cy -= dt * 48; this.creditEl.style.transform = `translateY(${Math.round(this.cy)}px)`; if (this.cy < -this.creditEl.offsetHeight - 20) { this.creditsOn = false; this._creditsDone && this._creditsDone(); } }
  }
  render(renderer) { renderer.render(this.scene, this.camera); }
}
