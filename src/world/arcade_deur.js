// DEURENFEESTJE: de Deurman neemt een hal van de Speelhal over (als feestje, niet als horror):
// de lichten worden disco-kleuren en er klinkt feestmuziek -> een vrijstaande deur gaat open, de Deurman (met feesthoed) danst naar de broers voor een high-five
// -> selfie-licht (B/G/Shift vasthouden, richten) laat hem blozen en wegdansen; pakt hij ze, dan zit hij als DJ met koptelefoon op de troon en is de hal overgenomen:
// de schermen tonen zijn gezicht met feesthoed, overal ballonnen en serpentines. Eén feest-duel (Deurman-twist) wint de hal terug.
import * as THREE from 'three';
import { makeDeurman } from '../engine/chars.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { inp, nPlayers } from './players3.js';
import { scare } from '../engine/scare.js';
import { giveSticker } from '../engine/cameo.js';
import { S, persist } from '../save.js';
import { h, mesh, mat, clamp, lerp, rand, pick, damp } from '../engine/util.js';
import { floatLabel } from './build.js';

let TAKEOVER = null;   // { hall } zolang hij een hal bezet houdt (blijft staan tot een duel gespeeld is)
export const takeoverHall = () => (TAKEOVER ? TAKEOVER.hall : null);
export const clearTakeover = () => { TAKEOVER = null; };

const DZ = -6;   // z van de vrijstaande deur
const CONFETTI = [0xff4aa8, 0xffe14a, 0x4ac8ff, 0x7bff7b, 0xb06aff, 0xff9a2a];
const BEAT = 12.8;   // 122 bpm (rad/s), gelijk aan de feestmuziek

export class ArcadeDeurman {
  constructor(a) {
    this.a = a; const sc = a.scene;
    this.m = makeDeurman(1.35, { outfit: 'feest' }); this.m.group.visible = false; sc.add(this.m.group);
    // vrijstaande deur: vrolijk gekleurd kozijn, lichte gloed erachter
    const g = new THREE.Group(); const wood = mat(0xc84a9a, { roughness: 0.7 });
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.5, 8.4, 0.7), wood, { pos: [sx * 2.2, 4.2, 0] }));
    g.add(mesh(new THREE.BoxGeometry(5.0, 0.6, 0.7), wood, { pos: [0, 8.4, 0] }));
    g.add(mesh(new THREE.PlaneGeometry(3.9, 8.1), new THREE.MeshBasicMaterial({ color: 0xfff0b0 }), { cast: false, receive: false, pos: [0, 4.05, -0.05] }));
    this.glowPlane = mesh(new THREE.PlaneGeometry(3.9, 8.1), new THREE.MeshBasicMaterial({ color: 0xff7ad5, transparent: true, opacity: 0, depthWrite: false }), { cast: false, receive: false, pos: [0, 4.05, -0.02] }); g.add(this.glowPlane);
    this.leaf = new THREE.Group(); this.leaf.position.set(-1.95, 0, 0.2); this.leaf.add(mesh(new THREE.BoxGeometry(3.9, 8.0, 0.22), mat(0x4aa8e8, { roughness: 0.7 }), { pos: [1.95, 4.05, 0] }));
    this.leaf.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffd23f, { metalness: 0.7 }), { pos: [3.4, 4.0, 0.2] })); g.add(this.leaf);
    for (let i = 0; i < 9; i++) g.add(mesh(new THREE.SphereGeometry(0.22, 6, 5), mat(CONFETTI[i % 6]), { cast: false, pos: [-2 + i * 0.5, 8.8 - Math.sin(i / 8 * Math.PI) * 0.5 * -1, 0.35] }));   // slinger boven de deur
    g.position.set(0, 0, DZ); g.visible = false; sc.add(g); this.doorG = g;
    // selfie-lichten (vooraf aangemaakt: geen shader-hercompilatie midden in het spel)
    this.lamps = Array.from({ length: nPlayers() }, () => { const l = new THREE.PointLight(0xfff0d8, 0, 16, 1.4); sc.add(l); return l; });
    this.cones = Array.from({ length: nPlayers() }, () => { const c = mesh(new THREE.ConeGeometry(3.2, 9, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe0f4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), { cast: false, receive: false }); c.visible = false; sc.add(c); return c; });
    this.bar = h('div', { class: 'hud-deur', style: { display: 'none' } }, h('div', { class: 'lbl' }, '🤳 Selfie-licht: laat hem blozen'), h('div', { class: 'bar' }, h('i')));
    ui.hudEl.append(this.bar);
    // ballonnen + serpentines (alleen zichtbaar tijdens het feestje; langs de randen, buiten beeld van het spel)
    this.party = new THREE.Group(); this.party.visible = false; sc.add(this.party); this.balloons = [];
    const spots = [[-25, -17], [25, -17], [-25, 17], [25, 17], [-26, 0], [26, 0], [-9, -18], [9, -18], [-14, 18], [14, 18], [0, -18.5], [-26, -9], [26, 9], [-26, 9], [26, -9]];
    spots.forEach(([x, z], i) => {
      const col = CONFETTI[i % CONFETTI.length]; const b = new THREE.Group(); const y0 = 3.5 + (i % 4) * 1.6;
      b.add(mesh(new THREE.SphereGeometry(0.95, 12, 10), mat(col, { roughness: 0.25, flatShading: false }), { cast: false, scale: [1, 1.2, 1], pos: [0, y0, 0] }));
      b.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, y0 - 0.2, 4), mat(0xffffff), { cast: false, pos: [0, y0 / 2 - 0.1, 0] }));
      b.position.set(x, 0, z); b.userData = { y0, ph: i * 1.7 }; this.party.add(b); this.balloons.push(b);
    });
    const hw = 27, hd = 19.5;
    const streamer = (pts, col) => { const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))); this.party.add(mesh(new THREE.TubeGeometry(c, 40, 0.09, 4, false), new THREE.MeshBasicMaterial({ color: col }), { cast: false, receive: false })); };
    for (let i = 0; i < 4; i++) { const zz = -hd + i * (hd * 2 / 3); streamer([[-hw, 13, zz], [-hw / 2, 11.2, zz + 1.5], [0, 12.6, zz], [hw / 2, 11.2, zz - 1.5], [hw, 13, zz]], CONFETTI[i % 6]); }
    for (const [sx, col] of [[-1, 0xff4aa8], [1, 0x4ac8ff]]) streamer([[sx * hw, 13.2, -hd], [sx * hw, 11.4, -hd / 2], [sx * hw, 12.8, 0], [sx * hw, 11.4, hd / 2], [sx * hw, 13.2, hd]], col);
    // basiswaarden voor sfeer
    this.base = { hemi: a.hemi.intensity, sun: a.sunL.intensity, lights: a.lights.map((l) => ({ c: l.color.clone(), i: l.intensity })), fog: a.scene.fog ? { near: a.scene.fog.near, far: a.scene.fog.far, c: a.scene.fog.color.clone() } : null, bg: a.scene.background.clone(), flames: a.glows.map((f) => f.material.color.clone()) };
    this.glitchTex = [a.cabTexture('x', true), a.cabTexture('x', true)];   // schermen: zijn gezicht met feesthoed
    this.k = 0; this.kT = 0; this.state = 'idle'; this.stT = 0; this.t = 0; this.sq = 0; this.banish = 0; this.hinted = 0; this.glitchT = 0; this.whisperT = 6; this.tele = 8; this.snapT = 0; this.confT = 2;
    this.timer = rand(95, 170);
    this.takeover = false;
    if (TAKEOVER && TAKEOVER.hall === a.hallId) this.enterTakeover(true);
  }
  get active() { return this.state !== 'idle' && this.state !== 'takeover'; }
  level() { return S.settings.scare; }
  cleanup() { this.bar.remove(); }

  // ---- sfeer: k = 0 (gewoon) .. 1 (volledig disco) ----
  applyMood(dt) {
    this.k = damp(this.k, this.kT, 2.4, dt); const k = this.k; const a = this.a; const b = this.base;
    if (k < 0.003 && this.kT === 0) { if (this.moodOn) { this.moodOn = false; this.setMood(0); this.party.visible = false; } return; }
    this.moodOn = true; this.party.visible = true; this.setMood(k);
    // lichten pulseren op de beat (zacht; bij flashFree bijna niet)
    const pulse = S.settings.flashFree ? 0.04 : 0.16; const bt = (0.5 + 0.5 * Math.sin(this.t * BEAT)) * (k > 0.3 ? 1 : 0);
    a.hemi.intensity = lerp(b.hemi, b.hemi * 0.6, k) * (1 - pulse * bt);
    a.sunL.intensity = lerp(b.sun, b.sun * 0.35, k) * (1 - pulse * bt);
    this.glowPlane.material.opacity = (this.doorG.visible ? 0.3 + 0.15 * Math.sin(this.t * 3) : 0) * k;
    for (const bl of this.balloons) bl.position.y = Math.sin(this.t * 1.1 + bl.userData.ph) * 0.35;
    // schermen: zijn gezicht met feesthoed
    this.glitchT -= dt;
    if (this.glitchT <= 0 && k > 0.2) {
      this.glitchT = lerp(1.6, 0.6, k); const n = this.takeover ? a.cabs.length : 1 + Math.floor(k * 3);
      for (const c of a.cabs) { const orig = c.scr.userData.orig || (c.scr.userData.orig = c.scr.material.map); c.scr.material.map = orig; }
      for (let i = 0; i < n; i++) { const c = pick(a.cabs); c.scr.userData.orig = c.scr.userData.orig || c.scr.material.map; c.scr.material.map = pick(this.glitchTex); }
      for (const c of a.cabs) c.scr.material.needsUpdate = true;
      if (Math.random() < 0.4) audio.sfx('pop', { vol: 0.35 });
    }
    // af en toe een feestgeluidje
    this.whisperT -= dt; if (this.whisperT <= 0 && k > 0.3 && !this.takeover) { this.whisperT = rand(6, 11); audio.sfx(pick(['party', 'kazoo', 'honk']), { vol: 0.3 }); }
  }
  setMood(k) {
    const a = this.a; const b = this.base; const col = new THREE.Color(); const hue = this.t * 0.12;
    a.lights.forEach((l, i) => { col.setHSL((hue + i / a.lights.length) % 1, 0.95, 0.55); l.color.copy(b.lights[i].c).lerp(col, k); l.intensity = b.lights[i].i * (1 + 0.5 * k); });
    if (a.scene.fog && b.fog) { a.scene.fog.near = lerp(b.fog.near, 24, k); a.scene.fog.far = lerp(b.fog.far, 90, k); a.scene.fog.color.copy(b.fog.c).lerp(col.set(0x2a1250), k); }
    a.scene.background.copy(b.bg).lerp(col.set(0x24104a), k);
    a.glows.forEach((f, i) => { col.setHSL((hue * 2 + i * 0.3) % 1, 0.9, 0.7); f.material.color.copy(b.flames[i]).lerp(col, k); });
    if (k === 0) { a.hemi.intensity = b.hemi; a.sunL.intensity = b.sun; for (const c of a.cabs) { if (c.scr.userData.orig) { c.scr.material.map = c.scr.userData.orig; c.scr.material.needsUpdate = true; } } }
  }

  // ---- levenscyclus ----
  async warn() {
    this.state = 'warn'; this.stT = 0; this.kT = 0.55; audio.music('deurparty'); audio.sfx('party');
    ui.hud.toast('De lichten worden disco... en wat is dat voor muziek?!', 3200);
    ui.hud.setPrompt(null);
  }
  openDoor() {
    this.state = 'door'; this.stT = 0; this.kT = 0.8; this.doorG.visible = true; this.leaf.rotation.y = 0;
    audio.sfx('doorbell'); audio.sfx('party');
    this.a.camOverride = { x: 0, z: DZ + 2, t: 3.4 };
    const m = this.m; const gp = m.group.position; m.setOutfit('feest'); m.pose = 'wave'; gp.set(0, 0, DZ + 0.3); m.targetYaw = m.yaw = 0; m.group.rotation.y = 0; m.group.visible = true; m.group.scale.setScalar(1); m.glitch = 0.5; m.speed = 0; m.blush = 0;
    S.sightings = (S.sightings || 0) + 1;
    ui.hud.toast('Een deur... midden in de hal. Er staat iemand met een feesthoed in!', 3200);
  }
  startStalk() {
    this.state = 'stalk'; this.stT = 0; this.banish = 0; this.tele = 7; this.kT = 1; this.m.pose = 'highfive';
    this.bar.style.display = 'block'; audio.music('deurchase'); audio.sfx('slide');
    if (this.hinted < 2) { ui.hud.setPrompt('Houd <b>G</b> / <b>Shift</b> vast en richt je selfie-licht op hem: dan bloost hij en danst hij weg!'); this.hinted++; }
    ui.hud.toast('De Deurman danst op jullie af voor een HIGH-FIVE!', 2400);
  }
  nearest() { let best = null, bd = 1e9; for (const p of this.a.players) { const d = Math.hypot(p.x - this.m.group.position.x, p.z - this.m.group.position.z); if (d < bd) { bd = d; best = p; } } return { p: best, d: bd }; }
  lit() {
    let n = 0; const gp = this.m.group.position;
    for (const p of this.a.players) {
      if (!inp(p.i).b) continue; const dx = gp.x - p.x, dz = gp.z - p.z; const d = Math.hypot(dx, dz); if (d > 22) continue;
      const dot = (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / (d || 1); if (dot > 0.7) n++;
    }
    return n;
  }
  lanterns(dt) {
    for (const p of this.a.players) {
      const on = (this.state === 'stalk' || this.state === 'door') && inp(p.i).b; const l = this.lamps[p.i]; const c = this.cones[p.i];
      l.intensity = damp(l.intensity, on ? 220 : 0, 14, dt); const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      l.position.set(p.x + fx * 3, 2.2, p.z + fz * 3);
      c.visible = on; if (on) { c.material.opacity = 0.16; c.position.set(p.x + fx * 4.5, 1.6, p.z + fz * 4.5); c.rotation.set(Math.PI / 2, 0, 0); c.lookAt(p.x + fx * 20, 1.6, p.z + fz * 20); c.rotateX(-Math.PI / 2); }
    }
  }
  update(dt) {
    this.t += dt; const a = this.a; const m = this.m; const lvl = this.level();
    this.applyMood(dt); this.lanterns(dt);
    if (this.state === 'idle') {
      if (lvl <= 0 || a.hallId === 4 || a.busy || scare.active || a.leaving || a.picker || a.modal || a.menu || a.hasTourney()) return;   // in de Deurenhal is hij de gastheer
      this.timer -= dt * (lvl === 3 ? 1.5 : lvl === 1 ? 0.6 : 1);
      if (this.timer <= 0) this.warn();
      return;
    }
    if (this.state === 'takeover') { m.update(dt); this.takeoverAnim(dt); return; }
    if (this.state === 'warn') { this.stT += dt; if (this.stT > 5.5) this.openDoor(); }
    else if (this.state === 'door') {
      this.stT += dt; this.leaf.rotation.y = -1.75 * clamp(this.stT / 1.6, 0, 1);
      m.faceDir(0, 1);
      if (this.stT > 3.4) this.startStalk();
    } else if (this.state === 'stalk') this.updateStalk(dt);
    else if (this.state === 'banished') {   // wegdansen en 'plop'
      this.stT += dt; m.speed = 0;
      if (this.stT > 1.6) m.group.scale.setScalar(Math.max(0.01, 1 - (this.stT - 1.6) * 2.2));
      if (this.stT > 2.3) { m.group.visible = false; m.group.scale.setScalar(1); this.finish(); }
    }
    m.update(dt);
  }
  updateStalk(dt) {
    const m = this.m; const lvl = this.level(); this.stT += dt;
    const { p, d } = this.nearest(); const gp = m.group.position; m.faceDir(p.x - gp.x, p.z - gp.z);
    const n = this.lit();
    if (n > 0) {   // selfie-licht: blozen
      this.banish += dt * (n > 1 ? 0.7 : 0.42); m.speed = 0; m.pose = 'shy'; m.blush = Math.min(1, this.banish * 1.4);
      this.snapT -= dt; if (this.snapT <= 0) { audio.sfx('shutter', { vol: 0.6 }); this.snapT = 0.9; }
      if (Math.random() < 0.3) this.a.fx.emit(gp.x + rand(-.4, .4), gp.y + rand(1, 3.4), gp.z + rand(-.4, .4), 0, 1, 0, { life: 0.8, size: 0.3, color: Math.random() < 0.5 ? 0xff9ac8 : 0xfff6c0, gravity: 0 });
    } else {
      this.banish = Math.max(0, this.banish - dt * 0.2); m.pose = 'highfive'; m.blush = Math.max(0, m.blush - dt * 0.6);
      const sp = 2.3 + (lvl === 3 ? 0.9 : lvl === 1 ? -0.7 : 0) + Math.min(1.1, this.stT * 0.03);
      const dx = p.x - gp.x, dz = p.z - gp.z; const dd = Math.hypot(dx, dz) || 1; gp.x += dx / dd * sp * dt; gp.z += dz / dd * sp * dt; m.speed = 1;
      this.sq -= dt; if (this.sq <= 0) { audio.sfx('squeak', { vol: 0.22, rate: 0.9 + Math.random() * 0.3 }); this.sq = 0.5; }
      this.tele -= dt;
      if (lvl >= 2 && d > 16 && this.tele <= 0) { const ang = Math.atan2(p.x - gp.x, p.z - gp.z) + rand(-0.6, 0.6); gp.x = p.x - Math.sin(ang) * 9; gp.z = p.z - Math.cos(ang) * 9; m.glitch = 0.5; audio.sfx('pop'); this.a.fx.burst(gp.x, 2, gp.z, { count: 24, colors: CONFETTI, speed: 4, size: 0.35, life: 0.9 }); this.tele = 10; }
    }
    this.bar.querySelector('i').style.width = clamp(this.banish * 100, 0, 100) + '%';
    if (this.banish >= 1) { this.doBanish(); return; }
    if (d < 1.9) { this.doCaught(); return; }
    if (this.stT > 65) { ui.hud.toast('De Deurman gaat toch maar een pizza halen...', 2500); this.m.group.visible = false; this.finish(); }
  }
  endAtmos() { this.bar.style.display = 'none'; ui.setVignette(0); ui.hud.setPrompt(null); for (const l of this.lamps) l.intensity = 0; for (const c of this.cones) c.visible = false; }
  finish() {   // terug naar gewoon
    this.endAtmos(); this.state = 'idle'; this.kT = 0; this.timer = rand(240, 420); this.doorG.visible = false; this.m.group.visible = false; this.m.blush = 0; audio.music('concert');
  }
  doBanish() {
    this.endAtmos(); const gp = this.m.group.position; this.state = 'banished'; this.stT = 0; this.kT = 0; const m = this.m; m.pose = 'dance'; m.blush = 1;
    if (!S.settings.flashFree) ui.flash('#ffd0ec', 300);
    audio.sfx('kiss'); audio.sfx('tada'); setTimeout(() => audio.sfx('kazoo'), 500);
    this.a.fx.burst(gp.x, gp.y + 2, gp.z, { count: 60, colors: CONFETTI, speed: 7, size: 0.4, life: 1.2 });
    S.coins += 15; S.totalEarned += 15; S.banished = (S.banished || 0) + 1; giveSticker('selfie'); persist(); ui.hud.toast('Hihi! De Deurman bloost en danst weg. +15 heitjes uit zijn zakken gevallen!', 3200);
  }
  async doCaught() {
    this.endAtmos(); this.state = 'caught'; const lvl = this.level(); this.m.pose = 'highfive';
    if (lvl >= 2) await scare.jumpscare({ variant: 'party', text: 'FEESTJE!' }); else { audio.sfx('highfive'); audio.sfx('tada'); }
    giveSticker('highfive');
    TAKEOVER = { hall: this.a.hallId }; this.enterTakeover(false);
    await this.a.say([{ who: 'Deurman', text: 'HIGH-FIVE! En nu... DEURENFEESTJE! Ik ben de DJ!' }, { who: 'Wes', text: 'Wat?! Hij zit op de troon met een koptelefoon!' }, { who: 'Jor', text: 'Alle schermen laten zijn gezicht zien. Met een feesthoed.' }, { who: 'Deurman', text: 'Eén feest-duel. Win en je krijgt de hal terug. Handtekeningen zijn ook welkom.' }]);
  }
  // hij zit als DJ op de troon, de hal is overgenomen
  enterTakeover(silent) {
    const a = this.a; this.state = 'takeover'; this.takeover = true; this.kT = 1; this.k = silent ? 1 : this.k; this.doorG.visible = false; this.bar.style.display = 'none';
    const seat = a.king.group.position; this.seat = { x: seat.x, y: seat.y, z: seat.z };
    a.king.group.visible = false; const m = this.m; m.setOutfit('dj'); m.group.visible = true; m.group.scale.setScalar(1.15);
    m.group.position.set(this.seat.x, this.seat.y, this.seat.z); m.targetYaw = m.yaw = 0; m.group.rotation.y = 0; m.speed = 0; m.pose = 'dj'; m.blush = 0.3;
    audio.music('deurparty'); ui.hud.setHint('DEURENFEESTJE! De Deurman is DJ geworden. Speel één feest-duel (met de Deurman-twist) om de hal terug te winnen!'); this.hintT = 1;
    if (!this.takeLabel) { this.takeLabel = floatLabel('🎧 DJ Deurman', 'Deurenfeestje!', '#ff7ae0'); this.takeLabel.position.set(0, 8, this.seat.z); a.scene.add(this.takeLabel); }
    this.takeLabel.visible = true;
  }
  takeoverAnim(dt) {
    const m = this.m; const a = this.a;
    m.group.position.y = this.seat.y + Math.abs(Math.sin(this.t * BEAT / 2)) * 0.06; m.group.rotation.y = Math.sin(this.t * 0.9) * 0.3;
    const { p } = this.nearest(); m.faceDir(p.x - m.group.position.x, p.z - m.group.position.z);
    ui.setVignette(0);
    this.confT -= dt; if (this.confT <= 0) { this.confT = rand(2.5, 4.5); const gp = m.group.position; a.fx.burst(gp.x + rand(-6, 6), 9, gp.z + rand(0, 8), { count: 26, colors: CONFETTI, speed: 3, up: 0.3, size: 0.35, life: 2.2, gravity: 2.5 }); }
    a.disco.rotation.y -= dt * 2.4;
  }
  async talk() {
    await this.a.say([{ who: 'Deurman', text: pick(['Spelen! Dansen! Handtekeningen!', 'Deur. Open. Dicht. Open. FEEST!', 'Ik ben jullie grootste fan. Van alles.', 'Hebben jullie een pen? Ik wil een handtekening.', 'Kies een kast. Nu. Het is een feestje!']) }]);
  }
  // een duel is gespeeld: hij verdwijnt
  async endTakeover() {
    if (!this.takeover) return; TAKEOVER = null; this.takeover = false; const a = this.a; const gp = this.m.group.position;
    await a.say([{ who: 'Deurman', text: 'Goed gespeeld.' }, { who: 'Deurman', text: 'Hier. Mijn deurknop. Als cadeautje. Tot de volgende keer!' }]);
    if (!S.settings.flashFree) ui.flash('#ffd0ec', 400);
    audio.sfx('tada'); audio.sfx('cheer'); audio.sfx('kazoo');
    a.fx.burst(gp.x, gp.y + 2, gp.z, { count: 90, colors: CONFETTI, speed: 8, size: 0.45, life: 1.3 });
    this.state = 'banished'; this.stT = 0; this.kT = 0; this.m.pose = 'dance'; if (this.takeLabel) this.takeLabel.visible = false;
    S.coins += 40; S.totalEarned += 40; S.banished = (S.banished || 0) + 1; giveSticker('dansen'); persist();
    ui.hud.toast('Hal teruggewonnen! +40 heitjes. De Deurman danst weg...', 3500); ui.setVignette(0); ui.hud.setHint(null);
    a.king.group.visible = true; audio.music('concert');
    this.timer = rand(300, 480);
  }
}
