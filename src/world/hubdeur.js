import * as THREE from 'three';
import { makeDeurman } from '../engine/chars.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { scare } from '../engine/scare.js';
import { giveSticker } from '../engine/cameo.js';
import { S, persist } from '../save.js';
import { groundY } from './terrain.js';
import { clamp, rand, pick, h } from '../engine/util.js';

// De Deurman in het dorp (meme-mascotte): deuren gaan open, hij staat in de opening te zwaaien, en als je te dichtbij komt
// RENT/GLIJDT hij op je af voor een HIGH-FIVE (of handtekening). Je selfie-licht (houd B / G / Shift vast en richt op hem, de oude 'lantaarn')
// laat hem blozen: hij danst giechelend weg en laat heitjes vallen. Gepakt worden = high-five: beloning of onschuldige grap, nooit een straf.
// Staten (hub.js leest 'door' en 'chase'): idle | door | closing | chase | banished (= wegdansen) | caught
const OUTFITS = ['fan', 'feest', 'cool', 'sjiek', 'dj'];
const CONFETTI = [0xff4aa8, 0xffe14a, 0x4ac8ff, 0x7bff7b, 0xb06aff];

export class HubDeurman {
  constructor(hub) {
    this.hub = hub; this.scene = hub.scene;
    this.m = makeDeurman(1.35, { outfit: 'fan' }); this.m.group.visible = false; this.scene.add(this.m.group);
    this.state = 'idle'; this.timer = 55; this.door = null; this.banish = 0; this.t = 0; this.stT = 0; this.sq = 0; this.tele = 6; this.hinted = 0; this.slideT = 3; this.sliding = 0; this.snapT = 0;
    this.bar = h('div', { class: 'hud-deur', style: { display: 'none' } }, h('div', { class: 'lbl' }, '🤳 Selfie-licht: laat hem blozen'), h('div', { class: 'bar' }, h('i')));
    ui.hudEl.append(this.bar);
  }
  get active() { return this.state !== 'idle'; }
  level() { return S.settings.scare; }
  cleanup() { this.bar.remove(); this.scene.remove(this.m.group); }

  pickDoor() {
    const mid = this.hub.mid; const c = [];
    for (const d of this.hub.W.doors) {
      if (!d.leaf) continue; const dist = Math.hypot(d.x - mid.x, d.z - mid.z);
      if (dist > 22 && dist < 65) c.push(d);
    }
    return c.length ? pick(c) : null;
  }
  placeAtDoor(d) {
    const nx = Math.sin(d.yaw), nz = Math.cos(d.yaw);
    this.m.group.position.set(d.x + nx * 0.4, groundY(d.x, d.z), d.z + nz * 0.4); this.m.targetYaw = this.m.yaw = d.yaw; this.m.group.rotation.y = d.yaw;
  }
  show(door, { seconds = 12, chase = true, silent = false } = {}) {
    if (!door) return; this.door = door; this.door.open = this.door.open || 0; this.state = 'door'; this.stT = 0; this.openFor = seconds; this.chaseAllowed = chase;
    const m = this.m; m.setOutfit(pick(OUTFITS)); m.pose = 'wave'; m.blush = 0; m.speed = 0; m.group.scale.setScalar(1);
    this.placeAtDoor(door); m.group.visible = true; m.glitch = 0.4;
    if (!silent) { audio.sfx('doorbell'); ui.hud.toast('Een deur gaat open... wie staat daar?', 2200); }
    S.sightings++;
  }
  reset(timer = 80) { this.state = 'idle'; this.m.group.visible = false; this.timer = timer; this.banish = 0; this.bar.style.display = 'none'; ui.setVignette(0); audio.music(this.hub.musicName()); ui.hud.setPrompt(null); this.hub.chaseLight = false; }

  nearestPlayer() {
    let best = null, bd = 1e9; for (const p of this.hub.players) { const d = Math.hypot(p.x - this.m.group.position.x, p.z - this.m.group.position.z); if (d < bd) { bd = d; best = p; } } return { p: best, d: bd };
  }
  // hoeveel spelers schijnen hem met hun selfie-licht aan
  lit() {
    let n = 0; const gp = this.m.group.position;
    for (const p of this.hub.players) {
      if (!p.lantern) continue; const dx = gp.x - p.x, dz = gp.z - p.z; const d = Math.hypot(dx, dz); if (d > 24) continue;
      const dirx = Math.sin(p.yaw), dirz = Math.cos(p.yaw); const dot = (dx * dirx + dz * dirz) / (d || 1);
      if (dot > 0.72) n++;
    }
    return n;
  }
  update(dt) {
    this.t += dt; const m = this.m; const lvl = this.level();
    if (lvl === 0 && this.state === 'idle') return;
    if (this.state === 'idle') {
      if (this.hub.busy || scare.active || this.hub.cinematic) return;
      const night = this.hub.sky.night;
      this.timer -= dt * (1 + night * 0.6) * (lvl === 3 ? 1.6 : lvl === 1 ? 0.55 : 1);
      if (this.timer <= 0) { const d = this.pickDoor(); if (d) this.show(d, { seconds: 12 + Math.random() * 6, chase: true }); else this.timer = 8; }
      return;
    }
    m.speed = 0;
    if (this.state === 'door') {
      this.stT += dt; const d = this.door;
      d.open = Math.min(1, (d.open || 0) + dt * 0.7); d.leaf.rotation.y = -1.75 * d.open;
      const { d: dist } = this.nearestPlayer();
      m.faceDir(this.hub.mid.x - m.group.position.x, this.hub.mid.z - m.group.position.z);
      if (this.chaseAllowed && this.stT > 1.8 && dist < 11 && lvl >= 1) this.startChase();
      else if (this.stT > this.openFor) { this.closeDoor(); }
    } else if (this.state === 'closing') {
      this.stT += dt; const d = this.door; d.open = Math.max(0, d.open - dt * 1.6); d.leaf.rotation.y = -1.75 * d.open;
      if (d.open <= 0) { audio.sfx('door'); this.door = null; this.reset(rand(60, 110)); }
    } else if (this.state === 'chase') this.updateChase(dt);
    else if (this.state === 'banished') {   // wegdansen en met een 'plop' verdwijnen
      this.stT += dt; m.speed = 0;
      if (this.stT > 1.6) m.group.scale.setScalar(Math.max(0.01, 1 - (this.stT - 1.6) * 2.2));
      if (this.stT > 2.3) { m.group.scale.setScalar(1); m.group.visible = false; if (this.door) this.closeDoor(); else this.reset(rand(70, 120)); }
    }
    m.update(dt);
  }
  closeDoor() { this.state = 'closing'; this.stT = 0; this.m.group.visible = false; ui.hud.setPrompt(null); }
  startChase() {
    this.state = 'chase'; this.stT = 0; this.banish = 0; this.tele = 6; this.slideT = rand(2, 4); this.sliding = 0;
    audio.sfx('slide'); audio.music('deurchase'); ui.hud.toast('De Deurman komt aanrennen voor een HIGH-FIVE!', 2400);
    this.bar.style.display = 'block';
    if (this.hinted < 2) { ui.hud.setPrompt('Houd <b>G</b> / <b>Shift</b> vast en richt je selfie-licht op hem: dan bloost hij en danst hij weg!'); this.hinted++; }
    this.hub.chaseLight = true; this.m.glitch = 0.5; this.m.pose = 'highfive';
    if (this.door) { this.door.leaf.rotation.y = -1.75; }
  }
  updateChase(dt) {
    const m = this.m; const lvl = this.level(); this.stT += dt;
    const { p, d } = this.nearestPlayer(); const gp = m.group.position;
    m.faceDir(p.x - gp.x, p.z - gp.z);
    const n = this.lit();
    if (n > 0) {   // selfie-licht: hij bloost en blijft verlegen staan
      this.banish += dt * (n > 1 ? 0.62 : 0.4); m.speed = 0; m.pose = 'shy'; m.blush = Math.min(1, this.banish * 1.4);
      this.snapT -= dt; if (this.snapT <= 0) { audio.sfx('shutter', { vol: 0.6 }); this.snapT = 0.9; }
      if (Math.random() < 0.3) this.hub.fx.emit(gp.x + rand(-.4, .4), gp.y + rand(1, 3.4), gp.z + rand(-.4, .4), 0, 1, 0, { life: 0.8, size: 0.3, color: Math.random() < 0.5 ? 0xff9ac8 : 0xfff6c0, gravity: 0 });
    } else {
      this.banish = Math.max(0, this.banish - dt * 0.22); m.pose = 'highfive'; m.blush = Math.max(0, m.blush - dt * 0.6);
      // rennen, en af en toe een glijpartij
      this.slideT -= dt; if (this.slideT <= 0 && this.sliding <= 0 && d > 8) { this.sliding = 0.9; this.slideT = rand(4, 7); audio.sfx('slide', { vol: 0.7 }); }
      if (this.sliding > 0) this.sliding -= dt;
      const sp = (2.9 + (lvl === 3 ? 1.0 : lvl === 1 ? -0.9 : 0) + this.hub.sky.night * 0.3 + Math.min(1.2, this.stT * 0.02)) * (this.sliding > 0 ? 1.7 : 1);
      const dx = p.x - gp.x, dz = p.z - gp.z; const dd = Math.hypot(dx, dz) || 1;
      gp.x += dx / dd * sp * dt; gp.z += dz / dd * sp * dt; m.speed = this.sliding > 0 ? 0.2 : 1;
      this.sq -= dt; if (this.sq <= 0 && d < 20) { audio.sfx('squeak', { vol: 0.25, rate: 0.9 + Math.random() * 0.3 }); this.sq = 0.45; }
      this.tele -= dt;
      if (lvl >= 2 && d > 28 && this.tele <= 0) {
        // hij 'plopt' ineens dichterbij met een wolkje confetti
        const ang = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw)) + Math.PI + rand(-0.6, 0.6); const nx = p.x + Math.sin(ang) * 15, nz = p.z + Math.cos(ang) * 15;
        gp.x = nx; gp.z = nz; m.glitch = 0.5; audio.sfx('pop'); this.hub.fx.burst(nx, groundY(nx, nz) + 2, nz, { count: 24, colors: CONFETTI, speed: 4, size: 0.35, life: 0.9 }); this.tele = 9;
      }
    }
    gp.y = groundY(gp.x, gp.z);
    this.bar.querySelector('i').style.width = clamp(this.banish * 100, 0, 100) + '%';
    if (this.banish >= 1) { this.doBanish(); return; }
    if (d < 1.9) { this.doCaught(p); return; }
    if (this.stT > 70) { ui.hud.toast('De Deurman gaat toch maar een pizza halen...'); this.endChase(); this.closeOrReset(); }
  }
  endChase() { this.bar.style.display = 'none'; ui.setVignette(0); audio.music(this.hub.musicName()); ui.hud.setPrompt(null); this.hub.chaseLight = false; }
  closeOrReset() { this.m.group.visible = false; this.state = 'idle'; this.timer = rand(60, 100); this.door && (this.door.leaf.rotation.y = 0, this.door.open = 0); this.door = null; }
  // wegdansen: bloost, giechelt en laat heitjes uit zijn zakken vallen
  startDance() { const m = this.m; this.state = 'banished'; this.stT = 0; m.pose = 'dance'; m.speed = 0; m.blush = 1; }
  doBanish() {
    this.endChase(); const gp = this.m.group.position; this.startDance();
    audio.sfx('kiss'); audio.sfx('tada'); setTimeout(() => audio.sfx('kazoo'), 500);
    if (!S.settings.flashFree) ui.flash('#ffd0ec', 300);
    this.hub.fx.burst(gp.x, gp.y + 2, gp.z, { count: 60, colors: CONFETTI, speed: 7, size: 0.4, life: 1.2 });
    this.hub.pickups.drop(gp.x, gp.z, 12, 6, 2);
    ui.hud.toast('Hihi! De Deurman bloost en danst weg. Er vallen heitjes uit zijn zakken!', 3200);
    S.banished = (S.banished || 0) + 1; giveSticker('selfie'); persist();
  }
  // gepakt = high-five! Beloning of onschuldige grap, nooit heitjes kwijt.
  async doCaught(p) {
    this.endChase(); this.state = 'caught'; const lvl = this.level(); const m = this.m; const gp = m.group.position;
    const kind = pick(['five', 'five', 'hat', 'coins']);
    m.pose = 'highfive'; m.speed = 0;
    if (lvl >= 2) await scare.jumpscare({ variant: 'party', text: kind === 'hat' ? 'HOEDJE!' : 'HIGH FIVE!' });
    audio.sfx('highfive'); audio.sfx('tada'); audio.sfx('cheer');
    this.hub.fx.burst(p.x, 2, p.z, { count: 50, colors: CONFETTI, speed: 6, size: 0.4, life: 1.2 });
    if (kind === 'five') { this.hub.pickups.drop(p.x, p.z, 5, 8, 2.5); ui.hud.toast('HIGH-FIVE! De Deurman is dolgelukkig en gooit 5 heitjes in het rond!', 3400); }
    else if (kind === 'hat') { m.setOutfit(['hat:tophat', 'mustache']); this.hub.pickups.drop(p.x, p.z, 5, 8, 2.5); ui.hud.toast('De Deurman leent heel even jullie hoed... en geeft er 5 heitjes rente bij!', 3600); }
    else { this.hub.pickups.drop(gp.x, gp.z, 5, 6, 2); ui.hud.toast('De Deurman struikelt over zijn eigen benen. Er vallen 5 heitjes uit zijn zak!', 3400); }
    giveSticker('highfive'); persist();
    this.startDance();   // en hij danst weg
    this.hub.onCoinsChanged();
  }
}
