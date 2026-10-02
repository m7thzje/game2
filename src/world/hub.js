import * as THREE from 'three';
import { input, KEY_LABELS } from '../engine/input.js';
import { audio } from '../engine/audio.js';
import { ui, Menu } from '../engine/ui.js';
import { scare } from '../engine/scare.js';
import { S, persist, reset as resetSave } from '../save.js';
import { Particles } from '../engine/particles.js';
import { makeBrother, PLAYER_CSS, PLAYER_COLORS } from '../engine/chars.js';
import { h, clamp, lerp, damp, dampAngle, rand, pick, mesh, mat, TAU, smoothstep } from '../engine/util.js';
import * as P from '../engine/props.js';
import { buildTerrain, buildWater, heightAt, groundY, isWater, onBridge } from './terrain.js';
import { scatterWorld } from './scatter.js';
import { makeWorldCtx, floatLabel, questMark } from './build.js';
import { buildVillage } from './village.js';
import { Sky } from './sky.js';
import { Life } from './life.js';
import { Pickups } from './pickups.js';
import { HubDeurman } from './hubdeur.js';
import { JOBS, JOB_BY_ID, HOME, SPAWN, BOOTH, BOARD, CONCERT_GATE, PATHS, riverX, TICKET_PRICE, VIP_PRICE, DOORKNOBS, ICE, PLAZA, CAVE } from './layout.js';
import * as STORY from './story.js';
import { openSettings, openOnline } from './menu.js';
import { mergeStatic } from './merge.js';

const ICONS = { catch: '🥖', kitchen: '🍲', rhythm: '🎸', hotbomb: '💣', sokoban: '📦', whack: '🔨', mudcart: '🛒', goblins: '🐑', fishing: '🎣', potion: '🧪', plates: '🐉', sweeper: '🏰', breakout: '🧱', sumo: '🤼' };
const NAMES = { catch: 'Broodjes Vangen', kitchen: 'Taverne-keuken', rhythm: 'Straatmuzikant', hotbomb: 'Hete Aardappel', sokoban: 'Kratten Schuiven', whack: 'Mollen Meppen', mudcart: 'Karretje uit de Modder', goblins: 'Goblin-jacht', fishing: 'Samen Vissen', potion: 'Toverdrank', plates: 'Drakengrot', sweeper: 'Zwaaibalk', breakout: 'Muur Slopen', sumo: 'IJs-Sumo' };

let WS = null; // wereld-cache (wordt maar één keer gebouwd)

function buildWorld(app) {
  const quality = S.settings.quality;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 700);
  const sky = new Sky(scene);
  if (quality === 'low') { sky.sun.castShadow = false; }
  scene.add(buildTerrain()); const water = buildWater(); scene.add(water);
  const fx = new Particles(3000); scene.add(fx.points); fx.setViewportHeight(innerHeight);
  const { colliders } = scatterWorld(scene, quality);
  const idx0 = scene.children.length;
  const W = makeWorldCtx(scene, fx); buildVillage(W);
  colliders.push(...W.colliders);
  // lichten beperken (elk PointLight kost performance)
  const keep = new Set([W.campfires[0]?.userData.light, W.torches[0]?.userData.light, W.torches[2]?.userData.light, ...W.lamps.filter((l) => l.light).map((l) => l.light)].filter(Boolean));
  const kill = []; scene.traverse((o) => { if (o.isPointLight && (quality === 'low' || !keep.has(o))) kill.push(o); });
  kill.forEach((l) => l.parent && l.parent.remove(l));
  const mres = mergeStatic(scene, idx0); console.log('merge', mres);
  const life = new Life(W, scene, fx);
  // spelers
  const players = [0, 1].map((i) => {
    const c = makeBrother(i); scene.add(c.group);
    const label = floatLabel(i ? 'Sem' : 'Daan', '', i ? '#7fb2ff' : '#6bf09a'); label.scale.set(2.6, 0.8, 1); label.position.y = c.height + 0.95; c.group.add(label); label.material.depthTest = false;
    const spot = new THREE.SpotLight(0xfff0c0, 0, 32, 0.46, 0.6, 1.1); spot.position.set(0, 1.5, 0.3); const tg = new THREE.Object3D(); tg.position.set(0, 0.6, 12); c.group.add(spot); c.group.add(tg); spot.target = tg;
    const cg = new THREE.CylinderGeometry(5.2, 0.12, 15, 18, 1, true); cg.rotateX(Math.PI / 2); cg.translate(0, 0, 7.5);
    const cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); cone.position.set(0, 1.4, 0.3); cone.visible = false; c.group.add(cone);
    const ring = mesh(new THREE.RingGeometry(0.75, 0.95, 24), new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[i], transparent: true, opacity: 0.6, depthWrite: false }), { cast: false, receive: false, rot: [-Math.PI / 2, 0, 0] }); scene.add(ring);
    return { i, c, x: 0, z: 0, y: 0, vx: 0, vz: 0, vy: 0, yaw: Math.PI, lantern: false, spot, cone, ring, grounded: true, stepT: 0, speed: 0 };
  });
  // botsing-raster
  const grid = new Map(); const CS = 10;
  const keyOf = (ix, iz) => ix * 4096 + iz;
  for (const c of colliders) {
    const r = c.t === 'c' ? c.r : Math.hypot(c.hw, c.hd);
    for (let ix = Math.floor((c.x - r) / CS); ix <= Math.floor((c.x + r) / CS); ix++) for (let iz = Math.floor((c.z - r) / CS); iz <= Math.floor((c.z + r) / CS); iz++) { const k = keyOf(ix, iz); (grid.get(k) || grid.set(k, []).get(k)).push(c); }
  }
  const mini = makeMiniBg();
  return { scene, camera, sky, water, fx, W, life, players, grid, CS, keyOf, mini, colliders, pickups: null };
}

function makeMiniBg() {
  const R = 118, N = 360; const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'); const sc = N / (R * 2);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = (x / sc) - R, wz = (y / sc) - R; const hh = heightAt(wx, wz); let col;
    if (hh < -0.5) col = [64, 132, 205]; else if (hh > 22) col = [235, 240, 248]; else if (hh > 9) col = [138, 136, 144]; else { const k = 0.85 + (hh * 0.05); col = [Math.min(255, 100 * k) | 0, Math.min(255, 175 * k) | 0, Math.min(255, 80 * k) | 0]; }
    if (Math.hypot(wx - ICE.x, wz - ICE.z) < ICE.r) col = [200, 230, 250];
    if (Math.hypot(wx - 0, wz - 0) < PLAZA.r) col = [165, 150, 130];
    const i = (y * N + x) * 4; img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = '#c9a77a'; g.lineWidth = 3; g.lineCap = 'round';
  for (const p of PATHS) { g.beginPath(); p.forEach(([px, pz], i) => (i ? g.lineTo((px + R) * sc, (pz + R) * sc) : g.moveTo((px + R) * sc, (pz + R) * sc))); g.stroke(); }
  return { canvas: c, R, sc, N };
}

export class HubMode {
  static async create(app, opts = {}) {
    const boot = h('div', { class: 'overlay', style: { background: '#0c0814', zIndex: 80 } }, h('div', { class: 'title', style: { fontSize: '42px' } }, 'Het dorp wordt gebouwd...'));
    if (!WS) { ui.screens.append(boot); await new Promise((r) => setTimeout(r, 60)); WS = buildWorld(app); WS.pickups = null; boot.remove(); }
    return new HubMode(app, opts);
  }
  constructor(app, opts) {
    this.app = app; this.opts = opts; Object.assign(this, { scene: WS.scene, camera: WS.camera, sky: WS.sky, W: WS.W, life: WS.life, players: WS.players, fx: WS.fx });
    this.mid = new THREE.Vector3(); this.focus = new THREE.Vector3(); this.busy = false; this.cinematic = false; this.t = 0; this.hudT = 0; this.modal = null; this.chaseLight = false;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3(); this.promptItems = [null, null]; this.floatT = 0; this.hintT = 18;
    if (WS.pickups) { WS.pickups.onCollect = (...a) => this.onCollect(...a); } else { WS.pickups = new Pickups(this.scene, this.fx, (...a) => this.onCollect(...a)); }
    this.pickups = WS.pickups; this.pickups.fx = this.fx;
    this.deur = new HubDeurman(this);
    this.labels = {};
    this.buildLabels();
  }
  musicName() { const ph = this.sky.phase(); return ph === 'nacht' ? 'hub_night' : ph === 'avond' ? 'hub_dusk' : 'hub_day'; }

  // ---------------------------------------------------------------- labels boven NPC's
  buildLabels() {
    for (const j of JOBS) {
      const npc = this.W.jobNpc[j.id]; if (!npc) continue;
      if (npc.userData?.label) npc.group.remove(npc.userData.label);
      npc.userData = npc.userData || {};
      const def = this.app.games[j.id]; const icon = def?.icon || ICONS[j.id]; const name = def?.name || NAMES[j.id];
      const done = S.jobs[j.id];
      const stars = done ? '★'.repeat(done.bestStars) + '☆'.repeat(3 - done.bestStars) : (j.when === 'nacht' ? '🌙 \'s nachts' : 'NIEUW!');
      const lbl = floatLabel(`${icon} ${name}`, stars, done ? '#ffe14a' : '#9affb0'); lbl.position.y = npc.height + 1.2; npc.group.add(lbl); npc.userData.label = lbl;
      if (npc.userData.mark) npc.group.remove(npc.userData.mark);
      if (!done) { const q = questMark(); q.position.y = npc.height + 2.7; npc.group.add(q); npc.userData.mark = q; } else npc.userData.mark = null;
    }
  }

  // ---------------------------------------------------------------- start / stop
  async enter() {
    const o = this.opts;
    this.hudSetup();
    this.sky.setViewportHeight(innerHeight);
    if (S.tod == null) S.tod = 0.1;
    this.sky.setTime(S.tod);
    // spelers neerzetten
    let sx = S.hubPos?.x ?? SPAWN.x, sz = S.hubPos?.z ?? SPAWN.z;
    if (o.from) { const j = JOB_BY_ID[o.from]; if (j) { sx = j.x + Math.sin(j.yaw) * 3; sz = j.z + Math.cos(j.yaw) * 3; } }
    if (o.newGame) { sx = SPAWN.x; sz = SPAWN.z; }
    this.players.forEach((p, i) => { p.x = sx + (i ? 1.2 : -1.2); p.z = sz; p.y = groundY(p.x, p.z); p.vx = p.vz = 0; p.vy = 0; p.yaw = Math.PI; p.c.targetYaw = p.c.yaw = Math.PI; p.lantern = false; p.c.group.visible = true; });
    this.updateMid(); this.camPos.set(this.mid.x, this.mid.y + 16, this.mid.z + 20); this.camLook.copy(this.mid);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    audio.music(this.musicName());
    this.onCoinsChanged();
    ui.fade(0, 700);
    await new Promise((r) => setTimeout(r, 400));
    if (o.newGame || !S.flags.intro) { this.busy = true; this.cinematic = true; await ui.say(STORY.INTRO); S.flags.intro = true; this.busy = false; this.cinematic = false; persist(); this.deur.timer = 18; this.scriptedFirstDoor = true; }
    else if (o.result && o.from) await this.afterJob(o.from, o.result);
    else if (o.result === null) ui.hud.toast('Klus gestopt.', 1500);
  }
  exit() {
    S.hubPos = { x: this.mid.x, z: this.mid.z }; persist();
    this.deur.cleanup(); this.hudEl && (ui.hudEl.innerHTML = ''); ui.setVignette(0); ui.clearScreens();
  }
  resize(w, hh) { this.camera.aspect = w / hh; this.camera.updateProjectionMatrix(); this.fx.setViewportHeight(hh); this.sky.setViewportHeight(hh); }

  // ---------------------------------------------------------------- HUD
  hudSetup() {
    ui.hudEl.innerHTML = ''; ui.hud.promptEl = null; ui.hud._ph = null;
    this.coinEl = h('div', { class: 'hud-coins' }); this.coinBar = null;
    ui.hudEl.append(this.coinEl);
    ui.hudEl.append(this.deur.bar);
    this.questEl = h('div', { class: 'hud-quest' }); ui.hudEl.append(this.questEl);
    this.miniEl = h('div', { class: 'hud-mini' }); this.miniCanvas = h('canvas', { width: 320, height: 320 }); this.miniEl.append(this.miniCanvas); ui.hudEl.append(this.miniEl);
    this.hintEl = h('div', { class: 'hud-hint' }); ui.hudEl.append(this.hintEl);
    this.hudEl = true;
    this.refreshQuest();
  }
  onCoinsChanged() {
    const goal = !S.ticket ? TICKET_PRICE : (!S.vip ? 0 : 0);
    const frac = S.ticket ? 1 : clamp(S.coins / TICKET_PRICE, 0, 1);
    const ph = this.sky.phase(); const ic = ph === 'nacht' ? '🌙' : ph === 'avond' ? '🌆' : ph === 'ochtend' ? '🌅' : '☀️';
    this.coinEl.innerHTML = `<span>${ic}</span><span>🪙 ${S.coins}</span>` + (S.ticket ? `<span class="goal">🎟️ kaartjes gekocht!</span>` : `<div><div class="goal">doel: ${TICKET_PRICE} voor 2 kaartjes</div><div class="bar"><i style="width:${frac * 100}%"></i></div></div>`);
    this.refreshQuest();
  }
  refreshQuest() {
    if (!this.questEl) return;
    const done = JOBS.filter((j) => S.jobs[j.id]).length; const knobs = DOORKNOBS.filter((k) => S.collected[k.id]).length;
    let obj;
    if (!S.ticket) obj = S.coins >= TICKET_PRICE ? `Je hebt genoeg heitjes! Koop kaartjes bij het <b>loket</b> op het plein.` : `Spaar <b>${TICKET_PRICE}</b> heitjes voor 2 kaartjes. Doe karweitjes!`;
    else obj = this.sky.isNight() ? `Het is donker: ga naar de <b>poort van het kasteel</b> voor het concert!` : `Kaartjes gekocht! Wacht tot het donker is en ga naar de <b>kasteelpoort</b> (noorden).`;
    this.questEl.innerHTML = `<h4>Doel</h4>${obj}<br><small>Klussen: ${done}/${JOBS.length} · Gouden deurknoppen: ${knobs}/${DOORKNOBS.length}</small>`;
  }
  onCollect(type, v, x, y, z, p) {
    if (type === 'coin') { S.coins += v; S.totalEarned += v; audio.sfx('coin', { rate: 0.95 + Math.random() * 0.2 }); this.fx.burst(x, y + 0.3, z, { count: 4, color: 0xffe14a, speed: 2, size: 0.2, life: 0.5 }); }
    else if (type === 'chest') { S.coins += v; S.totalEarned += v; audio.sfx('powerup'); ui.hud.toast(`Schatkist! +${v} heitjes`, 2200); }
    else if (type === 'knob') { audio.sfx('star'); audio.sfx('bell'); const n = this.pickups.knobsFound(); ui.hud.toast(`✨ Gouden deurknop gevonden! (${n}/${DOORKNOBS.length})`, 3000); if (n === DOORKNOBS.length) setTimeout(() => ui.say([{ who: 'Sem', text: 'Dat was de laatste! Alle acht! De Deurman gaat dolblij zijn!' }]), 1500); }
    this.onCoinsChanged(); this.coinT = 1;
  }
  drawMini() {
    const g = this.miniCanvas.getContext('2d'); const N = this.miniCanvas.width; const M = WS.mini; const scale = 3.0;
    g.save(); g.clearRect(0, 0, N, N); g.beginPath(); g.arc(N / 2, N / 2, N / 2, 0, TAU); g.clip();
    const k = scale * (N / 120) * 0.5; const z = N / (2 * 60);
    const sx = N / 2 - (this.mid.x + M.R) * M.sc * (z / M.sc) , sz = N / 2 - (this.mid.z + M.R) * M.sc * (z / M.sc);
    g.drawImage(M.canvas, sx, sz, M.N * (z / M.sc), M.N * (z / M.sc));
    const toS = (wx, wz) => [N / 2 + (wx - this.mid.x) * z, N / 2 + (wz - this.mid.z) * z];
    const night = this.sky.isNight();
    for (const j of JOBS) { const [x, y] = toS(j.x, j.z); const d = S.jobs[j.id]; g.fillStyle = d ? '#7bd88f' : (j.when === 'nacht' && !night ? '#6a6a8a' : '#ffd23f'); g.strokeStyle = '#2a1a0a'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, d ? 6 : 9, 0, TAU); g.fill(); g.stroke(); if (!d) { g.fillStyle = '#2a1a0a'; g.font = 'bold 14px sans-serif'; g.textAlign = 'center'; g.fillText('!', x, y + 5); } }
    { const [x, y] = toS(BOOTH.x, BOOTH.z); g.font = '18px sans-serif'; g.textAlign = 'center'; g.fillText('🎟️', x, y + 6); const [gx, gy] = toS(CONCERT_GATE.x, CONCERT_GATE.z); g.fillText(S.ticket ? '🎤' : '🏰', gx, gy + 6); }
    this.players.forEach((p, i) => { const [x, y] = toS(p.x, p.z); g.fillStyle = PLAYER_CSS[i]; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 8, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x + Math.sin(p.yaw) * 14, y + Math.cos(p.yaw) * 14); g.lineTo(x + Math.sin(p.yaw + 2.6) * 8, y + Math.cos(p.yaw + 2.6) * 8); g.lineTo(x + Math.sin(p.yaw - 2.6) * 8, y + Math.cos(p.yaw - 2.6) * 8); g.fill(); });
    if (this.deur.state === 'chase' || this.deur.state === 'door') { const [x, y] = toS(this.deur.m.group.position.x, this.deur.m.group.position.z); g.fillStyle = '#ff2a2a'; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); }
    g.restore();
  }

  // ---------------------------------------------------------------- beweging
  updateMid() {
    const [a, b] = this.players; this.mid.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }
  collide(p, nx, nz) {
    const r = 0.5; const { grid, CS, keyOf } = WS;
    for (let it = 0; it < 2; it++) {
      const ix0 = Math.floor((nx - 2) / CS), ix1 = Math.floor((nx + 2) / CS), iz0 = Math.floor((nz - 2) / CS), iz1 = Math.floor((nz + 2) / CS);
      for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
        const lst = grid.get(keyOf(ix, iz)); if (!lst) continue;
        for (const c of lst) {
          if (c.t === 'c') { const dx = nx - c.x, dz = nz - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { nx = c.x + dx / d * m; nz = c.z + dz / d * m; } }
          else {
            const dx = nx - c.x, dz = nz - c.z; const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c; // wereld -> lokaal (rotatie y)
            const cx = clamp(lx, -c.hw, c.hw), cz = clamp(lz, -c.hd, c.hd); let ox = lx - cx, oz = lz - cz; let d = Math.hypot(ox, oz);
            if (d < r) {
              if (d < 1e-4) { // binnen de doos: duw naar dichtstbijzijnde rand
                const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz); if (px < pz) { ox = Math.sign(lx) || 1; oz = 0; d = 1; } else { ox = 0; oz = Math.sign(lz) || 1; d = 1; }
                const push = (px < pz ? px : pz) + r; var nlx = lx + ox * push, nlz = lz + oz * push;
              } else { nlx = cx + ox / d * r; nlz = cz + oz / d * r; }
              nx = c.x + nlx * c.c + nlz * c.s; nz = c.z - nlx * c.s + nlz * c.c;
            }
          }
        }
      }
    }
    return [nx, nz];
  }
  movePlayer(p, dt, frozen) {
    const ip = input.p[p.i];
    const sp = 8.2; let tx = 0, tz = 0;
    if (!frozen) { const k = p.lantern ? 0.6 : 1; tx = ip.x * sp * k; tz = ip.y * sp * k; }
    p.vx = damp(p.vx, tx, 12, dt); p.vz = damp(p.vz, tz, 12, dt);
    let nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    // water & hellingen
    const gy0 = groundY(p.x, p.z);
    if (isWater(nx, nz)) { if (!isWater(nx, p.z)) nz = p.z; else if (!isWater(p.x, nz)) nx = p.x; else { nx = p.x; nz = p.z; } }
    const gy1 = groundY(nx, nz); const stepd = Math.hypot(nx - p.x, nz - p.z);
    if (stepd > 1e-4 && p.grounded && !onBridge(nx, nz) && !onBridge(p.x, p.z) && (gy1 - gy0) / stepd > 1.05 && gy1 - gy0 > 0.04) { const gx = groundY(nx, p.z), gz = groundY(p.x, nz); if ((gx - gy0) / Math.abs(nx - p.x + 1e-5) < 1.0) nz = p.z; else if ((gz - gy0) / Math.abs(nz - p.z + 1e-5) < 1.0) nx = p.x; else { nx = p.x; nz = p.z; } }
    [nx, nz] = this.collide(p, nx, nz);
    // spelers onderling
    const o = this.players[1 - p.i]; const dx = nx - o.x, dz = nz - o.z, d = Math.hypot(dx, dz); if (d < 1.1 && d > 1e-3) { const push = (1.1 - d) * 0.5; nx += dx / d * push; nz += dz / d * push; }
    // koppel: maximale afstand
    const mdx = nx - o.x, mdz = nz - o.z, md = Math.hypot(mdx, mdz); const MAXSEP = 34; if (md > MAXSEP) { nx = o.x + mdx / md * MAXSEP; nz = o.z + mdz / md * MAXSEP; }
    p.x = nx; p.z = nz;
    // springen
    const gy = groundY(p.x, p.z);
    if (p.grounded) { p.y = gy; } else { p.vy -= 24 * dt; p.y += p.vy * dt; if (p.y <= gy) { p.y = gy; p.vy = 0; p.grounded = true; p.c.air = false; audio.sfx('land', { vol: 0.3 }); this.fx.dust(p.x, p.y, p.z, 4); } }
    if (p.grounded && p.y > gy + 0.1) p.grounded = false;
    const spd = Math.hypot(p.vx, p.vz);
    if (spd > 0.5) { p.yaw = dampAngle(p.yaw, Math.atan2(p.vx, p.vz), 14, dt); p.c.targetYaw = p.yaw; }
    p.c.speed = clamp(spd / sp, 0, 1); p.speed = spd;
    p.c.group.position.set(p.x, p.y, p.z);
    if (p.grounded && spd > 3) { p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.28; this.fx.dust(p.x, p.y, p.z, 1, 0xd8c8a8); audio.sfx('step', { vol: 0.5 }); } }
    p.ring.position.set(p.x, p.y + 0.06, p.z);
  }
  tryJump(p) { if (p.grounded) { p.vy = 8.2; p.grounded = false; p.c.air = true; p.c.jump(); audio.sfx('jump', { vol: 0.5 }); } }

  // ---------------------------------------------------------------- interacties
  findInteract(p) {
    let best = null, bd = 1e9;
    for (const it of this.W.interact) {
      const d = Math.hypot(p.x - it.x, p.z - it.z); if (d < it.r && d < bd) { bd = d; best = it; }
    }
    // dorpelingen
    for (const v of this.life.villagers) { const d = Math.hypot(p.x - v.group.position.x, p.z - v.group.position.z); if (d < 2.8 && d < bd) { bd = d; best = { type: 'villager', v, label: 'Praten' }; } }
    return best;
  }
  async say(lines, o) { await ui.say(lines, o); }
  async choose(title, labels, sub) {
    return new Promise((resolve) => {
      const items = labels.map((l, i) => ({ label: l, onSelect: () => { this.menu = null; el.remove(); resolve(i); } }));
      const menu = new Menu(items); this.menu = menu;
      const card = h('div', { class: 'card', style: { width: 'min(520px,92vw)' } }, h('h2', { style: { fontSize: '28px' } }, title), sub ? h('p', { style: { textAlign: 'center' } }, sub) : null, menu.el);
      const el = ui.overlay(card, 'clear'); el.style.alignItems = 'flex-end'; el.style.paddingBottom = '220px'; el.style.background = 'none'; el.style.backdropFilter = 'none';
    });
  }
  async interact(it, p) {
    if (this.busy) return; this.busy = true; ui.hud.setPrompt(null);
    try {
      audio.sfx('select');
      if (it.type === 'job') await this.talkJob(it, p);
      else if (it.type === 'villager') await this.talkVillager(it.v);
      else if (it.type === 'home') await this.home();
      else if (it.type === 'board') await this.board();
      else if (it.type === 'booth') await this.booth();
      else if (it.type === 'fountain') await this.fountain();
      else if (it.type === 'gate') await this.gate();
    } finally { this.busy = false; input.reset(); }
  }
  async talkJob(it, p) {
    const j = JOB_BY_ID[it.id]; const T = STORY.NPC[it.id]; const def = this.app.games[it.id];
    if (!def) { await this.say([{ who: j.who, text: 'Ik heb nu geen werk. Kom later terug.' }]); return; }
    const first = !S.flags['met_' + it.id]; S.flags['met_' + it.id] = true;
    const lines = first ? T.intro.map((t) => ({ who: j.who, text: t })) : [{ who: j.who, text: pick(T.idle) }];
    it.npc.faceTowards(p.x, p.z);
    if (j.when === 'nacht' && !this.sky.isNight() && this.sky.phase() !== 'avond') { await this.say([...lines, { who: j.who, text: T.notNight }]); return; }
    await this.say(lines);
    const best = S.jobs[it.id];
    const c = await this.choose(`${def.icon || ''} ${def.name}`, ['Ja, doen we!', 'Nu even niet'], best ? `Beste: ${'★'.repeat(best.bestStars)}${'☆'.repeat(3 - best.bestStars)} · ${def.mode === 'puzzle' ? 'Puzzel' : def.mode === 'versus' ? 'Broer tegen broer' : 'Samenwerken'}` : (def.mode === 'puzzle' ? 'Puzzel' : def.mode === 'versus' ? 'Broer tegen broer' : 'Samenwerken'));
    if (c !== 0) return;
    S.hubPos = { x: this.mid.x, z: this.mid.z };
    audio.sfx('powerup'); await ui.fade(1, 450); persist();
    this.busy = false; this.app.playGame(it.id, { back: 'hub' });
    await new Promise(() => {}); // modus wordt vervangen
  }
  async afterJob(id, r) {
    const j = JOB_BY_ID[id]; const T = STORY.NPC[id];
    S.day++; S.tod = (S.tod + 0.06) % 1; this.sky.setTime(S.tod); persist();
    this.buildLabels(); this.onCoinsChanged(); audio.music(this.musicName());
    this.busy = true;
    await new Promise((res) => setTimeout(res, 300));
    const msg = T.res[r.stars] || '';
    await this.say([{ who: j.who, text: msg }, { who: j.who, text: r.total > 0 ? `Hier is je loon: ${r.total} heitjes!` : 'Helaas, geen loon.' }]);
    if (S.coins >= TICKET_PRICE && !S.ticket && !S.flags.enough) { S.flags.enough = true; await this.say([{ who: 'Sem', text: `Daan! We hebben ${S.coins} heitjes! Genoeg voor de kaartjes!` }, { who: 'Daan', text: 'Naar het loket op het plein! Dat staat bij het podium.' }]); }
    this.busy = false;
    if (!S.flags.firstJobDone) { S.flags.firstJobDone = true; }
  }
  async talkVillager(v) {
    const done = JOBS.filter((j) => S.jobs[j.id]).length;
    if (v.group && v.group.position) v.faceTowards(this.mid.x, this.mid.z);
    if (this.life.villagers.indexOf(v) === 2) { // de oude man
      const unlocked = STORY.ELDER_LORE.filter((l) => done >= l.need); const idx = (S.flags.elderIdx || 0) % unlocked.length; S.flags.elderIdx = idx + 1;
      await this.say([{ who: 'Oude Opa Okke', text: unlocked[idx].text }]); return;
    }
    await this.say([{ who: this.nameOfVillager(v), text: pick(STORY.VILLAGER_LINES) }]);
  }
  nameOfVillager(v) { const idx = this.life.villagers.indexOf(v); return ['Kleine Kim', 'Dikke Daantje', 'Opa Okke', 'Wachter Wout', 'Boerin Bea', 'Bakkersvrouw Bep', 'Prinses Priscilla', 'Kleine Koen', 'Visser Vic', 'Nar Nelis', 'Metselaar Mees', 'Herder Henk'][idx] || 'Dorpeling'; }
  async home() {
    const c = await this.choose('Thuis', ['Slapen tot de ochtend', 'Slapen tot de avond', 'Slapen tot middernacht', 'Dagboek lezen', 'Niets doen']);
    if (c === 3) { await this.journal(); return; } if (c === 4) return;
    const target = [0.03, 0.45, 0.72][c];
    await ui.fade(1, 700); audio.sfx('door'); S.tod = target; this.sky.setTime(target); this.onCoinsChanged(); persist();
    await new Promise((r) => setTimeout(r, 500)); audio.music(this.musicName()); await ui.fade(0, 900);
    if (c === 2 && S.settings.scare >= 2 && Math.random() < 0.7) {
      await this.say([{ text: 'Midden in de nacht word je wakker. Je hoort een zacht gekraak...', creepy: true }], { creepy: true });
      await scare.flicker(3);
      await scare.stare({ label: 'NIET BEWEGEN!', hold: 3.2 }); this.updateMid();
    }
  }
  async board() {
    const rows = JOBS.map((j) => { const def = this.app.games[j.id]; const d = S.jobs[j.id]; return h('div', { class: 'mini' + (d ? ' done' : '') }, h('b', {}, `${def?.icon || ICONS[j.id]} ${def?.name || NAMES[j.id]}`), h('span', {}, `${j.who}`), h('br'), h('span', { style: { opacity: 0.75, fontSize: '13px' } }, `📍 ${j.place}${j.when === 'nacht' ? ' · alleen \'s nachts' : ''}`), h('br'), h('span', {}, d ? '★'.repeat(d.bestStars) + '☆'.repeat(3 - d.bestStars) + ` · ${d.plays}x gedaan` : '⭐ nieuw!')); });
    await this.cardModal('Klussenbord', h('div', { class: 'minilist' }, ...rows), 'Alle karweitjes van Heitjesveen. Loop naar de plek op de kaart (rechtsonder).');
  }
  async journal() {
    const done = JOBS.filter((j) => S.jobs[j.id]).length; const stars = JOBS.reduce((a, j) => a + (S.jobs[j.id]?.bestStars || 0), 0); const knobs = DOORKNOBS.filter((k) => S.collected[k.id]).length;
    const mins = Math.floor(S.playTime / 60);
    const lore = STORY.ELDER_LORE.filter((l) => done >= l.need).map((l) => h('p', { style: { fontStyle: 'italic', fontSize: '16px' } }, '“' + l.text + '”'));
    const knobHints = DOORKNOBS.filter((k) => !S.collected[k.id] && done >= 4).slice(0, 3).map((k) => h('li', {}, '✨ ' + k.hint));
    await this.cardModal('Dagboek van Daan & Sem', h('div', {},
      h('p', { html: `🪙 <b>${S.coins}</b> heitjes (totaal verdiend: ${S.totalEarned}) · 🎟️ ${S.ticket ? 'kaartjes gekocht' : 'nog geen kaartjes'}<br>⭐ ${stars}/${JOBS.length * 3} sterren · 🔨 ${done}/${JOBS.length} klussen<br>✨ ${knobs}/${DOORKNOBS.length} gouden deurknoppen<br>👁️ Deurman gezien: ${S.sightings}× · verjaagd: ${S.banished || 0}× · geschrokken: ${S.scared || 0}×<br>⏱️ speeltijd ${mins} min` }),
      lore.length ? h('div', {}, h('h4', {}, 'Wat het dorp over de Deurman vertelt:'), ...lore) : null,
      knobHints.length ? h('div', {}, h('h4', {}, 'Hints voor deurknoppen:'), h('ul', { style: { paddingLeft: '20px' } }, ...knobHints)) : null), '');
  }
  cardModal(title, body, note) {
    return new Promise((resolve) => {
      const card = h('div', { class: 'card' }, h('h2', {}, title), body, h('div', { class: 'small-note' }, (note ? note + ' · ' : '') + `Sluiten: ${KEY_LABELS[0].a} of ${KEY_LABELS[1].a}`));
      const el = ui.overlay(card); this.modal = { el, resolve, t: 0.25 };
    });
  }
  async booth() {
    const B = STORY.BOOTH_LINES;
    const first = !S.flags.met_booth; S.flags.met_booth = true;
    if (first) await this.say(B.intro.map((t) => ({ who: 'Loket-Lotte', text: t })));
    if (S.ticket) {
      if (!S.vip && S.coins >= VIP_PRICE) {
        await this.say([{ who: 'Loket-Lotte', text: B.vip }]);
        const c = await this.choose('VIP-upgrade', [`Ja! (${VIP_PRICE} heitjes)`, 'Nee, dank je']);
        if (c === 0) { S.coins -= VIP_PRICE; S.vip = true; audio.sfx('win'); this.onCoinsChanged(); persist(); ui.hud.toast('VIP-kaartjes! Backstage ontmoeting geregeld!', 3000); }
      } else await this.say([{ who: 'Loket-Lotte', text: B.already }]);
      return;
    }
    if (S.coins < TICKET_PRICE) { await this.say([{ who: 'Loket-Lotte', text: B.noMoney.replace('{need}', TICKET_PRICE - S.coins) }]); return; }
    const c = await this.choose('2 kaartjes DutchTuber LIVE', [`Kopen! (${TICKET_PRICE} heitjes)`, 'Nog niet']);
    if (c !== 0) return;
    S.coins -= TICKET_PRICE; S.ticket = true; persist(); this.onCoinsChanged();
    audio.sfx('win'); ui.flash('#fff', 400);
    for (let i = 0; i < 5; i++) setTimeout(() => this.fx.burst(BOOTH.x + rand(-4, 4), 6 + rand(0, 3), BOOTH.z + rand(-4, 4), { count: 40, colors: [0xff4a4a, 0xffe14a, 0x4ac8ff, 0x7bff7b, 0xff7ad5], speed: 7, size: 0.4, life: 1.4, gravity: 3 }), i * 250);
    await this.say([{ who: 'Loket-Lotte', text: B.buy }, { who: 'Sem', text: 'WE GAAN NAAR DUTCHTUBER!' }, { who: 'Daan', text: 'Het concert begint zodra het donker is. Naar de kasteelpoort! Als de Deurman ons laat...' }]);
  }
  async fountain() {
    if (S.coins < 1) { await this.say([{ text: 'Je hebt geen heitje om te gooien.' }]); return; }
    const c = await this.choose('Fontein', ['Munt gooien (1 heitje)', 'Laat maar']); if (c !== 0) return;
    S.coins--; this.onCoinsChanged(); audio.sfx('splash'); this.fx.burst(0, 1.5, 1, { count: 20, color: 0xa8e0ff, speed: 3, life: 0.8, size: 0.25 });
    await this.say([{ text: pick(STORY.WISHES) }]);
    if (Math.random() < 0.12) { S.coins += 5; this.onCoinsChanged(); audio.sfx('coin'); ui.hud.toast('De fontein spuugt 5 heitjes terug!', 2000); }
  }
  async gate() {
    if (!S.ticket) { await this.say([{ who: 'Wachter', text: 'Alleen met kaartje! Ga naar het loket op het plein.' }]); return; }
    if (!this.sky.isNight() && this.sky.phase() !== 'avond') { await this.say([{ who: 'Wachter', text: 'Het concert begint pas als het donker is. Kom terug in de avond. (Je kunt thuis slapen tot de avond.)' }]); return; }
    const c = await this.choose('Concert', ['Naar binnen!', 'Nog even niet']); if (c !== 0) return;
    S.hubPos = { x: this.mid.x, z: this.mid.z }; persist();
    await ui.fade(1, 700);
    const { EndingMode } = await import('./ending.js');
    this.app.setMode(await EndingMode.create(this.app, {}));
    await new Promise(() => {});
  }

  // ---------------------------------------------------------------- pauze
  async pauseMenu() {
    if (this.busy) return; this.busy = true;
    const c = await this.choose('Pauze', ['Doorgaan', 'Dagboek', 'Instellingen', '🌐 Online spelen', 'Terug naar het titelscherm']);
    if (c === 1) await this.journal();
    else if (c === 2) await new Promise((r) => openSettings(r));
    else if (c === 3) await new Promise((r) => openOnline(this.app, r));
    else if (c === 4) { persist(); await ui.fade(1, 400); this.busy = false; await this.app.goMenu(); ui.fade(0, 500); await new Promise(() => {}); }
    this.busy = false; input.reset();
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    this.t += dt; const t = this.t;
    if (this.modal) {
      this.modal.t -= dt; if (this.modal.t <= 0 && (input.p[0].aP || input.p[1].aP || input.pressed('Escape'))) { this.modal.el.remove(); const r = this.modal.resolve; this.modal = null; r(); input.reset(); }
    }
    if (this.menu) this.menu.update();
    S.tod = ((S.tod ?? 0.1) + dt / 720) % 1; this.sky.setTime(S.tod);
    const frozen = this.busy || this.cinematic || scare.active;
    const [A, B] = this.players;
    for (const p of this.players) {
      if (!frozen) {
        const ip = input.p[p.i];
        p.lantern = ip.b && !this.busy;
        if (ip.aP) { const it = this.findInteract(p); if (it) this.interact(it, p); else this.tryJump(p); }
        if (ip.bP && !p.lantern) {}
      } else p.lantern = false;
      this.movePlayer(p, dt, frozen);
      if (p.lantern && (this.deur.state === 'chase' || this.deur.state === 'door') && this.deur.m.group.visible) { const g = this.deur.m.group.position; const dx = g.x - p.x, dz = g.z - p.z; if (Math.hypot(dx, dz) < 26) { const ta = Math.atan2(dx, dz); let df = ta - p.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); if (Math.abs(df) < 1.7) { p.yaw = dampAngle(p.yaw, ta, 7, dt); p.c.targetYaw = p.yaw; } } }
      p.spot.intensity = damp(p.spot.intensity, p.lantern ? 260 : 0, 20, dt); p.cone.visible = p.lantern; if (p.lantern) p.cone.material.opacity = 0.09 + Math.sin(t * 25) * 0.01;
      p.c.pose = (p.lantern ? 'point' : 'idle'); p.c.update(dt);
    }
    if (!frozen && (input.pressed('Escape') && !this._esc)) { this._esc = true; this.pauseMenu(); }
    if (!input.pressed('Escape')) this._esc = false;
    if (!frozen && input.pressed('Tab') && !this._tab) { this._tab = true; this.busy = true; this.journal().then(() => { this.busy = false; }); }
    if (!input.pressed('Tab')) this._tab = false;
    this.updateMid(); this.focus.copy(this.mid);
    // omgeving
    const st = this.sky.update(dt, t, this.focus, this.camera);
    this.applyDayNight(st, t);
    this.life.update(dt, t, this.players, this.focus);
    this.pickups.update(dt, this.players, this.focus);
    this.fx.update(dt);
    this.updateNpcs(dt, t);
    this.deur.update(dt);
    this.W.updaters.forEach((u) => u(dt, t));
    for (const tc of this.W.torches) P.animateFire(tc, t); for (const cf of this.W.campfires) P.animateFire(cf, t);
    if (this.W.gateBeam) { this.W.gateBeam.visible = S.ticket && !S.flags.ended; this.W.gateBeam.material.opacity = 0.16 + Math.sin(t * 2) * 0.05; }
    WS.water.userData.anim && WS.water.userData.anim(t);
    // schaduwkader volgt
    // prompts
    this.updatePrompt();
    // scripted
    if (this.scriptedFirstDoor && this.deur.state === 'idle' && !this.busy) { this.scriptedFirstDoor = false; this.firstDoor(); }
    // HUD
    this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.12; this.drawMini(); }
    this.hintT -= dt; this.hintEl.innerHTML = this.hintT > 0 && !this.busy ? `<span>Lopen: <kbd>WASD</kbd>/<kbd>Pijltjes</kbd> · <kbd>F</kbd>/<kbd>Enter</kbd> praten of springen · <kbd>G</kbd>/<kbd>Shift</kbd> lantaarn · <kbd>Esc</kbd> menu · <kbd>Tab</kbd> dagboek</span>` : '';
    if (!this._lastPh || this._lastPh !== this.sky.phase()) { this._lastPh = this.sky.phase(); if (this.deur.state === 'idle') audio.music(this.musicName()); this.onCoinsChanged(); }
    this.updateCamera(dt);
  }
  async firstDoor() {
    if (S.settings.scare === 0) return;
    const d = this.W.doors.find((x) => x.owner === 'Thuis'); if (!d) return;
    this.cinematic = true; this.deur.show(d, { seconds: 7, chase: false });
    this.updateMid();
    await new Promise((r) => setTimeout(r, 2800));
    this.busy = true; await ui.say(STORY.FIRST_DOOR); this.busy = false; this.cinematic = false;
    ui.hud.toast('Tip: houd G / Shift vast voor je lantaarn tegen de Deurman.', 4500);
  }
  applyDayNight(st, t) {
    const n = st.night;
    for (const m of this.W.glowMats) { if (m.emissiveIntensity !== undefined) m.emissiveIntensity = lerp(0.15, 1.7, n); }
    for (const l of this.W.lamps) { if (l.light) l.light.intensity = (l.base || 1.4) * (0.7 + n * 0.8); }
  }
  updateNpcs(dt, t) {
    const near = (n) => { let bd = 1e9, bp = null; for (const p of this.players) { const d = Math.hypot(p.x - n.group.position.x, p.z - n.group.position.z); if (d < bd) { bd = d; bp = p; } } return [bd, bp]; };
    for (const n of this.W.npcs) {
      const [d, p] = near(n);
      n.group.visible = d < 95; if (!n.group.visible) continue;
      if (d < n.lookR) { n.faceTowards(p.x, p.z); n.pose = d < 6 ? 'wave' : 'idle'; } else { n.targetYaw = n.home.yaw; n.pose = 'idle'; }
      if (d < 60) n.update(dt);
      const lbl = n.userData?.label; if (lbl) lbl.visible = d < 30; if (n.userData?.mark) { n.userData.mark.visible = d < 55; n.userData.mark.position.y = n.height + 2.7 + Math.sin(t * 3) * 0.18; }
    }
    // jongleur-ballen van Nar Nico
    const nico = this.W.jobNpc.hotbomb; if (nico && nico.group.visible) { if (!nico.userData.balls) { nico.userData.balls = [0xff4a4a, 0x4ac8ff, 0xffe14a].map((c) => { const b = mesh(new THREE.SphereGeometry(0.18, 8, 6), mat(c, { flatShading: false }), { cast: false }); nico.group.add(b); return b; }); } nico.userData.balls.forEach((b, i) => { const a = t * 4 + i * TAU / 3; b.position.set(Math.cos(a) * 0.7, nico.height + 0.9 + Math.abs(Math.sin(a * 1.0)) * 0.7, Math.sin(a) * 0.25); }); }
    // vloeiend lopen: kwispelende dieren hoeven niets
  }
  updatePrompt() {
    if (this.busy || this.cinematic) { ui.hud.setPrompt(null); return; }
    if (this.deur.state === 'chase') return;
    const lines = [];
    for (const p of this.players) {
      const it = this.findInteract(p); this.promptItems[p.i] = it;
      if (it) { let lab = it.label; if (it.type === 'job') { const j = JOB_BY_ID[it.id]; lab = `${j.who} aanspreken`; } lines.push(`<span style="color:${PLAYER_CSS[p.i]}">${S.names[p.i]}</span> <b>${KEY_LABELS[p.i].a}</b> ${lab}`); }
    }
    ui.hud.setPrompt(lines.length ? lines.join('<br>') : null);
  }
  updateCamera(dt) {
    const [a, b] = this.players; const sep = Math.hypot(a.x - b.x, a.z - b.z);
    const k = clamp((sep - 6) / 28, 0, 1);
    const hgt = lerp(17, 33, k), back = lerp(14.5, 32, k);
    let tx = this.mid.x, ty = Math.max(this.mid.y, groundY(this.mid.x, this.mid.z)) + hgt, tz = this.mid.z + back;
    if (this.deur.state === 'chase') { tz += 2; }
    this.camPos.x = damp(this.camPos.x, tx, 4.5, dt); this.camPos.y = damp(this.camPos.y, ty, 3.5, dt); this.camPos.z = damp(this.camPos.z, tz, 4.5, dt);
    this.camLook.x = damp(this.camLook.x, this.mid.x, 6, dt); this.camLook.y = damp(this.camLook.y, this.mid.y + 1.5, 4, dt); this.camLook.z = damp(this.camLook.z, this.mid.z - 1, 6, dt);
    this.camera.position.copy(this.camPos); this.camera.lookAt(this.camLook);
    // schaduwen
    this.sky.sun.shadow.camera.left = this.sky.sun.shadow.camera.bottom = -34 - k * 20; this.sky.sun.shadow.camera.right = this.sky.sun.shadow.camera.top = 34 + k * 20; this.sky.sun.shadow.camera.updateProjectionMatrix();
  }
  render(renderer) { renderer.render(this.scene, this.camera); }
}
