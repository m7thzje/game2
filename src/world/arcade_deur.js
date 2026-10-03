// De Deurman neemt een hal van de Speelhal over (spookmodus):
// waarschuwing (licht flikkert, schermen glitchen) -> vrijstaande deur gaat open -> hij sluipt naar de broers
// -> lantaarn (B/G/Shift vasthouden, richten) verjaagt hem; pakt hij ze, dan zit hij op de troon en wordt de hal overgenomen:
// elk duel krijgt dan de Deurman-twist in spookmodus. Win/speel één duel en hij verdwijnt.
import * as THREE from 'three';
import { makeDeurman } from '../engine/chars.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { input } from '../engine/input.js';
import { scare } from '../engine/scare.js';
import { S, persist } from '../save.js';
import { h, mesh, mat, clamp, lerp, rand, pick, damp } from '../engine/util.js';
import { floatLabel } from './build.js';

let TAKEOVER = null;   // { hall } zolang hij een hal bezet houdt (blijft staan tot een duel gespeeld is)
export const takeoverHall = () => (TAKEOVER ? TAKEOVER.hall : null);
export const clearTakeover = () => { TAKEOVER = null; };

const DZ = -6;   // z van de vrijstaande deur
const RED = new THREE.Color(0xff2a1a);

export class ArcadeDeurman {
  constructor(a) {
    this.a = a; const sc = a.scene;
    this.m = makeDeurman(1.35); this.m.group.visible = false; sc.add(this.m.group);
    // vrijstaande deur (klassiek creepy): kozijn + draaiende deurvleugel + zwarte leegte
    const g = new THREE.Group(); const wood = mat(0x241711, { roughness: 0.9 });
    for (const sx of [-1, 1]) g.add(mesh(new THREE.BoxGeometry(0.5, 8.4, 0.7), wood, { pos: [sx * 2.2, 4.2, 0] }));
    g.add(mesh(new THREE.BoxGeometry(5.0, 0.6, 0.7), wood, { pos: [0, 8.4, 0] }));
    g.add(mesh(new THREE.PlaneGeometry(3.9, 8.1), new THREE.MeshBasicMaterial({ color: 0x000000 }), { cast: false, receive: false, pos: [0, 4.05, -0.05] }));
    this.glowPlane = mesh(new THREE.PlaneGeometry(3.9, 8.1), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0, depthWrite: false }), { cast: false, receive: false, pos: [0, 4.05, -0.02] }); g.add(this.glowPlane);
    this.leaf = new THREE.Group(); this.leaf.position.set(-1.95, 0, 0.2); this.leaf.add(mesh(new THREE.BoxGeometry(3.9, 8.0, 0.22), mat(0x4a2e1a, { roughness: 0.8 }), { pos: [1.95, 4.05, 0] }));
    this.leaf.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat(0xffd23f, { metalness: 0.7 }), { pos: [3.4, 4.0, 0.2] })); g.add(this.leaf);
    g.position.set(0, 0, DZ); g.visible = false; sc.add(g); this.doorG = g;
    // lantaarns (vooraf aangemaakt: geen shader-hercompilatie midden in het spel)
    this.lamps = [0, 1].map(() => { const l = new THREE.PointLight(0xfff0b0, 0, 16, 1.4); sc.add(l); return l; });
    this.cones = [0, 1].map(() => { const c = mesh(new THREE.ConeGeometry(3.2, 9, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), { cast: false, receive: false }); c.visible = false; sc.add(c); return c; });
    this.bar = h('div', { class: 'hud-deur', style: { display: 'none' } }, h('div', { class: 'lbl' }, '👁️ De Deurman'), h('div', { class: 'bar' }, h('i')));
    ui.hudEl.append(this.bar);
    // basiswaarden voor sfeer
    this.base = { hemi: a.hemi.intensity, sun: a.sunL.intensity, lights: a.lights.map((l) => ({ c: l.color.clone(), i: l.intensity })), fog: a.scene.fog ? { near: a.scene.fog.near, far: a.scene.fog.far, c: a.scene.fog.color.clone() } : null, bg: a.scene.background.clone(), flames: a.glows.map((f) => f.material.color.clone()) };
    this.glitchTex = [a.cabTexture('x', true), a.cabTexture('x', true)];
    this.k = 0; this.kT = 0; this.state = 'idle'; this.stT = 0; this.t = 0; this.hb = 0; this.banish = 0; this.hinted = 0; this.glitchT = 0; this.whisperT = 6; this.tele = 8;
    this.timer = rand(95, 170);
    this.takeover = false;
    if (TAKEOVER && TAKEOVER.hall === a.hallId) this.enterTakeover(true);
  }
  get active() { return this.state !== 'idle' && this.state !== 'takeover'; }
  level() { return S.settings.scare; }
  cleanup() { this.bar.remove(); }

  // ---- sfeer: k = 0 (gewoon) .. 1 (volledig spookachtig) ----
  applyMood(dt) {
    this.k = damp(this.k, this.kT, 2.4, dt); const k = this.k; const a = this.a; const b = this.base;
    if (k < 0.003 && this.kT === 0) { if (this.moodOn) { this.moodOn = false; this.setMood(0); } return; }
    this.moodOn = true; this.setMood(k);
    // flikkeren
    const fl = k > 0.05 ? (Math.sin(this.t * 31) * Math.sin(this.t * 17.3) > 0.55 ? 0.15 : 1) : 1;
    a.hemi.intensity = lerp(b.hemi, 0.3, k) * (k > 0.3 ? fl : 1);
    a.sunL.intensity = lerp(b.sun, 0.15, k) * (k > 0.3 ? fl : 1);
    this.glowPlane.material.opacity = (this.doorG.visible ? 0.25 + 0.15 * Math.sin(this.t * 3) : 0) * k;
    // schermen: glitch-gezichtjes
    this.glitchT -= dt;
    if (this.glitchT <= 0 && k > 0.2) {
      this.glitchT = lerp(1.4, 0.25, k); const n = this.takeover ? a.cabs.length : 1 + Math.floor(k * 3);
      for (const c of a.cabs) { const orig = c.scr.userData.orig || (c.scr.userData.orig = c.scr.material.map); c.scr.material.map = orig; }
      for (let i = 0; i < n; i++) { const c = pick(a.cabs); c.scr.userData.orig = c.scr.userData.orig || c.scr.material.map; c.scr.material.map = pick(this.glitchTex); }
      for (const c of a.cabs) c.scr.material.needsUpdate = true;
      if (Math.random() < 0.5) audio.sfx('static', { vol: 0.35 });
    }
    // gefluister
    this.whisperT -= dt; if (this.whisperT <= 0 && k > 0.3) { this.whisperT = rand(3, 7); audio.sfx(Math.random() < 0.5 ? 'creak' : 'knock', { vol: 0.35 }); }
    // schudden bij hartslag
    if (this.state === 'stalk') a.camShake = Math.max(a.camShake || 0, 0.04 * k);
  }
  setMood(k) {
    const a = this.a; const b = this.base; const col = new THREE.Color();
    a.lights.forEach((l, i) => { l.color.copy(b.lights[i].c).lerp(RED, k); l.intensity = b.lights[i].i * (1 - 0.5 * k); });
    if (a.scene.fog && b.fog) { a.scene.fog.near = lerp(b.fog.near, 14, k); a.scene.fog.far = lerp(b.fog.far, 62, k); a.scene.fog.color.copy(b.fog.c).lerp(col.set(0x1a0404), k); }
    a.scene.background.copy(b.bg).lerp(col.set(0x1a0404), k);
    a.glows.forEach((f, i) => f.material.color.copy(b.flames[i]).lerp(col.set(0x40ff70), k));
    if (k === 0) { a.hemi.intensity = b.hemi; a.sunL.intensity = b.sun; for (const c of a.cabs) { if (c.scr.userData.orig) { c.scr.material.map = c.scr.userData.orig; c.scr.material.needsUpdate = true; } } }
  }

  // ---- levenscyclus ----
  async warn() {
    this.state = 'warn'; this.stT = 0; this.kT = 0.55; audio.music('tense'); audio.sfx('drone');
    ui.hud.toast('Het licht flikkert... het wordt ijskoud in de hal.', 3200);
    ui.hud.setPrompt(null);
  }
  openDoor() {
    this.state = 'door'; this.stT = 0; this.kT = 0.8; this.doorG.visible = true; this.leaf.rotation.y = 0;
    audio.sfx('creak'); audio.sfx('static');
    this.a.camOverride = { x: 0, z: DZ + 2, t: 3.4 };
    const gp = this.m.group.position; gp.set(0, 0, DZ + 0.3); this.m.targetYaw = this.m.yaw = 0; this.m.group.rotation.y = 0; this.m.group.visible = true; this.m.glitch = 0.5; this.m.speed = 0;
    S.sightings = (S.sightings || 0) + 1;
    ui.hud.toast('Een deur... midden in de hal. En er staat iemand in.', 3200);
  }
  startStalk() {
    this.state = 'stalk'; this.stT = 0; this.banish = 0; this.tele = 7; this.kT = 1;
    this.bar.style.display = 'block'; audio.music('tense'); audio.sfx('scareSoft');
    if (this.hinted < 2) { ui.hud.setPrompt('Houd <b>G</b> / <b>Shift</b> vast en richt je lantaarn op hem!'); this.hinted++; }
    ui.hud.toast('De Deurman komt op jullie af!', 2200);
  }
  nearest() { let best = null, bd = 1e9; for (const p of this.a.players) { const d = Math.hypot(p.x - this.m.group.position.x, p.z - this.m.group.position.z); if (d < bd) { bd = d; best = p; } } return { p: best, d: bd }; }
  lit() {
    let n = 0; const gp = this.m.group.position;
    for (const p of this.a.players) {
      if (!input.p[p.i].b) continue; const dx = gp.x - p.x, dz = gp.z - p.z; const d = Math.hypot(dx, dz); if (d > 22) continue;
      const dot = (dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw)) / (d || 1); if (dot > 0.7) n++;
    }
    return n;
  }
  lanterns(dt) {
    for (const p of this.a.players) {
      const on = (this.state === 'stalk' || this.state === 'door') && input.p[p.i].b; const l = this.lamps[p.i]; const c = this.cones[p.i];
      l.intensity = damp(l.intensity, on ? 220 : 0, 14, dt); const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
      l.position.set(p.x + fx * 3, 2.2, p.z + fz * 3);
      c.visible = on; if (on) { c.material.opacity = 0.16; c.position.set(p.x + fx * 4.5, 1.6, p.z + fz * 4.5); c.rotation.set(Math.PI / 2, 0, 0); c.lookAt(p.x + fx * 20, 1.6, p.z + fz * 20); c.rotateX(-Math.PI / 2); }
    }
  }
  update(dt) {
    this.t += dt; const a = this.a; const m = this.m; const lvl = this.level();
    this.applyMood(dt); this.lanterns(dt);
    if (this.state === 'idle') {
      if (lvl <= 0 || a.busy || scare.active || a.leaving || a.picker || a.modal || a.menu || a.hasTourney()) return;
      this.timer -= dt * (lvl === 3 ? 1.5 : lvl === 1 ? 0.6 : 1);
      if (this.timer <= 0) this.warn();
      return;
    }
    if (this.state === 'takeover') { m.update(dt); this.takeoverAnim(dt); return; }
    if (this.state === 'warn') { this.stT += dt; if (this.stT > 5.5) this.openDoor(); }
    else if (this.state === 'door') {
      this.stT += dt; this.leaf.rotation.y = -1.75 * clamp(this.stT / 1.6, 0, 1);
      m.faceDir(0, 1); m.glitch = 0.3;
      if (this.stT > 3.4) this.startStalk();
    } else if (this.state === 'stalk') this.updateStalk(dt);
    else if (this.state === 'banished') {
      this.stT += dt; m.glitch = 0.1; m.group.scale.setScalar(Math.max(0.01, 1 - this.stT * 1.4));
      if (this.stT > 0.8) { m.group.visible = false; m.group.scale.setScalar(1); this.finish(); }
    }
    m.update(dt);
  }
  updateStalk(dt) {
    const m = this.m; const lvl = this.level(); this.stT += dt;
    const { p, d } = this.nearest(); const gp = m.group.position; m.faceDir(p.x - gp.x, p.z - gp.z);
    const n = this.lit();
    if (n > 0) {
      this.banish += dt * (n > 1 ? 0.7 : 0.42); m.speed = 0; m.glitch = 0.08;
      if (Math.random() < 0.1) audio.sfx('static', { vol: 0.5 });
      this.a.fx.emit(gp.x + rand(-.4, .4), gp.y + rand(0.5, 3), gp.z + rand(-.4, .4), 0, 1, 0, { life: 0.6, size: 0.25, color: 0xfff6c0, gravity: 0 });
    } else {
      this.banish = Math.max(0, this.banish - dt * 0.2);
      const sp = 2.3 + (lvl === 3 ? 0.9 : lvl === 1 ? -0.7 : 0) + Math.min(1.1, this.stT * 0.03);
      const dx = p.x - gp.x, dz = p.z - gp.z; const dd = Math.hypot(dx, dz) || 1; gp.x += dx / dd * sp * dt; gp.z += dz / dd * sp * dt; m.speed = 1;
      this.tele -= dt;
      if (lvl >= 2 && d > 16 && this.tele <= 0) { const ang = Math.atan2(p.x - gp.x, p.z - gp.z) + rand(-0.6, 0.6); gp.x = p.x - Math.sin(ang) * 9; gp.z = p.z - Math.cos(ang) * 9; m.glitch = 0.4; audio.sfx('static'); audio.sfx('creak', { vol: 0.5 }); this.tele = 10; }
    }
    this.bar.querySelector('i').style.width = clamp(this.banish * 100, 0, 100) + '%';
    ui.setVignette(clamp((20 - d) / 20, 0, 0.8) * (n > 0 ? 0.6 : 1));
    this.hb -= dt; if (this.hb <= 0) { audio.sfx('heartbeat', { vol: 0.6 + 0.4 * clamp(1 - d / 20, 0, 1) }); this.hb = lerp(0.4, 1.2, clamp(d / 26, 0, 1)); }
    if (this.banish >= 1) { this.doBanish(); return; }
    if (d < 1.9) { this.doCaught(); return; }
    if (this.stT > 65) { ui.hud.toast('De Deurman verdwijnt in de mist...', 2500); this.m.group.visible = false; this.finish(); }
  }
  endAtmos() { this.bar.style.display = 'none'; ui.setVignette(0); ui.hud.setPrompt(null); for (const l of this.lamps) l.intensity = 0; for (const c of this.cones) c.visible = false; }
  finish() {   // terug naar gewoon
    this.endAtmos(); this.state = 'idle'; this.kT = 0; this.timer = rand(240, 420); this.doorG.visible = false; this.m.group.visible = false; audio.music('concert');
  }
  doBanish() {
    this.endAtmos(); const gp = this.m.group.position; this.state = 'banished'; this.stT = 0; this.kT = 0;
    ui.flash('#fff', 350); audio.sfx('sparkle'); audio.sfx('bell'); audio.sfx('creak', { rate: 0.5 });
    this.a.fx.burst(gp.x, gp.y + 2, gp.z, { count: 60, colors: [0xffffff, 0xfff0a0, 0xff4a4a], speed: 7, size: 0.4, life: 1.1 });
    S.coins += 15; S.totalEarned += 15; S.banished = (S.banished || 0) + 1; persist(); ui.hud.toast('Deurman verjaagd! +15 heitjes uit zijn jas gevallen.', 3000);
  }
  async doCaught() {
    this.endAtmos(); this.state = 'caught'; const lvl = this.level();
    if (lvl >= 2) await scare.jumpscare(); else { audio.sfx('scareSoft'); ui.flash('#000', 500); }
    TAKEOVER = { hall: this.a.hallId }; this.enterTakeover(false);
    await this.a.say([{ who: 'Deurman', text: '...Mijn hal nu.', creepy: true }, { who: 'Wes', text: 'Wat?! Hij zit op de troon!' }, { who: 'Jor', text: 'Alle schermen kijken naar ons...' }, { who: 'Deurman', text: '...Speel. Eén duel. Dan ga ik misschien weg.', creepy: true }]);
  }
  // hij zit op de troon, de hal is overgenomen
  enterTakeover(silent) {
    const a = this.a; this.state = 'takeover'; this.takeover = true; this.kT = 1; this.k = silent ? 1 : this.k; this.doorG.visible = false; this.bar.style.display = 'none';
    a.king.group.visible = false; const m = this.m; m.group.visible = true; m.group.scale.setScalar(1.15);
    m.group.position.set(0, 1.9, a.hostZ); m.targetYaw = m.yaw = 0; m.group.rotation.y = 0; m.speed = 0; m.glitch = 0.15;
    audio.music('tense'); ui.hud.setHint('De Deurman heeft de hal overgenomen! Speel één duel (in spookmodus) om hem te verjagen.'); this.hintT = 1;
    if (!this.takeLabel) { this.takeLabel = floatLabel('👁️ De Deurman', 'heeft de hal overgenomen', '#ff5a5a'); this.takeLabel.position.set(0, 8, a.hostZ); a.scene.add(this.takeLabel); }
    this.takeLabel.visible = true;
  }
  takeoverAnim(dt) {
    const m = this.m; const a = this.a;
    m.group.position.y = 1.9 + Math.sin(this.t * 1.3) * 0.08; m.group.rotation.y = Math.sin(this.t * 0.5) * 0.35; m.glitch = 0.05 + (Math.sin(this.t * 7) > 0.96 ? 0.5 : 0);
    // schimmen: hij kijkt naar degene die het dichtst bij staat
    const { p } = this.nearest(); m.faceDir(p.x - m.group.position.x, p.z - m.group.position.z);
    this.hb -= dt; if (this.hb <= 0) { audio.sfx('heartbeat', { vol: 0.35 }); this.hb = 1.6; }
    ui.setVignette(0.25 + 0.08 * Math.sin(this.t * 2));
    a.disco.rotation.y -= dt * 2.4;
  }
  async talk() {
    await this.a.say([{ who: 'Deurman', creepy: true, text: pick(['...Spelen.', '...Deur. Open. Dicht. Open.', '...Ik mag jullie wel. Dat is het enge.', '...Hebben jullie handtekeningen?', '...Kiezen. Een kast. Nu.']) }]);
  }
  // een duel is gespeeld: hij verdwijnt
  async endTakeover() {
    if (!this.takeover) return; TAKEOVER = null; this.takeover = false; const a = this.a; const gp = this.m.group.position;
    await a.say([{ who: 'Deurman', creepy: true, text: '...Goed gespeeld.' }, { who: 'Deurman', creepy: true, text: '...Hier. Mijn deurknop.' }]);
    ui.flash('#fff', 400); audio.sfx('sparkle'); audio.sfx('bell'); audio.sfx('creak', { rate: 0.5 });
    a.fx.burst(gp.x, gp.y + 2, gp.z, { count: 90, colors: [0xffffff, 0xfff0a0, 0xff4a4a, 0x40ff70], speed: 8, size: 0.45, life: 1.3 });
    this.state = 'banished'; this.stT = 0; this.kT = 0; if (this.takeLabel) this.takeLabel.visible = false;
    S.coins += 40; S.totalEarned += 40; S.banished = (S.banished || 0) + 1; persist();
    ui.hud.toast('Hal teruggewonnen! +40 heitjes. De Deurman verdwijnt...', 3500); ui.setVignette(0); ui.hud.setHint(null);
    a.king.group.visible = true; audio.music('concert');
    this.timer = rand(300, 480); setTimeout(() => { this.m.group.scale.setScalar(1); }, 1200);
  }
}
