import * as THREE from 'three';
import { makeDeurman } from '../engine/chars.js';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { scare } from '../engine/scare.js';
import { S, persist } from '../save.js';
import { groundY } from './terrain.js';
import { clamp, rand, pick, lerp, h } from '../engine/util.js';
import { DEURMAN_HINTS } from './story.js';

// De Deurman in de dorpswereld: deuren kraken open, hij staat in de opening, en als je te dichtbij komt volgt hij je.
// Verjaag hem met je lantaarn (houd B / G / Shift vast en richt op hem).
export class HubDeurman {
  constructor(hub) {
    this.hub = hub; this.scene = hub.scene;
    this.m = makeDeurman(1.0); this.m.group.visible = false; this.scene.add(this.m.group);
    this.state = 'idle'; this.timer = 55; this.door = null; this.banish = 0; this.t = 0; this.stT = 0; this.hb = 0; this.tele = 6; this.hinted = 0;
    this.bar = h('div', { class: 'hud-deur', style: { display: 'none' } }, h('div', { class: 'lbl' }, '👁️ De Deurman'), h('div', { class: 'bar' }, h('i')));
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
    this.placeAtDoor(door); this.m.group.visible = true; this.m.glitch = 0.4;
    if (!silent) { audio.sfx('creak'); ui.hud.toast('Een deur kraakt open...', 2000); }
    S.sightings++;
  }
  reset(timer = 80) { this.state = 'idle'; this.m.group.visible = false; this.timer = timer; this.banish = 0; this.bar.style.display = 'none'; ui.setVignette(0); audio.music(this.hub.musicName()); ui.hud.setPrompt(null); this.hub.chaseLight = false; }

  nearestPlayer() {
    let best = null, bd = 1e9; for (const p of this.hub.players) { const d = Math.hypot(p.x - this.m.group.position.x, p.z - this.m.group.position.z); if (d < bd) { bd = d; best = p; } } return { p: best, d: bd };
  }
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
      this.timer -= dt * (1 + night * 1.4) * (lvl === 3 ? 1.5 : lvl === 1 ? 0.55 : 1);
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
    else if (this.state === 'banished') {
      this.stT += dt; m.glitch = 0.1; m.group.scale.setScalar(Math.max(0.01, 1 - this.stT * 1.4));
      if (this.stT > 0.8) { m.group.scale.setScalar(1); if (this.door) this.closeDoor(); else this.reset(rand(70, 120)); }
    }
    m.update(dt);
  }
  closeDoor() { this.state = 'closing'; this.stT = 0; this.m.group.visible = false; ui.hud.setPrompt(null); }
  startChase() {
    this.state = 'chase'; this.stT = 0; this.banish = 0; this.tele = 6;
    audio.sfx('drone'); audio.sfx('static'); audio.music('tense'); ui.hud.toast('De Deurman heeft jullie gezien!', 2200);
    this.bar.style.display = 'block'; if (this.hinted < 2) { ui.hud.setPrompt('Houd <b>G</b> / <b>Shift</b> vast en richt je lantaarn op hem!'); this.hinted++; }
    this.hub.chaseLight = true; this.m.glitch = 0.5;
    if (this.door) { this.door.leaf.rotation.y = -1.75; }
  }
  updateChase(dt) {
    const m = this.m; const lvl = this.level(); this.stT += dt;
    const { p, d } = this.nearestPlayer(); const gp = m.group.position;
    m.faceDir(p.x - gp.x, p.z - gp.z);
    const n = this.lit();
    if (n > 0) {
      this.banish += dt * (n > 1 ? 0.62 : 0.4); m.speed = 0; m.glitch = 0.08;
      if (Math.random() < 0.1) audio.sfx('static', { vol: 0.5 });
      this.hub.fx.emit(gp.x + rand(-.4, .4), gp.y + rand(0.5, 3), gp.z + rand(-.4, .4), 0, 1, 0, { life: 0.6, size: 0.25, color: 0xfff6c0, gravity: 0 });
    } else {
      this.banish = Math.max(0, this.banish - dt * 0.22);
      const sp = 2.9 + (lvl === 3 ? 1.0 : lvl === 1 ? -0.9 : 0) + this.hub.sky.night * 0.5 + Math.min(1.2, this.stT * 0.02);
      const dx = p.x - gp.x, dz = p.z - gp.z; const dd = Math.hypot(dx, dz) || 1;
      gp.x += dx / dd * sp * dt; gp.z += dz / dd * sp * dt; m.speed = 1;
      this.tele -= dt;
      if (lvl >= 2 && d > 28 && this.tele <= 0) {
        // hij verschijnt ineens dichterbij (klassieke Deurman-streek)
        const ang = Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw)) + Math.PI + rand(-0.6, 0.6); const nx = p.x + Math.sin(ang) * 15, nz = p.z + Math.cos(ang) * 15;
        gp.x = nx; gp.z = nz; m.glitch = 0.4; audio.sfx('static'); audio.sfx('creak', { vol: 0.5 }); this.tele = 9;
      }
    }
    gp.y = groundY(gp.x, gp.z);
    this.bar.querySelector('i').style.width = clamp(this.banish * 100, 0, 100) + '%';
    ui.setVignette(clamp((24 - d) / 24, 0, 0.85) * (n > 0 ? 0.6 : 1));
    this.hb -= dt; if (this.hb <= 0) { audio.sfx('heartbeat', { vol: 0.6 + 0.4 * clamp(1 - d / 24, 0, 1) }); this.hb = lerp(0.4, 1.2, clamp(d / 30, 0, 1)); }
    if (this.banish >= 1) { this.doBanish(); return; }
    if (d < 1.9) { this.doCaught(p); return; }
    if (this.stT > 70) { ui.hud.toast('De Deurman verdwijnt in de mist...'); this.endChase(); this.closeOrReset(); }
  }
  endChase() { this.bar.style.display = 'none'; ui.setVignette(0); audio.music(this.hub.musicName()); ui.hud.setPrompt(null); this.hub.chaseLight = false; }
  closeOrReset() { this.m.group.visible = false; this.state = 'idle'; this.timer = rand(60, 100); this.door && (this.door.leaf.rotation.y = 0, this.door.open = 0); this.door = null; }
  doBanish() {
    this.endChase(); const gp = this.m.group.position;
    this.state = 'banished'; this.stT = 0; ui.flash('#fff', 350); audio.sfx('sparkle'); audio.sfx('bell'); audio.sfx('creak', { rate: 0.5 });
    this.hub.fx.burst(gp.x, gp.y + 2, gp.z, { count: 60, colors: [0xffffff, 0xfff0a0, 0xff4a4a], speed: 7, size: 0.4, life: 1.1 });
    this.hub.pickups.drop(gp.x, gp.z, 12, 6, 2);
    S.sightings; ui.hud.toast('Deurman verjaagd! Er vallen heitjes uit zijn jas...', 2800);
    S.banished = (S.banished || 0) + 1; persist();
  }
  async doCaught(p) {
    this.endChase(); this.state = 'caught'; const lvl = this.level();
    if (lvl >= 2) await scare.jumpscare(); else { audio.sfx('scareSoft'); ui.flash('#000', 500); }
    const lose = Math.min(S.coins, lvl === 3 ? 25 : lvl === 1 ? 5 : 15);
    if (lose > 0) { S.coins -= lose; this.hub.pickups.drop(p.x, p.z, lose, 8, 2.5); ui.hud.toast(`De Deurman greep ${lose} heitjes! Raap ze snel weer op...`, 3200); }
    else ui.hud.toast('Gelukkig had je geen heitjes om te verliezen...', 2500);
    persist();
    this.m.group.visible = false; this.m.group.scale.setScalar(1); this.state = 'idle'; this.timer = rand(70, 110);
    if (this.door) { this.door.leaf.rotation.y = 0; this.door.open = 0; this.door = null; }
    this.hub.onCoinsChanged();
  }
}
