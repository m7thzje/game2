// Extra's in de hallen: Feestbord-tafel (Mario Party), Vriendenboek-standaard en de GEHEIME deur naar de Deurenhal (hal 0).
// De hal (ArcadeMode) roept dit aan; alles statisch gaat via de Deco (samengevoegd), alleen dobbelstenen/deurblad zijn dynamisch.
import * as THREE from 'three';
import { audio } from '../engine/audio.js';
import { ui } from '../engine/ui.js';
import { S, persist } from '../save.js';
import { stickers, isUnlocked, DEUR_HALL_STICKERS } from '../engine/progress.js';
import { stickerCount, STICKERS } from '../engine/cameo.js';
import { PLAYER_COLORS } from '../engine/chars.js';
import { canvasTex, TAU, mesh, mat, rand, damp } from '../engine/util.js';
import { floatLabel } from './build.js';
import { Deco } from './arcade_deco.js';

const PI = Math.PI;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const p = (i) => 'p' + (((i % 3) + 3) % 3);

// ---------------------------------------------------------------- FEESTBORD-TAFEL
export function buildPartyTable(a, x, z) {
  const D = a.D, sc = a.scene; const gold = 0xe8b82a;
  for (let i = 0; i < 4; i++) { const an = i / 4 * TAU + PI / 4; D.cyl(0.22, 0.3, 1.3, 8, x + Math.cos(an) * 2.6, 0.65, z + Math.sin(an) * 2.6, [0xd8372c, 0x2f6fe0, 0x2fae5b, 0xffd23f][i]); }
  D.cyl(3.9, 3.9, 0.4, 30, x, 1.3, z, 0xd8372c); D.cyl(3.75, 3.75, 0.12, 30, x, 1.56, z, 0xffd23f, { kind: 'metal' });
  for (let i = 0; i < 28; i++) { const an = i / 28 * TAU; D.sph(0.13, x + Math.cos(an) * 3.85, 1.6, z + Math.sin(an) * 3.85, 0xfff0a0, { kind: p(i) }, 5); }
  // bordspel-tekening: een lus van gekleurde vakjes met een ster in het midden
  const t = canvasTex(512, 512, (g, w) => {
    const m = w / 2; g.fillStyle = '#3a1a60'; g.beginPath(); g.arc(m, m, m, 0, TAU); g.fill(); const gr = g.createRadialGradient(m, m, 10, m, m, m); gr.addColorStop(0, '#7a3ac8'); gr.addColorStop(1, '#2a1050'); g.fillStyle = gr; g.beginPath(); g.arc(m, m, m - 6, 0, TAU); g.fill();
    const cs = ['#3a9aff', '#3a9aff', '#ff4a6a', '#4ad86a', '#3a9aff', '#ffd23f']; for (let i = 0; i < 24; i++) { const an = i / 24 * TAU; const cx = m + Math.cos(an) * 205, cy = m + Math.sin(an) * 205; g.fillStyle = i === 0 ? '#ffd23f' : cs[i % 6]; g.beginPath(); g.arc(cx, cy, 25, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke(); }
    for (let i = 0; i < 12; i++) { const an = i / 12 * TAU + 0.26; g.fillStyle = ['#ff7ab0', '#5ad8ff', '#ffe14a'][i % 3]; g.beginPath(); g.arc(m + Math.cos(an) * 120, m + Math.sin(an) * 120, 14, 0, TAU); g.fill(); }
    g.fillStyle = '#ffd23f'; g.beginPath(); for (let i = 0; i < 10; i++) { const rr = i % 2 ? 36 : 82, an = i * PI / 5 - PI / 2; g.lineTo(m + Math.cos(an) * rr, m + Math.sin(an) * rr); } g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fff'; g.font = 'bold 44px Fredoka, Arial Black'; g.textAlign = 'center'; g.fillText('FEESTBORD', m, m + 150);
  });
  sc.add(mesh(new THREE.CircleGeometry(3.6, 40), new THREE.MeshBasicMaterial({ map: t }), { cast: false, receive: false, pos: [x, 1.64, z], rot: [-PI / 2, 0, 0] }));
  // pionnen van Wes en Jor, een gouden ster-trofee en confetti-vlag
  [[0.6, 0], [3.4, 1]].forEach(([an0, i]) => { const px = x + Math.cos(an0) * 2.8, pz = z + Math.sin(an0) * 2.8; D.cyl(0.12, 0.28, 0.5, 10, px, 1.9, pz, PLAYER_COLORS[i]); D.sph(0.2, px, 2.3, pz, PLAYER_COLORS[i], null, 8); D.sph(0.06, px, 2.38, pz + 0.17, 0xffffff, null, 4); });
  D.sph(0.6, x, 2.7, z, gold, { kind: 'metal' }, 8); for (let i = 0; i < 8; i++) { const an = i / 8 * TAU; D.cone(0.2, 0.9, 4, x + Math.cos(an) * 0.8, 2.7 + Math.sin(an) * 0.8, z, gold, { kind: 'metal', rz: an - PI / 2 }); } D.cyl(0.3, 0.4, 0.8, 8, x, 1.95, z, gold, { kind: 'metal' });
  for (const sx of [-1, 1]) { D.cyl(0.08, 0.08, 7.4, 6, x + sx * 4.6, 3.7, z - 1.6, 0xcfa060); D.sph(0.24, x + sx * 4.6, 7.5, z - 1.6, 0xffd23f, { kind: 'glow' }, 6); D.tri(2.6, 1.4, x + sx * 4.6 + sx * 1.3, 7.2, z - 1.6, sx > 0 ? 0xd8372c : 0x2f6fe0, { kind: 'dbl', rz: PI / 2 }); D.tri(1.9, 1.0, x + sx * 4.6 + sx * 0.95, 5.9, z - 1.6, 0xffd23f, { kind: 'dbl', rz: PI / 2 }); }
  // dobbelstenen (dynamisch, dobberen en tollen)
  a.dice = [0, 1].map((i) => { const g = new THREE.Group(); g.userData.dynamic = true; const R = new Deco(); R.box(0.7, 0.7, 0.7, 0, 0, 0, 0xffffff);
    const pips = (face) => { const P = { 1: [[0, 0]], 2: [[-0.18, -0.18], [0.18, 0.18]], 3: [[-0.2, -0.2], [0, 0], [0.2, 0.2]], 4: [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]], 5: [[-0.2, -0.2], [0.2, -0.2], [0, 0], [-0.2, 0.2], [0.2, 0.2]], 6: [[-0.18, -0.22], [0.18, -0.22], [-0.18, 0], [0.18, 0], [-0.18, 0.22], [0.18, 0.22]] }[face]; return P; };
    for (const [n, fn] of [[1, (u, v) => [u, v, 0.36]], [6, (u, v) => [u, v, -0.36]], [2, (u, v) => [0.36, v, u]], [5, (u, v) => [-0.36, v, u]], [3, (u, v) => [u, 0.36, v]], [4, (u, v) => [u, -0.36, v]]]) for (const [u, v] of pips(n)) { const [px, py, pz] = fn(u, v); R.sph(0.065, px, py, pz, 0x14102a, null, 4); }
    R.build(g); g.scale.setScalar(1.35); g.position.set(x - 1.1 + i * 2.2, 2.2, z + 1.6 - i * 0.6); sc.add(g); return { g, ph: i * 2.1 }; });
  const lb = floatLabel('🎲 Feestbord', 'Mario Party voor twee!', '#ff9aef'); lb.scale.set(4.4, 1.4, 1); lb.position.set(x, 9.0, z); sc.add(lb);
  a.colliders.push({ x, z, r: 3.9 });
  a.interact.push({ type: 'party', x, z: z + 5.2, r: 3.4, label: '🎲 Feestbord (Mario Party)' });
  (a.extraUpd ||= []).push((dt, t) => a.dice.forEach((d, i) => { d.g.position.y = 2.25 + Math.abs(Math.sin(t * 1.6 + d.ph)) * 0.35; d.g.rotation.x = t * 1.1 + d.ph; d.g.rotation.y = t * 0.8 + d.ph * 2; d.g.rotation.z = Math.sin(t + d.ph) * 0.4; }));
}

// ---------------------------------------------------------------- VRIENDENBOEK-STANDAARD
export function buildAlbumStand(a, x, z) {
  const D = a.D, sc = a.scene; const gold = 0xe8b82a;
  D.cyl(0.14, 0.2, 1.7, 8, x, 0.85, z, 0x7a2f5a); D.cyl(0.6, 0.7, 0.2, 10, x, 0.1, z, gold, { kind: 'metal' }); D.box(2.0, 0.14, 1.3, x, 1.85, z, 0x7a2f5a, { rx: -0.4 });
  D.box(1.9, 0.1, 1.2, x - 0.02, 1.95, z - 0.02, 0xff6fa5, { rx: -0.4 });   // kaft
  for (const sx of [-1, 1]) D.box(0.9, 0.08, 1.0, x + sx * 0.46, 2.04, z - 0.04, 0xfffaf0, { rx: -0.4, rz: -sx * 0.08 });   // twee bladzijden
  for (let i = 0; i < 4; i++) D.box(0.22, 0.22, 0.02, x - 0.7 + (i % 2) * 1.0 + (i > 1 ? 0.2 : 0), 2.14 + (i > 1 ? 0.05 : 0), z - 0.3 + (i > 1 ? 0.3 : 0), [0xffd23f, 0x5ad8ff, 0xff7ab0, 0x7bff7b][i], { kind: p(i), rx: -0.4 });
  for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; D.sph(0.09, x + Math.cos(an) * 1.5, 0.12, z + Math.sin(an) * 1.5, [0xffd23f, 0x5ad8ff, 0xff7ab0][i % 3], { kind: p(i) }, 5); }
  a.colliders.push({ x, z, r: 0.9 });
  const lb = floatLabel('📒 Vriendenboek', '', '#ffd0ec'); lb.scale.set(4.0, 1.24, 1); lb.position.set(x, 4.2, z); sc.add(lb); a.albumLbl = lb; a.albumKey = '';
  a.interact.push({ type: 'album', x, z: z + 2.2, r: 3.0, label: '📒 Deurman-vriendenboek bekijken' });
}
export function refreshAlbum(a) {   // label met het aantal stickers (alleen opnieuw tekenen als het verandert)
  if (!a.albumLbl) return; const n = stickerCount(); if (a.albumKey === n) return; a.albumKey = n;
  const old = a.albumLbl; const lb = floatLabel('📒 Vriendenboek', `${n}/${STICKERS.length} stickers`, '#ffd0ec'); lb.scale.copy(old.scale); lb.position.copy(old.position);
  a.scene.remove(old); old.material.map && old.material.map.dispose(); old.material.dispose(); a.scene.add(lb); a.albumLbl = lb;
}

// ---------------------------------------------------------------- GEHEIME DEUR naar de Deurenhal
// Vermomd als gewone muurdeur met een '❓ ???'-bord zolang !isUnlocked(4); daarna een gouden deur (met animatie bij het ontgrendelen).
export class SecretDoor {
  constructor(a, d, zb) {
    this.a = a; this.x = d.x; this.zb = zb; this.t = 0; this.grow = 0; this.opened = false; this.anim = false; this.winkT = 0;
    const sc = a.scene; this.info = a.doorInfo[4] = { to: 4, x: d.x, z: zb + 3.8, back: false, secret: true, sec: this, name: 'Deurenhal' };
    // vermomming: gewone houten deur in een stenen kozijn
    this.P = new THREE.Group(); this.P.userData.dynamic = true; this.P.position.set(d.x, 0, zb + 0.5); sc.add(this.P); this.parts = [];
    const add = (m) => { this.P.add(m); this.parts.push(m); return m; }; const stone = mat(0x7d7a86, { roughness: 0.9 }), wood = mat(0x8a6a4a, { roughness: 0.85 });
    for (const sx of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.5, 8, 0.8), stone, { pos: [sx * 1.55, 4, 0] }));
    add(mesh(new THREE.BoxGeometry(3.6, 0.8, 0.8), stone, { pos: [0, 8.2, 0] })); add(mesh(new THREE.BoxGeometry(2.7, 7.7, 0.22), wood, { pos: [0, 3.85, 0.1] }));
    for (const [px, py] of [[-0.6, 2.2], [0.6, 2.2], [-0.6, 5.8], [0.6, 5.8]]) add(mesh(new THREE.BoxGeometry(0.95, 2.3, 0.08), mat(0x7a5a3a), { pos: [px, py, 0.24] }));
    add(mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0xc9a040, { metalness: 0.6 }), { pos: [1.0, 3.8, 0.3] }));
    this.sign = add(new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2), new THREE.MeshBasicMaterial({ map: this.signTex('❓ ???', 'gewoon een deur') }))); this.sign.position.set(0, 4.8, 0.32);
    // de gouden deur: groeit uit de grond zodra hij ontgrendeld is
    this.G = new THREE.Group(); this.G.userData.dynamic = true; this.G.position.set(d.x, 0, zb + 0.5); sc.add(this.G);
    const gold = mat(0xf2c230, { metalness: 0.15, roughness: 0.5, emissive: 0x4a3600 });
    for (const sx of [-1, 1]) this.G.add(mesh(new THREE.BoxGeometry(0.55, 8.4, 0.9), gold, { pos: [sx * 1.6, 4.2, 0] }));
    this.G.add(mesh(new THREE.BoxGeometry(3.8, 0.9, 0.9), gold, { pos: [0, 8.55, 0] })); this.G.add(mesh(new THREE.ConeGeometry(2.1, 1.3, 4), gold, { pos: [0, 9.6, 0], rot: [0, PI / 4, 0], scale: [1, 1, 0.3] }));
    this.G.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), { cast: false, pos: [0, 10.5, 0.1] }));
    this.glowP = mesh(new THREE.PlaneGeometry(2.7, 7.7), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.9, depthWrite: false }), { cast: false, receive: false, pos: [0, 3.9, -0.05] }); this.G.add(this.glowP);
    this.leaf = new THREE.Group(); this.leaf.position.set(-1.35, 0, 0.12); this.G.add(this.leaf);
    this.leaf.add(mesh(new THREE.BoxGeometry(2.7, 7.7, 0.22), mat(0xffb3d1, { roughness: 0.5 }), { pos: [1.35, 3.85, 0] }));
    for (const [px, py] of [[0.7, 2.2], [2.0, 2.2], [0.7, 5.6], [2.0, 5.6]]) this.leaf.add(mesh(new THREE.BoxGeometry(0.95, 2.4, 0.08), mat(0xff8ab8, { roughness: 0.5 }), { pos: [px, py, 0.14] }));
    this.leaf.add(mesh(new THREE.SphereGeometry(0.17, 8, 6), gold, { pos: [2.4, 3.8, 0.22] }));
    this.G.visible = false; this.G.scale.setScalar(0.01);
    this.open = false;
    if (S.flags.deurhal_open || S.settings.unlockAll) this.finish(true);
    this.lb = null; this.setLabel();
    this.info.it = { type: 'door', to: 4, x: d.x, z: zb + 3.8, r: 3.2, label: this.opened ? 'Naar de Deurenhal' : 'Een gewone deur?' }; a.interact.push(this.info.it);
    this.info.gl = this.glowP;
  }
  signTex(t1, t2) {
    return canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#f2e2b0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#7a4a1a'; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#3a1a50'; g.font = 'bold 60px Fredoka, Arial Black, sans-serif'; g.fillText(t1, w / 2, 62, w - 24); g.font = '26px Fredoka, Arial, sans-serif'; g.fillStyle = '#7a5a3a'; g.fillText(t2, w / 2, 118, w - 24); });
  }
  setLabel() {
    const a = this.a; if (this.lb) { a.scene.remove(this.lb); this.lb.material.map && this.lb.material.map.dispose(); this.lb.material.dispose(); }
    const lb = this.opened ? floatLabel('🚪 Deurenhal', 'geheim! (de Deurman woont hier)', '#ffe14a') : floatLabel('❓ ???', 'gewoon een deur', '#bbb'); lb.scale.set(4.4, 1.4, 1); lb.position.set(this.x, 11.4, this.zb + 1); a.scene.add(lb); this.lb = lb;
    if (this.info.it) this.info.it.label = this.opened ? 'Naar de Deurenhal' : 'Een gewone deur?';
  }
  // direct de gouden deur tonen (zonder animatie)
  finish(silent) {
    this.opened = true; this.grow = 1; this.G.visible = true; this.G.scale.setScalar(1); this.leaf.rotation.y = -0.5; this.info.gl = this.glowP;
    for (const m of this.parts) m.parent && m.parent.remove(m); this.parts = [];
    if (!silent) this.setLabel();
  }
  update(dt) {
    this.t += dt; const a = this.a;
    if (this.opened) {
      if (this.grow < 1) { this.grow = Math.min(1, this.grow + dt * 1.6); const k = this.grow, s = 1 + Math.sin(k * PI) * 0.12; this.G.scale.set(k < 1 ? Math.max(0.01, k * s) : 1, k < 1 ? Math.max(0.01, k * s) : 1, 1); }
      this.leaf.rotation.y = -0.5 - 0.5 * (0.5 + 0.5 * Math.sin(this.t * 1.3)); this.glowP.material.opacity = 0.75 + 0.2 * Math.sin(this.t * 3);
      if (Math.random() < dt * 4) a.fx.emit(this.x + rand(-1.6, 1.6), rand(1, 8), this.zb + 1.5, 0, rand(0.4, 1), 0, { life: 1.2, size: 0.3, color: Math.random() < 0.5 ? 0xfff0a0 : 0xff9ac8, gravity: -0.2 });
    }
    if (this.winkT > 0) { this.winkT -= dt; if (this.winkT <= 0) this.setSign('❓ ???', 'gewoon een deur'); }
  }
  setSign(t1, t2) { if (!this.sign.parent) return; const old = this.sign.material.map; this.sign.material.map = this.signTex(t1, t2); this.sign.material.needsUpdate = true; old && old.dispose(); }
  // dichte deur: knipoog-camera + uitleg over de stickers
  async knock() {
    const a = this.a; const need = Math.max(0, DEUR_HALL_STICKERS - stickers().length);
    a.camOverride = { x: this.x, z: -15, t: 3.4 }; await sleep(500); audio.sfx('knock'); this.setSign('😉', 'ssst...'); this.winkT = 2.6;
    a.fx.burst(this.x, 5.2, this.zb + 1.4, { count: 14, colors: [0xffe14a, 0xff9ac8, 0xffffff], speed: 3, size: 0.3, life: 0.9 }); await sleep(450); audio.sfx('squeak');
    await a.say([{ text: `Nog ${need} Deurman-stickers nodig — het vriendenboek!` }, { text: 'Deze deur lijkt gewoon een deur. Maar de deur lijkt te knipogen. Misschien is hij verlegen.' }]);
    a.camOverride = null;
    const c = await a.choose('❓ Een gewone deur?', ['📒 Vriendenboek bekijken', 'Terug'], `Deurman-stickers: ${stickers().length}/${DEUR_HALL_STICKERS} · ze duiken overal op!`);
    if (c === 0) await a.album();
  }
  // ontgrendelen: kijkt de camera mee, het kozijn vliegt weg, de gouden deur groeit eruit
  async unlockAnim() {
    if (this.opened || this.anim) return; this.anim = true; const a = this.a; a.busy = true;
    a.camOverride = { x: this.x, z: -15, t: 99 }; await sleep(900);
    for (let i = 0; i < 6; i++) { audio.sfx(i % 2 ? 'knock' : 'creak'); a.camShake = 0.2; this.P.position.x = this.x + rand(-0.08, 0.08); await sleep(210); }
    this.P.position.x = this.x; audio.sfx('win'); audio.sfx('powerup'); audio.sfx('doorbell'); ui.flash('#fff', 280);
    for (let i = 0; i < 5; i++) setTimeout(() => a.fx.burst(this.x + rand(-2.5, 2.5), 3 + rand(0, 6), this.zb + 2, { count: 36, colors: [0xffd23f, 0xfff0a0, 0xff9ac8, 0x9ae0ff], speed: 8, size: 0.45, life: 1.5, gravity: 3 }), i * 200);
    for (const m of this.parts) a.fallers.push({ m, vx: rand(-4, 4), vy: rand(4, 9), vz: rand(3, 9), wx: rand(-4, 4), wz: rand(-4, 4), t: 3.2 });
    this.parts = []; this.opened = true; this.G.visible = true; this.grow = 0; this.setLabel(); S.flags.deurhal_open = true; persist();
    ui.hud.toast('De geheime Deurenhal is open! 🚪✨', 3600); await sleep(2600); a.camOverride = null; this.anim = false; a.busy = false;
  }
}
